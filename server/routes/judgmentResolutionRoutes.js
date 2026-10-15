const express = require('express');
const {
  JudgmentResolutionError,
  comesDue: findDue,
  fileJudgmentEvidence: persistEvidence,
  recordVerdict: persistVerdict,
  setResolutionCriteria: persistCriteria
} = require('../services/judgmentResolutionService');
const { buildJudgmentMirror: readMirror } = require('../services/judgmentMirrorService');
const { JudgmentChangeProposalError } = require('../services/judgmentChangeProposalService');
const { fileReadingProposal: persistReading, highlightForQuote: persistQuote } = require('../services/readingTalksBack');
const { buildJudgmentMirror: buildClaimMirror, STATS } = require('../services/judgmentMirror');
const { buildCalibration } = require('../services/calibrationInstrument');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');
const { EVENT_NAMES } = require('../utils/analytics');

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
  if (error instanceof JudgmentChangeProposalError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
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
  fileJudgmentEvidence = persistEvidence,
  fileReadingProposal = persistReading,
  highlightForQuote = persistQuote,
  recordVerdict = persistVerdict,
  buildJudgmentMirror = readMirror,
  comesDue = findDue,
  trackEvent = () => {},
  ...models
} = {}) => {
  const router = express.Router();
  // Ids and kinds only: never the sentence, the passage, or the note.
  const track = (req, event, properties = {}) => trackEvent({
    event,
    userId: req.user.id,
    requestId: req.requestId,
    properties: { pageId: req.params.pageId, ...properties }
  });

  // The held view whose check-by date has passed with no verdict, if any.
  router.get('/api/judgment/due', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    try {
      return res.status(200).json({ due: await comesDue({ userId: req.user.id, WikiPage: models.WikiPage }) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/judgment/mirror', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    try {
      const stat = STATS.includes(String(req.query?.stat || '')) ? String(req.query.stat) : '';
      const pageMirror = await buildJudgmentMirror({ ...models, userId: req.user.id });
      const pagesQuery = models.WikiPage?.find
        ? models.WikiPage.find({
          userId: req.user.id,
          status: { $ne: 'archived' },
          'judgment.currentJudgment': { $type: 'string', $ne: '' }
        }).select('_id userId title createdAt adapterId judgment')
        : null;
      const pages = (pagesQuery
        ? await (pagesQuery.lean ? pagesQuery.lean() : pagesQuery)
        : []) || [];
      const claimMirror = buildClaimMirror({
        pages,
        now: new Date(),
        userId: req.user.id,
        stat,
        counterevidence: pageMirror.counterevidence
      });
      const calibration = buildCalibration(pages, { userId: req.user.id });
      return res.status(200).json({
        ...claimMirror,
        calibration,
        mirror: {
          ...pageMirror,
          stats: claimMirror.stats,
          claims: claimMirror.claims,
          calibration
        }
      });
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
      if (!result.idempotent) track(req, EVENT_NAMES.VIEW_RESOLVED, { result: String(req.body?.result || '') });
      return res.status(result.idempotent ? 200 : 201).json(serialize(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/evidence', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      /* A passage read back from a new source is filed by its proposal: the
         quote becomes a highlight, then follows the same evidence path. */
      if (req.body?.proposalId) {
        if (!['why', 'against'].includes(req.body?.field)) {
          return res.status(400).json({ error: 'Choose for or against for this passage.' });
        }
        const filed = await fileReadingProposal({
          userId: req.user.id,
          pageId: req.params.pageId,
          receiptId: req.body.proposalId,
          field: req.body.field,
          fileJudgmentEvidence,
          models
        });
        return res.status(filed.replay ? 200 : 201).json({ proposal: filed.proposal, ...(filed.filed ? serialize(filed.filed) : {}) });
      }
      /* A passage out of a saved source that nobody highlighted is filed by
         its words: it becomes a highlight first, as a read-back passage does. */
      let highlightId = req.body?.highlightId;
      if (!highlightId && req.body?.quote && isObjectId(req.body?.articleId)) {
        const { highlight } = await highlightForQuote({
          Article: models.Article, userId: req.user.id, articleId: req.body.articleId, quote: req.body.quote
        });
        highlightId = highlight?._id ? String(highlight._id) : '';
      }
      const result = await fileJudgmentEvidence({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        expectedClaim: req.body?.expectedClaim,
        field: req.body?.field,
        articleId: req.body?.articleId,
        highlightId
      });
      if (!result.idempotent) track(req, EVENT_NAMES.EVIDENCE_FILED, { field: String(req.body?.field || '') });
      return res.status(result.idempotent ? 200 : 201).json(serialize(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
};

module.exports = { buildJudgmentResolutionRouter, requireHumanOwner };
