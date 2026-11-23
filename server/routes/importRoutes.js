const express = require('express');
const jwt = require('jsonwebtoken');
const { encryptSecret, decryptSecret } = require('../utils/integrationSecrets');
const { absorbPassage, isUnfinished, passageIn } = require('../utils/passages');
const { pencilOf } = require('../services/agentTokenService');
const {
  blockToPlainText,
  buildNotionPropertyLines,
  extractNotionTitle,
  flattenNotionRichText
} = require('../services/import/notionTransform');
const { buildWarning, summarizeWarnings } = require('../services/import/importDiagnostics');
const { fetchReadwiseExportRows } = require('../services/import/readwiseClient');
const { BOOK, BOOK_URL, bookSource } = require('../services/import/exportFiles');
const {
  fetchUrlForIngest,
  normalizeIngestText
} = require('../services/import/urlTextIngest');
const { deriveImportedTitle, isFragmentTitle } = require('../services/importTitleService');
const {
  ensureNotebookImportFolderPath
} = require('../services/notebookImportTreeService');
const {
  stageImportStructureProposal
} = require('../services/importStructureProposals');
const { fetchNotionBlockChildren } = require('../services/import/notionClient');
const { createConnectorWikiSourceEvent } = require('../services/wikiSourceEventService');
const { recordSourceCorrection } = require('../services/authoredSourceCorrection');
const { processWikiSourceEvent: defaultProcessWikiSourceEvent } = require('../services/wikiMaintenanceOrchestrator');
const { persistNoeisReceipt } = require('../services/noeisReceiptService');
const { wordBoundaryTrim } = require('../lib/editorialText');
const { marksOfReading } = require('../services/closedBooks');
const { bookOnShelf } = require('../services/bookShelf');

const toTrimmedString = (value = '') => String(value || '').trim();
const normalizeSourcePath = (value = '') => {
  if (Array.isArray(value)) {
    return value
      .map(segment => String(segment || '').trim())
      .filter(Boolean)
      .join(' / ');
  }
  return toTrimmedString(value);
};
const NOTEBOOK_IMPORT_FOLDER_OWNERSHIP = 'import_mirror';
const NOTEBOOK_USER_FOLDER_OWNERSHIP = 'user_owned';
const IMPORT_ORGANIZATION_SUGGESTION_TYPE = 'organize_import';
const READWISE_MCP_SERVER_URL = 'https://mcp2.readwise.io/mcp';
const READWISE_OAUTH_AUTHORIZE_URL = 'https://readwise.io/o/authorize/';
const READWISE_OAUTH_TOKEN_URL = 'https://readwise.io/o/token/';
const READWISE_OAUTH_REGISTER_URL = 'https://readwise.io/o/register/';
const READWISE_OAUTH_USERINFO_URL = 'https://readwise.io/o/userinfo';
const READWISE_OAUTH_SCOPES = ['openid', 'read', 'write'];
const READWISE_DYNAMIC_CLIENTS = new Map();
/* Pocket and Instapaper hand over links, not pages. The bodies are read after
   the import answers, and only this many per import, so a ten-year export
   cannot keep the server reading all afternoon. */
