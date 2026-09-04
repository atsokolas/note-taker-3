const express = require('express');
const { buildConceptQuestionBoardRouter } = require('../conceptQuestionBoardRoutes');

/**
 * A question is an open loop, and what makes it a loop rather than a mood is
 * that something could close it. The composer asks for that at the door, so
 * the write path has to carry it — and carry its absence without inventing a
 * value or quietly erasing one already there.
 *
 * describe/it on purpose: server/ has two test idioms, and the node-style one
 * is wired into npm scripts a path at a time. Only the describe suites are
 * discovered, so only they are actually run.
 */

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

describe('what would settle a question, on the way to the database', () => {
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

  it('carries the settle condition through, trimmed', async () => {
    const res = await send('/api/questions', 'POST', {
      text: '  Does the capex cycle outlast the hardware?  ',
      settledBy: '  Two quarters of guidance in the same direction  '
    });
    expect(res.status).toBe(201);
    expect(created[0].text).toBe('Does the capex cycle outlast the hardware?');
    expect(created[0].settledBy).toBe('Two quarters of guidance in the same direction');
  });

  /* Catching the question is the urgent half. A reader who does not yet know
     what would settle it must not be stopped at the door. */
  it('takes a question that has nothing to settle it yet', async () => {
    const res = await send('/api/questions', 'POST', { text: 'What am I missing?' });
    expect(res.status).toBe(201);
    expect(created[0].settledBy).toBe('');
  });

  it('lets one be named later', async () => {
    await send('/api/questions/q1', 'PUT', { settledBy: ' A filing that says otherwise ' });
    expect(updates[0].settledBy).toBe('A filing that says otherwise');
  });

  /* Saving the question body must not wipe the settle condition, so a request
     that says nothing about it leaves it alone. */
  it('leaves an untouched settle condition where it is', async () => {
    await send('/api/questions/q1', 'PUT', { status: 'answered' });
    expect('settledBy' in updates[0]).toBe(false);
  });
});
