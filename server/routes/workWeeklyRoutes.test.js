const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { NotebookEntry, NotebookFolder } = require('../models');
const { inWork } = require('../models/knowledgeContext');
const { createWorkNoteReadiness } = require('../services/workNoteReadiness');
const { buildWorkNoteRouter } = require('./workNoteRoutes');
let mongo, server, base;
const user = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId();
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { autoIndex: false });
  const readiness = createWorkNoteReadiness({ NotebookEntry });
  assert.equal(await readiness.settled, true);
  const app = express(); app.use(express.json());
  app.use(buildWorkNoteRouter({ NotebookEntry, NotebookFolder, readiness, authenticateToken(req, res, next) {
    req.user = { id: req.headers['x-user'] || String(user) };
    if (req.headers['x-agent']) req.agentToken = { scopes: req.headers['x-agent'].split(',') };
    next();
  } }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/work-notes`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await mongo?.stop(); });
async function call(path = '', method = 'GET', body, headers = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  const text = await res.text(); let result; try { result = JSON.parse(text); } catch (_) { result = text; }
  return { status: res.status, body: result, headers: res.headers };
}
const priority = (id, taskIds = [], extra = {}) => ({ id, title: 'Apply to accelerators', taskIds, carriedFrom: null, status: 'active', reviewed: true, ...extra });
const save = (week, priorities, expectedRevision = null, headers) => call('/weeks/' + week, 'PUT', { priorities, expectedRevision, timeZone: 'America/Chicago' }, headers);
const task = async (values = {}) => NotebookEntry.create({ userId: user, knowledgeContext: 'work', title: 'Original task', occurredOn: '2026-11-10', workItem: { kind: 'task', plannedOn: '2026-11-12', history: [] }, ...values });

test('a week persists priority order and canonical task references without editing original task, source or dates', async () => {
  const note = await NotebookEntry.create({ userId: user, knowledgeContext: 'work', title: 'Meeting', content: 'Original words' });
  const linked = await task({ workItem: { kind: 'task', noteId: String(note._id), plannedOn: '2026-11-12', history: [] } });
  const first = await save('2026-11-16', [priority('accelerators', [String(linked._id)]), priority('battery')]);
  assert.equal(first.status, 201); assert.match(first.headers.get('cache-control'), /private/);
  assert.equal(first.body.knowledgeContext, 'work'); assert.equal(first.body.workItem.kind, 'week');
  assert.deepEqual(first.body.workItem.priorities.map(p => p.id), ['accelerators', 'battery']);
  assert.equal(first.body.revision, 0);
  const after = await inWork(NotebookEntry.findById(linked._id)).lean();
  assert.equal(after.revision, 0); assert.equal(after.workItem.noteId, String(note._id)); assert.equal(after.workItem.plannedOn, '2026-11-12');
  const reloaded = (await call()).body;
  assert.equal(reloaded.items.find(item => item._id === first.body._id).workItem.priorities[0].taskIds[0], String(linked._id));
  assert.equal(await NotebookEntry.findById(first.body._id), null);
});
test('create retries and competing first opens have one weekly identity; stale edits conflict with current data', async () => {
  const priorities = [priority('same')];
  const creates = await Promise.all([save('2026-11-23', priorities), save('2026-11-23', priorities)]);
  assert.ok(creates.every(result => [200, 201].includes(result.status)));
  assert.equal(creates[0].body._id, creates[1].body._id);
  assert.equal(await inWork(NotebookEntry.countDocuments({ userId: user, operationId: 'work-week:2026-11-23' })), 1);
  const competing = await save('2026-11-23', [priority('different')]);
  assert.equal(competing.status, 409); assert.equal(competing.body.current._id, creates[0].body._id);
  const updates = await Promise.all(['A', 'B'].map(title => save('2026-11-23', [priority('same', [], { title })], 0)));
  assert.deepEqual(updates.map(result => result.status).sort(), [200, 409]);
  const saved = updates.find(result => result.status === 200).body;
  const stale = updates.find(result => result.status === 409).body;
  assert.equal(stale.current.revision, 1); assert.deepEqual(stale.current.workItem.priorities, saved.workItem.priorities);
  const retry = await save('2026-11-23', saved.workItem.priorities, 0);
  assert.equal(retry.status, 200); assert.equal(retry.body.revision, 1);
});
test('later weeks retain earlier plans unchanged, and reject forged, duplicate or cross-boundary task links', async () => {
  const original = await save('2026-11-30', [priority('carry')]);
  const next = await save('2026-12-07', [priority('carry', [], { carriedFrom: '2026-11-30', reviewed: false })]);
  assert.equal(next.status, 201);
  await save('2026-12-07', [priority('carry', [], { carriedFrom: '2026-11-30', status: 'dropped', reviewed: true })], 0);
  assert.deepEqual((await call('/' + original.body._id)).body.workItem.priorities, original.body.workItem.priorities);
  const foreign = await task({ userId: other });
  const personal = await task({ knowledgeContext: 'personal' });
  const note = await task({ workItem: undefined });
  const appointment = await task({ workItem: { kind: 'appointment' } });
  for (const bad of [foreign, personal, note, appointment]) assert.equal((await save('2026-12-14', [priority('bad', [String(bad._id)])])).status, 400);
  const own = await task();
  assert.equal((await save('2026-12-14', [priority('one', [String(own._id)]), priority('two', [String(own._id)])])).status, 400);
  assert.equal((await save('2026-12-14', [priority('one', ['local-unsaved'])])).status, 400);
  for (const value of ['2026-12-15', '2026-02-30', 'nope']) assert.equal((await save(value, [])).status, 400);
  assert.equal((await save('2026-12-14', [priority('one', [], { carriedFrom: '2026-12-21' })])).status, 400);
  assert.equal((await save('2026-12-14', [priority('one', [], { title: '' })])).status, 400);
  assert.equal((await save('2026-12-14', [priority('one'), priority('one')])).status, 400);
  assert.equal((await save('2026-12-14', Array.from({ length: 21 }, (_, index) => priority(String(index))))).status, 400);
});
test('generic note routes cannot forge or rewrite weekly records and other accounts cannot read or overwrite them', async () => {
  const saved = await save('2026-12-21', [priority('owned')]);
  assert.equal(saved.status, 201);
  assert.equal((await call('/' + saved.body._id, 'GET', null, { 'x-user': String(other) })).status, 404);
  const theirs = await save('2026-12-21', [priority('other')], null, { 'x-user': String(other) });
  assert.equal(theirs.status, 201); assert.notEqual(saved.body._id, theirs.body._id);
  assert.equal((await call('/' + saved.body._id, 'PUT', { expectedRevision: 0, title: 'Corrupt week' })).status, 400);
  assert.equal((await call('', 'POST', { operationId: 'forged', workItem: { kind: 'week', plannedOn: '2026-12-28', priorities: [] } })).status, 400);
  assert.equal((await call('', 'POST', { operationId: 'work-week:2026-12-28', title: 'Occupy the week' })).status, 400);
  assert.equal((await save('2026-12-28', [], null, { 'x-agent': 'read' })).status, 403);
});
