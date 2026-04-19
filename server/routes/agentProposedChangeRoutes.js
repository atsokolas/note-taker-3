const express = require('express');
const { trackHarnessEvent } = require('../services/agentHarnessEvents');

const buildAgentProposedChangeRouter = ({
  authenticateToken,
  AgentRun,
  AgentProposedChange,
  TagMeta,
  NotebookEntry,
  updateProposedChangeDraft,
  acceptProposedChange,
  rejectProposedChange,
  rollbackProposedChange,
  reconcileAgentRunState,
  sanitizeAgentProposedChangeDoc,
  trackEvent,
  EVENT_NAMES
}) => {
  const router = express.Router();

  const clean = (value) => String(value || '').trim();

  router.get('/api/agent/proposed-changes', authenticateToken, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const threadId = clean(req.query.threadId);
      const runId = clean(req.query.runId);
      const status = clean(req.query.status).toLowerCase();
      const targetType = clean(req.query.targetType).toLowerCase();
      const targetId = clean(req.query.targetId);
      const limitRaw = Number(req.query.limit || 40);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 40;

      if (threadId) query.sourceThreadId = threadId;
      if (runId) query.sourceRunId = runId;
      if (status && status !== 'all') query.status = status;
      if (['concept', 'notebook'].includes(targetType)) query.targetType = targetType;
      if (targetId) query.targetId = targetId;

      const rows = await AgentProposedChange.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
      return res.status(200).json({ proposedChanges: rows.map(sanitizeAgentProposedChangeDoc) });
    } catch (error) {
      console.error('❌ Error listing agent proposed changes:', error);
      return res.status(500).json({ error: 'Failed to list agent proposed changes.' });
    }
  });

  router.patch('/api/agent/proposed-changes/:proposedChangeId', authenticateToken, async (req, res) => {
    try {
      const updated = await updateProposedChangeDraft({
        AgentProposedChange,
        userId: String(req.user.id),
        proposedChangeId: req.params.proposedChangeId,
        updates: req.body || {}
      });
      return res.status(200).json({ proposedChange: sanitizeAgentProposedChangeDoc(updated) });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid proposed change update.' });
      }
      console.error('❌ Error updating agent proposed change:', error);
      return res.status(500).json({ error: 'Failed to update agent proposed change.' });
    }
  });

  router.post('/api/agent/proposed-changes/:proposedChangeId/accept', authenticateToken, async (req, res) => {
    try {
      const accepted = await acceptProposedChange({
        AgentProposedChange,
        TagMeta,
        NotebookEntry,
        userId: String(req.user.id),
        proposedChangeId: req.params.proposedChangeId,
        actor: {
          actorType: 'user',
          actorId: String(req.user.id)
        }
      });
      if (accepted?.sourceRunId) {
        await reconcileAgentRunState({
          AgentRun,
          AgentProposedChange,
          userId: String(req.user.id),
          runId: String(accepted.sourceRunId)
        });
      }
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES?.AGENT_PROPOSED_CHANGE_ACCEPTED,
        userId: String(req.user.id),
        requestId: req.requestId,
        properties: {
          threadId: clean(accepted?.sourceThreadId),
          runId: clean(accepted?.sourceRunId),
          proposedChangeId: clean(accepted?._id),
          targetType: clean(accepted?.targetType),
          targetId: clean(accepted?.targetId)
        }
      });
      return res.status(200).json({ proposedChange: sanitizeAgentProposedChangeDoc(accepted) });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid proposed change acceptance.' });
      }
      console.error('❌ Error accepting agent proposed change:', error);
      return res.status(500).json({ error: 'Failed to accept agent proposed change.' });
    }
  });

  router.post('/api/agent/proposed-changes/:proposedChangeId/reject', authenticateToken, async (req, res) => {
    try {
      const rejected = await rejectProposedChange({
        AgentProposedChange,
        userId: String(req.user.id),
        proposedChangeId: req.params.proposedChangeId,
        actor: {
          actorType: 'user',
          actorId: String(req.user.id)
        }
      });
      if (rejected?.sourceRunId) {
        await reconcileAgentRunState({
          AgentRun,
          AgentProposedChange,
          userId: String(req.user.id),
          runId: String(rejected.sourceRunId)
        });
      }
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES?.AGENT_PROPOSED_CHANGE_REJECTED,
        userId: String(req.user.id),
        requestId: req.requestId,
        properties: {
          threadId: clean(rejected?.sourceThreadId),
          runId: clean(rejected?.sourceRunId),
          proposedChangeId: clean(rejected?._id),
          targetType: clean(rejected?.targetType),
          targetId: clean(rejected?.targetId)
        }
      });
      return res.status(200).json({ proposedChange: sanitizeAgentProposedChangeDoc(rejected) });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid proposed change rejection.' });
      }
      console.error('❌ Error rejecting agent proposed change:', error);
      return res.status(500).json({ error: 'Failed to reject agent proposed change.' });
    }
  });

  router.post('/api/agent/proposed-changes/:proposedChangeId/rollback', authenticateToken, async (req, res) => {
    try {
      const rolledBack = await rollbackProposedChange({
        AgentProposedChange,
        TagMeta,
        NotebookEntry,
        userId: String(req.user.id),
        proposedChangeId: req.params.proposedChangeId,
        actor: {
          actorType: 'user',
          actorId: String(req.user.id)
        }
      });
      if (rolledBack?.sourceRunId) {
        await reconcileAgentRunState({
          AgentRun,
          AgentProposedChange,
          userId: String(req.user.id),
          runId: String(rolledBack.sourceRunId)
        });
      }
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES?.AGENT_PROPOSED_CHANGE_ROLLED_BACK,
        userId: String(req.user.id),
        requestId: req.requestId,
        properties: {
          threadId: clean(rolledBack?.sourceThreadId),
          runId: clean(rolledBack?.sourceRunId),
          proposedChangeId: clean(rolledBack?._id),
          targetType: clean(rolledBack?.targetType),
          targetId: clean(rolledBack?.targetId)
        }
      });
      return res.status(200).json({ proposedChange: sanitizeAgentProposedChangeDoc(rolledBack) });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid proposed change rollback.' });
      }
      console.error('❌ Error rolling back agent proposed change:', error);
      return res.status(500).json({ error: 'Failed to roll back agent proposed change.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentProposedChangeRouter
};
