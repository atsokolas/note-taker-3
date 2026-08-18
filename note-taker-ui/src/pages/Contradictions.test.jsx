import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import Contradictions from './Contradictions';
import { createWikiPage, listWikiContradictions, updateWikiPage } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  createWikiPage: jest.fn(),
  listWikiContradictions: jest.fn(),
  updateWikiPage: jest.fn()
}));
jest.mock('../agent/AgentRailContext', () => ({ useAgentRailSurface: () => {} }));

const item = {
  pageId: 'p1',
  pageTitle: 'Strategy',
  claimId: 'cl1',
  claimText: 'Positioning beats operations.',
  section: 'Tensions',
  labelled: true,
  supporting: [{ sourceId: 's1', title: 'What Is Strategy?', quote: 'The essence of strategy is choosing what not to do.', url: 'https://example.com/s' }],
  contradicting: [{ sourceId: 's2', title: 'Operational effectiveness trap', quote: 'Operational improvement is not the same as strategy.', url: '' }]
};

/* A contradiction used to be a colour on a citation inside one article. Here
   the two passages are set against each other with their publications
   attached, because that is the only form in which a disagreement is worth
   anything: you read both and decide. */
describe('where the library disagrees with itself', () => {
  const navigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    listWikiContradictions.mockResolvedValue([item]);
  });

  it('shows both passages, each with the publication that said it', async () => {
    render(<MemoryRouter><Contradictions /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Positioning beats operations.' })).toBeInTheDocument();

    const supports = screen.getByRole('region', { name: 'What supports it' });
    expect(within(supports).getByText(/essence of strategy/)).toBeInTheDocument();
    expect(within(supports).getByRole('link', { name: 'What Is Strategy?' }))
      .toHaveAttribute('href', 'https://example.com/s');

    const against = screen.getByRole('region', { name: 'What argues against it' });
    expect(within(against).getByText(/Operational improvement is not the same/)).toBeInTheDocument();
    expect(within(against).getByText('Operational effectiveness trap')).toBeInTheDocument();
  });

  it('says where the claim lives, so the passage can be read in place', async () => {
    render(<MemoryRouter><Contradictions /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Strategy' })).toHaveAttribute('href', expect.stringContaining('p1'));
  });

  /* Deciding is the exit: both sides are already written, so the judgment
     starts with them in it rather than with a blank page. */
  it('carries the disagreement into a judgment with both sides already in it', async () => {
    createWikiPage.mockResolvedValue({ _id: 'j1' });
    updateWikiPage.mockResolvedValue({});

    render(<MemoryRouter><Contradictions /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Decide this/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/judgment/j1'));
    const seeded = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1][1];
    expect(seeded.judgment.currentJudgment).toBe('Positioning beats operations.');
    expect(seeded.judgment.why).toEqual([
      { text: 'The essence of strategy is choosing what not to do.', sourceLabel: 'What Is Strategy?' }
    ]);
    expect(seeded.judgment.against).toEqual([
      { text: 'Operational improvement is not the same as strategy.', sourceLabel: 'Operational effectiveness trap' }
    ]);
  });

  it('says plainly when nothing disagrees, rather than showing an empty page', async () => {
    listWikiContradictions.mockResolvedValue([]);
    render(<MemoryRouter><Contradictions /></MemoryRouter>);
    expect(await screen.findByText(/Nothing in your library argues with itself yet/)).toBeInTheDocument();
  });
});
