import { createWorkSession, workAccount, localDay, draftKey } from './workSession';

const token = id => `x.${btoa(JSON.stringify({ id }))}.x`;
const note = (extra = {}) => ({ _id: 'a', title: 'Charging windows', content: '<p>Original</p>', blocks: [], revision: 2, occurredOn: '2026-10-26', folder: 'f', workingState: { revision: 2, nextTimeLine: { text: '  Check the window.\n', target: null } }, ...extra });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let api, session;
beforeEach(() => {
  localStorage.clear(); localStorage.setItem('token', token('owner'));
  api = { get: jest.fn().mockResolvedValue({ data: { entries: [note()], items: [], folders: [] } }), post: jest.fn(), put: jest.fn(async (path, data) => ({ data: note({ ...data, _id: path.split('/').pop(), revision: data.expectedRevision + 1 }) })) };
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
  const reload = createWorkSession({ token: token('owner'), api });
  const draft = reload.pending()[0][1]; reload.dispose();
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
  const reload = createWorkSession({ token: token('owner'), api }); expect(reload.entry('a').title).toBe('Keep'); reload.dispose();
});
test('account switch prevents queued writes and stale responses', async () => {
  await session.load(); session.edit('a', { title: 'Private' }); localStorage.setItem('token', token('other'));
  await session.flush('a'); expect(api.put).not.toHaveBeenCalled(); expect(session.isCurrent()).toBe(false);
  const other = createWorkSession({ token: token('other'), api }); expect(other.entries()).toEqual([]); other.dispose();
});
test('dispose aborts pending requests and ignores their response', async () => {
  const pending = deferred(); api.get.mockReturnValue(pending.promise); const loading = session.load(); session.dispose();
  pending.resolve({ data: { entries: [note()], items: [], folders: [] } }); await loading; expect(session.entries()).toEqual([]);
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
  await session.load();
  const pending = deferred(); api.get.mockReturnValue(pending.promise); const loading = session.load();
  const id = session.capture(); session.edit(id, { content: '<p>New note</p>' });
  api.post.mockResolvedValue({ data: note({ _id: 'created', content: '<p>New note</p>', revision: 0 }) }); await session.flush(id);
  pending.resolve({ data: { entries: [note()], items: [], folders: [] } }); await loading;
  expect(session.entry(id).content).toBe('<p>New note</p>'); expect(session.entries()).toHaveLength(2);
});
test('unknown Continue outcome rejects replacement intents until the original receipt is recovered', async () => {
  const children = new Map(); let loseReply = true;
  api.post.mockImplementation(async (_path, payload) => {
    if (!children.has(payload.operationId)) children.set(payload.operationId, note({ _id: `child-${children.size}`, revision: 0 }));
    if (loseReply) { loseReply = false; throw new Error('lost reply'); }
    return { data: children.get(payload.operationId) };
  });
  await expect(session.continueFrom(note(), 'first')).rejects.toThrow('lost reply');
  await expect(session.continueFrom(note({ _id: 'other' }), 'replacement')).rejects.toThrow(/recover/i);
  expect(session.continuation().operationId).toBe('first');
  await session.continueFrom(session.continuation().source, 'first'); expect(children.size).toBe(1);
});
test('capture then Continue keeps one canonical source in the shelf', async () => {
  const id = session.capture(); session.edit(id, { content: 'New words' });
  api.post.mockResolvedValueOnce({ data: note({ _id: 'created', revision: 0 }) }); await session.flush(id);
  api.post.mockResolvedValueOnce({ data: note({ _id: 'child', revision: 0 }) });
  await session.continueFrom(session.entry(id), 'next');
  expect(session.entries().filter(item => item._id === 'created')).toHaveLength(1);
});
test('two tabs keep independent durable drafts when the other tab edits or saves', async () => {
  api.get.mockResolvedValue({ data: { entries: [note(), note({ _id: 'b' })], items: [], folders: [] } });
  const second = createWorkSession({ token: token('owner'), api });
  await session.load(); await second.load();
  session.edit('a', { content: 'Tab A offline words' }); second.edit('b', { content: 'Tab B offline words' });
  let reload = createWorkSession({ token: token('owner'), api });
  expect(reload.entry('a').content).toBe('Tab A offline words'); expect(reload.entry('b').content).toBe('Tab B offline words'); reload.dispose();
  await second.flush('b'); reload = createWorkSession({ token: token('owner'), api });
  expect(reload.entry('a').content).toBe('Tab A offline words'); expect(session.status('a')).toBe('On this device');
  reload.dispose(); second.dispose();
});
test('two tabs editing the same note retain both versions across reload and one successful save', async () => {
  const second = createWorkSession({ token: token('owner'), api }); await session.load(); await second.load();
  session.edit('a', { content: 'First tab version' }); second.edit('a', { content: 'Second tab version' });
  let reload = createWorkSession({ token: token('owner'), api });
  expect(reload.entries().map(item => item.content).sort()).toEqual(['First tab version', 'Second tab version']); reload.dispose();
  await second.flush('a'); reload = createWorkSession({ token: token('owner'), api });
  expect(reload.entries().map(item => item.content)).toEqual(['First tab version']);
  session.edit('a', { content: 'First tab newer version' }); reload.dispose(); reload = createWorkSession({ token: token('owner'), api });
  expect(reload.entries().map(item => item.content)).toEqual(['First tab newer version']);
  reload.dispose(); second.dispose();
});
test('editing a recovered version forks it without overwriting the still-open writer', async () => {
  await session.load(); session.edit('a', { content: 'Original tab version' });
  const recovered = createWorkSession({ token: token('owner'), api }); recovered.edit('a', { content: 'Recovered tab revision' });
  session.edit('a', { content: 'Original tab later words' });
  const reload = createWorkSession({ token: token('owner'), api });
  expect(reload.entries().map(item => item.content).sort()).toEqual(['Original tab later words', 'Recovered tab revision']);
  recovered.dispose(); reload.dispose();
});
test('storage removal updates durability instead of repeating a stale device receipt', async () => {
  await session.load(); session.edit('a', { content: 'Memory remains' }); localStorage.clear(); localStorage.setItem('token', token('owner'));
  session.refreshDrafts(); expect(session.status('a')).toMatch(/Not saved/); expect(session.canLeave()).toBe(false);
  expect(session.entry('a').content).toBe('Memory remains');
});
test('legacy drafts survive failed new-format persistence and remain readable after recovery', async () => {
  const legacy = { a: { note: note({ content: 'Legacy durable words' }), version: 1, dirty: true } };
  localStorage.setItem(draftKey('owner'), JSON.stringify(legacy)); session.dispose(); session = createWorkSession({ token: token('owner'), api });
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  session.edit('a', { content: 'New memory words' });
  expect(session.canLeave()).toBe(false); expect(localStorage.getItem(draftKey('owner'))).toBe(JSON.stringify(legacy)); set.mockRestore();
  const reload = createWorkSession({ token: token('owner'), api }); expect(reload.entry('a').content).toBe('Legacy durable words'); reload.dispose();
  session.edit('a', { content: 'New durable words' });
  const recovered = createWorkSession({ token: token('owner'), api });
  expect(recovered.entries().map(item => item.content).sort()).toEqual(['Legacy durable words', 'New durable words']); recovered.dispose();
});
test('separate pending continuation receipts survive reload and recovery removes only one', async () => {
  const prefix = `${draftKey('owner')}:continuation:`;
  localStorage.setItem(`${prefix}first`, JSON.stringify({ source: note(), operationId: 'first', occurredOn: '2026-10-26' }));
  localStorage.setItem(`${prefix}second`, JSON.stringify({ source: note({ _id: 'b' }), operationId: 'second', occurredOn: '2026-10-26' }));
  session.dispose(); session = createWorkSession({ token: token('owner'), api });
  expect(session.continuation().operationId).toBe('first');
  api.post.mockResolvedValue({ data: note({ _id: 'child', revision: 0 }) });
  await session.continueFrom(session.continuation().source, 'first');
  expect(session.continuation().operationId).toBe('second');
  const reload = createWorkSession({ token: token('owner'), api }); expect(reload.continuation().operationId).toBe('second'); reload.dispose();
});
test('failed continuation receipt cleanup retains the same recoverable identity in memory', async () => {
  api.post.mockResolvedValue({ data: note({ _id: 'child', revision: 0 }) });
  const remove = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage blocked'); });
  await expect(session.continueFrom(note(), 'first')).rejects.toThrow();
  expect(session.continuation().operationId).toBe('first'); remove.mockRestore();
  await session.continueFrom(note(), 'first'); expect(session.continuation()).toBeNull();
});
test('original account returning refreshes captured credentials without losing a memory-only draft', async () => {
  await session.load(); const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  session.edit('a', { content: 'Memory-only writing' }); set.mockRestore();
  localStorage.setItem('token', token('other')); expect(session.isCurrent()).toBe(false);
  const renewed = `x.${btoa(JSON.stringify({ id: 'owner', exp: 9999999999 }))}.renewed`;
  localStorage.setItem('token', renewed); session.resume(renewed); await session.flush('a');
  expect(api.put.mock.calls[0][2].headers.Authorization).toBe(`Bearer ${renewed}`);
  expect(session.entry('a').content).toBe('Memory-only writing');
});

