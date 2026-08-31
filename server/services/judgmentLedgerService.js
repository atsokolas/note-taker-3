const crypto = require('crypto');
const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');
const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');
const {
  CLOCKS,
  applyLessonResolution,
  clockFact,
  ledgerFor,
  outcomeRecord,
  postmortemQuestion,
  proposeLessons
} = require('./judgmentLedger');

class JudgmentLedgerError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'JudgmentLedgerError';
    this.status = status;
    this.code = code;
  }
}

const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const list = (value) => (Array.isArray(value) ? value : []);
const id = (value) => String(value?._id || value?.id || value || '').trim();
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique = (values) => Array.from(new Set(list(values).map(id).filter(Boolean)));
const queryInSession = (query, session) => (query?.session ? query.session(session) : query);
const resolveQuery = (query) => (query?.then ? query : Promise.resolve(query));
const claimHash = (claim) => digest({ claim: clean(claim, 8000) });
const payloadHash = (payload) => digest(payload);
const receiptKey = ({ pageId, requestId, action }) => `judgment-ledger:v1:${pageId}:${action}:${requestId}`;

const ACTIONS = Object.freeze({
  clock: {
    field: 'clocks',
    kind: 'judgment_clock_recorded',
    title: 'A clock was marked',
    summary: (payload) => payload.summary
  },
  outcome: {
    field: 'outcomes',
    kind: 'judgment_outcome_recorded',
    title: 'The world answered',
    summary: (payload) => payload.answer || payload.result
  },
  lesson: {
    field: 'lessonApplications',
    kind: 'judgment_lesson_applied',
    title: 'A lesson was offered',
    summary: (payload) => payload.status
  }
});

const requireModels = ({ WikiPage, WikiRevision, NoeisReceipt }) => {
  if (!WikiPage || !WikiRevision || !NoeisReceipt) {
    throw new JudgmentLedgerError('Judgment ledger persistence is unavailable.', 503, 'unavailable');
  }
  if (typeof WikiPage?.db?.startSession !== 'function') {
    throw new JudgmentLedgerError('Judgment ledger writes require MongoDB transaction support.', 503, 'transactions_required');
  }
};

const safeObjectId = (Model) => {
  const ObjectId = Model?.db?.base?.Types?.ObjectId;
  if (!ObjectId) throw new JudgmentLedgerError('Wiki revision identity is unavailable.', 503, 'unavailable');
  return new ObjectId();
};

const exactClaim = ({ page, expectedClaim }) => {
  const held = clean(page?.judgment?.currentJudgment, 8000);
  if (!held) throw new JudgmentLedgerError('This page does not hold a judgment.', 409, 'claim_missing');
  if (clean(expectedClaim, 8000) !== held) {
    throw new JudgmentLedgerError('The held sentence changed. Reopen the case before writing the ledger.', 409, 'stale_claim');
  }
  return { held, hash: claimHash(held) };
};

