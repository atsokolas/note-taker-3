const {
  repoCohortIdentity,
  validateBoundedClaimCandidate
} = require('./wikiClaimDispositionService');
const { semanticClaim, diffSegments } = require('./claimRevisionReviewService');
const { snapshotContentHash } = require('./wikiRevisionService');

const clean = (value = '', limit = 2000) => String(value || '').trim().slice(0, limit);
const id = value => String(value?._id || value?.id || value || '').trim();
const list = value => Array.isArray(value) ? value : [];
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const resolveQuery = async query => query?.then ? query : Promise.resolve(query);

class WikiRepoClaimReviewError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'WikiRepoClaimReviewError';
    this.status = status;
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new WikiRepoClaimReviewError(message, 409, code);
};

const exactManifest = revision => {
  const identity = repoCohortIdentity(revision);
  return {
    id: identity.cohortId,
    sourceEventId: identity.sourceEventId,
    maintenanceRunId: identity.maintenanceRunId,
    baseHeadSha: identity.baseHeadSha,
    candidateHeadSha: identity.candidateHeadSha,
    snapshotKey: identity.snapshotKey,
    owner: identity.owner,
    repo: identity.repo,
    expectedClaimIds: identity.cohortClaimIds,
    expectedCount: identity.cohortClaimCount,
    trustedHeadHash: clean(revision?.sourceVersion?.trustedHeadHash, 200)
  };
};

const manifestKey = revision => JSON.stringify(exactManifest(revision));

const assertCompleteManifest = manifest => {
  if (!manifest.id
    || !manifest.sourceEventId
    || !manifest.maintenanceRunId
    || !manifest.baseHeadSha
    || !manifest.candidateHeadSha
    || !manifest.snapshotKey
    || !manifest.owner
    || !manifest.repo
    || !manifest.trustedHeadHash
    || manifest.expectedCount < 1
    || manifest.expectedClaimIds.length !== manifest.expectedCount
    || new Set(manifest.expectedClaimIds).size !== manifest.expectedCount) {
    fail('Repository claim cohort is missing its immutable manifest.', 'repo_cohort_incomplete');
  }
};

const sourceSummary = (ref, sourceEvent) => ({
  sourceRefId: id(ref),
  eventId: id(sourceEvent),
  type: clean(sourceEvent?.sourceType, 40) || 'external',
  provider: clean(sourceEvent?.provider, 80),
  title: clean(sourceEvent?.title, 500),
  url: clean(sourceEvent?.url, 1000),
  path: clean(sourceEvent?.metadata?.path, 1000),
  ref: clean(sourceEvent?.metadata?.ref, 1000),
  docClass: clean(sourceEvent?.metadata?.docClass, 80)
});

const qualitySummary = quality => ({
  status: clean(quality?.status, 40) || (quality?.ok === false ? 'fail' : quality?.ok === true ? 'pass' : 'unknown'),
  ok: quality?.ok === true ? true : quality?.ok === false ? false : null,
  score: Number.isFinite(Number(quality?.score)) ? Number(quality.score) : null,
  reasons: list(quality?.reasons).map(value => clean(value, 500)).filter(Boolean).slice(0, 20)
});

const evidenceRoles = ({ revision, validation, evidenceEvents }) => {
  const citations = new Map(
    [...list(revision?.before?.citations), ...list(revision?.after?.citations)]
      .map(citation => [id(citation), citation])
      .filter(([citationId]) => citationId)
  );
  const contradictingSourceIds = new Set(
    list(validation?.proposedClaim?.contradictedByCitationIds)
      .map(citationId => id(citations.get(id(citationId))?.sourceRefId))
      .filter(Boolean)
  );
  const added = validation.newlyLinkedSourceRefs.map(ref => (
    sourceSummary(ref, evidenceEvents.get(id(ref?.objectId)))
  ));
  return {
    added,
    supporting: added.filter(source => !contradictingSourceIds.has(source.sourceRefId)),
    contradicting: added.filter(source => contradictingSourceIds.has(source.sourceRefId)),
    addedCitationCount: validation.addedCitations.length
  };
};

