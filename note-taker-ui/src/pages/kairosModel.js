/*
 * Kairos — the morning a source was promised back.
 *
 * The control is English: Remind me. The paper's eyebrow is καιρός.
 * Daily cadence is a nag and is not offered.
 */

import { timeWord } from '../utils/timeWord.js';

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export const KAIROS_EYEBROW = 'καιρός';
export const KAIROS_SENTENCE = 'You asked for this back.';

/* The second firing of a weekly promise is not news, and pretending it is
   turns a kept promise into a notification. The paper acknowledges the repeat
   instead: same promise, still kept, and it knows you have seen it before.
   A one-off stays "You asked for this back." however often it was pushed —
   rescheduling is not recurrence. */
export const KAIROS_AGAIN = 'Again, as you asked.';

export const kairosSentence = ({ fired = 0, recurring = false } = {}) => (
  recurring && Number(fired) > 0 ? KAIROS_AGAIN : KAIROS_SENTENCE
);

const atLocalHour = (date, hours = 9) => {
  const next = new Date(date);
  next.setHours(hours, 0, 0, 0);
  return next;
};

export const addDays = (now, days) => {
  const next = atLocalHour(now);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

export const addMonths = (now, months = 1) => {
  const next = atLocalHour(now);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + Number(months || 0));
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next;
};

export const nextMonday = (now = new Date()) => {
  const next = atLocalHour(now);
  const weekday = next.getDay();
  const ahead = weekday === 1 ? 0 : (8 - weekday) % 7;
  next.setDate(next.getDate() + ahead);
  return next;
};

export const dueAtFromDateInput = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T09:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const remindPresets = (now = new Date()) => Object.freeze([
  { id: 'tomorrow', label: 'Tomorrow', dueAt: addDays(now, 1), cadence: null },
  { id: 'next-week', label: 'Next week', dueAt: addDays(now, 7), cadence: null },
  { id: 'in-a-month', label: 'In a month', dueAt: addMonths(now, 1), cadence: null },
  { id: 'every-monday', label: 'Every Monday', dueAt: nextMonday(now), cadence: 'weekly' }
]);

export const paperAskedBack = (rows = []) => (Array.isArray(rows) ? rows : [])
  .filter((row) => row?.articleId && clean(row.title))
  .slice(0, 3);

const weekdayOf = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { weekday: 'long' });
};

export const askedBackLine = (item = {}) => {
  const pile = item.fromPlacement === 'later'
    ? 'later'
    : item.fromPlacement === 'setAside'
      ? 'set aside'
      : '';
  const when = weekdayOf(item.fromAt);
  const left = [pile, when].filter(Boolean).join(' ');
  const why = clean(item.reason);
  return [left, why ? `from ${why}` : ''].filter(Boolean).join(' · ');
};

export const pendingRemindOf = (entries = [], articleId = '') => {
  const id = String(articleId || '').trim();
  if (!id) return null;
  return (Array.isArray(entries) ? entries : []).find((row) => (
    row?.status === 'pending'
    && String(row.itemType || '') === 'article'
    && String(row.itemId || '') === id
  )) || null;
};

/**
 * The promise ledger: every pending article promise, as the Later pile
 * prints it — `asked back — <title> · <day>`.
 *
 * Reads the return queue, which is the only place a promise lives; the pile
 * is only its door. Titles come off the hydrated item first and fall back to
 * the article at hand. A promise whose article is gone is not reprinted —
 * the queue row completes quietly elsewhere, and the ledger says nothing
 * rather than naming a piece nobody can open. The day is the product's one
 * time word, so the ledger, the cap, and the paper all say TUE together.
 */
export const promiseLedger = (entries = [], articlesById = null, now = Date.now()) => (
  (Array.isArray(entries) ? entries : [])
    .filter((row) => (
      row?.status === 'pending'
      && String(row?.itemType || '') === 'article'
      && String(row?.itemId || '').trim()
    ))
    .map((row) => {
      const id = String(row.itemId).trim();
      const held = articlesById?.get?.(id) || null;
      const title = clean(row?.item?.title) || clean(held?.title);
      if (!title) return null;
      return {
        key: String(row._id || row.id || id),
        articleId: id,
        title,
        href: `/library?articleId=${encodeURIComponent(id)}`,
        day: timeWord(row?.dueAt, { now, recurring: Boolean(row?.cadence) })
      };
    })
    .filter(Boolean)
);