const exactEvidence = (page, requested = []) => {
  const ids = unique(requested);
  const counts = new Map();
  list(page?.sourceRefs).forEach((ref) => {
    const key = id(ref);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  if (ids.some((key) => counts.get(key) !== 1)) {
    throw new JudgmentLedgerError('Every source must resolve exactly once on this case.', 409, 'unresolved_evidence');
  }
  return ids;
};

const ensureLedgerFields = (page) => {
  if (!page.judgment) page.judgment = {};
  if (!Array.isArray(page.judgment.clocks)) page.judgment.clocks = [];
  if (!Array.isArray(page.judgment.outcomes)) page.judgment.outcomes = [];
  if (!Array.isArray(page.judgment.lessonApplications)) page.judgment.lessonApplications = [];
  if (!Array.isArray(page.judgment.lessons)) page.judgment.lessons = [];
  if (!Array.isArray(page.judgment.verdicts)) page.judgment.verdicts = [];
};

const loadReceipt = async ({ NoeisReceipt, userId, receiptId: key, session }) => (
  resolveQuery(queryInSession(NoeisReceipt.findOne({ userId, receiptId: key }), session))
);

const assertReplay = ({ stored, page, revision, requestId, action, expectedClaimHash, expectedPayloadHash }) => {
  const spec = ACTIONS[action];
  const raw = plain(stored);
  const provenance = plain(raw?.provenance) || {};
  const key = receiptKey({ pageId: id(page), requestId, action });
  const artifact = list(page?.judgment?.[spec.field]).find((entry) => clean(entry?.receiptId, 300) === key);
  const revisionJudgment = plain(revision?.after?.judgment) || {};
  const revisionArtifact = list(revisionJudgment[spec.field]).find((entry) => clean(entry?.receiptId, 300) === key);
  if (!raw
    || clean(raw.receiptId || raw.id, 300) !== key
    || clean(raw.kind, 100) !== spec.kind
    || clean(raw.source, 40) !== 'wiki'
    || clean(raw.status, 40) !== 'completed'
    || clean(provenance.action, 40) !== action
    || id(provenance.pageId) !== id(page)
    || clean(provenance.requestId, 160) !== requestId
    || clean(provenance.claimHash, 128) !== expectedClaimHash
    || clean(provenance.payloadHash, 128) !== expectedPayloadHash
    || id(provenance.revisionId) !== id(artifact?.revisionId)
    || !artifact
    || !artifact.revisionId
    || !revision
    || id(revision._id) !== id(artifact.revisionId)
    || id(revision.pageId) !== id(page)
    || !revisionArtifact) {
    throw new JudgmentLedgerError('Judgment ledger replay failed its integrity contract.', 409, 'receipt_integrity_failed');
  }
  return artifact;
};

const persistMutation = async ({
  action, userId, pageId, requestId, expectedClaim, payload, mutate,
  WikiPage, WikiRevision, NoeisReceipt, now = () => new Date()
}) => {
  requireModels({ WikiPage, WikiRevision, NoeisReceipt });
  const spec = ACTIONS[action];
  if (!spec) throw new JudgmentLedgerError('Unknown ledger action.');
  const safePageId = id(pageId);
  const safeRequestId = clean(requestId, 160);
  if (!safePageId || !safeRequestId || !clean(expectedClaim, 8000)) {
    throw new JudgmentLedgerError('pageId, requestId, and expectedClaim are required.');
  }
  const actedAt = now();
  const expectedClaimHash = claimHash(expectedClaim);
  const expectedPayloadHash = payloadHash(payload);
  const key = receiptKey({ pageId: safePageId, requestId: safeRequestId, action });
  const session = await WikiPage.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const page = await resolveQuery(queryInSession(WikiPage.findOne({
        _id: safePageId, userId, status: { $ne: 'archived' }
      }), session));
      if (!page) throw new JudgmentLedgerError('Judgment not found.', 404, 'not_found');
      const { hash } = exactClaim({ page, expectedClaim });
      if (hash !== expectedClaimHash) throw new JudgmentLedgerError('The held sentence changed.', 409, 'stale_claim');
      const stored = await loadReceipt({ NoeisReceipt, userId, receiptId: key, session });
      if (stored) {
        const storedProvenance = plain(stored?.provenance) || {};
        const revision = await resolveQuery(queryInSession(WikiRevision.findOne({
          _id: storedProvenance.revisionId,
          userId,
          pageId: safePageId
        }), session));
        const artifact = assertReplay({
          stored, page, revision, requestId: safeRequestId, action,
          expectedClaimHash, expectedPayloadHash
        });
        result = { idempotent: true, page, artifact, receipt: serializeStoredReceipt(stored) };
        return;
      }
      const before = snapshotPage(page);
      const revisionId = safeObjectId(WikiRevision);
      ensureLedgerFields(page);
      const artifact = mutate({ page, hash, actedAt, revisionId, receiptId: key });
      page.markModified?.('judgment');
      await page.save({ session });
      const revision = await createWikiRevision({
        WikiRevision, revisionId, userId, page, before, reason: 'user_edit', actorType: 'user',
        summary: spec.title,
        session
      });
      const receipt = await persistNoeisReceipt({
        NoeisReceipt, userId, session,
        receipt: {
          id: key,
          kind: spec.kind,
          source: 'wiki', sourceLabel: 'Judgment', status: 'completed', completedAt: actedAt,
          title: spec.title,
          summary: spec.summary(payload),
          touched: [
            { type: 'wiki_page', id: safePageId, title: page.title },
            { type: 'wiki_revision', id: id(revision), title: action }
          ],
          provenance: {
            version: 1, action, pageId: safePageId, requestId: safeRequestId,
            claimHash: expectedClaimHash, payloadHash: expectedPayloadHash,
            revisionId: id(revision)
          }
        }
      });
      result = { idempotent: false, page, artifact, receipt };
    });
  } finally {
    await session.endSession();
  }
  return result;
};

