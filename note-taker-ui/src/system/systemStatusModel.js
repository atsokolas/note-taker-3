/** @typedef {'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed' | 'needs_review'} ReceiptStatus */

/**
 * Minimal receipt slice for the topbar affordance (full NoeisReceipt wired later).
 * @typedef {{
 *   id?: string;
 *   title: string;
 *   summary: string;
 *   status?: ReceiptStatus;
 *   href?: string;
 * }} SystemStatusReceipt
 */

/**
 * @typedef {{
 *   label: string;
 *   stage?: string;
 * }} BackgroundWork
 */

/**
 * @typedef {{
 *   stage: string;
 *   message: string;
 *   retryable?: boolean;
 * }} RecoverableFailure
 */

/**
 * @typedef {{
 *   backgroundWork: BackgroundWork | null;
 *   latestReceipt: SystemStatusReceipt | null;
 *   recentReceipts: SystemStatusReceipt[];
 *   recoverableFailure: RecoverableFailure | null;
 * }} SystemStatusState
 */

export const RECENT_RECEIPTS_MAX = 5;

export const EMPTY_SYSTEM_STATUS = /** @type {SystemStatusState} */ ({
  backgroundWork: null,
  latestReceipt: null,
  recentReceipts: [],
  recoverableFailure: null
});

const asString = (value = '') => String(value || '').trim();

/**
 * Prepend a receipt into session history, dedupe by id when present, cap at RECENT_RECEIPTS_MAX.
 *
 * @param {SystemStatusReceipt[]} recentReceipts
 * @param {SystemStatusReceipt | null | undefined} receipt
 * @returns {SystemStatusReceipt[]}
 */
export const prependRecentReceipt = (recentReceipts, receipt) => {
  if (!receipt) return recentReceipts || [];
  const id = asString(receipt.id);
  const filtered = id
    ? (recentReceipts || []).filter((entry) => asString(entry.id) !== id)
    : (recentReceipts || []);
  return [receipt, ...filtered].slice(0, RECENT_RECEIPTS_MAX);
};

/**
 * Convert a full server-side NoeisReceipt into the compact topbar shape.
 * Producers should prefer this over hand-built count summaries when the API
 * returns a durable receipt.
 *
 * @param {Record<string, any> | null | undefined} receipt
 * @param {{ href?: string }} options
 * @returns {SystemStatusReceipt | null}
 */
export const normalizeSystemReceipt = (receipt, options = {}) => {
  if (!receipt || typeof receipt !== 'object') return null;
  const title = asString(receipt.title)
    || `${asString(receipt.sourceLabel || receipt.source || 'Noeis')} ${receipt.kind === 'import' ? 'import' : 'update'}`;
  const summary = asString(receipt.summary);
  if (!title && !summary) return null;
  return {
    id: asString(receipt.id),
    title,
    summary,
    status: asString(receipt.status) || 'completed',
    href: asString(receipt.nextAction?.href || options.href)
  };
};

/**
 * @param {SystemStatusState} state
 * @returns {boolean}
 */
export const hasSystemStatusActivity = (state) => Boolean(
  state.backgroundWork || state.latestReceipt || state.recoverableFailure
);

/**
 * @param {SystemStatusState} state
 * @returns {'failure' | 'working' | 'receipt' | 'idle'}
 */
export const getSystemStatusTone = (state) => {
  if (state.recoverableFailure) return 'failure';
  if (state.backgroundWork) return 'working';
  if (state.latestReceipt) return 'receipt';
  return 'idle';
};

/**
 * @param {SystemStatusState} state
 * @returns {string}
 */
export const buildSystemStatusLiveMessage = (state) => {
  if (state.recoverableFailure) {
    return `Action needed: ${state.recoverableFailure.message}`;
  }
  if (state.backgroundWork) {
    return state.backgroundWork.stage
      ? `${state.backgroundWork.label}: ${state.backgroundWork.stage}`
      : state.backgroundWork.label;
  }
  if (state.latestReceipt) {
    return `${state.latestReceipt.title}. ${state.latestReceipt.summary}`;
  }
  return '';
};

/**
 * @param {SystemStatusState} state
 * @returns {string}
 */
export const buildSystemStatusButtonLabel = (state) => {
  const tone = getSystemStatusTone(state);
  if (tone === 'failure') return 'System status: action needed';
  if (tone === 'working') return 'System status: work in progress';
  if (tone === 'receipt') return 'System status: latest update';
  return 'System status';
};
