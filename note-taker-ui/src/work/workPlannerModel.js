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
export const displayDay = (day, options = { weekday: 'long', day: 'numeric', month: 'short' }) => day ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`)).replace(',', '') : '';
export const KIND_LABEL = { task: 'Follow-up', question: 'Open question', appointment: 'Appointment' };
export const itemMetadata = item => Object.fromEntries(['kind', 'noteId', 'plannedOn', 'dueOn', 'priority', 'startTime', 'endTime'].filter(key => item?.[key] !== undefined).map(key => [key, item[key]]));

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
  const status = effective.filter(event => ['complete', 'reopen'].includes(event.type)).at(-1);
  const plans = effective.filter(event => event.type === 'plan'), plan = plans.at(-1);
  const previousPlannedOn = plan ? plans.at(-2)?.plannedOn || item.plannedOn : null;
  return { ...note, ...item, id: note._id || note.clientId, history, pending: pending.length > 0, completed: status?.type === 'complete', completedAt: status?.type === 'complete' ? status.actionAt : null, completedTimeZone: status?.type === 'complete' ? status.timeZone : null, completion: status, previousPlannedOn, plannedOn: plan ? plan.plannedOn : item.plannedOn || null };
}
