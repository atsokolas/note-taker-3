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
   nothing is left exactly as it was.

   One kind of source is filed rather than found: a filing a watch brought in
   (an SEC 10-Q on a company dossier). Nobody saved it, so no Library article
   matches its address, and its citation could only open the original on
   sec.gov. It is a document the page was written from, so the first read
   that may write files it into the Library with the text the watch fetched,
   and the citation opens it in the reader. A filing already in the Library
   is used as it stands. */

const { MAX_CONTENT_LENGTH, paragraphsToHtml } = require('./readableArticle');

// Only keys that never choose what a page says: `ref` and `source` can.
const TRACKING_PARAM = /^(?:utm_.*|fbclid|gclid|ref_src)$/i;
const LIBRARY_REF_TYPES = new Set(['article', 'highlight']);
// Providers whose sources are documents a watch fetched for the page.
const WATCHED_FILING_PROVIDERS = new Set(['sec-edgar']);

const idOf = (value) => String(value?._id || value || '').trim();

/** The address a source is known by: no scheme, www, fragment, tracking or trailing slash; path and query keep their case. */
const canonicalSourceUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    // Keys sort; a repeated key keeps its values in the order given.
    const query = [...url.searchParams]
      .filter(([key]) => !TRACKING_PARAM.test(key))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(pair => pair.map(encodeURIComponent).join('='))
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

const watchedFilingProvider = (ref = {}) => {
  const provider = String(ref.provider || ref.metadata?.source || '').trim();
  return WATCHED_FILING_PROVIDERS.has(provider) ? provider : '';
};

/* Save each unlinked watched filing into the reader's Library and return the
   article id for each address. The watch's event carries the filing text; the
   ref's snippet stands in when the event is gone. */
const fileWatchedFilings = async ({ Article, WikiSourceEvent, userId, refs = [] }) => {
  if (!Article?.findOneAndUpdate || !refs.length) return new Map();
  const eventIds = refs.map(ref => ref.objectId).filter(Boolean);
  const events = WikiSourceEvent && eventIds.length
    ? await WikiSourceEvent.find({ userId, _id: { $in: eventIds } }).select('title text url externalId metadata').lean()
    : [];
  const eventById = new Map(events.map(event => [idOf(event), event]));
  const filed = new Map();
  for (const ref of refs) {
    const place = canonicalSourceUrl(ref.url);
    if (filed.has(place)) continue;
    const event = eventById.get(idOf(ref.objectId)) || null;
    const url = String(ref.url).trim();
    const text = String(event?.text || ref.snippet || '').slice(0, MAX_CONTENT_LENGTH);
    const meta = { ...(event?.metadata || {}), ...(ref.metadata || {}) };
    try {
      const article = await Article.findOneAndUpdate(
        { userId, url },
        {
          $setOnInsert: {
            userId,
            url,
            title: String(ref.title || event?.title || url).trim().slice(0, 240),
            content: paragraphsToHtml(text),
            importMeta: {
              provider: watchedFilingProvider(ref),
              sourceType: 'watched_filing',
              sourceLabel: String(meta.companyName || meta.ticker || '').trim(),
              sourceUrl: url,
              externalId: String(event?.externalId || '').trim(),
              importedAt: new Date()
            }
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (article?._id) filed.set(place, article._id);
    } catch (error) {
      // A filing that cannot be filed stays an external link; the next read tries again.
      console.error('Could not file a watched filing into the Library:', error?.message || error);
    }
  }
  return filed;
};

/* Resolve a page's refs in place. Each ref changes at most once; the changes
   come back as { ref, set } so the caller can write them down. Watched
   filings are filed into the Library only when `file` is set, since filing
   writes an article. */
const resolveSourceRefs = async ({ Article, WikiSourceEvent, userId, refs = [], file = false }) => {
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

  const filings = file
    ? refs.filter(ref => ref.url && !libraryArticleIdOf(ref) && ref.type !== 'highlight' && watchedFilingProvider(ref) && urlPattern(ref.url))
    : [];
  if (filings.length) {
    const filed = await fileWatchedFilings({ Article, WikiSourceEvent, userId, refs: filings });
    filings.forEach((ref) => {
      const articleId = filed.get(canonicalSourceUrl(ref.url));
      if (articleId) change(ref, { parentObjectId: articleId });
    });
  }
  return changes;
};

/** The reader's Library article saved at this address, or null: the one saved
    at exactly this address first, else the first saved at another spelling of
    it. Archived, hidden and debug pieces are not in the Library to reuse. */
const findLibraryArticle = async ({ Article, userId, url }) => {
  const pattern = urlPattern(url);
  if (!Article || !pattern) return null;
  const canonical = canonicalSourceUrl(url);
  const articles = await Article.find({ userId, url: pattern, archived: { $ne: true }, hiddenFromHome: { $ne: true }, debugOnly: { $ne: true } }).sort({ _id: 1 }).select('_id url title content').lean();
  return articles.find(article => article.url === String(url).trim())
    || articles.find(article => canonicalSourceUrl(article.url) === canonical)
    || null;
};

/** Resolve a page's sources and remember what was found, without touching
    updatedAt. Only a call that writes (one given WikiPage) files watched
    filings, so a dry run creates nothing. */
const linkPageSources = async ({ Article, WikiSourceEvent, WikiPage, page }) => {
  const refs = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
  if (!refs.length) return 0;
  const changes = await resolveSourceRefs({ Article, WikiSourceEvent, userId: page.userId, refs, file: Boolean(WikiPage) });
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
  linkPageSources,
  urlPattern
};
