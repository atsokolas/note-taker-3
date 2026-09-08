const express = require('express');
const http = require('http');
const { buildFeedbackHighlightRouter } = require('../feedbackHighlightRoutes');

/* Reaching one passage used to mean fetching every highlight the reader owns
   and searching the pile. This is the lookup it always looked like. */
describe('one highlight by its own id', () => {
  const VALID = '64f100000000000000000abc';

  const request = async (path, { rows = [], onPipeline } = {}) => {
    function ObjectId(value) { return { toString: () => String(value), _id: String(value) }; }
    ObjectId.isValid = value => /^[a-f\d]{24}$/i.test(String(value || ''));

    const app = express();
    app.use(express.json());
    app.use(buildFeedbackHighlightRouter({
      mongoose: { Types: { ObjectId } },
      authenticateToken: (req, _res, next) => { req.user = { id: '64f1000000000000000000ff' }; next(); },
      Feedback: {},
      Article: {
        aggregate: async (pipeline) => {
          if (onPipeline) onPipeline(pipeline);
          return rows;
        }
      },
      normalizeItemType: value => value,
      parseClaimId: value => value,
      normalizeTags: value => value,
      enqueueHighlightEmbedding: () => {},
      mapHighlightWithArticle: value => value
    }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      return { status: response.status, body: await response.json() };
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  };

  test('returns the highlight and the article holding it', async () => {
    let seen = null;
    const result = await request(`/api/highlights/${VALID}`, {
      rows: [{ _id: VALID, articleId: 'article-1', articleTitle: 'Going Founder Mode on Cancer', text: 'Proximity.' }],
      onPipeline: pipeline => { seen = pipeline; }
    });
    expect(result.status).toBe(200);
    expect(result.body.articleId).toBe('article-1');
    expect(result.body.text).toBe('Proximity.');
    // Scoped to the owner, and narrowed before the unwind rather than after it.
    expect(seen[0].$match.userId).toBeTruthy();
    expect(seen[0].$match['highlights._id']).toBeTruthy();
    expect(seen.some(stage => stage.$limit === 1)).toBe(true);
  });

  test('a highlight the reader does not have is a 404, not an empty body', async () => {
    const result = await request(`/api/highlights/${VALID}`, { rows: [] });
    expect(result.status).toBe(404);
    expect(result.body.error).toMatch(/not found/i);
  });

  test('a malformed id is refused before it reaches the database', async () => {
    let reached = false;
    const result = await request('/api/highlights/not-an-id', { onPipeline: () => { reached = true; } });
    expect(result.status).toBe(400);
    expect(reached).toBe(false);
  });
});
