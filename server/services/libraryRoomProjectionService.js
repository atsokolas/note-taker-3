const { buildMixedLibraryRelevancePage } = require('./libraryMixedSourceService');
const { feedFolderIdsFrom, rankFeedTopics } = require('../lib/feedHome');

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

const feedArrivals = async (Article, query, feedFolderIds) => {
  if (!feedFolderIds.length || typeof Article?.aggregate !== 'function') return [];
  return Article.aggregate([
    {
      $match: {
        ...query,
        folder: { $in: feedFolderIds },
        placement: { $nin: ['later', 'setAside'] }
      }
    },
    {
      $group: {
        _id: '$folder',
        count: { $sum: 1 },
        arrivedAt: { $max: { $ifNull: ['$updatedAt', '$createdAt'] } }
      }
    }
  ]);
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

  const folders = typeof getFoldersWithCounts === 'function' ? await getFoldersWithCounts(userId) : [];
  const feedFolderIds = feedFolderIdsFrom(folders);
  const imboxQuery = {
    ...visibleQuery,
    placement: { $nin: ['later', 'setAside'] },
    ...(feedFolderIds.length ? { folder: { $nin: feedFolderIds } } : {})
  };

  const laterQuery = { ...visibleQuery, placement: 'later' };
  const setAsideQuery = { ...visibleQuery, placement: 'setAside' };

  const [relevance, rawArticles, visibleArticles, unfiledArticles, keptArticles, laterArticles, setAsideArticles, laterPile, setAsidePile, arrivals, ordinaryVisibleArticles] = await Promise.all([
    buildMixedLibraryRelevancePage({
      userId,
      models,
      view,
      limit,
      includeSuppressed
    }),
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
    findPile(Article, setAsideQuery, -1),
    feedArrivals(Article, visibleQuery, feedFolderIds),
    count(Article, ordinaryVisibleQuery)
  ]);

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
      },
      feedTopics: rankFeedTopics(folders, arrivals)
    }
  };
};

module.exports = {
  buildLibraryRoomProjection,
  visibleArticleQuery
};
