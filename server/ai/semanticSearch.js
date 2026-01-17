const { embedText } = require('./embed');
const { search } = require('./qdrantClient');
const { COLLECTIONS } = require('./embeddingJobs');

const semanticSearch = async ({ query, limit = 12, userId }) => {
  const vector = await embedText(query);
  const filter = userId ? {
    must: [{ key: 'userId', match: { value: String(userId) } }]
  } : undefined;
  const collections = [
    COLLECTIONS.highlights,
    COLLECTIONS.articles,
    COLLECTIONS.notebook,
    COLLECTIONS.questions
  ];
  const results = await Promise.all(
    collections.map(collection => search({ collection, vector, limit: 5, filter }))
  );
  const flattened = results.flat().map(item => ({
    score: item.score,
    payload: item.payload || {}
  }));
  return flattened
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => ({
      type: item.payload.type,
      objectId: item.payload.objectId,
      title: item.payload.title || '',
      snippet: item.payload.articleTitle || item.payload.title || '',
      articleId: item.payload.articleId,
      score: item.score
    }));
};

const relatedHighlights = async ({ text, excludeId, limit = 5, userId }) => {
  const vector = await embedText(text);
  const filter = userId ? {
    must: [{ key: 'userId', match: { value: String(userId) } }]
  } : undefined;
  const results = await search({ collection: COLLECTIONS.highlights, vector, limit: limit + 1, filter });
  return results
    .filter(item => String(item?.payload?.objectId) !== String(excludeId))
    .slice(0, limit)
    .map(item => ({
      objectId: item.payload.objectId,
      title: item.payload.title || '',
      articleTitle: item.payload.articleTitle || '',
      articleId: item.payload.articleId,
      score: item.score
    }));
};

module.exports = {
  semanticSearch,
  relatedHighlights
};
