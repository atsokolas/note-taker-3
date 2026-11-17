const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { NotebookEntry, NotebookFolder } = require('../models');
const { createWorkNoteReadiness } = require('../services/workNoteReadiness');
const { buildWorkNoteRouter } = require('./workNoteRoutes');
const { draftWeekEdition } = require('../services/workWeekEdition');
let mongo, server, base, readiness, weekAnswer = async () => '{}', weekCalls = 0;
const user = new mongoose.Types.ObjectId();
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { autoIndex: false, monitorCommands: true });
  readiness = createWorkNoteReadiness({ NotebookEntry });
  assert.equal(await readiness.settled, true);
  const app = express(); app.use(express.json());
  const draftWeek = input => draftWeekEdition({ ...input, generate: async args => { weekCalls += 1; return weekAnswer(args); } });
  app.use(buildWorkNoteRouter({ NotebookEntry, NotebookFolder, readiness, draftWeek, authenticateToken(req, res, next) {
    req.user = { id: req.headers['x-user'] || String(user) }; req.agentToken = req.headers['x-agent'] && { scopes: req.headers['x-agent'].split(',') }; next();
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
  assert.equal((await call('', 'GET', null, { 'x-agent': 'read,agent-write' })).status, 403, 'read-write alone does not open Work');
  assert.equal((await call('/' + note._id, 'GET', null, { 'x-agent': 'read,work' })).body.title, 'Fictional review', 'a connection approved for Work reads it');
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

test('all Work operations stay unavailable while initialization is pending or failed', async () => {
  const isReady = readiness.isReady;
  readiness.isReady = () => false;
  try {
    for (const [path, method, body] of [
      ['', 'GET'], ['', 'POST', { operationId: 'not-ready' }],
      ['/folders', 'POST', { name: 'Unavailable' }],
      ['/' + user, 'GET'], ['/' + user, 'PUT', { expectedRevision: 0 }],
      ['/' + user + '/continue', 'POST', { operationId: 'not-ready-next', expectedRevision: 0, occurredOn: '2026-10-28' }]
    ]) {
      const response = await call(path, method, body);
      assert.equal(response.status, 503); assert.equal(response.body.code, 'work_unavailable');
    }
  } finally { readiness.isReady = isReady; }
});
test('Continue protects the source until its snapshot commits', async () => {
  const note = (await call('', 'POST', { operationId: 'fence-source', title: 'Confirmed' })).body;
  const before = (await call('/' + note._id)).body;
  let acquired, release;
  const acquisition = new Promise(resolve => { acquired = resolve; });
  const protectedInterval = new Promise(resolve => { release = resolve; });
  const create = NotebookEntry.create;
  NotebookEntry.create = async function (docs, ...args) {
    if (Array.isArray(docs) && docs[0].operationId === 'fenced-next') {
      acquired(); await protectedInterval;
    }
    return create.call(this, docs, ...args);
  };
  let continuing, editing, editCompleted = false, editSent;
  const editStarted = new Promise(resolve => { editSent = resolve; });
  const client = mongoose.connection.getClient();
  const commandStarted = event => {
    if (event.command.findAndModify && event.command.update?.$set?.title === 'Changed') editSent();
  };
  client.on('commandStarted', commandStarted);
  try {
    continuing = call('/' + note._id + '/continue', 'POST', { operationId: 'fenced-next', expectedRevision: 0, occurredOn: '2026-10-28' });
    await Promise.race([acquisition, continuing.then(() => { throw new Error('Continue ended before acquiring the source.'); })]);
    editing = call('/' + note._id, 'PUT', { expectedRevision: 0, title: 'Changed' }).then(result => { editCompleted = true; return result; });
    await editStarted;
    await Promise.race([editing, new Promise(resolve => setTimeout(resolve, 250))]);
    assert.equal(editCompleted, false, 'an edit must not commit inside Continue’s protected interval');
  } finally {
    release();
    if (continuing) assert.equal((await continuing).status, 201);
    if (editing) assert.equal((await editing).status, 200);
    NotebookEntry.create = create;
    client.off('commandStarted', commandStarted);
  }
  const after = (await call('/' + note._id)).body;
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.continuationFence, undefined);
});
test('return lines preserve accepted words exactly and reject over-limit input without saving any fields', async () => {
  const note = (await call('', 'POST', { operationId: 'exact-line', content: 'Original body' })).body;
  const text = '  The exact words.\n\t';
  const saved = await call('/' + note._id, 'PUT', { expectedRevision: 0, workingState: { nextTimeLine: { text } } });
  assert.equal(saved.status, 200); assert.equal(saved.body.workingState.nextTimeLine.text, text);
  const continued = await call('/' + note._id + '/continue', 'POST', { operationId: 'exact-line-next', expectedRevision: 1, occurredOn: '2026-10-28' });
  assert.equal(continued.body.continuationBridge.text, text);
  const before = (await call('/' + note._id)).body;
  const oversized = await call('/' + note._id, 'PUT', { expectedRevision: 1, content: 'Must not persist', workingState: { nextTimeLine: { text: 'x'.repeat(4001) } } });
  assert.equal(oversized.status, 400);
  assert.match(oversized.body.error, /4000/);
  assert.deepEqual((await call('/' + note._id)).body, before);
  const maximum = ' ' + 'x'.repeat(3998) + '\n';
  const boundary = await call('/' + note._id, 'PUT', { expectedRevision: 1, workingState: { nextTimeLine: { text: maximum } } });
  assert.equal(boundary.status, 200); assert.equal(boundary.body.workingState.nextTimeLine.text, maximum);
});
test('a note sits in one folder and can be part of one project, and a project keeps its brief, pause, closing line, links and Monday check-ins', async () => {
  const { body: folder } = await call('/folders', 'POST', { name: 'Meetings' });
  const { body: project } = await call('/folders', 'POST', { name: 'Fund II diligence', kind: 'project' });
  assert.equal(folder.kind, 'folder'); assert.equal(project.kind, 'project');
  const { body: note } = await call('', 'POST', { operationId: 'filed-twice', title: 'Call with Priya', folder: folder._id, project: project._id });
  assert.equal(note.folder, folder._id); assert.equal(note.project, project._id);
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 0, folder: project._id })).status, 400);
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 0, project: folder._id })).status, 400);
  const links = [{ kind: 'article', id: 'a1', title: 'SaaS churn benchmarks' }, { kind: 'wiki', id: 'w1', title: 'Acme Analytics' }];
  const saved = await call(`/folders/${project._id}`, 'PUT', { expectedRevision: 0, brief: 'IC memo with a yes or no.', paused: true, links });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.brief, 'IC memo with a yes or no.'); assert.ok(saved.body.pausedAt); assert.deepEqual(saved.body.links, links);
  assert.equal((await call(`/folders/${project._id}`, 'PUT', { expectedRevision: 1, links: [{ kind: 'email', id: 'x' }] })).status, 400);
  assert.equal((await call(`/folders/${project._id}`, 'PUT', { expectedRevision: 1, checkIns: [{ on: 'monday', text: 'Churn file' }] })).status, 400);
  const asked = await call(`/folders/${project._id}`, 'PUT', { expectedRevision: 1, checkIns: [{ on: '2026-11-09', text: '  Get the churn file. ' }] });
  assert.deepEqual(asked.body.checkIns, [{ on: '2026-11-09', text: 'Get the churn file.' }]);
  assert.deepEqual((await call('/projects')).body.map(item => item._id), [project._id], 'folders are not offered as projects');
  const done = await call(`/folders/${project._id}`, 'PUT', { expectedRevision: 2, paused: false, archived: true, closingLine: 'We passed.' });
  assert.equal(done.body.pausedAt, null); assert.ok(done.body.archivedAt); assert.equal(done.body.closingLine, 'We passed.');
  assert.deepEqual((await call('/projects')).body, [], 'done projects are not offered');
  assert.equal((await call('/projects', 'GET', undefined, { 'x-agent': '1' })).status, 403);
});

