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
  countDocuments: jest.fn(async () => rows.length),
  // Stands in for one draw: the first marked passage of the first row.
  aggregate: jest.fn(async () => rows.flatMap(row => (row.highlights || []).slice(0, 1).map(mark => ({ _id: row._id, title: row.title, text: mark.text }))).slice(0, 1))
});

const USER = '0123456789abcdef01234567';
const NOTE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ARTICLE = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CONCEPT = 'dddddddddddddddddddddddd';
const QUESTION = 'eeeeeeeeeeeeeeeeeeeeeeee';

const citations = [];
const Citation = {
  create: jest.fn(async row => citations.push({ ...row, createdAt: new Date() })),
  find: jest.fn(({ sourceId }) => {
    const query = { sort: () => query, limit: () => query, lean: async () => citations.filter(row => row.sourceId === sourceId) };
    return query;
  })
};

const checks = [{ _id: 'c1', question: 'What have I written about hiring?', expects: [NOTE] }, { _id: 'c2', question: 'What did I save about sourdough?', expects: [ARTICLE] }];
const RecallCheck = {
  find: jest.fn(() => {
    const query = { sort: () => query, lean: async () => checks };
    return query;
  }),
  create: jest.fn(async row => ({ _id: 'c3', ...row }))
};

const verdicts = [
  { verdict: 'strike', kind: 'note', agent: 'Codex', title: 'Hiring, tidied', why: 'Too smooth; keep my words.', createdAt: new Date() },
  { verdict: 'ink', kind: 'highlight', agent: 'Claude Code', title: 'Base rates', why: '', createdAt: new Date() }
];
const Verdict = {
  aggregate: jest.fn(async () => [{ _id: 'strike', n: 3 }, { _id: 'ink', n: 9 }]),
  find: jest.fn(() => {
    const query = { sort: () => query, limit: () => query, select: () => query, lean: async () => verdicts };
    return query;
  })
};

const Disagreement = {
  find: jest.fn(() => {
    const query = { sort: () => query, limit: () => query, lean: async () => [{ _id: 'd1', a: { agent: 'Codex', says: 'Interviews predict hiring well.' }, b: { agent: '', kind: 'view', says: 'Interviews predict hiring poorly.' }, createdAt: new Date() }] };
    return query;
  })
};

