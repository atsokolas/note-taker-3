const crypto = require('crypto');
const express = require('express');

const CONNECT_SESSION_TTL_MS = 15 * 60 * 1000;
const CONNECT_POLL_INTERVAL_SEC = 2;
const SUPPORTED_RUNTIMES = new Set([
  'agent',
  'claude-code',
  'codex',
  'hermes',
  'openclaw',
  'opencode'
]);

const hashPollSecret = (value) => (
  crypto.createHash('sha256').update(String(value || '')).digest('hex')
);

const createOpaqueId = (prefix, bytes = 18) => (
  `${prefix}_${crypto.randomBytes(bytes).toString('base64url')}`
);

const createDeviceCode = () => {
  const raw = crypto.randomBytes(5).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const padded = `${raw}ABCDEFGH`.slice(0, 8);
  return `${padded.slice(0, 4)}-${padded.slice(4)}`;
};

const normalizeRuntime = (value = '') => {
  const runtime = String(value || '').trim().toLowerCase();
  return SUPPORTED_RUNTIMES.has(runtime) ? runtime : 'agent';
};

const runtimeLabel = (runtime = 'agent') => {
  const labels = {
    agent: 'Noeis agent',
    'claude-code': 'Claude Code',
    codex: 'Codex',
    hermes: 'Hermes',
    openclaw: 'OpenClaw',
    opencode: 'OpenCode'
  };
  return labels[runtime] || labels.agent;
};

const sanitizeSession = (row = {}) => {
  const session = typeof row.toObject === 'function' ? row.toObject() : row;
  return {
    sessionId: session.sessionId || '',
    deviceCode: session.deviceCode || '',
    runtime: session.runtime || 'agent',
    runtimeLabel: runtimeLabel(session.runtime),
    label: session.label || runtimeLabel(session.runtime),
    scopes: session.scopes || ['read', 'agent-write'],
    status: session.status || 'pending',
    expiresAt: session.expiresAt || null,
    approvedAt: session.approvedAt || null
  };
};

const isExpired = (session, now = new Date()) => (
  !session || new Date(session.expiresAt || 0).getTime() <= now.getTime()
);

const markExpiredIfNeeded = async (session, now = new Date()) => {
  if (!session) return null;
  if (session.status === 'pending' && isExpired(session, now)) {
    session.status = 'expired';
    if (typeof session.save === 'function') await session.save();
  }
  return session;
};

const buildAuthorizeUrl = ({ appUrl, sessionId, pollSecret }) => {
  const url = new URL('/settings/connected-agents/authorize', appUrl);
  url.searchParams.set('session', sessionId);
  url.searchParams.set('secret', pollSecret);
  return url.toString();
};

