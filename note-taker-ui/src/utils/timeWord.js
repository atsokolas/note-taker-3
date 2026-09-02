/**
 * One rule for every time word in the product.
 *
 *   TUE      — inside six days, a weekday is enough
 *   OCT 1    — beyond that, a weekday is a lie waiting to happen
 *   MON ↻    — a recurring promise, which is a weekday forever
 *
 * Six days, not seven: at seven, "Tuesday" is ambiguous between the Tuesday
 * coming and the Tuesday just gone, and the reader has to do arithmetic to
 * find out which. The product was inventing this rule separately in four
 * places, each with its own cutoff and its own casing.
 *
 * The clock cap on the switch, the promise ledger, the paper's asked-back and
 * the return strip all print the same word for the same day, because they are
 * all saying the same thing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WITHIN = 6 * DAY_MS;

/** The recurrence mark. One glyph, and it is never on its own. */
export const RECURS = '↻';

const time = (value) => {
  if (value === null || value === undefined || value === '') return NaN;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? NaN : at.getTime();
};

/**
 * A day someone chose is a calendar day, so it is read in the timezone it was
 * written in — the same rule utils/calendarDate keeps. A promise for the first
 * of October is for the first of October wherever the reader is standing.
 */
const parts = (ms, options) => new Intl.DateTimeFormat(undefined, {
  ...options,
  timeZone: 'UTC'
}).format(new Date(ms));

/**
 * The word for a promised day, in the mono register the switch prints in.
 *
 * Returns '' for a day it does not have. A cap with no day on it is a cap that
 * should not be drawn, and inventing "SOON" to fill it would be the same
 * failure as printing a zero for a count nobody took.
 */
export const timeWord = (value, { now = Date.now(), recurring = false } = {}) => {
  const at = time(value);
  if (Number.isNaN(at)) return '';

  const within = at - now <= WITHIN && at >= now - DAY_MS;
  const word = within
    ? parts(at, { weekday: 'short' })
    : parts(at, { month: 'short', day: 'numeric' });

  const printed = word.toUpperCase().replace(/\./g, '');
  return recurring ? `${printed} ${RECURS}` : printed;
};

/** The same day, spelled out, for running prose rather than a control. */
export const timePhrase = (value, { now = Date.now() } = {}) => {
  const at = time(value);
  if (Number.isNaN(at)) return '';
  return at - now <= WITHIN && at >= now - DAY_MS
    ? parts(at, { weekday: 'long' })
    : parts(at, { month: 'long', day: 'numeric' });
};

export const TIME_WORD_WINDOW_MS = WITHIN;
