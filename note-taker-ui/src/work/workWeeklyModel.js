import { dayInZone, shiftDay } from './workPlannerModel';

export const weekRecord = (records, week) => records.find(record => record.workItem.plannedOn === week);

// A new week links unfinished work; it never moves, copies or redates a task.
export function carryWeek(previous, items, week) {
  if (!previous || previous.workItem.plannedOn >= week) return [];
  const open = new Set(items.filter(item => !item.completed && ['task', 'question'].includes(item.kind)).map(item => item._id));
  return previous.workItem.priorities.filter(priority => ['active', 'deferred'].includes(priority.status)).map(priority => ({
    ...priority, taskIds: priority.taskIds.filter(id => open.has(id)), status: 'active', reviewed: false, carriedFrom: previous.workItem.plannedOn
  }));
}

export function assignTask(priorities, taskId, priorityId, beforeId) {
  if (taskId === beforeId) return priorities;
  return priorities.map(priority => {
    const taskIds = priority.taskIds.filter(id => id !== taskId);
    if (priority.id === priorityId) {
      const index = taskIds.indexOf(beforeId);
      taskIds.splice(index < 0 ? taskIds.length : index, 0, taskId);
    }
    return { ...priority, taskIds };
  });
}

// History is shown as it stood at the end of that week, not today's checkbox state.
export function completionAtWeekEnd(item, week) {
  const end = shiftDay(week, 7);
  const history = (item.history || []).filter(event => dayInZone(event.actionAt, event.timeZone || 'UTC') < end);
  const undone = new Set();
  for (const event of [...history].reverse()) if (event.type === 'undo' && !undone.has(event.operationId)) undone.add(event.undoOf);
  return history.filter(event => !undone.has(event.operationId) && ['complete', 'reopen'].includes(event.type)).at(-1)?.type === 'complete';
}
