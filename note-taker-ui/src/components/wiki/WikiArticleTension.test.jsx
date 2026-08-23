import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiArticle from './WikiArticle';
import { createWikiPage, getWikiPage, updateWikiPage } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  askWikiPage: jest.fn(),
  createWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
  updateWikiPage: jest.fn()
}));
jest.mock('../../agent/AgentRailContext', () => ({ useContextualAgentSurface: () => {} }));

const claimMark = (citationIndexes, contradictionIndexes) => ({
  type: 'claim',
  attrs: { claimId: 'c1', support: 'conflicted', citationIndexes, contradictionIndexes }
});

const page = (contradictionIndexes) => ({
  _id: 'p1',
  title: 'Circle of Competence',
  sourceRefs: [
    { _id: 's1', title: 'Everyone Has a Process', snippet: 'Process still loses half the bets.' },
    { _id: 's2', title: 'The Folly of Certainty', snippet: 'Conviction must coexist with uncertainty.' }
  ],
  claims: [{ claimId: 'c1', text: 'A written process improves judgment.', support: 'conflicted' }],
  body: {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'A written process improves judgment.',
        marks: [claimMark([1, 2], contradictionIndexes)]
      }]
    }]
  }
});

const openCitation = async () => {
  const marker = await screen.findByRole('button', { name: /Backlink to source/ });
  fireEvent.click(marker);
};

describe('a tension in the article', () => {
  const navigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ id: 'p1' });
    jest.spyOn(router, 'useSearchParams').mockReturnValue([new URLSearchParams(), jest.fn()]);
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
  });

  it('offers a way out of the disagreement, and carries both sides into a judgment', async () => {
    getWikiPage.mockResolvedValue(page([2]));
    createWikiPage.mockResolvedValue({ _id: 'j1' });
    updateWikiPage.mockResolvedValue({});

    render(<WikiArticle />);
    await openCitation();

    fireEvent.click(await screen.findByRole('button', { name: /Take this into a judgment/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/judgment/j1'));
    expect(createWikiPage).toHaveBeenCalledWith({
      title: 'A written process improves judgment.',
      pageType: 'topic'
    });
    const [, updates] = updateWikiPage.mock.calls[0];
    expect(updates.judgment.currentJudgment).toBe('A written process improves judgment.');
    expect(updates.judgment.why).toEqual([
      { text: 'Process still loses half the bets.', sourceLabel: 'Everyone Has a Process' }
    ]);
    expect(updates.judgment.against).toEqual([
      { text: 'Conviction must coexist with uncertainty.', sourceLabel: 'The Folly of Certainty' }
    ]);
  });

  it('is not offered where the sources agree — a citation is not a tension', async () => {
    getWikiPage.mockResolvedValue(page([]));
    render(<WikiArticle />);
    await openCitation();

    await waitFor(() => expect(document.querySelector('.wiki-claim-popover')).not.toBeNull());
    expect(screen.queryByRole('button', { name: /Take this into a judgment/ })).toBeNull();
  });
});
