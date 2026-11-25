// Notion: connecting by OAuth (whose callback also finishes Readwise's), checking, previewing and syncing a workspace, and exporting a page back to it.
const {
  NOTION_AUTHORIZE_URL,
  exchangeNotionCode,
  searchNotionPreviewItems,
  queryNotionDataSourcePreviewPages,
  searchNotionItems,
  queryNotionDataSourcePages,
  createNotionPage
} = require('../../services/import/notionClient');
const { encryptSecret, decryptSecret } = require('../../utils/integrationSecrets');
const { uniqueStrings, buildWarning, summarizeWarnings } = require('../../services/import/importDiagnostics');
const { extractNotionTitle } = require('../../services/import/notionTransform');

module.exports = (router, {
  EVENT_NAMES,
  IntegrationConnection,
  NotebookEntry,
  applyImportOrganizationOffer,
  authenticateToken,
  buildConceptExportBlocks,
  buildIndexingSummary,
  buildNoeisImportReceipt,
  buildNotebookEntryFromNotionPage,
  buildNotebookExportBlocks,
  buildNotionImportIndex,
  clearImportOrganizationOffer,
  createNotionState,
  enqueueNotebookEmbedding,
  env,
  extractNotionParentRef,
  finalizeSessionStatus,
  finishReadwise,
  getImportAppUrl,
  getNotionRedirectUri,
  isAccountActive,
  markConnectionError,
  markConnectionHealthy,
  patchImportSession,
  persistConnectionLastSyncResult,
  persistImportReceipt,
  queueIndexingAttempt,
  readImportSessionId,
  resolveNotionFolderPath,
  sanitizeConnection,
  sanitizeNoeisReceipt,
  savePreviewToSession,
  stageImportOrganizationProposalForSession,
  toTrimmedString,
  trackEvent,
  verifyNotionState
}) => {
  router.post('/api/import/notion/oauth/start', authenticateToken, async (req, res) => {
    try {
      const clientId = toTrimmedString(process.env.NOTION_CLIENT_ID);
      const clientSecret = toTrimmedString(process.env.NOTION_CLIENT_SECRET);
      const missingEnv = [];
      if (!clientId) missingEnv.push('NOTION_CLIENT_ID');
      if (!clientSecret) missingEnv.push('NOTION_CLIENT_SECRET');
      if (missingEnv.length > 0) {
        return res.status(400).json({
          error: `Notion OAuth is not configured on the server. Missing ${missingEnv.join(' and ')}.`,
          missingEnv
        });
      }
      const redirectUri = getNotionRedirectUri(req);
      const state = createNotionState({ userId: req.user.id });
      const params = new URLSearchParams({
        owner: 'user',
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        state
      });
      res.status(200).json({
        authUrl: `${NOTION_AUTHORIZE_URL}?${params.toString()}`
      });
    } catch (error) {
      console.error('Failed to start Notion OAuth:', error);
      res.status(500).json({ error: 'Failed to start Notion OAuth.' });
    }
  });

  const finishNotion = async ({ req, userId, code, state }) => {
    const redirectUri = getNotionRedirectUri(req);
    const decoded = verifyNotionState(state);
    if (String(decoded.userId) !== String(userId)) throw new Error('This approval was started by another account.');
    const payload = await exchangeNotionCode({
      code,
      redirectUri
    });
    if (!await isAccountActive(String(decoded.userId || ''))) throw new Error('Account is unavailable.');
    let connection = await IntegrationConnection.findOne({
      userId: decoded.userId,
      provider: 'notion',
      mode: 'oauth'
    }).sort({ updatedAt: -1, createdAt: -1 });
    if (!connection) {
      connection = new IntegrationConnection({
        userId: decoded.userId,
        provider: 'notion',
        mode: 'oauth'
      });
    }
    connection.accountLabel = toTrimmedString(payload.workspace_name || 'Notion');
    connection.externalAccountId = toTrimmedString(payload.workspace_id || payload.bot_id || '');
    connection.encryptedAccessToken = encryptSecret(toTrimmedString(payload.access_token));
    connection.encryptedRefreshToken = encryptSecret(toTrimmedString(payload.refresh_token));
    await markConnectionHealthy(connection);
  };

  /* A provider sends the browser back here with its code. The code is not
     used here, where anyone's browser could arrive with anyone's approval:
     it goes on to the app, and the account signed in there finishes it, only
     if it is the account that started it. */
  const OAUTH_FINISH = { readwise: finishReadwise, notion: finishNotion };

  router.get('/api/import/:provider(readwise|notion)/oauth/callback', (req, res) => {
    const { provider } = req.params;
    const next = new URL('/connections', getImportAppUrl(req));
    next.searchParams.set('source', provider);
    const code = toTrimmedString(req.query.code);
    const state = toTrimmedString(req.query.state);
    if (code && state) {
      next.searchParams.set(provider, 'finish');
      next.searchParams.set('code', code);
      next.searchParams.set('state', state);
    } else {
      next.searchParams.set(provider, 'error');
    }
    return res.redirect(next.toString());
  });

  router.post('/api/import/:provider(readwise|notion)/oauth/finish', authenticateToken, async (req, res) => {
    try {
      const code = toTrimmedString(req.body?.code);
      const state = toTrimmedString(req.body?.state);
      if (!code || !state) return res.status(400).json({ error: 'Missing OAuth code or state.' });
      await OAUTH_FINISH[req.params.provider]({ req, userId: req.user.id, code, state });
      return res.status(200).json({ connected: true });
    } catch (error) {
      console.error(`${req.params.provider} OAuth finish failed:`, error.message);
      return res.status(400).json({ error: 'That approval could not be finished. Connect again from here.' });
    }
  });

  router.post('/api/import/notion/check', authenticateToken, async (req, res) => {
    try {
      const connectionId = toTrimmedString(req.body?.connectionId);
      if (!connectionId) {
        return res.status(400).json({ error: 'connectionId is required.' });
      }

      const connection = await IntegrationConnection.findOne({
        _id: connectionId,
        userId: req.user.id,
        provider: 'notion'
      });
      if (!connection) {
        return res.status(404).json({ error: 'Notion connection not found.' });
      }
      if (!connection.encryptedAccessToken) {
        await markConnectionError(connection, 'Notion access token is missing for this connection.');
        return res.status(400).json({ error: 'Notion access token is missing for this connection.' });
      }

      try {
        const accessToken = decryptSecret(connection.encryptedAccessToken);
        const pagePreview = await searchNotionPreviewItems({
          token: accessToken,
          filterValue: 'page',
          pageSize: 1
        });
        await markConnectionHealthy(connection);
        return res.status(200).json({
          ok: true,
          connection: sanitizeConnection(connection.toObject()),
          diagnostics: {
            accessiblePagesSampled: pagePreview.results.length,
            hasMore: Boolean(pagePreview.hasMore)
          }
        });
      } catch (error) {
        await markConnectionError(connection, 'Notion authentication failed.');
        return res.status(400).json({
          ok: false,
          error: 'Notion authentication failed.',
          connection: sanitizeConnection(connection.toObject())
        });
      }
    } catch (error) {
      console.error('Notion connection check failed:', error);
      res.status(500).json({ error: 'Failed to check Notion connection.' });
    }
  });

  router.post('/api/import/notion/preview', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const importSessionId = readImportSessionId(req);
    try {
      const connectionId = toTrimmedString(req.body?.connectionId);
      if (!connectionId) {
        return res.status(400).json({ error: 'connectionId is required.' });
      }

      const connection = await IntegrationConnection.findOne({
        _id: connectionId,
        userId,
        provider: 'notion'
      });
      if (!connection) {
        return res.status(404).json({ error: 'Notion connection not found.' });
      }
      if (!connection.encryptedAccessToken) {
        return res.status(400).json({ error: 'Notion access token is missing for this connection.' });
      }

      const accessToken = decryptSecret(connection.encryptedAccessToken);
      const pagePreview = await searchNotionPreviewItems({ token: accessToken, filterValue: 'page', pageSize: 25 });
      const dataSourcePreview = await searchNotionPreviewItems({ token: accessToken, filterValue: 'data_source', pageSize: 10 });
      const sampleRows = [];

      for (const dataSource of dataSourcePreview.results.slice(0, 3)) {
        const dataSourceId = toTrimmedString(dataSource?.id);
        if (!dataSourceId) continue;
        const rowPreview = await queryNotionDataSourcePreviewPages({
          token: accessToken,
          dataSourceId,
          pageSize: 5
        });
        sampleRows.push(...rowPreview.results);
      }

      const sampleTitles = uniqueStrings([
        ...pagePreview.results.map(page => extractNotionTitle(page)),
        ...sampleRows.map(page => extractNotionTitle(page))
      ], 8);
      const sampleDatabases = uniqueStrings(
        dataSourcePreview.results.map(dataSource => toTrimmedString(dataSource?.title?.[0]?.plain_text || dataSource?.id || 'Database')),
        6
      );

      const previewWarningEntries = [];
      if (pagePreview.hasMore || dataSourcePreview.hasMore) {
        previewWarningEntries.push(buildWarning('preview_sampled', 'Preview is sampled from the first page of your accessible Notion content.'));
      }
      if (dataSourcePreview.results.length > 3) {
        previewWarningEntries.push(buildWarning('database_preview_limited', 'Database row sampling is limited to the first 3 data sources for speed.'));
      }
      if (pagePreview.results.length === 0 && dataSourcePreview.results.length === 0) {
        previewWarningEntries.push(buildWarning('no_accessible_content', 'No pages or databases were returned by Notion. Share content with the integration and try again.'));
      }
      const previewWarnings = summarizeWarnings(previewWarningEntries);

      const preview = {
        items: pagePreview.results.length + dataSourcePreview.results.length,
        articles: 0,
        highlights: 0,
        notes: pagePreview.results.length + sampleRows.length,
        pages: pagePreview.results.length,
        databases: dataSourcePreview.results.length,
        notebooks: 0,
        sampleTitles,
        sampleDatabases,
        sampleRows: sampleRows.length,
        warningCodes: previewWarnings.warningCodes,
        warnings: previewWarnings.warnings
      };
      await markConnectionHealthy(connection, { previewed: true });

      const session = await savePreviewToSession({
        sessionId: importSessionId,
        userId,
        sourceLabel: connection.accountLabel || 'Notion',
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
        } : null,
        connection: sanitizeConnection(connection.toObject())
      });
    } catch (error) {
      console.error('Notion preview failed:', error);
      const failedSession = await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to preview Notion content.';
          session.receipt = buildNoeisImportReceipt({
            id: `import-${importSessionId || 'notion-preview'}-${Date.now()}`,
            source: 'notion',
            sourceLabel: session.sourceLabel || 'Notion',
            status: 'failed',
            error: {
              stage: 'preview_failed',
              message: 'Failed to preview Notion content.',
              retryable: true
            }
          });
        }
      });
      await persistImportReceipt({ userId, receipt: failedSession?.receipt });
      res.status(500).json({ error: 'Failed to preview Notion content.' });
    }
  });

  router.post('/api/import/notion/sync', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const importSessionId = readImportSessionId(req);
    try {
      const connectionId = toTrimmedString(req.body?.connectionId);
      if (!connectionId) {
        return res.status(400).json({ error: 'connectionId is required.' });
      }
      const connection = await IntegrationConnection.findOne({
        _id: connectionId,
        userId,
        provider: 'notion'
      });
      if (!connection) {
        return res.status(404).json({ error: 'Notion connection not found.' });
      }
      if (!connection.encryptedAccessToken) {
        return res.status(400).json({ error: 'Notion access token is missing for this connection.' });
      }

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'importing';
          session.sourceLabel = connection.accountLabel || 'Notion';
          session.connectionId = connection._id;
          clearImportOrganizationOffer(session);
          session.progress = {
            ...(session.progress || {}),
            stage: 'fetching_notion',
            indexingState: 'not_started'
          };
        }
      });

      const accessToken = decryptSecret(connection.encryptedAccessToken);
      const pages = await searchNotionItems({ token: accessToken, filterValue: 'page', pageSize: 100 });
      const dataSources = await searchNotionItems({ token: accessToken, filterValue: 'data_source', pageSize: 100 });
      const notionImportIndex = buildNotionImportIndex({ pages, dataSources });

      let importedNotes = 0;
      let skippedRows = 0;
      const syncedEntries = [];
      const indexing = buildIndexingSummary();
      const sourceLabel = connection.accountLabel || 'Notion';

      for (const page of pages) {
        const { entry, created, updated } = await buildNotebookEntryFromNotionPage({
          token: accessToken,
          page,
          userId,
          importSessionId,
          sourceLabel,
          parentExternalId: extractNotionParentRef(page).id,
          folderPathSegments: resolveNotionFolderPath({
            item: page,
            importIndex: notionImportIndex
          })
        });
        if (!entry || (!created && !updated)) {
          skippedRows += 1;
          continue;
        }
        syncedEntries.push(entry);
        importedNotes += 1;
      }

      for (const dataSource of dataSources) {
        const dataSourceId = toTrimmedString(dataSource?.id);
        if (!dataSourceId) continue;
        const rowPages = await queryNotionDataSourcePages({
          token: accessToken,
          dataSourceId
        });
        for (const rowPage of rowPages) {
          const { entry, created, updated } = await buildNotebookEntryFromNotionPage({
            token: accessToken,
            page: rowPage,
            userId,
            importSessionId,
            sourceLabel,
            parentExternalId: extractNotionParentRef(rowPage).id || dataSourceId,
            folderPathSegments: resolveNotionFolderPath({
              item: rowPage,
              importIndex: notionImportIndex
            })
          });
          if (!entry || (!created && !updated)) {
            skippedRows += 1;
            continue;
          }
          syncedEntries.push(entry);
          importedNotes += 1;
        }
      }

      await Promise.all(syncedEntries.map(entry => queueIndexingAttempt(
        indexing,
        () => enqueueNotebookEmbedding(entry),
        `Notebook indexing failed for ${entry.title || entry._id}`
      )));

      persistConnectionLastSyncResult(connection, {
        importedNotes,
        skippedRows,
        indexingQueued: indexing.indexingQueued,
        indexingFailures: indexing.indexingFailures
      });

      const warningEntries = indexing.warnings.map(message => buildWarning('indexing_failed', message));
      if (pages.length === 0 && dataSources.length === 0) {
        warningEntries.push(buildWarning('no_accessible_content', 'No pages or databases were returned by Notion search. Share content with the integration and try again.'));
      }
      const warningSummary = summarizeWarnings(warningEntries);
      const status = finalizeSessionStatus({
        ...indexing,
        warnings: warningSummary.warnings
      }, 0);
      connection.lastReceipt = buildNoeisImportReceipt({
        id: `import-${importSessionId || 'notion'}-${Date.now()}`,
        source: 'notion',
        sourceLabel: connection.accountLabel || 'Notion',
        status,
        result: {
          importedArticles: 0,
          importedHighlights: 0,
          importedNotes,
          skippedRows,
          duplicateSkips: skippedRows,
          invalidSkips: 0,
          parseErrors: 0,
          indexingQueued: indexing.indexingQueued,
          indexingFailures: indexing.indexingFailures
        },
        touched: syncedEntries.map(entry => ({
          type: 'note',
          id: String(entry._id || ''),
          title: entry.title || 'Imported note'
        })),
        nextAction: syncedEntries.length > 0
          ? { label: 'Review filing suggestions', intent: 'organize_import' }
          : null
      });
      await markConnectionHealthy(connection);
      const resultPayload = {
        importedArticles: 0,
        importedHighlights: 0,
        importedNotes,
        skippedRows,
        parseErrors: 0,
        indexingAttempts: indexing.indexingAttempts,
        indexingFailures: indexing.indexingFailures,
        indexingQueued: indexing.indexingQueued,
        duplicateSkips: skippedRows,
        invalidSkips: 0,
        warningCodes: warningSummary.warningCodes,
        warnings: warningSummary.warnings,
        entryId: syncedEntries[0] ? String(syncedEntries[0]._id) : '',
        entryIds: syncedEntries.map(entry => String(entry._id || '')),
        importedEntryIds: syncedEntries.map(entry => String(entry._id || '')),
        pageCount: pages.length,
        dataSourceCount: dataSources.length,
        connection: sanitizeConnection(connection.toObject()),
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started'),
        receipt: sanitizeNoeisReceipt(connection.lastReceipt)
      };

      const completedSession = await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = status;
          session.preview = {
            ...(session.preview || {}),
            items: pages.length + dataSources.length,
            notes: importedNotes,
            pages: pages.length,
            databases: dataSources.length,
            warningCodes: warningSummary.warningCodes,
            warnings: warningSummary.warnings
          };
          session.progress = {
            ...(session.progress || {}),
            stage: 'import_complete',
            itemsProcessed: pages.length + dataSources.length,
            itemsTotal: pages.length + dataSources.length,
            percent: 100,
            indexingState: resultPayload.indexingState
          };
          session.result = {
            ...(session.result || {}),
            importedArticles: 0,
            importedHighlights: 0,
            importedNotes,
            skippedRows,
            duplicateSkips: skippedRows,
            invalidSkips: 0,
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
          source: 'notion-oauth',
          importedNotes,
          skippedRows,
          pageCount: pages.length,
          dataSourceCount: dataSources.length
        }
      });

      res.status(200).json(resultPayload);
    } catch (error) {
      console.error('Notion sync failed:', error);
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
          session.lastError = 'Failed to sync from Notion.';
          session.receipt = buildNoeisImportReceipt({
            id: `import-${importSessionId || 'notion'}-${Date.now()}`,
            source: 'notion',
            sourceLabel: session.sourceLabel || 'Notion',
            status: 'failed',
            error: {
              stage: 'failed',
              message: 'Failed to sync from Notion.',
              retryable: true
            }
          });
        }
      });
      await persistImportReceipt({ userId, receipt: failedSession?.receipt });
      res.status(500).json({ error: 'Failed to sync from Notion.' });
    }
  });

  router.post('/api/export/notion/page', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const connectionId = toTrimmedString(req.body?.connectionId);
      const entityType = toTrimmedString(req.body?.entityType).toLowerCase();
      const parentPageId = toTrimmedString(req.body?.parentPageId);

      if (!connectionId) {
        return res.status(400).json({ error: 'connectionId is required.' });
      }
      if (!['notebook', 'concept'].includes(entityType)) {
        return res.status(400).json({ error: 'entityType must be notebook or concept.' });
      }

      const connection = await IntegrationConnection.findOne({
        _id: connectionId,
        userId,
        provider: 'notion'
      });
      if (!connection) {
        return res.status(404).json({ error: 'Notion connection not found.' });
      }
      if (!connection.encryptedAccessToken) {
        return res.status(400).json({ error: 'Notion access token is missing for this connection.' });
      }

      const accessToken = decryptSecret(connection.encryptedAccessToken);
      let title = '';
      let children = [];

      if (entityType === 'notebook') {
        const notebookEntryId = toTrimmedString(req.body?.notebookEntryId);
        if (!notebookEntryId) {
          return res.status(400).json({ error: 'notebookEntryId is required for notebook export.' });
        }
        const entry = await NotebookEntry.findOne({ _id: notebookEntryId, userId }).lean();
        if (!entry) {
          return res.status(404).json({ error: 'Notebook entry not found.' });
        }
        title = toTrimmedString(entry.title) || 'Untitled note';
        children = buildNotebookExportBlocks(entry);
      }

      if (entityType === 'concept') {
        const conceptName = toTrimmedString(req.body?.conceptName);
        if (!conceptName) {
          return res.status(400).json({ error: 'conceptName is required for concept export.' });
        }
        const exported = await buildConceptExportBlocks({ userId, conceptName });
        if (!exported?.concept) {
          return res.status(404).json({ error: 'Concept not found.' });
        }
        title = toTrimmedString(exported.concept.name) || conceptName;
        children = exported.children;
      }

      if (!title) {
        return res.status(400).json({ error: 'Could not build a Notion page title for export.' });
      }

      const notionPage = await createNotionPage({
        token: accessToken,
        title,
        children,
        parentPageId
      });

      connection.lastSyncAt = new Date();
      await markConnectionHealthy(connection);

      return res.status(201).json({
        ok: true,
        page: {
          id: toTrimmedString(notionPage?.id),
          url: toTrimmedString(notionPage?.url),
          title
        },
        connection: sanitizeConnection(connection.toObject())
      });
    } catch (error) {
      console.error('Notion export failed:', error);
      return res.status(500).json({ error: 'Failed to export to Notion.' });
    }
  });
};
