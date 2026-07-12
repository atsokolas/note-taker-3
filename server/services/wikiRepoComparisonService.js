const { compareClaimLedgers } = require('./wikiClaimComparisonService');

const PUBLIC_COMPARISON_DETAIL_LIMIT = 12;
const PUBLIC_COMPARISON_REF_LIMIT = 40;

const clean = (value = '', limit = 800) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const id = (value) => clean(value?._id || value?.id || value, 160);

const repoWatch = (page = {}) => page.externalWatches?.githubRepo || {};
const isRepoPage = (page = {}) => Boolean(clean(repoWatch(page).owner) && clean(repoWatch(page).repo));

const safeRepoRef = (source = {}) => {
  const metadata = source.metadata || {};
  const path = clean(metadata.path, 500);
  const commitSha = clean(metadata.commitSha, 80);
  const blobSha = clean(metadata.blobSha, 80);
  const url = clean(source.url, 1000);
  if (!path && !metadata.tagName) return null;
  if (url && !/^https:\/\/github\.com\//i.test(url)) return null;
  return {
    sourceRefId: id(source),
    title: clean(source.title, 240),
    path,
    evidenceType: clean(metadata.evidenceType, 80),
    blobSha,
    commitSha,
    tagName: clean(metadata.tagName, 120),
    url
  };
};

const safeClaim = (claim = {}) => ({
  claimId: clean(claim.claimId || claim._id, 180),
  text: clean(claim.text),
  section: clean(claim.section, 180),
  support: clean(claim.support, 40),
  sourceRefIds: (Array.isArray(claim.sourceRefIds) ? claim.sourceRefIds : []).map(String).filter(Boolean),
  citationIds: (Array.isArray(claim.citationIds) ? claim.citationIds : []).map(String).filter(Boolean),
  contradictedByCitationIds: (Array.isArray(claim.contradictedByCitationIds) ? claim.contradictedByCitationIds : []).map(String).filter(Boolean)
});

const captureRepoBaseline = async ({ WikiRepoBaseline, WikiRevision, page, userId, publicEligible = false, now = new Date() } = {}) => {
  if (!WikiRepoBaseline || !page || !userId || !isRepoPage(page)) {
    const error = new Error('Repository baseline capture requires an owned GitHub repo wiki page.');
    error.code = 'REPO_BASELINE_INVALID_PAGE';
    throw error;
  }
  const watch = repoWatch(page);
  const headSha = clean(watch.publishedHeadSha, 80);
  if (!headSha) {
    const error = new Error('Repository baseline capture requires a successfully published repository head.');
    error.code = 'REPO_BASELINE_NO_PUBLISHED_HEAD';
    throw error;
  }
  const existing = await WikiRepoBaseline.findOne({ userId, pageId: page._id });
  if (existing) return { baseline: existing, created: false };
  const revision = WikiRevision
    ? await WikiRevision.findOne({ userId, pageId: page._id, promotionStatus: 'promoted' }).sort({ createdAt: -1 })
    : null;
  const baseline = new WikiRepoBaseline({
    userId,
    pageId: page._id,
    owner: clean(watch.owner, 120).toLowerCase(),
    repo: clean(watch.repo, 120).toLowerCase(),
    defaultBranch: clean(watch.defaultBranch, 120),
    headSha,
    releaseTag: clean(watch.lastReleaseTag, 120),
    revisionId: revision?._id || null,
    generatorVersion: clean(watch.publishedGeneratorVersion, 120),
    claims: (Array.isArray(page.claims) ? page.claims : []).map(safeClaim),
    sourceRefs: (Array.isArray(page.sourceRefs) ? page.sourceRefs : []).map(safeRepoRef).filter(Boolean),
    publicEligible: Boolean(publicEligible),
    capturedAt: now
  });
  await baseline.save();
  return { baseline, created: true };
};

const compareRepoRefs = (baselineRefs = [], currentRefs = []) => {
  const baselineByPath = new Map(baselineRefs.filter(ref => ref.path).map(ref => [ref.path, ref]));
  const currentByPath = new Map(currentRefs.filter(ref => ref.path).map(ref => [ref.path, ref]));
  const added = [];
  const changed = [];
  const removed = [];
  currentByPath.forEach((current, path) => {
    const before = baselineByPath.get(path);
    if (!before) added.push({ path, current });
    else if (before.blobSha && current.blobSha && before.blobSha !== current.blobSha) changed.push({ path, baseline: before, current });
  });
  baselineByPath.forEach((before, path) => {
    if (!currentByPath.has(path)) removed.push({ path, baseline: before });
  });
  return { added, changed, removed };
};

const collectRejectedDeltas = (runs = []) => (
  (Array.isArray(runs) ? runs : []).flatMap(run => (
    (Array.isArray(run?.metadata?.comparisons) ? run.metadata.comparisons : [])
      .filter(comparison => comparison.outcome === 'rejected')
      .map(comparison => ({
        runId: id(run),
        at: run.completedAt || run.updatedAt || run.createdAt || null,
        pageId: clean(comparison.pageId, 160),
        counts: comparison.counts || {},
        deltas: comparison.deltas || {}
      }))
  ))
);

const buildStaticWikiErrors = ({ claimComparison, changedRefs, baselineRefs }) => {
  const changedPaths = new Set([
    ...changedRefs.changed.map(row => row.path),
    ...changedRefs.removed.map(row => row.path)
  ].filter(Boolean));
  const refsByPath = new Map(baselineRefs.map(ref => [ref.path, ref]));
  return [
    ...claimComparison.deltas.changed.map(row => row.before),
    ...claimComparison.deltas.removed.map(row => row.before)
  ].map((claim) => {
    const refs = claim.sourceRefIds.map(path => refsByPath.get(path)).filter(ref => ref && changedPaths.has(ref.path));
    if (!refs.length) return null;
    return {
      claimId: claim.claimId,
      staleClaim: claim.text,
      reason: 'A repository source supporting this baseline claim changed or disappeared.',
      refs
    };
  }).filter(Boolean);
};

const claimsWithStableRepoRefs = (claims = [], refs = []) => {
  const pathById = new Map(refs.map(ref => [ref.sourceRefId, ref.path]).filter(([, path]) => path));
  return (Array.isArray(claims) ? claims : []).map((claim) => {
    const plain = claim && typeof claim.toObject === 'function' ? claim.toObject() : claim || {};
    return {
      ...plain,
      sourceRefIds: (Array.isArray(plain.sourceRefIds) ? plain.sourceRefIds : []).map(sourceId => pathById.get(String(sourceId)) || String(sourceId))
    };
  });
};

const buildRepoComparison = ({ baseline, page, maintenanceRuns = [] } = {}) => {
  if (!baseline || !page || !isRepoPage(page)) return null;
  const currentRefs = (Array.isArray(page.sourceRefs) ? page.sourceRefs : []).map(safeRepoRef).filter(Boolean);
  const baselineRefs = Array.isArray(baseline.sourceRefs) ? baseline.sourceRefs : [];
  const repositoryChanges = compareRepoRefs(baselineRefs, currentRefs);
  const claimComparison = compareClaimLedgers({
    beforeClaims: claimsWithStableRepoRefs(baseline.claims || [], baselineRefs),
    afterClaims: claimsWithStableRepoRefs(page.claims || [], currentRefs),
    outcome: 'accepted'
  });
  const watch = repoWatch(page);
  return {
    version: 1,
    repository: {
      owner: clean(watch.owner, 120),
      repo: clean(watch.repo, 120),
      defaultBranch: clean(watch.defaultBranch, 120),
      url: `https://github.com/${encodeURIComponent(clean(watch.owner, 120))}/${encodeURIComponent(clean(watch.repo, 120))}`
    },
    baseline: {
      headSha: clean(baseline.headSha, 80),
      releaseTag: clean(baseline.releaseTag, 120),
      generatorVersion: clean(baseline.generatorVersion, 120),
      capturedAt: baseline.capturedAt || baseline.createdAt || null
    },
    current: {
      observedHeadSha: clean(watch.lastHeadSha, 80),
      publishedHeadSha: clean(watch.publishedHeadSha, 80),
      releaseTag: clean(watch.lastReleaseTag, 120),
      generatorVersion: clean(watch.publishedGeneratorVersion, 120),
      publishedAt: watch.lastPublishedAt || null,
      buildStatus: clean(watch.buildStatus, 40)
    },
    repositoryChanges,
    claimComparison,
    rejectedCandidates: collectRejectedDeltas(maintenanceRuns),
    staticWikiErrors: buildStaticWikiErrors({ claimComparison, changedRefs: repositoryChanges, baselineRefs }),
    supportingRefs: currentRefs
  };
};

const buildProofPulse = (comparison = {}) => {
  const published = clean(comparison.current?.publishedHeadSha, 80);
  const observed = clean(comparison.current?.observedHeadSha, 80);
  const counts = comparison.claimComparison?.counts || {};
  const changedFiles = Number(comparison.repositoryChanges?.changed?.length || 0)
    + Number(comparison.repositoryChanges?.added?.length || 0)
    + Number(comparison.repositoryChanges?.removed?.length || 0);
  const staticErrors = Number(comparison.staticWikiErrors?.length || 0);
  const rejected = (comparison.rejectedCandidates || []).reduce((sum, candidate) => sum + Number(candidate.counts?.changed || 0), 0);
  let state = 'current';
  let headline = `${Number(counts.preserved || 0)} claims held steady through ${published ? published.slice(0, 7) : 'the published repository version'}.`;
  if (comparison.current?.buildStatus === 'needs_review') {
    state = 'held_for_review';
    headline = `Noeis refused to replace the trusted ${published ? published.slice(0, 7) : 'published'} version with a weaker candidate.`;
  } else if (observed && published && observed !== published) {
    state = 'repository_ahead';
    headline = `The repository moved to ${observed.slice(0, 7)}; Noeis is still showing the trusted ${published.slice(0, 7)} version.`;
  } else if (Number(counts.changed || 0) + Number(counts.added || 0) + Number(counts.removed || 0) > 0) {
    state = 'maintained';
    headline = `Noeis updated ${Number(counts.changed || 0) + Number(counts.added || 0) + Number(counts.removed || 0)} claims and preserved ${Number(counts.preserved || 0)} through ${published.slice(0, 7)}.`;
  }
  return {
    state,
    headline,
    facts: [
      `${changedFiles} repository paths changed since baseline`,
      `${Number(counts.gainedSupport || 0)} claims gained support`,
      `${Number(counts.contradicted || 0)} claims became contradicted`,
      `${Number(counts.preserved || 0)} claims were reviewed and preserved`,
      `${staticErrors} generate-once claims are now demonstrably stale`,
      `${rejected} candidate claim changes were rejected or held for review`
    ],
    observedVersion: observed,
    publishedVersion: published
  };
};

const serializePublicRepoRef = (ref = {}) => ({
  title: clean(ref.title, 240),
  path: clean(ref.path, 500),
  evidenceType: clean(ref.evidenceType, 80),
  blobSha: clean(ref.blobSha, 80),
  commitSha: clean(ref.commitSha, 80),
  tagName: clean(ref.tagName, 120),
  url: /^https:\/\/github\.com\//i.test(clean(ref.url, 1000)) ? clean(ref.url, 1000) : ''
});

const serializePublicClaim = (claim = {}) => ({
  text: clean(claim.text),
  section: clean(claim.section, 180),
  support: clean(claim.support, 40)
});

const serializePublicClaimRow = (row = {}) => ({
  ...(row.before ? { before: serializePublicClaim(row.before) } : {}),
  ...(row.after ? { after: serializePublicClaim(row.after) } : {})
});

const serializePublicRepositoryChanges = (changes = {}) => Object.fromEntries(
  ['added', 'changed', 'removed'].map(group => [group, (changes[group] || []).slice(0, PUBLIC_COMPARISON_DETAIL_LIMIT).map(row => ({
    path: clean(row.path || row.current?.path || row.baseline?.path, 500),
    ...(row.baseline ? { baseline: serializePublicRepoRef(row.baseline) } : {}),
    ...(row.current ? { current: serializePublicRepoRef(row.current) } : {})
  }))])
);

const serializePublicClaimComparison = (claimComparison = {}) => ({
  counts: Object.fromEntries(['added', 'changed', 'gainedSupport', 'contradicted', 'preserved', 'removed']
    .map(key => [key, Number(claimComparison.counts?.[key] || 0)])),
  deltas: Object.fromEntries(['added', 'changed', 'gainedSupport', 'contradicted', 'preserved', 'removed']
    .map(key => [key, (claimComparison.deltas?.[key] || []).slice(0, PUBLIC_COMPARISON_DETAIL_LIMIT).map(serializePublicClaimRow)])),
  detailsTruncated: Object.fromEntries(['added', 'changed', 'gainedSupport', 'contradicted', 'preserved', 'removed']
    .map(key => [key, Math.max(0, Number(claimComparison.counts?.[key] || 0) - PUBLIC_COMPARISON_DETAIL_LIMIT)]))
});

const serializePublicRepoComparison = (comparison = null) => {
  if (!comparison) return null;
  return {
    version: comparison.version,
    repository: comparison.repository,
    baseline: comparison.baseline,
    current: comparison.current,
    repositoryChanges: serializePublicRepositoryChanges(comparison.repositoryChanges),
    repositoryChangesTruncated: Object.fromEntries(['added', 'changed', 'removed']
      .map(key => [key, Math.max(0, (comparison.repositoryChanges?.[key] || []).length - PUBLIC_COMPARISON_DETAIL_LIMIT)])),
    claimComparison: serializePublicClaimComparison(comparison.claimComparison),
    rejectedCandidates: (comparison.rejectedCandidates || []).map(candidate => ({
      at: candidate.at,
      counts: candidate.counts
    })),
    staticWikiErrors: (comparison.staticWikiErrors || []).map(error => ({
      staleClaim: clean(error.staleClaim),
      reason: clean(error.reason),
      refs: (error.refs || []).map(serializePublicRepoRef)
    })),
    supportingRefs: (comparison.supportingRefs || []).slice(0, PUBLIC_COMPARISON_REF_LIMIT).map(serializePublicRepoRef),
    supportingRefsTruncated: Math.max(0, (comparison.supportingRefs || []).length - PUBLIC_COMPARISON_REF_LIMIT),
    proofPulse: buildProofPulse(comparison)
  };
};

module.exports = {
  buildRepoComparison,
  buildProofPulse,
  captureRepoBaseline,
  collectRejectedDeltas,
  compareRepoRefs,
  safeRepoRef,
  serializePublicRepoComparison
};
