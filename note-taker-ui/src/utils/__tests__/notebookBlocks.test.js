import { buildDocFromBlocks, serializeBlocksFromDoc } from '../notebookBlocks';

describe('notebookBlocks', () => {
  it('serializes highlight blocks from a doc', () => {
    const blocks = [
      { id: 'p1', type: 'paragraph', text: 'Hello' },
      { id: 'h1', type: 'highlight-ref', highlightId: 'hl-1', text: '' },
      { id: 't1', type: 'paragraph', text: 'Next' }
    ];
    const doc = buildDocFromBlocks(blocks);
    const serialized = serializeBlocksFromDoc(doc, () => 'fallback');
    expect(serialized).toEqual([
      { id: 'p1', type: 'paragraph', text: 'Hello' },
      { id: 'h1', type: 'highlight-ref', highlightId: 'hl-1', text: '' },
      { id: 't1', type: 'paragraph', text: 'Next' }
    ]);
  });
});