test('Open drafts stay outside the sync queue and are scoped to account and note across reload', async () => {
  await session.load(); session.open.change('a', { title: 'Ask about tomorrow 2pm', kind: 'question' });
  expect(session.pending()).toEqual([]); expect(session.items()).toEqual([]);
  session.dispose(); session = createWorkSession({ token: token('owner'), api }); await session.load();
  expect(session.open.draft('a')).toMatchObject({ title: 'Ask about tomorrow 2pm', kind: 'question' });
  expect(session.open.draft('b').title).toBe('');
  const other = createWorkSession({ token: token('other'), api });
  expect(other.open.draft('a').title).toBe(''); other.dispose();
});
test.each(['task', 'question'])('Open %s handoff keeps literal title, actual folder and defaults; double submit is one item', async kind => {
  await session.load(); const before = JSON.parse(JSON.stringify(session.entry('a')));
  api.post.mockRejectedValue(new Error('offline'));
  session.open.change('a', { title: 'Ask about tomorrow 2pm', kind });
  const id = session.open.submit('a', 'UTC');
  expect(id).toBeTruthy(); expect(session.open.submit('a', 'UTC')).toBeNull();
  expect(session.entry(id)).toMatchObject({ title: 'Ask about tomorrow 2pm', folder: 'f', workItem: { kind, noteId: 'a', plannedOn: null, dueOn: null, priority: 0, startTime: '', endTime: '' } });
  expect(session.entry('a')).toEqual(before); expect(session.items()).toHaveLength(1);
  await session.flush(id); const first = api.post.mock.calls[0][1];
  session.dispose(); session = createWorkSession({ token: token('owner'), api }); await session.load();
  await session.flush(id); expect(api.post.mock.calls.at(-1)[1]).toEqual(first);
  expect(session.open.draft('a').title).toBe(''); expect(session.items()).toHaveLength(1);
});
test('Open draft follows a local parent through acknowledgment and flush preserves parent linkage', async () => {
  const parent = session.capture({ folder: 'f' }); session.edit(parent, { content: 'Local parent' });
  session.open.change(parent, { title: 'Unsubmitted question', kind: 'question' });
  api.post.mockImplementation(async (_, value) => ({ data: { ...value, _id: value.workItem ? 'child' : 'parent', revision: 0 } }));
  api.put.mockImplementation(async (_, value) => ({ data: { ...session.entry(parent), ...value, revision: value.expectedRevision + 1 } }));
  await session.flush(parent);
  expect(session.open.draft('parent').title).toBe('Unsubmitted question');
  const child = session.open.submit(parent, 'UTC'); await session.flush(child);
  expect(session.entry(child).workItem.noteId).toBe('parent');
  session.dispose(); session = createWorkSession({ token: token('owner'), api });
  api.get.mockResolvedValue({ data: { entries: [note({ _id: 'parent', operationId: api.post.mock.calls[0][1].operationId })], items: [], folders: [] } }); await session.load();
  expect(session.open.draft('parent').title).toBe('');
});
test('Open item waits for its unsynced parent, then retries both without replacing either identity', async () => {
  const parent = session.capture({ folder: null }); session.edit(parent, { content: 'Local parent' });
  session.open.change(parent, { title: 'Keep linked' }); api.post.mockRejectedValue(new Error('offline'));
  const child = session.open.submit(parent, 'UTC'); await session.flush(child);
  expect(api.post.mock.calls.every(([, value]) => !value.workItem)).toBe(true);
  expect(session.entry(child).workItem.noteId).toBe(parent);
  session.dispose(); session = createWorkSession({ token: token('owner'), api });
  api.post.mockImplementation(async (_, value) => ({ data: { ...value, _id: value.workItem ? 'child' : 'parent', revision: 0 } }));
  await session.flush(child); expect(session.entry(child).workItem.noteId).toBe('parent');
  expect(session.entries().filter(item => item._id === 'parent')).toHaveLength(1); expect(session.items()).toHaveLength(1);
});
test('Open storage failure keeps title in memory, blocks departure and makes no request until durable', async () => {
  await session.load(); const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  session.open.change('a', { title: 'Keep this title' });
  expect(session.canLeave()).toBe(false); expect(session.open.submit('a', 'UTC')).toBeNull();
  expect(session.open.draft('a').title).toBe('Keep this title'); expect(session.open.status('a')).toMatch(/not saved/i);
  expect(api.post).not.toHaveBeenCalled(); set.mockRestore();
  const id = session.open.submit('a', 'UTC'); expect(id).toBeTruthy(); expect(session.canLeave()).toBe(true);
  expect(session.open.draft('a').title).toBe('');
});
test('interrupted Open handoff reuses its durable identity after reload, including a failed draft clear', async () => {
  await session.load(); session.open.change('a', { title: 'Once only' });
  const remove = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('quota'); });
  const id = session.open.submit('a', 'UTC'); expect(id).toBeNull(); expect(session.items()).toHaveLength(1);
  const intent = session.pending()[0][1].operationId;
  session.dispose(); session = createWorkSession({ token: token('owner'), api }); await session.load(); remove.mockRestore();
  const recovered = session.open.submit('a', 'UTC'); expect(recovered).toBeTruthy();
  expect(session.pending()[0][1].operationId).toBe(intent); expect(session.items()).toHaveLength(1);
});
test('cancel only discards an unsubmitted Open draft and account switch cannot submit it', async () => {
  await session.load(); session.open.change('a', { title: 'Cancel me' }); session.open.cancel('a');
  expect(session.open.draft('a').title).toBe(''); expect(session.items()).toEqual([]);
  session.open.change('a', { title: 'Private' }); localStorage.setItem('token', token('other'));
  expect(session.open.submit('a', 'UTC')).toBeNull(); expect(api.post).not.toHaveBeenCalled();
});