test('dated meeting sections round-trip in existing content and blocks without restamping the note', async () => {
  const original = '<p data-block-id="original"><strong>Supplier said six weeks.</strong></p>';
  const created = await call('', 'POST', { operationId: 'meeting-journal', title: 'Supplier meetings', content: original, occurredOn: '2026-10-20', capturedAt: '2026-10-20T23:30:00Z', timeZone: 'America/Chicago' });
  assert.equal(created.status, 201);
  const note = created.body;
  const content = original + '<h2 data-block-id="meeting">4 November 2026</h2><p data-block-id="answer">Now they said four weeks.</p>';
  const blocks = [{ id: 'original', type: 'paragraph', text: 'Supplier said six weeks.' }, { id: 'meeting', type: 'heading', level: 2, text: '4 November 2026' }, { id: 'answer', type: 'paragraph', text: 'Now they said four weeks.' }];
  const saved = await call('/' + note._id, 'PUT', { expectedRevision: note.revision, content, blocks });
  assert.equal(saved.status, 200);
  const loaded = await call('/' + note._id);
  assert.equal(loaded.body.content, content);
  assert.deepEqual(loaded.body.blocks.map(({ id, type, text, level }) => ({ id, type, text, level })), blocks.map(block => ({ level: 1, ...block })));
  for (const field of ['capturedAt', 'takenOn', 'timeZone', 'occurredOn']) assert.equal(loaded.body[field], note[field]);
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: note.revision, content: 'stale replacement' })).status, 409);
  assert.equal((await call('/' + note._id, 'GET', undefined, { 'x-user': String(new mongoose.Types.ObjectId()) })).status, 404);
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: saved.body.revision, content: 'other user' }, { 'x-user': String(new mongoose.Types.ObjectId()) })).status, 404);
  assert.equal((await call('/' + note._id)).body.content, content);
});

