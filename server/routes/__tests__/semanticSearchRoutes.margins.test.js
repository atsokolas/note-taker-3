const express = require('express');
const { buildSemanticSearchRouter } = require('../semanticSearchRoutes');

/* The margins door: one question per person and text, kept for a while; any
   failure is an empty answer rather than an error the page would have to
   explain. */

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const build = ({ marginNotes, now = () => 0 }) => {
  const app = express();
  app.use(express.json());
  app.use(buildSemanticSearchRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'u1' }; next(); },
    parseCsvList: () => [],
    normalizeConnectionItemType: value => value,
    marginNotes,
    now
  }));
  return app;
};

const post = async (server, body) => {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/semantic/margins`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
};

describe('POST /api/semantic/margins', () => {
  let server;
  afterEach(() => new Promise(resolve => (server ? server.close(resolve) : resolve())));

  it('answers with the engine\'s notes and keeps them for the same article', async () => {
    const note = { paragraph: 2, relation: 'close', highlight: { _id: 'h1', text: 'Words', articleId: 'a2' } };
    const marginNotes = jest.fn(async () => [note]);
    let clock = 0;
    server = await listen(build({ marginNotes, now: () => clock }));
    const body = { articleId: 'a1', paragraphs: ['one', 'two', 'three'] };
    expect(await post(server, body)).toEqual({ status: 200, body: { notes: [note] } });
    expect(marginNotes).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', articleId: 'a1', paragraphs: body.paragraphs, limit: 5
    }));
    await post(server, body);
    expect(marginNotes).toHaveBeenCalledTimes(1);
    clock = 31 * 60 * 1000;
    await post(server, body);
    expect(marginNotes).toHaveBeenCalledTimes(2);
  });

  it('is an empty answer, not an error, when the engine cannot run', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const marginNotes = jest.fn(async () => { throw new Error('No embedding provider is configured.'); });
    server = await listen(build({ marginNotes }));
    expect(await post(server, { paragraphs: ['a paragraph'] })).toEqual({ status: 200, body: { notes: [] } });
    await post(server, { paragraphs: ['a paragraph'] });
    expect(marginNotes).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
