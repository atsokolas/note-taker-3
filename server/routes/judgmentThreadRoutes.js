const express = require('express');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');
const {
  JudgmentThreadError,
  readJudgmentThread,
  saveJudgmentThread
} = require('../services/judgmentThreadService');
const {
  JudgmentObservationLineageError,
  proposeObservationLineage,
  reviewObservationLineage
} = require('../services/judgmentObservationLineageService');

const objectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const humanOwner = (req, res, next) => {
  if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
    return res.status(403).json({ error: 'Only the human owner can continue this response.' });
  }
  return next();
};
const sendError = (res, error) => {
  if (error instanceof JudgmentThreadError) {
    return res.status(error.status).json({ error: error.message, code: error.code, latest: error.latest || null });
  }
  if (error instanceof JudgmentObservationLineageError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error('Error continuing Judgment response:', error);
  return res.status(500).json({ error: 'Failed to save the Judgment response.' });
};

const buildJudgmentThreadRouter = ({
  authenticateToken,
  readThread = readJudgmentThread,
  saveThread = saveJudgmentThread,
  proposeLineage = proposeObservationLineage,
  reviewLineage = reviewObservationLineage,
  ...models
} = {}) => {
  const router = express.Router();
  const authenticated = [authenticateToken, requireAuthenticatedUser];
  const guards = [...authenticated, humanOwner];

  router.post('/api/judgment/source-lineage/proposals', ...authenticated, async (req, res) => {
    const sourceEventIds = Array.isArray(req.body?.members)
      ? req.body.members.map(member => member?.sourceEventId)
      : [];
    if (sourceEventIds.length < 2 || sourceEventIds.some(sourceEventId => !objectId(sourceEventId))) {
      return res.status(400).json({ error: 'At least two valid source event ids are required.' });
    }
    try {
      const family = await proposeLineage({
        ...models,
        ...req.body,
        userId: req.user.id,
        proposedBy: req.agentToken || req.personalAgent ? 'agent' : 'user'
      });
      return res.status(200).json({ family });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/source-lineage/:familyId/:action(accept|reject)', ...guards, async (req, res) => {
    try {
      const family = await reviewLineage({
        ...models,
        userId: req.user.id,
        familyId: req.params.familyId,
        expectedVersion: req.body?.expectedVersion,
        action: req.params.action
      });
      return res.status(200).json({ family });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/judgment/pages/:pageId/observations/:observationId/thread', ...guards, async (req, res) => {
    if (!objectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      return res.status(200).json(await readThread({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        observationId: req.params.observationId
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.put('/api/judgment/pages/:pageId/observations/:observationId/thread', ...guards, async (req, res) => {
    if (!objectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      return res.status(200).json(await saveThread({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        observationId: req.params.observationId,
        ...req.body
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
};

module.exports = { buildJudgmentThreadRouter, humanOwner };
