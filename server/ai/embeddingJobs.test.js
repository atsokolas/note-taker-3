const assert = require('assert');
const { contentHashOf } = require('./vectorStore');
const {
  buildArticleEmbeddingJobs,
  buildJudgmentEmbeddingJob,
  deleteArticleEmbeddingState,
  drainEmbeddingJobQueue,
  persistEmbeddingJob,
  reconcileArticleEmbeddingJobs,
  retryDelayMs
} = require('./embeddingJobs');

const OWNER = '6873e7773cc513750ec17055';

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

const valueAt = (target, path) => String(path).split('.').reduce(
  (value, key) => (value === null || value === undefined ? undefined : value[key]),
  target
);

const matchesValue = (value, expected) => {
  if (!expected || typeof expected !== 'object' || expected instanceof Date) {
    return String(value) === String(expected);
  }
  if ('$ne' in expected) return String(value) !== String(expected.$ne);
  if ('$exists' in expected) return expected.$exists ? value !== undefined : value === undefined;
  if ('$in' in expected) return expected.$in.some(candidate => String(value) === String(candidate));
  if ('$nin' in expected) return !expected.$nin.some(candidate => String(value) === String(candidate));
  if ('$lt' in expected) return new Date(value).getTime() < new Date(expected.$lt).getTime();
  if ('$lte' in expected) return new Date(value).getTime() <= new Date(expected.$lte).getTime();
  return String(value) === String(expected);
};

const matchesQuery = (target, query = {}) => Object.entries(query).every(([key, expected]) => {
  if (key === '$or') return expected.some(branch => matchesQuery(target, branch));
  return matchesValue(valueAt(target, key), expected);
});

