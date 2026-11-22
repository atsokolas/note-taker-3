// The wiki's schema, its export, and lint runs over it.
const { getWikiSchemaSettings, saveWikiSchemaSettings, revertWikiSchemaSettings } = require('../../services/wikiSchemaService');
const {
  renderWikiIndexMarkdown,
  renderWikiLogMarkdown,
  renderWikiSchemaMarkdown,
  sanitizeFilename,
  renderWikiPageMarkdown
} = require('../../services/wikiMarkdownExportService');
const mongoose = require('mongoose');
const { findAutolinkSuggestions } = require('../../services/wikiAutolinkService');

module.exports = (router, {
  EVENT_NAMES,
  WikiLintRun,
  WikiPage,
  WikiSchemaSettings,
  assertHumanForResolvedWeekendReadingsTargets,
  findLintFinding,
  findLintRun,
  lintWiki,
  openWikiLintStream,
  resolveLintFindingAction,
  serializeLintRun,
  trackWikiEvent,
  updateLintFinding,
  wikiAuth,
  wikiModels,
  writeSse
}) => {
  router.get('/api/wiki/schema', wikiAuth, async (req, res) => {
    try {
      const settings = await getWikiSchemaSettings({
        WikiSchemaSettings,
        userId: req.user.id
      });
      res.status(200).json(settings);
    } catch (error) {
      console.error('Error reading wiki schema:', error);
      res.status(500).json({ error: 'Failed to read wiki schema.' });
    }
  });

  router.put('/api/wiki/schema', wikiAuth, async (req, res) => {
    try {
      const settings = await saveWikiSchemaSettings({
        WikiSchemaSettings,
        userId: req.user.id,
        content: req.body?.content
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_SCHEMA_SAVED, {
        contentLength: String(settings.content || '').length,
        snapshotCount: Array.isArray(settings.snapshots) ? settings.snapshots.length : 0
      });
      res.status(200).json(settings);
    } catch (error) {
      console.error('Error saving wiki schema:', error);
      res.status(500).json({ error: 'Failed to save wiki schema.' });
    }
  });

  router.post('/api/wiki/schema/revert', wikiAuth, async (req, res) => {
    try {
      const settings = await revertWikiSchemaSettings({
        WikiSchemaSettings,
        userId: req.user.id,
        snapshotId: req.body?.snapshotId
      });
      res.status(200).json(settings);
    } catch (error) {
      if (error.code === 'WIKI_SCHEMA_SNAPSHOT_NOT_FOUND') {
        return res.status(404).json({ error: 'Wiki schema snapshot not found.' });
      }
      console.error('Error reverting wiki schema:', error);
      res.status(500).json({ error: 'Failed to revert wiki schema.' });
    }
  });

  router.get('/api/wiki/export.zip', wikiAuth, async (req, res) => {
    try {
      const [pages, schemaSettings, lintRuns] = await Promise.all([
        WikiPage.find({ userId: req.user.id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(1000).lean(),
        WikiSchemaSettings
          ? getWikiSchemaSettings({ WikiSchemaSettings, userId: req.user.id }).catch(() => null)
          : null,
        WikiLintRun
          ? WikiLintRun.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).lean()
          : []
      ]);
      const archive = require('archiver')('zip', { zlib: { level: 9 } });
      archive.on('error', (error) => {
        if (!res.headersSent) res.status(500).json({ error: 'Failed to export wiki.' });
        else res.destroy(error);
      });
      res.status(200);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="wiki-export.zip"');
      archive.pipe(res);
      archive.append(renderWikiIndexMarkdown(pages), { name: 'index.md' });
      archive.append(renderWikiLogMarkdown({ pages, lintRuns }), { name: 'log.md' });
      archive.append(renderWikiSchemaMarkdown(schemaSettings), { name: 'schema.md' });
      const usedNames = new Map();
      pages.forEach((page) => {
        const base = sanitizeFilename(page.slug || page.title);
        const count = (usedNames.get(base) || 0) + 1;
        usedNames.set(base, count);
        const name = count === 1 ? `${base}.md` : `${base}-${count}.md`;
        archive.append(renderWikiPageMarkdown(page), { name });
      });
      await archive.finalize();
    } catch (error) {
      console.error('Error exporting wiki:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to export wiki.' });
    }
  });

  router.post('/api/wiki/lint', wikiAuth, async (req, res) => {
    try {
      const pageId = String(req.body?.pageId || '').trim();
      if (pageId && !mongoose.Types.ObjectId.isValid(pageId)) {
        return res.status(400).json({ error: 'Invalid wiki page id.' });
      }
      if (pageId) {
        const exists = await WikiPage.findOne({ _id: pageId, userId: req.user.id, status: { $ne: 'archived' } }).lean();
        if (!exists) return res.status(404).json({ error: 'Wiki page not found.' });
      }
      const result = await lintWiki({
        userId: req.user.id,
        scope: pageId ? 'page' : 'all',
        pageId,
        models: wikiModels(),
        findAutolinkSuggestions
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error linting wiki:', error);
      res.status(500).json({ error: 'Failed to lint wiki.' });
    }
  });

  router.post('/api/wiki/lint/stream', wikiAuth, async (req, res) => {
    try {
      const pageId = String(req.body?.pageId || '').trim();
      if (pageId && !mongoose.Types.ObjectId.isValid(pageId)) {
        return res.status(400).json({ error: 'Invalid wiki page id.' });
      }
      if (pageId) {
        const exists = await WikiPage.findOne({ _id: pageId, userId: req.user.id, status: { $ne: 'archived' } }).lean();
        if (!exists) return res.status(404).json({ error: 'Wiki page not found.' });
      }
      openWikiLintStream(res);
      const result = await lintWiki({
        userId: req.user.id,
        scope: pageId ? 'page' : 'all',
        pageId,
        models: wikiModels(),
        findAutolinkSuggestions,
        onProgress: event => writeSse(res, 'wiki-lint', event)
      });
      writeSse(res, 'wiki-lint', {
        stage: 'complete',
        summary: result.summary,
        run: result
      });
      writeSse(res, 'done', { ok: true, runId: result.runId });
      res.end();
    } catch (error) {
      console.error('Error streaming wiki lint:', error);
      if (!res.headersSent) return res.status(500).json({ error: 'Failed to lint wiki.' });
      writeSse(res, 'error', {
        error: 'Failed to lint wiki.',
        message: String(error.message || '')
      });
      res.end();
    }
  });

  router.get('/api/wiki/lint/:runId', wikiAuth, async (req, res) => {
    try {
      const run = await findLintRun(req);
      if (!run) return res.status(404).json({ error: 'Wiki lint run not found.' });
      res.status(200).json(serializeLintRun(run));
    } catch (error) {
      console.error('Error loading wiki lint run:', error);
      res.status(500).json({ error: 'Failed to load wiki lint run.' });
    }
  });

  router.post('/api/wiki/lint/:runId/findings/:findingId/:action', wikiAuth, async (req, res) => {
    try {
      const action = String(req.params.action || '').trim();
      if (!['accept', 'ignore', 'fix'].includes(action)) {
        return res.status(400).json({ error: 'Unsupported lint action.' });
      }
      const run = await findLintRun(req);
      if (!run) return res.status(404).json({ error: 'Wiki lint run not found.' });
      const finding = findLintFinding(run, req.params.findingId);
      if (!finding) return res.status(404).json({ error: 'Wiki lint finding not found.' });
      if (action !== 'ignore') {
        await assertHumanForResolvedWeekendReadingsTargets({ WikiPage, req, pageIds: [finding.pageId] });
      }
      const result = await resolveLintFindingAction({ action, finding, userId: req.user.id });
      const status = action === 'ignore' ? 'ignored' : action === 'fix' ? 'fixed' : 'accepted';
      const updatedRun = await updateLintFinding({ run, finding, status, action, result });
      res.status(200).json({ run: updatedRun, findingId: finding.id, status, action, ...result });
    } catch (error) {
      console.error('Error resolving wiki lint finding:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to resolve wiki lint finding.' });
    }
  });
};
