import {
  citationTargetsForMaterial,
  normalizeNotebookWorkingState,
  replaceEditorTargetText,
  sourceNodeForMaterial,
  targetFromEditor,
  selectionNotebookTarget,
  rememberNotebookHighlight,
  scopeNotebookTarget,
  notebookTargetText,
  notebookTrialText,
  notebookTrialKey
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

describe('wording scopes', () => {
  it('replaces a word at its exact block offset and keeps surrounding words', () => {
    const baseText = 'Expert guidance is available. Learning takes practice.';
    const scoped = scopeNotebookTarget({ blockId: 'p1', offset: 8, baseText }, 'word');
    expect(notebookTargetText(scoped)).toBe('guidance');
    expect(notebookTrialText(scoped, 'help')).toBe('Expert help is available. Learning takes practice.');
    const editor = editorFor({ currentText: baseText });
    expect(replaceEditorTargetText(editor, scoped, 'help').applied).toBe(true);
    expect(editor.state.tr.insertText).toHaveBeenCalledWith('help', 11, 19);
  });
  it('holds a sentence independently and refuses it after the block changes', () => {
    const baseText = 'First thought. A second thought.';
    const scoped = scopeNotebookTarget({ blockId: 'p1', offset: 19, baseText }, 'sentence');
    expect(notebookTargetText(scoped)).toBe('A second thought.');
    expect(notebookTrialText(scoped, 'Another possibility.')).toBe('First thought. Another possibility.');
    const editor = editorFor({ currentText: 'First thought. A newer thought.' });
    expect(replaceEditorTargetText(editor, scoped, 'Another possibility.').status).toBe('stale');
    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });
  it('keeps read tighter trials distinct from wording on the same paragraph', () => {
    const target = { blockId: 'p1', baseText: 'Same words' };
    expect(notebookTrialKey({ target, intent: 'tighter' })).not.toBe(notebookTrialKey({ target }));
  });
  it('keeps an exact highlighted range, including a repeated word and a unicode character', () => {
    const baseText = 'alpha beta alpha 🌊 end';
    const parent = { attrs: { blockId: 'p1' }, textContent: baseText, isTextblock: true };
    const select = (start, end) => selectionNotebookTarget({
      state: { selection: { empty: start === end, $from: { parent, parentOffset: start }, $to: { parent, parentOffset: end } } }
    });
    const second = select(11, 16);
    expect(notebookTargetText(second)).toBe('alpha');
    expect(second.scope).toBe('range');
    expect(second.rangeStart).toBe(11);
    const emoji = select(17, 19);
    expect(notebookTargetText(emoji)).toBe('🌊');
    expect(select(0, baseText.length).scope).toBeUndefined();
    const phrase = select(11, 16);
    const editorFocused = {
      isFocused: false,
      state: { selection: { empty: false, $from: { parent, parentOffset: 11 }, $to: { parent, parentOffset: 16 } } }
    };
    const wider = { ...phrase, rangeStart: 11, rangeEnd: 18 };
    expect(rememberNotebookHighlight(editorFocused, wider)).toEqual(wider);
    editorFocused.isFocused = true;
    expect(rememberNotebookHighlight(editorFocused, wider, { settled: false })).toEqual(wider);
    expect(notebookTargetText(rememberNotebookHighlight(editorFocused, wider))).toBe('alpha');
    editorFocused.state.selection.empty = true;
    expect(rememberNotebookHighlight(editorFocused, wider)).toBeNull();
    const other = { attrs: { blockId: 'p2' }, textContent: 'Elsewhere', isTextblock: true };
    expect(selectionNotebookTarget({
      state: { selection: { empty: false, $from: { parent, parentOffset: 0 }, $to: { parent: other, parentOffset: 4 } } }
    })).toBeNull();
    const editor = editorFor({ currentText: baseText });
    expect(replaceEditorTargetText(editor, second, 'word').applied).toBe(true);
    expect(editor.state.tr.insertText).toHaveBeenCalledWith('word', 15, 20);
    expect(notebookTrialText(second, 'word')).toBe('alpha beta word 🌊 end');
    expect(normalizeNotebookWorkingState({ trials: [{ id: 't', target: second, alternative: 'word' }] }).trials[0].target.scope).toBe('range');
  });
  it('never widens an invalid scoped range to a whole paragraph', () => {
    const editor = editorFor();
    expect(replaceEditorTargetText(editor, { blockId: 'p1', baseText: 'Current words', scope: 'word', rangeStart: 2, rangeEnd: 900 }, 'Changed').applied).not.toBe(true);
    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });
});
