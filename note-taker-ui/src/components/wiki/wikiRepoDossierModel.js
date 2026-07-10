import { buildRepoWikiTitle } from '../../utils/githubRepoInput';

const normalizeText = (value = '') => String(value || '').trim();

export const pageMeta = (page = {}) => {
  const value = page || {};
  return (
    value.infobox && typeof value.infobox === 'object' ? value.infobox :
      value.metadata && typeof value.metadata === 'object' ? value.metadata :
        value.meta && typeof value.meta === 'object' ? value.meta :
        {}
  );
};

const normalizeRepoInput = (value = '') => normalizeText(value)
  .replace(/^https?:\/\/github\.com\//i, '')
  .replace(/^github\.com\//i, '')
  .replace(/\.git(?:[/?#].*)?$/i, '')
  .replace(/[?#].*$/, '')
  .replace(/\/+$/, '');

export const githubWatchState = (watch = {}) => {
  const value = watch && typeof watch === 'object' ? watch : {};
  const owner = normalizeText(value.owner);
  const repo = normalizeText(value.repo);
  const status = String(value.status || '').toLowerCase();
  const errorMessage = normalizeText(value.errorMessage);
  const fullName = owner && repo ? `${owner}/${repo}` : '';
  const armed = Boolean(fullName) && status !== 'error';
  const queued = armed && !value.lastCheckedAt;
  return {
    owner,
    repo,
    fullName,
    defaultBranch: normalizeText(value.defaultBranch),
    status,
    errorMessage,
    lastCheckedAt: value.lastCheckedAt || null,
    lastHeadSha: normalizeText(value.lastHeadSha),
    lastReleaseTag: normalizeText(value.lastReleaseTag),
    armed,
    queued,
    watchError: status === 'error' ? (errorMessage || 'GitHub repo watch failed.') : ''
  };
};

export const isRepoDossierPage = (page = {}) => {
  const type = String(page?.pageType || '').toLowerCase();
  const watch = githubWatchState(page?.externalWatches?.githubRepo);
  if (watch.owner || watch.repo) return true;
  if (type === 'repo' || type === 'project' || type === 'log') return true;
  const meta = pageMeta(page);
  return Boolean(normalizeText(meta.githubRepo || meta.repo || meta.repository || meta.githubUrl || meta.repoUrl));
};

export const initialRepoValue = (page = {}, state = {}) => {
  if (state.fullName) return state.fullName;
  const meta = pageMeta(page);
  return normalizeRepoInput(meta.githubRepo || meta.repo || meta.repository || meta.githubUrl || meta.repoUrl || '');
};

/** @typedef {'created' | 'updated'} RepoWikiAction */

/**
 * @param {string} action
 * @returns {RepoWikiAction}
 */
export const normalizeRepoWikiAction = (action = '') => {
  const value = String(action || '').trim().toLowerCase();
  return value === 'updated' ? 'updated' : 'created';
};

/**
 * @param {RepoWikiAction} action
 * @returns {string}
 */
export const repoWikiReceiptTitle = (action = 'created') => (
  normalizeRepoWikiAction(action) === 'updated'
    ? 'Updated existing repo wiki.'
    : 'Created repo wiki.'
);

/**
 * @param {{ pageId?: string; action?: RepoWikiAction; label?: string }} options
 * @returns {import('../../system/systemStatusModel').SystemStatusReceipt}
 */
export const repoWikiSystemReceipt = ({ pageId = '', action = 'created', label = '' } = {}) => {
  const normalizedAction = normalizeRepoWikiAction(action);
  const title = repoWikiReceiptTitle(normalizedAction);
  const repoLabel = normalizeText(label);
  const href = pageId
    ? `/wiki/workspace?page=${encodeURIComponent(pageId)}`
    : '/wiki/workspace';
  return {
    id: pageId ? `repo-wiki-${normalizedAction}-${pageId}` : undefined,
    title,
    summary: repoLabel ? `${title.replace(/\.$/, '')} for ${repoLabel}.` : title,
    status: 'completed',
    href
  };
};

export const repoDossierGitHubLabel = (page = {}) => {
  const state = githubWatchState(page?.externalWatches?.githubRepo);
  if (state.fullName) return state.fullName;
  const meta = pageMeta(page);
  return normalizeRepoInput(meta.githubRepo || meta.repo || meta.repository || meta.githubUrl || meta.repoUrl || '');
};

/**
 * Repo name segment from watch state or metadata (preserves GitHub casing).
 */
export const repoNameFromPage = (page = {}) => {
  const slug = repoDossierGitHubLabel(page);
  if (!slug) return '';
  const parts = slug.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
};

/**
 * UI title for repo wikis: repo slug casing preserved, not title-cased owner/repo.
 * Falls back to stored page.title for non-repo pages.
 */
export const displayWikiPageTitle = (page = {}, fallback = 'Untitled Wiki Page') => {
  const repoName = repoNameFromPage(page);
  if (repoName) return buildRepoWikiTitle(repoName);
  return normalizeText(page?.title) || fallback;
};

export const formatGitHubRepoWatchReceipt = (watch = {}) => {
  const state = githubWatchState(watch);
  const label = state.fullName || 'repository';
  if (state.queued) {
    return `GitHub watcher queued for ${label} · first sync pending`;
  }
  const checked = state.lastCheckedAt
    ? new Date(state.lastCheckedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'not yet';
  const sha = state.lastHeadSha ? ` · head ${state.lastHeadSha.slice(0, 7)}` : '';
  const release = state.lastReleaseTag ? ` · latest release ${state.lastReleaseTag}` : '';
  return `GitHub watcher armed for ${label} · last checked ${checked}${sha}${release}`;
};
