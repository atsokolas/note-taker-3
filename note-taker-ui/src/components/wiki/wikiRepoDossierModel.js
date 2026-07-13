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

/** @typedef {'overview' | 'architecture' | 'key-decisions' | 'changelog-digest' | 'open-questions'} RepoDossierSectionId */

/** Stable hybrid-model sections for repo dossier navigation. */
export const REPO_DOSSIER_CANONICAL_SECTIONS = Object.freeze([
  {
    id: 'overview',
    label: 'Overview',
    aliases: [
      /^overview$/i,
      /^purpose$/i,
      /^what this repo is$/i,
      /^what .+ is$/i,
      /^summary$/i,
      /^profile$/i,
      /^current state$/i
    ]
  },
  {
    id: 'architecture',
    label: 'Architecture',
    aliases: [
      /^architecture(?: map| and ownership)?$/i,
      /^system map$/i,
      /^critical(?: product)? flows$/i,
      /^how it works$/i,
      /^user experience map$/i
    ]
  },
  {
    id: 'key-decisions',
    label: 'Key decisions',
    aliases: [
      /^key decisions$/i,
      /^change paths$/i,
      /^common change paths$/i,
      /^where to make changes$/i,
      /^engineering invariants$/i,
      /^quality bar(?: and invariants)?$/i,
      /^next moves$/i
    ]
  },
  {
    id: 'changelog-digest',
    label: 'Changelog digest',
    aliases: [
      /^changelog(?: digest)?$/i,
      /^recent changes$/i,
      /^what changed$/i,
      /^latest entry$/i,
      /^timeline$/i,
      /^current active work$/i
    ]
  },
  {
    id: 'open-questions',
    label: 'Open questions',
    aliases: [
      /^open questions$/i,
      /^risks(?: and unknowns)?$/i,
      /^deploy and unknowns$/i,
      /^failure modes$/i,
      /^known risks$/i,
      /^unknowns$/i
    ]
  }
]);

export const repoDossierSectionAnchorId = (sectionId = '') => (
  `repo-section-${String(sectionId || '').trim()}`
);

const normalizeHeading = (value = '') => normalizeText(value).toLowerCase();

/**
 * @param {string} heading
 * @returns {RepoDossierSectionId | ''}
 */
export const repoSectionIdForHeading = (heading = '') => {
  const normalized = normalizeHeading(heading);
  if (!normalized) return '';
  const match = REPO_DOSSIER_CANONICAL_SECTIONS.find(section => (
    section.aliases.some(pattern => pattern.test(normalized))
  ));
  return match?.id || '';
};

/**
 * @param {{ tocItems?: Array<{ id?: string, title?: string, level?: number, blockIndex?: number }> }} options
 */
export const buildRepoDossierSectionNav = ({ tocItems = [] } = {}) => {
  const byId = new Map(
    REPO_DOSSIER_CANONICAL_SECTIONS.map(section => [section.id, {
      ...section,
      anchorId: repoDossierSectionAnchorId(section.id),
      sourceHeading: '',
      tocId: '',
      available: false
    }])
  );

  (Array.isArray(tocItems) ? tocItems : []).forEach((item) => {
    const sectionId = repoSectionIdForHeading(item?.title);
    if (!sectionId) return;
    const entry = byId.get(sectionId);
    if (!entry || entry.available) return;
    entry.available = true;
    entry.sourceHeading = normalizeText(item.title);
    entry.tocId = normalizeText(item.id);
  });

  return REPO_DOSSIER_CANONICAL_SECTIONS.map(section => byId.get(section.id)).filter(Boolean);
};

const cloneDocNode = (node) => {
  if (!node || typeof node !== 'object') return node;
  return {
    ...node,
    attrs: node.attrs ? { ...node.attrs } : undefined,
    content: Array.isArray(node.content) ? node.content.map(cloneDocNode) : node.content
  };
};

/**
 * Apply stable repo-section anchor ids to matched headings in a TipTap doc.
 * @param {Record<string, any>} doc
 * @param {Array<{ title?: string, blockIndex?: number }>} tocItems
 */
