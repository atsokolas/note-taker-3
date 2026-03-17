const express = require('express');

const buildAgentChatRouter = ({
  authenticateToken,
  authenticatePersonalAgentKey,
  getUserAgentEntitlements,
  generateCollaborativeReply,
  normalizePersonalAgentCapabilities
}) => {
  const router = express.Router();

  router.post('/api/agent/chat', authenticateToken, async (req, res) => {
    try {
      const entitlements = await getUserAgentEntitlements(String(req.user.id));
      const result = await generateCollaborativeReply({
        userId: String(req.user.id),
        message: req.body?.message,
        context: req.body?.context,
        limit: req.body?.limit,
        premiumWebResearchAvailable: entitlements.premiumWebResearchAvailable
      });
      return res.status(200).json({
        ...result,
        entitlements
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid agent chat request.' });
      }
      console.error('❌ Error generating collaborative agent reply:', error);
      return res.status(500).json({ error: 'Failed to generate agent reply.' });
    }
  });

  router.get('/api/agent/byo/session', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const entitlements = await getUserAgentEntitlements(String(req.personalAgent.userId));
      return res.status(200).json({
        agent: {
          id: String(req.personalAgent?.id || ''),
          name: String(req.personalAgent?.name || ''),
          capabilities: normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {})
        },
        mode: 'internal_only',
        premiumWebResearchAvailable: Boolean(entitlements.premiumWebResearchAvailable),
        entitlements
      });
    } catch (error) {
      console.error('❌ Error loading BYO agent session:', error);
      return res.status(500).json({ error: 'Failed to load BYO agent session.' });
    }
  });

  router.post('/api/agent/byo/chat', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {});
      if (!capabilities.read || !capabilities.search) {
        return res.status(403).json({ error: 'This personal agent cannot read/search private workspace content.' });
      }
      const entitlements = await getUserAgentEntitlements(String(req.personalAgent.userId));

      const result = await generateCollaborativeReply({
        userId: String(req.personalAgent.userId),
        message: req.body?.message,
        context: req.body?.context,
        limit: req.body?.limit,
        premiumWebResearchAvailable: entitlements.premiumWebResearchAvailable
      });

      return res.status(200).json({
        ...result,
        entitlements,
        actor: {
          actorType: 'byo_agent',
          actorId: String(req.personalAgent.id || ''),
          actorName: String(req.personalAgent.name || '')
        }
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid BYO agent chat request.' });
      }
      console.error('❌ Error generating BYO collaborative agent reply:', error);
      return res.status(500).json({ error: 'Failed to generate BYO agent reply.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentChatRouter
};
