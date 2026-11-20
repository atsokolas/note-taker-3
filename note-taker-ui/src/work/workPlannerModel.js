export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const dayInZone = (value = new Date(), timeZone = deviceTimeZone()) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
export const writtenDay = note => note?.takenOn || ((note?.capturedAt || note?.createdAt) ? dayInZone(note.capturedAt || note.createdAt, note.timeZone || 'UTC') : '') || note?.occurredOn || '';
export const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
export const shiftDay = (day, count) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0, 10); };
export const weekDays = day => { const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); const monday = shiftDay(day, -(weekday || 7) + 1); return Array.from({ length: 7 }, (_, index) => shiftDay(monday, index)); };
// One way to say a day across Work: Mon 16 Nov, and 16 Nov 2025 once it isn't this year.
// A caller that names year, even as undefined, decides it: an entry heading always keeps its year.
export const displayDay = (day, options = { weekday: 'short', day: 'numeric', month: 'short' }) => {
  if (!day) return '';
  const otherYear = options.day && options.month && !('year' in options) && day.slice(0, 4) !== String(new Date().getFullYear());
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options, ...(otherYear && { year: 'numeric' }) }).format(new Date(`${day}T12:00:00Z`)).replace(',', '');
};
// 16–22 Nov, or 30 Nov – 6 Dec: a shared month is written once, as the weekly edition writes it.
// A range across New Year names both years; otherwise its end carries the year when one is needed.
export const displayRange = (from, to) => {
  const year = from.slice(0, 4) === to.slice(0, 4) ? undefined : 'numeric';
  const end = displayDay(to, { day: 'numeric', month: 'short', ...(year && { year }) });
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${end}`;
  return `${displayDay(from, { day: 'numeric', month: 'short', year })} – ${end}`;
};
export const KIND_LABEL = { task: 'To-do', question: 'Open question', appointment: 'Appointment' };
export const itemMetadata = item => Object.fromEntries(['kind', 'noteId', 'plannedOn', 'dueOn', 'priority', 'startTime', 'endTime', 'list', 'waitingOn', 'sortedOn', 'returnOn', 'oneThingOn', 'origin'].filter(key => item?.[key] !== undefined).map(key => [key, item[key]]));

// The same record is projected into its note, day and history. Pending actions
// carry their original identity and action time until the server acknowledges them.
export function projectItem(note) {
  const item = note.workItem || {}, recorded = item.history || [];
  const known = new Set(recorded.map(event => event.operationId));
  const pending = (note.workActions || []).filter(event => !known.has(event.operationId));
  const history = [...recorded, ...pending.map(event => ({ ...event, pending: true }))];
  const undone = new Set();
  for (const event of [...history].reverse()) if (event.type === 'undo' && !undone.has(event.operationId)) undone.add(event.undoOf);
  const effective = history.filter(event => event.type !== 'undo' && !undone.has(event.operationId));
  const completions = effective.filter(event => ['complete', 'reopen'].includes(event.type)), status = completions.at(-1);
  const plans = effective.filter(event => event.type === 'plan'), plan = plans.at(-1);
  const previousPlannedOn = plan ? plans.at(-2)?.plannedOn || item.plannedOn : null;
  return { ...note, ...item, id: note._id || note.clientId, history, pending: pending.length > 0, completed: status?.type === 'complete', completedAt: status?.type === 'complete' ? status.actionAt : null, completedTimeZone: status?.type === 'complete' ? status.timeZone : null, completion: status, completions, previousPlannedOn, plan, plannedOn: plan ? plan.plannedOn : item.plannedOn || null };
}

// "send comp bands fri", "IC meeting thu 2pm": a trailing day and time, read the way people say them.
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const CLOCK = /^(\d{1,2})(?::([0-5]\d))?(am|pm)?$/i;
const readClock = word => {
  const [, hour, minute = '00', half] = word.match(CLOCK) || [];
  if (!hour || (!half && word.indexOf(':') < 0)) return '';
  const hours = Number(hour) % (half ? 12 : 24) + (half?.toLowerCase() === 'pm' ? 12 : 0);
  return hours < 24 ? `${String(hours).padStart(2, '0')}:${minute}` : '';
};
const readDay = (word, today) => {
  const name = word.toLowerCase();
  if (name === 'today') return today;
  if (name === 'tomorrow') return shiftDay(today, 1);
  const weekday = name.length >= 3 ? WEEKDAYS.findIndex(day => day.startsWith(name)) : -1;
  if (weekday < 0) return '';
  const now = new Date(`${today}T12:00:00Z`).getUTCDay();
  return shiftDay(today, (weekday - now + 7) % 7 || 7);
};
const halfHourAfter = time => { const minutes = Math.min(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + 30, 23 * 60 + 59); return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; };
export function readPlan(text, today) {
  const words = text.trim().split(/\s+/);
  let plannedOn = '', startTime = '';
  for (let tries = 0; tries < 2 && words.length > 1; tries += 1) {
    const last = words[words.length - 1];
    if (!startTime && readClock(last)) startTime = readClock(words.pop());
    else if (!plannedOn && readDay(last, today)) plannedOn = readDay(words.pop(), today);
    else break;
  }
  return { title: words.join(' '), plannedOn, ...(startTime ? { kind: 'appointment', startTime, endTime: halfHourAfter(startTime) } : {}) };
}
