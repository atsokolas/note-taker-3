const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const {
  createBoundedReviewerChat, reviewerMaintenanceArgs, isReviewer, bounds, policy
} = require('../reviewerRehearsalBudget');

const target = { userId: '111111111111111111111111', pageId: '222222222222222222222222', sourceIds: ['333333333333333333333333', '444444444444444444444444'], ledgerId: policy.ledgerId };
const request = suffix => ({ messages: [{ role: 'system', content: 'Return source-grounded JSON.' }, { role: 'user', content: `Fictional evidence ${suffix}.` }] });
const reply = () => ({ ok: true, json: async () => ({ id: 'synthetic-generation', model: bounds.MODEL, choices: [{ message: { content: '{"article":"Synthetic provider fixture."}' } }], usage: { prompt_tokens: 100, completion_tokens: 100, cost: 0.000075 } }) });
let mongo; let client; let db; let serial = 0;
test.before(async () => { mongo = await MongoMemoryServer.create(); client = new MongoClient(mongo.getUri()); await client.connect(); db = client.db('reviewer_budget_offline'); });
test.after(async () => { if (client) await client.close(); if (mongo) await mongo.stop(); });
const ledger = () => db.collection(`ledger_${++serial}`);
const adapter = (collection, fetchFn, extras = {}) => createBoundedReviewerChat({ target, getLedger: () => collection, apiKey: () => 'synthetic-noncredential', fetchFn, ...extras });

test('actual wire payload is allowlisted with all provider cost controls; retry/cache sends one POST', async () => {
  const collection = ledger(); let calls = 0;
  const chat = adapter(collection, async (url, options) => {
    calls++;
    assert.equal(url, bounds.ENDPOINT); assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.deepEqual(body, {
      model: bounds.MODEL, messages: request('one').messages, max_tokens: 4200, stream: false, service_tier: 'default',
      provider: { require_parameters: true, allow_fallbacks: false, max_price: { prompt: 0.2, completion: 1, request: 0 } }
    });
    return reply();
  });
  const input = { ...request('one'), modelRoutes: ['expensive/fallback'], plugins: [{}], reasoning: { effort: 'high' }, tools: [{}], maxTokens: 999999, provider: { max_price: {} } };
  const first = await chat(input); assert.deepEqual(await chat(input), first); assert.equal(calls, 1);
  const saved = await collection.findOne({ _id: target.ledgerId });
  assert.equal(saved.requests, 1); assert.equal(saved.reservedMicroUsd, 100000); assert.equal(saved.inFlight, false);
  assert.equal(saved.receipts[0].usage.cost, 0.000075);
});

test('three actual requests exhaust lifetime reservation; new adapter/new arguments cannot reset it', async () => {
  const collection = ledger(); let calls = 0; const provider = async () => { calls++; return reply(); };
  const chat = adapter(collection, provider);
  for (let i = 0; i < 3; i++) await chat(request(i));
  await assert.rejects(adapter(collection, provider)(request('new-operation-after-restart')), { code: 'REVIEWER_BUDGET_HELD' });
  assert.equal(calls, 3);
  const saved = await collection.findOne({ _id: target.ledgerId }); assert.equal(saved.requests, 3); assert.equal(saved.reservedMicroUsd, 300000);
  await chat(request(0)); assert.equal(calls, 3, 'a successful replay remains readable after exhaustion');
});

test('concurrent requests reserve atomically and cannot start overlapping provider calls', async () => {
  const collection = ledger(); let release; let started; let calls = 0;
  const start = new Promise(resolve => { started = resolve; }); const barrier = new Promise(resolve => { release = resolve; });
  const chat = adapter(collection, async () => { calls++; started(); await barrier; return reply(); });
  const first = chat(request('first')); await start;
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => chat(request(`concurrent-${i}`))));
  assert(outcomes.every(result => result.status === 'rejected' && result.reason.code === 'REVIEWER_BUDGET_HELD'));
  assert.equal(calls, 1); release(); await first;
  assert.equal((await collection.findOne({ _id: target.ledgerId })).reservedMicroUsd, 100000);
});

test('lost response and timeout freeze consumed reservation through retries and restarts', async () => {
  for (const mode of ['lost-response', 'timeout']) {
    const collection = ledger(); let calls = 0;
    const chat = adapter(collection, async (_url, options) => {
      calls++;
      if (mode === 'lost-response') throw new Error('synthetic socket reset');
      await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }));
    }, { timeoutMs: 10 });
    await assert.rejects(chat(request(mode)), { code: 'REVIEWER_PROVIDER_UNCERTAIN' });
    const saved = await collection.findOne({ _id: target.ledgerId }); assert.equal(saved.requests, 1); assert.equal(saved.reservedMicroUsd, 100000); assert.equal(saved.inFlight, true); assert.equal(saved.frozen, true);
    await assert.rejects(adapter(collection, async () => { calls++; return reply(); })(request('retry-new-operation')), { code: 'REVIEWER_BUDGET_HELD' });
    assert.equal(calls, 1);
  }
});

