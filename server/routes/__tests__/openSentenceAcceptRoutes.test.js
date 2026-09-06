const assert = require('assert');
const express = require('express');
const { buildOpenSentenceAcceptRouter } = require('../openSentenceAcceptRoutes');

class Query {
  constructor(value) { this.value = value; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const PAGE_ID = '6a7b5c0743142565055490f3';
const revisions = [];
const page = {
  _id: PAGE_ID,
  userId: 'owner-1',
  title: 'Parenting',
  slug: 'parenting',
  pageType: 'topic',
  body: {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Children need room to make mistakes.',
        marks: [{
          type: 'claim',
          attrs: { claimId: 'claim-1', support: 'supported', citationIndexes: [1], contradictionIndexes: [] }
        }]
      }]
    }]
  },
  claims: [{
    claimId: 'claim-1',
    text: 'Children need room to make mistakes.',
    support: 'supported',
    history: []
  }],
  markModified() {},
  async save() { return this; },
  toObject() { return JSON.parse(JSON.stringify(this)); }
};

const WikiPage = {
  findOne: (query) => new Query(
    String(query._id) === PAGE_ID && String(query.userId) === 'owner-1' ? page : null
  )
};

const WikiRevision = function WikiRevision(fields) {
  Object.assign(this, fields);
  this.save = async () => {
    revisions.push(this);
    return this;
  };
};

const serializePage = (value) => ({
  _id: String(value._id),
  title: value.title,
  claims: value.claims,
  body: value.body
});

const serve = async () => {
  const app = express();
  app.use(express.json());
  app.use(buildOpenSentenceAcceptRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'owner-1' };
      if (req.headers['x-agent-token-id']) req.agentToken = { id: 'agent-1' };
      next();
    },
    WikiRevision,
    findOwnedPage: (req) => WikiPage.findOne({ _id: req.params.id, userId: req.user.id }),
    serializePage,
    onPageChanged: async () => {}
  }));
  const server = await new Promise((resolve) => {
    const next = app.listen(0, '127.0.0.1', () => resolve(next));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
};

const run = async () => {
  const { server, base } = await serve();
  try {
    const agentDenied = await fetch(`${base}/api/wiki/pages/${PAGE_ID}/open-sentence/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-token-id': 'agent-1' },
      body: JSON.stringify({
        claimId: 'claim-1',
        against: 'Children need room to make mistakes.',
        text: 'Children need room to make recoverable mistakes.'
      })
    });
    assert.equal(agentDenied.status, 403);

    const stale = await fetch(`${base}/api/wiki/pages/${PAGE_ID}/open-sentence/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        claimId: 'claim-1',
        against: 'A different line.',
        text: 'Children need room to make recoverable mistakes.'
      })
    });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'stale_claim');

    const accepted = await fetch(`${base}/api/wiki/pages/${PAGE_ID}/open-sentence/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        claimId: 'claim-1',
        against: 'Children need room to make mistakes.',
        text: 'Children need room to make recoverable mistakes.'
      })
    });
    assert.equal(accepted.status, 200);
    const body = await accepted.json();
    assert.equal(body.claims[0].text, 'Children need room to make recoverable mistakes.');
    assert.equal(body.body.content[0].content[0].text, 'Children need room to make recoverable mistakes.');
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].reason, 'user_edit');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

run()
  .then(() => console.log('openSentenceAcceptRoutes tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
