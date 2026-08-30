const { enqueue, registerHandler } = require('./jobQueue');
const { embedText } = require('./embed');
const {
  contentHashOf,
  upsertVectorItem,
  isVectorItemCurrent,
  deleteArticleVectorItems,
  deleteVectorItemIfContentHash,
  reconcileVectorSubIds
} = require('./vectorStore');
const { buildArticleVectorUnits } = require('./articlePassages');
const { EmbeddingJob, VectorItem } = require('../models');

/**
 * Write one job's payload into the Atlas vector index. The job payload already
 * carries `type`, `objectId` and `userId`, so the queue's shape is unchanged —
 * only the destination moved (Qdrant, which was never provisioned in
 * production, to `vectoritems`).
 */
const writeVectorItem = async ({ text, payload = {}, vector }) => {
  const metadata = {
    title: payload.title || '',
    articleId: payload.articleId || '',
    articleTitle: payload.articleTitle || '',
    pageId: payload.pageId || '',
    claimId: payload.claimId || '',
    tags: payload.tags || [],
    createdAt: payload.createdAt || new Date().toISOString()
  };
  if (payload.kind) metadata.kind = payload.kind;
  if (Number.isInteger(payload.passageIndex)) metadata.passageIndex = payload.passageIndex;
  if (Number.isInteger(payload.charStart)) metadata.charStart = payload.charStart;
  if (Number.isInteger(payload.charEnd)) metadata.charEnd = payload.charEnd;
  if (payload.sourceContentHash) metadata.sourceContentHash = payload.sourceContentHash;
  if (payload.updatedAt) metadata.updatedAt = payload.updatedAt;

  return upsertVectorItem({
    VectorItem,
    userId: payload.userId,
    objectType: payload.type,
    objectId: payload.objectId,
    subId: payload.subId || '',
    text,
    vector,
    metadata
  });
};

/**
 * A 429 means the upstream is busy, not that the job is bad. Burning attempt
 * budget on it is how 133 jobs reached `abandoned` between 2026-06-21 and
 * 2026-08-13 without a single completion.
 */
const isRateLimitError = (error) => {
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 429) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('429') || message.includes('too many requests') || message.includes('rate limit');
};

const COLLECTIONS = {
  highlights: 'highlights',
  articles: 'articles',
  notebook: 'notebook_entries',
  questions: 'questions',
  judgments: 'judgment_claims',
  claims: 'wiki_claims'
};

/**
 * Only claims the Reading Loop's collision mechanic could ever use are worth
 * embedding — a claim with one source is not a conviction, a retired one is not
 * held, and maintenance bookkeeping is not a position. Filtering here keeps the
 * index at the ~280 claims that matter rather than the ~860 that exist.
 *
 * Deliberately duplicated from readingLoopService rather than imported: that
 * module requires this one for COLLECTIONS, and a cycle is worse than four
 * lines of repetition. Keep the two in step.
 */
const CLAIM_META_RE = /\b(the recurring pattern across|the page should|this page|the useful claim is narrower|topic label|source ledger|maintenance run)\b/i;

