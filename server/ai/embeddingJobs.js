const { enqueue, registerHandler } = require('./jobQueue');
const { embedText } = require('./embed');
const { upsertVector } = require('./qdrantClient');
const { EmbeddingJob } = require('../models');

const COLLECTIONS = {
  highlights: 'highlights',
  articles: 'articles',
  notebook: 'notebook_entries',
  questions: 'questions'
};

const trimText = (value = '', max = 4000) => {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) : text;
};

const buildNotebookText = (entry) => {
  if (!entry) return '';
  if (Array.isArray(entry.blocks) && entry.blocks.length > 0) {
    return trimText([
      entry.title || '',
      ...entry.blocks.map(block => block.text || '')
    ].filter(Boolean).join('\n'));
  }
  return trimText(`${entry.title || ''}\n${entry.content || ''}`);
};

const buildQuestionText = (question) => {
  if (!question) return '';
  if (Array.isArray(question.blocks) && question.blocks.length > 0) {
    return trimText([
      question.text || '',
      ...question.blocks.map(block => block.text || '')
    ].filter(Boolean).join('\n'));
  }
  return trimText(question.text || '');
};

const buildHighlightText = (highlight) => {
  if (!highlight) return '';
  return trimText([highlight.text, highlight.note].filter(Boolean).join('\n'));
};

const buildArticleText = (article) => (
  trimText([article?.title, article?.content].filter(Boolean).join('\n'))
);

const now = () => new Date();

const persistentQueueEnabled = () => process.env.EMBEDDING_PERSISTENT_QUEUE_DISABLED !== 'true';

const retryDelayMs = ({ attemptCount = 0 } = {}) => {
  const baseMs = Math.max(1000, Number(process.env.EMBEDDING_RETRY_BASE_MS || 60 * 1000));
  const maxMs = Math.max(baseMs, Number(process.env.EMBEDDING_RETRY_MAX_MS || 60 * 60 * 1000));
  const exponent = Math.max(0, Math.min(Number(attemptCount || 0), 8));
  return Math.min(maxMs, baseMs * (2 ** exponent));
};

const canPersistEmbeddingJobs = (model = EmbeddingJob) => (
  persistentQueueEnabled()
  && model
  && typeof model.findOneAndUpdate === 'function'
);

