const express = require('express');
const http = require('http');
const {
  NAMED_LIBRARY_FRAGMENT_EXAMPLES,
  deriveImportedTitle
} = require('../../services/importTitleService');
const { buildLegacyContentRouter } = require('../legacyContentRoutes');

describe('save-article title hygiene', () => {
  const saved = [];
  const Article = {
    findOneAndUpdate: async (query, data) => {
      const article = {
        _id: 'article-1',
        url: data.url || query.url,
        title: data.title,
        content: data.content,
        author: data.author,
        userId: 'user-1'
      };
      saved.push(article);
      return article;
    }
  };

  const request = async (body) => {
    saved.length = 0;
    const app = express();
    app.use(express.json());
    app.use(buildLegacyContentRouter({
      authenticateToken: (req, _res, next) => {
        req.user = { id: 'user-1' };
        next();
      },
      mongoose: { Types: { ObjectId: String } },
      Note: {},
      normalizeChecklist: value => value,
      Folder: {},
      normalizePdfs: value => value,
      Article,
      enqueueArticleEmbedding: () => {},
      safeMapEmbedding: () => {},
      articleToEmbeddingItems: () => [],
      queueEmbeddingUpsert: () => {},
      getFoldersWithCounts: async () => [],
      normalizeItemType: value => value,
      buildEmbeddingId: () => '',
      queueEmbeddingDelete: () => {}
    }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/save-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: response.status, body: await response.json() };
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  };

  test('rewrites the three observed fragment titles at capture', async () => {
    for (const example of NAMED_LIBRARY_FRAGMENT_EXAMPLES) {
      const result = await request({
        title: example.before,
        url: example.url,
        content: example.content,
        author: example.author,
        publicationDate: example.publishedAt
      });
      expect(result.status).toBe(200);
      expect(result.body.title).toBe(example.after);
      expect(saved[0].title).toBe(example.after);
    }
  });

  test('keeps a durable title', async () => {
    const result = await request({
      title: 'Fooled by Randomness',
      url: 'https://example.com/fooled',
      content: 'A book about chance.'
    });
    expect(result.status).toBe(200);
    expect(result.body.title).toBe('Fooled by Randomness');
  });

  test('deriveImportedTitle is the same function capture uses', () => {
    expect(deriveImportedTitle({
      metadataTitle: NAMED_LIBRARY_FRAGMENT_EXAMPLES[0].before,
      author: NAMED_LIBRARY_FRAGMENT_EXAMPLES[0].author,
      url: NAMED_LIBRARY_FRAGMENT_EXAMPLES[0].url,
      sourceType: 'thread',
      content: NAMED_LIBRARY_FRAGMENT_EXAMPLES[0].content,
      publishedAt: NAMED_LIBRARY_FRAGMENT_EXAMPLES[0].publishedAt
    })).toBe(NAMED_LIBRARY_FRAGMENT_EXAMPLES[0].after);
  });
});
