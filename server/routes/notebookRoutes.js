const express = require('express');

const buildNotebookRouter = ({
  authenticateToken,
  NotebookEntry,
  NotebookFolder,
  ReferenceEdge,
  ensureNotebookBlocks,
  createBlockId,
  stripHtml,
  normalizeItemType,
  parseClaimId,
  normalizeTags,
  syncNotebookReferences,
  enqueueNotebookEmbedding,
  trackEvent,
  EVENT_NAMES,
  findHighlightById
}) => {
  const router = express.Router();

  router.get('/api/notebook', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const entries = await NotebookEntry.find({ userId }).sort({ updatedAt: -1 });
      const normalized = await Promise.all(entries.map(async entry => {
        const hadBlocks = Array.isArray(entry.blocks) && entry.blocks.length > 0;
        ensureNotebookBlocks(entry, createBlockId);
        if (!hadBlocks && entry.blocks?.length) {
          await entry.save();
        }
        return entry;
      }));
      res.status(200).json(normalized);
    } catch (error) {
      console.error("❌ Error fetching notebook entries:", error);
      res.status(500).json({ error: "Failed to fetch notebook entries." });
    }
  });

  router.post('/api/notebook', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { title, content, blocks, folder, tags, linkedArticleId, type, claimId, source } = req.body;
      const nextBlocks = Array.isArray(blocks)
        ? blocks
        : (stripHtml(content || '') ? [{ id: createBlockId(), type: 'paragraph', text: stripHtml(content || '') }] : []);
      const nextType = normalizeItemType(type, 'note');
      const nextClaimId = nextType === 'evidence' ? parseClaimId(claimId) : null;
      if (nextType === 'evidence' && claimId !== undefined && claimId !== null && claimId !== '' && !nextClaimId) {
        return res.status(400).json({ error: 'Invalid claimId.' });
      }
      if (nextType === 'evidence' && nextClaimId) {
        const linkedClaim = await NotebookEntry.findOne({ _id: nextClaimId, userId }).select('type');
        if (!linkedClaim || normalizeItemType(linkedClaim.type, 'note') !== 'claim') {
          return res.status(400).json({ error: 'claimId must reference one of your claim notes.' });
        }
      }
      const newEntry = new NotebookEntry({
        title: (title || 'Untitled').trim(),
        content: content || '',
        blocks: nextBlocks,
        folder: folder || null,
        type: nextType,
        claimId: nextClaimId,
        tags: normalizeTags(tags),
        linkedArticleId: linkedArticleId || null,
        userId
      });
      await newEntry.save();
      if (Array.isArray(nextBlocks)) {
        await syncNotebookReferences(userId, newEntry._id, nextBlocks);
      }
      enqueueNotebookEmbedding(newEntry);
      trackEvent({
        event: EVENT_NAMES.WORKSPACE_CREATED,
        userId,
        requestId: req.requestId,
        properties: {
          workspaceType: 'notebook',
          source: String(source || '').trim() || 'direct',
          entryId: String(newEntry._id),
          blockCount: nextBlocks.length
        }
      });
      if (String(source || '').trim()) {
        trackEvent({
          event: EVENT_NAMES.CAPTURE_COMPLETED,
          userId,
          requestId: req.requestId,
          properties: {
            source: String(source || '').trim(),
            entryId: String(newEntry._id),
            importedNotes: 1
          }
        });
      }
      res.status(201).json(newEntry);
    } catch (error) {
      console.error("❌ Error creating notebook entry:", error);
      res.status(500).json({ error: "Failed to create notebook entry." });
    }
  });

  router.get('/api/notebook/organize/claims', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const queryText = String(req.query.q || '').trim();
      const query = { userId, type: 'claim' };
      if (queryText) {
        const regex = new RegExp(queryText, 'i');
        query.$or = [
          { title: regex },
          { content: regex },
          { tags: regex }
        ];
      }
      const claims = await NotebookEntry.find(query)
        .sort({ updatedAt: -1 })
        .limit(30)
        .select('_id title tags updatedAt');
      res.status(200).json(claims);
    } catch (error) {
      console.error("❌ Error fetching notebook claims:", error);
      res.status(500).json({ error: 'Failed to fetch claims.' });
    }
  });

  router.get('/api/notebook/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const entry = await NotebookEntry.findOne({ _id: id, userId });
      if (!entry) {
        return res.status(404).json({ error: "Notebook entry not found." });
      }
      const hadBlocks = Array.isArray(entry.blocks) && entry.blocks.length > 0;
      ensureNotebookBlocks(entry, createBlockId);
      if (!hadBlocks && entry.blocks?.length) {
        await entry.save();
      }
      res.status(200).json(entry);
    } catch (error) {
      console.error("❌ Error fetching notebook entry:", error);
      res.status(500).json({ error: "Failed to fetch notebook entry." });
    }
  });

  router.patch('/api/notebook/:id/organize', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { type, tags, claimId } = req.body || {};
      const entry = await NotebookEntry.findOne({ _id: id, userId });
      if (!entry) {
        return res.status(404).json({ error: 'Notebook entry not found.' });
      }

      const hasType = type !== undefined;
      const nextType = hasType ? normalizeItemType(type, '') : normalizeItemType(entry.type, 'note');
      if (hasType && !nextType) {
        return res.status(400).json({ error: 'type must be one of claim, evidence, note.' });
      }

      let nextClaimId = claimId !== undefined ? parseClaimId(claimId) : entry.claimId;
      if (claimId !== undefined && claimId !== null && claimId !== '' && !nextClaimId) {
        return res.status(400).json({ error: 'Invalid claimId.' });
      }

      if (nextType !== 'evidence') {
        nextClaimId = null;
      }

      if (nextType === 'evidence' && nextClaimId) {
        const linkedClaim = await NotebookEntry.findOne({ _id: nextClaimId, userId }).select('_id type');
        if (!linkedClaim || normalizeItemType(linkedClaim.type, 'note') !== 'claim') {
          return res.status(400).json({ error: 'claimId must reference one of your claim notes.' });
        }
        if (String(linkedClaim._id) === String(entry._id)) {
          return res.status(400).json({ error: 'An evidence note cannot link to itself as a claim.' });
        }
      }

      if (hasType) entry.type = nextType;
      if (tags !== undefined) entry.tags = normalizeTags(tags);
      entry.claimId = nextClaimId;
      await entry.save();
      res.status(200).json(entry);
    } catch (error) {
      console.error("❌ Error organizing notebook entry:", error);
      res.status(500).json({ error: 'Failed to organize notebook entry.' });
    }
  });

  router.post('/api/notebook/:id/link-claim', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const claimObjectId = parseClaimId(req.body?.claimId);
      if (!claimObjectId) {
        return res.status(400).json({ error: 'claimId is required.' });
      }

      const evidence = await NotebookEntry.findOne({ _id: id, userId });
      if (!evidence) {
        return res.status(404).json({ error: 'Notebook entry not found.' });
      }
      const claim = await NotebookEntry.findOne({ _id: claimObjectId, userId }).select('_id type');
      if (!claim || normalizeItemType(claim.type, 'note') !== 'claim') {
        return res.status(400).json({ error: 'claimId must reference one of your claim notes.' });
      }
      if (String(claim._id) === String(evidence._id)) {
        return res.status(400).json({ error: 'An evidence note cannot link to itself as a claim.' });
      }

      evidence.type = 'evidence';
      evidence.claimId = claim._id;
      await evidence.save();
      res.status(200).json(evidence);
    } catch (error) {
      console.error("❌ Error linking note evidence to claim:", error);
      res.status(500).json({ error: 'Failed to link evidence to claim.' });
    }
  });

  router.get('/api/notebook/:id/claim', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const claim = await NotebookEntry.findOne({ _id: id, userId });
      if (!claim) {
        return res.status(404).json({ error: 'Notebook entry not found.' });
      }
      if (normalizeItemType(claim.type, 'note') !== 'claim') {
        return res.status(400).json({ error: 'Requested notebook entry is not a claim.' });
      }
      const evidence = await NotebookEntry.find({
        userId,
        type: 'evidence',
        claimId: claim._id
      }).sort({ createdAt: -1 });
      res.status(200).json({ claim, evidence });
    } catch (error) {
      console.error("❌ Error fetching note claim evidence:", error);
      res.status(500).json({ error: 'Failed to fetch claim evidence.' });
    }
  });

  router.post('/api/notebook/:id/link-highlight', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { highlightId } = req.body;
      if (!highlightId) {
        return res.status(400).json({ error: "highlightId is required." });
      }
      const updated = await NotebookEntry.findOneAndUpdate(
        { _id: id, userId },
        { $addToSet: { linkedHighlightIds: highlightId } },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ error: "Notebook entry not found." });
      }
      res.status(200).json(updated);
    } catch (error) {
      console.error("❌ Error linking highlight to notebook:", error);
      res.status(500).json({ error: "Failed to link highlight." });
    }
  });

  router.post('/api/notebook/:id/append-highlight', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { highlightId } = req.body;
      if (!highlightId) return res.status(400).json({ error: "highlightId is required." });
      const entry = await NotebookEntry.findOne({ _id: id, userId });
      if (!entry) return res.status(404).json({ error: "Notebook entry not found." });
      const highlight = await findHighlightById(userId, highlightId);
      if (!highlight) return res.status(404).json({ error: "Highlight not found." });

      const hasBlock = (entry.blocks || []).some(block => {
        const blockType = block.type || '';
        return (blockType === 'highlight-ref' || blockType === 'highlight_embed')
          && String(block.highlightId) === String(highlightId);
      });
      if (!hasBlock) {
        entry.blocks = entry.blocks || [];
        entry.blocks.push({
          id: createBlockId(),
          type: 'highlight_embed',
          text: highlight.text || '',
          highlightId
        });
      }
      entry.linkedHighlightIds = entry.linkedHighlightIds || [];
      if (!entry.linkedHighlightIds.some(id => String(id) === String(highlightId))) {
        entry.linkedHighlightIds.push(highlightId);
      }
      await entry.save();
      await syncNotebookReferences(userId, entry._id, entry.blocks || []);
      res.status(200).json(entry);
    } catch (error) {
      console.error("❌ Error appending highlight to notebook:", error);
      res.status(500).json({ error: "Failed to append highlight." });
    }
  });

  router.put('/api/notebook/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { title, content, blocks, folder, tags, linkedArticleId, type, claimId } = req.body;
      const updates = {};
      if (title !== undefined) updates.title = title.trim() || 'Untitled';
      if (content !== undefined) updates.content = content;
      if (blocks !== undefined) {
        updates.blocks = Array.isArray(blocks) ? blocks : [];
      } else if (content !== undefined) {
        const text = stripHtml(content || '');
        updates.blocks = text ? [{ id: createBlockId(), type: 'paragraph', text }] : [];
      }
      if (folder !== undefined) updates.folder = folder || null;
      if (tags !== undefined) updates.tags = normalizeTags(tags);
      if (linkedArticleId !== undefined) updates.linkedArticleId = linkedArticleId || null;
      if (type !== undefined) {
        const nextType = normalizeItemType(type, '');
        if (!nextType) {
          return res.status(400).json({ error: 'type must be one of claim, evidence, note.' });
        }
        updates.type = nextType;
        if (nextType !== 'evidence') {
          updates.claimId = null;
        }
      }
      if (claimId !== undefined) {
        const nextClaimId = parseClaimId(claimId);
        if (claimId !== null && claimId !== '' && !nextClaimId) {
          return res.status(400).json({ error: 'Invalid claimId.' });
        }
        updates.claimId = nextClaimId;
      }

      let effectiveType = updates.type;
      if (!effectiveType) {
        const existing = await NotebookEntry.findOne({ _id: id, userId }).select('type');
        if (!existing) {
          return res.status(404).json({ error: "Notebook entry not found." });
        }
        effectiveType = normalizeItemType(existing.type, 'note');
      }
      if (effectiveType !== 'evidence') {
        if (updates.claimId) {
          return res.status(400).json({ error: 'claimId can only be set when type is evidence.' });
        }
        if (updates.claimId !== undefined) {
          updates.claimId = null;
        }
      }
      const needsClaimValidation = effectiveType === 'evidence' && updates.claimId !== undefined;
      if (needsClaimValidation) {
        if (!updates.claimId) {
          updates.claimId = null;
        } else {
          const linkedClaim = await NotebookEntry.findOne({ _id: updates.claimId, userId }).select('_id type');
          if (!linkedClaim || normalizeItemType(linkedClaim.type, 'note') !== 'claim') {
            return res.status(400).json({ error: 'claimId must reference one of your claim notes.' });
          }
          if (String(linkedClaim._id) === String(id)) {
            return res.status(400).json({ error: 'An evidence note cannot link to itself as a claim.' });
          }
        }
      }

      const updated = await NotebookEntry.findOneAndUpdate(
        { _id: id, userId },
        updates,
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ error: "Notebook entry not found." });
      }
      if (Array.isArray(blocks)) {
        await syncNotebookReferences(userId, updated._id, blocks);
      }
      enqueueNotebookEmbedding(updated);
      res.status(200).json(updated);
    } catch (error) {
      console.error("❌ Error updating notebook entry:", error);
      res.status(500).json({ error: "Failed to update notebook entry." });
    }
  });

  router.delete('/api/notebook/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const deleted = await NotebookEntry.findOneAndDelete({ _id: id, userId });
      if (!deleted) {
        return res.status(404).json({ error: "Notebook entry not found." });
      }
      await ReferenceEdge.deleteMany({ userId, sourceType: 'notebook', sourceId: id });
      res.status(200).json({ message: "Notebook entry deleted." });
    } catch (error) {
      console.error("❌ Error deleting notebook entry:", error);
      res.status(500).json({ error: "Failed to delete notebook entry." });
    }
  });

  router.get('/api/notebook/folders', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const folders = await NotebookFolder.find({ userId }).sort({ name: 1 });
      res.status(200).json(folders);
    } catch (error) {
      console.error("❌ Error fetching notebook folders:", error);
      res.status(500).json({ error: "Failed to fetch folders." });
    }
  });

  router.post('/api/notebook/folders', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Folder name is required." });
      }
      const folder = new NotebookFolder({ name: name.trim(), userId });
      await folder.save();
      res.status(201).json(folder);
    } catch (error) {
      console.error("❌ Error creating notebook folder:", error);
      res.status(500).json({ error: "Failed to create folder." });
    }
  });

  router.delete('/api/notebook/folders/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const deleted = await NotebookFolder.findOneAndDelete({ _id: id, userId });
      if (!deleted) {
        return res.status(404).json({ error: "Folder not found." });
      }
      await NotebookEntry.updateMany({ userId, folder: id }, { $set: { folder: null } });
      res.status(200).json({ message: "Folder deleted." });
    } catch (error) {
      console.error("❌ Error deleting notebook folder:", error);
      res.status(500).json({ error: "Failed to delete folder." });
    }
  });

  return router;
};

module.exports = { buildNotebookRouter };