const start = async () => {
  const app = express();
  app.use(express.json());
  app.use(buildRecallRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: USER };
      if (req.get('x-agent')) req.agentToken = { id: 'tok', label: req.get('x-agent'), scopes: ['agent-write'] };
      next();
    },
    Citation,
    RecallCheck,
    Verdict,
    Disagreement,
    // The reader inked that the marked passage answers their question.
    Connection: model([{ fromType: 'article', fromId: ARTICLE, toType: 'question', toId: QUESTION, relationType: 'supports' }]),
    ConnectionJudgment: model([]),
    added: async ({ articleId, judge }) => (articleId === ARTICLE && (await judge({ pairs: [] })).length === 0
      ? [{ kind: 'answers', key: `question:${QUESTION}`, to: { type: 'question', id: QUESTION, title: 'Do work samples predict hiring better than interviews?' }, score: 0.8 }]
      : []),
    Article: model([{ _id: ARTICLE, title: 'Base rates', content: 'Start from the base rate before the story.', highlights: [{ _id: 'h1', text: 'Interviews predict little about hiring.', note: 'Remember for the hiring loop.', keptAt: new Date('2026-01-02T00:00:00Z') }, { _id: 'h2', text: 'The story comes after the rate.', note: 'A guess of mine.', pencil: { agent: 'Codex' } }], updatedAt: new Date() }]),
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

  it('asks recall the reader\'s own questions and says which it still answers with the source they named', async () => {
    const body = await fetch(`${url}/api/knows`).then(res => res.json());
    expect([body.found, body.of]).toEqual([1, 2]);
    expect(body.checks[0]).toMatchObject({ question: 'What have I written about hiring?', found: true });
    expect(body.checks[1]).toMatchObject({ found: false });
    const added = await fetch(`${url}/api/knows`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'Where did I read about base rates?', expects: [ARTICLE] }) });
    expect(await added.json()).toMatchObject({ found: true, rank: 1 });
    expect((await fetch(`${url}/api/knows`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'x' }) })).status).toBe(400);
  });

  it('records where an agent put the reader\'s note to work, and shows it on the note', async () => {
    const cite = (body, agent) => fetch(`${url}/api/cite`, { method: 'POST', headers: { 'content-type': 'application/json', ...(agent ? { 'x-agent': agent } : {}) }, body: JSON.stringify(body) });
    expect((await cite({ id: NOTE, where: 'PR #12: hiring rubric' }, 'Claude Code')).status).toBe(201);
    expect((await cite({ id: NOTE, where: 'a reply' })).status).toBe(403);
    expect((await cite({ id: NOTE, where: ' ' }, 'Claude Code')).status).toBe(400);
    expect((await cite({ id: 'ffffffffffffffffffffffff', where: 'x' }, 'Claude Code')).status).toBe(404);
    const { usedIn } = await fetch(`${url}/api/cite/${NOTE}`).then(res => res.json());
    expect(usedIn).toEqual([expect.objectContaining({ where: 'PR #12: hiring rubric', agent: 'Claude Code' })]);
  });

  it('answers a plain question from notes and marked passages, each with its kind', async () => {
    const body = await fetch(`${url}/api/recall?q=${encodeURIComponent('What have I written about hiring?')}`).then(res => res.json());
    const kinds = Object.fromEntries(body.results.map(hit => [hit.id, hit]));
    expect(kinds[NOTE].kind).toBe('note');
    expect(kinds[ARTICLE]).toMatchObject({ kind: 'highlight', highlightId: 'h1' });
    expect(kinds[NOTE].passage).toMatch(/slope/);
    // With what the reader inked it to, so the agent sees the connection and not the passage alone.
    expect(kinds[ARTICLE].connected).toEqual([{ relation: 'supports', kind: 'question', id: QUESTION }]);
    expect(kinds[NOTE].connected).toBeUndefined();
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
    expect(Object.keys(brief)).toEqual(['topic', 'handedToYou', 'kept', 'added', 'taste', 'disagreements', 'view', 'question', 'pencil', 'article']);
    // What the reader keeps for good comes before anything an agent might argue with.
    expect(brief.kept).toEqual([{ kind: 'highlight', id: ARTICLE, highlightId: 'h1', title: 'Base rates', passage: 'Interviews predict little about hiring.', keptAt: '2026-01-02T00:00:00.000Z' }]);
    // What the reading added this week, from what the model already judged: the brief never waits on a reading.
    expect(brief.added).toEqual([{ kind: 'article', id: ARTICLE, title: 'Base rates', added: { kind: 'answers', key: `question:${QUESTION}`, to: expect.objectContaining({ id: QUESTION }) } }]);
    // Two hands that cannot both be right are set out as a disagreement, not two facts.
    expect(brief.disagreements[0]).toMatchObject({ id: 'd1', a: { agent: 'Codex' }, b: { agent: '', kind: 'view' } });
    // What the reader keeps and strikes, with why, so no agent has to be told twice.
    expect(brief.taste).toMatchObject({ inked: 9, struck: 3 });
    expect(brief.taste.lately[0]).toMatchObject({ verdict: 'strike', agent: 'Codex', why: 'Too smooth; keep my words.' });
    expect(brief.taste.lately[1].why).toBeUndefined();
    expect(brief.question[0]).toMatchObject({ kind: 'question', title: 'Do work samples predict hiring better than interviews?' });
    expect(brief.pencil).toContainEqual(expect.objectContaining({ kind: 'note', id: NOTE, pencil: 'Claude Code' }));
  });

  it('draws a fortune from the reader\'s own passages, and says what fits tonight', async () => {
    const { fortune } = await fetch(`${url}/api/fortune`).then(res => res.json());
    expect(fortune).toEqual({ text: 'Interviews predict little about hiring.', title: 'Base rates', author: '', page: null });
    const { tonight } = await fetch(`${url}/api/tonight`).then(res => res.json());
    expect(tonight).toMatchObject({ articleId: ARTICLE, title: 'Base rates', minutes: 1 });
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
