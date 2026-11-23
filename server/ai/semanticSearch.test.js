jest.mock('./embed', () => ({
  embedText: jest.fn(async () => [0.6, 0.8]),
  embedTexts: jest.fn(async texts => texts.map(() => [0.6, 0.8])),
  isEmbeddingConfigured: jest.fn(() => true)
}));

const { embedText, embedTexts, isEmbeddingConfigured } = require('./embed');
const { similarToSource, marginNotes, answerTo, beforeYouStart, echoOf, heardBefore, addedBy } = require('./semanticSearch');
const { encodeVector, rawCosineToAtlasScore } = require('./vectorStore');

const userId = '64b000000000000000000001';
const conceptId = '64b000000000000000000002';
const stored = { embedding: encodeVector([1, 0]), contentHash: 'h' };

const vectorsWith = (rows) => {
  const VectorItem = {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => stored }) })),
    aggregate: jest.fn(async () => rows)
  };
  return VectorItem;
};

describe('similarToSource', () => {
  beforeEach(() => embedText.mockClear());

  it('reads a note block as the whole note it is stored under', async () => {
    const VectorItem = vectorsWith([{ objectType: 'highlight', objectId: 'h1', score: 0.9 }]);
    const rows = await similarToSource({
      userId, objectType: 'notebook_block', objectId: 'n1', subId: 'block-1', limit: 3, models: { VectorItem }
    });
    expect(VectorItem.findOne.mock.calls[0][0]).toMatchObject({ objectType: 'notebook_entry', objectId: 'n1', subId: '' });
    expect(rows.map(row => row.objectId)).toEqual(['h1']);
    expect(embedText).not.toHaveBeenCalled();
  });

  it('asks with a concept\'s name and description, since a concept has no vector of its own', async () => {
    const VectorItem = vectorsWith([{ objectType: 'highlight', objectId: 'h2', score: 0.8 }]);
    const TagMeta = { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ name: 'Moats', description: 'What keeps rivals out.' }) }) })) };
    const rows = await similarToSource({
      userId, objectType: 'concept', objectId: conceptId, limit: 3, types: ['highlight'], models: { VectorItem, TagMeta }
    });
    expect(embedText).toHaveBeenCalledWith('Moats. What keeps rivals out.');
    expect(VectorItem.findOne).not.toHaveBeenCalled();
    expect(rows.map(row => row.objectId)).toEqual(['h2']);
  });

  it('finds nothing for a concept it cannot read', async () => {
    const VectorItem = vectorsWith([{ objectId: 'h3' }]);
    const TagMeta = { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) };
    expect(await similarToSource({ userId, objectType: 'concept', objectId: conceptId, models: { VectorItem, TagMeta } })).toEqual([]);
    expect(embedText).not.toHaveBeenCalled();
  });
});

