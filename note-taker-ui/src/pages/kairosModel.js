/*
 * Kairos — the morning a source was promised back.
 *
 * The control is English: Remind me. The paper's eyebrow is καιρός.
 * Daily cadence is a nag and is not offered.
 */

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export const KAIROS_EYEBROW = 'καιρός';
export const KAIROS_SENTENCE = 'You asked for this back.';
export const REMIND_WORD = 'Remind me';

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
