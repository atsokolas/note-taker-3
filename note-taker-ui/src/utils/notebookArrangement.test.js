import {
  deletePieceInDocument,
  focusPieceInEditor,
  groupDocPieces,
  hydrateAsidePieces,
  isSourceBoundNode,
  movePieceInDocument,
  openingLine,
  persistableAsidePiece,
  pieceIndexForNode,
  pieceIndexForSelection,
  pieceIndexNearOffset,
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

  it('selects the passage the caret is in, not the first one by default', () => {
    const caret = (nodeIndex) => ({ $from: { index: () => nodeIndex } });
    expect(pieceIndexForSelection(essayDoc, caret(0))).toBe(0);
    expect(pieceIndexForSelection(essayDoc, caret(1))).toBe(1);
    expect(pieceIndexForSelection(essayDoc, caret(2))).toBe(1);
    expect(pieceIndexForSelection(essayDoc, caret(3))).toBe(2);
  });

  it('keeps the last passage selected when the caret sits after the essay', () => {
    expect(pieceIndexForSelection(essayDoc, { $from: { index: () => 4 } })).toBe(2);
    expect(pieceIndexForNode(essayDoc, 4)).toBe(2);
  });

  it('does not pretend the first passage is selected when the caret is elsewhere', () => {
    expect(pieceIndexForSelection(essayDoc, null)).toBeNull();
    expect(pieceIndexForSelection({ type: 'doc', content: [] }, { $from: { index: () => 0 } })).toBeNull();
  });

  it('picks the passage nearest the reading offset when the caret is not driving', () => {
    expect(pieceIndexNearOffset([10, 80, 240], 90)).toBe(1);
    expect(pieceIndexNearOffset([10, 80, 240], 0)).toBe(0);
    expect(pieceIndexNearOffset([], 40)).toBeNull();
  });

  it('places the caret at the start of the chosen passage', () => {
    const setTextSelection = jest.fn();
    const focus = jest.fn();
    const editor = {
      getJSON: () => essayDoc,
      state: {
        doc: {
          forEach: (fn) => fn(essayDoc.content[3], 11, 3)
        }
      },
      commands: { setTextSelection, focus }
    };
    expect(focusPieceInEditor(editor, 2)).toBe(true);
    expect(setTextSelection).toHaveBeenCalledWith(12);
    expect(focus).toHaveBeenCalled();
  });

  it('selects an atom passage as a node after it moves, not the following text', () => {
    const divider = { type: 'horizontalRule', attrs: { blockId: 'hr-1' } };
    const after = paragraph('Who pays?', 'after');
    const doc = { type: 'doc', content: [divider, after] };
    const setNodeSelection = jest.fn();
    const setTextSelection = jest.fn();
    const focus = jest.fn();
    const editor = {
      getJSON: () => doc,
      state: {
        doc: {
          forEach: (fn) => fn({ ...divider, isAtom: true, isLeaf: true }, 0, 0)
        }
      },
      commands: { setNodeSelection, setTextSelection, focus }
    };
    expect(focusPieceInEditor(editor, 0)).toBe(true);
    expect(setNodeSelection).toHaveBeenCalledWith(0);
    expect(setTextSelection).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
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

  it('persists a set-aside as editor nodes, not a second blocks copy', () => {
    const removed = setAsidePieceInDocument(essayDoc, 1);
    const payload = persistableAsidePiece(removed.aside);
    expect(payload.nodes).toEqual(removed.aside.nodes);
    expect(payload.blocks).toBeUndefined();
  });

  it('still recovers a legacy aside that only stored lossy blocks', () => {
    const removed = setAsidePieceInDocument(essayDoc, 1);
    const recovered = hydrateAsidePieces([{
      id: removed.aside.id,
      label: removed.aside.label,
      index: removed.aside.index,
      blocks: [
        {
          id: 'exception',
          type: 'paragraph',
          text: 'The exception is when the downside lands on someone who never chose the experiment.'
        },
        {
          id: 'quote-The cost is borne by people who did not volunteer.',
          type: 'quote',
          sourcePath: '/library?articleId=article-1#passage=exact',
          articleId: 'article-1',
          articleTitle: 'A source',
          text: 'The cost is borne by people who did not volunteer.'
        }
      ]
    }]);
    expect(recovered[0].nodes.map((node) => node.attrs.blockId)).toEqual([
      'exception',
      'quote-The cost is borne by people who did not volunteer.'
    ]);
    const restored = restorePieceInDocument(removed.doc, recovered[0]);
    expect(restored.doc.content.map((node) => node.attrs.blockId))
      .toEqual(essayDoc.content.map((node) => node.attrs.blockId));
  });

  it('keeps a set-aside code block as editor nodes', () => {
    const code = {
      type: 'codeBlock',
      attrs: { language: 'js', blockId: 'code-1' },
      content: [{ type: 'text', text: 'const a = 1;' }]
    };
    const doc = { type: 'doc', content: [paragraph('Rule.', 'rule'), code] };
    const removed = setAsidePieceInDocument(doc, 1);
    const payload = persistableAsidePiece(removed.aside);
    expect(payload.nodes).toEqual([code]);
    expect(payload.blocks).toBeUndefined();
    const recovered = hydrateAsidePieces([{
      id: payload.id,
      label: payload.label,
      index: payload.index,
      nodes: payload.nodes
    }]);
    const restored = restorePieceInDocument(removed.doc, recovered[0]);
    expect(restored.doc.content[1]).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'js', blockId: 'code-1' },
      content: [{ type: 'text', text: 'const a = 1;' }]
    });
  });

  it('keeps a wiki reference attached to prose through a pre-nodes API', () => {
    const prose = paragraph('See the living page.', 'prose');
    const wiki = {
      type: 'wikiRef',
      attrs: {
        wikiId: 'wiki-1',
        wikiTitle: 'Experimentation',
        wikiMeta: 'Living wiki',
        blockId: 'wiki-ref-1'
      }
    };
    const doc = { type: 'doc', content: [prose, wiki] };
    expect(groupDocPieces(doc)).toHaveLength(1);
    const removed = setAsidePieceInDocument(doc, 0);
    const payload = persistableAsidePiece(removed.aside);
    expect(payload.nodes).toEqual([prose, wiki]);
    expect(payload.blocks).toBeUndefined();
    const recovered = hydrateAsidePieces([{
      id: payload.id,
      label: payload.label,
      index: payload.index,
      nodes: payload.nodes
    }]);
    const restored = restorePieceInDocument(removed.doc, recovered[0]);
    expect(restored.doc.content[1]).toEqual(wiki);
  });

  it('keeps an isolated wiki reference and a divider through a pre-nodes API', () => {
    const wiki = {
      type: 'wikiRef',
      attrs: { wikiId: 'wiki-2', wikiTitle: 'Who pays?', blockId: 'wiki-2' }
    };
    const divider = { type: 'horizontalRule', attrs: { blockId: 'hr-1' } };
    const wikiRemoved = setAsidePieceInDocument({ type: 'doc', content: [wiki, paragraph('After', 'after')] }, 0);
    const wikiPayload = persistableAsidePiece(wikiRemoved.aside);
    expect(wikiPayload.nodes).toEqual([wiki]);
    expect(wikiPayload.blocks).toBeUndefined();
    const wikiRecovered = hydrateAsidePieces([{
      id: wikiPayload.id,
      label: wikiPayload.label,
      index: wikiPayload.index,
      nodes: wikiPayload.nodes
    }]);
    expect(restorePieceInDocument(wikiRemoved.doc, wikiRecovered[0]).doc.content[0].type).toBe('wikiRef');

    const dividerRemoved = setAsidePieceInDocument({ type: 'doc', content: [divider, paragraph('After', 'after')] }, 0);
    const dividerPayload = persistableAsidePiece(dividerRemoved.aside);
    expect(dividerPayload.nodes).toEqual([divider]);
    expect(dividerPayload.blocks).toBeUndefined();
    const dividerRecovered = hydrateAsidePieces([{
      id: dividerPayload.id,
      label: dividerPayload.label,
      index: dividerPayload.index,
      nodes: dividerPayload.nodes
    }]);
    expect(restorePieceInDocument(dividerRemoved.doc, dividerRecovered[0]).doc.content[0].type).toBe('horizontalRule');
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
