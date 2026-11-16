import { carryWeek, assignTask, weekRecord, completionAtWeekEnd } from './workWeeklyModel';
const priority = (id, taskIds = [], extra = {}) => ({ id, title: id, taskIds, status: 'active', reviewed: true, carriedFrom: null, ...extra });
const record = (week, priorities) => ({ _id: week, workItem: { kind: 'week', plannedOn: week, priorities } });
const task = (id, completed = false) => ({ _id: id, id, kind: 'task', completed, history: [] });
test('rollover carries unfinished linked work and empty outcomes without rewriting last week', () => {
  const previous = record('2026-11-09', [priority('Apply', ['a', 'b']), priority('Think'), priority('Closed', [], { status: 'complete' }), priority('Dropped', [], { status: 'dropped' })]);
  const before = JSON.stringify(previous);
  const result = carryWeek(previous, [task('a'), task('b', true)], '2026-11-16');
  expect(result).toEqual([priority('Apply', ['a'], { carriedFrom: '2026-11-09', reviewed: false }), priority('Think', [], { carriedFrom: '2026-11-09', reviewed: false })]);
  expect(JSON.stringify(previous)).toBe(before);
});
test('active outcomes still carry when their linked tasks are complete or unavailable', () => {
  expect(carryWeek(record('2026-11-09', [priority('Deferred', ['a'], { status: 'deferred' }), priority('Done', ['b']), priority('Missing', ['x'])]), [task('a'), task('b', true)], '2026-11-23')).toEqual(['Deferred', 'Done', 'Missing'].map(id => priority(id, id === 'Deferred' ? ['a'] : [], { carriedFrom: '2026-11-09', reviewed: false })));
});
test('assigning one task moves its reference, supports insertion and never duplicates a task', () => {
  const original = [priority('One', ['a', 'b']), priority('Two', ['c'])];
  expect(assignTask(original, 'a', 'Two', 'c')).toEqual([priority('One', ['b']), priority('Two', ['a', 'c'])]);
  expect(assignTask(original, 'a', 'One', 'a')).toEqual(original);
  expect(assignTask(original, 'a', '')).toEqual([priority('One', ['b']), priority('Two', ['c'])]);
});
test('selecting a saved week never borrows another week and handles year boundaries', () => {
  const plans = [record('2026-12-28', [priority('A')]), record('2027-01-04', [priority('B')])];
  expect(weekRecord(plans, '2027-01-04')).toBe(plans[1]); expect(weekRecord(plans, '2027-01-11')).toBeUndefined();
});
test('historical completion uses the end of the selected week, including undo', () => {
  const item = { ...task('a', true), history: [{ type: 'complete', operationId: 'c', actionAt: '2026-11-18T12:00:00Z', timeZone: 'UTC' }] };
  expect(completionAtWeekEnd(item, '2026-11-09')).toBe(false); expect(completionAtWeekEnd(item, '2026-11-16')).toBe(true);
  item.history.push({ type: 'undo', operationId: 'u', undoOf: 'c', actionAt: '2026-11-19T12:00:00Z', timeZone: 'UTC' });
  expect(completionAtWeekEnd(item, '2026-11-16')).toBe(false);
});
