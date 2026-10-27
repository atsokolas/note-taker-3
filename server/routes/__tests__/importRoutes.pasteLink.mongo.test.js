const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildImportRouter } = require('../importRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

// A public address literal, so the public-URL guard needs no DNS.
const ESSAY = 'http://93.184.216.34/essay';
const PAGE = `<html><head><title>On Slow Reading</title></head><body><article>
  <p>Reading slowly is a way of keeping company with an argument.</p>
  <p>The second paragraph stays its own paragraph.</p>
</article></body></html>`;

test('real Mongo: a pasted link saves once, and a link already saved opens the copy you have', async () => {
  const memory = await MongoMemoryServer.create();
  let server;
  try {
    await mongoose.connect(memory.getUri());
    const { Article, Folder } = require('../../models');
    const userId = new mongoose.Types.ObjectId();
    let fetches = 0;
    const fetchImpl = async (url) => {
      fetches += 1;
      if (String(url).endsWith('/old')) return new Response('', { status: 301, headers: { location: ESSAY } });
      return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    };
    const app = express();
    app.use(express.json());
    app.use(buildImportRouter({
      authenticateToken: (req, _res, next) => { req.user = { id: String(userId) }; next(); },
      upload: { single: () => (_req, _res, next) => next() },
      Article,
      Folder,
      fetchImpl,
      enqueueArticleEmbedding: () => null
    }));
    ({ server } = await listen(app));
    const paste = async (url, extra = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/import/url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, ...extra })
      });
      return { status: response.status, body: await response.json() };
    };

    const first = await paste(ESSAY);
    assert.equal(first.status, 201);
    assert.equal(first.body.existing, false);
    assert.equal(first.body.article.title, 'On Slow Reading');
    const stored = await Article.findById(first.body.article._id).lean();
    assert.match(stored.content, /an argument\.\n\n\s*The second paragraph/);

    // The extension's richer copy is never overwritten by a second paste.
    await Article.updateOne({ _id: stored._id }, { content: '<p>Captured by the extension.</p>' });
    const again = await paste(ESSAY);
    assert.equal(again.status, 200);
    assert.equal(again.body.existing, true);
    assert.equal(String(again.body.article._id), String(stored._id));
    assert.equal(fetches, 1, 'a link already saved is not fetched again');

    // A link to a section of a saved piece opens the piece without asking the origin.
    const section = await paste(`${ESSAY}#second`);
    assert.equal(section.body.existing, true);
    assert.equal(fetches, 1);

    // A link that redirects to one already saved lands on that copy too.
    const moved = await paste('http://93.184.216.34/old');
    assert.equal(moved.body.existing, true);
    assert.equal(String(moved.body.article._id), String(stored._id));
    assert.equal((await Article.findById(stored._id).lean()).content, '<p>Captured by the extension.</p>');
    assert.equal(await Article.countDocuments({ userId }), 1);
    assert.equal((await Article.findById(stored._id).lean()).placement, 'stream', 'a plain paste does not move a piece');

    // For the nightstand: a piece already held moves there; one on the desk stays put.
    const toNightstand = await paste(ESSAY, { placement: 'later' });
    assert.equal(toNightstand.body.article.placement, 'later');
    assert.equal((await Article.findById(stored._id).lean()).placement, 'later');
    await Article.updateOne({ _id: stored._id }, { placement: 'setAside' });
    assert.equal((await paste(ESSAY, { placement: 'later' })).body.article.placement, 'setAside');
    // And a new piece lands there directly.
    const fresh = await paste('http://93.184.216.35/new', { placement: 'later' });
    assert.equal(fresh.status, 201);
    assert.equal((await Article.findById(fresh.body.article._id).lean()).placement, 'later');

    // Already read: it goes into the Library, and off the nightstand if it was there.
    const read = await paste('http://93.184.216.35/new', { placement: 'stream' });
    assert.equal(read.body.article.placement, 'stream');
    assert.equal((await Article.findById(fresh.body.article._id).lean()).placement, 'stream');

    // A chosen folder files the piece; someone else's folder is refused before any fetch.
    const essays = await Folder.create({ userId, name: 'Essays' });
    const filed = await paste('http://93.184.216.35/new', { folderId: String(essays._id) });
    assert.equal(filed.body.article.folder.name, 'Essays');
    assert.equal(String((await Article.findById(fresh.body.article._id).lean()).folder), String(essays._id));
    const theirs = await Folder.create({ userId: new mongoose.Types.ObjectId(), name: 'Theirs' });
    const before = fetches;
    const refused = await paste('http://93.184.216.35/other', { folderId: String(theirs._id) });
    assert.equal(refused.status, 400);
    assert.equal(fetches, before);
  } finally {
    server?.close();
    await mongoose.disconnect();
    await memory.stop();
  }
});
