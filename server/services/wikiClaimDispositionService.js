const crypto = require('crypto');
const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');
const { semanticClaim } = require('./claimRevisionReviewService');
const { snapshotCanonicalContentHash, snapshotContentHash } = require('./wikiRevisionService');
const { buildClaimBodyPatch } = require('./wikiClaimBodyPatchService');
const { inkWikiPageReview } = require('./wikiReviewClock');

const ACTIONS = new Set(['accept', 'reject', 'defer', 'preserve']);
const TERMINAL_STATES = new Set(['accepted', 'rejected', 'preserved']);
const STATE_FOR_ACTION = {
  accept: 'accepted',
  reject: 'rejected',
  defer: 'deferred',
  preserve: 'preserved'
};
const PROMOTION_FOR_ACTION = {
  accept: 'promoted',
  reject: 'rejected',
  defer: 'deferred',
  preserve: 'preserved'
};
const CLAIM_PATCH_FIELDS = [
  'text', 'section', 'support', 'citationIds', 'sourceRefIds',
  'contradictedByCitationIds', 'confidence', 'epistemicStatus', 'materiality',
];

const clean = (value = '', limit = 2000) => String(value || '').trim().slice(0, limit);
const id = value => String(value?._id || value?.id || value || '').trim();
const list = value => Array.isArray(value) ? value : [];
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const clone = value => JSON.parse(JSON.stringify(value ?? null));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (left, right) => JSON.stringify(clone(left)) === JSON.stringify(clone(right));
const iso = value => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const sameIds = (left, right) => same(
  list(left).map(id).filter(Boolean).sort(),
  list(right).map(id).filter(Boolean).sort()
);
const queryInSession = (query, session) => query?.session ? query.session(session) : query;
const resolveQuery = async query => {
  const selected = query?.select ? query.select() : query;
  return selected?.then ? selected : Promise.resolve(selected);
};

class WikiClaimDispositionError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'WikiClaimDispositionError';
    this.status = status;
    this.code = code;
  }
}

const mapById = values => new Map(list(values).map(value => [id(value), value]).filter(([key]) => key));
const sourceIdsForClaim = (claim, citationsById) => {
  const sourceIds = new Set(list(claim?.sourceRefIds).map(id).filter(Boolean));
  [...list(claim?.citationIds), ...list(claim?.contradictedByCitationIds)]
    .map(id)
    .forEach(citationId => {
      const sourceRefId = id(citationsById.get(citationId)?.sourceRefId);
      if (sourceRefId) sourceIds.add(sourceRefId);
    });
  return sourceIds;
};
const changedClaimIds = (beforeClaims, afterClaims) => {
  const beforeIds = list(beforeClaims).map(claim => clean(claim?.claimId, 240));
  const afterIds = list(afterClaims).map(claim => clean(claim?.claimId, 240));
  if (beforeIds.some(value => !value) || afterIds.some(value => !value)
    || new Set(beforeIds).size !== beforeIds.length
    || new Set(afterIds).size !== afterIds.length) {
    throw new WikiClaimDispositionError('Candidate claim identities must be non-empty and unique.', 409, 'unbounded_candidate');
  }
  const before = new Map(list(beforeClaims).map(claim => [clean(claim?.claimId, 240), claim]));
  const after = new Map(list(afterClaims).map(claim => [clean(claim?.claimId, 240), claim]));
  if ([...before.keys()].some(key => !after.has(key)) || [...after.keys()].some(key => !before.has(key))) {
    throw new WikiClaimDispositionError('Candidate must retain exact claim identities.', 409, 'unbounded_candidate');
  }
  return [...before.keys()].filter(key => !same(semanticClaim(before.get(key)), semanticClaim(after.get(key))));
};

const assertUnrelatedSnapshotFieldsUnchanged = (before = {}, after = {}, { bodyPatch = false } = {}) => {
  const allowed = new Set(['claims', 'sourceRefs', 'citations']);
  if (bodyPatch) {
    allowed.add('body');
    allowed.add('plainText');
  }
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  keys.forEach(key => {
    if (allowed.has(key) || key === '_id') return;
    if (!same(before?.[key], after?.[key])) {
      throw new WikiClaimDispositionError(
        `Candidate changes unrelated page field: ${key}.`,
        409,
        'unbounded_candidate'
      );
    }
  });
};

const assertAdditiveRecords = ({ before = [], after = [], label }) => {
  const prior = mapById(before);
  const next = mapById(after);
  prior.forEach((record, recordId) => {
    if (!next.has(recordId) || !same(record, next.get(recordId))) {
      throw new WikiClaimDispositionError(
        `Candidate removes or rewrites existing ${label}.`,
        409,
        'unbounded_candidate'
      );
    }
  });
  return [...next.entries()].filter(([recordId]) => !prior.has(recordId)).map(([, record]) => record);
};

