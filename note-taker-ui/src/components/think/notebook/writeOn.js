import { countWords } from '../../../pages/thinkNotesModel';
import { replaceEditorTargetText, scopeNotebookTarget, targetFromEditor, turnWordings } from '../../../utils/notebookWorkbench';
import { locatePassage } from './notebookWorkbenchDecorations';

/* Three moves borrowed from Jason Fried's Write_On, kept on the keyboard so the
   hand never leaves the page: dim what you might cut, set a paragraph aside,
   and turn an underlined passage through its wordings where it stands. Control
   on every platform, as Write_On does; Write_On's Control-/ already opens
   arrangement here, so dimming takes the full stop. */
export const WRITE_ON_KEYS = [
  { keys: ['Ctrl', '.'], label: 'Dim the sentence or selection, or bring it back' },
  { keys: ['Ctrl', 'Shift', 'X'], label: 'Set the paragraph or selection aside in the scratchpad' },
  { keys: ['Alt', '↑'], label: 'Previous wording of an underlined passage' },
  { keys: ['Alt', '↓'], label: 'Next wording of an underlined passage' }
];

const SCRATCHPAD_LIMIT = 80;

const locatedDimmed = (doc, dimmed = []) => dimmed
  .map(passage => ({ passage, at: locatePassage(doc, { blockId: passage.blockId, sentence: passage.text }) }))
  .filter(item => item.at);

/** Dimmed words are still on the page, but they are not yet the piece. */
export const dimmedWordCount = (doc, dimmed) => (doc
  ? locatedDimmed(doc, dimmed).reduce((sum, { passage }) => sum + countWords(passage.text), 0)
  : 0);

const dim = (editor, { workbench, createId }) => {
  const { doc, selection } = editor.state;
  const { $from, $to } = selection;
  const block = $from.parent;
  const blockId = String(block.attrs?.blockId || '');
  if (!block.isTextblock || block !== $to.parent || !blockId) return false;

  const touched = locatedDimmed(doc, workbench.state.dimmed)
    .filter(({ at }) => at.from <= selection.to && at.to >= selection.from)
    .map(({ passage }) => passage.id);
  if (touched.length) {
    workbench.update(current => ({ ...current, dimmed: current.dimmed.filter(passage => !touched.includes(passage.id)) }));
    return true;
  }

  const baseText = block.textContent;
  const sentence = scopeNotebookTarget({ blockId, offset: $from.parentOffset, baseText }, 'sentence');
  const [start, end] = !selection.empty ? [$from.parentOffset, $to.parentOffset]
    : sentence.scope ? [sentence.rangeStart, sentence.rangeEnd] : [0, baseText.length];
  const text = baseText.slice(start, end).trim();
  if (!text) return false;
  workbench.update(current => ({
    ...current,
    dimmed: [...current.dimmed, { id: createId(), blockId, text, createdAt: new Date().toISOString() }]
  }));
  return true;
};

const stash = (editor, { workbench, createId, onReceipt }) => {
  const { state } = editor;
  const { selection } = state;
  const { $from } = selection;
  let { from, to } = selection;
  if (selection.empty) {
    if (!$from.parent.isTextblock) return false;
    // A top-level paragraph leaves whole; one inside a list or quote leaves its words.
    const whole = $from.depth === 1 && state.doc.childCount > 1;
    from = whole ? $from.before(1) : $from.start();
    to = whole ? $from.after(1) : $from.end();
  }
  const text = state.doc.textBetween(from, to, '\n\n').trim();
  if (!text) return false;
  if (workbench.state.looseThoughts.length >= SCRATCHPAD_LIMIT) {
    onReceipt({ type: 'error', text: `The scratchpad holds ${SCRATCHPAD_LIMIT} thoughts. Move one into the draft to make room.` });
    return true;
  }
  const slice = state.doc.slice(from, to);
  editor.view.dispatch(state.tr.delete(from, to).scrollIntoView());
  const thought = {
    id: createId(),
    text,
    target: targetFromEditor(editor) || { blockId: '', offset: 0, baseText: '' },
    createdAt: new Date().toISOString()
  };
  workbench.update(current => ({ ...current, looseThoughts: [...current.looseThoughts, thought] }));
  onReceipt({ type: 'stash', text: 'Set aside in the scratchpad.', thoughtId: thought.id, slice, from, doc: editor.state.doc });
  return true;
};

/** Undo puts the exact passage back, but only onto the page it left. */
export const undoStash = (editor, workbench, receipt) => {
  if (editor?.state?.doc !== receipt.doc) return false;
  editor.view.dispatch(editor.state.tr.replace(receipt.from, receipt.from, receipt.slice).scrollIntoView());
  workbench.update(current => ({ ...current, looseThoughts: current.looseThoughts.filter(thought => thought.id !== receipt.thoughtId) }));
  return true;
};

const turn = (editor, step, { workbench, savedMarks }) => {
  const caret = editor.state.selection.from;
  const mark = savedMarks.find(item => caret >= item.from && caret <= item.to);
  const turned = mark && turnWordings(workbench.state.trials, mark.trialKey, step);
  if (!turned) return false;
  const target = workbench.state.trials.find(trial => trial.id === mark.trialId).target;
  const placed = replaceEditorTargetText(editor, target, turned.wording);
  if (!placed.applied) return false;
  workbench.update(current => ({ ...current, trials: turnWordings(current.trials, mark.trialKey, step)?.trials || current.trials }));
  editor.commands.setTextSelection(placed.from + (target.scope ? target.rangeStart : 0) + turned.wording.length);
  return true;
};

/** The Write_On keys, or false so the editor carries on. */
export const handleWriteOnKey = (editor, event, context) => {
  if (!editor || event.metaKey) return false;
  const key = String(event.key || '');
  const handled = (event.ctrlKey && !event.altKey && !event.shiftKey && key === '.' && dim(editor, context))
    || (event.ctrlKey && event.shiftKey && !event.altKey && key.toLowerCase() === 'x' && stash(editor, context))
    || (event.altKey && !event.ctrlKey && !event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(key)
      && turn(editor, key === 'ArrowDown' ? 1 : -1, context));
  if (!handled) return false;
  event.preventDefault();
  context.onChange();
  return true;
};