const verifyEvidenceEvents = async ({
  page,
  manifest,
  validations,
  userId,
  WikiSourceEvent
}) => {
  if (!WikiSourceEvent?.findOne || !WikiSourceEvent?.find) {
    throw new WikiRepoClaimReviewError('Repository evidence verification is unavailable.', 503, 'unavailable');
  }
  const snapshot = await resolveQuery(WikiSourceEvent.findOne({
    _id: manifest.sourceEventId,
    userId
  }));
  const metadata = plain(snapshot?.metadata) || {};
  const affected = list(snapshot?.affectedPageIds).map(id);
  if (!snapshot
    || clean(snapshot.provider, 80).toLowerCase() !== 'github-repo-snapshot'
    || clean(snapshot.status, 40).toLowerCase() !== 'processed'
    || (!affected.includes(id(page)) && id(metadata.pageId) !== id(page))
    || clean(metadata.commitSha, 200) !== manifest.candidateHeadSha
    || clean(metadata.snapshotKey, 500) !== manifest.snapshotKey
    || clean(metadata.owner, 200).toLowerCase() !== manifest.owner
    || clean(metadata.repo, 200).toLowerCase() !== manifest.repo) {
    fail('Repository claim cohort does not resolve to its exact processed snapshot.', 'repo_event_mismatch');
  }
  const allowedDocumentIds = new Set(list(metadata.documentEventIds).map(id).filter(Boolean));
  const refs = validations.flatMap(validation => validation.newlyLinkedSourceRefs);
  if (!refs.length || refs.some(ref => (
    clean(ref?.type, 40).toLowerCase() !== 'external'
    || clean(ref?.provider, 80).toLowerCase() !== 'github-repo'
    || !allowedDocumentIds.has(id(ref?.objectId))
  ))) {
    fail('Repository claim evidence is not bounded to the reviewed snapshot.', 'repo_evidence_unresolved');
  }
  const documentIds = Array.from(new Set(refs.map(ref => id(ref.objectId))));
  const documents = list(await resolveQuery(WikiSourceEvent.find({
    _id: { $in: documentIds },
    userId
  })));
  const byId = new Map(documents.map(document => [id(document), document]));
  const documentsValid = documentIds.every(documentId => {
    const document = byId.get(documentId);
    const docMeta = plain(document?.metadata) || {};
    const docAffected = list(document?.affectedPageIds).map(id);
    return document
      && clean(document.provider, 80).toLowerCase() === 'github-repo'
      && (docAffected.includes(id(page)) || id(docMeta.pageId) === id(page))
      && clean(docMeta.commitSha, 200) === manifest.candidateHeadSha
      && clean(docMeta.snapshotKey, 500) === manifest.snapshotKey
      && clean(docMeta.owner, 200).toLowerCase() === manifest.owner
      && clean(docMeta.repo, 200).toLowerCase() === manifest.repo;
  });
  if (!documentsValid || byId.size !== documentIds.length) {
    fail('Repository claim evidence is missing, foreign, or from another snapshot.', 'repo_evidence_unresolved');
  }
  return byId;
};

const serializeCandidate = ({ revision, validation, publishable, evidenceEvents }) => {
  const state = clean(revision?.claimReview?.state, 40) || 'pending';
  const current = semanticClaim(validation.beforeClaim);
  const proposed = semanticClaim(validation.proposedClaim);
  const reviewable = state === 'pending' || state === 'deferred';
  return {
    revisionId: id(revision),
    claimId: validation.targetClaimId,
    state,
    createdAt: revision?.createdAt || null,
    reviewedAt: revision?.claimReview?.reviewedAt || null,
    deferredUntil: revision?.claimReview?.deferredUntil || null,
    summary: clean(revision?.summary, 1000),
    current,
    proposed,
    diff: {
      segments: diffSegments(current?.text, proposed?.text),
      changedFields: ['text', 'section', 'support', 'confidence', 'epistemicStatus', 'materiality']
        .filter(field => !same(current?.[field], proposed?.[field])),
      boundedExplanation: `Changed one bounded claim; ${validation.addedSourceRefs.length} source reference${validation.addedSourceRefs.length === 1 ? '' : 's'} and ${validation.addedCitations.length} citation${validation.addedCitations.length === 1 ? '' : 's'} added.`
    },
    evidenceDelta: evidenceRoles({ revision, validation, evidenceEvents }),
    quality: qualitySummary(revision?.quality),
    allowedDispositions: !reviewable
      ? []
      : publishable
        ? ['accept', 'preserve', 'reject', 'defer']
        : ['reject', 'defer'],
    receipt: revision?.claimReview?.receipt ? {
      id: clean(revision.claimReview.receipt.id, 500),
      kind: clean(revision.claimReview.receipt.kind, 100),
      completedAt: revision.claimReview.receipt.completedAt || null
    } : null
  };
};

