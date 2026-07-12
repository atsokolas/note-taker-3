const crypto = require('crypto');

const DEFAULT_REPO_BUILD_LEASE_MS = 10 * 60 * 1000;

const acquireRepoBuildLease = async ({
  WikiPage,
  pageId,
  userId,
  headSha,
  generatorVersion = '',
  now = new Date(),
  leaseMs = DEFAULT_REPO_BUILD_LEASE_MS,
  token = crypto.randomUUID()
} = {}) => {
  if (!WikiPage?.findOneAndUpdate || !pageId || !userId || !headSha) {
    return { acquired: false, page: null, token: '', reason: 'missing_lease_identity' };
  }
  const expiresAt = new Date(now.getTime() + Math.max(60 * 1000, Number(leaseMs) || DEFAULT_REPO_BUILD_LEASE_MS));
  const page = await WikiPage.findOneAndUpdate(
    {
      _id: pageId,
      userId,
      status: { $ne: 'archived' },
      $or: [
        { 'externalWatches.githubRepo.buildLease.token': '' },
        { 'externalWatches.githubRepo.buildLease.token': null },
        { 'externalWatches.githubRepo.buildLease.token': { $exists: false } },
        { 'externalWatches.githubRepo.buildLease.expiresAt': { $lte: now } }
      ]
    },
    {
      $set: {
        'externalWatches.githubRepo.buildLease.token': token,
        'externalWatches.githubRepo.buildLease.headSha': headSha,
        'externalWatches.githubRepo.buildLease.acquiredAt': now,
        'externalWatches.githubRepo.buildLease.expiresAt': expiresAt,
        'externalWatches.githubRepo.candidateHeadSha': headSha,
        'externalWatches.githubRepo.candidateGeneratorVersion': generatorVersion,
        'externalWatches.githubRepo.lastBuildAttemptAt': now,
        'externalWatches.githubRepo.lastBuildError': '',
        'externalWatches.githubRepo.buildStatus': 'building'
      }
    },
    { new: true }
  );
  return page
    ? { acquired: true, page, token, headSha, expiresAt }
    : { acquired: false, page: null, token: '', headSha, reason: 'lease_active' };
};

const releaseRepoBuildLease = async ({
  WikiPage,
  pageId,
  userId,
  token,
  headSha = '',
  generatorVersion = '',
  status = 'ready',
  error = '',
  promoted = false,
  now = new Date()
} = {}) => {
  if (!WikiPage?.findOneAndUpdate || !pageId || !userId || !token) return null;
  const current = typeof WikiPage.findOne === 'function'
    ? await WikiPage.findOne({ _id: pageId, userId })
    : null;
  const currentLease = current?.externalWatches?.githubRepo?.buildLease || {};
  const currentToken = String(currentLease.token || '').trim();
  const leaseExpiresAt = currentLease.expiresAt ? new Date(currentLease.expiresAt).getTime() : 0;
  const leaseExpired = Boolean(leaseExpiresAt && leaseExpiresAt <= now.getTime());
  if (current && currentToken && currentToken !== token && !leaseExpired) return null;
  const observedHeadSha = String(current?.externalWatches?.githubRepo?.lastHeadSha || '').trim();
  const newerHeadQueued = Boolean(promoted && observedHeadSha && headSha && observedHeadSha !== headSha);
  const updates = {
    'externalWatches.githubRepo.buildLease.token': '',
    'externalWatches.githubRepo.buildLease.headSha': '',
    'externalWatches.githubRepo.buildLease.acquiredAt': null,
    'externalWatches.githubRepo.buildLease.expiresAt': null,
    'externalWatches.githubRepo.candidateHeadSha': promoted
      ? (newerHeadQueued ? observedHeadSha : '')
      : headSha,
    'externalWatches.githubRepo.candidateGeneratorVersion': promoted ? '' : generatorVersion,
    'externalWatches.githubRepo.buildStatus': newerHeadQueued ? 'queued' : status,
    'externalWatches.githubRepo.lastBuildError': error
  };
  if (promoted) {
    updates['externalWatches.githubRepo.publishedHeadSha'] = headSha;
    updates['externalWatches.githubRepo.publishedGeneratorVersion'] = generatorVersion;
    updates['externalWatches.githubRepo.lastPublishedAt'] = now;
  }
  return WikiPage.findOneAndUpdate(
    {
      _id: pageId,
      userId,
      $or: [
        { 'externalWatches.githubRepo.buildLease.token': token },
        { 'externalWatches.githubRepo.buildLease.token': '' },
        { 'externalWatches.githubRepo.buildLease.token': null },
        { 'externalWatches.githubRepo.buildLease.token': { $exists: false } },
        { 'externalWatches.githubRepo.buildLease.expiresAt': { $lte: now } }
      ]
    },
    { $set: updates },
    { new: true }
  );
};

module.exports = {
  DEFAULT_REPO_BUILD_LEASE_MS,
  acquireRepoBuildLease,
  releaseRepoBuildLease
};
