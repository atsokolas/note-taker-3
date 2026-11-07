// Work, the reader's private work notebook: what an agent approved with --work reads and writes.

import assert from 'assert';

import { NoeisClient } from '../src/client.js';

const clientWith = (responses) => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    const next = responses.shift();
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => next, text: async () => JSON.stringify(next) };
  };
  return { client: new NoeisClient({ token: 't', env: {}, fetchImpl }), calls };
};

const run = async () => {
  // One read hands over notes as snippets, lines with whether they are done, and folders with projects.
  {
    const { client } = clientWith([{
      entries: [{ _id: 'n1', title: 'Supplier sync', revision: 3, occurredOn: '2026-11-06', folder: 'f1', content: '<p>Six weeks &amp; counting.</p><p>Ask Sam.</p>' }],
      items: [
        { _id: 'l1', title: 'Send the quote', revision: 1, workItem: { kind: 'task', list: 'waiting', waitingOn: 'Sam', history: [{ type: 'complete', operationId: 'a' }, { type: 'undo', operationId: 'b', undoOf: 'a' }] } },
        { _id: 'l2', title: 'Book the room', revision: 2, workItem: { kind: 'task', history: [{ type: 'complete', operationId: 'c' }] } }
      ],
      folders: [{ _id: 'f1', name: 'Hiring', revision: 0 }, { _id: 'p1', name: 'Launch', kind: 'project', brief: 'Ship it', archivedAt: '2026-11-01' }]
    }]);
    const work = await client.listWork();
    assert.deepStrictEqual(work.notes[0], { id: 'n1', title: 'Supplier sync', revision: 3, occurredOn: '2026-11-06', folder: 'f1', project: null, updatedAt: null, snippet: 'Six weeks & counting. Ask Sam.' });
    assert.strictEqual(work.lines[0].done, false, 'an undone tick is not done');
    assert.strictEqual(work.lines[0].waitingOn, 'Sam');
    assert.strictEqual(work.lines[0].history, undefined);
    assert.strictEqual(work.lines[1].done, true);
    assert.deepStrictEqual(work.folders.map(folder => [folder.kind, folder.archived]), [['folder', false], ['project', true]]);
  }
  // Plain lines become paragraphs, escaped; a read gives them back as lines.
  {
    const { client, calls } = clientWith([
      { _id: 'n2', title: 'Notes', revision: 0, content: '<p>a &lt;b&gt;</p><p>c</p>' },
      { _id: 'n2', title: 'Notes', revision: 0, content: '<p>a &lt;b&gt;</p><p>c</p>' }
    ]);
    await client.createWorkNote({ title: 'Notes', text: 'a <b>\nc', folderId: 'f1' });
    assert.strictEqual(calls[0].method, 'POST');
    assert.strictEqual(calls[0].body.content, '<p>a &lt;b&gt;</p><p>c</p>');
    assert.strictEqual(calls[0].body.folder, 'f1');
    assert.ok(calls[0].body.operationId && calls[0].body.timeZone);
    assert.strictEqual((await client.getWorkNote({ noteId: 'n2' })).text, 'a <b>\nc');
  }
  // An update names the revision it read, touches only what it names, and ticks a line with an action.
  {
    const { client, calls } = clientWith([{ _id: 'l1', title: 'Send the quote', revision: 2, workItem: { kind: 'task', history: [{ type: 'complete', operationId: 'x' }] } }]);
    const line = await client.updateWorkNote({ noteId: 'l1', revision: 1, done: true });
    assert.strictEqual(calls[0].method, 'PUT');
    assert.deepStrictEqual(Object.keys(calls[0].body).sort(), ['expectedRevision', 'workActions']);
    assert.strictEqual(calls[0].body.expectedRevision, 1);
    assert.strictEqual(calls[0].body.workActions[0].type, 'complete');
    assert.strictEqual(line.done, true);
  }
  // A project is a folder of kind project.
  {
    const { client, calls } = clientWith([{ _id: 'p2', name: 'Launch', kind: 'project' }]);
    assert.strictEqual((await client.createWorkFolder({ name: 'Launch', project: true })).kind, 'project');
    assert.strictEqual(calls[0].body.kind, 'project');
  }
};

run().then(() => console.log('work tests passed'));
