const { BOOK_URL } = require('./import/exportFiles');

const DAY_MS = 24 * 60 * 60 * 1000;
// The reader's three answers to a thread forming; only they give one.
const THREAD_ANSWERS = Object.freeze(['kept', 'not yet', 'not a thing']);
/* Something forming is rare: Noeis looks for a new thread at most once a
   fortnight, and never while one is still waiting for your answer. */
const FORMING_EVERY_DAYS = 14;
// Enough to be a thread: three works or more, a year or more apart end to end.
const THREAD_WORKS = 3;
const THREAD_SPAN_DAYS = 365;
const THREAD_MARKS = 5;
// A thread you called "not a thing" is not offered again in another guise.
const SAME_THREAD_MARKS = 2;

const idOf = value => String(value);
const timeOf = value => new Date(value).getTime() || 0;
const keyOf = mark => `${idOf(mark.articleId)}:${idOf(mark.highlightId)}`;

// The one waiting for an answer, or else whether it is time to look again.
const waiting = threads => threads.find(thread => !thread.answer) || null;
const timeToLook = (threads, now) => threads.every(thread => now - timeOf(thread.createdAt) >= FORMING_EVERY_DAYS * DAY_MS);

/* A recent mark and the passages the model said bear on it: a thread when
   they span enough works and enough years. One passage a work, the closest;
   oldest first, the order it formed in. */
const threadFrom = (anchor, passages) => {
  const works = new Map([[idOf(anchor.articleId), anchor]]);
  for (const passage of passages) {
    if (works.size >= THREAD_MARKS) break;
    if (!works.has(idOf(passage.articleId))) works.set(idOf(passage.articleId), { articleId: passage.articleId, highlightId: passage._id, createdAt: passage.createdAt });
  }
  const marks = [...works.values()].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));
  const span = timeOf(marks[marks.length - 1].createdAt) - timeOf(marks[0].createdAt);
  if (marks.length < THREAD_WORKS || span < THREAD_SPAN_DAYS * DAY_MS) return null;
  return marks.map(({ articleId, highlightId }) => ({ articleId: idOf(articleId), highlightId: idOf(highlightId) }));
};

const refused = (threads, marks) => {
  const keys = new Set(marks.map(keyOf));
  return threads.some(thread => thread.answer === 'not a thing' && thread.marks.filter(mark => keys.has(keyOf(mark))).length >= SAME_THREAD_MARKS);
};

/* What a kept thread could grow by: the closest passage you marked after you
   kept it, from a work not on it yet, that you have not passed on. */
const joining = (thread, passages) => {
  const on = new Set(thread.marks.map(mark => idOf(mark.articleId)));
  const passed = new Set((thread.passed || []).map(keyOf));
  const found = passages.find(passage => timeOf(passage.createdAt) > timeOf(thread.answeredAt)
    && !on.has(idOf(passage.articleId))
    && !passed.has(keyOf({ articleId: passage.articleId, highlightId: passage._id })));
  return found ? { articleId: idOf(found.articleId), highlightId: idOf(found._id), book: BOOK_URL.test(found.articleUrl || ''), title: found.articleTitle, text: found.text, createdAt: found.createdAt } : null;
};

const listed = titles => (titles.length > 1 ? `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}` : titles[0] || '');

/* A thread as it reads now, from the library as it is: each passage with its
   words, its work and its date. A passage since deleted drops out; a thread
   left with fewer than two is gone. */
const threadAsItIs = (thread, articles) => {
  const byId = new Map(articles.map(article => [idOf(article._id), article]));
  const marks = thread.marks.flatMap(({ articleId, highlightId }) => {
    const article = byId.get(idOf(articleId));
    const mark = (article?.highlights || []).find(held => idOf(held._id) === idOf(highlightId));
    return mark?.text ? [{
      articleId: idOf(articleId),
      highlightId: idOf(highlightId),
      book: BOOK_URL.test(article.url || ''),
      title: article.title,
      text: mark.text,
      createdAt: mark.createdAt
    }] : [];
  });
  if (marks.length < 2) return null;
  return {
    threadId: idOf(thread._id),
    answer: thread.answer,
    answeredAt: thread.answeredAt,
    title: `A thread through ${listed([...new Set(marks.map(mark => mark.title))])}`,
    marks
  };
};

module.exports = { FORMING_EVERY_DAYS, THREAD_ANSWERS, joining, refused, threadAsItIs, threadFrom, timeToLook, waiting };
