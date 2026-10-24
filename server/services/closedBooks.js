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

/* Every time a book was closed, the earlier readings first. A sentence
   still comes back after the book is read again: it was promised. */
const closingsOf = (book = {}) => [...(book.readBefore || []), book];

/* The closing of this book coming back today, with its sentence. */
const bookReturning = (book, today) => {
  for (const closing of closingsOf(book)) {
    const back = returningOf(closing, today);
    if (back) return { ...back, line: closing.closingLine };
  }
  return null;
};

/* Which reading a moment belongs to: 0 for the first, and one more for each
   time the book was started again before it. */
const readingAt = (book, at) => (book.readBefore || []).filter(({ until }) => new Date(at) >= new Date(until)).length;

/* The marks of the reading a moment belongs to. A passage marked again on a
   second reading is a new mark beside the old one, never folded into it. */
const marksOfReading = (book, at = new Date()) => (
  (book.highlights || []).filter(mark => readingAt(book, mark.createdAt) === readingAt(book, at))
);

/* The Morning Paper carries a closed book on its anniversary only, so the
   sentence comes back once a year, not every morning of that week. */
const closedBookToday = async ({ Article, userId, today }) => {
  if (!Article || !userId) return null;
  const books = await Article.find({ userId, url: BOOK_URL, $or: [{ closingLine: { $gt: '' } }, { 'readBefore.closingLine': { $gt: '' } }] })
    .select('title finishedOn closingLine readBefore')
    .sort({ finishedOn: -1 })
    .lean();
  for (const book of books) {
    const back = bookReturning(book, today);
    if (back?.days === 0) return { articleId: String(book._id), title: book.title, line: back.line, years: back.years };
  }
  return null;
};

module.exports = { calendarDay, returningOf, bookReturning, marksOfReading, closedBookToday, RETURN_DAYS };
