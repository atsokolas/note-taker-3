const express = require('express');
const mongoose = require('mongoose');

const OPEN = 8;

const shown = row => ({ id: String(row._id), a: row.a, b: row.b, at: row.createdAt });

// Where agents disagree, open ones newest first: the brief carries them too.
const openDisagreements = async ({ Disagreement, userId }) => (
  Disagreement ? (await Disagreement.find({ userId, settledAt: null }).sort({ createdAt: -1 }).limit(OPEN).lean()).map(shown) : []
);

const buildDisagreementRouter = ({ authenticateToken, humanOnly, Disagreement }) => {
  const router = express.Router();

  router.get('/api/disagreements', authenticateToken, async (req, res) => {
    try {
      return res.json({ disagreements: await openDisagreements({ Disagreement, userId: req.user.id }) });
    } catch (error) {
      console.error('[disagreements] list failed', error.message);
      return res.status(500).json({ error: 'Disagreements could not be listed.' });
    }
  });

  // The reader settles it: they have taken a side, or seen it is no contradiction.
  router.post('/api/disagreements/:id/settle', authenticateToken, humanOnly, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'No disagreement of yours has that id.' });
    const { matchedCount } = await Disagreement.updateOne({ _id: req.params.id, userId: req.user.id, settledAt: null }, { $set: { settledAt: new Date() } });
    if (!matchedCount) return res.status(404).json({ error: 'No open disagreement of yours has that id.' });
    return res.json({ id: req.params.id, settled: true });
  });

  return router;
};

module.exports = { buildDisagreementRouter, openDisagreements };
