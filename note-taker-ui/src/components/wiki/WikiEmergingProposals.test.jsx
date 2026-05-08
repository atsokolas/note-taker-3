import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiEmergingProposals from './WikiEmergingProposals';
import {
  acceptWikiProposal,
  dismissWikiProposal,
  listWikiPages,
  listWikiProposals,
  mergeWikiProposal,
  watchWikiProposal
} from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  acceptWikiProposal: jest.fn(),
  dismissWikiProposal: jest.fn(),
  listWikiPages: jest.fn(),
  listWikiProposals: jest.fn(),
  mergeWikiProposal: jest.fn(),
  watchWikiProposal: jest.fn()
}));

const proposals = [
  {
    _id: 'proposal-1',
    proposalType: 'repeated_theme',
    title: 'AI Tutors and Motivation',
    summary: 'Recurring theme found across 5 archive sources.',
    whyNow: 'Noeis found repeated signals for this idea across saved material.',
    confidence: 0.81,
    sourceRefs: [{ _id: 's1' }, { _id: 's2' }],
    connectedPageRefs: [],
    connectedConceptRefs: [],
    starterClaims: ['AI tutors may improve motivation through adaptive feedback.']
  },
  {
    _id: 'proposal-2',
    proposalType: 'bridge_idea',
    title: 'Adaptive Learning Interfaces',
    summary: 'Connects existing knowledge objects.',
    whyNow: 'Noeis found this bridge across existing pages and concepts.',
    confidence: 0.74,
    sourceRefs: [{ _id: 's3' }],
    connectedPageRefs: [{ _id: 'p1', title: 'Personal Agents' }],
    connectedConceptRefs: [{ _id: 'c1', title: 'Education Software' }],
    starterClaims: []
  }
];

describe('WikiEmergingProposals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listWikiProposals.mockResolvedValue({ proposals, generated: true });
    listWikiPages.mockResolvedValue([{ _id: 'wiki-target', title: 'AI Tutors' }]);
    acceptWikiProposal.mockResolvedValue({ page: { _id: 'wiki-created' } });
    watchWikiProposal.mockResolvedValue({ ...proposals[0], status: 'watched' });
    dismissWikiProposal.mockResolvedValue({ ...proposals[0], status: 'dismissed' });
    mergeWikiProposal.mockResolvedValue({ ...proposals[0], status: 'merged' });
  });

  it('renders recurring theme and bridge idea proposals', async () => {
    render(<MemoryRouter><WikiEmergingProposals /></MemoryRouter>);
    expect(await screen.findByText('AI Tutors and Motivation')).toBeInTheDocument();
    expect(screen.getByText('Recurring theme')).toBeInTheDocument();
    expect(screen.getByText('Adaptive Learning Interfaces')).toBeInTheDocument();
    expect(screen.getByText('Bridge idea')).toBeInTheDocument();
  });

  it('watches a proposal', async () => {
    render(<MemoryRouter><WikiEmergingProposals /></MemoryRouter>);
    await screen.findByText('AI Tutors and Motivation');
    fireEvent.click(screen.getAllByRole('button', { name: 'Watch' })[0]);
    await waitFor(() => expect(watchWikiProposal).toHaveBeenCalledWith('proposal-1'));
  });

  it('dismisses a proposal', async () => {
    render(<MemoryRouter><WikiEmergingProposals /></MemoryRouter>);
    await screen.findByText('AI Tutors and Motivation');
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);
    await waitFor(() => expect(dismissWikiProposal).toHaveBeenCalledWith('proposal-1', ''));
  });

  it('merges a proposal into an existing page', async () => {
    render(<MemoryRouter><WikiEmergingProposals /></MemoryRouter>);
    await screen.findByText('AI Tutors and Motivation');
    fireEvent.change(screen.getByLabelText('Merge target for AI Tutors and Motivation'), {
      target: { value: 'wiki-target' }
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Merge' })[0]);
    await waitFor(() => expect(mergeWikiProposal).toHaveBeenCalledWith('proposal-1', 'wiki-target'));
  });

  it('creates a wiki and navigates to it', async () => {
    render(<MemoryRouter><WikiEmergingProposals /></MemoryRouter>);
    await screen.findByText('AI Tutors and Motivation');
    fireEvent.click(screen.getAllByRole('button', { name: 'Create' })[0]);
    await waitFor(() => expect(acceptWikiProposal).toHaveBeenCalledWith('proposal-1'));
  });
});
