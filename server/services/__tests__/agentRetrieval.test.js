const { retrievePassages, readSource, readStandingContext, __testables: { queryTerms, stem, stripImportChrome } } = require('../agentRetrieval');

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

  it('compares a word with its inflections: a search for "trusting" finds "trust"', () => {
    expect(new Set(['trust', 'trusted', 'trusting', 'trusts'].map(stem)).size).toBe(1);
    expect(stem('decisions')).toBe(stem('decision'));
    expect(stem('imagining')).toBe(stem('imagine'));
    expect(stem('rates')).toBe(stem('rate'));
    expect(stem('created')).toBe(stem('create'));
    expect(stem('shared')).toBe(stem('share'));
    // A short word keeps its e: rate is not rat, note is not not.
    expect(stem('rate')).not.toBe(stem('rat'));
    expect(stem('note')).not.toBe(stem('not'));
    // Short words keep their endings: "red" and "thing" are words, not inflections.
    expect(stem('thing')).toBe('thing');
    expect(stem('need')).toBe('need');
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

  it('needs both words of a short question, unless the model is searching and will judge what comes back', async () => {
    const ask = forModel => retrievePassages({ userId: 'u', query: 'limits of expertise', forModel, models: library() });
    expect(await ask(false)).toEqual([]);
    expect((await ask(true)).map(hit => hit.id)).toEqual(['checklists']);
    // ...and a reader is never served it without the model's judgment.
    expect((await ask(true))[0].servable).toBe(false);
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

  it('meets new reading with a view the reader holds', async () => {
    const WikiPage = model([{
      _id: 'view1',
      title: 'Late decisions',
      judgment: {
        currentJudgment: 'I decide as well at midnight as in the morning.',
        why: [{ text: 'My late calls have mostly held up.' }],
        falsifiers: [{ text: 'Tired decisions I later reverse.', status: 'unobserved' }, { text: 'Retired worry.', status: 'retired' }]
      }
    }]);
    const results = await retrievePassages({
      userId: 'u1',
      query: 'Connect this.',
      about: 'Tired decisions at midnight',
      models: { ...library(), WikiPage }
    });
    const view = results.find(item => item.id === 'view1');
    expect(view.held).toBe('I decide as well at midnight as in the morning.');
    expect(view.fullText).toMatch(/^You hold: .*\nWhy: My late calls.*\nWhat would change your mind: Tired decisions/s);
    expect(view.fullText).not.toMatch(/Retired worry/);
    expect(WikiPage.find).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', status: { $ne: 'archived' } }));
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

  it('reads the page a held view lives on', async () => {
    const one = row => ({ findOne: () => ({ select: () => ({ lean: async () => row }) }) });
    const id = 'a'.repeat(24);
    const source = await readSource({
      userId: 'u1',
      id,
      models: {
        Article: one(null),
        NotebookEntry: one(null),
        WikiPage: one({ _id: id, title: 'Late decisions', plainText: 'The page body.', judgment: { currentJudgment: 'I decide well at midnight.' } })
      }
    });
    expect(source).toMatchObject({ type: 'wiki_page', id, title: 'Late decisions' });
    expect(source.fullText).toBe('You hold: I decide well at midnight.\n\nThe page body.');
  });

  it('strips import preambles so they are never quoted as the author', () => {
    expect(stripImportChrome('Name: Strategy Notes URL: https://example.com/strategy The useful passage explains it.'))
      .toBe('The useful passage explains it.');
  });

  it('carries a few held views and the last sources saved, with no suppressed source', async () => {
    const filters = {};
    const capture = (name, rows) => ({
      find: (filter) => {
        filters[name] = filter;
        const query = { sort: () => query, limit: () => query, select: () => query, lean: async () => rows };
        return query;
      }
    });
    const standing = await readStandingContext({
      userId: 'u1',
      models: {
        WikiPage: capture('views', [
          { judgment: { currentJudgment: '  Compute   stays scarce through 2027. ' } },
          { judgment: { currentJudgment: '' } }
        ]),
        Article: capture('sources', [
          { title: 'Costco and the membership model', author: 'Ben Carlson' },
          { title: 'Untitled clip', siteName: '' }
        ])
      }
    });
    expect(standing).toEqual({
      views: ['Compute stays scarce through 2027.'],
      sources: ['Costco and the membership model, Ben Carlson', 'Untitled clip']
    });
    expect(filters.views['judgment.status'].$nin).toEqual(expect.arrayContaining(['parked', 'closed', 'archived']));
    expect(filters.sources).toMatchObject({ hiddenFromHome: { $ne: true }, debugOnly: { $ne: true }, archived: { $ne: true } });
  });
});
