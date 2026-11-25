// Books: the shelf, the reading desk's lines, asking and arguing with a book, lending one.
const { calendarDay, bookReturning } = require('../../services/closedBooks');
const {
  shelveBooks,
  SHELF_BOOK,
  shelfMark,
  BOOK_MARKS,
  echoToday,
  openQuestions,
  isQuestion,
  lentCopy
} = require('../../services/bookShelf');
const { BOOK_URL } = require('../../services/import/exportFiles');
const { isUnfinished, passageIn } = require('../../utils/passages');

const ECHOES_KEPT = 500;
const echoes = new Map();

module.exports = (router, {
  Article,
  answerTo,
  argueWith,
  askTheBook,
  authenticateToken,
  beforeYouStart,
  crypto,
  echoOf,
  enqueueHighlightEmbedding,
  heardBefore,
  readPage,
  toTrimmedString
}) => {
  /* The shelf of books, each with its marks, newest reading first. The page,
     the count and the last thing written are read from the marks by the
     page that shows them. */
  router.get('/api/books', authenticateToken, async (req, res) => {
    try {
      // Today as the reader's calendar has it, for the book coming back.
      const today = calendarDay(req.query?.today);
      const readShelf = () => Article.find({ userId: req.user.id, url: BOOK_URL }).select(SHELF_BOOK).lean();
      // Read while Readwise's strays are looked for; read again only if one was shelved.
      const [shelved, read] = await Promise.all([shelveBooks({ Article, userId: req.user.id }), readShelf()]);
      const books = shelved ? await readShelf() : read;
      const shelf = books.map(({ highlights = [], ...book }) => ({
        ...book,
        returning: bookReturning(book, today),
        marks: highlights.map(shelfMark)
      }));
      const lastTouched = book => Math.max(new Date(book.createdAt).getTime() || 0, ...book.marks.map(mark => new Date(mark.createdAt).getTime() || 0));
      return res.json({ books: shelf.sort((a, b) => lastTouched(b) - lastTouched(a)) });
    } catch (error) {
      console.error('Error reading the book shelf:', error);
      res.status(500).json({ error: 'The books could not be read.' });
    }
  });

  /* Today's echo: a passage from one of your books and nearly the same
     thought, marked in another work long before or after. Null on a day
     with none. The day is the reader's own, sent as a calendar day. */
  // A day with no pair stands as it is; a pair stands while both passages read as they did.
  const sameText = (a, b) => String(a || '').replace(/\s+/g, ' ').trim() === String(b || '').replace(/\s+/g, ' ').trim();
  const stillStands = async (pair, books, userId) => {
    if (!pair) return true;
    const { mark, echo } = pair;
    const kept = books.some(book => (book.highlights || []).some(held => String(held._id) === String(mark._id) && held.text === mark.text));
    if (!kept) return false;
    const other = await Article.findOne({ _id: echo.articleId, userId, 'highlights._id': echo._id }).select({ 'highlights.$': 1 }).lean();
    return sameText(other?.highlights?.[0]?.text, echo.text);
  };

  router.get('/api/books/echo', authenticateToken, async (req, res) => {
    try {
      const today = calendarDay(req.query.today);
      const books = await Article.find({ userId: req.user.id, url: BOOK_URL }).select(BOOK_MARKS).lean();
      /* The pair holds all day, so it is looked for once a day, and again
         when a mark is added or taken away, or either passage of the pair
         was rewritten or deleted since. */
      const key = `${req.user.id}:${today}:${books.reduce((sum, book) => sum + (book.highlights || []).length, 0)}`;
      if (!echoes.has(key) || !(await stillStands(echoes.get(key), books, req.user.id))) {
        echoes.set(key, await echoToday({ books, today, echoOf: mark => echoOf({ userId: req.user.id, mark }) }));
        if (echoes.size > ECHOES_KEPT) echoes.delete(echoes.keys().next().value);
      }
      return res.json({ echo: echoes.get(key) });
    } catch (error) {
      console.error('Error finding the day’s echo:', error);
      res.status(500).json({ error: 'The echo could not be found.' });
    }
  });

  /* The questions you typed beside your books, newest first, each with the
     passage you marked since that answers it, when one does. A question is a
     note of your own ending in "?", as the desk has it. */
  router.get('/api/books/questions', authenticateToken, async (req, res) => {
    try {
      const asked = openQuestions(await Article.find({ userId: req.user.id, url: BOOK_URL }).select(BOOK_MARKS).lean());
      const questions = await Promise.all(asked.map(async question => ({
        ...question,
        answer: await answerTo({ userId: req.user.id, question }).catch(() => null)
      })));
      return res.json({ questions });
    } catch (error) {
      console.error('Error reading the open questions:', error);
      res.status(500).json({ error: 'The questions could not be read.' });
    }
  });

  /* Closing a book: you finished it today (your today, sent as a calendar
     day), and here is the one sentence you will remember, which may be none.
     The day is when you first closed it, so rewriting the sentence does not
     move its anniversary. */
  router.put('/api/books/:id/closed', authenticateToken, async (req, res) => {
    try {
      const book = await Article.findOne({ _id: req.params.id, userId: req.user.id, url: BOOK_URL });
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      book.finishedOn ||= calendarDay(req.body?.on);
      book.closingLine = toTrimmedString(req.body?.line).slice(0, 400);
      await book.save();
      return res.json({ finishedOn: book.finishedOn, closingLine: book.closingLine });
    } catch (error) {
      console.error('Error closing a book:', error);
      res.status(500).json({ error: 'The book could not be closed.' });
    }
  });

  /* Renaming a book. Its address stays, so its Kindle and Readwise marks still land in it. */
  router.put('/api/books/:id/title', authenticateToken, async (req, res) => {
    try {
      const title = toTrimmedString(req.body?.title).slice(0, 400);
      if (!title) return res.status(400).json({ error: 'A book needs its title.' });
      const book = await Article.findOneAndUpdate({ _id: req.params.id, userId: req.user.id, url: BOOK_URL }, { $set: { title } });
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      return res.json({ title });
    } catch (error) {
      console.error('Error renaming a book:', error);
      res.status(500).json({ error: 'The book could not be renamed.' });
    }
  });

  /* Reading it again: the reading just finished is kept, sentence and all,
     and its marks stay where they are, in fainter ink. */
  router.post('/api/books/:id/again', authenticateToken, async (req, res) => {
    try {
      const book = await Article.findOne({ _id: req.params.id, userId: req.user.id, url: BOOK_URL });
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      if (!book.finishedOn) return res.status(409).json({ error: 'That book is still being read.' });
      book.readBefore.push({ finishedOn: book.finishedOn, closingLine: book.closingLine, until: new Date() });
      book.finishedOn = '';
      book.closingLine = '';
      await book.save();
      return res.json({ finishedOn: '', closingLine: '', readBefore: book.readBefore });
    } catch (error) {
      console.error('Error starting a book again:', error);
      res.status(500).json({ error: 'The book could not be started again.' });
    }
  });

  /* A photograph of the page in your lap gives the quotes you typed by their
     ends ("A … B") their whole words. The page is read and let go: only the
     words a quote was waiting for are kept. Typing stays the way in. */
  router.post('/api/books/:id/page', authenticateToken, async (req, res) => {
    try {
      const image = String(req.body?.image || '');
      if (!/^data:image\/[\w+.-]+;base64,/.test(image)) return res.status(400).json({ error: 'Send a photograph of the page.' });
      const book = await Article.findOne({ _id: req.params.id, userId: req.user.id, url: BOOK_URL });
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      const waiting = book.highlights.filter(mark => isUnfinished(mark.text));
      if (!waiting.length) return res.json({ filled: [] });
      const page = (await readPage(image)).replace(/\s+/g, ' ');
      const filled = waiting.filter((mark) => {
        const whole = passageIn(page, mark.text);
        if (whole) mark.text = whole;
        return Boolean(whole);
      });
      if (filled.length) {
        await book.save();
        filled.forEach(highlight => Promise.resolve(enqueueHighlightEmbedding?.({ highlight, article: book })).catch(() => {}));
      }
      return res.json({ filled: filled.map(mark => ({ _id: mark._id, text: mark.text })) });
    } catch (error) {
      console.error('Error reading a page of a book:', error);
      res.status(502).json({ error: 'The page could not be read. Try it again in better light.' });
    }
  });

  /* Before you start: a book with nothing marked in it yet gets the passages
     you marked elsewhere that touch it. Once you mark one, it has its own. */
  router.get('/api/books/:id/before', authenticateToken, async (req, res) => {
    try {
      const book = await Article.findOne({ _id: req.params.id, userId: req.user.id, url: BOOK_URL }).select('title author highlights._id').lean();
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      const passages = book.highlights?.length ? [] : await beforeYouStart({ userId: req.user.id, book }).catch(() => []);
      return res.json({ passages });
    } catch (error) {
      console.error('Error finding what you marked before a book:', error);
      res.status(500).json({ error: 'Nothing could be found for this book.' });
    }
  });

  /* Asking the author: the questions still open beside a book, each answered
     only from the passages marked in it. Nothing is kept until you keep it. */
  router.post('/api/books/:id/ask', authenticateToken, async (req, res) => {
    try {
      const book = await Article.findOne({ _id: req.params.id, userId: req.user.id, url: BOOK_URL }).select(BOOK_MARKS).lean();
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      const answers = await askTheBook({
        title: book.title,
        questions: book.highlights.filter(isQuestion),
        passages: book.highlights.filter(mark => mark.text)
      });
      return res.json({ answers });
    } catch (error) {
      console.error('Error asking a book:', error);
      res.status(502).json({ error: 'The book could not be asked just now. Try it again.' });
    }
  });

  /* A line typed at the desk, put to the rest of your library: "/who" asks
     which other work said it, and a line just kept asks, with echo, whether
     you marked nearly the same thing a year or more ago. Null when nothing did. */
  router.post('/api/books/:id/heard', authenticateToken, async (req, res) => {
    try {
      const book = await Article.findOne({ _id: req.params.id, userId: req.user.id, url: BOOK_URL }).select('_id').lean();
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      const passage = await heardBefore({ userId: req.user.id, text: toTrimmedString(req.body?.line).slice(0, 2000), bookId: book._id, echo: req.body?.echo === true });
      return res.json({ passage: passage || null });
    } catch (error) {
      console.error('Error hearing a line against the library:', error);
      res.status(500).json({ error: 'Your library could not be asked just now.' });
    }
  });

  /* "/argue": the strongest objection to a line typed beside a book. Nothing
     is kept; the reader decides what to do with it. */
  router.post('/api/books/:id/argue', authenticateToken, async (req, res) => {
    try {
      const line = toTrimmedString(req.body?.line).slice(0, 2000);
      if (!line) return res.status(400).json({ error: 'Type a line to argue with.' });
      const book = await Article.findOne({ _id: req.params.id, userId: req.user.id, url: BOOK_URL }).select('title').lean();
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      const objection = await argueWith({ title: book.title, line });
      if (!objection) return res.status(502).json({ error: 'Nobody would argue with that just now. Try it again.' });
      return res.json({ objection });
    } catch (error) {
      console.error('Error arguing with a line:', error);
      res.status(502).json({ error: 'Nobody would argue with that just now. Try it again.' });
    }
  });

  /* Lending a book: a link a friend reads your copy at, as it stands each
     time they open it, until you take it back. Lending it again after that
     is a new link; the old one stays dead. */
  router.put('/api/books/:id/lent', authenticateToken, async (req, res) => {
    try {
      const book = await Article.findOne({ _id: req.params.id, userId: req.user.id, url: BOOK_URL });
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      book.lentAs ||= crypto.randomBytes(12).toString('base64url');
      await book.save();
      return res.json({ lentAs: book.lentAs });
    } catch (error) {
      console.error('Error lending a book:', error);
      res.status(500).json({ error: 'The book could not be lent.' });
    }
  });

  router.delete('/api/books/:id/lent', authenticateToken, async (req, res) => {
    try {
      const book = await Article.findOneAndUpdate({ _id: req.params.id, userId: req.user.id, url: BOOK_URL }, { $set: { lentAs: '' } });
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      return res.json({ lentAs: '' });
    } catch (error) {
      console.error('Error taking a book back:', error);
      res.status(500).json({ error: 'The book could not be taken back.' });
    }
  });

  router.get('/api/public/books/:slug', async (req, res) => {
    try {
      const book = await Article.findOne({ lentAs: { $eq: String(req.params.slug) }, url: BOOK_URL }).select(SHELF_BOOK).lean();
      if (!book) return res.status(404).json({ error: 'This book is not lent any more.' });
      return res.json({ book: lentCopy(book) });
    } catch (error) {
      console.error('Error reading a lent book:', error);
      res.status(500).json({ error: 'The book could not be read.' });
    }
  });

  /* Still reading it after all. */
  router.delete('/api/books/:id/closed', authenticateToken, async (req, res) => {
    try {
      const book = await Article.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id, url: BOOK_URL },
        { $set: { finishedOn: '', closingLine: '' } }
      );
      if (!book) return res.status(404).json({ error: 'That book is not on your shelf.' });
      return res.json({ finishedOn: '', closingLine: '' });
    } catch (error) {
      console.error('Error reopening a book:', error);
      res.status(500).json({ error: 'The book could not be reopened.' });
    }
  });
};
