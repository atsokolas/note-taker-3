const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const models = require('../../models');
const { policy, holdReviewerSourceEvent, readReviewerBudgetStatus } = require('../../services/reviewerRehearsalBudget');
const reading = require('../../services/readingTalksBack');
let readBackCalls = 0;
reading.proposeFromReading = async () => { readBackCalls++; throw new Error('reviewer read-back must be held'); };
const { processWikiSourceEvent } = require('../../services/wikiMaintenanceOrchestrator');
const { claimPendingWikiSourceEvents } = require('../../services/wikiSourceEventWorker');
const { createWikiSourceEvent } = require('../../services/wikiSourceEventService');
const { buildImportRouter } = require('../importRoutes');
const { buildHighlightMutationRouter } = require('../highlightMutationRoutes');
const { buildWikiRouter } = require('../wikiRoutes');
const { buildConceptMetaRouter } = require('../conceptMetaRoutes');
const jobs = require('../../ai/embeddingJobs');
const reviewer = '111111111111111111111111';
const ordinary = '555555555555555555555555';
const originalPolicy = { ...policy };
let mongo; let providerCalls = 0; let pending = [];
test.before(async () => {
  Object.assign(policy, { userId: reviewer, pageId: '', sourceIds: [] });
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  await models.User.collection.insertOne({ _id: new mongoose.Types.ObjectId(reviewer), username: 'noeis_openai_review', password: 'OFFLINE_UNUSABLE', accountDisabledAt: null });
  await models.TagMeta.collection.insertOne({ _id: new mongoose.Types.ObjectId(policy.identityConceptId), userId: new mongoose.Types.ObjectId(reviewer), name: 'Offline synthetic reviewer concept', isPublic: false });
});
test.after(async () => { await Promise.allSettled(pending); Object.assign(policy, originalPolicy); await mongoose.disconnect(); await mongo.stop(); });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const handle = (router, path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const authenticateToken = (_req, _res, next) => next();
const track = promise => { pending.push(promise); return promise; };
test('existing owned concept read verifies only the exact enabled reviewer, without credentials or new access', async () => {
  const router = buildConceptMetaRouter({ authenticateToken, TagMeta: models.TagMeta, User: models.User, escapeRegExp: value => value });
  const route = handle(router, '/api/concepts/:name/idea-workbench', 'get');
  const req = { params: { name: policy.identityConceptId }, user: { id: reviewer } };
  const res = response(); await route(req, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.reviewerIdentity.userId, reviewer);
  assert.equal(res.body.reviewerIdentity.ownershipVerified, true);
  assert.equal(JSON.stringify(res.body).includes('OFFLINE_UNUSABLE'), false);
  const agent = response(); await route({ ...req, agentToken: {} }, agent);
  assert.equal(agent.body.reviewerIdentity, undefined);
  const outsider = response(); await route({ ...req, user: { id: ordinary } }, outsider);
  assert.equal(outsider.statusCode, 404);
  await models.User.updateOne({ _id: reviewer }, { $set: { accountDisabledAt: new Date() } });
  const disabled = response(); await route(req, disabled); assert.equal(disabled.body.reviewerIdentity, undefined);
  await models.User.updateOne({ _id: reviewer }, { $set: { accountDisabledAt: null } });
});

test('real human text import, highlight and private Wiki creation persist setup while all inference doors are held', async () => {
  providerCalls = 0; readBackCalls = 0; pending = [];
  const imports = buildImportRouter({ ...models, authenticateToken,
    crypto: require('node:crypto'), path: require('node:path'), upload: { single: () => (_req, _res, next) => next() },
    enqueueArticleEmbedding: article => track(jobs.enqueueArticleEmbedding(article)),
    fetchImpl: async () => { providerCalls++; throw new Error('fixture import must not fetch'); }
  });
  const articles = [];
  for (let i = 1; i <= 2; i++) {
    const res = response();
    await handle(imports, '/api/import/text', 'post')({ user: { id: reviewer }, body: {
      title: `Offline fictional source ${i}`, text: `NOEIS_OPENAI_REVIEW_FICTIONAL_ONLY. Offline source ${i}. Measurement design preserves a bounded observation.`,
      url: `https://example.com/noeis-openai-review/offline-source-${i}`, author: 'Synthetic fixture author'
    } }, res);
    assert.equal(res.statusCode, 201); assert.equal(res.body.status, 'held');
    articles.push(await models.Article.findById(res.body.article._id));
    const event = await models.WikiSourceEvent.findById(res.body.sourceEventId);
    assert.equal(event.status, 'held'); assert.equal(event.attemptCount, 0);
  }
  const highlights = buildHighlightMutationRouter({ ...models, mongoose, authenticateToken,
    normalizeTags: tags => tags || [],
    normalizeItemType: value => value || 'note',
    enqueueHighlightEmbedding: args => track(jobs.enqueueHighlightEmbedding(args)),
    markTourSignal: async () => {} });
  const res = response();
  await handle(highlights, '/articles/:id/highlights', 'post')({ user: { id: reviewer }, params: { id: String(articles[0]._id) },
    body: { text: 'Measurement design preserves a bounded observation.', note: 'My synthetic reader thought: independent replication is still needed.' } }, res);
  assert.equal(res.statusCode, 200);
  const stored = await models.Article.findById(articles[0]._id);
  assert.equal(stored.highlights.length, 1); assert.match(stored.highlights[0].note, /My synthetic reader thought/);
  const wiki = buildWikiRouter({ ...models, authenticateToken });
  const pageRes = response();
  await handle(wiki, '/api/wiki/pages', 'post')({ user: { id: reviewer }, body: {
    title: 'Offline private fictional baseline', pageType: 'topic', sourceScope: 'selected_sources',
    createdFrom: { type: 'paste', text: 'NOEIS_OPENAI_REVIEW_FICTIONAL_ONLY: model-free setup.' },
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'NOEIS_OPENAI_REVIEW_FICTIONAL_ONLY: retained baseline.' }] }] },
    initialSourceRefs: articles.map(article => ({ type: 'article', objectId: String(article._id), title: article.title, url: article.url, snippet: article.content }))
  } }, pageRes);
  assert.equal(pageRes.statusCode, 201);
  const page = await models.WikiPage.findById(pageRes.body._id);
  assert.equal(page.visibility, 'private'); assert.equal(page.status, 'draft'); assert.equal(page.sourceRefs.length, 2);
  await Promise.all(pending);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await models.EmbeddingJob.countDocuments({ status: { $ne: 'held' } }), 0);
  assert.equal(await models.WikiSourceEvent.countDocuments({ status: { $ne: 'held' } }), 0);
  assert.equal(await models.WikiMaintenanceRun.countDocuments({}), 0);
  assert.equal(providerCalls, 0); assert.equal(readBackCalls, 0);
});

