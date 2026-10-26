import { createWorkSession, workAccount, localDay, draftKey } from './workSession';

const token = id => `x.${btoa(JSON.stringify({ id }))}.x`;
const note = (extra = {}) => ({ _id: 'a', title: 'Charging windows', content: '<p>Original</p>', blocks: [], revision: 2, occurredOn: '2026-10-26', folder: 'f', workingState: { revision: 2, nextTimeLine: { text: '  Check the window.\n', target: null } }, ...extra });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let api, session;
beforeEach(() => {
  localStorage.clear(); localStorage.setItem('token', token('owner'));
  api = { get: jest.fn().mockResolvedValue({ data: { entries: [note()], folders: [] } }), post: jest.fn(), put: jest.fn(async (path, data) => ({ data: note({ ...data, _id: path.split('/').pop(), revision: data.expectedRevision + 1 }) })) };
  session = createWorkSession({ token: token('owner'), api });
});
afterEach(() => session.dispose());
test('account identity comes from the JWT id and local date uses calendar fields', () => {
  expect(workAccount(token('owner'))).toBe('owner');
  expect(workAccount('bad')).toBe('');
  expect(localDay({ getFullYear: () => 2026, getMonth: () => 9, getDate: () => 2 })).toBe('2026-10-02');
});
test('untouched capture makes no note; first words persist a stable untitled inbox draft', async () => {
  const id = session.capture(); expect(api.post).not.toHaveBeenCalled();
  session.edit(id, { content: '<p>First words</p>' });
  const draft = JSON.parse(localStorage.getItem(draftKey('owner')))[id];
  expect(draft.note).toMatchObject({ title: '', folder: null, content: '<p>First words</p>' });
  expect(draft.operationId).toBeTruthy(); expect(session.status(id)).toBe('On this device');
});
test('body and return line save in one revision; filing preserves occurrence date', async () => {
  await session.load(); session.edit('a', { folder: 'g', workingState: { nextTimeLine: { text: ' exact\n', target: null } } });
  await session.flush('a');
  expect(api.put.mock.calls[0][1]).toMatchObject({ expectedRevision: 2, occurredOn: '2026-10-26', folder: 'g', workingState: { nextTimeLine: { text: ' exact\n' } } });
  expect(session.status('a')).toBe('Saved');
});
test('typing during an in-flight save stays visible and serializes after acknowledgment', async () => {
  await session.load(); const pending = deferred(); api.put.mockReturnValueOnce(pending.promise);
  session.edit('a', { title: 'First' }); const saving = session.flush('a');
  session.edit('a', { title: 'Second' }); expect(session.entry('a').title).toBe('Second');
  pending.resolve({ data: note({ title: 'First', revision: 3 }) }); await saving;
  expect(session.entry('a').title).toBe('Second'); expect(api.put).toHaveBeenCalledTimes(2);
  expect(api.put.mock.calls[1][1]).toMatchObject({ expectedRevision: 3, title: 'Second' });
});
test('lost create acknowledgment retries its operation id after reload', async () => {
  const id = session.capture(); session.edit(id, { content: '<p>Keep me</p>' });
  api.post.mockRejectedValueOnce(new Error('offline')); await session.flush(id);
  const operationId = api.post.mock.calls[0][1].operationId; session.dispose();
  session = createWorkSession({ token: token('owner'), api });
  api.post.mockResolvedValue({ data: note({ _id: 'created', content: '<p>Keep me</p>', revision: 0 }) });
  await session.flush(id);
  expect(api.post.mock.calls[1][1].operationId).toBe(operationId);
  expect(session.entry(id)._id).toBe('created');
});
test('storage failure never claims device durability and keeps exact text in memory', () => {
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const id = session.capture(); session.edit(id, { content: 'uncropped' });
  expect(session.status(id)).toMatch(/Not saved/); expect(session.canLeave()).toBe(false);
  expect(session.entry(id).content).toBe('uncropped'); set.mockRestore();
});
test('conflict retains both versions and never overwrites automatically', async () => {
  await session.load(); session.edit('a', { title: 'Local version' });
  api.put.mockRejectedValue({ response: { status: 409, data: { current: note({ title: 'Server version', revision: 3 }) } } });
  await session.flush('a'); expect(session.entry('a').title).toBe('Local version');
  expect(session.conflict('a').title).toBe('Server version'); await session.flush('a'); expect(api.put).toHaveBeenCalledTimes(1);
  session.useServer('a'); expect(session.entry('a').title).toBe('Server version');
});
test('saving conflict as a new note preserves local prose and original server version', async () => {
  await session.load(); session.edit('a', { title: 'Local version' });
  api.put.mockRejectedValue({ response: { status: 409, data: { current: note({ title: 'Server version', revision: 3 }) } } });
  await session.flush('a'); const copy = session.saveAsNew('a');
  expect(session.entry(copy).title).toBe('Local version'); expect(session.entry('a').title).toBe('Server version');
});
test('expired authentication keeps the durable draft and never invokes shared auth handling', async () => {
  await session.load(); session.edit('a', { title: 'Keep' }); api.put.mockRejectedValue({ response: { status: 401 } });
  await session.flush('a'); expect(session.status('a')).toMatch(/Sign in to sync/);
  expect(api.put.mock.calls[0][2]).toMatchObject({ skipAuthHandling: true, headers: { Authorization: `Bearer ${token('owner')}` } });
  expect(localStorage.getItem(draftKey('owner'))).toContain('Keep');
});
test('account switch prevents queued writes and stale responses', async () => {
  await session.load(); session.edit('a', { title: 'Private' }); localStorage.setItem('token', token('other'));
  await session.flush('a'); expect(api.put).not.toHaveBeenCalled(); expect(session.isCurrent()).toBe(false);
  const other = createWorkSession({ token: token('other'), api }); expect(other.entries()).toEqual([]); other.dispose();
});
test('dispose aborts pending requests and ignores their response', async () => {
  const pending = deferred(); api.get.mockReturnValue(pending.promise); const loading = session.load(); session.dispose();
  pending.resolve({ data: { entries: [note()], folders: [] } }); await loading; expect(session.entries()).toEqual([]);
  expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
});
test('readiness failure retains local writing and shows retryable unavailability', async () => {
  const id = session.capture(); session.edit(id, { content: 'Keep' });
  api.post.mockRejectedValue({ response: { status: 503, data: { error: 'Work notes are not ready. Please retry shortly.' } } });
  await session.flush(id); expect(session.status(id)).toContain('not ready'); expect(session.entry(id).content).toBe('Keep');
});
test('overlong return line stays whole on explicit validation failure', async () => {
  await session.load(); session.edit('a', { workingState: { nextTimeLine: { text: 'x'.repeat(4001) } } });
  api.put.mockRejectedValue({ response: { status: 400, data: { error: 'The return line must be text of at most 4000 characters. Your note was not saved.' } } });
  await session.flush('a'); expect(session.entry('a').workingState.nextTimeLine.text).toHaveLength(4001); expect(session.status('a')).toContain('4000');
});
test('reload reconciles an acknowledged create with a newer local edit under its server id', async () => {
  localStorage.setItem(draftKey('owner'), JSON.stringify({ 'local-old': { note: note({ title: 'Newer local' }), operationId: 'create-one', dirty: true, version: 2 } }));
  session.dispose(); session = createWorkSession({ token: token('owner'), api }); await session.load();
  expect(session.entry('a').title).toBe('Newer local'); expect(session.entries()).toHaveLength(1);
});
test('Continue retry survives reload and keeps one operation identity', async () => {
  await session.load(); api.post.mockRejectedValueOnce(new Error('lost acknowledgment'));
  await expect(session.continueFrom(note(), 'continue-one')).rejects.toThrow(); session.dispose();
  session = createWorkSession({ token: token('owner'), api });
  expect(session.continuation()).toMatchObject({ operationId: 'continue-one', source: { _id: 'a', revision: 2 } });
  api.post.mockResolvedValue({ data: note({ _id: 'next', continuesFromEntryId: 'a' }) });
  await session.continueFrom(session.continuation().source, session.continuation().operationId);
  expect(api.post.mock.calls[1][1].operationId).toBe('continue-one'); expect(session.continuation()).toBeNull();
});
test('Continue source conflict clears uncertain operation and requires new review', async () => {
  api.post.mockRejectedValue({ response: { status: 409, data: { current: note({ revision: 3 }) } } });
  await expect(session.continueFrom(note(), 'old')).rejects.toBeTruthy(); expect(session.continuation()).toBeNull();
});
test('Continue will not submit when its retry identity cannot be retained', async () => {
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await expect(session.continueFrom(note(), 'intent')).rejects.toThrow(/device/); expect(api.post).not.toHaveBeenCalled(); set.mockRestore();
});
test('lost create receipt followed by new typing never replaces newer words with first creation', async () => {
  const id = session.capture(); session.edit(id, { content: '<p>First</p>' });
  api.post.mockRejectedValueOnce(new Error('lost response')); await session.flush(id);
  session.edit(id, { content: '<p>Second</p>' });
  api.post.mockResolvedValue({ data: note({ _id: 'created', content: '<p>First</p>', revision: 0 }) });
  api.put.mockImplementation(async (path, value) => ({ data: { _id: path.split('/').pop(), ...value, revision: value.expectedRevision + 1 } }));
  await session.flush(id);
  expect(session.entry(id).content).toBe('<p>Second</p>');
  expect(api.post.mock.calls[1][1]).toEqual(api.post.mock.calls[0][1]);
  expect(api.put.mock.calls[0][1]).toMatchObject({ content: '<p>Second</p>', expectedRevision: 0 });
});
test('replayed creation edited on another device becomes a conflict without rebasing local prose', async () => {
  const id = session.capture(); session.edit(id, { content: '<p>First</p>' });
  api.post.mockRejectedValueOnce(new Error('lost response')); await session.flush(id);
  session.edit(id, { content: '<p>New local words</p>' });
  api.post.mockResolvedValue({ data: note({ _id: 'created', content: '<p>Other device words</p>', revision: 1 }) });
  await session.flush(id);
  expect(api.put).not.toHaveBeenCalled(); expect(session.entry(id).content).toBe('<p>New local words</p>');
  expect(session.conflict(id).content).toBe('<p>Other device words</p>');
});
test('persisting another edit does not retain an untouched capture after reload', async () => {
  await session.load(); session.capture(); session.edit('a', { title: 'Actual words' });
  session.dispose(); session = createWorkSession({ token: token('owner'), api }); await session.load();
  expect(session.entries()).toHaveLength(1); expect(session.entry('a').title).toBe('Actual words');
});
test('an older list receipt cannot remove a note created while loading', async () => {
  const pending = deferred(); api.get.mockReturnValue(pending.promise); const loading = session.load();
  const id = session.capture(); session.edit(id, { content: '<p>New note</p>' });
  api.post.mockResolvedValue({ data: note({ _id: 'created', content: '<p>New note</p>', revision: 0 }) }); await session.flush(id);
  pending.resolve({ data: { entries: [note()], folders: [] } }); await loading;
  expect(session.entry(id).content).toBe('<p>New note</p>'); expect(session.entries()).toHaveLength(2);
});
