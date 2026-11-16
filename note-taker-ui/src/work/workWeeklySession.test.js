import { createWorkSession } from './workSession';
const token = id => `x.${btoa(JSON.stringify({ id }))}.x`;
const priority = { id: 'apply', title: 'Apply to accelerators', taskIds: ['task'], carriedFrom: null, status: 'active', reviewed: true };
const week = (revision = 0, priorities = [priority]) => ({ _id: 'week', title: 'Week of 2026-11-16', operationId: 'work-week:2026-11-16', revision, workItem: { kind: 'week', plannedOn: '2026-11-16', priorities } });
let session, api, saved;
beforeEach(async () => {
  localStorage.clear(); localStorage.setItem('token', token('owner')); saved = week();
  api = { get: async () => ({ data: { entries: [], folders: [], items: [saved, { _id: 'task', title: 'Original', workItem: { kind: 'task' } }] } }), put: jest.fn(async (_, { expectedRevision, priorities }) => {
    if (expectedRevision !== saved.revision) throw { response: { status: 409, data: { error: 'This week changed elsewhere.', current: saved } } };
    saved = week(saved.revision + 1, priorities); return { data: saved };
  }) };
  session = createWorkSession({ token: token('owner'), api }); await session.load();
});
afterEach(() => { session.dispose(); });
test('weeks load separately from tasks and save the revision the author reviewed without duplicating tasks', async () => {
  expect(session.items()).toHaveLength(1); expect(session.weeks()).toHaveLength(1);
  const next = [{ ...priority, title: 'Submit the application' }];
  const result = await session.saveWeek('2026-11-16', next, 0, 'America/Chicago');
  expect(result.revision).toBe(1); expect(session.weeks()[0].workItem.priorities).toEqual(next);
  expect(session.items()[0].title).toBe('Original');
  expect(api.put).toHaveBeenCalledWith('/api/work-notes/weeks/2026-11-16', { priorities: next, expectedRevision: 0, timeZone: 'America/Chicago' }, expect.any(Object));
});
test('conflicts expose canonical week without silently resubmitting local changes', async () => {
  saved = week(1, [{ ...priority, title: 'Other device' }]);
  const next = [{ ...priority, title: 'My edit' }];
  await expect(session.saveWeek('2026-11-16', next, 0)).rejects.toMatchObject({ current: saved });
  expect(next[0].title).toBe('My edit'); expect(session.weeks()[0].workItem.priorities[0].title).toBe('Other device');
  expect(api.put).toHaveBeenCalledTimes(1);
});
test('a failed save does not publish unsaved changes as server data', async () => {
  api.put.mockRejectedValueOnce(Error('offline'));
  await expect(session.saveWeek('2026-11-16', [], 0)).rejects.toThrow(/Sync paused/);
  expect(session.weeks()[0].workItem.priorities).toEqual([priority]);
});
test('switching accounts before or during save cannot expose a weekly response', async () => {
  localStorage.setItem('token', token('other'));
  expect(await session.saveWeek('2026-11-16', [], 0)).toBeNull(); expect(api.put).not.toHaveBeenCalled();
  localStorage.setItem('token', token('owner'));
  let release;
  api.put.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const saving = session.saveWeek('2026-11-16', [], 0);
  await Promise.resolve(); await Promise.resolve();
  localStorage.setItem('token', token('other')); release({ data: week(1, []) });
  expect(await saving).toBeNull();
  localStorage.setItem('token', token('owner')); expect(session.weeks()[0].revision).toBe(0);
});