test('a submitted Open link survives reload after only the parent was acknowledged', async () => {
  const parent = session.capture(); session.edit(parent, { content: 'Parent' });
  session.open.change(parent, { title: 'Child' }); const child = session.open.submit(parent, 'UTC');
  api.post.mockImplementation(async (_, value) => ({ data: { ...value, _id: value.workItem ? 'child' : 'parent', revision: 0 } }));
  api.put.mockImplementation(async (_, value) => ({ data: { ...session.entry(parent), ...value, revision: value.expectedRevision + 1 } }));
  await session.flush(parent); session.dispose();
  session = createWorkSession({ token: token('owner'), api });
  api.put.mockImplementation(async (_, value) => ({ data: { ...session.entry(child), ...value, revision: value.expectedRevision + 1 } }));
  await session.flush(child); expect(session.entry(child).workItem.noteId).toBe('parent');
  expect(api.post.mock.calls.at(-1)[1].workItem.noteId).toBe('parent');
});

test('Open on an untouched blank parent durably captures the parent before its first child', async () => {
  const parent = session.capture(); session.open.change(parent, { title: 'First question', kind: 'question' });
  const child = session.open.submit(parent, 'UTC');
  session.dispose(); session = createWorkSession({ token: token('owner'), api });
  expect(session.entry(parent)).toBeTruthy(); expect(session.entry(parent).content).toBe('');
  api.post.mockImplementation(async (_, value) => ({ data: { ...value, _id: value.workItem ? 'child' : 'parent', revision: 0 } }));
  api.put.mockImplementation(async (path, value) => ({ data: { ...session.entry(path.endsWith('/parent') ? parent : child), ...value, revision: value.expectedRevision + 1 } }));
  await session.flush(child); expect(session.entry(child).workItem.noteId).toBe('parent');
  expect(api.post.mock.calls.map(([, value]) => Boolean(value.workItem))).toEqual([false, true]);
});
test('two tabs preserve competing Open titles when a stale tab cancels or submits', async () => {
  await session.load(); session.open.change('a', { title: 'First title' });
  const second = createWorkSession({ token: token('owner'), api }); await second.load();
  expect(second.open.draft('a').title).toBe('First title'); second.open.change('a', { title: 'Second title' });
  session.open.change('a', { title: 'Third title' }); session.open.cancel('a');
  const reload = createWorkSession({ token: token('owner'), api }); await reload.load();
  expect(reload.open.drafts('a').map(value => value.title)).toContain('Second title');
  const id = second.open.submit('a', 'UTC'); expect(id).toBeTruthy();
  expect(second.entry(id).title).toBe('Second title'); expect(second.canLeave()).toBe(true);
  second.dispose(); reload.dispose();
});
test('recovery includes unsafe Open drafts and intentional discard permits departure', async () => {
  await session.load(); const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  session.open.change('a', { title: 'Only in this page', kind: 'question' });
  expect(session.open.recovery()).toEqual([expect.objectContaining({ title: 'Only in this page', kind: 'question' })]);
  expect(session.canLeave()).toBe(false); set.mockRestore();
  expect(session.open.discardUnsafe()).toBe(true); expect(session.canLeave()).toBe(true);
  expect(session.open.draft('a').title).toBe('');
});

