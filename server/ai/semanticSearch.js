const { embedText } = require('./embed');
const { searchVectorItems } = require('./vectorStore');
const { VectorItem } = require('../models');

/**
 * Semantic search over the Atlas vector index.
 *
 * Previously this fanned out across four Qdrant collections and merged the
 * results by score. One collection with an `objectType` filter does the same
 * job in a single query, and — unlike the fan-out — respects `limit` honestly
 * rather than taking the top five of each type regardless of relevance.
 */

const DEFAULT_TYPES = ['highlight', 'article', 'notebook_entry', 'question'];

const toResult = (row = {}) => ({
  type: row.objectType,
  objectId: row.objectId,
  subId: row.subId || '',
  title: row.metadata?.title || '',
  snippet: row.metadata?.articleTitle || row.metadata?.title || '',
  articleId: row.metadata?.articleId || '',
  score: row.score
});

const semanticSearch = async ({ query, limit = 12, userId, types = DEFAULT_TYPES, models = {} } = {}) => {
  if (!userId) return [];
  const vector = await embedText(query);
  const rows = await searchVectorItems({
    VectorItem: models.VectorItem || VectorItem,
    userId,
    vector,
    limit,
    objectTypes: types
  });
  return rows.map(toResult);
};

const relatedHighlights = async ({ text, excludeId, limit = 5, userId, models = {} } = {}) => {
  if (!userId) return [];
  const vector = await embedText(text);
  const rows = await searchVectorItems({
    VectorItem: models.VectorItem || VectorItem,
    userId,
    vector,
    limit: limit + 1,
    objectTypes: ['highlight']
  });
  return rows
    .filter(row => String(row.objectId) !== String(excludeId))
    .slice(0, limit)
    .map(row => ({
      objectId: row.objectId,
      title: row.metadata?.title || '',
      articleTitle: row.metadata?.articleTitle || '',
      articleId: row.metadata?.articleId || '',
      score: row.score
    }));
};

module.exports = {
  semanticSearch,
  relatedHighlights,
  DEFAULT_TYPES
};
