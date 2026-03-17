const express = require('express');

const buildAgentSettingsRouter = ({
  authenticateToken,
  getUserAgentEntitlements,
  normalizeUserAgentProfile,
  User,
  deriveAgentEntitlements,
  getUserAgentProtocolPolicy,
  normalizeAgentProtocolPolicy,
  toStoredAgentProtocolPolicy,
  sanitizeAgentProtocolPolicy
}) => {
  const router = express.Router();

  router.get('/api/agent/entitlements', authenticateToken, async (req, res) => {
    try {
      const entitlements = await getUserAgentEntitlements(String(req.user.id));
      return res.status(200).json({ entitlements });
    } catch (error) {
      console.error('❌ Error loading agent entitlements:', error);
      return res.status(500).json({ error: 'Failed to load agent entitlements.' });
    }
  });

  router.patch('/api/agent/entitlements/dev', authenticateToken, async (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Entitlements dev route is disabled in production.' });
      }
      const profile = normalizeUserAgentProfile(req.body || {});
      const updated = await User.findByIdAndUpdate(
        req.user.id,
        { agentProfile: profile },
        { new: true }
      ).select('agentProfile');
      if (!updated) return res.status(404).json({ error: 'User not found.' });
      const entitlements = deriveAgentEntitlements(updated.agentProfile || {});
      return res.status(200).json({ entitlements });
    } catch (error) {
      console.error('❌ Error updating agent entitlements (dev):', error);
      return res.status(500).json({ error: 'Failed to update agent entitlements.' });
    }
  });

  router.get('/api/agent/protocol/policy', authenticateToken, async (req, res) => {
    try {
      const policy = await getUserAgentProtocolPolicy(String(req.user.id));
      return res.status(200).json({ policy });
    } catch (error) {
      console.error('❌ Error loading agent protocol policy:', error);
      return res.status(500).json({ error: 'Failed to load agent protocol policy.' });
    }
  });

  router.patch('/api/agent/protocol/policy', authenticateToken, async (req, res) => {
    try {
      const normalized = normalizeAgentProtocolPolicy(req.body || {});
      const stored = toStoredAgentProtocolPolicy(normalized);
      const updated = await User.findByIdAndUpdate(
        req.user.id,
        { agentProtocolPolicy: stored },
        { new: true }
      ).select('agentProtocolPolicy');
      if (!updated) return res.status(404).json({ error: 'User not found.' });
      return res.status(200).json({
        policy: sanitizeAgentProtocolPolicy(updated.agentProtocolPolicy || {})
      });
    } catch (error) {
      console.error('❌ Error updating agent protocol policy:', error);
      return res.status(500).json({ error: 'Failed to update agent protocol policy.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentSettingsRouter
};
