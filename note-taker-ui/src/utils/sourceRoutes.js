import {
  ARTICLE_PASSAGE_CONTEXT_LIMIT,
  ARTICLE_PASSAGE_FRAGMENT_LIMIT,
  FRAGMENT_PREFIX,
  validAnchor
} from './articlePassageAnchor';

const clean = (value) => String(value || '').trim();

const idOf = (value) => clean(value?._id || value?.id || value);

export const isExternalSourceHref = (href = '') => /^https?:\/\//i.test(clean(href));

export const buildConceptPath = ({ name = '', conceptId = '', versionId = '' } = {}) => {
  const concept = clean(name);
  const id = clean(conceptId);
  if (!concept && !id) return '';
  const params = new URLSearchParams({ tab: 'concepts' });
  params.set('concept', concept || id);
  if (id && id !== concept) params.set('conceptId', id);
  if (clean(versionId)) params.set('v', clean(versionId));
  return `/think?${params.toString()}`;
};

export const isLibraryHref = (href = '') => /^\/library(\?|$)/.test(clean(href));

/** highlight:article:highlight or article:article — the origin a Why keeps. */
export const parseSourceOrigin = (origin = '') => {
  const value = clean(origin);
  const highlight = value.match(/^highlight:([^:]+):(.+)$/);
  if (highlight) {
    return { kind: 'highlight', articleId: highlight[1], highlightId: highlight[2] };
  }
  const article = value.match(/^article:(.+)$/);
  if (article) {
    return { kind: 'article', articleId: article[1], highlightId: '' };
  }
  return { kind: '', articleId: '', highlightId: '' };
};

export const buildCanonicalArticlePath = (articleId = '') => {
  const id = idOf(articleId);
  return id ? `/library?articleId=${encodeURIComponent(id)}` : '/library';
};

