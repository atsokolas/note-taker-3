import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DecisionCreateForm from './DecisionCreateForm';
import { listWikiRevisions } from '../../../api/wiki';
import { createWikiDecision } from '../../../api/decisions';

jest.mock('../../../api/wiki', () => ({
  listWikiRevisions: jest.fn()
}));

jest.mock('../../../api/decisions', () => ({
  createWikiDecision: jest.fn()
}));

const page = {
  _id: '64f500000000000000000010',
  claims: [{ claimId: 'claim-1', text: 'Claim one' }],
  sourceRefs: [{ _id: '64f500000000000000000020', title: 'Source one', type: 'article' }]
};

const acceptedRevision = {
  _id: '64f500000000000000000070',
  promotionStatus: 'promoted',
  after: { claims: [{ claimId: 'claim-1', text: 'Claim one' }] },
  claimReview: {
    state: 'accepted',
    targetClaimId: 'claim-1',
    events: [{ action: 'accept', receiptId: 'receipt-accept' }]
  },
  summary: 'Accepted claim revision'
};

describe('DecisionCreateForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks when no accepted/preserved revision identity is structurally available', async () => {
    listWikiRevisions.mockResolvedValue([
      {
        _id: '64f500000000000000000099',
        promotionStatus: 'promoted',
        updatedAt: '2026-07-31T00:00:00.000Z',
        after: {}
      }
    ]);

    render(<DecisionCreateForm page={page} pageId={page._id} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Blocked: no accepted or preserved claim revision identity/i);
    expect(createWikiDecision).not.toHaveBeenCalled();
  });

  it('posts a focused decision create with acceptedRevisionId, clocks, claims, and sources', async () => {
    listWikiRevisions.mockResolvedValue([acceptedRevision]);
    createWikiDecision.mockResolvedValue({
      decisionId: 'decision_abc',
      idempotent: false,
      receipt: { id: 'wiki-decision-accepted:1' }
    });

    render(<DecisionCreateForm page={page} pageId={page._id} />);

    await screen.findByLabelText(/Accepted or preserved revision/i);
    fireEvent.change(screen.getByLabelText(/Decision summary/i), { target: { value: 'Hold' } });
    fireEvent.change(screen.getByLabelText(/Decision rationale/i), { target: { value: 'Still supported' } });
    fireEvent.change(screen.getByLabelText(/Expected outcome/i), { target: { value: 'No reversal' } });
    fireEvent.click(screen.getByLabelText(/Claim one/i));
    fireEvent.click(screen.getByLabelText(/Source one/i));
    fireEvent.change(screen.getByLabelText(/Future review date/i), { target: { value: '2099-01-15' } });
    fireEvent.change(screen.getByLabelText(/Outcome due at/i), { target: { value: '2099-02-01T15:30' } });
    fireEvent.click(screen.getByRole('button', { name: /Record decision/i }));

    await waitFor(() => expect(createWikiDecision).toHaveBeenCalled());
    const [, payload] = createWikiDecision.mock.calls[0];
    expect(payload.acceptedRevisionId).toBe('64f500000000000000000070');
    expect(payload.decision).toEqual(expect.objectContaining({
      summary: 'Hold',
      rationale: 'Still supported',
      expectedOutcome: 'No reversal',
      status: 'planned',
      relatedClaimIds: ['claim-1'],
      sourceRefIds: ['64f500000000000000000020'],
      reviewAt: '2099-01-15T12:00:00.000Z',
      outcomeDueAt: new Date('2099-02-01T15:30').toISOString()
    }));
    expect(await screen.findByText(/Decision accepted/i)).toBeInTheDocument();
    expect(screen.getByText(/wiki-decision-accepted:1/i)).toBeInTheDocument();
  });

  it('rejects an outcome clock that has already passed', async () => {
    listWikiRevisions.mockResolvedValue([acceptedRevision]);

    render(<DecisionCreateForm page={page} pageId={page._id} />);

    await screen.findByLabelText(/Accepted or preserved revision/i);
    fireEvent.change(screen.getByLabelText(/Decision summary/i), { target: { value: 'Hold' } });
    fireEvent.change(screen.getByLabelText(/Decision rationale/i), { target: { value: 'Still supported' } });
    fireEvent.change(screen.getByLabelText(/Expected outcome/i), { target: { value: 'No reversal' } });
    fireEvent.click(screen.getByLabelText(/Claim one/i));
    fireEvent.click(screen.getByLabelText(/Source one/i));
    fireEvent.change(screen.getByLabelText(/Future review date/i), { target: { value: '2099-01-15' } });
    fireEvent.change(screen.getByLabelText(/Outcome due at/i), { target: { value: '2000-01-01T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Record decision/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/future date and time/i);
    expect(createWikiDecision).not.toHaveBeenCalled();
  });

  it('prefills acceptedRevisionId from claimReview.identity.revisionId after disposition', async () => {
    listWikiRevisions.mockResolvedValue([acceptedRevision]);
    render(
      <DecisionCreateForm
        page={page}
        pageId={page._id}
        claimReview={{
          state: 'accepted',
          identity: { revisionId: '64f500000000000000000070' }
        }}
      />
    );
    const select = await screen.findByRole('combobox', { name: /Accepted or preserved revision/i });
    await waitFor(() => expect(select).toHaveValue('64f500000000000000000070'));
  });
});