test('direct event processing, ID invocation and worker claiming fail closed before maintenance and read-back', async () => {
  const event = await createWikiSourceEvent({ WikiSourceEvent: models.WikiSourceEvent, userId: reviewer, sourceType: 'article', text: 'Offline fictional arrival.' });
  const trappedModels = { WikiSourceEvent: models.WikiSourceEvent, WikiPage: { get db() { throw new Error('must stop before write budget'); } } };
  for (const args of [{ sourceEvent: event }, { sourceEventId: event._id }]) {
    const result = await processWikiSourceEvent({ ...args, userId: reviewer, models: trappedModels });
    assert.equal(result.held, true); assert.equal(result.deferred, true);
  }
  assert.deepEqual(await claimPendingWikiSourceEvents({ WikiSourceEvent: { findOneAndUpdate: () => { throw new Error('must not claim reviewer work'); } }, userId: reviewer }), []);
  await assert.rejects(holdReviewerSourceEvent({ event, userId: ordinary, WikiSourceEvent: models.WikiSourceEvent }), { code: 'REVIEWER_SOURCE_EVENT_OWNER_MISMATCH' });
  await assert.rejects(holdReviewerSourceEvent({ event, userId: reviewer, WikiSourceEvent: { updateOne: async () => { throw new Error('offline storage failure'); } } }), { code: 'REVIEWER_SOURCE_EVENT_HOLD_UNAVAILABLE' });
  assert.equal(readBackCalls, 0);
});

test('ordinary source events preserve pending status under a configured reviewer policy', async () => {
  const event = await createWikiSourceEvent({ WikiSourceEvent: models.WikiSourceEvent, userId: ordinary, sourceType: 'article', text: 'Offline ordinary arrival.' });
  assert.equal(event.status, 'pending'); assert.equal(event.metadata.reviewerRehearsalHold, undefined);
});

test('existing private Wiki read exposes only owned budget counters/usage; caches and foreign owners stay private', async () => {
  const page = await models.WikiPage.findOne({ userId: reviewer });
  policy.pageId = String(page._id);
  const route = handle(buildWikiRouter({ ...models, authenticateToken }), '/api/wiki/pages/:id', 'get');
  const req = { user: { id: reviewer }, params: { id: policy.pageId }, query: {} };
  const before = response(); await route(req, before);
  assert.equal(before.body.reviewerBudget.status, 'not_started');
  const ledger = mongoose.connection.db.collection('reviewer_rehearsal_budgets');
  await ledger.insertOne({ _id: policy.ledgerId, userId: reviewer, pageId: policy.pageId,
    requests: 1, reservedMicroUsd: 100000, inFlight: false, frozen: false,
    receipts: [{ generationId: 'offline-provider-receipt', usage: { promptTokens: 100, completionTokens: 10, cost: 0.00003 },
      completion: { text: 'SECRET_CACHE_MUST_NOT_LEAK' } }] });
  const res = response(); await route(req, res);
  assert.equal(res.body.reviewerBudget.requests, 1); assert.equal(res.body.reviewerBudget.reservedUsd, 0.1);
  assert.equal(res.body.reviewerBudget.receipts[0].usage.cost, 0.00003);
  assert.equal(JSON.stringify(res.body).includes('SECRET_CACHE_MUST_NOT_LEAK'), false);
  const outsider = response(); await route({ ...req, user: { id: ordinary } }, outsider);
  assert.equal(outsider.statusCode, 404);
  assert.equal(await readReviewerBudgetStatus({ userId: ordinary, pageId: policy.pageId, getLedger: () => { throw new Error('ordinary read must not inspect ledger'); } }), null);
  await ledger.updateOne({ _id: policy.ledgerId }, { $set: { userId: ordinary } });
  const mismatch = await readReviewerBudgetStatus({ userId: reviewer, pageId: policy.pageId });
  assert.equal(mismatch.status, 'unavailable'); assert.equal(mismatch.receipts, undefined);
});
