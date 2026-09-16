import {
  citationTargetsForMaterial,
  normalizeNotebookWorkingState,
  replaceEditorTargetText,
  sourceNodeForMaterial,
  targetFromEditor
} from './notebookWorkbench';

const editorFor = ({ blockId = 'p1', currentText = 'Current words' } = {}) => {
  const node = { attrs: { blockId }, textContent: currentText, nodeSize: currentText.length + 2, content: { size: currentText.length }, isTextblock: true };
  const scrollIntoView = jest.fn(function scroll() { return this; });
  const tr = { insertText: jest.fn(() => tr), scrollIntoView };
  const dispatch = jest.fn();
  return {
    state: {
      selection: { $from: { parent: node, parentOffset: 4 } },
      doc: { descendants: callback => callback(node, 3) },
      tr
    },
    view: { dispatch },
    commands: { setTextSelection: jest.fn(), focus: jest.fn() }
  };
};

describe('notebook workbench model', () => {
  it('finds every active citation for one staged source', () => {
    const doc = { type: 'doc', content: [
      { type: 'highlightRef', attrs: { blockId: 'quote-1', highlightId: 'highlight-1', articleId: 'article-1' } },
      { type: 'paragraph', attrs: { blockId: 'body' } },
      { type: 'highlightRef', attrs: { blockId: 'quote-2', highlightId: 'highlight-2', articleId: 'article-1' } }
    ] };
    expect(citationTargetsForMaterial(doc, { kind: 'article', articleId: 'article-1' })).toEqual(['quote-1', 'quote-2']);
    expect(citationTargetsForMaterial(doc, { kind: 'highlight', highlightId: 'highlight-2' })).toEqual(['quote-2']);
  });
  it('captures stable block identity rather than a DOM range', () => {
    expect(targetFromEditor(editorFor())).toEqual({ blockId: 'p1', offset: 4, baseText: 'Current words' });
  });

  it('prevents a stale trial from replacing newer paragraph words', () => {
    const editor = editorFor({ currentText: 'Newer words' });
    const result = replaceEditorTargetText(editor, { blockId: 'p1', baseText: 'Older words' }, 'Trial words');
    expect(result.status).toBe('stale');
    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });

  it('commits through a transaction only when the target is current', () => {
    const editor = editorFor();
    const result = replaceEditorTargetText(editor, { blockId: 'p1', baseText: 'Current words' }, 'Trial words');
    expect(result.applied).toBe(true);
    expect(editor.state.tr.insertText).toHaveBeenCalledWith('Trial words', 4, 17);
    expect(editor.view.dispatch).toHaveBeenCalled();
  });

  it('allows distinct passages from the same article to keep distinct identities', () => {
    const first = sourceNodeForMaterial({ id: 'one', kind: 'highlight', highlightId: 'h1', articleId: 'a1', text: 'One' });
    const second = sourceNodeForMaterial({ id: 'two', kind: 'highlight', highlightId: 'h2', articleId: 'a1', text: 'Two' });
    expect(first.attrs.blockId).not.toBe(second.attrs.blockId);
    expect(first.attrs.highlightId).toBe('h1');
    expect(second.attrs.highlightId).toBe('h2');
  });

  it('normalizes missing private state with migration-compatible defaults', () => {
    expect(normalizeNotebookWorkingState()).toEqual({
      revision: 0, materials: [], trials: [], looseThoughts: [],
      nextTimeLine: { text: '', target: { blockId: '', offset: 0, baseText: '' }, updatedAt: null },
      continuity: { target: { blockId: '', offset: 0, baseText: '' }, scrollY: 0, updatedAt: null }
    });
  });
});
