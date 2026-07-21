const assert = require('node:assert/strict');
const express = require('express');
const { buildWikiRouter } = require('../wikiRoutes');

const ledger = {
  _id: '507f1f77bcf86cd799439099',
  userId: '507f1f77bcf86cd799439010',
  slug: 'research-ledger-private',
  title: 'Living Thesis 001 — Research Ledger — 2026-07',
  pageType: 'log',
  status: 'published',
  visibility: 'shared',
  createdFrom: { label: 'research-ledger:2026-07:507f1f77bcf86cd799439011' },
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'PRIVATE-PRIOR-DECISION-FRICTION' }] }]
  },
  plainText: 'PRIVATE-PRIOR-DECISION-FRICTION',
  sourceRefs: [],
  claims: [],
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z'
};

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  lean() { return Promise.resolve(this.value ? JSON.parse(JSON.stringify(this.value)) : null); }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const run = async () => {
  let saves = 0;
  const WikiPage = {
    findOne(query) {
      const matchesOwner = query.userId === undefined || String(query.userId) === ledger.userId;
      const matchesIdentity = query._id === undefined || String(query._id) === ledger._id;
      const matchesSlug = query.slug === undefined || query.slug === ledger.slug;
      return new Query(matchesOwner && matchesIdentity && matchesSlug ? { ...ledger, save: async () => { saves += 1; } } : null);
    }
  };
  const app = express();
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: ledger.userId };
      if (req.headers['x-agent-token']) req.agentToken = { id: 'agent-token-1' };
      next();
    },
    WikiPage
  }));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const agentPatch = await fetch(`${base}/api/wiki/pages/${ledger._id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-agent-token': 'yes' },
      body: JSON.stringify({ visibility: 'shared', body: { type: 'doc', content: [] } })
    });
    assert.equal(agentPatch.status, 403);

    const humanShare = await fetch(`${base}/api/wiki/pages/${ledger._id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility: 'shared' })
    });
    assert.equal(humanShare.status, 409);

    const publicRead = await fetch(`${base}/api/public/wiki/pages/${ledger.slug}`);
    const publicPayload = await publicRead.json();
    assert.equal(publicRead.status, 404);
    assert.ok(!JSON.stringify(publicPayload).includes('PRIVATE-PRIOR-DECISION-FRICTION'));
    assert.equal(saves, 0);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  console.log('wikiRoutes research ledger privacy tests passed');
};

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
