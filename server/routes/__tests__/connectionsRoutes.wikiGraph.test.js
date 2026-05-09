const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildConnectionsRouter } = require('../connectionsRoutes');

class Query {
  constructor(value) {
    this.value = value;
  }

  sort() {
    return this;
  }

  skip(count = 0) {
    if (Array.isArray(this.value)) this.value = this.value.slice(count);
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

const run = async () => {
  const sourceId = new mongoose.Types.ObjectId().toString();
  const targetId = new mongoose.Types.ObjectId().toString();
  const claimId = `${sourceId}:claim-1`;
  const rows = [{
    _id: new mongoose.Types.ObjectId().toString(),
    userId: 'user-1',
    fromType: 'wiki_page',
    fromId: sourceId,
    toType: 'wiki_page',
    toId: targetId,
    relationType: 'related',
    scopeType: '',
    scopeId: '',
    createdAt: new Date()
  }, {
    _id: new mongoose.Types.ObjectId().toString(),
    userId: 'user-1',
    fromType: 'wiki_page',
    fromId: sourceId,
    toType: 'wiki_claim',
    toId: claimId,
    relationType: 'contains',
    scopeType: '',
    scopeId: '',
    createdAt: new Date()
  }];
  let seenIdsByType = null;

  const app = express();
  app.use(buildConnectionsRouter({
    mongoose,
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    Connection: {
      find: () => new Query(rows)
    },
    normalizeConnectionItemType: (value) => {
      const candidate = String(value || '').trim();
      return ['wiki_page', 'wiki_claim'].includes(candidate) ? candidate : '';
    },
    normalizeRelationType: (value) => String(value || '').trim(),
    resolveConnectionScopeInput: async () => ({ scopeType: '', scopeId: '', title: '' }),
    buildConnectionScopeQuery: () => ({}),
    parseCsvList: (value) => String(value || '').split(',').map(part => part.trim()).filter(Boolean),
    buildGraphNodeKey: (type, id) => `${type}:${id}`,
    addToCandidateSet: (set, value) => {
      if (set && value) set.add(String(value));
    },
    buildGraphNodeMap: async (_userId, idsByType) => {
      seenIdsByType = idsByType;
      return new Map([
        [`wiki_page:${sourceId}`, {
          id: `wiki_page:${sourceId}`,
          itemType: 'wiki_page',
          itemId: sourceId,
          title: 'Source wiki',
          openPath: `/wiki/${sourceId}`
        }],
        [`wiki_page:${targetId}`, {
          id: `wiki_page:${targetId}`,
          itemType: 'wiki_page',
          itemId: targetId,
          title: 'Target wiki',
          openPath: `/wiki/${targetId}`
        }],
        [`wiki_claim:${claimId}`, {
          id: `wiki_claim:${claimId}`,
          itemType: 'wiki_claim',
          itemId: claimId,
          title: 'Claim',
          openPath: `/wiki/${sourceId}`
        }]
      ]);
    }
  }));

  const server = await listen(app);
  const url = `http://127.0.0.1:${server.address().port}`;

  try {
    const result = await request(url, '/api/map/graph?itemTypes=wiki_page,wiki_claim');
    assert.strictEqual(result.res.status, 200, result.text);
    assert.ok(seenIdsByType.wiki_page.has(sourceId));
    assert.ok(seenIdsByType.wiki_page.has(targetId));
    assert.ok(seenIdsByType.wiki_claim.has(claimId));
    assert.strictEqual(result.body.nodes.length, 3);
    assert.strictEqual(result.body.edges.length, 2);
    assert.ok(result.body.edges.some(edge => edge.source === `wiki_page:${sourceId}` && edge.target === `wiki_page:${targetId}`));
    assert.ok(result.body.edges.some(edge => edge.source === `wiki_page:${sourceId}` && edge.target === `wiki_claim:${claimId}`));
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('connectionsRoutes wiki graph tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
