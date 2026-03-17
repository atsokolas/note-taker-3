const express = require('express');

const buildExportPublicRouter = ({
  mongoose,
  authenticateToken,
  NotebookEntry,
  createBlockId,
  ensureNotebookBlocks,
  buildNotebookMarkdown,
  slugify,
  TagMeta,
  getConceptMeta,
  getConceptRelated,
  Question,
  buildConceptMarkdown
}) => {
  const router = express.Router();

  router.get('/api/export/notebook/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const entry = await NotebookEntry.findOne({ _id: id, userId });
      if (!entry) {
        return res.status(404).json({ error: 'Notebook entry not found.' });
      }
      ensureNotebookBlocks(entry, createBlockId);
      const markdown = buildNotebookMarkdown(entry);
      const fileName = `${slugify(entry.title || 'notebook-entry') || 'notebook-entry'}.md`;
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.status(200).send(markdown);
    } catch (error) {
      console.error('❌ Error exporting notebook entry:', error);
      res.status(500).json({ error: 'Failed to export notebook entry.' });
    }
  });

  router.get('/api/export/concepts/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      let concept = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        concept = await TagMeta.findOne({ _id: id, userId });
      }
      if (!concept) {
        concept = await TagMeta.findOne({ userId, name: new RegExp(`^${id}$`, 'i') });
      }
      if (!concept) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      const meta = await getConceptMeta(userId, concept.name);
      const related = await getConceptRelated(userId, concept.name, { limit: 50, offset: 0 });
      const questions = await Question.find({
        userId,
        $or: [
          { conceptName: new RegExp(`^${concept.name}$`, 'i') },
          { linkedTagName: new RegExp(`^${concept.name}$`, 'i') }
        ]
      }).select('text').lean();
      const markdown = buildConceptMarkdown({ concept: meta, related, questions });
      const fileName = `${slugify(meta.name || 'concept') || 'concept'}.md`;
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.status(200).send(markdown);
    } catch (error) {
      console.error('❌ Error exporting concept:', error);
      res.status(500).json({ error: 'Failed to export concept.' });
    }
  });

  router.get('/public/concepts/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const concept = await TagMeta.findOne({ slug, isPublic: true }).lean();
      if (!concept) {
        return res.status(404).json({ error: 'Public concept not found.' });
      }
      const userId = concept.userId;
      const related = await getConceptRelated(userId, concept.name, { limit: 50, offset: 0 });
      const questions = await Question.find({
        userId,
        $or: [
          { conceptName: new RegExp(`^${concept.name}$`, 'i') },
          { linkedTagName: new RegExp(`^${concept.name}$`, 'i') }
        ]
      }).select('text status updatedAt').lean();
      res.status(200).json({
        concept: {
          name: concept.name,
          description: concept.description || '',
          slug: concept.slug
        },
        highlights: related.highlights || [],
        articles: related.articles || [],
        questions: questions || []
      });
    } catch (error) {
      console.error('❌ Error loading public concept:', error);
      res.status(500).json({ error: 'Failed to load public concept.' });
    }
  });

  return router;
};

module.exports = {
  buildExportPublicRouter
};
