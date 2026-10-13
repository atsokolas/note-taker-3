const express = require('express');

const buildAiMaintenanceRouter = ({ authenticateToken, EmbeddingJob }) => {
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

  router.post('/api/ai/embedding-jobs/:id/retry', authenticateToken, async (req, res) => {
    if (!EmbeddingJob?.findOne) {
      return res.status(503).json({ error: 'Durable search jobs are unavailable.' });
    }
    try {
      const jobId = String(req.params.id || '').trim();
      if (!jobId) return res.status(400).json({ error: 'Search job id is required.' });
      const userId = String(req.user.id || '');
      const job = await EmbeddingJob.findOne({
        _id: jobId,
        'payload.userId': userId
      });
      if (!job) return res.status(404).json({ error: 'Search job not found.' });
      if (!['failed', 'abandoned'].includes(String(job.status || '').toLowerCase())) {
        return res.status(409).json({ error: `Search job is ${job.status || 'not retryable'}.` });
      }

      job.status = 'queued';
      job.nextRunAt = new Date();
      job.lockedAt = null;
      job.lastError = '';
      job.completedAt = null;
      await job.save();

      return res.status(200).json({
        job: serializeEmbeddingJob(job),
        recovery: {
          kind: 'retry_search_for_existing_object',
          objectId: String(job.objectId || ''),
          collection: String(job.collection || ''),
          reimported: false
        }
      });
    } catch (error) {
      if (error?.name === 'CastError') {
        return res.status(400).json({ error: 'Search job id is invalid.' });
      }
      console.error('❌ Failed to retry embedding job:', error);
      return res.status(500).json({ error: 'Failed to retry search preparation.' });
    }
  });

  return router;
};

module.exports = {
  buildAiMaintenanceRouter
};
