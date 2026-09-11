import {
  deletePieceInDocument,
  groupDocPieces,
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
