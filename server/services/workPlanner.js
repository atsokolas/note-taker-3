const fail = (status, message, current) => Object.assign(new Error(message), { status, current });
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validZone = value => { try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return typeof value === 'string' && Boolean(value); } catch (_) { return false; } };
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
function captureFields(body) {
  const timeZone = body.timeZone || 'UTC', capturedAt = body.capturedAt || new Date().toISOString();
  if (!validZone(timeZone) || !instant(capturedAt)) throw fail(400, 'Review the capture time and timezone.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(capturedAt)).map(part => [part.type, part.value]));
  return { capturedAt: new Date(capturedAt), timeZone, takenOn: `${parts.year}-${parts.month}-${parts.day}` };
}
async function workItemFields(input, current, findNote) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'Choose a Work item.');
  const allowed = ['kind', 'noteId', 'plannedOn', 'dueOn', 'priority', 'startTime', 'endTime'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw fail(400, 'Work item history is maintained by its actions.');
  const item = { ...current, ...input, history: current?.history || [] };
  if (!['task', 'question', 'appointment', 'jot'].includes(item.kind) || (current && current.kind !== item.kind)) throw fail(400, 'Choose a supported Work item kind.');
  if (item.noteId && !await findNote(item.noteId)) throw fail(400, 'Link one of your Work notes.');
  for (const key of ['plannedOn', 'dueOn']) if (item[key] && !validDay(item[key])) throw fail(400, 'Choose a valid calendar date.');
  if (current && input.plannedOn !== undefined && input.plannedOn !== current.plannedOn) throw fail(400, 'Move this item with a planning action.');
  if (item.priority !== undefined && (!Number.isInteger(item.priority) || item.priority < 0 || item.priority > 3)) throw fail(400, 'Choose one of three priority places.');
  for (const key of ['startTime', 'endTime']) if (item[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item[key])) throw fail(400, 'Choose a valid time.');
  if (item.kind === 'appointment' && item.startTime && item.endTime && item.endTime <= item.startTime) throw fail(400, 'The appointment must end after it starts.');
  return item;
}
function validateActions(actions) {
  if (!Array.isArray(actions) || actions.length > 100 || new Set(actions.map(action => action?.operationId)).size !== actions.length) throw fail(400, 'Choose distinct Work actions.');
  for (const action of actions) {
    if (!action || !['complete', 'reopen', 'plan', 'undo'].includes(action.type) || typeof action.operationId !== 'string' || !action.operationId.trim() || action.operationId.length > 160 || !instant(action.actionAt) || !validZone(action.timeZone)) throw fail(400, 'Review this action, its time and timezone.');
    if (action.type === 'plan' && action.plannedOn != null && !validDay(action.plannedOn)) throw fail(400, 'Choose a valid planned day.');
    if (action.type === 'undo' && typeof action.undoOf !== 'string') throw fail(400, 'Choose the action to undo.');
  }
}
const sameAction = (saved, action) => saved.type === action.type && saved.actionAt === new Date(action.actionAt).toISOString() && saved.timeZone === action.timeZone && (saved.plannedOn || null) === (action.plannedOn || null) && (saved.undoOf || null) === (action.undoOf || null);
function replayedActions(item, actions) {
  if (!actions?.length) return false;
  validateActions(actions);
  return actions.every(action => {
    const saved = item?.history?.find(event => event.operationId === action.operationId);
    if (saved && !sameAction(saved, action)) throw fail(409, 'This request was already used for another action.');
    return Boolean(saved);
  });
}
function applyWorkActions(item, actions = []) {
  if (!actions.length) return item;
  validateActions(actions);
  if (!item || item.kind === 'jot') throw fail(400, 'This item does not accept follow-up actions.');
  const history = [...(item.history || [])];
  for (const action of actions) {
    const saved = history.find(event => event.operationId === action.operationId);
    if (saved) { if (!sameAction(saved, action)) throw fail(409, 'This request was already used for another action.'); continue; }
    if (action.type === 'undo' && history.at(-1)?.operationId !== action.undoOf) throw fail(409, 'This item changed. Review its latest history before undoing.');
    if (['complete', 'reopen'].includes(action.type) && !['task', 'question'].includes(item.kind)) throw fail(400, 'Only tasks and questions have completion checkboxes.');
    history.push({ operationId: action.operationId, type: action.type, actionAt: new Date(action.actionAt).toISOString(), timeZone: action.timeZone, recordedAt: new Date().toISOString(), ...(action.type === 'plan' ? { plannedOn: action.plannedOn || null } : {}), ...(action.type === 'undo' ? { undoOf: action.undoOf } : {}) });
  }
  return { ...item, history };
}
module.exports = { fail, validDay, validZone, captureFields, workItemFields, replayedActions, applyWorkActions };