test('unsupported provider response, unknown cost, changed model and over-limit usage freeze without fallback', async () => {
  for (const variant of ['reject', 'cost', 'model', 'tokens', 'output']) {
    const collection = ledger(); let calls = 0;
    const chat = adapter(collection, async () => {
      calls++; const good = reply(); const data = await good.json();
      if (variant === 'reject') return { ok: false, status: 400 };
      if (variant === 'cost') delete data.usage.cost;
      if (variant === 'model') data.model = 'expensive/unapproved-model';
      if (variant === 'tokens') data.usage.prompt_tokens = 128001;
      if (variant === 'output') data.usage.completion_tokens = 4201;
      return { ok: true, json: async () => data };
    });
    await assert.rejects(chat(request(variant)), /bounded provider request|verifiable bounded receipt/);
    await assert.rejects(chat(request('new')), { code: 'REVIEWER_BUDGET_HELD' }); assert.equal(calls, 1);
  }
});

test('input, identity and ledger failures fail before any paid call', async () => {
  let calls = 0; const provider = async () => { calls++; return reply(); };
  const collection = ledger(); const chat = adapter(collection, provider);
  await assert.rejects(chat({ messages: [{ role: 'user', content: 'Only one' }] }), { code: 'REVIEWER_INPUT_INVALID' });
  await assert.rejects(chat(request('💠'.repeat(20000))), { code: 'REVIEWER_INPUT_TOO_LARGE' });
  await assert.rejects(adapter(collection, provider, { apiKey: () => '' })(request('key')), { code: 'REVIEWER_PROVIDER_UNAVAILABLE' });
  await assert.rejects(adapter(collection, provider, { target: { ...target, userId: '' } })(request('unverified')), { code: 'REVIEWER_POLICY_UNVERIFIED' });
  await assert.rejects(adapter(collection, provider, { getLedger: () => { throw new Error('synthetic DB unavailable'); } })(request('storage')), { code: 'REVIEWER_LEDGER_UNAVAILABLE' });
  assert.equal(calls, 0);
  await collection.insertOne({ _id: target.ledgerId, userId: 'other-account', pageId: target.pageId });
  await assert.rejects(chat(request('wrong-ledger')), { code: 'REVIEWER_LEDGER_IDENTITY_MISMATCH' }); assert.equal(calls, 0);
});

test('cached success stays readable during a later freeze without another provider request', async () => {
  const collection = ledger(); let calls = 0;
  const chat = adapter(collection, async () => { calls++; if (calls > 1) throw new Error('Synthetic lost response'); return reply(); });
  const completed = await chat(request('cached'));
  await assert.rejects(chat(request('uncertain')), { code: 'REVIEWER_PROVIDER_UNCERTAIN' });
  assert.deepEqual(await chat(request('cached')), completed); assert.equal(calls, 2);
  const saved = await collection.findOne({ _id: target.ledgerId }); assert.equal(saved.frozen, true); assert.equal(saved.reservedMicroUsd, 200000);
});

test('settlement persistence failure retains reservation and prevents a second paid attempt', async () => {
  const collection = ledger(); let calls = 0;
  const brokenSettlement = {
    findOne: collection.findOne.bind(collection), findOneAndUpdate: collection.findOneAndUpdate.bind(collection),
    updateOne: (query, update, options) => update.$push ? Promise.reject(Object.assign(new Error('Synthetic settlement failure'), { code: 11600 })) : collection.updateOne(query, update, options)
  };
  const chat = adapter(collection, async () => { calls++; return reply(); }, { getLedger: () => brokenSettlement });
  await assert.rejects(chat(request('first')), { code: 'REVIEWER_PROVIDER_UNCERTAIN' });
  await assert.rejects(adapter(collection, async () => { calls++; return reply(); })(request('new')), { code: 'REVIEWER_BUDGET_HELD' });
  assert.equal(calls, 1); const saved = await collection.findOne({ _id: target.ledgerId }); assert.equal(saved.reservedMicroUsd, 100000); assert.equal(saved.frozen, true); assert.equal(saved.inFlight, true);
});

test('numeric Mongo reservation errors become typed ledger failures with zero provider calls', async () => {
  const collection = ledger(); let calls = 0;
  const interrupted = { updateOne: async () => { throw Object.assign(new Error('Synthetic numeric Mongo failure'), { code: 11600 }); } };
  const chat = adapter(collection, async () => { calls++; return reply(); }, { getLedger: () => interrupted });
  await assert.rejects(chat(request('numeric-mongo-error')), { code: 'REVIEWER_LEDGER_UNAVAILABLE' }); assert.equal(calls, 0);
});

test('policy has no effect on ordinary users; only verified private fixture receives adapter and cannot stream', () => {
  assert.equal(isReviewer('555555555555555555555555', target), false);
  assert.deepEqual(reviewerMaintenanceArgs({ userId: 'ordinary-user', target, page: null }), {});
  const page = { _id: target.pageId, userId: target.userId, visibility: 'private', pageType: 'topic', sourceScope: 'selected_sources', sourceRefs: target.sourceIds.map(objectId => ({ type: 'article', objectId })) };
  const chat = () => {}; const args = reviewerMaintenanceArgs({ userId: target.userId, page, target, chat });
  assert.equal(args.chat, chat); assert.equal(args.isConfigured(), true); assert.equal(args.streamDraft, false);
  for (const change of [{ _id: target.sourceIds[0] }, { visibility: 'public' }, { sourceScope: 'entire_library' }, { sourceRefs: [] }, { pageType: 'repo' }, { userId: 'other-owner' }]) {
    assert.throws(() => reviewerMaintenanceArgs({ userId: target.userId, target, page: { ...page, ...change } }), { code: 'REVIEWER_FIXTURE_MISMATCH' });
  }
});
