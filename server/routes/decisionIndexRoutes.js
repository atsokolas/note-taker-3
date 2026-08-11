const express = require('express');
const {
  DECISION_FILTERS,
  DecisionIndexError,
  MAX_LIMIT,
  MAX_WINDOW_DAYS,
  buildDecisionIndex: buildIndex
} = require('../services/decisionIndexService');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');

const parseFilter = value => {
  const filter = String(value || 'upcoming_review').trim().toLowerCase();
  return DECISION_FILTERS.includes(filter) ? filter : null;
};
const parsePositive = (value, fallback, max) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
};
const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const requireHumanOwner = (req, res, next) => {
  if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
    return res.status(403).json({ error: 'Only the human owner can open the Decisions index.' });
  }
  return next();
};

const buildDecisionIndexRouter = ({ authenticateToken, buildDecisionIndex = buildIndex, ...models } = {}) => {
  const router = express.Router();
  router.get('/api/decisions', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    const filter = parseFilter(req.query.filter);
    const limit = parsePositive(req.query.limit, 25, MAX_LIMIT);
    const windowDays = parsePositive(req.query.windowDays, 30, MAX_WINDOW_DAYS);
    const pageId = String(req.query.pageId || '').trim();
    if (!filter) return res.status(400).json({ error: `filter must be one of: ${DECISION_FILTERS.join(', ')}.` });
    if (!limit) return res.status(400).json({ error: 'limit must be a positive integer.' });
    if (!windowDays) return res.status(400).json({ error: 'windowDays must be a positive integer.' });
    if (pageId && !isObjectId(pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    const asOf = new Date();
    try {
      const result = await buildDecisionIndex({
        userId: req.user.id, filter, limit, windowDays,
        cursor: String(req.query.cursor || '').trim(), pageId, asOf, models
      });
      return res.status(200).json({
        version: 1,
        items: result.items,
        nextCursor: result.nextCursor,
        filters: { filter, asOf: result.asOf, windowDays, pageId: pageId || null },
        counts: result.counts,
        coverage: result.coverage,
        generatedAt: result.asOf
      });
    } catch (error) {
      if (error instanceof DecisionIndexError) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('Error building Decisions index:', error);
      return res.status(500).json({ error: 'Failed to build Decisions index.' });
    }
  });
  return router;
};

module.exports = { buildDecisionIndexRouter, isObjectId, parseFilter, parsePositive, requireHumanOwner };
