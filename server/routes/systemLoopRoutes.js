const express = require('express');
const { buildSystemLoopStatus } = require('../services/systemLoopStatusService');

const buildSystemLoopRouter = ({ authenticateToken, ...models } = {}) => {
  const router = express.Router();

  router.get('/api/system/loops', authenticateToken, async (req, res) => {
    try {
      const status = await buildSystemLoopStatus({ userId: req.user.id, models });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(status);
    } catch (error) {
      console.error('Failed to build system loop status:', error);
      return res.status(500).json({ error: 'Failed to load background-loop status.' });
    }
  });

  return router;
};

module.exports = { buildSystemLoopRouter };
