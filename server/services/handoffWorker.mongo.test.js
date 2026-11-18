const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildHandoffRouter } = require('../routes/handoffRoutes');
const { buildAuthenticateAgentToken, pencilOf } = require('./agentTokenService');
const { workHandoff, resumeHandoffs } = require('./handoffWorker');

/* The built-in agent through the real handoff routes and real agent tokens:
   a scripted model reads the page, finishes it in pencil, and says what it
   did. The library routes it calls are stand-ins that record the write. */
test('real Mongo: the built-in agent finishes the page it was handed, in pencil, and leaves a note', async () => {
  const memory = await MongoMemoryServer.create();
  let server;
  try {
    await mongoose.connect(memory.getUri());
    const { Article, NotebookEntry, Handoff, AgentToken } = require('../models');
    const userId = new mongoose.Types.ObjectId();
    const note = await NotebookEntry.create({ userId, title: 'Hiring', blocks: [{ id: 'b1', type: 'paragraph', text: 'I keep hiring the best story.' }] });

    const app = express();
    app.use(express.json());
    const authenticateToken = buildAuthenticateAgentToken({ AgentToken, isAccountActive: async () => true });
    app.use(buildHandoffRouter({ authenticateToken, humanOnly: (_req, _res, next) => next(), Handoff, Article, NotebookEntry }));
    app.get('/api/recall', authenticateToken, (_req, res) => res.json({ results: [{ kind: 'article', id: 'a1', passage: 'Base rates beat stories.' }] }));
    app.get('/api/recall/read/:id', authenticateToken, async (req, res) => res.json({ text: (await NotebookEntry.findById(req.params.id)).blocks[0].text }));
    app.put('/api/notebook/:id', authenticateToken, async (req, res) => {
      await NotebookEntry.updateOne({ _id: req.params.id }, { $set: { blocks: [{ id: 'b2', type: 'paragraph', text: req.body.markdown }], pencil: pencilOf(req) } });
      res.json({});
    });
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const apiUrl = `http://127.0.0.1:${server.address().port}`;

    const seen = [];
    const script = [
      { toolCalls: [{ id: 'c1', function: { name: 'recall', arguments: JSON.stringify({ query: 'base rates in hiring' }) } }] },
      { toolCalls: [{ id: 'c2', function: { name: 'rewrite_page', arguments: JSON.stringify({ text: 'I keep hiring the best story. Base rates beat stories.' }) } }] },
      { toolCalls: [{ id: 'c3', function: { name: 'finish', arguments: JSON.stringify({ did: 'Finished the paragraph.', open: 'Which study?', next: 'Find the study.' }) } }] }
    ];
    const chat = async ({ messages }) => { seen.push(messages); return script.shift(); };

    const handoff = await Handoff.create({ userId, ask: 'Finish this.', to: 'noeis', context: { kind: 'note', id: String(note._id), title: 'Hiring' } });
    const done = await workHandoff({ handoffId: handoff._id, models: { Handoff, AgentToken }, apiUrl, chat });

    assert.deepEqual([done.status, done.takenBy, done.did, done.open, done.next], ['done', 'Noeis', 'Finished the paragraph.', 'Which study?', 'Find the study.']);
    // It started from the page as it stood, and its recall came back to it.
    assert.match(seen[0][1].content, /Handed to you: Finish this\.[\s\S]*I keep hiring the best story\./);
    assert.match(seen[1][3].content, /Base rates beat stories/);
    // The page is rewritten in its pencil, and the handoff lists it as written.
    const rewritten = await NotebookEntry.findById(note._id).lean();
    assert.equal(rewritten.pencil.agent, 'Noeis');
    assert.deepEqual(done.wrote.map(item => [item.kind, item.title]), [['note', 'Hiring']]);
    // Its connection lasted only as long as the work.
    assert.equal(await AgentToken.countDocuments({}), 0);
    // A handoff for another agent, or already taken, is not the built-in agent's.
    assert.equal(await workHandoff({ handoffId: handoff._id, models: { Handoff, AgentToken }, apiUrl, chat }), null);

    // On waking, a turn the last process left unfinished is finished for it; waiting ones are worked.
    const stale = await Handoff.create({ userId, ask: 'Old.', to: 'noeis', takenAt: new Date(Date.now() - 60 * 60 * 1000), takenBy: { agent: 'Noeis' } });
    const waiting = await Handoff.create({ userId, ask: 'Write me a note.', to: 'noeis' });
    script.push({ text: 'Nothing in the library bears on it.' });
    await resumeHandoffs({ models: { Handoff, AgentToken }, apiUrl, chat });
    assert.match((await Handoff.findById(stale._id)).did, /^Stopped: Noeis restarted/);
    assert.equal((await Handoff.findById(waiting._id)).did, 'Nothing in the library bears on it.');
  } finally {
    server?.close();
    await mongoose.disconnect();
    await memory.stop();
  }
});
