const mongoose = require('mongoose');
const { embedText } = require('./embed');
const { searchVectorItems, similarToVectorItem } = require('./vectorStore');
const { VectorItem, TagMeta } = require('../models');

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

/* "More like this" for one source. A stored item reuses its vector, so the
   lookup costs no embedding call; a note is stored whole, as its
   notebook_entry, whichever block asked. A concept has no vector of its own,
   so its name and description are the question. */
const similarToSource = async ({ userId, objectType, objectId, subId = '', limit = 10, types = [], models = {} } = {}) => {
  const vectors = models.VectorItem || VectorItem;
  if (objectType === 'concept') {
    const concept = mongoose.Types.ObjectId.isValid(objectId)
      ? await (models.TagMeta || TagMeta).findOne({ _id: objectId, userId }).select('name description').lean()
      : null;
    const text = [concept?.name, concept?.description].map(part => String(part || '').trim()).filter(Boolean).join('. ');
    if (!text) return [];
    return searchVectorItems({ VectorItem: vectors, userId, vector: await embedText(text), limit, objectTypes: types });
  }
  const note = objectType === 'notebook_block';
  return similarToVectorItem({
    VectorItem: vectors,
    userId,
    objectType: note ? 'notebook_entry' : objectType,
    objectId,
    subId: note ? '' : subId,
    limit,
    objectTypes: types
  });
};

module.exports = {
  semanticSearch,
  relatedHighlights,
  similarToSource,
  DEFAULT_TYPES
};
