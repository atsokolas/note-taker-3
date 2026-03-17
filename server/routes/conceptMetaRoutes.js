const express = require('express');

const buildConceptMetaRouter = ({
  authenticateToken,
  getConcepts,
  getConceptMeta,
  updateConceptMeta,
  getConceptRelated,
  TagMeta,
  escapeRegExp,
  trackEvent,
  EVENT_NAMES
}) => {
  const router = express.Router();

  router.get('/api/concepts', authenticateToken, async (req, res) => {
    try {
      const data = await getConcepts(req.user.id);
      res.status(200).json(data);
    } catch (error) {
      console.error('❌ Error fetching concepts:', error);
      res.status(500).json({ error: 'Failed to fetch concepts.' });
    }
  });

  router.get('/api/concepts/:name', authenticateToken, async (req, res) => {
    try {
      const data = await getConceptMeta(req.user.id, req.params.name);
      res.status(200).json(data);
    } catch (error) {
      console.error('❌ Error fetching concept meta:', error);
      res.status(500).json({ error: 'Failed to fetch concept meta.' });
    }
  });

  router.put('/api/concepts/:name', authenticateToken, async (req, res) => {
    try {
      const conceptName = String(req.params.name || '').trim();
      const existing = await TagMeta.findOne({
        userId: req.user.id,
        name: new RegExp(`^${escapeRegExp(conceptName)}$`, 'i')
      }).select('_id');
      const updated = await updateConceptMeta(req.user.id, req.params.name, req.body || {});
      if (!existing && updated?._id) {
        trackEvent({
          event: EVENT_NAMES.CONCEPT_CREATED,
          userId: req.user.id,
          requestId: req.requestId,
          properties: {
            conceptId: String(updated._id),
            conceptName: String(updated.name || conceptName).trim()
          }
        });
        trackEvent({
          event: EVENT_NAMES.WORKSPACE_CREATED,
          userId: req.user.id,
          requestId: req.requestId,
          properties: {
            workspaceType: 'concept',
            conceptId: String(updated._id),
            conceptName: String(updated.name || conceptName).trim()
          }
        });
      }
      res.status(200).json(updated);
    } catch (error) {
      console.error('❌ Error updating concept meta:', error);
      res.status(500).json({ error: 'Failed to update concept meta.' });
    }
  });

  router.get('/api/concepts/:name/related', authenticateToken, async (req, res) => {
    try {
      const { limit = 20, offset = 0 } = req.query;
      const data = await getConceptRelated(req.user.id, req.params.name, { limit, offset });
      res.status(200).json(data);
    } catch (error) {
      console.error('❌ Error fetching concept related data:', error);
      res.status(500).json({ error: 'Failed to fetch concept related data.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptMetaRouter
};
