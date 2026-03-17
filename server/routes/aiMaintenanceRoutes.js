const express = require('express');

const buildAiMaintenanceRouter = ({
  authenticateToken,
  isAiEnabled,
  Article,
  NotebookEntry,
  TagMeta,
  Question,
  safeMapEmbedding,
  articleToEmbeddingItems,
  highlightToEmbeddingItem,
  notebookEntryToEmbeddingItems,
  conceptToEmbeddingItem,
  questionToEmbeddingItem,
  upsertEmbeddings,
  checkUpstreamHealth,
  EmbeddingError,
  sendEmbeddingError
}) => {
  const router = express.Router();

  router.post('/api/ai/reindex', authenticateToken, async (req, res) => {
    try {
      if (!isAiEnabled()) {
        return res.status(400).json({ error: 'AI indexing is disabled.' });
      }
      if (process.env.NODE_ENV === 'production') {
        const secret = process.env.AI_REINDEX_SECRET || '';
        const header = req.headers['x-ai-reindex-secret'];
        if (!secret || header !== secret) {
          return res.status(403).json({ error: 'Reindex not permitted.' });
        }
      }

      const userId = req.user.id;
      const [articles, notebookEntries, concepts, questions] = await Promise.all([
        Article.find({ userId }).lean(),
        NotebookEntry.find({ userId }).lean(),
        TagMeta.find({ userId }).lean(),
        Question.find({ userId }).lean()
      ]);

      const items = [];

      articles.forEach(article => {
        const articleItems = safeMapEmbedding(
          () => articleToEmbeddingItems(article, String(userId)),
          'article'
        );
        if (Array.isArray(articleItems)) items.push(...articleItems);
        (article.highlights || []).forEach(highlight => {
          const highlightItem = safeMapEmbedding(
            () => highlightToEmbeddingItem(
              { ...highlight, articleId: article._id, articleTitle: article.title },
              String(userId)
            ),
            'highlight'
          );
          if (highlightItem) items.push(highlightItem);
        });
      });

      notebookEntries.forEach(entry => {
        const blockItems = safeMapEmbedding(
          () => notebookEntryToEmbeddingItems(entry, String(userId)),
          'notebook'
        );
        if (Array.isArray(blockItems)) items.push(...blockItems);
      });

      concepts.forEach(concept => {
        const conceptItem = safeMapEmbedding(
          () => conceptToEmbeddingItem(concept, String(userId)),
          'concept'
        );
        if (conceptItem) items.push(conceptItem);
      });

      questions.forEach(question => {
        const questionItem = safeMapEmbedding(
          () => questionToEmbeddingItem(question, String(userId)),
          'question'
        );
        if (questionItem) items.push(questionItem);
      });

      const batchSize = Number(process.env.AI_UPSERT_BATCH || 100);
      let indexed = 0;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await upsertEmbeddings(batch);
        indexed += batch.length;
      }

      res.status(200).json({ indexed });
    } catch (error) {
      console.error('❌ AI reindex failed:', error);
      res.status(500).json({ error: 'Failed to reindex embeddings.' });
    }
  });

  router.get('/api/ai/health', authenticateToken, async (req, res) => {
    if (!isAiEnabled()) {
      return res.status(503).json({
        error: 'AI_DISABLED',
        hint: 'Set AI_ENABLED=true to enable AI features.'
      });
    }
    try {
      const data = await checkUpstreamHealth({ requestId: req.requestId });
      res.status(200).json(data);
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(502).json({ error: 'UPSTREAM_FAILED', message: error.message });
    }
  });

  router.get('/api/ai/hf-smoke', authenticateToken, async (req, res) => {
    try {
      const data = await checkUpstreamHealth({ requestId: req.requestId });
      res.status(200).json(data);
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(502).json({ error: 'UPSTREAM_FAILED', message: error.message });
    }
  });

  return router;
};

module.exports = {
  buildAiMaintenanceRouter
};
