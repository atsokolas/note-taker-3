const crypto = require('crypto');
const express = require('express');
const { normalizeRuntime, runtimeLabel } = require('../services/agentRuntime');

const CONNECT_SESSION_TTL_MS = 15 * 60 * 1000;
const CONNECT_POLL_INTERVAL_SEC = 2;
const { AGENT_TOKEN_SCOPE_SET } = require('../services/agentTokenService');

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

const sanitizeSession = (row = {}) => {
  const session = typeof row.toObject === 'function' ? row.toObject() : row;
  return {
    sessionId: session.sessionId || '',
    runtime: session.runtime || 'agent',
    runtimeLabel: runtimeLabel(session.runtime),
    label: session.label || runtimeLabel(session.runtime),
    scopes: session.scopes || ['read', 'agent-write'],
    requestedApiUrl: session.requestedApiUrl || '',
    requestedAppUrl: session.requestedAppUrl || '',
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

const buildAuthorizeUrl = ({ appUrl, sessionId }) => {
  const url = new URL('/settings/connected-agents/authorize', appUrl);
  url.searchParams.set('session', sessionId);
  return url.toString();
};

const normalizeRequestedScopes = (value, normalizeAgentTokenScopes) => {
  const requested = (Array.isArray(value) ? value : value ? [value] : ['read'])
    .map(scope => String(scope || '').trim())
    .filter(Boolean);
  const unsupported = requested.filter(scope => !AGENT_TOKEN_SCOPE_SET.has(scope));
  if (unsupported.length > 0) {
    const error = new Error(`Unsupported scope: ${unsupported.join(', ')}.`);
    error.status = 400;
    throw error;
  }
  return normalizeAgentTokenScopes(requested);
};

const normalizeApprovalAppUrl = (value, defaultAppUrl) => {
  let requested;
  let configured;
  try {
    requested = new URL(String(value || defaultAppUrl));
    configured = new URL(String(defaultAppUrl));
  } catch (_error) {
    const error = new Error('Approval origin is invalid.');
    error.status = 400;
    throw error;
  }
  const local = ['localhost', '127.0.0.1'].includes(requested.hostname);
  const secure = requested.protocol === 'https:' || (local && requested.protocol === 'http:');
  if (!secure || (!local && requested.origin !== configured.origin)) {
    const error = new Error('Approval origin is not allowed.');
    error.status = 400;
    throw error;
  }
  return requested.origin;
};

const buildAgentConnectRouter = ({
  authenticateToken,
  AgentConnectSession,
  AgentToken,
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  defaultAppUrl = process.env.NOEIS_APP_URL || process.env.FRONTEND_URL || 'https://www.noeis.io',
  now = () => new Date()
}) => {
  const router = express.Router();

  router.post('/api/agent-connect/sessions', async (req, res) => {
    try {
      const runtime = normalizeRuntime(req.body?.runtime);
      const label = String(req.body?.label || runtimeLabel(runtime)).trim().slice(0, 100);
      const scopes = normalizeRequestedScopes(req.body?.scopes, normalizeAgentTokenScopes);
      const sessionId = createOpaqueId('nac');
      const pollSecret = createOpaqueId('poll', 24);
      const expiresAt = new Date(now().getTime() + CONNECT_SESSION_TTL_MS);
      const requestedAppUrl = normalizeApprovalAppUrl(
        req.body?.appUrl,
        defaultAppUrl || 'https://www.noeis.io'
      );
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
        // The code is the agent's to show; the approval page asks you to type it.
        session: { ...sanitizeSession(created), deviceCode: created.deviceCode },
        pollSecret,
        authorizeUrl: buildAuthorizeUrl({ appUrl: requestedAppUrl, sessionId }),
        pollIntervalSec: CONNECT_POLL_INTERVAL_SEC
      });
    } catch (error) {
      if (error?.status === 400) {
        return res.status(400).json({ error: error.message });
      }
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

  /* Approving is one atomic step on a pending request whose code you typed
     from the agent, so a link alone approves nothing and two clicks approve once. */
  router.post('/api/agent-connect/sessions/:sessionId/approve', authenticateToken, async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      const deviceCode = String(req.body?.deviceCode || '').trim().toUpperCase();
      const approved = deviceCode && await AgentConnectSession.findOneAndUpdate(
        { sessionId, deviceCode, status: 'pending', expiresAt: { $gt: now() } },
        { $set: { status: 'approved', approvedUserId: req.user.id, approvedAt: now() } },
        { new: true }
      );
      if (approved) return res.status(200).json({ session: sanitizeSession(approved) });
      const session = await markExpiredIfNeeded(await AgentConnectSession.findOne({ sessionId }), now());
      if (!session) return res.status(404).json({ error: 'Connection session not found.' });
      if (session.status !== 'pending') {
        return res.status(409).json({ error: `Connection session is ${session.status}.`, session: sanitizeSession(session) });
      }
      return res.status(403).json({ error: 'That is not the code your agent shows.' });
    } catch (error) {
      console.error('❌ Error approving agent connect session:', error);
      res.status(500).json({ error: 'Failed to approve agent connection.' });
    }
  });

  /* The token is made when the agent collects it, once, and its secret is
     never stored: only its hash, like every other token. */
  router.post('/api/agent-connect/sessions/:sessionId/poll', async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      const pollSecret = String(req.body?.pollSecret || '').trim();
      const session = await markExpiredIfNeeded(await AgentConnectSession.findOne({ sessionId }), now());
      if (!session) return res.status(404).json({ error: 'Connection session not found.' });
      if (!pollSecret || session.pollSecretHash !== hashPollSecret(pollSecret)) {
        return res.status(403).json({ error: 'Connection session secret is invalid.' });
      }
      const payload = { session: sanitizeSession(session), pollIntervalSec: CONNECT_POLL_INTERVAL_SEC };
      if (session.status !== 'approved') return res.status(200).json(payload);

      const secret = createAgentTokenSecret();
      const token = new AgentToken({
        userId: session.approvedUserId,
        label: String(session.label || runtimeLabel(session.runtime)).slice(0, 100),
        runtime: session.runtime || 'agent',
        connectionSessionId: session.sessionId,
        hashedSecret: hashAgentTokenSecret(secret),
        secretPrefix: `${secret.slice(0, 12)}...`,
        scopes: normalizeAgentTokenScopes(session.scopes || ['read'])
      });
      const collected = await AgentConnectSession.findOneAndUpdate(
        { _id: session._id, status: 'approved', tokenId: null, expiresAt: { $gt: now() } },
        { $set: { tokenId: token._id, deliveredAt: now() } }
      );
      if (!collected) {
        return res.status(410).json({ error: 'Credential is no longer available. Start a fresh connection request.', session: sanitizeSession(session) });
      }
      await token.save();
      return res.status(200).json({ ...payload, secret, tokenId: String(token._id) });
    } catch (error) {
      console.error('❌ Error polling agent connect session:', error);
      res.status(500).json({ error: 'Failed to poll agent connection.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentConnectRouter,
  hashPollSecret
};
