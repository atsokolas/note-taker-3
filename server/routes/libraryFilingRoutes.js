const express = require('express');
const { persistNoeisReceipt } = require('../services/noeisReceiptService');

const buildLibraryFilingRouter = ({
  authenticateToken,
  stageLibraryFilingSuggestions,
  NoeisReceipt = null
}) => {
  const router = express.Router();

  router.post('/api/library/filing-suggestions', authenticateToken, async (req, res) => {
    try {
      const result = await stageLibraryFilingSuggestions({
        userId: String(req.user.id),
        resumeExisting: Boolean(req.body?.resumeExisting),
        actor: {
          actorType: 'user',
          actorId: String(req.user.id)
        }
      });
      if (result?.receipt) {
        await persistNoeisReceipt({
          NoeisReceipt,
          userId: String(req.user.id),
          receipt: result.receipt
        });
      }
      return res.status(result?.reused ? 200 : 201).json(result);
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 400 && status < 500) {
        return res.status(status).json({ error: error.message || 'Invalid library filing request.' });
      }
      console.error('❌ Error staging library filing suggestions:', error);
      return res.status(500).json({ error: 'Failed to stage library filing suggestions.' });
    }
  });

  return router;
};

module.exports = {
  buildLibraryFilingRouter
};
