const { buildProofPulse } = require('./wikiRepoComparisonService');

const clean = (value = '', limit = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const id = value => clean(value?._id || value?.id || value, 180);
const sameId = (left, right) => Boolean(id(left) && id(left) === id(right));
const asPlain = value => (value && typeof value.toObject === 'function' ? value.toObject({ virtuals: false }) : value || {});

const repoIdentity = (page = {}) => {
  const watch = page.externalWatches?.githubRepo || {};
  const owner = clean(watch.owner, 120).toLowerCase();
  const repo = clean(watch.repo, 120).toLowerCase();
  return owner && repo ? `${owner}/${repo}` : '';
};

const acceptedRunComparison = ({ maintenanceRun = {}, pageId = '', sourceEventId = '' } = {}) => (
  (Array.isArray(maintenanceRun?.metadata?.comparisons) ? maintenanceRun.metadata.comparisons : [])
    .find(row => (
      Number(row?.version || maintenanceRun?.metadata?.comparisonVersion || 0) >= 2
      && row?.outcome === 'accepted'
      && (!row?.pageId || sameId(row.pageId, pageId))
      && (!row?.sourceEventId || sameId(row.sourceEventId, sourceEventId))
    )) || null
);

const buildRepoPublicProofAcceptance = ({
  page = {},
  baseline = null,
  comparison = null,
  sourceEvent = null,
  revision = null,
  maintenanceRun = null,
  liveHeadSha = '',
  reason = '',
  now = new Date()
} = {}) => {
  const pageId = id(page);
  const sourceEventId = id(sourceEvent);
  const revisionId = id(revision);
  const maintenanceRunId = id(maintenanceRun);
  const watch = page.externalWatches?.githubRepo || {};
  const identity = repoIdentity(page);
  const baselineHeadSha = clean(comparison?.baseline?.headSha || baseline?.headSha, 80);
  const observedHeadSha = clean(comparison?.current?.observedHeadSha, 80);
  const publishedHeadSha = clean(comparison?.current?.publishedHeadSha, 80);
  const verifiedLiveHeadSha = clean(liveHeadSha, 80);
  const candidateHeadSha = clean(comparison?.current?.candidateHeadSha, 80);
  const proofPulse = comparison ? buildProofPulse(comparison) : null;
  const acceptedComparison = acceptedRunComparison({ maintenanceRun, pageId, sourceEventId });
  const acceptedReason = clean(reason, 1000);
  const errors = [];

  if (!pageId || !identity) errors.push('The target must be an owned GitHub repository wiki page.');
  if (acceptedReason.length < 40) errors.push('An editorial acceptance reason of at least 40 characters is required.');
  if (!baseline || !sameId(baseline.pageId, pageId) || baseline.publicEligible !== true) {
    errors.push('The page requires an immutable public-eligible repository baseline.');
  }
  const baselineIdentity = baseline
    ? `${clean(baseline.owner, 120).toLowerCase()}/${clean(baseline.repo, 120).toLowerCase()}`
    : '';
  if (identity && baselineIdentity !== identity) errors.push('The repository baseline identity does not match the page watch.');
  if (!comparison || Number(comparison.version || 0) < 2) errors.push('A version 2 repository comparison is required.');
  if (!baselineHeadSha || baselineHeadSha !== clean(baseline?.headSha, 80)) errors.push('The comparison baseline does not match the immutable baseline record.');
  if (!observedHeadSha || !publishedHeadSha || observedHeadSha !== publishedHeadSha) {
    errors.push('Observed and published repository heads must agree before acceptance.');
  }
  if (!verifiedLiveHeadSha) {
    errors.push('The live GitHub repository head could not be verified.');
  } else if (verifiedLiveHeadSha !== publishedHeadSha) {
    errors.push('The live GitHub repository head has advanced beyond the accepted published head.');
  }
  if (candidateHeadSha && candidateHeadSha !== publishedHeadSha) errors.push('A different repository candidate is still pending review.');
  if (clean(comparison?.current?.buildStatus, 40) !== 'ready') errors.push('The repository comparison must be in the ready state.');
  if (publishedHeadSha && publishedHeadSha === baselineHeadSha) errors.push('The accepted repository head must advance beyond the baseline.');
  if (clean(watch.publishedHeadSha, 80) !== publishedHeadSha || clean(watch.lastHeadSha, 80) !== observedHeadSha) {
    errors.push('The page watch no longer matches the comparison heads.');
  }
  if (!proofPulse?.acceptance?.eligible
    || Number(proofPulse?.acceptance?.sourceBackedClaimChanges || 0) < 1
    || Number(proofPulse?.acceptance?.preservedClaims || 0) < 1) {
    errors.push('The comparison must contain a source-backed claim rewrite and at least one preserved peer claim.');
  }
  if (Number(proofPulse?.acceptance?.blockingEditorialRisks || 0) > 0) {
    errors.push('Every material claim rewrite must clear the structured editorial review before public-proof acceptance.');
  }
  if (!sourceEvent || sourceEvent.status !== 'processed'
    || clean(sourceEvent.provider, 80) !== 'github-repo-snapshot'
    || !Array.isArray(sourceEvent.affectedPageIds)
    || !sourceEvent.affectedPageIds.some(value => sameId(value, pageId))
    || !sameId(sourceEvent.metadata?.pageId, pageId)
    || clean(sourceEvent.metadata?.commitSha, 80) !== publishedHeadSha
    || !sameId(page.freshness?.acceptedThrough?.sourceEventId, sourceEventId)) {
    errors.push('The accepted GitHub snapshot event must be processed, page-specific, and pinned to the published head.');
  }
  if (!revision || !sameId(revision.pageId, pageId) || !sameId(revision.sourceEventId, sourceEventId)
    || revision.promotionStatus !== 'promoted' || !['source_event', 'agent_maintenance'].includes(revision.reason)) {
    errors.push('The accepted snapshot requires a promoted maintenance revision for this page and event.');
  }
  if (!maintenanceRun || maintenanceRun.status !== 'completed'
    || !sameId(maintenanceRun.pageId, pageId) || !sameId(maintenanceRun.sourceEventId, sourceEventId)
    || !acceptedComparison) {
    errors.push('The accepted snapshot requires a completed version 2 maintenance run with an accepted comparison.');
  }
  if (errors.length) return { ok: false, errors, record: null, proofPulse };

  const counts = comparison.claimComparison?.counts || {};
  const acceptanceSnapshot = {
    kind: 'repo_comparison_v2',
    repository: identity,
    baselineHeadSha,
    observedHeadSha,
    publishedHeadSha,
    comparisonVersion: Number(comparison.version || 2),
    sourceEventId,
    revisionId,
    maintenanceRunId,
    counts: {
      added: Number(counts.added || 0),
      changed: Number(counts.changed || 0),
      evidenceRefreshed: Number(counts.evidenceRefreshed || 0),
      gainedSupport: Number(counts.gainedSupport || 0),
      contradicted: Number(counts.contradicted || 0),
      preserved: Number(counts.preserved || 0),
      removed: Number(counts.removed || 0),
      sourceBackedClaimChanges: Number(proofPulse.acceptance.sourceBackedClaimChanges || 0),
      blockingEditorialRisks: Number(proofPulse.acceptance.blockingEditorialRisks || 0)
    },
    acceptedAt: now
  };
  return {
    ok: true,
    errors: [],
    proofPulse,
    record: {
      grade: 'proven',
      reason: acceptedReason,
      acceptedAt: now,
      acceptedEventId: `repo-comparison:${baselineHeadSha}:${publishedHeadSha}:${sourceEventId}`,
      acceptedClocks: [{ type: 'github', sourceEventId, revisionId, acceptedAt: now }],
      acceptanceSnapshot
    }
  };
};

const serializeRepoAcceptancePreview = (record = {}, proofPulse = {}) => ({
  grade: clean(record.grade, 40),
  reason: clean(record.reason, 1000),
  acceptedAt: record.acceptedAt || null,
  repository: clean(record.acceptanceSnapshot?.repository, 260),
  baselineHeadSha: clean(record.acceptanceSnapshot?.baselineHeadSha, 80),
  publishedHeadSha: clean(record.acceptanceSnapshot?.publishedHeadSha, 80),
  comparisonVersion: Number(record.acceptanceSnapshot?.comparisonVersion || 0),
  counts: record.acceptanceSnapshot?.counts || {},
  acceptance: proofPulse?.acceptance || null
});

module.exports = {
  acceptedRunComparison,
  buildRepoPublicProofAcceptance,
  repoIdentity,
  serializeRepoAcceptancePreview
};
