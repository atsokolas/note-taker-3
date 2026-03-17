const express = require('express');

const buildWorkingMemoryRouter = ({
  mongoose,
  authenticateToken,
  WorkingMemoryItem,
  NotebookEntry,
  TagMeta,
  ConceptNote,
  Question,
  normalizeWorkingMemoryStatus,
  activeWorkingMemoryStatusFilter,
  parseWorkingMemoryTags,
  normalizeWorkingMemoryIds,
  archiveWorkingMemoryItems,
  unarchiveWorkingMemoryItems,
  splitWorkingMemoryText,
  normalizeWorkingMemoryTarget,
  buildWorkingMemoryNotebookTitle,
  createBlockId,
  escapeRegExp,
  syncNotebookReferences,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding
}) => {
  const router = express.Router();

  router.get('/api/working-memory', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const workspaceType = String(req.query.workspaceType || 'global').trim();
      const workspaceId = String(req.query.workspaceId || '').trim();
      const requestedStatus = String(req.query.status || 'active').trim().toLowerCase();
      const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
      const query = { userId, workspaceType, workspaceId };
      if (requestedStatus !== 'all') {
        const safeStatus = normalizeWorkingMemoryStatus(requestedStatus, 'active');
        if (safeStatus === 'active') {
          query.$or = activeWorkingMemoryStatusFilter().$or;
        } else {
          query.status = safeStatus;
        }
      }
      const items = await WorkingMemoryItem.find(query).sort({ createdAt: -1 }).limit(limit);
      res.status(200).json(items);
    } catch (error) {
      console.error('❌ Error fetching working memory:', error);
      res.status(500).json({ error: 'Failed to fetch working memory.' });
    }
  });

  router.post('/api/working-memory', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        sourceType = '',
        sourceId = '',
        textSnippet = '',
        tags = [],
        workspaceType = 'global',
        workspaceId = ''
      } = req.body || {};
      const safeSnippet = String(textSnippet || '').trim().slice(0, 1200);
      if (!sourceType || !sourceId || !safeSnippet) {
        return res.status(400).json({
          error: 'sourceType, sourceId, and textSnippet are required.'
        });
      }
      const created = await WorkingMemoryItem.create({
        sourceType: String(sourceType).trim(),
        sourceId: String(sourceId).trim(),
        textSnippet: safeSnippet,
        tags: parseWorkingMemoryTags(tags),
        status: 'active',
        processedAt: null,
        processedReason: '',
        workspaceType: String(workspaceType || 'global').trim() || 'global',
        workspaceId: String(workspaceId || '').trim(),
        userId
      });
      res.status(201).json(created);
    } catch (error) {
      console.error('❌ Error creating working memory item:', error);
      res.status(500).json({ error: 'Failed to create working memory item.' });
    }
  });

  router.post('/api/working-memory/archive', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const ids = normalizeWorkingMemoryIds(req.body?.ids || []);
      if (ids.length === 0) {
        return res.status(400).json({ error: 'ids must include at least one valid item id.' });
      }
      const result = await archiveWorkingMemoryItems({
        userId,
        itemIds: ids,
        reason: 'archived'
      });
      res.status(200).json({
        archivedCount: Number(result.modifiedCount || 0),
        matchedCount: Number(result.matchedCount || 0)
      });
    } catch (error) {
      console.error('❌ Error archiving working memory items:', error);
      res.status(500).json({ error: 'Failed to archive working memory items.' });
    }
  });

  router.post('/api/working-memory/unarchive', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const ids = normalizeWorkingMemoryIds(req.body?.ids || []);
      if (ids.length === 0) {
        return res.status(400).json({ error: 'ids must include at least one valid item id.' });
      }
      const result = await unarchiveWorkingMemoryItems({
        userId,
        itemIds: ids
      });
      res.status(200).json({
        restoredCount: Number(result.modifiedCount || 0),
        matchedCount: Number(result.matchedCount || 0)
      });
    } catch (error) {
      console.error('❌ Error restoring working memory items:', error);
      res.status(500).json({ error: 'Failed to restore working memory items.' });
    }
  });

  router.post('/api/working-memory/:id/split', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid working memory id.' });
      }
      const mode = String(req.body?.mode || 'sentence').trim().toLowerCase();
      if (!['sentence', 'newline'].includes(mode)) {
        return res.status(400).json({ error: "mode must be 'sentence' or 'newline'." });
      }
      const item = await WorkingMemoryItem.findOne({
        _id: id,
        userId,
        ...activeWorkingMemoryStatusFilter()
      });
      if (!item) {
        return res.status(404).json({ error: 'Working memory item not found.' });
      }

      const chunks = splitWorkingMemoryText(item.textSnippet, mode);
      if (chunks.length < 2) {
        return res.status(400).json({ error: `Not enough ${mode} chunks to split.` });
      }

      const created = await WorkingMemoryItem.insertMany(
        chunks.map(chunk => ({
          sourceType: item.sourceType || 'working-memory-split',
          sourceId: item.sourceId || String(item._id),
          textSnippet: String(chunk).slice(0, 1200),
          tags: Array.isArray(item.tags) ? item.tags : [],
          status: 'active',
          processedAt: null,
          processedReason: '',
          workspaceType: item.workspaceType || 'global',
          workspaceId: item.workspaceId || '',
          userId
        }))
      );

      await archiveWorkingMemoryItems({
        userId,
        itemIds: [new mongoose.Types.ObjectId(id)],
        reason: `split:${mode}`
      });

      res.status(201).json({
        mode,
        archivedId: id,
        created
      });
    } catch (error) {
      console.error('❌ Error splitting working memory item:', error);
      res.status(500).json({ error: 'Failed to split working memory item.' });
    }
  });

  router.post('/api/working-memory/promote/:target', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const target = normalizeWorkingMemoryTarget(req.params.target);
      if (!target) {
        return res.status(400).json({ error: 'target must be one of: notebook, concept, question.' });
      }

      const ids = normalizeWorkingMemoryIds(req.body?.ids || []);
      if (ids.length === 0) {
        return res.status(400).json({ error: 'ids must include at least one valid item id.' });
      }

      const tags = parseWorkingMemoryTags(req.body?.tags || []);
      const items = await WorkingMemoryItem.find({
        _id: { $in: ids },
        userId,
        ...activeWorkingMemoryStatusFilter()
      }).sort({ createdAt: -1 });
      if (items.length === 0) {
        return res.status(404).json({ error: 'No active working memory items found for promotion.' });
      }

      const texts = items
        .map(item => String(item.textSnippet || '').trim())
        .filter(Boolean)
        .slice(0, 100);
      if (texts.length === 0) {
        return res.status(400).json({ error: 'No promotable text found in selected blocks.' });
      }

      const defaultTitle = buildWorkingMemoryNotebookTitle(texts[0] || '');
      const requestedTitle = String(req.body?.title || '').trim();
      const title = (requestedTitle || defaultTitle).slice(0, 140);
      let resultPayload = {};

      if (target === 'notebook') {
        const blocks = texts.map(text => ({
          id: createBlockId(),
          type: 'paragraph',
          text: String(text).slice(0, 1200)
        }));
        const created = await NotebookEntry.create({
          title: title || 'Working memory extract',
          content: '',
          blocks,
          tags,
          userId
        });
        await syncNotebookReferences(userId, created._id, blocks);
        enqueueNotebookEmbedding(created);
        resultPayload = { notebookEntry: created };
      }

      if (target === 'concept') {
        const conceptInput = String(req.body?.conceptName || tags[0] || '').trim();
        if (!conceptInput) {
          return res.status(400).json({ error: 'conceptName is required to promote to concept.' });
        }
        const conceptRegex = new RegExp(`^${escapeRegExp(conceptInput)}$`, 'i');
        let concept = await TagMeta.findOne({ name: conceptRegex, userId });
        if (!concept) {
          concept = await TagMeta.create({
            name: conceptInput,
            description: '',
            userId
          });
        }
        const conceptContent = tags.length > 0
          ? `${texts.join('\n\n')}\n\nTags: ${tags.join(', ')}`
          : texts.join('\n\n');
        const conceptNote = await ConceptNote.create({
          tagName: concept.name,
          title: title || 'Working memory extract',
          content: conceptContent,
          userId
        });
        resultPayload = {
          concept: {
            _id: concept._id,
            name: concept.name
          },
          conceptNote
        };
      }

      if (target === 'question') {
        const requestedQuestionId = String(req.body?.questionId || '').trim();
        const conceptName = String(req.body?.conceptName || tags[0] || '').trim();
        const questionText = String(req.body?.questionText || '').trim().slice(0, 400)
          || `From working memory: ${defaultTitle}`;
        const blocksToAppend = texts.map(text => ({
          id: createBlockId(),
          type: 'paragraph',
          text: String(text).slice(0, 1200)
        }));

        if (requestedQuestionId) {
          if (!mongoose.Types.ObjectId.isValid(requestedQuestionId)) {
            return res.status(400).json({ error: 'Invalid questionId.' });
          }
          const question = await Question.findOne({ _id: requestedQuestionId, userId });
          if (!question) {
            return res.status(404).json({ error: 'Question not found.' });
          }
          question.blocks = Array.isArray(question.blocks) ? question.blocks : [];
          question.blocks.push(...blocksToAppend);
          if (conceptName) {
            question.conceptName = conceptName;
            question.linkedTagName = conceptName;
          }
          await question.save();
          enqueueQuestionEmbedding(question);
          resultPayload = { question };
        } else {
          const created = await Question.create({
            text: questionText,
            status: 'open',
            linkedTagName: conceptName || '',
            conceptName: conceptName || '',
            blocks: blocksToAppend,
            userId
          });
          enqueueQuestionEmbedding(created);
          resultPayload = { question: created };
        }
      }

      const archived = await archiveWorkingMemoryItems({
        userId,
        itemIds: ids,
        reason: `promoted:${target}`
      });

      res.status(200).json({
        promotedTo: target,
        sourceCount: items.length,
        archivedCount: Number(archived.modifiedCount || 0),
        ...resultPayload
      });
    } catch (error) {
      console.error('❌ Error promoting working memory items:', error);
      res.status(500).json({ error: 'Failed to promote working memory items.' });
    }
  });

  router.delete('/api/working-memory/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const deleted = await WorkingMemoryItem.findOneAndDelete({ _id: id, userId });
      if (!deleted) {
        return res.status(404).json({ error: 'Working memory item not found.' });
      }
      res.status(200).json({ message: 'Working memory item deleted.' });
    } catch (error) {
      console.error('❌ Error deleting working memory item:', error);
      res.status(500).json({ error: 'Failed to delete working memory item.' });
    }
  });

  return router;
};

module.exports = { buildWorkingMemoryRouter };
