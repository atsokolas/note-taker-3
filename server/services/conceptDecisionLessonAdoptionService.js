const crypto = require('crypto');
const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');
const { buildDecisionLessonEvidence } = require('./decisionLessonEvidenceService');

const VERSION = 1;
const ROLES = Object.freeze(['support', 'tension', 'context']);
const list = value => Array.isArray(value) ? value : [];
const id = value => String(value?._id || value?.id || value || '').trim();
const clean = (value = '', limit = 4000) => String(value || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const digest = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const queryInSession = (query, session) => session && query?.session ? query.session(session) : query;
const resolveQuery = async query => await (query?.lean ? query.lean() : query);
const visible = value => Boolean(value
  && value.hiddenFromHome !== true
  && value.debugOnly !== true
  && value.archived !== true);
const sameInstant = (left, right) => {
  const leftTime = left ? new Date(left).getTime() : NaN;
  const rightTime = right ? new Date(right).getTime() : NaN;
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
};
const isoOrNull = value => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const refSnapshot = ref => ({
  type: clean(ref?.type, 80),
  id: id(ref),
  parentId: id(ref?.parentId) || null,
  title: clean(ref?.title, 500),
  href: clean(ref?.href, 1200)
});
const refs = values => list(values).map(refSnapshot).filter(ref => ref.type && ref.id);
const evidenceIdentity = values => refs(values).map(ref => ({
  type: ref.type,
  id: ref.id,
  parentId: ref.parentId
}));
const sameEvidenceIdentity = (left, right) => (
  JSON.stringify(evidenceIdentity(left)) === JSON.stringify(evidenceIdentity(right))
);

class ConceptDecisionLessonAdoptionError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'ConceptDecisionLessonAdoptionError';
    this.status = status;
    this.code = code;
  }
}

const stableAdoptionId = ({ targetConceptId, sourcePageId, decisionId }) => (
  `concept_decision_lesson_${digest(`v1|${targetConceptId}|${sourcePageId}|${decisionId}`).slice(0, 24)}`
);
const stableReceiptId = ({ targetConceptId, sourcePageId, decisionId }) => (
  `concept-decision-lesson:v1:${targetConceptId}:${sourcePageId}:${decisionId}`
);
const payloadSnapshot = value => ({
  adoptionId: clean(value?.adoptionId, 180),
  targetConceptId: id(value?.targetConceptId),
  sourcePageId: id(value?.sourcePageId),
  decisionId: clean(value?.decisionId, 180),
  lessonId: clean(value?.lessonId, 180),
  role: clean(value?.role, 40),
  lessonSnapshot: clean(value?.lessonSnapshot, 8000),
  result: clean(value?.result, 40),
  processScore: value?.processScore === null || value?.processScore === undefined
    ? null : Number(value.processScore),
  calibrationNoteSnapshot: clean(value?.calibrationNoteSnapshot, 4000),
  observedAt: isoOrNull(value?.observedAt),
  observedEvidenceRefs: refs(value?.observedEvidenceRefs),
  decisionSourceRefs: refs(value?.decisionSourceRefs),
  relatedClaimRefs: refs(value?.relatedClaimRefs),
  acceptedRevisionId: id(value?.acceptedRevisionId),
  recordedRevisionId: id(value?.recordedRevisionId),
  outcomeRevisionId: id(value?.outcomeRevisionId),
  decisionReceiptId: clean(value?.decisionReceiptId, 300),
  outcomeReceiptId: clean(value?.outcomeReceiptId, 300),
  receiptId: clean(value?.receiptId, 300),
  requestId: clean(value?.requestId, 180),
  decisionSnapshotHash: clean(value?.decisionSnapshotHash, 128),
  outcomeRecordHash: clean(value?.outcomeRecordHash, 128),
  acceptedAt: isoOrNull(value?.acceptedAt),
  acceptedBy: clean(value?.acceptedBy, 40),
  version: Number(value?.version) || VERSION
});
const payloadHash = value => digest(JSON.stringify(payloadSnapshot(value)));
const serializeAdoption = value => {
  const raw = plain(value) || {};
  return {
    id: clean(raw.adoptionId, 180),
    kind: 'decision_lesson',
    status: 'accepted',
    acceptedIntoConcept: true,
    role: clean(raw.role, 40),
    targetConceptId: id(raw.targetConceptId),
    lesson: clean(raw.lessonSnapshot, 8000),
    result: clean(raw.result, 40),
    processScore: raw.processScore === null || raw.processScore === undefined ? null : Number(raw.processScore),
    calibrationNote: clean(raw.calibrationNoteSnapshot, 4000),
    observedAt: raw.observedAt || null,
    sourcePageId: id(raw.sourcePageId),
    decisionId: clean(raw.decisionId, 180),
    lessonId: clean(raw.lessonId, 180),
    observedEvidence: refs(raw.observedEvidenceRefs),
    decisionSources: refs(raw.decisionSourceRefs),
    relatedClaims: refs(raw.relatedClaimRefs),
    acceptedAt: raw.acceptedAt || null,
    acceptedBy: clean(raw.acceptedBy, 40),
    provenance: {
      acceptedRevisionId: id(raw.acceptedRevisionId),
      recordedRevisionId: id(raw.recordedRevisionId),
      outcomeRevisionId: id(raw.outcomeRevisionId),
      decisionReceiptId: clean(raw.decisionReceiptId, 300),
      outcomeReceiptId: clean(raw.outcomeReceiptId, 300),
      adoptionReceiptId: clean(raw.receiptId, 300),
      decisionSnapshotHash: clean(raw.decisionSnapshotHash, 128),
      outcomeRecordHash: clean(raw.outcomeRecordHash, 128),
      payloadHash: clean(raw.payloadHash, 128)
    }
  };
};

