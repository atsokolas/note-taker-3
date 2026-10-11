/* One source, one passage.

   A wiki source that is a piece in your Library is that piece. Its ref names
   the Library article (`objectId` when the ref is the article, `parentObjectId`
   otherwise) and a highlight ref names the highlight and the article it sits
   in, so every citation opens the reader rather than a copy.

   A web address ingested into the wiki that is already in the Library is
   ingested as that article, so its ref is direct from the start.

   Older refs were written another way: with the wiki source event's id in
   `objectId`, or as an external link to a page saved to the Library before or
   since. They are resolved when read and the link is written back, so the
   next read is direct. Nothing is deleted or copied; a ref that resolves to
   nothing is left exactly as it was. */

const TRACKING_PARAM = /^(?:utm_.*|fbclid|gclid|ref|ref_src|source)$/i;
const LIBRARY_REF_TYPES = new Set(['article', 'highlight']);

const idOf = (value) => String(value?._id || value || '').trim();

/** The address a source is known by: no scheme, www, fragment, tracking or trailing slash; path and query keep their case. */
const canonicalSourceUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const query = [...url.searchParams]
      .filter(([key]) => !TRACKING_PARAM.test(key))
      .map(pair => pair.map(encodeURIComponent).join('='))
      .sort()
      .join('&');
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.host.replace(/^www\./, '')}${path}${query ? `?${query}` : ''}`;
  } catch (_error) {
    return raw.toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').replace(/[#?].*$/, '').replace(/\/+$/, '');
  }
};

/* Article urls are stored as they were saved, so the lookup asks the index
   for every spelling of the same place and keeps only the true matches. An
   address carrying a user name or password matches nothing. */
const urlPattern = (value = '') => {
  try {
    const url = new URL(String(value || '').trim());
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    const place = `${url.host.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^https?://(www\\.)?${place}/*([?#]|$)`, 'i');
  } catch (_error) {
    return null;
  }
};

/** The Library article a ref belongs to, or ''. */
const libraryArticleIdOf = (ref = {}) => idOf(ref.parentObjectId) || (ref.type === 'article' ? idOf(ref.objectId) : '');

/* Resolve a page's refs in place. Each ref changes at most once; the changes
   come back as { ref, set } so the caller can write them down. */
const resolveSourceRefs = async ({ Article, WikiSourceEvent, userId, refs = [] }) => {
  const changes = [];
  const change = (ref, set) => {
    Object.assign(ref, set);
    changes.push({ ref, set });
  };

  const fromEvents = refs.filter(ref => (
    LIBRARY_REF_TYPES.has(ref.type) && ref.objectId && !ref.metadata?.sourceEventId
    && !(ref.type === 'highlight' && ref.parentObjectId)
  ));
  if (WikiSourceEvent && fromEvents.length) {
    const events = await WikiSourceEvent.find({
      userId,
      _id: { $in: fromEvents.map(ref => ref.objectId) },
      sourceType: { $in: [...LIBRARY_REF_TYPES] },
      sourceObjectId: { $ne: null }
    }).select('sourceType sourceObjectId parentObjectId').lean();
    const byId = new Map(events.map(event => [idOf(event), event]));
    fromEvents.forEach((ref) => {
      const event = byId.get(idOf(ref.objectId));
      if (!event) return;
      change(ref, {
        type: event.sourceType,
        objectId: event.sourceObjectId,
        parentObjectId: event.parentObjectId || null,
        metadata: { ...(ref.metadata || {}), sourceEventId: event._id }
      });
    });
  }

  const orphans = refs.filter(ref => ref.type === 'highlight' && ref.objectId && !ref.parentObjectId);
  const addressed = refs.filter(ref => ref.url && !libraryArticleIdOf(ref) && ref.type !== 'highlight' && urlPattern(ref.url));
  const patterns = addressed.map(ref => urlPattern(ref.url));
  if (Article && (orphans.length || patterns.length)) {
    const articles = await Article.find({
      userId,
      $or: [
        ...(orphans.length ? [{ 'highlights._id': { $in: orphans.map(ref => ref.objectId) } }] : []),
        ...(patterns.length ? [{ url: { $in: patterns } }] : [])
      ]
    }).select('_id url highlights._id').lean();
    orphans.forEach((ref) => {
      const article = articles.find(item => (item.highlights || []).some(highlight => idOf(highlight) === idOf(ref.objectId)));
      if (article) change(ref, { parentObjectId: article._id });
    });
    addressed.forEach((ref) => {
      const canonical = canonicalSourceUrl(ref.url);
      const article = articles.find(item => canonicalSourceUrl(item.url) === canonical);
      if (article) change(ref, { parentObjectId: article._id });
    });
  }
  return changes;
};

/** The reader's Library article saved at this address, or null. */
const findLibraryArticle = async ({ Article, userId, url }) => {
  const pattern = urlPattern(url);
  if (!Article || !pattern) return null;
  const canonical = canonicalSourceUrl(url);
  const articles = await Article.find({ userId, url: pattern }).select('_id url title content').lean();
  return articles.find(article => canonicalSourceUrl(article.url) === canonical) || null;
};

/** Resolve a page's sources and remember what was found, without touching updatedAt. */
const linkPageSources = async ({ Article, WikiSourceEvent, WikiPage, page }) => {
  const refs = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
  if (!refs.length) return 0;
  const changes = await resolveSourceRefs({ Article, WikiSourceEvent, userId: page.userId, refs });
  if (WikiPage && changes.length) {
    await WikiPage.bulkWrite(changes.map(({ ref, set }) => ({
      updateOne: {
        filter: { _id: page._id, userId: page.userId, 'sourceRefs._id': ref._id },
        update: { $set: Object.fromEntries(Object.entries(set).map(([key, value]) => [`sourceRefs.$.${key}`, value])) },
        timestamps: false
      }
    })));
  }
  return changes.length;
};

module.exports = {
  canonicalSourceUrl,
  findLibraryArticle,
  linkPageSources
};
