const { BOOK_URL } = require('./import/exportFiles');

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;
// A book coming back stays on the shelf for the week of its anniversary.
const RETURN_DAYS = 7;

/* A day as the reader's own calendar names it ("2026-10-19"). Closing a book
   keeps that day rather than a moment, so no timezone or clock change can
   move its anniversary. */
const calendarDay = (day, fallback = new Date()) => (
  CALENDAR_DAY.test(String(day || '')) ? String(day) : fallback.toISOString().slice(0, 10)
);

/* A finished book comes back on the day you closed it, a year on and every
   year after. Only a book closed with a sentence comes back: without one
   there is nothing to hand you, and a book is never brought back as filler. */
const returningOf = ({ finishedOn, closingLine } = {}, today = '') => {
  if (!CALENDAR_DAY.test(finishedOn || '') || !CALENDAR_DAY.test(today) || !String(closingLine || '').trim()) return null;
  const [year, month, day] = finishedOn.split('-').map(Number);
  const now = Date.parse(`${today}T00:00:00Z`);
  const on = years => Date.UTC(year + years, month - 1, day);
  let years = Number(today.slice(0, 4)) - year;
  if (on(years) > now) years -= 1;
  if (years < 1) return null;
  const days = Math.round((now - on(years)) / DAY_MS);
  return days < RETURN_DAYS ? { years, days } : null;
};

/* The Morning Paper carries a closed book on its anniversary only, so the
   sentence comes back once a year, not every morning of that week. */
const closedBookToday = async ({ Article, userId, today }) => {
  if (!Article || !userId) return null;
  const books = await Article.find({ userId, url: BOOK_URL, finishedOn: { $gt: '' }, closingLine: { $gt: '' } })
    .select('title finishedOn closingLine')
    .sort({ finishedOn: -1 })
    .lean();
  const book = books.find(item => returningOf(item, today)?.days === 0);
  return book
    ? { articleId: String(book._id), title: book.title, line: book.closingLine, years: returningOf(book, today).years }
    : null;
};

module.exports = { calendarDay, returningOf, closedBookToday, RETURN_DAYS };
