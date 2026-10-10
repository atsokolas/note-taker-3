const crypto = require('crypto');
const express = require('express');
const { createAgentTokenSecret, hashAgentTokenSecret } = require('../services/agentTokenService');
const { ChatgptOAuthControl, ChatgptOAuthClient } = require('../models/chatgptOAuthModels');
const { buildChatgptOAuthControls } = require('../services/chatgptOAuthControls');
const { isOAuthPath } = require('../services/chatgptOAuthIngress');
const opaque = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const SCOPE_SET = new Set(['read', 'agent-write']);
const parseScopes = value => {
  if (typeof value !== 'string' || value.length > 200) return null;
  const scopes = [...new Set(value.trim().split(/\s+/).filter(Boolean))];
  return scopes.length && scopes.every(scope => SCOPE_SET.has(scope)) ? scopes : null;
};
const scalar = (value, limit = 2048) => typeof value === 'string' && value.length <= limit ? value : '';
const CLIENT_IDLE_MS = 30 * 86400000;
// Native apps return through their own scheme (cursor://, vscode://). Never schemes a browser runs or reads.
const UNSAFE_SCHEMES = new Set(['javascript', 'data', 'file', 'vbscript', 'blob', 'about', 'filesystem', 'view-source', 'intent', 'ws', 'wss', 'ftp', 'mailto']);
const registrableRedirect = value => {
  if (typeof value !== 'string' || value.length > 500) return false;
  let url;
  try { url = new URL(value); } catch (_) { return false; }
  if (url.href !== value || url.hash || url.username || url.password) return false;
  const scheme = url.protocol.slice(0, -1);
  if (scheme === 'https') return true;
  if (scheme === 'http') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return /^[a-z][a-z0-9.+-]*$/.test(scheme) && !UNSAFE_SCHEMES.has(scheme);
};
// What the consent page names as the return destination: the part a look-alike app can't fake.
const returnTo = redirectUri => {
  const url = new URL(redirectUri);
  if (url.protocol === 'https:') return { kind: 'site', name: url.hostname };
  if (url.protocol === 'http:') return { kind: 'local', name: url.hostname };
  return { kind: 'app', name: url.protocol.slice(0, -1) };
};

