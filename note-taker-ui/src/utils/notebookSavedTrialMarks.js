import { notebookTrialKey, resolveEditorTarget } from './notebookWorkbench';

const text = (value) => String(value || '').trim();

/** Saved alternatives that still anchor to the live passage (strip closed elsewhere). */
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
    const rangeEnd = scoped ? Number(trial.target.rangeEnd) : text(found.currentText).length;
    if (scoped && (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeEnd <= rangeStart)) return;
    const from = found.from + rangeStart;
    const to = found.from + rangeEnd;
    if (to <= from) return;
    marks.push({
      trialKey: key,
      trialId: trial.id,
      blockId: trial.target.blockId,
      from,
      to
    });
  });
  return marks;
};
