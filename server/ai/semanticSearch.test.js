jest.mock('./embed', () => ({ embedText: jest.fn(async () => [0.6, 0.8]) }));

const { embedText } = require('./embed');
const { similarToSource } = require('./semanticSearch');
const { encodeVector } = require('./vectorStore');

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
