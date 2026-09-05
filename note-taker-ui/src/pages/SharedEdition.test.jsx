import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SharedEdition from './SharedEdition';
import { getPublicEdition } from '../api/editions';

jest.mock('../api/editions', () => ({ getPublicEdition: jest.fn() }));
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ slug: 'abc123' })
}));

const paper = (over = {}) => ({
  title: 'This Week in AI',
  issueLabel: 'Issue',
  number: 14,
  windowStart: '2026-09-01',
  windowEnd: '2026-09-07',
  ownerDisplayName: 'Athan',
  standfirst: 'A quiet week with one loud paper.',
  sections: [
    { key: 'models_methods', label: 'Models & methods' },
    { key: 'evaluation_counterevidence', label: 'Evaluation & counterevidence' }
  ],
  items: [{
    itemId: 'item-1',
    title: 'A paper about scaling',
    url: 'https://example.com/paper',
    section: 'models_methods',
    finding: 'Loss keeps falling.',
    boundary: 'One lab, no replication yet.'
  }],
  watchNext: ['The replication attempt'],
  ...over
});

describe('a paper someone published', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads as the paper, under the name it was published by', async () => {
    getPublicEdition.mockResolvedValue(paper());
    render(<SharedEdition />);
    expect(await screen.findByText('This Week in AI')).toBeInTheDocument();
    expect(screen.getByText('Kept by Athan')).toBeInTheDocument();
    expect(screen.getByText('Sep 1 – 7 · Issue 14')).toBeInTheDocument();
  });

  /* The reason a stranger should open this rather than any other weekly. */
  it('shows what would limit every item', async () => {
    getPublicEdition.mockResolvedValue(paper());
    render(<SharedEdition />);
    expect(await screen.findByText('What would limit it')).toBeInTheDocument();
    expect(screen.getByText('One lab, no replication yet.')).toBeInTheDocument();
  });

  /* The same rule the owner's copy follows: a week with nothing under
     counterevidence is saying something. */
  it('prints a section nobody filled', async () => {
    getPublicEdition.mockResolvedValue(paper());
    render(<SharedEdition />);
    expect(await screen.findByText('Evaluation & counterevidence')).toBeInTheDocument();
    expect(screen.getByText('Nothing this week.')).toBeInTheDocument();
  });

  /* A revoked link deletes its row, so this is the same answer as a link that
     never existed — which is the point of deleting it. */
  it('says nothing exists rather than that it was withdrawn', async () => {
    getPublicEdition.mockRejectedValue(new Error('gone'));
    render(<SharedEdition />);
    expect(await screen.findByText('This paper is not published.')).toBeInTheDocument();
  });

  it('says nothing while it is still opening', () => {
    getPublicEdition.mockReturnValue(new Promise(() => {}));
    render(<SharedEdition />);
    expect(screen.getByRole('status')).toHaveTextContent('Opening…');
  });

  it('carries the standard in its own words, for someone who has never heard of Noeis', async () => {
    getPublicEdition.mockResolvedValue(paper());
    render(<SharedEdition />);
    await waitFor(() => expect(screen.getByText(/not a list of links/)).toBeInTheDocument());
  });
});
