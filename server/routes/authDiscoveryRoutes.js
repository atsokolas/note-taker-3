const express = require('express');

const PASSWORD_MIN_LENGTH = 8;
const { sanitizeAttribution } = require('./marketingAnalyticsRoutes');
const { isAdminUsername } = require('../utils/requireAdmin');

const validateRegistration = ({ username, password }) => {
  const cleanUsername = String(username || '').trim();
  const rawPassword = String(password || '');

  if (!cleanUsername || !rawPassword) {
    return { error: 'Username and password are required.' };
  }

  if (rawPassword.length < PASSWORD_MIN_LENGTH) {
    return { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }

  if (cleanUsername.toLowerCase() === rawPassword.trim().toLowerCase()) {
    return { error: 'Password cannot match your username.' };
  }

  if (!/[A-Za-z]/.test(rawPassword) || !/\d/.test(rawPassword)) {
    return { error: 'Password must include at least one letter and one number.' };
  }

  return {
    cleanUsername,
    password: rawPassword
  };
};

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Usernames are kept as typed but are one name whatever the case: "Athan"
   and "athan" are the same reader. An exact match wins, so the few accounts
   made before this that differ only by case still open as they did. */
const findByUsername = async (User, username) => {
  const clean = String(username || '').trim();
  if (!clean) return null;
  const exact = await User.findOne({ username: clean });
  if (exact) return exact;
  const matches = await User.find({ username: new RegExp(`^${escapeRegExp(clean)}$`, 'i') }).limit(2);
  return matches.length === 1 ? matches[0] : null;
};

/* Failed logins, per name and per address, forgotten after a quiet quarter
   hour. In memory: one server, and a restart forgiving everyone is fine. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/* Ten wrong passwords for one name; more for one address, which can be a
   whole office behind one router. */
const LOGIN_MAX_FAILURES = { u: 10, ip: 50 };
const createLoginThrottle = ({ now = () => Date.now() } = {}) => {
  const failures = new Map();
  const keys = (username, ip) => [`u:${String(username || '').trim().toLowerCase()}`, `ip:${ip || ''}`];
  const live = (key) => {
    const entry = failures.get(key);
    if (entry && now() - entry.since > LOGIN_WINDOW_MS) failures.delete(key);
    return failures.get(key);
  };
  return {
    blocked: (username, ip) => keys(username, ip).some(key => (live(key)?.count || 0) >= LOGIN_MAX_FAILURES[key.split(':')[0]]),
    fail: (username, ip) => keys(username, ip).forEach((key) => {
      const entry = live(key) || { count: 0, since: now() };
      failures.set(key, { ...entry, count: entry.count + 1 });
    }),
    clear: username => failures.delete(keys(username)[0])
  };
};

const buildAuthDiscoveryRouter = ({
  bcrypt,
  jwt,
  User,
  authenticateToken,
  Recommendation,
  Article,
  TourState = null,
  trackEvent = () => {},
  EVENT_NAMES = {},
  loginThrottle = createLoginThrottle()
}) => {
  const router = express.Router();

  router.post('/api/auth/register', async (req, res) => {
    try {
      const validation = validateRegistration(req.body || {});
      if (validation.error) {
        return res.status(400).json({ error: validation.error });
      }
      const { cleanUsername, password } = validation;

      if (await findByUsername(User, cleanUsername)) {
        return res.status(409).json({ error: 'That username is taken. Try another.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ username: cleanUsername, password: hashedPassword });
      await newUser.save();
      // Only accounts made from here on meet first run. Best effort: a missed
      // write costs the walkthrough, never the account.
      await TourState?.updateOne(
        { userId: newUser._id },
        { $set: { 'onboarding.status': 'pending' } },
        { upsert: true }
      ).catch(() => {});
      const marketingAttribution = sanitizeAttribution(req.body?.marketingAttribution);
      trackEvent({
        event: EVENT_NAMES.USER_SIGNUP,
        userId: newUser._id,
        requestId: req.requestId,
        properties: marketingAttribution
      });
      res.status(201).json({
        message: "User registered successfully.",
        loginMessage: "Account created. You can log in now."
      });
    } catch (error) {
      console.error("❌ Error registering user:", error);
      res.status(500).json({ error: "Internal server error.", details: error.message });
    }
  });

  router.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: 'Enter your username and password.' });
      }
      if (loginThrottle.blocked(username, req.ip)) {
        return res.status(429).json({ error: 'Too many tries. Wait fifteen minutes and try again.' });
      }

      const user = await findByUsername(User, username);
      const isMatch = Boolean(user && !user.accountDisabledAt && await bcrypt.compare(String(password), user.password));
      if (!isMatch) {
        loginThrottle.fail(username, req.ip);
        return res.status(401).json({ error: 'That username and password do not match.' });
      }
      loginThrottle.clear(username);

      const token = jwt.sign(
        { id: user._id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.clearCookie('token');
      res.clearCookie('authToken');
      res.clearCookie('jwt');
      res.status(200).json({ token, username: user.username, userId: user._id });
    } catch (error) {
      console.error("❌ Error logging in user:", error);
      res.status(500).json({ error: "Internal server error.", details: error.message });
    }
  });

  /* Who you are signed in as, for Settings: the name, since when, and whether
     the operator tools are yours to see. */
  router.get('/api/account', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user || user.accountDisabledAt) return res.status(404).json({ error: 'Account not found.' });
      return res.status(200).json({
        username: user.username,
        since: user.createdAt || null,
        admin: isAdminUsername(user.username)
      });
    } catch (error) {
      console.error('Error reading account:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  /* A new password, given the current one. The same rules as signing up. */
  router.put('/api/account/password', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user || user.accountDisabledAt) return res.status(404).json({ error: 'Account not found.' });
      const isMatch = await bcrypt.compare(String(req.body?.password || ''), user.password);
      if (!isMatch) return res.status(401).json({ error: 'That is not your current password.' });
      const validation = validateRegistration({ username: user.username, password: req.body?.newPassword });
      if (validation.error) return res.status(400).json({ error: validation.error });
      await User.updateOne({ _id: user._id }, { $set: { password: await bcrypt.hash(validation.password, 10) } });
      return res.status(200).json({ changed: true });
    } catch (error) {
      console.error('Error changing password:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  /* Delete my account. The password is asked again so a borrowed session
     cannot close someone's account. Access ends now: every token this
     account holds stops working because the account check refuses a
     disabled user. The content is not erased here: erasure is done by hand
     (docs/noeis-support-erasure-runbook-2026-10-11.md), so the reply says
     it was requested, not done. */
  router.delete('/api/account', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user || user.accountDisabledAt) {
        return res.status(404).json({ error: 'Account not found.' });
      }
      const isMatch = await bcrypt.compare(String(req.body?.password || ''), user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'That password is not right.' });
      }
      const now = new Date();
      await User.updateOne(
        { _id: user._id, accountDisabledAt: null },
        { $set: { accountDisabledAt: now, accountDeletionRequestedAt: now, 'morningPaper.enabled': false } }
      );
      return res.status(200).json({ closed: true, erasureRequestedAt: now.toISOString() });
    } catch (error) {
      console.error('❌ Error deleting account:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  router.post('/api/recommendations', authenticateToken, async (req, res) => {
    const { articleId, highlightIds } = req.body;
    const userId = req.user.id;

    if (!articleId || !highlightIds) {
      return res.status(400).json({ error: "Article ID and highlight IDs are required." });
    }
    if (!Array.isArray(highlightIds) || highlightIds.length === 0) {
      return res.status(400).json({ error: "You must select at least one highlight to share." });
    }
    if (highlightIds.length > 10) {
      return res.status(400).json({ error: "You can share a maximum of 10 highlights." });
    }
    const WORD_LIMIT_PER_HIGHLIGHT = 35;

    try {
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) {
        return res.status(404).json({ error: "Article not found or you do not own it." });
      }

      const sharedHighlights = [];
      for (const hId of highlightIds) {
        const highlight = article.highlights.id(hId);
        if (!highlight) {
          return res.status(400).json({ error: `Highlight with ID ${hId} not found.` });
        }
        if (highlight.text.split(' ').length > WORD_LIMIT_PER_HIGHLIGHT) {
          return res.status(400).json({ error: `One of your selected highlights exceeds the ${WORD_LIMIT_PER_HIGHLIGHT}-word limit.` });
        }
        sharedHighlights.push({ text: highlight.text });
      }

      const newRecommendation = new Recommendation({
        articleUrl: article.url,
        articleTitle: article.title,
        recommendingUserId: userId,
        sharedHighlights: sharedHighlights
      });

      await newRecommendation.save();
      res.status(201).json({ message: "Article recommended successfully!", recommendation: newRecommendation });
    } catch (error) {
      console.error("❌ Error recommending article:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  return router;
};

module.exports = {
  buildAuthDiscoveryRouter
};
