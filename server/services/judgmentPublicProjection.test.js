const assert = require('assert');
const {
  appendShareReceipt,
  serializePublicCasebook,
  signCasebook,
  verifyCasebook
} = require('./judgmentPublicProjection');

const PASSAGE = 'LIBRARY_HIGHLIGHT_PASSAGE cannot be benchmarked without the private extract.';
const SECRET = 'casebook-test-secret';

const stuffed = {
  _id: '6a5d1c842da7aa36147472ff',
  userId: 'owner-secret-uid-99',
  email: 'private-owner@secret.example',
  token: 'jwt-secret-token-xyz',
  authToken: 'AUTH_TOKEN_LEAK',
  slug: 'compute-stays-scarce',
  title: 'Compute stays scarce',
  pageType: 'topic',
  status: 'published',
  visibility: 'shared',
  createdAt: '2026-01-15T12:00:00.000Z',
  lastReviewedAt: '2026-08-01T12:00:00.000Z',
  plainText: 'A public sentence about compute.',
  sourceRefs: [{
    _id: 'src-public',
    objectId: 'article-LEAK-42',
    parentObjectId: 'folder-LEAK',
    type: 'article',
    title: 'DOE capacity report',
    url: 'https://example.com/doe-capacity',
    snippet: PASSAGE,
    quote: PASSAGE,
    excerpt: PASSAGE
  }],
  claims: [{
    claimId: 'c-unpublished',
    text: 'UNPUBLISHED_WIKI_CLAIM should never travel.',
    confidence: 0.91,
    epistemicStatus: 'speculation',
    sourceRefIds: ['src-public']
  }],
  discussions: [{ question: 'PRIVATE_DISCUSSION_Q', answer: 'PRIVATE_DISCUSSION_A' }],
  aiState: {
    lastError: 'PRIVATE_AGENT_ERROR',
    model: 'SECRET_MODEL',
    provider: 'SECRET_PROVIDER',
    sourceScopeAtDraft: 'entire_library',
    lastCandidateSummary: 'UNPUBLISHED_CANDIDATE',
    candidateStatus: 'awaiting_first_head_acceptance',
    firstHeadCandidateRevisionId: 'rev-CANDIDATE-LEAK'
  },
  investmentDossier: { startingJudgment: 'PRIVATE_THESIS', version: 1 },
  freshness: {
    acceptedThrough: {
      title: 'DOE capacity report accepted',
      acceptedAt: '2026-07-15T00:00:00.000Z',
      url: 'https://example.com/doe-capacity',
      sourceEventId: 'event-INTERNAL'
    }
  },
  publicProof: { acceptedAt: '2026-07-15T00:00:00.000Z', grade: 'proven' },
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    bornAt: '2026-01-15T12:00:00.000Z',
    confidence: 0.87,
    ownerLabel: 'private-owner@secret.example',
    why: [{ reasonId: 'r1', text: 'PRIVATE_NOTE_WHY_LEAK', sourceRefIds: ['src-public'] }],
    against: [{ reasonId: 'a1', text: 'PRIVATE_NOTE_AGAINST_LEAK' }],
    resolutionCriteria: 'Spot prices stay above the 2024 median.',
    verdicts: [{
      verdictId: 'v1',
      result: 'partly',
      note: 'Capacity eased in two regions.',
      recordedAt: '2026-08-01T12:00:00.000Z',
      criteriaSnapshot: 'Spot prices stay above the 2024 median.',
      evidenceSourceRefIds: ['src-public'],
      claimHash: 'CLAIM_HASH_INTERNAL',
      recordHash: 'RECORD_HASH_INTERNAL',
      revisionId: 'rev-INTERNAL',
      receiptId: 'receipt-INTERNAL'
    }],
    clocks: [{
      factId: 'clock-1',
      clock: 'evidence',
      occurredAt: '2026-06-01T12:00:00.000Z',
      recordedAt: '2026-06-02T12:00:00.000Z',
      precision: 'day',
      authoredBy: 'world',
      sourceRefIds: ['src-public'],
      sourceLabel: 'DOE capacity report',
      summary: 'The world published the capacity print.',
      causalKind: 'evidence',
      receiptId: 'receipt-CLOCK',
      claimHash: 'CLAIM_HASH_INTERNAL'
    }],
    outcomes: [{
      outcomeId: 'o1',
      result: 'mixed',
      observedAt: '2026-08-01T12:00:00.000Z',
      recordedAt: '2026-08-01T12:00:00.000Z',
      question: 'Which part survived?',
      answer: 'The scarcity claim held in training compute.',
      lesson: 'Watch regional easing separately.',
      silence: false,
      confidence: 'certain',
      sourceRefIds: ['src-public'],
      verdictSnapshot: 'partly'
    }]
  },
  casebookShare: {
    publishedAt: '2026-07-20T00:00:00.000Z',
    receipts: [{
      kind: 'published',
      at: '2026-07-20T00:00:00.000Z',
      summary: 'This case was sealed for public reading.',
      hash: 'abc'
    }]
  }
};