const loadRepoClaimReviewQueue = async ({
  userId,
  pageId,
  WikiPage,
  WikiRevision,
  WikiSourceEvent
} = {}) => {
  if (!userId || !pageId) throw new WikiRepoClaimReviewError('userId and pageId are required.');
  if (!WikiPage?.findOne || !WikiRevision?.find) {
    throw new WikiRepoClaimReviewError('Repo claim review models are unavailable.', 503, 'unavailable');
  }
  const page = await resolveQuery(WikiPage.findOne({
    _id: pageId,
    userId,
    status: { $ne: 'archived' },
    pageType: 'repo'
  }));
  if (!page) throw new WikiRepoClaimReviewError('Wiki page not found.', 404, 'not_found');

  let query = WikiRevision.find({
    userId,
    pageId,
    reason: 'agent_candidate',
    'sourceVersion.provider': 'github',
    'claimReview.scope': 'claim',
    promotionStatus: { $in: ['candidate', 'deferred'] }
  });
  if (query?.sort) query = query.sort({ createdAt: -1 });
  if (query?.limit) query = query.limit(100);
  const revisions = list(await resolveQuery(query));
  if (!revisions.length) {
    throw new WikiRepoClaimReviewError('No repository claim cohort is awaiting review.', 404, 'no_repo_claim_cohort');
  }
  const groups = new Map();
  revisions.forEach(revision => {
    const key = manifestKey(revision);
    groups.set(key, [...(groups.get(key) || []), revision]);
  });
  if (groups.size !== 1) {
    fail('Multiple or divergent repository claim cohorts require regeneration.', 'ambiguous_repo_claim_cohort');
  }
  const rows = [...groups.values()][0];
  const manifest = exactManifest(rows[0]);
  assertCompleteManifest(manifest);
  const actualClaimIds = rows.map(row => clean(row?.claimReview?.targetClaimId, 240)).filter(Boolean).sort();
  if (rows.length !== manifest.expectedCount
    || actualClaimIds.length !== manifest.expectedCount
    || new Set(actualClaimIds).size !== manifest.expectedCount
    || !same(actualClaimIds, manifest.expectedClaimIds)) {
    fail('Repository claim cohort is incomplete or duplicated.', 'repo_cohort_incomplete');
  }
  const validations = [];
  for (const revision of rows) {
    try {
      validations.push(validateBoundedClaimCandidate({ revision, page }));
    } catch (error) {
      fail(clean(error?.message, 1000) || 'Repository claim candidate is not bounded.', clean(error?.code, 100) || 'unbounded_candidate');
    }
  }
  const states = rows.map(row => clean(row?.claimReview?.state, 40) || 'pending');
  if (rows.some((row, index) => (
    ['accepted', 'preserved'].includes(states[index]) && !clean(row?.claimReview?.receipt?.id, 500)
  ))) {
    fail('A staged repository claim disposition is missing its receipt.', 'incomplete_disposition');
  }
  const evidenceEvents = await verifyEvidenceEvents({ page, manifest, validations, userId, WikiSourceEvent });

  const watch = plain(page?.externalWatches?.githubRepo) || {};
  const reasons = [];
  if (clean(watch.owner, 200).toLowerCase() !== manifest.owner
    || clean(watch.repo, 200).toLowerCase() !== manifest.repo) {
    reasons.push('repository_identity_changed');
  }
  if (clean(watch.publishedHeadSha, 200) !== manifest.baseHeadSha) reasons.push('published_head_changed');
  if (clean(watch.lastHeadSha, 200) && clean(watch.lastHeadSha, 200) !== manifest.candidateHeadSha) {
    reasons.push('newer_head_observed');
  }
  if (clean(watch.candidateHeadSha, 200) !== manifest.candidateHeadSha) {
    reasons.push('candidate_head_changed');
  }
  if (snapshotContentHash(page) !== manifest.trustedHeadHash) reasons.push('trusted_page_changed');
  const publishable = reasons.length === 0;
  const candidates = rows
    .slice()
    .sort((left, right) => manifest.expectedClaimIds.indexOf(clean(left?.claimReview?.targetClaimId, 240))
      - manifest.expectedClaimIds.indexOf(clean(right?.claimReview?.targetClaimId, 240)))
    .map((revision, index) => serializeCandidate({
      revision,
      validation: validations[rows.indexOf(revision)],
      publishable,
      evidenceEvents
    }));
  const progress = states.reduce((counts, state) => ({
    ...counts,
    [state]: (counts[state] || 0) + 1
  }), { total: rows.length, pending: 0, deferred: 0, accepted: 0, preserved: 0, rejected: 0 });
  return {
    version: 1,
    page: {
      id: id(page),
      title: clean(page?.title, 500),
      repository: {
        owner: clean(watch.owner, 200),
        repo: clean(watch.repo, 200),
        fullName: [clean(watch.owner, 200), clean(watch.repo, 200)].filter(Boolean).join('/')
      }
    },
    cohort: {
      id: manifest.id,
      sourceEventId: manifest.sourceEventId,
      maintenanceRunId: manifest.maintenanceRunId,
      baseHeadSha: manifest.baseHeadSha,
      candidateHeadSha: manifest.candidateHeadSha,
      snapshotKey: manifest.snapshotKey,
      expectedClaimIds: manifest.expectedClaimIds,
      expectedCount: manifest.expectedCount,
      integrity: { ok: true, code: '' },
      publishability: {
        ok: publishable,
        code: reasons[0] || '',
        reasons,
        newerHeadQueued: reasons.includes('newer_head_observed')
      },
      progress
    },
    candidates,
    humanActionRequired: true
  };
};

module.exports = {
  WikiRepoClaimReviewError,
  loadRepoClaimReviewQueue,
  __testables: {
    exactManifest,
    manifestKey,
    assertCompleteManifest,
    serializeCandidate,
    sourceSummary,
    evidenceRoles,
    verifyEvidenceEvents
  }
};
