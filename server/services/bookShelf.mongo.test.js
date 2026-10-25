const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { BOOK_URL } = require('./import/exportFiles');
const { shelveBooks } = require('./bookShelf');

test('real Mongo: books Readwise left in the Library go onto the shelf, into the book already there by that title', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  try {
    await mongoose.connect(mongo.getUri());
    const { Article } = require('../models');
    await Article.createCollection();
    const userId = new mongoose.Types.ObjectId();
    const desk = await Article.create({
      userId, url: 'import://book/the-power-broker-robert-caro', title: 'The Power Broker', author: 'Robert Caro',
      highlights: [{ text: 'Power is not only what you have.' }]
    });
    const duplicate = await Article.create({
      userId, url: 'https://readwise.io/bookreview/101', title: 'The Power Broker', author: 'Robert A. Caro',
      highlights: [{ text: 'Power is not only what you have!' }, { text: 'He built the roads first.' }]
    });
    const alone = await Article.create({
      userId, url: 'https://readwise.io/bookreview/102', title: 'Middlemarch', author: 'George Eliot',
      highlights: [{ text: 'What do we live for, if it is not to make life less difficult?' }]
    });
    const article = await Article.create({ userId, url: 'https://example.com/essay', title: 'An essay', highlights: [{ text: 'Not a book.' }] });
    const moved = duplicate.highlights[1]._id;

    assert.equal(await shelveBooks({ Article, userId }), 2);

    const shelf = await Article.find({ userId, url: BOOK_URL }).sort({ title: 1 });
    assert.deepEqual(shelf.map(book => book.title), ['Middlemarch', 'The Power Broker']);
    const book = shelf.find(item => String(item._id) === String(desk._id));
    assert.deepEqual(book.highlights.map(mark => mark.text), ['Power is not only what you have.', 'He built the roads first.']);
    assert.equal(String(book.highlights[1]._id), String(moved), 'a moved mark keeps its id');
    assert.equal(String(shelf[0]._id), String(alone._id), 'a book alone keeps its id and marks');
    assert.equal(shelf[0].url, 'import://readwise/middlemarch-george-eliot');

    const stray = await Article.findById(duplicate._id);
    assert.equal(stray.archived, true, 'the stray is kept, hidden, so links to it still open');
    assert.deepEqual(stray.highlights.map(mark => mark.text), ['Power is not only what you have!']);
    assert.equal((await Article.findById(article._id)).url, 'https://example.com/essay');
    assert.equal(await shelveBooks({ Article, userId }), 0, 'shelving twice changes nothing');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
