/**
 * How a paper reads.
 *
 * The sentences an edition says about itself, and none of them is a count for
 * its own sake. What the week left empty is an editorial fact — an AI weekly
 * with nothing under counterevidence is telling you something real. What you
 * took from it is the only measure of whether the paper did its job.
 *
 * A stand holds papers, not issues. Editions arrive as a flat list ordered by
 * date, which reads as a pile; grouping them back into the papers they belong
 * to is what makes a run of issues legible as one thing that keeps turning up.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const day = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Sep 1 – 7", or "Aug 30 – Sep 5" when the week crosses a month. */
export const windowLine = ({ windowStart, windowEnd } = {}) => {
  const start = day(windowStart);
  const end = day(windowEnd);
  if (!start || !end) return '';
  const short = month => MONTHS[month].slice(0, 3);
  const left = `${short(start.getUTCMonth())} ${start.getUTCDate()}`;
  const right = start.getUTCMonth() === end.getUTCMonth()
    ? `${end.getUTCDate()}`
    : `${short(end.getUTCMonth())} ${end.getUTCDate()}`;
  return `${left} – ${right}`;
};

/**
 * The dateline a paper actually prints.
 *
 * Named days and the month spelled out, because this is the line that says
 * what the issue *is*. A single-day issue says one date rather than the same
 * date twice; a month-long one names the month once.
 */