const buildChatgptOAuthRouter = ({ config, authenticateToken, Request, Grant, AgentToken, Client = ChatgptOAuthClient, Control = ChatgptOAuthControl, controls: suppliedControls, isReady = () => true, now = () => new Date() }) => {
  const router = express.Router();
  if (!config) return router;
  const error = (res, name, status = 400) => res.status(status).json({ error: name });
  const current = () => now();
  const controls = suppliedControls || buildChatgptOAuthControls({ Control, config, now });
  const throttle = async (res, endpoint, clientId) => {
    const result = await controls.rate(endpoint, clientId);
    if (result.allowed) return true;
    res.set('Retry-After', String(result.retryAfter));
    error(res, 'temporarily_unavailable', 429);
    return false;
  };
  router.use((req, res, next) => {
    // A route-local parser cannot enforce a cap after the main import parser.
    // Require the early raw ingress middleware rather than silently bypassing it.
    if (isOAuthPath(req) && !req.chatgptOAuthBodyBounded) return error(res, 'invalid_parser_order', 400);
    if (isOAuthPath(req) && !isReady()) {
      res.set('Cache-Control', 'no-store');
      res.set('Retry-After', '5');
      return error(res, 'temporarily_unavailable', 503);
    }
    next();
  });
  const callback = (row, params) => {
    const url = new URL(row.redirectUri);
    for (const [key, value] of Object.entries({ ...params, state: row.state, iss: config.issuer })) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  };
  // Configured clients are known by name; registered ones only claim one, and stay while they're used.
  const resolveClient = async clientId => {
    const known = config.clients.get(clientId);
    if (known) return { ...known, verified: true };
    if (!config.openClients || !clientId) return null;
    const row = await Client.findOneAndUpdate({ clientId, expiresAt: { $gt: current() } },
      { $set: { expiresAt: new Date(current().getTime() + CLIENT_IDLE_MS) } }, { new: true });
    return row && { clientId: row.clientId, name: row.name, redirectUris: row.redirectUris, verified: false };
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
  const mintAccess = async (grant, client) => {
    const secret = createAgentTokenSecret();
    const fields = {
      userId: grant.userId,
      label: client.verified ? `${client.name} · NOEIS` : `${client.name} · ${returnTo(client.redirectUris[0]).name}`,
      runtime: client.verified ? 'chatgpt' : 'mcp',
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
    code_challenge_methods_supported: ['S256'], scopes_supported: [...SCOPE_SET],
    ...(config.openClients ? { registration_endpoint: `${config.issuer}/oauth/register` } : {})
  }));
  // RFC 7591 for public clients only. Registration grants nothing: a signed-in person still approves.
  router.post('/oauth/register', guard(async (req, res) => {
    if (!config.openClients) return error(res, 'not_found', 404);
    if (!await throttle(res, 'register')) return;
    const body = req.body || {};
    const invalid = description => res.status(400).json({ error: 'invalid_client_metadata', error_description: description });
    const redirectUris = body.redirect_uris;
    if (!Array.isArray(redirectUris) || !redirectUris.length || redirectUris.length > 5) return invalid('One to five redirect_uris are required.');
    if (!redirectUris.every(registrableRedirect)) return res.status(400).json({ error: 'invalid_redirect_uri' });
    if (![undefined, 'none'].includes(body.token_endpoint_auth_method)) return invalid('Only public clients (token_endpoint_auth_method "none") may register.');
    const grantTypes = body.grant_types ?? ['authorization_code', 'refresh_token'];
    if (!Array.isArray(grantTypes) || !grantTypes.every(type => ['authorization_code', 'refresh_token'].includes(type))) return invalid('Unsupported grant_types.');
    if (body.response_types !== undefined && (!Array.isArray(body.response_types) || body.response_types.some(type => type !== 'code'))) return invalid('Only the code response type is supported.');
    const name = (scalar(body.client_name, 500).replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim() || returnTo(redirectUris[0]).name).slice(0, 100);
    if (await Client.countDocuments({ expiresAt: { $gt: current() } }) >= config.limits.registeredClients) {
      res.set('Retry-After', '3600');
      return error(res, 'temporarily_unavailable', 429);
    }
    const clientId = `noeis_${opaque()}`;
    await Client.create({ clientId, name, redirectUris: [...new Set(redirectUris)], expiresAt: new Date(current().getTime() + CLIENT_IDLE_MS) });
    res.status(201).json({ client_id: clientId, client_id_issued_at: Math.floor(current().getTime() / 1000), client_name: name,
      redirect_uris: [...new Set(redirectUris)], grant_types: grantTypes, response_types: ['code'], token_endpoint_auth_method: 'none' });
  }));
  router.get('/oauth/chatgpt/authorize', guard(async (req, res) => {
    const clientId = scalar(req.query.client_id, 500);
    if (!await throttle(res, 'authorize', clientId)) return;
    const redirectUri = scalar(req.query.redirect_uri);
    const client = await resolveClient(clientId);
    // Never redirect to an untrusted URI, including on errors.
    if (!client || !client.redirectUris.includes(redirectUri)) return error(res, 'invalid_request');
    const row = { clientId, redirectUri, state: scalar(req.query.state), resource: scalar(req.query.resource) };
    const scopes = parseScopes(req.query.scope === undefined ? 'read' : req.query.scope);
    const challenge = scalar(req.query.code_challenge, 128);
    if (req.query.response_type !== 'code' || req.query.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || row.resource !== config.resource || !scopes || (req.query.state !== undefined && !row.state)) {
      return res.redirect(callback(row, { error: scopes ? 'invalid_request' : 'invalid_scope' }));
    }
    // Indexed cleanup before allocation also bounds request storage if Mongo's
    // asynchronous TTL monitor is delayed. Expired codes are already unusable.
    await Request.deleteMany({ expiresAt: { $lte: current() } });
    const admission = await controls.admit(client);
    if (!admission) { res.set('Retry-After', '60'); return error(res, 'temporarily_unavailable', 429); }
    const requestId = opaque();
    try {
      await Request.create({ ...row, scopes, challenge, requestId, status: 'pending', expiresAt: admission.expiresAt });
    } catch (err) {
      // Unknown database/network failures may mean the insert committed but its
      // acknowledgement was lost. Retain admission until expiry in that case.
      // Only definitive pre-write validation/duplicate rejection frees capacity.
      if (err.name === 'ValidationError' || err.code === 11000) await controls.release(admission);
      throw err;
    }
    // Keep the lease until the original request expiry even after consent. This
    // bounds rows in the live allocation window; crashing cannot free capacity early.
    const url = new URL('/settings/connected-agents/connect', config.appUrl);
    url.searchParams.set('request', requestId);
    res.redirect(url.toString());
  }));
  router.get('/api/chatgpt/oauth/requests/:id', authenticateToken, guard(async (req, res) => {
    if (!await throttle(res, 'consent')) return;
    const row = await Request.findOne({ requestId: req.params.id, status: 'pending', expiresAt: { $gt: current() } });
    if (!row) return error(res, 'invalid_request', 404);
    const client = await resolveClient(row.clientId);
    if (!client) return error(res, 'invalid_client', 400);
    res.json({ requestId: row.requestId, clientName: client.name, clientVerified: client.verified, returnTo: returnTo(row.redirectUri),
      scopes: row.scopes, resource: row.resource, expiresAt: row.expiresAt });
  }));
  router.post('/api/chatgpt/oauth/requests/:id/consent', authenticateToken, guard(async (req, res) => {
    // Session cookie auth alone cannot approve grants: require the existing user's Bearer JWT.
    if (req.authInfo?.tokenSource !== 'header' || req.agentToken || !req.user?.id) return error(res, 'access_denied', 403);
    if (!await throttle(res, 'consent')) return;
    if (typeof req.body?.approved !== 'boolean') return error(res, 'invalid_request');
    // The person may grant less than was asked (read only), never more.
    const granted = req.body.scopes === undefined ? null : Array.isArray(req.body.scopes) ? parseScopes(req.body.scopes.join(' ')) : null;
    if (req.body.scopes !== undefined && !granted) return error(res, 'invalid_scope');
    const code = opaque();
    const approved = req.body.approved;
    const row = await Request.findOneAndUpdate({ requestId: req.params.id, status: 'pending', expiresAt: { $gt: current() },
      ...(granted ? { scopes: { $all: granted } } : {}) }, {
      $set: { status: approved ? 'approved' : 'denied', userId: req.user.id, ...(granted && approved ? { scopes: granted } : {}),
        codeHash: approved ? hash(code) : null, expiresAt: new Date(current().getTime() + 60000) }
    }, { new: true });
    if (!row) return error(res, 'invalid_request', 409);
    res.json({ redirectUrl: callback(row, approved ? { code } : { error: 'access_denied' }) });
  }));
  router.post('/oauth/chatgpt/token', express.urlencoded({ extended: false, limit: '8kb' }), guard(async (req, res) => {
    const body = req.body || {};
    const clientId = scalar(body.client_id, 500);
    if (!await throttle(res, 'token', clientId)) return;
    const client = !req.headers.authorization && await resolveClient(clientId);
    if (!client) return error(res, 'invalid_client', 401);
    if (body.resource !== config.resource) return error(res, 'invalid_target');
    if (body.grant_type === 'authorization_code') {
      const code = scalar(body.code, 128), verifier = scalar(body.code_verifier, 128);
      const redirectUri = scalar(body.redirect_uri);
      if (!client.redirectUris.includes(redirectUri)) return error(res, 'invalid_grant');
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !code) return error(res, 'invalid_grant');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      // Matching + consume is a single database operation: concurrent exchanges cannot mint twice.
      const row = await Request.findOneAndUpdate({ codeHash: hash(code), clientId, redirectUri,
        resource: body.resource, challenge, status: 'approved', expiresAt: { $gt: current() } }, { $set: { status: 'consumed' } }, { new: true });
      if (!row) return error(res, 'invalid_grant');
      const refresh = opaque();
      const grant = await Grant.create({ familyId: opaque(), userId: row.userId, clientId,
        resource: row.resource, scopes: row.scopes, refreshHash: hash(refresh), refreshCount: 0, expiresAt: new Date(current().getTime() + config.refreshTtlSec * 1000) });
      const access = await mintAccess(grant, client);
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
      if (Number(old.refreshCount || 0) >= config.limits.refreshRotations) { await revokeFamily(old.familyId); return error(res, 'invalid_grant'); }
      if (body.scope !== undefined && (!requestedScopes || requestedScopes.some(scope => !old.scopes.includes(scope)))) return error(res, 'invalid_scope');
      // Respect revocation through the existing Connected Agents UI as well as OAuth revocation.
      const linkedToken = old.accessTokenId && await AgentToken.findOne({ _id: old.accessTokenId, userId: old.userId, status: 'active', revokedAt: null });
      if (!linkedToken) { await revokeFamily(old.familyId); return error(res, 'invalid_grant'); }
      const replacement = opaque();
      const grant = await Grant.findOneAndUpdate({ familyId: old.familyId, refreshHash, refreshCount: { $lt: config.limits.refreshRotations }, revokedAt: null, expiresAt: { $gt: current() } }, {
        $set: { refreshHash: hash(replacement), ...(requestedScopes ? { scopes: requestedScopes } : {}) }, $push: { usedRefreshHashes: refreshHash }, $inc: { refreshCount: 1 }
      }, { new: true });
      if (!grant) { await revokeFamily(old.familyId); return error(res, 'invalid_grant'); }
      const access = await mintAccess(grant, client);
      if (!access) return error(res, 'invalid_grant');
      return tokenResponse(res, grant, access, replacement);
    }
    return error(res, 'unsupported_grant_type');
  }));
  router.post('/oauth/chatgpt/revoke', express.urlencoded({ extended: false, limit: '8kb' }), guard(async (req, res) => {
    const clientId = scalar(req.body?.client_id, 500), token = scalar(req.body?.token, 256);
    if (!await throttle(res, 'revoke', clientId)) return;
    if (req.headers.authorization || !await resolveClient(clientId)) return error(res, 'invalid_client', 401);
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
