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
  const connections = [{ _id: 'c1', fromId: source, toType: 'question', toId: '64b0000000000000000000b2', relationType: 'supports' }];
  const same = query => row => Object.entries(query).every(([field, value]) => String(row[field]) === String(value));
  const Connection = {
    find: () => lean(connections),
    findOne: query => lean(connections.find(same(query)) || null),
    create: async row => { connections.push({ _id: `c${connections.length + 1}`, ...row }); return connections.at(-1); }
  };
  const Article = { findOne: ({ _id }) => lean(_id === source ? { title: 'Checklists in surgery', highlights: [{ text: 'Complications fell by a third.' }], content: '<p>The WHO checklist.</p>' } : null) };
  const sent = [];
  class WikiSourceEvent { constructor(row) { Object.assign(this, row); } async save() { sent.push(this); } }
  const Verdict = {
    find: query => lean(verdicts.filter(row => query.about.$in.includes(row.about))),
    create: async row => verdicts.push(row)
  };
  const addedBy = async () => [echo, answer, page].map(key => ({ kind: key === answer ? 'answers' : 'echo', key, to: { title: key, quote: `${key} says` }, score: 0.9 }));
  // The page line is contradicted; the model is asked once, and the judgment kept.
  const judgments = [];
  const ConnectionJudgment = {
    find: ({ about }) => lean(judgments.filter(row => about.$in.includes(row.about))),
    insertMany: async rows => judgments.push(...rows)
  };
  const asked = [];
  const judge = async ({ pairs }) => {
    asked.push(pairs.map(({ b }) => b.who));
    return pairs.map(({ b }, index) => ({ index, contradicts: b.who === page, a: 'Checklists slow surgeons down.', b: '' }));
  };

  const app = express();
  app.use(express.json());
  app.use(buildAddedRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: userId }; next(); },
    humanOnly: (_req, res, next) => (agent ? res.status(403).json({}) : next()),
    Article, Connection, ConnectionJudgment, Verdict, WikiSourceEvent, addedBy, judge
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
    assert.deepEqual(first.added.map(({ kind, key, inked }) => [kind, key, inked]), [['echo', echo, null], ['answers', answer, 'c1'], ['argues', page, null]]);
    assert.equal(first.added[2].says, 'Checklists slow surgeons down.');
    assert.equal((await call(`/api/added/${source}`)).added[2].kind, 'argues');
    assert.deepEqual(asked, [[echo, page]]);
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

    // Inking keeps the connection as the reader's; inking a page also sends the source there, once.
    assert.equal((await call(`/api/added/${source}/ink`, { key: echo, kind: 'nonsense' })).code, 400);
    assert.equal((await call(`/api/added/${source}/ink`, { key: echo, kind: 'echo' })).inked, 'c2');
    assert.equal(sent.length, 0);
    const shelf = 'wiki_page:64b0000000000000000000b4';
    const inked = await call(`/api/added/${source}/ink`, { key: shelf, kind: 'belongs' });
    assert.equal((await call(`/api/added/${source}/ink`, { key: shelf, kind: 'belongs' })).inked, inked.inked);
    assert.deepEqual(connections.at(-1), { _id: inked.inked, userId, fromType: 'article', fromId: source, toType: 'wiki_page', toId: '64b0000000000000000000b4', relationType: 'contained_by' });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].affectedPageIds.map(String), ['64b0000000000000000000b4']);
    assert.equal(sent[0].metadata.requireOwnerAcceptance, true);
    assert.match(sent[0].text, /Complications fell by a third\.\s+The WHO checklist\./);
    assert.equal((await call('/api/added/64b0000000000000000000a9/ink', { key: shelf, kind: 'belongs' })).code, 404);
    assert.equal((await call('/api/added/not-an-id')).code, 400);
  } finally {
    server.close();
  }
});
