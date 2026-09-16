const LIMITS = Object.freeze({
  materials: 80,
  trials: 40,
  looseThoughts: 80,
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
  baseText: string(value?.baseText, LIMITS.baseText)
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

const trial = (value, index) => ({
  id: string(value?.id, 160) || `trial-${index}`,
  target: target(value?.target),
  alternative: string(value?.alternative, LIMITS.text),
  origin: value?.origin === 'partner' ? 'partner' : 'human',
  updatedAt: date(value?.updatedAt)
});

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

module.exports = { LIMITS, sanitizeNotebookWorkbench };
