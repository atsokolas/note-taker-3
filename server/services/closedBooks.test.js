const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calendarDay, returningOf, closedBookToday } = require('./closedBooks');

const closed = (finishedOn, closingLine = 'Nobody is only what they do.') => ({ finishedOn, closingLine });

test('a closed book comes back on its anniversary, every year, for that week', () => {
  const book = closed('2025-10-19');
  assert.equal(returningOf(book, '2026-10-18'), null);
  assert.deepEqual(returningOf(book, '2026-10-19'), { years: 1, days: 0 });
  assert.deepEqual(returningOf(book, '2026-10-25'), { years: 1, days: 6 });
  assert.equal(returningOf(book, '2026-10-26'), null);
  assert.deepEqual(returningOf(book, '2028-10-19'), { years: 3, days: 0 });
});

test('the day is a calendar day, so clocks changing never move it', () => {
  // Closed just after midnight on 1 November, the night New York leaves summer time.
  assert.equal(returningOf(closed('2025-11-01'), '2026-10-31'), null);
  assert.deepEqual(returningOf(closed('2025-11-01'), '2026-11-01'), { years: 1, days: 0 });
  // A 29 February closing comes back on 1 March in the years between.
  assert.deepEqual(returningOf(closed('2028-02-29'), '2029-03-01'), { years: 1, days: 0 });
});

test('a book closed without a sentence, or not closed, never comes back', () => {
  assert.equal(returningOf(closed('2025-10-19', '  '), '2026-10-19'), null);
  assert.equal(returningOf({ finishedOn: '', closingLine: 'x' }, '2026-10-19'), null);
  assert.equal(returningOf(closed('2026-10-01'), '2026-10-19'), null);
  assert.equal(returningOf(closed('2025-10-19'), 'not a day'), null);
});

test('a day the reader sends is kept; anything else is today in UTC', () => {
  assert.equal(calendarDay('2026-10-19'), '2026-10-19');
  assert.equal(calendarDay('19/10/2026', new Date('2026-10-20T03:00:00Z')), '2026-10-20');
});

test('the paper carries a book only on the day itself', async () => {
  const rows = [
    { _id: 'b1', title: 'Middlemarch', ...closed('2025-10-15') },
    { _id: 'b2', title: 'Persuasion', ...closed('2025-10-19', 'Waiting can be a choice.') }
  ];
  const Article = { find: () => ({ select: () => ({ sort: () => ({ lean: async () => rows }) }) }) };
  assert.deepEqual(
    await closedBookToday({ Article, userId: 'u1', today: '2026-10-19' }),
    { articleId: 'b2', title: 'Persuasion', line: 'Waiting can be a choice.', years: 1 }
  );
  assert.equal(await closedBookToday({ Article, userId: 'u1', today: '2026-10-17' }), null);
});
