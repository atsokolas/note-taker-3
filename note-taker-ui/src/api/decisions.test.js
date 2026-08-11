import api from '../api';
import {
  createWikiDecision,
  getDecisions,
  recordWikiDecisionOutcome,
  transitionWikiDecision
} from './decisions';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer test' } })
}));

const PAGE_ID = '64f500000000000000000010';
const REVISION_ID = '64f500000000000000000020';
const DECISION_ID = 'decision_1234567890abcdef';
const HASH = 'a'.repeat(64);
const GENERATED_AT = '2026-08-07T12:00:00.000Z';

const receiptFor = ({ kind, action, decisionId = DECISION_ID, extra = {} }) => ({
  id: `receipt-${action}`,
  kind,
  source: 'wiki',
  status: 'completed',
  completedAt: GENERATED_AT,
  provenance: {
    version: 1,
    action,
    pageId: PAGE_ID,
    decisionId,
    ...extra
  }
});

const mutationEnvelope = ({
  status,
  kind,
  action,
  decisionId = DECISION_ID,
  acceptedRevisionId = REVISION_ID,
  extraProvenance = {}
}) => ({
  idempotent: false,
  pageId: PAGE_ID,
  decisionId,
  status,
  acceptedRevisionId,
  immutableSnapshotHash: HASH,
  outcome: null,
  receipt: receiptFor({ kind, action, decisionId, extra: extraProvenance })
});

const validDecision = () => ({
  summary: 'Ship the bounded change',
  rationale: 'The accepted evidence supports it.',
  expectedOutcome: 'The workflow becomes more reliable.',
  decisionType: 'product',
  status: 'planned',
  reviewAt: '2027-01-01T12:00:00.000Z',
  relatedClaimIds: ['claim-1'],
  sourceRefIds: ['source-1']
});