const unpublishedRevision = {
  promotionStatus: 'candidate',
  createdAt: '2026-08-10T12:00:00.000Z',
  summary: 'UNPUBLISHED_CANDIDATE_REVISION',
  before: { judgment: { why: [{ text: 'PRIVATE_BEFORE' }] } },
  after: { judgment: { why: [{ text: 'PRIVATE_AFTER' }] } }
};

const publishedRevision = {
  promotionStatus: 'promoted',
  createdAt: '2026-08-02T12:00:00.000Z',
  summary: 'Recorded the partial verdict.',
  reason: 'user_edit'
};

const leaks = [
  'owner-secret-uid-99',
  'private-owner@secret.example',
  'jwt-secret-token-xyz',
  'AUTH_TOKEN_LEAK',
  'PRIVATE_NOTE_WHY_LEAK',
  'PRIVATE_NOTE_AGAINST_LEAK',
  'PRIVATE_DISCUSSION_Q',
  'PRIVATE_DISCUSSION_A',
  'PRIVATE_AGENT_ERROR',
  'SECRET_MODEL',
  'SECRET_PROVIDER',
  'entire_library',
  'UNPUBLISHED_CANDIDATE',
  'UNPUBLISHED_WIKI_CLAIM',
  'PRIVATE_THESIS',
  'article-LEAK-42',
  'folder-LEAK',
  'LIBRARY_HIGHLIGHT_PASSAGE',
  'CLAIM_HASH_INTERNAL',
  'RECORD_HASH_INTERNAL',
  'rev-INTERNAL',
  'receipt-INTERNAL',
  'receipt-CLOCK',
  'event-INTERNAL',
  'rev-CANDIDATE-LEAK',
  'UNPUBLISHED_CANDIDATE_REVISION',
  'PRIVATE_BEFORE',
  'PRIVATE_AFTER',
  '0.87',
  'certain'
];

