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
    isCurrentFn: async () => false,
    writeVectorFn: async payload => {
      upserts.push(payload);
      return { ok: true };
    }
  });
  assert.strictEqual(success.processed, 1);
  assert.strictEqual(success.failed, 0);
  assert.strictEqual(successModel.jobs[0].status, 'completed');
  assert.strictEqual(upserts[0].text, 'Searchable source text');
  assert.deepStrictEqual(upserts[0].vector, [0.1, 0.2, 0.3]);

  // Unchanged content must not spend an embedding call — this is what makes a
  // backfill re-run cheap instead of a full re-spend.
  const unchangedModel = createEmbeddingJobModel([{
    _id: 'unchanged-1',
    collection: 'articles',
    objectId: 'article-9',
    text: 'Already indexed',
    payload: { title: 'Same' },
    status: 'queued',
    nextRunAt: new Date('2026-06-21T00:00:00.000Z')
  }]);
  let embedCalls = 0;
  const unchanged = await drainEmbeddingJobQueue({
    model: unchangedModel,
    at: new Date('2026-06-21T00:01:00.000Z'),
    isCurrentFn: async () => true,
    embedTextFn: async () => { embedCalls += 1; return [0.1]; },
    writeVectorFn: async () => { throw new Error('must not write when unchanged'); }
  });
  assert.strictEqual(embedCalls, 0, 'an unchanged item costs no embedding call');
  assert.strictEqual(unchanged.unchanged, 1);
  assert.strictEqual(unchangedModel.jobs[0].status, 'completed');

  // A 429 means the upstream is busy, not that the job is bad. Burning attempt
  // budget on it is what abandoned 133 jobs in production.
  const rateLimitedModel = createEmbeddingJobModel([1, 2, 3, 4, 5].map(n => ({
    _id: `rl-${n}`,
    collection: 'articles',
    objectId: `article-rl-${n}`,
    text: `text ${n}`,
    payload: { title: `RL ${n}` },
    status: 'queued',
    attemptCount: 0,
    nextRunAt: new Date('2026-06-21T00:00:00.000Z')
  })));
  const limited = await drainEmbeddingJobQueue({
    model: rateLimitedModel,
    at: new Date('2026-06-21T00:01:00.000Z'),
    rateLimitBreakAfter: 2,
    isCurrentFn: async () => false,
    embedTextFn: async () => {
      const error = new Error('AI service error 429: Too Many Requests');
      error.status = 429;
      throw error;
    },
    writeVectorFn: async () => { throw new Error('unreachable'); }
  });
  assert.strictEqual(limited.rateLimited, true, 'the drain reports that it broke on rate limiting');
  assert.strictEqual(limited.failed, 0, 'a rate-limited job is not a failed job');
  const touched = rateLimitedModel.jobs.filter(job => job.status === 'queued' && String(job.lastError || '').includes('rate limited'));
  assert.strictEqual(touched.length, 2, 'it stops after the configured number of consecutive rate limits');
  touched.forEach(job => {
    assert.strictEqual(job.attemptCount, 0, 'attempt budget is returned, not spent');
    assert.strictEqual(job.status, 'queued');
  });

  const failureModel = createEmbeddingJobModel([{
    _id: 'failure-1',
    collection: 'articles',
    objectId: 'article-3',
    text: 'Genuinely bad text',
    payload: {},
    status: 'queued',
    nextRunAt: new Date('2026-06-21T00:00:00.000Z')
  }]);
  // A real defect — as distinct from a rate limit — still consumes an attempt
  // and backs off.
  const failed = await drainEmbeddingJobQueue({
    model: failureModel,
    at: new Date('2026-06-21T00:01:00.000Z'),
    isCurrentFn: async () => false,
    embedTextFn: async () => {
      throw new Error('Embedding requires non-empty text.');
    },
    writeVectorFn: async () => {
      throw new Error('should not write');
    }
  });
  assert.strictEqual(failed.processed, 0);
  assert.strictEqual(failed.failed, 1);
  assert.strictEqual(failureModel.jobs[0].status, 'failed');
  assert.ok(new Date(failureModel.jobs[0].nextRunAt).getTime() > new Date('2026-06-21T00:01:00.000Z').getTime());
  assert.match(failureModel.jobs[0].lastError, /non-empty text/);

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
