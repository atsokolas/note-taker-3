// Kinship between the lines of a case.
//
// Two lines are kin when they rest on the same source, or when they were
// written in the same week — the sitting a case came out of. Hovering either
// a citation or a date lights the rest, which is how the four blocks show a
// reader that a source reaches further than the line under the cursor.
//
// Nothing here infers a date. A line written before we stamped time has none,
// and is kin to nothing by week.

import { sourceHrefFromOrigin } from './judgmentModel';
import { normalizeSpaces } from '../utils/editorialText';

const list = (value) => (Array.isArray(value) ? value : []);

const time = (value) => {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

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