const receiptMatches = ({ receipt, adoption }) => {
  const provenance = receipt?.provenance || {};
  const touched = list(receipt?.touched).map(ref => `${clean(ref?.type, 80)}:${id(ref?.id)}`).sort();
  const expectedTouched = [
    `concept:${id(adoption?.targetConceptId)}`,
    `decision:${clean(adoption?.decisionId, 180)}`,
    `wiki_page:${id(adoption?.sourcePageId)}`
  ].sort();
  const expectedReceiptId = stableReceiptId({
    targetConceptId: id(adoption?.targetConceptId),
    sourcePageId: id(adoption?.sourcePageId),
    decisionId: clean(adoption?.decisionId, 180)
  });
  return receipt?.kind === 'concept_decision_lesson_adopted'
    && clean(receipt?.id, 300) === clean(adoption?.receiptId, 300)
    && clean(adoption?.receiptId, 300) === expectedReceiptId
    && receipt?.source === 'concept'
    && receipt?.status === 'completed'
    && sameInstant(receipt?.completedAt, adoption?.acceptedAt)
    && Number(provenance?.version) === VERSION
    && clean(provenance?.action, 80) === 'adopt_decision_lesson'
    && clean(provenance?.actorType, 40) === 'user'
    && clean(provenance?.adoptionId, 180) === clean(adoption?.adoptionId, 180)
    && id(provenance?.targetConceptId) === id(adoption?.targetConceptId)
    && id(provenance?.sourcePageId) === id(adoption?.sourcePageId)
    && clean(provenance?.decisionId, 180) === clean(adoption?.decisionId, 180)
    && clean(provenance?.lessonId, 180) === clean(adoption?.lessonId, 180)
    && clean(provenance?.role, 40) === clean(adoption?.role, 40)
    && clean(provenance?.requestId, 180) === clean(adoption?.requestId, 180)
    && id(provenance?.acceptedRevisionId) === id(adoption?.acceptedRevisionId)
    && id(provenance?.recordedRevisionId) === id(adoption?.recordedRevisionId)
    && id(provenance?.outcomeRevisionId) === id(adoption?.outcomeRevisionId)
    && clean(provenance?.decisionReceiptId, 300) === clean(adoption?.decisionReceiptId, 300)
    && clean(provenance?.outcomeReceiptId, 300) === clean(adoption?.outcomeReceiptId, 300)
    && clean(provenance?.decisionSnapshotHash, 128) === clean(adoption?.decisionSnapshotHash, 128)
    && clean(provenance?.outcomeRecordHash, 128) === clean(adoption?.outcomeRecordHash, 128)
    && JSON.stringify(evidenceIdentity(provenance?.observedEvidence))
      === JSON.stringify(evidenceIdentity(adoption?.observedEvidenceRefs))
    && clean(provenance?.payloadHash, 128) === clean(adoption?.payloadHash, 128)
    && JSON.stringify(touched) === JSON.stringify(expectedTouched);
};
const adoptionMatchesRequest = ({ adoption, safe, lesson }) => Boolean(
  adoption
  && clean(adoption?.requestId, 180) === safe.requestId
  && clean(adoption?.role, 40) === safe.role
  && clean(adoption?.lessonId, 180) === safe.lessonId
  && clean(adoption?.decisionSnapshotHash, 128) === safe.expectedDecisionHash
  && clean(adoption?.outcomeRecordHash, 128) === safe.expectedOutcomeHash
  && clean(adoption?.lessonSnapshot, 8000) === clean(lesson?.lesson ?? lesson?.lessonSnapshot, 8000)
  && clean(adoption?.calibrationNoteSnapshot, 4000)
    === clean(lesson?.calibrationNote ?? lesson?.calibrationNoteSnapshot, 4000)
  && clean(adoption?.payloadHash, 128) === payloadHash(adoption)
);
const lessonMatchesAdoption = ({ lesson, adoption }) => Boolean(
  lesson
  && clean(lesson?.id, 180) === clean(adoption?.lessonId, 180)
  && clean(lesson?.decision?.id, 180) === clean(adoption?.decisionId, 180)
  && id(lesson?.page?.id) === id(adoption?.sourcePageId)
  && clean(lesson?.lesson, 8000) === clean(adoption?.lessonSnapshot, 8000)
  && clean(lesson?.result, 40) === clean(adoption?.result, 40)
  && (lesson?.processScore === null || lesson?.processScore === undefined
    ? adoption?.processScore === null || adoption?.processScore === undefined
    : Number(lesson.processScore) === Number(adoption?.processScore))
  && clean(lesson?.calibrationNote, 4000) === clean(adoption?.calibrationNoteSnapshot, 4000)
  && sameInstant(lesson?.observedAt, adoption?.observedAt)
  && sameEvidenceIdentity(lesson?.observedEvidence, adoption?.observedEvidenceRefs)
  && sameEvidenceIdentity(lesson?.decisionSources, adoption?.decisionSourceRefs)
  && sameEvidenceIdentity(lesson?.relatedClaims, adoption?.relatedClaimRefs)
  && id(lesson?.provenance?.acceptedRevisionId) === id(adoption?.acceptedRevisionId)
  && id(lesson?.provenance?.recordedRevisionId) === id(adoption?.recordedRevisionId)
  && id(lesson?.provenance?.outcomeRevisionId) === id(adoption?.outcomeRevisionId)
  && clean(lesson?.provenance?.decisionReceiptId, 300) === clean(adoption?.decisionReceiptId, 300)
  && clean(lesson?.provenance?.outcomeReceiptId, 300) === clean(adoption?.outcomeReceiptId, 300)
  && clean(lesson?.provenance?.immutableSnapshotHash, 128) === clean(adoption?.decisionSnapshotHash, 128)
  && clean(lesson?.provenance?.outcomeRecordHash, 128) === clean(adoption?.outcomeRecordHash, 128)
);

