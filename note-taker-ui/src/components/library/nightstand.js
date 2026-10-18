/* The nightstand's two judgments, made from the rows it already holds:
   what fits tonight, and what has waited long enough to ask about. */
export const TONIGHT_MINUTES = 15;
const WAITED_LONG_DAYS = 30;

const waitedSince = row => new Date(row.placementAt || row.createdAt || 0).getTime() || 0;

export const hasWaitedLong = (row, now = Date.now()) =>
  row.placement === 'later' && now - waitedSince(row) > WAITED_LONG_DAYS * 86400000;

/* The piece that has waited longest among the short ones, and among the
   long ones. A missing kind is left out; an empty pile says nothing. */
export const tonightFrom = (rows = []) => {
  const waiting = rows
    .filter(row => row.placement === 'later' && row.minutes)
    .sort((a, b) => waitedSince(a) - waitedSince(b));
  return {
    tonight: waiting.find(row => row.minutes <= TONIGHT_MINUTES) || null,
    weekend: waiting.find(row => row.minutes > TONIGHT_MINUTES) || null
  };
};
