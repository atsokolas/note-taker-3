const express = require('express');

const buildAgentHarnessMetricsRouter = ({
  authenticateToken,
  AgentThread,
  AgentRun,
  AgentProposedChange,
  AgentArtifactDraft,
  AgentProtocolApproval,
  getAgentHarnessMetricsSnapshot
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
        AgentArtifactDraft,
        AgentProtocolApproval
      });
      return res.status(200).json({ metrics });
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
