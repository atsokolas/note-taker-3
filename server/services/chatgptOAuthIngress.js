const express = require('express');

const OAUTH_BODY_BYTES = 8 * 1024;
// Express routes are case-insensitive by default; ingress and its fail-closed
// router guard must cover every casing those routes accept.
const isOAuthPath = req => /^\/(?:oauth\/chatgpt|api\/chatgpt\/oauth)(?:\/|$)/i.test(req.path);

// Mount BEFORE the application's large import parsers. A raw parse establishes the
// byte bound once, including chunked bodies, rather than reparsing req.body later.
const buildChatgptOAuthIngress = () => {
  const router = express.Router();
  const raw = express.raw({ type: () => true, limit: OAUTH_BODY_BYTES, inflate: false });
  router.use((req, res, next) => {
    if (!isOAuthPath(req)) return next();
    res.set('Cache-Control', 'no-store');
    const length = req.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(String(length)) || Number(length) > OAUTH_BODY_BYTES)) {
      return res.status(413).json({ error: 'request_too_large' });
    }
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
      return res.status(415).json({ error: 'unsupported_media_type' });
    }
    // Refuse accidental mounting after an earlier parser; never trust a parsed
    // object as proof that the original incoming bytes fit this boundary.
    if (req._body || req.body !== undefined) return res.status(400).json({ error: 'invalid_parser_order' });
    const hasBody = Boolean(req.headers['transfer-encoding'] || Number(length || 0));
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (hasBody && !['application/json', 'application/x-www-form-urlencoded'].includes(type)) {
      return res.status(415).json({ error: 'unsupported_media_type' });
    }
    raw(req, res, err => {
      if (err) return res.status(err.type === 'entity.too.large' ? 413 : 400).json({ error: err.type === 'entity.too.large' ? 'request_too_large' : 'invalid_request' });
      try {
        const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const value = bytes.toString('utf8');
        let body = {};
        if (value && type === 'application/json') {
          body = JSON.parse(value);
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Object body required.');
        } else if (value) {
          body = Object.create(null);
          for (const [key, item] of new URLSearchParams(value)) {
            if (Object.hasOwn(body, key)) throw new Error('Duplicate form key.');
            body[key] = item;
          }
        }
        req.body = body;
        // body-parser marks this request consumed, preventing the later 50 MB
        // parser from accepting a different content type or larger body.
        req._body = true;
        req.chatgptOAuthBodyBounded = true;
        next();
      } catch (_err) { res.status(400).json({ error: 'invalid_request' }); }
    });
  });
  return router;
};
module.exports = { OAUTH_BODY_BYTES, buildChatgptOAuthIngress, isOAuthPath };
