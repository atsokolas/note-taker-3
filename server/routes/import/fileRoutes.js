// Importing files, and the connections a reader has made to other services.
const { parseExportFile, FORMAT_LABELS } = require('../../services/import/exportFiles');
const { buildWarning, summarizeWarnings } = require('../../services/import/importDiagnostics');
const { fillArticleBodies } = require('../../services/readableArticle');

module.exports = (router, {
  Article,
  EVENT_NAMES,
  IntegrationConnection,
  applyImportOrganizationOffer,
  authenticateCapture,
  authenticateToken,
  bareLinks,
  buildIndexingSummary,
  buildNoeisImportReceipt,
  clearImportOrganizationOffer,
  describeExportLanding,
  enqueueArticleEmbedding,
  fetchSourceBody,
  finalizeSessionStatus,
  landExportNotes,
  landExportSources,
  logConnectorAction,
  patchImportSession,
  persistImportReceipt,
  pluralize,
  readImportSessionId,
  receiveExportFiles,
  sanitizeConnection,
  stageImportOrganizationProposalForSession,
  toTrimmedString,
  trackEvent
}) => {
  router.post('/api/import/files', authenticateCapture, receiveExportFiles, async (req, res) => {
    const importSessionId = readImportSessionId(req);
    const userId = req.user.id;
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: 'Choose an export file or a folder of notes.' });
    // Browsers send a folder's inner paths alongside the files, in order.
    const paths = [].concat(req.body?.paths || []);
    const readable = files
      .map((file, index) => ({ name: file.originalname, path: toTrimmedString(paths[index]), buffer: file.buffer, text: file.buffer.toString('utf8') }))
      .filter(file => !(file.path || file.name).split('/').some(segment => segment.startsWith('.')));
    const sourceLabel = files.length === 1 ? (files[0].originalname || 'Export file') : (toTrimmedString(paths[0]).split('/')[0] || 'Export files');

    try {
      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'importing';
          session.sourceLabel = session.sourceLabel || sourceLabel;
          clearImportOrganizationOffer(session);
          session.progress = { ...(session.progress || {}), stage: 'upload_received', indexingState: 'not_started' };
        }
      });

      const parsed = await Promise.all(readable.map(file => parseExportFile(file)));
      const formats = [...new Set(parsed.map(result => result.format).filter(format => format !== 'unknown'))];
      const sources = parsed.flatMap(result => result.sources.map(source => ({ ...source, provider: result.format })));
      const notes = parsed.flatMap(result => result.notes || []);
      const unreadable = parsed.reduce((sum, result) => sum + (result.skipped || 0), 0);
      const unattachedNotes = parsed.reduce((sum, result) => sum + (result.unattachedNotes || 0), 0);
      const unrecognised = parsed.filter(result => result.format === 'unknown').length;
      const provider = formats.length === 1 ? formats[0] : 'files';
      const label = formats.length === 1 ? FORMAT_LABELS[formats[0]] : 'Your exports';

      const indexing = buildIndexingSummary();
      const landed = await landExportSources({ userId, sources, sourceLabel, importSessionId, indexing });
      const written = await landExportNotes({ userId, notes, importSessionId, indexing });
      const s = landed.tally;
      const n = written.tally;

      const warningEntries = indexing.warnings.map(message => buildWarning('indexing_failed', message));
      if (unrecognised) warningEntries.push(buildWarning('unrecognised_files', `${pluralize(unrecognised, 'file')} did not look like an export we know.`));
      const warningSummary = summarizeWarnings(warningEntries);
      const status = finalizeSessionStatus(indexing, 0);
      const articleIds = landed.articles.map(article => String(article._id));
      const entryIds = written.entries.map(entry => String(entry._id));
      const resultPayload = {
        format: provider,
        importedArticles: s.newSources,
        importedHighlights: s.newHighlights,
        importedNotes: n.notesCreated + n.notesUpdated,
        alreadyHere: s.alreadyHere + n.alreadyHere,
        skippedRows: unreadable + unattachedNotes,
        duplicateSkips: s.alreadyHere + n.alreadyHere,
        invalidSkips: unreadable,
        parseErrors: 0,
        indexingAttempts: indexing.indexingAttempts,
        indexingFailures: indexing.indexingFailures,
        indexingQueued: indexing.indexingQueued,
        warningCodes: warningSummary.warningCodes,
        warnings: warningSummary.warnings,
        articleIds,
        importedArticleIds: articleIds,
        // What was already here, so a desktop can keep passages in the copy you have.
        heldArticleIds: landed.held.map(article => String(article._id)),
        entryId: entryIds[0] || '',
        entryIds,
        importedEntryIds: entryIds,
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };
      resultPayload.summary = describeExportLanding({ formats, sources: s, notes: n, unreadable, unattachedNotes });
      resultPayload.receipt = buildNoeisImportReceipt({
        id: `import-${importSessionId || provider}-${Date.now()}`,
        source: provider,
        sourceLabel: label,
        status,
        summary: resultPayload.summary,
        result: resultPayload,
        touched: [
          ...landed.articles.map(article => ({ type: 'article', id: String(article._id), title: article.title })),
          ...written.entries.map(entry => ({ type: 'note', id: String(entry._id), title: entry.title }))
        ],
        nextAction: articleIds.length || entryIds.length ? { label: 'Review filing suggestions', intent: 'organize_import' } : null
      });

      const completedSession = await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = status;
          session.preview = { ...(session.preview || {}), items: sources.length + notes.length, articles: s.newSources, highlights: s.newHighlights, notes: notes.length };
          session.progress = {
            ...(session.progress || {}),
            stage: 'import_complete',
            itemsProcessed: sources.length + notes.length,
            itemsTotal: sources.length + notes.length,
            percent: 100,
            indexingState: resultPayload.indexingState
          };
          session.result = {
            ...(session.result || {}),
            importedArticles: s.newSources,
            importedHighlights: s.newHighlights,
            importedNotes: resultPayload.importedNotes,
            skippedRows: resultPayload.skippedRows,
            duplicateSkips: resultPayload.duplicateSkips,
            invalidSkips: unreadable,
            indexingAttempts: indexing.indexingAttempts,
            indexingFailures: indexing.indexingFailures,
            indexingQueued: indexing.indexingQueued,
            warningCodes: warningSummary.warningCodes,
            warnings: warningSummary.warnings,
            lastImportedArticleId: articleIds[0] || '',
            lastImportedEntryId: entryIds[0] || '',
            importedArticleIds: articleIds,
            importedEntryIds: entryIds
          };
          session.receipt = resultPayload.receipt;
          session.lastError = '';
          if (articleIds.length || entryIds.length) applyImportOrganizationOffer(session);
        }
      });
      if (articleIds.length || entryIds.length) {
        await stageImportOrganizationProposalForSession({ session: completedSession, userId, articleIds, notebookEntryIds: entryIds });
      }
      await persistImportReceipt({ userId, receipt: resultPayload.receipt });
      await logConnectorAction({
        userId,
        connector: provider,
        action: 'import_file',
        targetType: 'import_session',
        targetId: importSessionId || '',
        summary: resultPayload.summary,
        metadata: { formats, importedArticles: s.newSources, importedHighlights: s.newHighlights, importedNotes: resultPayload.importedNotes }
      });
      trackEvent({
        event: EVENT_NAMES.CAPTURE_COMPLETED,
        userId,
        requestId: req.requestId,
        properties: { source: `export-${provider}`, importedArticles: s.newSources, importedHighlights: s.newHighlights, importedNotes: resultPayload.importedNotes }
      });
      res.status(200).json(resultPayload);
      fillArticleBodies({
        Article,
        userId,
        urls: bareLinks(landed.articles),
        fetchBody: fetchSourceBody,
        onFilled: article => enqueueArticleEmbedding(article)
      }).catch(error => console.error('Failed fetching imported links:', error));
      return undefined;
    } catch (error) {
      console.error('Export file import failed:', error);
      const message = 'Those files did not finish coming in. Whatever arrived stays, and trying again will not double it.';
      const failedSession = await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          clearImportOrganizationOffer(session);
          session.progress = { ...(session.progress || {}), stage: 'failed', indexingState: session.progress?.indexingState || 'not_started' };
          session.lastError = message;
          session.receipt = buildNoeisImportReceipt({
            id: `import-${importSessionId || 'files'}-${Date.now()}`,
            source: session.provider || 'files',
            sourceLabel: session.sourceLabel || sourceLabel,
            status: 'failed',
            error: { stage: 'failed', message, retryable: true }
          });
        }
      });
      await persistImportReceipt({ userId, receipt: failedSession?.receipt });
      return res.status(500).json({ error: message });
    }
  });

  router.get('/api/import/connections', authenticateToken, async (req, res) => {
    try {
      const provider = toTrimmedString(req.query.provider);
      const query = { userId: req.user.id };
      if (provider) query.provider = provider;
      const rows = await IntegrationConnection.find(query).sort({ updatedAt: -1, createdAt: -1 }).lean();
      res.status(200).json({ connections: rows.map(sanitizeConnection) });
    } catch (error) {
      console.error('Failed to list import connections:', error);
      res.status(500).json({ error: 'Failed to list import connections.' });
    }
  });

  router.post('/api/import/connections/:id/disconnect', authenticateToken, async (req, res) => {
    try {
      const connectionId = toTrimmedString(req.params.id);
      if (!connectionId) return res.status(400).json({ error: 'connection id is required.' });
      const connection = await IntegrationConnection.findOne({
        _id: connectionId,
        userId: req.user.id
      });
      if (!connection) return res.status(404).json({ error: 'Import connection not found.' });

      connection.status = 'revoked';
      connection.health = 'unknown';
      connection.encryptedAccessToken = '';
      connection.encryptedRefreshToken = '';
      connection.encryptedApiToken = '';
      connection.lastError = '';
      await connection.save();

      return res.status(200).json({
        connection: sanitizeConnection(
          typeof connection.toObject === 'function' ? connection.toObject() : connection
        ),
        boundaries: {
          futureAccess: 'stopped',
          importedContent: 'retained',
          completedWork: 'unchanged',
          providerRevocation: 'not_confirmed',
          inFlightWork: 'not_cancelled'
        }
      });
    } catch (error) {
      if (error?.name === 'CastError') {
        return res.status(400).json({ error: 'connection id is invalid.' });
      }
      console.error('Failed to disconnect import connection:', error);
      return res.status(500).json({ error: 'Failed to disconnect import connection.' });
    }
  });
};
