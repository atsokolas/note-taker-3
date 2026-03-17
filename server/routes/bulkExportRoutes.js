const express = require('express');

const buildBulkExportRouter = ({
  authenticateToken,
  Article,
  NotebookEntry,
  Collection,
  TagMeta,
  SavedView,
  PDFDocument,
  archiver
}) => {
  const router = express.Router();

  router.get('/api/export/json', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const [articles, notebookEntries, collections, tagsMeta, views] = await Promise.all([
        Article.find({ userId }).lean(),
        NotebookEntry.find({ userId }).lean(),
        Collection.find({ userId }).lean(),
        TagMeta.find({ userId }).lean(),
        SavedView.find({ userId }).lean()
      ]);

      const highlights = [];
      articles.forEach(a => {
        (a.highlights || []).forEach(h => {
          highlights.push({
            _id: h._id,
            text: h.text,
            note: h.note,
            tags: h.tags,
            createdAt: h.createdAt,
            articleId: a._id,
            articleTitle: a.title
          });
        });
      });

      const payload = {
        exportedAt: new Date().toISOString(),
        articles,
        highlights,
        notebookEntries,
        collections,
        tagsMeta,
        views
      };

      res.status(200).json(payload);
    } catch (error) {
      console.error("❌ Error exporting data:", error);
      res.status(500).json({ error: "Failed to export data." });
    }
  });

  router.get('/api/export/pdf-zip', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const [articles, notebookEntries, collections, tagsMeta] = await Promise.all([
        Article.find({ userId }).lean(),
        NotebookEntry.find({ userId }).lean(),
        Collection.find({ userId }).lean(),
        TagMeta.find({ userId }).lean()
      ]);

      const highlights = [];
      articles.forEach(a => {
        (a.highlights || []).forEach(h => {
          highlights.push({
            _id: h._id,
            text: h.text,
            note: h.note,
            tags: h.tags,
            createdAt: h.createdAt,
            articleId: a._id,
            articleTitle: a.title
          });
        });
      });

      const slugify = (str) => {
        const base = (str || 'untitled').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return base || 'item';
      };

      const makePdfBuffer = async (title, lines = []) => {
        return new Promise((resolve, reject) => {
          const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margins: { top: 50, bottom: 50, left: 50, right: 50 } });
          const chunks = [];
          doc.on('data', (c) => chunks.push(c));
          doc.on('end', () => resolve(Buffer.concat(chunks)));
          doc.on('error', reject);
          doc.addPage();
          doc.fontSize(18).text(title || 'Untitled', { underline: false });
          doc.moveDown();
          doc.fontSize(11);
          lines.forEach((line) => {
            doc.text(line || '', { lineGap: 4 });
            doc.moveDown(0.3);
          });
          doc.end();
        });
      };

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="note-taker-export-pdfs.zip"');

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('❌ Error building PDF zip:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to build PDF export.' });
        } else {
          res.end();
        }
      });
      archive.pipe(res);

      const articleTitleMap = new Map();
      articles.forEach(a => articleTitleMap.set(a._id.toString(), a.title || 'Untitled article'));

      for (const a of articles) {
        const lines = [
          `URL: ${a.url || 'n/a'}`,
          `Folder ID: ${a.folder || 'none'}`,
          `Created: ${a.createdAt ? new Date(a.createdAt).toLocaleString() : 'n/a'}`,
          `Updated: ${a.updatedAt ? new Date(a.updatedAt).toLocaleString() : 'n/a'}`,
          '',
          'Content:',
          (a.content || '').slice(0, 4000)
        ];
        const buf = await makePdfBuffer(a.title || 'Article', lines);
        archive.append(buf, { name: `articles/${slugify(a.title)}-${a._id}.pdf` });
      }

      for (const h of highlights) {
        const lines = [
          `Article: ${h.articleTitle || 'Untitled'}`,
          `Created: ${h.createdAt ? new Date(h.createdAt).toLocaleString() : 'n/a'}`,
          `Tags: ${(h.tags || []).join(', ') || 'none'}`,
          '',
          'Text:',
          h.text || '',
          '',
          'Note:',
          h.note || 'No note.'
        ];
        const buf = await makePdfBuffer('Highlight', lines);
        archive.append(buf, { name: `highlights/${slugify(h.articleTitle)}-${h._id}.pdf` });
      }

      for (const n of notebookEntries) {
        const lines = [
          `Created: ${n.createdAt ? new Date(n.createdAt).toLocaleString() : 'n/a'}`,
          `Updated: ${n.updatedAt ? new Date(n.updatedAt).toLocaleString() : 'n/a'}`,
          '',
          n.content || 'No content.'
        ];
        const buf = await makePdfBuffer(n.title || 'Notebook Entry', lines);
        archive.append(buf, { name: `notebook/${slugify(n.title)}-${n._id}.pdf` });
      }

      for (const c of collections) {
        const lines = [
          `Description: ${c.description || ''}`,
          `Article IDs: ${(c.articleIds || []).join(', ') || 'none'}`,
          `Highlight IDs: ${(c.highlightIds || []).join(', ') || 'none'}`,
          `Created: ${c.createdAt ? new Date(c.createdAt).toLocaleString() : 'n/a'}`
        ];
        const buf = await makePdfBuffer(c.name || 'Collection', lines);
        archive.append(buf, { name: `collections/${slugify(c.name)}-${c._id}.pdf` });
      }

      for (const t of tagsMeta) {
        const lines = [
          `Description: ${t.description || ''}`,
          `Pinned highlights: ${(t.pinnedHighlightIds || []).length}`,
          `Created: ${t.createdAt ? new Date(t.createdAt).toLocaleString() : 'n/a'}`
        ];
        const buf = await makePdfBuffer(t.name || 'Tag', lines);
        archive.append(buf, { name: `tags/${slugify(t.name)}-${t._id}.pdf` });
      }

      archive.finalize();
    } catch (error) {
      console.error("❌ Error exporting PDF zip:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to export PDF bundle." });
      }
    }
  });

  return router;
};

module.exports = {
  buildBulkExportRouter
};
