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

const FIXTURES = path.join(__dirname, '../../fixtures/imports');
const read = (relative) => fs.readFileSync(path.join(FIXTURES, relative));

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

const send = async (url, files, extra = {}) => {
  const form = new FormData();
  files.forEach(([relative, sentPath]) => {
    form.append('files', new Blob([read(relative)]), path.basename(relative));
    if (sentPath !== undefined) form.append('paths', sentPath);
  });
  Object.entries(extra).forEach(([key, value]) => form.append(key, value));
  const response = await fetch(`${url}/api/import/files`, { method: 'POST', body: form });
  return { status: response.status, body: await response.json() };
};

test('real Mongo: export files land as books, saved articles and notes, and a second import adds nothing', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const models = require('../../models');
    const { Article, Folder, TagMeta, NotebookEntry, NotebookFolder, ImportSession, NoeisReceipt } = models;
    await Promise.all(Object.values(models).filter(Model => Model?.createCollection).map(Model => Model.createCollection()));
    const userId = new mongoose.Types.ObjectId();
    const essays = await Folder.create({ userId, name: 'Essays' });
    const cities = await TagMeta.create({ userId, name: 'Cities' });
    // A book that came through the old Readwise CSV import, shelved without its author.
    await Article.create({
      userId,
      url: 'import://readwise/the-origin-of-species-source',
      title: 'The Origin of Species',
      content: '',
      highlights: [{ text: 'There is grandeur in this view of life.' }]
    });

    const indexed = [];
    const app = express();
    app.use(buildImportRouter({
      authenticateToken: (req, res, next) => { req.user = { id: String(userId) }; next(); },
      upload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }),
      slugify: value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      Article,
      Folder,
      TagMeta,
      NotebookEntry,
      ImportSession,
      NoeisReceipt,
      trackEvent: () => {},
      EVENT_NAMES: { CAPTURE_COMPLETED: 'capture_completed' },
      crypto,
      syncNotebookReferences: async () => {},
      enqueueArticleEmbedding: async (article) => { indexed.push(['article', article.title]); },
      enqueueHighlightEmbedding: async ({ highlight }) => { indexed.push(['highlight', highlight.text]); },
      enqueueNotebookEmbedding: async (entry) => { indexed.push(['note', entry.title]); }
    }));
    const listening = await listen(app);
    server = listening.server;
    const { url } = listening;

    // Kindle: two books, the repeat and the edit folded, the stray note counted.
    const session = await ImportSession.create({ userId, provider: 'kindle', mode: 'file_upload', sourceLabel: 'My Clippings.txt' });
    const kindle = await send(url, [['kindle-my-clippings.txt']], { importSessionId: String(session._id) });
    assert.equal(kindle.status, 200);
    assert.equal(kindle.body.importedHighlights, 2);
    assert.equal(kindle.body.alreadyHere, 1);
    assert.equal(
      kindle.body.summary,
      'Imported 2 highlights from 2 books; 1 was already here. 1 Kindle note had no highlight to sit beside and was left out.'
    );
    assert.equal(kindle.body.receipt.summary, kindle.body.summary, 'the receipt says what the response says');
    const darwin = await Article.findOne({ userId, url: 'import://readwise/the-origin-of-species-source' }).lean();
    assert.equal(darwin.highlights.length, 2, 'the book already here gained the new passage instead of a twin');
    assert.equal(darwin.highlights[1].importMeta.sourcePath, 'Page 40 · Location 610–613');
    assert.equal(darwin.highlights[1].importMeta.provider, 'kindle');
    assert.equal(await Article.countDocuments({ userId, url: /^import:\/\/kindle\// }), 1, 'only Meditations was new');
    const finished = await ImportSession.findById(session._id).lean();
    assert.equal(finished.status, 'completed');
    assert.equal(finished.receipt.summary, kindle.body.summary);
    assert.equal(await NoeisReceipt.countDocuments({ userId }), 1);
    assert.ok(indexed.some(([kind, text]) => kind === 'highlight' && /small inherited modifications/.test(text)));

    const again = await send(url, [['kindle-my-clippings.txt']]);
    assert.equal(again.body.importedHighlights, 0);
    assert.equal(again.body.summary, 'Everything in that export was already here. 1 Kindle note had no highlight to sit beside and was left out.');
    assert.equal((await Article.findOne({ userId, url: 'import://readwise/the-origin-of-species-source' }).lean()).highlights.length, 2);

    // Instapaper then Pocket: the same essay is one article; folders and concepts are matched, never made.
    const instapaper = await send(url, [['instapaper-export.csv']]);
    assert.equal(instapaper.body.summary, 'Imported 1 highlight from 1 article; saved 2 articles. 1 entry could not be read.');
    const essay = await Article.findOne({ userId, url: 'https://example.com/essays/attention' }).lean();
    assert.equal(String(essay.folder), String(essays._id));
    assert.equal(essay.highlights[0].text, 'Attention is the beginning of devotion.');
    assert.equal(await Folder.countDocuments({ userId }), 1);

    const pocket = await send(url, [['pocket-ril_export.html'], ['pocket-part_000000.csv']]);
    assert.equal(pocket.status, 200);
    assert.equal(pocket.body.summary, 'Saved 2 articles; 3 were already here.');
    const tides = await Article.findOne({ userId, url: 'https://example.com/science/tides' }).lean();
    assert.equal(tides.title, 'Why the Tides & the Moon');
    assert.equal(tides.createdAt.toISOString(), '2019-01-01T00:01:40.000Z', 'a saved link keeps the day it was saved');
    assert.deepEqual((await TagMeta.findById(cities._id).lean()).pinnedArticleIds.map(String), [
      String((await Article.findOne({ userId, url: 'https://example.com/longform/cities' }).lean())._id)
    ]);
    assert.equal(await TagMeta.countDocuments({ userId }), 1, 'Pocket tags never invent concepts');
    assert.deepEqual((await Article.findOne({ userId, url: 'https://example.com/garden/quiet' }).lean()).importMeta.tags, undefined);

    // A folder of Markdown becomes Think notes in mirrored folders; unchanged notes are left alone.
    const vault = [
      ['vault/Reading/On reading slowly.md', 'vault/Reading/On reading slowly.md'],
      ['vault/Project Notes 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md', 'vault/Project Notes 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md']
    ];
    const notes = await send(url, vault);
    assert.equal(notes.body.summary, 'Brought in 2 notes.');
    const slow = await NotebookEntry.findOne({ userId, title: 'On reading slowly' }).lean();
    assert.deepEqual([...slow.tags], ['reading', 'attention']);
    assert.equal(slow.importMeta.externalId, 'vault/Reading/On reading slowly.md');
    const folder = await NotebookFolder.findById(slow.folder).lean();
    assert.equal(folder.name, 'Reading');
    assert.equal(folder.importMeta.sourcePath, 'vault / Reading');
    const notesAgain = await send(url, vault);
    assert.equal(notesAgain.body.summary, 'Everything in that export was already here.');
    assert.equal(await NotebookEntry.countDocuments({ userId }), 2);

    // Silence: a file nobody recognises imports nothing and says only that.
    const form = new FormData();
    form.append('files', new Blob(['a,b\n1,2']), 'numbers.csv');
    const unknown = await (await fetch(`${url}/api/import/files`, { method: 'POST', body: form })).json();
    assert.equal(unknown.summary, 'Nothing in those files read as highlights, saved articles or notes.');
    assert.deepEqual(unknown.warningCodes, ['unrecognised_files']);
    assert.equal(unknown.receipt.nextAction, null);

    const empty = await fetch(`${url}/api/import/files`, { method: 'POST', body: new FormData() });
    assert.equal(empty.status, 400);
    const tooLarge = await new Promise((resolve, reject) => {
      const request = http.request(`${url}/api/import/files`, {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(61 * 1024 * 1024) }
      }, (response) => {
        let text = '';
        response.on('data', chunk => { text += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
      });
      request.on('error', reject);
      request.write('--x');
    });
    assert.equal(tooLarge.status, 413);
    assert.match(tooLarge.body.error, /smaller batches/);

    // A chunked upload sends no length, so the limit is counted in the stream.
    const chunked = await new Promise((resolve, reject) => {
      const request = http.request(`${url}/api/import/files`, {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=x' }
      }, (response) => {
        let text = '';
        response.on('data', chunk => { text += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
      });
      request.on('error', () => {});
      const filler = Buffer.alloc(1024 * 1024, 'a');
      let file = 0;
      const writeFile = () => {
        if (file === 5) return request.end('\r\n--x--\r\n');
        request.write(`--x\r\nContent-Disposition: form-data; name="files"; filename="part-${file}.txt"\r\n\r\n`);
        for (let megabyte = 0; megabyte < 14; megabyte += 1) request.write(filler);
        request.write('\r\n');
        file += 1;
        return setImmediate(writeFile);
      };
      writeFile();
      setTimeout(() => reject(new Error('no answer to an oversized chunked upload')), 30000).unref();
    });
    assert.equal(chunked.status, 413);
    assert.match(chunked.body.error, /smaller batches/);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
