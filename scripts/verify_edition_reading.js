/* Real local Mongo + real Edition routes; no production credentials or model calls. */
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { buildEditionRouter } = require('../server/routes/editionRoutes');
const { buildEditionThoughtRouter } = require('../server/routes/editionThoughtRoutes');
const { buildLegacyContentRouter } = require('../server/routes/legacyContentRoutes');
const uri = process.env.EDITION_QA_MONGO_URI || 'mongodb://127.0.0.1:27030/noeis_sunday_paper_qa';
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/noeis_sunday_paper_qa$/.test(uri))
  throw new Error('Only the isolated local Edition QA database is allowed.');
const serve = process.argv.includes('--serve');
const port = serve ? 3105 : 0;
const secret = 'isolated-edition-fixture-only';
const owner = new mongoose.Types.ObjectId();
const other = new mongoose.Types.ObjectId();
const token = jwt.sign({ id: String(owner), username: 'Sunday Paper QA' }, secret, {
  expiresIn: '12h'
});
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const auth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret);
    next();
  } catch (_) {
    res.sendStatus(401);
  }
};
const humanOnly = (req, res, next) => (req.user.agent ? res.sendStatus(403) : next());
(async () => {
  await mongoose.connect(uri, { autoIndex: false });
  const { Edition, EditionProfile, Article, Note, SharedEdition } = require('../server/models');
  await Note.createIndexes();
  const item = (id, title, section, finding) => ({
    itemId: id,
    title,
    section,
    finding,
    boundary:
      'This is a local design fixture. It illustrates a distinction; it does not establish how every reader works.',
    url: `https://example.com/${id}`,
    sourceLabel: 'Local research fixture',
    sourceDate: 'September 2026',
    filedBy: { label: id === 'beside' ? 'Hermes' : 'Jarvis' }
  });
  const sections = [
    { key: 'attention', label: 'On attention' },
    { key: 'context', label: 'Working with an idea' },
    { key: 'counter', label: 'Counterevidence' }
  ];
  await EditionProfile.create({
    userId: owner,
    key: 'weekend_readings',
    title: 'Weekend Readings',
    sections
  });
  const readings = [
    item(
      'room',
      'The best reading tools know when to get out of the way.',
      'attention',
      'A paper asks for a different kind of attention than an inbox. Give the reading a place of its own, already open, instead of making each sentence another message to process.\n\nThe useful idea is separation: let the reader meet a finding before meeting the controls for managing it. The work of collecting belongs behind the paper, not in front of it.'
    ),
    item(
      'beside',
      'Beside, not away.',
      'context',
      'A source can sit beside an idea without replacing it. The reader should be able to inspect the evidence, notice its limits, and return to precisely the sentence they were considering.\n\nA stable reading measure makes that return feel like continuing a thought rather than starting again.'
    ),
    item(
      'quiet',
      'Leave room for what stayed with you.',
      'context',
      'Not every useful reading needs another task. A private sentence can preserve the reason this mattered, without turning the paper into an assignment.'
    )
  ];
  const edition = await Edition.create({
    userId: owner,
    profile: 'weekend_readings',
    title: 'Weekend Readings',
    number: 3,
    windowStart: '2026-09-13',
    windowEnd: '2026-09-19',
    standfirst: 'On attention, evidence, and the pleasure of staying with a thought.',
    items: readings
  });
  await Edition.create({
    userId: owner,
    profile: 'weekend_readings',
    title: 'Weekend Readings',
    number: 2,
    windowStart: '2026-09-06',
    windowEnd: '2026-09-12',
    items: [readings[1]]
  });
  await Edition.create({
    userId: owner,
    profile: 'this_week_in_ai',
    title: 'This Week in AI',
    number: 8,
    windowStart: '2026-09-12',
    windowEnd: '2026-09-18',
    items: [
      item(
        'ai',
        'Where an evaluation stops.',
        'models_methods',
        'A benchmark measures the conditions it specifies. A useful research paper keeps those conditions attached to the finding.'
      )
    ]
  });
  const app = express();
  app.use(express.json());
  app.use(buildEditionThoughtRouter({ auth, humanOnly, Edition, Note }));
  app.use(buildLegacyContentRouter({ authenticateToken: auth, mongoose, Note, normalizeChecklist: (rows) => rows || [] }));
  app.use(
    buildEditionRouter({
      auth,
      humanOnly,
      Edition,
      EditionProfile,
      Article,
      SharedEdition,
      readArticle: async ({ url }) =>
        url.endsWith('/quiet')
          ? { ok: false, content: '', error: 'Fixture: no article text' }
          : {
              ok: true,
              title: 'A saved local source',
              content:
                'This is real stored article text in the isolated QA Library.\n\nIt is intentionally fixture content, not a fetched or invented production excerpt.'
            }
    })
  );
  app.get('/articles/:id', auth, async (req, res) => {
    const article = await Article.findOne({ _id: req.params.id, userId: req.user.id });
    article ? res.json(article) : res.sendStatus(404);
  });
  app.get('/_vercel/insights/script.js', (_req, res) => res.type('js').send(''));
  if (serve) {
    // This route exists only in the loopback-only fixture server, never in Noeis.
    app.get('/__qa', (_req, res) => res.type('html').send(`<script>localStorage.setItem('token',${JSON.stringify(token)});localStorage.setItem('noeis.wikiOnboardingComplete::${owner}','true');location.replace('/editions');</script>`));
    app.get('/api/onboarding/state', (_req, res) => res.json({ complete: true }));
    app.get('/api/system/loops', (_req, res) =>
      res.json({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        loops: Object.fromEntries(
          [
            'loop.morning-paper',
            'loop.wiki-maintenance',
            'loop.weekly-ai',
            'loop.outcome-review'
          ].map((id) => [
            id,
            {
              id,
              status: 'idle',
              reason: 'Isolated fixture; workers disabled.',
              updatedAt: null,
              href: '',
              receipt: null,
              metrics: {}
            }
          ])
        )
      })
    );
    app.get('/api/system/storage', (_req, res) => res.json({}));
    app.get('/api/*', (_req, res) => res.json({}));
    app.use(express.static(path.resolve(__dirname, '../note-taker-ui/build')));
    app.get('*', (_req, res) =>
      res.sendFile(path.resolve(__dirname, '../note-taker-ui/build/index.html'))
    );
  }
  const server = await new Promise((resolve) => {
    const s = app.listen(port, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, method = 'GET', data, extra = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...headers, ...extra },
      ...(data ? { body: JSON.stringify(data) } : {})
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = text;
    }
    return { status: res.status, body };
  };
  if (serve) {
    fs.mkdirSync(path.resolve(__dirname, '../tmp'), { recursive: true });
    fs.writeFileSync(
      path.resolve(__dirname, '../tmp/edition-qa.json'),
      JSON.stringify({ base, token, id: String(edition._id), owner: String(owner) }),
      { mode: 0o600 }
    );
    console.log(`Local Edition fixture ready at ${base}/editions/${edition._id}`);
    return;
  }
  try {
    const route = `/api/editions/${edition._id}`;
    const preview = await request(`${route}/share`);
    assert.equal(preview.status, 200);
    const first = {
      itemId: 'room',
      content: 'My private reason',
      quote: readings[0].finding.slice(0, 50),
      revision: 0
    };
    const results = await Promise.all([
      request(`${route}/thoughts`, 'PUT', first),
      request(`${route}/thoughts`, 'PUT', first)
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (
        await request(`${route}/thoughts`, 'PUT', {
          ...first,
          content: 'Revised private reason',
          revision: 1
        })
      ).status,
      200
    );
    assert.equal(
      (await request(`${route}/thoughts`, 'PUT', { ...first, revision: 1 })).status,
      409
    );
    assert.equal(
      (
        await request(`${route}/thoughts`, 'PUT', {
          itemId: '',
          content: 'A private closing thought',
          quote: '',
          revision: 0
        })
      ).status,
      200
    );
    const notes = await request(`${route}/thoughts`);
    assert.equal(notes.body.thoughts.length, 2);
    const privateNote = await Note.findOne({ userId: owner, 'editionContext.itemId': 'room' });
    const ordinary = await request('/api/notes', 'POST', { title: 'Ordinary note', content: 'Original' });
    assert.equal(ordinary.status, 201);
    const legacyList = await request('/api/notes');
    assert.deepEqual(legacyList.body.map((note) => note._id), [ordinary.body._id]);
    assert.equal((await request(`/api/notes/${privateNote._id}`, 'PATCH', { content: 'Bypass' })).status, 404);
    assert.equal((await request(`/api/notes/${privateNote._id}`, 'DELETE')).status, 404);
    assert.equal((await request(`/api/notes/${ordinary.body._id}`, 'PATCH', { content: 'Revised' })).body.content, 'Revised');
    assert.equal((await request(`/api/notes/${ordinary.body._id}`, 'DELETE')).status, 200);
    assert.equal((await request(`${route}/thoughts`)).body.thoughts.find((note) => note.itemId === 'room').content, 'Revised private reason');
    assert.equal(
      notes.body.thoughts.find((n) => n.itemId === 'room').content,
      'Revised private reason'
    );
    for (const [claims, expected] of [
      [{ id: String(other) }, 404],
      [{ id: String(owner), agent: true }, 403]
    ]) {
      const authHeaders = { Authorization: `Bearer ${jwt.sign(claims, secret)}` };
      assert.equal((await request(`${route}/thoughts`, 'GET', null, authHeaders)).status, expected);
      assert.equal(
        (await request(`${route}/thoughts`, 'PUT', first, authHeaders)).status,
        expected
      );
    }
    assert.equal(
      (await request(`${route}/thoughts`, 'PUT', { ...first, itemId: 'missing' })).status,
      404
    );
    assert.equal(
      (await request(`${route}/thoughts`, 'PUT', { ...first, content: 'x'.repeat(6001) })).status,
      400
    );
    const share = await request(`${route}/share`, 'POST', {
      previewHash: preview.body.currentHash
    });
    assert.equal(share.status, 201);
    const published = await request(`/api/public/editions/${share.body.slug}`);
    assert.equal(published.status, 200);
    assert.ok(!JSON.stringify(published.body).includes('private reason'));
    assert.ok(!JSON.stringify(published.body).includes('private closing'));
    assert.ok(!JSON.stringify(published.body).includes('editionContext'));
    const frozen = JSON.stringify(published.body);
    const keep = await request(`${route}/items/room/save`, 'POST', {});
    assert.equal(keep.status, 200);
    assert.equal(keep.body.readable, true);
    const later = await request(`${route}/items/quiet/later`, 'POST', {});
    assert.equal(later.status, 200);
    assert.equal(later.body.readable, false);
    assert.equal(later.body.placed, true);
    assert.equal((await Article.findById(later.body.articleId)).placement, 'later');
    assert.equal(
      JSON.stringify((await request(`/api/public/editions/${share.body.slug}`)).body),
      frozen
    );
    assert.equal((await request(`${route}/share`, 'DELETE')).status, 200);
    assert.equal((await request(`/api/public/editions/${share.body.slug}`)).status, 404);
    console.log(
      'PASS: real Mongo thought uniqueness/CAS, ownership, agent denial, quotes/reflections, public privacy/frozen share/revoke, real Keep and unreadable Later.'
    );
  } finally {
    await Promise.all(
      [Edition, EditionProfile, Article, Note, SharedEdition].map((Model) =>
        Model.deleteMany({ userId: owner })
      )
    );
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