describe('judgment public projection', () => {
  it('publishes the held claim, verdicts, postmortems, and checkable evidence', () => {
    const folio = serializePublicCasebook({
      page: stuffed,
      revisions: [unpublishedRevision, publishedRevision],
      lineage: {
        origin: { title: 'Earlier compute case', slug: 'earlier-compute', hash: 'origin-hash' },
        branches: [{ title: 'A later fork', slug: 'later-fork', action: 'fork', at: '2026-08-20T00:00:00.000Z' }]
      }
    });
    expect(folio.kind).toBe('casebook');
    expect(folio.claim.text).toBe('Compute stays scarce through 2027.');
    expect(folio.claim.bornAt).toBe('2026-01-15T12:00:00.000Z');
    expect(folio.verdicts).toEqual([expect.objectContaining({
      result: 'partly',
      note: 'Capacity eased in two regions.',
      evidence: [{ type: 'article', title: 'DOE capacity report', url: 'https://example.com/doe-capacity' }]
    })]);
    expect(folio.postmortems[0].answer).toMatch(/training compute/);
    expect(folio.evidence[0].url).toBe('https://example.com/doe-capacity');
    expect(folio.evidence[0].snippet).toBeUndefined();
    expect(folio.acceptedThrough.label).toMatch(/DOE capacity/);
    expect(folio.deltas[0].summary).toBe('Recorded the partial verdict.');
    expect(folio.revisions.some((row) => row.summary === 'UNPUBLISHED_CANDIDATE_REVISION')).toBe(false);
    expect(folio.lineage.origin.slug).toBe('earlier-compute');
    expect(folio.lineage.branches[0].title).toBe('A later fork');
    expect(folio.corrections[0].kind).toBe('published');
  });

  it('keeps maintenance quiet without an accepted edition and folds same-day autosaves', () => {
    const page = {
      ...stuffed,
      freshness: {},
      publicProof: {},
      lastReviewedAt: null
    };
    const repeated = {
      ...publishedRevision,
      createdAt: '2026-08-02T16:00:00.000Z'
    };
    const folio = serializePublicCasebook({
      page,
      revisions: [publishedRevision, repeated]
    });

    expect(folio.acceptedThrough).toBeNull();
    expect(folio.deltas).toEqual([]);
    expect(folio.revisions).toHaveLength(1);
  });

  it('leaks nothing private under adversarial stuffing', () => {
    const folio = serializePublicCasebook({
      page: stuffed,
      revisions: [unpublishedRevision, publishedRevision]
    });
    const wire = JSON.stringify(folio);
    leaks.forEach((token) => {
      assert.ok(!wire.includes(token), `leaked ${token}`);
    });
    expect(folio.judgment).toBeUndefined();
    expect(folio.why).toBeUndefined();
    expect(folio.against).toBeUndefined();
    expect(folio.aiState).toBeUndefined();
    expect(folio.userId).toBeUndefined();
    expect(folio.confidence).toBeUndefined();
    expect(folio.claims).toBeUndefined();
    expect(Object.keys(folio.evidence[0]).sort()).toEqual(['title', 'type', 'url']);
  });

  it('signs a folio and detects tampering', () => {
    const folio = serializePublicCasebook({ page: stuffed, revisions: [publishedRevision] });
    const sealed = signCasebook(folio, { secret: SECRET, signedAt: '2026-08-31T12:00:00.000Z' });
    expect(sealed.seal.algorithm).toBe('hmac-sha256');
    expect(verifyCasebook(sealed, { secret: SECRET }).ok).toBe(true);
    const tampered = { ...sealed, claim: { ...sealed.claim, text: 'Compute is abundant.' } };
    expect(verifyCasebook(tampered, { secret: SECRET })).toEqual({
      ok: false,
      reason: 'The folio does not match its seal.'
    });
    const forgedSeal = {
      ...sealed,
      seal: { ...sealed.seal, signature: 'a'.repeat(sealed.seal.signature.length) }
    };
    expect(verifyCasebook(forgedSeal, { secret: SECRET }).ok).toBe(false);
  });

  it('keeps revocation receipts without rewriting earlier seals', () => {
    const page = { casebookShare: { receipts: [] } };
    appendShareReceipt(page, 'published', 'hash-one', new Date('2026-07-20T00:00:00.000Z'));
    appendShareReceipt(page, 'corrected', 'hash-two', new Date('2026-08-01T00:00:00.000Z'));
    appendShareReceipt(page, 'revoked', 'hash-two', new Date('2026-08-15T00:00:00.000Z'));
    expect(page.casebookShare.receipts.map((row) => row.hash)).toEqual(['hash-one', 'hash-two', 'hash-two']);
    expect(page.casebookShare.publishedAt.toISOString()).toBe('2026-07-20T00:00:00.000Z');
    expect(page.casebookShare.revokedAt.toISOString()).toBe('2026-08-15T00:00:00.000Z');
  });

  it('stays silent when there is no held claim', () => {
    expect(serializePublicCasebook({ page: { title: 'Empty', judgment: {} } })).toBeNull();
  });
});
