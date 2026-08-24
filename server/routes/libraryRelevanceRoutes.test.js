const assert = require('assert');
const express = require('express');
const {
  buildLibraryRelevanceRouter,
  isObjectId,
  parseLimit
} = require('./libraryRelevanceRoutes');

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}
const modelFor = value => ({
  find: () => new Query(value),
  countDocuments: async () => value.length
});

const USER_ID = '64f100000000000000000001';
const app = express();
app.use(buildLibraryRelevanceRouter({
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer qa') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: USER_ID };
    return next();
  },
  getFoldersWithCounts: async () => [{
    _id: '64f100000000000000000041',
    name: 'AI & Computing',
    articleCount: 1
  }],
  Article: modelFor([{
    _id: '64f100000000000000000021',
    userId: USER_ID,
    title: 'A durable source',
    url: 'https://example.com/source',
    createdAt: '2026-07-27T12:00:00.000Z'
  }]),
  NotebookEntry: modelFor([{
    _id: '64f100000000000000000031',
    userId: USER_ID,
    title: 'A durable notebook source',
    content: 'Notebook material.',
    createdAt: '2026-07-28T12:00:00.000Z'
  }]),
  TagMeta: modelFor([]),
  WikiPage: modelFor([]),
  WikiRevision: modelFor([]),
  WikiSourceEvent: modelFor([]),
  NoeisReceipt: modelFor([]),
  Connection: modelFor([]),
  ReferenceEdge: modelFor([])
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const request = async path => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { Authorization: 'Bearer qa' }
    });
    return { response, body: await response.json() };
  };

  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/library/relevance`);
    assert.strictEqual(unauthorized.status, 401);

    const recent = await request('/api/library/relevance?view=recent&limit=20');
    assert.strictEqual(recent.response.status, 200);
    assert.strictEqual(recent.body.view, 'recent');
    assert.strictEqual(recent.body.sourceScope, 'articles');
    assert.strictEqual(recent.body.sources.length, 1);
    assert.deepStrictEqual(recent.body.counts.recent, { value: 1, exact: true });
    assert.strictEqual(recent.body.coverage.status, 'complete');
    assert.deepStrictEqual(recent.body.coverage.sourceTypes, ['article']);
    assert.deepStrictEqual(
      Object.keys(recent.body.sources[0]).sort(),
      ['createdAt', 'provenance', 'relevance', 'source']
    );
    assert.ok(recent.body.generatedAt);

    const mixed = await request('/api/library/relevance?view=recent&sourceScope=mixed&limit=1');
    assert.strictEqual(mixed.response.status, 200);
    assert.strictEqual(mixed.body.sourceScope, 'mixed');
    assert.strictEqual(mixed.body.sources[0].source.type, 'note');
    assert.ok(mixed.body.nextCursor);
    assert.strictEqual(mixed.body.hasMore, true);
    assert.deepStrictEqual(Object.keys(mixed.body.counts), [
      'recent',
      'active',
      'needs_review',
      'unconnected'
    ]);
    const mixedNext = await request(
      `/api/library/relevance?view=recent&sourceScope=mixed&limit=1&cursor=${encodeURIComponent(mixed.body.nextCursor)}`
    );
    assert.strictEqual(mixedNext.response.status, 200);
    assert.strictEqual(mixedNext.body.sources[0].source.type, 'article');
    assert.strictEqual(mixedNext.body.nextCursor, null);
    assert.strictEqual(mixedNext.body.hasMore, false);

    const room = await request('/api/library/room?view=recent&limit=20');
    assert.strictEqual(room.response.status, 200);
    assert.strictEqual(room.body.room, 'library');
    assert.strictEqual(room.body.sourceScope, 'mixed');
    assert.strictEqual(room.body.sources.length, 2);
    assert.strictEqual(room.body.shelves.folders[0].name, 'AI & Computing');
    assert.deepStrictEqual(room.body.shelves.counts, {
      articles: 1,
      rawArticles: 1,
      unfiledArticles: 1,
      keptArticles: 1,
      suppressedArticles: 0
    });

    const invalidCursor = await request(
      '/api/library/relevance?view=recent&sourceScope=mixed&cursor=not-a-cursor'
    );
    assert.strictEqual(invalidCursor.response.status, 400);
    assert.match(invalidCursor.body.error, /cursor is invalid/i);

    const cursorWithoutMixed = await request(
      `/api/library/relevance?view=recent&cursor=${encodeURIComponent(mixed.body.nextCursor)}`
    );
    assert.strictEqual(cursorWithoutMixed.response.status, 400);

    const detail = await request('/api/library/relevance/64f100000000000000000021');
    assert.strictEqual(detail.response.status, 200);
    assert.strictEqual(detail.body.source.source.id, '64f100000000000000000021');
    assert.deepStrictEqual(
      Object.keys(detail.body.source.provenance).sort(),
      ['author', 'importedAt', 'provider', 'publicationDate', 'siteName', 'sourceLabel', 'sourceType']
    );

    const invalidDetail = await request('/api/library/relevance/not-an-id');
    assert.strictEqual(invalidDetail.response.status, 400);
    assert.strictEqual(isObjectId('64f100000000000000000021'), true);
    assert.strictEqual(isObjectId('not-an-id'), false);

    const invalidView = await request('/api/library/relevance?view=popular');
    assert.strictEqual(invalidView.response.status, 400);
    assert.match(invalidView.body.error, /recent, active, needs_review, unconnected/);

    const invalidLimit = await request('/api/library/relevance?limit=zero');
    assert.strictEqual(invalidLimit.response.status, 400);
    assert.strictEqual(parseLimit('500'), 100);

    console.log('libraryRelevanceRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
