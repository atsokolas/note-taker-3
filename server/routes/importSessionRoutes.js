const express = require('express');

const TERMINAL_STATUSES = new Set(['completed', 'completed_with_warnings', 'failed']);
const SESSION_STATUSES = new Set(['draft', 'preview_ready', 'importing', 'imported', 'completed', 'completed_with_warnings', 'failed']);
const INDEXING_STATES = new Set(['not_started', 'queued', 'partial', 'ready', 'failed']);

const toTrimmedString = (value = '') => String(value || '').trim();

const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const clampPercent = (value) => {
  const parsed = toSafeNumber(value, 0);
  return Math.min(Math.max(parsed, 0), 100);
};

const sanitizeStringList = (value) => (
  (Array.isArray(value) ? value : [])
    .map(item => toTrimmedString(item))
    .filter(Boolean)
    .slice(0, 50)
);

const sanitizeUniqueStringList = (value) => {
  const seen = new Set();
  return sanitizeStringList(value).filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sanitizeSession = (session) => {
  if (!session) return null;
  return {
    id: String(session._id || ''),
    provider: toTrimmedString(session.provider),
    mode: toTrimmedString(session.mode),
    status: toTrimmedString(session.status),
    sourceLabel: toTrimmedString(session.sourceLabel),
    connectionId: session.connectionId ? String(session.connectionId) : '',
    config: session.config || {},
    preview: session.preview || {},
    progress: session.progress || {},
    result: session.result || {},
    activation: {
      ...(session.activation || {}),
      conceptId: session?.activation?.conceptId ? String(session.activation.conceptId) : ''
    },
    lastError: toTrimmedString(session.lastError),
    createdAt: session.createdAt ? new Date(session.createdAt).toISOString() : null,
    updatedAt: session.updatedAt ? new Date(session.updatedAt).toISOString() : null
  };
};

const buildImportSessionRouter = ({
  authenticateToken,
  ImportSession
}) => {
  const router = express.Router();

  router.get('/api/import/sessions', authenticateToken, async (req, res) => {
    try {
      const status = toTrimmedString(req.query.status).toLowerCase();
      const provider = toTrimmedString(req.query.provider);
      const limit = Math.min(Math.max(Math.round(toSafeNumber(req.query.limit, 10)), 1), 30);
      const query = { userId: req.user.id };
      if (provider) query.provider = provider;
      if (status === 'active') {
        query.status = { $nin: Array.from(TERMINAL_STATUSES) };
      } else if (status && SESSION_STATUSES.has(status)) {
        query.status = status;
      }
      const rows = await ImportSession.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit).lean();
      res.status(200).json({ sessions: rows.map(sanitizeSession) });
    } catch (error) {
      console.error('Failed to list import sessions:', error);
      res.status(500).json({ error: 'Failed to list import sessions.' });
    }
  });

  router.get('/api/import/sessions/active', authenticateToken, async (req, res) => {
    try {
      const session = await ImportSession.findOne({
        userId: req.user.id,
        status: { $nin: Array.from(TERMINAL_STATUSES) }
      }).sort({ updatedAt: -1, createdAt: -1 }).lean();
      res.status(200).json({ session: sanitizeSession(session) });
    } catch (error) {
      console.error('Failed to fetch active import session:', error);
      res.status(500).json({ error: 'Failed to fetch active import session.' });
    }
  });

  router.post('/api/import/sessions', authenticateToken, async (req, res) => {
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const provider = toTrimmedString(payload.provider);
      if (!provider) {
        return res.status(400).json({ error: 'provider is required.' });
      }

      const session = await ImportSession.create({
        provider,
        mode: toTrimmedString(payload.mode) || 'manual',
        status: SESSION_STATUSES.has(payload.status) ? payload.status : 'draft',
        sourceLabel: toTrimmedString(payload.sourceLabel),
        connectionId: payload.connectionId || null,
        config: {
          sourceType: toTrimmedString(payload?.config?.sourceType),
          importStrategy: toTrimmedString(payload?.config?.importStrategy),
          selectedIds: sanitizeUniqueStringList(payload?.config?.selectedIds),
          filters: payload?.config?.filters && typeof payload.config.filters === 'object'
            ? payload.config.filters
            : {}
        },
        progress: {
          stage: toTrimmedString(payload?.progress?.stage) || 'draft',
          itemsProcessed: Math.max(0, toSafeNumber(payload?.progress?.itemsProcessed, 0)),
          itemsTotal: Math.max(0, toSafeNumber(payload?.progress?.itemsTotal, 0)),
          percent: clampPercent(payload?.progress?.percent),
          indexingState: INDEXING_STATES.has(payload?.progress?.indexingState)
            ? payload.progress.indexingState
            : 'not_started',
          lastCursor: toTrimmedString(payload?.progress?.lastCursor)
        },
        activation: {
          status: toTrimmedString(payload?.activation?.status) || 'not_started',
          conceptId: payload?.activation?.conceptId || null,
          conceptName: toTrimmedString(payload?.activation?.conceptName),
          dueAt: payload?.activation?.dueAt || null,
          primaryAction: toTrimmedString(payload?.activation?.primaryAction) || 'create_concept'
        },
        userId: req.user.id
      });

      res.status(201).json({ session: sanitizeSession(session.toObject()) });
    } catch (error) {
      console.error('Failed to create import session:', error);
      res.status(500).json({ error: 'Failed to create import session.' });
    }
  });

  router.get('/api/import/sessions/:id', authenticateToken, async (req, res) => {
    try {
      const session = await ImportSession.findOne({ _id: req.params.id, userId: req.user.id }).lean();
      if (!session) {
        return res.status(404).json({ error: 'Import session not found.' });
      }
      res.status(200).json({ session: sanitizeSession(session) });
    } catch (error) {
      console.error('Failed to fetch import session:', error);
      res.status(500).json({ error: 'Failed to fetch import session.' });
    }
  });

  router.patch('/api/import/sessions/:id', authenticateToken, async (req, res) => {
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const session = await ImportSession.findOne({ _id: req.params.id, userId: req.user.id });
      if (!session) {
        return res.status(404).json({ error: 'Import session not found.' });
      }

      if (payload.status && SESSION_STATUSES.has(payload.status)) {
        session.status = payload.status;
      }
      if (payload.sourceLabel !== undefined) {
        session.sourceLabel = toTrimmedString(payload.sourceLabel);
      }
      if (payload.lastError !== undefined) {
        session.lastError = toTrimmedString(payload.lastError);
      }
      if (payload.preview && typeof payload.preview === 'object') {
        session.preview = {
          ...(session.preview || {}),
          items: Math.max(0, toSafeNumber(payload.preview.items, session.preview?.items || 0)),
          articles: Math.max(0, toSafeNumber(payload.preview.articles, session.preview?.articles || 0)),
          highlights: Math.max(0, toSafeNumber(payload.preview.highlights, session.preview?.highlights || 0)),
          notes: Math.max(0, toSafeNumber(payload.preview.notes, session.preview?.notes || 0)),
          databases: Math.max(0, toSafeNumber(payload.preview.databases, session.preview?.databases || 0)),
          pages: Math.max(0, toSafeNumber(payload.preview.pages, session.preview?.pages || 0)),
          notebooks: Math.max(0, toSafeNumber(payload.preview.notebooks, session.preview?.notebooks || 0)),
          sampleTitles: sanitizeUniqueStringList(payload.preview.sampleTitles || session.preview?.sampleTitles),
          sampleAuthors: sanitizeUniqueStringList(payload.preview.sampleAuthors || session.preview?.sampleAuthors),
          sampleTags: sanitizeUniqueStringList(payload.preview.sampleTags || session.preview?.sampleTags),
          sampleDatabases: sanitizeUniqueStringList(payload.preview.sampleDatabases || session.preview?.sampleDatabases),
          sampleRows: Math.max(0, toSafeNumber(payload.preview.sampleRows, session.preview?.sampleRows || 0)),
          warningCodes: sanitizeUniqueStringList(payload.preview.warningCodes || session.preview?.warningCodes),
          lastPreviewedAt: payload.preview.lastPreviewedAt !== undefined
            ? payload.preview.lastPreviewedAt || null
            : session.preview?.lastPreviewedAt,
          warnings: sanitizeStringList(payload.preview.warnings || session.preview?.warnings)
        };
      }
      if (payload.progress && typeof payload.progress === 'object') {
        session.progress = {
          ...(session.progress || {}),
          stage: payload.progress.stage !== undefined ? toTrimmedString(payload.progress.stage) : session.progress?.stage,
          itemsProcessed: payload.progress.itemsProcessed !== undefined
            ? Math.max(0, toSafeNumber(payload.progress.itemsProcessed, session.progress?.itemsProcessed || 0))
            : session.progress?.itemsProcessed,
          itemsTotal: payload.progress.itemsTotal !== undefined
            ? Math.max(0, toSafeNumber(payload.progress.itemsTotal, session.progress?.itemsTotal || 0))
            : session.progress?.itemsTotal,
          percent: payload.progress.percent !== undefined
            ? clampPercent(payload.progress.percent)
            : session.progress?.percent,
          indexingState: INDEXING_STATES.has(payload.progress.indexingState)
            ? payload.progress.indexingState
            : session.progress?.indexingState,
          lastCursor: payload.progress.lastCursor !== undefined
            ? toTrimmedString(payload.progress.lastCursor)
            : session.progress?.lastCursor
        };
      }
      if (payload.result && typeof payload.result === 'object') {
        session.result = {
          ...(session.result || {}),
          importedArticles: payload.result.importedArticles !== undefined
            ? Math.max(0, toSafeNumber(payload.result.importedArticles, session.result?.importedArticles || 0))
            : session.result?.importedArticles,
          importedHighlights: payload.result.importedHighlights !== undefined
            ? Math.max(0, toSafeNumber(payload.result.importedHighlights, session.result?.importedHighlights || 0))
            : session.result?.importedHighlights,
          importedNotes: payload.result.importedNotes !== undefined
            ? Math.max(0, toSafeNumber(payload.result.importedNotes, session.result?.importedNotes || 0))
            : session.result?.importedNotes,
          skippedRows: payload.result.skippedRows !== undefined
            ? Math.max(0, toSafeNumber(payload.result.skippedRows, session.result?.skippedRows || 0))
            : session.result?.skippedRows,
          duplicateSkips: payload.result.duplicateSkips !== undefined
            ? Math.max(0, toSafeNumber(payload.result.duplicateSkips, session.result?.duplicateSkips || 0))
            : session.result?.duplicateSkips,
          invalidSkips: payload.result.invalidSkips !== undefined
            ? Math.max(0, toSafeNumber(payload.result.invalidSkips, session.result?.invalidSkips || 0))
            : session.result?.invalidSkips,
          parseErrors: payload.result.parseErrors !== undefined
            ? Math.max(0, toSafeNumber(payload.result.parseErrors, session.result?.parseErrors || 0))
            : session.result?.parseErrors,
          indexingAttempts: payload.result.indexingAttempts !== undefined
            ? Math.max(0, toSafeNumber(payload.result.indexingAttempts, session.result?.indexingAttempts || 0))
            : session.result?.indexingAttempts,
          indexingFailures: payload.result.indexingFailures !== undefined
            ? Math.max(0, toSafeNumber(payload.result.indexingFailures, session.result?.indexingFailures || 0))
            : session.result?.indexingFailures,
          indexingQueued: payload.result.indexingQueued !== undefined
            ? Math.max(0, toSafeNumber(payload.result.indexingQueued, session.result?.indexingQueued || 0))
            : session.result?.indexingQueued,
          warningCodes: sanitizeUniqueStringList(payload.result.warningCodes || session.result?.warningCodes),
          warnings: sanitizeStringList(payload.result.warnings || session.result?.warnings),
          lastImportedEntryId: payload.result.lastImportedEntryId !== undefined
            ? toTrimmedString(payload.result.lastImportedEntryId)
            : session.result?.lastImportedEntryId,
          lastImportedArticleId: payload.result.lastImportedArticleId !== undefined
            ? toTrimmedString(payload.result.lastImportedArticleId)
            : session.result?.lastImportedArticleId
        };
      }
      if (payload.activation && typeof payload.activation === 'object') {
        session.activation = {
          ...(session.activation || {}),
          status: payload.activation.status !== undefined
            ? toTrimmedString(payload.activation.status)
            : session.activation?.status,
          conceptId: payload.activation.conceptId !== undefined
            ? payload.activation.conceptId || null
            : session.activation?.conceptId,
          conceptName: payload.activation.conceptName !== undefined
            ? toTrimmedString(payload.activation.conceptName)
            : session.activation?.conceptName,
          dueAt: payload.activation.dueAt !== undefined
            ? payload.activation.dueAt || null
            : session.activation?.dueAt,
          primaryAction: payload.activation.primaryAction !== undefined
            ? toTrimmedString(payload.activation.primaryAction)
            : session.activation?.primaryAction
        };
      }

      await session.save();
      res.status(200).json({ session: sanitizeSession(session.toObject()) });
    } catch (error) {
      console.error('Failed to update import session:', error);
      res.status(500).json({ error: 'Failed to update import session.' });
    }
  });

  router.delete('/api/import/sessions/:id', authenticateToken, async (req, res) => {
    try {
      const session = await ImportSession.findOneAndDelete({ _id: req.params.id, userId: req.user.id }).lean();
      if (!session) {
        return res.status(404).json({ error: 'Import session not found.' });
      }
      res.status(200).json({ session: sanitizeSession(session) });
    } catch (error) {
      console.error('Failed to delete import session:', error);
      res.status(500).json({ error: 'Failed to delete import session.' });
    }
  });

  return router;
};

module.exports = {
  buildImportSessionRouter
};
