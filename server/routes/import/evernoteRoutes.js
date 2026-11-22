// Importing an Evernote export (.enex): preview, then import.
const { parseEnexNotes, buildNotebookPayloadFromLines, parseEvernoteDate } = require('../../services/import/evernoteTransform');
const { uniqueStrings, buildWarning, summarizeWarnings } = require('../../services/import/importDiagnostics');
const { ensureNotebookImportFolderPath } = require('../../services/notebookImportTreeService');

module.exports = (router, {
  EVENT_NAMES,
  NOTEBOOK_IMPORT_FOLDER_OWNERSHIP,
  applyImportOrganizationOffer,
  authenticateToken,
  buildIndexingSummary,
  buildNoeisImportReceipt,
  clearImportOrganizationOffer,
  crypto,
  enqueueNotebookEmbedding,
  finalizeSessionStatus,
  patchImportSession,
  persistImportReceipt,
  queueIndexingAttempt,
  readImportSessionId,
  savePreviewToSession,
  slugify,
  stageImportOrganizationProposalForSession,
  stripFileExtension,
  toTrimmedString,
  trackEvent,
  upload,
  upsertImportedNotebookEntry
}) => {
  router.post('/api/import/evernote-enex/preview', authenticateToken, upload.single('file'), async (req, res) => {
    const importSessionId = readImportSessionId(req);
    const userId = req.user.id;
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ENEX file is required.' });
      }

      const xmlText = req.file.buffer.toString('utf8');
      const notes = parseEnexNotes(xmlText);
      const sampleTitles = uniqueStrings(notes.map(note => note.title), 8);
      const sampleTags = uniqueStrings(notes.flatMap(note => note.tags || []), 10);
      const previewWarningEntries = [];
      if (notes.length === 0) {
        previewWarningEntries.push(buildWarning('no_parsed_notes', 'No Evernote notes were parsed from the ENEX file.'));
      }
      const previewWarnings = summarizeWarnings(previewWarningEntries);

      const preview = {
        items: notes.length,
        articles: 0,
        highlights: 0,
        notes: notes.length,
        pages: 0,
        databases: 0,
        notebooks: 1,
        sampleTitles,
        sampleTags,
        warningCodes: previewWarnings.warningCodes,
        warnings: previewWarnings.warnings
      };

      const session = await savePreviewToSession({
        sessionId: importSessionId,
        userId,
        sourceLabel: req.file.originalname || 'Evernote ENEX',
        preview
      });

      res.status(200).json({
        preview,
        session: session ? {
          id: String(session._id || ''),
          provider: toTrimmedString(session.provider),
          status: toTrimmedString(session.status),
          sourceLabel: toTrimmedString(session.sourceLabel),
          preview: session.preview || {},
          progress: session.progress || {}
        } : null
      });
    } catch (error) {
      console.error('Evernote ENEX preview failed:', error);
      const failedSession = await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to preview Evernote ENEX.';
          session.receipt = buildNoeisImportReceipt({
            id: `import-${importSessionId || 'evernote-preview'}-${Date.now()}`,
            source: 'evernote',
            sourceLabel: session.sourceLabel || 'Evernote ENEX',
            status: 'failed',
            error: {
              stage: 'preview_failed',
              message: 'Failed to preview Evernote ENEX.',
              retryable: true
            }
          });
        }
      });
      await persistImportReceipt({ userId, receipt: failedSession?.receipt });
      res.status(500).json({ error: 'Failed to preview Evernote ENEX.' });
    }
  });

  router.post('/api/import/evernote-enex', authenticateToken, upload.single('file'), async (req, res) => {
    const importSessionId = readImportSessionId(req);
    const userId = req.user.id;
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ENEX file is required.' });
      }

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'importing';
          session.sourceLabel = session.sourceLabel || req.file.originalname || 'Evernote ENEX';
          clearImportOrganizationOffer(session);
          session.progress = {
            ...(session.progress || {}),
            stage: 'upload_received',
            indexingState: 'not_started'
          };
        }
      });

      const xmlText = req.file.buffer.toString('utf8');
      const notes = parseEnexNotes(xmlText);
      let importedNotes = 0;
      let skippedRows = 0;
      let duplicateSkips = 0;
      let invalidSkips = 0;
      const syncedEntries = [];
      const indexing = buildIndexingSummary();
      const sourceLabel = req.file.originalname || 'Evernote ENEX';
      const folderSourceLabel = stripFileExtension(sourceLabel) || 'Evernote ENEX';

      for (let index = 0; index < notes.length; index += 1) {
        const note = notes[index];
        const externalId = `${slugify(note.title || 'note')}-${index + 1}`;
        const { blocks, content } = buildNotebookPayloadFromLines({
          title: note.title,
          lines: note.contentLines,
          createId: () => crypto.randomUUID()
        });
        const folderPlacement = await ensureNotebookImportFolderPath({
          userId,
          provider: 'evernote',
          sourceType: 'enex',
          sourceLabel: folderSourceLabel,
          folderOwnership: NOTEBOOK_IMPORT_FOLDER_OWNERSHIP,
          sourcePath: []
        });
        const parsedCreatedAt = parseEvernoteDate(note.created);
        const parsedUpdatedAt = parseEvernoteDate(note.updated);
        const { entry, created, updated } = await upsertImportedNotebookEntry({
          userId,
          provider: 'evernote',
          externalId,
          title: note.title,
          content,
          blocks,
          tags: note.tags,
          folderPlacement,
          importMeta: {
            provider: 'evernote',
            sourceType: 'enex',
            sourceLabel,
            sourcePath: folderPlacement.sourcePath,
            sourceUrl: note.sourceUrl,
            folderOwnership: NOTEBOOK_IMPORT_FOLDER_OWNERSHIP,
            externalId,
            importSessionId: importSessionId || null,
            importedAt: new Date()
          },
          createdAt: parsedCreatedAt,
          updatedAt: parsedUpdatedAt
        });
        if (!entry || (!created && !updated)) {
          skippedRows += 1;
          duplicateSkips += 1;
          continue;
        }
        syncedEntries.push(entry);
        importedNotes += 1;
      }

      await Promise.all(syncedEntries.map(entry => queueIndexingAttempt(
        indexing,
        () => enqueueNotebookEmbedding(entry),
        `Notebook indexing failed for ${entry.title || entry._id}`
      )));

      const warningEntries = indexing.warnings.map(message => buildWarning('indexing_failed', message));
      if (notes.length === 0) {
        warningEntries.push(buildWarning('no_parsed_notes', 'No Evernote notes were parsed from the ENEX file.'));
      }
      const warningSummary = summarizeWarnings(warningEntries);
      const status = finalizeSessionStatus({
        ...indexing,
        warnings: warningSummary.warnings
      }, 0);
      const resultPayload = {
        importedArticles: 0,
        importedHighlights: 0,
        importedNotes,
        skippedRows,
        duplicateSkips,
        invalidSkips,
        parseErrors: 0,
        indexingAttempts: indexing.indexingAttempts,
        indexingFailures: indexing.indexingFailures,
        indexingQueued: indexing.indexingQueued,
        warningCodes: warningSummary.warningCodes,
        warnings: warningSummary.warnings,
        entryId: syncedEntries[0] ? String(syncedEntries[0]._id) : '',
        entryIds: syncedEntries.map(entry => String(entry._id || '')),
        importedEntryIds: syncedEntries.map(entry => String(entry._id || '')),
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };
      resultPayload.receipt = buildNoeisImportReceipt({
        id: `import-${importSessionId || 'evernote'}-${Date.now()}`,
        source: 'evernote',
        sourceLabel,
        status,
        result: resultPayload,
        touched: syncedEntries.map(entry => ({
          type: 'note',
          id: String(entry._id || ''),
          title: entry.title || 'Imported note'
        })),
        nextAction: resultPayload.importedEntryIds.length > 0
          ? { label: 'Review filing suggestions', intent: 'organize_import' }
          : null
      });

      const completedSession = await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = status;
          session.preview = {
            ...(session.preview || {}),
            items: notes.length,
            notes: importedNotes,
            notebooks: 1,
            warningCodes: warningSummary.warningCodes,
            warnings: warningSummary.warnings
          };
          session.progress = {
            ...(session.progress || {}),
            stage: 'import_complete',
            itemsProcessed: notes.length,
            itemsTotal: notes.length,
            percent: 100,
            indexingState: resultPayload.indexingState
          };
          session.result = {
            ...(session.result || {}),
            importedArticles: 0,
            importedHighlights: 0,
            importedNotes,
            skippedRows,
            duplicateSkips,
            invalidSkips,
            parseErrors: 0,
            indexingAttempts: indexing.indexingAttempts,
            indexingFailures: indexing.indexingFailures,
            indexingQueued: indexing.indexingQueued,
            warningCodes: warningSummary.warningCodes,
            warnings: warningSummary.warnings,
            lastImportedEntryId: resultPayload.entryId,
            importedEntryIds: resultPayload.importedEntryIds
          };
          session.receipt = resultPayload.receipt;
          session.lastError = '';
          applyImportOrganizationOffer(session);
        }
      });
      await stageImportOrganizationProposalForSession({
        session: completedSession,
        userId,
        notebookEntryIds: resultPayload.importedEntryIds
      });
      await persistImportReceipt({ userId, receipt: resultPayload.receipt });

      trackEvent({
        event: EVENT_NAMES.CAPTURE_COMPLETED,
        userId,
        requestId: req.requestId,
        properties: {
          source: 'evernote-enex',
          importedNotes,
          skippedRows
        }
      });

      res.status(200).json(resultPayload);
    } catch (error) {
      console.error('Evernote ENEX import failed:', error);
      const failedSession = await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          clearImportOrganizationOffer(session);
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to import Evernote ENEX.';
          session.receipt = buildNoeisImportReceipt({
            id: `import-${importSessionId || 'evernote'}-${Date.now()}`,
            source: 'evernote',
            sourceLabel: session.sourceLabel || 'Evernote ENEX',
            status: 'failed',
            error: {
              stage: 'failed',
              message: 'Failed to import Evernote ENEX.',
              retryable: true
            }
          });
        }
      });
      await persistImportReceipt({ userId, receipt: failedSession?.receipt });
      res.status(500).json({ error: 'Failed to import Evernote ENEX.' });
    }
  });
};
