const express = require('express');
const {
  ConceptDecisionLessonAdoptionError,
  adoptDecisionLessonEvidence
} = require('../services/conceptDecisionLessonAdoptionService');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');

const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const requireHumanOwner = (req, res, next) => {
  if (req.agentToken || req.personalAgent || req.authInfo?.tokenSource === 'agent-token') {
    return res.status(403).json({ error: 'Only the human owner may accept a retained lesson as evidence.' });
  }
  return next();
};

const buildConceptDecisionLessonAdoptionRouter = ({
  authenticateToken,
  adoptLesson = adoptDecisionLessonEvidence,
  ...models
} = {}) => {
  const router = express.Router();
  router.post(
    '/api/concepts/:conceptId/evidence/decision-lessons',
    authenticateToken,
    requireAuthenticatedUser,
    requireHumanOwner,
    async (req, res) => {
      const conceptId = String(req.params.conceptId || '').trim();
      const sourcePageId = String(req.body?.sourcePageId || '').trim();
      if (!isObjectId(conceptId) || !isObjectId(sourcePageId)) {
        return res.status(400).json({ error: 'conceptId and sourcePageId must be valid object ids.' });
      }
      const allowedFields = new Set([
        'sourcePageId', 'decisionId', 'lessonId', 'role', 'requestId',
        'expectedDecisionHash', 'expectedOutcomeHash'
      ]);
      if (Object.keys(req.body || {}).some(field => !allowedFields.has(field))) {
        return res.status(400).json({
          error: 'Lesson text and provenance are reconstructed by the server and cannot be submitted.'
        });
      }
      try {
        const result = await adoptLesson({
          userId: req.user.id,
          targetConceptId: conceptId,
          sourcePageId,
          decisionId: req.body?.decisionId,
          lessonId: req.body?.lessonId,
          role: req.body?.role,
          requestId: req.body?.requestId,
          expectedDecisionHash: req.body?.expectedDecisionHash,
          expectedOutcomeHash: req.body?.expectedOutcomeHash,
          models
        });
        return res.status(result.idempotent ? 200 : 201).json(result);
      } catch (error) {
        if (error instanceof ConceptDecisionLessonAdoptionError) {
          return res.status(error.status).json({ error: error.message, code: error.code });
        }
        if (error?.code === 11000) {
          return res.status(409).json({
            error: 'This retained lesson was accepted concurrently. Reload the Concept evidence.',
            code: 'concurrent_adoption'
          });
        }
        console.error('Error accepting retained lesson evidence:', error);
        return res.status(500).json({ error: 'Failed to accept retained lesson evidence.' });
      }
    }
  );
  return router;
};

module.exports = {
  buildConceptDecisionLessonAdoptionRouter,
  isObjectId,
  requireHumanOwner
};
