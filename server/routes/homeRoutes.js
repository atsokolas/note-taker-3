const express = require('express');
const mongoose = require('mongoose');
const { SINKS_AFTER_DAYS, home } = require('../services/home');
const { echoToday } = require('../services/bookShelf');
const { calendarDay } = require('../services/closedBooks');
const { THREAD_ANSWERS, refused, threadAsItIs, threadFrom, timeToLook, waiting } = require('../services/threads');
const { applyDefaultArticleVisibility } = require('../utils/articleVisibility');

const HOME_FIELDS = 'title url author createdAt evergreen evergreenAt highlights._id highlights.text highlights.note highlights.page highlights.createdAt highlights.opens highlights.keptAt';
const DAY_MS = 24 * 60 * 60 * 1000;
const REMEMBERED = 500;
// How many of the marks made lately are asked whether something formed around them.
const FORMING_TRIES = 4;

/* What came back, read again from the library as it is now: a pair whose
   either passage was since deleted, archived or let go of does not come back. */
const asItIs = (pair, articles) => {
  if (!pair) return null;
  const marks = new Map(articles.flatMap(article => (article.highlights || []).map(mark => [String(mark._id), mark])));
  const [mark, echo] = [marks.get(String(pair.mark._id)), marks.get(String(pair.echo._id))];
  if (!mark?.text || !echo?.text) return null;
  return { mark: { ...pair.mark, text: mark.text }, echo: { ...pair.echo, text: echo.text } };
};

// A bounded memory: the oldest entry goes when it is full.
const remember = (memory, key, value) => {
  if (memory instanceof Map) memory.set(key, value); else memory.add(key);
  if (memory.size > REMEMBERED) memory.delete(memory.keys().next().value);
};

/* Home: what you keep, what you are reading for now, and what lies
   underneath, with the one old mark that came back up today beside a new
   one, and, rarely, a thread forming. Only the reader keeps or answers. */
const buildHomeRouter = ({ authenticateToken, Article, ArticleReadingState, Thread, echoOf, formingAround, now = () => Date.now() }) => {
  const router = express.Router();
  // What came back holds all day, and is looked for again when a new mark arrives.
  const cameBack = new Map();
  // A new thread is looked for once a day at most, and only when one is due.
  const looked = new Set();

  /* The thread waiting for your answer; or, once a fortnight, one newly
     formed around a mark made lately: passages from other works and other
     years that the model says bear on it (services/threads.js says when
     that is enough). Nothing formed is nothing shown. */
  const forming = async ({ userId, today, recent, threads, at }) => {
    const found = waiting(threads);
    if (found || !timeToLook(threads, at) || looked.has(`${userId}:${today}`)) return found;
    remember(looked, `${userId}:${today}`);
    const lately = recent.flatMap(work => work.highlights.filter(mark => mark.text).map(mark => ({ ...mark, bookId: work._id })));
    for (const mark of lately.slice(0, FORMING_TRIES)) {
      const passages = await formingAround({ userId, mark }).catch(() => []);
      const marks = threadFrom({ articleId: mark.bookId, highlightId: mark._id, createdAt: mark.createdAt }, passages);
      if (marks && !refused(threads, marks)) return Thread.create({ userId, marks });
    }
    return null;
  };

  router.get('/api/home', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
      const at = now();
      const today = calendarDay(req.query.today);
      const [articles, readings, threads] = await Promise.all([
        Article.find(applyDefaultArticleVisibility({ userId })).select(HOME_FIELDS).lean(),
        ArticleReadingState.find({ userId, visitedAt: { $gte: new Date(at - SINKS_AFTER_DAYS * DAY_MS) } }).select('articleId visitedAt').lean(),
        Thread.find({ userId }).sort({ createdAt: 1 }).lean()
      ]);
      const kept = threads.filter(thread => thread.answer === 'kept').map(thread => threadAsItIs(thread, articles)).filter(Boolean);
      const { recent, ...shelf } = home({ articles, readings, threads: kept, now: at });
      const key = `${userId}:${today}:${recent.reduce((sum, work) => sum + work.highlights.length, 0)}`;
      if (!cameBack.has(key)) remember(cameBack, key, await echoToday({ books: recent, today, echoOf: mark => echoOf({ userId, mark }) }).catch(() => null));
      const thread = await forming({ userId, today, recent, threads, at }).catch(() => null);
      return res.json({ ...shelf, cameBack: asItIs(cameBack.get(key), articles), forming: thread && threadAsItIs(thread, articles) });
    } catch (error) {
      console.error('Error reading home:', error);
      return res.status(500).json({ error: 'Home could not be read.' });
    }
  });

  router.patch('/articles/:id/highlights/:highlightId/kept', authenticateToken, async (req, res) => {
    const { id, highlightId } = req.params;
    if (typeof req.body?.kept !== 'boolean') return res.status(400).json({ error: 'kept must be true or false.' });
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(highlightId)) return res.status(400).json({ error: 'Name a passage of yours.' });
    try {
      const article = await Article.findOne({ _id: id, userId: req.user.id, 'highlights._id': highlightId });
      if (!article) return res.status(404).json({ error: 'That passage is not in your library.' });
      const mark = article.highlights.id(highlightId);
      // The date is when you first kept it, so Kept reads in the order it was built.
      mark.keptAt = req.body.kept ? (mark.keptAt || new Date(now())) : null;
      await article.save();
      return res.json({ highlightId, keptAt: mark.keptAt });
    } catch (error) {
      console.error('Error keeping a passage:', error);
      return res.status(500).json({ error: 'That passage could not be kept.' });
    }
  });

  const yours = async (req, res) => {
    const thread = mongoose.isValidObjectId(req.params.id) ? await Thread.findOne({ _id: req.params.id, userId: req.user.id }) : null;
    if (!thread) res.status(404).json({ error: 'That thread is not yours.' });
    return thread;
  };

  const read = async (thread, userId) => threadAsItIs(thread, await Article.find(applyDefaultArticleVisibility({
    userId, _id: { $in: thread.marks.map(mark => mark.articleId) }
  })).select(HOME_FIELDS).lean());

  router.get('/api/threads/:id', authenticateToken, async (req, res) => {
    try {
      const thread = await yours(req, res);
      if (!thread) return null;
      const found = await read(thread, req.user.id);
      return found ? res.json(found) : res.status(404).json({ error: 'That thread came apart: its passages are gone.' });
    } catch (error) {
      console.error('Error reading a thread:', error);
      return res.status(500).json({ error: 'That thread could not be read.' });
    }
  });

  // Keep it, not yet, or not a thing: the reader's answer, and only theirs.
  router.patch('/api/threads/:id', authenticateToken, async (req, res) => {
    const answer = req.body?.answer;
    if (!THREAD_ANSWERS.includes(answer)) return res.status(400).json({ error: 'Answer kept, not yet or not a thing.' });
    try {
      const thread = await yours(req, res);
      if (!thread) return null;
      thread.answer = answer;
      thread.answeredAt = new Date(now());
      await thread.save();
      return res.json(await read(thread, req.user.id));
    } catch (error) {
      console.error('Error answering a thread:', error);
      return res.status(500).json({ error: 'That answer did not save.' });
    }
  });

  return router;
};

module.exports = { buildHomeRouter };
