const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildPencilRouter } = require('../pencilRoutes');
const { recordRevision, snapshotOf } = require('../../services/entryHistory');

/* The reader's verdicts through the real routes: ink keeps an agent's work,
   a strike takes it out (or gives a rewritten note back), and both are logged
   with what they were about. */
test('real Mongo: ink and strike agents\' pencil, and keep every verdict', async () => {
  const memory = await MongoMemoryServer.create();
  let server;
  try {
    await mongoose.connect(memory.getUri());
    const { Article, NotebookEntry, EntryRevision, Verdict } = require('../../models');
    const userId = new mongoose.Types.ObjectId();
    const tokenId = new mongoose.Types.ObjectId();
    const pencil = { agent: 'Noeis', tokenId, at: new Date() };
    let agent = false;
    const cleaned = [];

    const app = express();
    app.use(express.json());
    app.use(buildPencilRouter({
      authenticateToken: (req, _res, next) => { req.user = { id: String(userId) }; next(); },
      humanOnly: (_req, res, next) => (agent ? res.status(403).end() : next()),
      Article, NotebookEntry, Verdict, EntryRevision,
      deleteArticleEmbeddingState: async ({ articleId }) => cleaned.push(String(articleId)),
      deleteHighlightEmbeddingState: async ({ highlightId }) => cleaned.push(String(highlightId))
    }));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const post = async (path, body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { code: response.status, ...(await response.json().catch(() => ({}))) };
    };

    // The reader wrote a note; the agent rewrote it straight after, in its own stretch of history.
    const paragraph = text => [{ id: 'b1', type: 'paragraph', text }];
    const note = await NotebookEntry.create({ userId, title: 'Hiring', blocks: paragraph('Mine.') });
    const theirs = snapshotOf('note', note);
    await recordRevision({ EntryRevision, userId, kind: 'note', entryId: note._id, before: { title: '', blocks: [] }, after: theirs });
    await NotebookEntry.updateOne({ _id: note._id }, { $set: { blocks: paragraph('The agent\'s.'), pencil } });
    await recordRevision({ EntryRevision, userId, kind: 'note', entryId: note._id, before: theirs, after: { title: 'Hiring', blocks: paragraph('The agent\'s.') }, hand: String(tokenId) });
    assert.equal(await EntryRevision.countDocuments({ entryId: note._id }), 2);

    const madeByAgent = await NotebookEntry.create({ userId, title: 'Agent note', blocks: paragraph('Filler.'), pencil });
    const article = await Article.create({ userId, url: 'https://example.com/a', title: 'Base rates', content: 'x', pencil, highlights: [{ text: 'Start from the base rate.', pencil }, { text: 'Stories mislead.', pencil }] });
    const [kept, dropped] = article.highlights.map(mark => String(mark._id));

    // Only pencil can be struck, and only by the reader.
    agent = true;
    assert.equal((await post('/api/strike', { kind: 'note', id: String(note._id) })).code, 403);
    agent = false;
    const yours = await NotebookEntry.create({ userId, title: 'Yours', blocks: paragraph('Ink.') });
    assert.equal((await post('/api/strike', { kind: 'note', id: String(yours._id) })).code, 409);

    assert.equal((await post('/api/strike', { kind: 'note', id: String(note._id), why: 'Too smooth.' })).struck, 'restored');
    assert.deepEqual(((await NotebookEntry.findById(note._id).lean()).blocks).map(block => block.text), ['Mine.']);
    assert.equal((await NotebookEntry.findById(note._id).lean()).pencil, null);

    assert.equal((await post('/api/strike', { kind: 'note', id: String(madeByAgent._id) })).struck, 'removed');
    assert.equal(await NotebookEntry.findById(madeByAgent._id), null);

    assert.equal((await post('/api/ink', { kind: 'highlight', id: String(article._id), highlightId: kept })).code, 200);
    assert.equal((await post('/api/strike', { kind: 'highlight', id: String(article._id), highlightId: dropped, why: 'Not the point.' })).struck, 'removed');
    const marks = (await Article.findById(article._id).lean()).highlights;
    assert.deepEqual(marks.map(mark => [mark.text, mark.pencil]), [['Start from the base rate.', null]]);
    assert.deepEqual(cleaned, [dropped]);

    // Each verdict keeps what it was about, since a strike removes the thing.
    const verdicts = await Verdict.find({ userId }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(verdicts.map(row => [row.verdict, row.kind, row.agent, row.text, row.why]), [
      ['strike', 'note', 'Noeis', 'The agent\'s.', 'Too smooth.'],
      ['strike', 'note', 'Noeis', 'Filler.', ''],
      ['ink', 'highlight', 'Noeis', 'Start from the base rate.', ''],
      ['strike', 'highlight', 'Noeis', 'Stories mislead.', 'Not the point.']
    ]);
    // A note the reader inked is theirs: an agent's later rewrite, struck, comes back to it.
    const accepted = await NotebookEntry.create({ userId, title: 'Accepted', blocks: paragraph('Agent draft.'), pencil });
    await recordRevision({ EntryRevision, userId, kind: 'note', entryId: accepted._id, before: { title: '', blocks: [] }, after: snapshotOf('note', accepted), hand: String(tokenId) });
    assert.equal((await post('/api/ink', { kind: 'note', id: String(accepted._id) })).code, 200);
    await NotebookEntry.updateOne({ _id: accepted._id }, { $set: { blocks: paragraph('Agent again.'), pencil } });
    await recordRevision({ EntryRevision, userId, kind: 'note', entryId: accepted._id, before: snapshotOf('note', accepted), after: { title: 'Accepted', blocks: paragraph('Agent again.') }, hand: String(tokenId) });
    assert.equal((await post('/api/strike', { kind: 'note', id: String(accepted._id) })).struck, 'restored');
    assert.deepEqual((await NotebookEntry.findById(accepted._id).lean()).blocks.map(block => block.text), ['Agent draft.']);

    // History kept before hands were recorded is the reader's, never a reason to delete.
    const legacy = await NotebookEntry.create({ userId, title: 'Old', blocks: paragraph('Old words.') });
    await EntryRevision.collection.insertOne({ userId, kind: 'note', entryId: legacy._id, reason: 'edit', snapshot: snapshotOf('note', legacy), createdAt: new Date(Date.now() - 60000), updatedAt: new Date() });
    await NotebookEntry.updateOne({ _id: legacy._id }, { $set: { blocks: paragraph('Rewritten.'), pencil } });
    assert.equal((await post('/api/strike', { kind: 'note', id: String(legacy._id) })).struck, 'restored');
    assert.deepEqual((await NotebookEntry.findById(legacy._id).lean()).blocks.map(block => block.text), ['Old words.']);

    // Inking what was never pencil is still fine, and is no verdict.
    assert.equal((await post('/api/ink', { kind: 'note', id: String(yours._id) })).code, 200);
    assert.equal(await Verdict.countDocuments({ userId }), 7);
  } finally {
    server?.close();
    await mongoose.disconnect();
    await memory.stop();
  }
});
