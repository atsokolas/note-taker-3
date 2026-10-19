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

    // The shelf: one row per book, with its marks to read the page and the last line from.
    const shelf = await (await fetch(`${url}/api/books?today=2026-10-19`)).json();
    const row = shelf.books.find(item => String(item._id) === bookId);
    assert.equal(shelf.books.filter(item => /Origin of Species/i.test(item.title)).length, 1);
    assert.ok(row.marks.some(mark => mark.page === 40 && /Natural selection/.test(mark.text)));
    assert.ok(row.marks.every(mark => typeof mark.location === 'string' && !mark.importMeta));
    assert.equal(row.returning, null);

    // Closing it: the day and the sentence, kept on the book. Rewriting the
    // sentence keeps the day; still reading it clears both.
    const close = (line, on) => fetch(`${url}/api/books/${bookId}/closed`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line, on }) }).then(res => res.json());
    const closed = await close('  Variation is the raw material.  ', '2025-10-18');
    assert.deepEqual(closed, { finishedOn: '2025-10-18', closingLine: 'Variation is the raw material.' });
    const rewritten = await close('Selection keeps what variation offers.', '2026-10-19');
    assert.equal(rewritten.finishedOn, '2025-10-18');
    const year = (await (await fetch(`${url}/api/books?today=2026-10-19`)).json()).books.find(item => String(item._id) === bookId);
    assert.deepEqual(year.returning, { years: 1, days: 1 });
    assert.equal(year.closingLine, 'Selection keeps what variation offers.');
    await fetch(`${url}/api/books/${bookId}/closed`, { method: 'DELETE' });
    assert.deepEqual(
      (({ finishedOn, closingLine }) => ({ finishedOn, closingLine }))(await Article.findById(bookId).lean()),
      { finishedOn: '', closingLine: '' }
    );
    const notABook = await Article.create({ userId, url: 'https://example.com/essay', title: 'An essay' });
    assert.equal((await fetch(`${url}/api/books/${notABook._id}/closed`, { method: 'PUT' })).status, 404);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
