const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildSyncRouter } = require('../syncRoutes');

test('real Mongo: the folder lists everything, and carries Markdown for what changed or was asked for', async () => {
  const memory = await MongoMemoryServer.create();
  let server;
  try {
    await mongoose.connect(memory.getUri());
    const { Article, NotebookEntry, WikiPage } = require('../../models');
    const userId = new mongoose.Types.ObjectId();
    const note = await NotebookEntry.create({ userId, title: 'My hiring mistakes', blocks: [{ id: 'b1', type: 'paragraph', text: 'I keep hiring the best story.' }] });
    const read = await Article.create({ userId, title: 'Docs Claude read', url: 'https://example.com/docs', content: '<p>How hooks run.</p>', pencil: { agent: 'Claude Code' },
      highlights: [{ text: 'Hooks run after the tool.', note: 'Use this for saving.', pencil: { agent: 'Claude Code' } }] });
    await Article.create({ userId, title: 'Archived', url: 'https://example.com/old', archived: true });
    await NotebookEntry.create({ userId: new mongoose.Types.ObjectId(), title: 'Someone else' });

    const app = express();
    app.use(buildSyncRouter({ authenticateToken: (req, _res, next) => { req.user = { id: String(userId) }; next(); }, models: { Article, NotebookEntry, WikiPage } }));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const get = async query => (await fetch(`http://127.0.0.1:${server.address().port}/api/sync?${query}`)).json();

    const first = await get('');
    assert.deepEqual(first.files.map(file => [file.kind, file.path]), [
      ['note', `Think/my-hiring-mistakes-${String(note._id).slice(-6)}.md`],
      ['article', `Library/docs-claude-read-${String(read._id).slice(-6)}.md`]
    ]);
    assert.equal(first.files[0].markdown, '# My hiring mistakes\n\nI keep hiring the best story.\n');
    // An agent's reading says so at the top, and its note is its own.
    assert.match(first.files[1].markdown, /^---\npencil: Claude Code, not yet taken up\n---\n\n# Docs Claude read\n\nSource: https:\/\/example.com\/docs/);
    assert.match(first.files[1].markdown, /> Hooks run after the tool\.\n\nClaude Code's note: Use this for saving\./);

    // Since the last sync, only what changed carries Markdown, unless asked for.
    const later = await get(`since=${encodeURIComponent(first.now)}`);
    assert.equal(later.files.length, 2);
    assert.ok(later.files.every(file => file.markdown === undefined));
    const asked = await get(`since=${encodeURIComponent(first.now)}&ids=${note._id}`);
    assert.deepEqual(asked.files.filter(file => file.markdown).map(file => file.id), [String(note._id)]);
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/sync?since=nonsense`)).status, 400);
  } finally {
    server?.close();
    await mongoose.disconnect();
    await memory.stop();
  }
});
