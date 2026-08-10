import {
  acceptedRevisionIdFromClaimReview,
  isStructurallyAcceptedRevision,
  selectableAcceptedRevisions
} from './acceptedRevisionIdentity';

const acceptedRevision = {
  _id: '64f500000000000000000070',
  promotionStatus: 'promoted',
  after: { claims: [{ claimId: 'c1', text: 'Accepted claim text' }] },
  claimReview: {
    state: 'accepted',
    targetClaimId: 'c1',
    events: [{ action: 'accept', receiptId: 'receipt-accept' }]
  },
  summary: 'Accepted claim revision'
};

describe('acceptedRevisionIdentity', () => {
  it('reads acceptedRevisionId only from claimReview.identity.revisionId when accepted/preserved', () => {
    expect(acceptedRevisionIdFromClaimReview({
      state: 'accepted',
      identity: { revisionId: '64f500000000000000000070' }
    })).toBe('64f500000000000000000070');

    expect(acceptedRevisionIdFromClaimReview({
      state: 'preserved',
      identity: { revisionId: '64f500000000000000000071' }
    })).toBe('64f500000000000000000071');

    expect(acceptedRevisionIdFromClaimReview({
      state: 'pending',
      identity: { revisionId: '64f500000000000000000070' }
    })).toBe('');

    expect(acceptedRevisionIdFromClaimReview({
      state: 'accepted',
      identity: { revisionId: 'not-an-object-id' }
    })).toBe('');
  });

  it('never treats latest/updatedAt/initialRevisionId as accepted identity', () => {
    expect(isStructurallyAcceptedRevision({
      _id: '64f500000000000000000099',
      updatedAt: '2026-07-31T00:00:00.000Z',
      promotionStatus: 'promoted',
      after: { judgment: { initialRevisionId: '64f500000000000000000070' } }
    })).toBe(false);

    expect(selectableAcceptedRevisions([
      {
        _id: '64f500000000000000000080',
        promotionStatus: 'promoted',
        createdAt: '2026-07-31T12:00:00.000Z',
        after: { claims: [] }
      },
      acceptedRevision
    ]).map(row => row.revisionId)).toEqual(['64f500000000000000000070']);
  });

  it('requires preserved disposition to keep before snapshot and preserve receipt event', () => {
    expect(isStructurallyAcceptedRevision({
      _id: '64f500000000000000000072',
      promotionStatus: 'preserved',
      before: { claims: [] },
      claimReview: {
        state: 'preserved',
        events: [{ action: 'preserve', receiptId: 'receipt-preserve' }]
      }
    })).toBe(true);

    expect(isStructurallyAcceptedRevision({
      _id: '64f500000000000000000073',
      promotionStatus: 'preserved',
      before: { claims: [] },
      claimReview: { state: 'preserved', events: [{ action: 'preserve' }] }
    })).toBe(false);
  });
});
