const { BOOK_URL } = require('./import/exportFiles');

const DAY_MS = 24 * 60 * 60 * 1000;
// A book coming back stays on the shelf for the week of its anniversary.
const RETURN_DAYS = 7;

const localDay = (date, offsetMinutes = 0) => {
  const local = new Date(new Date(date).getTime() - offsetMinutes * 60000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
};

/* A finished book comes back on the day you closed it, a year on and every
   year after. Only a book closed with a sentence comes back: without one
   there is nothing to hand you, and a book is never brought back as filler.
   Days are counted in the reader's own calendar. */
const returningOf = ({ finishedAt, closingLine } = {}, now = new Date(), offsetMinutes = 0) => {
  if (!finishedAt || !String(closingLine || '').trim()) return null;
  const closed = new Date(localDay(finishedAt, offsetMinutes));
  const today = localDay(now, offsetMinutes);
  const on = years => Date.UTC(closed.getUTCFullYear() + years, closed.getUTCMonth(), closed.getUTCDate());
  let years = new Date(today).getUTCFullYear() - closed.getUTCFullYear();
  if (on(years) > today) years -= 1;
  if (years < 1) return null;
  const days = Math.round((today - on(years)) / DAY_MS);
  return days < RETURN_DAYS ? { years, days } : null;
};

/* The Morning Paper carries a closed book on its anniversary only, so the
   sentence comes back once a year, not every morning of that week. */
const closedBookToday = async ({ Article, userId, now = new Date(), offsetMinutes = 0 }) => {
  if (!Article || !userId) return null;
  const books = await Article.find({ userId, url: BOOK_URL, finishedAt: { $ne: null }, closingLine: { $gt: '' } })
    .select('title finishedAt closingLine')
    .sort({ finishedAt: -1 })
    .lean();
  const book = books.find(item => returningOf(item, now, offsetMinutes)?.days === 0);
  return book
    ? { articleId: String(book._id), title: book.title, line: book.closingLine, years: returningOf(book, now, offsetMinutes).years }
    : null;
};

module.exports = { returningOf, closedBookToday, RETURN_DAYS };
