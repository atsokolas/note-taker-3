const { BOOK_URL } = require('./import/exportFiles');
const { threadAsItIs } = require('./threads');
const { applyDefaultArticleVisibility } = require('../utils/articleVisibility');

const DAY_MS = 24 * 60 * 60 * 1000;
// What you read lately stays on top this long, then sinks underneath.
const SINKS_AFTER_DAYS = 14;
// A passage you keep opening, and have not kept, is asked about.
const ASKED_AFTER_OPENS = 3;
const ASKS_SHOWN = 2;

/* Home is three depths of the same reading, all derived on every read and
   none of it stored. Kept is what you hold for good: sources marked
   evergreen, passages and threads kept, in the order you kept them. For now is what
   you touched lately, which sinks on its own. Underneath is everything else,
   which is not gone, only out of sight. */

const timeOf = value => new Date(value).getTime() || 0;
const marksOf = article => (article.highlights || []).filter(mark => mark.text || mark.note);
const idOf = value => String(value);
const isBook = article => BOOK_URL.test(article.url || '');

const kept = (articles, threads) => [
  ...articles.filter(article => article.evergreen).map(article => ({
    kind: 'source',
    book: isBook(article),
    articleId: idOf(article._id),
    title: article.title,
    at: article.evergreenAt
  })),
  ...articles.flatMap(article => marksOf(article).filter(mark => mark.keptAt).map(mark => ({
    kind: 'mark',
    book: isBook(article),
    articleId: idOf(article._id),
    highlightId: idOf(mark._id),
    title: article.title,
    text: mark.text || '',
    note: mark.note || '',
    page: mark.page || null,
    at: mark.keptAt
  }))),
  // A thread's passages ride along in one line, so what bears on your writing can find the thread by what it says.
  ...threads.map(thread => ({ kind: 'thread', threadId: thread.threadId, title: thread.title, text: thread.marks.map(mark => mark.text).join(' '), marks: thread.marks.length, at: thread.answeredAt }))
].sort((a, b) => timeOf(a.at) - timeOf(b.at));

// The passages you keep coming back to, most opened first, asked about in pencil.
const asks = articles => articles
  .flatMap(article => marksOf(article)
    .filter(mark => mark.text && !mark.keptAt && (mark.opens || 0) >= ASKED_AFTER_OPENS)
    .map(mark => ({ articleId: idOf(article._id), highlightId: idOf(mark._id), book: isBook(article), title: article.title, text: mark.text, opens: mark.opens })))
  .sort((a, b) => b.opens - a.opens)
  .slice(0, ASKS_SHOWN);

/* Each source's last touch: when it was saved, read or marked. Within the
   window it is for now, with the marks made in it; past it, it has sunk. */
const lately = ({ articles, readings = [], now = Date.now() }) => {
  const read = new Map(readings.map(reading => [idOf(reading.articleId), timeOf(reading.visitedAt)]));
  const since = now - SINKS_AFTER_DAYS * DAY_MS;
  return articles
    .map(article => {
      const marks = marksOf(article).filter(mark => timeOf(mark.createdAt) >= since);
      const at = Math.max(timeOf(article.createdAt), read.get(idOf(article._id)) || 0, ...marks.map(mark => timeOf(mark.createdAt)));
      return { article, marks, at };
    })
    .filter(({ at }) => at >= since && at <= now)
    .sort((a, b) => b.at - a.at);
};

// All of the fortnight, so each room chooses its own before any is left out.
const forNow = touched => touched.map(({ article, marks, at }) => ({
  articleId: idOf(article._id),
  title: article.title,
  book: isBook(article),
  author: article.author || '',
  marks: marks.length,
  at: new Date(at)
}));

/* Underneath, and one glimpse of it: a mark of yours that sank, not kept,
   a different one each day, chosen by the day and not by chance, so the
   whole of it passes by in time. */
const underneath = (articles, now) => {
  const marks = articles.flatMap(marksOf);
  const dated = marks.map(mark => timeOf(mark.createdAt)).filter(Boolean);
  const sank = articles
    .flatMap(article => marksOf(article).filter(mark => mark.text && !mark.keptAt && now - timeOf(mark.createdAt) > SINKS_AFTER_DAYS * DAY_MS).map(mark => ({ article, mark })))
    .sort((a, b) => idOf(a.mark._id).localeCompare(idOf(b.mark._id)));
  const glimpse = sank[Math.floor(now / DAY_MS) % sank.length];
  return {
    marks: marks.length,
    works: articles.filter(article => marksOf(article).length).length,
    since: dated.length ? new Date(Math.min(...dated)) : null,
    glimpse: glimpse ? {
      articleId: idOf(glimpse.article._id),
      highlightId: idOf(glimpse.mark._id),
      book: isBook(glimpse.article),
      title: glimpse.article.title,
      text: glimpse.mark.text,
      createdAt: glimpse.mark.createdAt
    } : null
  };
};

const home = ({ articles, readings, threads = [], now = Date.now() }) => {
  const touched = lately({ articles, readings, now });
  return {
    kept: kept(articles, threads),
    asks: asks(articles),
    forNow: forNow(touched),
    underneath: underneath(articles, now),
    // The works with marks made lately, for what comes back from underneath.
    recent: touched.filter(({ marks }) => marks.length).map(({ article, marks }) => ({ _id: article._id, title: article.title, highlights: marks }))
  };
};

const KEPT_FIELDS = 'title url evergreen evergreenAt highlights._id highlights.text highlights.note highlights.page highlights.createdAt highlights.keptAt';

/* Kept on its own, without the rest of Home: for the brief an agent opens
   with and for ⌘K. Only what holds something kept is read. */
const readKept = async ({ Article, Thread = null, userId }) => {
  const threads = Thread ? await Thread.find({ userId, answer: 'kept' }).lean() : [];
  const articles = await Article.find(applyDefaultArticleVisibility({
    userId,
    // One kept passage is enough: $elemMatch asks of each mark, not of the whole array.
    $or: [{ evergreen: true }, { highlights: { $elemMatch: { keptAt: { $ne: null } } } }, { _id: { $in: threads.flatMap(thread => thread.marks.map(mark => mark.articleId)) } }]
  })).select(KEPT_FIELDS).lean();
  return kept(articles, threads.map(thread => threadAsItIs(thread, articles)).filter(Boolean));
};

/* Which sources are for now, for the Library's shelves: the same fortnight
   as Home, so a source is on For now or Underneath, never both. */
const forNowIds = async ({ Article, ArticleReadingState, userId, now = Date.now() }) => {
  const since = new Date(now - SINKS_AFTER_DAYS * DAY_MS);
  const [articles, readings] = await Promise.all([
    Article.find({ userId, $or: [{ createdAt: { $gte: since } }, { 'highlights.createdAt': { $gte: since } }] }).select('createdAt highlights.createdAt highlights.text highlights.note').lean(),
    ArticleReadingState.find({ userId, visitedAt: { $gte: since } }).select('articleId visitedAt').lean()
  ]);
  const read = await Article.find({ userId, _id: { $in: readings.map(reading => reading.articleId) } }).select('createdAt highlights.createdAt highlights.text highlights.note').lean();
  return lately({ articles: [...articles, ...read], readings, now }).map(({ article }) => article._id);
};

module.exports = { ASKED_AFTER_OPENS, SINKS_AFTER_DAYS, forNowIds, home, readKept };
