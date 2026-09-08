const express = require('express');
const http = require('http');
const {
  NAMED_LIBRARY_FRAGMENT_EXAMPLES,
  deriveImportedTitle
} = require('../../services/importTitleService');
const { buildLegacyContentRouter } = require('../legacyContentRoutes');

const saveArticle = async (body, { stored = null, fetchReadableArticle } = {}) => {
  const saved = [];
  const Article = {
    findOne: async () => stored,
    findOneAndUpdate: async (query, data) => {
      const set = { ...data };
      delete set.$setOnInsert;
      const article = {
        ...(stored || {}),
        ...(stored ? {} : data.$setOnInsert),
        ...set,
        _id: 'article-1',
        url: query.url,
        userId: 'user-1'
      };
      saved.push({ query, data, article });
      return article;
    }
  };

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
    queueEmbeddingDelete: () => {},
    /* Never reach the network from a test; the default is the real fetcher,
       which goes through the public-URL guard. */
    fetchReadableArticle: fetchReadableArticle
      || (async () => ({ ok: false, content: '', error: 'not fetched' }))
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
    return { status: response.status, body: await response.json(), saved };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

describe('save-article title hygiene', () => {
  test('rewrites the three observed fragment titles at capture', async () => {
    for (const example of NAMED_LIBRARY_FRAGMENT_EXAMPLES) {
      const result = await saveArticle({
        title: example.before,
        url: example.url,
        content: example.content,
        author: example.author,
        publicationDate: example.publishedAt
      });
      expect(result.status).toBe(200);
      expect(result.body.title).toBe(example.after);
      expect(result.saved[0].article.title).toBe(example.after);
    }
  });

  test('keeps a durable title', async () => {
    const result = await saveArticle({
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

/* An agent saves a title and a URL and calls it filed. The body it never sent is
   the article the reader came for, and until this route fetched one itself the
   Library kept the highlights and lost the piece. */
describe('save-article body', () => {
  const body = paragraphs => paragraphs.map(text => `<p>${text}</p>`).join('\n');
  const longEnough = 'Founder mode is the claim that the person who started the thing should keep touching it. '.repeat(6);

  test('fetches the article body when the caller sends none', async () => {
    const result = await saveArticle(
      { title: 'Going Founder Mode on Cancer', url: 'https://centuryofbio.com/p/sid' },
      { fetchReadableArticle: async ({ url }) => ({ ok: true, url, title: 'Going Founder Mode on Cancer', content: `${longEnough}\n\nSecond block.`, error: '' }) }
    );
    expect(result.status).toBe(200);
    expect(result.body.contentSource).toBe('fetched');
    expect(result.body.content).toContain('<p>');
    expect(result.body.content).toContain('Second block.');
  });

  test('escapes fetched text rather than trusting it as markup', async () => {
    const result = await saveArticle(
      { title: 'Sharp text', url: 'https://example.com/sharp' },
      { fetchReadableArticle: async ({ url }) => ({ ok: true, url, title: 'Sharp text', content: `<script>alert(1)</script> ${longEnough}`, error: '' }) }
    );
    expect(result.body.content).not.toContain('<script>');
    expect(result.body.content).toContain('&lt;script&gt;');
  });

  test('leaves the body empty when the fetch returns a stub', async () => {
    const result = await saveArticle(
      { title: 'Paywalled', url: 'https://example.com/paywalled' },
      { fetchReadableArticle: async ({ url }) => ({ ok: true, url, title: 'Paywalled', content: 'Subscribe to keep reading.', error: '' }) }
    );
    expect(result.status).toBe(200);
    expect(result.body.contentSource).toBe('missing');
    expect(result.body.content).toBe('');
  });

  /* A URL the guard refuses — a private address, a redirect into one — comes
     back as a failed read, not an exception, and must not lose the save. */
  test('a save that fails to fetch still files the article', async () => {
    const result = await saveArticle({ title: 'Offline', url: 'https://example.com/offline' });
    expect(result.status).toBe(200);
    expect(result.body.contentSource).toBe('missing');
    expect(result.body.title).toBe('Offline');
  });

  test('a partial re-save does not erase the body, author or filing already held', async () => {
    const stored = {
      content: body(['The piece the extension captured.']),
      author: 'Elliot Hershberg',
      siteName: 'Century of Biology',
      publicationDate: '2026-09-01',
      folder: 'folder-1'
    };
    const result = await saveArticle(
      { title: 'Going Founder Mode on Cancer', url: 'https://centuryofbio.com/p/sid' },
      { stored }
    );
    expect(result.status).toBe(200);
    expect(result.body.content).toBe(stored.content);
    expect(result.body.author).toBe('Elliot Hershberg');
    expect(result.body.siteName).toBe('Century of Biology');
    expect(result.body.publicationDate).toBe('2026-09-01');
    expect(result.body.folder).toBe('folder-1');
    expect(result.body.contentSource).toBe('existing');
    const written = result.saved[0].data;
    expect(written).not.toHaveProperty('content');
    expect(written).not.toHaveProperty('author');
    expect(written).not.toHaveProperty('folder');
  });

  test('an explicit folder choice still moves the article', async () => {
    const result = await saveArticle(
      { title: 'Filed', url: 'https://example.com/filed', content: 'Body.', folderId: 'uncategorized' },
      { stored: { content: 'Body.', folder: 'folder-1' } }
    );
    expect(result.saved[0].data.folder).toBeNull();
    expect(result.body.folder).toBeNull();
  });

  test('supplied content wins over the stored body', async () => {
    const result = await saveArticle(
      { title: 'Rewritten', url: 'https://example.com/rewritten', content: 'The fuller text.' },
      { stored: { content: 'A stub.' } }
    );
    expect(result.body.content).toBe('The fuller text.');
    expect(result.body.contentSource).toBe('request');
  });
});
