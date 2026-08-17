import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiArticle from './WikiArticle';
import { getWikiPage } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  askWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
  updateWikiPage: jest.fn()
}));
jest.mock('../../agent/AgentRailContext', () => ({
  useAgentRailSurface: () => {}
}));

/* A citation is the product's whole claim made checkable. It rendered as a
   button labelled "Backlink to source 1" with no handler bound to it — the
   evidence was asserted and unreachable. */
const page = () => ({
  _id: 'p1',
  title: 'Circle of Competence',
  summary: 'Knowing the edge of what you understand.',
  sourceRefs: [{
    _id: 's1',
    title: 'Everyone Has a Process',
    url: 'https://example.com/process',
    snippet: 'Process still loses half the bets.'
  }],
  claims: [{ claimId: 'c1', text: 'Process loses half the bets.', support: 'supported' }],
  citations: [],
  body: {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Process still loses half the bets.',
        marks: [{ type: 'claim', attrs: { claimId: 'c1', support: 'supported', citationIndexes: [1], contradictionIndexes: [] } }]
      }]
    }]
  }
});

describe('a citation in the reader', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ id: 'p1' });
    jest.spyOn(router, 'useSearchParams').mockReturnValue([new URLSearchParams(), jest.fn()]);
    getWikiPage.mockResolvedValue(page());
  });

  it('opens the passage it points at, and the way to the source', async () => {
    render(<WikiArticle />);

    const marker = await screen.findByRole('button', { name: /Backlink to source 1/ });
    expect(document.querySelector('.wiki-claim-popover')).toBeNull();

    fireEvent.click(marker);

    await waitFor(() => expect(document.querySelector('.wiki-claim-popover')).not.toBeNull());
    expect(screen.getByText('Everyone Has a Process')).toBeInTheDocument();
    expect(screen.getByText('Process still loses half the bets.', { selector: '.wiki-claim-popover__item-snippet' }))
      .toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open source/ }))
      .toHaveAttribute('href', 'https://example.com/process');
  });
});
