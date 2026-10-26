import { dayInZone, writtenDay, weekDays, projectItem } from './workPlannerModel';
test('written days survive backdating, travel and midnight while a week remains calendar dates', () => {
  expect(dayInZone('2026-10-27T02:30:00Z', 'America/Chicago')).toBe('2026-10-26');
  expect(writtenDay({ takenOn: '2026-10-26', occurredOn: '2026-10-23' })).toBe('2026-10-26');
  expect(writtenDay({ createdAt: '2026-10-25T23:30:00Z', occurredOn: '2026-10-22' })).toBe('2026-10-25');
  expect(weekDays('2026-11-01')).toEqual(['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
});
test('completion and planned-day views derive one identity, respect undo and retain pending action time', () => {
  const complete = { operationId: 'done', type: 'complete', actionAt: '2026-10-26T23:50:00Z', recordedAt: '2026-10-27T08:00:00Z', timeZone: 'UTC' };
  const note = { _id: 'item', workItem: { kind: 'task', plannedOn: '2026-10-26', history: [complete] } };
  expect(projectItem(note)).toMatchObject({ id: 'item', completed: true, completedAt: complete.actionAt, plannedOn: '2026-10-26', pending: false });
  expect(projectItem({ ...note, workActions: [{ operationId: 'again', type: 'reopen', actionAt: '2026-10-27T08:05:00Z', timeZone: 'UTC' }] })).toMatchObject({ completed: false, pending: true });
  const moved = { ...note, workActions: [{ operationId: 'move', type: 'plan', plannedOn: '2026-10-27' }, { operationId: 'undo', type: 'undo', undoOf: 'move' }] };
  expect(projectItem(moved).plannedOn).toBe('2026-10-26');
  expect(projectItem({ ...note, workActions: [complete] }).history).toHaveLength(1);
});
