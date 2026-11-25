const { BOOK_URL } = require('./import/exportFiles');

const DAY_MS = 24 * 60 * 60 * 1000;
// What you read lately stays on top this long, then sinks underneath.
const SINKS_AFTER_DAYS = 14;
const FOR_NOW_SHOWN = 8;
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
  ...threads.map(thread => ({ kind: 'thread', threadId: thread.threadId, title: thread.title, marks: thread.marks.length, at: thread.answeredAt }))
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

const forNow = touched => touched.slice(0, FOR_NOW_SHOWN).map(({ article, marks, at }) => ({
  articleId: idOf(article._id),
  title: article.title,
  book: isBook(article),
  author: article.author || '',
  marks: marks.length,
  at: new Date(at)
}));

const underneath = articles => {
  const marks = articles.flatMap(marksOf);
  const dated = marks.map(mark => timeOf(mark.createdAt)).filter(Boolean);
  return {
    marks: marks.length,
    works: articles.filter(article => marksOf(article).length).length,
    since: dated.length ? new Date(Math.min(...dated)) : null
  };
};

const home = ({ articles, readings, threads = [], now = Date.now() }) => {
  const touched = lately({ articles, readings, now });
  return {
    kept: kept(articles, threads),
    asks: asks(articles),
    forNow: forNow(touched),
    underneath: underneath(articles),
    // The works with marks made lately, for what comes back from underneath.
    recent: touched.filter(({ marks }) => marks.length).map(({ article, marks }) => ({ _id: article._id, title: article.title, highlights: marks }))
  };
};

module.exports = { ASKED_AFTER_OPENS, SINKS_AFTER_DAYS, home };
