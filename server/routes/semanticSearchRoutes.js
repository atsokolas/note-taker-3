const crypto = require('crypto');
const express = require('express');

const SEMANTIC_RESULT_TYPES = new Set(['highlight', 'concept']);
const MARGIN_LIMIT = 5;
const MARGIN_CACHE_SIZE = 500;
const MARGIN_CACHE_MS = 30 * 60 * 1000;

const buildSemanticSearchRouter = ({
  authenticateToken,
  parseCsvList,
  normalizeConnectionItemType,
  fetchSimilarEmbeddingsWithAvailability,
  hydrateSemanticResults,
  findHighlightById,
  resolveConceptByParam,
  buildEmbeddingId,
  EmbeddingError,
  sendEmbeddingError,
  marginNotes = (...args) => require('../ai/semanticSearch').marginNotes(...args),
  now = () => Date.now()
}) => {
  const router = express.Router();
  /* Reopening an article asks the same question of the same paragraphs, so
     the answer is kept for a while, per person and per text. A new highlight
     elsewhere is picked up when the entry ages out. */
  const marginCache = new Map();

  const parseSemanticResultTypes = (value, fallback = ['highlight']) => {
    const parsed = parseCsvList(value)
      .map(type => normalizeConnectionItemType(type))
      .filter(type => SEMANTIC_RESULT_TYPES.has(type));
    if (parsed.length === 0) return fallback;
    return Array.from(new Set(parsed));
  };

  const toSimilarityBand = (score) => {
    const safeScore = Number(score);
    if (!Number.isFinite(safeScore) || safeScore <= 0) return 'Low';
    if (safeScore >= 0.82) return 'High';
    if (safeScore >= 0.72) return 'Medium';
    return 'Low';
  };

  const buildSemanticSourceId = async (sourceType, sourceId, userId) => {
    const safeType = normalizeConnectionItemType(sourceType);
    const safeSourceId = String(sourceId || '').trim();
    if (!safeType || !safeSourceId) return null;
    if (safeType === 'highlight') {
      const highlight = await findHighlightById(userId, safeSourceId);
      if (!highlight) return null;
      return {
        sourceType: 'highlight',
        sourceObjectId: String(highlight._id),
        embeddingId: buildEmbeddingId({
          userId: String(userId),
          objectType: 'highlight',
          objectId: String(highlight._id)
        })
      };
    }
    if (safeType === 'concept') {
      const concept = await resolveConceptByParam(userId, safeSourceId, { createIfMissing: false });
      if (!concept) return null;
      return {
        sourceType: 'concept',
        sourceObjectId: String(concept._id),
        embeddingId: buildEmbeddingId({
          userId: String(userId),
          objectType: 'concept',
          objectId: String(concept._id)
        })
      };
    }
    return null;
  };

  const normalizeRelatedLimit = (value, fallback = 8) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.round(parsed), 1), 20);
  };

  router.get('/api/semantic/related', authenticateToken, async (req, res) => {
    try {
      const sourceType = normalizeConnectionItemType(req.query.sourceType);
      const sourceId = String(req.query.sourceId || '').trim();
      const limit = normalizeRelatedLimit(req.query.limit, 6);
      if (!sourceType || !['highlight', 'concept'].includes(sourceType)) {
        return res.status(400).json({ error: 'sourceType must be highlight or concept.' });
      }
      if (!sourceId) {
        return res.status(400).json({ error: 'sourceId is required.' });
      }

      const source = await buildSemanticSourceId(sourceType, sourceId, req.user.id);
      if (!source) {
        return res.status(404).json({ error: 'Source item not found.' });
      }

      const requestedTypes = parseSemanticResultTypes(req.query.resultTypes, ['highlight']);
      const { results: matches, modelAvailable } = await fetchSimilarEmbeddingsWithAvailability({
        userId: req.user.id,
        sourceId: source.embeddingId,
        types: requestedTypes,
        limit: Math.min(limit + 4, 24)
      });
      let results = await hydrateSemanticResults({ matches, userId: req.user.id });
      const allowSet = new Set(requestedTypes);
      results = results.filter(item => allowSet.has(item.objectType));
      results = results.filter(item => !(
        item.objectType === source.sourceType
        && String(item.objectId) === String(source.sourceObjectId)
      ));
      if (source.sourceType === 'concept') {
        results.sort((a, b) => {
          if (a.objectType === b.objectType) {
            return (Number(b.score) || 0) - (Number(a.score) || 0);
          }
          if (a.objectType === 'highlight') return -1;
          if (b.objectType === 'highlight') return 1;
          return 0;
        });
      }
      results = results.slice(0, limit).map(item => ({
        ...item,
        similarityBand: toSimilarityBand(item.score)
      }));

      res.status(200).json({
        results,
        meta: {
          sourceType: source.sourceType,
          sourceId: source.sourceObjectId,
          modelAvailable,
          explanationVersion: 'v1'
        }
      });
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  /* The one engine behind both margins: an article's paragraphs while you
     read, the paragraph you are writing in a note. Any failure is silence. */
  router.post('/api/semantic/margins', authenticateToken, async (req, res) => {
    const paragraphs = (Array.isArray(req.body?.paragraphs) ? req.body.paragraphs : [])
      .map(text => String(text || '').slice(0, 4000));
    const articleId = String(req.body?.articleId || '').trim();
    const excludeHighlightIds = (Array.isArray(req.body?.excludeHighlightIds) ? req.body.excludeHighlightIds : [])
      .map(String).slice(0, 200);
    const key = crypto.createHash('sha1')
      .update(JSON.stringify([String(req.user.id), articleId, [...excludeHighlightIds].sort(), paragraphs]))
      .digest('hex');
    const kept = marginCache.get(key);
    if (kept && now() - kept.at < MARGIN_CACHE_MS) return res.status(200).json({ notes: kept.notes });
    try {
      const notes = await marginNotes({
        userId: String(req.user.id), paragraphs, articleId, excludeHighlightIds, limit: MARGIN_LIMIT
      });
      marginCache.delete(key);
      marginCache.set(key, { at: now(), notes });
      if (marginCache.size > MARGIN_CACHE_SIZE) marginCache.delete(marginCache.keys().next().value);
      return res.status(200).json({ notes });
    } catch (error) {
      console.warn('[MARGINS] lookup failed', { message: String(error?.message || error).slice(0, 160) });
      return res.status(200).json({ notes: [] });
    }
  });

  return router;
};

module.exports = {
  buildSemanticSearchRouter
};
