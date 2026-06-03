const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildConnectionsRouter } = require('../connectionsRoutes');

class Query {
  constructor(value) {
    this.value = value;
  }

  select() {
    return this;
  }

  sort() {
    return this;
  }

  limit(count = 0) {
    if (Array.isArray(this.value) && count > 0) this.value = this.value.slice(0, count);
    return this;
  }

  lean() {
    return Promise.resolve(JSON.parse(JSON.stringify(this.value)));
  }
}

const emptyFindModel = () => ({
  find: () => new Query([])
});

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const request = async (url, path) => {
  const res = await fetch(`${url}${path}`, {
    headers: { Authorization: 'Bearer test' }
  });
  const text = await res.text();
  return { res, body: text ? JSON.parse(text) : {}, text };
};

const postJson = async (url, path, payload) => {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  return { res, body: text ? JSON.parse(text) : {}, text };
};

const deleteRequest = async (url, path) => {
  const res = await fetch(`${url}${path}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer test' }
  });
  const text = await res.text();
  return { res, body: text ? JSON.parse(text) : {}, text };
};

const normalizeConnectionItemType = (value) => {
  const candidate = String(value || '').trim();
  return ['highlight', 'notebook', 'article', 'concept', 'question', 'wiki_page', 'wiki_claim'].includes(candidate) ? candidate : '';
};

const matchesQuery = (row, query = {}) => Object.entries(query).every(([key, value]) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return true;
  return String(row[key] || '') === String(value || '');
});

const makeConnectionModel = () => {
  const records = [];
  return {
    records,
    find: (query = {}) => new Query(records.filter(row => matchesQuery(row, query))),
    findOne: (query = {}) => new Query(records.find(row => matchesQuery(row, query)) || null),
    findOneAndDelete: async (query = {}) => {
      const index = records.findIndex(row => matchesQuery(row, query));
      if (index === -1) return null;
      const [record] = records.splice(index, 1);
      return {
        ...record,
        toObject: () => ({ ...record })
      };
    },
    create: async (payload = {}) => {
      if (records.some(row => (
        row.userId === payload.userId
        && row.scopeType === (payload.scopeType || '')
        && row.scopeId === (payload.scopeId || '')
        && row.fromType === payload.fromType
        && row.fromId === payload.fromId
        && row.toType === payload.toType
        && row.toId === payload.toId
        && row.relationType === payload.relationType
      ))) {
        const error = new Error('duplicate');
        error.code = 11000;
        throw error;
      }
      const record = {
        _id: `conn-${records.length + 1}`,
        scopeType: '',
        scopeId: '',
        ...payload
      };
      records.push(record);
      return {
        ...record,
        toObject: () => ({ ...record })
      };
    }
  };
};

const run = async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const wikiId = new mongoose.Types.ObjectId().toString();
  const Connection = makeConnectionModel();
  const app = express();
  app.use(express.json());
  app.use(buildConnectionsRouter({
    mongoose,
    authenticateToken: (req, _res, next) => {
      req.user = { id: userId };
      next();
    },
    Connection,
    NotebookEntry: emptyFindModel(),
    Article: {
      find: () => new Query([]),
      aggregate: async () => [{
        _id: 'highlight-1',
        articleId: 'article-1',
        articleTitle: 'Margin of safety memo',
        text: 'Margin of safety protects the downside.',
        note: 'Useful source highlight.'
      }]
    },
    TagMeta: emptyFindModel(),
    Question: emptyFindModel(),
    WikiPage: {
      find: () => new Query([{
        _id: wikiId,
        userId,
        title: 'Durable investing thesis',
        plainText: 'Durable capital allocation patterns.',
        pageType: 'overview',
        updatedAt: '2026-05-01T12:00:00.000Z'
      }])
    },
    normalizeConnectionItemType,
    normalizeRelationType: (value) => {
      const candidate = String(value || '').trim();
      return [
        'related',
        'referenced_by',
        'supports',
        'supported_by',
        'contradicts',
        'contradicted_by'
      ].includes(candidate) ? candidate : '';
    },
    resolveConnectionScopeInput: async () => ({ scopeType: '', scopeId: '', title: '' }),
    resolveConnectionItem: async (_userId, itemType, itemId) => ({ title: `${itemType}:${itemId}` }),
    buildConnectionScopeQuery: () => ({}),
    buildConnectionScopeCandidates: async () => null,
    toObjectIdList: () => [],
    escapeRegExp: (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    buildQueueSnippet: (...values) => values.filter(Boolean).join(' ').slice(0, 120),
    isConnectionItemInScopeCandidates: () => true,
    parseCsvList: (value) => String(value || '').split(',').map(part => part.trim()).filter(Boolean),
    buildGraphNodeMap: async () => new Map(),
    buildGraphNodeKey: (type, id) => `${type}:${id}`,
    addToCandidateSet: (set, value) => {
      if (set && value) set.add(String(value));
    }
  }));

  const server = await listen(app);
  const url = `http://127.0.0.1:${server.address().port}`;

  try {
    const result = await request(url, '/api/connections/search?q=durable&itemTypes=wiki_page');
    assert.strictEqual(result.res.status, 200, result.text);
    assert.strictEqual(result.body.length, 1);
    assert.strictEqual(result.body[0].itemType, 'wiki_page');
    assert.strictEqual(result.body[0].itemId, wikiId);
    assert.strictEqual(result.body[0].title, 'Durable investing thesis');

    const highlightResult = await request(url, '/api/connections/search?q=margin&itemTypes=highlight');
    assert.strictEqual(highlightResult.res.status, 200, highlightResult.text);
    assert.strictEqual(highlightResult.body.length, 1);
    assert.strictEqual(highlightResult.body[0].itemType, 'highlight');
    assert.strictEqual(highlightResult.body[0].itemId, 'highlight-1');
    assert.strictEqual(highlightResult.body[0].articleId, 'article-1');
    assert.strictEqual(highlightResult.body[0].metadata.articleId, 'article-1');

    const excluded = await request(url, `/api/connections/search?q=durable&itemTypes=wiki_page&excludeType=wiki_page&excludeId=${wikiId}`);
    assert.strictEqual(excluded.res.status, 200, excluded.text);
    assert.deepStrictEqual(excluded.body, []);

    const created = await postJson(url, '/api/connections', {
      fromType: 'concept',
      fromId: 'concept-1',
      toType: 'highlight',
      toId: 'highlight-1',
      relationType: 'related'
    });
    assert.strictEqual(created.res.status, 201, created.text);
    assert.strictEqual(created.body.trace.bidirectional, true);
    assert.strictEqual(created.body.trace.reciprocalRelationType, 'referenced_by');
    assert.strictEqual(Connection.records.length, 2);
    assert.ok(Connection.records.some(row => row.fromType === 'concept' && row.toType === 'highlight' && row.relationType === 'related'));
    assert.ok(Connection.records.some(row => row.fromType === 'highlight' && row.toType === 'concept' && row.relationType === 'referenced_by'));

    const repeated = await postJson(url, '/api/connections', {
      fromType: 'concept',
      fromId: 'concept-1',
      toType: 'highlight',
      toId: 'highlight-1',
      relationType: 'related'
    });
    assert.strictEqual(repeated.res.status, 200, repeated.text);
    assert.strictEqual(repeated.body.existing, true);
    assert.strictEqual(repeated.body.trace.bidirectional, true);
    assert.strictEqual(Connection.records.length, 2);

    const deletedForward = await deleteRequest(url, `/api/connections/${created.body._id}`);
    assert.strictEqual(deletedForward.res.status, 200, deletedForward.text);
    assert.strictEqual(deletedForward.body.reciprocalDeleted, true);
    assert.strictEqual(Connection.records.length, 0);

    const recreated = await postJson(url, '/api/connections', {
      fromType: 'concept',
      fromId: 'concept-1',
      toType: 'highlight',
      toId: 'highlight-1',
      relationType: 'related'
    });
    assert.strictEqual(recreated.res.status, 201, recreated.text);
    const reciprocal = Connection.records.find(row => row.fromType === 'highlight' && row.toType === 'concept' && row.relationType === 'referenced_by');
    assert.ok(reciprocal);
    const deletedReciprocal = await deleteRequest(url, `/api/connections/${reciprocal._id}`);
    assert.strictEqual(deletedReciprocal.res.status, 200, deletedReciprocal.text);
    assert.strictEqual(deletedReciprocal.body.reciprocalDeleted, true);
    assert.strictEqual(Connection.records.length, 0);

    const support = await postJson(url, '/api/connections', {
      fromType: 'highlight',
      fromId: 'highlight-2',
      toType: 'wiki_page',
      toId: wikiId,
      relationType: 'supports'
    });
    assert.strictEqual(support.res.status, 201, support.text);
    assert.strictEqual(support.body.trace.reciprocalRelationType, 'supported_by');
    assert.ok(Connection.records.some(row => row.fromType === 'wiki_page' && row.toType === 'highlight' && row.relationType === 'supported_by'));

    const contradiction = await postJson(url, '/api/connections', {
      fromType: 'question',
      fromId: 'question-1',
      toType: 'wiki_page',
      toId: wikiId,
      relationType: 'contradicts'
    });
    assert.strictEqual(contradiction.res.status, 201, contradiction.text);
    assert.strictEqual(contradiction.body.trace.reciprocalRelationType, 'contradicted_by');
    assert.ok(Connection.records.some(row => row.fromType === 'wiki_page' && row.toType === 'question' && row.relationType === 'contradicted_by'));
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('connectionsRoutes search tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
