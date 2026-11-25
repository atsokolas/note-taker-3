const express = require('express');
const mongoose = require('mongoose');
const { SINKS_AFTER_DAYS, home } = require('../services/home');
const { echoToday } = require('../services/bookShelf');
const { calendarDay } = require('../services/closedBooks');

const HOME_FIELDS = 'title url author createdAt evergreen evergreenAt highlights._id highlights.text highlights.note highlights.page highlights.createdAt highlights.opens highlights.keptAt';
const DAY_MS = 24 * 60 * 60 * 1000;
const CAME_BACK_KEPT = 500;

/* Home: what you keep, what you are reading for now, and what lies
   underneath, with the one old mark that came back up today beside a new
   one, when one did. Only the reader keeps a passage. */
const buildHomeRouter = ({ authenticateToken, Article, ArticleReadingState, echoOf, now = () => Date.now() }) => {
  const router = express.Router();
  // What came back holds all day, and is looked for again when a new mark arrives.
  const cameBack = new Map();

  router.get('/api/home', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
      const at = now();
      const today = calendarDay(req.query.today);
      const [articles, readings] = await Promise.all([
        Article.find({ userId }).select(HOME_FIELDS).lean(),
        ArticleReadingState.find({ userId, visitedAt: { $gte: new Date(at - SINKS_AFTER_DAYS * DAY_MS) } }).select('articleId visitedAt').lean()
      ]);
      const { recent, ...shelf } = home({ articles, readings, now: at });
      const key = `${userId}:${today}:${recent.reduce((sum, work) => sum + work.highlights.length, 0)}`;
      if (!cameBack.has(key)) {
        cameBack.set(key, await echoToday({ books: recent, today, echoOf: mark => echoOf({ userId, mark }) }).catch(() => null));
        if (cameBack.size > CAME_BACK_KEPT) cameBack.delete(cameBack.keys().next().value);
      }
      return res.json({ ...shelf, cameBack: cameBack.get(key) });
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

  return router;
};

module.exports = { buildHomeRouter };
