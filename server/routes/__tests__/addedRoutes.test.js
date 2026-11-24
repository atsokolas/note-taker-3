const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { buildAddedRouter } = require('../addedRoutes');
const { whatItAdded } = require('../../services/whatItAdded');

/* What a source added, through the route: the model reads each close pair
   once, and only what bears or argues is offered; inked ones say so, struck
   ones are never offered again, and only the reader strikes. */
test('what a source added: pencil until inked, gone once struck', async () => {
  const userId = '64b000000000000000000001';
  const source = '64b0000000000000000000a1';
  const echo = 'highlight:64b0000000000000000000b1';
  const answer = 'question:64b0000000000000000000b2';
  const page = 'wiki_page:64b0000000000000000000b3';
  const coincidence = 'highlight:64b0000000000000000000b5';
  const verdicts = [];
  let agent = false;
  const asked = [];
  const lean = value => ({ select: () => ({ lean: async () => value }) });
  const connections = [{ _id: 'c1', fromId: source, toType: 'question', toId: '64b0000000000000000000b2', relationType: 'supports' }];
  const same = query => row => Object.entries(query).every(([field, value]) => String(row[field]) === String(value));
  const Connection = {
    find: () => lean(connections),
    findOne: query => lean(connections.find(same(query)) || null),
    create: async row => { connections.push({ _id: `c${connections.length + 1}`, ...row }); return connections.at(-1); }
  };
  const Article = {
    // The week's arrivals, newest first: this source and one that connects to nothing.
    find: (filter) => { asked.lately = filter; return { sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [{ _id: source, title: 'Checklists in surgery' }, { _id: '64b0000000000000000000a2', title: 'Sourdough' }] }) }) }) }; },
    findOne: ({ _id }) => lean(_id === source ? { title: 'Checklists in surgery', highlights: [{ text: 'Complications fell by a third.' }], content: '<p>The WHO checklist.</p>' } : null) };
  const sent = [];
  class WikiSourceEvent { constructor(row) { Object.assign(this, row); } async save() { sent.push(this); } }
  const Verdict = {
    find: query => lean(verdicts.filter(row => query.about.$in.includes(row.about))),
    create: async row => verdicts.push(row)
  };
  const addedBy = async ({ articleId }) => (articleId !== source ? [] : [echo, answer, page, coincidence].map(key => ({ kind: key === answer ? 'answers' : 'echo', key, to: { title: key, quote: `${key} says` }, score: 0.9 })));
  // The page line is contradicted and the coincidence only shares words; the model is asked once, and its reading kept.
  // A judgment kept before relations were read (argues alone) is read again.
  const judgments = [{ userId, about: `${source}>${echo}`, argues: false }];
  const ConnectionJudgment = {
    find: ({ about, relation }) => lean(judgments.filter(row => about.$in.includes(row.about) && (!relation?.$exists || row.relation))),
    bulkWrite: async ops => ops.forEach(({ updateOne: { filter, update } }) => {
      const row = judgments.find(held => held.about === filter.about);
      if (row) Object.assign(row, update.$set); else judgments.push({ ...update.$set });
    })
  };
  const judge = async ({ pairs }) => {
    asked.push(pairs.map(({ b }) => b.who));
    const relationOf = who => ({ [page]: 'argues', [coincidence]: 'none' }[who] || 'bears');
    // The model names no side for the argument, so the source's own first mark speaks for it.
    return pairs.map(({ b }, index) => ({ index, relation: relationOf(b.who), a: '', b: '' }));
  };

  const app = express();
  app.use(express.json());
  app.use(buildAddedRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: userId }; next(); },
    humanOnly: (_req, res, next) => (agent ? res.status(403).json({}) : next()),
    Article, Connection, ConnectionJudgment, Verdict, WikiSourceEvent,
    added: asked => whatItAdded({ ...asked, find: addedBy, judge })
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
    assert.equal(first.added[2].says, 'Complications fell by a third.');
    assert.equal((await call(`/api/added/${source}`)).added[2].kind, 'argues');
    assert.deepEqual(asked, [[echo, answer, page, coincidence]]);
    assert.equal(judgments.length, 4);
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

    // Lately: the arrival that connected, with the strongest thing it added and not what was struck.
    assert.deepEqual((await call('/api/added')).lately.map(({ articleId, title, kind, key }) => [articleId, title, kind, key]), [[source, 'Checklists in surgery', 'echo', echo]]);
    assert.deepEqual([asked.lately.archived, asked.lately.hiddenFromHome], [{ $ne: true }, { $ne: true }], 'nothing hidden from the Library arrives');

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
