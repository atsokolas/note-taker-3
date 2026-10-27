const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bookReturning, calendarDay, marksOfReading, returningOf, closedBookToday } = require('./closedBooks');

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

test('a book read again keeps each reading: its marks, and its sentence coming back', () => {
  const until = new Date('2026-03-01T12:00:00Z');
  const first = { _id: 'a', text: 'Then.', createdAt: new Date('2025-09-01T12:00:00Z') };
  const second = { _id: 'b', text: 'Now.', createdAt: new Date('2026-03-02T12:00:00Z') };
  const book = { finishedOn: '', closingLine: '', readBefore: [{ finishedOn: '2025-10-19', closingLine: 'Waiting can be a choice.', until }], highlights: [first, second] };
  assert.deepEqual(marksOfReading(book, new Date('2026-04-01')).map(mark => mark._id), ['b']);
  assert.deepEqual(marksOfReading(book, '2025-09-05').map(mark => mark._id), ['a'], 'an old clipping joins the reading it came from');
  assert.deepEqual(bookReturning(book, '2026-10-19'), { years: 1, days: 0, line: 'Waiting can be a choice.' });
  assert.equal(bookReturning({ ...book, readBefore: [] }, '2026-10-19'), null);
  assert.deepEqual(marksOfReading(book, null).map(mark => mark._id), ['a', 'b'], 'an undated passage may be any reading');
});

test('the Morning Paper finds the closing whose day it is, past another closing that week', async () => {
  const book = {
    _id: 'b', title: 'Persuasion', finishedOn: '2025-10-20', closingLine: 'The second time.',
    readBefore: [{ finishedOn: '2024-10-18', closingLine: 'The first time.', until: new Date('2025-01-01') }]
  };
  const Article = { find: () => ({ select: () => ({ sort: () => ({ lean: async () => [book] }) }) }) };
  assert.deepEqual(await closedBookToday({ Article, userId: 'u', today: '2026-10-20' }), { articleId: 'b', title: 'Persuasion', line: 'The second time.', years: 1 });
});
