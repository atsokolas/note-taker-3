const express = require('express');
const {
  JudgmentResolutionError,
  recordVerdict: persistVerdict,
  setResolutionCriteria: persistCriteria
} = require('../services/judgmentResolutionService');
const { buildJudgmentMirror: readMirror } = require('../services/judgmentMirrorService');
const { buildJudgmentMirror: buildClaimMirror, STATS } = require('../services/judgmentMirror');
const {
  JudgmentLedgerError,
  readLedger: persistReadLedger,
  recordClock: persistClock,
  recordOutcome: persistOutcome,
  resolveLesson: persistLesson
} = require('../services/judgmentLedgerService');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');

const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const requireHumanOwner = (req, res, next) => {
  if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
    return res.status(403).json({ error: 'Only the human owner can resolve a judgment.' });
  }
  return next();
};
const sendError = (res, error) => {
  if (error instanceof JudgmentResolutionError || error instanceof JudgmentLedgerError) {
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
  readLedger = persistReadLedger,
  recordClock = persistClock,
  recordOutcome = persistOutcome,
  resolveLesson = persistLesson,
  ...models
} = {}) => {
  const router = express.Router();

  router.get('/api/judgment/mirror', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    try {
      const stat = STATS.includes(String(req.query?.stat || '')) ? String(req.query.stat) : '';
      const pageMirror = await buildJudgmentMirror({ ...models, userId: req.user.id });
      const pagesQuery = models.WikiPage?.find
        ? models.WikiPage.find({ userId: req.user.id, status: { $ne: 'archived' } })
          .select('_id title pageType claims judgment createdAt')
        : null;
      const pages = pagesQuery
        ? await (pagesQuery.lean ? pagesQuery.lean() : pagesQuery)
        : [];
      const claimMirror = buildClaimMirror({
        pages: pages || [],
        now: new Date(),
        userId: req.user.id,
        stat
      });
      return res.status(200).json({
        ...claimMirror,
        mirror: {
          ...pageMirror,
          stats: claimMirror.stats,
          claims: claimMirror.claims
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
      return res.status(result.idempotent ? 200 : 201).json(serialize(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/judgment/pages/:pageId/ledger', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const ledger = await readLedger({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        at: req.query?.at || null
      });
      return res.status(200).json(ledger);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/clocks', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await recordClock({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        expectedClaim: req.body?.expectedClaim,
        clock: req.body?.clock,
        occurredAt: req.body?.occurredAt,
        precision: req.body?.precision,
        authoredBy: req.body?.authoredBy,
        sourceRefIds: req.body?.sourceRefIds,
        sourceLabel: req.body?.sourceLabel,
        summary: req.body?.summary,
        causalKind: req.body?.causalKind,
        relatedId: req.body?.relatedId
      });
      return res.status(result.idempotent ? 200 : 201).json(serialize(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/outcomes', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await recordOutcome({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        expectedClaim: req.body?.expectedClaim,
        result: req.body?.result,
        observedAt: req.body?.observedAt,
        precision: req.body?.precision,
        sourceRefIds: req.body?.sourceRefIds,
        sourceLabel: req.body?.sourceLabel,
        confidence: req.body?.confidence,
        silence: req.body?.silence,
        answer: req.body?.answer,
        lesson: req.body?.lesson,
        verdictId: req.body?.verdictId
      });
      return res.status(result.idempotent ? 200 : 201).json(serialize(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/lessons', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await resolveLesson({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        expectedClaim: req.body?.expectedClaim,
        applicationId: req.body?.applicationId,
        lessonId: req.body?.lessonId,
        sourcePageId: req.body?.sourcePageId,
        sourceText: req.body?.sourceText || req.body?.text,
        status: req.body?.status,
        narrowedText: req.body?.narrowedText,
        note: req.body?.note,
        relevance: req.body?.relevance
      });
      return res.status(result.idempotent ? 200 : 201).json(serialize(result));
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
};

module.exports = { buildJudgmentResolutionRouter, requireHumanOwner };