test('the week reads back as a new Work note that stays in Work, cites its entries and is never re-read as an entry', async () => {
  const owner = String(new mongoose.Types.ObjectId()), as = { 'x-user': owner };
  const write = (operationId, values) => call('', 'POST', { operationId, timeZone: 'America/Chicago', capturedAt: '2026-11-09T15:00:00Z', ...values }, as);
  await write('wk-1', { title: 'Fictional supplier', occurredOn: '2026-11-01', blocks: [{ id: 'h', type: 'heading', level: 2, text: '9 Nov 2026' }, { id: 'p', type: 'paragraph', text: 'Agreed the sample plan.' }] });
  await write('wk-2', { title: 'Fictional sync', occurredOn: '2026-11-10', blocks: [{ id: 'q', type: 'paragraph', text: 'Chose the blue option.' }] });
  await write('wk-old', { title: 'Last month', occurredOn: '2026-10-01', blocks: [{ id: 'r', type: 'paragraph', text: 'Out of range.' }] });
  await NotebookEntry.create({ title: 'Personal page', content: 'Personal writing.', userId: owner, occurredOn: '2026-11-10' });
  weekCalls = 0;
  let sent = '';
  weekAnswer = async ({ prompt }) => { sent = prompt; return JSON.stringify({ done: [{ line: 'Agreed the sample plan.', from: ['e1'] }], decisions: [{ line: 'Chose the blue option.', from: ['e2'] }] }); };
  const body = { operationId: 'week-1', through: '2026-11-11', timeZone: 'America/Chicago' };
  assert.equal((await call('/week-edition', 'POST', body, { ...as, 'x-agent': 'read,work' })).status, 403, 'an agent cannot spend Work on a draft');
  assert.equal((await call('/week-edition', 'POST', { ...body, through: 'Friday' }, as)).status, 400);
  const first = await call('/week-edition', 'POST', body, as);
  assert.equal(first.status, 201);
  assert.equal(first.body.note.title, 'Week of 5–11 Nov 2026');
  assert.equal(first.body.note.knowledgeContext, 'work');
  assert.equal(first.body.note.occurredOn, '2026-11-11');
  assert.ok(first.body.note.blocks.some(block => block.text === 'Agreed the sample plan. · Fictional supplier, 9 Nov'));
  assert.match(sent, /Chose the blue option/);
  assert.doesNotMatch(sent, /Personal writing|Out of range/, 'only this week of Work is read');
  const again = await call('/week-edition', 'POST', body, as);
  assert.equal(again.body.note._id, first.body.note._id, 'a repeated request returns the same draft');
  assert.equal(weekCalls, 1, 'and asks Claude once');
  assert.equal(await NotebookEntry.findById(first.body.note._id), null, 'the draft is not visible outside Work');
  const listed = await call('', 'GET', null, as);
  assert.ok(listed.body.entries.some(entry => entry._id === first.body.note._id), 'it opens like any other Work note');
  await call('/week-edition', 'POST', { ...body, operationId: 'week-2' }, as);
  assert.doesNotMatch(sent, /Drafted by Claude/, 'a past Edition is not read back as this week');
  const quiet = await call('/week-edition', 'POST', { ...body, operationId: 'week-quiet', through: '2026-09-01' }, as);
  assert.equal(quiet.status, 200);
  assert.equal(quiet.body.silence, 'No Work entries between 26 Aug and 1 Sept. Nothing to draft.');
  weekAnswer = async () => { throw Object.assign(new Error('upstream detail that must not leak'), { status: 529 }); };
  const failed = await call('/week-edition', 'POST', { ...body, operationId: 'week-3' }, as);
  assert.equal(failed.status, 502);
  assert.equal(failed.body.error, 'Claude could not draft the week just now. Your notes are unchanged. Try again.');
});
test('Trash is revisioned, reversible, owner-scoped and never deletes notes or linked tasks', async () => {
  const note = (await call('', 'POST', { operationId: 'trash-note', title: 'Keep all writing', content: '<p>Original</p>' })).body;
  const task = (await call('', 'POST', { operationId: 'trash-linked-task', title: 'Still open', workItem: { kind: 'task', noteId: note._id } })).body;
  const trashedAt = '2026-11-16T12:00:00.000Z';
  const trashed = await call('/' + note._id, 'PUT', { expectedRevision: 0, trashedAt });
  assert.equal(trashed.status, 200);
  assert.equal(trashed.body.trashedAt, trashedAt);
  assert.equal(trashed.body.content, '<p>Original</p>');
  assert.equal((await call('/' + task._id)).body.workItem.noteId, note._id);
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 0, trashedAt: null })).status, 409);
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 1, trashedAt: null }, { 'x-user': String(new mongoose.Types.ObjectId()) })).status, 404);
  assert.equal((await call('/' + task._id, 'PUT', { expectedRevision: 0, trashedAt })).status, 400);
  const listed = await call();
  assert.equal(listed.body.entries.find(entry => entry._id === note._id).trashedAt, trashedAt, 'Trash remains recoverable after reload');
  const restored = await call('/' + note._id, 'PUT', { expectedRevision: 1, trashedAt: null });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.trashedAt, null);
  assert.equal(restored.body.content, '<p>Original</p>');
  assert.equal(restored.body.revision, 2);
});

