const express = require('express');

// Public ownership proof supplied by the NOEIS publisher, not a credential.
const CHALLENGE_TOKEN = '98gBRFdqZEaZGR_4eCEu69N0LCHZyXnqxG1guKsWBP4';

const buildOpenaiAppsChallengeRouter = () => {
  const router = express.Router();
  router.get('/.well-known/openai-apps-challenge', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('text/plain').send(CHALLENGE_TOKEN);
  });
  return router;
};

module.exports = { buildOpenaiAppsChallengeRouter };
