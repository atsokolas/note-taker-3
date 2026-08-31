const assert = require('assert');
const express = require('express');
const http = require('http');
const { buildNotebookRouter } = require('../notebookRoutes');

const listen = app => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({
    server,
    url: `http://127.0.0.1:${server.address().port}`
  }));
});

const run = async () => {
  const entry = {
    _id: 'note-1',
    userId: 'user-1',
    title: 'A thought in motion',
    blocks: [],
    linkedHighlightIds: [],
    linkedArticleId: null,
    importMeta: {},
    async save() { return this; }
  };
  const NotebookEntry = {
    findOne: async query => (
      query?._id === entry._id && query?.userId === entry.userId ? entry : null
    )
  };
  let syncedBlocks = [];
  const app = express();
  app.use(express.json());
  app.use(buildNotebookRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    NotebookEntry,
    NotebookFolder: {},
    ReferenceEdge: {},
    ensureNotebookBlocks: () => {},
    createBlockId: () => 'block-highlight-1',
    stripHtml: value => String(value || ''),
    normalizeItemType: (value, fallback) => String(value || fallback || '').trim(),
    parseClaimId: () => null,
    normalizeTags: () => [],
    syncNotebookReferences: async (_userId, _entryId, blocks) => { syncedBlocks = blocks; },
    enqueueNotebookEmbedding: () => {},
    trackEvent: () => {},
    EVENT_NAMES: {},
    findHighlightById: async () => ({
      _id: 'highlight-1',
      text: 'The passage that changed the thought.',
      articleId: 'article-1',
      articleTitle: 'The source that started it'
    })
  }));

  const { server, url } = await listen(app);
  try {
    const response = await fetch(`${url}/api/notebook/note-1/append-highlight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({ highlightId: 'highlight-1' })
    });
    const payload = await response.json();

    assert.strictEqual(response.status, 200, JSON.stringify(payload));
    assert.strictEqual(payload.linkedArticleId, 'article-1');
    assert.deepStrictEqual(payload.linkedHighlightIds, ['highlight-1']);
    assert.deepStrictEqual(syncedBlocks, [{
      id: 'block-highlight-1',
      type: 'highlight_embed',
      text: 'The passage that changed the thought.',
      highlightId: 'highlight-1',
      articleId: 'article-1',
      articleTitle: 'The source that started it'
    }]);
  } finally {
    server.close();
  }
};

run().then(() => {
  console.log('notebook source continuity tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
