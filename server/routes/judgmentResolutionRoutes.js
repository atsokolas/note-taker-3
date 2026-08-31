const express = require('express');
const {
  JudgmentResolutionError,
  recordVerdict: persistVerdict,
  setResolutionCriteria: persistCriteria
} = require('../services/judgmentResolutionService');
const { buildJudgmentMirror: readMirror } = require('../services/judgmentMirrorService');
const { buildJudgmentMirror: buildClaimMirror, STATS } = require('../services/judgmentMirror');
const { buildJudgmentAudit: readAudit } = require('../services/judgmentAuditService');
const {
  JudgmentLedgerError,
  readLedger: persistReadLedger,
  recordClock: persistClock,
  recordOutcome: persistOutcome,
  resolveLesson: persistLesson
} = require('../services/judgmentLedgerService');
const {
  LivingTeamError,
  approveVersion: persistApprove,
  grantSeat: persistGrant,
  handOffCase: persistHandoff,
  readTeam: persistReadTeam,
  revokeSeat: persistRevoke,
  setMandate: persistMandate
} = require('../services/livingTeamService');
const {
  InstitutionError,
  acceptLineage: persistAcceptLineage,
  acceptWatchProposal: persistAcceptWatch,
  chooseStress: persistChooseStress,
  draftStress: persistDraftStress,
  holdCase: persistHold,
  killResearchWatch: persistKillWatch,
  openWatch: persistOpenWatch,
  proposeLineage: persistProposeLineage,
  readCalibration: persistReadCalibration,
  readLineage: persistReadLineage,
  readStress: persistReadStress,
  readWatch: persistReadWatch,
  rejectLineage: persistRejectLineage,
  reverseWatchProposal: persistReverseWatch,
  routeWatchProposal: persistRouteWatch,
  transferCase: persistTransfer
} = require('../services/institutionService');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');

const isObjectId = value => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const requireHumanOwner = (req, res, next) => {
  if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
    return res.status(403).json({ error: 'Only the human owner can resolve a judgment.' });
  }
  return next();
};
const sendError = (res, error) => {
  if (
    error instanceof JudgmentResolutionError
    || error instanceof JudgmentLedgerError
    || error instanceof LivingTeamError
    || error instanceof InstitutionError
  ) {
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
  buildJudgmentAudit = readAudit,
  readLedger = persistReadLedger,
  recordClock = persistClock,
  recordOutcome = persistOutcome,
  resolveLesson = persistLesson,
  readTeam = persistReadTeam,
  grantSeat = persistGrant,
  revokeSeat = persistRevoke,
  approveVersion = persistApprove,
  handOffCase = persistHandoff,
  setMandate = persistMandate,
  readLineage = persistReadLineage,
  proposeLineage = persistProposeLineage,
  rejectLineage = persistRejectLineage,
  acceptLineage = persistAcceptLineage,
  readCalibration = persistReadCalibration,
  readStress = persistReadStress,
  draftStress = persistDraftStress,
  chooseStress = persistChooseStress,
  readWatch = persistReadWatch,
  openWatch = persistOpenWatch,
  routeWatch = persistRouteWatch,
  acceptWatch = persistAcceptWatch,
  reverseWatch = persistReverseWatch,
  killWatch = persistKillWatch,
  holdCase = persistHold,
  transferCase = persistTransfer,
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
      let calibration = null;
      try {
        calibration = await readCalibration({ ...models, userId: req.user.id });
      } catch (_calibrationError) {
        calibration = null;
      }
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

  router.get('/api/judgment/audit', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    try {
      const audit = await buildJudgmentAudit({ ...models, userId: req.user.id });
      return res.status(200).json({ audit });
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

  router.get('/api/judgment/pages/:pageId/team', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const team = await readTeam({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        since: req.query?.since || null
      });
      return res.status(200).json({ team });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/team/members', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await grantSeat({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        memberUserId: req.body?.userId || req.body?.memberUserId,
        memberPageId: req.body?.pageId || req.body?.memberPageId,
        roles: req.body?.roles,
        label: req.body?.label
      });
      return res.status(201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/team/members/:memberUserId/revoke', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await revokeSeat({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        memberUserId: req.params.memberUserId,
        requestId: req.body?.requestId
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/team/mandate', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await setMandate({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        purpose: req.body?.purpose,
        exposure: req.body?.exposure,
        allowed: req.body?.allowed,
        denied: req.body?.denied
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/team/approve', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await approveVersion({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        conditions: req.body?.conditions
      });
      return res.status(result?.approval ? 201 : 200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/team/handoff', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await handOffCase({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        requestId: req.body?.requestId,
        toUserId: req.body?.toUserId || req.body?.userId,
        toPageId: req.body?.toPageId || req.body?.pageId,
        toLabel: req.body?.toLabel || req.body?.label
      });
      return res.status(201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/judgment/pages/:pageId/lineage', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await readLineage({ ...models, userId: req.user.id, pageId: req.params.pageId });
      return res.status(200).json({ thread: result.thread });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/lineage', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await proposeLineage({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        toPageId: req.body?.toPageId,
        kind: req.body?.kind,
        object: req.body?.object,
        direction: req.body?.direction,
        contradiction: req.body?.contradiction,
        requestId: req.body?.requestId
      });
      return res.status(result?.idempotent ? 200 : 201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/lineage/:linkId/reject', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await rejectLineage({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        linkId: req.params.linkId,
        requestId: req.body?.requestId
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/lineage/:linkId/accept', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await acceptLineage({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        linkId: req.params.linkId
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/judgment/pages/:pageId/stress', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const overlay = await readStress({ ...models, userId: req.user.id, pageId: req.params.pageId });
      return res.status(200).json({ overlay });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/stress', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await draftStress({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        kind: req.body?.kind,
        modifiedAssumptions: req.body?.modifiedAssumptions,
        proposedPosture: req.body?.proposedPosture,
        generated: req.body?.generated !== false,
        uncertainty: req.body?.uncertainty,
        requestId: req.body?.requestId
      });
      return res.status(201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/stress/:scenarioId/choose', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await chooseStress({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        scenarioId: req.params.scenarioId,
        choice: req.body?.choice
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/judgment/pages/:pageId/watch', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await readWatch({ ...models, userId: req.user.id, pageId: req.params.pageId });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/watch', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await openWatch({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        purpose: req.body?.purpose,
        sources: req.body?.sources,
        budget: req.body?.budget,
        requestId: req.body?.requestId
      });
      return res.status(result?.idempotent ? 200 : 201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/watch/propose', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await routeWatch({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        summary: req.body?.summary,
        source: req.body?.source,
        claimText: req.body?.claimText
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/watch/:proposalId/accept', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await acceptWatch({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        proposalId: req.params.proposalId
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/watch/:proposalId/reverse', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await reverseWatch({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        proposalId: req.params.proposalId
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/watch/kill', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await killWatch({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/hold', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await holdCase({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        kind: req.body?.kind,
        until: req.body?.until,
        note: req.body?.note
      });
      return res.status(201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/judgment/pages/:pageId/transfer', authenticateToken, requireAuthenticatedUser, requireHumanOwner, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await transferCase({
        ...models,
        userId: req.user.id,
        pageId: req.params.pageId,
        toUserId: req.body?.toUserId
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
};

module.exports = { buildJudgmentResolutionRouter, requireHumanOwner };