const validateBoundedClaimCandidate = ({ revision, page }) => {
  const before = plain(revision?.before) || {};
  const after = plain(revision?.after) || {};
  if (!before.claims || !after.claims) {
    throw new WikiClaimDispositionError('Candidate claim snapshots are unavailable.', 409, 'snapshot_unavailable');
  }
  const declaredBodyPatch = plain(revision?.claimReview?.bodyPatch) || null;
  const dossierRequiresBodyPatch = Boolean(
    page?.investmentDossier
    || before?.investmentDossier
    || after?.investmentDossier
    || /^company-dossier:/i.test(clean(page?.createdFrom?.label, 240))
  );
  if (dossierRequiresBodyPatch && !declaredBodyPatch) {
    throw new WikiClaimDispositionError(
      'Investment dossier claim acceptance requires an exact marked-body patch.',
      409,
      'claim_body_required'
    );
  }
  assertUnrelatedSnapshotFieldsUnchanged(before, after, { bodyPatch: Boolean(declaredBodyPatch) });
  const changed = changedClaimIds(before.claims, after.claims);
  const declaredTarget = clean(revision?.claimReview?.targetClaimId, 240);
  if (changed.length !== 1 || (declaredTarget && declaredTarget !== changed[0])) {
    throw new WikiClaimDispositionError('Candidate must change exactly one declared claim.', 409, 'unbounded_candidate');
  }
  const targetClaimId = changed[0];
  const beforeClaim = list(before.claims).find(claim => clean(claim?.claimId, 240) === targetClaimId);
  const proposedClaim = list(after.claims).find(claim => clean(claim?.claimId, 240) === targetClaimId);
  const currentClaim = list(page?.claims).find(claim => clean(claim?.claimId, 240) === targetClaimId);
  if (!currentClaim) throw new WikiClaimDispositionError('Current Wiki claim no longer exists.', 409, 'stale_claim');
  const baseClaimHash = digest(semanticClaim(beforeClaim));
  const currentClaimHash = digest(semanticClaim(currentClaim));
  if (baseClaimHash !== currentClaimHash) {
    throw new WikiClaimDispositionError('Current Wiki claim changed after this candidate was created.', 409, 'stale_claim');
  }

  let bodyPatch = null;
  if (declaredBodyPatch) {
    const declaredBasePageHash = clean(revision?.claimReview?.basePageHash, 200);
    const beforeCanonicalHash = snapshotCanonicalContentHash(before);
    const currentCanonicalHash = snapshotCanonicalContentHash(page);
    const beforeLegacyHash = snapshotContentHash(before);
    const currentLegacyHash = snapshotContentHash(page);
    const canonicalCandidate = declaredBasePageHash === beforeCanonicalHash;
    const legacyCandidate = declaredBasePageHash === beforeLegacyHash;
    if (!declaredBasePageHash
      || (!canonicalCandidate && !legacyCandidate)
      || (canonicalCandidate
        ? currentCanonicalHash !== beforeCanonicalHash
        : currentLegacyHash !== beforeLegacyHash)) {
      throw new WikiClaimDispositionError('Wiki page changed after this body patch was created.', 409, 'stale_page');
    }
    try {
      bodyPatch = buildClaimBodyPatch({
        beforeBody: before.body,
        afterBody: after.body,
        targetClaimId,
        beforeClaim,
        proposedClaim,
        afterSourceRefs: after.sourceRefs,
        afterCitations: after.citations
      });
    } catch (error) {
      throw new WikiClaimDispositionError(error.message, 409, error.code || 'claim_body_invalid');
    }
    if (!same(declaredBodyPatch, bodyPatch.manifest)
      || clean(after.plainText, 1000000) !== bodyPatch.plainText) {
      throw new WikiClaimDispositionError('Stored claim body patch does not match the candidate snapshots.', 409, 'claim_body_mismatch');
    }
  }

  const addedSourceRefs = assertAdditiveRecords({
    before: before.sourceRefs,
    after: after.sourceRefs,
    label: 'source references'
  });
  const addedCitations = assertAdditiveRecords({
    before: before.citations,
    after: after.citations,
    label: 'citations'
  });
  const allowedSourceIds = new Set([
    ...list(proposedClaim?.sourceRefIds).map(id),
    ...addedCitations.map(citation => id(citation?.sourceRefId))
  ].filter(Boolean));
  const allowedCitationIds = new Set([
    ...list(proposedClaim?.citationIds).map(id),
    ...list(proposedClaim?.contradictedByCitationIds).map(id)
  ].filter(Boolean));
  if (addedSourceRefs.some(ref => !allowedSourceIds.has(id(ref)))) {
    throw new WikiClaimDispositionError('Candidate adds a source unrelated to the target claim.', 409, 'unbounded_candidate');
  }
  if (addedCitations.some(citation => !allowedCitationIds.has(id(citation)))) {
    throw new WikiClaimDispositionError('Candidate adds a citation unrelated to the target claim.', 409, 'unbounded_candidate');
  }
  const combinedSourceRefs = mapById([...list(before.sourceRefs), ...list(after.sourceRefs)]);
  const combinedCitations = mapById([...list(before.citations), ...list(after.citations)]);
  const proposedDirectSourceIds = list(proposedClaim?.sourceRefIds).map(id).filter(Boolean);
  const proposedCitationIds = [
    ...list(proposedClaim?.citationIds),
    ...list(proposedClaim?.contradictedByCitationIds)
  ].map(id).filter(Boolean);
  if (proposedDirectSourceIds.some(sourceId => !combinedSourceRefs.has(sourceId))
    || proposedCitationIds.some(citationId => !combinedCitations.has(citationId))) {
    throw new WikiClaimDispositionError('Candidate links unresolved evidence to the target claim.', 409, 'unresolved_evidence');
  }
  if (proposedCitationIds.some(citationId => {
    const sourceRefId = id(combinedCitations.get(citationId)?.sourceRefId);
    return !sourceRefId || !combinedSourceRefs.has(sourceRefId);
  })) {
    throw new WikiClaimDispositionError('Every candidate citation must resolve to a source reference.', 409, 'unresolved_evidence');
  }
  const beforeEvidenceIds = sourceIdsForClaim(beforeClaim, combinedCitations);
  const proposedEvidenceIds = sourceIdsForClaim(proposedClaim, combinedCitations);
  const newlyLinkedSourceRefs = [...proposedEvidenceIds]
    .filter(sourceId => !beforeEvidenceIds.has(sourceId))
    .map(sourceId => combinedSourceRefs.get(sourceId))
    .filter(Boolean);
  if (newlyLinkedSourceRefs.length !== [...proposedEvidenceIds].filter(sourceId => !beforeEvidenceIds.has(sourceId)).length) {
    throw new WikiClaimDispositionError('Candidate links unresolved evidence to the target claim.', 409, 'unresolved_evidence');
  }

  return {
    targetClaimId,
    beforeClaim,
    proposedClaim,
    currentClaim,
    addedSourceRefs,
    addedCitations,
    newlyLinkedSourceRefs,
    baseClaimHash,
    proposedClaimHash: digest(semanticClaim(proposedClaim)),
    basePageHash: bodyPatch ? snapshotCanonicalContentHash(page) : snapshotContentHash(page),
    bodyPatch
  };
};

const visible = value => Boolean(
  value
  && value.archived !== true
  && value.hiddenFromHome !== true
  && value.debugOnly !== true
);