const adoptDecisionLessonEvidence = async ({
  userId,
  targetConceptId,
  sourcePageId,
  decisionId,
  lessonId,
  role,
  requestId,
  expectedDecisionHash,
  expectedOutcomeHash,
  models = {},
  buildLessons = buildDecisionLessonEvidence,
  now = () => new Date()
} = {}) => {
  const safe = {
    userId: id(userId),
    targetConceptId: id(targetConceptId),
    sourcePageId: id(sourcePageId),
    decisionId: clean(decisionId, 180),
    lessonId: clean(lessonId, 180),
    role: clean(role, 40).toLowerCase(),
    requestId: clean(requestId, 180),
    expectedDecisionHash: clean(expectedDecisionHash, 128),
    expectedOutcomeHash: clean(expectedOutcomeHash, 128)
  };
  if (Object.entries(safe).some(([, value]) => !value)) {
    throw new ConceptDecisionLessonAdoptionError(
      'Concept, lesson identity, role, requestId, and expected hashes are required.'
    );
  }
  if (!ROLES.includes(safe.role)) {
    throw new ConceptDecisionLessonAdoptionError('role must be support, tension, or context.');
  }
  const { TagMeta, ConceptDecisionLessonEvidence, NoeisReceipt } = models;
  if (!TagMeta || !ConceptDecisionLessonEvidence || !NoeisReceipt
    || typeof ConceptDecisionLessonEvidence?.db?.startSession !== 'function') {
    throw new ConceptDecisionLessonAdoptionError(
      'Retained-lesson adoption requires transactional evidence and receipt models.',
      503,
      'transactions_required'
    );
  }
  const adoptionId = stableAdoptionId(safe);
  const receiptId = stableReceiptId(safe);
  const requestAsOf = now();
  if (!(requestAsOf instanceof Date) || Number.isNaN(requestAsOf.getTime())) {
    throw new ConceptDecisionLessonAdoptionError('The adoption clock is invalid.', 500, 'invalid_clock');
  }
  const session = await ConceptDecisionLessonEvidence.db.startSession();
  let response;
  let expectedAdoption = null;
  try {
    await session.withTransaction(async () => {
      const concept = await resolveQuery(queryInSession(TagMeta.findOne({
        _id: safe.targetConceptId,
        userId: safe.userId,
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true }
      }), session));
      if (!concept || !visible(concept) || id(concept.userId) !== safe.userId) {
        throw new ConceptDecisionLessonAdoptionError('Concept not found.', 404, 'not_found');
      }
      const lessons = await buildLessons({
        userId: safe.userId,
        targetPageId: safe.sourcePageId,
        models,
        asOf: requestAsOf,
        session
      });
      const matching = list(lessons).filter(value => (
        clean(value?.id, 180) === safe.lessonId
        && clean(value?.decision?.id, 180) === safe.decisionId
        && id(value?.page?.id) === safe.sourcePageId
        && id(value?.relevanceBasis?.pageId) === safe.sourcePageId
      ));
      if (matching.length !== 1) {
        throw new ConceptDecisionLessonAdoptionError(
          'The retained lesson is unavailable or no longer passes continuity verification.',
          409,
          'lesson_unavailable'
        );
      }
      const lesson = matching[0];
      const decisionSnapshotHash = clean(lesson?.provenance?.immutableSnapshotHash, 128);
      const outcomeRecordHash = clean(lesson?.provenance?.outcomeRecordHash, 128);
      if (decisionSnapshotHash !== safe.expectedDecisionHash
        || outcomeRecordHash !== safe.expectedOutcomeHash) {
        throw new ConceptDecisionLessonAdoptionError(
          'The retained lesson changed after this evidence action was opened.',
          409,
          'stale_lesson'
        );
      }
      const acceptedAt = requestAsOf;
      const adoption = {
        adoptionId,
        userId: safe.userId,
        targetConceptId: safe.targetConceptId,
        sourcePageId: safe.sourcePageId,
        decisionId: safe.decisionId,
        lessonId: safe.lessonId,
        role: safe.role,
        lessonSnapshot: clean(lesson.lesson, 8000),
        result: clean(lesson.result, 40),
        processScore: lesson.processScore === null || lesson.processScore === undefined
          ? null : Number(lesson.processScore),
        calibrationNoteSnapshot: clean(lesson.calibrationNote, 4000),
        observedAt: lesson.observedAt,
        observedEvidenceRefs: refs(lesson.observedEvidence),
        decisionSourceRefs: refs(lesson.decisionSources),
        relatedClaimRefs: refs(lesson.relatedClaims),
        acceptedRevisionId: id(lesson?.provenance?.acceptedRevisionId),
        recordedRevisionId: id(lesson?.provenance?.recordedRevisionId),
        outcomeRevisionId: id(lesson?.provenance?.outcomeRevisionId),
        decisionReceiptId: clean(lesson?.provenance?.decisionReceiptId, 300),
        outcomeReceiptId: clean(lesson?.provenance?.outcomeReceiptId, 300),
        receiptId,
        requestId: safe.requestId,
        decisionSnapshotHash,
        outcomeRecordHash,
        acceptedAt,
        acceptedBy: 'user',
        version: VERSION
      };
      adoption.payloadHash = payloadHash(adoption);
      expectedAdoption = adoption;
      if (!adoption.lessonSnapshot || !adoption.calibrationNoteSnapshot
        || !isoOrNull(adoption.observedAt)
        || !adoption.observedEvidenceRefs.length
        || !adoption.acceptedRevisionId || !adoption.recordedRevisionId || !adoption.outcomeRevisionId
        || !adoption.decisionReceiptId || !adoption.outcomeReceiptId
        || !adoption.decisionSnapshotHash || !adoption.outcomeRecordHash) {
        throw new ConceptDecisionLessonAdoptionError(
          'The retained lesson lacks complete adoption provenance.',
          409,
          'lesson_provenance_incomplete'
        );
      }
      const [existingRaw, receiptRaw] = await Promise.all([
        resolveQuery(queryInSession(ConceptDecisionLessonEvidence.findOne({
          userId: safe.userId,
          targetConceptId: safe.targetConceptId,
          sourcePageId: safe.sourcePageId,
          decisionId: safe.decisionId
        }), session)),
        resolveQuery(queryInSession(NoeisReceipt.findOne({ userId: safe.userId, receiptId }), session))
      ]);
      const existing = plain(existingRaw);
      const storedReceipt = serializeStoredReceipt(receiptRaw);
      if (existing || receiptRaw) {
        if (!existing || !receiptRaw
          || !adoptionMatchesRequest({ adoption: existing, safe, lesson })
          || !receiptMatches({ receipt: storedReceipt, adoption: existing })) {
          throw new ConceptDecisionLessonAdoptionError(
            existing && clean(existing.role, 40) !== safe.role
              ? 'This retained lesson is already accepted under a different evidence role.'
              : 'This retained lesson has conflicting or incomplete adoption provenance.',
            409,
            existing && clean(existing.role, 40) !== safe.role
              ? 'role_conflict'
              : 'adoption_conflict'
          );
        }
        response = { idempotent: true, adoption: serializeAdoption(existing), receipt: storedReceipt };
        return;
      }
      const createdRows = await ConceptDecisionLessonEvidence.create([adoption], { session });
      const created = list(createdRows)[0];
      if (!created) {
        throw new ConceptDecisionLessonAdoptionError('Lesson adoption could not be persisted.', 500, 'adoption_failed');
      }
      const receipt = await persistNoeisReceipt({
        NoeisReceipt,
        userId: safe.userId,
        session,
        receipt: {
          id: receiptId,
          kind: 'concept_decision_lesson_adopted',
          source: 'concept',
          sourceLabel: concept.name || 'Concept',
          status: 'completed',
          title: 'Retained lesson accepted as Concept evidence',
          summary: `Human owner accepted one verified decision lesson as ${safe.role} evidence.`,
          touched: [
            { type: 'concept', id: safe.targetConceptId, title: concept.name || 'Concept' },
            { type: 'wiki_page', id: safe.sourcePageId, title: lesson?.page?.title || 'Wiki page' },
            { type: 'decision', id: safe.decisionId, title: lesson?.decision?.title || 'Decision' }
          ],
          provenance: {
            version: VERSION,
            action: 'adopt_decision_lesson',
            actorType: 'user',
            requestId: safe.requestId,
            adoptionId,
            targetConceptId: safe.targetConceptId,
            sourcePageId: safe.sourcePageId,
            decisionId: safe.decisionId,
            lessonId: safe.lessonId,
            role: safe.role,
            acceptedRevisionId: adoption.acceptedRevisionId,
            recordedRevisionId: adoption.recordedRevisionId,
            outcomeRevisionId: adoption.outcomeRevisionId,
            decisionReceiptId: adoption.decisionReceiptId,
            outcomeReceiptId: adoption.outcomeReceiptId,
            decisionSnapshotHash,
            outcomeRecordHash,
            observedEvidence: adoption.observedEvidenceRefs.map(ref => ({
              type: ref.type, id: ref.id, parentId: ref.parentId
            })),
            payloadHash: adoption.payloadHash
          },
          completedAt: acceptedAt
        }
      });
      if (!receipt) {
        throw new ConceptDecisionLessonAdoptionError('Adoption receipt could not be persisted.', 500, 'receipt_failed');
      }
      response = { idempotent: false, adoption: serializeAdoption(created), receipt };
    });
    return response;
  } catch (error) {
    if (error?.code === 11000 && expectedAdoption) {
      const [winnerRaw, receiptRaw] = await Promise.all([
        resolveQuery(ConceptDecisionLessonEvidence.findOne({
          userId: safe.userId,
          targetConceptId: safe.targetConceptId,
          sourcePageId: safe.sourcePageId,
          decisionId: safe.decisionId
        })),
        resolveQuery(NoeisReceipt.findOne({ userId: safe.userId, receiptId }))
      ]);
      const winner = plain(winnerRaw);
      const winnerReceipt = serializeStoredReceipt(receiptRaw);
      if (winner
        && adoptionMatchesRequest({ adoption: winner, safe, lesson: expectedAdoption })
        && receiptMatches({ receipt: winnerReceipt, adoption: winner })) {
        return { idempotent: true, adoption: serializeAdoption(winner), receipt: winnerReceipt };
      }
      throw new ConceptDecisionLessonAdoptionError(
        winner && clean(winner.role, 40) !== safe.role
          ? 'This retained lesson is already accepted under a different evidence role.'
          : 'This retained lesson has conflicting or incomplete adoption provenance.',
        409,
        winner && clean(winner.role, 40) !== safe.role ? 'role_conflict' : 'adoption_conflict'
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const loadConceptDecisionLessonEvidence = async ({
  userId,
  targetConceptId,
  ConceptDecisionLessonEvidence,
  NoeisReceipt,
  WikiPage,
  models = {},
  buildLessons = buildDecisionLessonEvidence,
  asOf = new Date(),
  limit = 100
} = {}) => {
  if (!userId || !targetConceptId || !ConceptDecisionLessonEvidence?.find || !NoeisReceipt?.find) {
    return {
      items: [],
      integrity: { scanned: 0, accepted: 0, omitted: 0, sourceUnavailable: 0, continuityUnavailable: 0 }
    };
  }
  let query = ConceptDecisionLessonEvidence.find({ userId, targetConceptId });
  query = query.sort?.({ acceptedAt: -1, adoptionId: 1 }) || query;
  query = query.limit?.(Math.max(1, Math.min(Number(limit) || 100, 250))) || query;
  const rows = list(await resolveQuery(query)).map(plain);
  const receiptIds = Array.from(new Set(rows.map(row => clean(row?.receiptId, 300)).filter(Boolean)));
  const receiptRows = receiptIds.length
    ? list(await resolveQuery(NoeisReceipt.find({ userId, receiptId: { $in: receiptIds } }))).map(plain)
    : [];
  const receiptById = new Map(receiptRows.map(row => [clean(row?.receiptId, 300), row]));
  const sourcePageIds = Array.from(new Set(rows.map(row => id(row?.sourcePageId)).filter(Boolean)));
  const sourcePages = sourcePageIds.length && WikiPage?.find
    ? list(await resolveQuery(WikiPage.find({
      userId,
      _id: { $in: sourcePageIds },
      status: { $ne: 'archived' },
      archived: { $ne: true },
      hiddenFromHome: { $ne: true },
      debugOnly: { $ne: true }
    }))).map(plain)
    : [];
  const visibleSourceIds = new Set(sourcePages.filter(visible).map(row => id(row)));
  const safeAsOf = asOf instanceof Date ? asOf : new Date(asOf);
  const validAsOf = !Number.isNaN(safeAsOf.getTime());
  const verificationModels = {
    ...models,
    ConceptDecisionLessonEvidence,
    NoeisReceipt,
    WikiPage: WikiPage || models.WikiPage
  };
  const verifiedLessonsByPage = new Map();
  if (validAsOf && typeof buildLessons === 'function') {
    await Promise.all(sourcePageIds.map(async sourcePageId => {
      try {
        const verified = await buildLessons({
          userId,
          targetPageId: sourcePageId,
          models: verificationModels,
          asOf: safeAsOf
        });
        verifiedLessonsByPage.set(sourcePageId, list(verified));
      } catch (_error) {
        verifiedLessonsByPage.set(sourcePageId, []);
      }
    }));
  }
  let omitted = 0;
  let sourceUnavailable = 0;
  let continuityUnavailable = 0;
  const items = rows.flatMap(row => {
    const receipt = serializeStoredReceipt(receiptById.get(clean(row?.receiptId, 300)));
    const sourceVisible = visibleSourceIds.has(id(row?.sourcePageId));
    const acceptedAt = isoOrNull(row?.acceptedAt);
    const verifiedMatches = list(verifiedLessonsByPage.get(id(row?.sourcePageId))).filter(lesson => (
      lessonMatchesAdoption({ lesson, adoption: row })
    ));
    if (id(row?.userId) !== id(userId)
      || id(row?.targetConceptId) !== id(targetConceptId)
      || row?.acceptedBy !== 'user'
      || !ROLES.includes(clean(row?.role, 40))
      || clean(row?.payloadHash, 128) !== payloadHash(row)
      || !receiptMatches({ receipt, adoption: row })
      || !acceptedAt
      || !validAsOf
      || new Date(acceptedAt) > safeAsOf
      || !sourceVisible
      || verifiedMatches.length !== 1) {
      omitted += 1;
      if (!sourceVisible) sourceUnavailable += 1;
      if (sourceVisible && verifiedMatches.length !== 1) continuityUnavailable += 1;
      return [];
    }
    return [{ ...serializeAdoption(row), provenanceState: 'verified' }];
  });
  return {
    items,
    integrity: {
      scanned: rows.length,
      accepted: items.length,
      omitted,
      sourceUnavailable,
      continuityUnavailable
    }
  };
};

module.exports = {
  VERSION,
  ROLES,
  ConceptDecisionLessonAdoptionError,
  adoptDecisionLessonEvidence,
  loadConceptDecisionLessonEvidence,
  payloadHash,
  payloadSnapshot,
  serializeAdoption,
  lessonMatchesAdoption,
  stableAdoptionId,
  stableReceiptId
};
