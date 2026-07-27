const express = require('express');
const {
  ConceptContinuityError,
  ensureWikiInvestigationConcept
} = require('../services/conceptContinuityService');
const { requireAuthenticatedUser, parseOptionalClaimId } = require('./conceptRouteGuards');

const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const requireHumanOwner = (req, res, next) => {
  if (req.agentToken || req.personalAgent || req.authInfo?.tokenSource === 'agent-token') {
    return res.status(403).json({
      error: 'Only the human owner can start a Wiki investigation.',
      code: 'HUMAN_OWNER_REQUIRED'
    });
  }
  return next();
};

const buildConceptContinuityRouter = ({ authenticateToken, ...models } = {}) => {
  const router = express.Router();

  router.post('/api/wiki/pages/:wikiPageId/investigation', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    const wikiPageId = String(req.params.wikiPageId || '').trim();
    const revisionId = String(req.body?.revisionId || '').trim();
    const parsedClaimId = parseOptionalClaimId(req.body?.claimId);
    if (!isObjectId(wikiPageId)) {
      return res.status(400).json({ error: 'wikiPageId must be a valid object id.' });
    }
    if (revisionId && !isObjectId(revisionId)) {
      return res.status(400).json({ error: 'revisionId must be a valid object id.' });
    }
    if (parsedClaimId.error) return res.status(400).json({ error: parsedClaimId.error });
    const claimId = parsedClaimId.value;

    try {
      const result = await ensureWikiInvestigationConcept({
        userId: req.user.id,
        wikiPageId,
        revisionId,
        claimId,
        models
      });
      return res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      if (error instanceof ConceptContinuityError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('Error starting Wiki investigation:', error);
      return res.status(500).json({ error: 'Failed to start Wiki investigation.' });
    }
  });

  return router;
};

module.exports = { buildConceptContinuityRouter, isObjectId, requireHumanOwner };
