const express = require('express');
const {
  ConceptInvestigationError,
  buildConceptInvestigation
} = require('../services/conceptInvestigationService');
const { requireAuthenticatedUser, parseOptionalClaimId } = require('./conceptRouteGuards');

const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const id = value => String(value?._id || value || '').trim();
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const awaitQuery = async (query) => {
  const next = query?.lean ? query.lean() : query;
  return await next;
};
const requireHumanOwner = (req, res, next) => {
  const agentAuthenticated = Boolean(
    req.agentToken
    || req.personalAgent
    || req.authInfo?.tokenSource === 'agent-token'
  );
  if (agentAuthenticated) {
    return res.status(403).json({ error: 'Concept investigations require the human owner.' });
  }
  return next();
};

const buildConceptInvestigationRouter = ({
  authenticateToken,
  ...models
} = {}) => {
  const router = express.Router();

  router.get(
    '/api/wiki/pages/:wikiPageId/pending-claim-review',
    authenticateToken,
    requireAuthenticatedUser,
    requireHumanOwner,
    async (req, res) => {
      const wikiPageId = String(req.params.wikiPageId || '').trim();
      if (!isObjectId(wikiPageId)) {
        return res.status(400).json({ error: 'wikiPageId must be a valid object id.' });
      }
      if (!models.WikiPage?.findOne || !models.WikiRevision?.findOne || !models.TagMeta?.findOne) {
        return res.status(503).json({ error: 'Dossier claim review is unavailable.' });
      }
      try {
        const page = plain(await awaitQuery(models.WikiPage.findOne({
          _id: wikiPageId,
          userId: req.user.id,
          status: { $ne: 'archived' },
          archived: { $ne: true },
          hiddenFromHome: { $ne: true },
          debugOnly: { $ne: true }
        })));
        if (
          !page
          || page.archived === true
          || page.hiddenFromHome === true
          || page.debugOnly === true
          || !page?.investmentDossier?.version
        ) {
          return res.status(404).json({ error: 'Investment dossier not found.' });
        }
        if (String(page?.aiState?.candidateStatus || '') !== 'awaiting_claim_acceptance') {
          return res.status(200).json({
            claimReview: null,
            state: 'settled',
            generatedAt: new Date().toISOString()
          });
        }
        let revisionQuery = models.WikiRevision.findOne({
          pageId: wikiPageId,
          userId: req.user.id,
          promotionStatus: { $in: ['candidate', 'deferred'] },
          'claimReview.state': { $in: ['pending', 'deferred'] }
        });
        if (revisionQuery?.sort) revisionQuery = revisionQuery.sort({ createdAt: -1 });
        const revision = plain(await awaitQuery(revisionQuery));
        if (!revision?.claimReview?.targetClaimId) {
          return res.status(409).json({
            error: 'The dossier says a claim needs review, but no bounded claim candidate is available.'
          });
        }
        let conceptId = id(revision?.claimReview?.conceptId);
        if (!conceptId) {
          const concept = plain(await awaitQuery(models.TagMeta.findOne({
            userId: req.user.id,
            archived: { $ne: true },
            hiddenFromHome: { $ne: true },
            debugOnly: { $ne: true },
            'continuityAnchor.kind': 'wiki_investigation',
            'continuityAnchor.objectType': 'wiki_page',
            'continuityAnchor.objectId': page._id
          })));
          conceptId = id(concept);
        }
        if (!conceptId) {
          return res.status(409).json({
            error: 'This dossier claim candidate is missing its owned Concept continuity anchor.'
          });
        }
        const asOf = new Date();
        const investigation = await buildConceptInvestigation({
          userId: req.user.id,
          conceptId,
          wikiPageId,
          revisionId: id(revision),
          claimId: String(revision.claimReview.targetClaimId),
          models,
          asOf
        });
        if (!investigation?.claimReview) {
          return res.status(409).json({
            error: 'The bounded dossier claim candidate could not be reconstructed for review.'
          });
        }
        return res.status(200).json({
          claimReview: investigation.claimReview,
          identity: investigation.claimReview.identity,
          state: investigation.claimReview.state,
          generatedAt: asOf.toISOString()
        });
      } catch (error) {
        if (error instanceof ConceptInvestigationError) {
          return res.status(error.status).json({ error: error.message });
        }
        console.error('Error loading pending dossier claim review:', error);
        return res.status(500).json({ error: 'Failed to load pending dossier claim review.' });
      }
    }
  );

  router.get(
    '/api/concepts/:conceptId/investigation',
    authenticateToken,
    requireAuthenticatedUser,
    requireHumanOwner,
    async (req, res) => {
      const conceptId = String(req.params.conceptId || '').trim();
      const wikiPageId = String(req.query.wikiPageId || '').trim();
      const revisionId = String(req.query.revisionId || '').trim();
      const parsedClaimId = parseOptionalClaimId(req.query.claimId);
      if (!isObjectId(conceptId)) {
        return res.status(400).json({ error: 'conceptId must be a valid object id.' });
      }
      if (!isObjectId(wikiPageId)) {
        return res.status(400).json({ error: 'wikiPageId must be a valid object id.' });
      }
      if (revisionId && !isObjectId(revisionId)) {
        return res.status(400).json({ error: 'revisionId must be a valid object id.' });
      }
      if (parsedClaimId.error) return res.status(400).json({ error: parsedClaimId.error });
      const claimId = parsedClaimId.value;

      try {
        const asOf = new Date();
        const investigation = await buildConceptInvestigation({
          userId: req.user.id,
          conceptId,
          wikiPageId,
          revisionId,
          claimId,
          models,
          asOf
        });
        return res.status(200).json({
          investigation,
          generatedAt: asOf.toISOString()
        });
      } catch (error) {
        if (error instanceof ConceptInvestigationError) {
          return res.status(error.status).json({ error: error.message });
        }
        console.error('Error building Concept investigation:', error);
        return res.status(500).json({ error: 'Failed to load Concept investigation.' });
      }
    }
  );

  return router;
};

module.exports = {
  buildConceptInvestigationRouter,
  isObjectId,
  requireHumanOwner
};
