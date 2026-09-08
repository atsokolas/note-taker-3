const express = require('express');
const http = require('http');
const { buildHighlightMutationRouter } = require('../highlightMutationRoutes');

/* A highlight lives inside its article as a subdocument, so it has no articleId
   field of its own. The create route used to return that raw subdocument, and a
   caller reading articleId off it saw nothing — one agent read its own five
   successful writes as five unattached highlights and reported them as lost. */
describe('created highlight carries its article', () => {
  const createHighlight = async (body) => {
    const article = {
      _id: 'article-1',
      title: 'Going Founder Mode on Cancer',
      url: 'https://centuryofbio.com/p/sid',
      highlights: []
    };

    const app = express();
    app.use(express.json());
    app.use(buildHighlightMutationRouter({
      mongoose: { Types: { ObjectId: String } },
      authenticateToken: (req, _res, next) => {
        req.user = { id: 'user-1' };
        next();
      },
      Article: {
        findOneAndUpdate: async (_query, update) => {
          article.highlights.push({ _id: 'highlight-1', ...update.$push.highlights });
          return article;
        }
      },
      normalizeTags: value => (Array.isArray(value) ? value : []),
      enqueueHighlightEmbedding: () => {},
      safeMapEmbedding: () => null,
      highlightToEmbeddingItem: () => null,
      queueEmbeddingUpsert: () => {},
      markTourSignal: async () => {},
      normalizeItemType: (value, fallback) => value || fallback,
      parseClaimId: value => value || null,
      buildEmbeddingId: () => '',
      queueEmbeddingDelete: () => {}
    }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/articles/article-1/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: response.status, body: await response.json() };
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  };

  test('the created highlight names the article it was pushed into', async () => {
    const result = await createHighlight({ text: 'Founder mode is a claim about proximity.' });
    expect(result.status).toBe(200);
    expect(result.body.highlight.articleId).toBe('article-1');
    expect(result.body.highlight.articleTitle).toBe('Going Founder Mode on Cancer');
    expect(result.body.highlight._id).toBe('highlight-1');
    expect(result.body.highlight.text).toBe('Founder mode is a claim about proximity.');
  });

  test('an anchor survives the round trip', async () => {
    const result = await createHighlight({
      text: 'Founder mode is a claim about proximity.',
      anchor: { text: 'Founder mode is a claim about proximity.', prefix: 'So ', suffix: ' Then' }
    });
    expect(result.body.highlight.anchor.prefix).toBe('So ');
  });
});
