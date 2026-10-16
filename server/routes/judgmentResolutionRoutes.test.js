const assert = require('assert');
const express = require('express');
const { buildJudgmentResolutionRouter } = require('./judgmentResolutionRoutes');

const PAGE_ID = '64f500000000000000000010';
const calls = [];
const events = [];
const quotes = [];
const app = express();
app.use(express.json());
app.use(buildJudgmentResolutionRouter({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'user-1' };
    if (req.headers.authorization === 'Bearer agent') req.agentToken = { id: 'agent' };
    next();
  },
  setResolutionCriteria: async input => {
    calls.push(['criteria', input]);
    return { page: { _id: PAGE_ID, judgment: { resolutionCriteria: input.criteria } }, artifact: {}, receipt: {}, idempotent: false };
  },
  recordVerdict: async input => {
    calls.push(['verdict', input]);
    return { page: { _id: PAGE_ID, judgment: { verdicts: [{ result: input.result }] } }, artifact: {}, receipt: {}, idempotent: false };
  },
  fileJudgmentEvidence: async input => {
    calls.push(['evidence', input]);
    return { page: { _id: PAGE_ID, judgment: { against: [{ acceptedFrom: input.highlightId }] } }, artifact: {}, receipt: {}, idempotent: false };
  },
  highlightForQuote: async input => { quotes.push(input); return { highlight: { _id: '64f500000000000000000050' } }; },
  buildJudgmentMirror: async input => { calls.push(['mirror', input]); return { metrics: { claimsHeld: 1 } }; },
  comesDue: async ({ userId }) => ({ pageId: PAGE_ID, view: `${userId} said so.`, by: '2026-10-12T12:00:00.000Z' }),
  viewBearingOn: async ({ text }) => (text.includes('meetings') ? { pageId: PAGE_ID, view: 'user-1 said so.' } : null),
  findEarlierPassages: async ({ claim }) => ({
    candidates: !claim.includes('meetings') ? [] : [
      { kind: 'source', articleId: '64f500000000000000000031', text: 'A whole article.' },
      { kind: 'highlight', articleId: '64f500000000000000000030', highlightId: 'h-same', text: 'This very source.' },
      { kind: 'highlight', articleId: '64f500000000000000000032', highlightId: 'h-1', sourceLabel: 'On writing', text: 'Memos outlast meetings.', savedAt: '2026-03-03' }
    ]
  }),
  trackEvent: event => events.push(event)
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = 'GET', body, token = 'human' } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { response, body: await response.json() };
  };
  try {
    assert.strictEqual((await request(`/api/judgment/pages/${PAGE_ID}/resolution`, { method: 'POST', body: {}, token: 'agent' })).response.status, 403);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual((await request('/api/judgment/pages/bad/resolution', { method: 'POST', body: {} })).response.status, 400);
    assert.strictEqual((await request(`/api/judgment/pages/${PAGE_ID}/resolution`, { method: 'POST', body: { criteria: 'x' } })).response.status, 201);
    assert.strictEqual((await request(`/api/judgment/pages/${PAGE_ID}/verdicts`, { method: 'POST', body: { result: 'held_up' } })).response.status, 201);
    assert.strictEqual((await request(`/api/judgment/pages/${PAGE_ID}/evidence`, { method: 'POST', body: {}, token: 'agent' })).response.status, 403);
    assert.strictEqual((await request(`/api/judgment/pages/${PAGE_ID}/evidence`, {
      method: 'POST',
      body: { field: 'against', articleId: '64f500000000000000000030', highlightId: '64f500000000000000000040' }
    })).response.status, 201);
    assert.deepStrictEqual((await request('/api/judgment/due')).body.due.pageId, PAGE_ID);
    const mirror = await request('/api/judgment/mirror');
    assert.strictEqual(mirror.response.status, 200);
    assert.strictEqual(mirror.body.mirror.metrics.claimsHeld, 1);
    // Settling a view and filing a passage are measured by ids and kinds, never by their words.
    assert.deepStrictEqual(events.map(({ event, userId, properties }) => ({ event, userId, properties })), [
      { event: 'view_resolved', userId: 'user-1', properties: { pageId: PAGE_ID, result: 'held_up' } },
      { event: 'evidence_filed', userId: 'user-1', properties: { pageId: PAGE_ID, field: 'against' } }
    ]);
    assert.deepStrictEqual(calls.map(call => call[0]), ['criteria', 'verdict', 'evidence', 'mirror']);

    // A passage nobody highlighted is filed by its words, as a highlight.
    assert.strictEqual((await request(`/api/judgment/pages/${PAGE_ID}/evidence`, {
      method: 'POST',
      body: { field: 'why', articleId: '64f500000000000000000030', quote: 'Written decisions outlast meetings.' }
    })).response.status, 201);
    assert.deepStrictEqual(quotes.map(({ userId, articleId, quote }) => ({ userId, articleId, quote })), [
      { userId: 'user-1', articleId: '64f500000000000000000030', quote: 'Written decisions outlast meetings.' }
    ]);
    assert.strictEqual(calls[calls.length - 1][1].highlightId, '64f500000000000000000050');

    // The margin: the view a marked passage bears on, due when it is the one
    // due, and a passage marked in another source, never this one.
    const margin = await request('/api/judgment/margin', {
      method: 'POST',
      body: { text: 'Decisions written down outlast meetings.', articleId: '64f500000000000000000030' }
    });
    assert.deepStrictEqual(margin.body, {
      view: { pageId: PAGE_ID, view: 'user-1 said so.', dueBy: '2026-10-12T12:00:00.000Z' },
      before: {
        articleId: '64f500000000000000000032',
        highlightId: 'h-1',
        title: 'On writing',
        text: 'Memos outlast meetings.',
        savedAt: '2026-03-03'
      }
    });
    const quiet = await request('/api/judgment/margin', { method: 'POST', body: { text: 'Nothing here.', articleId: '64f500000000000000000032' } });
    assert.deepStrictEqual(quiet.body, { view: null, before: null });
    assert.strictEqual((await request('/api/judgment/margin', { method: 'POST', body: {} })).response.status, 400);
    console.log('judgmentResolutionRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
