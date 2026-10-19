const { test } = require('node:test');
const assert = require('node:assert/strict');
const { returningOf, closedBookToday } = require('./closedBooks');

const closed = (finishedAt, closingLine = 'Nobody is only what they do.') => ({ finishedAt: new Date(finishedAt), closingLine });

test('a closed book comes back on its anniversary, every year, for that week', () => {
  const book = closed('2025-10-19T21:00:00Z');
  assert.equal(returningOf(book, new Date('2026-10-18T12:00:00Z')), null);
  assert.deepEqual(returningOf(book, new Date('2026-10-19T08:00:00Z')), { years: 1, days: 0 });
  assert.deepEqual(returningOf(book, new Date('2026-10-25T08:00:00Z')), { years: 1, days: 6 });
  assert.equal(returningOf(book, new Date('2026-10-26T08:00:00Z')), null);
  assert.deepEqual(returningOf(book, new Date('2028-10-19T08:00:00Z')), { years: 3, days: 0 });
});

test('the day is the reader’s own: an evening in California is still that evening', () => {
  // 9pm on 19 October in Los Angeles is the 20th in UTC.
  const book = closed('2025-10-20T04:00:00Z');
  assert.deepEqual(returningOf(book, new Date('2026-10-19T16:00:00Z'), 420), { years: 1, days: 0 });
  assert.equal(returningOf(book, new Date('2026-10-19T16:00:00Z'))?.days, undefined);
});

test('a book closed without a sentence, or not closed, never comes back', () => {
  assert.equal(returningOf(closed('2025-10-19T21:00:00Z', '  '), new Date('2026-10-19T21:00:00Z')), null);
  assert.equal(returningOf({ finishedAt: null, closingLine: 'x' }, new Date('2026-10-19T21:00:00Z')), null);
  assert.equal(returningOf(closed('2026-10-01T21:00:00Z'), new Date('2026-10-19T21:00:00Z')), null);
});

test('the paper carries a book only on the day itself', async () => {
  const rows = [
    { _id: 'b1', title: 'Middlemarch', ...closed('2025-10-15T12:00:00Z') },
    { _id: 'b2', title: 'Persuasion', ...closed('2025-10-19T12:00:00Z', 'Waiting can be a choice.') }
  ];
  const Article = { find: () => ({ select: () => ({ sort: () => ({ lean: async () => rows }) }) }) };
  assert.deepEqual(
    await closedBookToday({ Article, userId: 'u1', now: new Date('2026-10-19T09:00:00Z') }),
    { articleId: 'b2', title: 'Persuasion', line: 'Waiting can be a choice.', years: 1 }
  );
  assert.equal(await closedBookToday({ Article, userId: 'u1', now: new Date('2026-10-17T09:00:00Z') }), null);
});
