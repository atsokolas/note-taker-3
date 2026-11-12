const LIMITS = Object.freeze({
  materials: 80,
  trials: 40,
  looseThoughts: 80,
  dimmed: 80,
  title: 1000,
  text: 30000,
  nextLine: 4000,
  path: 3000,
  id: 200,
  baseText: 20000
});

const string = (value, max) => String(value || '').trim().slice(0, max);
const date = (value, fallback = new Date()) => {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const target = (value = {}) => ({
  blockId: string(value?.blockId, 160),
  offset: Math.max(0, Math.min(Number(value?.offset) || 0, LIMITS.baseText)),
  baseText: String(value?.baseText || '').slice(0, LIMITS.baseText),
  ...(['word', 'sentence', 'range'].includes(value?.scope) && Number.isInteger(value?.rangeStart) && Number.isInteger(value?.rangeEnd) && value.rangeStart >= 0 && value.rangeEnd > value.rangeStart && value.rangeEnd <= Math.min(String(value.baseText || '').length, LIMITS.baseText)
    ? { scope: value.scope, rangeStart: value.rangeStart, rangeEnd: value.rangeEnd }
    : {})
});

const materialKinds = new Set(['highlight', 'article', 'concept', 'question', 'wiki']);
const material = (value, index) => {
  const kind = string(value?.kind, 20);
  if (!materialKinds.has(kind)) return null;
  return {
    id: string(value?.id, 160) || `material-${index}`,
    kind,
    title: string(value?.title, LIMITS.title),
    text: string(value?.text, LIMITS.text),
    sourceId: string(value?.sourceId, LIMITS.id),
    articleId: string(value?.articleId, LIMITS.id),
    highlightId: string(value?.highlightId, LIMITS.id),
    sourcePath: string(value?.sourcePath, LIMITS.path),
    target: target(value?.target),
    insertedBlockId: string(value?.insertedBlockId, 160),
    createdAt: date(value?.createdAt)
  };
};

const trial = (value, index) => {
  const savedTarget = target(value?.target);
  if (value?.target?.scope && !savedTarget.scope) return null;
  return {
    id: string(value?.id, 160) || `trial-${index}`,
    target: savedTarget,
    alternative: String(value?.alternative || '').slice(0, LIMITS.text),
    origin: value?.origin === 'partner' ? 'partner' : 'human',
    ...(value?.intent === 'tighter' ? { intent: 'tighter' } : {}),
    ...(string(value?.partnerExplanation) ? { partnerExplanation: string(value?.partnerExplanation, 240) } : {}),
    updatedAt: date(value?.updatedAt)
  };
};

const thought = (value, index) => {
  const text = string(value?.text, LIMITS.text);
  if (!text) return null;
  return {
    id: string(value?.id, 160) || `thought-${index}`,
    text,
    target: target(value?.target),
    createdAt: date(value?.createdAt)
  };
};

const dimmedPassage = (value, index) => {
  const text = string(value?.text, LIMITS.baseText);
  const blockId = string(value?.blockId, 160);
  if (!text || !blockId) return null;
  const offset = Math.max(0, Math.min(Number(value?.offset) || 0, LIMITS.baseText));
  return { id: string(value?.id, 160) || `dimmed-${index}`, blockId, text, offset, createdAt: date(value?.createdAt) };
};

const list = (value, limit, normalize) => (Array.isArray(value) ? value : [])
  .slice(0, limit)
  .map(normalize)
  .filter(Boolean);

const sanitizeNotebookWorkbench = (value = {}, { revision } = {}) => {
  const sourceRevision = revision === undefined ? value?.revision : revision;
  return {
    revision: Math.max(0, Number.parseInt(sourceRevision, 10) || 0),
    materials: list(value?.materials, LIMITS.materials, material),
    trials: list(value?.trials, LIMITS.trials, trial),
    looseThoughts: list(value?.looseThoughts, LIMITS.looseThoughts, thought),
    dimmed: list(value?.dimmed, LIMITS.dimmed, dimmedPassage),
    nextTimeLine: {
      text: string(value?.nextTimeLine?.text, LIMITS.nextLine),
      target: target(value?.nextTimeLine?.target),
      updatedAt: value?.nextTimeLine?.text ? date(value?.nextTimeLine?.updatedAt) : null
    },
    continuity: {
      target: target(value?.continuity?.target),
      scrollY: Math.max(0, Math.min(Number(value?.continuity?.scrollY) || 0, 10000000)),
      updatedAt: value?.continuity?.target?.blockId ? date(value?.continuity?.updatedAt) : null
    }
  };
};

const time = value => new Date(value || 0).getTime() || 0;

/** Every dimmed passage and scratchpad thought, newest first, with the piece it came from. */
const notebookCuttings = (entries = []) => entries.flatMap(entry => {
  const piece = { noteId: String(entry._id), noteTitle: String(entry.title || '').trim() || 'Untitled' };
  const from = (kind, items) => (items || [])
    .filter(item => String(item?.text || '').trim())
    .map(item => ({ ...piece, id: `${kind}:${piece.noteId}:${item.id}`, kind, text: item.text, createdAt: item.createdAt || null }));
  return [...from('dimmed', entry.workingState?.dimmed), ...from('aside', entry.workingState?.looseThoughts)];
}).sort((a, b) => time(b.createdAt) - time(a.createdAt));

module.exports = { LIMITS, notebookCuttings, sanitizeNotebookWorkbench, sanitizeNotebookTarget: target };
