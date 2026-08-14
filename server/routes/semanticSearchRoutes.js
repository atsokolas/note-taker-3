const express = require('express');

const SEMANTIC_RESULT_TYPES = new Set(['highlight', 'concept']);

const buildSemanticSearchRouter = ({
  authenticateToken,
  parseCsvList,
  normalizeConnectionItemType,
  isAiEnabled,
  atlasSemanticSearch,
  aiSimilarTo,
  hydrateSemanticResults,
  findHighlightById,
  resolveConceptByParam,
  buildEmbeddingId,
  markTourSignal,
  EmbeddingError,
  sendEmbeddingError
}) => {
  const router = express.Router();

  const normalizeSearchTypes = (types) => {
    if (!Array.isArray(types)) return undefined;
    return types
      .map((type) => String(type || '').trim())
      .filter(Boolean)
      .map((type) => {
        if (type === 'notebook' || type === 'notebook_entry') return 'notebook_block';
        return type;
      });
  };

  const normalizeRelatedTypes = (types) => normalizeSearchTypes(types);

  const parseSemanticResultTypes = (value, fallback = ['highlight']) => {
    const parsed = parseCsvList(value)
      .map(type => normalizeConnectionItemType(type))
      .filter(type => SEMANTIC_RESULT_TYPES.has(type));
    if (parsed.length === 0) return fallback;
    return Array.from(new Set(parsed));
  };

  const isAiRouteMissingError = (error) => {
    if (!error || Number(error.status) !== 404) return false;
    const detail = String(error?.payload?.detail || '').trim();
    return detail === 'Not Found' && error?.payload?.upstream === 'ai_service';
  };

  const isAiTransientCapacityError = (error) => {
    const status = Number(error?.status);
    if (![429, 502, 503, 504].includes(status)) return false;
    const detail = String(error?.payload?.detail || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return (
      status === 429 ||
      detail.includes('rate-limited') ||
      detail.includes('credits depleted') ||
      message.includes('service error 429') ||
      message.includes('timed out')
    );
  };

  const fetchSimilarEmbeddingsWithAvailability = async ({ userId, sourceId, types, limit, requestId }) => {
    if (!isAiEnabled()) {
      return { results: [], modelAvailable: false };
    }
    try {
      const response = await aiSimilarTo({
        userId: String(userId),
        sourceId: String(sourceId),
        types,
        limit
      }, { requestId });
      return {
        results: Array.isArray(response?.results) ? response.results : [],
        modelAvailable: true
      };
    } catch (error) {
      if (isAiRouteMissingError(error)) {
        console.warn('[AI-UPSTREAM] similar endpoint missing on ai_service; returning empty results', {
          requestId,
          sourceId: String(sourceId),
          types: Array.isArray(types) ? types : []
        });
        return { results: [], modelAvailable: false };
      }
      if (isAiTransientCapacityError(error)) {
        console.warn('[AI-UPSTREAM] similar endpoint transient upstream error; returning empty results', {
          requestId,
          sourceId: String(sourceId),
          status: Number(error?.status) || 0
        });
        return { results: [], modelAvailable: false };
      }
      throw error;
    }
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

  const handleSemanticSearch = async (req, res, query, rawTypes, rawLimit) => {
    if (!isAiEnabled()) {
      return res.status(503).json({ error: 'AI_DISABLED', hint: 'Set AI_ENABLED=true to enable AI search.' });
    }
    const q = String(query || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Query is required.' });
    }
    const limit = Math.min(Number(rawLimit) || 12, 30);
    const types = normalizeSearchTypes(rawTypes);
    try {
      // Atlas, not ai_service. That service kept its vectors in a JSON file
      // under /tmp, which Render wipes on every deploy and every idle
      // spin-down, so its index emptied itself and this route answered "no
      // results" for a corpus of thousands. Embeddings still come from
      // ai_service; storage does not.
      const rows = await atlasSemanticSearch({
        userId: String(req.user.id),
        query: q,
        limit,
        ...(Array.isArray(types) && types.length ? { types } : {})
      });
      const matches = (Array.isArray(rows) ? rows : []).map(row => ({
        id: row.objectId,
        score: row.score,
        metadata: {
          objectType: row.type,
          objectId: row.objectId,
          subId: row.subId || '',
          title: row.title,
          articleId: row.articleId
        }
      }));
      const results = await hydrateSemanticResults({ matches, userId: req.user.id });
      // This route returns an empty set in production while the same call
      // against the same account returns five scored rows from a shell. Every
      // layer has been proven in isolation, so record which one drops the
      // result rather than reason about it from outside: the account being
      // searched, whether retrieval saw anything, and whether hydration kept
      // it. Silent empty is the failure mode this system keeps repeating.
      console.log('[SEMANTIC-SEARCH]', JSON.stringify({
        userId: String(req.user.id),
        query: q.slice(0, 60),
        types: Array.isArray(types) && types.length ? types : 'default',
        rows: Array.isArray(rows) ? rows.length : -1,
        hydrated: Array.isArray(results) ? results.length : -1
      }));
      await markTourSignal(req.user.id, 'semanticSearchUsed', 'semantic_search_used');
      res.status(200).json({ results });
    } catch (error) {
      // An empty result set and a broken backend must not look identical to
      // the caller — that equivalence is how two vector stores died unnoticed.
      // Report the degradation instead of dressing it up as "you have nothing".
      if (isAiRouteMissingError(error) || isAiTransientCapacityError(error)) {
        console.warn('[SEARCH] embedding upstream unavailable; reporting degraded rather than empty', {
          requestId: req.requestId,
          status: Number(error?.status) || 0
        });
        return res.status(503).json({
          error: 'Search is temporarily unavailable — the service that reads your library is not responding. This is not zero results; it is unknown results.',
          code: 'SEARCH_UNAVAILABLE'
        });
      }
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(500).json({ error: error.message });
    }
  };

  router.get('/api/search/semantic', authenticateToken, async (req, res) => {
    await handleSemanticSearch(req, res, req.query.q, req.query.types, req.query.limit);
  });

  router.post('/api/search/semantic', authenticateToken, async (req, res) => {
    const { query, types, limit } = req.body || {};
    await handleSemanticSearch(req, res, query, types, limit);
  });

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
      const normalizedTypes = normalizeRelatedTypes(requestedTypes);
      const { results: matches, modelAvailable } = await fetchSimilarEmbeddingsWithAvailability({
        userId: req.user.id,
        sourceId: source.embeddingId,
        types: normalizedTypes,
        limit: Math.min(limit + 4, 24),
        requestId: req.requestId
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

  return router;
};

module.exports = {
  buildSemanticSearchRouter
};
