const express = require('express');
const {
  DecisionMutationError,
  createAcceptedDecision: persistDecision,
  recordDecisionOutcome: persistOutcome,
  transitionDecision: persistTransition
} = require('../services/decisionMutationService');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');

const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const requireHumanOwner = (req, res, next) => {
  if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
    return res.status(403).json({ error: 'Only the human owner can change a decision record.' });
  }
  return next();
};
const sendError = (res, error) => {
  if (error instanceof DecisionMutationError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error('Error changing Wiki decision:', error);
  return res.status(500).json({ error: 'Failed to change Wiki decision.' });
};
const serializeResult = result => ({
  idempotent: Boolean(result?.idempotent),
  pageId: String(result?.page?._id || ''),
  decisionId: String(result?.decision?.decisionId || ''),
  status: String(result?.decision?.status || ''),
  acceptedRevisionId: result?.decision?.acceptedRevisionId ? String(result.decision.acceptedRevisionId) : null,
  immutableSnapshotHash: String(result?.decision?.immutableSnapshotHash || ''),
  outcome: result?.decision?.outcome || null,
  receipt: result?.receipt || null
});

const buildDecisionMutationRouter = ({
  authenticateToken,
  createAcceptedDecision = persistDecision,
  recordDecisionOutcome = persistOutcome,
  transitionDecision = persistTransition,
  ...models
} = {}) => {
  const router = express.Router();
  router.post('/api/wiki/pages/:pageId/decisions', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId) || !isObjectId(req.body?.acceptedRevisionId)) {
      return res.status(400).json({ error: 'pageId and acceptedRevisionId must be valid object ids.' });
    }
    try {
      const result = await createAcceptedDecision({
        userId: req.user.id,
        pageId: req.params.pageId,
        acceptedRevisionId: req.body.acceptedRevisionId,
        requestId: req.body.requestId,
        decision: req.body.decision,
        ...models
      });
      return res.status(result.idempotent ? 200 : 201).json(serializeResult(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/wiki/pages/:pageId/decisions/:decisionId/transition', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await transitionDecision({
        userId: req.user.id,
        pageId: req.params.pageId,
        decisionId: req.params.decisionId,
        action: req.body?.action,
        ...models
      });
      return res.status(200).json(serializeResult(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/wiki/pages/:pageId/decisions/:decisionId/outcome', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await recordDecisionOutcome({
        userId: req.user.id,
        pageId: req.params.pageId,
        decisionId: req.params.decisionId,
        outcome: req.body?.outcome,
        ...models
      });
      return res.status(200).json(serializeResult(result));
    } catch (error) {
      return sendError(res, error);
    }
  });
  return router;
};

module.exports = { buildDecisionMutationRouter, isObjectId, requireHumanOwner, serializeResult };
