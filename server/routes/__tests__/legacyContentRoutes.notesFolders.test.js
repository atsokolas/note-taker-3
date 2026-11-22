const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');

const { buildLegacyContentRouter } = require('../legacyContentRoutes');

// Notes, folders and moving a source between folders, with an in-memory
// store standing in for Mongo. Only the operators these routes use.
const matches = (row, filter) => Object.entries(filter).every(([key, want]) => {
  const have = row[key];
  if (want && typeof want === 'object' && !(want instanceof RegExp)) {
    if ('$exists' in want) return (have !== undefined) === want.$exists;
    if ('$regex' in want) return new RegExp(want.$regex).test(String(have || ''));
  }
  return String(have) === String(want);
});

const store = (rows = []) => {
  class Model {
    constructor(fields) { Object.assign(this, { _id: String(new mongoose.Types.ObjectId()), ...fields }); }
    async save() { Model.rows.push(this); return this; }
    static find(filter) {
      const found = Model.rows.filter(row => matches(row, filter));
      return { sort: async () => found };
    }
    static findOne(filter) {
      const found = Model.rows.find(row => matches(row, filter)) || null;
      const pending = Promise.resolve(found);
      pending.select = (fields) => { Model.selected = fields; return pending; };
      return pending;
    }
    static async findOneAndUpdate(filter, updates) {
      const row = Model.rows.find(candidate => matches(candidate, filter));
      return row ? Object.assign(row, updates) : null;
    }
    static async findOneAndDelete(filter) {
      const index = Model.rows.findIndex(row => matches(row, filter));
      return index < 0 ? null : Model.rows.splice(index, 1)[0];
    }
    static async countDocuments(filter) { return Model.rows.filter(row => matches(row, filter)).length; }
  }
  Model.rows = rows;
  return Model;
};

const start = async ({ notes = [], folders = [], articles = [] } = {}) => {
  const Note = store(notes);
  const Folder = store(folders);
  const Article = store(articles);
  const app = express();
  app.use(express.json());
  app.use(buildLegacyContentRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: String(req.headers['x-reader'] || 'reader-1') }; next(); },
    mongoose,
    Note,
    normalizeChecklist: (items = []) => items.map(item => ({ text: String(item.text || ''), done: Boolean(item.done) })),
    Folder,
    normalizePdfs: value => value,
    Article,
    enqueueArticleEmbedding: async () => {},
    deleteArticleEmbeddingState: async () => {},
    getFoldersWithCounts: async () => [],
    normalizeItemType: value => value
  }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const send = async (method, path, body, reader = 'reader-1') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-reader': reader },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  return { Note, Folder, Article, send, close: () => new Promise(resolve => server.close(resolve)) };
};

test('a note needs a title, and a cleared title reads Untitled note', async () => {
  const app = await start();
  try {
    assert.equal((await app.send('POST', '/api/notes', { title: '   ' })).status, 400);
    const created = await app.send('POST', '/api/notes', { title: '  Margins  ', checklist: [{ text: 'reread ch. 3' }] });
    assert.equal(created.status, 201);
    assert.equal(created.body.title, 'Margins');
    assert.deepEqual(created.body.checklist, [{ text: 'reread ch. 3', done: false }]);
    const renamed = await app.send('PATCH', `/api/notes/${created.body._id}`, { title: '' });
    assert.equal(renamed.body.title, 'Untitled note');
  } finally { await app.close(); }
});

test('edition thoughts and other readers\' notes are out of reach of the notes routes', async () => {
  const app = await start({
    notes: [
      { _id: 'mine', userId: 'reader-1', title: 'Mine' },
      { _id: 'thought', userId: 'reader-1', title: 'On the edition', editionContext: { editionId: 'e-1' } },
      { _id: 'theirs', userId: 'reader-2', title: 'Theirs' }
    ]
  });
  try {
    const listed = await app.send('GET', '/api/notes');
    assert.deepEqual(listed.body.map(note => note._id), ['mine']);
    assert.equal((await app.send('PATCH', '/api/notes/thought', { title: 'edited' })).status, 404);
    assert.equal((await app.send('DELETE', '/api/notes/thought')).status, 404);
    assert.equal((await app.send('DELETE', '/api/notes/theirs')).status, 404);
    assert.equal((await app.send('DELETE', '/api/notes/mine')).status, 200);
    assert.deepEqual(app.Note.rows.map(note => note._id), ['thought', 'theirs']);
  } finally { await app.close(); }
});

test('a folder name is unique per reader, whatever its case', async () => {
  const app = await start({ folders: [{ _id: 'f-1', userId: 'reader-1', name: 'Biotech' }] });
  try {
    assert.equal((await app.send('POST', '/folders', {})).status, 400);
    assert.equal((await app.send('POST', '/folders', { name: 'biotech' })).status, 409);
    assert.equal((await app.send('POST', '/folders', { name: 'biotech' }, 'reader-2')).status, 201, 'another reader may use the name');
    assert.equal((await app.send('POST', '/folders', { name: 'Biotech (old)' })).status, 201, 'a longer name is a different name');
  } finally { await app.close(); }
});

test('a folder with sources in it is not deleted', async () => {
  const app = await start({
    folders: [{ _id: 'full', userId: 'reader-1', name: 'Full' }, { _id: 'empty', userId: 'reader-1', name: 'Empty' }],
    articles: [{ _id: 'a-1', userId: 'reader-1', folder: 'full' }]
  });
  try {
    assert.equal((await app.send('DELETE', '/folders/full')).status, 409);
    assert.equal((await app.send('DELETE', '/folders/empty', undefined, 'reader-2')).status, 404);
    assert.equal((await app.send('DELETE', '/folders/empty')).status, 200);
    assert.deepEqual(app.Folder.rows.map(folder => folder._id), ['full']);
  } finally { await app.close(); }
});

test('a source moves only into the reader\'s own folder, or out of every folder', async () => {
  const app = await start({
    folders: [{ _id: 'mine', userId: 'reader-1', name: 'Mine' }, { _id: 'theirs', userId: 'reader-2', name: 'Theirs' }],
    articles: [{ _id: 'a-1', userId: 'reader-1', folder: null }]
  });
  try {
    assert.equal((await app.send('PATCH', '/articles/a-1/move', { folderId: 'theirs' })).status, 400);
    assert.equal(app.Article.rows[0].folder, null);
    assert.equal((await app.send('PATCH', '/articles/a-1/move', { folderId: 'mine' })).body.folder, 'mine');
    assert.equal((await app.send('PATCH', '/articles/a-1/move', { folderId: 'uncategorized' })).body.folder, null);
    assert.equal((await app.send('PATCH', '/articles/a-1/move', { folderId: 'mine' }, 'reader-2')).status, 400, 'reader-2 cannot see that folder');
  } finally { await app.close(); }
});

test('the extension asks by URL, and the brief answer carries no body', async () => {
  const app = await start({ articles: [{ _id: 'a-1', userId: 'reader-1', url: 'https://example.com/x', content: '<p>long</p>' }] });
  try {
    assert.equal((await app.send('GET', '/api/articles/by-url')).status, 400);
    assert.equal((await app.send('GET', '/api/articles/by-url?url=https://example.com/unsaved')).body, null);
    assert.equal((await app.send('GET', '/api/articles/by-url?url=https://example.com/x', undefined, 'reader-2')).body, null);
    await app.send('GET', '/api/articles/by-url?url=https://example.com/x&brief=1');
    assert.equal(app.Article.selected, '_id title createdAt highlights._id highlights.text');
  } finally { await app.close(); }
});
