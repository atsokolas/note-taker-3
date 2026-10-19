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
const { buildLegacyContentRouter } = require('../legacyContentRoutes');
const { buildEditionRouter } = require('../editionRoutes');
const { normalizeWikiTitleForPresentation } = require('../../services/wikiPresentationGuard');
const { heldFixtureEvent } = require('../../../note-taker-ui/src/pages/reviewerFixtureEvents');
const fixturePlan = require('../../../note-taker-ui/src/pages/reviewerFixturePlan.json');
const jobs = require('../../ai/embeddingJobs');
const reviewer = fixturePlan.edition.ownerId;
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
const response = () => ({ statusCode: 200, headers: {}, set(name, value) { this.headers[name] = value; return this; },
  status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const handle = (router, path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const authenticateToken = (_req, _res, next) => next();
const track = promise => { pending.push(promise); return promise; };

// Execute the actual browser workflow with offline API bindings. Removing only
// ESM declarations avoids adding a browser compiler to the server test runtime.
const fixtureWorkflow = (api, plan = fixturePlan) => {
  const filename = require('node:path').resolve(__dirname, '../../../note-taker-ui/src/pages/reviewerFixtureSetup.js');
  const source = require('node:fs').readFileSync(filename, 'utf8');
  assert.equal((source.match(/^import .*;$/gm) || []).length, 4);
  const program = source.replace(/^import .*;$/gm, '').replace(/export const /g, 'const ');
  return require('node:vm').compileFunction(`${program}\nreturn { createSetupClient, createFixtureSession, fixtureReceipt, editionFixtureReceipt };`,
    ['api', 'getAuthHeaders', 'plan', 'heldFixtureEvent'], { filename })(api,
    () => ({ headers: { Authorization: 'Bearer OFFLINE_UNUSABLE' } }), plan, heldFixtureEvent);
};
test('existing owned concept read verifies only the exact enabled reviewer, without credentials or new access', async () => {
  const router = buildConceptMetaRouter({ authenticateToken, TagMeta: models.TagMeta, User: models.User, escapeRegExp: value => value });
  const route = handle(router, '/api/concepts/:name/idea-workbench', 'get');
  const req = { params: { name: policy.identityConceptId }, user: { id: reviewer } };
  const res = response(); await route(req, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.reviewerIdentity.userId, reviewer);
  assert.equal(res.body.reviewerIdentity.ownershipVerified, true);
  assert.equal(res.body.reviewerIdentity.holdsActive, true);
  assert.equal(res.body.reviewerIdentity.fixtureBindingComplete, false);
  const activeOwner = policy.userId;
  policy.userId = '';
  const inactive = response(); await route(req, inactive);
  assert.equal(inactive.body.reviewerIdentity.holdsActive, false);
  policy.userId = activeOwner;
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
    // Feed the actual persisted import event into the same validator the form
    // uses, rather than inventing an article-shaped connector event in a mock.
    const actual = event.toObject();
    const source = { title: articles.at(-1).title, url: articles.at(-1).url };
    const criteria = { owner: reviewer, type: 'article', objectId: String(articles.at(-1)._id), source };
    assert.equal(actual.sourceType, 'external');
    assert.equal(heldFixtureEvent([actual], criteria), actual);
    for (const change of [{ userId: ordinary }, { provider: 'other' }, { eventType: 'created' },
      { status: 'pending' }, { attemptCount: 1 }, { url: 'https://example.com/different' },
      { metadata: { ...actual.metadata, importMode: 'url' } },
      { metadata: { ...actual.metadata, reviewerRehearsalHold: { reason: 'reviewer_rehearsal', inferenceAttemptedByHold: true } } }]) {
      assert.equal(heldFixtureEvent([{ ...actual, ...change }], criteria), null);
    }
    assert.equal(heldFixtureEvent([actual, { ...actual, sourceType: 'article', attemptCount: 1 }], criteria), null);
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

test('actual core and Edition routes persist and reconcile lost responses without repeating POSTs or invoking inference', async () => {
  providerCalls = 0; readBackCalls = 0; pending = [];
  const imports = buildImportRouter({ ...models, authenticateToken,
    crypto: require('node:crypto'), upload: { single: () => (_req, _res, next) => next() },
    enqueueArticleEmbedding: article => track(jobs.enqueueArticleEmbedding(article)),
    fetchImpl: async () => { providerCalls++; throw new Error('no provider or URL fetch in fixture setup'); } });
  const highlights = buildHighlightMutationRouter({ ...models, mongoose, authenticateToken,
    normalizeTags: tags => tags || [], normalizeItemType: value => value || 'note',
    enqueueHighlightEmbedding: args => track(jobs.enqueueHighlightEmbedding(args)), markTourSignal: async () => {} });
  const wiki = buildWikiRouter({ ...models, authenticateToken });
  const concepts = buildConceptMetaRouter({ authenticateToken, TagMeta: models.TagMeta, User: models.User, escapeRegExp: value => value });
  const articles = buildLegacyContentRouter({ ...models, authenticateToken });
  const editions = buildEditionRouter({ ...models, auth: authenticateToken,
    readArticle: async () => { providerCalls++; throw new Error('Edition setup must not fetch a source'); },
    relatedHighlights: async () => { providerCalls++; throw new Error('Edition setup must not retrieve semantically'); },
    onArticleSaved: () => { providerCalls++; throw new Error('Edition setup must not queue embeddings'); } });
  const calls = []; let alterRead = (_path, data) => data; let loseReply = '';
  const invoke = async (router, route, method, req) => {
    const res = response(); await handle(router, route, method)({ user: { id: reviewer }, query: {}, params: {}, ...req }, res);
    assert(res.statusCode < 400, JSON.stringify(res.body));
    return JSON.parse(JSON.stringify(res.body)); // the actual JSON wire shape
  };
  const api = {
    get: async (path, config = {}) => {
      calls.push({ method: 'GET', path }); let data;
      if (path.endsWith('/idea-workbench')) data = await invoke(concepts, '/api/concepts/:name/idea-workbench', 'get', { params: { name: policy.identityConceptId } });
      else if (path === '/api/articles/by-url') data = await invoke(articles, path, 'get', { query: config.params });
      else if (['/api/wiki/pages', '/api/wiki/source-events'].includes(path)) data = await invoke(wiki, path, 'get', { query: config.params });
      else if (/^\/api\/wiki\/pages\/[a-f0-9]{24}$/.test(path)) data = await invoke(wiki, '/api/wiki/pages/:id', 'get', { params: { id: path.split('/').at(-1) } });
      else if (path === '/api/edition-profiles' || path === '/api/editions') data = await invoke(editions, path, 'get', { query: config.params });
      else if (/^\/api\/editions\/[a-f0-9]{24}$/.test(path)) data = await invoke(editions, '/api/editions/:id', 'get', { params: { id: path.split('/').at(-1) } });
      else assert.fail(`Unexpected fixture GET ${path}`);
      return { data: alterRead(path, data) };
    },
    post: async (path, body) => {
      calls.push({ method: 'POST', path }); let data;
      if (path === '/api/import/text') data = await invoke(imports, path, 'post', { body });
      else if (path === '/api/wiki/pages') data = await invoke(wiki, path, 'post', { body });
      else if (/^\/articles\/[a-f0-9]{24}\/highlights$/.test(path)) data = await invoke(highlights, '/articles/:id/highlights', 'post', { params: { id: path.split('/')[2] }, body });
      else if (path === '/api/edition-profiles' || path === '/api/editions/file') data = await invoke(editions, path, 'post', { body });
      else assert.fail(`Unexpected fixture POST ${path}`);
      if (path === loseReply) { loseReply = ''; throw new Error('Lost committed Edition response'); }
      return { data };
    }
  };
  let workflow = fixtureWorkflow(api);
  let client = workflow.createSetupClient(undefined, { origin: 'https://www.noeis.io', conceptId: policy.identityConceptId });
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
  const locks = { request: async (_name, _options, callback) => callback({}) };
  const session = () => workflow.createFixtureSession({ client, storage, locks });
  const complete = await session().run();
  assert.equal(complete.complete, true);
  assert.equal(complete.wiki.title, fixturePlan.wiki.readbackTitle);
  assert.equal(complete.wiki.title, normalizeWikiTitleForPresentation(fixturePlan.wiki.title, { maxLength: 180 }));
  assert.notEqual(complete.wiki.title, fixturePlan.wiki.title);
  assert.equal(calls.filter(call => call.method === 'POST').length, 4);
  const key = `noeis.reviewer.fixtures.v${fixturePlan.version}.${reviewer}`;
  const journal = JSON.parse(saved.get(key)); delete journal.confirmed.wiki; journal.intent = 'wiki';
  const uncertain = JSON.stringify(journal); saved.set(key, uncertain); calls.length = 0;
  const reread = await session().inspect();
  assert.equal(reread.complete, true); assert.equal(reread.wiki._id, complete.wiki._id);
  assert.equal(JSON.parse(saved.get(key)).intent, null);
  assert.equal(workflow.fixtureReceipt(reread).wikiPageId, complete.wiki._id);
  assert(calls.every(call => call.method === 'GET'));

  for (const change of [
    data => { data.title = fixturePlan.wiki.title; },
    data => { data.userId = ordinary; },
    data => { data.body.content[0].content[0].marks = [{ type: 'bold' }]; },
    data => { data.plainText = 'Changed baseline'; },
    data => { data.sourceScope = 'entire_library'; },
    data => { data.sourceRefs[0].snippet = 'Changed source'; },
    data => { data.sourceRefs[0].objectId = ordinary; }
  ]) {
    saved.set(key, uncertain); calls.length = 0;
    alterRead = (path, data) => { if (path === `/api/wiki/pages/${complete.wiki._id}`) change(data); return data; };
    await assert.rejects(session().inspect(), /Wiki differs/);
    assert.equal(saved.get(key), uncertain); assert(calls.every(call => call.method === 'GET'));
  }
  alterRead = (_path, data) => data; await session().inspect(); calls.length = 0;
  const originalCoreJournal = saved.get(key);
  const append = fixturePlan.highlight.reviewedAppend;
  const appendedNote = `${fixturePlan.highlight.note}\n\n${append.text}`;
  const thought = await invoke(highlights, '/articles/:articleId/highlights/:highlightId/thoughts', 'post', {
    params: { articleId: complete.sources[0]._id, highlightId: complete.highlight._id },
    body: { explicitlyRequested: true, thought: append.text, operationId: 'offline_p2_guard_regression',
      expectedNoteHash: fixturePlan.highlight.noteHash, expectedNoteRevision: 0,
      expectedPassageHash: fixturePlan.highlight.textHash }
  });
  assert.equal(thought.noteHash, append.noteHash); assert.equal(thought.noteRevision, 1);
  // Bind the offline fixture's newly generated IDs to this same reviewed state.
  // Production keeps the fixed source/highlight IDs in the bundled fixture plan.
  workflow = fixtureWorkflow(api, { ...fixturePlan, highlight: { ...fixturePlan.highlight,
    reviewedAppend: { ...append, sourceId: complete.sources[0]._id, highlightId: complete.highlight._id } } });
  client = workflow.createSetupClient(undefined, { origin: 'https://www.noeis.io', conceptId: policy.identityConceptId });
  const p2 = await session().inspect();
  assert.equal(p2.highlight.note, appendedNote); assert.equal(p2.highlight.noteRevision, 1);
  assert.equal(workflow.fixtureReceipt(p2).readerNoteHash, append.noteHash);
  assert.equal(saved.get(key), originalCoreJournal); assert(calls.every(call => call.method === 'GET'));
  const originalArticleCount = await models.Article.countDocuments({ userId: reviewer });
  const originalEventCount = await models.WikiSourceEvent.countDocuments({ userId: reviewer });
  loseReply = '/api/edition-profiles';
  await assert.rejects(session().runEdition(), /uncertain/);
  assert.deepEqual(calls.filter(call => call.method === 'POST').map(call => call.path), ['/api/edition-profiles']);
  assert.equal(await models.EditionProfile.countDocuments({ userId: reviewer }), 1);
  calls.length = 0; const profileOnly = await session().inspectEdition();
  assert.equal(profileOnly.edition.profile.key, fixturePlan.edition.profile.key);
  assert.equal(profileOnly.edition.issue, null); assert(calls.every(call => call.method === 'GET'));
  loseReply = '/api/editions/file';
  await assert.rejects(session().runEdition(), /uncertain/);
  assert.equal(await models.Edition.countDocuments({ userId: reviewer }), 1);
  calls.length = 0; const edition = await session().inspectEdition();
  assert.equal(edition.edition.complete, true);
  assert.equal(edition.edition.issue.items[0].passage, fixturePlan.highlight.text);
  assert.equal(edition.edition.issue.items[0].passageCheck, 'unchecked');
  assert.equal(workflow.editionFixtureReceipt(edition).editionId, edition.edition.issue._id);
  assert.equal(workflow.editionFixtureReceipt(edition).readerNoteHash, append.noteHash);
  assert.equal(workflow.editionFixtureReceipt(edition).readerNoteRevision, 1);
  await session().runEdition(); assert(calls.every(call => call.method === 'GET'));
  assert.equal(saved.get(key), originalCoreJournal);
  assert.equal(await models.Article.countDocuments({ userId: reviewer }), originalArticleCount);
  assert.equal(await models.WikiSourceEvent.countDocuments({ userId: reviewer }), originalEventCount);
  const persistedArticle = await models.Article.findById(complete.sources[0]._id);
  assert.equal(persistedArticle.highlights.id(complete.highlight._id).note, appendedNote);
  assert.equal(persistedArticle.highlights.id(complete.highlight._id).noteRevision, 1);
  assert.equal(persistedArticle.highlights.id(complete.highlight._id).thoughtOperations.length, 1);
  const editionKey = `${key}.edition`; const editionJournal = saved.get(editionKey);
  for (const change of [
    data => { data.items[0].passage = 'Changed source words'; },
    data => { data.items[0].readerStatus = 'later'; },
    data => { data.items.push({ ...data.items[0], itemId: 'later-filing' }); },
    data => { data.windowEnd = data.windowStart; }
  ]) {
    calls.length = 0;
    alterRead = (path, data) => { if (path === `/api/editions/${edition.edition.issue._id}`) change(data); return data; };
    await assert.rejects(session().runEdition(), /Edition issue differs/);
    assert.equal(saved.get(editionKey), editionJournal); assert(calls.every(call => call.method === 'GET'));
  }
  const foreign = response(); await handle(editions, '/api/editions/:id', 'get')({ user: { id: ordinary }, params: { id: edition.edition.issue._id } }, foreign);
  assert.equal(foreign.statusCode, 404);
  for (const change of [
    rows => rows.map(row => ({ ...row, title: fixturePlan.wiki.title })),
    rows => [...rows, ...rows]
  ]) {
    saved.set(key, uncertain); calls.length = 0;
    alterRead = (path, data) => path === '/api/wiki/pages' ? change(data) : data;
    await assert.rejects(session().inspect(), /uncertain outcome|Duplicate fixture Wiki/);
    assert.equal(saved.get(key), uncertain); assert(calls.every(call => call.method === 'GET'));
  }
  await Promise.all(pending); await new Promise(resolve => setImmediate(resolve));
  assert.equal(providerCalls, 0); assert.equal(readBackCalls, 0);
  assert.equal(await models.EmbeddingJob.countDocuments({ status: { $ne: 'held' } }), 0);
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
  await ledger.updateOne({ _id: policy.ledgerId }, { $set: { userId: reviewer, failureCode: { secret: 'SECRET_NESTED_FIELD' } } });
  const corrupt = await readReviewerBudgetStatus({ userId: reviewer, pageId: policy.pageId });
  assert.equal(corrupt.status, 'unavailable'); assert.equal(JSON.stringify(corrupt).includes('SECRET_NESTED_FIELD'), false);
  await ledger.updateOne({ _id: policy.ledgerId }, { $unset: { failureCode: '' }, $set: { 'receipts.0.generationId': { secret: 'SECRET_GENERATION_FIELD' } } });
  const badGeneration = await readReviewerBudgetStatus({ userId: reviewer, pageId: policy.pageId });
  assert.equal(badGeneration.status, 'unavailable'); assert.equal(JSON.stringify(badGeneration).includes('SECRET_GENERATION_FIELD'), false);
});
