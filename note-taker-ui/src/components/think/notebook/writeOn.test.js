import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { dimmedWordCount, handleWriteOnKey, undoStash } from './writeOn';
import { readySavedTrialMarks } from '../../../utils/notebookSavedTrialMarks';
import { normalizeNotebookWorkingState, turnWordings } from '../../../utils/notebookWorkbench';

const BlockId = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [{ types: ['paragraph'], attributes: { blockId: { default: null } } }];
  }
});

const paragraph = (blockId, text) => ({ type: 'paragraph', attrs: { blockId }, content: [{ type: 'text', text }] });

/* A workbench the way the editor holds one: state, and an update that folds. */
const bench = (state = {}) => {
  const workbench = { state: normalizeNotebookWorkingState(state) };
  workbench.update = (change) => { workbench.state = change(workbench.state); };
  return workbench;
};

const key = (props) => ({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, preventDefault: jest.fn(), ...props });

describe('Write_On on a real editor', () => {
  let editor;
  let ids;
  const mount = (...blocks) => {
    editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, BlockId], content: { type: 'doc', content: blocks } });
  };
  const context = (workbench, extra = {}) => ({
    workbench, savedMarks: [], createId: () => `id-${(ids += 1)}`, onReceipt: jest.fn(), onChange: jest.fn(), ...extra
  });

  beforeEach(() => { ids = 0; });
  afterEach(() => editor?.destroy());

  it('dims the sentence at the caret, keeps it on the page, and brings it back', () => {
    mount(paragraph('p1', 'Keep this. Maybe cut this. Keep that.'));
    const workbench = bench();
    const ctx = context(workbench);
    editor.commands.setTextSelection(16);

    expect(handleWriteOnKey(editor, key({ ctrlKey: true, key: '.' }), ctx)).toBe(true);
    expect(workbench.state.dimmed).toEqual([expect.objectContaining({ blockId: 'p1', text: 'Maybe cut this.' })]);
    expect(editor.getText()).toBe('Keep this. Maybe cut this. Keep that.');
    expect(dimmedWordCount(editor.state.doc, workbench.state.dimmed)).toBe(3);
    expect(ctx.onChange).toHaveBeenCalled();

    handleWriteOnKey(editor, key({ ctrlKey: true, key: '.' }), ctx);
    expect(workbench.state.dimmed).toEqual([]);
  });

  it('dims exactly the selection', () => {
    mount(paragraph('p1', 'One two three four.'));
    const workbench = bench();
    editor.commands.setTextSelection({ from: 5, to: 14 });

    handleWriteOnKey(editor, key({ ctrlKey: true, key: '.' }), context(workbench));

    expect(workbench.state.dimmed.map(item => item.text)).toEqual(['two three']);
  });

  it('dims the occurrence you selected when the words repeat, and toggles that one back', () => {
    mount(paragraph('p1', 'Keep this word, drop this word.'));
    const workbench = bench();
    const ctx = context(workbench);
    editor.commands.setTextSelection({ from: 27, to: 31 });

    handleWriteOnKey(editor, key({ ctrlKey: true, key: '.' }), ctx);
    expect(workbench.state.dimmed).toEqual([expect.objectContaining({ text: 'word', offset: 26 })]);

    handleWriteOnKey(editor, key({ ctrlKey: true, key: '.' }), ctx);
    expect(workbench.state.dimmed).toEqual([]);
  });

  it('keeps a passage too long for the scratchpad on the page', () => {
    mount(paragraph('p1', 'x'.repeat(30001)), paragraph('p2', 'Short.'));
    const workbench = bench();
    const ctx = context(workbench);
    editor.commands.setTextSelection(2);

    handleWriteOnKey(editor, key({ ctrlKey: true, shiftKey: true, key: 'x' }), ctx);

    expect(editor.getText({ blockSeparator: '|' })).toBe(`${'x'.repeat(30001)}|Short.`);
    expect(workbench.state.looseThoughts).toEqual([]);
    expect(ctx.onReceipt).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('sets a paragraph aside and puts it back exactly on undo', () => {
    mount(paragraph('p1', 'First.'), paragraph('p2', 'An aside.'), paragraph('p3', 'Last.'));
    const workbench = bench();
    const ctx = context(workbench);
    editor.commands.setTextSelection(12);

    handleWriteOnKey(editor, key({ ctrlKey: true, shiftKey: true, key: 'X' }), ctx);

    expect(editor.getText({ blockSeparator: '|' })).toBe('First.|Last.');
    expect(workbench.state.looseThoughts.map(item => item.text)).toEqual(['An aside.']);
    const receipt = ctx.onReceipt.mock.calls[0][0];
    expect(receipt.type).toBe('stash');

    expect(undoStash(editor, workbench, receipt)).toBe(true);
    expect(editor.getText({ blockSeparator: '|' })).toBe('First.|An aside.|Last.');
    expect(workbench.state.looseThoughts).toEqual([]);
  });

  it('keeps the passage in the scratchpad when the page changed after setting it aside', () => {
    mount(paragraph('p1', 'First.'), paragraph('p2', 'An aside.'));
    const workbench = bench();
    const ctx = context(workbench);
    editor.commands.setTextSelection(12);
    handleWriteOnKey(editor, key({ ctrlKey: true, shiftKey: true, key: 'x' }), ctx);
    editor.commands.insertContentAt(1, 'New ');

    expect(undoStash(editor, workbench, ctx.onReceipt.mock.calls[0][0])).toBe(false);
    expect(workbench.state.looseThoughts).toHaveLength(1);
  });

  it('turns an underlined passage through its wordings in place, and back', () => {
    mount(paragraph('p1', 'It was plain.'));
    const target = { blockId: 'p1', offset: 7, baseText: 'It was plain.', scope: 'word', rangeStart: 7, rangeEnd: 12 };
    const workbench = bench({ trials: [{ id: 't1', target, alternative: 'clear' }, { id: 't2', target, alternative: 'obvious' }] });
    const marks = () => readySavedTrialMarks(editor, workbench.state.trials);
    const turn = (step) => {
      editor.commands.setTextSelection(marks()[0].from + 1);
      return handleWriteOnKey(editor, key({ altKey: true, key: step > 0 ? 'ArrowDown' : 'ArrowUp' }), context(workbench, { savedMarks: marks() }));
    };

    expect(turn(1)).toBe(true);
    expect(editor.getText()).toBe('It was clear.');
    turn(1);
    expect(editor.getText()).toBe('It was obvious.');
    turn(1);
    expect(editor.getText()).toBe('It was plain.');
    turn(-1);
    expect(editor.getText()).toBe('It was obvious.');
    expect(workbench.state.trials.map(trial => trial.alternative).sort()).toEqual(['clear', 'plain']);
  });

  it('leaves ordinary keys and carets outside a passage to the editor', () => {
    mount(paragraph('p1', 'Nothing underlined.'));
    const ctx = context(bench());
    const event = key({ altKey: true, key: 'ArrowDown' });

    expect(handleWriteOnKey(editor, event, ctx)).toBe(false);
    expect(handleWriteOnKey(editor, key({ metaKey: true, ctrlKey: true, key: '.' }), ctx)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('turnWordings', () => {
  it('is a ring: turning forward then back returns every wording to its place', () => {
    const target = { blockId: 'p1', baseText: 'A' };
    const trials = [{ id: 't1', target, alternative: 'B' }, { id: 't2', target, alternative: 'C' }];
    const forward = turnWordings(trials, `p1:paragraph:0:0:A:wording`, 1);
    expect(forward.wording).toBe('B');
    expect(forward.trials.map(trial => trial.alternative)).toEqual(['C', 'A']);
    const back = turnWordings(forward.trials, `p1:paragraph:0:0:B:wording`, -1);
    expect(back.wording).toBe('A');
    expect(back.trials.map(trial => trial.alternative)).toEqual(['B', 'C']);
  });
});
