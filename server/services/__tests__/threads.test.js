const { test } = require('node:test');
const assert = require('node:assert/strict');
const { refused, threadAsItIs, threadFrom, timeToLook, waiting } = require('../threads');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-25T18:00:00Z');
const ago = days => new Date(NOW - days * DAY);
const anchor = { articleId: 'a', highlightId: 'ha', createdAt: ago(1) };
const passage = (work, days) => ({ _id: `h${work}`, articleId: work, createdAt: ago(days) });

test('threads: enough works and enough years make a thread, oldest first', () => {
  assert.deepEqual(threadFrom(anchor, [passage('b', 300), passage('c', 900)]).map(mark => mark.highlightId), ['hc', 'hb', 'ha']);
  assert.equal(threadFrom(anchor, [passage('b', 300)]), null, 'two works are an echo, not a thread');
  assert.equal(threadFrom(anchor, [passage('b', 100), passage('c', 200)]), null, 'a few months is not years of reading');
  assert.equal(threadFrom(anchor, [passage('b', 400), { ...passage('b', 900), _id: 'hb2' }]), null, 'one passage a work');
});

test('threads: rare, waiting, and never offered again once refused', () => {
  assert.equal(timeToLook([{ createdAt: ago(20) }], NOW), true);
  assert.equal(timeToLook([{ createdAt: ago(3) }], NOW), false, 'a fortnight between them');
  assert.equal(waiting([{ answer: 'kept' }, { answer: null, _id: 't2' }])._id, 't2');
  const marks = [{ articleId: 'a', highlightId: 'ha' }, { articleId: 'b', highlightId: 'hb' }, { articleId: 'c', highlightId: 'hc' }];
  assert.equal(refused([{ answer: 'not a thing', marks: marks.slice(1) }], marks), true);
  assert.equal(refused([{ answer: 'not yet', marks }], marks), false, 'not yet can form again');
});

test('threads: read as the library is now', () => {
  const thread = { _id: 't', answer: null, marks: [{ articleId: 'a', highlightId: 'ha' }, { articleId: 'b', highlightId: 'hb' }, { articleId: 'c', highlightId: 'hc' }] };
  const articles = [
    { _id: 'a', title: 'Meditations', url: 'import://readwise/book/1', highlights: [{ _id: 'ha', text: 'One', createdAt: ago(900) }] },
    { _id: 'b', title: 'Vegetius', url: 'https://x', highlights: [{ _id: 'hb', text: 'Two', createdAt: ago(9) }] }
  ];
  const read = threadAsItIs(thread, articles);
  assert.equal(read.title, 'A thread through Meditations and Vegetius');
  assert.deepEqual(read.marks.map(mark => [mark.book, mark.text]), [[true, 'One'], [false, 'Two']]);
  assert.equal(threadAsItIs(thread, articles.slice(0, 1)), null, 'fewer than two passages is no thread');
});