describe('marginNotes', () => {
  const here = '64b0000000000000000000a1';
  const there = '64b0000000000000000000a2';
  const hid = n => `64b0000000000000000000${String(n).padStart(2, '0')}`;
  const long = 'A checklist is not a crutch for the inexpert but a net for the expert who forgets the obvious step.';
  const paragraph = 'Surgeons resisted written checklists for years, insisting that judgment and memory were enough in the operating room.';
  const score = cosine => rawCosineToAtlasScore(cosine);
  const held = {
    [hid(1)]: { _id: hid(1), text: long, articleId: there, articleTitle: 'The Checklist Manifesto', createdAt: '2026-03-04T00:00:00Z' },
    [hid(2)]: { _id: hid(2), text: 'Too short to stand alone.', articleId: there, articleTitle: 'Elsewhere' },
    [hid(3)]: { _id: hid(3), text: `${long} Also from here.`, articleId: here, articleTitle: 'This one' },
    [hid(4)]: { _id: hid(4), text: 'Pilots adopted the checklist after a prototype bomber crashed on its first demonstration flight.', articleId: there, articleTitle: 'The Checklist Manifesto' }
  };
  const models = (rowsFor) => ({
    VectorItem: { aggregate: jest.fn(async () => rowsFor()) },
    Article: {
      aggregate: jest.fn(async ([match]) => match.$match['highlights._id'].$in.map(id => held[String(id)]).filter(Boolean)),
      findOne: () => ({ select: () => ({ lean: async () => ({ title: 'This one' }) }) })
    }
  });
  const row = (n, cosine, articleId = there) => ({ objectType: 'highlight', objectId: hid(n), score: score(cosine), metadata: { articleId } });

  beforeEach(() => {
    embedTexts.mockClear();
    isEmbeddingConfigured.mockReturnValue(true);
  });

  it('pairs a paragraph with the closest passage marked in another source', async () => {
    const notes = await marginNotes({
      userId, articleId: here, paragraphs: ['Short.', paragraph], models: models(() => [row(1, 0.8)])
    });
    expect(embedTexts).toHaveBeenCalledWith([paragraph]);
    expect(notes).toEqual([expect.objectContaining({
      paragraph: 1,
      relation: 'close',
      highlight: expect.objectContaining({ _id: hid(1), articleTitle: 'The Checklist Manifesto', text: long })
    })]);
  });

  it('never quotes the article back to itself, even when the index is stale', async () => {
    const notes = await marginNotes({
      userId, articleId: here, paragraphs: [paragraph],
      models: models(() => [row(3, 0.9, here), row(3, 0.9, there)])
    });
    expect(notes).toEqual([]);
  });

  it('treats another saved copy of the same work as the work being read', async () => {
    held[hid(6)] = { ...held[hid(4)], _id: hid(6), articleTitle: 'This One (Full Article)' };
    const notes = await marginNotes({
      userId, articleId: here, paragraphs: [paragraph], models: models(() => [row(6, 0.85), row(1, 0.65)])
    });
    expect(notes.map(note => note.highlight._id)).toEqual([hid(1)]);
  });

  it('does not ask about a short line of dialogue', async () => {
    const said = '“You have to live with yourself and what you do,” she says. “Because there is a higher authority.”';
    expect(await marginNotes({ userId, articleId: here, paragraphs: [said], models: models(() => [row(1, 0.9)]) })).toEqual([]);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it('holds back weak matches, short highlights and the same passage saved twice', async () => {
    held[hid(5)] = { ...held[hid(1)], _id: hid(5), text: paragraph };
    const notes = await marginNotes({
      userId, articleId: here, paragraphs: [paragraph],
      models: models(() => [row(1, 0.6), row(2, 0.9), row(5, 0.9), row(4, 0.99)])
    });
    expect(notes).toEqual([]);
  });

  it('gives each paragraph one note and each passage one paragraph, strongest first, within the limit', async () => {
    let call = 0;
    const answers = [[row(1, 0.8), row(4, 0.78)], [row(1, 0.9)], [row(4, 0.75)]];
    const notes = await marginNotes({
      userId, articleId: here, paragraphs: [paragraph, paragraph, paragraph], limit: 2,
      models: models(() => answers[call++])
    });
    expect(notes.map(note => [note.paragraph, note.highlight._id])).toEqual([[0, hid(4)], [1, hid(1)]]);
  });

  it('is silent without a provider, without a long enough paragraph, or for passages already in the note', async () => {
    const vectors = models(() => [row(1, 0.9)]);
    isEmbeddingConfigured.mockReturnValue(false);
    expect(await marginNotes({ userId, paragraphs: [paragraph], models: vectors })).toEqual([]);
    isEmbeddingConfigured.mockReturnValue(true);
    expect(await marginNotes({ userId, paragraphs: ['Only a few words here.'], models: vectors })).toEqual([]);
    expect(await marginNotes({ userId, paragraphs: [paragraph], excludeHighlightIds: [hid(1)], models: vectors })).toEqual([]);
    expect(embedTexts).toHaveBeenCalledTimes(1);
  });
});

describe('answerTo', () => {
  const hid = n => `64b0000000000000000000${String(n).padStart(2, '0')}`;
  const question = { _id: hid(10), note: 'Why did he build the roads before the parks?', createdAt: '2026-06-01T00:00:00Z' };
  const passage = 'The parkways were built to carry cars out of the city, and the parks were what the cars were driven to.';
  const held = {
    [hid(1)]: { _id: hid(1), text: passage, articleId: 'a1', articleTitle: 'The Power Broker', createdAt: '2026-07-01T00:00:00Z' },
    [hid(2)]: { _id: hid(2), text: `${passage} Marked long before.`, articleId: 'a2', articleTitle: 'Earlier', createdAt: '2026-01-01T00:00:00Z' },
    [hid(3)]: { _id: hid(3), text: 'Roads first.', articleId: 'a1', articleTitle: 'Too short', createdAt: '2026-07-02T00:00:00Z' },
    [hid(4)]: { _id: hid(4), text: `${passage} Saved again.`, articleId: 'a3', articleTitle: 'The Power Broker (Full Article)', createdAt: '2026-01-01T00:00:00Z' }
  };
  const models = rows => ({
    VectorItem: vectorsWith(rows),
    Article: { aggregate: jest.fn(async ([match]) => match.$match['highlights._id'].$in.map(id => held[String(id)]).filter(Boolean)) }
  });
  const row = (n, cosine) => ({ objectType: 'highlight', objectId: hid(n), score: rawCosineToAtlasScore(cosine) });

  it('answers with the closest passage marked since the question, from its own vector', async () => {
    embedText.mockClear();
    const answer = await answerTo({ userId, question, models: models([row(2, 0.8), row(3, 0.75), row(1, 0.7)]) });
    expect(answer).toMatchObject({ _id: hid(1), text: passage, articleTitle: 'The Power Broker' });
    expect(embedText).not.toHaveBeenCalled();
  });

  it('stays silent under the margin floor', async () => {
    expect(await answerTo({ userId, question, models: models([row(1, 0.6)]) })).toBeNull();
  });

  it('echoes a passage with nearly the same thought marked in another work months apart, and only that', async () => {
    const mark = { _id: hid(11), text: passage, bookId: 'a1', createdAt: '2026-07-01T00:00:00Z' };
    expect(await echoOf({ userId, mark, models: models([row(1, 0.9), row(2, 0.8)]) })).toMatchObject({ _id: hid(2), articleTitle: 'Earlier' });
    expect(await echoOf({ userId, mark, models: models([row(2, 0.7)]) })).toBeNull();
    expect(await echoOf({ userId, mark: { ...mark, createdAt: '2026-02-15T00:00:00Z' }, models: models([row(2, 0.8)]) })).toBeNull();
    expect(await echoOf({ userId, mark: { ...mark, text: 'Roads first, then parks.' }, models: models([row(2, 0.9)]) })).toBeNull();
  });

  it('hears a line just typed against other works, and with echo only what you marked nearly the same a year ago', async () => {
    embedText.mockClear();
    const line = 'The roads came first, and the parks were simply where the cars were meant to go.';
    const now = Date.parse('2027-02-01T00:00:00Z');
    expect(await heardBefore({ userId, text: line, bookId: 'a1', now, models: models([row(1, 0.9), row(2, 0.65)]) })).toMatchObject({ _id: hid(2), articleTitle: 'Earlier' });
    expect(embedText).toHaveBeenCalledWith(line);
    expect(await heardBefore({ userId, text: line, bookId: 'a9', echo: true, now, models: models([row(1, 0.8), row(2, 0.8)]) })).toMatchObject({ _id: hid(2) });
    expect(await heardBefore({ userId, text: line, bookId: 'a9', echo: true, now, models: models([row(2, 0.65)]) })).toBeNull();
    expect(await heardBefore({ userId, text: 'Too short to ask.', bookId: 'a9', models: models([row(2, 0.9)]) })).toBeNull();
  });

  it('before you start a book, finds what you marked in other works by its title and author', async () => {
    embedText.mockClear();
    isEmbeddingConfigured.mockReturnValue(true);
    const book = { _id: 'a1', title: 'The Power Broker', author: 'Robert Caro' };
    const found = await beforeYouStart({ userId, book, models: models([row(1, 0.9), row(4, 0.8), row(3, 0.7), row(2, 0.6)]) });
    expect(embedText).toHaveBeenCalledWith('The Power Broker, by Robert Caro');
    expect(found.map(passage => passage.articleTitle)).toEqual(['Earlier']);
    expect(await beforeYouStart({ userId, book: { ...book, _id: 'a9' }, models: models([row(2, 0.5)]) })).toEqual([]);
  });
});

describe('addedBy', () => {
  const here = '64b0000000000000000000a1';
  const there = '64b0000000000000000000a2';
  const book = '64b0000000000000000000a3';
  const id = n => `64b0000000000000000000${String(n).padStart(2, '0')}`;
  const score = cosine => rawCosineToAtlasScore(cosine);
  const quote = 'A checklist is not a crutch for the inexpert but a net for the expert who forgets the obvious step.';
  const held = {
    [id(1)]: { _id: id(1), text: quote, articleId: there, articleTitle: 'The Checklist Manifesto', createdAt: '2026-03-04T00:00:00Z' },
    [id(2)]: { _id: id(2), text: '', note: 'Why do experts skip the obvious step?', articleId: book, articleTitle: 'Better' },
    [id(3)]: { _id: id(3), text: `${quote} Again.`, articleId: there, articleTitle: 'Checklists (Full Article)' }
  };
  const chain = value => ({ select: () => ({ limit: () => ({ lean: async () => value }), lean: async () => value }) });
  const modelsFor = (rows, { marked = [{ embedding: encodeVector([1, 0]) }], title = 'This one' } = {}) => {
    const VectorItem = {
      find: jest.fn(filter => chain(filter.objectType === 'highlight' ? marked : [{ embedding: encodeVector([0, 1]) }])),
      countDocuments: jest.fn(async () => marked.length),
      aggregate: jest.fn(async () => rows)
    };
    return {
      VectorItem,
      Article: {
        findOne: () => chain({ title }),
        aggregate: jest.fn(async ([match]) => match.$match['highlights._id'].$in.map(key => held[String(key)]).filter(Boolean))
      },
      Question: { find: jest.fn(() => chain([{ _id: id(5), text: 'When does scale stop helping?' }])) },
      WikiPage: { find: jest.fn(() => chain([{ _id: id(6), title: 'Checklists', claims: [
        { claimId: 'c1', text: 'Checklists catch what memory drops on a long and busy day.', sourceRefIds: ['s1', 's2'] },
        { claimId: 'c2', text: 'A retired sentence that once said checklists slow surgeons down.', sourceRefIds: ['s1', 's2'], checkInStatus: 'retired' }
      ] }])) }
    };
  };
  const highlight = (n, cosine, articleId = there) => ({ objectType: 'highlight', objectId: id(n), score: score(cosine), metadata: { articleId } });

  it('names what a source echoes, the questions it answers and the page it belongs on, from stored vectors', async () => {
    embedText.mockClear();
    const models = modelsFor([
      highlight(1, 0.8),
      highlight(1, 0.7),
      highlight(2, 0.7, book),
      { objectType: 'question', objectId: id(5), score: score(0.66), metadata: {} },
      { objectType: 'wiki_claim', objectId: `${id(6)}:c1`, score: score(0.75), metadata: { pageId: id(6), claimId: 'c1' } },
      { objectType: 'wiki_claim', objectId: `${id(6)}:c2`, score: score(0.95), metadata: { pageId: id(6), claimId: 'c2' } },
      highlight(4, 0.6),
      highlight(1, 0.99)
    ]);
    const added = await addedBy({ userId, articleId: here, models });
    expect(added.map(({ kind, key }) => [kind, key])).toEqual([
      ['echo', `highlight:${id(1)}`],
      ['belongs', `wiki_page:${id(6)}`],
      ['answers', `highlight:${id(2)}`],
      ['answers', `question:${id(5)}`]
    ]);
    expect(added[0].to).toMatchObject({ type: 'highlight', articleId: there, title: 'The Checklist Manifesto', quote });
    expect(added[1].to).toMatchObject({ type: 'wiki_page', title: 'Checklists', quote: 'Checklists catch what memory drops on a long and busy day.' });
    expect(added[2].to.quote).toBe('Why do experts skip the obvious step?');
    expect(embedText).not.toHaveBeenCalled();
    expect(models.VectorItem.aggregate).toHaveBeenCalledTimes(1);
    expect(models.VectorItem.aggregate.mock.calls[0][0][0].$vectorSearch.limit).toBe(7);
  });

  it('asks with the source\'s own text when nothing in it is marked, and never offers the same work back', async () => {
    const models = modelsFor([highlight(3, 0.8), highlight(1, 0.8, here)], { marked: [], title: 'Checklists' });
    expect(await addedBy({ userId, articleId: here, models })).toEqual([]);
    expect(models.VectorItem.find.mock.calls.map(([filter]) => filter.objectType)).toEqual(['highlight', 'article']);
  });

  it('never offers the same words twice', async () => {
    const added = await addedBy({ userId, articleId: here, models: modelsFor([
      highlight(1, 0.8),
      highlight(3, 0.7)
    ]) });
    expect(added.map(({ key }) => key)).toEqual([`highlight:${id(1)}`]);
  });

  it('offers the model the strongest six of each kind, down to a low floor', async () => {
    const works = [7, 8, 9, 10, 11, 12, 13, 14];
    Object.assign(held, ...works.map(n => ({ [id(n)]: { _id: id(n), text: `${quote} ${n}`, articleId: there, articleTitle: `Work ${n}` } })));
    const added = await addedBy({ userId, articleId: here, models: modelsFor([...works.slice(0, 7).map((n, at) => highlight(n, 0.5 - at / 100)), highlight(14, 0.29)]) });
    expect(added.map(connection => connection.to.title)).toEqual(['Work 7', 'Work 8', 'Work 9', 'Work 10', 'Work 11', 'Work 12']);
  });
});
