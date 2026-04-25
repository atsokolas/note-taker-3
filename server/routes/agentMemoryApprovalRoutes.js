const express = require('express');

const buildAgentMemoryApprovalRouter = ({
  authenticateToken,
  AgentProtocolApproval,
  createMemoryCommitApproval
}) => {
  const router = express.Router();

  const clean = (value) => String(value || '').trim();

  router.post('/api/agent/memory-approvals', authenticateToken, async (req, res) => {
    try {
      const result = await createMemoryCommitApproval({
        AgentProtocolApproval,
        userId: String(req.user.id),
        threadId: clean(req.body?.threadId),
        workspaceType: clean(req.body?.workspaceType || 'workspace'),
        workspaceId: clean(req.body?.workspaceId),
        updates: Array.isArray(req.body?.updates) ? req.body.updates : [],
        sourceIdPrefix: clean(req.body?.sourceIdPrefix),
        reason: clean(req.body?.reason) || 'Memory steward updates require approval before committing to working memory.',
        requestedBy: {
          actorType: clean(req.body?.requestedBy?.actorType || req.body?.actorType || 'native_agent'),
          actorId: clean(req.body?.requestedBy?.actorId || req.body?.actorId || 'memory_steward')
        }
      });
      return res.status(202).json({
        approval: result.approval,
        payload: result.payload,
        preview: result.preview
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid memory approval request.' });
      }
      console.error('❌ Error creating memory approval:', error);
      return res.status(500).json({ error: 'Failed to create memory approval.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentMemoryApprovalRouter
};
