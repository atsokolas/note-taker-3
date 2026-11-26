const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { buildHomeRouter } = require('../homeRoutes');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-25T18:00:00Z');
const ago = days => new Date(NOW - days * DAY);
const id = n => `64c0000000000000000000${String(n).padStart(2, '0')}`;

/* Home, through the route: Kept in the order it was kept, For now sinking
   after a fortnight, everything else counted underneath, and one old mark
   come back beside a new one. Only the reader keeps a passage. */
test('home: kept, for now, underneath, and what came back', async () => {
  const charlie = {
    _id: id(1), title: "Poor Charlie's Almanack", url: 'import://readwise/book/1', createdAt: ago(31),
    highlights: [
      { _id: id(11), text: 'Pacifism is not free: deterrence works through a credible payback.', createdAt: ago(2), opens: 0 },
      { _id: id(12), text: 'Invert, always invert.', createdAt: ago(400), opens: 4 }
    ]
  };
  const meditations = {
    _id: id(2), title: 'Meditations', url: 'import://readwise/book/2', createdAt: ago(900),
    highlights: [{ _id: id(21), text: 'The best revenge is not to be like your enemy.', createdAt: ago(800), keptAt: ago(300) }]
  };
  const founder = { _id: id(3), title: 'Going Founder Mode On Cancer', url: 'https://example.com/cancer', createdAt: ago(60), evergreen: true, evergreenAt: ago(40), highlights: [] };
  const escher = { _id: id(4), title: 'Escher, Relativity', url: 'https://example.com/escher', createdAt: ago(20), highlights: [] };
  const archived = { _id: id(5), title: 'Set aside', url: 'https://example.com/old', createdAt: ago(3), archived: true, highlights: [] };
  const articles = [charlie, meditations, founder, escher, archived];
  const readings = [{ articleId: id(4), visitedAt: ago(9) }];
  const asked = [];

  const lean = value => ({ select: () => ({ lean: async () => value }) });
  const Article = {
    find: query => lean(articles.filter(article => !(query.archived && article.archived))),
    findOne: async ({ _id, 'highlights._id': mark }) => {
      const found = articles.find(article => article._id === _id && article.highlights.some(held => held._id === mark));
      if (!found) return null;
      return { ...found, highlights: Object.assign(found.highlights, { id: wanted => found.highlights.find(mark => mark._id === wanted) }), save: async () => {} };
    }
  };
  const ArticleReadingState = { find: () => lean(readings) };
  const Thread = { find: () => ({ sort: () => ({ lean: async () => [] }) }) };
  const echoOf = async ({ mark }) => {
    asked.push(mark._id);
    return mark._id === id(11) ? { _id: id(21), text: meditations.highlights[0].text, articleId: id(2), articleTitle: 'Meditations', createdAt: ago(800) } : null;
  };

  const app = express();
  app.use(express.json());
  app.use(buildHomeRouter({ authenticateToken: (req, _res, next) => { req.user = { id: 'reader' }; next(); }, Article, ArticleReadingState, Thread, echoOf, formingAround: async () => [], now: () => NOW }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, init) => {
    const response = await fetch(`${base}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
    return { status: response.status, body: await response.json() };
  };

  try {
    const { body } = await call('/api/home?today=2026-11-25');
    assert.deepEqual(body.kept.map(item => [item.kind, item.title]), [['mark', 'Meditations'], ['source', 'Going Founder Mode On Cancer']], 'Kept reads in the order it was kept');
    assert.deepEqual(body.asks.map(ask => ask.highlightId), [id(12)], 'a passage opened again and again is asked about');
    assert.deepEqual(body.forNow.map(item => [item.title, item.book, item.marks]), [["Poor Charlie's Almanack", true, 1], ['Escher, Relativity', false, 0]], 'a fortnight, then it sinks');
    assert.equal(body.underneath.marks, 3);
    assert.equal(body.underneath.works, 2);
    assert.equal(body.underneath.since, ago(800).toISOString(), 'underneath goes back to the first mark');
    assert.equal(body.cameBack.mark.bookTitle, "Poor Charlie's Almanack");
    assert.equal(body.cameBack.echo.articleTitle, 'Meditations');
    assert.deepEqual(asked, [id(11)], 'only what was marked lately goes looking');

    await call('/api/home?today=2026-11-25');
    assert.equal(asked.length, 1, 'what came back holds all day');

    assert.equal((await call(`/articles/${id(1)}/highlights/${id(12)}/kept`, { method: 'PATCH', body: JSON.stringify({ kept: 'yes' }) })).status, 400);
    const keptNow = await call(`/articles/${id(1)}/highlights/${id(12)}/kept`, { method: 'PATCH', body: JSON.stringify({ kept: true }) });
    assert.equal(keptNow.body.keptAt, new Date(NOW).toISOString());
    const after = (await call('/api/home?today=2026-11-25')).body;
    assert.deepEqual(after.kept.map(item => item.highlightId || item.articleId), [id(21), id(3), id(12)]);
    assert.deepEqual(after.asks, [], 'a kept passage is not asked about again');

    await call(`/articles/${id(1)}/highlights/${id(12)}/kept`, { method: 'PATCH', body: JSON.stringify({ kept: false }) });
    assert.equal((await call('/api/home?today=2026-11-25')).body.kept.length, 2, 'letting go of a passage takes it out of Kept');
    meditations.highlights[0].text = 'The best revenge is to be unlike him who performed the injury.';
    assert.equal((await call('/api/home?today=2026-11-25')).body.cameBack.echo.text, meditations.highlights[0].text, 'what came back reads as the passage is now');
    meditations.highlights.splice(0, 1);
    assert.equal((await call('/api/home?today=2026-11-25')).body.cameBack, null, 'a passage let go of does not come back');
    assert.equal((await call(`/articles/${id(1)}/highlights/${id(99)}/kept`, { method: 'PATCH', body: JSON.stringify({ kept: true }) })).status, 404);
  } finally {
    server.close();
  }
});

/* Something forming: passages from three works, years apart, around a mark
   made lately. Asked once a fortnight at most; it waits for the reader's
   answer, and only the reader gives one. */
test('home: a thread forms, waits for an answer, and is kept', async () => {
  const charlie = { _id: id(1), title: "Poor Charlie's Almanack", url: 'import://readwise/book/1', createdAt: ago(31), highlights: [{ _id: id(11), text: 'Pacifism is not free: deterrence works through a credible payback.', createdAt: ago(2) }] };
  const meditations = { _id: id(2), title: 'Meditations', url: 'import://readwise/book/2', createdAt: ago(900), highlights: [{ _id: id(21), text: 'The best revenge is not to be like your enemy.', createdAt: ago(800) }] };
  const vegetius = { _id: id(3), title: 'De Re Militari', url: 'https://example.com/vegetius', createdAt: ago(1600), highlights: [{ _id: id(31), text: 'Let him who desires peace prepare for war.', createdAt: ago(1500) }] };
  const articles = [charlie, meditations, vegetius];
  const threads = [];
  const asked = [];
  const lean = value => ({ select: () => ({ lean: async () => value }) });
  const doc = thread => Object.assign(thread, { save: async () => thread });
  const Thread = {
    find: () => ({ sort: () => ({ lean: async () => threads }), lean: async () => threads }),
    findOne: async ({ _id, userId }) => threads.find(thread => thread._id === _id && thread.userId === userId) || null,
    create: async ({ userId, marks }) => {
      const thread = doc({ _id: id(90 + threads.length), userId, marks, answer: null, answeredAt: null, createdAt: new Date(NOW) });
      threads.push(thread);
      return thread;
    }
  };
  const seneca = { _id: id(4), title: 'Letters from a Stoic', url: 'import://readwise/book/4', createdAt: ago(1), highlights: [{ _id: id(41), text: 'We suffer more in imagination than in reality.', createdAt: new Date(NOW + DAY) }] };
  const marked = [
    { _id: id(21), articleId: id(2), createdAt: ago(800), text: meditations.highlights[0].text },
    { _id: id(31), articleId: id(3), createdAt: ago(1500), text: vegetius.highlights[0].text }
  ];
  const formingAround = async ({ mark }) => {
    asked.push(mark._id);
    return marked;
  };
  const app = express();
  app.use(express.json());
  app.use(buildHomeRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'reader' }; next(); },
    Article: {
      find: () => lean(articles),
      findOne: async ({ _id, 'highlights._id': mark }) => articles.find(article => article._id === _id && article.highlights.some(held => held._id === mark)) || null
    },
    ArticleReadingState: { find: () => lean([]) },
    Thread,
    echoOf: async () => null,
    formingAround,
    now: () => NOW
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, init) => {
    const response = await fetch(`${base}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
    return { status: response.status, body: await response.json() };
  };

  try {
    const { body } = await call('/api/home?today=2026-11-25');
    assert.equal(body.forming.title, "A thread through De Re Militari, Meditations and Poor Charlie's Almanack", 'oldest first, the order it formed in');
    assert.deepEqual(body.forming.marks.map(mark => mark.highlightId), [id(31), id(21), id(11)]);
    assert.equal((await call('/api/home?today=2026-11-25')).body.forming.threadId, body.forming.threadId, 'it waits for an answer');
    assert.equal(threads.length, 1);
    assert.deepEqual(asked, [id(11)], 'looked for once');

    assert.equal((await call(`/api/threads/${body.forming.threadId}`, { method: 'PATCH', body: JSON.stringify({ answer: 'maybe' }) })).status, 400);
    const kept = await call(`/api/threads/${body.forming.threadId}`, { method: 'PATCH', body: JSON.stringify({ answer: 'kept' }) });
    assert.equal(kept.body.answer, 'kept');
    const after = (await call('/api/home?today=2026-11-26')).body;
    assert.equal(after.forming, null, 'a new one is not looked for within the fortnight');
    assert.deepEqual(after.kept.map(item => [item.kind, item.marks]), [['thread', 3]], 'a kept thread is in Kept');
    assert.equal((await call(`/api/threads/${body.forming.threadId}`)).body.marks.length, 3, 'it has a page of its own');
    assert.deepEqual((await call('/api/kept')).body.kept.map(item => item.threadId), [body.forming.threadId], 'Kept alone, for ⌘K and the brief');
    assert.equal((await call(`/api/threads/${id(99)}`)).status, 404);

    /* Kept, it grows: a passage marked since, from another work, is offered
       in pencil and joins only when the reader adds it. */
    const page = `/api/threads/${body.forming.threadId}`;
    assert.equal(kept.body.offered, undefined);
    articles.push(seneca);
    marked.push({ _id: id(41), articleId: id(4), articleTitle: 'Letters from a Stoic', createdAt: new Date(NOW + DAY), text: seneca.highlights[0].text });
    const grown = (await call(`${page}?today=2026-11-27`)).body;
    assert.deepEqual([grown.offered.highlightId, grown.offered.title], [id(41), 'Letters from a Stoic'], 'marked since it was kept');
    assert.equal((await call(`${page}/offered`, { method: 'POST', body: JSON.stringify({ articleId: id(4), highlightId: id(41) }) })).status, 400);
    const joined = (await call(`${page}/offered`, { method: 'POST', body: JSON.stringify({ articleId: id(4), highlightId: id(41), joins: true }) })).body;
    assert.deepEqual(joined.marks.map(mark => mark.highlightId), [id(31), id(21), id(11), id(41)], 'it joins at the end, the newest');
    assert.equal((await call(`${page}?today=2026-11-27`)).body.offered, null, 'nothing more to offer');
  } finally {
    server.close();
  }
});

/* The world, only when asked: one search per question a day, a daily
   allowance, and silence when the search fails. */
test('world: searched once a day per question, within an allowance, quiet on failure', async () => {
  const searched = [];
  let clock = NOW;
  const searchWorld = async query => {
    searched.push(query);
    if (query === 'broken search') throw new Error('upstream');
    return [{ title: 'Deterrence', url: 'https://example.org/deterrence', age: '' }];
  };
  const lean = value => ({ select: () => ({ lean: async () => value }) });
  const app = express();
  app.use(buildHomeRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'reader' }; next(); },
    Article: { find: () => lean([]) },
    ArticleReadingState: { find: () => lean([]) },
    Thread: { find: () => ({ sort: () => ({ lean: async () => [] }) }) },
    echoOf: async () => null,
    formingAround: async () => [],
    searchWorld,
    now: () => clock
  }));
  const server = app.listen(0);
  const call = async path => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return { status: response.status, body: await response.json() };
  };

  try {
    assert.equal((await call('/api/world?q=ab')).status, 400, 'ask about something');
    const first = await call('/api/world?q=Deterrence%20%20theory');
    assert.deepEqual(first.body, { query: 'Deterrence theory', pages: [{ title: 'Deterrence', url: 'https://example.org/deterrence', age: '' }] });
    await call('/api/world?q=deterrence%20theory');
    assert.deepEqual(searched, ['Deterrence theory'], 'the same question is searched once a day');
    assert.deepEqual((await call('/api/world?q=broken%20search')).body.pages, [], 'a failed search is silence');
    for (let n = searched.length; n < 20; n += 1) await call(`/api/world?q=question%20${n}`);
    assert.equal((await call('/api/world?q=one%20more&today=2030-01-01')).status, 429, 'twenty a day, whatever day the reader says it is');
    clock = NOW + DAY;
    assert.equal((await call('/api/world?q=one%20more')).status, 200, 'a new day, a new allowance');
  } finally {
    server.close();
  }
});
