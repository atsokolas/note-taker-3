import api from '../api';
import { adoptDecisionLessonEvidence } from './concepts';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer test' } })
}));

const CONCEPT_ID = '64f100000000000000000020';
const PAGE_ID = '64f100000000000000000030';
const input = () => ({
  sourcePageId: PAGE_ID,
  decisionId: 'decision-1',
  lessonId: 'decision_lesson_abc',
  role: 'Tension',
  requestId: 'req-1',
  expectedDecisionHash: 'decision-hash',
  expectedOutcomeHash: 'outcome-hash'
});
const envelope = (overrides = {}) => ({
  idempotent: false,
  adoption: {
    id: 'concept_decision_lesson_1',
    kind: 'decision_lesson',
    status: 'accepted',
    acceptedIntoConcept: true,
    role: 'tension',
    targetConceptId: CONCEPT_ID,
    sourcePageId: PAGE_ID,
    decisionId: 'decision-1',
    lessonId: 'decision_lesson_abc',
    provenance: {
      adoptionReceiptId: 'concept-decision-lesson:v1:receipt',
      decisionSnapshotHash: 'decision-hash',
      outcomeRecordHash: 'outcome-hash'
    }
  },
  receipt: {
    id: 'concept-decision-lesson:v1:receipt',
    kind: 'concept_decision_lesson_adopted',
    source: 'concept',
    status: 'completed',
    completedAt: '2026-08-07T12:00:00.000Z',
    provenance: {
      version: 1,
      action: 'adopt_decision_lesson',
      actorType: 'user',
      requestId: 'req-1',
      adoptionId: 'concept_decision_lesson_1',
      targetConceptId: CONCEPT_ID,
      sourcePageId: PAGE_ID,
      decisionId: 'decision-1',
      lessonId: 'decision_lesson_abc',
      role: 'tension',
      decisionSnapshotHash: 'decision-hash',
      outcomeRecordHash: 'outcome-hash'
    }
  },
  ...overrides
});

describe('adoptDecisionLessonEvidence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.post.mockResolvedValue({ data: envelope() });
  });

  it.each([false, true])('posts only identity and expected hashes and validates replay=%s', async (idempotent) => {
    const data = envelope({ idempotent });
    api.post.mockResolvedValue({ data });
    const request = {
      ...input(),
      lesson: 'must not be submitted',
      observedEvidence: [{ id: 'forge' }],
      provenance: { forged: true },
      acceptedAt: '2026-07-31T00:00:00.000Z',
      payloadHash: 'forged'
    };

    await expect(adoptDecisionLessonEvidence(CONCEPT_ID.toUpperCase(), request)).resolves.toBe(data);
    expect(api.post).toHaveBeenCalledWith(
      `/api/concepts/${CONCEPT_ID}/evidence/decision-lessons`,
      {
        sourcePageId: PAGE_ID,
        decisionId: 'decision-1',
        lessonId: 'decision_lesson_abc',
        role: 'tension',
        requestId: 'req-1',
        expectedDecisionHash: 'decision-hash',
        expectedOutcomeHash: 'outcome-hash'
      },
      { headers: { Authorization: 'Bearer test' } }
    );
  });

  it.each([
    ['bad concept id', 'concept name', input()],
    ['bad page id', CONCEPT_ID, { ...input(), sourcePageId: 'page 1' }],
    ['empty decision id', CONCEPT_ID, { ...input(), decisionId: '' }],
    ['overlong lesson id', CONCEPT_ID, { ...input(), lessonId: 'x'.repeat(181) }],
    ['empty request id', CONCEPT_ID, { ...input(), requestId: '' }],
    ['missing role', CONCEPT_ID, { ...input(), role: '' }],
    ['unknown role', CONCEPT_ID, { ...input(), role: 'agree' }],
    ['empty decision hash', CONCEPT_ID, { ...input(), expectedDecisionHash: '' }],
    ['overlong outcome hash', CONCEPT_ID, { ...input(), expectedOutcomeHash: 'x'.repeat(129) }]
  ])('rejects %s before transport', async (_label, conceptId, payload) => {
    await expect(adoptDecisionLessonEvidence(conceptId, payload)).rejects.toThrow();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([
    ['empty response', null],
    ['coerced replay flag', envelope({ idempotent: 'false' })],
    ['missing receipt', envelope({ receipt: null })],
    ['receipt mismatch', (() => { const value = envelope(); value.receipt.id = 'another'; return value; })()],
    ['cross-concept adoption', (() => { const value = envelope(); value.adoption.targetConceptId = '64f100000000000000000099'; return value; })()],
    ['cross-page receipt', (() => { const value = envelope(); value.receipt.provenance.sourcePageId = '64f100000000000000000099'; return value; })()],
    ['wrong role', (() => { const value = envelope(); value.adoption.role = 'support'; return value; })()],
    ['wrong adoption hash', (() => { const value = envelope(); value.adoption.provenance.decisionSnapshotHash = 'other'; return value; })()],
    ['wrong receipt adoption', (() => { const value = envelope(); value.receipt.provenance.adoptionId = 'other'; return value; })()],
    ['incomplete receipt provenance', (() => { const value = envelope(); delete value.receipt.provenance.requestId; return value; })()],
    ['invalid completion clock', (() => { const value = envelope(); value.receipt.completedAt = 'not-a-date'; return value; })()]
  ])('fails closed on %s', async (_label, data) => {
    api.post.mockResolvedValue({ data });
    await expect(adoptDecisionLessonEvidence(CONCEPT_ID, input())).rejects.toThrow();
  });
});
