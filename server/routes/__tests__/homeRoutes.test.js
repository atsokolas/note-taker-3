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
  const echoOf = async ({ mark }) => {
    asked.push(mark._id);
    return mark._id === id(11) ? { _id: id(21), text: meditations.highlights[0].text, articleId: id(2), articleTitle: 'Meditations', createdAt: ago(800) } : null;
  };

  const app = express();
  app.use(express.json());
  app.use(buildHomeRouter({ authenticateToken: (req, _res, next) => { req.user = { id: 'reader' }; next(); }, Article, ArticleReadingState, echoOf, now: () => NOW }));
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