describe('decisions api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads and preserves a complete identity-bound Decisions envelope', async () => {
    const payload = {
      version: 1,
      items: [{
        version: 1,
        id: `decision:${PAGE_ID}:${DECISION_ID}`,
        identity: { pageId: PAGE_ID, decisionId: DECISION_ID }
      }],
      nextCursor: 'cursor-1',
      filters: {
        filter: 'awaiting_outcome',
        windowDays: 45,
        pageId: PAGE_ID,
        asOf: GENERATED_AT
      },
      counts: { awaiting_outcome: 1 },
      coverage: { scannedPages: 1, truncated: false },
      generatedAt: GENERATED_AT
    };
    api.get.mockResolvedValue({ data: payload });

    await expect(getDecisions({
      filter: 'awaiting_outcome',
      limit: 10,
      windowDays: 45,
      pageId: PAGE_ID,
      cursor: ' cursor value '
    })).resolves.toBe(payload);
    expect(api.get).toHaveBeenCalledWith(
      `/api/decisions?filter=awaiting_outcome&limit=10&windowDays=45&pageId=${PAGE_ID}&cursor=cursor+value`,
      { headers: { Authorization: 'Bearer test' } }
    );
  });

  it('rejects invalid Decisions queries before transport', async () => {
    await expect(getDecisions({ filter: 'popular' })).rejects.toThrow(/filter is unsupported/i);
    await expect(getDecisions({ limit: 0 })).rejects.toThrow(/1 to 100/i);
    await expect(getDecisions({ limit: 1.5 })).rejects.toThrow(/1 to 100/i);
    await expect(getDecisions({ windowDays: 366 })).rejects.toThrow(/1 to 365/i);
    await expect(getDecisions({ pageId: 'page-name' })).rejects.toThrow(/valid object id/i);
    await expect(getDecisions({ cursor: ' ' })).rejects.toThrow(/must contain/i);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('rejects malformed or cross-context Decisions envelopes', async () => {
    const invalid = [
      null,
      { version: 1, items: [] },
      {
        version: 1,
        items: [{ version: 1, id: 'decision:x', identity: { pageId: 'page-name', decisionId: 'd' } }],
        nextCursor: null,
        filters: { filter: 'upcoming_review', windowDays: 30, pageId: null, asOf: GENERATED_AT },
        counts: {}, coverage: {}, generatedAt: GENERATED_AT
      },
      {
        version: 1,
        items: [],
        nextCursor: null,
        filters: { filter: 'reviewed', windowDays: 30, pageId: null, asOf: GENERATED_AT },
        counts: {}, coverage: {}, generatedAt: GENERATED_AT
      }
    ];
    api.get.mockImplementation(() => Promise.resolve({ data: invalid.shift() }));
    for (let index = 0; index < 4; index += 1) {
      await expect(getDecisions()).rejects.toThrow(/response is malformed/i);
    }
  });

  it('rejects a filtered index containing a decision from another page', async () => {
    api.get.mockResolvedValue({
      data: {
        version: 1,
        items: [{
          version: 1,
          id: 'decision:cross-page',
          identity: { pageId: '64f500000000000000000099', decisionId: DECISION_ID }
        }],
        nextCursor: null,
        filters: {
          filter: 'upcoming_review',
          windowDays: 30,
          pageId: PAGE_ID,
          asOf: GENERATED_AT
        },
        counts: { upcoming_review: 1 },
        coverage: { scannedPages: 1, truncated: false },
        generatedAt: GENERATED_AT
      }
    });

    await expect(getDecisions({ pageId: PAGE_ID })).rejects.toThrow(/response is malformed/i);
  });

  it('creates a decision with an allowlisted payload and bound receipt', async () => {
    const requestId = 'request-1';
    api.post.mockResolvedValue({
      data: mutationEnvelope({
        status: 'planned',
        kind: 'wiki_decision_accepted',
        action: 'accept_decision',
        extraProvenance: { acceptedRevisionId: REVISION_ID, requestId }
      })
    });

    await expect(createWikiDecision(PAGE_ID, {
      acceptedRevisionId: REVISION_ID,
      requestId,
      decision: validDecision()
    })).resolves.toMatchObject({ pageId: PAGE_ID, status: 'planned' });
    expect(api.post).toHaveBeenCalledWith(
      `/api/wiki/pages/${PAGE_ID}/decisions`,
      { acceptedRevisionId: REVISION_ID, requestId, decision: validDecision() },
      { headers: { Authorization: 'Bearer test' } }
    );
  });

  it('rejects invalid create identities and server-owned or incomplete fields before transport', async () => {
    await expect(createWikiDecision('page-name', {
      acceptedRevisionId: REVISION_ID,
      requestId: 'request-1',
      decision: validDecision()
    })).rejects.toThrow(/valid object id/i);
    await expect(createWikiDecision(PAGE_ID, {
      acceptedRevisionId: 'revision-name',
      requestId: 'request-1',
      decision: validDecision()
    })).rejects.toThrow(/valid object id/i);
    await expect(createWikiDecision(PAGE_ID, {
      acceptedRevisionId: REVISION_ID,
      requestId: '',
      decision: validDecision()
    })).rejects.toThrow(/request id/i);
    await expect(createWikiDecision(PAGE_ID, {
      acceptedRevisionId: REVISION_ID,
      requestId: 'request-1',
      decision: { ...validDecision(), decisionId: 'forged' }
    })).rejects.toThrow(/unsupported fields/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('transitions only a valid decision through take or cancel', async () => {
    api.post.mockResolvedValue({
      data: mutationEnvelope({ status: 'taken', kind: 'wiki_decision_taken', action: 'take' })
    });
    await expect(transitionWikiDecision(PAGE_ID, DECISION_ID, { action: 'take' }))
      .resolves.toMatchObject({ status: 'taken' });
    expect(api.post.mock.calls[0][0]).toBe(
      `/api/wiki/pages/${PAGE_ID}/decisions/${DECISION_ID}/transition`
    );

    await expect(transitionWikiDecision('page-name', DECISION_ID, { action: 'take' }))
      .rejects.toThrow(/valid object id/i);
    await expect(transitionWikiDecision(PAGE_ID, '', { action: 'take' }))
      .rejects.toThrow(/Decision id/i);
    await expect(transitionWikiDecision(PAGE_ID, DECISION_ID, { action: 'approve' }))
      .rejects.toThrow(/take or cancel/i);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('records only an allowlisted, evidence-bound outcome', async () => {
    const outcome = {
      expectedDecisionHash: HASH,
      observedAt: '2026-08-07T10:00:00.000Z',
      summary: 'The expected effect occurred.',
      result: 'positive',
      processScore: 0.8,
      calibrationNote: 'The evidence was directionally right.',
      lesson: 'Preserve the bounded rollout.',
      evidenceSourceRefIds: ['source-2']
    };
    api.post.mockResolvedValue({
      data: mutationEnvelope({
        status: 'reviewed',
        kind: 'wiki_decision_outcome_recorded',
        action: 'record_outcome'
      })
    });

    await expect(recordWikiDecisionOutcome(PAGE_ID, DECISION_ID, { outcome }))
      .resolves.toMatchObject({ status: 'reviewed' });
    expect(api.post.mock.calls[0][1]).toEqual({ outcome });
  });

  it('rejects invalid outcome fields before transport', async () => {
    const base = {
      expectedDecisionHash: HASH,
      observedAt: '2026-08-07T10:00:00.000Z',
      summary: 'Observed',
      result: 'positive',
      processScore: 0.5,
      calibrationNote: 'Calibrated',
      lesson: 'Lesson',
      evidenceSourceRefIds: ['source-2']
    };
    await expect(recordWikiDecisionOutcome(PAGE_ID, DECISION_ID, {
      outcome: { ...base, expectedDecisionHash: 'hash' }
    })).rejects.toThrow(/SHA-256/i);
    await expect(recordWikiDecisionOutcome(PAGE_ID, DECISION_ID, {
      outcome: { ...base, result: 'unknown' }
    })).rejects.toThrow(/positive, negative, or mixed/i);
    await expect(recordWikiDecisionOutcome(PAGE_ID, DECISION_ID, {
      outcome: { ...base, processScore: 2 }
    })).rejects.toThrow(/between 0 and 1/i);
    await expect(recordWikiDecisionOutcome(PAGE_ID, DECISION_ID, {
      outcome: { ...base, forged: true }
    })).rejects.toThrow(/unsupported fields/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('rejects mutation responses with mismatched identity, status, hash, or receipt', async () => {
    const valid = mutationEnvelope({
      status: 'taken',
      kind: 'wiki_decision_taken',
      action: 'take'
    });
    const invalid = [
      { ...valid, pageId: '64f500000000000000000099' },
      { ...valid, decisionId: 'other-decision' },
      { ...valid, status: 'planned' },
      { ...valid, immutableSnapshotHash: 'hash' },
      { ...valid, receipt: { ...valid.receipt, provenance: { ...valid.receipt.provenance, pageId: 'wrong' } } },
      { ...valid, receipt: { ...valid.receipt, completedAt: '' } },
      { ...valid, receipt: { ...valid.receipt, provenance: { ...valid.receipt.provenance, version: 2 } } }
    ];
    api.post.mockImplementation(() => Promise.resolve({ data: invalid.shift() }));
    for (let index = 0; index < 7; index += 1) {
      await expect(transitionWikiDecision(PAGE_ID, DECISION_ID, { action: 'take' }))
        .rejects.toThrow(/malformed|mismatched/i);
    }
  });
});
