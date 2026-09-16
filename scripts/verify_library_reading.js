/* Isolated, real Mongo/route acceptance. No production credentials or AI calls. */
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const {
  buildArticleReadingStateRouter
} = require('../server/routes/articleReadingStateRoutes');
const {
  buildLibraryCollectionRouter
} = require('../server/routes/libraryCollectionRoutes');
const {
  buildLegacyContentRouter
} = require('../server/routes/legacyContentRoutes');
const {
  buildHighlightMutationRouter
} = require('../server/routes/highlightMutationRoutes');
const {
  buildLibraryRelevanceRouter
} = require('../server/routes/libraryRelevanceRoutes');
const { buildFolderService } = require('../server/services/folderService');
const uri =
  process.env.LIBRARY_QA_MONGO_URI ||
  'mongodb://127.0.0.1:27031/noeis_library_qa';
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/noeis_library_qa$/.test(uri))
  throw new Error('Only the isolated loopback Library QA database is allowed.');
const serve = process.argv.includes('--serve');
const owner = new mongoose.Types.ObjectId(),
  other = new mongoose.Types.ObjectId();
const secret = 'isolated-library-fixture-only';
const token = jwt.sign({ id: String(owner), username: 'Library QA' }, secret, {
  expiresIn: '12h'
});
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};
const auth = (req, res, next) => {
  try {
    req.user = jwt.verify(
      (req.headers.authorization || '').replace('Bearer ', ''),
      secret
    );
    next();
  } catch (_) {
    res.sendStatus(401);
  }
};
const humanOnly = (req, res, next) =>
  req.user.agent ? res.sendStatus(403) : next();
