import api from '../api';
import { disposeWikiClaimRevision } from './wikiClaimDisposition';

jest.mock('../api', () => ({
  __esModule: true,
  default: { post: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer token' } })
}));

const REVISION_ID = '64b000000000000000000011';
const PAGE_ID = '64b000000000000000000022';

const response = (action = 'accept', overrides = {}) => ({
  idempotent: false,
  state: { accept: 'accepted', reject: 'rejected', defer: 'deferred', preserve: 'preserved' }[action],
  revisionId: REVISION_ID,
  pageId: PAGE_ID,
  receipt: {
    id: `wiki-claim-disposition:v1:${REVISION_ID}:${action}`,
    kind: 'wiki_claim_disposition',
    source: 'wiki',
    status: 'completed',
    completedAt: '2026-08-07T12:00:00.000Z',
    provenance: {
      version: 1,
      action,
      revisionId: REVISION_ID,
      pageId: PAGE_ID,
      claimId: 'claim-1',
      deferredUntil: action === 'defer' ? '2099-08-15T12:00:00.000Z' : null
    }
  },
  cohort: null,
  ...overrides
});

describe('disposeWikiClaimRevision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.post.mockResolvedValue({ data: response() });
  });

  it('posts an exact allowlisted action and validates its receipt binding', async () => {
    await expect(disposeWikiClaimRevision(REVISION_ID.toUpperCase(), {
      action: 'Accept',
      note: '  Keep it  ',
      forged: 'ignored'
    })).resolves.toEqual(response());

    expect(api.post).toHaveBeenCalledWith(
      `/api/wiki/revisions/${REVISION_ID}/disposition`,
      { action: 'accept', note: 'Keep it' },
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('requires a future normalized clock for defer and binds it to the receipt', async () => {
    api.post.mockResolvedValue({ data: response('defer') });
    await disposeWikiClaimRevision(REVISION_ID, {
      action: 'defer',
      deferredUntil: '2099-08-15T07:00:00-05:00'
    });
    expect(api.post.mock.calls[0][1]).toEqual({
      action: 'defer',
      deferredUntil: '2099-08-15T12:00:00.000Z'
    });
  });

  it.each([
    ['display revision id', 'revision 1', { action: 'accept' }],
    ['unsupported action', REVISION_ID, { action: 'approve' }],
    ['overlong note', REVISION_ID, { action: 'accept', note: 'x'.repeat(2001) }],
    ['missing defer clock', REVISION_ID, { action: 'defer' }],
    ['past defer clock', REVISION_ID, { action: 'defer', deferredUntil: '2020-01-01T00:00:00.000Z' }],
    ['clock on accept', REVISION_ID, { action: 'accept', deferredUntil: '2099-01-01T00:00:00.000Z' }]
  ])('rejects %s before transport', async (_label, revisionId, payload) => {
    await expect(disposeWikiClaimRevision(revisionId, payload)).rejects.toThrow();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([
    ['empty data', null],
    ['coerced idempotence', response('accept', { idempotent: 'false' })],
    ['wrong state', response('accept', { state: 'preserved' })],
    ['wrong revision', response('accept', { revisionId: '64b000000000000000000099' })],
    ['wrong page receipt', response('accept', { receipt: { ...response().receipt, provenance: { ...response().receipt.provenance, pageId: '64b000000000000000000099' } } })],
    ['missing receipt', response('accept', { receipt: null })],
    ['malformed cohort', response('accept', { cohort: { finalized: true, blocked: '', receipt: null } })]
  ])('fails closed on %s', async (_label, data) => {
    api.post.mockResolvedValue({ data });
    await expect(disposeWikiClaimRevision(REVISION_ID, { action: 'accept' })).rejects.toThrow();
  });
});
