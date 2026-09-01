/**
 * The paper's editions.
 *
 * A paper teaches its own cadence by printing it. Noeis prints on four
 * clocks — the day, the week, the drift's fortnight, and the canon, which has
 * no clock at all — and until now the reader had to infer that from what
 * happened to be on the page. The masthead says it out loud instead, and
 * underlines the edition they are holding.
 *
 * Everything here obeys the same two rules the rest of the product does.
 * Empty is absent: a place with nothing on it does not print a nought, and a
 * canon holding nothing does not appear in the cadence line at all. Unknown is
 * not zero: a count that has not been read is null, and null says nothing
 * rather than reporting a clear desk to someone whose desk we never looked at.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const time = (value) => {
  if (value === null || value === undefined || value === '') return NaN;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? NaN : at.getTime();
};

/** A count we actually have, or null. Zero is a count; unread is not. */
const counted = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};

/** Calendar days apart, so an edition turns at midnight rather than at a clock hour. */
const middayOf = (ms) => {
  const at = new Date(ms);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 12).getTime();
};

/**
 * Mornings since the account began, today included. Never resets — the number
 * is the only thing on the page that says how long you have been doing this,
 * and a counter that goes back to one every year would be saying the opposite.
 */
export const editionNumber = ({ beganAt = null, now = Date.now() } = {}) => {
  const began = time(beganAt);
  if (Number.isNaN(began)) return null;
  const days = Math.round((middayOf(now) - middayOf(began)) / DAY_MS);
  // A morning before the account existed is not an edition, it is a clock
  // that is wrong. Say nothing rather than print No. 0 or a negative.
  return days >= 0 ? days + 1 : null;
};

/**
 * When the paper printed, not when the reader opened it. The difference is the
 * whole point: a paper has an hour, and a page that says "now" is a screen.
 */
export const printedTime = (at = null, timeZone = undefined) => {
  const ms = time(at);
  if (Number.isNaN(ms)) return '';
  /* No meridiem. A masthead saying "printed 6:02 AM" is a receipt; a paper
     says the hour it went to press. Twenty-four hour without a leading zero
     reads the same at six in the morning and is unambiguous at six at night. */
  const clock = new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {})
  }).replace(/^0/, '');
  return `printed ${clock}`;
};

/* A bucket closes on a scheduled day, not at an instant, so its weekday is
   read in the timezone it was written in — the same rule utils/calendarDate
   applies to review dates. Read locally, a boundary at midnight UTC becomes
   the day before for every reader west of it. */
const WEEKDAY = { weekday: 'short', timeZone: 'UTC' };

/**
 * The cadences, in the order they come round, with the one you are reading
 * marked. Each part is `{ label, current }` so the masthead can underline
 * rather than the model deciding how underlining looks.
 */
export const editionsLine = ({
  now = Date.now(),
  driftClosesAt = null,
  keptCount = null,
  edition = 'today'
} = {}) => {
  const parts = ['today', 'the weekend'];

  const closes = time(driftClosesAt);
  if (!Number.isNaN(closes) && closes >= now) {
    parts.push(`the drift closes ${new Date(closes).toLocaleDateString(undefined, WEEKDAY)}`);
  }

  /* The canon prints its size because it is the one section with no clock —
     the count is the only thing it can say about itself. It stays quiet when
     it holds nothing, and when nobody has counted it. */
  const kept = counted(keptCount);
  if (kept) parts.push(`the canon — ${kept} kept`);

  return parts.map(label => ({ label, current: label === edition }));
};

const PLACES = [
  { key: 'later', one: 'owed a move', many: 'owed a move' },
  { key: 'setAside', one: 'at hand', many: 'at hand' }
];

/**
 * The desk, as one sentence.
 *
 *   On your desk — 3 owed a move, 1 at hand, Costco has 2 new folios.
 *   The shelf holds 7.
 *
 * Four links became a sentence because four links are a navigation bar and a
 * sentence is a report. Only places with something on them speak; the feed
 * clause names the folder and never the word feed, because the reader screened
 * *Costco*, not "a feed"; and the shelf gets its own sentence, since the canon
 * is not on the desk.
 */
export const deskLine = ({ later = null, setAside = null, kept = null, topics = [] } = {}) => {
  const clauses = [];

  PLACES.forEach(({ key, one, many }) => {
    const n = counted(key === 'later' ? later : setAside);
    if (!n) return;
    clauses.push(`${n} ${n === 1 ? one : many}`);
  });

  (Array.isArray(topics) ? topics : []).forEach((topic) => {
    const name = String(topic?.name || '').replace(/\s+/g, ' ').trim();
    const open = counted(topic?.open);
    if (!name || !open) return;
    clauses.push(`${name} has ${open} new folio${open === 1 ? '' : 's'}`);
  });

  const shelf = counted(kept);
  const desk = clauses.length ? `On your desk — ${clauses.join(', ')}.` : '';
  const canon = shelf ? `The shelf holds ${shelf}.` : '';

  return [desk, canon].filter(Boolean).join(' ');
};

/* Day one. One line, and it asks for nothing — a first morning that opened
   with a queue would be teaching the wrong thing on the wrong day. */
export const firstMorningLead = () => (
  'No news yet. Save something worth keeping — I’ll print it when it moves.'
);

export const firstMorningDeskLine = () => 'Your desk is empty. The shelf holds nothing yet.';

/**
 * Printed once, on the hundred and twentieth morning: the day the corpus is
 * old enough for the drift's buckets to mean something. Once, because a
 * milestone that recurs is a badge.
 */
export const day120Line = ({ edition = null } = {}) => (
  counted(edition) === 120 ? 'The corpus is old enough to talk back.' : ''
);

/** A paper ends. A feed does not, which is the difference. */
export const END_OF_PAPER = '— end of the paper —';
