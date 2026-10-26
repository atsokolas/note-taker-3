const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { NotebookEntry, NotebookFolder } = require('../models');
const { createWorkNoteReadiness } = require('../services/workNoteReadiness');
const { buildWorkNoteRouter } = require('./workNoteRoutes');
let mongo, server, base, readiness;
const user = new mongoose.Types.ObjectId();
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { autoIndex: false, monitorCommands: true });
  readiness = createWorkNoteReadiness({ NotebookEntry });
  assert.equal(await readiness.settled, true);
  const app = express(); app.use(express.json());
  app.use(buildWorkNoteRouter({ NotebookEntry, NotebookFolder, readiness, authenticateToken(req, res, next) {
    req.user = { id: req.headers['x-user'] || String(user) }; req.agentToken = req.headers['x-agent']; next();
  } }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/work-notes`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await mongo?.stop(); });
async function call(path = '', method = 'GET', body, headers = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
const operation = name => ({ operationId: name, actionAt: '2026-10-26T10:42:00.000Z', timeZone: 'America/Chicago' });
const create = async (name, values = {}) => (await call('', 'POST', { operationId: name, ...values })).body;
test('written day is captured once in its timezone and stays separate from meeting date and folder', async () => {
  const note = await create('written-day', { capturedAt: '2026-10-27T02:30:00.000Z', timeZone: 'America/Chicago', occurredOn: '2026-10-23', title: 'Fictional pilot' });
  assert.equal(note.takenOn, '2026-10-26'); assert.equal(note.timeZone, 'America/Chicago');
  const forged = await call('/' + note._id, 'PUT', { expectedRevision: 0, takenOn: '2026-10-28', timeZone: 'Asia/Tokyo' });
  assert.equal(forged.status, 400);
  const edited = await call('/' + note._id, 'PUT', { expectedRevision: 0, occurredOn: '2026-10-22', content: 'New evidence' });
  assert.equal(edited.body.takenOn, '2026-10-26'); assert.equal(edited.body.occurredOn, '2026-10-22');
});
test('one linked Work item completes, reopens and plans idempotently without touching note prose', async () => {
  const note = await create('linked-note', { content: 'Original words', title: 'Fieldwell' });
  const task = await create('linked-task', { title: 'Confirm installation owner', workItem: { kind: 'task', noteId: note._id, plannedOn: '2026-10-26' } });
  const action = { ...operation('complete-once'), type: 'complete' };
  const saved = await call('/' + task._id, 'PUT', { expectedRevision: 0, workActions: [action] });
  assert.equal(saved.status, 200); assert.equal(saved.body.workItem.history.length, 1); assert.equal(saved.body.workItem.history[0].type, 'complete');
  assert.equal(saved.body.workItem.history[0].actionAt, action.actionAt); assert.ok(saved.body.workItem.history[0].recordedAt);
  const replay = await call('/' + task._id, 'PUT', { expectedRevision: 0, workActions: [action] });
  assert.equal(replay.status, 200); assert.equal(replay.body.revision, 1); assert.equal(replay.body.workItem.history.length, 1);
  const reopened = await call('/' + task._id, 'PUT', { expectedRevision: 1, workActions: [{ ...operation('reopen-once'), type: 'reopen' }] });
  assert.equal(reopened.body.workItem.history.length, 2);
  const moved = await call('/' + task._id, 'PUT', { expectedRevision: 2, workActions: [{ ...operation('move-once'), type: 'plan', plannedOn: '2026-10-27' }] });
  assert.equal(moved.body.workItem.history.at(-1).plannedOn, '2026-10-27');
  const undo = await call('/' + task._id, 'PUT', { expectedRevision: 3, workActions: [{ ...operation('undo-move'), type: 'undo', undoOf: 'move-once' }] });
  assert.equal(undo.body.workItem.history.at(-1).undoOf, 'move-once');
  const current = (await call('/' + note._id)).body; assert.equal(current.content, 'Original words'); assert.equal(current.revision, 0);
  const list = (await call()).body; assert.ok(list.items.some(x => x._id === task._id)); assert.ok(!list.entries.some(x => x._id === task._id));
});
test('Work item history and references cannot be forged, and competing actions conflict rather than overwrite', async () => {
  const personal = await NotebookEntry.create({ userId: user, content: 'Personal' });
  const other = await NotebookEntry.create({ userId: new mongoose.Types.ObjectId(), knowledgeContext: 'work' });
  for (const noteId of [String(personal._id), String(other._id)]) assert.equal((await call('', 'POST', { operationId: 'forbidden-' + noteId, workItem: { kind: 'task', noteId } })).status, 400);
  assert.equal((await call('', 'POST', { operationId: 'fake-history', workItem: { kind: 'task', history: [{ type: 'complete' }] } })).status, 400);
  const task = await create('racing-item', { workItem: { kind: 'question' }, title: 'What is still unknown?' });
  const results = await Promise.all(['complete', 'reopen'].map(type => call('/' + task._id, 'PUT', { expectedRevision: 0, workActions: [{ ...operation('race-' + type), type }] })));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
  assert.equal((await call('/' + task._id, 'GET', null, { 'x-user': String(new mongoose.Types.ObjectId()) })).status, 404);
  assert.equal(await NotebookEntry.findById(task._id), null);
  assert.equal((await call('', 'GET', null, { 'x-agent': 'yes' })).status, 403);
  assert.equal((await call('/' + task._id + '/continue', 'POST', { operationId: 'bad-item-continue', expectedRevision: 1, occurredOn: '2026-10-27' })).status, 400);
});
test('folder creation is repeatable; rename, reorder and archive preserve their contents', async () => {
  const a = await call('/folders', 'POST', { name: 'Fictional customer work', operationId: 'folder-once' });
  const again = await call('/folders', 'POST', { name: 'Fictional customer work', operationId: 'folder-once' });
  assert.equal(a.body._id, again.body._id);
  const b = await call('/folders', 'POST', { name: 'Launch', operationId: 'folder-two' });
  const note = await create('folder-note', { folder: a.body._id, content: 'Keep this writing' });
  const task = await create('folder-task', { folder: a.body._id, workItem: { kind: 'task', plannedOn: '2026-10-26' } });
  const renamed = await call('/folders/' + a.body._id, 'PUT', { expectedRevision: 0, name: 'Customer discovery' });
  assert.equal(renamed.status, 200);
  const ordered = await call('/folders/order', 'POST', { operationId: 'order-once', order: [{ id: b.body._id, revision: 0 }, { id: a.body._id, revision: 1 }] });
  assert.equal(ordered.status, 200);
  const list = ordered.body.folders; assert.equal(list[0]._id, b.body._id);
  const current = list.find(x => x._id === a.body._id);
  const archived = await call('/folders/' + a.body._id, 'PUT', { expectedRevision: current.revision, archived: true }); assert.equal(archived.status, 200); assert.ok(archived.body.archivedAt);
  assert.equal((await call('/' + note._id)).body.folder, a.body._id); assert.equal((await call('/' + task._id)).body.workItem.plannedOn, '2026-10-26');
  assert.equal((await call('', 'POST', { operationId: 'new-in-archive', folder: a.body._id })).status, 400);
  const restored = await call('/folders/' + a.body._id, 'PUT', { expectedRevision: archived.body.revision, archived: false }); assert.equal(restored.body.archivedAt, null);
  assert.equal((await call('/folders/' + a.body._id, 'PUT', { expectedRevision: 0, name: 'stale' })).status, 409);
});
test('manual appointments and daily jots are Work-only records; invalid dates, times and timestamps are rejected', async () => {
  for (const kind of ['appointment', 'jot']) {
    const item = await create('kind-' + kind, { content: 'Fictional planning', workItem: { kind, plannedOn: '2026-10-26', ...(kind === 'appointment' ? { startTime: '09:30', endTime: '10:15' } : {}) } });
    assert.equal(item.workItem.kind, kind); assert.equal(await NotebookEntry.findById(item._id), null);
  }
  for (const workItem of [{ kind: 'calendar-sync' }, { kind: 'task', dueOn: '2026-02-31' }, { kind: 'appointment', startTime: '25:00' }]) assert.equal((await call('', 'POST', { operationId: JSON.stringify(workItem), workItem })).status, 400);
  assert.equal((await call('', 'POST', { operationId: 'bad-zone', timeZone: 'Invented/Zone' })).status, 400);
  const task = await create('bad-time-task', { workItem: { kind: 'task' } });
  assert.equal((await call('/' + task._id, 'PUT', { expectedRevision: 0, workActions: [{ ...operation('bad-time'), type: 'complete', actionAt: 'wrong' }] })).status, 400);
});

test('a folder request cannot acknowledge a different mutation under the same identity', async () => {
  const folder = (await call('/folders', 'POST', { name: 'Reviewed folder', operationId: 'folder-replay-owner' })).body;
  const saved = await call('/folders/' + folder._id, 'PUT', { expectedRevision: 0, name: 'Confirmed name', operationId: 'rename-identity' });
  assert.equal(saved.status, 200);
  assert.equal((await call('/folders/' + folder._id, 'PUT', { expectedRevision: 0, name: 'Different name', operationId: 'rename-identity' })).status, 409);
  assert.equal((await call('/folders/' + folder._id, 'PUT', { expectedRevision: 0, name: 'Confirmed name', operationId: 'rename-identity' })).status, 200);
});
test('folders created before Weekfold can be renamed and reordered without a migration', async () => {
  const _id = new mongoose.Types.ObjectId(); await NotebookFolder.collection.insertOne({ _id, userId: user, knowledgeContext: 'work', name: 'Earlier Work folder' });
  const renamed = await call('/folders/' + _id, 'PUT', { expectedRevision: 0, name: 'Earlier folder kept', operationId: 'legacy-folder-rename' });
  assert.equal(renamed.status, 200); assert.equal(renamed.body.revision, 1);
  const _id2 = new mongoose.Types.ObjectId(); await NotebookFolder.collection.insertOne({ _id: _id2, userId: user, knowledgeContext: 'work', name: 'Other earlier folder' });
  const all = (await call()).body.folders.filter(folder => !folder.archivedAt);
  const order = all.map(folder => ({ id: folder._id, revision: folder.revision || 0 }));
  assert.equal((await call('/folders/order', 'POST', { operationId: 'legacy-folder-order', order })).status, 200);
});