/** The reader at the exact words: the fragment carries the anchor it looks for. */
export const buildArticlePassageHref = ({ articleId, anchor } = {}) => {
  const payload = {
    v: 1,
    articleId: idOf(articleId),
    text: String(anchor?.text || ''),
    prefix: String(anchor?.prefix || '').slice(-ARTICLE_PASSAGE_CONTEXT_LIMIT),
    suffix: String(anchor?.suffix || '').slice(0, ARTICLE_PASSAGE_CONTEXT_LIMIT),
    startOffsetApprox: Number(anchor?.startOffsetApprox)
  };
  if (!payload.articleId || !validAnchor(payload)) return '';
  const hash = `${FRAGMENT_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
  return hash.length > ARTICLE_PASSAGE_FRAGMENT_LIMIT ? '' : `${buildCanonicalArticlePath(payload.articleId)}${hash}`;
};

export const safeInternalPath = (value, prefix) => {
  const path = clean(value);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '';
  try {
    const parsed = new URL(path, 'https://noeis.local');
    const matches = prefix.endsWith('/') ? parsed.pathname.startsWith(prefix) : parsed.pathname === prefix;
    return parsed.origin === 'https://noeis.local' && matches
      ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '';
  } catch (_error) {
    return '';
  }
};

// A saved quotation's exact passage must belong to its recorded article.
// If its path drifted, return to that article without pretending it is exact.
export const resolveSavedSourcePath = (source = {}) => {
  const articleId = idOf(source?.articleId);
  const path = safeInternalPath(source?.sourcePath, '/library');
  if (path) {
    const pathArticleId = new URL(path, 'https://noeis.local').searchParams.get('articleId');
    if (pathArticleId && (!articleId || pathArticleId === articleId)) return path;
  }
  return articleId ? buildCanonicalArticlePath(articleId) : '';
};

export const buildCanonicalHighlightPath = ({ articleId = '', highlightId = '' } = {}) => {
  const article = idOf(articleId);
  const highlight = idOf(highlightId);
  // The Library reader resolves highlights through their parent article. A
  // highlight-only URL looks exact but cannot open, so fail closed to Library.
  if (!article) return '/library';
  const path = buildCanonicalArticlePath(article);
  return highlight ? `${path}&highlightId=${encodeURIComponent(highlight)}` : path;
};

// Private continuation uses object identity only, never the current browser
// query, private prose, or a token. Opening it still requires the owner.
export const buildAuthoredContinuationPath = (row = {}) => {
  if (row.sourceUnavailable && row.id) return `/think?explorationId=${encodeURIComponent(idOf(row.id))}`;
  if (row.articleId && row.highlightId) return `${buildCanonicalHighlightPath(row)}&exploration=1`;
  if (row.pageId && row.claimId) return `/wiki/read/${encodeURIComponent(idOf(row.pageId))}?claimId=${encodeURIComponent(idOf(row.claimId))}&exploration=1`;
  return '';
};

// A passage is a few sentences. A longer excerpt is the document itself, and
// the door to a document opens at its top.
const PASSAGE_LIMIT = 600;

/* The Library identity of a source. A highlight is its own passage; any other
   source that sits in the Library (the article itself, or a web source the
   server matched to a saved piece) names the article. */
export const libraryIdentity = (source = {}) => {
  const type = clean(source?.type || source?.sourceType).toLowerCase();
  // `_id` identifies the source-ref wrapper, not the saved Library object.
  // Opening it would create a plausible-looking but broken reader URL.
  const objectId = idOf(
    source?.objectId || source?.sourceObjectId || source?.sourceId || source?.highlightId || source?.articleId
  );
  const parentObjectId = idOf(source?.parentObjectId || source?.parentArticleId || source?.articleId);
  if (type === 'highlight') return { type, objectId, articleId: parentObjectId, highlightId: parentObjectId ? objectId : '' };
  return { type, objectId, articleId: type === 'article' ? parentObjectId || objectId : parentObjectId, highlightId: '' };
};

const buildOwnedSourcePath = (source = {}, passage = '') => {
  const { type, objectId, articleId, highlightId } = libraryIdentity(source);
  if (highlightId) return buildCanonicalHighlightPath({ articleId, highlightId });
  if (type === 'concept' && objectId) return buildConceptPath({ name: objectId, conceptId: objectId });
  if (type === 'question' && objectId) return `/think?tab=questions&questionId=${encodeURIComponent(objectId)}`;
  if ((type === 'notebook' || type === 'note') && objectId) {
    return `/think?tab=notebook&entryId=${encodeURIComponent(objectId)}`;
  }
  if (!articleId) return '';
  const words = clean(passage);
  const exact = words.length <= PASSAGE_LIMIT
    && buildArticlePassageHref({ articleId, anchor: { text: words, prefix: '', suffix: '', startOffsetApprox: 0 } });
  return exact || buildCanonicalArticlePath(articleId);
};

const buildOriginalSourceHref = (source = {}) => {
  const url = clean(source?.url);
  return isExternalSourceHref(url) ? url : '';
};

/**
 * Owned evidence and the public original are separate doors. A citation can
 * keep its filing URL for provenance while the Library path opens the exact
 * saved passage. Never invent a Library door from a public URL alone: the
 * server says when a web source is a piece you saved. Given the cited words,
 * the Library door opens the reader at them.
 */
export const resolveSourceDoors = (source = {}, { passage = '' } = {}) => {
  const ownedHref = buildOwnedSourcePath(source, passage);
  const originalHref = buildOriginalSourceHref(source);
  const isLibrary = isLibraryHref(ownedHref);
  const { articleId, highlightId } = isLibrary ? libraryIdentity(source) : {};
  return {
    ownedHref,
    originalHref,
    openHref: ownedHref || originalHref,
    isLibrary,
    isExternalOnly: !ownedHref && Boolean(originalHref),
    articleId: articleId || '',
    highlightId: highlightId || ''
  };
};

/**
 * Return to saved evidence before falling back to the public web. A source can
 * retain its original URL for provenance while its object identity keeps the
 * user inside the exact Library reading context.
 */
export const buildSourceOpenPath = (source = {}, options) => resolveSourceDoors(source, options).openHref;

/** A quoted passage, opened at its words: the highlight when one was kept,
    else the quoted words themselves, else the top of the article. */
export const buildPassagePath = ({ articleId = '', highlightId = '', text = '' } = {}) => {
  if (!idOf(articleId)) return '';
  if (idOf(highlightId)) return buildCanonicalHighlightPath({ articleId, highlightId });
  const anchor = { text: clean(text), prefix: '', suffix: '', startOffsetApprox: 0 };
  return buildArticlePassageHref({ articleId, anchor }) || buildCanonicalArticlePath(articleId);
};

export const buildSourceOriginPath = (origin = '', fallbackUrl = '', text = '') => {
  const parsed = parseSourceOrigin(origin);
  if (parsed.kind) return buildPassagePath({ ...parsed, text });
  return isExternalSourceHref(fallbackUrl) ? clean(fallbackUrl) : '';
};
