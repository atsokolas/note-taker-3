/**
 * Client reading of the durable institution. The server owns lineage,
 * calibration, watches, and seals. This file only names what the paper
 * can already see.
 */

export const KIND_LABEL = Object.freeze({
  assumption: 'assumption',
  evidence: 'evidence',
  decision_pattern: 'decision pattern',
  consequence: 'consequence'
});

export const STRESS_KIND = Object.freeze({
  alternative_future: 'Another future',
  counterevidence: 'Counterevidence',
  base_rate: 'A changed base rate'
});

const months = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]);

export const formatDay = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
};

export const casePath = (pageId) => (
  pageId ? `/judgment/${encodeURIComponent(pageId)}` : ''
);

export const hasThread = (thread) => {
  if (!thread || thread.silent) return false;
  const knots = Array.isArray(thread.knots) ? thread.knots : [];
  return knots.length > 0;
};

export const bandLine = (band = {}) => {
  if (!band.sufficient) return band.silence || '';
  const low = band.range?.low == null ? '' : Math.round(band.range.low * 100);
  const high = band.range?.high == null ? '' : Math.round(band.range.high * 100);
  if (low === '' || high === '') return '';
  return `When you were ${band.confidence || 'this sure'}, later outcomes sat between ${low} and ${high} in a hundred.`;
};

export const watchNote = (watch) => {
  if (!watch || watch.silent) return watch?.note || '';
  return watch.note || '';
};