const isFreePublicExternalEvidence = (ref = {}) => {
  const provider = clean([
    ref.provider,
    ref.metadata?.source,
    ref.metadata?.provider,
    ref.metadata?.acquisitionMethod,
    ref.metadata?.provenance?.licenseOrAccess
  ].filter(Boolean).join(' '), 500).toLowerCase();
  const url = clean(ref.url, 1000);
  if (!/^https?:\/\//i.test(url) || /\b(fmp|transcript|paywall|paid)\b/i.test(provider)) return false;
  return /\b(public|sec|edgar|companyfacts|government|regulator|official|arxiv|academic|standards?)\b/i.test(provider);
};

const assertConceptContinuity = async ({ page, userId, TagMeta, session }) => {
  if (!TagMeta?.findOne) {
    throw new WikiClaimDispositionError('Concept continuity model is unavailable.', 503, 'unavailable');
  }
  const originConceptId = page?.createdFrom?.type === 'concept' ? id(page.createdFrom.objectId) : '';
  const anchored = await resolveQuery(queryInSession(TagMeta.findOne({
    userId,
    'continuityAnchor.kind': 'wiki_investigation',
    'continuityAnchor.objectType': 'wiki_page',
    'continuityAnchor.objectId': id(page)
  }), session));
  const anchoredId = visible(anchored) ? id(anchored) : '';
  if (originConceptId && anchoredId && originConceptId !== anchoredId) {
    throw new WikiClaimDispositionError('Wiki page points to conflicting Concepts.', 409, 'concept_conflict');
  }
  const conceptId = originConceptId || anchoredId;
  if (!conceptId) {
    throw new WikiClaimDispositionError('Candidate has no durable Concept continuity.', 409, 'concept_unlinked');
  }
  const concept = originConceptId
    ? await resolveQuery(queryInSession(TagMeta.findOne({ _id: originConceptId, userId }), session))
    : anchored;
  if (!visible(concept)) {
    throw new WikiClaimDispositionError('Linked Concept is unavailable.', 409, 'concept_unlinked');
  }
  return id(concept);
};

const assertOwnedVisibleEvidence = async ({
  validation,
  userId,
  WikiPage,
  Article,
  NotebookEntry,
  Question,
  TagMeta,
  WikiSourceEvent,
  page,
  revision,
  session
}) => {
  const addedSourceIds = new Set(list(validation?.addedSourceRefs).map(id));
  for (const ref of list(validation?.newlyLinkedSourceRefs)) {
    const type = clean(ref?.type, 40).toLowerCase();
    const objectId = id(ref?.objectId);
    let query = null;
    if (type === 'article') query = Article?.findOne?.({ _id: objectId, userId });
    else if (type === 'highlight') query = Article?.findOne?.({ userId, 'highlights._id': objectId });
    else if (type === 'notebook' || type === 'note') query = NotebookEntry?.findOne?.({ _id: objectId, userId });
    else if (type === 'question') query = Question?.findOne?.({ _id: objectId, userId });
    else if (type === 'concept') query = TagMeta?.findOne?.({ _id: objectId, userId });
    else if (type === 'wiki_page') query = WikiPage?.findOne?.({ _id: objectId, userId });
    else if (type === 'external' && isFreePublicExternalEvidence(ref)) {
      if (!addedSourceIds.has(id(ref))) continue;
      if (id(revision?.sourceEventId) !== objectId || !WikiSourceEvent?.findOne) {
        throw new WikiClaimDispositionError('New external evidence is not bound to the reviewed source event.', 409, 'unresolved_evidence');
      }
      const sourceEvent = await resolveQuery(queryInSession(WikiSourceEvent.findOne({
        _id: objectId,
        userId,
        status: 'processed'
      }), session));
      const affectedPageIds = list(sourceEvent?.affectedPageIds).map(id);
      if (!sourceEvent || !affectedPageIds.includes(id(page))) {
        throw new WikiClaimDispositionError('New external evidence is missing, foreign, or unaccepted.', 409, 'unresolved_evidence');
      }
      continue;
    }
    if (!objectId || !query) {
      throw new WikiClaimDispositionError('Candidate evidence type is not eligible for acceptance.', 409, 'unresolved_evidence');
    }
    const resolved = await resolveQuery(queryInSession(query, session));
    if (!visible(resolved)) {
      throw new WikiClaimDispositionError('Candidate evidence is missing, foreign, or suppressed.', 409, 'unresolved_evidence');
    }
  }
};

const evidenceDelta = validation => ({
  addedSourceRefIds: validation.addedSourceRefs.map(id),
  addedCitationIds: validation.addedCitations.map(id),
  proposedClaimHash: validation.proposedClaimHash,
  proposedText: clean(validation.proposedClaim?.text, 5000)
});

const dispositionIdentity = ({ revision, page }) => {
  const before = plain(revision?.before) || {};
  const after = plain(revision?.after) || {};
  const declared = clean(revision?.claimReview?.targetClaimId, 240);
  let inferred = '';
  try {
    const changed = changedClaimIds(before.claims, after.claims);
    if (changed.length === 1) inferred = changed[0];
  } catch (_error) {
    // A human must still be able to reject or defer a malformed candidate.
  }
  const targetClaimId = declared || inferred || `unresolved:${id(revision)}`;
  const beforeClaim = list(before.claims).find(claim => clean(claim?.claimId, 240) === targetClaimId) || null;
  const proposedClaim = list(after.claims).find(claim => clean(claim?.claimId, 240) === targetClaimId) || null;
  return {
    targetClaimId,
    beforeClaim,
    proposedClaim,
    currentClaim: list(page?.claims).find(claim => clean(claim?.claimId, 240) === targetClaimId) || null,
    addedSourceRefs: [],
    addedCitations: [],
    newlyLinkedSourceRefs: [],
    baseClaimHash: beforeClaim ? digest(semanticClaim(beforeClaim)) : '',
    proposedClaimHash: proposedClaim ? digest(semanticClaim(proposedClaim)) : digest(after),
    basePageHash: page ? snapshotContentHash(page) : ''
  };
};

const historyEvent = ({ action, claim, validation, note, now }) => ({
  at: now,
  event: `claim_disposition_${STATE_FOR_ACTION[action]}`,
  support: claim.support || 'unsupported',
  text: clean(claim.text, 5000),
  section: clean(claim.section, 500),
  citationIds: list(claim.citationIds),
  sourceRefIds: list(claim.sourceRefIds),
  contradictedByCitationIds: list(claim.contradictedByCitationIds),
  summary: action === 'accept'
    ? 'Human owner accepted the bounded claim revision.'
    : 'Human owner reviewed the candidate and preserved the current claim.',
  action: action === 'accept' ? 'revised' : 'reaffirmed',
  note,
  evidenceDelta: evidenceDelta(validation),
  confidence: claim.confidence ?? null,
  epistemicStatus: claim.epistemicStatus || null,
  disposition: STATE_FOR_ACTION[action],
  reason: note,
  actorType: 'user'
});

const appendUniqueRecords = (current, additions) => {
  const seen = new Set(list(current).map(id));
  return [...list(current), ...list(additions).filter(record => !seen.has(id(record)))];
};

const applyAcceptedClaim = ({ page, validation, note, now }) => {
  const claim = validation.currentClaim;
  CLAIM_PATCH_FIELDS.forEach(field => {
    if (validation.proposedClaim[field] !== undefined) claim[field] = clone(validation.proposedClaim[field]);
  });
  claim.lastReviewedAt = now;
  claim.history = [
    ...list(claim.history),
    historyEvent({ action: 'accept', claim, validation, note, now })
  ];
  page.sourceRefs = appendUniqueRecords(page.sourceRefs, validation.addedSourceRefs);
  page.citations = appendUniqueRecords(page.citations, validation.addedCitations);
  if (validation.bodyPatch) {
    page.body = clone(validation.bodyPatch.body);
    page.plainText = validation.bodyPatch.plainText;
  }
  if (typeof page.markModified === 'function') {
    page.markModified('claims');
    page.markModified('sourceRefs');
    page.markModified('citations');
    if (validation.bodyPatch) {
      page.markModified('body');
      page.markModified('plainText');
    }
  }
};

const applyPreservedClaim = ({ page, validation, note, now }) => {
  validation.currentClaim.lastReviewedAt = now;
  validation.currentClaim.history = [
    ...list(validation.currentClaim.history),
    historyEvent({ action: 'preserve', claim: validation.currentClaim, validation, note, now })
  ];
  // Preservation keeps the accepted claim semantics but must retain the exact evidence
  // the human reviewed; otherwise the new history event would point at missing records.
  page.sourceRefs = appendUniqueRecords(page.sourceRefs, validation.addedSourceRefs);
  page.citations = appendUniqueRecords(page.citations, validation.addedCitations);
  if (typeof page.markModified === 'function') {
    page.markModified('claims');
    page.markModified('sourceRefs');
    page.markModified('citations');
  }
};

const receiptIdFor = (revisionId, action) => `wiki-claim-disposition:v1:${revisionId}:${action}`;
const loadStoredReceipt = async ({ NoeisReceipt, userId, receiptId, session }) => (
  typeof NoeisReceipt?.findOne === 'function'
    ? resolveQuery(queryInSession(NoeisReceipt.findOne({ userId, receiptId }), session))
    : null
);

const receiptBinding = receipt => {
  const serialized = serializeStoredReceipt(receipt);
  return serialized ? {
    id: serialized.id,
    kind: serialized.kind,
    source: serialized.source,
    status: serialized.status,
    title: serialized.title,
    summary: serialized.summary,
    touched: list(serialized.touched).map(item => ({ type: clean(item?.type, 80), id: id(item?.id) })),
    provenance: clone(serialized.provenance),
    completedAt: iso(serialized.completedAt)
  } : null;
};

const retainedCandidateHash = revision => digest({
  revisionId: id(revision),
  pageId: id(revision?.pageId),
  sourceEventId: id(revision?.sourceEventId),
  maintenanceRunId: id(revision?.maintenanceRunId),
  reason: clean(revision?.reason, 120),
  actorType: clean(revision?.actorType, 40),
  sourceVersion: clone(plain(revision?.sourceVersion) || null),
  before: clone(plain(revision?.before) || null),
  after: clone(plain(revision?.after) || null),
  targetClaimId: clean(revision?.claimReview?.targetClaimId, 240),
  declaredBodyPatch: clone(plain(revision?.claimReview?.bodyPatch) || null)
});

const bodyPatchReceiptBinding = manifest => manifest ? {
  version: Number(manifest.version || 0),
  baseBodyHash: clean(manifest.baseBodyHash, 200),
  afterBodyHash: clean(manifest.afterBodyHash, 200),
  basePlainTextHash: clean(manifest.basePlainTextHash, 200),
  afterPlainTextHash: clean(manifest.afterPlainTextHash, 200),
  parentPath: clone(manifest.parentPath)
} : null;

const assertClaimDispositionReplayReceipt = ({
  storedReceipt,
  revision,
  action,
  requestedDeferredUntil = null,
  page = null
}) => {
  const receiptId = receiptIdFor(id(revision), action);
  const raw = plain(storedReceipt);
  const review = plain(revision?.claimReview) || {};
  const provenance = plain(raw?.provenance);
  let recomputedIdentity;
  try {
    recomputedIdentity = ['accept', 'preserve'].includes(action)
      ? validateBoundedClaimCandidate({ revision, page: clone(plain(revision?.before) || {}) })
      : dispositionIdentity({ revision, page: null });
  } catch (_error) {
    throw new WikiClaimDispositionError(
      'Claim disposition receipt cannot be reconstructed from a bounded retained candidate.',
      409,
      'claim_receipt_integrity_failed'
    );
  }
  const expectedState = STATE_FOR_ACTION[action];
  const expectedPromotion = PROMOTION_FOR_ACTION[action];
  const events = list(review.events);
  const event = events.at(-1) || null;
  const completedAt = iso(raw?.completedAt);
  let recomputedBodyPatch = null;
  if (['accept', 'preserve'].includes(action) && review.bodyPatch) {
    try {
      recomputedBodyPatch = buildClaimBodyPatch({
        beforeBody: revision?.before?.body,
        afterBody: revision?.after?.body,
        targetClaimId: recomputedIdentity.targetClaimId,
        beforeClaim: recomputedIdentity.beforeClaim,
        proposedClaim: recomputedIdentity.proposedClaim,
        afterSourceRefs: revision?.after?.sourceRefs,
        afterCitations: revision?.after?.citations
      }).manifest;
    } catch (_error) {
      throw new WikiClaimDispositionError(
        'Claim disposition receipt cannot be reconstructed from its retained candidate.',
        409,
        'claim_receipt_integrity_failed'
      );
    }
  }
  const expectedBodyPatch = ['accept', 'preserve'].includes(action)
    ? bodyPatchReceiptBinding(recomputedBodyPatch)
    : null;
  const expectedDeferredUntil = action === 'defer' ? iso(review.deferredUntil) : null;
  const retainedBeforeHash = snapshotContentHash(plain(revision?.before) || {});
  const touched = list(raw?.touched);
  const pageTouches = touched.filter(item => clean(item?.type, 80) === 'wiki_page').map(item => id(item?.id));
  const revisionTouches = touched.filter(item => clean(item?.type, 80) === 'wiki_revision').map(item => id(item?.id));
  const embedded = plain(review.receipt);
  const embeddedEnvelopeValid = embedded
    && clean(embedded.id || embedded.receiptId, 300) === receiptId
    && clean(embedded.kind, 100) === 'wiki_claim_disposition'
    && clean(embedded.source, 40) === 'wiki'
    && clean(embedded.status, 40) === 'completed'
    && iso(embedded.completedAt) === completedAt
    && plain(embedded.provenance);
  const promotionValid = ['accept', 'preserve'].includes(action)
    && clean(revision?.sourceVersion?.provider, 40).toLowerCase() === 'github'
    ? ['candidate', expectedPromotion].includes(clean(revision?.promotionStatus, 40))
    : clean(revision?.promotionStatus, 40) === expectedPromotion;

  const expectedTitle = `${action[0].toUpperCase()}${action.slice(1)} claim revision`;
  const expectedSummary = clean(event?.note, 2000)
    || `Human owner chose to ${action} the proposed claim revision.`;

  if (!raw
    || clean(raw.receiptId || raw.id, 300) !== receiptId
    || (raw.userId && id(raw.userId) !== id(revision?.userId))
    || clean(raw.kind, 100) !== 'wiki_claim_disposition'
    || clean(raw.source, 40) !== 'wiki'
    || clean(raw.status, 40) !== 'completed'
    || clean(raw.title, 500) !== expectedTitle
    || clean(raw.summary, 4000) !== expectedSummary
    || !completedAt
    || !provenance
    || Number(provenance.version) !== 1
    || clean(provenance.action, 40) !== action
    || id(provenance.revisionId) !== id(revision)
    || id(provenance.pageId) !== id(revision?.pageId)
    || id(provenance.sourceEventId) !== id(revision?.sourceEventId)
    || id(provenance.maintenanceRunId) !== id(revision?.maintenanceRunId)
    || clean(provenance.retainedCandidateHash, 200) !== retainedCandidateHash(revision)
    || clean(provenance.claimId, 240) !== clean(review.targetClaimId, 240)
    || clean(provenance.basePageHash, 200) !== clean(review.basePageHash, 200)
    || clean(review.basePageHash, 200) !== retainedBeforeHash
    || id(provenance.conceptId) !== id(review.conceptId)
    || clean(provenance.noteHash, 200) !== digest(clean(event?.note, 2000))
    || Number(review.version) !== 1
    || clean(review.scope, 40) !== 'claim'
    || clean(review.targetClaimId, 240) !== recomputedIdentity.targetClaimId
    || clean(provenance.baseClaimHash, 200) !== clean(review.baseClaimHash, 200)
    || clean(review.baseClaimHash, 200) !== recomputedIdentity.baseClaimHash
    || clean(provenance.proposedClaimHash, 200) !== clean(review.proposedClaimHash, 200)
    || clean(review.proposedClaimHash, 200) !== recomputedIdentity.proposedClaimHash
    || !same(clone(review.proposedClaim), clone(recomputedIdentity.proposedClaim))
    || !same(clone(review.bodyPatch) || null, recomputedBodyPatch)
    || !same(clone(provenance.bodyPatch) || null, expectedBodyPatch)
    || iso(provenance.deferredUntil) !== expectedDeferredUntil
    || (action === 'defer' && iso(requestedDeferredUntil) !== expectedDeferredUntil)
    || review.state !== expectedState
    || !promotionValid
    || clean(event?.action, 40) !== action
    || clean(event?.receiptId, 300) !== receiptId
    || iso(event?.at) !== completedAt
    || iso(review.reviewedAt) !== completedAt
    || iso(event?.deferredUntil) !== expectedDeferredUntil
    || revisionTouches.length !== 1
    || revisionTouches[0] !== id(revision)
    || (page ? (pageTouches.length !== 1 || pageTouches[0] !== id(page)) : pageTouches.length !== 0)
    || touched.length !== (page ? 2 : 1)
    || !embeddedEnvelopeValid
    || !same(receiptBinding(embedded), receiptBinding(raw))) {
    throw new WikiClaimDispositionError(
      'Claim disposition receipt is incomplete or disagrees with its reviewed revision.',
      409,
      'claim_receipt_integrity_failed'
    );
  }
  return serializeStoredReceipt(raw);
};

const repoCohortIdentity = revision => {
  const sourceVersion = plain(revision?.sourceVersion) || {};
  return {
    pageId: id(revision?.pageId),
    sourceEventId: id(revision?.sourceEventId),
    maintenanceRunId: id(revision?.maintenanceRunId),
    baseHeadSha: clean(sourceVersion.baseHeadSha, 200),
    candidateHeadSha: clean(sourceVersion.headSha, 200),
    snapshotKey: clean(sourceVersion.snapshotKey, 500),
    owner: clean(sourceVersion.owner, 200).toLowerCase(),
    repo: clean(sourceVersion.repo, 200).toLowerCase(),
    trustedHeadHash: clean(sourceVersion.trustedHeadHash, 200),
    cohortId: clean(sourceVersion.cohortId, 200),
    cohortClaimIds: list(sourceVersion.cohortClaimIds).map(value => clean(value, 240)).filter(Boolean).sort(),
    cohortClaimCount: Number(sourceVersion.cohortClaimCount || 0)
  };
};

const assertRepoClaimContinuity = async ({
  page,
  revision,
  validation,
  userId,
  WikiSourceEvent,
  session
}) => {
  if (clean(page?.pageType, 40).toLowerCase() !== 'repo') {
    throw new WikiClaimDispositionError('Repo claim policy requires a repo Wiki page.', 409, 'repo_policy_mismatch');
  }
  if (!WikiSourceEvent?.findOne || !WikiSourceEvent?.find) {
    throw new WikiClaimDispositionError('Repo evidence verification is unavailable.', 503, 'unavailable');
  }
  const cohort = repoCohortIdentity(revision);
  const sourceVersion = plain(revision?.sourceVersion) || {};
  const beforeHash = snapshotContentHash(plain(revision?.before) || {});
  const livePageHash = snapshotContentHash(page);
  const declaredBaseHash = clean(revision?.claimReview?.basePageHash, 200);
  const trustedHeadHash = clean(sourceVersion.trustedHeadHash, 200);
  if (clean(sourceVersion.provider, 40).toLowerCase() !== 'github'
    || !cohort.sourceEventId
    || !cohort.maintenanceRunId
    || !cohort.baseHeadSha
    || !cohort.candidateHeadSha
    || !cohort.snapshotKey
    || !cohort.owner
    || !cohort.repo
    || !cohort.trustedHeadHash
    || !cohort.cohortId
    || !cohort.cohortClaimCount
    || cohort.cohortClaimCount > 23
    || cohort.cohortClaimIds.length !== cohort.cohortClaimCount
    || new Set(cohort.cohortClaimIds).size !== cohort.cohortClaimCount
    || !cohort.cohortClaimIds.includes(clean(revision?.claimReview?.targetClaimId, 240))
    || !declaredBaseHash
    || beforeHash !== declaredBaseHash
    || beforeHash !== trustedHeadHash) {
    throw new WikiClaimDispositionError(
      'Repo candidate is missing its exact trusted-head provenance. Rebuild it before review.',
      409,
      'repo_provenance_incomplete'
    );
  }
  if (livePageHash !== trustedHeadHash) {
    throw new WikiClaimDispositionError(
      'The trusted Wiki page changed after this repository cohort was created. Rebuild it before review.',
      409,
      'stale_repo_page'
    );
  }
  const watch = plain(page?.externalWatches?.githubRepo) || {};
  if (clean(watch.owner, 200).toLowerCase() !== cohort.owner
    || clean(watch.repo, 200).toLowerCase() !== cohort.repo
    || clean(watch.publishedHeadSha, 200) !== cohort.baseHeadSha) {
    throw new WikiClaimDispositionError(
      'The trusted repository head changed after this claim candidate was created.',
      409,
      'stale_repo_head'
    );
  }
  const observedHeadSha = clean(watch.lastHeadSha, 200);
  if (observedHeadSha && observedHeadSha !== cohort.candidateHeadSha) {
    throw new WikiClaimDispositionError(
      'A newer repository head arrived before this cohort was accepted. Rebuild from the newest head.',
      409,
      'newer_repo_head'
    );
  }
  const sourceEvent = await resolveQuery(queryInSession(WikiSourceEvent.findOne({
    _id: cohort.sourceEventId,
    userId
  }), session));
  const sourceMeta = plain(sourceEvent?.metadata) || {};
  const affected = list(sourceEvent?.affectedPageIds).map(id);
  if (!sourceEvent
    || clean(sourceEvent.provider, 80).toLowerCase() !== 'github-repo-snapshot'
    || clean(sourceEvent.status, 40).toLowerCase() !== 'processed'
    || (!affected.includes(id(page)) && id(sourceMeta.pageId) !== id(page))
    || clean(sourceMeta.commitSha, 200) !== cohort.candidateHeadSha
    || clean(sourceMeta.snapshotKey, 500) !== cohort.snapshotKey
    || clean(sourceMeta.owner, 200).toLowerCase() !== cohort.owner
    || clean(sourceMeta.repo, 200).toLowerCase() !== cohort.repo) {
    throw new WikiClaimDispositionError(
      'The repo maintenance event does not match this page and candidate head.',
      409,
      'repo_event_mismatch'
    );
  }
  const allowedDocumentIds = new Set(list(sourceMeta.documentEventIds).map(id).filter(Boolean));
  const refs = validation.newlyLinkedSourceRefs;
  if (!refs.length || refs.some(ref => (
    clean(ref?.type, 40).toLowerCase() !== 'external'
    || clean(ref?.provider, 80).toLowerCase() !== 'github-repo'
    || !allowedDocumentIds.has(id(ref?.objectId))
  ))) {
    throw new WikiClaimDispositionError(
      'Every newly linked repo source must belong to the exact reviewed snapshot.',
      409,
      'repo_evidence_unresolved'
    );
  }
  const documentIds = Array.from(new Set(refs.map(ref => id(ref.objectId))));
  const documentEvents = await resolveQuery(queryInSession(WikiSourceEvent.find({
    _id: { $in: documentIds },
    userId
  }), session));
  const byId = new Map(list(documentEvents).map(event => [id(event), event]));
  const documentsValid = documentIds.every(documentId => {
    const event = byId.get(documentId);
    const metadata = plain(event?.metadata) || {};
    const eventAffected = list(event?.affectedPageIds).map(id);
    return event
      && clean(event.provider, 80).toLowerCase() === 'github-repo'
      && (eventAffected.includes(id(page)) || id(metadata.pageId) === id(page))
      && clean(metadata.commitSha, 200) === cohort.candidateHeadSha
      && clean(metadata.snapshotKey, 500) === cohort.snapshotKey
      && clean(metadata.owner, 200).toLowerCase() === cohort.owner
      && clean(metadata.repo, 200).toLowerCase() === cohort.repo;
  });
  if (!documentsValid || byId.size !== documentIds.length) {
    throw new WikiClaimDispositionError(
      'Repo candidate evidence is missing, foreign, or from another snapshot.',
      409,
      'repo_evidence_unresolved'
    );
  }
  return { cohort, sourceEvent };
};

const repoCohortReceiptId = cohort => (
  `repo-wiki-claim-cohort:v1:${cohort.pageId}:${cohort.cohortId}`
);
const canonicalCohortMembers = siblings => list(siblings)
  .map(row => {
    const state = clean(row?.claimReview?.state, 40);
    const action = state === 'accepted' ? 'accept' : state === 'preserved' ? 'preserve' : '';
    return {
      claimId: clean(row?.claimReview?.targetClaimId, 240),
      revisionId: id(row),
      action,
      dispositionReceiptId: action ? receiptIdFor(id(row), action) : '',
      baseClaimHash: clean(row?.claimReview?.baseClaimHash, 200),
      proposedClaimHash: clean(row?.claimReview?.proposedClaimHash, 200)
    };
  })
  .sort((left, right) => (
    left.claimId.localeCompare(right.claimId) || left.revisionId.localeCompare(right.revisionId)
  ));

const assertRepoCohortReplayReceipt = async ({
  storedReceipt,
  page,
  siblings,
  cohort,
  sourceEvent,
  userId,
  NoeisReceipt,
  session
}) => {
  const expectedReceiptId = repoCohortReceiptId(cohort);
  const raw = plain(storedReceipt);
  const provenance = plain(raw?.provenance);
  const completedAt = iso(raw?.completedAt);
  const revisionIds = siblings.map(id);
  const claimIds = siblings.map(row => clean(row?.claimReview?.targetClaimId, 240)).filter(Boolean).sort();
  const members = canonicalCohortMembers(siblings);
  const touched = list(raw?.touched);
  const touchedPageIds = touched.filter(item => clean(item?.type, 80) === 'wiki_page').map(item => id(item?.id));
  const touchedRevisionIds = touched.filter(item => clean(item?.type, 80) === 'wiki_revision').map(item => id(item?.id));
  const expectedTouchedRevisionIds = list(provenance?.revisionIds).map(id).filter(Boolean);
  const watch = plain(page?.externalWatches?.githubRepo) || {};
  const freshness = plain(page?.freshness) || {};
  const acceptedThrough = plain(freshness.acceptedThrough) || {};
  const sourceMeta = plain(sourceEvent?.metadata) || {};
  const affectedPageIds = list(sourceEvent?.affectedPageIds).map(id);
  const siblingContractsMatch = siblings.every(row => {
    const identity = repoCohortIdentity(row);
    const state = clean(row?.claimReview?.state, 40);
    return id(row?.userId) === id(userId)
      && same(identity, cohort)
      && snapshotContentHash(plain(row?.before) || {}) === cohort.trustedHeadHash
      && ['accepted', 'preserved'].includes(state)
      && clean(row?.promotionStatus, 40) === (state === 'accepted' ? 'promoted' : 'preserved');
  });

  if (!raw
    || clean(raw.receiptId || raw.id, 300) !== expectedReceiptId
    || (raw.userId && id(raw.userId) !== id(userId))
    || clean(raw.kind, 100) !== 'repo_wiki_claim_cohort_accepted'
    || clean(raw.source, 40) !== 'wiki'
    || clean(raw.status, 40) !== 'completed'
    || !completedAt
    || !provenance
    || Number(provenance.version) !== 1
    || id(provenance.pageId) !== cohort.pageId
    || id(provenance.sourceEventId) !== cohort.sourceEventId
    || id(provenance.maintenanceRunId) !== cohort.maintenanceRunId
    || clean(provenance.baseHeadSha, 200) !== cohort.baseHeadSha
    || clean(provenance.candidateHeadSha, 200) !== cohort.candidateHeadSha
    || clean(provenance.snapshotKey, 500) !== cohort.snapshotKey
    || clean(provenance.owner, 200).toLowerCase() !== cohort.owner
    || clean(provenance.repo, 200).toLowerCase() !== cohort.repo
    || clean(provenance.trustedHeadHash, 200) !== cohort.trustedHeadHash
    || !same(list(provenance.revisionIds).map(id), revisionIds)
    || !same(list(provenance.claimIds).map(id), claimIds)
    || !same(provenance.members, members)
    || clean(provenance.assembledPageHash, 200) !== snapshotContentHash(page)
    || touchedPageIds.length !== 1
    || touchedPageIds[0] !== cohort.pageId
    || !sameIds(touchedRevisionIds, expectedTouchedRevisionIds)
    || touched.length !== 1 + expectedTouchedRevisionIds.length
    || !siblingContractsMatch
    || id(page?.userId) !== id(userId)
    || clean(watch.owner, 200).toLowerCase() !== cohort.owner
    || clean(watch.repo, 200).toLowerCase() !== cohort.repo
    || (clean(watch.lastHeadSha, 200) && clean(watch.lastHeadSha, 200) !== cohort.candidateHeadSha)
    || clean(watch.publishedHeadSha, 200) !== cohort.candidateHeadSha
    || clean(watch.candidateHeadSha, 200) !== ''
    || clean(watch.buildStatus, 40) !== 'ready'
    || iso(watch.lastPublishedAt) !== completedAt
    || clean(page?.aiState?.candidateStatus, 80) !== 'accepted'
    || clean(freshness.status, 40) !== 'fresh'
    || iso(freshness.lastMaintainedAt) !== completedAt
    || id(acceptedThrough.sourceEventId) !== cohort.sourceEventId
    || clean(acceptedThrough.provider, 120) !== clean(sourceEvent?.provider, 120)
    || clean(acceptedThrough.externalId, 500) !== clean(sourceEvent?.externalId, 500)
    || clean(acceptedThrough.title, 500) !== clean(sourceEvent?.title, 500)
    || clean(acceptedThrough.url, 1000) !== clean(sourceEvent?.url, 1000)
    || iso(acceptedThrough.sourceUpdatedAt) !== iso(sourceEvent?.sourceUpdatedAt || sourceEvent?.createdAt || raw.completedAt)
    || iso(acceptedThrough.acceptedAt) !== completedAt
    || list(freshness.pendingSourceEventIds).length !== 0
    || !sourceEvent
    || id(sourceEvent) !== cohort.sourceEventId
    || id(sourceEvent.userId) !== id(userId)
    || clean(sourceEvent.provider, 80).toLowerCase() !== 'github-repo-snapshot'
    || clean(sourceEvent.status, 40).toLowerCase() !== 'processed'
    || (!affectedPageIds.includes(cohort.pageId) && id(sourceMeta.pageId) !== cohort.pageId)
    || clean(sourceMeta.commitSha, 200) !== cohort.candidateHeadSha
    || clean(sourceMeta.snapshotKey, 500) !== cohort.snapshotKey
    || clean(sourceMeta.owner, 200).toLowerCase() !== cohort.owner
    || clean(sourceMeta.repo, 200).toLowerCase() !== cohort.repo) {
    throw new WikiClaimDispositionError(
      'Repository cohort receipt is incomplete or disagrees with the settled trusted head.',
      409,
      'repo_cohort_receipt_integrity_failed'
    );
  }

  for (const sibling of siblings) {
    const state = clean(sibling?.claimReview?.state, 40);
    const action = state === 'accepted' ? 'accept' : 'preserve';
    const storedDisposition = await loadStoredReceipt({
      NoeisReceipt,
      userId,
      receiptId: receiptIdFor(id(sibling), action),
      session
    });
    assertClaimDispositionReplayReceipt({
      storedReceipt: storedDisposition,
      revision: sibling,
      action,
      page
    });
  }
  return serializeStoredReceipt(raw);
};

const settleRepoClaimCohort = async ({
  page,
  revision,
  sourceEvent,
  userId,
  WikiRevision,
  NoeisReceipt,
  session,
  now
}) => {
  const cohort = repoCohortIdentity(revision);
  if (cohort.cohortClaimCount < 1 || cohort.cohortClaimCount > 23) {
    throw new WikiClaimDispositionError(
      'Repo claim cohort exceeds the receipt-bound review limit.',
      409,
      'repo_cohort_incomplete'
    );
  }
  let query = WikiRevision.find({
    userId,
    pageId: revision.pageId,
    reason: 'agent_candidate',
    sourceEventId: revision.sourceEventId,
    maintenanceRunId: revision.maintenanceRunId,
    'sourceVersion.provider': 'github',
    'sourceVersion.baseHeadSha': cohort.baseHeadSha,
    'sourceVersion.headSha': cohort.candidateHeadSha,
    'sourceVersion.snapshotKey': cohort.snapshotKey,
    'sourceVersion.owner': cohort.owner,
    'sourceVersion.repo': cohort.repo,
    'sourceVersion.cohortId': cohort.cohortId
  });
  const siblings = list(await resolveQuery(queryInSession(query, session))).sort((left, right) => {
    const leftClaim = clean(left?.claimReview?.targetClaimId, 240);
    const rightClaim = clean(right?.claimReview?.targetClaimId, 240);
    return leftClaim.localeCompare(rightClaim) || id(left).localeCompare(id(right));
  });
  const siblingClaimIds = siblings.map(row => clean(row?.claimReview?.targetClaimId, 240)).filter(Boolean).sort();
  if (siblings.length !== cohort.cohortClaimCount
    || siblingClaimIds.length !== cohort.cohortClaimCount
    || new Set(siblingClaimIds).size !== cohort.cohortClaimCount
    || !same(siblingClaimIds, cohort.cohortClaimIds)) {
    throw new WikiClaimDispositionError(
      'Repo claim cohort is incomplete or duplicated. Rebuild it before publication.',
      409,
      'repo_cohort_incomplete'
    );
  }
  if (siblings.some(row => (
    !same(repoCohortIdentity(row), cohort)
    || snapshotContentHash(plain(row?.before) || {}) !== cohort.trustedHeadHash
  ))) {
    throw new WikiClaimDispositionError(
      'Repo claim cohort members disagree on their trusted base.',
      409,
      'repo_provenance_incomplete'
    );
  }
  const storedCohortReceipt = await loadStoredReceipt({
    NoeisReceipt,
    userId,
    receiptId: repoCohortReceiptId(cohort),
    session
  });
  if (storedCohortReceipt) {
    const receipt = await assertRepoCohortReplayReceipt({
      storedReceipt: storedCohortReceipt,
      page,
      siblings,
      cohort,
      sourceEvent,
      userId,
      NoeisReceipt,
      session
    });
    return {
      finalized: true,
      blocked: '',
      idempotent: true,
      receipt
    };
  }
  const replayWatch = plain(page?.externalWatches?.githubRepo) || {};
  const appearsSettled = clean(replayWatch.publishedHeadSha, 200) === cohort.candidateHeadSha
    || clean(page?.aiState?.candidateStatus, 80) === 'accepted'
    || id(page?.freshness?.acceptedThrough?.sourceEventId) === cohort.sourceEventId;
  if (appearsSettled) {
    throw new WikiClaimDispositionError(
      'Settled repository cohort is missing its durable receipt.',
      409,
      'repo_cohort_receipt_integrity_failed'
    );
  }
  const states = siblings.map(row => clean(row?.claimReview?.state, 40) || 'pending');
  const allAcceptedOrPreserved = states.every(state => state === 'accepted' || state === 'preserved');
  const anyRejected = states.some(state => state === 'rejected');
  const everyTerminalHasReceipt = siblings.every(row => {
    const state = clean(row?.claimReview?.state, 40);
    return !['accepted', 'preserved'].includes(state) || Boolean(row?.claimReview?.receipt?.id);
  });
  const watch = plain(page?.externalWatches?.githubRepo) || {};
  const observedHead = clean(watch.lastHeadSha, 200);
  const newerHeadQueued = Boolean(observedHead && observedHead !== cohort.candidateHeadSha);
  page.externalWatches = plain(page.externalWatches) || {};
  page.aiState = { ...(plain(page.aiState) || {}) };
  page.freshness = { ...(plain(page.freshness) || {}) };
  if (anyRejected) {
    page.externalWatches.githubRepo = {
      ...watch,
      buildStatus: newerHeadQueued ? 'queued' : 'needs_review',
      candidateHeadSha: newerHeadQueued ? observedHead : cohort.candidateHeadSha,
      lastBuildError: newerHeadQueued
        ? ''
        : 'A claim candidate was rejected. Rebuild this repository head before publication.'
    };
    page.aiState.candidateStatus = 'maintenance_rejected';
    page.freshness.status = 'needs_review';
    page.markModified?.('externalWatches');
    page.markModified?.('aiState');
    page.markModified?.('freshness');
    await page.save({ session });
    return { finalized: false, blocked: 'rejected', receipt: null };
  }
  if (!allAcceptedOrPreserved || !everyTerminalHasReceipt) {
    page.externalWatches.githubRepo = {
      ...watch,
      buildStatus: newerHeadQueued ? 'queued' : 'needs_review',
      candidateHeadSha: newerHeadQueued ? observedHead : cohort.candidateHeadSha
    };
    page.aiState.candidateStatus = 'awaiting_claim_acceptance';
    page.freshness.status = 'needs_review';
    page.markModified?.('externalWatches');
    page.markModified?.('aiState');
    page.markModified?.('freshness');
    await page.save({ session });
    return { finalized: false, blocked: 'pending', receipt: null };
  }
  for (const sibling of siblings) {
    const state = clean(sibling?.claimReview?.state, 40);
    const action = state === 'accepted' ? 'accept' : 'preserve';
    const storedDisposition = await loadStoredReceipt({
      NoeisReceipt,
      userId,
      receiptId: receiptIdFor(id(sibling), action),
      session
    });
    assertClaimDispositionReplayReceipt({
      storedReceipt: storedDisposition,
      revision: sibling,
      action,
      page
    });
  }
  // No claim mutation reaches the trusted page until the complete manifest is terminal.
  for (const sibling of siblings) {
    const state = clean(sibling?.claimReview?.state, 40);
    const validation = validateBoundedClaimCandidate({ revision: sibling, page });
    const event = list(sibling?.claimReview?.events).at(-1) || {};
    const note = clean(event.note, 2000);
    const reviewedAt = event.at ? new Date(event.at) : now;
    if (state === 'accepted') applyAcceptedClaim({ page, validation, note, now: reviewedAt });
    if (state === 'preserved') applyPreservedClaim({ page, validation, note, now: reviewedAt });
    sibling.promotionStatus = state === 'accepted' ? 'promoted' : 'preserved';
    await sibling.save({ session });
  }
  const completedAt = now;
  page.externalWatches.githubRepo = {
    ...watch,
    publishedHeadSha: cohort.candidateHeadSha,
    candidateHeadSha: '',
    publishedGeneratorVersion: clean(revision?.sourceVersion?.generatorVersion, 200)
      || clean(watch.candidateGeneratorVersion, 200),
    candidateGeneratorVersion: '',
    lastPublishedAt: completedAt,
    buildStatus: 'ready',
    lastBuildError: ''
  };
  page.aiState.candidateStatus = 'accepted';
  page.freshness = {
    ...page.freshness,
    status: 'fresh',
    lastMaintainedAt: completedAt,
    pendingSourceEventIds: [],
    acceptedThrough: {
      sourceEventId: id(sourceEvent),
      provider: clean(sourceEvent?.provider, 120),
      externalId: clean(sourceEvent?.externalId, 500),
      title: clean(sourceEvent?.title, 500),
      url: clean(sourceEvent?.url, 1000),
      sourceUpdatedAt: sourceEvent?.sourceUpdatedAt || sourceEvent?.createdAt || completedAt,
      acceptedAt: completedAt
    }
  };
  inkWikiPageReview(page, completedAt);
  page.markModified?.('externalWatches');
  page.markModified?.('aiState');
  page.markModified?.('freshness');
  await page.save({ session });
  const receipt = await persistNoeisReceipt({
    NoeisReceipt,
    userId,
    session,
    receipt: {
      id: repoCohortReceiptId(cohort),
      kind: 'repo_wiki_claim_cohort_accepted',
      source: 'wiki',
      sourceLabel: page.title || `${cohort.owner}/${cohort.repo}`,
      status: 'completed',
      title: 'Accepted the reviewed repository head',
      summary: `${siblings.length} claim disposition${siblings.length === 1 ? '' : 's'} settled the repository head.`,
      touched: [
        { type: 'wiki_page', id: id(page), title: page.title || 'Repo Wiki' },
        ...siblings.map(row => ({ type: 'wiki_revision', id: id(row), title: row.summary || 'Repo claim revision' }))
      ],
      provenance: {
        version: 1,
        pageId: cohort.pageId,
        sourceEventId: cohort.sourceEventId,
        maintenanceRunId: cohort.maintenanceRunId,
        baseHeadSha: cohort.baseHeadSha,
        candidateHeadSha: cohort.candidateHeadSha,
        snapshotKey: cohort.snapshotKey,
        owner: cohort.owner,
        repo: cohort.repo,
        trustedHeadHash: cohort.trustedHeadHash,
        revisionIds: siblings.map(id),
        claimIds: siblingClaimIds,
        members: canonicalCohortMembers(siblings),
        assembledPageHash: snapshotContentHash(page)
      },
      completedAt
    }
  });
  if (!receipt) throw new WikiClaimDispositionError('Repo cohort receipt could not be persisted.', 500, 'receipt_failed');
  return { finalized: true, blocked: '', receipt };
};

const disposeWikiClaimCandidate = async ({
  userId,
  revisionId,
  action,
  note = '',
  deferredUntil = null,
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  TagMeta,
  Article,
  NotebookEntry,
  Question,
  WikiSourceEvent,
  now = () => new Date()
} = {}) => {
  const safeAction = clean(action, 40).toLowerCase();
  const safeRevisionId = id(revisionId);
  const safeNote = clean(note, 2000);
  if (!userId || !safeRevisionId || !ACTIONS.has(safeAction)) {
    throw new WikiClaimDispositionError('userId, revisionId, and a supported action are required.');
  }
  if (!WikiPage || !WikiRevision || !NoeisReceipt) {
    throw new WikiClaimDispositionError('Disposition persistence models are unavailable.', 503, 'unavailable');
  }
  if (typeof WikiPage?.db?.startSession !== 'function') {
    throw new WikiClaimDispositionError('Claim disposition requires MongoDB transaction support.', 503, 'transactions_required');
  }
  const deferredDate = deferredUntil ? new Date(deferredUntil) : null;
  if (deferredUntil && Number.isNaN(deferredDate.getTime())) {
    throw new WikiClaimDispositionError('deferredUntil must be a valid date.');
  }
  if (safeAction === 'defer' && !deferredDate) {
    throw new WikiClaimDispositionError('deferredUntil is required when deferring a candidate.');
  }

  const session = await WikiPage.db.startSession();
  let outcome = null;
  try {
    await session.withTransaction(async () => {
      const revision = await resolveQuery(queryInSession(WikiRevision.findOne({
        _id: safeRevisionId,
        userId
      }), session));
      if (!revision) throw new WikiClaimDispositionError('Wiki revision not found.', 404, 'not_found');

      const previousState = clean(revision?.claimReview?.state, 40)
        || (revision.promotionStatus === 'candidate' ? 'pending' : clean(revision.promotionStatus, 40));
      const nextState = STATE_FOR_ACTION[safeAction];
      const receiptId = receiptIdFor(safeRevisionId, safeAction);
      if (previousState === nextState) {
        const stored = await loadStoredReceipt({ NoeisReceipt, userId, receiptId, session });
        const replayPage = await resolveQuery(queryInSession(WikiPage.findOne({
          _id: revision.pageId,
          userId,
          status: { $ne: 'archived' }
        }), session));
        const receipt = assertClaimDispositionReplayReceipt({
          storedReceipt: stored,
          revision,
          action: safeAction,
          requestedDeferredUntil: deferredDate,
          page: replayPage
        });
        let cohort = null;
        if (clean(revision?.sourceVersion?.provider, 40).toLowerCase() === 'github') {
          const sourceEvent = await resolveQuery(queryInSession(WikiSourceEvent?.findOne?.({
            _id: revision.sourceEventId,
            userId
          }), session));
          if (!replayPage || !sourceEvent) {
            throw new WikiClaimDispositionError(
              'Repository cohort replay is missing its page or source event.',
              409,
              'repo_cohort_receipt_integrity_failed'
            );
          }
          cohort = await settleRepoClaimCohort({
            page: replayPage,
            revision,
            sourceEvent,
            userId,
            WikiRevision,
            NoeisReceipt,
            session,
            now: now()
          });
        }
        outcome = {
          idempotent: true,
          state: nextState,
          revision,
          page: replayPage,
          receipt,
          cohort
        };
        return;
      }
      if (TERMINAL_STATES.has(previousState)) {
        throw new WikiClaimDispositionError(
          `Candidate was already ${previousState}.`,
          409,
          'already_disposed'
        );
      }
      if (previousState !== 'pending' && previousState !== 'deferred') {
        throw new WikiClaimDispositionError('Candidate is not reviewable.', 409, 'not_reviewable');
      }

      const page = await resolveQuery(queryInSession(WikiPage.findOne({
        _id: revision.pageId,
        userId,
        status: { $ne: 'archived' }
      }), session));
      const actedAt = now();
      if (safeAction === 'defer' && deferredDate <= actedAt) {
        throw new WikiClaimDispositionError('deferredUntil must be in the future.');
      }
      const mutatesAcceptedKnowledge = safeAction === 'accept' || safeAction === 'preserve';
      if (mutatesAcceptedKnowledge && !page) {
        throw new WikiClaimDispositionError('Wiki page not found.', 404, 'not_found');
      }
      const validation = mutatesAcceptedKnowledge
        ? validateBoundedClaimCandidate({ revision, page })
        : dispositionIdentity({ revision, page });
      let conceptId = id(revision?.claimReview?.conceptId);
      let repoContext = null;
      if (mutatesAcceptedKnowledge) {
        if (clean(page?.pageType, 40).toLowerCase() === 'repo') {
          repoContext = await assertRepoClaimContinuity({
            page,
            revision,
            validation,
            userId,
            WikiSourceEvent,
            session
          });
          conceptId = '';
        } else {
          conceptId = await assertConceptContinuity({ page, userId, TagMeta, session });
          await assertOwnedVisibleEvidence({
            validation,
            userId,
            WikiPage,
            Article,
            NotebookEntry,
            Question,
            TagMeta,
            WikiSourceEvent,
            page,
            revision,
            session
          });
        }
      } else if (!conceptId && page?.createdFrom?.type === 'concept') {
        conceptId = id(page.createdFrom.objectId);
      }

      const repoPage = clean(page?.pageType, 40).toLowerCase() === 'repo';
      if (!repoPage && safeAction === 'accept') {
        applyAcceptedClaim({ page, validation, note: safeNote, now: actedAt });
      }
      if (!repoPage && safeAction === 'preserve') {
        applyPreservedClaim({ page, validation, note: safeNote, now: actedAt });
      }
      if (!repoPage && (safeAction === 'accept' || safeAction === 'preserve')) {
        page.aiState = {
          ...(plain(page.aiState) || {}),
          candidateStatus: 'accepted'
        };
        page.freshness = {
          ...(plain(page.freshness) || {}),
          status: 'fresh',
          lastMaintainedAt: actedAt
        };
        inkWikiPageReview(page, actedAt);
        page.markModified?.('aiState');
        page.markModified?.('freshness');
        await page.save({ session });
      }
      if (!repoPage && safeAction === 'reject' && page) {
        page.aiState = {
          ...(plain(page.aiState) || {}),
          candidateStatus: 'maintenance_rejected'
        };
        page.freshness = {
          ...(plain(page.freshness) || {}),
          status: 'needs_review'
        };
        page.markModified?.('aiState');
        page.markModified?.('freshness');
        await page.save({ session });
      }

      const event = {
        action: safeAction,
        at: actedAt,
        note: safeNote,
        deferredUntil: safeAction === 'defer' ? deferredDate : null,
        receiptId
      };
      revision.promotionStatus = repoPage && ['accept', 'preserve'].includes(safeAction)
        ? 'candidate'
        : PROMOTION_FOR_ACTION[safeAction];
      revision.claimReview = {
        ...(plain(revision.claimReview) || {}),
        version: 1,
        scope: 'claim',
        targetClaimId: validation.targetClaimId,
        conceptId: conceptId || null,
        state: nextState,
        basePageHash: snapshotContentHash(plain(revision?.before) || {}),
        baseClaimHash: clean(revision?.claimReview?.baseClaimHash, 200) || validation.baseClaimHash,
        proposedClaimHash: validation.proposedClaimHash,
        proposedClaim: clone(validation.proposedClaim),
        events: [...list(revision?.claimReview?.events), event],
        reviewedAt: actedAt,
        deferredUntil: safeAction === 'defer' ? deferredDate : null
      };
      if (typeof revision.markModified === 'function') revision.markModified('claimReview');
      await revision.save({ session });

      const receipt = await persistNoeisReceipt({
        NoeisReceipt,
        userId,
        session,
        receipt: {
          id: receiptId,
          kind: 'wiki_claim_disposition',
          source: 'wiki',
          sourceLabel: page?.title || 'Wiki claim',
          status: 'completed',
          title: `${safeAction[0].toUpperCase()}${safeAction.slice(1)} claim revision`,
          summary: safeNote || `Human owner chose to ${safeAction} the proposed claim revision.`,
          touched: [
            ...(page ? [{ type: 'wiki_page', id: id(page), title: page.title || 'Wiki page' }] : []),
            { type: 'wiki_revision', id: safeRevisionId, title: revision.summary || 'Claim revision' }
          ],
          provenance: {
            version: 1,
            action: safeAction,
            revisionId: safeRevisionId,
            pageId: id(page) || id(revision.pageId),
            sourceEventId: id(revision.sourceEventId) || null,
            maintenanceRunId: id(revision.maintenanceRunId) || null,
            retainedCandidateHash: retainedCandidateHash(revision),
            claimId: validation.targetClaimId,
            basePageHash: revision.claimReview.basePageHash,
            conceptId: revision.claimReview.conceptId,
            noteHash: digest(safeNote),
            baseClaimHash: validation.baseClaimHash,
            proposedClaimHash: validation.proposedClaimHash,
            bodyPatch: validation.bodyPatch ? {
              version: validation.bodyPatch.manifest.version,
              baseBodyHash: validation.bodyPatch.manifest.baseBodyHash,
              afterBodyHash: validation.bodyPatch.manifest.afterBodyHash,
              basePlainTextHash: validation.bodyPatch.manifest.basePlainTextHash,
              afterPlainTextHash: validation.bodyPatch.manifest.afterPlainTextHash,
              parentPath: validation.bodyPatch.manifest.parentPath
            } : null,
            deferredUntil: safeAction === 'defer' && deferredDate ? deferredDate.toISOString() : null
          },
          completedAt: actedAt
        }
      });
      if (!receipt) throw new WikiClaimDispositionError('Disposition receipt could not be persisted.', 500, 'receipt_failed');
      revision.claimReview.receipt = receipt;
      revision.markModified?.('claimReview');
      await revision.save({ session });
      if (repoPage && !repoContext && revision?.sourceEventId) {
        const sourceEvent = await resolveQuery(queryInSession(WikiSourceEvent?.findOne?.({
          _id: revision.sourceEventId,
          userId
        }), session));
        repoContext = { cohort: repoCohortIdentity(revision), sourceEvent };
      }
      const cohort = repoPage && repoContext?.sourceEvent
        ? await settleRepoClaimCohort({
          page,
          revision,
          sourceEvent: repoContext.sourceEvent,
          userId,
          WikiRevision,
          NoeisReceipt,
          session,
          now: actedAt
        })
        : null;
      outcome = { idempotent: false, state: nextState, revision, page, receipt, cohort };
    });
    if (!outcome) throw new WikiClaimDispositionError('Disposition transaction completed without an outcome.', 500);
    return outcome;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  ACTIONS,
  WikiClaimDispositionError,
  disposeWikiClaimCandidate,
  receiptIdFor,
  assertClaimDispositionReplayReceipt,
  validateBoundedClaimCandidate,
  assertConceptContinuity,
  assertOwnedVisibleEvidence,
  assertRepoClaimContinuity,
  repoCohortIdentity,
  repoCohortReceiptId,
  settleRepoClaimCohort,
  __testables: {
    assertClaimDispositionReplayReceipt,
    assertRepoCohortReplayReceipt,
    applyAcceptedClaim,
    applyPreservedClaim,
    canonicalCohortMembers,
    changedClaimIds,
    digest,
    evidenceDelta,
    retainedCandidateHash
  }
};
