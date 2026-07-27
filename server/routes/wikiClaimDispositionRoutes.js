const express = require('express');
const {
  WikiClaimDispositionError,
  disposeWikiClaimCandidate: persistDisposition
} = require('../services/wikiClaimDispositionService');
const {
  WikiRepoClaimReviewError,
  loadRepoClaimReviewQueue: loadRepoReviewQueue
} = require('../services/wikiRepoClaimReviewService');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');

const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());

const requireHumanOwner = (req, res, next) => {
  if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
    return res.status(403).json({ error: 'Only the human owner can dispose a Wiki claim revision.' });
  }
  return next();
};

const buildWikiClaimDispositionRouter = ({
  authenticateToken,
  disposeWikiClaimCandidate = persistDisposition,
  loadRepoClaimReviewQueue = loadRepoReviewQueue,
  ...models
} = {}) => {
  const router = express.Router();
  router.get(
    '/api/wiki/pages/:pageId/repo-claim-candidates',
    authenticateToken,
    requireAuthenticatedUser,
    requireHumanOwner,
    async (req, res) => {
      const pageId = String(req.params.pageId || '').trim();
      if (!isObjectId(pageId)) {
        return res.status(400).json({ error: 'pageId must be a valid object id.' });
      }
      try {
        const result = await loadRepoClaimReviewQueue({
          userId: req.user.id,
          pageId,
          ...models
        });
        return res.status(200).json(result);
      } catch (error) {
        if (error instanceof WikiRepoClaimReviewError) {
          return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('Error loading repo claim candidates:', error);
        return res.status(500).json({ error: 'Failed to load repo claim candidates.' });
      }
    }
  );
  router.post(
    '/api/wiki/revisions/:revisionId/disposition',
    authenticateToken,
    requireAuthenticatedUser,
    requireHumanOwner,
    async (req, res) => {
      const revisionId = String(req.params.revisionId || '').trim();
      if (!isObjectId(revisionId)) {
        return res.status(400).json({ error: 'revisionId must be a valid object id.' });
      }
      try {
        const result = await disposeWikiClaimCandidate({
          userId: req.user.id,
          revisionId,
          action: req.body?.action,
          note: req.body?.note,
          deferredUntil: req.body?.deferredUntil,
          ...models
        });
        return res.status(200).json({
          idempotent: Boolean(result.idempotent),
          state: result.state,
          revisionId,
          pageId: String(result.page?._id || result.revision?.pageId || ''),
          receipt: result.receipt,
          cohort: result.cohort ? {
            finalized: Boolean(result.cohort.finalized),
            blocked: result.cohort.blocked || '',
            receipt: result.cohort.receipt || null
          } : null
        });
      } catch (error) {
        if (error instanceof WikiClaimDispositionError) {
          return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('Error disposing Wiki claim revision:', error);
        return res.status(500).json({ error: 'Failed to dispose Wiki claim revision.' });
      }
    }
  );
  return router;
};

module.exports = {
  buildWikiClaimDispositionRouter,
  isObjectId,
  requireHumanOwner
};
