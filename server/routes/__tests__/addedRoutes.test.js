const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { buildAddedRouter } = require('../addedRoutes');

/* What a source added, through the route: inked ones say so, struck ones
   are never offered again, and only the reader strikes. */
test('what a source added: pencil until inked, gone once struck', async () => {
  const userId = '64b000000000000000000001';
  const source = '64b0000000000000000000a1';
  const echo = 'highlight:64b0000000000000000000b1';
  const answer = 'question:64b0000000000000000000b2';
  const page = 'wiki_page:64b0000000000000000000b3';
  const verdicts = [];
  let agent = false;
  const lean = value => ({ select: () => ({ lean: async () => value }) });
  const Connection = { find: () => lean([{ _id: 'c1', toType: 'question', toId: '64b0000000000000000000b2' }]) };
  const Verdict = {
    find: query => lean(verdicts.filter(row => query.about.$in.includes(row.about))),
    create: async row => verdicts.push(row)
  };
  const addedBy = async () => [echo, answer, page].map(key => ({ kind: 'echo', key, to: { title: key }, score: 0.9 }));

  const app = express();
  app.use(express.json());
  app.use(buildAddedRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: userId }; next(); },
    humanOnly: (_req, res, next) => (agent ? res.status(403).json({}) : next()),
    Connection, Verdict, addedBy
  }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const call = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {});
    return { code: response.status, ...(await response.json()) };
  };
  try {
    const first = await call(`/api/added/${source}`);
    assert.deepEqual(first.added.map(({ key, inked }) => [key, inked]), [[echo, null], [answer, 'c1'], [page, null]]);
    assert.equal('score' in first.added[0], false);

    agent = true;
    assert.equal((await call(`/api/added/${source}/strike`, { key: page })).code, 403);
    agent = false;
    assert.equal((await call(`/api/added/${source}/strike`, { key: 'article:nope' })).code, 400);
    assert.equal((await call(`/api/added/${source}/strike`, { key: page, title: 'Checklists' })).struck, true);
    assert.deepEqual(verdicts.map(({ verdict, kind, agent: hand, about, title }) => ({ verdict, kind, hand, about, title })), [
      { verdict: 'strike', kind: 'connection', hand: 'noeis', about: `${source}>${page}`, title: 'Checklists' }
    ]);

    assert.deepEqual((await call(`/api/added/${source}`)).added.map(({ key }) => key), [echo, answer]);
    assert.equal((await call('/api/added/not-an-id')).code, 400);
  } finally {
    server.close();
  }
});