const appendClockOn = (page, fact, { revisionId, receiptId, claimHash: hash }) => {
  ensureLedgerFields(page);
  const stored = { ...fact, revisionId, receiptId, claimHash: hash, derived: false };
  page.judgment.clocks.push(stored);
  return stored;
};

const recordClock = async ({
  userId, pageId, requestId, expectedClaim, clock, occurredAt = null, precision = '',
  authoredBy = 'user', sourceRefIds = [], sourceLabel = '', summary = '', causalKind = 'evidence',
  relatedId = '', WikiPage, WikiRevision, NoeisReceipt, now = () => new Date()
} = {}) => {
  if (!CLOCKS.includes(String(clock || ''))) {
    throw new JudgmentLedgerError('clock must be evidence, expectation, decision, review, or outcome.');
  }
  const current = now();
  const payload = {
    clock, occurredAt, precision, authoredBy, sourceRefIds: unique(sourceRefIds).sort(),
    sourceLabel: clean(sourceLabel, 240), summary: clean(summary, 2000), causalKind, relatedId
  };
  return persistMutation({
    action: 'clock', userId, pageId, requestId, expectedClaim, payload,
    WikiPage, WikiRevision, NoeisReceipt, now: () => current,
    mutate: ({ page, hash, actedAt, revisionId, receiptId: key }) => {
      const evidenceIds = exactEvidence(page, sourceRefIds);
      const fact = clockFact({
        clock,
        occurredAt: occurredAt || (precision === 'unknown' ? null : actedAt),
        recordedAt: actedAt,
        precision,
        authoredBy,
        sourceRefIds: evidenceIds,
        sourceLabel,
        summary,
        causalKind,
        relatedId,
        receiptId: key,
        revisionId,
        claimHash: hash
      });
      return appendClockOn(page, fact, { revisionId, receiptId: key, claimHash: hash });
    }
  });
};

const recordOutcome = async ({
  userId, pageId, requestId, expectedClaim, result = '', observedAt = null, precision = '',
  sourceRefIds = [], sourceLabel = '', confidence = '', silence = false, answer = '', lesson = '',
  verdictId = '', WikiPage, WikiRevision, NoeisReceipt, now = () => new Date()
} = {}) => {
  const current = now();
  const payload = {
    result, observedAt, precision, sourceRefIds: unique(sourceRefIds).sort(),
    sourceLabel: clean(sourceLabel, 240), confidence, silence: Boolean(silence),
    answer: clean(answer, 4000), lesson: clean(lesson, 2000), verdictId: clean(verdictId, 160)
  };
  return persistMutation({
    action: 'outcome', userId, pageId, requestId, expectedClaim, payload,
    WikiPage, WikiRevision, NoeisReceipt, now: () => current,
    mutate: ({ page, hash, actedAt, revisionId, receiptId: key }) => {
      ensureLedgerFields(page);
      const evidenceIds = exactEvidence(page, sourceRefIds);
      const verdict = list(page.judgment.verdicts).find((row) => clean(row.verdictId) === clean(verdictId))
        || list(page.judgment.verdicts).at(-1)
        || null;
      const snapshot = clean(verdict?.result, 40);
      const question = postmortemQuestion(snapshot);
      const artifact = {
        ...outcomeRecord({
          result,
          observedAt,
          recordedAt: actedAt,
          precision,
          sourceRefIds: evidenceIds,
          sourceLabel,
          confidence,
          silence,
          question,
          answer,
          lesson,
          verdictId: clean(verdict?.verdictId || verdictId, 160),
          verdictSnapshot: snapshot
        }),
        revisionId,
        receiptId: key,
        recordedBy: 'user'
      };
      page.judgment.outcomes.push(artifact);
      appendClockOn(page, clockFact({
        clock: 'outcome',
        occurredAt: artifact.observedAt,
        recordedAt: actedAt,
        precision: artifact.precision,
        authoredBy: 'user',
        sourceRefIds: evidenceIds,
        sourceLabel,
        summary: artifact.silence ? 'Left in silence.' : (artifact.answer || artifact.result),
        relatedId: artifact.outcomeId,
        receiptId: key,
        revisionId,
        claimHash: hash
      }), { revisionId, receiptId: key, claimHash: hash });
      if (artifact.lesson) {
        page.judgment.lessons.push({
          lessonId: `lesson_${digest(artifact.outcomeId).slice(0, 24)}`,
          text: artifact.lesson,
          closedAs: 'closed',
          at: actedAt,
          outcomeId: artifact.outcomeId,
          sourceLessonId: ''
        });
      }
      return artifact;
    }
  });
};

