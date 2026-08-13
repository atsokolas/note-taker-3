const express = require('express');
const {
  buildReadingLoopEdition,
  runMechanic,
  refreshConnectionIfStale,
  suppressThread,
  MECHANICS
} = require('../services/readingLoopService');

/**
 * readingLoopRoutes — the Reading Loop surface at /paper.
 *
 * Connection is native: it renders from the stored edition and is refreshed on
 * the system's own weekly cadence, so the GET never blocks on generation. The
 * other four mechanics run only when the user asks, and are capped per day
 * because each run costs model calls.
 *
 * Card actions deliberately have no endpoints here — collision writes through
 * the shipped claim check-in, resolution through the questions API, and naming
 * a thread through wiki page creation. One write path per concept.
 */
const PROMPTED_MECHANICS = MECHANICS.filter(kind => kind !== 'connection');

const buildReadingLoopRouter = ({
  authenticateToken,
  User,
  Article,
  NotebookEntry,
  Question,
  WikiPage,
  ReadingLoopEdition,
  env = process.env
} = {}) => {
  const router = express.Router();
  const auth = authenticateToken;
  const models = { User, Article, NotebookEntry, Question, WikiPage, ReadingLoopEdition };

  // One generation per user at a time. A second request joins the first rather
  // than starting a duplicate run.
  const inFlight = new Map();

  const startConnectionRefresh = (userId) => {
    const key = String(userId);
    if (inFlight.has(key)) return inFlight.get(key);
    const flight = refreshConnectionIfStale({ userId, models, now: new Date(), env })
      .catch(error => {
        console.error('Reading Loop connection refresh failed:', error);
        return null;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, flight);
    return flight;
  };

  router.get('/api/reading-loop', auth, async (req, res) => {
    try {
      const edition = await buildReadingLoopEdition({ userId: req.user.id, models, now: new Date(), env });
      const stale = !edition.coldStart
        && (edition.connection.status === 'idle' || isStale(edition.connection.generatedAt));
      if (stale) startConnectionRefresh(req.user.id);
      return res.status(200).json({
        edition,
        connectionRefreshing: stale || inFlight.has(String(req.user.id))
      });
    } catch (error) {
      console.error('Error building Reading Loop edition:', error);
      return res.status(error.statusCode || 500).json({ error: 'Failed to build the Reading Loop.' });
    }
  });

  router.post('/api/reading-loop/run/:kind', auth, async (req, res) => {
    const kind = String(req.params.kind || '');
    if (kind === 'connection') {
      // The lead refreshes on its own control, below.
      return res.status(400).json({ error: 'Use /api/reading-loop/connection/refresh for the lead.' });
    }
    if (!PROMPTED_MECHANICS.includes(kind)) {
      return res.status(400).json({ error: 'Unknown Reading Loop mechanic.' });
    }
    try {
      const { mechanic } = await runMechanic({ userId: req.user.id, models, kind, now: new Date(), env });
      return res.status(200).json({ mechanic });
    } catch (error) {
      if (error.statusCode === 429) {
        return res.status(429).json({ error: error.message, dailyCapReached: true });
      }
      console.error(`Reading Loop ${kind} run failed:`, error);
      return res.status(error.statusCode || 500).json({ error: `Failed to run ${kind}.` });
    }
  });

  router.post('/api/reading-loop/connection/refresh', auth, async (req, res) => {
    try {
      const { mechanic } = await runMechanic({ userId: req.user.id, models, kind: 'connection', now: new Date(), env });
      return res.status(200).json({ mechanic });
    } catch (error) {
      if (error.statusCode === 429) {
        return res.status(429).json({ error: error.message, dailyCapReached: true });
      }
      console.error('Reading Loop connection refresh failed:', error);
      return res.status(error.statusCode || 500).json({ error: 'Failed to refresh the connection.' });
    }
  });

  router.post('/api/reading-loop/thread/dismiss', auth, async (req, res) => {
    const threadKey = String(req.body?.threadKey || '').trim();
    if (!threadKey) return res.status(400).json({ error: 'threadKey is required.' });
    try {
      await suppressThread({ userId: req.user.id, models, threadKey, now: new Date() });
      const edition = await buildReadingLoopEdition({ userId: req.user.id, models, now: new Date(), env });
      return res.status(200).json({ mechanic: edition.thread });
    } catch (error) {
      console.error('Reading Loop thread dismiss failed:', error);
      return res.status(error.statusCode || 500).json({ error: 'Failed to dismiss the thread.' });
    }
  });

  return router;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const isStale = (generatedAt) => {
  if (!generatedAt) return true;
  const at = new Date(generatedAt).getTime();
  if (Number.isNaN(at)) return true;
  return Date.now() - at >= WEEK_MS;
};

module.exports = { buildReadingLoopRouter, __testables: { isStale, PROMPTED_MECHANICS } };
