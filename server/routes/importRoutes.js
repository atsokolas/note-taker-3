const express = require('express');

const buildImportRouter = ({
  authenticateToken,
  upload,
  Papa,
  findRowValue,
  slugify,
  parseTagList,
  Article,
  trackEvent,
  EVENT_NAMES,
  path,
  crypto,
  NotebookEntry,
  syncNotebookReferences
}) => {
  const router = express.Router();

  const handleReadwiseImport = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'CSV file is required.' });
      }

      const csvText = req.file.buffer.toString('utf8');
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const rows = Array.isArray(parsed.data) ? parsed.data : [];

      let importedArticles = 0;
      let importedHighlights = 0;
      let skippedRows = 0;

      const articleCache = new Map();
      const dirtyArticles = new Set();
      const userId = req.user.userId;

      for (const row of rows) {
        const highlightText = String(findRowValue(row, ['Highlight', 'Text', 'Highlight text'])).trim();
        if (!highlightText) {
          skippedRows += 1;
          continue;
        }

        const title = String(findRowValue(row, ['Title', 'Book Title', 'Article Title'])).trim() || 'Untitled';
        const author = String(findRowValue(row, ['Author'])).trim();
        let url = String(findRowValue(row, ['URL', 'Source URL', 'Link'])).trim();
        if (!url) {
          const base = `${slugify(title)}-${slugify(author || 'source')}`;
          url = `import://readwise/${base || 'untitled'}`;
        }

        const note = String(findRowValue(row, ['Note', 'Notes'])).trim();
        const tagsValue = findRowValue(row, ['Tags', 'Tag']);
        const tags = parseTagList(tagsValue);
        const tagList = tags.length > 0 ? tags : ['imported'];

        const dateValue = findRowValue(row, ['Highlighted at', 'Created at', 'Added', 'Date']);
        const parsedDate = dateValue ? new Date(dateValue) : null;
        const createdAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date();

        let article = articleCache.get(url);
        if (!article) {
          article = await Article.findOne({ userId, url });
          if (!article) {
            article = new Article({
              url,
              title,
              content: '',
              userId
            });
            importedArticles += 1;
          }
          articleCache.set(url, article);
        }

        const alreadyExists = (article.highlights || []).some(h => (
          h.text === highlightText
        ));

        if (alreadyExists) {
          skippedRows += 1;
          continue;
        }

        article.highlights.push({
          text: highlightText,
          note,
          tags: tagList,
          createdAt
        });
        dirtyArticles.add(article._id.toString());
        importedHighlights += 1;
      }

      await Promise.all(
        Array.from(articleCache.values())
          .filter(article => dirtyArticles.has(article._id.toString()))
          .map(article => article.save())
      );

      trackEvent({
        event: EVENT_NAMES.CAPTURE_COMPLETED,
        userId: req.user.id,
        requestId: req.requestId,
        properties: {
          source: 'readwise-csv',
          importedArticles,
          importedHighlights,
          skippedRows,
          parseErrors: parsed.errors ? parsed.errors.length : 0
        }
      });

      res.status(200).json({
        importedArticles,
        importedHighlights,
        skippedRows,
        parseErrors: parsed.errors ? parsed.errors.length : 0
      });
    } catch (err) {
      console.error('Readwise CSV import failed:', err);
      res.status(500).json({ error: 'Failed to import Readwise CSV.' });
    }
  };

  router.post('/api/import/readwise-csv', authenticateToken, upload.single('file'), handleReadwiseImport);
  router.post('/api/import/readwise', authenticateToken, upload.single('file'), handleReadwiseImport);

  router.post('/api/import/markdown', authenticateToken, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Markdown file is required.' });
      }
      const originalName = req.file.originalname || 'imported-note.md';
      const title = path.basename(originalName, path.extname(originalName)) || 'Imported note';
      const markdown = req.file.buffer.toString('utf8');

      const createBlockId = () => {
        if (crypto.randomUUID) return crypto.randomUUID();
        return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      };
      const escapeHtml = (value = '') =>
        String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      const lines = markdown.split(/\r?\n/);
      const blocks = [];
      const htmlParts = [];
      let listItems = [];

      const flushList = () => {
        if (listItems.length === 0) return;
        htmlParts.push(`<ul>${listItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
        listItems = [];
      };

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          flushList();
          return;
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const text = trimmed.slice(2).trim();
          listItems.push(text);
          blocks.push({
            id: createBlockId(),
            type: 'bullet',
            text,
            indent: 0
          });
          return;
        }
        flushList();
        htmlParts.push(`<p>${escapeHtml(trimmed)}</p>`);
        blocks.push({
          id: createBlockId(),
          type: 'paragraph',
          text: trimmed
        });
      });
      flushList();

      const content = htmlParts.join('') || `<p>${escapeHtml(markdown.trim())}</p>`;

      const entry = new NotebookEntry({
        title,
        content,
        blocks,
        userId: req.user.id
      });
      await entry.save();
      if (blocks.length > 0) {
        await syncNotebookReferences(req.user.id, entry._id, blocks);
      }
      trackEvent({
        event: EVENT_NAMES.WORKSPACE_CREATED,
        userId: req.user.id,
        requestId: req.requestId,
        properties: {
          workspaceType: 'notebook',
          source: 'markdown',
          entryId: String(entry._id),
          blockCount: blocks.length
        }
      });
      trackEvent({
        event: EVENT_NAMES.CAPTURE_COMPLETED,
        userId: req.user.id,
        requestId: req.requestId,
        properties: {
          source: 'markdown',
          entryId: String(entry._id),
          importedNotes: 1,
          blockCount: blocks.length
        }
      });

      res.status(200).json({ importedNotes: 1, entryId: entry._id });
    } catch (err) {
      console.error('Markdown import failed:', err);
      res.status(500).json({ error: 'Failed to import markdown file.' });
    }
  });

  return router;
};

module.exports = {
  buildImportRouter
};
