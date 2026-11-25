const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const registerChangeRoutes = require('./changeRoutes');

// A Mongo query as the routes use it: chainable, then lean() resolves.
const query = (rows, seen = {}) => {
  const chain = {
    select: (fields) => { seen.select = fields; return chain; },
    sort: (order) => { seen.sort = order; return chain; },
    limit: (n) => { seen.limit = n; return chain; },
    maxTimeMS: () => chain,
    lean: async () => rows
  };
  return chain;
};

const page = {
  _id: 'page-1',
  userId: 'reader-1',
  slug: 'Costco / Q3: the "moat"?',
  title: 'Costco',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Members renew at 90%.' }] }] },
  sourceRefs: [],
  updatedAt: new Date('2026-11-20T00:00:00Z'),
  judgment: { currentJudgment: '' }
};

const start = async ({ pages = [page], revisions = [], owned = page, Article = null } = {}) => {
  const seen = { pageFilters: [], revisionFilters: [] };
  const WikiPage = {
    countDocuments: async (filter) => { seen.countFilter = filter; return pages.length; },
    find: (filter) => { seen.pageFilters.push(filter); return query(pages, seen); }
  };
  const WikiRevision = {
    find: (filter) => { seen.revisionFilters.push(filter); return query(revisions.filter(r => r.pageId === filter.pageId)); }
  };
  const router = express.Router();
  registerChangeRoutes(router, {
    Article,
    VectorItem: null,
    WikiPage,
    WikiRevision,
    changeSourcesFor: async () => new Map(),
    findOwnedPage: () => query(owned),
    wikiAuth: (req, _res, next) => { req.user = { id: 'reader-1' }; next(); }
  });
  const app = express().use(router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const get = path => fetch(`http://127.0.0.1:${server.address().port}${path}`);
  return { seen, get, close: () => new Promise(resolve => server.close(resolve)) };
};

const revision = (overrides = {}) => ({
  _id: `rev-${Math.random()}`,
  pageId: 'page-1',
  reason: 'maintenance',
  actorType: 'ai',
  promotionStatus: 'promoted',
  createdAt: new Date('2026-11-21T00:00:00Z'),
  before: { body: { type: 'doc', content: [] }, sourceRefs: [] },
  ...overrides
});

test('changes list only what was really promoted, and say whose hand it was', async () => {
  const app = await start({ revisions: [revision({ actorType: 'user' })] });
  try {
    const body = await (await app.get('/api/wiki/changes?since=2026-11-19')).json();
    assert.equal(body.pageCount, 1);
    assert.equal(body.changes.length, 1);
    assert.equal(body.changes[0].pageId, 'page-1');
    assert.equal(body.changes[0].by, 'you');
    assert.deepEqual(app.seen.countFilter, { userId: 'reader-1', status: { $ne: 'archived' } }, 'archived pages are not counted');
    assert.deepEqual(app.seen.pageFilters[0].updatedAt, { $gt: new Date('2026-11-19') });
  } finally { await app.close(); }
});

test('an unchanged snapshot or an unpromoted draft is not a change', async () => {
  const app = await start({ revisions: [revision({ snapshotUnchanged: true }), revision({ promotionStatus: 'candidate' })] });
  try {
    const body = await (await app.get('/api/wiki/changes')).json();
    assert.deepEqual(body.changes, []);
  } finally { await app.close(); }
});

test('a since that is not a date reads as the beginning', async () => {
  const app = await start({ pages: [] });
  try {
    const body = await (await app.get('/api/wiki/changes?since=yesterday-ish')).json();
    assert.equal(new Date(body.since).getTime(), 0);
    assert.deepEqual(body.changes, []);
  } finally { await app.close(); }
});

test('a page downloads as Markdown under a safe filename', async () => {
  const app = await start();
  try {
    const response = await app.get('/api/wiki/pages/page-1/markdown');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/markdown/);
    const disposition = response.headers.get('content-disposition');
    assert.match(disposition, /^attachment; filename="[^"/\\]+\.md"$/);
    assert.match(await response.text(), /Members renew at 90%\./);
  } finally { await app.close(); }
});

test('a page the reader does not own is not found, as Markdown or as evidence', async () => {
  const app = await start({ owned: null });
  try {
    assert.equal((await app.get('/api/wiki/pages/page-2/markdown')).status, 404);
    assert.equal((await app.get('/api/wiki/pages/page-2/library-evidence')).status, 404);
  } finally { await app.close(); }
});

test('library evidence needs a held claim to look for', async () => {
  const app = await start();
  try {
    const response = await app.get('/api/wiki/pages/page-1/library-evidence');
    assert.equal(response.status, 409);
  } finally { await app.close(); }
  const held = await start({ owned: { ...page, judgment: { currentJudgment: 'Costco keeps its members.' } } });
  try {
    const body = await (await held.get('/api/wiki/pages/page-1/library-evidence')).json();
    assert.deepEqual(body, { claim: 'Costco keeps its members.', terms: [], candidates: [] }, 'no Library, no candidates');
  } finally { await held.close(); }
});

test('contradictions read at most 300 pages and return at most 200', async () => {
  const app = await start({ pages: [] });
  try {
    const body = await (await app.get('/api/wiki/contradictions?limit=5000')).json();
    assert.deepEqual(body, { contradictions: [] });
    assert.equal(app.seen.limit, 300);
  } finally { await app.close(); }
});
