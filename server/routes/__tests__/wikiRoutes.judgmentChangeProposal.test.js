const assert = require('assert');
const express = require('express');
const { buildWikiRouter } = require('../wikiRoutes');

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  sort() { return this; }
  session() { return this; }
  lean() { return Promise.resolve(this.value ? JSON.parse(JSON.stringify(this.value)) : null); }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const PAGE_ID = '6a5d1c842da7aa36147472ff';
const receipts = [];
const page = {
  _id: PAGE_ID,
  userId: 'owner-1',
  title: 'Compute scarcity',
  slug: 'compute-scarcity',
  pageType: 'topic',
  sourceRefs: [],
  claims: [],
  citations: [],
  judgment: {
    currentJudgment: 'AI compute remains scarce.',
    why: [],
    against: [],
    falsifiers: [],
    decisions: [],
    lessons: [],
    dependsOn: []
  },
  markModified() {},
  async save() { return this; },
  toObject() { return { ...this }; }
};

const matches = (row, query) => Object.entries(query).every(([key, expected]) => {
  if (key === 'provenance.pageId') return String(row.provenance?.pageId) === String(expected);
  return String(row[key]) === String(expected);
});

const NoeisReceipt = {
  findOne: query => new Query(receipts.find(row => matches(row, query)) || null),
  findOneAndUpdate: async (query, update) => {
    const index = receipts.findIndex(row => matches(row, query));
    const next = { ...(index >= 0 ? receipts[index] : {}), ...update.$set };
    if (index >= 0) receipts[index] = next;
    else receipts.push(next);
    return next;
  }
};

const WikiPage = {
  findOne: query => new Query(
    String(query._id) === PAGE_ID && String(query.userId) === 'owner-1' ? page : null
  )
};

const serve = async () => {
  const app = express();
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'owner-1' };
      if (req.headers['x-agent-token-id']) req.agentToken = { id: 'agent-1' };
      next();
    },
    WikiPage,
    NoeisReceipt
  }));
  const server = await new Promise(resolve => {
    const next = app.listen(0, '127.0.0.1', () => resolve(next));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
};

const run = async () => {
  const { server, base } = await serve();
  try {
    const agentAttempt = await fetch(`${base}/api/wiki/pages/${PAGE_ID}/judgment-change-proposals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-token-id': 'agent-1' },
      body: JSON.stringify({ proposedJudgment: 'AI compute is becoming abundant.' })
    });
    assert.strictEqual(agentAttempt.status, 403);
    assert.strictEqual(receipts.length, 0);

    const proposed = await fetch(`${base}/api/wiki/pages/${PAGE_ID}/judgment-change-proposals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposedJudgment: 'AI compute is becoming abundant.' })
    });
    assert.strictEqual(proposed.status, 201);
    const proposal = (await proposed.json()).proposal;
    assert.strictEqual(proposal.status, 'pending');
    assert.strictEqual(page.judgment.currentJudgment, 'AI compute remains scarce.');

    const accepted = await fetch(`${base}/api/wiki/pages/${PAGE_ID}/judgment-change-proposals/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiptId: proposal.id })
    });
    assert.strictEqual(accepted.status, 200);
    const result = await accepted.json();
    assert.strictEqual(result.proposal.status, 'accepted');
    assert.strictEqual(result.page.judgment.currentJudgment, 'AI compute is becoming abundant.');
    assert.match(result.page.judgment.decisions[0].summary, /^Changed what I hold:/);

    const replay = await fetch(`${base}/api/wiki/pages/${PAGE_ID}/judgment-change-proposals/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiptId: proposal.id })
    });
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(page.judgment.decisions.length, 1, 'idempotent replay must not append another decision');

    const conflict = await fetch(`${base}/api/wiki/pages/${PAGE_ID}/judgment-change-proposals/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiptId: proposal.id })
    });
    assert.strictEqual(conflict.status, 409);
    console.log('ok - receipt-bound judgment change proposal');
  } finally {
    server.close();
  }
};

run().catch(error => { console.error(error); process.exit(1); });
