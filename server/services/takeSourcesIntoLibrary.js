/* Taking someone's wiki used to bring their pages and leave their reading
   behind: each source arrived as a title and a link inside a page, and the
   Library — where the partner, retrieval and every check against a held view
   start — stayed empty. A wiki you can't open the sources of is a summary of
   someone else's afternoon.

   So the sources come too. Each public link is saved into the taker's Library
   as an article, the page's footnotes point at that article instead of at a
   bare URL, and anything the taker already saved is used as it stands and
   counted, never overwritten.

   Passages do not travel. A public page carries no snippets (see
   publicSourceSnippet in wikiRoutes), so what arrives is the article, read by
   the taker's own account, for the taker to mark up. Bodies are fetched after
   the response, a few at a time, through the public-URL guard. */

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
  const titles = new Map();
  pages.forEach(page => (page.sourceRefs || []).forEach((source) => {
    const url = publicLink(source?.url);
    if (url && !titles.has(url)) titles.set(url, String(source.title || '').trim() || url);
  }));
  if (!titles.size) return { sources: 0, alreadyHad: 0 };

  const urls = [...titles.keys()];
  const held = await Article.find({ userId, url: { $in: urls } }).select('_id url').lean();
  const articleIds = new Map(held.map(article => [article.url, article._id]));
  const alreadyHad = articleIds.size;
  const arrived = urls.filter(url => !articleIds.has(url));

  for (const url of arrived) {
    const article = await Article.findOneAndUpdate(
      { userId, url },
      {
        $setOnInsert: {
          userId,
          url,
          title: titles.get(url),
          importMeta: { provider: 'noeis', sourceType: 'shared_wiki', sourceLabel: label, sourceUrl: url, importedAt: new Date() }
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    articleIds.set(url, article._id);
  }

  pages.forEach((page) => {
    page.sourceRefs = (page.sourceRefs || []).map((source) => {
      const objectId = articleIds.get(publicLink(source?.url));
      return objectId ? { ...source, type: 'article', objectId } : source;
    });
  });

  if (fetchBody && arrived.length) {
    fillBodies({ Article, userId, urls: arrived, fetchBody })
      .catch(error => console.error('Failed fetching taken sources:', error));
  }
  return { sources: urls.length, alreadyHad };
};

module.exports = { takeSourcesIntoLibrary };
