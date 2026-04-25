const express = require('express');

const buildAgentHarnessMetricsRouter = ({
  authenticateToken,
  AgentThread,
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  AgentArtifactDraft,
  AgentProtocolApproval,
  getAgentHarnessMetricsSnapshot,
  getAgentHarnessRunHistorySnapshot,
  getAgentOutcomeTelemetrySnapshot
}) => {
  const router = express.Router();

  const clean = (value) => String(value || '').trim();

  router.get('/api/agent/harness-metrics', authenticateToken, async (req, res) => {
    try {
      const metrics = await getAgentHarnessMetricsSnapshot({
        userId: String(req.user.id),
        threadId: clean(req.query.threadId),
        AgentThread,
        AgentRun,
        AgentProposedChange,
        AgentStructureProposal,
        AgentArtifactDraft,
        AgentProtocolApproval
      });
      const runHistory = typeof getAgentHarnessRunHistorySnapshot === 'function'
        ? await getAgentHarnessRunHistorySnapshot({
            mode: clean(req.query.mode || 'all'),
            limit: req.query.limit || 20
          })
        : null;
      const outcomeTelemetry = typeof getAgentOutcomeTelemetrySnapshot === 'function'
        ? await getAgentOutcomeTelemetrySnapshot({
            userId: String(req.user.id),
            threadId: clean(req.query.threadId),
            runHistory,
            AgentRun,
            AgentProposedChange,
            AgentStructureProposal,
            AgentArtifactDraft
          })
        : null;
      const metricsWithRunHistory = metrics && typeof metrics === 'object'
        ? { ...metrics, runHistory, outcomeTelemetry }
        : metrics;
      return res.status(200).json({ metrics: metricsWithRunHistory, runHistory, outcomeTelemetry });
    } catch (error) {
      console.error('❌ Error loading agent harness metrics:', error);
      return res.status(500).json({ error: 'Failed to load agent harness metrics.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentHarnessMetricsRouter
};
