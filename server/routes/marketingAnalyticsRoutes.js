const express = require('express');

const clean = (value = '') => String(value || '').trim();

const sanitizeAttribution = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return {
    visitorId: clean(value.visitorId),
    entry: clean(value.entry),
    cta: clean(value.cta),
    pageType: clean(value.pageType),
    utmSource: clean(value.utmSource),
    utmMedium: clean(value.utmMedium),
    utmCampaign: clean(value.utmCampaign),
    utmTerm: clean(value.utmTerm),
    utmContent: clean(value.utmContent),
    referrerHost: clean(value.referrerHost),
    landingPath: clean(value.landingPath),
    target: clean(value.target)
  };
};

const buildMarketingAnalyticsRouter = ({
  trackEvent,
  EVENT_NAMES
}) => {
  const router = express.Router();

  router.post('/api/analytics/marketing', async (req, res) => {
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const event = clean(payload.event);
      const validEvents = new Set([
        EVENT_NAMES.MARKETING_SIGNUP_VIEWED,
        EVENT_NAMES.MARKETING_SIGNUP_STARTED,
        EVENT_NAMES.MARKETING_CTA_CLICKED,
        EVENT_NAMES.MARKETING_SIGNUP_FAILED
      ].filter(Boolean));

      if (!validEvents.has(event)) {
        return res.status(400).json({ error: 'Unsupported marketing analytics event.' });
      }

      trackEvent({
        event,
        requestId: req.requestId,
        properties: {
          ...sanitizeAttribution(payload.attribution),
          reason: clean(payload.reason),
          error: clean(payload.error)
        }
      });

      res.status(202).json({ ok: true });
    } catch (error) {
      console.error('Failed to capture marketing analytics event:', error);
      res.status(500).json({ error: 'Failed to capture marketing analytics event.' });
    }
  });

  return router;
};

module.exports = {
  buildMarketingAnalyticsRouter,
  sanitizeAttribution
};
