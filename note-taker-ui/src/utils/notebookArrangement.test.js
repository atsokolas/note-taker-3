import {
  deletePieceInDocument,
  groupDocPieces,
  hydrateAsidePieces,
  isSourceBoundNode,
  movePieceInDocument,
  openingLine,
  pieceIndexForNode,
  restorePieceInDocument,
  setAsidePieceInDocument
} from './notebookArrangement';

const paragraph = (text, blockId = text) => ({
  type: 'paragraph',
  attrs: { blockId },
  content: [{ type: 'text', text }]
});

const sourceQuote = (text, title = 'A source') => ({
  type: 'blockquote',
  attrs: {
    blockId: `quote-${text}`,
    articleId: 'article-1',
    articleTitle: title,
    sourcePath: '/library?articleId=article-1#passage=exact'
  },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
});

const essayDoc = {
  type: 'doc',
  content: [
    paragraph('Recoverable mistakes belong to the person who can still put things back.', 'rule'),
    paragraph('The exception is when the downside lands on someone who never chose the experiment.', 'exception'),
    sourceQuote('The cost is borne by people who did not volunteer.'),
    paragraph('Who gets to experiment, and who pays?', 'close')
  ]
};

describe('notebookArrangement', () => {
  it('labels pieces by their actual opening lines', () => {
    const pieces = groupDocPieces(essayDoc);
    expect(pieces.map((piece) => piece.label)).toEqual([
      'Recoverable mistakes belong to the person who can still put things back.',
      'The exception is when the downside lands on someone who never chose the experiment.',
      'Who gets to experiment, and who pays?'
    ]);
  });

  it('keeps a source quotation attached to the authored paragraph it follows', () => {
    const pieces = groupDocPieces(essayDoc);
    expect(pieces).toHaveLength(3);
    expect(pieces[1].nodes).toHaveLength(2);
    expect(isSourceBoundNode(pieces[1].nodes[1])).toBe(true);
    expect(pieceIndexForNode(essayDoc, 2)).toBe(1);
  });

  it('moves the exception before the rule without dropping its citation', () => {
    const result = movePieceInDocument(essayDoc, 1, 'up');
    expect(result.moved).toBe(true);
    expect(result.doc.content.map((node) => node.attrs.blockId)).toEqual([
      'exception',
      'quote-The cost is borne by people who did not volunteer.',
      'rule',
      'close'
    ]);
    expect(groupDocPieces(result.doc)[0].nodes).toHaveLength(2);
  });

  it('restores the previous document as one meaningful undo', () => {
    const moved = movePieceInDocument(essayDoc, 1, 'up');
    const undone = movePieceInDocument(moved.doc, moved.toIndex, 'down');
    expect(undone.doc.content.map((node) => node.attrs.blockId))
      .toEqual(essayDoc.content.map((node) => node.attrs.blockId));
  });

  it('sets a passage aside by name and restores it to the same place', () => {
    const removed = setAsidePieceInDocument(essayDoc, 1);
    expect(removed.aside.label).toMatch(/^The exception is when/);
    expect(removed.doc.content.map((node) => node.attrs.blockId)).toEqual(['rule', 'close']);
    const restored = restorePieceInDocument(removed.doc, removed.aside);
    expect(restored.doc.content.map((node) => node.attrs.blockId))
      .toEqual(essayDoc.content.map((node) => node.attrs.blockId));
  });

  it('restores a later passage after the citation that belongs to the preceding prose', () => {
    const removed = setAsidePieceInDocument(essayDoc, 2);
    expect(removed.aside.index).toBe(2);
    expect(removed.doc.content.map((node) => node.attrs.blockId)).toEqual([
      'rule',
      'exception',
      'quote-The cost is borne by people who did not volunteer.'
    ]);
    const restored = restorePieceInDocument(removed.doc, removed.aside);
    expect(restored.doc.content.map((node) => node.attrs.blockId))
      .toEqual(essayDoc.content.map((node) => node.attrs.blockId));
    expect(groupDocPieces(restored.doc)[1].nodes).toHaveLength(2);
  });

  it('keeps original node JSON, including marks, while a passage is set aside', () => {
    const marked = {
      type: 'paragraph',
      attrs: { blockId: 'marked' },
      content: [{
        type: 'text',
        text: 'linked',
        marks: [
          { type: 'bold' },
          { type: 'link', attrs: { href: 'https://example.com' } }
        ]
      }]
    };
    const code = {
      type: 'codeBlock',
      attrs: { language: 'js' },
      content: [{ type: 'text', text: 'const a = 1;' }]
    };
    const doc = { type: 'doc', content: [marked, code] };
    const removed = setAsidePieceInDocument(doc, 0);
    expect(removed.aside.nodes[0]).toEqual(marked);
    const restored = restorePieceInDocument(removed.doc, removed.aside);
    expect(restored.doc.content[0]).toEqual(marked);
    expect(restored.doc.content[1]).toEqual(code);
  });

  it('hydrates a legacy aside that only stored lossy blocks', () => {
    const pieces = hydrateAsidePieces([{
      id: 'old',
      label: 'Old opening',
      index: 1,
      blocks: [{ id: 'p1', type: 'paragraph', text: 'Hello' }]
    }]);
    expect(pieces[0].nodes[0]).toMatchObject({
      type: 'paragraph',
      attrs: { blockId: 'p1' },
      content: [{ type: 'text', text: 'Hello' }]
    });
  });

  it('deletes a passage without keeping a secret offcut', () => {
    const result = deletePieceInDocument(essayDoc, 1);
    expect(result.deleted).toBe(true);
    expect(result.doc.content.map((node) => node.attrs.blockId)).toEqual(['rule', 'close']);
    expect(result).not.toHaveProperty('aside');
  });

  it('shortens long opening lines without inventing a heading', () => {
    expect(openingLine('A'.repeat(110))).toMatch(/A{99}…/);
  });
});
