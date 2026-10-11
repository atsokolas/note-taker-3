const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { WikiPage, WikiRevision, Article } = require('../../models');
const { buildWikiRouter } = require('../wikiRoutes');
const { CHATGPT_ACCESS_PROFILE } = require('../../services/chatgptAccessPolicy');
const { snapshotCanonicalContentHash: snapshotContentHash, snapshotPage, matchesTrustedRevisionHead } = require('../../services/wikiRevisionService');
const { policy, reviewerMaintenanceArgs, createBoundedReviewerChat, bounds } = require('../../services/reviewerRehearsalBudget');

const target = { userId: '111111111111111111111111', pageId: '222222222222222222222222', sourceIds: ['333333333333333333333333', '444444444444444444444444'], ledgerId: policy.ledgerId };
const ordinary = '555555555555555555555555'; const ordinaryPageId = '666666666666666666666666';
const originalPolicy = { ...policy }; let mongo; let providerCalls = 0;
test.before(async () => {
  Object.assign(policy, target); mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  await Article.collection.insertMany(target.sourceIds.map(id => ({ _id: new mongoose.Types.ObjectId(id), userId: new mongoose.Types.ObjectId(target.userId), title: 'Fictional source', content: 'Fictional evidence.' })));
});
test.after(async () => { Object.assign(policy, originalPolicy); await mongoose.disconnect(); if (mongo) await mongo.stop(); });
const res = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
const fixture = async (userId = target.userId, pageId = target.pageId) => {
  const doc = new WikiPage({ _id: pageId, userId, title: 'Fictional retained head', slug: `fictional-${pageId}`, pageType: 'topic', visibility: 'private', sourceScope: userId === target.userId ? 'selected_sources' : 'entire_library', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Retained fictional owner wording.' }] }] }, plainText: 'Retained fictional owner wording.', sourceRefs: userId === target.userId ? target.sourceIds.map((objectId, index) => ({ type: 'article', objectId, title: 'Fictional source', url: `https://example.com/noeis-openai-review/source-${index + 1}`, snippet: 'Fictional evidence.' })) : [], aiState: { draftStatus: 'ready', quality: { ok: true, status: 'pass' } } });
  await doc.validate(); await WikiPage.collection.replaceOne({ _id: doc._id }, doc.toObject(), { upsert: true }); return WikiPage.findById(doc._id);
};
const build = (quality = true) => {
  const chat = createBoundedReviewerChat({ target, getLedger: () => mongoose.connection.db.collection('route_rehearsal_ledger'), apiKey: () => 'synthetic-unusable', fetchFn: async () => { providerCalls++; return { ok: true, json: async () => ({ id: 'synthetic-route-generation', model: bounds.MODEL, choices: [{ message: { content: JSON.stringify({ article: 'Candidate fixture from a mocked provider.' }) } }], usage: { prompt_tokens: 200, completion_tokens: 100, cost: 0.00009 } }) }; } });
  const router = buildWikiRouter({
    authenticateToken: (_req, _res, next) => next(), WikiPage, WikiRevision, Article,
    reviewerMaintenanceArgs: args => reviewerMaintenanceArgs({ ...args, target, chat }),
    maintainWikiPage: async args => {
      if (String(args.userId) === target.userId) {
        assert.equal(args.streamDraft, false); assert.equal(args.isConfigured(), true);
        const completion = await args.chat({ messages: [{ role: 'system', content: 'Return fictional candidate JSON.' }, { role: 'user', content: 'Two fictional sources.' }] });
        args.page.plainText = JSON.parse(completion.text).article;
      } else { assert.equal(args.chat, undefined); args.page.plainText = 'Ordinary candidate behavior.'; }
      // Provider/quality fixtures test route publication; this is not production
      // content-quality or successful reviewer test evidence.
      args.page.body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: args.page.plainText }] }] };
      args.page.aiState = { draftStatus: 'ready', quality: { ok: quality, status: quality ? 'pass' : 'fail', failures: quality ? [] : ['Synthetic quality failure.'] } };
      return args.page;
    }
  });
  return router.stack.find(layer => layer.route?.path === '/api/wiki/pages/:id/ai/draft').route.stack.at(-1).handle;
};

test('reviewer synchronous draft uses bounded provider and persists real pending revision without replacing accepted head', async () => {
  const page = await fixture(); const before = snapshotContentHash(snapshotPage(page)); const response = res();
  await build()({ params: { id: target.pageId }, user: { id: target.userId }, body: {}, agentToken: { accessProfile: CHATGPT_ACCESS_PROFILE } }, response);
  assert.equal(response.statusCode, 202); assert.equal(response.body.firstHeadReview.status, 'awaiting_acceptance');
  const stored = await WikiPage.findById(target.pageId); assert.equal(snapshotContentHash(snapshotPage(stored)), before);
  const revision = await WikiRevision.findById(response.body.firstHeadReview.revisionId); assert.equal(revision.promotionStatus, 'candidate'); assert.equal(revision.quality.ok, true); assert.equal(matchesTrustedRevisionHead({ current: snapshotPage(stored), revision }), true);
  assert.equal(providerCalls, 1);
  const repeated = res(); await build()({ params: { id: target.pageId }, user: { id: target.userId }, body: {}, agentToken: { accessProfile: CHATGPT_ACCESS_PROFILE } }, repeated);
  assert.equal(repeated.statusCode, 202); assert.equal(providerCalls, 1, 'identical provider input replay is free');
});

test('normal quality rejection remains rejection and preserves accepted owner head', async () => {
  const page = await fixture(); const before = snapshotContentHash(snapshotPage(page)); const response = res();
  await build(false)({ params: { id: target.pageId }, user: { id: target.userId }, body: {}, agentToken: { accessProfile: CHATGPT_ACCESS_PROFILE } }, response);
  assert.equal(response.statusCode, 422); assert.equal(response.body.code, 'WIKI_CANDIDATE_REJECTED'); assert.equal(snapshotContentHash(snapshotPage(await WikiPage.findById(target.pageId))), before);
});

test('reviewer fixture ownership mismatch fails before inference or candidate writes', async () => {
  await fixture(); const id = new mongoose.Types.ObjectId(target.sourceIds[1]);
  await Article.collection.updateOne({ _id: id }, { $set: { userId: new mongoose.Types.ObjectId(ordinary) } });
  try { const calls = providerCalls; const response = res(); await build()({ params: { id: target.pageId }, user: { id: target.userId }, body: {} }, response); assert.equal(response.statusCode, 422); assert.equal(response.body.code, 'REVIEWER_SOURCE_OWNERSHIP_MISMATCH'); assert.equal(providerCalls, calls); }
  finally { await Article.collection.updateOne({ _id: id }, { $set: { userId: new mongoose.Types.ObjectId(target.userId) } }); }
});

test('ordinary user receives existing maintenance behavior without bounded adapter or reviewer ledger charge', async () => {
  const page = await fixture(ordinary, ordinaryPageId); const before = snapshotContentHash(snapshotPage(page)); const calls = providerCalls; const response = res();
  await build()({ params: { id: ordinaryPageId }, user: { id: ordinary }, body: {}, agentToken: { accessProfile: CHATGPT_ACCESS_PROFILE } }, response);
  assert.equal(response.statusCode, 202); assert.equal(providerCalls, calls); assert.equal(snapshotContentHash(snapshotPage(await WikiPage.findById(ordinaryPageId))), before);
});
