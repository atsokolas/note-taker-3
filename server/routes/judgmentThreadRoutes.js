const express = require('express');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');
const {
  JudgmentThreadError,
  readJudgmentThread,
  saveJudgmentThread
} = require('../services/judgmentThreadService');

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
  console.error('Error continuing Judgment response:', error);
  return res.status(500).json({ error: 'Failed to save the Judgment response.' });
};

const buildJudgmentThreadRouter = ({
  authenticateToken,
  readThread = readJudgmentThread,
  saveThread = saveJudgmentThread,
  ...models
} = {}) => {
  const router = express.Router();
  const guards = [authenticateToken, requireAuthenticatedUser, humanOwner];

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
