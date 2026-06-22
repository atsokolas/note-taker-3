import { PAGE_TYPES } from './wikiGraph';
import { pageNeedsQualityReview } from './wikiPageQualityReview';

export const WIKI_FACET_TYPES = PAGE_TYPES.filter((type) => type !== 'all');
export const WIKI_FACET_STATUSES = ['draft', 'published'];
export const WIKI_FACET_VISIBILITIES = ['private', 'shared'];

export const computeWikiFacetCounts = (pages = []) => {
  const counts = {
    all: pages.length,
    needsReview: 0,
    byType: Object.fromEntries(WIKI_FACET_TYPES.map((type) => [type, 0])),
    byStatus: Object.fromEntries(WIKI_FACET_STATUSES.map((status) => [status, 0])),
    byVisibility: Object.fromEntries(WIKI_FACET_VISIBILITIES.map((visibility) => [visibility, 0]))
  };

  pages.forEach((page) => {
    if (pageNeedsQualityReview(page)) counts.needsReview += 1;

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
  pageType = 'all',
  visibility = 'all',
  status = 'all',
  needsReviewFilter = false
} = {}) => (
  pageType === 'all'
  && visibility === 'all'
  && status === 'all'
  && !needsReviewFilter
);
