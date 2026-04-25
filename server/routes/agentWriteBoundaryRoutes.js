const express = require('express');

const buildAgentWriteBoundaryRouter = ({
  authenticateToken,
  WorkingMemoryItem,
  AgentStructureProposal,
  getAgentWriteBoundarySummary
}) => {
  const router = express.Router();

  const clean = (value) => String(value || '').trim();

  router.get('/api/agent/write-boundary', authenticateToken, async (req, res) => {
    try {
      const summary = await getAgentWriteBoundarySummary({
        WorkingMemoryItem,
        AgentStructureProposal,
        userId: String(req.user.id),
        threadId: clean(req.query.threadId),
        workspaceType: clean(req.query.workspaceType),
        workspaceId: clean(req.query.workspaceId),
        limit: req.query.limit || 5
      });
      return res.status(200).json({ summary, writeBoundary: summary });
    } catch (error) {
      console.error('❌ Error loading agent write boundary summary:', error);
      return res.status(500).json({ error: 'Failed to load agent write boundary summary.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentWriteBoundaryRouter
};