const buildAgentConnectRouter = ({
  authenticateToken,
  AgentConnectSession,
  AgentToken,
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken,
  defaultAppUrl = process.env.NOEIS_APP_URL || process.env.FRONTEND_URL || 'https://www.noeis.io',
  now = () => new Date()
}) => {
  const router = express.Router();

  router.post('/api/agent-connect/sessions', async (req, res) => {
    try {
      const runtime = normalizeRuntime(req.body?.runtime);
      const label = String(req.body?.label || runtimeLabel(runtime)).trim().slice(0, 100);
      const scopes = normalizeAgentTokenScopes(req.body?.scopes || ['read', 'agent-write']);
      const sessionId = createOpaqueId('nac');
      const pollSecret = createOpaqueId('poll', 24);
      const expiresAt = new Date(now().getTime() + CONNECT_SESSION_TTL_MS);
      const requestedAppUrl = String(req.body?.appUrl || defaultAppUrl || 'https://www.noeis.io').replace(/\/+$/g, '');
      const requestedApiUrl = String(req.body?.apiUrl || '').trim().replace(/\/+$/g, '');

      const created = await AgentConnectSession.create({
        sessionId,
        pollSecretHash: hashPollSecret(pollSecret),
        deviceCode: createDeviceCode(),
        runtime,
        label,
        scopes,
        requestedApiUrl,
        requestedAppUrl,
        status: 'pending',
        expiresAt
      });

      res.status(201).json({
        session: sanitizeSession(created),
        pollSecret,
        authorizeUrl: buildAuthorizeUrl({ appUrl: requestedAppUrl, sessionId, pollSecret }),
        pollIntervalSec: CONNECT_POLL_INTERVAL_SEC
      });
    } catch (error) {
      console.error('❌ Error creating agent connect session:', error);
      res.status(500).json({ error: 'Failed to start agent connection.' });
    }
  });

  router.get('/api/agent-connect/sessions/:sessionId/approval', async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      const session = await markExpiredIfNeeded(await AgentConnectSession.findOne({ sessionId }), now());
      if (!session) return res.status(404).json({ error: 'Connection session not found.' });
      res.status(200).json({ session: sanitizeSession(session) });
    } catch (error) {
      console.error('❌ Error loading agent connect session:', error);
      res.status(500).json({ error: 'Failed to load agent connection.' });
    }
  });

  router.post('/api/agent-connect/sessions/:sessionId/approve', authenticateToken, async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      const pollSecret = String(req.body?.pollSecret || '').trim();
      const session = await markExpiredIfNeeded(await AgentConnectSession.findOne({ sessionId }), now());
      if (!session) return res.status(404).json({ error: 'Connection session not found.' });
      if (session.status !== 'pending') {
        return res.status(409).json({ error: `Connection session is ${session.status}.`, session: sanitizeSession(session) });
      }
      if (!pollSecret || session.pollSecretHash !== hashPollSecret(pollSecret)) {
        return res.status(403).json({ error: 'Connection session secret is invalid.' });
      }

      const secret = createAgentTokenSecret();
      const token = await AgentToken.create({
        userId: req.user.id,
        label: String(session.label || runtimeLabel(session.runtime)).slice(0, 100),
        hashedSecret: hashAgentTokenSecret(secret),
        secretPrefix: `${secret.slice(0, 12)}...`,
        scopes: normalizeAgentTokenScopes(session.scopes || ['read', 'agent-write']),
        dailyQuota: null,
        callsToday: 0,
        quotaWindowStartedAt: new Date(Date.UTC(
          now().getUTCFullYear(),
          now().getUTCMonth(),
          now().getUTCDate()
        )),
        expiresAt: null,
        status: 'active'
      });

      session.status = 'approved';
      session.tokenId = token._id;
      session.tokenSecret = secret;
      session.approvedUserId = req.user.id;
      session.approvedAt = now();
      await session.save();

      res.status(200).json({ session: sanitizeSession(session), token: sanitizeAgentToken(token) });
    } catch (error) {
      console.error('❌ Error approving agent connect session:', error);
      res.status(500).json({ error: 'Failed to approve agent connection.' });
    }
  });

  router.post('/api/agent-connect/sessions/:sessionId/poll', async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      const pollSecret = String(req.body?.pollSecret || '').trim();
      const session = await markExpiredIfNeeded(await AgentConnectSession.findOne({ sessionId }), now());
      if (!session) return res.status(404).json({ error: 'Connection session not found.' });
      if (!pollSecret || session.pollSecretHash !== hashPollSecret(pollSecret)) {
        return res.status(403).json({ error: 'Connection session secret is invalid.' });
      }
      const payload = {
        session: sanitizeSession(session),
        pollIntervalSec: CONNECT_POLL_INTERVAL_SEC
      };
      if (session.status === 'approved') {
        session.deliveredAt = session.deliveredAt || now();
        if (typeof session.save === 'function') await session.save();
        payload.secret = session.tokenSecret;
        payload.tokenId = session.tokenId ? String(session.tokenId) : '';
      }
      res.status(200).json(payload);
    } catch (error) {
      console.error('❌ Error polling agent connect session:', error);
      res.status(500).json({ error: 'Failed to poll agent connection.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentConnectRouter,
  hashPollSecret,
  normalizeRuntime,
  runtimeLabel
};
