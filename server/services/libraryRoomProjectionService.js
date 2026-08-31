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

const PILE_SELECT = '_id title url author siteName placement placementAt createdAt updatedAt evergreen evergreenAt';

const findPile = async (Article, query, direction) => {
  if (typeof Article?.find !== 'function') return [];
  let cursor = Article.find(query);
  if (cursor.select) cursor = cursor.select(PILE_SELECT);
  if (cursor.sort) cursor = cursor.sort({ placementAt: direction, createdAt: direction });
  if (cursor.lean) cursor = cursor.lean();
  const rows = await cursor;
  return (Array.isArray(rows) ? rows : []).map((row) => (
    row?.toObject ? row.toObject({ virtuals: false }) : row
  ));
};

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

  const imboxQuery = { ...visibleQuery, placement: { $nin: ['later', 'setAside'] } };

  const laterQuery = { ...visibleQuery, placement: 'later' };
  const setAsideQuery = { ...visibleQuery, placement: 'setAside' };

  const [relevance, folders, rawArticles, visibleArticles, unfiledArticles, keptArticles, laterArticles, setAsideArticles, laterPile, setAsidePile] = await Promise.all([
    buildMixedLibraryRelevancePage({
      userId,
      models,
      view,
      limit,
      includeSuppressed
    }),
    typeof getFoldersWithCounts === 'function' ? getFoldersWithCounts(userId) : [],
    count(Article, { userId }),
    count(Article, imboxQuery),
    count(Article, {
      ...imboxQuery,
      $or: [{ folder: null }, { folder: { $exists: false } }]
    }),
    count(Article, { ...visibleQuery, evergreen: true }),
    count(Article, laterQuery),
    count(Article, setAsideQuery),
    findPile(Article, laterQuery, 1),
    findPile(Article, setAsideQuery, -1)
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
        laterArticles,
        setAsideArticles,
        suppressedArticles: Math.max(0, rawArticles - ordinaryVisibleArticles)
      },
      piles: {
        later: laterPile,
        setAside: setAsidePile
      }
    }
  };
};

module.exports = {
  buildLibraryRoomProjection,
  visibleArticleQuery
};
