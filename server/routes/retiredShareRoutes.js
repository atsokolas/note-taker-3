const express = require('express');
const { settledPageFor } = require('../services/settlement');

/* Think no longer publishes; finished thinking settles into Wiki and is shared
   from there. A link saved from when Think did publish still answers: it opens
   the settled wiki page when that page is shared, and otherwise says so in one
   line. Nothing about the old copy is read back out. */
const NO_LONGER_SHARED = 'This piece is no longer shared here.';

const buildRetiredShareRouter = ({ SharedNotebook, SharedConcept, TagMeta, WikiPage }) => {
  const router = express.Router();

  const settledFrom = {
    notebooks: async (slug) => {
      const share = await SharedNotebook.findOne({ slug }).select('userId notebookId').lean();
      return share && { userId: share.userId, kind: 'notebook', id: share.notebookId };
    },
    concepts: async (slug) => {
      const share = await SharedConcept.findOne({ slug }).select('userId conceptName').lean();
      const concept = share && await TagMeta.findOne({ userId: share.userId, name: share.conceptName }).select('_id').lean();
      return concept && { userId: share.userId, kind: 'concepts', id: concept._id };
    },
    volumes: async () => null
  };

  router.get('/api/public/retired/:kind(notebooks|concepts|volumes)/:slug', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const origin = await settledFrom[req.params.kind](String(req.params.slug || '').trim());
      const page = origin && await settledPageFor({ WikiPage, ...origin }).where({ visibility: 'shared' }).select('_id').lean();
      if (page) return res.status(200).json({ to: `/share/wiki/${page._id}` });
    } catch (error) {
      console.error('Error resolving a retired share link:', error);
    }
    return res.status(410).json({ error: NO_LONGER_SHARED });
  });

  return router;
};

module.exports = { buildRetiredShareRouter };
