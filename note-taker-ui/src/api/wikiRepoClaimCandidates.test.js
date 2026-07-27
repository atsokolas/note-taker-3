import api from '../api';
import {
  disposeWikiRepoClaimCandidate,
  getWikiRepoClaimCandidates
} from './wikiRepoClaimCandidates';
import { disposeWikiClaimRevision } from './wikiClaimDisposition';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer token' } })
}));

jest.mock('./wikiClaimDisposition', () => ({
  disposeWikiClaimRevision: jest.fn()
}));

const PAGE_ID = '64b000000000000000000001';
const EVENT_ID = '64b000000000000000000002';
const RUN_ID = '64b000000000000000000003';
const REVISION_IDS = ['64b000000000000000000004', '64b000000000000000000005'];

const queue = () => ({
  version: 1,
  page: {
    id: PAGE_ID,
    title: 'atsokolas/note-taker-3',
    repository: { owner: 'atsokolas', repo: 'note-taker-3', fullName: 'atsokolas/note-taker-3' }
  },
  cohort: {
    id: 'cohort-1',
    sourceEventId: EVENT_ID,
    maintenanceRunId: RUN_ID,
    baseHeadSha: 'base-sha',
    candidateHeadSha: 'candidate-sha',
    snapshotKey: 'snapshot-key',
    expectedClaimIds: ['claim-1', 'claim-2'],
    expectedCount: 2,
    integrity: { ok: true, code: '' },
    publishability: { ok: true, code: '', reasons: [], newerHeadQueued: false },
    progress: { total: 2, pending: 2, deferred: 0, accepted: 0, preserved: 0, rejected: 0 }
  },
  candidates: REVISION_IDS.map((revisionId, index) => ({
    revisionId,
    claimId: `claim-${index + 1}`,
    state: 'pending',
    allowedDispositions: ['accept', 'preserve', 'reject', 'defer'],
    receipt: null
  })),
  humanActionRequired: true
});

describe('wikiRepoClaimCandidates api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: queue() });
  });

  it('loads and validates exactly one complete repo claim cohort', async () => {
    await expect(getWikiRepoClaimCandidates(PAGE_ID.toUpperCase())).resolves.toEqual(queue());
    expect(api.get).toHaveBeenCalledWith(
      `/api/wiki/pages/${PAGE_ID}/repo-claim-candidates`,
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('accepts a coherent nonpublishable cohort with bounded dispositions', async () => {
    const data = queue();
    data.cohort.publishability = {
      ok: false,
      code: 'newer_head_observed',
      reasons: ['newer_head_observed'],
      newerHeadQueued: true
    };
    data.candidates.forEach(candidate => { candidate.allowedDispositions = ['reject', 'defer']; });
    api.get.mockResolvedValue({ data });
    await expect(getWikiRepoClaimCandidates(PAGE_ID)).resolves.toEqual(data);
  });

  it('accepts a receipt-backed deferred candidate that remains reviewable', async () => {
    const data = queue();
    data.candidates[0] = {
      ...data.candidates[0],
      state: 'deferred',
      receipt: {
        id: `wiki-claim-disposition:v1:${REVISION_IDS[0]}:defer`,
        kind: 'wiki_claim_disposition',
        completedAt: '2026-08-07T12:00:00.000Z'
      }
    };
    data.cohort.progress = { total: 2, pending: 1, deferred: 1, accepted: 0, preserved: 0, rejected: 0 };
    api.get.mockResolvedValue({ data });
    await expect(getWikiRepoClaimCandidates(PAGE_ID)).resolves.toEqual(data);
  });

  it('rejects a display-name page id before transport', async () => {
    await expect(getWikiRepoClaimCandidates('page 1')).rejects.toThrow();
    expect(api.get).not.toHaveBeenCalled();
  });

  it.each([
    ['empty response', null],
    ['wrong version', (() => { const value = queue(); value.version = 2; return value; })()],
    ['wrong page', (() => { const value = queue(); value.page.id = '64b000000000000000000099'; return value; })()],
    ['bad integrity', (() => { const value = queue(); value.cohort.integrity.ok = false; return value; })()],
    ['missing human action', (() => { const value = queue(); value.humanActionRequired = false; return value; })()],
    ['duplicate claims', (() => { const value = queue(); value.candidates[1].claimId = 'claim-1'; return value; })()],
    ['claim order mismatch', (() => { const value = queue(); value.candidates.reverse(); return value; })()],
    ['progress mismatch', (() => { const value = queue(); value.cohort.progress.pending = 1; return value; })()],
    ['unsafe disposition', (() => { const value = queue(); value.candidates[0].allowedDispositions = ['approve']; return value; })()],
    ['malformed revision id', (() => { const value = queue(); value.candidates[0].revisionId = 'revision-1'; return value; })()],
    ['partial candidates', (() => { const value = queue(); value.candidates.pop(); return value; })()]
  ])('fails closed on %s', async (_label, data) => {
    api.get.mockResolvedValue({ data });
    await expect(getWikiRepoClaimCandidates(PAGE_ID)).rejects.toThrow();
  });

  it('delegates dispositions unchanged to the shared receipt-bound helper', async () => {
    const result = { state: 'accepted', cohort: { finalized: false, blocked: 'pending', receipt: null } };
    const payload = { action: 'Accept', note: ' Keep ' };
    disposeWikiClaimRevision.mockResolvedValue(result);
    await expect(disposeWikiRepoClaimCandidate(REVISION_IDS[0], payload)).resolves.toEqual(result);
    expect(disposeWikiClaimRevision).toHaveBeenCalledWith(REVISION_IDS[0], payload);
  });
});
