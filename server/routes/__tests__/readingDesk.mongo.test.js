const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { buildImportRouter } = require('../importRoutes');
const { buildHighlightMutationRouter } = require('../highlightMutationRoutes');

const FIXTURES = path.join(__dirname, '../../fixtures/imports');

/* The desk's whole loop against a real database: a paper book started by its
   title, lines typed beside it, then the book's own files arriving. The book
   stays one book, and what was typed takes the book's words. */
test('real Mongo: a book started at the desk is the one its Kindle and EPUB land in, and typed quotes fill in', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const models = require('../../models');
    const { Article, Folder, TagMeta, NotebookEntry, ImportSession, NoeisReceipt } = models;
    await Promise.all(Object.values(models).filter(Model => Model?.createCollection).map(Model => Model.createCollection()));
    const userId = new mongoose.Types.ObjectId();
    const authenticateToken = (req, res, next) => { req.user = { id: String(userId) }; next(); };

    const app = express();
    app.use(express.json());
    app.use(buildImportRouter({
      authenticateToken,
      upload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }),
      slugify: value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      Article, Folder, TagMeta, NotebookEntry, ImportSession, NoeisReceipt,
      trackEvent: () => {},
      EVENT_NAMES: { CAPTURE_COMPLETED: 'capture_completed' },
      crypto,
      syncNotebookReferences: async () => {},
      enqueueArticleEmbedding: async () => {},
      enqueueHighlightEmbedding: async () => {},
      enqueueNotebookEmbedding: async () => {},
      fetchSourceBody: async () => ''
    }));
    app.use(buildHighlightMutationRouter({
      mongoose,
      authenticateToken,
      Article,
      normalizeTags: value => (Array.isArray(value) ? value : []),
      enqueueHighlightEmbedding: () => {},
      markTourSignal: async () => {},
      normalizeItemType: (value, fallback) => value || fallback,
      parseClaimId: value => value || null
    }));
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const post = async (route, body) => {
      const response = await fetch(`${url}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const bring = async (file) => {
      const form = new FormData();
      form.append('files', new Blob([fs.readFileSync(path.join(FIXTURES, file))]), file);
      const response = await fetch(`${url}/api/import/files`, { method: 'POST', body: form });
      return response.json();
    };

    const started = await post('/api/import/book', { title: 'The Origin of Species', author: 'Darwin, Charles' });
    assert.equal(started.status, 201);
    const bookId = started.body.article._id;
    assert.equal((await post('/api/import/book', { title: 'the origin of species' })).body.article._id, bookId, 'the title alone finds it again');

    const quote = await post(`/articles/${bookId}/highlights`, { text: 'There is grandeur … of life', note: 'the last line, read first', page: 12 });
    assert.equal(quote.body.highlight.page, 12);
    assert.equal(quote.body.highlight.text, 'There is grandeur … of life', 'kept as typed while the book has none of its words');
    const thought = await post(`/articles/${bookId}/highlights`, { text: '', note: 'Why open with pigeons?', page: 13 });
    assert.equal(thought.status, 200);

    // The EPUB arrives: the book gains its text and the typed quote its words.
    await bring('origin-of-species.epub');
    let book = await Article.findById(bookId).lean();
    assert.match(book.content, /grandeur/);
    assert.equal(book.highlights[0].text, 'There is grandeur in this view of life');
    assert.equal(book.highlights[0].note, 'the last line, read first');

    // The Kindle's clippings for the same book land in it, the passage already here once.
    const kindle = await bring('kindle-my-clippings.txt');
    book = await Article.findById(bookId).lean();
    assert.equal(await Article.countDocuments({ userId, url: /origin-of-species/ }), 1, 'one book, however it arrived');
    assert.equal(book.highlights.filter(mark => /grandeur/.test(mark.text)).length, 1);
    assert.equal(book.highlights[0].note, 'the last line, read first\n\nThe last line of the book, read first.');
    const fromKindle = book.highlights.find(mark => /Natural selection/.test(mark.text));
    assert.equal(fromKindle.page, 40, 'a Kindle mark keeps its printed page');
    assert.ok(kindle.alreadyHere >= 1);

    // Typed again at the desk by its ends, a passage the Kindle marked stays one mark and takes the note.
    const again = await post(`/articles/${bookId}/highlights`, { text: 'Natural selection acts … inherited modifications', note: 'only?', page: 40 });
    assert.equal(again.body.highlight._id, String(fromKindle._id));
    assert.equal((await Article.findById(bookId).lean()).highlights.length, book.highlights.length);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
