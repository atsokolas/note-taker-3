const crypto = require('crypto');
const express = require('express');
const { createAgentTokenSecret, hashAgentTokenSecret } = require('../services/agentTokenService');
const opaque = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const SCOPE_SET = new Set(['read', 'agent-write']);
const parseScopes = value => {
  if (typeof value !== 'string' || value.length > 200) return null;
  const scopes = [...new Set(value.trim().split(/\s+/).filter(Boolean))];
  return scopes.length && scopes.every(scope => SCOPE_SET.has(scope)) ? scopes : null;
};
const scalar = (value, limit = 2048) => typeof value === 'string' && value.length <= limit ? value : '';

const buildChatgptOAuthRouter = ({ config, authenticateToken, Request, Grant, AgentToken, now = () => new Date() }) => {
  const router = express.Router();
  if (!config) return router;
  const error = (res, name, status = 400) => res.status(status).json({ error: name });
  const current = () => now();
  const callback = (row, params) => {
    const url = new URL(row.redirectUri);
    for (const [key, value] of Object.entries({ ...params, state: row.state, iss: config.issuer })) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  };
  const guard = handler => async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    try { await handler(req, res); } catch (err) { next(err); }
  };
  const revokeFamily = async familyId => {
    await Grant.updateOne({ familyId }, { $set: { revokedAt: current() } });
    await AgentToken.updateMany({ oauthFamilyId: familyId }, { $set: { revokedAt: current(), status: 'revoked' } });
  };
  const mintAccess = async grant => {
    const secret = createAgentTokenSecret();
    const fields = {
      userId: grant.userId, label: 'ChatGPT · NOEIS', runtime: 'chatgpt',
      connectionSessionId: grant.familyId, oauthFamilyId: grant.familyId,
      oauthClientId: grant.clientId, oauthResource: grant.resource,
      hashedSecret: hashAgentTokenSecret(secret), secretPrefix: `${secret.slice(0, 12)}...`,
      scopes: grant.scopes, expiresAt: new Date(current().getTime() + config.accessTtlSec * 1000), status: 'active'
    };
    // Keep one existing Connected Agents identity/receipt stream per OAuth family.
    // Updating the hash invalidates the previous access credential without accumulating token rows.
    const token = grant.accessTokenId
      ? await AgentToken.findOneAndUpdate({ _id: grant.accessTokenId, userId: grant.userId,
        oauthFamilyId: grant.familyId, status: 'active', revokedAt: null }, { $set: fields }, { new: true })
      : await AgentToken.create(fields);
    if (!token) { await revokeFamily(grant.familyId); return null; }
    // A concurrent replay/revocation cannot resurrect the grant.
    const updated = await Grant.findOneAndUpdate({ familyId: grant.familyId, revokedAt: null }, { $set: { accessTokenId: token._id } }, { new: true });
    if (!updated) {
      await AgentToken.updateOne({ _id: token._id }, { $set: { revokedAt: current(), status: 'revoked' } });
      return null;
    }
    return secret;
  };
  const tokenResponse = (res, grant, access, refresh) => res.json({
    access_token: access, token_type: 'Bearer', expires_in: config.accessTtlSec,
    refresh_token: refresh, scope: grant.scopes.join(' '), resource: grant.resource
  });

  router.get('/.well-known/oauth-protected-resource', (_req, res) => res.json({
    resource: config.resource, authorization_servers: [config.issuer], scopes_supported: [...SCOPE_SET], bearer_methods_supported: ['header']
  }));
  router.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => res.json({
    resource: config.resource, authorization_servers: [config.issuer], scopes_supported: [...SCOPE_SET], bearer_methods_supported: ['header']
  }));
  router.get('/.well-known/oauth-authorization-server', (_req, res) => res.json({
    issuer: config.issuer, authorization_endpoint: `${config.issuer}/oauth/chatgpt/authorize`,
    token_endpoint: `${config.issuer}/oauth/chatgpt/token`, revocation_endpoint: `${config.issuer}/oauth/chatgpt/revoke`,
    authorization_response_iss_parameter_supported: true,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'], scopes_supported: [...SCOPE_SET]
  }));
  router.get('/oauth/chatgpt/authorize', guard(async (req, res) => {
    const clientId = scalar(req.query.client_id, 500);
    const redirectUri = scalar(req.query.redirect_uri);
    const client = config.clients.get(clientId);
    // Never redirect to an untrusted URI, including on errors.
    if (!client || !client.redirectUris.includes(redirectUri)) return error(res, 'invalid_request');
    const row = { clientId, redirectUri, state: scalar(req.query.state), resource: scalar(req.query.resource) };
    const scopes = parseScopes(req.query.scope === undefined ? 'read' : req.query.scope);
    const challenge = scalar(req.query.code_challenge, 128);
    if (req.query.response_type !== 'code' || req.query.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || row.resource !== config.resource || !scopes || (req.query.state !== undefined && !row.state)) {
      return res.redirect(callback(row, { error: scopes ? 'invalid_request' : 'invalid_scope' }));
    }
    const requestId = opaque();
    await Request.create({ ...row, scopes, challenge, requestId, status: 'pending', expiresAt: new Date(current().getTime() + 10 * 60000) });
    const url = new URL('/settings/connected-agents/chatgpt', config.appUrl);
    url.searchParams.set('request', requestId);
    res.redirect(url.toString());
  }));
  router.get('/api/chatgpt/oauth/requests/:id', authenticateToken, guard(async (req, res) => {
    const row = await Request.findOne({ requestId: req.params.id, status: 'pending', expiresAt: { $gt: current() } });
    if (!row) return error(res, 'invalid_request', 404);
    const client = config.clients.get(row.clientId);
    if (!client) return error(res, 'invalid_client', 400);
    res.json({ requestId: row.requestId, clientName: client.name, scopes: row.scopes, resource: row.resource, expiresAt: row.expiresAt });
  }));
  router.post('/api/chatgpt/oauth/requests/:id/consent', authenticateToken, guard(async (req, res) => {
    // Session cookie auth alone cannot approve grants: require the existing user's Bearer JWT.
    if (req.authInfo?.tokenSource !== 'header' || req.agentToken || !req.user?.id) return error(res, 'access_denied', 403);
    if (typeof req.body?.approved !== 'boolean') return error(res, 'invalid_request');
    const code = opaque();
    const approved = req.body.approved;
    const row = await Request.findOneAndUpdate({ requestId: req.params.id, status: 'pending', expiresAt: { $gt: current() } }, {
      $set: { status: approved ? 'approved' : 'denied', userId: req.user.id,
        codeHash: approved ? hash(code) : null, expiresAt: new Date(current().getTime() + 60000) }
    }, { new: true });
    if (!row) return error(res, 'invalid_request', 409);
    res.json({ redirectUrl: callback(row, approved ? { code } : { error: 'access_denied' }) });
  }));
  router.post('/oauth/chatgpt/token', express.urlencoded({ extended: false, limit: '8kb' }), guard(async (req, res) => {
    const body = req.body || {};
    const clientId = scalar(body.client_id, 500);
    if (!config.clients.has(clientId) || req.headers.authorization) return error(res, 'invalid_client', 401);
    if (body.resource !== config.resource) return error(res, 'invalid_target');
    if (body.grant_type === 'authorization_code') {
      const code = scalar(body.code, 128), verifier = scalar(body.code_verifier, 128);
      const redirectUri = scalar(body.redirect_uri);
      if (!config.clients.get(clientId).redirectUris.includes(redirectUri)) return error(res, 'invalid_grant');
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !code) return error(res, 'invalid_grant');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      // Matching + consume is a single database operation: concurrent exchanges cannot mint twice.
      const row = await Request.findOneAndUpdate({ codeHash: hash(code), clientId, redirectUri,
        resource: body.resource, challenge, status: 'approved', expiresAt: { $gt: current() } }, { $set: { status: 'consumed' } }, { new: true });
      if (!row) return error(res, 'invalid_grant');
      const refresh = opaque();
      const grant = await Grant.create({ familyId: opaque(), userId: row.userId, clientId,
        resource: row.resource, scopes: row.scopes, refreshHash: hash(refresh), expiresAt: new Date(current().getTime() + config.refreshTtlSec * 1000) });
      const access = await mintAccess(grant);
      if (!access) return error(res, 'invalid_grant');
      return tokenResponse(res, grant, access, refresh);
    }
    if (body.grant_type === 'refresh_token') {
      const refresh = scalar(body.refresh_token, 128);
      if (!refresh) return error(res, 'invalid_grant');
      const refreshHash = hash(refresh);
      const requestedScopes = body.scope === undefined ? null : parseScopes(body.scope);
      const old = await Grant.findOne({ refreshHash, clientId, resource: config.resource, revokedAt: null, expiresAt: { $gt: current() } });
      if (!old) {
        const replay = await Grant.findOne({ usedRefreshHashes: refreshHash, clientId, resource: config.resource });
        if (replay) await revokeFamily(replay.familyId);
        return error(res, 'invalid_grant');
      }
      if (body.scope !== undefined && (!requestedScopes || requestedScopes.some(scope => !old.scopes.includes(scope)))) return error(res, 'invalid_scope');
      // Respect revocation through the existing Connected Agents UI as well as OAuth revocation.
      const linkedToken = old.accessTokenId && await AgentToken.findOne({ _id: old.accessTokenId, userId: old.userId, status: 'active', revokedAt: null });
      if (!linkedToken) { await revokeFamily(old.familyId); return error(res, 'invalid_grant'); }
      const replacement = opaque();
      const grant = await Grant.findOneAndUpdate({ familyId: old.familyId, refreshHash, revokedAt: null, expiresAt: { $gt: current() } }, {
        $set: { refreshHash: hash(replacement), ...(requestedScopes ? { scopes: requestedScopes } : {}) }, $push: { usedRefreshHashes: refreshHash }
      }, { new: true });
      if (!grant) { await revokeFamily(old.familyId); return error(res, 'invalid_grant'); }
      const access = await mintAccess(grant);
      if (!access) return error(res, 'invalid_grant');
      return tokenResponse(res, grant, access, replacement);
    }
    return error(res, 'unsupported_grant_type');
  }));
  router.post('/oauth/chatgpt/revoke', express.urlencoded({ extended: false, limit: '8kb' }), guard(async (req, res) => {
    const clientId = scalar(req.body?.client_id, 500), token = scalar(req.body?.token, 256);
    if (!config.clients.has(clientId) || req.headers.authorization) return error(res, 'invalid_client', 401);
    if (!token) return error(res, 'invalid_request');
    const digest = hash(token);
    const grant = await Grant.findOne({ clientId, $or: [{ refreshHash: digest }, { usedRefreshHashes: digest }] });
    const access = !grant && await AgentToken.findOne({ hashedSecret: digest, oauthClientId: clientId });
    if (grant || access?.oauthFamilyId) await revokeFamily(grant?.familyId || access.oauthFamilyId);
    res.sendStatus(200);
  }));
  return router;
};
module.exports = { buildChatgptOAuthRouter, parseScopes };
