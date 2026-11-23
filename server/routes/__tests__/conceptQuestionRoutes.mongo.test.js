const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildConceptQuestionBoardRouter } = require('../conceptQuestionBoardRoutes');

/* A reader's questions and concept notes are theirs alone, keep what was
   written when only part of them changes, and remember the wording before an
   edit. These run against a real Mongo, because the scoping is in the query. */
test('questions and concept notes stay with their owner and keep what was not changed', async () => {
  const mongo = await MongoMemoryServer.create();
  let listener;
  try {
    await mongoose.connect(mongo.getUri());
    const { Question, ConceptNote, EntryRevision, WikiPage } = require('../../models');
    const owner = String(new mongoose.Types.ObjectId());
    const other = String(new mongoose.Types.ObjectId());
    const highlightId = String(new mongoose.Types.ObjectId());
    const embedded = [];
    const app = express();
    app.use(express.json());
    app.use(buildConceptQuestionBoardRouter({
      mongoose,
      authenticateToken: (req, _res, next) => { req.user = { id: req.get('test-user') }; next(); },
      Question,
      ConceptNote,
      EntryRevision,
      WikiPage,
      enqueueQuestionEmbedding: question => embedded.push(String(question._id)),
      findHighlightById: async (userId, id) => (userId === owner && id === highlightId ? { text: 'The marked passage.' } : null),
      createBlockId: () => `block-${embedded.length}`
    }));
    await new Promise(resolve => { listener = app.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${listener.address().port}/api`;
    const call = async (method, path, body, user = owner) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'test-user': user },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      return { status: res.status, body: await res.json() };
    };

    assert.equal((await call('POST', '/questions', { text: '   ' })).status, 400);
    const asked = await call('POST', '/questions', { text: '  Why does it compound?  ', conceptName: ' Reading ' });
    assert.equal(asked.status, 201);
    const id = asked.body._id;
    assert.equal(asked.body.text, 'Why does it compound?');
    assert.equal(asked.body.linkedTagName, 'Reading');
    assert.equal(asked.body.status, 'open');
    assert.deepEqual(embedded, [id]);

    assert.equal((await call('GET', `/questions/${id}`, undefined, other)).status, 404);
    assert.equal((await call('GET', `/questions/${id}`)).body.text, 'Why does it compound?');
    assert.deepEqual((await call('GET', '/concepts/READING/questions')).body.map(q => q._id), [id]);
    assert.deepEqual((await call('GET', '/questions?conceptName=reading')).body.map(q => q._id), [id]);
    assert.deepEqual((await call('GET', '/questions', undefined, other)).body, []);

    assert.equal((await call('PUT', `/questions/${id}`, { text: 'Taken' }, other)).status, 404);
    const moved = await call('PUT', `/questions/${id}`, { conceptName: 'Writing' });
    assert.equal(moved.body.linkedTagName, 'Writing');
    assert.equal(moved.body.text, 'Why does it compound?');
    await call('PUT', `/questions/${id}`, { text: 'Why does reading compound?' });
    const history = await EntryRevision.find({ entryId: id }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(history.map(row => row.reason), ['before', 'edit']);

    assert.equal((await call('POST', `/questions/${id}/add-highlight`, {})).status, 400);
    assert.equal((await call('POST', `/questions/${id}/add-highlight`, { highlightId }, other)).status, 404);
    await call('POST', `/questions/${id}/add-highlight`, { highlightId });
    const linked = await call('POST', `/questions/${id}/add-highlight`, { highlightId });
    assert.deepEqual(linked.body.blocks.map(block => [block.type, block.text]), [['highlight-ref', 'The marked passage.']]);
    assert.deepEqual(linked.body.linkedHighlightIds, [highlightId]);
    assert.deepEqual((await call('POST', `/questions/${id}/link-highlight`, { highlightId })).body.linkedHighlightIds, [highlightId]);

    assert.equal((await call('DELETE', `/questions/${id}`, undefined, other)).status, 404);
    assert.equal((await call('DELETE', `/questions/${id}`)).status, 200);
    assert.equal((await call('GET', `/questions/${id}`)).status, 404);

    const note = await call('POST', '/concepts/Reading/notes', { title: 'Draft', content: 'What I have so far.' });
    assert.equal(note.status, 201);
    const renamed = await call('PUT', `/concepts/notes/${note.body._id}`, { title: 'Settled' });
    assert.deepEqual([renamed.body.title, renamed.body.content], ['Settled', 'What I have so far.']);
    assert.equal((await call('PUT', `/concepts/notes/${note.body._id}`, { content: '' }, other)).status, 404);
    assert.equal((await call('DELETE', `/concepts/notes/${note.body._id}`, undefined, other)).status, 404);
    assert.equal((await call('DELETE', `/concepts/notes/${note.body._id}`)).status, 200);
    assert.equal(await ConceptNote.countDocuments(), 0);
  } finally {
    listener?.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
