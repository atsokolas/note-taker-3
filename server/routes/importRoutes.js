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
  ensureNotebookImportFolderPath
} = require('../services/notebookImportTreeService');
const {
  stageImportStructureProposal
} = require('../services/importStructureProposals');
const {
  NOTION_AUTHORIZE_URL,
  createNotionPage,
  exchangeNotionCode,
  fetchNotionBlockChildren,
  queryNotionDataSourcePages,
  queryNotionDataSourcePreviewPages,
  searchNotionItems,
  searchNotionPreviewItems
} = require('../services/import/notionClient');
const { createConnectorWikiSourceEvent } = require('../services/wikiSourceEventService');
const { processWikiSourceEvent: defaultProcessWikiSourceEvent } = require('../services/wikiMaintenanceOrchestrator');

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
  syncNotebookReferences,
  enqueueArticleEmbedding,
  enqueueHighlightEmbedding,
  enqueueNotebookEmbedding
}) => {
  const router = express.Router();

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

  const markImportSessionUnavailable = async ({ sessionId, userId, stage, message }) => (
    patchImportSession({
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
      }
    })
  );

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

  const truncateNotionText = (value = '', limit = 1900) => {
    const safe = String(value || '').trim().replace(/\s+/g, ' ');
    if (safe.length <= limit) return safe;
    return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
  };

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
    updatedAt
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
          clearImportOrganizationOffer(session);
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
      await Promise.all(Array.from(dirtyArticles).map(article => emitWikiSourceEvent({
        userId,
        sourceType: 'article',
        sourceObjectId: article._id,
        provider: 'readwise',
        eventType: 'imported',
        title: article.title,
        summary: article.content || '',
        url: article.url,
        sourceUpdatedAt: article.updatedAt || new Date(),
        metadata: { source: 'readwise-csv', importSessionId }
      })));
      await Promise.all(pendingHighlightRefs.map(({ article, highlight }) => emitWikiSourceEvent({
        userId,
        sourceType: 'highlight',
        sourceObjectId: highlight._id,
        parentObjectId: article._id,
        provider: 'readwise',
        eventType: 'imported',
        title: article.title,
        summary: [highlight.text, highlight.note].filter(Boolean).join(' - '),
        url: article.url,
        sourceUpdatedAt: highlight.createdAt || article.updatedAt || new Date(),
        metadata: { source: 'readwise-csv', importSessionId }
      })));
      await logConnectorAction({
        userId,
        connector: 'readwise',
        action: 'import_csv',
        targetType: 'import_session',
        targetId: importSessionId || '',
        summary: `Imported ${importedHighlights} Readwise highlights.`,
        metadata: { importedArticles, importedHighlights, skippedRows }
      });

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
        importedArticleIds: Array.from(dirtyArticles).map(article => String(article._id || '')),
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };

      const completedSession = await patchImportSession({
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
            lastImportedArticleId: resultPayload.articleIds[0] || '',
            importedArticleIds: resultPayload.importedArticleIds
          };
          session.lastError = '';
          applyImportOrganizationOffer(session);
        }
      });
      await stageImportOrganizationProposalForSession({
        session: completedSession,
        userId,
        articleIds: resultPayload.importedArticleIds
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
          clearImportOrganizationOffer(session);
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

  router.get('/api/import/readwise/oauth/callback', async (req, res) => {
    try {
      const code = toTrimmedString(req.query.code);
      const state = toTrimmedString(req.query.state);
      const redirectUri = getReadwiseRedirectUri(req);
      if (!code || !state) {
        throw new Error('Missing OAuth code or state.');
      }
      const decoded = verifyReadwiseState(state);
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

      let connection = await IntegrationConnection.findOne({
        userId: decoded.userId,
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

      const appUrl = getImportAppUrl(req);
      const nextUrl = new URL('/data-integrations', appUrl);
      nextUrl.searchParams.set('source', 'readwise');
      nextUrl.searchParams.set('readwise', 'connected');
      return res.redirect(nextUrl.toString());
    } catch (error) {
      console.error('Readwise OAuth callback failed:', error);
      const appUrl = getImportAppUrl(req);
      const nextUrl = new URL('/data-integrations', appUrl);
      nextUrl.searchParams.set('source', 'readwise');
      nextUrl.searchParams.set('readwise', 'error');
      return res.redirect(nextUrl.toString());
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
      if (connection.mode === 'mcp_remote') {
        const message = 'Readwise browser authorization is connected for agent retrieval. Direct Noeis preview still needs the advanced API-token sync path until the hosted Readwise broker ships.';
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
      if (connection.mode === 'mcp_remote') {
        const message = 'Readwise browser authorization is connected for agent retrieval. Direct Noeis import still needs the advanced API-token sync path until the hosted Readwise broker ships.';
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
      if (!connection.encryptedApiToken) {
        return res.status(400).json({ error: 'Readwise token is missing for this connection.' });
      }

      await patchImportSession({
        sessionId: importSessionId,
        userId,
        mutate: (session) => {
          session.status = 'importing';
          session.sourceLabel = connection.accountLabel || 'Readwise';
          clearImportOrganizationOffer(session);
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
      let duplicateSkips = 0;
      let invalidSkips = 0;
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
      await logConnectorAction({
        userId,
        connector: 'readwise',
        action: 'sync',
        targetType: 'import_session',
        targetId: importSessionId || '',
        summary: `Synced ${importedHighlights} Readwise highlights.`,
        metadata: { importedArticles, importedHighlights, skippedRows }
      });

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
        importedArticleIds: Array.from(dirtyArticles).map(article => String(article._id || '')),
        updatedAfter,
        connection: sanitizeConnection(connection.toObject()),
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };

      const completedSession = await patchImportSession({
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
            lastImportedArticleId: resultPayload.articleIds[0] || '',
            importedArticleIds: resultPayload.importedArticleIds
          };
          session.lastError = '';
          applyImportOrganizationOffer(session);
        }
      });
      await stageImportOrganizationProposalForSession({
        session: completedSession,
        userId,
        articleIds: resultPayload.importedArticleIds
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
          clearImportOrganizationOffer(session);
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

      const appUrl = getImportAppUrl(req);
      const nextUrl = new URL('/data-integrations', appUrl);
      nextUrl.searchParams.set('source', 'notion');
      nextUrl.searchParams.set('notion', 'connected');
      return res.redirect(nextUrl.toString());
    } catch (error) {
      console.error('Notion OAuth callback failed:', error);
      const appUrl = getImportAppUrl(req);
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

      syncedEntries.forEach((entry) => {
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
        entryId: syncedEntries[0] ? String(syncedEntries[0]._id) : '',
        entryIds: syncedEntries.map(entry => String(entry._id || '')),
        importedEntryIds: syncedEntries.map(entry => String(entry._id || '')),
        pageCount: pages.length,
        dataSourceCount: dataSources.length,
        connection: sanitizeConnection(connection.toObject()),
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
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
          session.lastError = '';
          applyImportOrganizationOffer(session);
        }
      });
      await stageImportOrganizationProposalForSession({
        session: completedSession,
        userId,
        notebookEntryIds: resultPayload.importedEntryIds
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
          clearImportOrganizationOffer(session);
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

      syncedEntries.forEach((entry) => {
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
        entryId: syncedEntries[0] ? String(syncedEntries[0]._id) : '',
        entryIds: syncedEntries.map(entry => String(entry._id || '')),
        importedEntryIds: syncedEntries.map(entry => String(entry._id || '')),
        indexingState: indexing.indexingFailures > 0 ? 'partial' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };

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
          session.lastError = '';
          applyImportOrganizationOffer(session);
        }
      });
      await stageImportOrganizationProposalForSession({
        session: completedSession,
        userId,
        notebookEntryIds: resultPayload.importedEntryIds
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
          clearImportOrganizationOffer(session);
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
          clearImportOrganizationOffer(session);
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
        entryIds: [String(entry._id)],
        importedEntryIds: [String(entry._id)],
        ...indexing,
        indexingState: indexing.indexingFailures > 0 ? 'failed' : (indexing.indexingQueued > 0 ? 'queued' : 'not_started')
      };

      const completedSession = await patchImportSession({
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
            lastImportedEntryId: String(entry._id),
            importedEntryIds: resultPayload.importedEntryIds
          };
          session.lastError = '';
          applyImportOrganizationOffer(session);
        }
      });
      await stageImportOrganizationProposalForSession({
        session: completedSession,
        userId,
        notebookEntryIds: resultPayload.importedEntryIds
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
          clearImportOrganizationOffer(session);
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
