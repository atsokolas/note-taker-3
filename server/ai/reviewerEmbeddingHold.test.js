const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { policy, HOLD_REASON } = require('../services/reviewerRehearsalBudget');
const { EmbeddingJob, WikiPage } = require('../models');
const { enqueueEmbedding, persistEmbeddingJob, processTransientEmbedding, drainEmbeddingJobQueue } = require('./embeddingJobs');

const reviewer = '111111111111111111111111'; const ordinary = '555555555555555555555555';
const originalPolicy = { ...policy }; let mongo;
test.before(async () => { policy.userId = reviewer; mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await EmbeddingJob.init(); });
test.after(async () => { Object.assign(policy, originalPolicy); await mongoose.disconnect(); if (mongo) await mongo.stop(); });
test.beforeEach(async () => { await EmbeddingJob.deleteMany({}); });
const job = owner => ({ collection: 'highlights', id: `${owner}:fixture`, text: 'Fictional passage.', payload: { userId: owner, type: 'highlight', objectId: '333333333333333333333333' } });

test('reviewer enqueue persists held status; ordinary user retains queued status', async () => {
  await enqueueEmbedding(job(reviewer)); await enqueueEmbedding(job(ordinary));
  const held = await EmbeddingJob.findOne({ 'payload.userId': reviewer }).lean();
  assert.equal(held.status, 'held'); assert.equal(held.nextRunAt, null); assert.equal(held.completedAt, null); assert.equal(held.lastError, HOLD_REASON); assert.equal(held.attemptCount, 0);
  assert.equal((await EmbeddingJob.findOne({ 'payload.userId': ordinary }).lean()).status, 'queued');
});

test('persistence error and disabled durable-queue flag never send reviewer work to transient provider', async () => {
  let transient = 0;
  const broken = { findOneAndUpdate: async () => { throw new Error('Synthetic persistence failure'); } };
  await enqueueEmbedding(job(reviewer), { model: broken, enqueueTransient: () => { transient++; } }); assert.equal(transient, 0);
  await assert.rejects(enqueueEmbedding(job(reviewer), { model: broken, requireDurable: true }), /Synthetic persistence failure/); assert.equal(transient, 0);
  const prior = process.env.EMBEDDING_PERSISTENT_QUEUE_DISABLED;
  try { process.env.EMBEDDING_PERSISTENT_QUEUE_DISABLED = 'true'; await enqueueEmbedding(job(reviewer)); assert.equal((await EmbeddingJob.findOne({ 'payload.userId': reviewer }).lean()).status, 'held'); }
  finally { if (prior === undefined) delete process.env.EMBEDDING_PERSISTENT_QUEUE_DISABLED; else process.env.EMBEDDING_PERSISTENT_QUEUE_DISABLED = prior; }
});

test('durable worker holds already queued reviewer job while ordinary job still embeds once', async () => {
  for (const owner of [reviewer, ordinary]) await EmbeddingJob.create({ collection: 'highlights', objectId: `${owner}:queued`, text: 'Fictional queued passage.', payload: { userId: owner, type: 'highlight', objectId: '333333333333333333333333' }, status: 'queued', nextRunAt: new Date(0) });
  let calls = 0; let writes = 0;
  const result = await drainEmbeddingJobQueue({ limit: 5, isCurrentFn: async () => false, embedTextFn: async () => { calls++; return [1, 0]; }, writeVectorFn: async () => { writes++; } });
  assert.equal(calls, 1); assert.equal(writes, 1); assert(result.results.some(row => row.status === 'held'));
  assert.equal((await EmbeddingJob.findOne({ 'payload.userId': reviewer }).lean()).status, 'held');
  assert.equal((await EmbeddingJob.findOne({ 'payload.userId': ordinary }).lean()).status, 'completed');
});

test('old transient reviewer job is held before provider call; ordinary transient job still executes', async () => {
  let calls = 0; let writes = 0; const dependencies = { embedTextFn: async () => { calls++; return [1, 0]; }, writeVectorFn: async () => { writes++; } };
  assert.deepEqual(await processTransientEmbedding(job(reviewer), dependencies), { status: 'held' });
  assert.equal(calls, 0); await processTransientEmbedding(job(ordinary), dependencies); assert.equal(calls, 1); assert.equal(writes, 1);
  assert.equal((await EmbeddingJob.findOne({ 'payload.userId': reviewer }).lean()).status, 'held');
});

test('actual Wiki post-save hooks persist held judgment and claim embeddings', async () => {
  const page = await WikiPage.create({ userId: reviewer, title: 'Fictional source test', slug: 'fictional-source-test', pageType: 'topic', visibility: 'private', sourceScope: 'selected_sources', judgment: { kind: 'thesis', currentJudgment: 'A fictional held sentence has enough context to be indexed later.' }, claims: [{ claimId: 'fictional-claim', text: 'The fictional sources compare repeated scores with deliberately changed scoring rules.', sourceRefIds: ['333333333333333333333333', '444444444444444444444444'] }] });
  let rows = [];
  for (let attempt = 0; attempt < 30; attempt++) { rows = await EmbeddingJob.find({ 'payload.userId': reviewer }).lean(); if (rows.length >= 2) break; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert(rows.some(row => row.collection === 'judgment_claims')); assert(rows.some(row => row.collection === 'wiki_claims')); assert(rows.every(row => row.status === 'held' && row.completedAt === null));
  await WikiPage.deleteOne({ _id: page._id }); // Only fresh local synthetic database.
});
