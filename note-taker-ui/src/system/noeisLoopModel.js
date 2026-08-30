export const NOEIS_LOOP_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'loop.morning-paper', name: 'Morning Paper', description: 'Names a close, or stays silent.' }),
  Object.freeze({ id: 'loop.wiki-maintenance', name: 'Wiki maintenance', description: 'Proposes evidence-bound updates to maintained knowledge.' }),
  Object.freeze({ id: 'loop.weekly-ai', name: 'This Week in AI', description: 'Compiles a bounded weekly research edition.' }),
  Object.freeze({ id: 'loop.outcome-review', name: 'Outcome review', description: 'Returns decisions when their outcome clock is due.' })
]);

export const NOEIS_LOOP_IDS = Object.freeze(NOEIS_LOOP_DEFINITIONS.map(loop => loop.id));

export const NOEIS_LOOP_STATUSES = Object.freeze([
  'idle',
  'running',
  'ready',
  'needs_review',
  'error'
]);

const LOOP_ID_SET = new Set(NOEIS_LOOP_IDS);
const STATUS_SET = new Set(NOEIS_LOOP_STATUSES);
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = value => String(value || '').trim();
const validIsoOrNull = value => value === null || (
  typeof value === 'string'
  && value.trim()
  && !Number.isNaN(new Date(value).getTime())
);

const validateLoop = (loop, expectedId) => {
  if (
    !plain(loop)
    || loop.id !== expectedId
    || !STATUS_SET.has(loop.status)
    || !text(loop.reason)
    || !validIsoOrNull(loop.updatedAt)
    || typeof loop.href !== 'string'
    || !(loop.receipt === null || plain(loop.receipt))
    || !plain(loop.metrics)
  ) {
    throw new Error(`Background-loop response for ${expectedId} is malformed.`);
  }
  return Object.freeze({ ...loop });
};

export const validateLoopStatusEnvelope = (candidate) => {
  if (
    !plain(candidate)
    || candidate.schemaVersion !== 1
    || !text(candidate.generatedAt)
    || Number.isNaN(new Date(candidate.generatedAt).getTime())
    || !plain(candidate.loops)
    || Object.keys(candidate.loops).some(id => !LOOP_ID_SET.has(id))
  ) {
    throw new Error('Background-loop response is malformed.');
  }
  const loops = Object.fromEntries(NOEIS_LOOP_IDS.map(id => [id, validateLoop(candidate.loops[id], id)]));
  return Object.freeze({ schemaVersion: 1, generatedAt: candidate.generatedAt, loops: Object.freeze(loops) });
};

export const createCheckingLoopSnapshot = () => Object.freeze(Object.fromEntries(NOEIS_LOOP_IDS.map(id => [id, Object.freeze({
  id,
  status: 'checking',
  reason: 'Durable loop status is being checked.',
  updatedAt: null,
  href: '',
  receipt: null,
  metrics: {}
})])));

export const createErrorLoopSnapshot = (reason = 'Durable loop status could not be checked.') => Object.freeze(Object.fromEntries(NOEIS_LOOP_IDS.map(id => [id, Object.freeze({
  id,
  status: 'error',
  reason: String(reason || 'Durable loop status could not be checked.').trim(),
  updatedAt: null,
  href: '',
  receipt: null,
  metrics: {}
})])));

export const latestLoopReceipt = loops => Object.values(loops || {})
  .map(loop => ({ loopId: loop.id, receipt: loop.receipt }))
  .filter(entry => entry.receipt)
  .sort((a, b) => new Date(b.receipt.completedAt || b.receipt.createdAt || 0) - new Date(a.receipt.completedAt || a.receipt.createdAt || 0))[0] || null;
