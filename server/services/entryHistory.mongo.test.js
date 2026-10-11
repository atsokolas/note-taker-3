const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { KEPT, STRETCH_MS, listRevisions, recordRevision } = require('./entryHistory');

const minutes = (count) => count * 60 * 1000;
// One local, ephemeral MongoDB for the file. Never the application database.
let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri());
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const note = (title, ...texts) => ({ title, blocks: texts.map((text, index) => ({ id: `b${index}`, type: 'paragraph', text })) });

test('real Mongo: a note keeps one revision per stretch of writing, its first words, restores and a cap', async () => {
  const { EntryRevision } = require('../models');
  const userId = new mongoose.Types.ObjectId();
  const entryId = new mongoose.Types.ObjectId();
  const start = new Date('2026-10-12T09:00:00Z');
  const at = (offset) => new Date(start.getTime() + offset);
  const save = (before, after, offset, extra = {}) => recordRevision({
    EntryRevision, userId, kind: 'note', entryId, before, beforeAt: new Date('2026-10-01T00:00:00Z'), after, now: at(offset), ...extra
  });
  const history = () => listRevisions({ EntryRevision, userId, kind: 'note', entryId });

  // The first save keeps what the note said before history began.
  await save(note('Costco', 'Members renew.'), note('Costco', 'Members renew.', 'Margins are thin.'), 0);
  let rows = await history();
  assert.deepEqual(rows.map(row => row.reason), ['edit', 'before']);
  assert.equal(new Date(rows[1].at).toISOString(), '2026-10-01T00:00:00.000Z');

  // Saves inside the stretch rewrite it; nothing new is added.
  await save(null, note('Costco', 'Members renew.', 'Margins are thin.', 'Fees are the business.'), minutes(4));
  rows = await history();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].snapshot.blocks.length, 3);

  // A save that changes nothing written is not a revision.
  await save(null, note('Costco', 'Members renew.', 'Margins are thin.', 'Fees are the business.'), minutes(5));
  assert.equal((await history()).length, 2);

  // After the stretch, a new revision begins.
  await save(null, note('Costco membership', 'Members renew.'), STRETCH_MS + minutes(1));
  rows = await history();
  assert.equal(rows.length, 3);

  // A restore stands alone, even inside a stretch, and says what it restored.
  const original = rows[2];
  await save(null, original.snapshot, STRETCH_MS + minutes(2), { restoredFrom: original.id });
  rows = await history();
  assert.equal(rows.length, 4);
  assert.equal(rows[0].reason, 'restore');
  assert.equal(new Date(rows[0].restoredFromAt).toISOString(), '2026-10-01T00:00:00.000Z');

  // Only the newest are kept.
  for (let index = 0; index < KEPT + 3; index += 1) {
    await save(null, note('Costco', `Draft ${index}`), STRETCH_MS * (index + 3));
  }
  rows = await history();
  assert.equal(rows.length, KEPT);
  assert.equal(rows[0].snapshot.blocks[0].text, `Draft ${KEPT + 2}`);

  // Another reader's history is not this one.
  assert.deepEqual(await listRevisions({ EntryRevision, userId: new mongoose.Types.ObjectId(), kind: 'note', entryId }), []);
});

test('a brand-new note keeps no empty "before"', async () => {
  const { EntryRevision } = require('../models');
  const scope = { userId: new mongoose.Types.ObjectId(), kind: 'note', entryId: new mongoose.Types.ObjectId() };
  await recordRevision({ EntryRevision, ...scope, before: note(''), after: note('', 'First line.') });
  const rows = await listRevisions({ EntryRevision, ...scope });
  assert.deepEqual(rows.map(row => row.reason), ['edit']);
});

test('real Mongo: saving a note through its route keeps its history, read back through the history route', async () => {
  const express = require('express');
  const { buildNotebookRouter } = require('../routes/notebookRoutes');
  const { buildEntryHistoryRouter } = require('../routes/entryHistoryRoutes');
  let server;
  try {
    const { EntryRevision, NotebookEntry } = require('../models');
    const userId = new mongoose.Types.ObjectId();
    const entry = await NotebookEntry.create({ userId, title: 'Costco', blocks: [{ id: 'a', type: 'paragraph', text: 'Members renew.' }] });
    const authenticateToken = (req, _res, next) => { req.user = { id: String(userId) }; next(); };
    const app = express();
    app.use(express.json());
    app.use(buildEntryHistoryRouter({ authenticateToken, EntryRevision }));
    app.use(buildNotebookRouter({
      authenticateToken,
      NotebookEntry,
      EntryRevision,
      NotebookFolder: {},
      ReferenceEdge: {},
      ensureNotebookBlocks: () => {},
      createBlockId: () => 'block',
      stripHtml: (value) => String(value || ''),
      normalizeItemType: (value, fallback) => value || fallback,
      parseClaimId: () => null,
      normalizeTags: (value) => value || [],
      syncNotebookReferences: async () => {},
      enqueueNotebookEmbedding: () => {},
      trackEvent: () => {},
      EVENT_NAMES: {},
      findHighlightById: async () => null
    }));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const url = `http://127.0.0.1:${server.address().port}`;
    const put = (body) => fetch(`${url}/api/notebook/${entry._id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await put({ title: 'Costco', blocks: [{ id: 'a', type: 'paragraph', text: 'Members renew.' }, { id: 'b', type: 'paragraph', text: 'Fees.' }] })).status, 200);
    const read = async () => (await (await fetch(`${url}/api/think/history/note/${entry._id}`)).json()).revisions;
    const rows = await read();
    assert.deepEqual(rows.map(row => row.reason), ['edit', 'before']);
    assert.deepEqual(rows[0].snapshot.blocks.map(block => block.text), ['Members renew.', 'Fees.']);

    assert.equal((await put({ title: 'Costco', blocks: rows[1].snapshot.blocks, restoredFrom: rows[1].id })).status, 200);
    const after = await read();
    assert.equal(after[0].reason, 'restore');
    assert.equal((await NotebookEntry.findById(entry._id)).blocks.length, 1);
    assert.equal((await fetch(`${url}/api/think/history/wiki/${entry._id}`)).status, 400);
  } finally {
    server?.close();
  }
});
