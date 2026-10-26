import { createWorkSession } from './workSession';
import { projectItem } from './workPlannerModel';
const token = id => `x.${btoa(JSON.stringify({ id }))}.x`;
let server, api, session, online, loseReply;
const item = () => ({ _id: 'task', revision: 0, title: 'Confirm installation owner', content: '', folder: null, occurredOn: '2026-10-26', workItem: { kind: 'task', noteId: 'note', plannedOn: '2026-10-26', history: [] } });
beforeEach(async () => {
  localStorage.clear(); localStorage.setItem('token', token('owner')); server = item(); online = true; loseReply = false;
  api = { get: jest.fn(async () => ({ data: { entries: [{ _id: 'note', revision: 0, content: '<p>Original words</p>' }], items: [server], folders: [] } })), put: jest.fn(async (_, body) => {
    if (!online) throw Error('offline');
    const actions = body.workActions || [];
    if (actions.length && actions.every(action => server.workItem.history.some(event => event.operationId === action.operationId))) return { data: { ...server, _actionReplay: true } };
    if (body.expectedRevision !== server.revision) throw { response: { status: 409, data: { current: server } } };
    expect(body.workItem?.history).toBeUndefined();
    server = { ...server, ...body, workItem: { ...server.workItem, ...body.workItem, history: [...server.workItem.history, ...actions.map(action => ({ ...action, recordedAt: '2026-10-27T08:00:00Z' }))] }, revision: server.revision + 1 };
    delete server.workActions; delete server.expectedRevision;
    if (loseReply) { loseReply = false; throw Error('receipt lost'); }
    return { data: server };
  }) };
  session = createWorkSession({ token: token('owner'), api }); await session.load();
});
afterEach(() => session.dispose());
test('offline completion stays one durable item through reload and acknowledges its original action time', async () => {
  online = false; session.action('task', { type: 'complete', actionAt: '2026-10-26T23:50:00Z', timeZone: 'UTC' });
  expect(projectItem(session.items()[0])).toMatchObject({ completed: true, pending: true });
  await session.flush('task'); session.dispose(); session = createWorkSession({ token: token('owner'), api }); await session.load();
  expect(session.entries()).toHaveLength(1); expect(session.items()).toHaveLength(1);
  expect(session.canLeave()).toBe(true); online = true; expect(await session.flush('task')).toBe(true);
  expect(server.workItem.history).toHaveLength(1); expect(server.workItem.history[0].actionAt).toBe('2026-10-26T23:50:00Z');
  expect(projectItem(session.items()[0])).toMatchObject({ completed: true, pending: false });
});
test('lost completion receipt followed by another device edit replays the same operation without overwriting it', async () => {
  session.action('task', { type: 'complete' }); loseReply = true; await session.flush('task');
  server = { ...server, title: 'Other device clarified the owner', revision: server.revision + 1 };
  expect(await session.flush('task')).toBe(true);
  expect(session.items()).toHaveLength(1); expect(session.items()[0].title).toBe('Other device clarified the owner'); expect(server.workItem.history).toHaveLength(1);
});
test('lost receipt cannot discard unseen local metadata, and review rebase retains pending changes without duplicating an action', async () => {
  session.edit('task', { title: 'Local clarification' }); session.action('task', { type: 'complete' }); loseReply = true; await session.flush('task');
  server = { ...server, title: 'Remote clarification', revision: server.revision + 1 };
  expect(await session.flush('task')).toBe(false); expect(session.conflict('task').title).toBe('Remote clarification'); expect(session.entry('task').title).toBe('Local clarification');
  session.rebaseItem('task'); await session.flush('task'); expect(server.title).toBe('Local clarification'); expect(server.workItem.history).toHaveLength(1);
});
test('account switching and failed device storage never expose another owner or claim durable planning', async () => {
  const storage = { getItem: key => localStorage.getItem(key), setItem: () => { throw Error('quota'); }, get length() { return localStorage.length; }, key: n => localStorage.key(n) };
  session.dispose(); session = createWorkSession({ token: token('owner'), api, storage }); await session.load();
  session.action('task', { type: 'complete' }); expect(session.canLeave()).toBe(false); expect(session.status('task')).toMatch(/Not saved on this device/);
  localStorage.setItem('token', token('other')); expect(await session.flush('task')).toBe(false); expect(api.put).not.toHaveBeenCalled();
});
test('new capture freezes its original written day and caller folder across meeting-date edits', () => {
  const id = session.capture({ timeZone: 'America/Chicago', capturedAt: '2026-10-27T02:30:00Z', folder: 'customer' });
  session.edit(id, { occurredOn: '2026-10-23', content: 'A late meeting note' });
  expect(session.entry(id)).toMatchObject({ takenOn: '2026-10-26', occurredOn: '2026-10-23', folder: 'customer', timeZone: 'America/Chicago' });
});
test('newer action during a save retains its identity and follows the acknowledged history', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; }); const save = api.put.getMockImplementation();
  api.put.mockImplementationOnce(async (...args) => { const result = await save(...args); await gate; return result; });
  session.action('task', { type: 'complete' }); const flight = session.flush('task');
  session.action('task', { type: 'reopen' }); release(); expect(await flight).toBe(true);
  expect(server.workItem.history.map(event => event.type)).toEqual(['complete', 'reopen']);
  expect(new Set(server.workItem.history.map(event => event.operationId)).size).toBe(2);
  expect(projectItem(session.items()[0])).toMatchObject({ completed: false, pending: false });
});
