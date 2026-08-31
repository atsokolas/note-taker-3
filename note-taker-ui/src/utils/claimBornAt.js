/**
 * Claim birth — the day a belief entered the ledger.
 * Never prints "Unknown". An empty string means the row should not exist.
 */

const asClaimDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const earliestDate = (...values) => {
  const dates = values.map(asClaimDate).filter(Boolean);
  if (!dates.length) return null;
  return dates.reduce((earliest, next) => (
    next.getTime() < earliest.getTime() ? next : earliest
  ));
};

const earliestHistoryAt = (history = []) => (
  earliestDate(...(Array.isArray(history) ? history.map(entry => entry?.at) : []))
);

export const resolveClaimBornAt = (claim = {}, { pageCreatedAt, now } = {}) => (
  earliestDate(
    claim?.bornAt,
    claim?.createdAt,
    earliestHistoryAt(claim?.history),
    pageCreatedAt,
    now
  )
);

export const formatClaimBornAt = (claim = {}, options = {}) => {
  const date = resolveClaimBornAt(claim, options);
  if (!date) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
