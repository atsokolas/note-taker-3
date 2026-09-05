/**
 * What the paper said, and what happened to it.
 *
 * The whole product is accountability to your own past claims — bornAt, the
 * falsifier, what would change your mind, did it hold up. And the surface
 * that does the holding kept no record of itself. The morning paper was a
 * pure function of current state: every load recomputed it, yesterday's paper
 * did not exist anywhere, and it could not be wrong because nothing it said
 * survived long enough to be checked.
 *
 * That is the one object in the system exempt from the standard the system is
 * built on. So the paper joins the ledger.
 *
 * What is kept is not the rendered page — that is a blob, and it rots as
 * titles change and links die. What is kept is what the paper *asserted*: a
 * handful of dated claims about the reader, each pointing at something. Two
 * sentences fall out of that, and neither is possible without it:
 *
 *   "This is the third morning I have asked about this."
 *   "You answered what the paper asked on Tuesday."
 *
 * The second is a correction in the newspaper sense — we printed a thing, the
 * thing is no longer the case — and it is also the loop closing. A paper that
 * notices you acted is a different object from one that asks again.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/* Long enough that a weekly reader still sees a loop close; short enough that
   the paper is not litigating the spring. */
const CLOSING_WINDOW_DAYS = 21;

/* Two askings is a coincidence. Three is the paper noticing. */
const ASKED_BEFORE_FLOOR = 2;

const list = value => (Array.isArray(value) ? value : []);

/* A ledger row is written by a past version of this code, and a half-written
   one must not take the morning paper down with it. */
const days = value => list(value).filter(row => row && typeof row === 'object' && row.day);

const clean = (value = '', limit = 400) => String(value == null ? '' : value)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const dayOf = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

const dayToTime = (day = '') => {
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isNaN(ms) ? 0 : ms;
};

/* One key per question the paper can ask, so "the third time" counts the same
   question rather than the same object. A belief you have not revisited and a
   belief your sources contradict are two different things to be asked. */
const keyOf = (assertion = {}) => `${assertion.kind}:${assertion.targetKey}`;

/**
 * Today's columns, flattened into the things the paper is on record as saying.
 *
 * The corrections column is deliberately absent: it reports the reader's own
 * reversals, read out of a claim's history. The paper is not asserting
 * anything there, so there is nothing for it to be held to later.
 */
const assertionsFrom = (columns = {}) => {
  const rows = [];
  if (columns.anniversary?.text) {
    rows.push({
      kind: 'anniversary',
      targetKey: clean(columns.anniversary.key || `${columns.anniversary.pageId}:${columns.anniversary.claimId}`, 300),
      pageId: clean(columns.anniversary.pageId, 60),
      label: clean(columns.anniversary.pageTitle, 200),
      text: clean(columns.anniversary.text)
    });
  }
  if (columns.disagreement?.text) {
    rows.push({
      kind: 'disagreement',
      targetKey: clean(columns.disagreement.key || `${columns.disagreement.pageId}:${columns.disagreement.claimId}`, 300),
      pageId: clean(columns.disagreement.pageId, 60),
      label: clean(columns.disagreement.pageTitle, 200),
      text: clean(columns.disagreement.text)
    });
  }
  if (columns.obituary?.pageTitle) {
    rows.push({
      kind: 'obituary',
      targetKey: clean(columns.obituary.key || columns.obituary.pageId, 300),
      pageId: clean(columns.obituary.pageId, 60),
      label: clean(columns.obituary.pageTitle, 200),
      text: clean(columns.obituary.pageTitle, 200)
    });
  }
  return rows.filter(row => row.targetKey);
};

/**
 * How many mornings before this one the paper asked the same question.
 *
 * Today's own record is excluded, because the paper reloading is not the paper
 * asking again — a reader who refreshes twice has not been asked twice.
 */
const askedBefore = ({ history = [], assertion, today = dayOf() } = {}) => {
  if (!assertion) return 0;
  const key = keyOf(assertion);
  return days(history)
    .filter(record => record.day !== today)
    .filter(record => list(record.assertions).some(row => row && keyOf(row) === key))
    .length;
};

/**
 * Questions the paper asked that are no longer open.
 *
 * Not "absent from today's paper" — each column prints one candidate a day, so
 * absence usually means somebody else's turn came round. A question is closed
 * only when its target has left the set of things that still qualify, which
 * happens because the reader checked the belief, resolved the contradiction,
 * or wrote on the page.
 *
 * A target that has vanished entirely is reported too. The paper asked about
 * something that no longer exists, and saying so is more honest than quietly
 * dropping the question.
 */
const closings = ({ history = [], open = {}, known = new Set(), now = Date.now(), limit = 2 } = {}) => {
  const today = dayOf(now);
  const floor = now - CLOSING_WINDOW_DAYS * DAY_MS;
  const seen = new Set();
  const found = [];

  const recent = days(history)
    .filter(record => record.day !== today && dayToTime(record.day) >= floor)
    .sort((left, right) => dayToTime(right.day) - dayToTime(left.day));

  recent.forEach((record) => {
    list(record.assertions).forEach((assertion) => {
      if (!assertion || !assertion.kind || !assertion.targetKey) return;
      const key = keyOf(assertion);
      if (seen.has(key)) return;
      const stillOpen = open[assertion.kind];
      /* A kind the caller did not compute is a kind we cannot speak about.
         Silence beats guessing that everything in it closed. */
      if (!stillOpen) return;
      if (stillOpen.has(assertion.targetKey)) return;
      seen.add(key);
      found.push({
        kind: assertion.kind,
        day: record.day,
        pageId: assertion.pageId,
        label: assertion.label,
        text: assertion.text,
        /* Gone is different from answered, and the reader can tell the
           difference even when the paper cannot. */
        vanished: known.size > 0 && assertion.pageId ? !known.has(assertion.pageId) : false
      });
    });
  });

  return found.slice(0, Math.max(0, limit));
};

/**
 * How many mornings in a row the paper has had nothing to say.
 *
 * A quiet morning writes no record, so a gap in the ledger *is* the streak —
 * nothing extra has to be stored to know it. Counted backwards from
 * yesterday, because today is not over and the paper may yet have news.
 */
const quietStreak = ({ history = [], now = Date.now() } = {}) => {
  const records = days(history);
  /* A reader with no ledger has not had a run of quiet mornings — they have
     had no mornings. Absence of a record is not a streak, and the count can
     never reach further back than the ledger itself. */
  if (!records.length) return 0;
  const earliest = Math.min(...records.map(record => dayToTime(record.day)));
  const reach = Math.min(30, Math.floor((now - earliest) / DAY_MS));

  const spoke = new Set(records.map(record => record.day));
  let streak = 0;
  for (let back = 1; back <= reach; back += 1) {
    if (spoke.has(dayOf(now - back * DAY_MS))) break;
    streak += 1;
  }
  return streak;
};

module.exports = {
  ASKED_BEFORE_FLOOR,
  CLOSING_WINDOW_DAYS,
  assertionsFrom,
  askedBefore,
  closings,
  dayOf,
  keyOf,
  quietStreak
};
