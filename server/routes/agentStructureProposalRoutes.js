const express = require('express');
const { trackHarnessEvent } = require('../services/agentHarnessEvents');

const buildAgentStructureProposalRouter = ({
  authenticateToken,
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  NotebookFolder,
  NotebookEntry,
  listStructureProposals,
  updateStructureProposalDraft,
  applyStoredStructureProposal,
  rejectStructureProposal,
  rollbackStoredStructureProposal,
  reconcileAgentRunState,
  sanitizeAgentStructureProposalDoc,
  trackEvent,
  EVENT_NAMES
}) => {
  const router = express.Router();

  const clean = (value) => String(value || '').trim();

  router.get('/api/agent/structure-proposals', authenticateToken, async (req, res) => {
    try {
      const rows = await listStructureProposals({
        AgentStructureProposal,
        userId: String(req.user.id),
        threadId: clean(req.query.threadId),
        runId: clean(req.query.runId),
        status: clean(req.query.status || 'all'),
        scope: clean(req.query.scope),
        scopeRef: clean(req.query.scopeRef),
        limit: req.query.limit
      });
      return res.status(200).json({
        proposals: rows,
        structureProposals: rows
      });
    } catch (error) {
      console.error('❌ Error listing agent structure proposals:', error);
      return res.status(500).json({ error: 'Failed to list agent structure proposals.' });
    }
  });

  router.patch('/api/agent/structure-proposals/:structureProposalId', authenticateToken, async (req, res) => {
    try {
      const updated = await updateStructureProposalDraft({
        AgentStructureProposal,
        userId: String(req.user.id),
        structureProposalId: req.params.structureProposalId,
        updates: req.body || {}
      });
      return res.status(200).json({
        proposal: sanitizeAgentStructureProposalDoc(updated),
        structureProposal: sanitizeAgentStructureProposalDoc(updated)
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid structure proposal update.' });
      }
      console.error('❌ Error updating agent structure proposal:', error);
      return res.status(500).json({ error: 'Failed to update agent structure proposal.' });
    }
  });

  router.post('/api/agent/structure-proposals/:structureProposalId/apply', authenticateToken, async (req, res) => {
    try {
      const applied = await applyStoredStructureProposal({
        AgentStructureProposal,
        NotebookFolder,
        NotebookEntry,
        userId: String(req.user.id),
        structureProposalId: req.params.structureProposalId,
        actor: {
          actorType: 'user',
          actorId: String(req.user.id)
        }
      });
      if (applied?.sourceRunId) {
        await reconcileAgentRunState({
          AgentRun,
          AgentProposedChange,
          AgentStructureProposal,
          userId: String(req.user.id),
          runId: String(applied.sourceRunId)
        });
      }
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES?.AGENT_STRUCTURE_PLAN_APPLIED,
        userId: String(req.user.id),
        requestId: req.requestId,
        properties: {
          threadId: clean(applied?.sourceThreadId),
          runId: clean(applied?.sourceRunId),
          structureProposalId: clean(applied?._id || applied?.structureProposalId),
          scope: clean(applied?.scope),
          scopeRef: clean(applied?.scopeRef)
        }
      });
      return res.status(200).json({
        proposal: sanitizeAgentStructureProposalDoc(applied),
        structureProposal: sanitizeAgentStructureProposalDoc(applied)
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid structure proposal apply request.' });
      }
      console.error('❌ Error applying agent structure proposal:', error);
      return res.status(500).json({ error: 'Failed to apply agent structure proposal.' });
    }
  });

  router.post('/api/agent/structure-proposals/:structureProposalId/reject', authenticateToken, async (req, res) => {
    try {
      const rejected = await rejectStructureProposal({
        AgentStructureProposal,
        userId: String(req.user.id),
        structureProposalId: req.params.structureProposalId,
        actor: {
          actorType: 'user',
          actorId: String(req.user.id)
        }
      });
      if (rejected?.sourceRunId) {
        await reconcileAgentRunState({
          AgentRun,
          AgentProposedChange,
          AgentStructureProposal,
          userId: String(req.user.id),
          runId: String(rejected.sourceRunId)
        });
      }
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES?.AGENT_STRUCTURE_PLAN_REJECTED,
        userId: String(req.user.id),
        requestId: req.requestId,
        properties: {
          threadId: clean(rejected?.sourceThreadId),
          runId: clean(rejected?.sourceRunId),
          structureProposalId: clean(rejected?._id || rejected?.structureProposalId),
          scope: clean(rejected?.scope),
          scopeRef: clean(rejected?.scopeRef)
        }
      });
      return res.status(200).json({
        proposal: sanitizeAgentStructureProposalDoc(rejected),
        structureProposal: sanitizeAgentStructureProposalDoc(rejected)
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid structure proposal rejection.' });
      }
      console.error('❌ Error rejecting agent structure proposal:', error);
      return res.status(500).json({ error: 'Failed to reject agent structure proposal.' });
    }
  });

  router.post('/api/agent/structure-proposals/:structureProposalId/rollback', authenticateToken, async (req, res) => {
    try {
      const rolledBack = await rollbackStoredStructureProposal({
        AgentStructureProposal,
        NotebookFolder,
        NotebookEntry,
        userId: String(req.user.id),
        structureProposalId: req.params.structureProposalId,
        actor: {
          actorType: 'user',
          actorId: String(req.user.id)
        }
      });
      if (rolledBack?.sourceRunId) {
        await reconcileAgentRunState({
          AgentRun,
          AgentProposedChange,
          AgentStructureProposal,
          userId: String(req.user.id),
          runId: String(rolledBack.sourceRunId)
        });
      }
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES?.AGENT_STRUCTURE_PLAN_ROLLED_BACK,
        userId: String(req.user.id),
        requestId: req.requestId,
        properties: {
          threadId: clean(rolledBack?.sourceThreadId),
          runId: clean(rolledBack?.sourceRunId),
          structureProposalId: clean(rolledBack?._id || rolledBack?.structureProposalId),
          scope: clean(rolledBack?.scope),
          scopeRef: clean(rolledBack?.scopeRef)
        }
      });
      return res.status(200).json({
        proposal: sanitizeAgentStructureProposalDoc(rolledBack),
        structureProposal: sanitizeAgentStructureProposalDoc(rolledBack)
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid structure proposal rollback.' });
      }
      console.error('❌ Error rolling back agent structure proposal:', error);
      return res.status(500).json({ error: 'Failed to roll back agent structure proposal.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentStructureProposalRouter
};
