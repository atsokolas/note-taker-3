const express = require('express');
const { buildConceptQuestionBoardRouter } = require('../conceptQuestionBoardRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

describe('a requested Library look, on the way to the database', () => {
  let server;
  let url;
  let created;
  let updates;

  beforeEach(async () => {
    created = [];
    updates = [];
    const Question = {
      create: async (doc) => { created.push(doc); return { _id: 'q1', ...doc }; },
      findOneAndUpdate: async (_filter, payload) => { updates.push(payload); return { _id: 'q1', ...payload }; }
    };
    const app = express();
    app.use(express.json());
    app.use(buildConceptQuestionBoardRouter({
      authenticateToken: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
      Question,
      enqueueQuestionEmbedding: () => {},
      createBlockId: () => 'block-1'
    }));
    server = await listen(app);
    url = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => { server?.close(); });

  const send = async (path, method, body) => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };

  it('stores a finished look against the wording that was asked', async () => {
    const res = await send('/api/questions/q1', 'PUT', {
      inquiry: {
        brief: '  Find an example that separates patience from avoidance.  ',
        run: {
          status: 'complete',
          boundQuestion: 'Who bears the downside?',
          boundBrief: 'Find an example that separates patience from avoidance.',
          passages: [{
            articleId: 'letter',
            title: 'Household letter',
            passage: 'Patience is not the same as avoidance.',
            href: '/library?articleId=letter'
          }]
        }
      }
    });
    expect(res.status).toBe(200);
    expect(updates[0].inquiry.brief).toBe('Find an example that separates patience from avoidance.');
    expect(updates[0].inquiry.scope).toBe('library');
    expect(updates[0].inquiry.run.status).toBe('complete');
    expect(updates[0].inquiry.run.boundQuestion).toBe('Who bears the downside?');
    expect(updates[0].inquiry.run.passages[0].passage).toBe('Patience is not the same as avoidance.');
  });

  it('does not persist an in-flight look as still looking', async () => {
    await send('/api/questions/q1', 'PUT', {
      inquiry: { brief: 'Find patience.', run: { status: 'looking', boundQuestion: 'Who bears the downside?' } }
    });
    expect(updates[0].inquiry.run.status).toBe('stopped');
  });

  it('leaves an untouched look where it is', async () => {
    await send('/api/questions/q1', 'PUT', { status: 'answered' });
    expect('inquiry' in updates[0]).toBe(false);
  });
});
