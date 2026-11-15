const express = require('express');
const { buildRecallRouter } = require('../recallRoutes');

// Every query resolves to the given rows; enough for the route's own work.
const model = (rows = []) => ({
  find: jest.fn(() => {
    const query = { select: () => query, sort: () => query, limit: () => query, lean: async () => rows };
    return query;
  }),
  findOne: jest.fn((filter) => {
    const query = { select: () => query, lean: async () => rows.find(row => String(row._id) === String(filter._id)) || null };
    return query;
  }),
  countDocuments: jest.fn(async () => rows.length)
});

const USER = '0123456789abcdef01234567';
const NOTE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ARTICLE = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const start = async () => {
  const app = express();
  app.use(buildRecallRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: USER }; next(); },
    Article: model([{ _id: ARTICLE, title: 'Base rates', content: 'Start from the base rate before the story.', highlights: [{ _id: 'h1', text: 'Interviews predict little about hiring.', note: 'Remember for the hiring loop.' }], updatedAt: new Date() }]),
    NotebookEntry: model([{ _id: NOTE, title: 'Hiring', content: 'Hire for slope, not intercept, when hiring engineers.', updatedAt: new Date() }]),
    TagMeta: model([]),
    WikiPage: model([])
  }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
};

describe('recall routes', () => {
  let server; let url;
  beforeAll(async () => { ({ server, url } = await start()); });
  afterAll(() => server.close());

  it('answers a plain question from notes and marked passages, each with its kind', async () => {
    const body = await fetch(`${url}/api/recall?q=${encodeURIComponent('What have I written about hiring?')}`).then(res => res.json());
    const kinds = Object.fromEntries(body.results.map(hit => [hit.id, hit]));
    expect(kinds[NOTE].kind).toBe('note');
    expect(kinds[ARTICLE]).toMatchObject({ kind: 'highlight', highlightId: 'h1' });
    expect(kinds[NOTE].passage).toMatch(/slope/);
  });

  it('asks for a question', async () => {
    expect((await fetch(`${url}/api/recall?q=%20`)).status).toBe(400);
  });

  it('reads one of the reader\'s own things in full, and nothing else', async () => {
    const note = await fetch(`${url}/api/recall/read/${NOTE}`).then(res => res.json());
    expect(note).toMatchObject({ kind: 'note', id: NOTE, title: 'Hiring' });
    expect((await fetch(`${url}/api/recall/read/cccccccccccccccccccccccc`)).status).toBe(404);
  });
});
