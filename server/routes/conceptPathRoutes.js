const express = require('express');

const buildConceptPathRouter = ({
  authenticateToken,
  ConceptPath,
  ConceptPathProgress,
  normalizePathItemRefsInput,
  sortPathItemRefs,
  normalizeConceptPathItemType,
  normalizeConceptPathNotes,
  ensureConceptPathOwnership,
  getConceptPathWithProgress,
  resolveConnectionItem
}) => {
  const router = express.Router();

  router.get('/api/concept-paths', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const paths = await ConceptPath.find({ userId })
        .sort({ updatedAt: -1 })
        .lean();
      const progressRows = await ConceptPathProgress.find({ userId, pathId: { $in: paths.map(path => path._id) } }).lean();
      const progressMap = new Map(progressRows.map(row => [String(row.pathId), row]));
      const summaries = paths.map(path => {
        const progress = progressMap.get(String(path._id));
        return {
          _id: path._id,
          title: path.title,
          description: path.description || '',
          createdAt: path.createdAt,
          updatedAt: path.updatedAt,
          itemCount: Array.isArray(path.itemRefs) ? path.itemRefs.length : 0,
          progress: {
            understoodCount: (progress?.understoodItemRefIds || []).length,
            currentIndex: progress?.currentIndex || 0
          }
        };
      });
      res.status(200).json(summaries);
    } catch (error) {
      console.error('❌ Error listing concept paths:', error);
      res.status(500).json({ error: 'Failed to list concept paths.' });
    }
  });

  router.post('/api/concept-paths', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        title = '',
        description = '',
        itemRefs = [],
        startItem = null
      } = req.body || {};
      const safeTitle = String(title || '').trim().slice(0, 140);
      if (!safeTitle) {
        return res.status(400).json({ error: 'title is required.' });
      }

      const normalizedRefs = normalizePathItemRefsInput(itemRefs);
      if (startItem && typeof startItem === 'object') {
        const startType = normalizeConceptPathItemType(startItem.type);
        const startId = String(startItem.id || '').trim();
        if (startType && startId && !normalizedRefs.some(item => item.type === startType && item.id === startId)) {
          normalizedRefs.unshift({
            type: startType,
            id: startId,
            order: 0,
            notes: normalizeConceptPathNotes(startItem.notes)
          });
        }
      }
      const orderedRefs = sortPathItemRefs(normalizedRefs);
      const validation = await Promise.all(orderedRefs.map(item => resolveConnectionItem(userId, item.type, item.id)));
      if (validation.some(item => !item)) {
        return res.status(400).json({ error: 'One or more path items are invalid for this user.' });
      }

      const created = await ConceptPath.create({
        title: safeTitle,
        description: String(description || '').trim().slice(0, 500),
        itemRefs: orderedRefs,
        userId
      });
      const response = await getConceptPathWithProgress(userId, created);
      res.status(201).json(response);
    } catch (error) {
      console.error('❌ Error creating concept path:', error);
      res.status(500).json({ error: 'Failed to create concept path.' });
    }
  });

  router.get('/api/concept-paths/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const path = await ensureConceptPathOwnership(userId, req.params.id);
      if (!path) return res.status(404).json({ error: 'Concept path not found.' });
      const response = await getConceptPathWithProgress(userId, path);
      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error fetching concept path:', error);
      res.status(500).json({ error: 'Failed to fetch concept path.' });
    }
  });

  router.put('/api/concept-paths/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const path = await ensureConceptPathOwnership(userId, req.params.id);
      if (!path) return res.status(404).json({ error: 'Concept path not found.' });

      const { title, description, itemRefs } = req.body || {};
      if (title !== undefined) {
        const safeTitle = String(title || '').trim().slice(0, 140);
        if (!safeTitle) return res.status(400).json({ error: 'title cannot be empty.' });
        path.title = safeTitle;
      }
      if (description !== undefined) {
        path.description = String(description || '').trim().slice(0, 500);
      }
      if (itemRefs !== undefined) {
        const normalizedRefs = normalizePathItemRefsInput(itemRefs);
        const validation = await Promise.all(normalizedRefs.map(item => resolveConnectionItem(userId, item.type, item.id)));
        if (validation.some(item => !item)) {
          return res.status(400).json({ error: 'One or more path items are invalid for this user.' });
        }
        path.itemRefs = normalizedRefs;
      }
      await path.save();

      const progress = await ConceptPathProgress.findOne({ userId, pathId: path._id });
      if (progress) {
        const validIds = new Set((path.itemRefs || []).map(ref => String(ref._id)));
        progress.understoodItemRefIds = (progress.understoodItemRefIds || []).filter(id => validIds.has(String(id)));
        progress.currentIndex = Math.max(0, Math.min(progress.currentIndex || 0, Math.max((path.itemRefs || []).length - 1, 0)));
        await progress.save();
      }

      const response = await getConceptPathWithProgress(userId, path);
      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error updating concept path:', error);
      res.status(500).json({ error: 'Failed to update concept path.' });
    }
  });

  router.delete('/api/concept-paths/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const path = await ensureConceptPathOwnership(userId, req.params.id);
      if (!path) return res.status(404).json({ error: 'Concept path not found.' });
      await Promise.all([
        ConceptPath.deleteOne({ _id: path._id, userId }),
        ConceptPathProgress.deleteOne({ pathId: path._id, userId })
      ]);
      res.status(200).json({ message: 'Concept path deleted.' });
    } catch (error) {
      console.error('❌ Error deleting concept path:', error);
      res.status(500).json({ error: 'Failed to delete concept path.' });
    }
  });

  router.post('/api/concept-paths/:id/items', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const path = await ensureConceptPathOwnership(userId, req.params.id);
      if (!path) return res.status(404).json({ error: 'Concept path not found.' });

      const safeType = normalizeConceptPathItemType(req.body?.type);
      const safeId = String(req.body?.id || '').trim();
      const safeNotes = normalizeConceptPathNotes(req.body?.notes);
      const position = Number.isFinite(Number(req.body?.position)) ? Number(req.body.position) : (path.itemRefs || []).length;
      if (!safeType || !safeId) {
        return res.status(400).json({ error: 'type and id are required.' });
      }
      const resolved = await resolveConnectionItem(userId, safeType, safeId);
      if (!resolved) {
        return res.status(400).json({ error: 'Item not found for this user.' });
      }
      const hasDuplicate = (path.itemRefs || []).some(item => item.type === safeType && item.id === safeId);
      if (hasDuplicate) {
        return res.status(409).json({ error: 'Item already exists in this path.' });
      }

      const nextRefs = [...(path.itemRefs || [])];
      const boundedPosition = Math.max(0, Math.min(position, nextRefs.length));
      nextRefs.splice(boundedPosition, 0, {
        type: safeType,
        id: safeId,
        order: boundedPosition,
        notes: safeNotes
      });
      path.itemRefs = sortPathItemRefs(nextRefs);
      await path.save();
      const response = await getConceptPathWithProgress(userId, path);
      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error adding path item:', error);
      res.status(500).json({ error: 'Failed to add path item.' });
    }
  });

  router.patch('/api/concept-paths/:id/items/reorder', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const path = await ensureConceptPathOwnership(userId, req.params.id);
      if (!path) return res.status(404).json({ error: 'Concept path not found.' });

      const itemRefIds = Array.isArray(req.body?.itemRefIds) ? req.body.itemRefIds.map(value => String(value || '').trim()) : [];
      if (itemRefIds.length !== (path.itemRefs || []).length) {
        return res.status(400).json({ error: 'itemRefIds must include all path item ids.' });
      }
      const existingMap = new Map((path.itemRefs || []).map(item => [String(item._id), item.toObject ? item.toObject() : item]));
      if (itemRefIds.some(id => !existingMap.has(id))) {
        return res.status(400).json({ error: 'itemRefIds contains unknown values.' });
      }
      const reordered = itemRefIds.map((id, index) => ({
        ...existingMap.get(id),
        order: index
      }));
      path.itemRefs = reordered;
      await path.save();
      const response = await getConceptPathWithProgress(userId, path);
      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error reordering path items:', error);
      res.status(500).json({ error: 'Failed to reorder path items.' });
    }
  });

  router.patch('/api/concept-paths/:id/items/:itemRefId', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const path = await ensureConceptPathOwnership(userId, req.params.id);
      if (!path) return res.status(404).json({ error: 'Concept path not found.' });
      const itemRef = (path.itemRefs || []).find(item => String(item._id) === String(req.params.itemRefId));
      if (!itemRef) return res.status(404).json({ error: 'Path item not found.' });
      if (req.body?.notes !== undefined) {
        itemRef.notes = normalizeConceptPathNotes(req.body.notes);
      }
      await path.save();
      const response = await getConceptPathWithProgress(userId, path);
      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error updating path item:', error);
      res.status(500).json({ error: 'Failed to update path item.' });
    }
  });

  router.delete('/api/concept-paths/:id/items/:itemRefId', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const path = await ensureConceptPathOwnership(userId, req.params.id);
      if (!path) return res.status(404).json({ error: 'Concept path not found.' });
      const beforeCount = (path.itemRefs || []).length;
      path.itemRefs = sortPathItemRefs((path.itemRefs || []).filter(item => String(item._id) !== String(req.params.itemRefId)));
      if (path.itemRefs.length === beforeCount) {
        return res.status(404).json({ error: 'Path item not found.' });
      }
      await path.save();

      const progress = await ConceptPathProgress.findOne({ userId, pathId: path._id });
      if (progress) {
        const validIds = new Set((path.itemRefs || []).map(ref => String(ref._id)));
        progress.understoodItemRefIds = (progress.understoodItemRefIds || []).filter(id => validIds.has(String(id)));
        progress.currentIndex = Math.max(0, Math.min(progress.currentIndex || 0, Math.max(path.itemRefs.length - 1, 0)));
        await progress.save();
      }

      const response = await getConceptPathWithProgress(userId, path);
      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error removing path item:', error);
      res.status(500).json({ error: 'Failed to remove path item.' });
    }
  });

  router.patch('/api/concept-paths/:id/progress', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const path = await ensureConceptPathOwnership(userId, req.params.id);
      if (!path) return res.status(404).json({ error: 'Concept path not found.' });

      const validRefIds = new Set((path.itemRefs || []).map(ref => String(ref._id)));
      const {
        currentIndex,
        understoodItemRefIds,
        toggleItemRefId,
        understood
      } = req.body || {};

      const progress = await ConceptPathProgress.findOneAndUpdate(
        { userId, pathId: path._id },
        { $setOnInsert: { userId, pathId: path._id, understoodItemRefIds: [], currentIndex: 0 } },
        { new: true, upsert: true }
      );

      if (Array.isArray(understoodItemRefIds)) {
        progress.understoodItemRefIds = understoodItemRefIds
          .map(id => String(id || '').trim())
          .filter(id => validRefIds.has(id));
      }
      if (toggleItemRefId !== undefined) {
        const safeId = String(toggleItemRefId || '').trim();
        if (validRefIds.has(safeId)) {
          const set = new Set((progress.understoodItemRefIds || []).map(id => String(id)));
          const shouldMark = understood !== undefined ? Boolean(understood) : !set.has(safeId);
          if (shouldMark) set.add(safeId);
          else set.delete(safeId);
          progress.understoodItemRefIds = Array.from(set);
        }
      }
      if (currentIndex !== undefined) {
        const nextIndex = Number.isFinite(Number(currentIndex)) ? Number(currentIndex) : 0;
        progress.currentIndex = Math.max(0, Math.min(Math.round(nextIndex), Math.max((path.itemRefs || []).length - 1, 0)));
      } else {
        progress.currentIndex = Math.max(0, Math.min(progress.currentIndex || 0, Math.max((path.itemRefs || []).length - 1, 0)));
      }

      progress.understoodItemRefIds = (progress.understoodItemRefIds || []).filter(id => validRefIds.has(String(id)));
      await progress.save();
      res.status(200).json({
        understoodItemRefIds: progress.understoodItemRefIds || [],
        currentIndex: progress.currentIndex || 0
      });
    } catch (error) {
      console.error('❌ Error updating concept path progress:', error);
      res.status(500).json({ error: 'Failed to update concept path progress.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptPathRouter
};
