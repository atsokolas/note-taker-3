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
test('a follow-up captured beside an unsynced note waits for that same note identity before posting', async () => {
  session.dispose(); const saved = new Map(); let number = 0;
  const client = { get: async () => ({ data: { entries: [], items: [], folders: [] } }), post: jest.fn(async (_, body) => {
    if (body.workItem?.noteId?.startsWith('local-')) throw { response: { status: 400, data: { error: 'Link a saved Work note.' } } };
    const data = { ...body, _id: String(++number), revision: 0 }; saved.set(data._id, data); return { data };
  }), put: async (path, body) => { const id = path.split('/').pop(); const data = { ...saved.get(id), ...body, revision: body.expectedRevision + 1 }; saved.set(id, data); return { data }; } };
  session = createWorkSession({ token: token('owner'), api: client }); await session.load();
  const note = session.capture({ title: 'Local meeting' }); session.edit(note, { content: 'Words captured offline' });
  const task = session.capture({ title: 'Follow through', workItem: { kind: 'task', noteId: note } }); session.edit(task, { title: 'Follow through' });
  expect(await session.flush(task)).toBe(true);
  expect(client.post).toHaveBeenCalledTimes(2); expect(session.items()[0].workItem.noteId).toBe(session.entry(note)._id); expect(session.entries()).toHaveLength(1);
});
test('folder editing uses the revision the author actually reviewed, even after a refresh', async () => {
  const reviewed = { _id: 'folder', name: 'Reviewed name', revision: 2 };
  api.get.mockResolvedValue({ data: { entries: [], items: [], folders: [reviewed] } }); await session.load();
  api.get.mockResolvedValue({ data: { entries: [], items: [], folders: [{ ...reviewed, name: 'Other device renamed', revision: 3 }] } }); await session.load();
  api.put.mockResolvedValue({ data: { ...reviewed, name: 'My rename', revision: 3 } });
  await session.updateFolder(reviewed, { name: 'My rename' }, 'reviewed-intent');
  expect(api.put).toHaveBeenLastCalledWith('/api/work-notes/folders/folder', expect.objectContaining({ expectedRevision: 2 }), expect.anything());
});
test('a later action during a replayed receipt keeps remote metadata instead of resaving the stale snapshot', async () => {
  session.action('task', { type: 'complete' }); loseReply = true; await session.flush('task');
  server = { ...server, title: 'Remote title must survive', revision: server.revision + 1 };
  let release; const gate = new Promise(resolve => { release = resolve; }); const put = api.put.getMockImplementation();
  api.put.mockImplementationOnce(async (...args) => { const response = await put(...args); await gate; return response; });
  const retry = session.flush('task'); session.action('task', { type: 'reopen' }); release();
  expect(await retry).toBe(true); expect(server.title).toBe('Remote title must survive');
  expect(server.workItem.history.map(event => event.type)).toEqual(['complete', 'reopen']);
  expect(session.entry('task').title).toBe('Remote title must survive'); expect(session.conflict('task')).toBeFalsy();
});
test('continuation records the chosen timezone and first intent instant through a delayed retry', async () => {
  jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-10-27T02:30:00Z'));
  try {
    api.post = jest.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({ data: { _id: 'continued', revision: 0 } });
    await expect(session.continueFrom(session.entry('note'), 'continue-zoned', { timeZone: 'America/Chicago' })).rejects.toThrow('offline');
    jest.setSystemTime(new Date('2026-10-28T06:00:00Z'));
    await session.continueFrom(session.entry('note'), 'continue-zoned', { timeZone: 'Asia/Tokyo' });
    for (const [, body] of api.post.mock.calls) expect(body).toMatchObject({ capturedAt: '2026-10-27T02:30:00.000Z', timeZone: 'America/Chicago', occurredOn: '2026-10-26' });
  } finally { jest.useRealTimers(); }
});
test('a new frontend never sends planning or continuation writes to the previous API during rollout', async () => {
  api.get.mockResolvedValue({ data: { entries: [], folders: [] } }); await session.load();
  const id = session.capture({ title: 'Keep my pending follow-up', workItem: { kind: 'task' } }); session.edit(id, { title: 'Keep my pending follow-up' });
  api.post = jest.fn(); expect(await session.flush(id)).toBe(false); expect(api.post).not.toHaveBeenCalled(); expect(session.pending()).toHaveLength(1); expect(session.canLeave()).toBe(true);
  await expect(session.continueFrom({ _id: 'note' }, 'rollout-intent')).rejects.toThrow(/matching server/); expect(api.post).not.toHaveBeenCalled();
  api.get.mockResolvedValue({ data: { entries: [], items: [], folders: [] } }); await session.load();
  api.post.mockImplementation(async (_, body) => ({ data: { ...body, _id: 'saved-task', revision: 0 } }));
  api.put.mockImplementation(async (_, body) => ({ data: { ...body, _id: 'saved-task', revision: 1 } }));
  expect(await session.flush(id)).toBe(true); expect(session.items().filter(item => item._id === 'saved-task')).toHaveLength(1);
});