const resolveLesson = async ({
  userId, pageId, requestId, expectedClaim, applicationId = '', lessonId, sourcePageId,
  sourceText = '', status, narrowedText = '', note = '', relevance = '',
  WikiPage, WikiRevision, NoeisReceipt, now = () => new Date()
} = {}) => {
  const current = now();
  const payload = {
    applicationId: clean(applicationId, 80),
    lessonId: clean(lessonId, 120),
    sourcePageId: id(sourcePageId),
    status: clean(status, 40),
    narrowedText: clean(narrowedText, 2000),
    note: clean(note, 2000)
  };
  return persistMutation({
    action: 'lesson', userId, pageId, requestId, expectedClaim, payload,
    WikiPage, WikiRevision, NoeisReceipt, now: () => current,
    mutate: ({ page, hash, actedAt, revisionId, receiptId: key }) => {
      ensureLedgerFields(page);
      const settled = {
        applicationId: payload.applicationId,
        lessonId: payload.lessonId,
        text: clean(sourceText, 2000),
        sourcePageId: payload.sourcePageId,
        pageId: payload.sourcePageId
      };
      const { application, lesson } = applyLessonResolution({
        livePage: page,
        lesson: { ...settled, relevance },
        status,
        narrowedText,
        note,
        at: actedAt
      });
      const originalLessons = list(page.judgment.lessons).map((row) => ({ ...plain(row) }));
      const artifact = { ...application, revisionId, receiptId: key, claimHash: hash };
      page.judgment.lessonApplications.push(artifact);
      if (lesson) {
        const already = originalLessons.some((row) => clean(row.lessonId) === lesson.lessonId);
        if (!already) page.judgment.lessons.push(lesson);
      }
      const stillOriginal = list(page.judgment.lessons).filter((row) => (
        originalLessons.some((prior) => clean(prior.lessonId) === clean(row.lessonId))
      ));
      if (stillOriginal.length !== originalLessons.length) {
        throw new JudgmentLedgerError('A lesson resolution may not rewrite the originals.', 409, 'history_rewrite');
      }
      originalLessons.forEach((prior, index) => {
        const kept = page.judgment.lessons.find((row) => clean(row.lessonId) === clean(prior.lessonId));
        if (clean(kept?.text) !== clean(prior.text)) {
          throw new JudgmentLedgerError('A lesson resolution may not rewrite the originals.', 409, 'history_rewrite');
        }
        void index;
      });
      return artifact;
    }
  });
};

const readLedger = async ({
  WikiPage, WikiRevision, userId, pageId, at = null, now = new Date()
} = {}) => {
  const pageQuery = WikiPage.findOne({
    _id: id(pageId), userId, status: { $ne: 'archived' }
  });
  const page = await (pageQuery?.lean ? pageQuery.lean() : pageQuery);
  if (!page) {
    const error = new JudgmentLedgerError('Judgment not found.', 404, 'not_found');
    throw error;
  }
  const revisionQuery = WikiRevision?.find
    ? WikiRevision.find({ userId, pageId: page._id, snapshotPrunedAt: null })
      .select('pageId createdAt after.title after.sourceRefs after.judgment after.claims')
      .sort({ createdAt: 1 })
    : null;
  const revisions = revisionQuery ? await (revisionQuery.lean ? revisionQuery.lean() : revisionQuery) : [];
  const othersQuery = WikiPage.find({
    userId, status: { $ne: 'archived' }, _id: { $ne: page._id }
  }).select('_id title sourceRefs._id judgment.currentJudgment judgment.status judgment.lessons judgment.verdicts judgment.outcomes judgment.dependsOn judgment.why.sourceRefIds judgment.against.sourceRefIds');
  const settledPages = othersQuery ? await (othersQuery.lean ? othersQuery.lean() : othersQuery) : [];
  const ledger = ledgerFor({
    page,
    revisions: revisions || [],
    settledPages: settledPages || [],
    at
  });
  return {
    ...ledger,
    pageId: id(page),
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    proposals: proposeLessons({ livePage: page, settledPages: settledPages || [] })
  };
};

module.exports = {
  ACTIONS,
  JudgmentLedgerError,
  appendClockOn,
  readLedger,
  recordClock,
  recordOutcome,
  resolveLesson
};
