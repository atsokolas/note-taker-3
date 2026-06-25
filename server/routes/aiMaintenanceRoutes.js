const express = require('express');

const buildAiMaintenanceRouter = ({
  authenticateToken,
  isAiEnabled,
  Article,
  NotebookEntry,
  TagMeta,
  Question,
  EmbeddingJob,
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

  const emptyEmbeddingJobStatus = () => ({
    status: 'ready',
    counts: {
      queued: 0,
      running: 0,
      failed: 0,
      abandoned: 0,
      completed: 0,
      total: 0
    },
    failedJobs: []
  });

  const serializeEmbeddingJob = (job = {}) => ({
    id: String(job._id || job.id || ''),
    collection: String(job.collection || ''),
    objectId: String(job.objectId || ''),
    status: String(job.status || ''),
    attemptCount: Number(job.attemptCount || 0),
    nextRunAt: job.nextRunAt || null,
    lastAttemptAt: job.lastAttemptAt || null,
    updatedAt: job.updatedAt || null,
    lastError: String(job.lastError || '').slice(0, 240)
  });

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
      return res.status(200).json({
        status: 'disabled',
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

  router.get('/api/ai/embedding-jobs/status', authenticateToken, async (req, res) => {
    if (!EmbeddingJob?.find) {
      return res.status(200).json(emptyEmbeddingJobStatus());
    }

    try {
      const userId = String(req.user.id || '');
      const userIds = Array.from(new Set([userId, req.user.id].filter(Boolean)));
      const query = {
        $or: userIds.map(id => ({ 'payload.userId': id }))
      };
      const jobs = await EmbeddingJob.find(query)
        .select('collection objectId status attemptCount nextRunAt lastAttemptAt updatedAt lastError')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(500)
        .lean();

      const counts = {
        queued: 0,
        running: 0,
        failed: 0,
        abandoned: 0,
        completed: 0,
        total: jobs.length
      };
      jobs.forEach((job) => {
        const status = String(job.status || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
      });

      const failedJobs = jobs
        .filter(job => ['failed', 'abandoned'].includes(String(job.status || '').toLowerCase()))
        .slice(0, 5)
        .map(serializeEmbeddingJob);

      const status = counts.failed || counts.abandoned
        ? 'warning'
        : (counts.queued || counts.running ? 'working' : 'ready');

      return res.status(200).json({
        status,
        counts,
        failedJobs
      });
    } catch (error) {
      console.error('❌ Failed to load embedding job status:', error);
      return res.status(500).json({ error: 'Failed to load embedding job status.' });
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
