const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildHandoffRouter } = require('../handoffRoutes');

test('real Mongo: the reader hands off, one agent takes it, and what it wrote comes back with its note', async () => {
  const memory = await MongoMemoryServer.create();
  let server;
  try {
    await mongoose.connect(memory.getUri());
    const { Article, NotebookEntry, Handoff } = require('../../models');
    const userId = new mongoose.Types.ObjectId();
    const agents = {
      claude: { id: String(new mongoose.Types.ObjectId()), label: 'Claude Code', scopes: ['read', 'agent-write'] },
      codex: { id: String(new mongoose.Types.ObjectId()), label: 'Codex', scopes: ['read', 'agent-write', 'work'] }
    };

    const app = express();
    app.use(express.json());
    const authenticateToken = (req, _res, next) => {
      req.user = { id: String(userId) };
      req.agentToken = agents[req.get('x-agent')];
      next();
    };
    const humanOnly = (req, res, next) => (req.agentToken ? res.status(403).end() : next());
    const finished = [];
    app.use(buildHandoffRouter({ authenticateToken, humanOnly, Handoff, Article, NotebookEntry, onFinished: ({ handoff, wrote }) => finished.push([handoff.takenBy.agent, wrote.length]) }));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const call = async (path, { as, body } = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', ...(as ? { 'x-agent': as } : {}) },
        body: body && JSON.stringify(body)
      });
      return { code: response.status, ...(await response.json().catch(() => ({}))) };
    };

    const handed = await call('/api/handoffs', { body: { ask: 'Finish the base rates section.', context: { kind: 'note', id: 'n1', title: 'Hiring', excerpt: 'I keep hiring the best story.' } } });
    assert.deepEqual([handed.code, handed.status, handed.ask, handed.from, handed.context.title], [201, 'waiting', 'Finish the base rates section.', null, 'Hiring']);
    assert.equal((await call('/api/handoffs', { body: { ask: ' ' } })).code, 400);

    // Waiting for any agent; the first to take it has it, the second is told no.
    assert.deepEqual((await call('/api/handoffs?status=waiting', { as: 'codex' })).handoffs.map(h => h.id), [handed.id]);
    const taken = await call(`/api/handoffs/${handed.id}/take`, { as: 'claude', body: {} });
    assert.deepEqual([taken.status, taken.takenBy], ['taken', 'Claude Code']);
    assert.equal((await call(`/api/handoffs/${handed.id}/take`, { as: 'codex', body: {} })).code, 409);
    assert.equal((await call(`/api/handoffs/${handed.id}/take`, { body: {} })).code, 403);

    // What it wrote in pencil while it had the handoff is the handoff's; another agent's is not.
    const pencil = agent => ({ agent: agent.label, tokenId: agent.id, at: new Date() });
    await NotebookEntry.create({ userId, title: 'Base rates, finished', pencil: pencil(agents.claude) });
    await Article.create({ userId, title: 'Panels and charisma', url: 'https://example.com/panels', pencil: pencil(agents.claude),
      highlights: [{ text: 'Panels overweight charisma.', pencil: pencil(agents.claude) }] });
    await NotebookEntry.create({ userId, title: 'Codex elsewhere', pencil: pencil(agents.codex) });

    assert.equal((await call(`/api/handoffs/${handed.id}/finish`, { as: 'codex', body: { did: 'Nothing.' } })).code, 409);
    const done = await call(`/api/handoffs/${handed.id}/finish`, { as: 'claude', body: { did: 'Finished the section.', open: 'Which panel study?', next: 'Read the 2019 meta-analysis.' } });
    assert.deepEqual([done.status, done.did, done.open, done.next], ['done', 'Finished the section.', 'Which panel study?', 'Read the 2019 meta-analysis.']);
    assert.deepEqual(done.wrote.map(item => [item.kind, item.title]).sort(), [
      ['article', 'Panels and charisma'],
      ['highlight', 'Panels and charisma'],
      ['note', 'Base rates, finished']
    ]);
    // What it wrote goes on to be held against the views it bears on.
    assert.deepEqual(finished, [['Claude Code', 3]]);

    // Handed to one connection, the other never sees it; only the reader calls one off.
    const forCodex = await call('/api/handoffs', { body: { ask: 'Tidy the tags.', to: agents.codex.id } });
    assert.deepEqual((await call('/api/handoffs?status=waiting', { as: 'claude' })).handoffs, []);
    assert.equal((await call(`/api/handoffs/${forCodex.id}/cancel`, { as: 'codex', body: {} })).code, 403);
    assert.equal((await call(`/api/handoffs/${forCodex.id}/cancel`, { body: {} })).status, 'cancelled');
    // An agent may hand work on; it says who handed it.
    assert.equal((await call('/api/handoffs', { as: 'claude', body: { ask: 'Check the citations.' } })).from, 'Claude Code');
    assert.equal((await call('/api/handoffs?status=nonsense')).code, 400);

    const originId = String(new mongoose.Types.ObjectId());
    const work = await NotebookEntry.create({ userId, knowledgeContext: 'work', title: 'Confirm the pilot', workItem: {
      kind: 'task', origin: { noteId: originId, blockId: 'pilot', quote: 'Ask whether the dock is free Friday.' }
    } });
    const context = { kind: 'work_task', id: String(work._id), title: work.title, excerpt: work.workItem.origin.quote };
    assert.equal((await call('/api/handoffs', { body: { ask: 'Draft the question.', context: { ...context, excerpt: 'Invented quote' } } })).code, 409);
    assert.equal((await call('/api/handoffs', { as: 'claude', body: { ask: 'Draft the question.', context } })).code, 403);
    const workHandoff = await call('/api/handoffs', { body: { ask: 'Draft the question.', context } });
    assert.equal(workHandoff.code, 201);
    assert.equal(workHandoff.context.href, `/work?note=${originId}&block=pilot`);
    assert.equal((await call(`/api/handoffs/${workHandoff.id}`, { as: 'claude' })).code, 404);
    assert.equal((await call(`/api/handoffs/${workHandoff.id}/take`, { as: 'claude', body: {} })).code, 409);
    assert.equal((await call(`/api/handoffs/${workHandoff.id}`, { as: 'codex' })).context.excerpt, context.excerpt);

    // Everything in pencil, whoever wrote it, is the reader's to take up.
    const { pencilled } = require('../../services/pencilled');
    assert.deepEqual((await pencilled({ Article, NotebookEntry, userId })).map(item => [item.kind, item.agent]).sort(), [
      ['article', 'Claude Code'], ['highlight', 'Claude Code'], ['note', 'Claude Code'], ['note', 'Codex']
    ]);
  } finally {
    server?.close();
    await mongoose.disconnect();
    await memory.stop();
  }
});