const IMPORT_BODY_FETCH_CAP = 50;
const bareLinks = (articles = []) => articles
  .filter(article => /^https?:\/\//i.test(article.url) && !String(article.content || '').trim())
  .map(article => article.url)
  .slice(0, IMPORT_BODY_FETCH_CAP);

const buildImportRouter = ({
  authenticateToken,
  // Bringing in a link, a file or a piece of text also takes a token that may do little else (`capture`).
  authenticateCapture = authenticateToken,
  isAccountActive = async () => false,
  upload,
  slugify,
  Article,
  Folder = null,
  trackEvent,
  EVENT_NAMES,
  crypto,
  TagMeta,
  NotebookEntry,
  WikiPage = null,
  WikiRevision = null,
  WikiSourceEvent = null,
  WikiMaintenanceRun = null,
  ConnectorActionLog = null,
  Question = null,
  AgentStructureProposal,
  ImportSession,
  IntegrationConnection,
  NoeisReceipt = null,
  syncNotebookReferences,
  enqueueArticleEmbedding,
  enqueueHighlightEmbedding,
  enqueueNotebookEmbedding,
  User = null,
  env = process.env,
  fetchImpl = global.fetch,
  /* Reads a bare link's body; the public-URL-guarded reader when absent. */
  fetchSourceBody,
  answerTo = (...args) => require('../ai/semanticSearch').answerTo(...args),
  readPage = (...args) => require('../ai/books').readPage(...args),
  askTheBook = (...args) => require('../ai/books').askTheBook(...args),
  argueWith = (...args) => require('../ai/books').argueWith(...args),
  heardBefore = (...args) => require('../ai/semanticSearch').heardBefore(...args),
  echoOf = (...args) => require('../ai/semanticSearch').echoOf(...args),
  beforeYouStart = (...args) => require('../ai/semanticSearch').beforeYouStart(...args)
}) => {
  const router = express.Router();

  const persistImportReceipt = async ({ userId, receipt } = {}) => {
    try {
      await persistNoeisReceipt({ NoeisReceipt, userId, receipt });
    } catch (error) {
      console.error('Failed persisting import receipt:', error);
    }
  };

  const emitWikiSourceEvent = async (payload = {}) => {
    try {
      const event = await createConnectorWikiSourceEvent({
        WikiSourceEvent,
        userId: payload.userId,
        provider: payload.provider,
        payload: {
          sourceType: payload.sourceType,
          eventType: payload.eventType || 'imported',
          title: payload.title,
          summary: payload.summary,
          text: payload.text,
          url: payload.url,
          sourceUpdatedAt: payload.sourceUpdatedAt,
          importSessionId: payload.importSessionId,
          externalId: payload.externalId,
          affectedPageIds: payload.affectedPageIds
        },
        sourceObjectId: payload.sourceObjectId,
        parentObjectId: payload.parentObjectId,
        importSessionId: payload.importSessionId,
        affectedPageIds: payload.affectedPageIds,
        metadata: payload.metadata
      });
      if (event && WikiPage) {
        defaultProcessWikiSourceEvent({
          sourceEvent: event,
          userId: payload.userId,
          models: { WikiSourceEvent, WikiPage, WikiRevision, WikiMaintenanceRun, Article, NotebookEntry, TagMeta, Question }
        }).catch(error => console.error('Failed processing wiki source event:', error));
      }
      return event;
    } catch (error) {
      console.error('Failed creating wiki source event:', error);
      return null;
    }
  };

  const ingestArticleSource = async ({
    userId,
    title,
    content,
    url,
    author = '',
    siteName = '',
    publicationDate = '',
    sourceUrl = '',
    provider = 'manual',
    sourceType = 'text',
    sourceLabel = 'Pasted source',
    externalId = '',
    pencil = null
  } = {}) => {
    const safeContent = normalizeIngestText(content);
    if (!safeContent) {
      const error = new Error('Source text is required.');
      error.statusCode = 400;
      throw error;
    }
    const safeUrl = toTrimmedString(url) || `import://${provider}/${crypto.randomUUID()}`;
    const safeTitle = deriveImportedTitle({
      metadataTitle: title,
      content: safeContent,
      author,
      siteName: sourceLabel,
      sourceType,
      url: safeUrl
    });
    const byline = {
      ...(author ? { author } : {}),
      ...(siteName ? { siteName } : {}),
      ...(publicationDate ? { publicationDate } : {})
    };
    const httpUrl = sourceUrl || (/^https?:\/\//i.test(safeUrl) ? safeUrl : '');
    let article = await Article.findOne({ userId, url: safeUrl });
    const isNew = !article;
    if (!article) {
      article = new Article({
        url: safeUrl,
        title: safeTitle,
        content: safeContent,
        userId,
        ...byline,
        pencil,
        importMeta: {
          provider,
          sourceType,
          sourceLabel,
          sourceUrl: httpUrl,
          externalId,
          importedAt: new Date()
        }
      });
    } else if (!pencil || article.pencil) {
      // An agent refreshes only what it brought in; your copy stays yours.
      article.title = safeTitle || article.title;
      article.content = safeContent || article.content;
      Object.assign(article, byline);
      article.importMeta = {
        ...(article.importMeta || {}),
        provider,
        sourceType,
        sourceLabel,
        sourceUrl: httpUrl || article.importMeta?.sourceUrl || '',
        externalId: externalId || article.importMeta?.externalId || '',
        importedAt: article.importMeta?.importedAt || new Date(),
        lastSyncedAt: new Date()
      };
    }
    await article.save();
    if (enqueueArticleEmbedding) {
      try {
        const queued = enqueueArticleEmbedding(article);
        if (queued?.catch) {
          queued.catch(error => console.error('Failed queueing article embedding:', error));
        }
      } catch (error) {
        console.error('Failed queueing article embedding:', error);
      }
    }
    const sourceEvent = await emitWikiSourceEvent({
      userId,
      provider,
      sourceType,
      eventType: isNew ? 'imported' : 'updated',
      title: article.title,
      summary: safeContent.slice(0, 360),
      text: safeContent,
      url: article.url,
      sourceObjectId: article._id,
      externalId,
      metadata: {
        sourceLabel,
        importMode: sourceType,
        isNew
      }
    });
    return { article, sourceEvent, isNew };
  };

  router.post('/api/import/text', authenticateCapture, async (req, res) => {
    try {
      const userId = req.user.id;
      const text = normalizeIngestText(req.body?.text);
      if (!text) return res.status(400).json({ error: 'Text is required.' });
      const result = await ingestArticleSource({
        userId,
        title: req.body?.title,
        content: text,
        url: req.body?.url,
        author: req.body?.author,
        provider: 'manual',
        sourceType: 'text',
        sourceLabel: 'Pasted text',
        pencil: pencilOf(req)
      });
      res.status(result.isNew ? 201 : 200).json({
        article: {
          _id: result.article._id,
          title: result.article.title,
          url: result.article.url,
          contentLength: String(result.article.content || '').length
        },
        sourceEventId: result.sourceEvent?._id || null,
        status: result.sourceEvent?.status === 'held' ? 'held' : (result.sourceEvent ? 'queued' : 'imported')
      });
    } catch (error) {
      console.error('Error importing pasted text:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to import text.' });
    }
  });

  /* Saving a link, from the paste field or from mail. Where it goes is the
     reader's to say: the nightstand to read later, or straight into the
     Library when it is already read. Only those two trade places; a piece on
     the desk stays on the desk, nearer to hand. A folder files it, new or
     already held, and a reason says why it waits. */
  const saveLink = async ({ userId, url: raw, placement: destination = '', folder = null, reason = '', title = '', author = '', pencil = null }) => {
    const land = async (article, existing, extra = {}) => {
      const current = article.placement || 'stream';
      const placement = destination && current !== 'setAside' ? destination : current;
      const why = placement === 'later' && reason ? reason : '';
      const change = {
        ...(placement !== current ? { placement, placementAt: new Date() } : {}),
        ...(why ? { placementReason: why } : {}),
        ...(folder ? { folder: folder._id } : {})
      };
      if (Object.keys(change).length) await Article.updateOne({ _id: article._id, userId }, change);
      return {
        article: {
          _id: article._id,
          title: article.title,
          url: article.url,
          createdAt: article.createdAt,
          placement,
          placementReason: why || article.placementReason || '',
          folder: folder || null,
          contentLength: String(article.content || '').length
        },
        existing,
        ...extra
      };
    };
    /* A link you already saved opens the copy you have. Fetching it again
       would overwrite the page the extension captured with a plainer read,
       and lose nothing but time to tell you it is already here. Checked
       before the fetch and again after redirects. */
    const saved = url => (url ? Article.findOne({ userId, url }, '_id title url content createdAt placement placementReason') : null);
    /* Stored URLs carry no fragment (the fetch drops it), so a link to a
       section of a saved piece still finds the piece without the origin. */
    const pasted = (() => {
      try {
        const url = new URL(raw);
        url.hash = '';
        return url.toString();
      } catch (_) {
        return raw;
      }
    })();
    const before = await saved(pasted);
    if (before) return land(before, true);
    const fetched = await fetchUrlForIngest({ url: pasted, fetchImpl });
    const after = fetched.url !== pasted && await saved(fetched.url);
    if (after) return land(after, true);
    if (!fetched.text) {
      const error = new Error('Could not extract readable text from that URL.');
      error.statusCode = 422;
      throw error;
    }
    const result = await ingestArticleSource({
      userId,
      title: title || fetched.title,
      content: fetched.text,
      url: fetched.url,
      author,
      provider: 'url',
      sourceType: 'url',
      sourceLabel: 'Pasted URL',
      externalId: fetched.url,
      pencil
    });
    return land(result.article, !result.isNew, {
      sourceEventId: result.sourceEvent?._id || null,
      status: result.sourceEvent ? 'queued' : 'imported'
    });
  };

  router.post('/api/import/url', authenticateCapture, async (req, res) => {
    try {
      const userId = req.user.id;
      const folderId = toTrimmedString(req.body?.folderId);
      const folder = folderId && Folder
        ? await Folder.findOne({ _id: folderId, userId }, '_id name').lean().catch(() => null)
        : null;
      if (folderId && !folder) return res.status(400).json({ error: 'That folder is not one of yours.' });
      const saved = await saveLink({
        userId,
        url: toTrimmedString(req.body?.url),
        placement: ['later', 'stream'].includes(req.body?.placement) ? req.body.placement : '',
        folder,
        title: req.body?.title,
        author: req.body?.author,
        pencil: pencilOf(req)
      });
      return res.status(saved.existing ? 200 : 201).json(saved);
    } catch (error) {
      console.error('Error importing URL:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to import URL.' });
    }
  });

  /* A book you are starting, by its title and author. It is addressed the
     way an import addresses a book, so the Kindle's marks for it land in it
     later; one an import already brought, by that title, is opened instead. */
  router.post('/api/import/book', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const title = toTrimmedString(req.body?.title);
      if (!title) return res.status(400).json({ error: 'A book needs its title.' });
      const book = bookSource({ provider: BOOK, title, author: toTrimmedString(req.body?.author) });
      const known = bookOnShelf(await Article.find({ userId, url: BOOK_URL }).select('url title author'), book);
      if (known) return res.status(200).json({ article: known, existing: true });
      const article = await Article.create({
        userId,
        url: book.url,
        title: book.title,
        author: book.author,
        importMeta: { provider: BOOK, sourceType: BOOK, importedAt: new Date() }
      });
      return res.status(201).json({ article, existing: false });
    } catch (error) {
      console.error('Error starting a book:', error);
      res.status(500).json({ error: 'That book could not be started.' });
    }
  });

  require('./import/bookRoutes')(router, {
    Article,
    answerTo,
    argueWith,
    askTheBook,
    authenticateToken,
    beforeYouStart,
    crypto,
    echoOf,
    enqueueHighlightEmbedding,
    heardBefore,
    readPage,
    toTrimmedString
  });

  require('./import/emailRoutes')(router, {
    Article,
    User,
    env,
    fetchImpl,
    ingestArticleSource,
    saveLink
  });

  const logConnectorAction = async (payload = {}) => {
    if (!ConnectorActionLog || !payload.userId || !payload.connector || !payload.action) return null;
    try {
      const log = new ConnectorActionLog({
        userId: payload.userId,
        connector: payload.connector,
        action: payload.action,
        direction: payload.direction || 'read',
        status: payload.status || 'completed',
        targetType: payload.targetType || '',
        targetId: payload.targetId || '',
        summary: payload.summary || '',
        errorMessage: payload.errorMessage || '',
        metadata: payload.metadata || {}
      });
      await log.save();
      return log;
    } catch (error) {
      console.error('Failed writing connector action log:', error);
      return null;
    }
  };

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

  const queueIndexingAttempt = async (summary, action, warningLabel) => {
    summary.indexingAttempts += 1;
    try {
      await action();
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

  const markImportSessionUnavailable = async ({ sessionId, userId, stage, message }) => {
    const failedSession = await patchImportSession({
      sessionId,
      userId,
      mutate: (session) => {
        session.status = 'failed';
        session.progress = {
          ...(session.progress || {}),
          stage,
          percent: 100,
          indexingState: session.progress?.indexingState || 'not_started'
        };
        session.lastError = message;
        session.receipt = buildNoeisImportReceipt({
          id: `import-${sessionId || 'unavailable'}-${Date.now()}`,
          source: session.provider || 'system',
          sourceLabel: session.sourceLabel || session.provider || 'Import',
          status: 'failed',
          error: {
            stage,
            message,
            retryable: true
          }
        });
      }
    });
    await persistImportReceipt({ userId, receipt: failedSession?.receipt });
    return failedSession;
  };

  const clearImportOrganizationOffer = (session) => {
    if (!session || typeof session !== 'object') return;
    if (toTrimmedString(session.recommendedNextAction) === IMPORT_ORGANIZATION_SUGGESTION_TYPE) {
      session.recommendedNextAction = '';
    }
    if (Array.isArray(session.agentSuggestions)) {
      session.agentSuggestions = session.agentSuggestions.filter(
        (suggestion) => toTrimmedString(suggestion?.type) !== IMPORT_ORGANIZATION_SUGGESTION_TYPE
      );
    } else {
      session.agentSuggestions = [];
    }
  };

  const applyImportOrganizationOffer = (session) => {
    if (!session || typeof session !== 'object') return;
    const sourceLabel = toTrimmedString(session.sourceLabel) || 'this import';
    const preview = session.preview && typeof session.preview === 'object' ? session.preview : {};
    const result = session.result && typeof session.result === 'object' ? session.result : {};
    const importedCount = [
      result.importedArticles,
      result.importedHighlights,
      result.importedNotes,
      preview.items
    ].reduce((max, value) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return max;
      return Math.max(max, parsed);
    }, 0);

    const suggestion = {
      type: IMPORT_ORGANIZATION_SUGGESTION_TYPE,
      intent: 'organize_import',
      operationType: 'organize_workspace',
      status: 'pending',
      label: 'Organize this import',
      summary: importedCount > 0
        ? `Review and organize ${importedCount} imported ${importedCount === 1 ? 'item' : 'items'} from ${sourceLabel}.`
        : `Review and organize imported material from ${sourceLabel}.`,
      scopeType: 'import_session',
      scopeId: String(session._id || ''),
      structureProposalId: '',
      suggestedAt: new Date()
    };

    const existingSuggestions = Array.isArray(session.agentSuggestions)
      ? session.agentSuggestions.filter(
        (entry) => toTrimmedString(entry?.type) !== IMPORT_ORGANIZATION_SUGGESTION_TYPE
      )
      : [];

    session.recommendedNextAction = IMPORT_ORGANIZATION_SUGGESTION_TYPE;
    session.agentSuggestions = [...existingSuggestions, suggestion];
  };

  const attachImportStructureProposalToSession = async ({
    sessionId,
    userId,
    structureProposalId
  } = {}) => {
    const safeProposalId = toTrimmedString(structureProposalId);
    if (!safeProposalId) return null;
    return patchImportSession({
      sessionId,
      userId,
      mutate: (session) => {
        const suggestions = Array.isArray(session.agentSuggestions) ? session.agentSuggestions : [];
        session.agentSuggestions = suggestions.map((suggestion) => (
          toTrimmedString(suggestion?.type) === IMPORT_ORGANIZATION_SUGGESTION_TYPE
            ? {
                ...suggestion,
                structureProposalId: safeProposalId
              }
            : suggestion
        ));
      }
    });
  };

  const stageImportOrganizationProposalForSession = async ({
    session,
    userId,
    articleIds = [],
    notebookEntryIds = []
  } = {}) => {
    if (!session || !AgentStructureProposal) return null;
    try {
      const proposal = await stageImportStructureProposal({
        AgentStructureProposal,
        userId,
        importSession: session,
        articleIds,
        notebookEntryIds
      });
      await attachImportStructureProposalToSession({
        sessionId: session?._id,
        userId,
        structureProposalId: proposal?._id
      });
      return proposal;
    } catch (error) {
      console.error('Failed staging import structure proposal:', error);
      return null;
    }
  };

  const sanitizeLastSyncResult = (value) => {
    if (!value || typeof value !== 'object') return null;
    return {
      ...(value.importedArticles != null ? { importedArticles: Number(value.importedArticles) } : {}),
      ...(value.importedHighlights != null ? { importedHighlights: Number(value.importedHighlights) } : {}),
      importedNotes: Number(value.importedNotes || 0),
      skippedRows: Number(value.skippedRows || 0),
      indexingQueued: Number(value.indexingQueued || 0),
      indexingFailures: Number(value.indexingFailures || 0),
      completedAt: value.completedAt ? new Date(value.completedAt).toISOString() : null
    };
  };

  const sanitizeReceiptTouched = (value) => (
    (Array.isArray(value) ? value : [])
      .map((entry) => {
        const type = toTrimmedString(entry?.type);
        const id = toTrimmedString(entry?.id);
        const title = toTrimmedString(entry?.title);
        if (!type || !id) return null;
        return { type, id, title };
      })
      .filter(Boolean)
      .slice(0, 24)
  );

  const sanitizeNoeisReceipt = (value) => {
    if (!value || typeof value !== 'object') return null;
    const status = toTrimmedString(value.status) || 'completed';
    const createdAt = value.createdAt ? new Date(value.createdAt) : null;
    const completedAt = value.completedAt ? new Date(value.completedAt) : null;
    return {
      id: toTrimmedString(value.id),
      kind: toTrimmedString(value.kind) || 'import',
      source: toTrimmedString(value.source) || 'system',
      sourceLabel: toTrimmedString(value.sourceLabel || value.sourceLabelOverride || value.source),
      status,
      title: toTrimmedString(value.title),
      summary: toTrimmedString(value.summary),
      metrics: value.metrics && typeof value.metrics === 'object' ? value.metrics : {},
      touched: sanitizeReceiptTouched(value.touched),
      nextAction: value.nextAction && typeof value.nextAction === 'object'
        ? {
            label: toTrimmedString(value.nextAction.label),
            href: toTrimmedString(value.nextAction.href),
            intent: toTrimmedString(value.nextAction.intent)
          }
        : null,
      error: value.error && typeof value.error === 'object'
        ? {
            stage: toTrimmedString(value.error.stage),
            message: toTrimmedString(value.error.message),
            retryable: Boolean(value.error.retryable)
          }
        : null,
      createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : null,
      completedAt: completedAt && !Number.isNaN(completedAt.getTime()) ? completedAt.toISOString() : null
    };
  };

  const pluralize = (count, singular, plural = `${singular}s`) => (
    `${count} ${count === 1 ? singular : plural}`
  );

  const buildImportReceiptSummary = ({
    importedArticles = 0,
    importedHighlights = 0,
    importedNotes = 0,
    skippedRows = 0,
    indexingQueued = 0,
    indexingFailures = 0
  } = {}) => {
    const importedParts = [];
    if (importedArticles > 0) importedParts.push(pluralize(importedArticles, 'source'));
    if (importedHighlights > 0) importedParts.push(pluralize(importedHighlights, 'highlight'));
    if (importedNotes > 0) importedParts.push(pluralize(importedNotes, 'note'));
    const lead = importedParts.length > 0
      ? `Imported ${importedParts.join(', ')}.`
      : 'No new items were imported.';
    const details = [];
    if (skippedRows > 0) details.push(`${pluralize(skippedRows, 'row')} skipped`);
    if (indexingQueued > 0) details.push(`${pluralize(indexingQueued, 'item')} queued for indexing`);
    if (indexingFailures > 0) details.push(`${pluralize(indexingFailures, 'indexing issue')}`);
    return details.length > 0 ? `${lead} ${details.join('; ')}.` : lead;
  };

  const buildNoeisImportReceipt = ({
    id,
    source,
    sourceLabel,
    status = 'completed',
    result = {},
    touched = [],
    nextAction = null,
    error = null,
    summary = '',
    createdAt = new Date(),
    completedAt = new Date()
  } = {}) => {
    const metrics = {
      importedArticles: Number(result.importedArticles || 0),
      importedHighlights: Number(result.importedHighlights || 0),
      importedNotes: Number(result.importedNotes || 0),
      skippedRows: Number(result.skippedRows || 0),
      duplicateSkips: Number(result.duplicateSkips || 0),
      invalidSkips: Number(result.invalidSkips || 0),
      parseErrors: Number(result.parseErrors || 0),
      indexingQueued: Number(result.indexingQueued || 0),
      indexingFailures: Number(result.indexingFailures || 0)
    };
    const safeSource = toTrimmedString(source) || 'system';
    const safeLabel = toTrimmedString(sourceLabel) || safeSource;
    return sanitizeNoeisReceipt({
      id: id || `receipt-${safeSource}-${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
      kind: 'import',
      source: safeSource,
      sourceLabel: safeLabel,
      status,
      title: `${safeLabel} import ${status === 'failed' ? 'failed' : 'finished'}`,
      summary: error?.message || summary || buildImportReceiptSummary(metrics),
      metrics,
      touched,
      nextAction,
      error,
      createdAt,
      completedAt
    });
  };

  const buildConnectionLastSyncResult = ({
    importedArticles,
    importedHighlights,
    importedNotes = 0,
    skippedRows = 0,
    indexingQueued = 0,
    indexingFailures = 0,
    completedAt = new Date()
  } = {}) => ({
    importedArticles,
    importedHighlights,
    importedNotes: Number(importedNotes) || 0,
    skippedRows: Number(skippedRows) || 0,
    indexingQueued: Number(indexingQueued) || 0,
    indexingFailures: Number(indexingFailures) || 0,
    completedAt: completedAt instanceof Date ? completedAt : new Date(completedAt || Date.now())
  });

  const persistConnectionLastSyncResult = (connection, summary = {}) => {
    if (!connection) return null;
    const completedAt = summary.completedAt instanceof Date
      ? summary.completedAt
      : new Date(summary.completedAt || Date.now());
    connection.lastSyncAt = completedAt;
    connection.lastSyncResult = buildConnectionLastSyncResult({ ...summary, completedAt });
    return connection.lastSyncResult;
  };

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
      lastSyncResult: sanitizeLastSyncResult(connection.lastSyncResult),
      lastReceipt: sanitizeNoeisReceipt(connection.lastReceipt),
      lastError: toTrimmedString(connection.lastError),
      createdAt: connection.createdAt ? new Date(connection.createdAt).toISOString() : null,
      updatedAt: connection.updatedAt ? new Date(connection.updatedAt).toISOString() : null
    };
  };

  const getRequestOrigin = (req) => {
    const host = toTrimmedString(req.get('host'));
    if (!host) return '';
    const forwardedProto = toTrimmedString(req.get('x-forwarded-proto')).split(',')[0].trim();
    const proto = forwardedProto || toTrimmedString(req.protocol) || 'https';
    const isLocalHost = /^localhost(?::\d+)?$/.test(host) || /^127\.0\.0\.1(?::\d+)?$/.test(host);
    const safeProto = proto === 'http' && !isLocalHost ? 'https' : proto;
    return `${safeProto}://${host}`;
  };

  const getNotionRedirectUri = (req) => (
    toTrimmedString(process.env.NOTION_REDIRECT_URI)
    || `${getRequestOrigin(req)}/api/import/notion/oauth/callback`
  );

  const getImportAppUrl = (req) => (
    toTrimmedString(process.env.WEB_APP_URL)
    || toTrimmedString(process.env.APP_URL)
    || getRequestOrigin(req)
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

  /**
   * What Noeis can read Readwise with, for a given connection.
   *
   * Two credentials can arrive. Browser approval (the recommended path) stores an
   * OAuth access token; the Advanced path stores a personal API token. Import used
   * to accept only the second, so the path the product recommends was the one path
   * that could not put anything in a library.
   *
   * The personal token comes first when both exist: it is the one Readwise
   * documents for export, and it does not expire out from under a long import.
   */
  const resolveReadwiseCredential = (connection) => {
    if (connection?.status === 'revoked') {
      return null;
    }
    if (connection?.encryptedApiToken) {
      return { token: decryptSecret(connection.encryptedApiToken), tokenType: 'api' };
    }
    if (connection?.encryptedAccessToken) {
      return { token: decryptSecret(connection.encryptedAccessToken), tokenType: 'oauth' };
    }
    return null;
  };

  const getReadwiseRedirectUri = (req) => (
    toTrimmedString(process.env.READWISE_REDIRECT_URI)
    || `${getRequestOrigin(req)}/api/import/readwise/oauth/callback`
  );

  const createReadwisePkcePair = () => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    return { verifier, challenge };
  };

  const createReadwiseState = ({
    userId,
    codeVerifier,
    clientId,
    clientSecret = ''
  }) => jwt.sign(
    {
      provider: 'readwise',
      userId: String(userId || '').trim(),
      nonce: crypto.randomUUID(),
      oauthPayload: encryptSecret(JSON.stringify({
        codeVerifier,
        clientId,
        clientSecret
      }))
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  const verifyReadwiseState = (value = '') => {
    const decoded = jwt.verify(String(value || ''), process.env.JWT_SECRET);
    if (
      decoded?.provider !== 'readwise'
      || !decoded?.userId
      || !decoded?.oauthPayload
    ) {
      throw new Error('Invalid Readwise OAuth state.');
    }
    let oauthPayload = {};
    try {
      oauthPayload = JSON.parse(decryptSecret(decoded.oauthPayload));
    } catch (error) {
      throw new Error('Invalid Readwise OAuth payload.');
    }
    if (!oauthPayload?.codeVerifier || !oauthPayload?.clientId) {
      throw new Error('Incomplete Readwise OAuth payload.');
    }
    return {
      ...decoded,
      codeVerifier: oauthPayload.codeVerifier,
      clientId: oauthPayload.clientId,
      clientSecret: oauthPayload.clientSecret || ''
    };
  };

  const registerReadwiseOAuthClient = async ({ redirectUri }) => {
    const configuredClientId = toTrimmedString(process.env.READWISE_CLIENT_ID);
    if (configuredClientId) {
      return {
        client_id: configuredClientId,
        client_secret: toTrimmedString(process.env.READWISE_CLIENT_SECRET),
        token_endpoint_auth_method: toTrimmedString(process.env.READWISE_TOKEN_AUTH_METHOD) || 'none'
      };
    }
    const cacheKey = toTrimmedString(redirectUri);
    if (cacheKey && READWISE_DYNAMIC_CLIENTS.has(cacheKey)) {
      return READWISE_DYNAMIC_CLIENTS.get(cacheKey);
    }

    const response = await fetch(READWISE_OAUTH_REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Noeis',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: READWISE_OAUTH_SCOPES.join(' '),
        token_endpoint_auth_method: 'none'
      })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Readwise dynamic client registration failed (${response.status}): ${text}`);
    }
    const payload = await response.json();
    if (!toTrimmedString(payload?.client_id)) {
      throw new Error('Readwise dynamic client registration did not return a client_id.');
    }
    if (cacheKey) {
      READWISE_DYNAMIC_CLIENTS.set(cacheKey, payload);
    }
    return payload;
  };

  const exchangeReadwiseCode = async ({
    code,
    redirectUri,
    clientId,
    clientSecret = '',
    codeVerifier
  }) => {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier
    });
    if (clientSecret) {
      params.set('client_secret', clientSecret);
    }
    const response = await fetch(READWISE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !toTrimmedString(payload?.access_token)) {
      throw new Error(`Readwise OAuth token exchange failed (${response.status}).`);
    }
    return payload;
  };

  const fetchReadwiseUserInfo = async (accessToken = '') => {
    if (!accessToken) return null;
    try {
      const response = await fetch(READWISE_OAUTH_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) return null;
      return response.json();
    } catch (error) {
      return null;
    }
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

  const truncateNotionText = (value = '', limit = 1900) => wordBoundaryTrim(value, { maxLength: limit });

  const textToRichText = (value = '') => {
    const safe = truncateNotionText(value);
    if (!safe) return [];
    return [{
      type: 'text',
      text: {
        content: safe
      }
    }];
  };

  const buildParagraphBlock = (value = '') => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: textToRichText(value)
    }
  });

  const buildHeadingBlock = (value = '', level = 2) => {
    const type = level === 1 ? 'heading_1' : (level === 3 ? 'heading_3' : 'heading_2');
    return {
      object: 'block',
      type,
      [type]: {
        rich_text: textToRichText(value)
      }
    };
  };

  const buildBulletBlock = (value = '') => ({
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: textToRichText(value)
    }
  });

  const stripHtmlTags = (value = '') => (
    String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const snapshotImportMeta = (value = {}) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return typeof value.toObject === 'function'
      ? value.toObject()
      : { ...value };
  };

  const upsertImportedNotebookEntry = async ({
    userId,
    provider,
    externalId,
    title,
    content,
    blocks,
    tags = [],
    folderPlacement,
    importMeta,
    createdAt,
    updatedAt,
    skipUnchanged = false
  }) => {
    const existing = await NotebookEntry.findOne({
      userId,
      'importMeta.provider': provider,
      'importMeta.externalId': externalId
    });
    const existingImportMeta = snapshotImportMeta(existing?.importMeta);
    const preserveUserOwnedFolder = toTrimmedString(existingImportMeta.folderOwnership) === NOTEBOOK_USER_FOLDER_OWNERSHIP;
    const nextImportMeta = {
      ...existingImportMeta,
      ...(importMeta || {}),
      sourcePath: normalizeSourcePath(folderPlacement?.sourcePath || importMeta?.sourcePath || existingImportMeta.sourcePath),
      folderOwnership: preserveUserOwnedFolder
        ? NOTEBOOK_USER_FOLDER_OWNERSHIP
        : (toTrimmedString(importMeta?.folderOwnership) || NOTEBOOK_IMPORT_FOLDER_OWNERSHIP),
      importedAt: importMeta?.importedAt || existingImportMeta.importedAt || new Date(),
      searchableAt: importMeta?.searchableAt || existingImportMeta.searchableAt || null
    };
    const nextFolder = preserveUserOwnedFolder
      ? (existing?.folder || null)
      : (folderPlacement?.folder?._id || null);

    if (
      skipUnchanged
      && existing
      && existing.title === title
      && existing.content === content
      && String(existing.folder || '') === String(nextFolder || '')
    ) {
      return { entry: existing, created: false, updated: false };
    }

    if (existing) {
      existing.title = title;
      existing.content = content;
      existing.blocks = blocks;
      existing.folder = nextFolder;
      existing.tags = Array.isArray(tags) ? tags : [];
      existing.importMeta = nextImportMeta;
      if (createdAt) existing.createdAt = createdAt;
      if (updatedAt) existing.updatedAt = updatedAt;
      await existing.save();
      await syncNotebookReferences(userId, existing._id, blocks);
      await emitWikiSourceEvent({
        userId,
        sourceType: 'notebook',
        sourceObjectId: existing._id,
        provider,
        eventType: 'updated',
        title,
        summary: content,
        sourceUpdatedAt: updatedAt || new Date(),
        metadata: { importMeta: nextImportMeta }
      });
      return { entry: existing, created: false, updated: true };
    }

    const entry = new NotebookEntry({
      title,
      content,
      blocks,
      folder: nextFolder,
      tags: Array.isArray(tags) ? tags : [],
      userId,
      importMeta: nextImportMeta
    });
    if (createdAt) entry.createdAt = createdAt;
    if (updatedAt) entry.updatedAt = updatedAt;
    await entry.save();
    await syncNotebookReferences(userId, entry._id, blocks);
    await emitWikiSourceEvent({
      userId,
      sourceType: 'notebook',
      sourceObjectId: entry._id,
      provider,
      eventType: 'imported',
      title,
      summary: content,
      sourceUpdatedAt: updatedAt || createdAt || new Date(),
      metadata: { importMeta: nextImportMeta }
    });
    return { entry, created: true, updated: false };
  };

  const stripFileExtension = (value = '') => {
    const safeValue = toTrimmedString(value);
    if (!safeValue) return '';
    return safeValue.replace(/\.[^.]+$/, '').trim();
  };

  const extractNotionParentRef = (item = {}) => {
    const parent = item?.parent;
    if (!parent || typeof parent !== 'object') {
      return { id: '', type: '' };
    }
    const type = toTrimmedString(parent.type);
    const parentId = /_id$/.test(type) ? toTrimmedString(parent[type]) : '';
    return {
      id: parentId,
      type
    };
  };

  const buildNotionImportIndex = ({ pages = [], dataSources = [] } = {}) => {
    const index = new Map();
    [...pages, ...dataSources].forEach((item) => {
      const id = toTrimmedString(item?.id);
      if (!id) return;
      const { id: parentId, type: parentType } = extractNotionParentRef(item);
      const title = item?.object === 'data_source'
        ? (toTrimmedString(flattenNotionRichText(item?.title)) || extractNotionTitle(item))
        : extractNotionTitle(item);
      index.set(id, {
        title,
        parentId,
        parentType
      });
    });
    return index;
  };

  const resolveNotionFolderPath = ({ item, importIndex }) => {
    const segments = [];
    const seen = new Set();
    let current = extractNotionParentRef(item);

    while (current.id && importIndex.has(current.id) && !seen.has(current.id)) {
      seen.add(current.id);
      const node = importIndex.get(current.id) || {};
      const title = toTrimmedString(node.title);
      if (title) {
        segments.unshift(title);
      }
      current = {
        id: toTrimmedString(node.parentId),
        type: toTrimmedString(node.parentType)
      };
    }

    return segments;
  };

  const buildNotebookExportBlocks = (entry) => {
    const blocks = Array.isArray(entry?.blocks) ? entry.blocks : [];
    const notionBlocks = blocks.map((block) => {
      const text = truncateNotionText(block?.text || '');
      if (!text) return null;
      if (String(block?.type || '').trim().toLowerCase() === 'bullet') {
        return buildBulletBlock(text);
      }
      return buildParagraphBlock(text);
    }).filter(Boolean);
    if (notionBlocks.length > 0) return notionBlocks.slice(0, 100);

    const fallback = stripHtmlTags(entry?.content || '');
    return fallback ? [buildParagraphBlock(fallback)] : [];
  };

  const buildConceptExportBlocks = async ({ userId, conceptName }) => {
    const safeName = toTrimmedString(conceptName);
    if (!safeName) return { concept: null, children: [] };

    const concept = await TagMeta.findOne({
      userId,
      name: new RegExp(`^${safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    }).lean();
    if (!concept) return { concept: null, children: [] };

    const children = [];
    const description = toTrimmedString(concept.description);
    if (description) {
      children.push(buildParagraphBlock(description));
    } else {
      children.push(buildParagraphBlock('Created in Noeis as a maintained concept. Add a sharper summary here once the concept hardens.'));
    }

    const pinnedArticleIds = Array.isArray(concept.pinnedArticleIds) ? concept.pinnedArticleIds : [];
    const pinnedNoteIds = Array.isArray(concept.pinnedNoteIds) ? concept.pinnedNoteIds : [];
    const pinnedHighlightIds = Array.isArray(concept.pinnedHighlightIds) ? concept.pinnedHighlightIds : [];

    if (pinnedArticleIds.length > 0) {
      const articles = await Article.find({ userId, _id: { $in: pinnedArticleIds } })
        .select('title url')
        .limit(5)
        .lean();
      if (articles.length > 0) {
        children.push(buildHeadingBlock('Pinned articles'));
        articles.forEach((article) => {
          const line = article?.url
            ? `${article.title || 'Untitled article'} — ${article.url}`
            : (article?.title || 'Untitled article');
          children.push(buildBulletBlock(line));
        });
      }
    }

    if (pinnedNoteIds.length > 0) {
      const notes = await NotebookEntry.find({ userId, _id: { $in: pinnedNoteIds } })
        .select('title content')
        .limit(5)
        .lean();
      if (notes.length > 0) {
        children.push(buildHeadingBlock('Pinned notes'));
        notes.forEach((note) => {
          children.push(buildBulletBlock(`${note?.title || 'Untitled note'} — ${truncateNotionText(stripHtmlTags(note?.content || ''), 280)}`));
        });
      }
    }

    if (pinnedHighlightIds.length > 0) {
      const sourceArticles = await Article.find({
        userId,
        'highlights._id': { $in: pinnedHighlightIds }
      }).select('title highlights').lean();
      const highlightIdSet = new Set(pinnedHighlightIds.map((id) => String(id)));
      const highlights = [];
      sourceArticles.forEach((article) => {
        (Array.isArray(article?.highlights) ? article.highlights : []).forEach((highlight) => {
          if (highlights.length >= 5) return;
          if (!highlightIdSet.has(String(highlight?._id || ''))) return;
          highlights.push({
            text: highlight?.text || '',
            articleTitle: article?.title || 'Source'
          });
        });
      });
      if (highlights.length > 0) {
        children.push(buildHeadingBlock('Pinned highlights'));
        highlights.forEach((highlight) => {
          children.push(buildBulletBlock(`${highlight?.articleTitle || 'Source'} — ${truncateNotionText(highlight?.text || '', 280)}`));
        });
      }
    }

    return {
      concept,
      children: children.filter((block) => Array.isArray(block?.[block.type]?.rich_text) && block[block.type].rich_text.length > 0).slice(0, 100)
    };
  };

  const buildNotebookEntryFromNotionPage = async ({
    token,
    page,
    userId,
    importSessionId,
    sourceLabel,
    parentExternalId = '',
    folderPathSegments = []
  }) => {
    const externalId = toTrimmedString(page?.id);
    if (!externalId) return { entry: null, created: false };

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
    const folderPlacement = await ensureNotebookImportFolderPath({
      userId,
      provider: 'notion',
      sourceType: 'oauth',
      sourceLabel,
      folderOwnership: NOTEBOOK_IMPORT_FOLDER_OWNERSHIP,
      sourcePath: folderPathSegments
    });
    return upsertImportedNotebookEntry({
      userId,
      provider: 'notion',
      externalId,
      title,
      content,
      blocks,
      tags: ['notion-import'],
      folderPlacement,
      importMeta: {
        provider: 'notion',
        sourceType: 'oauth',
        sourceLabel,
        sourcePath: folderPlacement.sourcePath,
        sourceUrl: toTrimmedString(page?.url),
        folderOwnership: NOTEBOOK_IMPORT_FOLDER_OWNERSHIP,
        externalId,
        parentExternalId,
        importSessionId: importSessionId || null,
        importedAt: new Date()
      }
    });
  };

  /* One door for every export file: Kindle, Apple Books, Pocket, Instapaper,
     Readwise CSV, folders of Markdown from Notion or Obsidian, EPUB books and PDFs. The files
     are read by services/import/exportFiles into sources and notes; this lands
     them. Safe to repeat: a source is found again by its address, a highlight
     by its words, a note by its path, and nothing is added twice. */
  const EXPORT_LIMITS = { files: 2000, bytes: 60 * 1024 * 1024 };
  const EXPORT_UNITS = {
    kindle: 'book',
    'apple-books': 'book',
    pocket: 'article',
    instapaper: 'article',
    readwise: 'source',
    markdown: 'note',
    epub: 'book',
    pdf: 'document'
  };
  const sameText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const receiveExportFiles = (req, res, next) => {
    const tooLarge = () => res.status(413).json({ error: 'That is more than 60 MB at once. Bring it in a few smaller batches.' });
    if (Number(req.headers['content-length'] || 0) > EXPORT_LIMITS.bytes) return tooLarge();
    // The header is optional (chunked uploads omit it), so count the bytes as they arrive.
    let received = 0;
    const meter = (chunk) => {
      received += chunk.length;
      if (received <= EXPORT_LIMITS.bytes) return;
      req.off('data', meter);
      req.unpipe();
      res.set('Connection', 'close');
      tooLarge();
      req.resume();
    };
    req.on('data', meter);
    return upload.array('files', EXPORT_LIMITS.files)(req, res, (error) => {
      req.off('data', meter);
      if (res.headersSent) return undefined;
      if (!error) return next();
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'One of those files is larger than 15 MB.'
        : error.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Bring in up to ${EXPORT_LIMITS.files} files at a time.`
          : 'Those files could not be read.';
      return res.status(413).json({ error: message });
    });
  };

  const inBatches = async (values, size, work) => {
    for (let index = 0; index < values.length; index += size) {
      await Promise.all(values.slice(index, index + size).map(work));
    }
  };

  const landExportSources = async ({ userId, sources, sourceLabel, importSessionId, indexing }) => {
    const tally = { newSources: 0, newHighlights: 0, sourcesWithNewHighlights: 0, alreadyHere: 0 };
    if (!sources.length) return { tally, articles: [] };
    const addresses = [...new Set(sources.flatMap(source => [source.url, ...(source.aliases || [])]))];
    const byUrl = new Map();
    for (let index = 0; index < addresses.length; index += 1000) {
      const found = await Article.find({ userId, url: { $in: addresses.slice(index, index + 1000) } });
      found.forEach(article => byUrl.set(article.url, article));
    }
    // Folders and concepts are matched by name, never made: an export's
    // shelves become this library's shelves only where the reader already has them.
    const folders = Folder ? await Folder.find({ userId }).select('name').lean() : [];
    const folderByName = new Map(folders.map(folder => [sameText(folder.name), folder._id]));
    const concepts = TagMeta?.find ? await TagMeta.find({ userId }).select('name').lean() : [];
    const conceptByName = new Map(concepts.map(concept => [sameText(concept.name), concept._id]));

    const dirty = new Set();
    const madeNow = new Set();
    const newHighlights = [];
    const pins = [];
    sources.forEach((source) => {
      const provider = source.provider;
      let article = byUrl.get(source.url) || (source.aliases || []).map(alias => byUrl.get(alias)).find(Boolean);
      const importMeta = {
        provider,
        sourceType: 'file_upload',
        sourceLabel,
        sourceUrl: /^https?:/i.test(source.url) ? source.url : '',
        importSessionId: importSessionId || null,
        importedAt: new Date(),
        ...(source.tags?.length ? { tags: source.tags } : {})
      };
      if (!article) {
        const folderName = [source.folderName, ...(source.tags || [])].find(name => folderByName.has(sameText(name)));
        article = new Article({
          url: source.url,
          title: deriveImportedTitle({
            metadataTitle: source.title,
            content: source.highlights[0]?.text || '',
            author: source.author,
            sourceType: 'csv',
            url: source.url
          }),
          author: source.author || '',
          content: source.content || '',
          userId,
          folder: folderName ? folderByName.get(sameText(folderName)) : null,
          importMeta
        });
        if (source.savedAt) article.createdAt = source.savedAt;
        byUrl.set(source.url, article);
        madeNow.add(article);
        dirty.add(article);
        tally.newSources += 1;
      } else if (source.content && !article.content) {
        /* A book first known by its highlights gets its pages when the book
           itself arrives, and the quotes typed with only their ends take its words. */
        article.content = source.content;
        const pages = source.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        article.highlights.filter(mark => isUnfinished(mark.text)).forEach((mark) => {
          mark.text = passageIn(pages, mark.text) || mark.text;
        });
        dirty.add(article);
        tally.newSources += 1;
      } else if (!source.highlights.length && !madeNow.has(article)) {
        tally.alreadyHere += 1;
      }
      (source.tags || []).forEach((tag) => {
        const conceptId = conceptByName.get(sameText(tag));
        if (conceptId) pins.push({ conceptId, article });
      });

      let added = 0;
      source.highlights.forEach((highlight) => {
        if (!sameText(highlight.text)) return;
        const held = absorbPassage(marksOfReading(article, highlight.createdAt), { text: highlight.text, note: highlight.note, at: highlight.createdAt });
        if (held) {
          held.page = held.page || highlight.page;
          if (article.isModified()) dirty.add(article);
          tally.alreadyHere += 1;
          return;
        }
        article.highlights.push({
          text: highlight.text,
          note: highlight.note || '',
          tags: highlight.tags || [],
          ...(highlight.page ? { page: highlight.page } : {}),
          ...(highlight.createdAt ? { createdAt: highlight.createdAt } : {}),
          importMeta: { ...importMeta, sourcePath: highlight.location || '' }
        });
        newHighlights.push({ article, highlight: article.highlights[article.highlights.length - 1] });
        added += 1;
      });
      if (added) {
        dirty.add(article);
        tally.newHighlights += added;
        tally.sourcesWithNewHighlights += 1;
      }
    });

    const articles = [...dirty];
    await inBatches(articles, 50, article => article.save());
    if (pins.length && TagMeta?.bulkWrite) {
      await TagMeta.bulkWrite(pins.map(({ conceptId, article }) => ({
        updateOne: { filter: { _id: conceptId, userId }, update: { $addToSet: { pinnedArticleIds: article._id } } }
      })));
    }
    // The wiki reads passages, so it hears about the ones that arrived. A bare
    // saved link has nothing in it to read yet.
    const withPassages = new Set(newHighlights.map(({ article }) => article));
    await inBatches([...withPassages], 50, article => emitWikiSourceEvent({
      userId,
      sourceType: 'article',
      sourceObjectId: article._id,
      provider: article.importMeta?.provider || 'import',
      eventType: 'imported',
      title: article.title,
      summary: article.content || '',
      url: article.url,
      sourceUpdatedAt: article.updatedAt || new Date(),
      metadata: { source: 'export-file', importSessionId }
    }));
    await inBatches(newHighlights, 50, ({ article, highlight }) => emitWikiSourceEvent({
      userId,
      sourceType: 'highlight',
      sourceObjectId: highlight._id,
      parentObjectId: article._id,
      provider: highlight.importMeta?.provider || 'import',
      eventType: 'imported',
      title: article.title,
      summary: [highlight.text, highlight.note].filter(Boolean).join(' - '),
      url: article.url,
      sourceUpdatedAt: highlight.createdAt || new Date(),
      metadata: { source: 'export-file', importSessionId }
    }));
    await inBatches(articles, 50, article => queueIndexingAttempt(
      indexing,
      () => enqueueArticleEmbedding(article),
      `Article indexing failed for ${article.title || article._id}`
    ));
    await inBatches(newHighlights, 50, ({ article, highlight }) => queueIndexingAttempt(
      indexing,
      () => enqueueHighlightEmbedding({ highlight, article }),
      `Highlight indexing failed for ${article.title || article._id}`
    ));
    return { tally, articles };
  };

  /* A Notion or Obsidian note is the reader's own writing, so it lands in
     Think beside their other notes, in folders mirroring the ones it came from. */
  const landExportNotes = async ({ userId, notes, importSessionId, indexing }) => {
    const tally = { notesCreated: 0, notesUpdated: 0, alreadyHere: 0 };
    const entries = [];
    const placements = new Map();
    for (const note of notes) {
      const [root = '', ...rest] = note.folderPath;
      const placementKey = note.folderPath.join('/');
      if (!placements.has(placementKey)) {
        placements.set(placementKey, await ensureNotebookImportFolderPath({
          userId,
          provider: 'markdown',
          sourceType: 'file_upload',
          sourceLabel: root,
          folderOwnership: NOTEBOOK_IMPORT_FOLDER_OWNERSHIP,
          sourcePath: rest
        }));
      }
      const folderPlacement = placements.get(placementKey);
      const { entry, created, updated } = await upsertImportedNotebookEntry({
        userId,
        provider: 'markdown',
        externalId: note.externalId,
        title: note.title,
        content: note.content,
        blocks: note.blocks.map(block => ({ id: crypto.randomUUID(), ...block })),
        tags: note.tags,
        folderPlacement,
        skipUnchanged: true,
        importMeta: {
          provider: 'markdown',
          sourceType: 'file_upload',
          sourceLabel: root || 'Markdown',
          sourcePath: folderPlacement.sourcePath,
          folderOwnership: NOTEBOOK_IMPORT_FOLDER_OWNERSHIP,
          externalId: note.externalId,
          importSessionId: importSessionId || null,
          importedAt: new Date()
        }
      });
      if (!created && !updated) {
        tally.alreadyHere += 1;
        continue;
      }
      tally[created ? 'notesCreated' : 'notesUpdated'] += 1;
      entries.push(entry);
    }
    await inBatches(entries, 50, entry => queueIndexingAttempt(
      indexing,
      () => enqueueNotebookEmbedding(entry),
      `Notebook indexing failed for ${entry.title || entry._id}`
    ));
    return { tally, entries };
  };

  /* The receipt says what happened in the reader's terms: highlights from
     books, saved articles, notes, and what was already here. When nothing
     could be read it says so, and nothing else. */
  const describeExportLanding = ({ formats, sources, notes, unreadable, unattachedNotes }) => {
    const units = [...new Set(formats.map(format => EXPORT_UNITS[format]).filter(unit => unit && unit !== 'note'))];
    const unit = units.length === 1 ? units[0] : 'source';
    const parts = [];
    if (sources.newHighlights) {
      parts.push(`Imported ${pluralize(sources.newHighlights, 'highlight')} from ${pluralize(sources.sourcesWithNewHighlights, unit)}`);
    }
    const bareSaves = sources.newSources - (sources.newHighlights ? sources.sourcesWithNewHighlights : 0);
    if (bareSaves > 0) parts.push(`${parts.length ? 'saved' : 'Saved'} ${pluralize(bareSaves, unit === 'source' ? 'article' : unit)}`);
    if (notes.notesCreated) parts.push(`${parts.length ? 'brought in' : 'Brought in'} ${pluralize(notes.notesCreated, 'note')}`);
    if (notes.notesUpdated) parts.push(`${parts.length ? 'refreshed' : 'Refreshed'} ${pluralize(notes.notesUpdated, 'note')}`);
    const alreadyHere = sources.alreadyHere + notes.alreadyHere;
    let summary = parts.join('; ');
    if (summary && alreadyHere) summary += `; ${alreadyHere} ${alreadyHere === 1 ? 'was' : 'were'} already here`;
    if (!summary) {
      summary = alreadyHere
        ? 'Everything in that export was already here'
        : 'Nothing in those files read as highlights, saved articles or notes';
    }
    const asides = [];
    if (unattachedNotes) asides.push(`${pluralize(unattachedNotes, 'Kindle note')} had no highlight to sit beside and ${unattachedNotes === 1 ? 'was' : 'were'} left out.`);
    if (unreadable) asides.push(`${pluralize(unreadable, 'entry', 'entries')} could not be read.`);
    return [`${summary}.`, ...asides].join(' ');
  };

  require('./import/fileRoutes')(router, {
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
  });

  const finishReadwise = async ({ req, userId, code, state }) => {
    const redirectUri = getReadwiseRedirectUri(req);
    const decoded = verifyReadwiseState(state);
    if (String(decoded.userId) !== String(userId)) throw new Error('This approval was started by another account.');
    const tokenPayload = await exchangeReadwiseCode({
      code,
      redirectUri,
      clientId: toTrimmedString(decoded.clientId),
      clientSecret: toTrimmedString(decoded.clientSecret),
      codeVerifier: toTrimmedString(decoded.codeVerifier)
    });
    const accessToken = toTrimmedString(tokenPayload.access_token);
    const refreshToken = toTrimmedString(tokenPayload.refresh_token);
    const userInfo = await fetchReadwiseUserInfo(accessToken);
    if (!await isAccountActive(String(decoded.userId || ''))) throw new Error('Account is unavailable.');

    let connection = await IntegrationConnection.findOne({
      userId,
      provider: 'readwise',
      mode: 'mcp_remote'
    }).sort({ updatedAt: -1, createdAt: -1 });
    if (!connection) {
      connection = new IntegrationConnection({
        userId: decoded.userId,
        provider: 'readwise',
        mode: 'mcp_remote'
      });
    }

    const email = toTrimmedString(userInfo?.email);
    const username = toTrimmedString(userInfo?.preferred_username || userInfo?.name);
    connection.accountLabel = email || username || 'Readwise';
    connection.externalAccountId = toTrimmedString(userInfo?.sub) || READWISE_MCP_SERVER_URL;
    connection.encryptedAccessToken = encryptSecret(accessToken);
    connection.encryptedRefreshToken = refreshToken ? encryptSecret(refreshToken) : '';
    connection.scopes = [
      ...READWISE_OAUTH_SCOPES,
      'mcp:readwise.highlights.read',
      'mcp:reader.documents.read',
      'mcp:reader.documents.write'
    ];
    await markConnectionHealthy(connection);
  };

  /**
   * Bring one Readwise connection up to date: what changed since the last check,
   * or the whole archive the first time. The Sync button and the timer both come
   * through here, and both are safe to repeat: a highlight already in the library
   * is matched by its Readwise id, or failing that its text, and never added twice.
   */
  const syncReadwiseConnection = async ({
    connection,
    importSessionId = '',
    fullSync = false,
    recordEmpty = true
  }) => {
    const userId = connection.userId;
    const credential = resolveReadwiseCredential(connection);
    if (!credential) throw new Error('This Readwise connection has nothing to read with.');
    // The clock starts when we ask, not when we finish, so a highlight made
    // while a long archive was coming across is still picked up next time.
    const checkedAt = new Date();
    // No lastSyncAt means nothing has ever been imported, so take the whole
    // archive whether or not the caller thought to ask for it.
    const updatedAfter = !fullSync && connection.lastSyncAt
      ? new Date(connection.lastSyncAt).toISOString()
      : '';
    const rows = await fetchReadwiseExportRows({
      token: credential.token,
      tokenType: credential.tokenType,
      updatedAfter
    });

    let importedArticles = 0;
    let importedHighlights = 0;
    let skippedRows = 0;
    let duplicateSkips = 0;
    let invalidSkips = 0;
    const articleCache = new Map();
    let shelf = null;
    const dirtyArticles = new Set();
    const pendingHighlightRefs = [];
    const pendingCorrections = [];

    for (const row of rows) {
      const metadataTitle = toTrimmedString(row.title);
      const author = toTrimmedString(row.author);
      // Readwise's own page for a book is not the book's address; a Kindle book has none.
      const sourceUrl = toTrimmedString(row.source_url || row.url);
      const externalId = toTrimmedString(row.user_book_id || row.id);
      const sourceLabel = connection.accountLabel || 'Readwise';
      const book = !sourceUrl && metadataTitle ? bookSource({ provider: 'readwise', title: metadataTitle, author }) : null;
      const url = sourceUrl || book?.url || `import://readwise/${externalId || crypto.randomUUID()}`;
      const documentTags = Array.isArray(row.book_tags)
        ? row.book_tags.map(tag => toTrimmedString(tag?.name || tag)).filter(Boolean)
        : [];
      const firstHighlightText = (Array.isArray(row.highlights) ? row.highlights : [])
        .map(highlight => toTrimmedString(highlight?.text))
        .find(Boolean) || '';
      const title = deriveImportedTitle({
        metadataTitle,
        content: toTrimmedString(row.summary || row.document_note || firstHighlightText),
        author,
        sourceType: /(?:x\.com|twitter\.com)/i.test(sourceUrl) ? 'social_thread' : 'api',
        url: sourceUrl,
        publishedAt: row.published_date || row.updated_at || null
      });

      let article = articleCache.get(url);
      if (!article) {
        article = await Article.findOne({ userId, url });
        // A book with no web address may already be on the shelf, started at the desk or imported from a file.
        if (!article && book) {
          shelf ||= await Article.find({ userId, url: BOOK_URL }).select('url title');
          const known = bookOnShelf(shelf, book);
          if (known) article = await Article.findById(known._id);
        }
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
              sourceUrl: sourceUrl || toTrimmedString(row.readwise_url),
              externalId,
              importSessionId: importSessionId || null,
              importedAt: new Date()
            }
          });
          importedArticles += 1;
        } else if (isFragmentTitle(article.title)) {
          article.title = title;
          dirtyArticles.add(article);
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
        const existingHighlight = (article.highlights || []).find((highlight) => (
          toTrimmedString(highlight?.importMeta?.externalId)
          && toTrimmedString(highlight?.importMeta?.externalId) === highlightExternalId
        ));
        if (existingHighlight && existingHighlight.text !== highlightText) {
          pendingCorrections.push({
            article,
            highlight: existingHighlight,
            previousText: existingHighlight.text
          });
          existingHighlight.text = highlightText;
          dirtyArticles.add(article);
          continue;
        }
        // A quote or note typed at the desk that this highlight completes.
        const absorbed = !existingHighlight && absorbPassage(marksOfReading(article, highlightRow.highlighted_at), {
          text: highlightText,
          note: toTrimmedString(highlightRow.note),
          at: highlightRow.highlighted_at
        });
        if (absorbed) {
          // Readwise knows it by this id from now on.
          absorbed.importMeta.externalId = absorbed.importMeta.externalId || highlightExternalId;
          if (article.isModified()) dirtyArticles.add(article);
        }
        if (existingHighlight || absorbed) {
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
          // A paper book read through Readwise's own app knows its printed page.
          ...(highlightRow.location_type === 'page' && Number(highlightRow.location) > 0 ? { page: Number(highlightRow.location) } : {}),
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

    // Nothing new is not news. The button still answers "no new material";
    // the timer just moves the clock.
    const quiet = !recordEmpty && importedArticles + importedHighlights === 0;

    await Promise.all(Array.from(dirtyArticles).map(article => article.save()));
    await Promise.all(pendingCorrections.map(({ article, highlight, previousText }) => recordSourceCorrection({
      WikiSourceEvent,
      userId,
      sourceType: 'highlight',
      sourceObjectId: highlight._id,
      parentObjectId: article._id,
      provider: 'readwise',
      externalId: toTrimmedString(highlight?.importMeta?.externalId),
      title: article.title,
      url: article.url,
      previousText,
      text: highlight.text,
      sourceUpdatedAt: article.updatedAt || new Date(),
      metadata: { source: 'readwise-api', importSessionId }
    })));
    await Promise.all(Array.from(dirtyArticles).map(article => emitWikiSourceEvent({
      userId,
      sourceType: 'article',
      sourceObjectId: article._id,
      provider: 'readwise',
      eventType: 'synced',
      title: article.title,
      summary: article.content || '',
      url: article.url,
      sourceUpdatedAt: article.updatedAt || new Date(),
      metadata: { source: 'readwise-api', importSessionId }
    })));
    await Promise.all(pendingHighlightRefs.map(({ article, highlight }) => emitWikiSourceEvent({
      userId,
      sourceType: 'highlight',
      sourceObjectId: highlight._id,
      parentObjectId: article._id,
      provider: 'readwise',
      eventType: 'synced',
      title: article.title,
      summary: [highlight.text, highlight.note].filter(Boolean).join(' - '),
      url: article.url,
      sourceUpdatedAt: highlight.createdAt || article.updatedAt || new Date(),
      metadata: { source: 'readwise-api', importSessionId }
    })));
    if (!quiet) await logConnectorAction({
      userId,
      connector: 'readwise',
      action: 'sync',
      targetType: 'import_session',
      targetId: importSessionId || '',
      summary: `Synced ${importedHighlights} Readwise highlights.`,
      metadata: { importedArticles, importedHighlights, skippedRows }
    });

    const indexing = buildIndexingSummary();
    await Promise.all([
      ...Array.from(dirtyArticles).map(article => queueIndexingAttempt(
        indexing,
        () => enqueueArticleEmbedding(article),
        `Article indexing failed for ${article.title || article._id}`
      )),
      ...pendingHighlightRefs.map(({ article, highlight }) => queueIndexingAttempt(
        indexing,
        () => enqueueHighlightEmbedding({ highlight, article }),
        `Highlight indexing failed for ${article.title || article._id}`
      ))
    ]);

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
      importedArticleIds: Array.from(dirtyArticles).map(article => String(article._id || '')),
      updatedAfter,
      connection: sanitizeConnection(connection.toObject()),
      indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started'),
    };
    resultPayload.receipt = buildNoeisImportReceipt({
      id: `import-${importSessionId || 'readwise-api'}-${Date.now()}`,
      source: 'readwise',
      sourceLabel: connection.accountLabel || 'Readwise',
      status,
      result: resultPayload,
      touched: Array.from(dirtyArticles).map(article => ({
        type: 'article',
        id: String(article._id || ''),
        title: article.title || 'Imported source'
      })),
      nextAction: importSessionId && resultPayload.importedArticleIds.length > 0
        ? { label: 'Review filing suggestions', intent: 'organize_import' }
        : null
    });
    persistConnectionLastSyncResult(connection, {
      ...resultPayload,
      completedAt: resultPayload.receipt.completedAt
    });
    connection.lastSyncAt = checkedAt;
    if (!quiet) connection.lastReceipt = resultPayload.receipt;
    await markConnectionHealthy(connection);
    resultPayload.connection = sanitizeConnection(connection.toObject());
    if (!quiet) await persistImportReceipt({ userId, receipt: resultPayload.receipt });
    return { result: resultPayload, itemCount: rows.length };
  };

  require('./import/readwiseRoutes')(router, {
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
  });

  require('./import/notionRoutes')(router, {
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
  });

  require('./import/evernoteRoutes')(router, {
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
  });

  // The timer imports exactly the way the button does.
  router.syncReadwiseConnection = syncReadwiseConnection;
  return router;
};

module.exports = {
  buildImportRouter
};
