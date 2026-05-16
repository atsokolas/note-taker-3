const crypto = require('crypto');

const AGENT_TOKEN_PREFIX = 'ntk_at_';
const AGENT_TOKEN_SCOPES = ['read', 'agent-write'];
const AGENT_TOKEN_SCOPE_SET = new Set(AGENT_TOKEN_SCOPES);

const createAgentTokenSecret = () => (
  `${AGENT_TOKEN_PREFIX}${crypto.randomBytes(24).toString('hex')}`
);

const hashAgentTokenSecret = (value) => (
  crypto.createHash('sha256').update(String(value || '')).digest('hex')
);

const normalizeAgentTokenScopes = (input = []) => {
  const raw = Array.isArray(input) ? input : [input];
  const scopes = raw
    .map(scope => String(scope || '').trim())
    .filter(scope => AGENT_TOKEN_SCOPE_SET.has(scope));
  const unique = Array.from(new Set(scopes));
  return unique.length > 0 ? unique : ['read'];
};

const sanitizeAgentToken = (doc = {}) => {
  const object = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: object?._id,
    id: object?._id,
    userId: object?.userId,
    label: object?.label || '',
    scopes: normalizeAgentTokenScopes(object?.scopes || []),
    dailyQuota: object?.dailyQuota ?? null,
    callsToday: Number(object?.callsToday || 0),
    quotaWindowStartedAt: object?.quotaWindowStartedAt || null,
    expiresAt: object?.expiresAt || null,
    lastUsedAt: object?.lastUsedAt || null,
    revokedAt: object?.revokedAt || null,
    status: object?.status || 'active',
    secretPrefix: object?.secretPrefix || '',
    createdAt: object?.createdAt || null,
    updatedAt: object?.updatedAt || null
  };
};

const getBearerToken = (req = {}) => {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
};

const getUtcDayStart = (date = new Date()) => (
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
);

const getSecondsUntilNextUtcDay = (date = new Date()) => {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return Math.max(1, Math.ceil((next.getTime() - date.getTime()) / 1000));
};

const requiredScopeForRequest = (req = {}) => {
  const method = String(req.method || 'GET').toUpperCase();
  return ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'read' : 'agent-write';
};

const hasRequiredScope = (token = {}, scope = 'read') => {
  const scopes = normalizeAgentTokenScopes(token.scopes || []);
  if (scope === 'read') return scopes.includes('read') || scopes.includes('agent-write');
  return scopes.includes('agent-write');
};

const buildAuthenticateAgentToken = ({ AgentToken, now = () => new Date() } = {}) => {
  if (!AgentToken) {
    throw new Error('AgentToken model is required.');
  }

  return async function authenticateAgentToken(req, res, next) {
    try {
      const rawSecret = getBearerToken(req);
      if (!rawSecret || !rawSecret.startsWith(AGENT_TOKEN_PREFIX)) {
        return res.status(401).json({ error: 'Agent token required.' });
      }

      const hashedSecret = hashAgentTokenSecret(rawSecret);
      const token = await AgentToken.findOne({ hashedSecret });
      const current = now();
      if (!token || token.status === 'revoked' || token.revokedAt) {
        return res.status(401).json({ error: 'Agent token is invalid or revoked.' });
      }
      if (token.expiresAt && new Date(token.expiresAt).getTime() <= current.getTime()) {
        return res.status(401).json({ error: 'Agent token has expired.' });
      }

      const requiredScope = requiredScopeForRequest(req);
      if (!hasRequiredScope(token, requiredScope)) {
        return res.status(403).json({ error: `Agent token requires ${requiredScope} scope.` });
      }

      const dayStart = getUtcDayStart(current);
      const windowStart = token.quotaWindowStartedAt ? new Date(token.quotaWindowStartedAt) : null;
      if (!windowStart || windowStart.getTime() < dayStart.getTime()) {
        token.callsToday = 0;
        token.quotaWindowStartedAt = dayStart;
      }

      const quota = Number(token.dailyQuota || 0);
      if (quota > 0 && Number(token.callsToday || 0) >= quota) {
        res.set('Retry-After', String(getSecondsUntilNextUtcDay(current)));
        return res.status(429).json({ error: 'Agent token daily quota exceeded.' });
      }

      token.callsToday = Number(token.callsToday || 0) + 1;
      token.lastUsedAt = current;
      if (typeof token.save === 'function') await token.save();

      req.user = { id: String(token.userId || '') };
      req.agentToken = sanitizeAgentToken(token);
      req.authInfo = {
        ...(req.authInfo || {}),
        tokenSource: 'agent-token',
        scopes: req.agentToken.scopes
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = {
  AGENT_TOKEN_PREFIX,
  AGENT_TOKEN_SCOPES,
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken,
  buildAuthenticateAgentToken,
  requiredScopeForRequest
};
