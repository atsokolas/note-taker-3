import { displayWikiPageTitle } from './wikiRepoDossierModel';
import { wikiKindForPage } from './wikiFacetModel';
import { wikiPreviewForPage } from './wikiPageMetrics';
import { isPageQualityBlocked } from './wikiPageQualityReview';

export const COLLECTION_SCOPES = ['all', 'proposed', 'recent'];

export const collectionPageId = (page = {}) => String(page?._id || page?.id || page?.pageId || '').trim();

const asText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/* Search may read the current page: title, dek, and accepted body text.
   Candidate drafts, quality-review reasons, and private notes are a different
   object and must not become a way to find a page. */
export const collectionSearchHaystack = (page = {}) => [
  displayWikiPageTitle(page, ''),
  page?.summary,
  page?.description,
  page?.scope,
  page?.plainText
].map(asText).filter(Boolean).join('\n');

export const pageMatchesCollectionQuery = (page = {}, query = '') => {
  const needle = asText(query).toLowerCase();
  if (!needle) return true;
  return collectionSearchHaystack(page).toLowerCase().includes(needle);
};

export const collectionSearchHit = (page = {}, query = '') => {
  const needle = asText(query);
  if (!needle) return '';
  const title = displayWikiPageTitle(page, '').toLowerCase();
  if (title.includes(needle.toLowerCase())) return '';
  const body = asText(page?.plainText || page?.summary || page?.description);
  const at = body.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return '';
  const start = Math.max(0, at - 48);
  const end = Math.min(body.length, at + needle.length + 72);
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`;
};

export const pendingWikiProposal = (page = {}) => (
  asText(page?.aiState?.candidateStatus).startsWith('awaiting_')
);

export const isCurrentCollectionPage = (page = {}) => !isPageQualityBlocked(page);

export const filterCollectionPages = ({
  pages = [],
  query = '',
  scope = 'all',
  kind = ''
} = {}) => {
  const needle = asText(query);
  let visible = (Array.isArray(pages) ? pages : []).filter(Boolean);
  if (kind) visible = visible.filter(page => wikiKindForPage(page) === kind);
  if (scope === 'proposed') visible = visible.filter(pendingWikiProposal);
  else visible = visible.filter(isCurrentCollectionPage);
  if (scope === 'recent') {
    visible = [...visible]
      .filter(page => page?.updatedAt)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }
  if (needle) visible = visible.filter(page => pageMatchesCollectionQuery(page, needle));
  return visible;
};

export const collectionRowCopy = (page = {}, query = '') => ({
  id: collectionPageId(page),
  title: displayWikiPageTitle(page, 'Untitled page'),
  dek: wikiPreviewForPage(page, 180),
  kind: wikiKindForPage(page),
  pending: pendingWikiProposal(page),
  hit: collectionSearchHit(page, query),
  updatedAt: page?.updatedAt || page?.createdAt || null
});

export default filterCollectionPages;
