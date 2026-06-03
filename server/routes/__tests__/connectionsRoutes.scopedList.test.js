const assert = require('assert');
const express = require('express');
const { buildConnectionsRouter } = require('../connectionsRoutes');
const { buildConnectionScopeQuery } = require('../../utils/connectionScopeQuery');

class Query {
  constructor(value) {
    this.value = value;
  }

  select() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return Promise.resolve(JSON.parse(JSON.stringify(this.value))); }
}

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const request = async (url, path) => {
  const res = await fetch(`${url}${path}`, { headers: { Authorization: 'Bearer test' } });
  const text = await res.text();
  return { res, body: text ? JSON.parse(text) : {}, text };
};

const matchesQuery = (row, query = {}) => Object.entries(query).every(([key, value]) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return true;
  return String(row[key] || '') === String(value || '');
});

const run = async () => {
  const userId = 'user-scoped';
  const records = [
    {
      _id: 'global-edge',
      userId,
      scopeType: '',
      scopeId: '',
      fromType: 'concept',
      fromId: 'concept-a',
      toType: 'highlight',
      toId: 'highlight-a',
      relationType: 'related'
    },
    {
      _id: 'scoped-edge',
      userId,
      scopeType: 'concept',
      scopeId: 'concept-a',
      fromType: 'concept',
      fromId: 'concept-a',
      toType: 'highlight',
      toId: 'highlight-b',
      relationType: 'related'
    }
  ];

  const Connection = {
    find: (query = {}) => new Query(records.filter(row => matchesQuery(row, query)))
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId };
    next();
  });
  app.use(buildConnectionsRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: userId };
      next();
    },
    Connection,
    NotebookEntry: { find: () => new Query([]) },
    Article: { find: () => new Query([]), aggregate: async () => [] },
    TagMeta: { find: () => new Query([]) },
    Question: { find: () => new Query([]) },
    WikiPage: { find: () => new Query([]) },
    normalizeConnectionItemType: (value) => value,
    normalizeRelationType: (value) => value || 'related',
    resolveConnectionScopeInput: async () => ({ scopeType: '', scopeId: '', title: '' }),
    resolveConnectionItem: async (_userId, itemType, itemId) => ({ title: `${itemType}:${itemId}` }),
    buildConnectionScopeQuery,
    buildConnectionScopeCandidates: async () => null,
    toObjectIdList: () => [],
    escapeRegExp: (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    buildQueueSnippet: (...values) => values.join(' '),
    isConnectionItemInScopeCandidates: () => true,
    parseCsvList: (value) => String(value || '').split(',').map(part => part.trim()).filter(Boolean),
    buildGraphNodeMap: async () => new Map(),
    buildGraphNodeKey: (type, id) => `${type}:${id}`,
    addToCandidateSet: (set, value) => { if (set && value) set.add(String(value)); }
  }));

  const server = await listen(app);
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await request(url, '/api/connections?itemType=concept&itemId=concept-a');
    assert.strictEqual(result.res.status, 200, result.text);
    const outgoingIds = (result.body.outgoing || []).map(row => row.toId).sort();
    assert.deepStrictEqual(
      outgoingIds,
      ['highlight-a', 'highlight-b'],
      'unscoped list should include global and scoped outgoing edges'
    );
  } finally {
    await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  }
};

run()
  .then(() => console.log('connectionsRoutes.scopedList.test.js: ok'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
