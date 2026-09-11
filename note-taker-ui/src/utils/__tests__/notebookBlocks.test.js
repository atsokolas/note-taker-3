import { buildDocFromBlocks, serializeBlocksFromDoc } from '../notebookBlocks';

describe('notebookBlocks', () => {
  it('serializes highlight blocks from a doc', () => {
    const blocks = [
      { id: 'p1', type: 'paragraph', text: 'Hello' },
      { id: 'h1', type: 'highlight_embed', highlightId: 'hl-1', text: '' },
      { id: 'a1', type: 'article_ref', articleId: 'ar-1', articleTitle: 'Article', text: 'Article' },
      { id: 'c1', type: 'concept_ref', conceptId: null, conceptName: 'Compounding', text: 'Compounding' },
      { id: 'q1', type: 'question_ref', questionId: 'q-1', questionText: 'Why?', text: 'Why?' },
      { id: 't1', type: 'paragraph', text: 'Next' }
    ];
    const doc = buildDocFromBlocks(blocks);
    const serialized = serializeBlocksFromDoc(doc, () => 'fallback');
    expect(serialized).toEqual([
      { id: 'p1', type: 'paragraph', text: 'Hello' },
      { id: 'h1', type: 'highlight_embed', highlightId: 'hl-1', text: '' },
      { id: 'a1', type: 'article_ref', articleId: 'ar-1', articleTitle: 'Article', text: 'Article' },
      { id: 'c1', type: 'concept_ref', conceptId: null, conceptName: 'Compounding', text: 'Compounding' },
      { id: 'q1', type: 'question_ref', questionId: 'q-1', questionText: 'Why?', text: 'Why?' },
      { id: 't1', type: 'paragraph', text: 'Next' }
    ]);
  });

  it('round-trips a quoted Library passage with its exact provenance', () => {
    const blocks = [{
      id: 'quote-1',
      type: 'quote',
      text: 'The exact chosen passage.',
      articleId: 'article-1',
      articleTitle: 'A beautiful source',
      sourcePath: '/library?articleId=article-1#passage=exact'
    }];

    const doc = buildDocFromBlocks(blocks);
    expect(doc.content[0]).toEqual({
      type: 'blockquote',
      attrs: {
        blockId: 'quote-1',
        articleId: 'article-1',
        articleTitle: 'A beautiful source',
        sourcePath: '/library?articleId=article-1#passage=exact'
      },
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'The exact chosen passage.' }]
      }]
    });
    expect(serializeBlocksFromDoc(doc)).toEqual(blocks);
  });

  it('keeps an ordinary quote distinct from a saved highlight', () => {
    const blocks = [{ id: 'quote-1', type: 'quote', text: 'An authored quotation.' }];
    expect(serializeBlocksFromDoc(buildDocFromBlocks(blocks))).toEqual([
      { id: 'quote-1', type: 'quote', text: 'An authored quotation.' }
    ]);
  });

  it('round-trips an authored highlight snapshot as a quote without losing its source identity', () => {
    const blocks = [{
      id: 'source-highlight-1',
      type: 'highlight_embed',
      highlightId: 'highlight-1',
      text: 'The passage as it was when kept.',
      articleId: 'article-1',
      articleTitle: 'A beautiful source',
      sourcePath: '/library?articleId=article-1&highlightId=highlight-1'
    }];

    const doc = buildDocFromBlocks(blocks);
    expect(doc.content[0].type).toBe('blockquote');
    expect(doc.content[0].content[0].content[0].text).toBe(blocks[0].text);
    expect(serializeBlocksFromDoc(doc)).toEqual(blocks);
  });
});
