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

const underneathIssue = ({ month, judgments, articles, threads }) => {
  const { start } = spanOf(month);
  const titles = new Map(articles.map(article => [idOf(article._id), article.title]));
  const marks = new Map(articles.flatMap(article => (article.highlights || []).map(mark => [idOf(mark._id), { article, mark }])));
  const cameBack = judgments.flatMap(judgment => {
    const [, sourceId, highlightId] = meeting(judgment) || [];
    const old = marks.get(highlightId);
    if (!titles.has(sourceId) || !old?.mark.text || new Date(old.mark.createdAt) >= start) return [];
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

const readUnderneath = async ({ userId, month, models: { ConnectionJudgment, Thread, Article } }) => {
  if (!MONTH.test(month)) return null;
  const { start, end } = spanOf(month);
  const during = { $gte: start, $lt: end };
  const [judgments, threads] = await Promise.all([
    ConnectionJudgment.find({ userId, relation: { $in: MET }, about: MEETS_MARK, createdAt: during }).sort({ createdAt: 1 }).lean(),
    Thread.find({ userId, createdAt: during }).sort({ createdAt: 1 }).lean()
  ]);
  const pairs = judgments.map(meeting);
  const articles = await Article.find(applyDefaultArticleVisibility({ userId, $or: [
    { _id: { $in: [...pairs.map(([, sourceId]) => sourceId), ...threads.flatMap(thread => thread.marks.map(mark => mark.articleId))] } },
    { 'highlights._id': { $in: pairs.map(([, , highlightId]) => highlightId) } }
  ] })).select(ISSUE_FIELDS).lean();
  return underneathIssue({ month, judgments, articles, threads });
};

module.exports = { MONTH, readUnderneath, underneathIssue, underneathMonths };
