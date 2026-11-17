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
const CONCEPT = 'dddddddddddddddddddddddd';
const QUESTION = 'eeeeeeeeeeeeeeeeeeeeeeee';

const start = async () => {
  const app = express();
  app.use(buildRecallRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: USER }; next(); },
    Article: model([{ _id: ARTICLE, title: 'Base rates', content: 'Start from the base rate before the story.', highlights: [{ _id: 'h1', text: 'Interviews predict little about hiring.', note: 'Remember for the hiring loop.' }, { _id: 'h2', text: 'The story comes after the rate.', note: 'A guess of mine.', pencil: { agent: 'Codex' } }], updatedAt: new Date() }]),
    NotebookEntry: model([{ _id: NOTE, title: 'Hiring', content: 'Hire for slope, not intercept, when hiring engineers.', pencil: { agent: 'Claude Code' }, updatedAt: new Date() }]),
    TagMeta: model([{ _id: CONCEPT, name: 'Base rates', description: 'Start from how often things like this usually go.', updatedAt: new Date() }]),
    WikiPage: model([]),
    Question: model([{ _id: QUESTION, text: 'Do work samples predict hiring better than interviews?', settledBy: 'A year of hires scored both ways.', updatedAt: new Date() }])
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

  it('names the agent that wrote a hit still in pencil, and nothing for the reader\'s own', async () => {
    const body = await fetch(`${url}/api/recall?q=hiring`).then(res => res.json());
    const byId = Object.fromEntries(body.results.map(hit => [hit.id, hit]));
    expect(byId[NOTE].pencil).toBe('Claude Code');
    expect(byId[ARTICLE].pencil).toBeUndefined();
    expect((await fetch(`${url}/api/recall/read/${NOTE}`).then(res => res.json())).pencil).toBe('Claude Code');
  });

  it('keeps an agent\'s mark on the reader\'s article in pencil when read in full', async () => {
    const { text: fullText, pencil } = await fetch(`${url}/api/recall/read/${ARTICLE}`).then(res => res.json());
    expect(pencil).toBeUndefined();
    expect(fullText).toContain("(In pencil, by Codex) The story comes after the rate. Codex's note: A guess of mine.");
    expect(fullText).toContain('Your note: Remember for the hiring loop.');
  });

  it('finds the questions the reader is still asking', async () => {
    const body = await fetch(`${url}/api/recall?q=hiring`).then(res => res.json());
    expect(body.results.find(hit => hit.id === QUESTION)).toMatchObject({ kind: 'question' });
    expect((await fetch(`${url}/api/recall/read/${QUESTION}`).then(res => res.json())).text).toMatch(/Settled by: A year of hires/);
  });

  it('briefs an agent on a topic by kind, what is in pencil set apart', async () => {
    const brief = await fetch(`${url}/api/brief?topic=hiring`).then(res => res.json());
    expect(brief.topic).toBe('hiring');
    expect(brief.pencil.map(hit => hit.id)).toEqual([NOTE]);
    expect(brief.highlight[0]).toMatchObject({ id: ARTICLE, highlightId: 'h1' });
    expect(brief.question[0].id).toBe(QUESTION);
    expect(brief.note).toBeUndefined();
  });

  it('with no topic, briefs an agent on where the reader stands', async () => {
    const brief = await fetch(`${url}/api/brief`).then(res => res.json());
    expect(Object.keys(brief)).toEqual(['topic', 'view', 'question', 'pencil', 'article']);
    expect(brief.question[0]).toMatchObject({ kind: 'question', title: 'Do work samples predict hiring better than interviews?' });
    expect(brief.pencil).toContainEqual(expect.objectContaining({ kind: 'note', id: NOTE, pencil: 'Claude Code' }));
  });

  it('asks for a question', async () => {
    expect((await fetch(`${url}/api/recall?q=%20`)).status).toBe(400);
  });

  it('reads one of the reader\'s own things in full, and nothing else', async () => {
    const note = await fetch(`${url}/api/recall/read/${NOTE}`).then(res => res.json());
    expect(note).toMatchObject({ kind: 'note', id: NOTE, title: 'Hiring' });
    const concept = await fetch(`${url}/api/recall/read/${CONCEPT}`).then(res => res.json());
    expect(concept).toMatchObject({ kind: 'concept', title: 'Base rates' });
    expect((await fetch(`${url}/api/recall/read/cccccccccccccccccccccccc`)).status).toBe(404);
  });
});
