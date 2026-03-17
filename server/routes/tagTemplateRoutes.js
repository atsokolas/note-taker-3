const express = require('express');

const buildTagTemplateRouter = ({
  mongoose,
  authenticateToken,
  Article,
  listWorkspaceTemplates,
  getWorkspaceTemplateById,
  normalizeConceptNameInput,
  createBlockId,
  decodeTemplateText,
  NotebookEntry,
  normalizeTags,
  syncNotebookReferences,
  enqueueNotebookEmbedding,
  TagMeta,
  escapeRegExp,
  ensureWorkspace,
  toSafeObjectId,
  ReferenceEdge
}) => {
  const router = express.Router();

  router.get('/api/tags', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const tags = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $unwind: '$highlights.tags' },
        { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } }
      ]);
      res.status(200).json(tags.map(t => ({ tag: t._id, count: t.count })));
    } catch (error) {
      console.error('❌ Error fetching tags:', error);
      res.status(500).json({ error: 'Failed to fetch tags.' });
    }
  });

  router.get('/api/templates', authenticateToken, async (req, res) => {
    try {
      const templates = listWorkspaceTemplates();
      res.status(200).json(templates);
    } catch (error) {
      console.error('❌ Error listing workspace templates:', error);
      res.status(500).json({ error: 'Failed to list workspace templates.' });
    }
  });

  router.get('/api/templates/:id/create', authenticateToken, async (req, res) => {
    try {
      const templateId = String(req.params.id || '').trim().toLowerCase();
      const template = getWorkspaceTemplateById(templateId);
      if (!template) return res.status(404).json({ error: 'Template not found.' });
      res.status(200).json({ template });
    } catch (error) {
      console.error('❌ Error loading workspace template definition:', error);
      res.status(500).json({ error: 'Failed to load workspace template.' });
    }
  });

  router.post('/api/templates/:id/create', authenticateToken, async (req, res) => {
    const createdSampleEntryIds = [];
    let userObjectId = null;
    try {
      const templateId = String(req.params.id || '').trim().toLowerCase();
      const template = getWorkspaceTemplateById(templateId);
      if (!template) return res.status(404).json({ error: 'Template not found.' });
      const target = String(req.body?.target || 'concept').trim().toLowerCase();
      if (target !== 'concept' && target !== 'notebook') {
        return res.status(400).json({ error: 'target must be "concept" or "notebook".' });
      }

      userObjectId = new mongoose.Types.ObjectId(req.user.id);
      const sortedSamples = Array.isArray(template.sampleEntries)
        ? template.sampleEntries.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        : [];

      if (target === 'notebook') {
        const requestedNotebookTitle = req.body?.notebookTitle ?? req.body?.conceptName ?? template.name;
        const notebookTitle = normalizeConceptNameInput(requestedNotebookTitle);
        if (!notebookTitle) {
          return res.status(400).json({ error: 'notebookTitle is required.' });
        }

        const notebookBlocks = [];
        const pushBlock = (text) => {
          const value = String(text || '').trim();
          if (!value) return;
          notebookBlocks.push({
            id: createBlockId(),
            type: 'paragraph',
            text: value
          });
        };

        pushBlock(`${template.icon || '📌'} ${template.name || 'Template'}`);
        pushBlock(template.description || '');

        if (Array.isArray(template.groups) && template.groups.length > 0) {
          const sectionText = template.groups
            .map((group, index) => `${index + 1}. ${String(group.title || '').trim()}${group.description ? ` — ${String(group.description).trim()}` : ''}`)
            .join('\n');
          pushBlock(`Sections\n${sectionText}`);
        }

        sortedSamples.forEach((sample, index) => {
          const sampleTitle = String(sample.title || `Template Note ${index + 1}`).trim() || `Template Note ${index + 1}`;
          const sampleText = decodeTemplateText(sample.content);
          if (!sampleText) return;
          pushBlock(`${sampleTitle}\n${sampleText}`);
        });

        if (Array.isArray(template.workflowTips) && template.workflowTips.length > 0) {
          const tipText = template.workflowTips
            .map((tip, index) => `${index + 1}. ${String(tip || '').trim()}`)
            .filter(Boolean)
            .join('\n');
          pushBlock(`Workflow tips\n${tipText}`);
        }

        const notebookContent = notebookBlocks.map(block => String(block.text || '').trim()).filter(Boolean).join('\n\n');
        const notebookEntry = new NotebookEntry({
          title: notebookTitle,
          content: notebookContent,
          blocks: notebookBlocks,
          folder: null,
          type: 'note',
          claimId: null,
          tags: normalizeTags([template.id, ...(sortedSamples || []).flatMap(sample => sample.tags || [])]),
          linkedArticleId: null,
          userId: req.user.id
        });
        await notebookEntry.save();
        createdSampleEntryIds.push(String(notebookEntry._id));
        await syncNotebookReferences(req.user.id, notebookEntry._id, notebookBlocks);
        enqueueNotebookEmbedding(notebookEntry);

        return res.status(201).json({
          target: 'notebook',
          template,
          notebookEntryId: String(notebookEntry._id),
          notebookEntry
        });
      }

      const defaultConceptName = template.name || '';
      const hasConceptName = Boolean(
        req.body
        && typeof req.body === 'object'
        && Object.prototype.hasOwnProperty.call(req.body, 'conceptName')
      );
      const requestedConceptName = hasConceptName ? req.body.conceptName : defaultConceptName;
      const conceptName = normalizeConceptNameInput(requestedConceptName);
      if (!conceptName) {
        return res.status(400).json({ error: 'conceptName is required.' });
      }

      const existing = await TagMeta.findOne({
        userId: userObjectId,
        name: new RegExp(`^${escapeRegExp(conceptName)}$`, 'i')
      }).select('_id name').lean();
      if (existing) {
        return res.status(409).json({ error: 'Concept already exists.' });
      }

      const createdItems = [];
      for (let index = 0; index < sortedSamples.length; index += 1) {
        const sample = sortedSamples[index];
        const sampleContent = decodeTemplateText(sample.content);
        const blocks = [
          {
            id: createBlockId(),
            type: 'paragraph',
            text: sampleContent
          }
        ];
        const entry = new NotebookEntry({
          title: String(sample.title || `Template Note ${index + 1}`).trim() || `Template Note ${index + 1}`,
          content: sampleContent,
          blocks,
          folder: null,
          type: 'note',
          claimId: null,
          tags: normalizeTags(sample.tags),
          linkedArticleId: null,
          userId: req.user.id
        });
        await entry.save();
        await syncNotebookReferences(req.user.id, entry._id, blocks);
        enqueueNotebookEmbedding(entry);

        const createdId = String(entry._id);
        createdSampleEntryIds.push(createdId);
        createdItems.push({
          id: createBlockId(),
          type: 'note',
          refId: createdId,
          sectionId: String(sample.stage || 'inbox').trim().toLowerCase() || 'inbox',
          groupId: String(sample.stage || 'inbox').trim().toLowerCase() || 'inbox',
          parentId: '',
          inlineTitle: String(sample.title || '').trim().slice(0, 160),
          inlineText: '',
          stage: String(sample.stage || 'inbox').trim().toLowerCase() || 'inbox',
          status: String(sample.stage || '').trim().toLowerCase() === 'archive' ? 'archived' : 'active',
          order: Number.isFinite(Number(sample.order)) ? Number(sample.order) : index
        });
      }

      const workspaceSeed = {
        version: 1,
        outlineSections: (template.groups || []).map((group, index) => ({
          id: String(group.id || '').trim().toLowerCase(),
          title: String(group.title || '').trim(),
          description: String(group.description || '').trim(),
          collapsed: Boolean(group.collapsed),
          order: Number.isFinite(Number(group.order)) ? Number(group.order) : index
        })),
        attachedItems: createdItems,
        connections: [],
        updatedAt: new Date().toISOString()
      };
      const workspace = ensureWorkspace({ workspace: workspaceSeed });

      const concept = new TagMeta({
        name: conceptName,
        description: template.description || '',
        pinnedHighlightIds: [],
        pinnedArticleIds: [],
        pinnedNoteIds: createdSampleEntryIds
          .map(id => toSafeObjectId(id))
          .filter(Boolean),
        workspace,
        workspaceTemplateId: template.id,
        workspaceTemplateName: template.name || '',
        userId: req.user.id
      });
      await concept.save();

      res.status(201).json({
        conceptId: String(concept._id),
        conceptName: concept.name,
        template,
        workspace,
        createdSampleEntryIds
      });
    } catch (error) {
      if (createdSampleEntryIds.length > 0) {
        const cleanupIds = createdSampleEntryIds
          .map(id => toSafeObjectId(id))
          .filter(Boolean);
        if (cleanupIds.length > 0) {
          await Promise.allSettled([
            NotebookEntry.deleteMany({ _id: { $in: cleanupIds }, userId: req.user.id }),
            ReferenceEdge.deleteMany({
              userId: userObjectId || req.user.id,
              sourceType: 'notebook',
              sourceId: { $in: cleanupIds }
            })
          ]);
        }
      }
      console.error('❌ Error creating workspace from template:', error);
      res.status(500).json({ error: 'Failed to create workspace from template.' });
    }
  });

  return router;
};

module.exports = {
  buildTagTemplateRouter
};
