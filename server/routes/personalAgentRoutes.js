const express = require('express');

const buildPersonalAgentRouter = ({
  mongoose,
  authenticateToken,
  PersonalAgent,
  sanitizePersonalAgent,
  normalizePersonalAgentCapabilities,
  createPersonalAgentApiKey,
  hashPersonalAgentApiKey,
  normalizePersonalAgentStatus
}) => {
  const router = express.Router();

  router.get('/api/agents/personal', authenticateToken, async (req, res) => {
    try {
      const rows = await PersonalAgent.find({ userId: req.user.id })
        .sort({ updatedAt: -1, createdAt: -1 });
      res.status(200).json((rows || []).map(sanitizePersonalAgent));
    } catch (error) {
      console.error('❌ Error listing personal agents:', error);
      res.status(500).json({ error: 'Failed to list personal agents.' });
    }
  });

  router.post('/api/agents/personal', authenticateToken, async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required.' });

      const description = String(req.body?.description || '').trim();
      const capabilities = normalizePersonalAgentCapabilities(req.body?.capabilities || {});
      const apiKey = createPersonalAgentApiKey();
      const apiKeyHash = hashPersonalAgentApiKey(apiKey);
      const apiKeyPrefix = `${apiKey.slice(0, 10)}...`;

      const created = await PersonalAgent.create({
        name: name.slice(0, 80),
        description: description.slice(0, 600),
        status: 'active',
        capabilities,
        apiKeyHash,
        apiKeyPrefix,
        userId: req.user.id
      });

      res.status(201).json({
        agent: sanitizePersonalAgent(created),
        apiKey
      });
    } catch (error) {
      console.error('❌ Error creating personal agent:', error);
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'Failed to create unique API key. Try again.' });
      }
      res.status(500).json({ error: 'Failed to create personal agent.' });
    }
  });

  router.patch('/api/agents/personal/:id', authenticateToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid agent id.' });

      const updates = {};
      if (req.body?.name !== undefined) {
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name cannot be empty.' });
        updates.name = name.slice(0, 80);
      }
      if (req.body?.description !== undefined) {
        updates.description = String(req.body.description || '').trim().slice(0, 600);
      }
      if (req.body?.status !== undefined) {
        updates.status = normalizePersonalAgentStatus(req.body.status, '');
        if (!updates.status) return res.status(400).json({ error: 'status must be active or disabled.' });
      }
      if (req.body?.capabilities !== undefined) {
        updates.capabilities = normalizePersonalAgentCapabilities(req.body.capabilities);
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No updates provided.' });
      }

      const updated = await PersonalAgent.findOneAndUpdate(
        { _id: id, userId: req.user.id },
        updates,
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Personal agent not found.' });
      res.status(200).json({ agent: sanitizePersonalAgent(updated) });
    } catch (error) {
      console.error('❌ Error updating personal agent:', error);
      res.status(500).json({ error: 'Failed to update personal agent.' });
    }
  });

  router.post('/api/agents/personal/:id/rotate-key', authenticateToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid agent id.' });
      const apiKey = createPersonalAgentApiKey();
      const apiKeyHash = hashPersonalAgentApiKey(apiKey);
      const apiKeyPrefix = `${apiKey.slice(0, 10)}...`;

      const updated = await PersonalAgent.findOneAndUpdate(
        { _id: id, userId: req.user.id },
        {
          apiKeyHash,
          apiKeyPrefix
        },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Personal agent not found.' });
      res.status(200).json({
        agent: sanitizePersonalAgent(updated),
        apiKey
      });
    } catch (error) {
      console.error('❌ Error rotating personal agent key:', error);
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'Failed to rotate API key. Try again.' });
      }
      res.status(500).json({ error: 'Failed to rotate personal agent key.' });
    }
  });

  router.delete('/api/agents/personal/:id', authenticateToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid agent id.' });
      const updated = await PersonalAgent.findOneAndUpdate(
        { _id: id, userId: req.user.id },
        { status: 'disabled' },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Personal agent not found.' });
      res.status(200).json({ agent: sanitizePersonalAgent(updated) });
    } catch (error) {
      console.error('❌ Error disabling personal agent:', error);
      res.status(500).json({ error: 'Failed to disable personal agent.' });
    }
  });

  return router;
};

module.exports = {
  buildPersonalAgentRouter
};