test('reviewed project deletion keeps cross-project tasks and prior Trash, restores its own batch after expiry', async () => {
  const project = (await call('/folders', 'POST', { name: 'Delete scope', kind: 'project', operationId: 'project-delete-scope' })).body;
  const other = (await call('/folders', 'POST', { name: 'Other project', kind: 'project', operationId: 'project-delete-other' })).body;
  const note = (await call('', 'POST', { title: 'Keep exact words', content: 'Exact original', project: project._id, operationId: 'delete-member-note' })).body;
  const prior = (await call('', 'POST', { title: 'Already in Trash', project: project._id, trashedAt: '2026-10-01T12:00:00.000Z', operationId: 'delete-prior-note' })).body;
  const task = (await call('', 'POST', { title: 'Linked no project', operationId: 'delete-linked-task', workItem: { kind: 'task', noteId: note._id } })).body;
  const direct = (await call('', 'POST', { title: 'Direct question', project: project._id, operationId: 'delete-direct-task', workItem: { kind: 'question' } })).body;
  const excluded = (await call('', 'POST', { title: 'Other canonical task', project: other._id, operationId: 'delete-excluded-task', workItem: { kind: 'task', noteId: note._id } })).body;
  const preview = await call(`/projects/${project._id}/delete-preview`);
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.counts, { notes: 1, tasks: 2, alreadyDeleted: 1, excludedTasks: 1 });
  assert.deepEqual(preview.body.entryIds.sort(), [note._id, task._id, direct._id].sort());
  const input = { expectedRevision: preview.body.revision, reviewToken: preview.body.reviewToken, operationId: 'delete-scope-batch' };
  const removed = await call(`/projects/${project._id}/delete`, 'POST', input);
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(removed.body.entries.length, 3);
  assert.equal(new Date(removed.body.receipt.expiresAt) - new Date(removed.body.receipt.deletedAt), 14 * 86400000);
  assert.ok(removed.body.entries.every(entry => entry.deletionBatchId === input.operationId && entry.trashedAt));
  assert.equal((await call('/' + note._id)).body.content, 'Exact original');
  assert.equal((await call('/' + prior._id)).body.trashedAt, prior.trashedAt);
  assert.equal((await call('/' + excluded._id)).body.trashedAt, null);
  assert.equal((await call('/' + excluded._id, 'PUT', { expectedRevision: 0, title: 'Still usable' })).status, 200, 'excluded canonical task remains editable');
  assert.equal((await call('/projects')).body.some(row => row._id === project._id), false);
  assert.equal((await call(`/projects/${project._id}/delete`, 'POST', input)).body.project.revision, removed.body.project.revision, 'retry is idempotent');
  assert.equal((await call('/' + note._id, 'PUT', { expectedRevision: 1, trashedAt: null })).status, 409, 'single-note restore cannot split project batch');
  assert.equal((await call('', 'POST', { operationId: 'create-deleted-project', project: project._id, title: 'No phantom' })).status, 409);
  assert.equal((await call('', 'POST', { operationId: 'link-deleted-project', title: 'No phantom linked task', workItem: { kind: 'task', noteId: note._id } })).status, 409);
  assert.equal((await call('/folders/' + project._id, 'PUT', { expectedRevision: removed.body.project.revision, name: 'No edit' })).status, 409);
  // The deadline never causes an automatic irreversible purge or blocks recovery.
  await NotebookFolder.collection.updateOne({ _id: new mongoose.Types.ObjectId(project._id) }, { $set: { 'deleted.expiresAt': new Date('2000-01-01') } });
  const restored = await call(`/projects/${project._id}/restore`, 'POST', { operationId: input.operationId });
  assert.equal(restored.status, 200);
  assert.ok(restored.body.project.deleted.restoredAt);
  assert.ok(restored.body.entries.every(entry => entry.trashedAt === null && entry.deletionBatchId === null));
  assert.equal((await call('/' + prior._id)).body.trashedAt, prior.trashedAt, 'pre-existing Trash is not restored');
  const replay = await call(`/projects/${project._id}/restore`, 'POST', { operationId: input.operationId });
  assert.equal(replay.body.project.revision, restored.body.project.revision);
  assert.equal((await call(`/projects/${project._id}/delete`, 'POST', input)).body.project.deleted.restoredAt, restored.body.project.deleted.restoredAt, 'late delete retry never re-deletes restored data');
});

