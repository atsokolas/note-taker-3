const express = require('express');
const { trackRunLifecycleEvents } = require('../services/agentHarnessEvents');

const buildAgentRunRouter = ({
  mongoose,
  authenticateToken,
  AgentRun,
  AgentThread,
  AgentHandoff,
  AgentProtocolApproval,
  AgentProposedChange,
  AgentStructureProposal,
  Folder,
  Article,
  NotebookFolder,
  TagMeta,
  NotebookEntry,
  createRunFromProposalBundle,
  executeAgentRun,
  applyProposalBundleRunOutcome,
  createProposedChangesForRun,
  requestRunStepApproval,
  reconcileAgentRunState,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc,
  sanitizeAgentRunDoc,
  sanitizeAgentThreadDoc,
  trackEvent,
  EVENT_NAMES
}) => {
  const router = express.Router();

  const clean = (value) => String(value || '').trim();

  const getThread = async (userId, threadId) => {
    const safeId = clean(threadId);
    if (!mongoose.Types.ObjectId.isValid(safeId)) return null;
    return AgentThread.findOne({ _id: safeId, userId });
  };

  const getRun = async (userId, runId) => {
    const safeId = clean(runId);
    if (!mongoose.Types.ObjectId.isValid(safeId)) return null;
    return AgentRun.findOne({ _id: safeId, userId });
  };

  router.get('/api/agent/runs', authenticateToken, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const threadId = clean(req.query.threadId);
      const status = clean(req.query.status).toLowerCase();
      const limitRaw = Number(req.query.limit || 30);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(80, Math.trunc(limitRaw))) : 30;
      if (threadId && mongoose.Types.ObjectId.isValid(threadId)) query.threadId = threadId;
      if (status && status !== 'all') query.status = status;
      const rows = await AgentRun.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
      return res.status(200).json({ runs: rows.map(sanitizeAgentRunDoc) });
    } catch (error) {
      console.error('❌ Error listing agent runs:', error);
      return res.status(500).json({ error: 'Failed to list agent runs.' });
    }
  });

  router.post('/api/agent/runs', authenticateToken, async (req, res) => {
    try {
      const thread = await getThread(req.user.id, req.body?.threadId);
      if (!thread) return res.status(404).json({ error: 'Thread not found.' });
      const bundleId = clean(req.body?.bundleId);
      if (!bundleId) return res.status(400).json({ error: 'bundleId is required.' });

      const created = createRunFromProposalBundle({
        thread,
        bundleId,
        actor: { actorType: 'user', actorId: String(req.user.id) }
      });
      const runDoc = await AgentRun.create({
        userId: req.user.id,
        threadId: thread._id,
        sourceBundleId: created.sourceBundleId,
        title: created.title,
        status: created.status,
        createdBy: created.createdBy,
        lastActor: created.lastActor,
        currentOpId: created.currentOpId,
        blockedOpId: created.blockedOpId,
        steps: created.steps,
        completedStepCount: created.completedStepCount,
        startedAt: created.startedAt,
        pausedAt: created.pausedAt,
        completedAt: created.completedAt
      });

      const advanced = await executeAgentRun({
        run: {
          ...created,
          runId: String(runDoc._id)
        },
        thread,
        userId: String(req.user.id),
        actor: { actorType: 'user', actorId: String(req.user.id) },
        AgentHandoff,
        AgentStructureProposal,
        Folder,
        Article,
        NotebookFolder,
        NotebookEntry,
        buildDefaultHandoffPlan,
        buildDefaultHandoffCheckpoint,
        createThreadForHandoff,
        sanitizeAgentHandoffDoc,
        requestStepApproval: ({ run, step, thread: runThread, actor }) => requestRunStepApproval({
          AgentProtocolApproval,
          userId: String(req.user.id),
          run,
          step,
          thread: runThread,
          actor
        })
      });

      runDoc.status = advanced.status;
      runDoc.lastActor = advanced.lastActor;
      runDoc.currentOpId = advanced.currentOpId;
      runDoc.blockedOpId = advanced.blockedOpId;
      runDoc.steps = advanced.steps;
      runDoc.completedStepCount = advanced.completedStepCount;
      runDoc.startedAt = advanced.startedAt;
      runDoc.pausedAt = advanced.pausedAt;
      runDoc.completedAt = advanced.completedAt;
      await runDoc.save();

      await createProposedChangesForRun({
        AgentProposedChange,
        TagMeta,
        NotebookEntry,
        userId: String(req.user.id),
        thread,
        run: {
          ...advanced,
          runId: String(runDoc._id)
        },
        actor: { actorType: 'user', actorId: String(req.user.id) }
      });
      const reconciledRun = await reconcileAgentRunState({
        AgentRun,
        AgentProposedChange,
        userId: String(req.user.id),
        runId: String(runDoc._id)
      });

      applyProposalBundleRunOutcome({
        thread,
        run: {
          ...(reconciledRun?.toObject ? reconciledRun.toObject({ getters: false, virtuals: false }) : reconciledRun || advanced),
          runId: String(runDoc._id)
        }
      });
      await thread.save();
      trackRunLifecycleEvents({
        trackEvent,
        EVENT_NAMES,
        userId: String(req.user.id),
        requestId: req.requestId,
        threadId: String(thread?._id || ''),
        run: reconciledRun || runDoc,
        source: 'run_route_create',
        includeStarted: true
      });

      return res.status(201).json({
        run: sanitizeAgentRunDoc(reconciledRun || runDoc),
        thread: sanitizeAgentThreadDoc(thread)
      });
    } catch (error) {
      if (Number(error?.status) === 404) {
        return res.status(404).json({ error: error.message || 'Proposal bundle not found.' });
      }
      console.error('❌ Error creating agent run:', error);
      return res.status(500).json({ error: 'Failed to create agent run.' });
    }
  });

  router.post('/api/agent/runs/:runId/resume', authenticateToken, async (req, res) => {
    try {
      const runDoc = await getRun(req.user.id, req.params.runId);
      if (!runDoc) return res.status(404).json({ error: 'Run not found.' });
      const thread = await getThread(req.user.id, runDoc.threadId);
      if (!thread) return res.status(404).json({ error: 'Thread not found for run.' });

      const advanced = await executeAgentRun({
        run: {
          ...runDoc.toObject({ getters: false, virtuals: false }),
          runId: String(runDoc._id)
        },
        thread,
        userId: String(req.user.id),
        actor: { actorType: 'user', actorId: String(req.user.id) },
        approveBlockedStep: req.body?.approveBlockedStep === true,
        AgentHandoff,
        AgentStructureProposal,
        Folder,
        Article,
        NotebookFolder,
        NotebookEntry,
        buildDefaultHandoffPlan,
        buildDefaultHandoffCheckpoint,
        createThreadForHandoff,
        sanitizeAgentHandoffDoc,
        requestStepApproval: ({ run, step, thread: runThread, actor }) => requestRunStepApproval({
          AgentProtocolApproval,
          userId: String(req.user.id),
          run,
          step,
          thread: runThread,
          actor
        })
      });

      runDoc.status = advanced.status;
      runDoc.lastActor = advanced.lastActor;
      runDoc.currentOpId = advanced.currentOpId;
      runDoc.blockedOpId = advanced.blockedOpId;
      runDoc.steps = advanced.steps;
      runDoc.completedStepCount = advanced.completedStepCount;
      runDoc.startedAt = advanced.startedAt;
      runDoc.pausedAt = advanced.pausedAt;
      runDoc.completedAt = advanced.completedAt;
      await runDoc.save();

      await createProposedChangesForRun({
        AgentProposedChange,
        TagMeta,
        NotebookEntry,
        userId: String(req.user.id),
        thread,
        run: {
          ...advanced,
          runId: String(runDoc._id)
        },
        actor: { actorType: 'user', actorId: String(req.user.id) }
      });
      const reconciledRun = await reconcileAgentRunState({
        AgentRun,
        AgentProposedChange,
        userId: String(req.user.id),
        runId: String(runDoc._id)
      });

      applyProposalBundleRunOutcome({
        thread,
        run: {
          ...(reconciledRun?.toObject ? reconciledRun.toObject({ getters: false, virtuals: false }) : reconciledRun || advanced),
          runId: String(runDoc._id)
        }
      });
      await thread.save();
      trackRunLifecycleEvents({
        trackEvent,
        EVENT_NAMES,
        userId: String(req.user.id),
        requestId: req.requestId,
        threadId: String(thread?._id || ''),
        run: reconciledRun || runDoc,
        source: 'run_route_resume',
        includeStarted: false
      });

      return res.status(200).json({
        run: sanitizeAgentRunDoc(reconciledRun || runDoc),
        thread: sanitizeAgentThreadDoc(thread)
      });
    } catch (error) {
      console.error('❌ Error resuming agent run:', error);
      return res.status(500).json({ error: 'Failed to resume agent run.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentRunRouter
};
