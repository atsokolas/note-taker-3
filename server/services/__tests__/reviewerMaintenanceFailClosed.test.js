const test = require('node:test');
const assert = require('node:assert/strict');
const { maintainWikiPage } = require('../wikiMaintenanceService');
const { snapshotCanonicalContentHash, snapshotPage } = require('../wikiRevisionService');
const { createBoundedReviewerChat, policy } = require('../reviewerRehearsalBudget');
const fixture = () => ({
  constructor: null, _id: '222222222222222222222222', userId: '111111111111111111111111', title: 'Fictional repeated scores', pageType: 'topic', createdFrom: { type: 'idea', label: 'Fictional repeated scores' }, sourceScope: 'selected_sources',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Retained fictional owner wording.' }] }] }, plainText: 'Retained fictional owner wording.', claims: [], citations: [],
  sourceRefs: ['333333333333333333333333', '444444444444444444444444'].map((objectId, index) => ({ type: 'article', objectId, title: `Fictional source ${index + 1}`, url: `https://example.com/noeis-openai-review/source-${index + 1}`, snippet: 'In this fictional scenario, the same scoring rule returns the same score on repeated trials. Repeating a flawed rule does not verify the rule. Changing the scoring rule tests a different boundary. '.repeat(8) }))
});
const hold = code => Object.assign(new Error('Synthetic bounded guard refusal.'), { code, status: 409 });

test('actual initial maintenance catch rethrows bounded refusals and leaves trusted content intact', async () => {
  for (const code of ['REVIEWER_BUDGET_HELD', 'REVIEWER_PROVIDER_REJECTED', 'REVIEWER_PROVIDER_UNCERTAIN']) {
    const page = fixture(); const before = snapshotCanonicalContentHash(snapshotPage(page)); let calls = 0;
    await assert.rejects(maintainWikiPage({ page, userId: page.userId, models: {}, isConfigured: () => true, failClosedChat: true, chat: async () => { calls++; throw hold(code); } }), { code });
    assert.equal(calls, 1); assert.equal(snapshotCanonicalContentHash(snapshotPage(page)), before);
  }
});

test('actual repair catch rethrows bounded exhaustion after inadequate first draft', async () => {
  const page = fixture(); const before = snapshotCanonicalContentHash(snapshotPage(page)); let calls = 0;
  await assert.rejects(maintainWikiPage({ page, userId: page.userId, models: {}, isConfigured: () => true, failClosedChat: true, chat: async () => {
    calls++;
    if (calls > 1) throw hold('REVIEWER_BUDGET_HELD');
    return { text: JSON.stringify({ article: 'Repeated fictional scores can preserve a flawed scoring rule.', claims: [], citations: [] }), model: 'synthetic-model' };
  } }), { code: 'REVIEWER_BUDGET_HELD' });
  assert.equal(calls, 2); assert.equal(snapshotCanonicalContentHash(snapshotPage(page)), before);
});

test('ordinary maintenance keeps its existing deterministic fallback when strict guard flag is absent', async () => {
  const page = fixture(); let calls = 0;
  const result = await maintainWikiPage({ page, userId: page.userId, models: {}, isConfigured: () => true, chat: async () => { calls++; throw hold('REVIEWER_PROVIDER_UNCERTAIN'); } });
  assert(calls > 0); assert.equal(result.aiState.model, 'local-maintainer'); assert.equal(result.aiState.quality.ok, false);
});

test('actual maintenance propagates raw ledger storage failures as typed gate errors before any POST', async () => {
  for (const failOnRepair of [false, true]) {
    const page = fixture(); const before = snapshotCanonicalContentHash(snapshotPage(page)); let calls = 0; let paid = 0;
    const bounded = createBoundedReviewerChat({ target: { userId: page.userId, pageId: String(page._id), ledgerId: policy.ledgerId }, apiKey: () => 'synthetic-unusable', getLedger: () => { throw Object.assign(new Error('Synthetic raw storage error'), { code: 11600 }); }, fetchFn: async () => { paid++; } });
    await assert.rejects(maintainWikiPage({ page, userId: page.userId, models: {}, isConfigured: () => true, failClosedChat: true, chat: async request => {
      calls++;
      if (failOnRepair && calls === 1) return { text: JSON.stringify({ article: 'Repeated fictional scores can preserve a flawed scoring rule.', claims: [], citations: [] }), model: 'synthetic-model' };
      return bounded(request);
    } }), { code: 'REVIEWER_LEDGER_UNAVAILABLE' });
    assert.equal(calls, failOnRepair ? 2 : 1); assert.equal(paid, 0); assert.equal(snapshotCanonicalContentHash(snapshotPage(page)), before);
  }
});
