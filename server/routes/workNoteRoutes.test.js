const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { NotebookEntry, NotebookFolder } = require('../models');
const { buildWorkNoteRouter } = require('./workNoteRoutes');
let mongo, server, base;
const user = new mongoose.Types.ObjectId();
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri()); await NotebookEntry.init();
  const app = express(); app.use(express.json());
  app.use(buildWorkNoteRouter({ NotebookEntry, NotebookFolder, authenticateToken(req, res, next) {
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
test('durable create, guarded save, exact continuation, branching and privacy', async () => {
  const create = { operationId: 'create-1', title: 'Fictional review', occurredOn: '2026-10-26', content: 'original' };
  const responses = await Promise.all([call('', 'POST', create), call('', 'POST', create)]);
  assert.ok(responses.every(r => r.status < 300));
  const note = responses[0].body; assert.equal(note._id, responses[1].body._id);
  assert.equal(await NotebookEntry.findById(note._id), null);
  assert.equal((await call('/' + note._id, 'GET', null, { 'x-user': String(new mongoose.Types.ObjectId()) })).status, 404);
  assert.equal((await call('', 'GET', null, { 'x-agent': 'agent' })).status, 403);
  assert.equal((await call('', 'POST', { operationId: 'bad', blocks: [{ type: 'highlight-ref', highlightId: String(user) }] })).status, 400);
  const save = await call('/' + note._id, 'PUT', { expectedRevision: 0, title: 'New title', content: 'saved', blocks: [], workingState: { nextTimeLine: { text: 'Return here', target: { blockId: 'p1', offset: 2, baseText: 'saved' } } } });
  assert.equal(save.status, 200); assert.equal(save.body.revision, 1);
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 0, content: 'stale' })).status, 409);
  assert.equal((await call('/' + note._id + '/continue', 'POST', { operationId: 'stale', expectedRevision: 0, occurredOn: '2026-10-27' })).status, 409);
  const payload = { operationId: 'continue-1', expectedRevision: 1, expectedWorkbenchRevision: 1, occurredOn: '2026-10-27' };
  assert.equal((await call('/' + note._id + '/continue', 'POST', { ...payload, operationId: 'stale-workbench', expectedWorkbenchRevision: 0 })).status, 409);
  const next = await call('/' + note._id + '/continue', 'POST', payload);
  assert.equal(next.status, 201); assert.equal(next.body.content, '');
  assert.equal(next.body.continuationBridge.text, 'Return here'); assert.equal(next.body.continuationBridge.title, 'New title');
  assert.equal(next.body.continuationBridge.entryId, note._id);
  assert.equal(next.body.continuationBridge.target.blockId, 'p1');
  assert.equal(next.body.continuationBridge.target.baseText, 'saved');
  assert.equal((await call('', 'POST', { operationId: 'continue-1' })).status, 409);
  const retry = await call('/' + note._id + '/continue', 'POST', payload); assert.equal(retry.body._id, next.body._id);
  const branch = await call('/' + note._id + '/continue', 'POST', { ...payload, operationId: 'branch' }); assert.notEqual(branch.body._id, next.body._id);
  const source = await call('/' + note._id); assert.deepEqual(source.body, save.body);
  const blank = await call('/' + next.body._id + '/continue', 'POST', { operationId: 'blank', expectedRevision: 0, occurredOn: '2026-10-28' }); assert.equal(blank.body.continuationBridge, null);
  assert.equal(blank.body.continuesFromEntryId, next.body._id);
});
test('folder ownership, reference denial, immutable bridge and simultaneous source writes', async () => {
  const personalFolder = await NotebookFolder.create({ name: 'Personal', userId: user });
  const folder = await call('/folders', 'POST', { name: 'Work' }); assert.equal(folder.status, 201);
  const note = (await call('', 'POST', { operationId: 'more', occurredOn: '2026-10-26' })).body;
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 0, folder: String(personalFolder._id) })).status, 400);
  const filed = await call('/' + note._id, 'PUT', { expectedRevision: 0, folder: folder.body._id }); assert.equal(filed.body.occurredOn, '2026-10-26');
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 1, continuationBridge: { text: 'forged' } })).status, 400);
  for (const body of [{ linkedArticleId: String(user) }, { workingState: { materials: [{ kind: 'article', sourceId: String(user) }] } }]) {
    assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 1, ...body })).status, 400);
  }
  const writes = await Promise.all(['one', 'two'].map(content => call('/' + note._id, 'PUT', { expectedRevision: 1, content })));
  assert.deepEqual(writes.map(r => r.status).sort(), [200, 409]);
  const list = await call(''); assert.ok(list.body.entries.every(entry => entry.knowledgeContext === 'work'));
  const payload = { operationId: 'race-continue', expectedRevision: 2, occurredOn: '2026-10-27' };
  const continued = await Promise.all([call('/' + note._id + '/continue', 'POST', payload), call('/' + note._id + '/continue', 'POST', payload)]);
  assert.ok(continued.every(r => r.status === 201)); assert.equal(continued[0].body._id, continued[1].body._id);
  assert.equal(continued[0].body.folder, folder.body._id);
  assert.equal(continued[0].body.continuesFromEntryId, note._id);
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 2, continuesFromEntryId: String(user) })).status, 400);
});

test('a racing edit never changes the confirmed continuation snapshot', async () => {
  const note = (await call('', 'POST', { operationId: 'source-race' })).body;
  await call('/' + note._id, 'PUT', { expectedRevision: 0, title: 'Confirmed', workingState: { nextTimeLine: { text: 'Confirmed line' } } });
  const [continued, edited] = await Promise.all([
    call('/' + note._id + '/continue', 'POST', { operationId: 'source-race-next', expectedRevision: 1, expectedWorkbenchRevision: 1, occurredOn: '2026-10-28' }),
    call('/' + note._id, 'PUT', { expectedRevision: 1, title: 'Changed', workingState: { nextTimeLine: { text: 'Unconfirmed line' } } })
  ]);
  assert.equal(edited.status, 200);
  assert.ok([201, 409].includes(continued.status));
  if (continued.status === 201) {
    assert.equal(continued.body.continuationBridge.title, 'Confirmed');
    assert.equal(continued.body.continuationBridge.text, 'Confirmed line');
    const reloaded = await call('/' + continued.body._id);
    assert.deepEqual(reloaded.body.continuationBridge, continued.body.continuationBridge);
  }
});
