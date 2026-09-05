const express = require('express');

const STICKY_TARGETS = new Set(['article', 'highlight', 'claim', 'page']);
const STICKY_MAX = 140;

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const parseDueAt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
};

const buildStickyRouter = ({ authenticateToken, Sticky }) => {
  const router = express.Router();

  /* The pending stickies on one object, newest first. Done ones are gone,
     not listed: a resolved sticky deletes itself rather than archiving. */
  router.get(['/api/stickies', '/stickies'], authenticateToken, async (req, res) => {
    try {
      const targetType = clean(req.query?.targetType);
      const targetId = clean(req.query?.targetId);
      if (!STICKY_TARGETS.has(targetType) || !targetId) {
        return res.status(400).json({ error: 'targetType and targetId are required.' });
      }
      const rows = await Sticky
        .find({ userId: req.user.id, targetType, targetId, status: 'pending' })
        .sort({ createdAt: -1 })
        .lean();
      return res.json(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed reading stickies:', error);
      return res.status(500).json({ error: 'Could not read the pinned lines.' });
    }
  });

  router.post(['/api/stickies', '/stickies'], authenticateToken, async (req, res) => {
    try {
      const targetType = clean(req.body?.targetType);
      const targetId = clean(req.body?.targetId);
      const text = clean(req.body?.text);
      const targetTitle = clean(req.body?.targetTitle).slice(0, 200);
      const targetHref = clean(req.body?.targetHref).slice(0, 500);
      if (!STICKY_TARGETS.has(targetType) || !targetId) {
        return res.status(400).json({ error: 'targetType and targetId are required.' });
      }
      if (!text) {
        return res.status(400).json({ error: 'Write the line first.' });
      }
      if (text.length > STICKY_MAX) {
        return res.status(400).json({ error: `One line holds ${STICKY_MAX} characters.` });
      }
      const dueAt = parseDueAt(req.body?.dueAt);
      if (req.body?.dueAt !== null && req.body?.dueAt !== undefined && req.body?.dueAt !== '' && !dueAt) {
        return res.status(400).json({ error: 'Invalid dueAt value.' });
      }
      const row = await Sticky.create({
        userId: req.user.id,
        text,
        targetType,
        targetId,
        targetTitle,
        targetHref,
        dueAt,
        status: 'pending'
      });
      return res.status(201).json(row);
    } catch (error) {
      console.error('Failed writing sticky:', error);
      return res.status(500).json({ error: 'That did not save.' });
    }
  });

  /* One tap, no confirm. A sticky is 140 characters; asking "are you sure"
     about deleting one would be the product valuing its caution over the
     reader's time. */
  router.delete(['/api/stickies/:id', '/stickies/:id'], authenticateToken, async (req, res) => {
    try {
      const removed = await Sticky.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
      if (!removed) {
        return res.status(404).json({ error: 'Sticky not found or you do not have permission to remove it.' });
      }
      return res.status(200).json({ deleted: true });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid sticky ID format.' });
      }
      console.error('Failed removing sticky:', error);
      return res.status(500).json({ error: 'That did not save.' });
    }
  });

  return router;
};

module.exports = { buildStickyRouter, STICKY_TARGETS, STICKY_MAX };
