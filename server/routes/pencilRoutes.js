const express = require('express');
const mongoose = require('mongoose');

/* Inking: the reader takes up what an agent wrote, and it is theirs from
   then on. A note, an article (with every highlight on it), or one
   highlight. Only the reader inks; an agent cannot ink its own pencil. */
const buildPencilRouter = ({ authenticateToken, humanOnly, Article, NotebookEntry }) => {
  const router = express.Router();
  const valid = id => mongoose.isValidObjectId(id);

  const ink = {
    note: ({ userId, id }) => NotebookEntry.updateOne({ _id: id, userId }, { $set: { pencil: null } }),
    article: ({ userId, id }) => Article.updateOne({ _id: id, userId }, { $set: { pencil: null, 'highlights.$[].pencil': null } }),
    highlight: ({ userId, id, highlightId }) => Article.updateOne({ _id: id, userId, 'highlights._id': highlightId }, { $set: { 'highlights.$.pencil': null } })
  };

  router.post('/api/ink', authenticateToken, humanOnly, async (req, res) => {
    const { kind, id, highlightId } = req.body || {};
    if (!ink[kind] || !valid(id) || (kind === 'highlight' && !valid(highlightId))) {
      return res.status(400).json({ error: 'Name a note, an article or a highlight of yours to ink.' });
    }
    try {
      const { matchedCount } = await ink[kind]({ userId: req.user.id, id, highlightId });
      if (!matchedCount) return res.status(404).json({ error: 'Nothing of yours has that id.' });
      return res.json({ kind, id, ...(highlightId ? { highlightId } : {}), pencil: null });
    } catch (error) {
      console.error('[ink] failed', error.message);
      return res.status(500).json({ error: 'That could not be inked.' });
    }
  });

  return router;
};

module.exports = { buildPencilRouter };
