const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { buildMuseumRouter } = require('./museumRoutes');
const { requireHumanReader } = require('../services/agentTokenService');

const listen = app => new Promise(resolve => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

// The signed-in reader is named by a header; an agent token is marked the way the real middleware marks it.
const auth = (req, _res, next) => {
  req.user = { id: req.get('x-user') };
  if (req.get('x-agent')) req.agentToken = { id: 'agent' };
  next();
};

test('real Mongo: a wall shows the one passage its owner hung, and nothing else of theirs', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const { Museum, Article, WikiPage, NotebookEntry, Thread } = require('../models');
    await Museum.init();
    const [owner, stranger] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const hamming = await Article.create({
      userId: owner, title: 'You and Your Research', author: 'Richard Hamming', url: 'https://example.com/hamming', publicationDate: '1986',
      evergreen: true, evergreenAt: new Date('2017-01-01'),
      highlights: [
        { text: 'Luck favors the prepared mind.', note: 'the whole talk' },
        { text: 'Knowledge and productivity are like compound interest.', note: 'a private aside about my manager' },
        { text: 'If you do not work on important problems, it is unlikely you will do important work.' }
      ]
    });
    const rams = await Article.create({ userId: owner, title: 'Ten principles for good design', url: 'https://example.com/rams', evergreen: true, evergreenAt: new Date('2018-01-01') });
    // A passage kept for good, in a work that is not itself kept, is offered with that passage.
    const feynman = await Article.create({ userId: owner, title: 'Cargo Cult Science', url: 'https://example.com/feynman', highlights: [
      { text: 'Some other passage.' },
      { text: 'The first principle is that you must not fool yourself.', keptAt: new Date('2019-01-01') }
    ] });
    const theirs = await Article.create({ userId: stranger, title: 'Not yours', url: 'https://example.com/theirs' });
    // A kept thread hangs whole: the passages it holds, from the works it runs through.
    const meditations = await Article.create({ userId: owner, title: 'Meditations', url: 'https://example.com/meditations', highlights: [{ text: 'The best revenge is not to be like your enemy.' }] });
    const kept = await Thread.create({ userId: owner, answer: 'kept', answeredAt: new Date('2020-01-01'), marks: [
      { articleId: feynman._id, highlightId: feynman.highlights[1]._id },
      { articleId: meditations._id, highlightId: meditations.highlights[0]._id }
    ] });
    const unkept = await Thread.create({ userId: owner, answer: 'not a thing', marks: kept.marks });
    const page = await WikiPage.create({ userId: owner, title: 'Alphabet is Berkshire Hathaway 2.0', slug: 'alphabet-berkshire', status: 'published', visibility: 'shared', plainText: 'A collection of compounding businesses. Run by people who think in decades. More.' });

    const app = express();
    app.use(express.json());
    app.use(buildMuseumRouter({ auth, humanOnly: requireHumanReader, Museum, Article, WikiPage, NotebookEntry, Thread }));
    let url;
    ({ server, url } = await listen(app));
    const call = async (method, path, body, { as = owner, agent = false } = {}) => {
      const response = await fetch(`${url}${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-user': String(as), ...(agent ? { 'x-agent': '1' } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      return { status: response.status, body: await response.json() };
    };

    const first = await call('GET', '/api/museum');
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.museum.pieces, []);
    assert.deepEqual(first.body.kept.map(held => held.title), ['You and Your Research', 'Ten principles for good design', 'Cargo Cult Science', 'A thread through Cargo Cult Science and Meditations']);
    assert.deepEqual(first.body.kept[3], { kind: 'thread', id: String(kept._id), title: 'A thread through Cargo Cult Science and Meditations', passage: '' });
    const strand = await call('GET', `/api/museum/sources/thread/${kept._id}`);
    assert.deepEqual(strand.body.source.passages, [
      { text: 'The first principle is that you must not fool yourself.', note: 'Cargo Cult Science' },
      { text: 'The best revenge is not to be like your enemy.', note: 'Meditations' }
    ]);
    assert.equal(strand.body.source.medium, 'A thread in Noeis');
    assert.equal((await call('GET', `/api/museum/sources/thread/${unkept._id}`)).status, 404);
    assert.deepEqual(first.body.kept[2], { kind: 'article', id: String(feynman._id), title: 'Cargo Cult Science', passage: 'The first principle is that you must not fool yourself.' });

    const offer = await call('GET', `/api/museum/sources/article/${hamming._id}`);
    assert.equal(offer.body.source.passages.length, 3);
    assert.equal(offer.body.piece, null);

    const passage = 'Luck favors the prepared mind.';
    const hang = { kind: 'article', id: String(hamming._id), passage, why: 'It taught me to choose the problem first.', room: 'Craft' };
    assert.equal((await call('POST', '/api/museum/pieces', hang, { agent: true })).status, 403);
    assert.equal((await call('POST', '/api/museum/pieces', { ...hang, id: String(theirs._id) })).status, 404);
    assert.equal((await call('POST', '/api/museum/pieces', { ...hang, why: ' ' })).status, 400);

    const hung = await call('POST', '/api/museum/pieces', hang);
    assert.equal(hung.status, 201);
    const year = String(hamming.createdAt.getFullYear());
    assert.equal(hung.body.accession, `${year}.1`);
    assert.equal((await call('POST', '/api/museum/pieces', hang)).status, 409);
    assert.deepEqual(hung.body.museum.pieces[0], {
      accession: `${year}.1`, own: false, passage, why: hang.why, title: 'You and Your Research', author: 'Richard Hamming', medium: '', year: '1986',
      room: 'Craft', ledTo: [], url: 'https://example.com/hamming', reviewedAt: null, kind: 'article', id: String(hamming._id)
    });
    const ownPage = await call('POST', '/api/museum/pieces', { kind: 'wiki', id: String(page._id), passage: 'A collection of compounding businesses.', why: 'My first public dossier.' });
    assert.equal(ownPage.status, 201);
    assert.equal(ownPage.body.accession, `${year}.2`);

    assert.equal((await call('PUT', '/api/museum', { open: true })).status, 400);
    assert.equal((await call('PUT', '/api/museum', { handle: 'no spaces' })).status, 400);
    const opened = await call('PUT', '/api/museum', { name: 'Athan', handle: 'Athan', intro: 'What shaped how I think.', open: true });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.museum.handle, 'athan');
    assert.equal((await call('PUT', '/api/museum', { handle: 'athan' }, { as: stranger })).status, 409);

    await call('PATCH', `/api/museum/pieces/${year}.1`, { ledTo: [`${year}.2`], medium: 'Talk at Bell Labs' });
    const wall = await call('GET', '/api/public/museums/ATHAN');
    assert.equal(wall.status, 200);
    const text = JSON.stringify(wall.body);
    for (const secret of ['compound interest', 'private aside', 'the whole talk', 'important problems', String(owner), String(hamming._id), String(page._id)]) {
      assert.equal(text.includes(secret), false, secret);
    }
    assert.deepEqual(wall.body.museum.pieces.map(piece => [piece.accession, piece.url, piece.ledTo]), [
      [`${year}.1`, 'https://example.com/hamming', [`${year}.2`]],
      [`${year}.2`, '/share/wiki/alphabet-berkshire', []]
    ]);

    const reordered = await call('PUT', '/api/museum/order', { order: [`${year}.2`, `${year}.1`] });
    assert.deepEqual(reordered.body.museum.pieces.map(piece => piece.accession), [`${year}.2`, `${year}.1`]);
    assert.equal((await call('PUT', '/api/museum/order', { order: [`${year}.2`] })).status, 400);

    const takenDown = await call('DELETE', `/api/museum/pieces/${year}.1`);
    assert.deepEqual(takenDown.body.museum.pieces.map(piece => piece.accession), [`${year}.2`]);
    const next = await call('POST', '/api/museum/pieces', { kind: 'article', id: String(rams._id), passage: 'Good design is as little design as possible.', why: 'Less, but better.' });
    assert.equal(next.body.accession, `${year}.3`);
    assert.deepEqual((await call('GET', '/api/public/museums/athan')).body.museum.retired, [`${year}.1`]);

    await call('PUT', '/api/museum', { open: false });
    assert.deepEqual(await call('GET', '/api/public/museums/athan'), { status: 404, body: { error: 'This museum is closed.' } });
  } finally {
    server?.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
