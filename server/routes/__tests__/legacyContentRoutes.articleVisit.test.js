const express = require('express');
const http = require('http');
const { buildLegacyContentRouter } = require('../legacyContentRoutes');

const MINUTE = 60 * 1000;

/* One open of GET /articles/:id against a stored article; returns what the
   reader was served and what was stamped. */
const openArticle = async (stored) => {
  const stamps = [];
  const Article = {
    findOne: () => ({
      select: () => ({ populate: () => ({ lean: async () => ({ _id: 'a1', title: 'Essay', ...stored }) }) })
    }),
    updateOne: async (_query, update, options) => { stamps.push({ update, options }); }
  };
  const app = express();
  app.use(buildLegacyContentRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'u1' }; next(); },
    mongoose: { Types: { ObjectId: String } },
    Note: {}, Folder: {}, Article,
    normalizeChecklist: (value) => value,
    normalizePdfs: (value) => value,
    enqueueArticleEmbedding: () => {},
    getFoldersWithCounts: async () => [],
    normalizeItemType: (value) => value,
    fetchReadableArticle: async () => ({ ok: false, content: '', error: 'not fetched' })
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/articles/a1`);
    return { body: await response.json(), set: stamps[0]?.update.$set, options: stamps[0]?.options };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

describe('opening an article stamps the visit', () => {
  test('a return after a gap serves when the last visit began, and begins a new one', async () => {
    const began = new Date(Date.now() - 3 * 24 * 60 * MINUTE);
    const { body, set, options } = await openArticle({
      visitStartedAt: began.toISOString(),
      lastOpenedAt: new Date(began.getTime() + 20 * MINUTE).toISOString()
    });
    expect(body.lastVisitAt).toBe(began.toISOString());
    expect(body).not.toHaveProperty('lastOpenedAt');
    expect(body).not.toHaveProperty('visitStartedAt');
    expect(set.previousVisitAt).toEqual(began.toISOString());
    expect(set.visitStartedAt).toBeInstanceOf(Date);
    expect(options).toEqual({ timestamps: false });
  });

  test('a reload within the visit keeps serving the same last visit', async () => {
    const previous = new Date(Date.now() - 2 * 24 * 60 * MINUTE).toISOString();
    const { body, set } = await openArticle({
      visitStartedAt: new Date(Date.now() - 5 * MINUTE).toISOString(),
      lastOpenedAt: new Date(Date.now() - 2 * MINUTE).toISOString(),
      previousVisitAt: previous
    });
    expect(body.lastVisitAt).toBe(previous);
    expect(set).not.toHaveProperty('previousVisitAt');
    expect(set.lastOpenedAt).toBeInstanceOf(Date);
  });

  test('a first open has no last visit', async () => {
    const { body, set } = await openArticle({});
    expect(body.lastVisitAt).toBeNull();
    expect(set.previousVisitAt).toBeNull();
  });

  test('an article opened before visits were kept falls back to its last open', async () => {
    const opened = new Date(Date.now() - 24 * 60 * MINUTE).toISOString();
    const { body } = await openArticle({ lastOpenedAt: opened });
    expect(body.lastVisitAt).toBe(opened);
  });
});
