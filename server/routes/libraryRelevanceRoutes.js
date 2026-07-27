const express = require('express');
const {
  LIBRARY_RELEVANCE_VIEWS,
  buildLibraryRelevancePage,
  buildLibrarySourceDetail
} = require('../services/libraryRelevanceService');
const {
  buildMixedLibraryRelevancePage,
  decodeCursor
} = require('../services/libraryMixedSourceService');

const parseLimit = value => {
  if (value === undefined || value === null || value === '') return 40;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return Math.min(parsed, 100);
};
const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());

const buildLibraryRelevanceRouter = ({
  authenticateToken,
  ...models
} = {}) => {
  const router = express.Router();

  router.get('/api/library/relevance', authenticateToken, async (req, res) => {
    const view = String(req.query.view || 'recent').trim();
    if (!LIBRARY_RELEVANCE_VIEWS.includes(view)) {
      return res.status(400).json({
        error: `view must be one of: ${LIBRARY_RELEVANCE_VIEWS.join(', ')}.`
      });
    }
    const limit = parseLimit(req.query.limit);
    if (limit === undefined) {
      return res.status(400).json({ error: 'limit must be a positive integer.' });
    }
    const sourceScope = String(req.query.sourceScope || 'articles').trim();
    if (!['articles', 'mixed'].includes(sourceScope)) {
      return res.status(400).json({ error: 'sourceScope must be articles or mixed.' });
    }
    const cursor = String(req.query.cursor || '').trim();
    if (cursor && sourceScope !== 'mixed') {
      return res.status(400).json({ error: 'cursor requires sourceScope=mixed.' });
    }
    if (cursor) {
      try {
        decodeCursor(cursor, view);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }

    try {
      const page = sourceScope === 'mixed'
        ? await buildMixedLibraryRelevancePage({
          userId: req.user.id,
          models,
          view,
          limit,
          cursor
        })
        : await buildLibraryRelevancePage({
          userId: req.user.id,
          models,
          view,
          limit
        });
      return res.status(200).json({
        view,
        sourceScope,
        ...page,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error building Library relevance:', error);
      return res.status(500).json({ error: 'Failed to load Library relevance.' });
    }
  });

  router.get('/api/library/relevance/:articleId', authenticateToken, async (req, res) => {
    const articleId = String(req.params.articleId || '').trim();
    if (!isObjectId(articleId)) {
      return res.status(400).json({ error: 'articleId must be a valid object id.' });
    }

    try {
      const source = await buildLibrarySourceDetail({
        userId: req.user.id,
        articleId,
        models
      });
      if (!source) {
        return res.status(404).json({ error: 'Library source not found.' });
      }
      return res.status(200).json({
        source,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error building Library source detail:', error);
      return res.status(500).json({ error: 'Failed to load Library source context.' });
    }
  });

  return router;
};

module.exports = {
  buildLibraryRelevanceRouter,
  isObjectId,
  parseLimit
};
