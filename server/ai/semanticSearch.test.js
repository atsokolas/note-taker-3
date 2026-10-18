jest.mock('./embed', () => ({
  embedText: jest.fn(async () => [0.6, 0.8]),
  embedTexts: jest.fn(async texts => texts.map(() => [0.6, 0.8])),
  isEmbeddingConfigured: jest.fn(() => true)
}));

const { embedText, embedTexts, isEmbeddingConfigured } = require('./embed');
const { similarToSource, marginNotes } = require('./semanticSearch');
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