(async () => {
  await mongoose.connect(uri, { autoIndex: false });
  const models = require('../server/models');
  const { Article, ArticleReadingState, Folder, WikiPage } = models;
  await ArticleReadingState.createIndexes();
  const folders = await Folder.create(
    [
      'Reading & knowledge',
      'Science & systems',
      'Business & strategy',
      'History & institutions',
      'A very long shelf name to test narrow screens',
      'Research feed'
    ].map((name, index) => ({ userId: owner, name, asFeed: index === 5 }))
  );
  const paragraphs = Array.from(
    { length: 35 },
    (_, i) =>
      `Passage ${i + 1}. ${
        [
          'The moment of return matters more than the moment of capture. A library earns its place by making a past thought available at the right moment.',
          'A source can be useful without settling a question. Keep the observation attached to the conditions under which it was made.',
          'The quiet advantage of a long memory is the ability to recognize a pattern without mistaking resemblance for proof.'
        ][i % 3]
      } We can test this distinction by returning to the evidence and asking what would change our view.`
  );
  const titles = [
    'The difference between collecting and understanding',
    'Finding the passage, not just the file',
    'What a good source cannot tell us',
    'When a growing system becomes harder to steer',
    'The quiet advantage of a long memory',
    'A map is useful because it leaves things out',
    'A place for a question that is not ready',
    'The moment a bookmark becomes evidence'
  ];
  const articles = await Article.create(
    Array.from({ length: 312 }, (_, i) => ({
      userId: owner,
      title:
        titles[i] ||
        `Archive reading ${String(i).padStart(3, '0')}: ${i === 309 ? 'Beyond the first page' : 'Returning to a useful distinction'}`,
      url: `https://example.com/library-fixture-${owner}-${i}`,
      author: i % 4 ? 'Local research fixture' : '',
      folder: i % 7 === 6 ? null : folders[i % 6]._id,
      placement: i % 3 === 1 ? 'later' : i % 3 === 2 ? 'setAside' : 'stream',
      evergreen: i % 5 === 0,
      content:
        i === 6
          ? ''
          : paragraphs
              .map(
                (text, index) =>
                  `<p>${text}${i === 309 && index === 12 ? ' Hidden <em>quartz</em> thought beyond the browse page.' : ''}</p>`
              )
              .join(''),
      highlights:
        i === 1
          ? [
              {
                text: paragraphs[8],
                note: 'Return to an exact passage, not the top of a long page. Private cobalt memory.',
                anchor: {
                  text: paragraphs[8],
                  prefix: '',
                  suffix: '',
                  startOffsetApprox: paragraphs.slice(0, 8).join(' ').length + 1
                }
              }
            ]
          : [],
      createdAt: new Date(Date.UTC(2026, 8, 14) - i * 86400000),
      updatedAt: new Date(Date.UTC(2026, 8, 14) - i * 86400000)
    }))
  );
  const foreign = await Article.create({
    userId: other,
    title: 'Private foreign source',
    url: `https://example.com/foreign-${other}`,
    content: 'Do not leak this.'
  });
  const hidden = await Article.create({
    userId: owner,
    title: 'Suppressed fixture',
    url: `https://example.com/suppressed-${owner}`,
    content: 'Not in ordinary browsing.',
    archived: true
  });
  await WikiPage.create({
    userId: owner,
    title: 'A durable distinction',
    slug: `library-qa-${owner}`,
    evergreen: true
  });
  const { getFoldersWithCounts } = buildFolderService({
    Folder,
    Article,
    mongoose
  });
  const app = express();
  app.use(express.json());
  app.use(
    buildArticleReadingStateRouter({
      auth,
      humanOnly,
      Article,
      ArticleReadingState
    })
  );
  app.use(
    buildLibraryCollectionRouter({
      auth,
      humanOnly,
      mongoose,
      Article,
      ArticleReadingState
    })
  );
  app.use(
    buildLibraryRelevanceRouter({
      authenticateToken: auth,
      getFoldersWithCounts,
      ...models
    })
  );
  app.use(
    buildLegacyContentRouter({
      authenticateToken: auth,
      mongoose,
      ...models,
      getFoldersWithCounts,
      normalizeChecklist: (x) => x || [],
      normalizePdfs: (x) => x || [],
      enqueueArticleEmbedding: () => {},
      deleteArticleEmbeddingState: async () => {},
      buildEmbeddingId: (...parts) => parts.join(':'),
      queueEmbeddingDelete: () => {},
      safeMapEmbedding: () => null,
      normalizeItemType: (x) => x
    })
  );
  app.use(
    buildHighlightMutationRouter({
      authenticateToken: auth,
      mongoose,
      Article,
      normalizeTags: (x) => x || [],
      enqueueHighlightEmbedding: () => {},
      safeMapEmbedding: () => null,
      markTourSignal: async () => {},
      normalizeItemType: (x) => x,
      queueEmbeddingDelete: () => {}
    })
  );
  app.get('/api/wiki/pages', auth, async (req, res) =>
    res.json(
      await WikiPage.find({
        userId: req.user.id,
        ...(req.query.evergreen ? { evergreen: true } : {})
      }).lean()
    )
  );
  app.get('/api/onboarding/state', (_req, res) => res.json({ complete: true }));
  app.get('/api/system/loops', (_req, res) =>
    res.json({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      loops: {}
    })
  );
  app.get('/api/system/storage', (_req, res) => res.json({}));
  app.get('/api/connections/*', (_req, res) =>
    res.json({ outgoing: [], incoming: [] })
  );
  app.get('/api/agent/threads', (_req, res) => res.json({ threads: [] }));
  app.get('/api/*', (_req, res) => res.json([]));
  app.get('/_vercel/insights/script.js', (_req, res) =>
    res.type('js').send('')
  );
  if (serve) {
    app.get('/__qa', (_req, res) =>
      res
        .type('html')
        .send(
          `<script>localStorage.setItem('token',${JSON.stringify(token)});localStorage.setItem('noeis.wikiOnboardingComplete::${owner}','true');location.replace('/library');</script>`
        )
    );
    app.use(express.static(path.resolve(__dirname, '../note-taker-ui/build')));
    app.get('*', (_req, res) =>
      res.sendFile(path.resolve(__dirname, '../note-taker-ui/build/index.html'))
    );
  }
  const server = await new Promise((resolve) => {
    const running = app.listen(serve ? 3106 : 0, '127.0.0.1', () =>
      resolve(running)
    );
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, options = {}) => {
    const res = await fetch(base + route, {
      ...options,
      headers: options.headers || headers
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    const id = String(articles[0]._id),
      route = `/api/articles/${id}/reading-state`;
    const place = {
      anchor: {
        text: paragraphs[12],
        prefix: '',
        suffix: '',
        startOffsetApprox: paragraphs.slice(0, 12).join(' ').length + 1
      },
      ratio: 12 / 35
    };
    const before = await Article.findById(id).lean();
    const collectionBefore = await request('/api/library/collection');
    assert.equal(collectionBefore.body.total, 312);
    assert.equal(collectionBefore.body.items.length, 40);
    assert.equal((await request(route)).body.readingState, null);
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await request(route, { method: 'PUT', body: JSON.stringify(place) }))
          .status,
        200
      );
    assert.equal(
      await ArticleReadingState.countDocuments({
        userId: owner,
        articleId: id
      }),
      1
    );
    assert.deepEqual(
      (await request(route)).body.readingState.anchor,
      place.anchor
    );
    assert.equal(
      (await Article.findById(id).lean()).updatedAt.getTime(),
      before.updatedAt.getTime()
    );
    assert.deepEqual(
      (await request('/api/library/collection')).body.items.map((x) => x._id),
      collectionBefore.body.items.map((x) => x._id)
    );
    for (const bad of [
      { ...place, ratio: 2 },
      { ...place, ratio: '0.5' },
      { ...place, anchor: { ...place.anchor, text: 'x'.repeat(6001) } }
    ])
      assert.equal(
        (await request(route, { method: 'PUT', body: JSON.stringify(bad) }))
          .status,
        400
      );
    assert.equal(
      (await request(`/api/articles/${foreign._id}/reading-state`)).status,
      404
    );
    assert.equal(
      (
        await request(`/api/articles/${foreign._id}/reading-state`, {
          method: 'PUT',
          body: JSON.stringify(place)
        })
      ).status,
      404
    );
    assert.equal((await request(route, { headers: {} })).status, 401);
    assert.equal(
      (
        await request(route, {
          headers: {
            Authorization: `Bearer ${jwt.sign({ id: String(owner), agent: true }, secret)}`
          }
        })
      ).status,
      403
    );
    assert.equal(
      (await request('/api/library/collection?showSuppressed=1')).body.total,
      313
    );
    const bodyMatch = await request(
      '/api/library/collection?query=Hidden%20quartz'
    );
    assert.equal(bodyMatch.body.total, 1);
    assert.equal(bodyMatch.body.items[0]._id, String(articles[309]._id));
    assert.equal(bodyMatch.body.items[0].match.kind, 'body');
    const thought = await request('/api/library/collection?query=cobalt');
    assert.equal(thought.body.total, 1);
    assert.equal(thought.body.items[0].match.kind, 'thought');
    const marked = articles[1];
    assert.equal(
      (
        await request(`/articles/${marked._id}/placement`, {
          method: 'PATCH',
          body: JSON.stringify({ placement: 'setAside' })
        })
      ).status,
      200
    );
    const afterPlacement = await Article.findById(marked._id).lean();
    assert.equal(afterPlacement.highlights[0].note, marked.highlights[0].note);
    assert.equal(afterPlacement.evergreen, marked.evergreen);
    await ArticleReadingState.create({
      userId: owner,
      articleId: hidden._id,
      ...place,
      visitedAt: new Date()
    });
    assert.equal(
      (await request(`/articles/${hidden._id}`, { method: 'DELETE' })).status,
      200
    );
    assert.equal(
      await ArticleReadingState.countDocuments({ articleId: hidden._id }),
      0
    );
    assert.equal(
      (await request(`/api/articles/${hidden._id}/reading-state`)).status,
      404
    );
    console.log(
      JSON.stringify({
        checks:
          'PASS: owned reading-state round trip, unique key, validation, timestamps, ordering, private access, full-corpus body/thought search, placement independence, deletion cleanup',
        sources: 312
      })
    );
    if (serve) {
      fs.mkdirSync(path.resolve(__dirname, '../tmp'), { recursive: true });
      fs.writeFileSync(
        path.resolve(__dirname, '../tmp/library-qa.json'),
        JSON.stringify({
          owner: String(owner),
          articles: articles.map((a) => String(a._id)),
          paragraphs
        })
      );
      console.log(`Local preview: ${base}/__qa`);
      return;
    }
  } finally {
    if (!serve) {
      await Promise.all([
        Article.deleteMany({ userId: { $in: [owner, other] } }),
        ArticleReadingState.deleteMany({ userId: owner }),
        Folder.deleteMany({ userId: owner }),
        WikiPage.deleteMany({ userId: owner })
      ]);
      await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
