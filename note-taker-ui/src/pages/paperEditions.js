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
/**
 * Which paper this is.
 *
 * The masthead has printed "today · the weekend" every morning and underlined
 * "today" every morning — Saturdays included. Nothing ever passed a different
 * edition in. A cadence the front page names and never enters is a promise
 * printed on the paper, and this is the paper keeping it.
 *
 * Read in the reader's own day, not UTC. A weekend is a thing that happens
 * where you are.
 */
export const TODAY = 'today';
export const THE_WEEKEND = 'the weekend';

export const paperEdition = (now = Date.now()) => {
  const day = new Date(now).getDay();
  return day === 0 || day === 6 ? THE_WEEKEND : TODAY;
};

export const isWeekend = (edition = TODAY) => edition === THE_WEEKEND;

export const editionsLine = ({
  now = Date.now(),
  driftClosesAt = null,
  keptCount = null,
  edition = paperEdition(now)
} = {}) => {
  const parts = [TODAY, THE_WEEKEND];

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
  { key: 'later', word: 'owed a move', href: '/library?scope=later' },
  { key: 'setAside', word: 'at hand', href: '/library?scope=set-aside' }
];

/**
 * The desk, as a sentence you can walk through.
 *
 *   On your desk — 3 owed a move, 1 at hand, Costco has 2 new folios.
 *
 * This used to return a finished string, which meant the one thing the reader
 * most wanted to do with it — go there — was the one thing it could not
 * support. So it returns its clauses instead and lets the page decide how a
 * door looks. Same sentence, same rules, and every count is now the way in.
 *
 * Only places holding something speak. The feed clause names the folder the
 * reader screened and never the word "feed", because they screened *Costco*.
 */
export const deskClauses = ({ later = null, setAside = null, topics = [], edition = TODAY } = {}) => {
  const clauses = [];

  PLACES.forEach(({ key, word, href }) => {
    /* Nothing is owed on a weekend. What you set aside is exactly what a
       weekend is for, so that clause stays; the one that says "owed" is a
       bill, and the paper does not deliver bills on a Saturday. */
    if (key === 'later' && isWeekend(edition)) return;
    const n = counted(key === 'later' ? later : setAside);
    if (!n) return;
    clauses.push({ key, text: `${n} ${word}`, href });
  });

  (Array.isArray(topics) ? topics : []).forEach((topic) => {
    const name = String(topic?.name || '').replace(/\s+/g, ' ').trim();
    const open = counted(topic?.open);
    if (!name || !open) return;
    clauses.push({
      key: `topic:${topic.id || name}`,
      text: `${name} has ${open} new folio${open === 1 ? '' : 's'}`,
      href: topic.href || ''
    });
  });

  return clauses;
};

/** What the canon holds, when anyone has counted it. */
export const shelfClause = (kept = null) => {
  const n = counted(kept);
  return n ? { key: 'kept', text: `The shelf holds ${n}`, href: '/library?scope=kept' } : null;
};

/* Day one. One line, and it asks for nothing — a first morning that opened
   with a queue would be teaching the wrong thing on the wrong day. */
export const firstMorningLead = () => (
  'No news yet. Save something worth keeping — I’ll print it when it moves.'
);

export const firstMorningDeskLine = () => 'Your desk is empty. The shelf holds nothing yet.';

/** A paper ends. A feed does not, which is the difference. */
export const END_OF_PAPER = '— end of the paper —';