test('project delete preview rejects changed membership and foreign owners', async () => {
  const project = (await call('/folders', 'POST', { name: 'Reviewed set', kind: 'project', operationId: 'reviewed-set' })).body;
  const preview = (await call(`/projects/${project._id}/delete-preview`)).body;
  const note = (await call('', 'POST', { title: 'Arrived after review', project: project._id, operationId: 'review-new-note' })).body;
  const input = { expectedRevision: preview.revision, reviewToken: preview.reviewToken, operationId: 'stale-reviewed-set' };
  assert.equal((await call(`/projects/${project._id}/delete`, 'POST', input)).status, 409);
  assert.equal((await call('/' + note._id)).body.trashedAt, null);
  const foreign = { 'x-user': String(new mongoose.Types.ObjectId()) };
  assert.equal((await call(`/projects/${project._id}/delete-preview`, 'GET', null, foreign)).status, 404);
  assert.equal((await call(`/projects/${project._id}/delete`, 'POST', input, foreign)).status, 404);
  assert.equal((await call(`/projects/${project._id}/restore`, 'POST', { operationId: input.operationId }, foreign)).status, 404);
});

test('project deletion racing a new note never leaves an active member in a deleted project', async () => {
  for (let index = 0; index < 3; index += 1) {
    const project = (await call('/folders', 'POST', { name: 'Racing project', kind: 'project', operationId: `racing-project-${index}` })).body;
    const preview = (await call(`/projects/${project._id}/delete-preview`)).body;
    const [removed, created] = await Promise.all([
      call(`/projects/${project._id}/delete`, 'POST', { expectedRevision: preview.revision, reviewToken: preview.reviewToken, operationId: `racing-delete-${index}` }),
      call('', 'POST', { project: project._id, operationId: `racing-note-${index}`, title: 'Concurrent' })
    ]);
    assert.ok([200, 409].includes(removed.status), JSON.stringify(removed));
    assert.ok([201, 409].includes(created.status), JSON.stringify(created));
    assert.equal(removed.status === 200 && created.status === 201, false, 'either membership review changes or the new writer is rejected');
  }
});

test('project review fingerprints revisions and linked-task membership, not just counts', async () => {
  const project = (await call('/folders', 'POST', { name: 'Exact review', kind: 'project', operationId: 'exact-review' })).body;
  const note = (await call('', 'POST', { title: 'Reviewed prose', project: project._id, operationId: 'exact-note' })).body;
  let preview = (await call(`/projects/${project._id}/delete-preview`)).body;
  await call('/' + note._id, 'PUT', { expectedRevision: 0, content: 'New prose since review' });
  const request = reviewed => ({ expectedRevision: reviewed.revision, reviewToken: reviewed.reviewToken, operationId: 'exact-batch' });
  assert.equal((await call(`/projects/${project._id}/delete`, 'POST', request(preview))).status, 409);
  preview = (await call(`/projects/${project._id}/delete-preview`)).body;
  const created = await call('', 'POST', { operationId: 'exact-linked', title: 'New linked task', workItem: { kind: 'task', noteId: note._id } });
  assert.equal(created.status, 201);
  assert.equal((await call(`/projects/${project._id}/delete`, 'POST', request(preview))).status, 409);
  const current = (await call(`/projects/${project._id}/delete-preview`)).body;
  assert.equal(current.counts.tasks, 1);
  assert.equal(current.revision, project.revision, 'membership fences do not change the user-facing project revision');
  const [first, retry] = await Promise.all([call(`/projects/${project._id}/delete`, 'POST', request(current)), call(`/projects/${project._id}/delete`, 'POST', request(current))]);
  assert.equal(first.status, 200); assert.equal(retry.status, 200);
  assert.equal(first.body.project.revision, retry.body.project.revision);
  // Restoration must not clear a later independently owned tombstone.
  await NotebookEntry.collection.updateOne({ _id: new mongoose.Types.ObjectId(note._id) }, { $set: { deletionBatchId: 'later-owner' } });
  const restored = await call(`/projects/${project._id}/restore`, 'POST', { operationId: 'exact-batch' });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.entries.find(entry => entry._id === note._id).deletionBatchId, 'later-owner');
  assert.ok(restored.body.entries.find(entry => entry._id === note._id).trashedAt);
  assert.equal(restored.body.entries.find(entry => entry._id === created.body._id).trashedAt, null);
});

