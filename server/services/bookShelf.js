const { BOOK_URL, bookSource } = require('./import/exportFiles');
const { sameWords } = require('../utils/passages');

/* Readwise used to address a book with no web address of its own by its
   Readwise page, which kept the book in the Library and off the shelf. */
const READWISE_BOOK_PAGE = /^https:\/\/readwise\.io\/bookreview\//;

const DAY_MS = 24 * 60 * 60 * 1000;
// The newest questions asked beside books, each looked up once when asked for.
const OPEN_QUESTIONS = 20;
// A book in progress you have not written in for a week is brought back, once.
const STOPPED_DAYS = 7;
const BOOK_MARKS = 'title finishedOn highlights._id highlights.text highlights.note highlights.page highlights.createdAt';
// A book as its page shows it: its marks placed by page, or by the location an import gave.
const SHELF_BOOK = `${BOOK_MARKS} highlights.importMeta.sourcePath author createdAt updatedAt closingLine readBefore`;
const shelfMark = ({ importMeta, ...mark }) => ({ ...mark, location: importMeta?.sourcePath || '' });

/* A book already on the shelf, under any address an import gives it or by its title. */
const bookOnShelf = (shelf, book) => shelf.find(item => [book.url, ...book.aliases].includes(item.url))
  || shelf.find(item => sameWords(item.title) === sameWords(book.title));

// A question is a line of your own, with no words of the book's, ending in "?".
const isQuestion = mark => !mark.text && /\?\s*$/.test(mark.note || '');

/* The questions you typed beside your books, newest first. */
const openQuestions = books => books
  .flatMap(book => (book.highlights || [])
    .filter(isQuestion)
    .map(({ text, ...mark }) => ({ ...mark, bookId: book._id, bookTitle: book.title })))
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  .slice(0, OPEN_QUESTIONS);

/* What the Morning Paper says about your books this morning, each line only
   on the one morning it is true, so nothing is said twice: a question you
   asked that something you marked in the last day (since the paper before) speaks to, and the book in
   progress you last wrote in a week ago, where you stopped in it. */
const booksThisMorning = async ({ Article, userId, now = new Date(), answerTo }) => {
  const books = await Article.find({ userId, url: BOOK_URL }).select(BOOK_MARKS).lean();
  const daysSince = at => Math.floor((now - new Date(at)) / DAY_MS);
  let answered = null;
  for (const question of openQuestions(books)) {
    const answer = await answerTo({ userId, question }).catch(() => null);
    if (answer && daysSince(answer.createdAt) < 1) {
      answered = { question, answer };
      break;
    }
  }
  const stopped = books
    .filter(book => !book.finishedOn && book.highlights?.length)
    .map(book => {
      const marks = [...book.highlights].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { bookId: book._id, title: book.title, at: marks[0].createdAt, page: marks.find(mark => mark.page)?.page || null, words: marks[0].text || marks[0].note };
    })
    .find(book => daysSince(book.at) === STOPPED_DAYS) || null;
  return { answered, stopped };
};

/* Once a day, a passage you marked in a book beside its echo: nearly the
   same thought, marked in another work long before or after. The day picks
   where on the shelf to start looking, so the pair holds all day and turns
   over tomorrow; a day with nothing that close shows nothing. */
const ECHO_TRIES = 8;
const echoToday = async ({ books, today, echoOf }) => {
  const quotes = books
    .flatMap(book => (book.highlights || []).filter(mark => mark.text).map(mark => ({ ...mark, bookId: book._id, bookTitle: book.title })))
    .sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const start = Math.floor(Date.parse(today) / DAY_MS) % quotes.length;
  for (let tried = 0; tried < Math.min(ECHO_TRIES, quotes.length); tried += 1) {
    const { _id, text, page, createdAt, bookId, bookTitle } = quotes[(start + tried) % quotes.length];
    const mark = { _id, text, page, createdAt, bookId, bookTitle };
    const echo = await echoOf(mark).catch(() => null);
    if (echo) return { mark, echo };
  }
  return null;
};

// A quote is the same quote however it was marked; a note of your own is its words.
const sameMark = mark => (mark.text ? sameWords(mark.text) : `note:${sameWords(mark.note)}`);

/* Every book Readwise left in the Library goes onto the shelf: into the book
   already there by that title, its marks moving with their ids and the stray
   kept (hidden) pointing at the book, so links to it open the book; or else
   under a book's own address. */
const shelveBooks = async ({ Article, userId }) => {
  const strays = await Article.find({ userId, url: READWISE_BOOK_PAGE, archived: { $ne: true } });
  if (!strays.length) return 0;
  const shelf = await Article.find({ userId, url: BOOK_URL });
  for (const stray of strays) {
    const book = bookSource({ provider: 'readwise', title: stray.title, author: stray.author });
    const known = bookOnShelf(shelf, book);
    if (!known) {
      stray.url = book.url;
      await stray.save();
      shelf.push(stray);
      continue;
    }
    const marked = new Set(known.highlights.map(sameMark));
    const moving = stray.highlights.filter(mark => !marked.has(sameMark(mark)));
    known.highlights.push(...moving.map(mark => mark.toObject()));
    stray.highlights = stray.highlights.filter(mark => !moving.includes(mark));
    known.author ||= stray.author;
    stray.mergedInto = known._id;
    stray.archived = true;
    stray.hiddenFromHome = true;
    await known.save();
    await stray.save();
  }
  return strays.length;
};

/* A lent copy: the book as a friend reads it, its marks, your words beside
   them and the sentence you kept, with nothing of your account. */
const lentCopy = book => ({
  title: book.title,
  author: book.author || '',
  finishedOn: book.finishedOn || '',
  closingLine: book.closingLine || '',
  readBefore: book.readBefore || [],
  marks: (book.highlights || []).map(shelfMark)
});

module.exports = { BOOK_MARKS, READWISE_BOOK_PAGE, SHELF_BOOK, bookOnShelf, booksThisMorning, echoToday, isQuestion, lentCopy, openQuestions, shelfMark, shelveBooks };
