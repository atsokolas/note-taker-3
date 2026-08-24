import { PAGE_TYPES } from './wikiGraph';
import { pageNeedsQualityReview } from './wikiPageQualityReview';

export const WIKI_FACET_TYPES = PAGE_TYPES.filter((type) => type !== 'all');
export const WIKI_FACET_STATUSES = ['draft', 'published'];
export const WIKI_FACET_VISIBILITIES = ['private', 'shared'];
export const WIKI_KINDS = ['general', 'repository', 'investment'];

export const WIKI_KIND_LABELS = {
  general: 'General wikis',
  repository: 'Repository wikis',
  investment: 'Investment dossiers'
};

export const WIKI_KIND_FLAGS = {
  general: 'Wiki',
  repository: 'Repo wiki',
  investment: 'Investment dossier'
};

export const wikiKindForPage = (page = {}) => {
  if (WIKI_KINDS.includes(page?.wikiKind)) return page.wikiKind;
  const repoWatch = page?.externalWatches?.githubRepo || {};
  if (
    String(page?.pageType || '').toLowerCase() === 'repo'
    || Boolean(String(page?.repoKey || '').trim())
    || Boolean(String(repoWatch.owner || '').trim())
    || Boolean(String(repoWatch.repo || '').trim())
    || Boolean(String(repoWatch.lastHeadSha || '').trim())
    || Boolean(String(repoWatch.publishedHeadSha || '').trim())
  ) return 'repository';
  if (Boolean(page?.investmentDossier?.version)) return 'investment';
  return 'general';
};

export const computeWikiFacetCounts = (pages = []) => {
  const counts = {
    all: pages.length,
    needsReview: 0,
    byKind: Object.fromEntries(WIKI_KINDS.map((kind) => [kind, 0])),
    byType: Object.fromEntries(WIKI_FACET_TYPES.map((type) => [type, 0])),
    byStatus: Object.fromEntries(WIKI_FACET_STATUSES.map((status) => [status, 0])),
    byVisibility: Object.fromEntries(WIKI_FACET_VISIBILITIES.map((visibility) => [visibility, 0]))
  };

  pages.forEach((page) => {
    if (pageNeedsQualityReview(page)) counts.needsReview += 1;
    counts.byKind[wikiKindForPage(page)] += 1;

    const type = page.pageType || 'topic';
    if (Object.prototype.hasOwnProperty.call(counts.byType, type)) {
      counts.byType[type] += 1;
    }

    const status = page.status || 'draft';
    if (Object.prototype.hasOwnProperty.call(counts.byStatus, status)) {
      counts.byStatus[status] += 1;
    }

    const visibility = page.visibility || 'private';
    if (Object.prototype.hasOwnProperty.call(counts.byVisibility, visibility)) {
      counts.byVisibility[visibility] += 1;
    }
  });

  return counts;
};

export const isWikiAllPagesActive = ({
  kind = 'all',
  pageType = 'all',
  visibility = 'all',
  status = 'all',
  needsReviewFilter = false
} = {}) => (
  kind === 'all'
  && pageType === 'all'
  && visibility === 'all'
  && status === 'all'
  && !needsReviewFilter
);
