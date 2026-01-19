import { buildDocFromBlocks, serializeBlocksFromDoc } from '../notebookBlocks';

describe('notebookBlocks', () => {
  it('serializes highlight blocks from a doc', () => {
    const blocks = [
      { id: 'p1', type: 'paragraph', text: 'Hello' },
      { id: 'h1', type: 'highlight_embed', highlightId: 'hl-1', text: '' },
      { id: 'a1', type: 'article_ref', articleId: 'ar-1', articleTitle: 'Article', text: 'Article' },
      { id: 'c1', type: 'concept_ref', conceptName: 'Compounding', text: 'Compounding' },
      { id: 'q1', type: 'question_ref', questionId: 'q-1', questionText: 'Why?', text: 'Why?' },
      { id: 't1', type: 'paragraph', text: 'Next' }
    ];
    const doc = buildDocFromBlocks(blocks);
    const serialized = serializeBlocksFromDoc(doc, () => 'fallback');
    expect(serialized).toEqual([
      { id: 'p1', type: 'paragraph', text: 'Hello' },
      { id: 'h1', type: 'highlight_embed', highlightId: 'hl-1', text: '' },
      { id: 'a1', type: 'article_ref', articleId: 'ar-1', articleTitle: 'Article', text: 'Article' },
      { id: 'c1', type: 'concept_ref', conceptName: 'Compounding', text: 'Compounding' },
      { id: 'q1', type: 'question_ref', questionId: 'q-1', questionText: 'Why?', text: 'Why?' },
      { id: 't1', type: 'paragraph', text: 'Next' }
    ]);
  });
});
