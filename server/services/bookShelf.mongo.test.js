const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { BOOK_URL } = require('./import/exportFiles');
const { booksThisMorning, echoToday, shelveBooks } = require('./bookShelf');

test('real Mongo: books Readwise left in the Library go onto the shelf, into the book already there by that title', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  try {
    await mongoose.connect(mongo.getUri());
    const { Article } = require('../models');
    await Article.createCollection();
    const userId = new mongoose.Types.ObjectId();
    const desk = await Article.create({
      userId, url: 'import://book/the-power-broker-robert-caro', title: 'The Power Broker', author: 'Robert Caro',
      highlights: [{ text: 'Power is not only what you have.' }, { text: '', note: 'Why roads first?' }]
    });
    const duplicate = await Article.create({
      userId, url: 'https://readwise.io/bookreview/101', title: 'The Power Broker', author: 'Robert A. Caro',
      highlights: [{ text: 'Power is not only what you have!' }, { text: 'He built the roads first.' }, { text: '', note: 'Why roads first' }, { text: '', note: 'Who said no?' }]
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
    assert.deepEqual(book.highlights.map(mark => mark.text || mark.note), ['Power is not only what you have.', 'Why roads first?', 'He built the roads first.', 'Who said no?'], 'a note is told apart by its own words');
    assert.equal(String(book.highlights[2]._id), String(moved), 'a moved mark keeps its id');
    assert.equal(String(shelf[0]._id), String(alone._id), 'a book alone keeps its id and marks');
    assert.equal(shelf[0].url, 'import://readwise/middlemarch-george-eliot');

    const stray = await Article.findById(duplicate._id);
    assert.equal(stray.archived, true, 'the stray is kept, hidden');
    assert.equal(String(stray.mergedInto), String(desk._id), 'and points at the book, so links to it open the book');
    assert.deepEqual(stray.highlights.map(mark => mark.text || mark.note), ['Power is not only what you have!', 'Why roads first']);
    assert.equal((await Article.findById(article._id)).url, 'https://example.com/essay');
    assert.equal(await shelveBooks({ Article, userId }), 0, 'shelving twice changes nothing');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('real Mongo: the Morning Paper brings a book back only on the morning something is true of it', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  try {
    await mongoose.connect(mongo.getUri());
    const { Article } = require('../models');
    await Article.createCollection();
    const userId = new mongoose.Types.ObjectId();
    const now = new Date('2026-10-25T07:00:00Z');
    const daysAgo = days => new Date(now - days * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
    const asked = await Article.create({
      userId, url: 'import://book/middlemarch-george-eliot', title: 'Middlemarch', finishedOn: '2026-09-01',
      highlights: [{ text: '', note: 'Why does Dorothea marry him?', createdAt: daysAgo(40) }]
    });
    await Article.create({
      userId, url: 'import://book/the-power-broker-robert-caro', title: 'The Power Broker',
      highlights: [{ text: 'He built the roads first.', page: 212, createdAt: daysAgo(7) }, { text: '', note: 'Why roads first?', createdAt: new Date(daysAgo(7).getTime() + 60 * 1000) }]
    });
    await Article.create({ userId, url: 'import://book/dune-frank-herbert', title: 'Dune', highlights: [{ text: 'Fear is the mind-killer.', page: 8, createdAt: daysAgo(3) }] });
    const answer = { _id: 'h9', text: 'We mistake the shape of a life for its meaning.', createdAt: daysAgo(0), articleId: 'a2', articleTitle: 'Essays' };
    const seen = [];
    const answerTo = async ({ question }) => { seen.push(question.note); return question.note.startsWith('Why does') ? answer : null; };

    const morning = await booksThisMorning({ Article, userId, now, answerTo });
    assert.deepEqual(seen, ['Why roads first?', 'Why does Dorothea marry him?'], 'the newest question is asked first');
    assert.equal(String(morning.answered.question.bookId), String(asked._id));
    assert.equal(morning.answered.answer, answer);
    assert.deepEqual({ ...morning.stopped, bookId: undefined, at: undefined }, { bookId: undefined, at: undefined, title: 'The Power Broker', page: 212, words: 'Why roads first?' });

    const later = await booksThisMorning({ Article, userId, now: new Date(now.getTime() + 24 * 60 * 60 * 1000), answerTo });
    assert.deepEqual(later, { answered: null, stopped: null }, 'the next morning says nothing again');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('the day picks where to look for an echo, holds it all day, and a shelf with none shows none', async () => {
  const books = [{ _id: 'b1', title: 'Middlemarch', highlights: ['m1', 'm2', 'm3'].map(_id => ({ _id, text: `passage ${_id}`, createdAt: '2026-01-01' })).concat({ _id: 'm0', text: '', note: 'mine' }) }];
  const looked = [];
  const echoOf = async (mark) => { looked.push(mark._id); return mark._id === 'm3' ? { _id: 'e1', text: 'nearly the same' } : null; };
  const day = '2026-10-25';
  const start = Math.floor(Date.parse(day) / (24 * 60 * 60 * 1000)) % 3;
  const found = await echoToday({ books, today: day, echoOf });
  assert.equal(looked[0], ['m1', 'm2', 'm3'][start], 'the day says where to start');
  assert.ok(!looked.includes('m0'), 'a note of your own has no echo');
  assert.deepEqual(found, { mark: { _id: 'm3', text: 'passage m3', page: undefined, createdAt: '2026-01-01', bookId: 'b1', bookTitle: 'Middlemarch' }, echo: { _id: 'e1', text: 'nearly the same' } });
  assert.equal(await echoToday({ books, today: day, echoOf: async () => null }), null);
  assert.equal(await echoToday({ books: [], today: day, echoOf }), null);
});