const persistEmbeddingJob = async ({ collection, id, text, payload, model = EmbeddingJob }) => {
  if (!collection || !id || !canPersistEmbeddingJobs(model)) return null;
  const runAt = now();
  return model.findOneAndUpdate(
    { collection, objectId: String(id) },
    {
      $set: {
        collection,
        objectId: String(id),
        text: trimText(text, 8000),
        payload: payload || {},
        status: 'queued',
        nextRunAt: runAt,
        lockedAt: null,
        completedAt: null,
        lastError: ''
      },
      $setOnInsert: {
        attemptCount: 0
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const enqueueEmbedding = ({ collection, id, text, payload }) => {
  if (canPersistEmbeddingJobs()) {
    return persistEmbeddingJob({ collection, id, text, payload })
      .catch(error => {
        console.error('❌ Failed to persist embedding job; using transient queue:', error.message || error);
        enqueue('embedding', { collection, id, text, payload });
      });
  }
  enqueue('embedding', { collection, id, text, payload });
  return null;
};

registerHandler('embedding', async ({ collection, id, text, payload }) => {
  const vector = await embedText(text);
  await upsertVector({ collection, id, vector, payload });
});

const claimDueEmbeddingJob = async ({
  model = EmbeddingJob,
  staleAfterMs = Number(process.env.EMBEDDING_JOB_STALE_AFTER_MS || 15 * 60 * 1000),
  at = now()
} = {}) => {
  if (!canPersistEmbeddingJobs(model)) return null;
  const staleBefore = new Date(at.getTime() - Math.max(60 * 1000, Number(staleAfterMs) || 15 * 60 * 1000));
  return model.findOneAndUpdate(
    {
      $or: [
        {
          status: { $in: ['queued', 'failed'] },
          $or: [
            { nextRunAt: null },
            { nextRunAt: { $exists: false } },
            { nextRunAt: { $lte: at } }
          ]
        },
        {
          status: 'running',
          lockedAt: { $lte: staleBefore }
        }
      ]
    },
    {
      $set: {
        status: 'running',
        lockedAt: at,
        lastAttemptAt: at
      },
      $inc: { attemptCount: 1 }
    },
    { sort: { nextRunAt: 1, createdAt: 1 }, new: true }
  );
};

const markEmbeddingJobCompleted = async ({ model = EmbeddingJob, job, at = now() } = {}) => {
  if (!model || !job?._id) return null;
  return model.updateOne(
    { _id: job._id },
    {
      $set: {
        status: 'completed',
        completedAt: at,
        lockedAt: null,
        nextRunAt: null,
        lastError: ''
      }
    }
  );
};

const markEmbeddingJobFailed = async ({
  model = EmbeddingJob,
  job,
  error,
  at = now(),
  maxAttempts = Number(process.env.EMBEDDING_JOB_MAX_ATTEMPTS || 20)
} = {}) => {
  if (!model || !job?._id) return null;
  const attempts = Math.max(1, Number(job.attemptCount || 1));
  const terminal = attempts >= Math.max(1, Number(maxAttempts) || 20);
  const message = String(error?.message || error || 'Embedding job failed.').slice(0, 1000);
  const nextRunAt = terminal ? null : new Date(at.getTime() + retryDelayMs({ attemptCount: attempts }));
  return model.updateOne(
    { _id: job._id },
    {
      $set: {
        status: terminal ? 'abandoned' : 'failed',
        lockedAt: null,
        nextRunAt,
        lastError: message
      }
    }
  );
};

const drainEmbeddingJobQueue = async ({
  model = EmbeddingJob,
  limit = Number(process.env.EMBEDDING_JOB_WORKER_BATCH_SIZE || 5),
  maxAttempts = Number(process.env.EMBEDDING_JOB_MAX_ATTEMPTS || 20),
  embedTextFn = embedText,
  upsertVectorFn = upsertVector,
  at = now()
} = {}) => {
  if (!canPersistEmbeddingJobs(model)) return { processed: 0, failed: 0, skipped: true, results: [] };
  const max = Math.max(1, Math.min(Number(limit) || 5, 50));
  const results = [];
  for (let i = 0; i < max; i += 1) {
    const job = await claimDueEmbeddingJob({ model, at });
    if (!job) break;
    try {
      const vector = await embedTextFn(job.text || '');
      await upsertVectorFn({
        collection: job.collection,
        id: job.objectId,
        vector,
        payload: job.payload || {}
      });
      await markEmbeddingJobCompleted({ model, job, at: now() });
      results.push({ jobId: String(job._id), status: 'completed' });
    } catch (error) {
      await markEmbeddingJobFailed({ model, job, error, at: now(), maxAttempts });
      results.push({ jobId: String(job._id), status: 'failed', error: error.message || String(error) });
    }
  }
  return {
    processed: results.filter(result => result.status === 'completed').length,
    failed: results.filter(result => result.status === 'failed').length,
    results
  };
};

const enqueueHighlightEmbedding = ({ highlight, article }) => {
  if (!highlight || !article) return;
  enqueueEmbedding({
    collection: COLLECTIONS.highlights,
    id: String(highlight._id),
    text: buildHighlightText(highlight),
    payload: {
      type: 'highlight',
      objectId: String(highlight._id),
      title: highlight.text || '',
      articleTitle: article.title || '',
      articleId: String(article._id),
      tags: highlight.tags || [],
      createdAt: highlight.createdAt || article.createdAt || new Date().toISOString(),
      userId: String(article.userId)
    }
  });
};

const enqueueArticleEmbedding = (article) => {
  if (!article) return;
  enqueueEmbedding({
    collection: COLLECTIONS.articles,
    id: String(article._id),
    text: buildArticleText(article),
    payload: {
      type: 'article',
      objectId: String(article._id),
      title: article.title || '',
      tags: [],
      createdAt: article.createdAt || new Date().toISOString(),
      userId: String(article.userId)
    }
  });
};

const enqueueNotebookEmbedding = (entry) => {
  if (!entry) return;
  enqueueEmbedding({
    collection: COLLECTIONS.notebook,
    id: String(entry._id),
    text: buildNotebookText(entry),
    payload: {
      type: 'notebook_entry',
      objectId: String(entry._id),
      title: entry.title || '',
      tags: entry.tags || [],
      createdAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
      userId: String(entry.userId)
    }
  });
};

const enqueueQuestionEmbedding = (question) => {
  if (!question) return;
  const tags = [question.conceptName || question.linkedTagName].filter(Boolean);
  enqueueEmbedding({
    collection: COLLECTIONS.questions,
    id: String(question._id),
    text: buildQuestionText(question),
    payload: {
      type: 'question',
      objectId: String(question._id),
      title: question.text || '',
      tags,
      createdAt: question.updatedAt || question.createdAt || new Date().toISOString(),
      userId: String(question.userId)
    }
  });
};

module.exports = {
  COLLECTIONS,
  drainEmbeddingJobQueue,
  enqueueHighlightEmbedding,
  enqueueArticleEmbedding,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding,
  persistEmbeddingJob,
  retryDelayMs
};
