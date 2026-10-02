import { notebookTrialKey, resolveEditorTarget } from './notebookWorkbench';

const text = (value) => String(value || '').trim();
const exact = (value) => String(value || '');

/** Place a saved alternative on the live passage, or nowhere if that passage changed. */
export const resolveSavedMark = (doc, mark) => {
  const blockId = exact(mark?.blockId);
  const baseText = exact(mark?.baseText);
  if (!blockId || !baseText || typeof doc?.descendants !== 'function') return null;
  const rangeStart = Number.isInteger(mark.rangeStart) ? mark.rangeStart : 0;
  const rangeEnd = Number.isInteger(mark.rangeEnd) ? mark.rangeEnd : null;
  if (rangeEnd == null || rangeEnd <= rangeStart || rangeStart < 0) return null;
  let match = null;
  doc.descendants((node, pos) => {
    if (match) return false;
    if (exact(node?.attrs?.blockId) !== blockId) return undefined;
    const current = exact(node.textContent);
    if (current !== baseText || rangeEnd > current.length) return undefined;
    match = { from: pos + 1 + rangeStart, to: pos + 1 + rangeEnd };
    return false;
  });
  return match && match.to > match.from ? match : null;
};

/** Saved alternatives that still anchor to the live passage. */
export const readySavedTrialMarks = (editor, trials = []) => {
  if (!editor || !Array.isArray(trials) || !trials.length) return [];
  const grouped = new Map();
  trials.forEach((trial) => {
    if (!trial?.target?.blockId) return;
    const key = notebookTrialKey(trial);
    const bucket = grouped.get(key) || { key, trial, hasWording: false };
    if (text(trial.alternative)) bucket.hasWording = true;
    if (!bucket.trial || text(trial.alternative)) bucket.trial = trial;
    grouped.set(key, bucket);
  });
  const marks = [];
  grouped.forEach(({ key, trial, hasWording }) => {
    if (!hasWording) return;
    const found = resolveEditorTarget(editor, trial.target, { requireSameText: true });
    if (found.status !== 'ready') return;
    const scoped = Boolean(trial.target.scope);
    const rangeStart = scoped ? Number(trial.target.rangeStart) : 0;
    const rangeEnd = scoped ? Number(trial.target.rangeEnd) : exact(found.currentText).length;
    const identity = {
      trialKey: key,
      trialId: trial.id,
      blockId: exact(trial.target.blockId),
      baseText: exact(trial.target.baseText),
      rangeStart,
      rangeEnd
    };
    const located = resolveSavedMark(editor.state.doc, identity);
    if (!located) return;
    marks.push({ ...identity, from: located.from, to: located.to });
  });
  return marks;
};

// An alternative preview covers that passage, so its own underline is the
// preview. Choosing the original puts the saved wording's underline back.
export const savedMarksBesidePreview = (marks = [], previewBlockId = '') => {
  if (!previewBlockId) return marks;
  return marks.filter((mark) => mark.blockId !== previewBlockId);
};
