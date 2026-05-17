const express = require('express');

const buildAgentTokenRouter = ({
  mongoose,
  authenticateToken,
  AgentToken,
  ConnectorActionLog = null,
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken
}) => {
  const router = express.Router();

  const parseExpiry = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const serializeActionLog = (row = {}) => {
    const action = row?.toObject ? row.toObject() : row;
    const targetId = action.targetId ? String(action.targetId) : '';
    const targetType = action.targetType || '';
    return {
      id: action._id ? String(action._id) : action.id || '',
      connector: action.connector || '',
      action: action.action || '',
      direction: action.direction || '',
      status: action.status || '',
      resultStatus: action.resultStatus || action.metadata?.resultStatus || '',
      actorType: action.actorType || 'user',
      agentTokenId: action.agentTokenId ? String(action.agentTokenId) : '',
      agentTokenLabel: action.agentTokenLabel || '',
      tool: action.metadata?.tool || action.action || '',
      mutating: action.direction === 'write',
      route: action.route || '',
      method: action.method || '',
      statusCode: action.statusCode || null,
      durationMs: action.durationMs || null,
      targetType,
      targetId,
      beforeRef: action.beforeRef || '',
      targetHref: targetType === 'wiki_page' && targetId ? `/wiki/${targetId}` : '',
      summary: action.summary || '',
      errorMessage: action.errorMessage || '',
      metadata: action.metadata || {},
      canUndo: Boolean(action.metadata?.undoPath),
      undoPath: action.metadata?.undoPath || '',
      createdAt: action.createdAt || null,
      updatedAt: action.updatedAt || null
    };
  };

  const actionCounts = (actions = []) => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    return actions.reduce((counts, action) => {
      const createdAt = new Date(action.createdAt || 0).getTime();
      if (!Number.isNaN(createdAt) && createdAt >= dayAgo) counts.today += 1;
      if (!Number.isNaN(createdAt) && createdAt >= weekAgo) counts.week += 1;
      return counts;
    }, { today: 0, week: 0 });
  };

  router.get('/api/agent-tokens', authenticateToken, async (req, res) => {
    try {
      const rows = await AgentToken.find({ userId: req.user.id })
        .sort({ updatedAt: -1, createdAt: -1 });
      res.status(200).json({ tokens: (rows || []).map(sanitizeAgentToken) });
    } catch (error) {
      console.error('❌ Error listing agent tokens:', error);
      res.status(500).json({ error: 'Failed to list agent tokens.' });
    }
  });

  router.post('/api/agent-tokens', authenticateToken, async (req, res) => {
    try {
      const label = String(req.body?.label || '').trim();
      if (!label) return res.status(400).json({ error: 'label is required.' });

      const dailyQuotaRaw = req.body?.dailyQuota;
      const dailyQuota = dailyQuotaRaw === '' || dailyQuotaRaw === null || dailyQuotaRaw === undefined
        ? null
        : Number(dailyQuotaRaw);
      if (dailyQuota !== null && (!Number.isFinite(dailyQuota) || dailyQuota < 0)) {
        return res.status(400).json({ error: 'dailyQuota must be a non-negative number.' });
      }

      const expiresAt = parseExpiry(req.body?.expiresAt);
      if (expiresAt === undefined) return res.status(400).json({ error: 'expiresAt must be a valid date.' });
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'expiresAt must be in the future.' });
      }

      const secret = createAgentTokenSecret();
      const created = await AgentToken.create({
        userId: req.user.id,
        label: label.slice(0, 100),
        hashedSecret: hashAgentTokenSecret(secret),
        secretPrefix: `${secret.slice(0, 12)}...`,
        scopes: normalizeAgentTokenScopes(req.body?.scopes || []),
        dailyQuota,
        callsToday: 0,
        quotaWindowStartedAt: new Date(Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate()
        )),
        expiresAt,
        status: 'active'
      });

      res.status(201).json({
        token: sanitizeAgentToken(created),
        secret
      });
    } catch (error) {
      console.error('❌ Error creating agent token:', error);
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'Failed to create unique token. Try again.' });
      }
      res.status(500).json({ error: 'Failed to create agent token.' });
    }
  });

  router.get('/api/agent-tokens/:id/actions', authenticateToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid token id.' });
      const token = AgentToken.findOne
        ? await AgentToken.findOne({ _id: id, userId: req.user.id })
        : null;
      if (!token) return res.status(404).json({ error: 'Agent token not found.' });
      if (!ConnectorActionLog?.find) {
        return res.status(200).json({ actions: [], counts: { today: 0, week: 0 } });
      }
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rows = await ConnectorActionLog.find({
        userId: req.user.id,
        agentTokenId: id,
        createdAt: { $gte: since }
      }).sort({ createdAt: -1 }).limit(limit).lean();
      const actions = (Array.isArray(rows) ? rows : []).map(serializeActionLog);
      res.status(200).json({ actions, counts: actionCounts(actions) });
    } catch (error) {
      console.error('❌ Error listing agent token actions:', error);
      res.status(500).json({ error: 'Failed to list agent token actions.' });
    }
  });

  router.post('/api/agent-tokens/:id/revoke', authenticateToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid token id.' });
      const updated = await AgentToken.findOneAndUpdate(
        { _id: id, userId: req.user.id },
        { status: 'revoked', revokedAt: new Date() },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Agent token not found.' });
      res.status(200).json({ token: sanitizeAgentToken(updated) });
    } catch (error) {
      console.error('❌ Error revoking agent token:', error);
      res.status(500).json({ error: 'Failed to revoke agent token.' });
    }
  });

  router.delete('/api/agent-tokens/:id', authenticateToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid token id.' });
      const updated = await AgentToken.findOneAndUpdate(
        { _id: id, userId: req.user.id },
        { status: 'revoked', revokedAt: new Date() },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Agent token not found.' });
      res.status(200).json({ token: sanitizeAgentToken(updated) });
    } catch (error) {
      console.error('❌ Error deleting agent token:', error);
      res.status(500).json({ error: 'Failed to delete agent token.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentTokenRouter
};