const { workProjectDeletion } = require('./workProjectDeletion');
const { inWork } = require('../models/knowledgeContext');
const eraser = workProjectDeletion({ NotebookEntry, NotebookFolder });
async function erasureFixture(key, autoErase = true) {
  const project = (await call('/folders', 'POST', { name: 'Erase ' + key, brief: 'private brief', kind: 'project', operationId: 'erase-project-' + key })).body;
  const note = (await call('', 'POST', { title: 'private title', content: 'private prose', project: project._id, operationId: 'erase-note-' + key })).body;
  const preview = (await call(`/projects/${project._id}/delete-preview`)).body;
  const input = { expectedRevision: preview.revision, reviewToken: preview.reviewToken, operationId: 'erase-batch-' + key, ...(autoErase === undefined ? {} : { autoErase }) };
  const removed = await call(`/projects/${project._id}/delete`, 'POST', input);
  assert.equal(removed.status, 200, JSON.stringify(removed));
  return { project, note, input, removed: removed.body, deadline: new Date(removed.body.receipt.expiresAt) };
}
test('only explicit new consent erases at the exact deadline; identity receipts prevent resurrection', async () => {
  const legacy = await erasureFixture('legacy', false), current = await erasureFixture('exact');
  assert.equal(current.removed.receipt.autoErase, true); assert.equal(current.removed.receipt.consentVersion, 1);
  assert.equal(new Date(current.removed.receipt.consentedAt).getTime() + 14 * 86400000, current.deadline.getTime());
  await eraser.eraseDue({ now: new Date(current.deadline.getTime() - 1) });
  assert.equal((await call('/' + current.note._id)).status, 200);
  const results = await Promise.all([eraser.eraseDue({ now: current.deadline }), eraser.eraseDue({ now: current.deadline })]);
  assert.equal(results.reduce((sum, result) => sum + result.erased, 0), 1);
  assert.equal((await call('/' + current.note._id)).status, 404);
  assert.equal((await call('/' + legacy.note._id)).body.content, 'private prose');
  const raw = await NotebookEntry.collection.findOne({ _id: new mongoose.Types.ObjectId(current.note._id) });
  assert.ok(raw.erasedAt); assert.equal(raw.content, undefined); assert.equal(raw.title, undefined); assert.equal(raw.workingState, undefined);
  const folder = await NotebookFolder.collection.findOne({ _id: new mongoose.Types.ObjectId(current.project._id) });
  assert.equal(folder.brief, undefined); assert.ok(folder.deleted.erasedAt);
  assert.equal((await call(`/projects/${current.project._id}/restore`, 'POST', { operationId: current.input.operationId })).status, 410);
  assert.equal((await call('', 'POST', { operationId: 'erase-note-exact', content: 'stale replay' })).status, 410);
  const list = (await call()).body;
  assert.ok(!list.entries.some(entry => entry._id === current.note._id));
  assert.ok(list.erasedEntries.some(entry => entry._id === current.note._id));
  assert.ok(list.erasedProjects.some(entry => entry._id === current.project._id));
});
test('erasure preserves excluded tasks, prior Trash and independently copied continuations', async () => {
  const project = (await call('/folders', 'POST', { name: 'Preserved refs', kind: 'project', operationId: 'erase-refs-project' })).body;
  const other = (await call('/folders', 'POST', { name: 'Other refs', kind: 'project', operationId: 'erase-other-project' })).body;
  const note = (await call('', 'POST', { title: 'source', project: project._id, operationId: 'erase-refs-note' })).body;
  await call('/' + note._id, 'PUT', { expectedRevision: 0, workingState: { nextTimeLine: { text: 'Independent copied return line' } } });
  const continued = (await call('/' + note._id + '/continue', 'POST', { operationId: 'erase-refs-continuation', expectedRevision: 1, occurredOn: '2026-11-17' })).body;
  assert.equal((await call('/' + continued._id, 'PUT', { expectedRevision: 0, project: other._id })).status, 200);
  const prior = (await call('', 'POST', { title: 'prior trash', project: project._id, trashedAt: '2026-10-01', operationId: 'erase-refs-prior' })).body;
  const priorLinked = (await call('', 'POST', { title: 'linked prior-trash source', operationId: 'erase-refs-prior-linked', workItem: { kind: 'task', noteId: prior._id } })).body;
  const task = (await call('', 'POST', { title: 'independent task', project: other._id, operationId: 'erase-refs-task', workItem: { kind: 'task', noteId: note._id } })).body;
  const preview = (await call(`/projects/${project._id}/delete-preview`)).body;
  const removed = await call(`/projects/${project._id}/delete`, 'POST', { expectedRevision: preview.revision, reviewToken: preview.reviewToken, operationId: 'erase-refs-batch', autoErase: true });
  assert.equal(removed.status, 200);
  await eraser.eraseDue({ now: new Date(removed.body.receipt.expiresAt) });
  assert.equal((await call('/' + continued._id)).body.continuationBridge.text, 'Independent copied return line');
  assert.equal((await call('/' + priorLinked._id)).status, 404, 'active linked task to prior-Trash source is included');
  const preserved = (await call('/' + prior._id)).body;
  assert.equal(preserved.project, null); assert.ok(preserved.trashedAt);
  assert.equal((await call('/' + prior._id, 'PUT', { expectedRevision: preserved.revision, trashedAt: null })).status, 200);
  assert.equal((await call('/' + task._id, 'PUT', { expectedRevision: task.revision, title: 'still editable' })).status, 200);
  const unrelated = (await call('', 'POST', { operationId: 'erase-unrelated-task', project: other._id, workItem: { kind: 'task' } })).body;
  assert.equal((await call('/' + unrelated._id, 'PUT', { expectedRevision: 0, workItem: { ...unrelated.workItem, noteId: note._id } })).status, 400, 'task origin is immutable');
  assert.equal((await call('', 'POST', { operationId: 'erase-new-link', workItem: { kind: 'task', noteId: note._id }, project: other._id })).status, 409);
});
test('restoration cancels erasure, re-deletion needs new consent, and a mismatched member blocks atomically', async () => {
  const restored = await erasureFixture('restored');
  assert.equal((await call(`/projects/${restored.project._id}/restore`, 'POST', { operationId: restored.input.operationId })).status, 200);
  await eraser.eraseDue({ now: restored.deadline });
  assert.equal((await call('/' + restored.note._id)).body.content, 'private prose');
  const preview = (await call(`/projects/${restored.project._id}/delete-preview`)).body;
  await call(`/projects/${restored.project._id}/delete`, 'POST', { expectedRevision: preview.revision, reviewToken: preview.reviewToken, operationId: 'redelete-no-consent' });
  await eraser.eraseDue({ now: new Date(restored.deadline.getTime() + 100000) });
  assert.equal((await call('/' + restored.note._id)).body.content, 'private prose');
  const mismatch = await erasureFixture('mismatch');
  await NotebookEntry.collection.updateOne({ _id: new mongoose.Types.ObjectId(mismatch.note._id) }, { $set: { deletionBatchId: 'different-owner' } });
  const result = await eraser.eraseDue({ now: mismatch.deadline }); assert.ok(result.blocked >= 1);
  assert.equal((await call('/' + mismatch.note._id)).body.content, 'private prose');
  assert.equal((await inWork(NotebookFolder.findById(mismatch.project._id))).deleted.erasureBlocked, 'membership_changed');
});
test('corrupt early expiry cannot erase before fourteen days and restore races never yield partial erasure', async () => {
  const early = await erasureFixture('early');
  await NotebookFolder.collection.updateOne({ _id: new mongoose.Types.ObjectId(early.project._id) }, { $set: { 'deleted.expiresAt': new Date(0) } });
  await eraser.eraseDue({ now: new Date() });
  assert.equal((await call('/' + early.note._id)).status, 200);
  const race = await erasureFixture('race');
  const [restored] = await Promise.all([call(`/projects/${race.project._id}/restore`, 'POST', { operationId: race.input.operationId }), eraser.eraseDue({ now: race.deadline })]);
  assert.ok([200, 410].includes(restored.status));
  const row = await NotebookEntry.collection.findOne({ _id: new mongoose.Types.ObjectId(race.note._id) });
  if (restored.status === 200) { assert.equal(row.trashedAt, null); assert.equal(row.content, 'private prose'); }
  else { assert.ok(row.erasedAt); assert.equal(row.content, undefined); }
});
test('erasure rollback retains all content and history; weekly plans remain editable after successful erasure', async () => {
  const fixture = await erasureFixture('rollback');
  const { EntryRevision } = require('../models');
  await EntryRevision.create({ userId: user, kind: 'note', entryId: fixture.note._id, snapshot: { content: 'historical private prose' } });
  const foreign = await EntryRevision.create({ userId: new mongoose.Types.ObjectId(), kind: 'note', entryId: fixture.note._id, snapshot: { content: 'foreign copy' } });
  const replace = NotebookFolder.collection.replaceOne;
  NotebookFolder.collection.replaceOne = async function(filter, ...args) {
    if (String(filter._id) === fixture.project._id) throw new Error('synthetic final write failure');
    return replace.call(this, filter, ...args);
  };
  try { assert.ok((await eraser.eraseDue({ now: fixture.deadline })).failed >= 1); }
  finally { NotebookFolder.collection.replaceOne = replace; }
  assert.equal((await call('/' + fixture.note._id)).body.content, 'private prose');
  assert.equal(await EntryRevision.countDocuments({ userId: user, entryId: fixture.note._id }), 1);
  await eraser.eraseDue({ now: fixture.deadline });
  assert.equal(await EntryRevision.countDocuments({ userId: user, entryId: fixture.note._id }), 0);
  assert.ok(await EntryRevision.findById(foreign._id));
  const project = (await call('/folders', 'POST', { name: 'Week test', kind: 'project', operationId: 'erase-week-project' })).body;
  const task = (await call('', 'POST', { title: 'week task', project: project._id, operationId: 'erase-week-task', workItem: { kind: 'task' } })).body;
  const priorities = [{ id: 'kept', title: 'Independent priority', taskIds: [task._id], carriedFrom: null, status: 'active', reviewed: true }];
  const week = await call('/weeks/2026-11-16', 'PUT', { expectedRevision: null, priorities }); assert.equal(week.status, 201);
  const preview = (await call(`/projects/${project._id}/delete-preview`)).body;
  const removed = await call(`/projects/${project._id}/delete`, 'POST', { expectedRevision: preview.revision, reviewToken: preview.reviewToken, operationId: 'erase-week-batch', autoErase: true });
  await eraser.eraseDue({ now: new Date(removed.body.receipt.expiresAt) });
  const saved = await call('/weeks/2026-11-16', 'PUT', { expectedRevision: week.body.revision, priorities: [{ ...priorities[0], title: 'Still editable' }] });
  assert.equal(saved.status, 200, JSON.stringify(saved));
  assert.equal((await call('/' + task._id)).status, 404);
});
test('empty project erases and foreign member IDs fail closed without touching either account', async () => {
  const empty = (await call('/folders', 'POST', { name: 'Empty', brief: 'private', kind: 'project', operationId: 'erase-empty' })).body;
  const preview = (await call(`/projects/${empty._id}/delete-preview`)).body;
  const removed = await call(`/projects/${empty._id}/delete`, 'POST', { expectedRevision: preview.revision, reviewToken: preview.reviewToken, operationId: 'erase-empty-batch', autoErase: true });
  await eraser.eraseDue({ now: new Date(removed.body.receipt.expiresAt) });
  assert.ok((await NotebookFolder.collection.findOne({ _id: new mongoose.Types.ObjectId(empty._id) })).deleted.erasedAt);
  const own = await erasureFixture('foreign-member');
  const foreign = await NotebookEntry.create({ userId: new mongoose.Types.ObjectId(), knowledgeContext: 'work', content: 'Foreign private text', trashedAt: new Date(), deletionBatchId: own.input.operationId });
  await NotebookFolder.collection.updateOne({ _id: new mongoose.Types.ObjectId(own.project._id) }, { $push: { 'deleted.entryIds': foreign._id } });
  await eraser.eraseDue({ now: own.deadline });
  assert.equal((await call('/' + own.note._id)).body.content, 'private prose');
  assert.equal((await inWork(NotebookEntry.findById(foreign._id))).content, 'Foreign private text');
  assert.equal((await inWork(NotebookFolder.findById(own.project._id))).deleted.erasureBlocked, 'membership_changed');
});