const isEmbeddableWikiClaim = (claim = {}) => {
  if (!claim || claim.checkInStatus === 'retired' || claim.retiredAt) return false;
  const sources = Math.max(
    Array.isArray(claim.sourceRefIds) ? claim.sourceRefIds.length : 0,
    Array.isArray(claim.citationIds) ? claim.citationIds.length : 0
  );
  if (sources < 2) return false;
  const text = String(claim.text || '').trim();
  if (text.length < 40) return false;
  return !CLAIM_META_RE.test(text);
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

const validDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

const isDuplicateKeyError = (error) => Number(error?.code || 0) === 11000;

const persistEmbeddingJob = async ({ collection, id, text, payload, model = EmbeddingJob }) => {
  if (!collection || !id || !canPersistEmbeddingJobs(model)) return null;
  const runAt = now();
  const jobText = trimText(text, 8000);
  const contentHash = contentHashOf(jobText);
  const sourceUpdatedAt = validDate(payload?.updatedAt);
  const identity = { collection, objectId: String(id) };
  const row = {
    collection,
    objectId: String(id),
    text: jobText,
    contentHash,
    payload: payload || {},
    status: 'queued',
    replayRequired: false,
    nextRunAt: runAt,
    lockedAt: null,
    completedAt: null,
    lastError: '',
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {})
  };

  if (!sourceUpdatedAt || typeof model.updateOne !== 'function') {
    return model.findOneAndUpdate(
      identity,
      { $set: row, $setOnInsert: { attemptCount: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  // Concurrent saves may finish queue persistence out of order. Establish the
  // unique identity without replacing it, then accept only a source revision
  // that is at least as new as the one already queued.
  try {
    await model.updateOne(
      identity,
      { $setOnInsert: { ...row, attemptCount: 0 } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  return model.findOneAndUpdate(
    {
      ...identity,
      $or: [
        { sourceUpdatedAt: { $exists: false } },
        { sourceUpdatedAt: null },
        { sourceUpdatedAt: { $lt: sourceUpdatedAt } },
        { sourceUpdatedAt, contentHash }
      ]
    },
    { $set: row },
    { new: true }
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

registerHandler('embedding', async ({ text, payload }) => {
  const vector = await embedText(text);
  await writeVectorItem({ text, payload, vector });
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
        replayRequired: false,
        lockedAt: at,
        lastAttemptAt: at
      },
      $inc: { attemptCount: 1 }
    },
    { sort: { nextRunAt: 1, createdAt: 1 }, new: true }
  );
};

const jobVersionQuery = (job = {}) => ({
  _id: job._id,
  contentHash: job._claimedContentHash || job.contentHash || contentHashOf(job.text || '')
});

const matchedCount = (result = {}) => Number(
  result.matchedCount ?? result.n ?? result.modifiedCount ?? 0
);

const embeddingJobStillCurrent = async ({ model = EmbeddingJob, job } = {}) => {
  if (!model?.findOne || !job?._id) return true;
  const query = model.findOne({
    ...jobVersionQuery(job),
    status: 'running'
  });
  const selected = typeof query?.select === 'function' ? query.select('_id') : query;
  const row = typeof selected?.lean === 'function' ? await selected.lean() : await selected;
  return Boolean(row);
};

const ensureEmbeddingJobContentHash = async ({ model = EmbeddingJob, job } = {}) => {
  if (!model?.updateOne || !job?._id) return job;
  const contentHash = job.contentHash || contentHashOf(job.text || '');
  if (!job.contentHash) {
    const result = await model.updateOne(
      {
        _id: job._id,
        status: 'running',
        $or: [
          { contentHash: { $exists: false } },
          { contentHash: '' },
          { contentHash: null }
        ]
      },
      { $set: { contentHash } }
    );
    if (matchedCount(result) === 0) return null;
  }
  const snapshot = typeof job.toObject === 'function' ? job.toObject() : { ...job };
  return { ...snapshot, _id: job._id, contentHash, _claimedContentHash: contentHash };
};

const markEmbeddingJobCompleted = async ({ model = EmbeddingJob, job, at = now() } = {}) => {
  if (!model || !job?._id) return null;
  const completed = await model.updateOne(
    { ...jobVersionQuery(job), replayRequired: { $ne: true } },
    {
      $set: {
        status: 'completed',
        replayRequired: false,
        completedAt: at,
        lockedAt: null,
        nextRunAt: null,
        lastError: ''
      }
    }
  );
  if (matchedCount(completed) > 0) return { completed: true };

  // A newer save can arrive while the worker is embedding. If the old worker
  // reached the write boundary, make the current revision replay once rather
  // than allowing the stale worker to mark the new job complete.
  await model.updateOne(
    { _id: job._id, contentHash: { $ne: jobVersionQuery(job).contentHash } },
    {
      $set: {
        status: 'queued',
        replayRequired: true,
        lockedAt: null,
        completedAt: null,
        nextRunAt: at,
        lastError: 'A superseded worker reached the write boundary; replaying current text.'
      }
    }
  );
  await model.updateOne(
    { ...jobVersionQuery(job), replayRequired: true },
    {
      $set: {
        status: 'queued',
        replayRequired: false,
        lockedAt: null,
        completedAt: null,
        nextRunAt: at,
        lastError: 'A newer source revision arrived during embedding; replaying current text.'
      }
    }
  );
  return { completed: false, superseded: true };
};

/**
 * Put a job back without spending its attempt budget. Used when the upstream
 * is rate limited — the job is fine, the moment is not.
 */
const releaseEmbeddingJob = async ({ model = EmbeddingJob, job, at = now(), cooldownMs = 60 * 1000 } = {}) => {
  if (!model || !job?._id) return null;
  return model.updateOne(
    jobVersionQuery(job),
    {
      $set: {
        status: 'queued',
        lockedAt: null,
        nextRunAt: new Date(at.getTime() + Math.max(1000, cooldownMs)),
        lastError: 'Upstream rate limited; retried without consuming attempts.'
      },
      $inc: { attemptCount: -1 }
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
    jobVersionQuery(job),
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
  writeVectorFn = writeVectorItem,
  deleteStaleVectorFn = deleteVectorItemIfContentHash,
  isCurrentFn = isVectorItemCurrent,
  rateLimitBreakAfter = Number(process.env.EMBEDDING_JOB_RATE_LIMIT_BREAK || 3),
  at = now()
} = {}) => {
  if (!canPersistEmbeddingJobs(model)) return { processed: 0, failed: 0, skipped: true, results: [] };
  const max = Math.max(1, Math.min(Number(limit) || 5, 50));
  const results = [];
  let consecutiveRateLimits = 0;
  let rateLimited = false;

  for (let i = 0; i < max; i += 1) {
    const claimedJob = await claimDueEmbeddingJob({ model, at });
    const job = await ensureEmbeddingJobContentHash({ model, job: claimedJob });
    if (!job) break;
    try {
      // Unchanged content needs no embedding call — this is what makes a
      // re-run of the backfill cheap rather than a full re-spend.
      const current = await isCurrentFn({
        VectorItem,
        userId: job.payload?.userId,
        objectType: job.payload?.type,
        objectId: job.payload?.objectId,
        subId: job.payload?.subId || '',
        text: job.text || ''
      });
      if (current) {
        await markEmbeddingJobCompleted({ model, job, at: now() });
        results.push({ jobId: String(job._id), status: 'unchanged' });
        consecutiveRateLimits = 0;
        continue;
      }
      const vector = await embedTextFn(job.text || '');
      if (!(await embeddingJobStillCurrent({ model, job }))) {
        results.push({ jobId: String(job._id), status: 'superseded' });
        consecutiveRateLimits = 0;
        continue;
      }
      await writeVectorFn({ text: job.text || '', payload: job.payload || {}, vector });
      const completion = await markEmbeddingJobCompleted({ model, job, at: now() });
      if (completion?.superseded) {
        await deleteStaleVectorFn({
          VectorItem,
          userId: job.payload?.userId,
          objectType: job.payload?.type,
          objectId: job.payload?.objectId,
          subId: job.payload?.subId || '',
          text: job.text || ''
        });
      }
      results.push({
        jobId: String(job._id),
        status: completion?.superseded ? 'superseded' : 'completed'
      });
      consecutiveRateLimits = 0;
    } catch (error) {
      if (isRateLimitError(error)) {
        consecutiveRateLimits += 1;
        await releaseEmbeddingJob({ model, job, at: now() });
        results.push({ jobId: String(job._id), status: 'rate_limited' });
        if (consecutiveRateLimits >= Math.max(1, rateLimitBreakAfter)) {
          rateLimited = true;
          break;
        }
        continue;
      }
      await markEmbeddingJobFailed({ model, job, error, at: now(), maxAttempts });
      results.push({ jobId: String(job._id), status: 'failed', error: error.message || String(error) });
    }
  }
  return {
    processed: results.filter(result => result.status === 'completed').length,
    unchanged: results.filter(result => result.status === 'unchanged').length,
    failed: results.filter(result => result.status === 'failed').length,
    rateLimited,
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

const buildArticleEmbeddingJobs = (article, options = {}) => {
  if (!article?._id || !article?.userId) return [];
  return buildArticleVectorUnits(article, options).map(item => ({
    collection: COLLECTIONS.articles,
    id: item.subId ? `${String(article._id)}:${item.subId}` : String(article._id),
    text: item.text,
    payload: {
      ...item.metadata,
      type: 'article',
      objectId: String(article._id),
      subId: item.subId || '',
      userId: String(article.userId)
    }
  }));
};

const reconcileArticleEmbeddingJobs = async ({
  model = EmbeddingJob,
  userId,
  articleId,
  keepJobIds = [],
  notAfterUpdatedAt = null,
  sourceContentHash = ''
} = {}) => {
  const owner = String(userId || '');
  const id = String(articleId || '');
  if (!model?.deleteMany || !owner || !id) return { deletedCount: 0 };
  const keep = [...new Set((Array.isArray(keepJobIds) ? keepJobIds : [])
    .map(value => String(value || ''))
    .filter(Boolean))];
  const query = {
    collection: COLLECTIONS.articles,
    'payload.userId': owner,
    'payload.type': 'article',
    'payload.objectId': id,
    objectId: { $nin: keep }
  };
  const cutoff = validDate(notAfterUpdatedAt);
  if (cutoff) {
    const olderOrSameRevision = [
      { sourceUpdatedAt: { $exists: false } },
      { sourceUpdatedAt: null },
      { sourceUpdatedAt: { $lt: cutoff } }
    ];
    if (sourceContentHash) {
      olderOrSameRevision.push(
        { sourceUpdatedAt: cutoff, 'payload.sourceContentHash': sourceContentHash },
        { sourceUpdatedAt: cutoff, 'payload.sourceContentHash': { $exists: false } },
        { sourceUpdatedAt: cutoff, 'payload.sourceContentHash': '' }
      );
    } else {
      olderOrSameRevision.push({ sourceUpdatedAt: cutoff });
    }
    query.$or = olderOrSameRevision;
  }
  return model.deleteMany(query);
};

/* Article deletion is a tombstone for both the durable queue and Atlas. Jobs
   are removed first: a worker still inside embedText then fails its pre-write
   version check, while a worker already past that check erases its own late
   write at the completion fence. A repeated delete is intentionally safe. */
const deleteArticleEmbeddingState = async ({
  model = EmbeddingJob,
  vectorItemModel = VectorItem,
  userId,
  articleId,
  deleteArticleVectorsFn = deleteArticleVectorItems
} = {}) => {
  const owner = String(userId || '');
  const id = String(articleId || '');
  if (!owner || !id) return { deletedJobs: 0, deletedVectors: 0 };

  const jobResult = model?.deleteMany
    ? await model.deleteMany({
      'payload.userId': owner,
      $or: [
        {
          collection: COLLECTIONS.articles,
          'payload.type': 'article',
          'payload.objectId': id
        },
        {
          collection: COLLECTIONS.highlights,
          'payload.type': 'highlight',
          'payload.articleId': id
        }
      ]
    })
    : { deletedCount: 0 };
  const vectorResult = await deleteArticleVectorsFn({
    VectorItem: vectorItemModel,
    userId: owner,
    articleId: id
  });
  return {
    deletedJobs: Number(jobResult?.deletedCount || 0),
    deletedVectors: Number(vectorResult?.deletedCount || 0)
  };
};

const enqueueArticleEmbedding = async (article, options = {}) => {
  const jobs = buildArticleEmbeddingJobs(article, options);
  if (!jobs.length) return null;
  const queued = jobs
    .map(job => enqueueEmbedding(job))
    .filter(result => typeof result?.then === 'function');
  await Promise.all(queued);
  const articleUpdatedAt = validDate(article.updatedAt || article.createdAt);
  const sourceContentHash = jobs[0]?.payload?.sourceContentHash || '';
  const jobCleanup = reconcileArticleEmbeddingJobs({
    model: EmbeddingJob,
    userId: article.userId,
    articleId: article._id,
    keepJobIds: jobs.map(job => job.id),
    notAfterUpdatedAt: articleUpdatedAt,
    sourceContentHash
  });
  const keepSubIds = jobs.map(job => job.payload.subId).filter(Boolean);
  const cleanup = reconcileVectorSubIds({
    VectorItem,
    userId: article.userId,
    objectType: 'article',
    objectId: article._id,
    keepSubIds,
    notAfterUpdatedAt: articleUpdatedAt,
    sourceContentHash
  });
  return Promise.all([jobCleanup, cleanup]);
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

const enqueueWikiClaimEmbeddings = (page) => {
  if (!page?._id) return;
  (page.claims || []).forEach(claim => {
    if (!isEmbeddableWikiClaim(claim)) return;
    const objectId = `${String(page._id)}:${String(claim.claimId)}`;
    enqueueEmbedding({
      collection: COLLECTIONS.claims,
      id: objectId,
      text: trimText(`${page.title || ''}\n${claim.text || ''}`),
      payload: {
        type: 'wiki_claim',
        objectId,
        pageId: String(page._id),
        claimId: String(claim.claimId),
        title: page.title || '',
        createdAt: claim.createdAt || page.createdAt || new Date().toISOString(),
        userId: String(page.userId)
      }
    });
  });
};

/* One durable vector per held sentence. Page saves may enqueue the same job
   more than once, but the worker's content hash means the sentence is embedded
   only when it changes. The page title is deliberately excluded: retrieval is
   about what the reader holds, not what kind of dossier contains it. */
const buildJudgmentEmbeddingJob = (page) => {
  const claim = trimText(page?.judgment?.currentJudgment || '').trim();
  if (!page?._id || !page?.userId || !claim) return null;
  return {
    collection: COLLECTIONS.judgments,
    id: String(page._id),
    text: claim,
    payload: {
      type: 'judgment_claim',
      objectId: String(page._id),
      pageId: String(page._id),
      title: page.title || '',
      createdAt: page.updatedAt || page.createdAt || new Date().toISOString(),
      userId: String(page.userId)
    }
  };
};

const enqueueJudgmentEmbedding = (page) => {
  const job = buildJudgmentEmbeddingJob(page);
  return job ? enqueueEmbedding(job) : null;
};

module.exports = {
  COLLECTIONS,
  drainEmbeddingJobQueue,
  writeVectorItem,
  releaseEmbeddingJob,
  isRateLimitError,
  buildArticleEmbeddingJobs,
  deleteArticleEmbeddingState,
  reconcileArticleEmbeddingJobs,
  buildJudgmentEmbeddingJob,
  enqueueJudgmentEmbedding,
  enqueueWikiClaimEmbeddings,
  isEmbeddableWikiClaim,
  enqueueHighlightEmbedding,
  enqueueArticleEmbedding,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding,
  persistEmbeddingJob,
  retryDelayMs
};
