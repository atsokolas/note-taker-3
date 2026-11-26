const express = require('express');
const mongoose = require('mongoose');
const { SINKS_AFTER_DAYS, home, readKept } = require('../services/home');
const { echoToday } = require('../services/bookShelf');
const { calendarDay } = require('../services/closedBooks');
const { THREAD_ANSWERS, joining, refused, threadAsItIs, threadFrom, timeToLook, waiting } = require('../services/threads');
const { applyDefaultArticleVisibility } = require('../utils/articleVisibility');
const { readUnderneath, underneathMonths } = require('../services/underneath');
const { ARGUES_ABOUT, keptArgues } = require('../services/keptArgues');
const { relations } = require('../services/disagreements');

const HOME_FIELDS = 'title url author createdAt evergreen evergreenAt highlights._id highlights.text highlights.note highlights.page highlights.createdAt highlights.opens highlights.keptAt';
const DAY_MS = 24 * 60 * 60 * 1000;
const REMEMBERED = 500;
// Each search of the open web is paid for, so a reader gets this many a day.
const WORLD_SEARCHES_A_DAY = 20;
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
const buildHomeRouter = ({ authenticateToken, Article, ArticleReadingState, Thread, ConnectionJudgment, WikiPage, Verdict, echoOf, formingAround, searchWorld, judge = relations, now = () => Date.now() }) => {
  const router = express.Router();
  // What came back holds all day, and is looked for again when a new mark arrives.
  const cameBack = new Map();
  // A new thread is looked for once a day at most, and only when one is due.
  const looked = new Set();
  // What a kept thread could grow by, looked for once a day per thread.
  const growing = new Map();
  // The open web, searched only when asked: each answer kept for the day, and a daily allowance.
  const searched = new Map();
  const searches = new Map();
  // Whether something you kept argues with a view: asked once a day.
  const arguing = new Map();

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

  // Kept alone, for ⌘K: what you keep is asked first.
  router.get('/api/kept', authenticateToken, async (req, res) => {
    try {
      return res.json({ kept: await readKept({ Article, Thread, userId: req.user.id }) });
    } catch (error) {
      console.error('Error reading kept:', error);
      return res.status(500).json({ error: 'Kept could not be read.' });
    }
  });

  // Judgment's margin: one passage you kept that argues with a view you hold, or nothing.
  router.get('/api/kept/argues', authenticateToken, async (req, res) => {
    const key = `${req.user.id}:${calendarDay(req.query.today)}`;
    try {
      if (!arguing.has(key)) remember(arguing, key, await keptArgues({ userId: req.user.id, models: { Article, WikiPage, ConnectionJudgment, Verdict }, judge }));
      return res.json({ argues: arguing.get(key) });
    } catch (error) {
      console.error('Error reading what argues:', error);
      return res.status(500).json({ error: 'That could not be read.' });
    }
  });

  // "Not so": the pairing is struck, and is never offered again.
  router.post('/api/kept/argues/strike', authenticateToken, async (req, res) => {
    const about = String(req.body?.about || '');
    if (!ARGUES_ABOUT.test(about)) return res.status(400).json({ error: 'Name the pairing to strike.' });
    try {
      await Verdict.create({ userId: req.user.id, verdict: 'strike', kind: 'connection', agent: 'noeis', about });
      for (const key of arguing.keys()) if (key.startsWith(`${req.user.id}:`)) arguing.delete(key);
      return res.json({ struck: true });
    } catch (error) {
      console.error('Error striking what argues:', error);
      return res.status(500).json({ error: 'That could not be struck.' });
    }
  });

  // Underneath, by month: an issue made from your own marks, read on the day it is opened.
  router.get('/api/underneath', authenticateToken, async (req, res) => {
    try {
      return res.json({ months: await underneathMonths({ userId: req.user.id, models: { ConnectionJudgment, Thread } }) });
    } catch (error) {
      console.error('Error reading underneath:', error);
      return res.status(500).json({ error: 'Underneath could not be read.' });
    }
  });

  router.get('/api/underneath/:month', authenticateToken, async (req, res) => {
    try {
      const issue = await readUnderneath({ userId: req.user.id, month: req.params.month, models: { ConnectionJudgment, Thread, Article } });
      return issue ? res.json(issue) : res.status(404).json({ error: 'Nothing came back that month.' });
    } catch (error) {
      console.error('Error reading underneath:', error);
      return res.status(500).json({ error: 'Underneath could not be read.' });
    }
  });

  // Beyond your library, for ⌘K: a few pages from the open web, only when asked.
  router.get('/api/world', authenticateToken, async (req, res) => {
    const query = String(req.query.q || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (query.length < 3) return res.status(400).json({ error: 'Ask about something.' });
    // The allowance runs on the server's day: a reader's own date could be anything.
    const today = new Date(now()).toISOString().slice(0, 10);
    const key = `${today}:${query.toLowerCase()}`;
    if (searched.has(key)) return res.json({ query, pages: searched.get(key) });
    const spent = `${req.user.id}:${today}`;
    if ((searches.get(spent) || 0) >= WORLD_SEARCHES_A_DAY) return res.status(429).json({ error: 'That is enough of the world for today.' });
    remember(searches, spent, (searches.get(spent) || 0) + 1);
    try {
      const pages = await searchWorld(query);
      remember(searched, key, pages);
      return res.json({ query, pages });
    } catch (error) {
      console.warn('[world] search failed', String(error?.message || error).slice(0, 160));
      return res.json({ query, pages: [] });
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

  /* A kept thread grows from where it began: around its oldest passage, the
     closest you marked since you kept it, offered in pencil. */
  const grownBy = async ({ thread, found, userId, today }) => {
    if (thread.answer !== 'kept') return null;
    const key = `${thread._id}:${today}`;
    if (!growing.has(key)) {
      const [first] = found.marks;
      const passages = await formingAround({ userId, mark: { _id: first.highlightId, bookId: first.articleId, text: first.text, createdAt: first.createdAt } }).catch(() => []);
      remember(growing, key, joining(thread, passages));
    }
    return growing.get(key);
  };

  router.get('/api/threads/:id', authenticateToken, async (req, res) => {
    try {
      const thread = await yours(req, res);
      if (!thread) return null;
      const found = await read(thread, req.user.id);
      if (!found) return res.status(404).json({ error: 'That thread came apart: its passages are gone.' });
      return res.json({ ...found, offered: await grownBy({ thread, found, userId: req.user.id, today: calendarDay(req.query.today) }) });
    } catch (error) {
      console.error('Error reading a thread:', error);
      return res.status(500).json({ error: 'That thread could not be read.' });
    }
  });

  // The reader adds what was offered to the thread, or passes on it for good.
  router.post('/api/threads/:id/offered', authenticateToken, async (req, res) => {
    const { articleId, highlightId, joins } = req.body || {};
    if (typeof joins !== 'boolean' || !mongoose.isValidObjectId(articleId) || !mongoose.isValidObjectId(highlightId)) {
      return res.status(400).json({ error: 'Name a passage of yours, and whether it joins.' });
    }
    try {
      const thread = await yours(req, res);
      if (!thread) return null;
      if (!await Article.findOne({ _id: articleId, userId: req.user.id, 'highlights._id': highlightId })) {
        return res.status(404).json({ error: 'That passage is not in your library.' });
      }
      thread[joins ? 'marks' : 'passed'].push({ articleId, highlightId });
      await thread.save();
      for (const key of [...growing.keys()]) if (key.startsWith(`${thread._id}:`)) growing.delete(key);
      return res.json({ ...await read(thread, req.user.id), offered: null });
    } catch (error) {
      console.error('Error growing a thread:', error);
      return res.status(500).json({ error: 'That did not save.' });
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
