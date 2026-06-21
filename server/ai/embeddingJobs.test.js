const assert = require('assert');
const {
  drainEmbeddingJobQueue,
  persistEmbeddingJob,
  retryDelayMs
} = require('./embeddingJobs');

const applyUpdate = (target, update = {}, isInsert = false) => {
  if (isInsert && update.$setOnInsert) {
    Object.assign(target, update.$setOnInsert);
  }
  if (update.$set) {
    Object.assign(target, update.$set);
  }
  if (update.$inc) {
    Object.entries(update.$inc).forEach(([key, value]) => {
      target[key] = Number(target[key] || 0) + Number(value || 0);
    });
  }
  return target;
};

const dueAt = (value, at) => {
  if (value === null || value === undefined) return true;
  return new Date(value).getTime() <= at.getTime();
};

const createEmbeddingJobModel = (initialJobs = []) => {
  const jobs = initialJobs.map((job, index) => ({
    _id: job._id || `job-${index + 1}`,
    attemptCount: 0,
    createdAt: new Date(`2026-06-21T00:00:0${index}.000Z`),
    ...job
  }));

  return {
    jobs,
    async findOneAndUpdate(query = {}, update = {}, options = {}) {
      if (query.collection && query.objectId) {
        let job = jobs.find(candidate => (
          candidate.collection === query.collection
          && candidate.objectId === query.objectId
        ));
        const isInsert = !job;
        if (!job) {
          job = {
            _id: `job-${jobs.length + 1}`,
            collection: query.collection,
            objectId: query.objectId,
            createdAt: new Date('2026-06-21T00:00:00.000Z')
          };
          jobs.push(job);
        }
        applyUpdate(job, update, isInsert);
        return options.new === false ? null : job;
      }

      const at = new Date(update.$set?.lockedAt || Date.now());
      const staleBefore = query.$or?.[1]?.lockedAt?.$lte || new Date(0);
      const candidates = jobs
        .filter(job => (
          (['queued', 'failed'].includes(job.status) && dueAt(job.nextRunAt, at))
          || (job.status === 'running' && job.lockedAt && new Date(job.lockedAt).getTime() <= new Date(staleBefore).getTime())
        ))
        .sort((a, b) => {
          const aRun = a.nextRunAt ? new Date(a.nextRunAt).getTime() : 0;
          const bRun = b.nextRunAt ? new Date(b.nextRunAt).getTime() : 0;
          if (aRun !== bRun) return aRun - bRun;
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });
      const job = candidates[0] || null;
      if (!job) return null;
      applyUpdate(job, update);
      return job;
    },
    async updateOne(query = {}, update = {}) {
      const job = jobs.find(candidate => String(candidate._id) === String(query._id));
      if (!job) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(job, update);
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
};

const run = async () => {
  assert.ok(retryDelayMs({ attemptCount: 1 }) >= retryDelayMs({ attemptCount: 0 }));

  const upsertModel = createEmbeddingJobModel();
  await persistEmbeddingJob({
    model: upsertModel,
    collection: 'articles',
    id: 'article-1',
    text: 'First text',
    payload: { title: 'First' }
  });
  await persistEmbeddingJob({
    model: upsertModel,
    collection: 'articles',
    id: 'article-1',
    text: 'Updated text',
    payload: { title: 'Updated' }
  });
  assert.strictEqual(upsertModel.jobs.length, 1);
  assert.strictEqual(upsertModel.jobs[0].text, 'Updated text');
  assert.strictEqual(upsertModel.jobs[0].status, 'queued');

  const successModel = createEmbeddingJobModel([{
    _id: 'success-1',
    collection: 'articles',
    objectId: 'article-2',
    text: 'Searchable source text',
    payload: { title: 'Searchable' },
    status: 'queued',
    nextRunAt: new Date('2026-06-21T00:00:00.000Z')
  }]);
  const upserts = [];
  const success = await drainEmbeddingJobQueue({
    model: successModel,
    at: new Date('2026-06-21T00:01:00.000Z'),
    embedTextFn: async text => {
      assert.strictEqual(text, 'Searchable source text');
      return [0.1, 0.2, 0.3];
    },
    upsertVectorFn: async payload => {
      upserts.push(payload);
      return { ok: true };
    }
  });
  assert.strictEqual(success.processed, 1);
  assert.strictEqual(success.failed, 0);
  assert.strictEqual(successModel.jobs[0].status, 'completed');
  assert.strictEqual(upserts[0].collection, 'articles');
  assert.strictEqual(upserts[0].id, 'article-2');

  const failureModel = createEmbeddingJobModel([{
    _id: 'failure-1',
    collection: 'articles',
    objectId: 'article-3',
    text: 'Rate limited text',
    payload: {},
    status: 'queued',
    nextRunAt: new Date('2026-06-21T00:00:00.000Z')
  }]);
  const failed = await drainEmbeddingJobQueue({
    model: failureModel,
    at: new Date('2026-06-21T00:01:00.000Z'),
    embedTextFn: async () => {
      const error = new Error('429 Too Many Requests');
      error.status = 429;
      throw error;
    },
    upsertVectorFn: async () => {
      throw new Error('should not upsert');
    }
  });
  assert.strictEqual(failed.processed, 0);
  assert.strictEqual(failed.failed, 1);
  assert.strictEqual(failureModel.jobs[0].status, 'failed');
  assert.ok(new Date(failureModel.jobs[0].nextRunAt).getTime() > new Date('2026-06-21T00:01:00.000Z').getTime());
  assert.match(failureModel.jobs[0].lastError, /429/);

  const abandonedModel = createEmbeddingJobModel([{
    _id: 'abandoned-1',
    collection: 'articles',
    objectId: 'article-4',
    text: 'Terminal text',
    payload: {},
    status: 'queued',
    nextRunAt: new Date('2026-06-21T00:00:00.000Z')
  }]);
  await drainEmbeddingJobQueue({
    model: abandonedModel,
    at: new Date('2026-06-21T00:01:00.000Z'),
    maxAttempts: 1,
    embedTextFn: async () => {
      throw new Error('still down');
    }
  });
  assert.strictEqual(abandonedModel.jobs[0].status, 'abandoned');
  assert.strictEqual(abandonedModel.jobs[0].nextRunAt, null);

  console.log('embeddingJobs tests passed');
};

run().catch(error => {
  console.error(error);
  process.exit(1);
});
