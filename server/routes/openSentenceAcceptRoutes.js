const express = require('express');
const {
  OpenSentenceAcceptError,
  planOpenedSentenceAccept,
  applyOpenedSentenceAccept
} = require('../services/openSentenceAcceptService');
const { createWikiRevision, snapshotPage } = require('../services/wikiRevisionService');

const buildOpenSentenceAcceptRouter = ({
  authenticateToken,
  WikiRevision,
  findOwnedPage,
  serializePage,
  onPageChanged = async () => {}
}) => {
  const router = express.Router();

  router.post('/api/wiki/pages/:id/open-sentence/accept', authenticateToken, async (req, res) => {
    try {
      if (req.agentToken) {
        return res.status(403).json({ error: 'Only the human owner can accept a wording.' });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const plan = planOpenedSentenceAccept({
        page,
        claimId: req.body?.claimId,
        against: req.body?.against,
        text: req.body?.text
      });
      const before = snapshotPage(page);
      applyOpenedSentenceAccept({ page, plan });
      await page.save();
      await onPageChanged(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Accepted a proposed wording on "${page.title}".`
      });
      return res.status(200).json(serializePage(page));
    } catch (error) {
      if (error instanceof OpenSentenceAcceptError) {
        return res.status(error.status).json({ code: error.code, error: error.message });
      }
      console.error('Error accepting opened-sentence wording:', error);
      return res.status(500).json({ error: 'Failed to accept the wording.' });
    }
  });

  return router;
};

module.exports = { buildOpenSentenceAcceptRouter };