export const datelineLine = ({ windowStart, windowEnd } = {}) => {
  const start = day(windowStart);
  const end = day(windowEnd);
  if (!start || !end) return '';
  const year = end.getUTCFullYear();
  const named = date => `${DAYS[date.getUTCDay()]} ${date.getUTCDate()}`;
  if (start.getTime() === end.getTime()) {
    return `${DAYS[start.getUTCDay()]} ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} ${year}`;
  }
  const wholeMonth = start.getUTCDate() === 1
    && end.getUTCDate() === new Date(Date.UTC(year, end.getUTCMonth() + 1, 0)).getUTCDate()
    && start.getUTCMonth() === end.getUTCMonth();
  if (wholeMonth) return `${MONTHS[start.getUTCMonth()]} ${year}`;
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${named(start)} – ${named(end)} ${MONTHS[end.getUTCMonth()]} ${year}`
    : `${named(start)} ${MONTHS[start.getUTCMonth()]} – ${named(end)} ${MONTHS[end.getUTCMonth()]} ${year}`;
};

export const issueLine = ({ issueLabel = 'Edition', number } = {}) => (
  Number.isFinite(Number(number)) && Number(number) > 0 ? `${issueLabel} ${number}` : ''
);

/**
 * Which tense an issue is in.
 *
 * The whole stand turns on this. An issue still inside its window is being
 * written and says "nothing *yet*"; one whose window has closed is finished
 * and says "nothing *that week*". Same silence, different claim.
 */
export const stateOf = ({ windowStart, windowEnd } = {}, now = Date.now()) => {
  const start = day(windowStart);
  const end = day(windowEnd);
  if (!start || !end) return 'open';
  /* The window is inclusive of its last day, so it closes when that day does. */
  if (now > end.getTime() + DAY_MS) return 'closed';
  return now < start.getTime() ? 'open' : 'filling';
};

/**
 * When the open issue closes, said the way a person would.
 *
 * Not a countdown. A paper tells you which day it goes to press.
 */
export const closesLine = (edition = {}, now = Date.now()) => {
  const end = day(edition.windowEnd);
  if (!end) return '';
  if (stateOf(edition, now) === 'closed') return 'Closed';
  const days = Math.round((end.getTime() + DAY_MS - now) / DAY_MS);
  if (days <= 1) return 'Closes today';
  if (days <= 7) return `Closes ${DAYS[end.getUTCDay()]}`;
  return `Closes ${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
};

/**
 * What the paper admits about itself.
 *
 * Silence when the week covered its own shape — printing "0 sections empty"
 * would be filler. Never a count where a name will do: the reader needs to
 * know it was counterevidence that went missing, not that one thing did.
 */
export const gapLine = ({ unfilled = [] } = {}) => {
  const names = (unfilled || []).filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return `Nothing this week under ${names[0]}.`;
  const last = names[names.length - 1];
  return `Nothing this week under ${names.slice(0, -1).join(', ')} or ${last}.`;
};

/**
 * What you took.
 *
 * Before you have taken anything the paper says how much there is to take,
 * not that you have taken none — an unread edition is not a failed one.
 */
export const takenLine = ({ itemCount = 0, savedCount = 0 } = {}) => {
  const total = Number(itemCount) || 0;
  const taken = Number(savedCount) || 0;
  if (!total) return '';
  if (!taken) return `${total} source${total === 1 ? '' : 's'}.`;
  if (taken === total) return `All ${total} in your library.`;
  return `${taken} of ${total} in your library.`;
};

/** The items of one section, in the order the profile names them. */
export const bySection = ({ sections = [], items = [] } = {}) => {
  const known = new Set((sections || []).map(section => section.key));
  const ordered = (sections || []).map(section => ({
    ...section,
    items: (items || []).filter(item => item.section === section.key)
  }));
  /* An item filed under a section this profile does not name still gets read.
     The shape validator refuses those on the way in, so this only catches a
     profile whose sections changed after an edition was filed. */
  const orphans = (items || []).filter(item => !known.has(item.section));
  return orphans.length
    ? [...ordered, { key: '', label: 'Elsewhere', items: orphans }]
    : ordered;
};

/**
 * Who filed a column.
 *
 * A section byline, and it exists because the masthead stopped being the whole
 * truth: two agents can keep the same paper, and the masthead names whichever
 * of them wrote last. Silent when nothing is signed rather than guessing at
 * the reader's own agent.
 */
export const bylineFor = (items = []) => {
  const names = [...new Set((items || []).map(item => item.filedBy).filter(Boolean))];
  if (!names.length) return '';
  if (names.length === 1) return `Filed by ${names[0]}`;
  const last = names[names.length - 1];
  return `Filed by ${names.slice(0, -1).join(', ')} and ${last}`;
};

/**
 * The stand, arranged as papers rather than as a pile.
 *
 * Editions arrive newest-first across every profile, so two papers interleave
 * by date and neither reads as a thing that keeps turning up. Grouped by
 * profile and ordered oldest-to-newest, each becomes a run: a first issue, the
 * ones since, and the one being written now.
 */
export const byPaper = (editions = []) => {
  const papers = new Map();
  (Array.isArray(editions) ? editions : []).forEach((edition) => {
    if (!edition?.profile) return;
    if (!papers.has(edition.profile)) {
      papers.set(edition.profile, {
        profile: edition.profile,
        title: edition.profileLabel || edition.title,
        issueLabel: edition.issueLabel || 'Edition',
        issues: []
      });
    }
    papers.get(edition.profile).issues.push(edition);
  });

  return [...papers.values()].map((paper) => {
    const issues = paper.issues
      .slice()
      .sort((left, right) => Date.parse(left.windowStart) - Date.parse(right.windowStart));
    return { ...paper, issues, current: issues.length - 1 };
  /* The paper whose issue is freshest stands at the front of the stand. */
  }).sort((left, right) => (
    Date.parse(right.issues[right.issues.length - 1].windowStart)
    - Date.parse(left.issues[left.issues.length - 1].windowStart)
  ));
};

/**
 * Whether an agent has kept its promise, for one paper.
 *
 * A periodical is judged on whether it turned up. Consecutive by window rather
 * than by count — three issues filed in one afternoon are not a three-week run
 * — and measured against each paper's own rhythm, so a monthly is not accused
 * of missing fifty weeks. Below the floor it says nothing: two in a row is not
 * yet a habit.
 */
export const RUN_FLOOR = 2;

export const runLine = (issues = []) => {
  const starts = (Array.isArray(issues) ? issues : [])
    .map(issue => Date.parse(issue?.windowStart))
    .filter(Number.isFinite)
    .sort((left, right) => right - left);
  if (starts.length < RUN_FLOOR) return '';

  /* The paper's own cadence, taken from the gap it actually keeps. */
  const stride = starts[0] - starts[1];
  if (!(stride > 0)) return '';

  let run = 1;
  for (let i = 1; i < starts.length; i += 1) {
    const gap = starts[i - 1] - starts[i];
    if (gap > stride * 1.5 || gap < stride * 0.5) break;
    run += 1;
  }
  if (run < RUN_FLOOR) return '';
  const unit = stride > 20 * DAY_MS ? 'months' : (stride > 3 * DAY_MS ? 'weeks' : 'days');
  return `${run} ${unit} running, not one missed`;
};

/**
 * What arrived since you last stood here.
 *
 * A periodical has one question a list cannot answer: what is here that was
 * not here before. The mark is per issue and per browser — it is a reading
 * habit, not a fact about the edition — and an issue you have never opened
 * marks nothing, because everything in it is new and marking all of it says
 * nothing at all.
 */
const SEEN_KEY = 'noeis.editions.seen';

const seenAll = () => {
  try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (_error) { return {}; }
};

export const lastSeen = (editionId) => (editionId ? seenAll()[editionId] || '' : '');

export const markSeen = (editionId, at = new Date().toISOString()) => {
  if (!editionId) return;
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seenAll(), [editionId]: at }));
  } catch (_error) { /* a browser that refuses storage still reads the paper */ }
};

export const isNewSince = (item = {}, since = '') => {
  if (!since || !item?.filedAt) return false;
  const filed = Date.parse(item.filedAt);
  return Number.isFinite(filed) && filed > Date.parse(since);
};

/** "Two new since you last looked." Silent when nothing is. */
export const newSinceLine = (items = [], since = '') => {
  const fresh = (items || []).filter(item => isNewSince(item, since)).length;
  if (!fresh) return '';
  return `${fresh} new since you last looked`;
};

/** The folio: a paper knows what day it is. */
export const folioLine = (now = new Date()) => {
  const date = now instanceof Date ? now : new Date(now);
  const name = DAYS[date.getDay()];
  return `The ${name} ${date.getDay() === 0 || date.getDay() === 6 ? 'papers' : 'paper'}`;
};
