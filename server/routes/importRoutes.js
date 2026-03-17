const express = require('express');
const jwt = require('jsonwebtoken');
const { encryptSecret, decryptSecret } = require('../utils/integrationSecrets');
const {
  blockToPlainText,
  buildNotionPropertyLines,
  extractNotionTitle,
  flattenNotionRichText
} = require('../services/import/notionTransform');
const {
  buildNotebookPayloadFromLines,
  parseEnexNotes,
  parseEvernoteDate
} = require('../services/import/evernoteTransform');
const {
  buildWarning,
  summarizeWarnings,
  uniqueStrings
} = require('../services/import/importDiagnostics');
const {
  assertReadwiseTokenValid,
  fetchReadwiseExportRows,
  fetchReadwisePreviewRows
} = require('../services/import/readwiseClient');
const {
  buildReadwisePreviewSummary
} = require('../services/import/readwiseTransform');
const {
  NOTION_AUTHORIZE_URL,
  exchangeNotionCode,
  fetchNotionBlockChildren,
  queryNotionDataSourcePages,
  queryNotionDataSourcePreviewPages,
  searchNotionItems,
  searchNotionPreviewItems
} = require('../services/import/notionClient');

const toTrimmedString = (value = '') => String(value || '').trim();

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
  ImportSession,
  IntegrationConnection,
  syncNotebookReferences,
  enqueueArticleEmbedding,
  enqueueHighlightEmbedding,
  enqueueNotebookEmbedding
}) => {
  const router = express.Router();

  const patchImportSession = async ({ sessionId, userId, mutate }) => {
    const safeSessionId = toTrimmedString(sessionId);
    if (!safeSessionId || !mutate) return null;
    try {
      const session = await ImportSession.findOne({ _id: safeSessionId, userId });
      if (!session) return null;
      mutate(session);
      await session.save();
      return session;
    } catch (error) {
      console.error('Failed updating import session:', error);
      return null;
    }
  };

  const buildIndexingSummary = () => ({
    indexingAttempts: 0,
    indexingFailures: 0,
    indexingQueued: 0,
    warnings: []
  });

  const queueIndexingAttempt = (summary, action, warningLabel) => {
    summary.indexingAttempts += 1;
    try {
      action();
      summary.indexingQueued += 1;
    } catch (error) {
      summary.indexingFailures += 1;
      summary.warnings.push(`${warningLabel}: ${error.message}`);
    }
  };

  const finalizeSessionStatus = (summary, parsedErrors = 0) => {
    if (summary.indexingFailures > 0 || parsedErrors > 0 || summary.warnings.length > 0) {
      return 'completed_with_warnings';
    }
    return 'completed';
  };

  const readImportSessionId = (req) => (
    toTrimmedString(req.body?.importSessionId || req.query?.importSessionId)
  );

  const sanitizeConnection = (connection) => {
    if (!connection) return null;
    return {
      id: String(connection._id || ''),
      provider: toTrimmedString(connection.provider),
      status: toTrimmedString(connection.status),
      health: toTrimmedString(connection.health) || 'unknown',
      accountLabel: toTrimmedString(connection.accountLabel),
      externalAccountId: toTrimmedString(connection.externalAccountId),
      mode: toTrimmedString(connection.mode),
      scopes: Array.isArray(connection.scopes) ? connection.scopes : [],
      lastSyncAt: connection.lastSyncAt ? new Date(connection.lastSyncAt).toISOString() : null,
      lastValidatedAt: connection.lastValidatedAt ? new Date(connection.lastValidatedAt).toISOString() : null,
      lastPreviewAt: connection.lastPreviewAt ? new Date(connection.lastPreviewAt).toISOString() : null,
      lastError: toTrimmedString(connection.lastError),
      createdAt: connection.createdAt ? new Date(connection.createdAt).toISOString() : null,
      updatedAt: connection.updatedAt ? new Date(connection.updatedAt).toISOString() : null
    };
  };

  const getNotionRedirectUri = (req) => (
    toTrimmedString(process.env.NOTION_REDIRECT_URI)
    || `${req.protocol}://${req.get('host')}/api/import/notion/oauth/callback`
  );

  const getNotionAppUrl = (req) => (
    toTrimmedString(process.env.WEB_APP_URL)
    || toTrimmedString(process.env.APP_URL)
    || `${req.protocol}://${req.get('host')}`
  );

  const createNotionState = ({ userId }) => jwt.sign(
    {
      provider: 'notion',
      userId: String(userId || '').trim(),
      nonce: crypto.randomUUID()
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  const verifyNotionState = (value = '') => {
    const decoded = jwt.verify(String(value || ''), process.env.JWT_SECRET);
    if (decoded?.provider !== 'notion' || !decoded?.userId) {
      throw new Error('Invalid Notion OAuth state.');
    }
    return decoded;
  };

  const savePreviewToSession = async ({
    sessionId,
    userId,
    sourceLabel,
    preview
  }) => patchImportSession({
    sessionId,
    userId,
    mutate: (session) => {
      session.status = 'preview_ready';
      session.sourceLabel = session.sourceLabel || sourceLabel;
      session.preview = {
        ...(session.preview || {}),
        ...(preview || {}),
        lastPreviewedAt: new Date()
      };
      session.progress = {
        ...(session.progress || {}),
        stage: 'preview_ready',
        percent: Math.max(session.progress?.percent || 0, 15),
        indexingState: session.progress?.indexingState || 'not_started'
      };
      session.lastError = '';
    }
  });

  const markConnectionHealthy = async (connection, { previewed = false } = {}) => {
    if (!connection) return;
    connection.status = 'connected';
    connection.health = 'healthy';
    connection.lastValidatedAt = new Date();
    if (previewed) {
      connection.lastPreviewAt = new Date();
    }
    connection.lastError = '';
    await connection.save();
  };

  const markConnectionError = async (connection, message) => {
    if (!connection) return;
    connection.status = 'error';
    connection.health = 'error';
    connection.lastValidatedAt = new Date();
    connection.lastError = toTrimmedString(message);
    await connection.save();
  };

  const buildNotebookEntryFromNotionPage = async ({
    token,
    page,
    userId,
    importSessionId,
    sourceLabel,
    parentExternalId = ''
  }) => {
    const externalId = toTrimmedString(page?.id);
    if (!externalId) return { entry: null, created: false };
    const existing = await NotebookEntry.findOne({
      userId,
      'importMeta.provider': 'notion',
      'importMeta.externalId': externalId
    });
    if (existing) {
      return { entry: existing, created: false };
    }

    const title = extractNotionTitle(page);
    const propertyLines = buildNotionPropertyLines(page);
    const blockTexts = await fetchNotionBlockChildren({ token, blockId: externalId, blockToPlainText });
    const combinedLines = [...propertyLines, ...blockTexts].filter(Boolean);
    const blocks = combinedLines.length > 0
      ? combinedLines.map((text) => ({
          id: crypto.randomUUID(),
          type: 'paragraph',
          text
        }))
      : [{
          id: crypto.randomUUID(),
          type: 'paragraph',
          text: title
        }];
    const content = blocks.map(block => `<p>${block.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('');
    const entry = new NotebookEntry({
      title,
      content,
      blocks,
      tags: ['notion-import'],
      userId,
      importMeta: {
        provider: 'notion',
        sourceType: 'oauth',
        sourceLabel,
        sourceUrl: toTrimmedString(page?.url),
        externalId,
        parentExternalId,
        importSessionId: importSessionId || null,
        importedAt: new Date()
      }
    });
    await entry.save();
    await syncNotebookReferences(userId, entry._id, blocks);
    return { entry, created: true };
  };

  const handleReadwiseImport = async (req, res) => {
    const importSessionId = readImportSessionId(req);
    const userId = req.user.id;

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'CSV file is required.' });
      }

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'importing';
          session.sourceLabel = session.sourceLabel || req.file.originalname || 'Readwise CSV';
          session.progress = {
            ...(session.progress || {}),
            stage: 'upload_received',
            indexingState: 'not_started'
          };
        }
      });

      const csvText = req.file.buffer.toString('utf8');
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const rows = Array.isArray(parsed.data) ? parsed.data : [];

      let importedArticles = 0;
      let importedHighlights = 0;
      let skippedRows = 0;
      let duplicateSkips = 0;
      let invalidSkips = 0;

      const articleCache = new Map();
      const dirtyArticles = new Set();
      const pendingHighlightRefs = [];
      for (const row of rows) {
        const highlightText = toTrimmedString(findRowValue(row, ['Highlight', 'Text', 'Highlight text']));
        if (!highlightText) {
          skippedRows += 1;
          invalidSkips += 1;
          continue;
        }

        const title = toTrimmedString(findRowValue(row, ['Title', 'Book Title', 'Article Title'])) || 'Untitled';
        const author = toTrimmedString(findRowValue(row, ['Author']));
        let url = toTrimmedString(findRowValue(row, ['URL', 'Source URL', 'Link']));
        if (!url) {
          const base = `${slugify(title)}-${slugify(author || 'source')}`;
          url = `import://readwise/${base || 'untitled'}`;
        }

        const note = toTrimmedString(findRowValue(row, ['Note', 'Notes']));
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
              userId,
              importMeta: {
                provider: 'readwise',
                sourceType: 'csv',
                sourceLabel: req.file.originalname || 'Readwise CSV',
                sourceUrl: url,
                importSessionId: importSessionId || null,
                importedAt: new Date()
              }
            });
            importedArticles += 1;
          }
          articleCache.set(url, article);
        }

        const alreadyExists = (article.highlights || []).some(h => h.text === highlightText);
        if (alreadyExists) {
          skippedRows += 1;
          duplicateSkips += 1;
          continue;
        }

        article.highlights.push({
          text: highlightText,
          note,
          tags: tagList,
          createdAt,
          importMeta: {
            provider: 'readwise',
            sourceType: 'csv',
            sourceLabel: req.file.originalname || 'Readwise CSV',
            sourceUrl: url,
            importSessionId: importSessionId || null,
            importedAt: new Date()
          }
        });
        const highlightRef = article.highlights[article.highlights.length - 1];
        pendingHighlightRefs.push({ article, highlight: highlightRef });
        dirtyArticles.add(article);
        importedHighlights += 1;
      }

      await Promise.all(Array.from(dirtyArticles).map(article => article.save()));

      const indexing = buildIndexingSummary();
      Array.from(dirtyArticles).forEach((article) => {
        queueIndexingAttempt(indexing, () => enqueueArticleEmbedding(article), `Article indexing failed for ${article.title || article._id}`);
      });
      pendingHighlightRefs.forEach(({ article, highlight }) => {
        queueIndexingAttempt(indexing, () => enqueueHighlightEmbedding({ highlight, article }), `Highlight indexing failed for ${article.title || article._id}`);
      });

      const parseErrors = parsed.errors ? parsed.errors.length : 0;
      const warningEntries = indexing.warnings.map(message => buildWarning('indexing_failed', message));
      if (parseErrors > 0) {
        warningEntries.push(buildWarning('csv_parse_errors', `${parseErrors} CSV rows had parse errors.`));
      }
      const warningSummary = summarizeWarnings(warningEntries);
      const status = finalizeSessionStatus(indexing, parseErrors);
      const resultPayload = {
        importedArticles,
        importedHighlights,
        skippedRows,
        duplicateSkips,
        invalidSkips,
        parseErrors,
        indexingAttempts: indexing.indexingAttempts,
        indexingFailures: indexing.indexingFailures,
        indexingQueued: indexing.indexingQueued,
        warningCodes: warningSummary.warningCodes,
        warnings: warningSummary.warnings,
        articleIds: Array.from(dirtyArticles).map(article => String(article._id || '')),
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = status;
          session.preview = {
            ...(session.preview || {}),
            items: rows.length,
            articles: importedArticles,
            highlights: importedHighlights
          };
          session.progress = {
            ...(session.progress || {}),
            stage: 'import_complete',
            itemsProcessed: rows.length,
            itemsTotal: rows.length,
            percent: 100,
            indexingState: resultPayload.indexingState
          };
          session.result = {
            ...(session.result || {}),
            importedArticles,
            importedHighlights,
            importedNotes: 0,
            skippedRows,
            duplicateSkips,
            invalidSkips,
            parseErrors,
            indexingAttempts: indexing.indexingAttempts,
            indexingFailures: indexing.indexingFailures,
            indexingQueued: indexing.indexingQueued,
            warningCodes: warningSummary.warningCodes,
            warnings: warningSummary.warnings,
            lastImportedArticleId: resultPayload.articleIds[0] || ''
          };
          session.lastError = '';
        }
      });

      trackEvent({
        event: EVENT_NAMES.CAPTURE_COMPLETED,
        userId,
        requestId: req.requestId,
        properties: {
          source: 'readwise-csv',
          importedArticles,
          importedHighlights,
          skippedRows,
          parseErrors
        }
      });

      res.status(200).json(resultPayload);
    } catch (err) {
      console.error('Readwise CSV import failed:', err);
      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed',
            indexingState: session.progress?.indexingState || 'not_started'
          };
          session.lastError = 'Failed to import Readwise CSV.';
        }
      });
      res.status(500).json({ error: 'Failed to import Readwise CSV.' });
    }
  };

  router.post('/api/import/readwise-csv', authenticateToken, upload.single('file'), handleReadwiseImport);
  router.post('/api/import/readwise', authenticateToken, upload.single('file'), handleReadwiseImport);

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
      if (!connection.encryptedApiToken) {
        return res.status(400).json({ error: 'Readwise token is missing for this connection.' });
      }

      const apiToken = decryptSecret(connection.encryptedApiToken);
      const { results, hasMore } = await fetchReadwisePreviewRows({ token: apiToken, limit: 25 });
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
      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to preview Readwise content.';
        }
      });
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
      if (!connection.encryptedApiToken) {
        return res.status(400).json({ error: 'Readwise token is missing for this connection.' });
      }

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'importing';
          session.sourceLabel = connection.accountLabel || 'Readwise';
          session.progress = {
            ...(session.progress || {}),
            stage: 'fetching_readwise',
            indexingState: 'not_started'
          };
        }
      });

      const apiToken = decryptSecret(connection.encryptedApiToken);
      const updatedAfter = !fullSync && connection.lastSyncAt
        ? new Date(connection.lastSyncAt).toISOString()
        : '';
      const rows = await fetchReadwiseExportRows({ token: apiToken, updatedAfter });

      let importedArticles = 0;
      let importedHighlights = 0;
      let skippedRows = 0;
      const articleCache = new Map();
      const dirtyArticles = new Set();
      const pendingHighlightRefs = [];

      for (const row of rows) {
        const title = toTrimmedString(row.title) || 'Untitled';
        const author = toTrimmedString(row.author);
        const sourceUrl = toTrimmedString(row.source_url || row.url || row.readwise_url);
        const externalId = toTrimmedString(row.user_book_id || row.id);
        const sourceLabel = connection.accountLabel || 'Readwise';
        const url = sourceUrl || `import://readwise/${externalId || slugify(title) || crypto.randomUUID()}`;
        const documentTags = Array.isArray(row.book_tags)
          ? row.book_tags.map(tag => toTrimmedString(tag?.name || tag)).filter(Boolean)
          : [];

        let article = articleCache.get(url);
        if (!article) {
          article = await Article.findOne({ userId, url });
          if (!article) {
            article = new Article({
              url,
              title,
              author,
              content: toTrimmedString(row.summary || row.document_note || ''),
              userId,
              importMeta: {
                provider: 'readwise',
                sourceType: 'api',
                sourceLabel,
                sourceUrl,
                externalId,
                importSessionId: importSessionId || null,
                importedAt: new Date()
              }
            });
            importedArticles += 1;
          }
          articleCache.set(url, article);
        }

        const highlights = Array.isArray(row.highlights) ? row.highlights : [];
        for (const highlightRow of highlights) {
          if (highlightRow?.is_deleted) continue;
          const highlightText = toTrimmedString(highlightRow.text);
          if (!highlightText) {
            skippedRows += 1;
            invalidSkips += 1;
            continue;
          }
          const highlightExternalId = toTrimmedString(highlightRow.id);
          const highlightAlreadyExists = (article.highlights || []).some((highlight) => (
            (toTrimmedString(highlight?.importMeta?.externalId) && toTrimmedString(highlight?.importMeta?.externalId) === highlightExternalId)
            || highlight.text === highlightText
          ));
          if (highlightAlreadyExists) {
            skippedRows += 1;
            duplicateSkips += 1;
            continue;
          }
          const highlightTags = Array.isArray(highlightRow.tags)
            ? highlightRow.tags.map(tag => toTrimmedString(tag?.name || tag)).filter(Boolean)
            : [];
          article.highlights.push({
            text: highlightText,
            note: toTrimmedString(highlightRow.note),
            tags: highlightTags.length > 0 ? highlightTags : (documentTags.length > 0 ? documentTags : ['imported']),
            createdAt: highlightRow.highlighted_at || highlightRow.created_at || new Date(),
            importMeta: {
              provider: 'readwise',
              sourceType: 'api',
              sourceLabel,
              sourceUrl: toTrimmedString(highlightRow.readwise_url || sourceUrl),
              externalId: highlightExternalId,
              parentExternalId: externalId,
              importSessionId: importSessionId || null,
              importedAt: new Date()
            }
          });
          const highlightRef = article.highlights[article.highlights.length - 1];
          pendingHighlightRefs.push({ article, highlight: highlightRef });
          dirtyArticles.add(article);
          importedHighlights += 1;
        }
      }

      await Promise.all(Array.from(dirtyArticles).map(article => article.save()));

      const indexing = buildIndexingSummary();
      Array.from(dirtyArticles).forEach((article) => {
        queueIndexingAttempt(indexing, () => enqueueArticleEmbedding(article), `Article indexing failed for ${article.title || article._id}`);
      });
      pendingHighlightRefs.forEach(({ article, highlight }) => {
        queueIndexingAttempt(indexing, () => enqueueHighlightEmbedding({ highlight, article }), `Highlight indexing failed for ${article.title || article._id}`);
      });

      connection.lastSyncAt = new Date();
      await markConnectionHealthy(connection);

      const warningSummary = summarizeWarnings(
        indexing.warnings.map(message => buildWarning('indexing_failed', message))
      );
      const status = finalizeSessionStatus(indexing, 0);
      const resultPayload = {
        importedArticles,
        importedHighlights,
        importedNotes: 0,
        skippedRows,
        duplicateSkips,
        invalidSkips,
        parseErrors: 0,
        indexingAttempts: indexing.indexingAttempts,
        indexingFailures: indexing.indexingFailures,
        indexingQueued: indexing.indexingQueued,
        warningCodes: warningSummary.warningCodes,
        warnings: warningSummary.warnings,
        articleIds: Array.from(dirtyArticles).map(article => String(article._id || '')),
        updatedAfter,
        connection: sanitizeConnection(connection.toObject()),
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = status;
          session.preview = {
            ...(session.preview || {}),
            items: rows.length,
            articles: importedArticles,
            highlights: importedHighlights
          };
          session.progress = {
            ...(session.progress || {}),
            stage: 'import_complete',
            itemsProcessed: rows.length,
            itemsTotal: rows.length,
            percent: 100,
            indexingState: resultPayload.indexingState
          };
          session.result = {
            ...(session.result || {}),
            importedArticles,
            importedHighlights,
            importedNotes: 0,
            skippedRows,
            duplicateSkips,
            invalidSkips,
            parseErrors: 0,
            indexingAttempts: indexing.indexingAttempts,
            indexingFailures: indexing.indexingFailures,
            indexingQueued: indexing.indexingQueued,
            warningCodes: warningSummary.warningCodes,
            warnings: warningSummary.warnings,
            lastImportedArticleId: resultPayload.articleIds[0] || ''
          };
          session.lastError = '';
        }
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

      res.status(200).json(resultPayload);
    } catch (error) {
      console.error('Readwise sync failed:', error);
      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to sync from Readwise.';
        }
      });
      res.status(500).json({ error: 'Failed to sync from Readwise.' });
    }
  });

  router.post('/api/import/notion/oauth/start', authenticateToken, async (req, res) => {
    try {
      const clientId = toTrimmedString(process.env.NOTION_CLIENT_ID);
      const clientSecret = toTrimmedString(process.env.NOTION_CLIENT_SECRET);
      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: 'Notion OAuth is not configured on the server.' });
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

  router.get('/api/import/notion/oauth/callback', async (req, res) => {
    try {
      const code = toTrimmedString(req.query.code);
      const state = toTrimmedString(req.query.state);
      const redirectUri = getNotionRedirectUri(req);
      if (!code || !state) {
        throw new Error('Missing OAuth code or state.');
      }
      const decoded = verifyNotionState(state);
      const payload = await exchangeNotionCode({
        code,
        redirectUri
      });
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

      const appUrl = getNotionAppUrl(req);
      const nextUrl = new URL('/data-integrations', appUrl);
      nextUrl.searchParams.set('source', 'notion');
      nextUrl.searchParams.set('notion', 'connected');
      return res.redirect(nextUrl.toString());
    } catch (error) {
      console.error('Notion OAuth callback failed:', error);
      const appUrl = getNotionAppUrl(req);
      const nextUrl = new URL('/data-integrations', appUrl);
      nextUrl.searchParams.set('source', 'notion');
      nextUrl.searchParams.set('notion', 'error');
      return res.redirect(nextUrl.toString());
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
      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to preview Notion content.';
        }
      });
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

      let importedNotes = 0;
      let skippedRows = 0;
      const createdEntries = [];
      const indexing = buildIndexingSummary();
      const sourceLabel = connection.accountLabel || 'Notion';

      for (const page of pages) {
        const { entry, created } = await buildNotebookEntryFromNotionPage({
          token: accessToken,
          page,
          userId,
          importSessionId,
          sourceLabel
        });
        if (!entry || !created) {
          skippedRows += 1;
          continue;
        }
        createdEntries.push(entry);
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
          const { entry, created } = await buildNotebookEntryFromNotionPage({
            token: accessToken,
            page: rowPage,
            userId,
            importSessionId,
            sourceLabel,
            parentExternalId: dataSourceId
          });
          if (!entry || !created) {
            skippedRows += 1;
            continue;
          }
          createdEntries.push(entry);
          importedNotes += 1;
        }
      }

      createdEntries.forEach((entry) => {
        queueIndexingAttempt(indexing, () => enqueueNotebookEmbedding(entry), `Notebook indexing failed for ${entry.title || entry._id}`);
      });

      connection.lastSyncAt = new Date();
      await markConnectionHealthy(connection);

      const warningEntries = indexing.warnings.map(message => buildWarning('indexing_failed', message));
      if (pages.length === 0 && dataSources.length === 0) {
        warningEntries.push(buildWarning('no_accessible_content', 'No pages or databases were returned by Notion search. Share content with the integration and try again.'));
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
        parseErrors: 0,
        indexingAttempts: indexing.indexingAttempts,
        indexingFailures: indexing.indexingFailures,
        indexingQueued: indexing.indexingQueued,
        duplicateSkips: skippedRows,
        invalidSkips: 0,
        warningCodes: warningSummary.warningCodes,
        warnings: warningSummary.warnings,
        entryId: createdEntries[0] ? String(createdEntries[0]._id) : '',
        pageCount: pages.length,
        dataSourceCount: dataSources.length,
        connection: sanitizeConnection(connection.toObject()),
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };

      await patchImportSession({
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
            lastImportedEntryId: resultPayload.entryId
          };
          session.lastError = '';
        }
      });

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
      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to sync from Notion.';
        }
      });
      res.status(500).json({ error: 'Failed to sync from Notion.' });
    }
  });

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
      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to preview Evernote ENEX.';
        }
      });
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
      const createdEntries = [];
      const indexing = buildIndexingSummary();
      const sourceLabel = req.file.originalname || 'Evernote ENEX';

      for (let index = 0; index < notes.length; index += 1) {
        const note = notes[index];
        const externalId = `${slugify(note.title || 'note')}-${index + 1}`;
        const existing = await NotebookEntry.findOne({
          userId,
          'importMeta.provider': 'evernote',
          'importMeta.externalId': externalId
        });
        if (existing) {
          skippedRows += 1;
          duplicateSkips += 1;
          continue;
        }
        const { blocks, content } = buildNotebookPayloadFromLines({
          title: note.title,
          lines: note.contentLines,
          createId: () => crypto.randomUUID()
        });
        const entryPayload = {
          title: note.title,
          content,
          blocks,
          tags: note.tags,
          userId,
          importMeta: {
            provider: 'evernote',
            sourceType: 'enex',
            sourceLabel,
            sourceUrl: note.sourceUrl,
            externalId,
            importSessionId: importSessionId || null,
            importedAt: new Date()
          }
        };
        const parsedCreatedAt = parseEvernoteDate(note.created);
        const parsedUpdatedAt = parseEvernoteDate(note.updated);
        if (parsedCreatedAt) entryPayload.createdAt = parsedCreatedAt;
        if (parsedUpdatedAt) entryPayload.updatedAt = parsedUpdatedAt;
        const entry = new NotebookEntry(entryPayload);
        await entry.save();
        await syncNotebookReferences(userId, entry._id, blocks);
        createdEntries.push(entry);
        importedNotes += 1;
      }

      createdEntries.forEach((entry) => {
        queueIndexingAttempt(indexing, () => enqueueNotebookEmbedding(entry), `Notebook indexing failed for ${entry.title || entry._id}`);
      });

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
        entryId: createdEntries[0] ? String(createdEntries[0]._id) : '',
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };

      await patchImportSession({
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
            lastImportedEntryId: resultPayload.entryId
          };
          session.lastError = '';
        }
      });

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
      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to import Evernote ENEX.';
        }
      });
      res.status(500).json({ error: 'Failed to import Evernote ENEX.' });
    }
  });

  router.post('/api/import/markdown', authenticateToken, upload.single('file'), async (req, res) => {
    const importSessionId = readImportSessionId(req);
    const userId = req.user.id;

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Markdown file is required.' });
      }

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'importing';
          session.sourceLabel = session.sourceLabel || req.file.originalname || 'Imported markdown note';
          session.progress = {
            ...(session.progress || {}),
            stage: 'upload_received',
            indexingState: 'not_started'
          };
        }
      });

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
        userId,
        importMeta: {
          provider: 'markdown',
          sourceType: 'file_upload',
          sourceLabel: originalName,
          importSessionId: importSessionId || null,
          importedAt: new Date()
        }
      });
      await entry.save();
      if (blocks.length > 0) {
        await syncNotebookReferences(userId, entry._id, blocks);
      }

      const indexing = buildIndexingSummary();
      queueIndexingAttempt(indexing, () => enqueueNotebookEmbedding(entry), `Notebook indexing failed for ${entry.title || entry._id}`);

      const status = finalizeSessionStatus(indexing, 0);
      const resultPayload = {
        importedNotes: 1,
        entryId: entry._id,
        ...indexing,
        indexingState: indexing.indexingFailures > 0 ? 'failed' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = status;
          session.preview = {
            ...(session.preview || {}),
            items: 1,
            notes: 1
          };
          session.progress = {
            ...(session.progress || {}),
            stage: 'import_complete',
            itemsProcessed: 1,
            itemsTotal: 1,
            percent: 100,
            indexingState: resultPayload.indexingState
          };
          session.result = {
            ...(session.result || {}),
            importedArticles: 0,
            importedHighlights: 0,
            importedNotes: 1,
            indexingAttempts: indexing.indexingAttempts,
            indexingFailures: indexing.indexingFailures,
            indexingQueued: indexing.indexingQueued,
            warnings: indexing.warnings,
            lastImportedEntryId: String(entry._id)
          };
          session.lastError = '';
        }
      });

      trackEvent({
        event: EVENT_NAMES.WORKSPACE_CREATED,
        userId,
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
        userId,
        requestId: req.requestId,
        properties: {
          source: 'markdown',
          entryId: String(entry._id),
          importedNotes: 1,
          blockCount: blocks.length
        }
      });

      res.status(200).json(resultPayload);
    } catch (err) {
      console.error('Markdown import failed:', err);
      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'failed';
          session.progress = {
            ...(session.progress || {}),
            stage: 'failed'
          };
          session.lastError = 'Failed to import markdown file.';
        }
      });
      res.status(500).json({ error: 'Failed to import markdown file.' });
    }
  });

  return router;
};

module.exports = {
  buildImportRouter
};
