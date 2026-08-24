const { buildMixedLibraryRelevancePage } = require('./libraryMixedSourceService');

const visibleArticleQuery = (userId, includeSuppressed) => (
  includeSuppressed
    ? { userId }
    : {
      userId,
      hiddenFromHome: { $ne: true },
      debugOnly: { $ne: true },
      archived: { $ne: true }
    }
);

const count = async (Article, query) => (
  typeof Article?.countDocuments === 'function'
    ? Article.countDocuments(query)
    : 0
);

const buildLibraryRoomProjection = async ({
  userId,
  models = {},
  getFoldersWithCounts,
  view = 'recent',
  limit = 40,
  includeSuppressed = false
} = {}) => {
  const { Article } = models;
  const visibleQuery = visibleArticleQuery(userId, includeSuppressed);
  const ordinaryVisibleQuery = visibleArticleQuery(userId, false);

  const [relevance, folders, rawArticles, visibleArticles, unfiledArticles, keptArticles] = await Promise.all([
    buildMixedLibraryRelevancePage({
      userId,
      models,
      view,
      limit,
      includeSuppressed
    }),
    typeof getFoldersWithCounts === 'function' ? getFoldersWithCounts(userId) : [],
    count(Article, { userId }),
    count(Article, visibleQuery),
    count(Article, {
      ...visibleQuery,
      $or: [{ folder: null }, { folder: { $exists: false } }]
    }),
    count(Article, { ...visibleQuery, evergreen: true })
  ]);

  const ordinaryVisibleArticles = includeSuppressed
    ? await count(Article, ordinaryVisibleQuery)
    : visibleArticles;

  return {
    ...relevance,
    shelves: {
      folders: Array.isArray(folders) ? folders : [],
      counts: {
        articles: visibleArticles,
        rawArticles,
        unfiledArticles,
        keptArticles,
        suppressedArticles: Math.max(0, rawArticles - ordinaryVisibleArticles)
      }
    }
  };
};

module.exports = {
  buildLibraryRoomProjection,
  visibleArticleQuery
};
