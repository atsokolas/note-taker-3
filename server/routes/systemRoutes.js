const express = require('express');

const buildSystemRouter = ({
  authenticateToken,
  parseAiServiceUrl,
  joinUrl
}) => {
  const router = express.Router();

  router.get('/api/debug/time', (req, res) => {
    const serverNowSec = Math.floor(Date.now() / 1000);
    res.status(200).json({ serverNowISO: new Date().toISOString(), serverNowSec });
  });

  router.get('/api/debug/auth', authenticateToken, (req, res) => {
    const serverNowSec = Math.floor(Date.now() / 1000);
    res.status(200).json({
      tokenSource: req.authInfo?.tokenSource || 'unknown',
      serverNowSec,
      iat: req.authInfo?.iat,
      exp: req.authInfo?.exp
    });
  });

  router.get('/api/debug/ai-upstream', (req, res) => {
    const { origin, hasPath } = parseAiServiceUrl(process.env.AI_SERVICE_URL || '');
    const synthesizeUrl = origin ? joinUrl(origin, '/synthesize') : '';
    res.status(200).json({
      ai_service_origin: origin,
      synthesize_url: synthesizeUrl,
      looks_valid: Boolean(origin) && !hasPath,
      has_path: hasPath
    });
  });

  router.get('/health', (req, res) => {
    console.log("Health check ping received.");
    res.status(200).json({ status: "ok", message: "Server is warm." });
  });

  router.get('/', (req, res) => res.send('✅ Note Taker backend is running!'));

  return router;
};

module.exports = {
  buildSystemRouter
};
