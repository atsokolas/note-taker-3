const assert = require('assert');
const express = require('express');
const http = require('http');
const { buildNotebookRouter } = require('../notebookRoutes');

const USER = '64f200000000000000000001';
const OTHER = '64f200000000000000000002';
const NOTE = '64f2000000000000000000aa';

const listen = app => new Promise(resolve => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

const run = async () => {
  const row = {
    _id: NOTE,
    userId: USER,
    title: 'Canonical title',
    content: '<p>Canonical words</p>',
    blocks: [{ id: 'p1', type: 'paragraph', text: 'Canonical words' }],
    workingState: { revision: 0, materials: [], trials: [], looseThoughts: [], nextTimeLine: {} }
  };
  const model = {
    findOneAndUpdate: async (query, update) => {
      if (String(query._id) !== NOTE || String(query.userId) !== USER) return null;
      const expected = query['workingState.revision'];
      const initialMatch = query.$or && Number(row.workingState?.revision || 0) === 0;
      if (!initialMatch && Number(expected) !== Number(row.workingState?.revision || 0)) return null;
      row.workingState = update.$set.workingState;
      return row;
    },
    findOne: async query => String(query._id) === NOTE && String(query.userId) === USER ? row : null
  };
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(buildNotebookRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: req.headers['x-user'] || USER };
      if (req.headers['x-agent']) req.agentToken = true;
      next();
    },
    NotebookEntry: model,
    NotebookFolder: {}, ReferenceEdge: {}, ensureNotebookBlocks: () => {}, createBlockId: () => 'block',
    stripHtml: value => String(value || ''), normalizeItemType: value => value, parseClaimId: () => null,
    normalizeTags: value => value || [], syncNotebookReferences: async () => {}, enqueueNotebookEmbedding: () => {},
    trackEvent: () => {}, EVENT_NAMES: {}, findHighlightById: async () => null
  }));
  const { server, url } = await listen(app);
  const put = (body, headers = {}) => fetch(`${url}/api/notebook/${NOTE}/workbench`, {
    method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
  });
  try {
    const first = await put({
      expectedRevision: 0,
      workingState: {
        materials: [{ id: 'm1', kind: 'highlight', title: 'Source', text: 'Exact passage', sourceId: 'h1', target: { blockId: 'p1', baseText: 'Canonical words' } }],
        trials: [{ id: 't1', target: { blockId: 'p1', baseText: 'Canonical words' }, alternative: 'Possible words' }],
        looseThoughts: [{ id: 'l1', text: 'A private digression', target: { blockId: 'p1' } }],
        nextTimeLine: { text: 'Begin with the exception.', target: { blockId: 'p1', offset: 4 } }
      }
    });
    assert.strictEqual(first.status, 200);
    const saved = await first.json();
    assert.strictEqual(saved.workingState.revision, 1);
    assert.strictEqual(saved.workingState.materials[0].text, 'Exact passage');
    assert.strictEqual(row.title, 'Canonical title');
    assert.strictEqual(row.blocks[0].text, 'Canonical words');

    const stale = await put({ expectedRevision: 0, workingState: { looseThoughts: [] } });
    assert.strictEqual(stale.status, 409);
    const conflict = await stale.json();
    assert.strictEqual(conflict.code, 'workbench_conflict');
    assert.strictEqual(conflict.workingState.revision, 1);
    assert.strictEqual(conflict.workingState.looseThoughts[0].text, 'A private digression');

    const agent = await put({ expectedRevision: 1, workingState: {} }, { 'x-agent': '1' });
    assert.strictEqual(agent.status, 403);
    const other = await put({ expectedRevision: 1, workingState: {} }, { 'x-user': OTHER });
    assert.strictEqual(other.status, 404);
  } finally {
    server.close();
  }
};

run().then(() => console.log('notebook workbench routes ok')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
