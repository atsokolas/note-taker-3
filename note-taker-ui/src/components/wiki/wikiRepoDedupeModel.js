import { githubWatchState, isRepoDossierPage, pageMeta } from './wikiRepoDossierModel';

const normalizeText = (value = '') => String(value || '').trim();

export const wikiPageId = (page = {}) => (
  page && (page._id || page.id || page.pageId)
) || '';

const normalizeRepoSlug = (value = '') => normalizeText(value)
  .replace(/^https?:\/\/github\.com\//i, '')
  .replace(/^github\.com\//i, '')
  .replace(/\.git(?:[/?#].*)?$/i, '')
  .replace(/[?#].*$/, '')
  .replace(/\/+$/, '');

/**
 * Canonical owner/repo key for deduplication (lowercase).
 */
export const repoKeyForPage = (page = {}) => {
  const watch = githubWatchState(page?.externalWatches?.githubRepo);
  if (watch.owner && watch.repo) {
    return `${watch.owner.toLowerCase()}/${watch.repo.toLowerCase()}`;
  }
  const meta = pageMeta(page);
  const raw = normalizeRepoSlug(
    meta.githubRepo || meta.repo || meta.repository || meta.githubUrl || meta.repoUrl
  );
  if (!raw) return '';
  const [owner = '', repo = ''] = raw.split('/').filter(Boolean);
  if (!owner || !repo) return '';
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
};

export const isRepoWikiPage = (page = {}) => (
  Boolean(repoKeyForPage(page)) || isRepoDossierPage(page)
);

const repoPageMaintainedScore = (page = {}) => {
  const watch = githubWatchState(page?.externalWatches?.githubRepo);
  let score = 0;
  const updatedAt = page.updatedAt || page.lastReviewedAt;
  if (updatedAt) score += new Date(updatedAt).getTime();
  if (watch.lastCheckedAt) score += new Date(watch.lastCheckedAt).getTime();
  if (watch.armed) score += 1_000;
  if (watch.lastHeadSha) score += 100;
  if (Number(page.sourceCount) > 0) score += Number(page.sourceCount);
  return score;
};

const pickMaintainedRepoPage = (left = {}, right = {}) => {
  const leftScore = repoPageMaintainedScore(left);
  const rightScore = repoPageMaintainedScore(right);
  if (rightScore > leftScore) return right;
  if (leftScore > rightScore) return left;
  return wikiPageId(right) > wikiPageId(left) ? right : left;
};

/**
 * Keep one page per GitHub repo identity, preferring the newest/maintained watch.
 */
export const dedupePagesByRepoKey = (pages = []) => {
  const list = Array.isArray(pages) ? pages : [];
  const winners = new Map();

  list.forEach((page) => {
    const key = repoKeyForPage(page);
    if (!key) return;
    winners.set(key, winners.has(key) ? pickMaintainedRepoPage(winners.get(key), page) : page);
  });

  const emittedRepoKeys = new Set();
  const emittedIds = new Set();
  const result = [];

  list.forEach((page) => {
    const id = wikiPageId(page);
    const key = repoKeyForPage(page);
    if (!key) {
      if (id && emittedIds.has(id)) return;
      if (id) emittedIds.add(id);
      result.push(page);
      return;
    }
    const winner = winners.get(key);
    if (!winner || wikiPageId(winner) !== id || emittedRepoKeys.has(key)) return;
    emittedRepoKeys.add(key);
    result.push(winner);
  });

  return result;
};

const briefingIncludesPage = (entries = [], page = {}) => {
  const id = wikiPageId(page);
  if (!id) return false;
  return entries.some((entry) => wikiPageId(entry) === id || String(entry.pageId || '') === id);
};

/**
 * Repo wikis only qualify for Today's Page when briefing or watch signals real change.
 */
export const repoWikiHasRecentActivity = (page = {}, briefing = {}) => {
  if (briefingIncludesPage(briefing?.pagesWithNewSourceMaterial, page)) return true;
  if (briefingIncludesPage(briefing?.recentlyUpdatedPages, page)) return true;
  if (briefingIncludesPage(briefing?.recentMaintenanceChanges, page)) return true;

  const watch = githubWatchState(page?.externalWatches?.githubRepo);
  if (!watch.lastCheckedAt) return false;
  const checkedAt = new Date(watch.lastCheckedAt).getTime();
  if (!Number.isFinite(checkedAt)) return false;
  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  return checkedAt >= weekAgo;
};

export const isEligibleForTodaysPage = (page = {}, briefing = {}) => {
  if (!isRepoWikiPage(page)) return true;
  return repoWikiHasRecentActivity(page, briefing);
};

export const filterPagesForTodaysPage = (pages = [], briefing = {}) => (
  (Array.isArray(pages) ? pages : []).filter((page) => isEligibleForTodaysPage(page, briefing))
);

/**
 * Prevent repo-wiki pages from dominating return-surface lists when alternatives exist.
 */
export const capRepoWikiDominance = (
  pages = [],
  { maxFraction = 0.4, minNonRepo = 1 } = {}
) => {
  const list = Array.isArray(pages) ? pages : [];
  if (!list.length) return list;

  const nonRepoCount = list.filter((page) => !isRepoWikiPage(page)).length;
  if (nonRepoCount < minNonRepo) return list;

  const repoPages = list.filter(isRepoWikiPage);
  const maxRepoCount = Math.min(
    repoPages.length,
    nonRepoCount,
    Math.max(0, Math.floor(list.length * maxFraction))
  );
  if (maxRepoCount <= 0) {
    return list.filter((page) => !isRepoWikiPage(page));
  }

  let repoSlots = maxRepoCount;
  return list.filter((page) => {
    if (!isRepoWikiPage(page)) return true;
    if (repoSlots <= 0) return false;
    repoSlots -= 1;
    return true;
  });
};

export const prepareExplorePages = (pages = [], { limit } = {}) => {
  let result = capRepoWikiDominance(dedupePagesByRepoKey(pages));
  if (Number.isFinite(limit) && limit > 0) {
    result = result.slice(0, limit);
  }
  return result;
};
