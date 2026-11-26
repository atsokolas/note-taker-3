const { BOOK_URL } = require('./import/exportFiles');
const { threadAsItIs } = require('./threads');
const { applyDefaultArticleVisibility } = require('../utils/articleVisibility');

/* Underneath, a month: an issue made from your own marks, read from what is
   stored and never filed. What came back is each new source the model judged
   bears on, or argues with, a mark you made before the month began (the same
   judgment as "Connected this week"). What formed is each thread Noeis found
   that month and you did not turn away. What collided most is the old marks
   met more than once, three at most. A month with nothing came back and
   nothing formed has no issue. */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const COLLIDED_SHOWN = 3;
const COLLIDED_AT = 2;
const MET = ['bears', 'argues'];
// A source meeting one of your marks: "<source id>>highlight:<mark id>".
const MEETS_MARK = /^([a-f\d]{24})>highlight:([a-f\d]{24})$/;

const idOf = value => String(value);
const monthOf = date => new Date(date).toISOString().slice(0, 7);
const spanOf = month => {
  const start = new Date(`${month}-01T00:00:00Z`);
  return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
};
const meeting = judgment => MEETS_MARK.exec(judgment.about);
const turnedAway = thread => thread.answer === 'not a thing';

/* The old marks something new met: each judgment that a source bears on,
   or argues with, a mark made before a given day, read as they are now. */
const cameBackOf = ({ judgments, articles, before }) => {
  const titles = new Map(articles.map(article => [idOf(article._id), article.title]));
  const marks = new Map(articles.flatMap(article => (article.highlights || []).map(mark => [idOf(mark._id), { article, mark }])));
  return judgments.flatMap(judgment => {
    const [, sourceId, highlightId] = meeting(judgment) || [];
    const old = marks.get(highlightId);
    if (!titles.has(sourceId) || !old?.mark.text || new Date(old.mark.createdAt) >= before) return [];
    return [{
      relation: judgment.relation,
      says: judgment.says || '',
      at: judgment.createdAt,
      source: { articleId: sourceId, title: titles.get(sourceId) },
      old: {
        articleId: idOf(old.article._id),
        highlightId,
        book: BOOK_URL.test(old.article.url || ''),
        title: old.article.title,
        text: old.mark.text,
        createdAt: old.mark.createdAt,
        kept: Boolean(old.mark.keptAt)
      }
    }];
  });
};

const underneathIssue = ({ month, judgments, articles, threads }) => {
  const cameBack = cameBackOf({ judgments, articles, before: spanOf(month).start });
  const met = new Map();
  for (const { old } of cameBack) met.set(old.highlightId, { ...old, times: (met.get(old.highlightId)?.times || 0) + 1 });
  const collided = [...met.values()].filter(old => old.times >= COLLIDED_AT).sort((a, b) => b.times - a.times).slice(0, COLLIDED_SHOWN);
  const formed = threads.filter(thread => !turnedAway(thread)).map(thread => threadAsItIs(thread, articles)).filter(Boolean);
  return cameBack.length || formed.length ? { month, cameBack, formed, collided } : null;
};

const ISSUE_FIELDS = 'title url highlights._id highlights.text highlights.createdAt highlights.keptAt';

// The months that have an issue, newest first.
const underneathMonths = async ({ userId, models: { ConnectionJudgment, Thread } }) => {
  const [judgments, threads] = await Promise.all([
    ConnectionJudgment.find({ userId, relation: { $in: MET }, about: MEETS_MARK }).select('createdAt').lean(),
    Thread.find({ userId, answer: { $ne: 'not a thing' } }).select('createdAt').lean()
  ]);
  return [...new Set([...judgments, ...threads].map(row => monthOf(row.createdAt)))].sort().reverse();
};

// What was judged in a span, and the works on both sides of it.
const meetingsIn = async ({ userId, during, models: { ConnectionJudgment, Thread, Article }, threads: withThreads = true }) => {
  const [judgments, threads] = await Promise.all([
    ConnectionJudgment.find({ userId, relation: { $in: MET }, about: MEETS_MARK, createdAt: during }).sort({ createdAt: 1 }).lean(),
    withThreads ? Thread.find({ userId, createdAt: during }).sort({ createdAt: 1 }).lean() : []
  ]);
  const pairs = judgments.map(meeting);
  const articles = await Article.find(applyDefaultArticleVisibility({ userId, $or: [
    { _id: { $in: [...pairs.map(([, sourceId]) => sourceId), ...threads.flatMap(thread => thread.marks.map(mark => mark.articleId))] } },
    { 'highlights._id': { $in: pairs.map(([, , highlightId]) => highlightId) } }
  ] })).select(ISSUE_FIELDS).lean();
  return { judgments, threads, articles };
};

const readUnderneath = async ({ userId, month, models }) => {
  if (!MONTH.test(month)) return null;
  const { start, end } = spanOf(month);
  return underneathIssue({ month, ...await meetingsIn({ userId, during: { $gte: start, $lt: end }, models }) });
};

/* An old book coming back: a book you have not marked lately whose old
   marks were met by RETURNING_SOURCES different things you read in the last
   RETURNING_DAYS. Gate: books only, judged meetings only. Bar: three
   different sources. Silence: no book clears it, nothing is said. */
const RETURNING_DAYS = 30;
const RETURNING_SOURCES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const bookComingBack = ({ judgments, articles, since }) => {
  const met = new Map();
  for (const { old, source } of cameBackOf({ judgments, articles, before: since })) {
    if (!old.book) continue;
    const book = met.get(old.articleId) || { articleId: old.articleId, title: old.title, sources: new Set(), mark: old };
    book.sources.add(source.articleId);
    met.set(old.articleId, book);
  }
  const lately = book => articles.find(article => idOf(article._id) === book.articleId)?.highlights.some(mark => new Date(mark.createdAt) >= since);
  const [found] = [...met.values()].filter(book => book.sources.size >= RETURNING_SOURCES && !lately(book)).sort((a, b) => b.sources.size - a.sources.size);
  return found ? { articleId: found.articleId, title: found.title, times: found.sources.size, since: found.mark.createdAt, mark: found.mark } : null;
};

const readBookComingBack = async ({ userId, models, now = Date.now() }) => {
  const since = new Date(now - RETURNING_DAYS * DAY_MS);
  return bookComingBack({ since, ...await meetingsIn({ userId, during: { $gte: since }, models, threads: false }) });
};

module.exports = { MONTH, bookComingBack, readBookComingBack, readUnderneath, underneathIssue, underneathMonths };
