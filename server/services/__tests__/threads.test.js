const { test } = require('node:test');
const assert = require('node:assert/strict');
const { joining, refused, threadAsItIs, threadFrom, timeToLook, waiting } = require('../threads');

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

test('a kept thread grows only by what was marked since, elsewhere, and not passed on', () => {
  const thread = { answeredAt: ago(10), marks: [{ articleId: 'a', highlightId: 'ha' }, { articleId: 'b', highlightId: 'hb' }], passed: [{ articleId: 'd', highlightId: 'hd' }] };
  const passage = (articleId, days) => ({ _id: `h${articleId}`, articleId, articleTitle: `Work ${articleId}`, text: 'Words', createdAt: ago(days) });
  assert.equal(joining(thread, [passage('c', 20), passage('a', 1), passage('d', 1)]), null, 'before it was kept, already on it, or passed on');
  assert.deepEqual(joining(thread, [passage('e', 2)]), { articleId: 'e', highlightId: 'he', book: false, title: 'Work e', text: 'Words', createdAt: ago(2) });
});