const createEmbeddingJobModel = (initialJobs = []) => {
  const jobs = initialJobs.map((job, index) => ({
    _id: job._id || `job-${index + 1}`,
    attemptCount: 0,
    createdAt: new Date(`2026-06-21T00:00:0${index}.000Z`),
    ...job
  }));

  return {
    jobs,
    findOne(query = {}) {
      const job = jobs.find(candidate => matchesQuery(candidate, query)) || null;
      const lean = async () => job;
      return { select: () => ({ lean }), lean };
    },
    async findOneAndUpdate(query = {}, update = {}, options = {}) {
      if (query.collection && query.objectId) {
        let job = jobs.find(candidate => (
          candidate.collection === query.collection
          && candidate.objectId === query.objectId
        ));
        if (job && !matchesQuery(job, query)) return null;
        const isInsert = !job;
        if (!job) {
          if (!options.upsert) return null;
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
    async updateOne(query = {}, update = {}, options = {}) {
      let job = jobs.find(candidate => matchesQuery(candidate, query));
      const isInsert = !job;
      if (!job && options.upsert && query.collection && query.objectId) {
        job = {
          _id: `job-${jobs.length + 1}`,
          collection: query.collection,
          objectId: query.objectId,
          createdAt: new Date('2026-06-21T00:00:00.000Z')
        };
        jobs.push(job);
      }
      if (!job) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(job, update, isInsert);
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: isInsert ? 1 : 0 };
    },
    async deleteMany(query = {}) {
      let deletedCount = 0;
      for (let index = jobs.length - 1; index >= 0; index -= 1) {
        if (!matchesQuery(jobs[index], query)) continue;
        jobs.splice(index, 1);
        deletedCount += 1;
      }
      return { deletedCount };
    }
  };
};

const run = async () => {
  const articleJobs = buildArticleEmbeddingJobs({
    _id: 'article-passages',
    userId: '6873e7773cc513750ec17055',
    title: 'A long saved source',
    content: Array.from({ length: 40 }, (_, index) => `Sentence ${index + 1} explains a distinct part of the saved source in enough detail to remain readable.`).join(' '),
    createdAt: new Date('2026-08-30T12:00:00.000Z'),
    updatedAt: new Date('2026-08-30T13:00:00.000Z')
  }, { passageLength: 420, passageOverlap: 60, maxPassages: 3 });
  assert.strictEqual(articleJobs.length, 4, 'one summary plus three bounded passages are queued');
  assert.strictEqual(articleJobs[0].id, 'article-passages');
  assert.strictEqual(articleJobs[0].payload.subId, '');
  articleJobs.slice(1).forEach((job, index) => {
    assert.strictEqual(job.id, `article-passages:passage:v1:${index}`);
    assert.strictEqual(job.payload.subId, `passage:v1:${index}`);
    assert.strictEqual(job.payload.kind, 'article_passage');
    assert.strictEqual(job.payload.objectId, 'article-passages');
  });
  assert.deepStrictEqual(buildArticleEmbeddingJobs({ _id: 'missing-owner', content: 'No owner.' }), []);

  const heldSentence = buildJudgmentEmbeddingJob({
    _id: 'page-1',
    userId: '6873e7773cc513750ec17055',
    title: 'A dossier title that must not affect meaning',
    judgment: { currentJudgment: '  The held sentence, exactly.  ' },
    updatedAt: new Date('2026-08-30T12:00:00.000Z')
  });
  assert.strictEqual(heldSentence.collection, 'judgment_claims');
  assert.strictEqual(heldSentence.id, 'page-1');
  assert.strictEqual(heldSentence.text, 'The held sentence, exactly.');
  assert.strictEqual(heldSentence.payload.type, 'judgment_claim');
  assert.strictEqual(heldSentence.payload.objectId, 'page-1');
  assert.ok(!heldSentence.text.includes('dossier title'), 'the page title cannot steer sentence retrieval');
  assert.strictEqual(buildJudgmentEmbeddingJob({ _id: 'page-2', userId: 'u', judgment: {} }), null);

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
  assert.strictEqual(upsertModel.jobs[0].contentHash, contentHashOf('Updated text'));
  assert.strictEqual(upsertModel.jobs[0].status, 'queued');

  // Persistence order is not source order. If the older save reaches Mongo
  // last, the article's own updatedAt clock must still make the newer text win.
  const orderedModel = createEmbeddingJobModel();
  const baseUpdateOne = orderedModel.updateOne.bind(orderedModel);
  let releaseOldPersist;
  let signalOldPersist;
  const oldPersistStarted = new Promise(resolve => { signalOldPersist = resolve; });
  const oldPersistGate = new Promise(resolve => { releaseOldPersist = resolve; });
  orderedModel.updateOne = async (query, update, options) => {
    if (String(update?.$setOnInsert?.text || '') === 'Older article text') {
      signalOldPersist();
      await oldPersistGate;
    }
    return baseUpdateOne(query, update, options);
  };
  const olderPersist = persistEmbeddingJob({
    model: orderedModel,
    collection: 'articles',
    id: 'article-ordered',
    text: 'Older article text',
    payload: { updatedAt: '2026-08-30T10:00:00.000Z' }
  });
  await oldPersistStarted;
  await persistEmbeddingJob({
    model: orderedModel,
    collection: 'articles',
    id: 'article-ordered',
    text: 'Newer article text',
    payload: { updatedAt: '2026-08-30T11:00:00.000Z' }
  });
  releaseOldPersist();
  await olderPersist;
  assert.strictEqual(orderedModel.jobs[0].text, 'Newer article text', 'an older save cannot replace a newer source revision');
  assert.strictEqual(orderedModel.jobs[0].contentHash, contentHashOf('Newer article text'));

  const jobCleanupCalls = [];
  await reconcileArticleEmbeddingJobs({
    model: { deleteMany: async query => { jobCleanupCalls.push(query); return { deletedCount: 2 }; } },
    userId: '6873e7773cc513750ec17055',
    articleId: 'article-passages',
    keepJobIds: articleJobs.map(job => job.id)
  });
  assert.deepStrictEqual(jobCleanupCalls[0], {
    collection: 'articles',
    'payload.userId': '6873e7773cc513750ec17055',
    'payload.type': 'article',
    'payload.objectId': 'article-passages',
    objectId: { $nin: articleJobs.map(job => job.id) }
  }, 'stale queue cleanup is fenced to the exact owner and article');

  const newerCleanupModel = createEmbeddingJobModel([{
    _id: 'newer-passage-job',
    collection: 'articles',
    objectId: 'article-cleanup-order:passage:v1:1',
    text: 'newer passage',
    contentHash: contentHashOf('newer passage'),
    sourceUpdatedAt: new Date('2026-08-30T12:00:00.000Z'),
    payload: {
      type: 'article',
      objectId: 'article-cleanup-order',
      userId: '6873e7773cc513750ec17055'
    },
    status: 'queued'
  }]);
  await reconcileArticleEmbeddingJobs({
    model: newerCleanupModel,
    userId: '6873e7773cc513750ec17055',
    articleId: 'article-cleanup-order',
    keepJobIds: [],
    notAfterUpdatedAt: '2026-08-30T11:00:00.000Z'
  });
  assert.strictEqual(newerCleanupModel.jobs.length, 1, 'older cleanup cannot delete a newer article job');

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

  // A save can update the same durable job while its old text is waiting on
  // the embedding service. The old worker must not write or complete the new
  // revision; the current text remains queued for the next drain.
  const supersededModel = createEmbeddingJobModel();
  await persistEmbeddingJob({
    model: supersededModel,
    collection: 'articles',
    id: 'article-race',
    text: 'Old passage text',
    payload: { type: 'article', objectId: 'article-race' }
  });
  let staleWrites = 0;
  const superseded = await drainEmbeddingJobQueue({
    model: supersededModel,
    at: new Date('2026-12-21T00:01:00.000Z'),
    isCurrentFn: async () => false,
    embedTextFn: async () => {
      await persistEmbeddingJob({
        model: supersededModel,
        collection: 'articles',
        id: 'article-race',
        text: 'Current passage text',
        payload: { type: 'article', objectId: 'article-race' }
      });
      return [0.4, 0.5];
    },
    writeVectorFn: async () => { staleWrites += 1; }
  });
  assert.strictEqual(staleWrites, 0, 'a superseded worker cannot overwrite the current vector');
  assert.strictEqual(superseded.results[0].status, 'superseded');
  assert.strictEqual(supersededModel.jobs[0].text, 'Current passage text');
  assert.strictEqual(supersededModel.jobs[0].status, 'queued');

  const writeRaceModel = createEmbeddingJobModel();
  await persistEmbeddingJob({
    model: writeRaceModel,
    collection: 'articles',
    id: 'article-write-race',
    text: 'Old write-boundary text',
    payload: { type: 'article', objectId: 'article-write-race' }
  });
  const writeRaceTexts = [];
  const writeRace = await drainEmbeddingJobQueue({
    model: writeRaceModel,
    at: new Date('2026-12-21T00:01:00.000Z'),
    isCurrentFn: async () => false,
    embedTextFn: async () => [0.6, 0.7],
    writeVectorFn: async ({ text }) => {
      writeRaceTexts.push(text);
      await persistEmbeddingJob({
        model: writeRaceModel,
        collection: 'articles',
        id: 'article-write-race',
        text: 'Current write-boundary text',
        payload: { type: 'article', objectId: 'article-write-race' }
      });
    }
  });
  assert.strictEqual(writeRace.results[0].status, 'superseded');
  assert.strictEqual(writeRace.results.at(-1).status, 'completed');
  assert.strictEqual(writeRaceTexts.at(-1), 'Current write-boundary text', 'the current revision repairs a late stale write');
  assert.strictEqual(writeRaceModel.jobs[0].text, 'Current write-boundary text');
  assert.strictEqual(writeRaceModel.jobs[0].status, 'completed');

  // Passage cleanup can remove a job after the worker's pre-write check. The
  // completion fence must then erase only the stale vector that worker wrote.
  const cleanupRaceModel = createEmbeddingJobModel();
  await persistEmbeddingJob({
    model: cleanupRaceModel,
    collection: 'articles',
    id: 'article-cleanup-race:passage:v1:2',
    text: 'Passage removed by the newer article revision',
    payload: {
      type: 'article',
      objectId: 'article-cleanup-race',
      subId: 'passage:v1:2',
      userId: '6873e7773cc513750ec17055',
      updatedAt: '2026-08-30T10:00:00.000Z'
    }
  });
  let storedCleanupRaceHash = '';
  const cleanupRace = await drainEmbeddingJobQueue({
    model: cleanupRaceModel,
    at: new Date('2026-12-21T00:01:00.000Z'),
    limit: 1,
    isCurrentFn: async () => false,
    embedTextFn: async () => [0.8, 0.9],
    writeVectorFn: async ({ text }) => {
      storedCleanupRaceHash = contentHashOf(text);
      await reconcileArticleEmbeddingJobs({
        model: cleanupRaceModel,
        userId: '6873e7773cc513750ec17055',
        articleId: 'article-cleanup-race',
        keepJobIds: [],
        notAfterUpdatedAt: '2026-08-30T11:00:00.000Z'
      });
    },
    deleteStaleVectorFn: async ({ text }) => {
      if (storedCleanupRaceHash === contentHashOf(text)) storedCleanupRaceHash = '';
      return { deletedCount: 1 };
    }
  });
  assert.strictEqual(cleanupRace.results[0].status, 'superseded');
  assert.strictEqual(storedCleanupRaceHash, '', 'cleanup cannot leave a vector written by a deleted stale job');
  assert.strictEqual(cleanupRaceModel.jobs.length, 0);

  // Deletion is stronger than passage shrinkage: it removes the whole article
  // family and makes a worker already spending time in embedText go quiet
  // before it can write deleted source material.
  const deletionRaceModel = createEmbeddingJobModel();
  await persistEmbeddingJob({
    model: deletionRaceModel,
    collection: 'articles',
    id: 'article-deleted:passage:v1:0',
    text: 'A passage whose source has been deleted.',
    payload: {
      type: 'article',
      objectId: 'article-deleted',
      subId: 'passage:v1:0',
      userId: OWNER
    }
  });
  let deletionRaceWrites = 0;
  let deletedVectorCalls = 0;
  const deletionRace = await drainEmbeddingJobQueue({
    model: deletionRaceModel,
    at: new Date('2026-12-21T00:01:00.000Z'),
    limit: 1,
    isCurrentFn: async () => false,
    embedTextFn: async () => {
      const deleted = await deleteArticleEmbeddingState({
        model: deletionRaceModel,
        vectorItemModel: {},
        userId: OWNER,
        articleId: 'article-deleted',
        deleteArticleVectorsFn: async ({ userId, articleId }) => {
          assert.strictEqual(String(userId), OWNER);
          assert.strictEqual(articleId, 'article-deleted');
          deletedVectorCalls += 1;
          return { deletedCount: 4 };
        }
      });
      assert.deepStrictEqual(deleted, { deletedJobs: 1, deletedVectors: 4 });
      return [0.2, 0.4];
    },
    writeVectorFn: async () => { deletionRaceWrites += 1; }
  });
  assert.strictEqual(deletionRace.results[0].status, 'superseded');
  assert.strictEqual(deletionRaceWrites, 0, 'a deleted article cannot be written after an in-flight embedding call');
  assert.strictEqual(deletedVectorCalls, 1);
  assert.strictEqual(deletionRaceModel.jobs.length, 0);

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
