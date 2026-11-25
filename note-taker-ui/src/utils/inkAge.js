/* Ink fades. Something you wrote and left alone settles after a fortnight
   and fades after six weeks, so the page shows its age without a number on
   it. Touching it again writes it fresh. */
const DAY = 24 * 60 * 60 * 1000;
const AGES = [['faded', 42], ['settled', 14]];

export const inkAge = (written, now = Date.now()) => {
  const at = new Date(written || NaN).getTime();
  if (!Number.isFinite(at)) return undefined;
  return AGES.find(([, days]) => now - at >= days * DAY)?.[0];
};
