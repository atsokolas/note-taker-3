const express = require('express');

const projectThought = (note) => ({
  itemId: note.editionContext.itemId,
  content: note.content,
  quote: note.editionContext.quote || '',
  revision: note.editionContext.revision,
  updatedAt: note.updatedAt
});

/** Existing private Note storage, addressed by issue + finding, never a filing. */
const buildEditionThoughtRouter = ({ auth, humanOnly, Edition, Note }) => {
  const router = express.Router();
  const path = '/api/editions/:id/thoughts';
  const owned = async (req, res, next) => {
    try {
      const edition = await Edition.findOne({ _id: req.params.id, userId: req.user.id }).lean();
      if (!edition) return res.status(404).json({ error: 'Edition not found.' });
      req.thoughtEdition = edition;
      next();
    } catch (error) {
      res
        .status(error.name === 'CastError' ? 404 : 500)
        .json({ error: 'This issue could not open.' });
    }
  };
  router.get(path, auth, humanOnly, owned, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const notes = await Note.find({
        userId: req.user.id,
        'editionContext.editionId': req.thoughtEdition._id
      }).lean();
      res.json({ thoughts: notes.map(projectThought) });
    } catch (_) {
      res.status(500).json({ error: 'Your thoughts could not load.' });
    }
  });
  router.put(path, auth, humanOnly, owned, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { itemId = '', content, quote = '', revision } = req.body || {};
    if (
      typeof itemId !== 'string' ||
      typeof content !== 'string' ||
      content.length > 6000 ||
      typeof quote !== 'string' ||
      quote.length > 1000 ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    ) {
      return res.status(400).json({ error: 'A thought needs text and its saved version.' });
    }
    const item = req.thoughtEdition.items?.find((row) => row.itemId === itemId);
    if (itemId && !item) return res.status(404).json({ error: 'Finding not found in this issue.' });
    const scope = {
      userId: req.user.id,
      'editionContext.editionId': req.thoughtEdition._id,
      'editionContext.itemId': itemId
    };
    const fields = {
      title: item ? `On ${item.title}` : `After ${req.thoughtEdition.title}`,
      content,
      editionContext: { editionId: req.thoughtEdition._id, itemId, quote, revision: revision + 1 }
    };
    try {
      // First write is uniquely constrained; subsequent writes compare versions.
      // Never upsert a failed comparison into a second copy.
      const note =
        revision === 0
          ? await Note.create({ userId: req.user.id, ...fields })
          : await Note.findOneAndUpdate(
              { ...scope, 'editionContext.revision': revision },
              { $set: fields },
              { new: true, runValidators: true }
            );
      if (!note)
        return res
          .status(409)
          .json({ error: 'This thought changed elsewhere. Keep your draft and reload.' });
      res.json(projectThought(note));
    } catch (error) {
      res
        .status(error.code === 11000 ? 409 : 500)
        .json({
          error:
            error.code === 11000
              ? 'This thought already has a saved version. Keep your draft and reload.'
              : 'Your thought did not save.'
        });
    }
  });
  return router;
};
module.exports = { buildEditionThoughtRouter, projectThought };