export const applyRepoDossierSectionAnchors = (doc, tocItems = []) => {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) return doc;
  const anchorByBlockIndex = new Map(
    (Array.isArray(tocItems) ? tocItems : [])
      .map(item => {
        const sectionId = repoSectionIdForHeading(item?.title);
        if (!sectionId || !Number.isFinite(item?.blockIndex)) return null;
        return [item.blockIndex, repoDossierSectionAnchorId(sectionId)];
      })
      .filter(Boolean)
  );
  if (!anchorByBlockIndex.size) return doc;
  return {
    ...doc,
    content: doc.content.map((node, blockIndex) => {
      const anchorId = anchorByBlockIndex.get(blockIndex);
      if (!anchorId || node?.type !== 'heading') return node;
      const next = cloneDocNode(node);
      next.attrs = { ...(next.attrs || {}), anchorId, id: anchorId };
      return next;
    })
  };
};

const plainDocText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(plainDocText).join('');
  if (typeof node !== 'object') return '';
  return [node.text || '', plainDocText(node.content)].join('');
};

/**
 * @param {Record<string, any>} doc
 * @param {Record<string, any>} page
 */
export const extractRepoDossierOverviewSummary = (doc, page = {}) => {
  const fallback = normalizeText(page.summary || page.description || page.plainText).slice(0, 420);
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) {
    return fallback;
  }
  const firstHeadingIndex = doc.content.findIndex(node => node?.type === 'heading');
  const introBlocks = firstHeadingIndex === -1 ? doc.content : doc.content.slice(0, firstHeadingIndex);
  const introText = introBlocks
    .map(node => plainDocText(node).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  if (introText) return introText.slice(0, 420);
  const overviewBlockIndex = doc.content.findIndex((node) => (
    node?.type === 'heading' && repoSectionIdForHeading(plainDocText(node.content)) === 'overview'
  ));
  if (overviewBlockIndex === -1) return fallback;
  const nextBlocks = doc.content.slice(overviewBlockIndex + 1, overviewBlockIndex + 4);
  const overviewText = nextBlocks
    .filter(node => node?.type === 'paragraph')
    .map(node => plainDocText(node.content).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return (overviewText || fallback).slice(0, 420);
};

const deltaClaims = (comparison = null) => {
  const deltas = comparison?.claimComparison?.deltas;
  if (!deltas || typeof deltas !== 'object') return [];
  return [
    ...(Array.isArray(deltas.added) ? deltas.added.map(row => row.after).filter(Boolean) : []),
    ...(Array.isArray(deltas.changed) ? deltas.changed.map(row => row.after || row.before).filter(Boolean) : []),
    ...(Array.isArray(deltas.removed) ? deltas.removed.map(row => row.before).filter(Boolean) : []),
    ...(Array.isArray(deltas.contradicted) ? deltas.contradicted.map(row => row.after || row.before).filter(Boolean) : []),
    ...(Array.isArray(deltas.gainedSupport) ? deltas.gainedSupport.map(row => row.after || row.before).filter(Boolean) : [])
  ];
};

/**
 * @param {Record<string, any> | null} comparison
 * @returns {Record<RepoDossierSectionId, number>}
 */
export const buildRepoSectionChangeBadges = (comparison = null) => {
  const badges = Object.fromEntries(
    REPO_DOSSIER_CANONICAL_SECTIONS.map(section => [section.id, 0])
  );
  deltaClaims(comparison).forEach((claim) => {
    const sectionId = repoSectionIdForHeading(claim.section || '');
    if (!sectionId) return;
    badges[sectionId] += 1;
  });
  return badges;
};

export const repoDossierShouldCollapseSections = (page = {}, tocItems = []) => {
  const wordCount = Number(page?.wordCount) || normalizeText(page?.plainText).split(/\s+/).filter(Boolean).length;
  const sectionCount = Array.isArray(tocItems) ? tocItems.length : 0;
  return wordCount >= 900 || sectionCount >= 5;
};

/**
 * @param {{ pageId?: string, page?: Record<string, any>, shared?: boolean, comparisonAvailable?: boolean }} options
 */
export const buildRepoDossierComparisonHref = ({
  pageId = '',
  page = {},
  shared = false,
  comparisonAvailable = false
} = {}) => {
  if (!comparisonAvailable || !shared) return '';
  const idOrSlug = normalizeText(page?.slug) || normalizeText(pageId) || normalizeText(page?._id || page?.id);
  if (!idOrSlug) return '';
  return `/share/wiki/${encodeURIComponent(idOrSlug)}/comparison`;
};

export const repoDossierGitHubUrl = (page = {}) => {
  const slug = repoDossierGitHubLabel(page);
  if (!slug || !slug.includes('/')) return '';
  return `https://github.com/${slug}`;
};
