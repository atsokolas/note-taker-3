/**
 * How a paper reads.
 *
 * Two sentences the edition says about itself, and neither is a count for its
 * own sake. What the week left empty is an editorial fact — an AI weekly with
 * nothing under counterevidence is telling you something real. What you took
 * from it is the only measure of whether the paper did its job.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const day = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "Sep 1 – 7", or "Aug 30 – Sep 5" when the week crosses a month. */
export const windowLine = ({ windowStart, windowEnd } = {}) => {
  const start = day(windowStart);
  const end = day(windowEnd);
  if (!start || !end) return '';
  const left = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const right = start.getUTCMonth() === end.getUTCMonth()
    ? `${end.getUTCDate()}`
    : `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${left} – ${right}`;
};

export const issueLine = ({ issueLabel = 'Edition', number } = {}) => (
  Number.isFinite(Number(number)) && Number(number) > 0 ? `${issueLabel} ${number}` : ''
);

/**
 * What the paper admits about itself.
 *
 * Silence when the week covered its own shape — an edition that filled every
 * section has nothing to confess, and printing "0 sections empty" would be
 * filler. Never a count where a name will do: the reader needs to know it was
 * counterevidence that went missing, not that one thing did.
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
 * Whether an agent has kept its promise.
 *
 * An edition is a periodical, and the thing a periodical is judged on is
 * whether it turned up. A run of consecutive windows is the only fact on the
 * stand that says something about the agent rather than about the reading —
 * and it is the reason to trust the next one.
 *
 * Consecutive by window, not by count: three editions filed in one afternoon
 * are not a three-week run. Below the floor it says nothing, because two in
 * a row is not yet a habit.
 */
export const RUN_FLOOR = 3;

export const agentRunLine = (editions = []) => {
  const windows = (Array.isArray(editions) ? editions : [])
    .map(edition => Date.parse(edition?.windowStart))
    .filter(Number.isFinite)
    .sort((left, right) => right - left);
  if (windows.length < RUN_FLOOR) return '';

  const WEEK = 7 * 24 * 60 * 60 * 1000;
  let run = 1;
  for (let i = 1; i < windows.length; i += 1) {
    const gap = windows[i - 1] - windows[i];
    /* A window either follows the last one or it does not. Generous by a day
       either side, because a Sunday filing and a Monday one are the same week
       to a reader. */
    if (gap > WEEK * 1.5 || gap < WEEK * 0.5) break;
    run += 1;
  }
  return run >= RUN_FLOOR ? `${run} weeks running. Not a week missed.` : '';
};