test('an unsubmitted draft on a blank local note remains reachable after reload without auto-saving', async () => {
  const parent = session.capture({ folder: 'f' }); session.open.change(parent, { title: 'Not submitted' });
  session.dispose(); session = createWorkSession({ token: token('owner'), api }); await session.load();
  expect(session.entry(parent)).toBeTruthy(); expect(session.open.draft(parent).title).toBe('Not submitted');
  expect(session.pending()).toEqual([]); expect(api.post).not.toHaveBeenCalled();
});

test('Make Open begins a separate editable draft and Cancel reveals the previous draft intact', async () => {
  await session.load(); session.open.change('a', { title: 'Earlier draft', kind: 'question' });
  expect(session.open.begin('a', 'First line\nAsk tomorrow 2pm')).toBe(true);
  expect(session.open.draft('a')).toMatchObject({ title: 'First line\nAsk tomorrow 2pm', kind: 'task' });
  expect(session.open.drafts('a').map(draft => draft.title)).toEqual(expect.arrayContaining(['Earlier draft', 'First line\nAsk tomorrow 2pm']));
  expect(session.pending()).toEqual([]); session.open.cancel('a');
  expect(session.open.draft('a')).toMatchObject({ title: 'Earlier draft', kind: 'question' });
});
test('Make Open cannot overwrite an unsafe memory-only draft or cross an account boundary', async () => {
  await session.load(); const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  session.open.change('a', { title: 'Memory only' });
  expect(session.open.begin('a', 'Selected words')).toBe(false); expect(session.open.draft('a').title).toBe('Memory only');
  set.mockRestore(); localStorage.setItem('token', token('other'));
  expect(session.open.begin('a', 'Other account')).toBe(false); expect(session.open.draft('a').title).toBe('Memory only');
});

