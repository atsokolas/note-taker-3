#!/usr/bin/env node
// Bounded temporary acceptance-test gateway. Never imports the local fixture runner.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const validatePublicOrigin = value => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname)
    || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash || value !== url.origin) {
    throw new Error('Use the exact canonical HTTPS origin assigned to the approved temporary tunnel.');
  }
  return url;
};
const validateApiOrigin = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('API must be an explicit loopback HTTP origin.');
  return url;
};
const spaRoutes = new Set(['/login', '/settings', '/settings/connected-agents/chatgpt', '/connections']);
const publicGets = new Set(['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/oauth/chatgpt/authorize']);
const publicPosts = new Set(['/oauth/chatgpt/token', '/oauth/chatgpt/revoke', '/api/auth/login']);
const privateGets = new Set(['/api/agent-connection', '/api/agent-tokens']);
const requestContext = /^\/api\/chatgpt\/oauth\/requests\/[A-Za-z0-9_-]{16,128}$/;
const consentPath = /^\/api\/chatgpt\/oauth\/requests\/[^/]+\/consent$/;
const mime = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

const createGateway = ({ publicOrigin, apiOrigin = 'http://127.0.0.1:5607', buildDir, allowConsent = false, approvedConsentRequestId = '', now = Date.now } = {}) => {
  if (typeof allowConsent !== 'boolean' || allowConsent && !/^[A-Za-z0-9_-]{16,128}$/.test(approvedConsentRequestId)) {
    throw new Error('Consent enablement requires a boolean and one exact approved request ID.');
  }
  const approvedConsentPath = allowConsent ? `/api/chatgpt/oauth/requests/${approvedConsentRequestId}/consent` : null;
  const external = validatePublicOrigin(publicOrigin);
  const internal = validateApiOrigin(apiOrigin);
  const directory = fs.realpathSync(buildDir);
  const index = fs.realpathSync(path.join(directory, 'index.html'));
  if (!index.startsWith(directory + path.sep)) throw new Error('Frontend entry must remain inside the reviewed build directory.');
  if (!fs.statSync(index).isFile()) throw new Error('A fresh same-origin frontend build is required.');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'asset-manifest.json'), 'utf8'));
  const assets = new Map();
  for (const item of Object.values(manifest.files || {})) {
    if (typeof item !== 'string' || item.includes('..') || item.includes('?') || item.includes('#')) continue;
    const route = `/${item.replace(/^\//, '')}`;
    if (route.endsWith('.map') || !mime[path.extname(route)]) continue;
    const real = fs.realpathSync(path.join(directory, route.slice(1)));
    if (!real.startsWith(directory + path.sep)) throw new Error('Build assets must stay inside the reviewed build directory.');
    assets.set(route, real);
  }
  for (const filename of ['favicon.ico', 'logo192.png', 'logo512.png']) {
    const file = path.join(directory, filename);
    if (fs.existsSync(file)) {
      const real = fs.realpathSync(file);
      if (!real.startsWith(directory + path.sep)) throw new Error('Icons must remain inside the reviewed build directory.');
      assets.set(`/${filename}`, real);
    }
  }
  const startedAt = now();
  let inFlight = 0;
  let authWindow = { start: now(), count: 0, logins: 0, consents: 0 };
  const deny = (res, status, message) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: message })); };
  const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    // The tunnel preserves the public Host. Never select upstream/origin from
    // request Host, X-Forwarded-Host, URL or client parameters.
    if (req.headers.host !== external.host) return deny(res, 421, 'Unrecognized gateway host.');
    if (now() - startedAt > 30 * 60000) return deny(res, 410, 'The temporary gateway test window ended.');
    if (inFlight >= 20) return deny(res, 429, 'Temporary gateway concurrency limit reached.');
    inFlight++;
    res.once('close', () => { inFlight--; });
    if (/%|\\|\/\//.test(req.url.split('?')[0]) || !req.url.startsWith('/')) return deny(res, 400, 'Noncanonical path.');
    const url = new URL(req.url, external);
    const route = url.pathname;
    const isConsent = req.method === 'POST' && consentPath.test(route);
    if (isConsent && route !== approvedConsentPath) return deny(res, 403, 'Consent creation is not approved for this request.');
    if (isConsent && req.headers.origin !== external.origin) return deny(res, 403, 'Consent requires the exact approved browser origin.');
    if (route === '/mcp' && req.method === 'GET') return deny(res, 405, 'Only stateless MCP POST is supported.');
    if (req.method === 'GET' && (spaRoutes.has(route) || assets.has(route))) {
      const file = assets.get(route) || index;
      res.setHeader('Content-Type', file === index ? 'text/html; charset=utf-8' : mime[path.extname(file)]);
      return fs.createReadStream(file).pipe(res);
    }
    const isPrivate = isConsent || route === '/mcp' && req.method === 'POST' || req.method === 'GET' && (privateGets.has(route) || requestContext.test(route));
    const isPublic = req.method === 'GET' && publicGets.has(route) || req.method === 'POST' && publicPosts.has(route) || route === '/mcp' && req.method === 'OPTIONS';
    if (!isPrivate && !isPublic) return deny(res, 403, 'Route is outside the approved test allowlist.');
    if (isPrivate && !/^Bearer [^\s]+$/i.test(req.headers.authorization || '')) {
      if (route === '/mcp') res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${external.origin}/.well-known/oauth-protected-resource", scope="read"`);
      return deny(res, 401, 'Bearer authentication required.');
    }
    if ((isConsent || route === '/api/auth/login' && req.method === 'POST') && !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return deny(res, 415, 'Browser decisions and login accept JSON only.');
    if (route === '/api/auth/login' && req.headers.origin && req.headers.origin !== external.origin) return deny(res, 403, 'Login origin does not match this isolated test.');
    if (now() - authWindow.start >= 60000) authWindow = { start: now(), count: 0, logins: 0, consents: 0 };
    if (++authWindow.count > 120 || route === '/api/auth/login' && ++authWindow.logins > 5 || isConsent && ++authWindow.consents > 5) return deny(res, 429, 'Temporary gateway request limit reached.');
    const chunks = []; let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 8192) return deny(res, 413, 'Temporary gateway body limit is 8 KiB.');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (isConsent) {
        let decision;
        try { decision = JSON.parse(body.toString()); } catch (_) { return deny(res, 400, 'A consent decision must be JSON.'); }
        if (!decision || Object.keys(decision).length !== 1 || typeof decision.approved !== 'boolean') return deny(res, 400, 'Only the explicit consent decision is allowed.');
      }
      const headers = { host: internal.host, accept: req.headers.accept || 'application/json', 'content-length': body.length };
      for (const name of ['authorization', 'content-type', 'mcp-protocol-version', 'mcp-session-id', 'last-event-id']) if (req.headers[name]) headers[name] = req.headers[name];
      // JWT header authentication only. Never forward cookies or caller-supplied
      // proxy headers and never publish upstream cookie domains or redirects.
      const upstream = http.request(new URL(req.url, internal), { method: req.method, headers }, response => {
        res.statusCode = response.statusCode;
        for (const name of ['content-type', 'www-authenticate', 'retry-after', 'allow', 'access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-expose-headers']) if (response.headers[name]) res.setHeader(name, response.headers[name]);
        if (response.headers.location) {
          const location = new URL(response.headers.location, external);
          // OAuth callback redirects are validated by the upstream predefined
          // client, while local consent pages must stay on the configured origin.
          res.setHeader('Location', location.href);
        }
        response.pipe(res);
      });
      upstream.setTimeout(30000, () => upstream.destroy(new Error('timeout')));
      upstream.on('error', () => { if (!res.headersSent) deny(res, 502, 'Isolated API unavailable.'); else res.destroy(); });
      res.on('close', () => upstream.destroy());
      upstream.end(body);
    } catch (_) { if (!res.headersSent) deny(res, 400, 'Request could not be read.'); }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 1000;
  server.maxRequestsPerSocket = 30;
  server.setTimeout(30000, socket => socket.destroy());
  return server;
};

if (require.main === module) {
  const server = createGateway({ publicOrigin: process.env.NOEIS_GATEWAY_PUBLIC_ORIGIN, apiOrigin: process.env.NOEIS_GATEWAY_API_ORIGIN, buildDir: process.env.NOEIS_GATEWAY_BUILD_DIR, allowConsent: process.env.NOEIS_GATEWAY_ALLOW_CONSENT === 'true', approvedConsentRequestId: process.env.NOEIS_GATEWAY_APPROVED_CONSENT_REQUEST_ID });
  server.listen(5680, '127.0.0.1', () => process.stdout.write('Isolated gateway listening on loopback port 5680. Consent is restricted by the explicit approved-request configuration.\n'));
}
module.exports = { createGateway, validatePublicOrigin };
