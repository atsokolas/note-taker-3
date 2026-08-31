const express = require('express');
const {
  JudgmentResolutionError,
  recordVerdict: persistVerdict,
  setResolutionCriteria: persistCriteria
} = require('../services/judgmentResolutionService');
const { buildJudgmentMirror: readMirror } = require('../services/judgmentMirrorService');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');

const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const requireHumanOwner = (req, res, next) => {
  if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
    return res.status(403).json({ error: 'Only the human owner can resolve a judgment.' });
  }
  return next();
};
const sendError = (res, error) => {
  if (error instanceof JudgmentResolutionError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error('Error resolving Judgment:', error);
  return res.status(500).json({ error: 'Failed to resolve Judgment.' });
};
const serialize = result => ({
  idempotent: Boolean(result?.idempotent),
  pageId: String(result?.page?._id || ''),
  judgment: result?.page?.judgment || null,
  artifact: result?.artifact || null,
  receipt: result?.receipt || null
});

const buildJudgmentResolutionRouter = ({
  authenticateToken,
  setResolutionCriteria = persistCriteria,
  recordVerdict = persistVerdict,
  buildJudgmentMirror = readMirror,
  ...models
} = {}) => {
  const router = express.Router();

  router.get('/api/judgment/mirror', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    try {
      const mirror = await buildJudgmentMirror({ ...models, userId: req.user.id });
      return res.status(200).json({ mirror });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/resolution', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await setResolutionCriteria({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        expectedClaim: req.body?.expectedClaim,
        criteria: req.body?.criteria,
        horizonAt: req.body?.horizonAt
      });
      return res.status(result.idempotent ? 200 : 201).json(serialize(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/verdicts', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await recordVerdict({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        expectedClaim: req.body?.expectedClaim,
        result: req.body?.result,
        note: req.body?.note,
        evidenceSourceRefIds: req.body?.evidenceSourceRefIds
      });
      return res.status(result.idempotent ? 200 : 201).json(serialize(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
};

module.exports = { buildJudgmentResolutionRouter, requireHumanOwner };
