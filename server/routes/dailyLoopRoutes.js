const express = require('express');
const mongoose = require('mongoose');
const {
  recordClaimCheckIn,
  listWatching,
  buildDailyLoopBriefing
} = require('../services/dailyLoopService');
const {
  armReadingWatchForPage,
  checkReadingWatchForPage
} = require('../services/readingWatcherService');
const {
  emailConfigurationStatus,
  verifyUnsubscribeToken
} = require('../services/morningPaperEmailService');

const clean = (value = '', limit = 500) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit).trim() : text;
};
const plain = (value) => value?.toObject ? value.toObject({ virtuals: false }) : value;

const safeEmail = (value = '') => {
  const email = clean(value, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};

const safeTimezone = (value = '') => {
  const timezone = clean(value || 'UTC', 100);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch (_error) {
    return '';
  }
};

const serializeSettings = (user, env = process.env) => {
  const settings = plain(user?.morningPaper) || {};
  return {
    enabled: Boolean(settings.enabled),
    email: String(settings.email || ''),
    emailConfirmedAt: settings.emailConfirmedAt || null,
    emailConfirmed: Boolean(settings.email && settings.emailConfirmedAt),
    timezone: settings.timezone || 'UTC',
    sendHourLocal: Number(settings.sendHourLocal ?? 7),
    unsubscribedAt: settings.unsubscribedAt || null,
    lastSentAt: settings.lastSentAt || null,
    lastAttemptedAt: settings.lastAttemptedAt || null,
    lastSkippedAt: settings.lastSkippedAt || null,
    lastSkipReason: settings.lastSkipReason || '',
    configuration: emailConfigurationStatus(env)
  };
};

const buildDailyLoopRouter = ({
  authenticateToken,
  User,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  WikiBriefingCache,
  WikiPageVisit,
  Article,
  NotebookEntry,
  TagMeta,
  Question,
  ImportSession,
  NoeisReceipt,
  Connection,
  env = process.env
} = {}) => {
  const router = express.Router();
  const auth = authenticateToken;
  const dailyLoopFlights = new Map();
  const models = {
    User, WikiPage, WikiRevision, WikiSourceEvent, WikiMaintenanceRun, WikiBriefingCache,
    WikiPageVisit, Article, NotebookEntry, TagMeta, Question, ImportSession, NoeisReceipt, Connection
  };

  router.get('/api/daily-loop', auth, async (req, res) => {
    try {
      const flightKey = String(req.user.id);
      let flight = dailyLoopFlights.get(flightKey);
      if (!flight) {
        flight = buildDailyLoopBriefing({
          userId: req.user.id,
          models,
          now: new Date(),
          advanceCursor: true,
          maxAgeMs: Number(env.WIKI_BRIEFING_CACHE_MAX_AGE_MS || 6 * 60 * 60 * 1000)
        });
        dailyLoopFlights.set(flightKey, flight);
      }
      const { briefing, user } = await flight;
      return res.status(200).json({ briefing, settings: serializeSettings(user, env) });
    } catch (error) {
      console.error('Error building Daily Loop:', error);
      return res.status(500).json({ error: 'Failed to build Daily Loop.' });
    } finally {
      dailyLoopFlights.delete(String(req.user.id));
    }
  });

  router.post('/api/daily-loop/page-visits/:pageId', auth, async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(req.params.pageId || ''))) return res.status(400).json({ error: 'Invalid page id.' });
      const pageExists = await WikiPage.exists({ _id: req.params.pageId, userId: req.user.id });
      if (!pageExists) return res.status(404).json({ error: 'Wiki page not found.' });
      const visit = await WikiPageVisit.findOneAndUpdate(
        { userId: req.user.id, pageId: req.params.pageId },
        { $set: { lastVisitedAt: new Date() }, $inc: { visitCount: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return res.status(200).json({ lastVisitedAt: visit.lastVisitedAt, visitCount: visit.visitCount });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to record page visit.' });
    }
  });

  router.post('/api/daily-loop/check-ins/:pageId/:claimId', auth, async (req, res) => {
    try {
      const result = await recordClaimCheckIn({
        models,
        userId: req.user.id,
        pageId: req.params.pageId,
        claimId: req.params.claimId,
        action: String(req.body?.action || ''),
        note: req.body?.note || '',
        revisedText: req.body?.revisedText || ''
      });
      await WikiBriefingCache.deleteOne({ userId: req.user.id });
      return res.status(200).json({
        claim: result.claim,
        revisionId: result.revisionId,
        acknowledgment: result.acknowledgment,
        streak: result.streak
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to record claim check-in.' });
    }
  });

  router.get('/api/morning-paper/settings', auth, async (req, res) => {
    const user = await User.findById(req.user.id).select('morningPaper');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.status(200).json({ settings: serializeSettings(user, env) });
  });

  router.patch('/api/morning-paper/settings', auth, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const current = plain(user.morningPaper) || {};
      const next = { ...current };
      if (req.body?.email !== undefined) {
        const email = safeEmail(req.body.email);
        if (req.body.email && !email) return res.status(400).json({ error: 'Enter a valid delivery email.' });
        if (email !== current.email) next.emailConfirmedAt = null;
        next.email = email;
      }
      if (req.body?.timezone !== undefined) {
        const timezone = safeTimezone(req.body.timezone);
        if (!timezone) return res.status(400).json({ error: 'Enter a valid IANA timezone.' });
        next.timezone = timezone;
      }
      if (req.body?.sendHourLocal !== undefined) {
        const hour = Number(req.body.sendHourLocal);
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) return res.status(400).json({ error: 'sendHourLocal must be an integer from 0 to 23.' });
        next.sendHourLocal = hour;
      }
      if (req.body?.confirmEmail === true) {
        if (!next.email) return res.status(400).json({ error: 'A delivery email is required before confirmation.' });
        next.emailConfirmedAt = new Date();
        next.unsubscribedAt = null;
        next.unsubscribeTokenVersion = Number(next.unsubscribeTokenVersion || 1) + 1;
      }
      if (req.body?.enabled !== undefined) {
        if (req.body.enabled && (!next.email || !next.emailConfirmedAt)) {
          return res.status(409).json({ error: 'Confirm the delivery address before enabling Morning Paper email.' });
        }
        if (req.body.enabled && next.unsubscribedAt) {
          return res.status(409).json({ error: 'Confirm the address again before resubscribing.' });
        }
        next.enabled = Boolean(req.body.enabled);
      }
      user.morningPaper = next;
      await user.save({ timestamps: false });
      return res.status(200).json({ settings: serializeSettings(user, env) });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update Morning Paper settings.' });
    }
  });

  const unsubscribe = async (req, res) => {
    const token = String(req.query?.token || req.body?.token || '');
    const decoded = verifyUnsubscribeToken({ token, secret: String(env.MORNING_PAPER_UNSUBSCRIBE_SECRET || '') });
    if (!decoded || !mongoose.Types.ObjectId.isValid(decoded.userId)) {
      return res.status(400).send('This unsubscribe link is invalid or expired.');
    }
    const user = await User.findById(decoded.userId);
    if (!user || Number(user.morningPaper?.unsubscribeTokenVersion || 1) !== decoded.version) {
      return res.status(400).send('This unsubscribe link is invalid or expired.');
    }
    if (!user.morningPaper?.unsubscribedAt) {
      user.morningPaper.enabled = false;
      user.morningPaper.unsubscribedAt = new Date();
      await user.save({ timestamps: false });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('<!doctype html><title>Unsubscribed</title><p>You are unsubscribed from the Noeis Morning Paper.</p>');
  };
  router.get('/api/morning-paper/unsubscribe', unsubscribe);
  router.post('/api/morning-paper/unsubscribe', unsubscribe);

  router.post('/api/wiki/pages/:pageId/reading-watch', auth, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.pageId, userId: req.user.id });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await armReadingWatchForPage({ WikiSourceEvent, page, feedUrl: req.body?.feedUrl, label: req.body?.label });
      await WikiBriefingCache.deleteOne({ userId: req.user.id });
      return res.status(200).json({ page: plain(result.page), events: result.events.map(plain) });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to arm reading watch.' });
    }
  });

  router.post('/api/wiki/pages/:pageId/reading-watch/check', auth, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.pageId, userId: req.user.id });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await checkReadingWatchForPage({ WikiSourceEvent, page });
      await WikiBriefingCache.deleteOne({ userId: req.user.id });
      return res.status(200).json({ page: plain(result.page), events: result.events.map(plain) });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to check reading watch.' });
    }
  });

  router.post('/api/daily-loop/watchers/:pageId/:type/disarm', auth, async (req, res) => {
    const field = { sec_edgar: 'edgar', earnings_transcript: 'transcripts', github: 'githubRepo', reading: 'reading' }[req.params.type];
    if (!field) return res.status(400).json({ error: 'Unknown watcher type.' });
    const page = await WikiPage.findOne({ _id: req.params.pageId, userId: req.user.id });
    if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
    page.externalWatches[field].status = 'idle';
    page.externalWatches[field].errorMessage = '';
    await page.save();
    await WikiBriefingCache.deleteOne({ userId: req.user.id });
    return res.status(200).json({ watching: listWatching([page]) });
  });

  return router;
};

module.exports = { buildDailyLoopRouter, serializeSettings, safeTimezone };
