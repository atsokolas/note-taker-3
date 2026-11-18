const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { checkDisagreements } = require('./disagreements');

/* An agent finishes a handoff with a note that runs against a view the
   reader holds; the real retrieval finds the view, a scripted model says the
   pair contradicts, and the disagreement is kept with both sides. */
test('real Mongo: what an agent wrote that contradicts a held view is kept as a disagreement', async () => {
  const memory = await MongoMemoryServer.create();
  try {
    await mongoose.connect(memory.getUri());
    const models = require('../models');
    const { NotebookEntry, WikiPage, Disagreement } = models;
    const userId = new mongoose.Types.ObjectId();
    await WikiPage.create({ userId, title: 'Interviews and hiring', slug: 'interviews-hiring', judgment: { currentJudgment: 'Unstructured interviews predict hiring outcomes poorly.' } });
    const view = await WikiPage.findOne({ userId }).lean();
    assert.ok(view, 'the held view was saved');
    const note = await NotebookEntry.create({ userId, title: 'Hiring loop', blocks: [{ id: 'b1', type: 'paragraph', text: 'Unstructured interviews predict hiring outcomes well; keep them central to hiring.' }], pencil: { agent: 'Codex', at: new Date() } });

    const asked = [];
    const chat = async ({ messages }) => {
      asked.push(messages[1].content);
      return { text: JSON.stringify({ pairs: [{ pair: 1, contradicts: true, a: 'Interviews predict hiring well.', b: 'Interviews predict hiring poorly.' }] }) };
    };
    const found = await checkDisagreements({ userId, agent: 'Codex', wrote: [{ kind: 'note', id: String(note._id), title: 'Hiring loop' }], models: { ...models, Disagreement }, chat });

    assert.match(asked[0], /A \(Codex\): Unstructured interviews predict hiring outcomes well[\s\S]*B \(the reader's held view\): Unstructured interviews predict hiring outcomes poorly/);
    assert.equal(found.length, 1);
    const [kept] = await Disagreement.find({ userId }).lean();
    assert.deepEqual([kept.a.agent, kept.a.id, kept.a.says, kept.b.agent, kept.b.kind, kept.b.says], ['Codex', String(note._id), 'Interviews predict hiring well.', '', 'view', 'Interviews predict hiring poorly.']);

    // Nothing near it to contradict: no model call, no disagreement.
    const calls = asked.length;
    const lone = await NotebookEntry.create({ userId, title: 'Sourdough', blocks: [{ id: 'b2', type: 'paragraph', text: 'Rye starter wants a warm kitchen.' }], pencil: { agent: 'Codex', at: new Date() } });
    assert.deepEqual(await checkDisagreements({ userId, agent: 'Codex', wrote: [{ kind: 'note', id: String(lone._id) }], models: { ...models, Disagreement }, chat }), []);
    assert.equal(asked.length, calls);
  } finally {
    await mongoose.disconnect();
    await memory.stop();
  }
});
