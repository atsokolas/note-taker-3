const clean = (value) => String(value || '').trim();

const idOf = (value) => clean(value?._id || value?.id || value);

export const isExternalSourceHref = (href = '') => /^https?:\/\//i.test(clean(href));

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

export const buildCanonicalHighlightPath = ({ articleId = '', highlightId = '' } = {}) => {
  const article = idOf(articleId);
  const highlight = idOf(highlightId);
  // The Library reader resolves highlights through their parent article. A
  // highlight-only URL looks exact but cannot open, so fail closed to Library.
  if (!article) return '/library';
  const path = buildCanonicalArticlePath(article);
  return highlight ? `${path}&highlightId=${encodeURIComponent(highlight)}` : path;
};

const buildOwnedSourcePath = (source = {}) => {
  const type = clean(source?.type || source?.sourceType).toLowerCase();
  // `_id` identifies the source-ref wrapper, not the saved Library object.
  // Opening it would create a plausible-looking but broken reader URL.
  const objectId = idOf(
    source?.objectId || source?.sourceObjectId || source?.sourceId || source?.highlightId || source?.articleId
  );
  const parentObjectId = idOf(source?.parentObjectId || source?.parentArticleId || source?.articleId);

  if (type === 'article' && objectId) return buildCanonicalArticlePath(objectId);
  if (type === 'highlight' && objectId && parentObjectId) {
    return buildCanonicalHighlightPath({ articleId: parentObjectId, highlightId: objectId });
  }
  if (type === 'concept' && objectId) return `/think?tab=concepts&concept=${encodeURIComponent(objectId)}`;
  if (type === 'question' && objectId) return `/think?tab=questions&questionId=${encodeURIComponent(objectId)}`;
  if ((type === 'notebook' || type === 'note') && objectId) {
    return `/think?tab=notebook&entryId=${encodeURIComponent(objectId)}`;
  }
  return '';
};

const buildOriginalSourceHref = (source = {}) => {
  const url = clean(source?.url);
  return isExternalSourceHref(url) ? url : '';
};

/**
 * Owned evidence and the public original are separate doors. A citation can
 * keep its filing URL for provenance while the Library path opens the exact
 * saved passage. Never invent a Library door from a public URL alone.
 */
export const resolveSourceDoors = (source = {}) => {
  const ownedHref = buildOwnedSourcePath(source);
  const originalHref = buildOriginalSourceHref(source);
  return {
    ownedHref,
    originalHref,
    openHref: ownedHref || originalHref,
    isLibrary: isLibraryHref(ownedHref),
    isExternalOnly: !ownedHref && Boolean(originalHref)
  };
};

/**
 * Return to saved evidence before falling back to the public web. A source can
 * retain its original URL for provenance while its object identity keeps the
 * user inside the exact Library reading context.
 */
export const buildSourceOpenPath = (source = {}) => resolveSourceDoors(source).openHref;

export const buildSourceOriginPath = (origin = '', fallbackUrl = '') => {
  const parsed = parseSourceOrigin(origin);
  if (parsed.kind === 'highlight') {
    return buildCanonicalHighlightPath({
      articleId: parsed.articleId,
      highlightId: parsed.highlightId
    });
  }
  if (parsed.kind === 'article') return buildCanonicalArticlePath(parsed.articleId);
  return isExternalSourceHref(fallbackUrl) ? clean(fallbackUrl) : '';
};