test('choosing an earlier draft cannot erase a memory-only Make Open title', async () => {
  await session.load(); session.open.change('a', { title: 'Earlier durable' });
  const earlier = session.open.drafts('a')[0].id;
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  session.open.begin('a', 'Memory-only selection');
  expect(session.canLeave()).toBe(false); session.open.choose('a', earlier);
  expect(session.open.draft('a').title).toBe('Memory-only selection');
  expect(session.open.recovery().map(draft => draft.title)).toContain('Memory-only selection'); expect(session.canLeave()).toBe(false);
  set.mockRestore();
});

test('a child recovers its parent identity when device writes fail after the parent is acknowledged', async () => {
  await session.load();
  const parent = session.capture(); session.edit(parent, { content: 'Parent words' });
  session.open.change(parent, { title: 'Linked child' }); const child = session.open.submit(parent, 'UTC');
  const parentIntent = session.pending().find(([id]) => id === parent)[1].operationId;
  let quota = false;
  const realSet = Storage.prototype.setItem;
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) { if (quota) throw new Error('quota'); return realSet.call(this, key, value); });
  api.post.mockImplementation(async (_, value) => { quota = !value.workItem; return { data: { ...value, _id: value.workItem ? 'child' : 'parent', revision: 0 } }; });
  api.put.mockImplementation(async (path, value) => ({ data: { ...value, _id: path.split('/').pop(), operationId: parentIntent, revision: value.expectedRevision + 1 } }));
  await session.flush(parent); session.dispose(); set.mockRestore(); quota = false;
  api.get.mockResolvedValue({ data: { entries: [note({ _id: 'parent', operationId: parentIntent, content: 'Parent words' })], items: [], folders: [] } });
  session = createWorkSession({ token: token('owner'), api }); await session.load();
  await session.flush(child); expect(session.entry(child).workItem.noteId).toBe('parent');
  expect(api.post.mock.calls.filter(([, value]) => value.workItem)).toHaveLength(1);
  expect(session.pending()).toEqual([]);
});
