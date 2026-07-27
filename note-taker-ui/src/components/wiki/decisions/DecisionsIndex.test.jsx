import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DecisionsIndex from './DecisionsIndex';
import { getDecisions } from '../../../api/decisions';

jest.mock('../../../api/decisions', () => ({
  getDecisions: jest.fn()
}));

const item = {
  id: 'decision:page:d1',
  identity: { pageId: 'page-1', decisionId: 'd1' },
  subject: {
    title: 'Hold the position',
    href: '/wiki/workspace?page=page-1&decisionId=d1'
  },
  page: { title: 'Inference economics', href: '/wiki/workspace?page=page-1' },
  decision: {
    summary: 'Hold the position',
    rationale: 'Evidence still supports the thesis.',
    expectedOutcome: 'No material claim reversal.',
    status: 'taken',
    reviewAt: '2026-08-01T12:00:00.000Z'
  },
  dueState: 'overdue',
  continuity: {
    acceptedRevisionId: '64f500000000000000000070',
    complete: false,
    missing: ['accepted_revision_integrity']
  },
  links: {
    claims: {
      resolved: [{
        id: 'claim-1',
        title: 'Claim one',
        href: '/wiki/workspace?page=page-1&claimId=claim-1'
      }],
      missingIds: ['missing-claim']
    },
    sources: {
      resolved: [{
        id: 'article-1',
        title: 'Source one',
        href: '/library?articleId=article-1'
      }],
      missingIds: []
    }
  },
  outcome: { state: 'awaiting_observation', result: 'unknown' }
};

describe('DecisionsIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDecisions.mockResolvedValue({
      items: [item],
      counts: { upcoming_review: 1, awaiting_outcome: 0, reviewed: 0 },
      nextCursor: null
    });
  });

  it('renders filter tabs, incomplete continuity, and exact wiki/claim/source links', async () => {
    render(
      <MemoryRouter>
        <DecisionsIndex />
      </MemoryRouter>
    );

    await waitFor(() => expect(getDecisions).toHaveBeenCalled());
    expect(getDecisions).toHaveBeenCalledWith(expect.objectContaining({
      filter: 'upcoming_review'
    }));

    expect(await screen.findByText('Hold the position')).toBeInTheDocument();
    expect(screen.getByText(/Incomplete continuity/i)).toBeInTheDocument();
    expect(screen.getByText(/accepted_revision_integrity/i)).toBeInTheDocument();
    expect(screen.getByText(/Noeis has not inferred an outcome/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inference economics' }))
      .toHaveAttribute('href', '/wiki/workspace?page=page-1');
    expect(screen.getByRole('link', { name: 'Claim one' }))
      .toHaveAttribute('href', '/wiki/workspace?page=page-1&claimId=claim-1');
    expect(screen.getByRole('link', { name: 'Source one' }))
      .toHaveAttribute('href', '/library?articleId=article-1');
    expect(screen.getByText(/Exact links unavailable/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Awaiting outcome/i }));
    await waitFor(() => expect(getDecisions).toHaveBeenLastCalledWith(expect.objectContaining({
      filter: 'awaiting_outcome'
    })));
  });

  it('shows an honest empty and retryable failed state', async () => {
    getDecisions.mockResolvedValueOnce({ items: [], counts: {}, nextCursor: null });
    render(
      <MemoryRouter>
        <DecisionsIndex />
      </MemoryRouter>
    );
    expect(await screen.findByText(/No decisions match this filter/i)).toBeInTheDocument();

    getDecisions.mockRejectedValueOnce({
      response: { data: { error: 'Only the human owner can open the Decisions index.' } }
    });
    fireEvent.click(screen.getByRole('tab', { name: /Reviewed/i }));
    expect(await screen.findByText(/Only the human owner/i)).toBeInTheDocument();
    getDecisions.mockResolvedValueOnce({ items: [], counts: {}, nextCursor: null });
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
    await waitFor(() => expect(getDecisions).toHaveBeenCalled());
  });

  it('uses only the opaque server cursor and appends the next page', async () => {
    getDecisions
      .mockResolvedValueOnce({
        items: [item],
        counts: { upcoming_review: 2, awaiting_outcome: 0, reviewed: 0 },
        nextCursor: 'opaque-page-2'
      })
      .mockResolvedValueOnce({
        items: [{
          ...item,
          id: 'decision:page:d2',
          identity: { pageId: 'page-1', decisionId: 'd2' },
          decision: { ...item.decision, summary: 'Second decision' }
        }],
        counts: { upcoming_review: 2, awaiting_outcome: 0, reviewed: 0 },
        nextCursor: null
      });

    render(<MemoryRouter><DecisionsIndex limit={1} /></MemoryRouter>);

    expect(await screen.findByText('Hold the position')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(getDecisions).toHaveBeenLastCalledWith({
      filter: 'upcoming_review',
      limit: 1,
      windowDays: 30,
      pageId: undefined,
      cursor: 'opaque-page-2'
    }));
    expect(await screen.findByText('Second decision')).toBeInTheDocument();
    expect(screen.getByText('Hold the position')).toBeInTheDocument();
  });

  it('never upgrades a reviewed decision with incomplete outcome proof to observed', async () => {
    getDecisions.mockResolvedValueOnce({
      items: [{
        ...item,
        decision: { ...item.decision, status: 'reviewed' },
        outcome: { state: 'review_incomplete', result: 'positive', lesson: 'Unverified lesson.' }
      }],
      counts: { upcoming_review: 0, awaiting_outcome: 0, reviewed: 1 },
      nextCursor: null
    });

    render(<MemoryRouter><DecisionsIndex initialFilter="reviewed" /></MemoryRouter>);

    expect(await screen.findByText(/Outcome review is incomplete/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Observed$/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Unverified lesson.')).not.toBeInTheDocument();
  });
});
