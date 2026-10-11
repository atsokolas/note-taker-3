const express = require('express');
const mongoose = require('mongoose');
const { KINDS, listRevisions } = require('../services/entryHistory');

/* The history of one note, concept or question, newest first. */
const buildEntryHistoryRouter = ({ authenticateToken, EntryRevision }) => {
  const router = express.Router();
  router.get('/api/think/history/:kind/:id', authenticateToken, async (req, res) => {
    const { kind, id } = req.params;
    if (!KINDS.includes(kind) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'That entry has no history.' });
    }
    try {
      res.set('Cache-Control', 'no-store');
      return res.json({ revisions: await listRevisions({ EntryRevision, userId: req.user.id, kind, entryId: id }) });
    } catch (error) {
      console.error('Entry history failed:', error);
      return res.status(500).json({ error: 'Could not read this history.' });
    }
  });
  return router;
};

module.exports = { buildEntryHistoryRouter };
