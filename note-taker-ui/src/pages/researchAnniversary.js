/**
 * "On this day you first held…" — but only when the memory is useful.
 *
 * The plan asks for a research anniversary and attaches a condition to it,
 * and the condition is the whole design. A product that wishes you happy
 * birthday on every belief is a product that has learned to fill silence,
 * which is the habit this codebase has spent a week unlearning. So the bar is
 * that the memory has to tell you something you would not otherwise be
 * looking at right now.
 *
 * Three gates, in the order they can be cheaply refused:
 *
 *   Eligibility — a real birth date, a whole number of years ago, today.
 *     Not "about a year". The day itself, in the reader's own calendar,
 *     because "on this day" is a claim about the day they are living in.
 *
 *   Quality — the years since have to have contained something. A belief you
 *     wrote once and never returned to has an anniversary in the same sense
 *     a filing cabinet has a birthday. What makes it worth saying is the
 *     shape of what happened: held unchanged, or revised N times, and either
 *     of those is interesting for opposite reasons.
 *
 *   Silence — everything else. No line, no card, no space reserved.
 *
 * The date comparison is deliberately local, not UTC. Elsewhere in this tree
 * a day someone *picked* is read back in UTC (see utils/calendarDate), and
 * that is right for a scheduled review. An anniversary is the opposite case:
 * it is about the day the reader is standing in, so it belongs to their clock.
 */
import { normalizeSpaces } from '../utils/editorialText';

/** How a held sentence records that it changed. */
const CHANGE_PREFIX = 'judgment-change-';

const ORDINAL = ['', 'a year', 'two years', 'three years', 'four years', 'five years'];

const yearsWord = (years) => ORDINAL[years] || `${years} years`;

const localDay = (value) => {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return { year: at.getFullYear(), month: at.getMonth(), day: at.getDate() };
};

/**
 * Whole years between two calendar days, or 0 when today is not the day.
 * A belief born on 29 February has an anniversary on 29 February; it does not
 * get a consolation prize on the 28th.
 */
const anniversaryYears = (bornAt, now) => {
  const born = localDay(bornAt);
  const today = localDay(now);
  if (!born || !today) return 0;
  if (born.month !== today.month || born.day !== today.day) return 0;
  const years = today.year - born.year;
  return years > 0 ? years : 0;
};

const revisionCount = (decisions = []) => (Array.isArray(decisions) ? decisions : [])
  .filter(decision => String(decision?.decisionId || '').startsWith(CHANGE_PREFIX))
  .length;

/**
 * The line, or ''. Callers render nothing at all on '' — no wrapper, no
 * reserved height, no "no anniversary today".
 */
export const describeAnniversary = ({
  bornAt = null,
  now = Date.now(),
  decisions = [],
  claim = ''
} = {}) => {
  const years = anniversaryYears(bornAt, now);
  if (!years) return '';
  // A sentence nobody can read is not a memory worth returning.
  if (!normalizeSpaces(claim)) return '';

  const revisions = revisionCount(decisions);
  const since = revisions === 0
    ? 'You have not changed a word of it.'
    : revisions === 1
      ? 'You have revised it once since.'
      : `You have revised it ${revisions} times since.`;

  return `On this day ${yearsWord(years)} ago you first held this. ${since}`;
};

export const __testables = { anniversaryYears, revisionCount };
