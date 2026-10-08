const { retrievePassages, __testables: { queryTerms, stripImportChrome } } = require('../agentRetrieval');

// A stand-in for a Mongoose model: every query resolves to the given rows,
// and $text is supported so the lexical path is the one under test.
const model = (rows = [], total = rows.length) => ({
  find: jest.fn((filter) => {
    const ids = filter?._id?.$in;
    const result = ids ? rows.filter(row => ids.includes(String(row._id))) : rows;
    const query = {
      select: () => query,
      sort: () => query,
      limit: () => query,
      lean: async () => result
    };
    return query;
  }),
  countDocuments: jest.fn(async () => total)
});

const article = (id, title, content, highlights = []) => ({ _id: id, title, content, highlights, updatedAt: new Date('2026-01-01') });

const library = () => ({
  Article: model([
    article('sleep', 'Sleep debt and decisions', 'Tired people make worse decisions because fatigue narrows attention to the default option. A tired manager approves what is in front of them.'),
    article('meetings', 'The hidden cost of meetings', 'An hour-long meeting with eight people costs a full working day. People rarely count it.'),
    article('checklists', 'Why checklists beat expertise', 'Procedure handles the predictable so judgment can be spent on the unpredictable.', [
      { _id: 'h1', text: 'The resistance to checklists is mostly about identity.', note: 'Same with code review checklists on my team.' }
    ])
  ], 40),
  NotebookEntry: model([]),
  TagMeta: model([])
});

describe('retrievePassages', () => {
  it('drops the words that frame a question and keeps the ones that say what it is about', () => {
    expect(queryTerms('What have I saved about tired people making worse decisions?'))
      .toEqual(['tired', 'people', 'making', 'worse', 'decisions']);
    expect(queryTerms('Connect this to anything else I have saved.')).toEqual([]);
  });

  it('returns the passage that answers, not every source that shares a word', async () => {
    const results = await retrievePassages({
      userId: 'u1',
      query: 'Find what I saved about tired people making worse decisions.',
      models: library()
    });
    expect(results.map(item => item.id)).toEqual(['sleep']);
    expect(results[0].snippet).toMatch(/Tired people make worse decisions/);
  });

  it('finds what the reader wrote in the margin', async () => {
    const results = await retrievePassages({ userId: 'u1', query: 'What did I note about code review?', models: library() });
    expect(results.map(item => item.id)).toEqual(['checklists']);
    expect(results[0].fullText).toMatch(/Your note: Same with code review checklists/);
  });

  it('returns nothing when nothing in the library bears on the question', async () => {
    expect(await retrievePassages({ userId: 'u1', query: 'What did I save about the French Revolution?', models: library() }))
      .toEqual([]);
  });

  it('searches by the source in hand when the question names nothing, and looks past that source', async () => {
    const results = await retrievePassages({
      userId: 'u1',
      query: 'Connect this to anything else.',
      about: 'Tired people decisions fatigue',
      excludeId: 'meetings',
      models: library()
    });
    expect(results.map(item => item.id)).toEqual(['sleep']);
  });

  it('lets a source found only by meaning join the answer', async () => {
    const semanticSearch = jest.fn(async () => [
      { type: 'article', objectId: 'meetings', subId: 'passage:v1:0', score: 0.91 },
      { type: 'article', objectId: 'checklists', subId: '', score: 0.42 }
    ]);
    const results = await retrievePassages({
      userId: 'u1',
      query: 'Why does my calendar feel so expensive?',
      models: library(),
      semanticSearch
    });
    expect(semanticSearch).toHaveBeenCalledWith(expect.objectContaining({ types: ['article', 'highlight', 'notebook_entry'] }));
    expect(results.map(item => item.id)).toEqual(['meetings']);
  });

  it('falls back to lexical results when embeddings fail', async () => {
    const results = await retrievePassages({
      userId: 'u1',
      query: 'tired people making worse decisions',
      models: library(),
      semanticSearch: async () => { throw new Error('AI_DISABLED'); }
    });
    expect(results.map(item => item.id)).toEqual(['sleep']);
  });

  it('finds a passage near the end of a long source', async () => {
    const filler = Array.from({ length: 60 }, (_, index) => `Paragraph ${index} discusses quarterly planning in general terms without any particular claim.`).join(' ');
    const long = article('long', 'A long essay', `${filler.repeat(4)} The decisive finding is that gardeners overwater seedlings.`);
    const results = await retrievePassages({
      userId: 'u1',
      query: 'overwater seedlings',
      models: { Article: model([long]), NotebookEntry: model([]), TagMeta: model([]) }
    });
    expect(results[0]).toMatchObject({ id: 'long' });
    expect(results[0].fullText).toMatch(/overwater seedlings/);
  });

  it('strips import preambles so they are never quoted as the author', () => {
    expect(stripImportChrome('Name: Strategy Notes URL: https://example.com/strategy The useful passage explains it.'))
      .toBe('The useful passage explains it.');
  });
});
