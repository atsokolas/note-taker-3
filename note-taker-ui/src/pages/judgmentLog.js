// The opened case is two altitudes: a prior that does not grow, and a log
// that does. Why, Against, and Did share one newest-first spine. Falsifiers
// stay on the prior — they are the contract of holding the claim, not another
// card in the flood.
//
// Dated lines from this month sit with undated ones in the open band, because
// most of a case was written before we stamped time. Earlier months fold to a
// count. Nothing is inferred: a line without a date is not given one.

import { sourceHrefFromOrigin } from './judgmentModel';
import { normalizeSpaces } from '../utils/editorialText';

const list = (value) => (Array.isArray(value) ? value : []);

const time = (value) => {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

export const LOG_FILTERS = ['all', 'why', 'against'];

/** The month before this one, as a key: '2026-09' → '2026-08'. */
const previousMonthKey = (now) => {
  const at = new Date(time(now));
  if (Number.isNaN(at.getTime())) return '';
  return monthKey(new Date(at.getFullYear(), at.getMonth() - 1, 1));
};

const monthKey = (at) => {
  const atMs = time(at);
  if (Number.isNaN(atMs)) return 'undated';
  const date = new Date(atMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (key) => {
  if (key === 'undated' || key === 'now') return '';
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return '';
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
};

const currentMonthKey = (now) => monthKey(now);

/** ISO week (Monday start), so hovering a date can light the same week. */
export const weekKey = (value) => {
  const atMs = time(value);
  if (Number.isNaN(atMs)) return '';
  const date = new Date(atMs);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const asEntry = (line, kind, order) => ({
  id: line.id,
  kind,
  text: line.text,
  sources: list(line.sources),
  at: line.at || null,
  order
});

const byRecency = (left, right) => {
  const leftAt = time(left.at);
  const rightAt = time(right.at);
  const leftMs = Number.isNaN(leftAt) ? 0 : leftAt;
  const rightMs = Number.isNaN(rightAt) ? 0 : rightAt;
  if (rightMs !== leftMs) return rightMs - leftMs;
  return (right.order || 0) - (left.order || 0);
};

const entriesFrom = (view = {}) => {
  const why = list(view.why).map((line, order) => asEntry(line, 'why', order));
  const against = list(view.against).map((line, order) => asEntry(line, 'against', order));
  const did = list(view.whatIDid).map((line, order) => asEntry(line, 'did', order));
  return [...why, ...against, ...did].filter(entry => entry.text).sort(byRecency);
};

export const matchesLogFilter = (entry, filter) => {
  if (!filter || filter === 'all') return true;
  if (filter === 'why') return entry.kind === 'why';
  if (filter === 'against') return entry.kind === 'against';
  return true;
};

/** Groups for the log. The open band is this month plus anything undated. */
export const buildJudgmentLog = (view = {}, now = Date.now()) => {
  const entries = entriesFrom(view);
  const current = currentMonthKey(now);

  /* The log opens on what you did recently, not on what the calendar calls
     this month.
     Opening only the current calendar month meant that at midnight on the
     first, everything you had written — including yesterday — folded itself
     behind a disclosure, and a case you were in the middle of looked
     abandoned. A month boundary is a fact about the calendar, not about your
     thinking, so last month stays open alongside this one and the boundary
     stops being a cliff. The band is a month wide rather than N days because
     the log is grouped by month — a rule at the same grain as the thing it
     governs has no ragged edge to fall off. Anything older still collapses;
     that part was always right. */
  const previous = previousMonthKey(now);

  const open = [];
  const earlier = new Map();

  entries.forEach((entry) => {
    const key = monthKey(entry.at);
    if (key === 'undated' || key === current || key === previous) {
      open.push(entry);
      return;
    }
    const bucket = earlier.get(key) || [];
    bucket.push(entry);
    earlier.set(key, bucket);
  });

  const groups = [];
  if (open.length) {
    groups.push({
      id: 'now',
      label: '',
      open: true,
      entries: open
    });
  }

  [...earlier.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .forEach(([key, entries]) => {
      groups.push({
        id: key,
        label: monthLabel(key),
        open: false,
        entries
      });
    });

  if (!groups.length) return [];
  if (!groups.some(group => group.open)) groups[0].open = true;
  return groups;
};

export const filterLog = (groups = [], filter = 'all') => groups
  .map(group => ({
    ...group,
    entries: group.entries.filter(entry => matchesLogFilter(entry, filter))
  }))
  .filter(group => group.entries.length);

/** A line still in the composer is already saved; it is not yet a log row. */
export const omitEntry = (groups = [], id = '') => {
  if (!id) return groups;
  return groups
    .map(group => ({
      ...group,
      entries: group.entries.filter(entry => entry.id !== id)
    }))
    .filter(group => group.entries.length);
};

/* An inbox passage that already speaks in the log shares that source's [n].
   One that does not still carries a name to whisper — the same whisper the
   log uses — so hovering it is the same gesture as hovering a citation. */
export const sourceKinForCandidate = (view = {}, candidate = {}) => {
  const href = sourceHrefFromOrigin(candidate?.id, candidate?.url);
  const label = normalizeSpaces(candidate?.sourceLabel);
  const sources = [...list(view.why), ...list(view.against)]
    .flatMap(line => list(line.sources));
  const match = sources.find(source => (
    (href && source.href === href) || (label && source.label === label)
  ));
  if (match) return match;
  if (label) return { n: null, label, href };
  return null;
};

/* Inbox line, log row, and [n] are the same source when they share a number,
   a name, or a place. Filing a passage under a library href must not break
   kinship with the [n] that already whispered that name. */
export const speaksWith = (source = {}, kin = null) => {
  if (!kin || !source) return false;
  if (kin.n != null && source.n != null && kin.n === source.n) return true;
  if (kin.label && source.label && kin.label === source.label) return true;
  if (kin.href && source.href && kin.href === source.href) return true;
  return false;
};

export const sameWeek = (at, kin) => Boolean(kin?.week && weekKey(at) === kin.week);
