// Readwise: connecting by token, OAuth or MCP, checking, previewing and syncing highlights.
const { assertReadwiseTokenValid, fetchReadwisePreviewRows } = require('../../services/import/readwiseClient');
const { encryptSecret, decryptSecret } = require('../../utils/integrationSecrets');
const { buildReadwisePreviewSummary } = require('../../services/import/readwiseTransform');

module.exports = (router, {
  EVENT_NAMES,
  IntegrationConnection,
  READWISE_MCP_SERVER_URL,
  READWISE_OAUTH_AUTHORIZE_URL,
  READWISE_OAUTH_SCOPES,
  applyImportOrganizationOffer,
  authenticateToken,
  buildNoeisImportReceipt,
  clearImportOrganizationOffer,
  createReadwisePkcePair,
  createReadwiseState,
  getReadwiseRedirectUri,
  markConnectionError,
  markConnectionHealthy,
  markImportSessionUnavailable,
  patchImportSession,
  persistImportReceipt,
  readImportSessionId,
  registerReadwiseOAuthClient,
  resolveReadwiseCredential,
  sanitizeConnection,
  savePreviewToSession,
  stageImportOrganizationProposalForSession,
  syncReadwiseConnection,
  toTrimmedString,
  trackEvent
}) => {
  router.post('/api/import/readwise/connect', authenticateToken, async (req, res) => {
    try {
      const apiToken = toTrimmedString(req.body?.apiToken);
      const accountLabel = toTrimmedString(req.body?.accountLabel) || 'Readwise';
      if (!apiToken) {
        return res.status(400).json({ error: 'apiToken is required.' });
      }

      await assertReadwiseTokenValid(apiToken);

      let connection = await IntegrationConnection.findOne({
        userId: req.user.id,
        provider: 'readwise',
        mode: 'api_token'
      }).sort({ updatedAt: -1, createdAt: -1 });

      if (!connection) {
        connection = new IntegrationConnection({
          userId: req.user.id,
          provider: 'readwise',
          mode: 'api_token'
        });
      }

      connection.accountLabel = accountLabel;
      connection.encryptedApiToken = encryptSecret(apiToken);
      await markConnectionHealthy(connection);

      res.status(200).json({ connection: sanitizeConnection(connection.toObject()) });
    } catch (error) {
      console.error('Readwise connect failed:', error);
      res.status(400).json({ error: 'Failed to validate Readwise token.' });
    }
  });

  router.post('/api/import/readwise/oauth/start', authenticateToken, async (req, res) => {
    try {
      const redirectUri = getReadwiseRedirectUri(req);
      const { verifier, challenge } = createReadwisePkcePair();
      const client = await registerReadwiseOAuthClient({ redirectUri });
      const clientId = toTrimmedString(client?.client_id);
      const clientSecret = toTrimmedString(client?.client_secret);
      const state = createReadwiseState({
        userId: req.user.id,
        codeVerifier: verifier,
        clientId,
        clientSecret
      });
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: READWISE_OAUTH_SCOPES.join(' '),
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256'
      });
      res.status(200).json({
        authUrl: `${READWISE_OAUTH_AUTHORIZE_URL}?${params.toString()}`
      });
    } catch (error) {
      console.error('Failed to start Readwise OAuth:', error);
      res.status(500).json({ error: 'Failed to start Readwise browser authorization.' });
    }
  });

  router.post('/api/import/readwise/mcp/connect', authenticateToken, async (req, res) => {
    try {
      const accountLabel = toTrimmedString(req.body?.accountLabel) || 'Readwise MCP';
      const mcpServerUrl = READWISE_MCP_SERVER_URL;

      let connection = await IntegrationConnection.findOne({
        userId: req.user.id,
        provider: 'readwise',
        mode: 'mcp_remote'
      });

      if (!connection) {
        connection = new IntegrationConnection({
          userId: req.user.id,
          provider: 'readwise',
          mode: 'mcp_remote'
        });
      }

      connection.accountLabel = accountLabel;
      connection.externalAccountId = mcpServerUrl;
      connection.status = 'connected';
      connection.health = 'healthy';
      connection.scopes = [
        'mcp:readwise.highlights.read',
        'mcp:reader.documents.read',
        'mcp:reader.documents.write'
      ];
      connection.lastValidatedAt = new Date();
      connection.lastError = '';
      await connection.save();

      res.status(200).json({
        connection: sanitizeConnection(connection.toObject()),
        mcpServerUrl,
        message: 'Readwise MCP connection saved. Use the server URL in an MCP-compatible client to complete Readwise browser authorization.'
      });
    } catch (error) {
      console.error('Readwise MCP connect failed:', error);
      res.status(500).json({ error: 'Failed to save Readwise MCP connection.' });
    }
  });

  router.post('/api/import/readwise/check', authenticateToken, async (req, res) => {
    try {
      const connectionId = toTrimmedString(req.body?.connectionId);
      if (!connectionId) {
        return res.status(400).json({ error: 'connectionId is required.' });
      }

      const connection = await IntegrationConnection.findOne({
        _id: connectionId,
        userId: req.user.id,
        provider: 'readwise'
      });
      if (!connection) {
        return res.status(404).json({ error: 'Readwise connection not found.' });
      }
      if (connection.status === 'revoked') {
        return res.status(400).json({ error: 'This Readwise connection was disconnected.' });
      }
      if (connection.mode === 'mcp_remote') {
        return res.status(200).json({
          ok: true,
          connection: sanitizeConnection(connection.toObject()),
          message: 'Readwise MCP is configured for agent access. Direct Noeis sync uses the manual token fallback until the hosted MCP broker ships.'
        });
      }
      if (!connection.encryptedApiToken) {
        await markConnectionError(connection, 'Readwise token is missing for this connection.');
        return res.status(400).json({ error: 'Readwise token is missing for this connection.' });
      }

      try {
        await assertReadwiseTokenValid(decryptSecret(connection.encryptedApiToken));
        await markConnectionHealthy(connection);
        return res.status(200).json({
          ok: true,
          connection: sanitizeConnection(connection.toObject())
        });
      } catch (error) {
        await markConnectionError(connection, 'Readwise authentication failed.');
        return res.status(400).json({
          ok: false,
          error: 'Readwise authentication failed.',
          connection: sanitizeConnection(connection.toObject())
        });
      }
    } catch (error) {
      console.error('Readwise connection check failed:', error);
      res.status(500).json({ error: 'Failed to check Readwise connection.' });
    }
  });

  router.post('/api/import/readwise/preview', authenticateToken, async (req, res) => {
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
        provider: 'readwise'
      });
      if (!connection) {
        return res.status(404).json({ error: 'Readwise connection not found.' });
      }
      const previewCredential = resolveReadwiseCredential(connection);
      if (!previewCredential) {
        const message = 'Readwise is connected but did not return anything Noeis can read with. Reconnect, or add an API token under Advanced.';
        await markImportSessionUnavailable({
          sessionId: importSessionId,
          userId,
          stage: 'readwise_sync_unavailable',
          message
        });
        return res.status(409).json({
          error: message,
          connection: sanitizeConnection(connection.toObject())
        });
      }
      const { results, hasMore } = await fetchReadwisePreviewRows({
        token: previewCredential.token,
        tokenType: previewCredential.tokenType,
        limit: 25
      });
      const preview = buildReadwisePreviewSummary({ results, hasMore });
      await markConnectionHealthy(connection, { previewed: true });

      const session = await savePreviewToSession({
        sessionId: importSessionId,
        userId,
        sourceLabel: connection.accountLabel || 'Readwise',
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
      console.error('Readwise preview failed:', error);
      const failedSession = await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to preview Readwise content.';
          session.receipt = buildNoeisImportReceipt({
            id: `import-${importSessionId || 'readwise-preview'}-${Date.now()}`,
            source: 'readwise',
            sourceLabel: session.sourceLabel || 'Readwise',
            status: 'failed',
            error: {
              stage: 'preview_failed',
              message: 'Failed to preview Readwise content.',
              retryable: true
            }
          });
        }
      });
      await persistImportReceipt({ userId, receipt: failedSession?.receipt });
      res.status(500).json({ error: 'Failed to preview Readwise content.' });
    }
  });

  router.post('/api/import/readwise/sync', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const importSessionId = readImportSessionId(req);
    try {
      const connectionId = toTrimmedString(req.body?.connectionId);
      const fullSync = Boolean(req.body?.fullSync);
      if (!connectionId) {
        return res.status(400).json({ error: 'connectionId is required.' });
      }

      const connection = await IntegrationConnection.findOne({
        _id: connectionId,
        userId,
        provider: 'readwise'
      });
      if (!connection) {
        return res.status(404).json({ error: 'Readwise connection not found.' });
      }
      // Browser approval already returns an access token scoped to read highlights.
      // This used to refuse it and send the user to find an API token under
      // Advanced, so the recommended way to connect was the one way that could
      // not fill a library.
      if (!resolveReadwiseCredential(connection)) {
        const message = 'Readwise is connected but did not return anything Noeis can read with. Reconnect, or add an API token under Advanced.';
        await markImportSessionUnavailable({
          sessionId: importSessionId,
          userId,
          stage: 'readwise_sync_unavailable',
          message
        });
        return res.status(409).json({
          error: message,
          connection: sanitizeConnection(connection.toObject())
        });
      }

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'importing';
          session.sourceLabel = connection.accountLabel || 'Readwise';
          session.connectionId = connection._id;
          clearImportOrganizationOffer(session);
          session.progress = {
            ...(session.progress || {}),
            stage: 'fetching_readwise',
            indexingState: 'not_started'
          };
        }
      });

      const { result, itemCount } = await syncReadwiseConnection({
        connection,
        importSessionId,
        fullSync
      });
      const { importedArticles, importedHighlights, skippedRows } = result;
      const completedSession = await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = result.receipt.status;
          session.preview = {
            ...(session.preview || {}),
            items: itemCount,
            articles: importedArticles,
            highlights: importedHighlights
          };
          session.progress = {
            ...(session.progress || {}),
            stage: 'import_complete',
            itemsProcessed: itemCount,
            itemsTotal: itemCount,
            percent: 100,
            indexingState: result.indexingState
          };
          session.result = {
            ...(session.result || {}),
            importedArticles,
            importedHighlights,
            importedNotes: 0,
            skippedRows,
            duplicateSkips: result.duplicateSkips,
            invalidSkips: result.invalidSkips,
            parseErrors: 0,
            indexingAttempts: result.indexingAttempts,
            indexingFailures: result.indexingFailures,
            indexingQueued: result.indexingQueued,
            warningCodes: result.warningCodes,
            warnings: result.warnings,
            lastImportedArticleId: result.articleIds[0] || '',
            importedArticleIds: result.importedArticleIds
          };
          session.receipt = result.receipt;
          session.lastError = '';
          applyImportOrganizationOffer(session);
        }
      });
      await stageImportOrganizationProposalForSession({
        session: completedSession,
        userId,
        articleIds: result.importedArticleIds
      });

      trackEvent({
        event: EVENT_NAMES.CAPTURE_COMPLETED,
        userId,
        requestId: req.requestId,
        properties: {
          source: 'readwise-api',
          importedArticles,
          importedHighlights,
          skippedRows
        }
      });

      res.status(200).json(result);
    } catch (error) {
      console.error('Readwise sync failed:', error);
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
          session.lastError = 'Failed to sync from Readwise.';
          session.receipt = buildNoeisImportReceipt({
            id: `import-${importSessionId || 'readwise-api'}-${Date.now()}`,
            source: 'readwise',
            sourceLabel: session.sourceLabel || 'Readwise',
            status: 'failed',
            error: {
              stage: 'failed',
              message: 'Failed to sync from Readwise.',
              retryable: true
            }
          });
        }
      });
      res.status(500).json({ error: 'Failed to sync from Readwise.' });
    }
  });
};
