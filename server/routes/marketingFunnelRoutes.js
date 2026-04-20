const express = require('express');

const buildMarketingFunnelRouter = ({
  authenticateToken,
  buildMarketingFunnelSnapshot,
  buildMarketingFunnelSeries
}) => {
  const router = express.Router();

  router.get('/api/analytics/marketing/funnel', authenticateToken, async (req, res) => {
    try {
      const days = Math.max(1, Math.min(180, Number(req.query.days) || 30));
      const snapshot = await buildMarketingFunnelSnapshot({ days });
      res.status(200).json(snapshot);
    } catch (error) {
      console.error('Failed to build marketing funnel snapshot:', error);
      res.status(500).json({ error: 'Failed to build marketing funnel snapshot.' });
    }
  });

  router.get('/api/analytics/marketing/funnel/timeseries', authenticateToken, async (req, res) => {
    try {
      const days = Math.max(1, Math.min(180, Number(req.query.days) || 30));
      const series = await buildMarketingFunnelSeries({ days });
      res.status(200).json(series);
    } catch (error) {
      console.error('Failed to build marketing funnel time series:', error);
      res.status(500).json({ error: 'Failed to build marketing funnel time series.' });
    }
  });

  return router;
};

module.exports = {
  buildMarketingFunnelRouter
};
