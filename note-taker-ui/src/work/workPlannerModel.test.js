import { dayInZone, writtenDay, weekDays, projectItem, readPlan } from './workPlannerModel';
test('written days survive backdating, travel and midnight while a week remains calendar dates', () => {
  expect(dayInZone('2026-10-27T02:30:00Z', 'America/Chicago')).toBe('2026-10-26');
  expect(writtenDay({ takenOn: '2026-10-26', occurredOn: '2026-10-23' })).toBe('2026-10-26');
  expect(writtenDay({ occurredOn: '2026-10-23' })).toBe('2026-10-23');
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
test('a plan line reads a trailing day and time the way people say them', () => {
  const tuesday = '2026-10-27';
  expect(readPlan('send comp bands fri', tuesday)).toEqual({ title: 'send comp bands', plannedOn: '2026-10-30' });
  expect(readPlan('IC meeting thu 2pm', tuesday)).toEqual({ title: 'IC meeting', plannedOn: '2026-10-29', kind: 'appointment', startTime: '14:00', endTime: '14:30' });
  expect(readPlan('Lunch with Ana 12:30 tomorrow', tuesday)).toMatchObject({ title: 'Lunch with Ana', plannedOn: '2026-10-28', startTime: '12:30' });
  expect(readPlan('Weekly review tue', tuesday).plannedOn).toBe('2026-11-03');
  expect(readPlan('Late call 11:45pm', tuesday)).toMatchObject({ startTime: '23:45', endTime: '23:59' });
  expect(readPlan('Plan the Q3 2025 numbers', tuesday)).toEqual({ title: 'Plan the Q3 2025 numbers', plannedOn: '' });
  expect(readPlan('fri', tuesday)).toEqual({ title: 'fri', plannedOn: '' });
});
