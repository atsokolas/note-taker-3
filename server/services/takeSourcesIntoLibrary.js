/* Taking someone's wiki used to bring their pages and leave their reading
   behind: each source arrived as a title and a link inside a page, and the
   Library — where the partner, retrieval and every check against a held view
   start — stayed empty. A wiki you can't open the sources of is a summary of
   someone else's afternoon.

   So the sources come too. Each public link is saved into the taker's Library
   as an article, the page's footnotes point at that article instead of at a
   bare URL, and anything the taker already saved is used as it stands and
   counted, never overwritten. "Already saved" means the same place by the
   Library's own reckoning (canonicalSourceUrl), so a piece saved with www. or
   a trailing slash is the one the footnote opens.

   Passages do not travel. A public page carries no snippets (see
   publicSourceSnippet in wikiRoutes), so what arrives is the article, read by
   the taker's own account, for the taker to mark up. Bodies are fetched after
   the response, a few at a time, through the public-URL guard. */

const { canonicalSourceUrl, urlPattern } = require('./librarySource');

const FETCH_CONCURRENCY = 3;

const publicLink = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return /^https?:$/.test(url.protocol) ? url.toString() : '';
  } catch (_error) {
    return '';
  }
};

const fillBodies = async ({ Article, userId, urls, fetchBody }) => {
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const content = await fetchBody(url);
        if (content) await Article.updateOne({ userId, url, content: { $in: [null, ''] } }, { $set: { content } });
      } catch (error) {
        console.warn(`Could not fetch a body for ${url}:`, error?.message || error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, queue.length) }, worker));
};

/**
 * Save every public source on `pages` into the user's Library and rewire the
 * pages' source refs to those articles. Mutates `pages[].sourceRefs`.
 * Returns the receipt: how many sources, and how many the reader already had.
 */
const takeSourcesIntoLibrary = async ({ Article, userId, pages = [], label = '', fetchBody = null } = {}) => {
  if (!Article?.findOneAndUpdate) return null;
  const sources = new Map();
  pages.forEach(page => (page.sourceRefs || []).forEach((source) => {
    const url = publicLink(source?.url);
    const place = url && canonicalSourceUrl(url);
    if (place && !sources.has(place)) sources.set(place, { url, title: String(source.title || '').trim() || url });
  }));
  if (!sources.size) return { sources: 0, alreadyHad: 0 };

  const held = await Article.find({
    userId,
    url: { $in: [...sources.values()].map(source => urlPattern(source.url)).filter(Boolean) }
  }).select('_id url').lean();
  const articleIds = new Map();
  held.forEach((article) => {
    const place = canonicalSourceUrl(article.url);
    if (sources.has(place) && !articleIds.has(place)) articleIds.set(place, article._id);
  });
  const alreadyHad = articleIds.size;
  const arrived = [...sources.keys()].filter(place => !articleIds.has(place)).map(place => sources.get(place));

  for (const { url, title } of arrived) {
    const article = await Article.findOneAndUpdate(
      { userId, url },
      {
        $setOnInsert: {
          userId,
          url,
          title,
          importMeta: { provider: 'noeis', sourceType: 'shared_wiki', sourceLabel: label, sourceUrl: url, importedAt: new Date() }
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    articleIds.set(canonicalSourceUrl(url), article._id);
  }

  pages.forEach((page) => {
    page.sourceRefs = (page.sourceRefs || []).map((source) => {
      const url = publicLink(source?.url);
      const objectId = url && articleIds.get(canonicalSourceUrl(url));
      return objectId ? { ...source, type: 'article', objectId } : source;
    });
  });

  if (fetchBody && arrived.length) {
    fillBodies({ Article, userId, urls: arrived.map(source => source.url), fetchBody })
      .catch(error => console.error('Failed fetching taken sources:', error));
  }
  return { sources: sources.size, alreadyHad };
};

module.exports = { takeSourcesIntoLibrary };
