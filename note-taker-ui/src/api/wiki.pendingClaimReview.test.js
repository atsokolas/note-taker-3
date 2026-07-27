import api from '../api';
import { getPendingWikiClaimReview } from './wikiPendingClaimReview';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), defaults: {} }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer test' } })
}));

const PAGE_ID = '64f200000000000000000001';
const CONCEPT_ID = '64f200000000000000000002';
const REVISION_ID = '64f200000000000000000003';
const CLAIM_ID = 'claim-1';
const GENERATED_AT = '2026-08-07T12:00:00.000Z';

const reviewEnvelope = (state = 'pending') => {
  const identity = {
    conceptId: CONCEPT_ID,
    wikiPageId: PAGE_ID,
    revisionId: REVISION_ID,
    claimId: CLAIM_ID
  };
  return {
    state,
    identity,
    generatedAt: GENERATED_AT,
    claimReview: {
      version: 1,
      identity: { ...identity },
      state,
      canAct: true,
      unavailableReason: '',
      current: { claimId: CLAIM_ID, text: 'The accepted claim.' },
      proposed: { claimId: CLAIM_ID, text: 'The proposed claim.' },
      diff: {
        segments: [{ kind: 'removed', text: 'accepted' }, { kind: 'added', text: 'proposed' }],
        changedFields: ['text'],
        boundedExplanation: 'Changed text; 1 evidence reference added and 0 removed.'
      },
      evidenceDelta: { added: [{}], removed: [], supporting: [{}], contradicting: [] },
      affected: {
        pages: [{ type: 'wiki_page', id: PAGE_ID }],
        concepts: [{ type: 'concept', id: CONCEPT_ID }]
      },
      unresolved: [],
      allowedDispositions: ['accept', 'reject', 'defer', 'preserve'],
      candidateHash: 'a'.repeat(64),
      currentClaimHash: 'b'.repeat(64),
      deferredUntil: state === 'deferred' ? '2099-01-02T12:00:00.000Z' : null,
      receipt: state === 'deferred' ? {
        id: `wiki-claim-disposition:v1:${REVISION_ID}:defer`,
        kind: 'wiki_claim_disposition',
        status: 'completed',
        completedAt: GENERATED_AT
      } : null
    }
  };
};

describe('getPendingWikiClaimReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: reviewEnvelope() });
  });

  it('loads one exact identity-bound pending dossier claim review', async () => {
    const data = reviewEnvelope();
    api.get.mockResolvedValue({ data });
    await expect(getPendingWikiClaimReview(PAGE_ID.toUpperCase())).resolves.toBe(data);
    expect(api.get).toHaveBeenCalledWith(
      `/api/wiki/pages/${PAGE_ID}/pending-claim-review`,
      { headers: { Authorization: 'Bearer test' } }
    );
  });

  it('accepts the explicit settled quiet state and a receipt-backed deferred review', async () => {
    const settled = { claimReview: null, state: 'settled', generatedAt: GENERATED_AT };
    api.get.mockResolvedValueOnce({ data: settled });
    await expect(getPendingWikiClaimReview(PAGE_ID)).resolves.toBe(settled);

    const deferred = reviewEnvelope('deferred');
    api.get.mockResolvedValueOnce({ data: deferred });
    await expect(getPendingWikiClaimReview(PAGE_ID)).resolves.toBe(deferred);
  });

  it('rejects a display-name page id before transport', async () => {
    await expect(getPendingWikiClaimReview('page 1')).rejects.toThrow(/valid object id/i);
    expect(api.get).not.toHaveBeenCalled();
  });

  it.each([
    ['empty response', null],
    ['invalid clock', { claimReview: null, state: 'settled', generatedAt: 'invalid' }],
    ['settled with a review', { ...reviewEnvelope(), state: 'settled' }],
    ['cross-page identity', (() => { const value = reviewEnvelope(); value.identity.wikiPageId = '64f200000000000000000099'; return value; })()],
    ['identity disagreement', (() => { const value = reviewEnvelope(); value.claimReview.identity.revisionId = '64f200000000000000000099'; return value; })()],
    ['wrong claim identity', (() => { const value = reviewEnvelope(); value.claimReview.proposed.claimId = 'claim-2'; return value; })()],
    ['nonactionable pending review', (() => { const value = reviewEnvelope(); value.claimReview.canAct = false; return value; })()],
    ['invalid dispositions', (() => { const value = reviewEnvelope(); value.claimReview.allowedDispositions = ['accept']; return value; })()],
    ['incomplete evidence delta', (() => { const value = reviewEnvelope(); delete value.claimReview.evidenceDelta.contradicting; return value; })()],
    ['cross-concept affected refs', (() => { const value = reviewEnvelope(); value.claimReview.affected.concepts[0].id = '64f200000000000000000099'; return value; })()],
    ['invalid candidate hash', (() => { const value = reviewEnvelope(); value.claimReview.candidateHash = 'hash'; return value; })()],
    ['pending with a receipt', (() => { const value = reviewEnvelope(); value.claimReview.receipt = { id: 'forged' }; return value; })()],
    ['deferred without receipt', (() => { const value = reviewEnvelope('deferred'); value.claimReview.receipt = null; return value; })()]
  ])('fails closed on %s', async (_label, data) => {
    api.get.mockResolvedValue({ data });
    await expect(getPendingWikiClaimReview(PAGE_ID)).rejects.toThrow();
  });
});
