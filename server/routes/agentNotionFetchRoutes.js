const express = require('express');

/**
 * agentNotionFetchRoutes — exposes the user-triggered Notion fetch tool.
 *
 * Single endpoint: POST /api/agent/tools/notion-fetch
 *   Body: { connectionId?, limit? }
 *   Returns the structured summary produced by fetchNotionPagesForAgent.
 *
 * Authenticated as the user. The agent runtime can later call this with the
 * same auth context once the chat-mediated invocation lands; for the MVP
 * the FE invokes it directly from a "Let agent fetch" button on the Data
 * Integrations page.
 */
const buildAgentNotionFetchRouter = ({
  authenticateToken,
  fetchNotionPagesForAgent,
  notionClient,
  notionTransform,
  IntegrationConnection,
  NotebookEntry,
  decryptSecret
}) => {
  const router = express.Router();

  router.post('/api/agent/tools/notion-fetch', authenticateToken, async (req, res) => {
    try {
      const { connectionId, limit } = req.body || {};
      const result = await fetchNotionPagesForAgent({
        userId: req.user.id,
        options: { connectionId, limit },
        deps: {
          notionClient,
          notionTransform,
          IntegrationConnection,
          NotebookEntry,
          decryptSecret
        }
      });
      // Map non-success statuses to appropriate HTTP codes for the client.
      if (result.status === 'no_connection') return res.status(412).json(result);
      if (result.status === 'token_invalid') return res.status(401).json(result);
      if (result.status === 'search_failed') return res.status(502).json(result);
      return res.status(200).json(result);
    } catch (error) {
      console.error('❌ Error in agent Notion fetch:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Failed to fetch from Notion.',
        message: error?.message || ''
      });
    }
  });

  return router;
};

module.exports = { buildAgentNotionFetchRouter };
