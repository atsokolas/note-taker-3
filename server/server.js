const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const upload = require('./services/import/upload');
const { buildHostedMcpRouter, parseHostedMcpBody } = require('./routes/hostedMcpRoutes');
const crypto = require('crypto');
const { ensureWorkspace } = require('./utils/workspaceUtils');
const { requestTiming, timeMongoose } = require('./utils/requestTiming');
const { refuseQueryOperators } = require('./utils/refuseQueryOperators');
const { flatQuery } = require('./utils/flatQuery');
const {
  enqueueArticleEmbedding,
  deleteArticleEmbeddingState,
  deleteHighlightEmbeddingState,
  enqueueHighlightEmbedding,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding
} = require('./ai/embeddingJobs');
const { EVENT_NAMES, trackEvent, trackReturnVisit } = require('./utils/analytics');
const { EmbeddingError } = require('./ai/embed');
const { semanticSearch, similarToSource, echoOf, formingAround } = require('./ai/semanticSearch');
const { buildEmbeddingId } = require('./ai/embeddingTypes');
const { buildConnectionScopeQuery } = require('./utils/connectionScopeQuery');
const {
  sanitizeRetrievalSnippet,
  classifyQuestionEvidenceTone,
  isBoilerplateRetrievalSentence
} = require('./utils/retrievalSanitizer');

dotenv.config();

const { onBehalfOf } = require('./ai/modelBudget');
const { takeSharesDown } = require('./services/accountShares');
const app = express();
app.set('query parser', flatQuery);
const PORT = process.env.PORT || 3000;
// Where the server reaches its own API, as an agent would: the hosted MCP and the built-in agent.
const internalApiUrl = process.env.NOEIS_MCP_INTERNAL_API_URL || `http://127.0.0.1:${PORT}`;

timeMongoose();
app.use(requestTiming);

app.use(cors());

const { buildOpenaiAppsChallengeRouter } = require('./routes/openaiAppsChallengeRoutes');
app.use(buildOpenaiAppsChallengeRouter());

const { buildChatgptOAuthIngress } = require('./services/chatgptOAuthIngress');
app.use(buildChatgptOAuthIngress());
// The raw bytes stay on the request for webhooks that sign them (email-in).
app.use('/mcp', parseHostedMcpBody);
// Nothing bigger than one Mongo document (16 MB) can be kept, so nothing bigger is read.
// Only the signed email webhook needs the bytes as they came.
const BODY_LIMIT = '16mb';
app.use(express.json({ limit: BODY_LIMIT, verify: (req, _res, buf) => { if (req.path === '/api/import/email') req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(refuseQueryOperators);

// Which build is actually serving traffic?
//
// Nothing could answer that. A fix would land, the dashboard would report a
// successful deploy, production would keep behaving like the old code, and
// there was no way to separate a stale instance from a fix that did not work —
// so the next move was always a guess. Render already hands the commit to the
// process; pass it through.
//
// Deliberately unauthenticated and free of secrets. A commit sha and a boot
// time are the two facts needed to trust, or distrust, every other measurement
// taken against this server.
const SERVER_BOOTED_AT = new Date().toISOString();
app.get('/api/version', (_req, res) => {
  res.status(200).json({
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'unknown',
    branch: process.env.RENDER_GIT_BRANCH || '',
    service: process.env.RENDER_SERVICE_NAME || '',
    node: process.version,
    bootedAt: SERVER_BOOTED_AT,
    uptimeSeconds: Math.round(process.uptime())
  });
});

mongoose.connect(process.env.MONGODB_URI) // useNewUrlParser and useUnifiedTopology are deprecated in recent Mongoose versions
  .then(() => console.log("✅ MongoDB connected successfully."))
  // Connect sessions once kept the agent's secret in plain text. None may now.
  .then(() => AgentConnectSession.collection.updateMany({ tokenSecret: { $exists: true } }, { $unset: { tokenSecret: '' } }))
  .then(({ modifiedCount }) => modifiedCount && console.log(`[agent-connect] forgot ${modifiedCount} stored secrets`))
  .catch(err => console.error("❌ MongoDB connection error:", err));

const {
  User,
  Feedback,
  Recommendation,
  Folder,
  Article,
  ArticleReadingState,
  Thread,
  Note,
  NotebookEntry,
  NotebookFolder,
  EntryRevision,
  TagMeta,
  ConceptNote,
  Question,
  Board,
  BoardItem,
  BoardEdge,
  WorkingMemoryItem,
  UiSettings,
  WikiSchemaSettings,
  TourState,
  ReturnQueueEntry,
  Connection,
  ConnectionJudgment,
  ItemViewEvent,
  ConceptPath,
  ConceptPathProgress,
  PersonalAgent,
  AgentToken,
  AgentConnectSession,
  AgentTaskLink,
  AgentThread,
  AgentProtocolApproval,
  AgentHandoff,
  Handoff,
  Citation,
  RecallCheck,
  Verdict,
  Disagreement,
  Museum,
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  ReferenceEdge,
  SavedView,
  Collection,
  IntegrationConnection,
  ImportSession,
  NoeisReceipt,
  MorningPaperDelivery,
  WikiPageVisit,
  EmbeddingJob,
  Edition,
  EditionProfile,
  MorningPaperRecord,
  SharedEdition,
  SharedNotebook,
  ReadingLoopEdition,
  VectorItem,
  SharedConcept,
  SharedQuestion,
  QuestionContribution,
  QuestionPresence,
  CasebookLineage,
  JudgmentResponseDraft,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiLintRun,
  WikiSourceEvent,
  WikiMaintenanceRun,
  WikiRepoBaseline,
  WikiBriefingCache,
  WikiSharedCollection,
  ConnectorActionLog,
  AuthoredExploration
} = require('./models/index');
const { readWikiStorageStatus } = require('./services/wikiAutomaticRetentionService');
const { buildAuthoredKeepEffects } = require('./services/authoredKeepEffects');
const { startWorkers, startReadwiseSync, whenConnected } = require('./workers');

startWorkers();
const { buildFolderService } = require('./services/folderService');
const { getFoldersWithCounts } = buildFolderService({ Folder, Article, mongoose });
const { buildWorkNoteRouter } = require('./routes/workNoteRoutes');
const { workProjectDeletion } = require('./routes/workProjectDeletion');
const { startWorkProjectErasure } = require('./services/workProjectErasure');
const { buildNotebookRouter } = require('./routes/notebookRoutes');
const { buildEntryHistoryRouter } = require('./routes/entryHistoryRoutes');
const { buildRetiredShareRouter } = require('./routes/retiredShareRoutes');
const { buildAuthoredExplorationRouter } = require('./routes/authoredExplorationRoutes');
const { buildWikiRouter } = require('./routes/wikiRoutes');
const { buildUiTourRouter } = require('./routes/uiTourRoutes');
const { buildReturnQueueRouter } = require('./routes/returnQueueRoutes');
const { buildConnectionsRouter } = require('./routes/connectionsRoutes');
const { buildConceptPathRouter } = require('./routes/conceptPathRoutes');
const { buildFeedbackHighlightRouter } = require('./routes/feedbackHighlightRoutes');
const { buildLegacyContentRouter } = require('./routes/legacyContentRoutes');
const { buildAuthDiscoveryRouter } = require('./routes/authDiscoveryRoutes');
const { buildMarketingAnalyticsRouter } = require('./routes/marketingAnalyticsRoutes');
const { buildMarketingFunnelRouter } = require('./routes/marketingFunnelRoutes');
const { buildSearchRetrievalRouter } = require('./routes/searchRetrievalRoutes');
const { buildSemanticSearchRouter } = require('./routes/semanticSearchRoutes');
const { buildRecallRouter } = require('./routes/recallRoutes');
const { buildAddedRouter } = require('./routes/addedRoutes');
const { buildHomeRouter } = require('./routes/homeRoutes');
const { buildSyncRouter } = require('./routes/syncRoutes');
const { buildHandoffRouter } = require('./routes/handoffRoutes');
const { buildDisagreementRouter } = require('./routes/disagreementRoutes');
const { buildMuseumRouter } = require('./routes/museumRoutes');
const { checkDisagreements } = require('./services/disagreements');
const { workHandoff, resumeHandoffs } = require('./services/handoffWorker');
const { fileAgentsReadingEditions } = require('./services/agentsReadingEdition');
const { buildPencilRouter } = require('./routes/pencilRoutes');
const { buildTagTemplateRouter } = require('./routes/tagTemplateRoutes');
const { buildConceptMetaRouter } = require('./routes/conceptMetaRoutes');
const { buildWikiClaimDispositionRouter } = require('./routes/wikiClaimDispositionRoutes');
const { buildSharedQuestionRouter } = require('./routes/sharedQuestionRoutes');
const { buildConceptMaterialRouter } = require('./routes/conceptMaterialRoutes');
const { buildAgentNotionFetchRouter } = require('./routes/agentNotionFetchRoutes');
const { fetchNotionPagesForAgent } = require('./services/agentTools/notionFetchTool');
const notionClientForAgent = require('./services/import/notionClient');
const notionTransformForAgent = require('./services/import/notionTransform');
const { decryptSecret: decryptIntegrationSecretForAgent } = require('./utils/integrationSecrets');
const { buildAgentSettingsRouter } = require('./routes/agentSettingsRoutes');
const { buildDailyLoopRouter } = require('./routes/dailyLoopRoutes');
const { buildKnowledgeMovementRouter } = require('./routes/knowledgeMovementRoutes');
const { buildSystemLoopRouter } = require('./routes/systemLoopRoutes');
const { buildDecisionIndexRouter } = require('./routes/decisionIndexRoutes');
const { buildDecisionMutationRouter } = require('./routes/decisionMutationRoutes');
const { buildJudgmentResolutionRouter } = require('./routes/judgmentResolutionRoutes');
const { buildLibraryRelevanceRouter } = require('./routes/libraryRelevanceRoutes');
const { buildReadingLoopRouter } = require('./routes/readingLoopRoutes');
const { buildPersonalAgentRouter } = require('./routes/personalAgentRoutes');
const { buildAgentTokenRouter } = require('./routes/agentTokenRoutes');
const { buildChatgptOAuthRouter } = require('./routes/chatgptOAuthRoutes');
const { readChatgptOAuthConfig } = require('./services/chatgptOAuthConfig');
const { ChatgptOAuthRequest, ChatgptOAuthGrant, ChatgptOAuthControl, ChatgptOAuthClient } = require('./models/chatgptOAuthModels');
const { createChatgptOAuthReadiness } = require('./services/chatgptOAuthReadiness');
const chatgptOAuthConfig = readChatgptOAuthConfig();
const chatgptOAuthReadiness = chatgptOAuthConfig ? createChatgptOAuthReadiness({
  models: { ChatgptOAuthRequest, ChatgptOAuthGrant, ChatgptOAuthControl, ChatgptOAuthClient }
}) : null;
const { buildEditionRouter } = require('./routes/editionRoutes');
const { buildEditionThoughtRouter } = require('./routes/editionThoughtRoutes');

const { buildAgentBridgeRouter } = require('./routes/agentBridgeRoutes');
const { buildAgentConnectRouter } = require('./routes/agentConnectRoutes');
const { buildAgentTaskLinkRouter } = require('./routes/agentTaskLinkRoutes');
const { buildAgentThreadRouter } = require('./routes/agentThreadRoutes');
const { buildAgentHandoffRouter } = require('./routes/agentHandoffRoutes');
const { buildAgentActionRouter } = require('./routes/agentActionRoutes');
const { buildAgentRunRouter } = require('./routes/agentRunRoutes');
const { buildAgentProposedChangeRouter } = require('./routes/agentProposedChangeRoutes');
const { buildAgentStructureProposalRouter } = require('./routes/agentStructureProposalRoutes');
const { buildArticleReadingStateRouter } = require('./routes/articleReadingStateRoutes');
const { buildLibraryCollectionRouter } = require('./routes/libraryCollectionRoutes');
const { buildReadingRoomRouter } = require('./routes/readingRoomRoutes');
const { buildAgentChatRouter } = require('./routes/agentChatRoutes');
const {
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken,
  buildAuthenticateAgentToken,
  requireHumanReader,
  requireHumanOrDesktop,
  AGENT_TOKEN_PREFIX
} = require('./services/agentTokenService');
const { buildAgentWriteBoundaryRouter } = require('./routes/agentWriteBoundaryRoutes');
const { buildConceptSuggestionRouter } = require('./routes/conceptSuggestionRoutes');
const { buildConceptPinRouter } = require('./routes/conceptPinRoutes');
const { buildTagInsightRouter } = require('./routes/tagInsightRoutes');
const { buildConceptQuestionBoardRouter } = require('./routes/conceptQuestionBoardRoutes');
const { buildSemanticReferenceRouter } = require('./routes/semanticReferenceRoutes');
const { buildReferenceBacklinkRouter } = require('./routes/referenceBacklinkRoutes');
const { buildImportRouter } = require('./routes/importRoutes');
const { buildImportSessionRouter } = require('./routes/importSessionRoutes');
const { buildExportPublicRouter } = require('./routes/exportPublicRoutes');
const { buildBulkExportRouter } = require('./routes/bulkExportRoutes');
const { buildHighlightMutationRouter } = require('./routes/highlightMutationRoutes');
const { buildAiMaintenanceRouter } = require('./routes/aiMaintenanceRoutes');
const { buildSystemRouter } = require('./routes/systemRoutes');
const { buildLibraryFilingRouter } = require('./routes/libraryFilingRoutes');
const { stageLibraryFilingSuggestions: runStageLibraryFilingSuggestions } = require('./services/libraryFilingService');
const { startServer } = require('./startServer');
const {
  listWorkspaceTemplates,
  getWorkspaceTemplateById
} = require('./services/workspaceTemplates');
const { getConcepts, getConceptMeta, updateConceptMeta, getConceptRelated } = require('./services/concepts');
const { generateCollaborativeReply } = require('./services/collaborativeAgentService');
const { listAgentSkills } = require('./services/agentSkillCatalog');
const { buildAgentPlanner, listWorkerRoles } = require('./services/agentWorkerRoles');
const {
  sanitizeAgentRunDoc,
  createRunFromProposalBundle,
  applyProposalBundleRunOutcome
} = require('./services/agentRuns');
const {
  executeAgentRun
} = require('./services/agentRunExecution');
const {
  requestRunStepApproval
} = require('./services/agentRunProtocolApprovals');
const {
  resolveRequestedProposalBundle,
  applyProposalBundleInvalidations
} = require('./services/agentBundleResolution');
const {
  sanitizeAgentProposedChangeDoc,
  createProposedChangesForRun,
  updateProposedChangeDraft,
  acceptProposedChange,
  rejectProposedChange,
  rollbackProposedChange
} = require('./services/agentProposedChanges');
const {
  sanitizeAgentStructureProposalDoc,
  listStructureProposals,
  updateStructureProposalDraft,
  applyStoredStructureProposal,
  rejectStructureProposal,
  rollbackStoredStructureProposal
} = require('./services/agentStructureProposals');
const {
  planLibraryStructureProposal,
  persistLibraryStructureProposal
} = require('./services/agentStructurePlanningService');
const {
  buildMarketingFunnelSnapshot,
  buildMarketingFunnelSeries
} = require('./services/marketingFunnelMetrics');
const { reconcileAgentRunState } = require('./services/agentRunReviewState');
const {
  normalizeThreadStatus,
  normalizeThreadScope,
  normalizeThreadMessage,
  normalizeThreadPlan,
  normalizeThreadCheckpoint,
  normalizeThreadPlanner,
  appendThreadMessage,
  compactThreadState,
  threadMessagesToHistory,
  sanitizeAgentThreadDoc,
  truncate: truncateThreadText
} = require('./services/agentThreadState');
const {
  DELETE_RETENTION_DAYS: AGENT_DELETE_RETENTION_DAYS,
  executeWorkspaceActionsWithPolicy,
  listActionApprovals,
  approveActionApproval,
  rejectActionApproval,
  listSoftDeleteRecords,
  restoreSoftDeletedWorkspaceItem,
  undoLastWorkspaceAction
} = require('./services/agentActionService');
const {
  createBlockId,
  normalizeItemType,
  normalizeTags,
  slugify,
  stripHtml,
  buildConceptMarkdown,
  ensureNotebookBlocks,
  buildNotebookBlocksFromEdges,
  loadNotebookBacklinks,
  syncNotebookReferences
} = require('./services/notebookBlocks');
const {
  AGENT_HANDOFF_STATUSES,
  AGENT_HANDOFF_TASK_TYPES,
  AGENT_BRIDGE_TOKEN_KIND,
  DEFAULT_BRIDGE_TOKEN_TTL_SECONDS,
  normalizeAgentActorType,
  normalizeAgentActionFlow,
  normalizePersonalAgentStatus,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority,
  createPersonalAgentApiKey,
  hashPersonalAgentApiKey,
  normalizePersonalAgentCapabilities,
  normalizePersonalAgentWorkerRoles,
  normalizeUserAgentProfile,
  deriveAgentEntitlements,
  getUserAgentEntitlements,
  sanitizePersonalAgent,
  safeAgentHandoffLimit,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  parseOptionalDate,
  getAgentBridgeJwtSecret,
  safeBridgeTokenTtlSeconds,
  normalizeAgentProtocolPolicy,
  sanitizeAgentProtocolPolicy,
  toStoredAgentProtocolPolicy,
  getUserAgentProtocolPolicy,
  resolveAutoHandoffRequestedActor,
  createSignedBridgeToken,
  shouldRequireProtocolApproval,
  requestProtocolApproval,
  triggerProtocolHookPhase,
  sanitizeAgentHandoffDoc,
  appendHandoffEvent,
  normalizeHandoffPayload,
  resolveAndValidateActorIdentity,
  canActorClaimHandoff,
  canActorMutateClaimedHandoff,
  runBridgeHandoffOperation,
  listProtocolApprovals,
  approveProtocolApproval,
  rejectProtocolApproval
} = require('./services/agentProtocol');

const normalizeConceptNameInput = (value) => (
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
);

const decodeTemplateText = (value) => (
  String(value || '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .trim()
);
const {
  parseClaimId,
  mapHighlightWithArticle,
  findHighlightById
} = require('./services/highlightLookup');
const {
  normalizeBoardScopeType,
  normalizeBoardScopeId,
  normalizeBoardItemType,
  normalizeBoardItemRole,
  normalizeBoardRelation,
  normalizeBoardNumber,
  resolveBoardItemPayload,
  ensureBoardOwnership
} = require('./services/boardItems');
const {
  normalizeReturnQueueItemType,
  parseDueAt,
  buildUnavailableQueueItem,
  buildQueueSnippet,
  escapeRegExp,
  resolveConceptByParam,
  resolveReturnQueueItem,
  normalizeConnectionItemType,
  normalizeRelationType,
  resolveConnectionItem,
  resolveConnectionScopeInput,
  toObjectIdList,
  addToCandidateSet,
  buildConnectionScopeCandidates,
  isConnectionItemInScopeCandidates,
  normalizeConceptPathItemType,
  normalizeConceptPathNotes,
  sortPathItemRefs,
  normalizePathItemRefsInput,
  ensureConceptPathOwnership,
  getConceptPathWithProgress,
  parseCsvList,
  buildGraphNodeKey,
  buildGraphNodeMap
} = require('./services/itemGraph');
const {
  normalizeUiSettingsScope,
  normalizeUiSettingsPayload,
  buildUiSettingsResponse,
  TOUR_STEP_IDS,
  TOUR_SIGNAL_DEFAULTS,
  TOUR_EVENT_TIMESTAMP_DEFAULTS,
  TOUR_EVENT_TO_SIGNAL,
  getNextTourStepId,
  normalizeTourStatus,
  normalizeTourCurrentStepId,
  normalizeTourSignals,
  normalizeTourCompletedStepIds,
  deriveCompletedStepIdsFromSignals,
  isTourStateEmpty,
  buildTourStateResponse,
  getOrCreateTourState,
  markTourSignal
} = require('./services/uiState');
// --- AUTHENTICATION ADDITIONS: JWT Verification Middleware ---
// A browser session is the bearer token the app sends; there is no cookie to ride along on.
const readRequestToken = (req) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  return { token, tokenSource: token ? 'header' : 'none' };
};

const { buildAccountAccessCheck, buildBrowserAuthentication } = require('./services/accountAccessService');
const isAccountActive = buildAccountAccessCheck({ User });
const browserAuthenticationOptions = {
  readRequestToken,
  /* Every token names what it is for, and a token for anything else (an
     import's sign-in state, an agent bridge) is never a session. Sessions
     signed before audiences carry none; they lapse within their seven days. */
  verifyToken: (token) => {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.aud !== undefined && decoded.aud !== 'session') throw new jwt.JsonWebTokenError('not a session token');
    return decoded;
  },
  isAccountActive
};
const authenticateToken = buildBrowserAuthentication(browserAuthenticationOptions);
const optionalAuthenticateToken = buildBrowserAuthentication({ ...browserAuthenticationOptions, optional: true });

const oauthTokenOptions = {
  isAccountActive,
  OAuthGrant: ChatgptOAuthGrant,
  oauthResource: chatgptOAuthConfig?.resource
};
const authenticateAgentToken = buildAuthenticateAgentToken({ AgentToken, ...oauthTokenOptions });
const authenticateMcpToken = buildAuthenticateAgentToken({
  AgentToken,
  requiredScope: 'read',
  consume: false,
  ...oauthTokenOptions,
  resourceMetadataUrl: chatgptOAuthConfig ? `${chatgptOAuthConfig.issuer}/.well-known/oauth-protected-resource` : null
});

// A browser session, or an agent token checked by `agentAuth`.
const userOr = agentAuth => function authenticateUserOrAgent(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const headerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (headerToken.startsWith(AGENT_TOKEN_PREFIX)) {
    return agentAuth(req, res, next);
  }
  return authenticateToken(req, res, next);
};
const authenticateUserOrAgentToken = userOr(authenticateAgentToken);
const authenticateCapture = userOr(buildAuthenticateAgentToken({ AgentToken, requiredScope: 'capture', ...oauthTokenOptions }));

async function authenticatePersonalAgentKey(req, res, next) {
  try {
    const agentId = String(req.headers['x-agent-id'] || '').trim();
    const rawApiKey = String(req.headers['x-agent-key'] || '').trim();
    if (!agentId || !rawApiKey) {
      return res.status(401).json({ error: 'AGENT_AUTH_REQUIRED' });
    }
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(401).json({ error: 'AGENT_AUTH_INVALID' });
    }

    const apiKeyHash = hashPersonalAgentApiKey(rawApiKey);
    const personalAgent = await PersonalAgent.findOne({
      _id: agentId,
      apiKeyHash,
      status: 'active'
    }).select('_id userId name status capabilities preferredWorkerRoles persona');

    if (!personalAgent) {
      return res.status(401).json({ error: 'AGENT_AUTH_INVALID' });
    }
    let accountActive;
    try { accountActive = await isAccountActive(String(personalAgent.userId || '')); }
    catch (_error) { return res.status(503).json({ error: 'AUTH_UNAVAILABLE' }); }
    if (!accountActive) return res.status(401).json({ error: 'AGENT_AUTH_INVALID' });

    personalAgent.lastUsedAt = new Date();
    await personalAgent.save();

    req.personalAgent = {
      id: String(personalAgent._id),
      userId: String(personalAgent.userId),
      name: String(personalAgent.name || ''),
      capabilities: normalizePersonalAgentCapabilities(personalAgent.capabilities || {}),
      preferredWorkerRoles: normalizePersonalAgentWorkerRoles(personalAgent.preferredWorkerRoles || []),
      persona: String(personalAgent.persona || '')
    };
    onBehalfOf(req.personalAgent.userId, next);
  } catch (error) {
    console.error('❌ Error authenticating personal agent key:', error);
    return res.status(500).json({ error: 'Failed to authenticate personal agent.' });
  }
}

async function authenticateAgentBridgeToken(req, res, next) {
  try {
    const header = String(req.headers.authorization || '').trim();
    const bearer = header.toLowerCase().startsWith('bearer ')
      ? header.slice(7).trim()
      : '';
    const token = bearer || String(req.headers['x-agent-bridge-token'] || '').trim();
    if (!token) {
      return res.status(401).json({ error: 'BRIDGE_AUTH_REQUIRED' });
    }

    const decoded = jwt.verify(token, getAgentBridgeJwtSecret(), {
      issuer: 'note-taker-3-1',
      audience: 'agent-bridge'
    });
    if (String(decoded?.kind || '') !== AGENT_BRIDGE_TOKEN_KIND) {
      return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });
    }

    const userId = String(decoded?.userId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });
    }

    let accountActive;
    try { accountActive = await isAccountActive(userId); }
    catch (_error) { return res.status(503).json({ error: 'AUTH_UNAVAILABLE' }); }
    if (!accountActive) return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });

    const actorType = normalizeAgentActorType(decoded?.actorType, '');
    if (!actorType) return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });
    const actorId = String(decoded?.actorId || '').trim();

    if (actorType === 'user') {
      const effectiveActorId = actorId || userId;
      if (effectiveActorId !== userId) {
        return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });
      }
    }
    if (actorType === 'byo_agent') {
      if (!mongoose.Types.ObjectId.isValid(actorId)) {
        return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });
      }
      const personalAgent = await PersonalAgent.findOne({
        _id: actorId,
        userId,
        status: 'active'
      }).select('_id');
      if (!personalAgent) return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });
    }

    req.bridgeActor = {
      userId,
      actorType,
      actorId: actorType === 'user' ? userId : actorId,
      scope: String(decoded?.scope || '').trim() || 'agent_ops'
    };
    next();
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'BRIDGE_AUTH_EXPIRED' });
    }
    return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });
  }
}

const { buildNotebookMarkdown } = require('./services/notebookMarkdown');

const sendEmbeddingError = (res, error) => {
  const status = error.status || 503;
  const payload = error.payload || { error: error.message };
  res.status(status).json(payload);
};


app.use(buildAuthDiscoveryRouter({
  bcrypt,
  jwt,
  User,
  authenticateToken,
  Recommendation,
  Article,
  TourState,
  trackEvent,
  EVENT_NAMES,
  takeSharesDown: userId => takeSharesDown({ models: require('./models'), userId })
}));

app.use(buildMarketingAnalyticsRouter({
  trackEvent,
  EVENT_NAMES
}));

app.use(buildMarketingFunnelRouter({
  authenticateToken,
  buildMarketingFunnelSnapshot,
  buildMarketingFunnelSeries
}));

const normalizeChecklist = (checklist = []) => {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map(item => ({
      text: (item?.text || '').trim(),
      checked: !!item?.checked
    }))
    .filter(item => item.text.length > 0);
};

const normalizeAnnotations = (annotations = []) => {
  if (!Array.isArray(annotations)) return [];
  return annotations
    .map(item => {
      const text = (item?.text || '').trim();
      const note = (item?.note || '').trim();
      if (!text && !note) return null;
      return {
        id: item?.id || new mongoose.Types.ObjectId().toString(),
        text,
        note,
        page: typeof item?.page === 'number' ? item.page : null,
        color: item?.color || '#f6c244',
        createdAt: item?.createdAt || new Date()
      };
    })
    .filter(Boolean);
};

const normalizePdfs = (pdfs = []) => {
  if (!Array.isArray(pdfs)) return [];
  return pdfs
    .map(pdf => {
      const dataUrl = typeof pdf?.dataUrl === 'string' ? pdf.dataUrl : '';
      if (!dataUrl) return null;
      return {
        id: pdf?.id || new mongoose.Types.ObjectId().toString(),
        name: (pdf?.name || 'Untitled.pdf').trim().slice(0, 200),
        dataUrl,
        uploadedAt: pdf?.uploadedAt || new Date(),
        annotations: normalizeAnnotations(pdf?.annotations || [])
      };
    })
    .filter(Boolean);
};

app.use(buildLegacyContentRouter({
  authenticateToken: authenticateUserOrAgentToken,
  mongoose,
  Note,
  normalizeChecklist,
  Folder,
  normalizePdfs,
  Article,
  ArticleReadingState,
  enqueueArticleEmbedding,
  deleteArticleEmbeddingState,
  getFoldersWithCounts,
  normalizeItemType,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiLintRun,
  WikiSourceEvent,
  WikiMaintenanceRun,
  NotebookEntry,
  TagMeta,
  Question
}));
app.use(buildLibraryFilingRouter({
  authenticateToken,
  NoeisReceipt,
  stageLibraryFilingSuggestions: (params) => runStageLibraryFilingSuggestions({
    ...params,
    AgentStructureProposal,
    AgentThread,
    Article,
    Folder,
    appendThreadMessage,
    compactThreadState,
    sanitizeAgentStructureProposalDoc,
    sanitizeAgentThreadDoc
  })
}));
app.use(buildEntryHistoryRouter({ authenticateToken, EntryRevision }));
app.use(buildWorkNoteRouter({ authenticateToken: authenticateUserOrAgentToken, NotebookEntry, NotebookFolder }));
startWorkProjectErasure({ connection: mongoose.connection, eraseDue: workProjectDeletion({ NotebookEntry, NotebookFolder }).eraseDue });
app.use(buildNotebookRouter({
  authenticateToken: authenticateUserOrAgentToken,
  NotebookEntry,
  EntryRevision,
  NotebookFolder,
  ReferenceEdge,
  ensureNotebookBlocks,
  createBlockId,
  stripHtml,
  normalizeItemType,
  parseClaimId,
  normalizeTags,
  syncNotebookReferences,
  enqueueNotebookEmbedding,
  trackEvent,
  EVENT_NAMES,
  findHighlightById,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiLintRun,
  WikiSourceEvent,
  WikiMaintenanceRun,
  Article,
  TagMeta,
  Question,
  NoeisReceipt
}));
app.use(buildRetiredShareRouter({ SharedNotebook, SharedConcept, TagMeta, WikiPage }));

app.use(buildAuthoredExplorationRouter({
  authenticateToken,
  AuthoredExploration,
  WikiPage,
  Article,
  NotebookEntry,
  Question,
  createBlockId,
  WikiSourceEvent,
  NoeisReceipt,
  ...buildAuthoredKeepEffects({ WikiSourceEvent, enqueueNotebookEmbedding, enqueueQuestionEmbedding })
}));

app.use(buildDailyLoopRouter({
  authenticateToken: authenticateUserOrAgentToken,
  User,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  WikiBriefingCache,
  WikiPageVisit,
  Article,
  NotebookEntry,
  TagMeta,
  Question,
  ImportSession,
  NoeisReceipt,
  Connection,
  Folder,
  ReturnQueueEntry
}));

app.use(buildKnowledgeMovementRouter({
  authenticateToken: authenticateUserOrAgentToken,
  User,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  TagMeta,
  NoeisReceipt,
  Article,
  NotebookEntry,
  Question,
  Connection,
  ReferenceEdge
}));

app.use(buildSystemLoopRouter({
  authenticateToken: authenticateUserOrAgentToken,
  WikiMaintenanceRun,
  WikiBriefingCache,
  MorningPaperDelivery,
  WikiPage,
  NoeisReceipt
}));

app.use(buildDecisionIndexRouter({
  authenticateToken: authenticateUserOrAgentToken,
  WikiPage,
  User,
  Article,
  NotebookEntry,
  Question,
  TagMeta,
  WikiRevision,
  NoeisReceipt
}));

app.use(buildDecisionMutationRouter({
  authenticateToken: authenticateUserOrAgentToken,
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  Article,
  NotebookEntry,
  Question,
  TagMeta
}));

app.use(buildJudgmentResolutionRouter({
  authenticateToken: authenticateUserOrAgentToken,
  Article,
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  trackEvent
}));

app.use(buildLibraryRelevanceRouter({
  authenticateToken: authenticateUserOrAgentToken,
  getFoldersWithCounts,
  Article,
  Folder,
  NotebookEntry,
  TagMeta,
  WikiPage,
  WikiPageVisit,
  WikiRevision,
  WikiSourceEvent,
  NoeisReceipt,
  Connection,
  ReferenceEdge,
  Question,
  VectorItem
}));

app.use(buildReadingLoopRouter({
  authenticateToken: authenticateUserOrAgentToken,
  User,
  Article,
  NotebookEntry,
  Question,
  WikiPage,
  ReadingLoopEdition,
  VectorItem
}));

app.use(buildWikiRouter({
  authenticateToken: authenticateUserOrAgentToken,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  WikiRepoBaseline,
  WikiBriefingCache,
  MorningPaperRecord,
  findHighlightById,
  WikiSharedCollection,
  CasebookLineage,
  WikiSchemaSettings,
  Connection,
  ConnectorActionLog,
  IntegrationConnection,
  ImportSession,
  NoeisReceipt,
  JudgmentResponseDraft,
  Article,
  VectorItem,
  NotebookEntry,
  TagMeta,
  Question,
  createNotionPage: notionClientForAgent.createNotionPage,
  appendNotionBlockChildren: notionClientForAgent.appendNotionBlockChildren,
  updateNotionPageTitle: notionClientForAgent.updateNotionPageTitle,
  decryptSecret: decryptIntegrationSecretForAgent,
  trackEvent,
  EVENT_NAMES
}));


app.use(buildUiTourRouter({
  mongoose,
  authenticateToken,
  UiSettings,
  TourState,
  normalizeUiSettingsScope,
  normalizeUiSettingsPayload,
  buildUiSettingsResponse,
  buildTourStateResponse,
  isTourStateEmpty,
  getOrCreateTourState,
  normalizeTourSignals,
  deriveCompletedStepIdsFromSignals,
  normalizeTourCompletedStepIds,
  normalizeTourStatus,
  normalizeTourCurrentStepId,
  getNextTourStepId,
  TOUR_STEP_IDS,
  TOUR_SIGNAL_DEFAULTS,
  TOUR_EVENT_TIMESTAMP_DEFAULTS,
  TOUR_EVENT_TO_SIGNAL,
  markTourSignal,
  trackReturnVisit
}));

app.use(buildReturnQueueRouter({
  mongoose,
  authenticateToken,
  ReturnQueueEntry,
  normalizeReturnQueueItemType,
  parseDueAt,
  resolveReturnQueueItem,
  buildUnavailableQueueItem,
  trackEvent,
  EVENT_NAMES
}));

app.use(buildConnectionsRouter({
  mongoose,
  authenticateToken,
  Connection,
  NoeisReceipt,
  NotebookEntry,
  Article,
  TagMeta,
  Question,
  WikiPage,
  normalizeConnectionItemType,
  normalizeRelationType,
  resolveConnectionScopeInput,
  resolveConnectionItem,
  buildConnectionScopeQuery,
  buildConnectionScopeCandidates,
  toObjectIdList,
  escapeRegExp,
  buildQueueSnippet,
  isConnectionItemInScopeCandidates,
  parseCsvList,
  buildGraphNodeMap,
  buildGraphNodeKey,
  addToCandidateSet
}));

app.use(buildConceptPathRouter({
  authenticateToken,
  ConceptPath,
  ConceptPathProgress,
  normalizePathItemRefsInput,
  sortPathItemRefs,
  normalizeConceptPathItemType,
  normalizeConceptPathNotes,
  ensureConceptPathOwnership,
  getConceptPathWithProgress,
  resolveConnectionItem
}));

app.use(buildFeedbackHighlightRouter({
  mongoose,
  authenticateToken: authenticateUserOrAgentToken,
  Feedback,
  Article,
  normalizeItemType,
  parseClaimId,
  normalizeTags,
  enqueueHighlightEmbedding,
  mapHighlightWithArticle
}));

const buildSnippet = (text = '', limit = 180) => {
  const clean = stripHtml(text || '');
  if (!clean) return '';
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).trim()}…`;
};

const parseEmbeddingId = (value = '') => {
  const parts = String(value || '').split(':');
  if (parts.length < 3) return {};
  return {
    userId: parts[0],
    objectType: parts[1],
    objectId: parts[2],
    subId: parts[3] || ''
  };
};

const hydrateSemanticResults = async ({ matches = [], userId }) => {
  const safeUserId = String(userId || '');
  const hydrated = await Promise.all(matches.map(async (item) => {
    const meta = item?.metadata || {};
    const parsed = parseEmbeddingId(item?.id || '');
    const rawType = meta.objectType || item.objectType || parsed.objectType || '';
    const objectType = rawType || 'other';
    const objectId = meta.objectId || item.objectId || parsed.objectId || '';
    const blockId = meta.subId || parsed.subId || '';
    const score = item?.score ?? null;
    const base = {
      objectType: objectType === 'notebook_block' ? 'notebook' : objectType,
      objectId: String(objectId || ''),
      score,
      metadata: { ...meta }
    };

    if (objectType === 'article') {
      const article = await Article.findOne({ _id: objectId, userId: safeUserId })
        .select('title content updatedAt');
      if (!article) return null;
      return {
        ...base,
        title: article.title || 'Untitled article',
        snippet: buildSnippet(article.content || ''),
        metadata: { ...base.metadata, updatedAt: article.updatedAt }
      };
    }

    if (objectType === 'highlight') {
      const highlight = await findHighlightById(safeUserId, objectId);
      if (!highlight) return null;
      return {
        ...base,
        title: highlight.text || 'Highlight',
        snippet: highlight.articleTitle || '',
        metadata: {
          ...base.metadata,
          articleId: highlight.articleId,
          articleTitle: highlight.articleTitle,
          tags: highlight.tags || [],
          createdAt: highlight.createdAt
        }
      };
    }

    if (objectType === 'notebook_block') {
      const entry = await NotebookEntry.findOne({ _id: objectId, userId: safeUserId })
        .select('title blocks updatedAt');
      if (!entry) return null;
      const block = entry.blocks?.find((b) => String(b.id) === String(blockId));
      const snippet = item?.document || block?.text || '';
      return {
        ...base,
        title: entry.title || 'Untitled note',
        snippet: buildSnippet(snippet),
        metadata: { ...base.metadata, blockId }
      };
    }

    if (objectType === 'concept') {
      const conceptQuery = mongoose.Types.ObjectId.isValid(objectId)
        ? { _id: objectId, userId: safeUserId }
        : { name: objectId, userId: safeUserId };
      const concept = await TagMeta.findOne(conceptQuery)
        .select('name description updatedAt');
      if (!concept) return null;
      return {
        ...base,
        title: concept.name || 'Concept',
        snippet: buildSnippet(concept.description || ''),
        metadata: { ...base.metadata, name: concept.name }
      };
    }

    if (objectType === 'question') {
      const question = await Question.findOne({ _id: objectId, userId: safeUserId })
        .select('text conceptName linkedTagName updatedAt');
      if (!question) return null;
      return {
        ...base,
        title: question.text || 'Question',
        snippet: question.conceptName || question.linkedTagName || '',
        metadata: { ...base.metadata }
      };
    }

    return null;
  }));

  return hydrated
    .filter(Boolean)
    .map((row) => {
      const sanitizedSnippet = sanitizeRetrievalSnippet(row.snippet);
      const snippet = sanitizedSnippet || row.snippet || '';
      const evidenceTone = classifyQuestionEvidenceTone(`${row.title || ''} ${snippet}`);
      return {
        ...row,
        snippet,
        evidenceTone
      };
    })
    .filter((row) => {
      const combined = `${row.title || ''} ${row.snippet || ''}`.trim();
      if (!combined) return false;
      return !isBoilerplateRetrievalSentence(combined);
    });
};

const toSafeObjectId = (value) => (
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null
);

app.use(buildSearchRetrievalRouter({
  mongoose,
  authenticateToken: authenticateUserOrAgentToken,
  Article,
  NotebookEntry,
  ItemViewEvent,
  Connection,
  TagMeta,
  Question,
  normalizeConnectionItemType,
  resolveConnectionItem,
  escapeRegExp,
  parseCsvList,
  buildQueueSnippet,
  buildGraphNodeMap,
  buildGraphNodeKey,
  addToCandidateSet,
  findHighlightById,
  normalizeItemType
}));

const fetchSimilarEmbeddingsWithAvailability = async ({ userId, sourceId, types, limit }) => {
  const parsed = parseEmbeddingId(String(sourceId || ''));
  const objectType = String(parsed.objectType || '');
  const objectId = String(parsed.objectId || '');
  if (!objectType || !objectId) return { results: [], modelAvailable: true };
  try {
    const rows = await similarToSource({
      userId,
      objectType,
      objectId,
      subId: String(parsed.subId || ''),
      limit,
      types: Array.isArray(types) && types.length ? types : []
    });
    return {
      results: rows.map(row => ({
        id: row.objectId,
        score: row.score,
        metadata: {
          objectType: row.objectType,
          objectId: row.objectId,
          subId: row.subId || '',
          title: row.metadata?.title || '',
          articleId: row.metadata?.articleId || ''
        }
      })),
      modelAvailable: true
    };
  } catch (error) {
    console.warn('[SEARCH] similar lookup failed', { message: String(error.message || error).slice(0, 160) });
    return { results: [], modelAvailable: false };
  }
};

const fetchSimilarEmbeddings = async ({ userId, sourceId, types, limit, requestId }) => {
  const { results } = await fetchSimilarEmbeddingsWithAvailability({
    userId,
    sourceId,
    types,
    limit,
    requestId
  });
  return results;
};

const filterOutIds = (items, type, ids) => {
  if (!ids || ids.size === 0) return items;
  return items.filter(item => {
    if (item.objectType !== type) return true;
    return !ids.has(String(item.objectId));
  });
};

app.use(buildPencilRouter({
  authenticateToken, humanOnly: requireHumanReader, Article, NotebookEntry, Verdict,
  EntryRevision, ReferenceEdge, ArticleReadingState, deleteArticleEmbeddingState, deleteHighlightEmbeddingState
}));

app.use(buildRecallRouter({
  authenticateToken: authenticateUserOrAgentToken,
  Article,
  NotebookEntry,
  TagMeta,
  WikiPage,
  Question,
  Handoff,
  Citation,
  RecallCheck,
  Verdict,
  Disagreement,
  Connection,
  ConnectionJudgment,
  humanOnly: requireHumanReader,
  semanticSearch
}));

app.use(buildHomeRouter({ authenticateToken, Article, ArticleReadingState, Thread, echoOf, formingAround }));
app.use(buildAddedRouter({ authenticateToken: authenticateUserOrAgentToken, ownDesktop: [authenticateCapture, requireHumanOrDesktop], Article, Connection, ConnectionJudgment, Verdict, WikiSourceEvent }));

app.use(buildSyncRouter({
  authenticateToken: authenticateUserOrAgentToken,
  models: { Article, NotebookEntry, WikiPage, Connection }
}));

// What the reader hands the built-in agent is worked at once, and again on waking if the server slept first.
const handoffModels = { Handoff, AgentToken };
const workForNoeis = handoff => workHandoff({ handoffId: handoff._id, models: handoffModels, apiUrl: internalApiUrl })
  .catch(error => console.error('[handoff] built-in agent failed', error.message));
// What an agent wrote for a handoff is held against the views it bears on, and other agents' pencil.
const disagreementModels = { Article, NotebookEntry, TagMeta, WikiPage, Question, Disagreement };
const checkWhatItWrote = ({ handoff, wrote }) => checkDisagreements({ userId: handoff.userId, agent: handoff.takenBy.agent, wrote, models: disagreementModels, semanticSearch })
  .catch(error => console.error('[disagreements] check failed', error.message));
app.use(buildHandoffRouter({ authenticateToken: authenticateUserOrAgentToken, humanOnly: requireHumanReader, Handoff, Article, NotebookEntry, onHandedToNoeis: workForNoeis, onFinished: checkWhatItWrote }));
app.use(buildDisagreementRouter({ authenticateToken: authenticateUserOrAgentToken, humanOnly: requireHumanReader, Disagreement }));
app.use(buildMuseumRouter({ auth: authenticateUserOrAgentToken, humanOnly: requireHumanReader, Museum, Article, WikiPage, NotebookEntry }));

app.use(buildSemanticSearchRouter({
  authenticateToken,
  parseCsvList,
  normalizeConnectionItemType,
  fetchSimilarEmbeddingsWithAvailability,
  hydrateSemanticResults,
  findHighlightById,
  resolveConceptByParam,
  buildEmbeddingId,
  EmbeddingError,
  sendEmbeddingError
}));

app.use(buildTagTemplateRouter({
  mongoose,
  authenticateToken,
  Article,
  listWorkspaceTemplates,
  getWorkspaceTemplateById,
  normalizeConceptNameInput,
  createBlockId,
  decodeTemplateText,
  NotebookEntry,
  normalizeTags,
  syncNotebookReferences,
  enqueueNotebookEmbedding,
  TagMeta,
  escapeRegExp,
  ensureWorkspace,
  toSafeObjectId,
  ReferenceEdge
}));

app.use(buildConceptMetaRouter({
  authenticateToken: authenticateUserOrAgentToken,
  getConcepts,
  getConceptMeta,
  updateConceptMeta,
  getConceptRelated,
  TagMeta,
  WikiPage,
  User,
  EntryRevision,
  conceptReferences: { Article, NotebookEntry, Question, ConceptNote, ReferenceEdge, SharedConcept, ConceptPath, Connection, ReturnQueueEntry },
  escapeRegExp,
  trackEvent,
  EVENT_NAMES
}));




app.use(buildWikiClaimDispositionRouter({
  authenticateToken: authenticateUserOrAgentToken,
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  TagMeta,
  Article,
  NotebookEntry,
  Question,
  WikiSourceEvent
}));

app.use(buildSharedQuestionRouter({
  authenticateToken,
  optionalAuthenticateToken,
  SharedQuestion,
  QuestionContribution,
  QuestionPresence,
  Question,
  User
}));

app.use(buildAgentNotionFetchRouter({
  authenticateToken,
  fetchNotionPagesForAgent,
  notionClient: notionClientForAgent,
  notionTransform: notionTransformForAgent,
  IntegrationConnection,
  NotebookEntry,
  WikiSourceEvent,
  WikiPage,
  WikiRevision,
  WikiMaintenanceRun,
  Article,
  TagMeta,
  Question,
  ConnectorActionLog,
  decryptSecret: decryptIntegrationSecretForAgent
}));

app.use(buildConceptMaterialRouter({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry,
  resolveConceptByParam
}));

app.use(buildAgentSettingsRouter({
  authenticateToken,
  getUserAgentEntitlements,
  normalizeUserAgentProfile,
  User,
  deriveAgentEntitlements,
  getUserAgentProtocolPolicy,
  normalizeAgentProtocolPolicy,
  toStoredAgentProtocolPolicy,
  sanitizeAgentProtocolPolicy
}));

app.use(buildPersonalAgentRouter({
  mongoose,
  authenticateToken,
  PersonalAgent,
  sanitizePersonalAgent,
  normalizePersonalAgentCapabilities,
  normalizePersonalAgentWorkerRoles,
  createPersonalAgentApiKey,
  hashPersonalAgentApiKey,
  normalizePersonalAgentStatus
}));

/* The newsstand. The write path takes an agent token, because the whole
   point is that the reader's own agent — Claude, Codex, Cursor, OpenClaw,
   Hermes — maintains the paper. Taking a source into the library and throwing
   an edition away stay human: an agent that could do either could quietly
   rewrite what it told you last week. */
app.use(buildEditionThoughtRouter({ auth: authenticateUserOrAgentToken, humanOnly: requireHumanReader, Edition, Note }));
app.use(buildArticleReadingStateRouter({ auth: authenticateUserOrAgentToken, humanOnly: requireHumanReader, ownDesktop: [authenticateCapture, requireHumanOrDesktop], Article, ArticleReadingState }));
app.use(buildLibraryCollectionRouter({ auth: authenticateUserOrAgentToken, humanOnly: requireHumanOrDesktop, mongoose, Article, ArticleReadingState }));
app.use(buildReadingRoomRouter({ auth: authenticateUserOrAgentToken, humanOnly: requireHumanReader, mongoose, Article, ArticleReadingState }));

app.use(buildEditionRouter({
  auth: authenticateUserOrAgentToken,
  humanOnly: requireHumanReader,
  Edition,
  EditionProfile,
  Article,
  SharedEdition,
  User,
  onArticleSaved: (article) => {
    const queued = enqueueArticleEmbedding(article);
    if (typeof queued?.catch === 'function') {
      queued.catch(error => console.error('Failed queueing article embedding:', error));
    }
  }
}));

app.use(buildAgentTokenRouter({
  mongoose,
  authenticateToken,
  authenticateConnection: authenticateUserOrAgentToken,
  AgentToken,
  OAuthGrant: ChatgptOAuthGrant,
  ConnectorActionLog,
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken
}));

app.use(buildChatgptOAuthRouter({
  config: chatgptOAuthConfig, authenticateToken, isAccountActive,
  Request: ChatgptOAuthRequest, Grant: ChatgptOAuthGrant, Client: ChatgptOAuthClient, AgentToken,
  isReady: chatgptOAuthReadiness?.isReady
}));
app.use(buildHostedMcpRouter({
  authenticateAgentToken: authenticateMcpToken,
  internalApiUrl: chatgptOAuthConfig?.internalApiUrl || internalApiUrl,
  resourceMetadataUrl: chatgptOAuthConfig ? `${chatgptOAuthConfig.issuer}/.well-known/oauth-protected-resource` : null
}));

app.use(buildAgentConnectRouter({
  authenticateToken,
  AgentConnectSession,
  AgentToken,
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes
}));

app.use(buildAgentTaskLinkRouter({
  mongoose,
  authenticateToken,
  AgentTaskLink,
  PersonalAgent,
  AgentHandoff,
  AgentThread,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  buildAgentPlanner,
  createThreadForHandoff,
  appendHandoffEvent,
  sanitizeAgentHandoffDoc,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority
}));

app.use(buildAgentThreadRouter({
  mongoose,
  authenticateToken,
  authenticatePersonalAgentKey,
  AgentThread,
  AgentHandoff,
  normalizePersonalAgentCapabilities,
  normalizeThreadScope,
  normalizeThreadStatus,
  normalizeThreadPlan,
  normalizeThreadCheckpoint,
  normalizeThreadPlanner,
  normalizeThreadMessage,
  sanitizeAgentThreadDoc,
  appendThreadMessage,
  compactThreadState,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority,
  resolveAndValidateActorIdentity,
  getUserAgentProtocolPolicy,
  resolveAutoHandoffRequestedActor,
  shouldRequireProtocolApproval,
  requestProtocolApproval,
  triggerProtocolHookPhase,
  sanitizeAgentHandoffDoc,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  buildAgentPlanner,
  appendHandoffEvent,
  truncate: truncateThreadText
}));

app.use(buildAgentBridgeRouter({
  authenticateToken,
  authenticateAgentBridgeToken,
  resolveAndValidateActorIdentity,
  safeBridgeTokenTtlSeconds,
  DEFAULT_BRIDGE_TOKEN_TTL_SECONDS,
  createSignedBridgeToken,
  runBridgeHandoffOperation,
  listAgentSkills,
  listWorkerRoles,
  listProtocolApprovals,
  approveProtocolApproval,
  rejectProtocolApproval
}));

app.use(buildAgentHandoffRouter({
  mongoose,
  authenticateToken,
  authenticatePersonalAgentKey,
  normalizeHandoffPayload,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority,
  parseOptionalDate,
  resolveAndValidateActorIdentity,
  AgentHandoff,
  AgentThread,
  sanitizeAgentHandoffDoc,
  sanitizeAgentThreadDoc,
  AGENT_HANDOFF_STATUSES,
  AGENT_HANDOFF_TASK_TYPES,
  normalizeAgentActorType,
  safeAgentHandoffLimit,
  getUserAgentProtocolPolicy,
  resolveAutoHandoffRequestedActor,
  shouldRequireProtocolApproval,
  requestProtocolApproval,
  triggerProtocolHookPhase,
  canActorMutateClaimedHandoff,
  canActorClaimHandoff,
  appendHandoffEvent,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  buildAgentPlanner,
  createThreadForHandoff,
  normalizeThreadCheckpoint,
  appendThreadMessage
}));

app.use(buildAgentActionRouter({
  authenticateToken,
  authenticatePersonalAgentKey,
  resolveConceptByParam,
  executeWorkspaceActionsWithPolicy,
  normalizeAgentActionFlow,
  normalizeAgentActorType,
  listActionApprovals,
  approveActionApproval,
  rejectActionApproval,
  undoLastWorkspaceAction,
  listSoftDeleteRecords,
  AGENT_DELETE_RETENTION_DAYS,
  restoreSoftDeletedWorkspaceItem
}));

app.use(buildAgentRunRouter({
  mongoose,
  authenticateToken,
  AgentRun,
  AgentThread,
  AgentHandoff,
  AgentProtocolApproval,
  AgentProposedChange,
  AgentStructureProposal,
  Folder,
  Article,
  NotebookFolder,
  TagMeta,
  NotebookEntry,
  createRunFromProposalBundle,
  executeAgentRun,
  applyProposalBundleRunOutcome,
  createProposedChangesForRun,
  requestRunStepApproval,
  reconcileAgentRunState,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc,
  sanitizeAgentRunDoc,
  sanitizeAgentThreadDoc,
  trackEvent,
  EVENT_NAMES
}));

app.use(buildAgentProposedChangeRouter({
  authenticateToken,
  AgentRun,
  AgentProposedChange,
  TagMeta,
  NotebookEntry,
  updateProposedChangeDraft,
  acceptProposedChange,
  rejectProposedChange,
  rollbackProposedChange,
  reconcileAgentRunState,
  sanitizeAgentProposedChangeDoc,
  trackEvent,
  EVENT_NAMES
}));

app.use(buildAgentStructureProposalRouter({
  authenticateToken,
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  NotebookFolder,
  NotebookEntry,
  Folder,
  Article,
  listStructureProposals,
  updateStructureProposalDraft,
  applyStoredStructureProposal,
  rejectStructureProposal,
  rollbackStoredStructureProposal,
  reconcileAgentRunState,
  sanitizeAgentStructureProposalDoc,
  trackEvent,
  EVENT_NAMES
}));

const { getAgentWriteBoundarySummary } = require('./services/agentWriteBoundarySummary');
app.use(buildAgentWriteBoundaryRouter({
  authenticateToken,
  WorkingMemoryItem,
  AgentStructureProposal,
  getAgentWriteBoundarySummary
}));


app.use(buildAgentChatRouter({
  authenticateToken,
  authenticatePersonalAgentKey,
  getUserAgentEntitlements,
  generateCollaborativeReply,
  normalizePersonalAgentCapabilities,
  mongoose,
  AgentThread,
  AgentRun,
  AgentHandoff,
  AgentProtocolApproval,
  AgentProposedChange,
  AgentStructureProposal,
  Folder,
  Article,
  NotebookFolder,
  TagMeta,
  NotebookEntry,
  normalizeThreadScope,
  appendThreadMessage,
  compactThreadState,
  normalizeThreadPlanner,
  sanitizeAgentThreadDoc,
  sanitizeAgentRunDoc,
  createRunFromProposalBundle,
  executeAgentRun,
  applyProposalBundleRunOutcome,
  createProposedChangesForRun,
  requestRunStepApproval,
  reconcileAgentRunState,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc,
  resolveRequestedProposalBundle,
  applyProposalBundleInvalidations,
  sanitizeAgentStructureProposalDoc,
  planLibraryStructureProposal,
  persistLibraryStructureProposal,
  threadMessagesToHistory,
  truncate: truncateThreadText,
  trackEvent,
  EVENT_NAMES
}));




app.use(buildConceptSuggestionRouter({
  mongoose,
  authenticateToken,
  TagMeta,
  buildEmbeddingId,
  fetchSimilarEmbeddings,
  hydrateSemanticResults,
  EmbeddingError,
  sendEmbeddingError
}));

app.use(buildConceptPinRouter({
  mongoose,
  authenticateToken: authenticateUserOrAgentToken,
  TagMeta,
  markTourSignal
}));

app.use(buildTagInsightRouter({
  mongoose,
  authenticateToken,
  Article,
  TagMeta
}));

app.use(buildConceptQuestionBoardRouter({
  mongoose,
  authenticateToken: authenticateUserOrAgentToken,
  EntryRevision,
  Article,
  NotebookEntry,
  ReferenceEdge,
  ConceptNote,
  Question,
  WikiPage,
  enqueueQuestionEmbedding,
  findHighlightById,
  createBlockId,
  normalizeBoardScopeType,
  normalizeBoardScopeId,
  TagMeta,
  Board,
  BoardItem,
  BoardEdge,
  ensureBoardOwnership,
  normalizeBoardItemType,
  normalizeBoardItemRole,
  resolveBoardItemPayload,
  normalizeBoardNumber,
  normalizeBoardRelation
}));

app.use(buildSemanticReferenceRouter({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry,
  Collection,
  ConceptNote,
  Question,
  TagMeta,
  buildEmbeddingId,
  fetchSimilarEmbeddings,
  hydrateSemanticResults,
  filterOutIds,
  EmbeddingError,
  sendEmbeddingError
}));

app.use(buildReferenceBacklinkRouter({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry,
  Collection,
  ReferenceEdge,
  TagMeta,
  Question,
  buildNotebookBlocksFromEdges,
  loadNotebookBacklinks
}));

app.use(buildImportSessionRouter({
  authenticateToken,
  ImportSession
}));

const importRouter = buildImportRouter({
  authenticateToken,
  authenticateCapture,
  isAccountActive,
  upload,
  slugify,
  Article,
  Folder,
  trackEvent,
  EVENT_NAMES,
  crypto,
  TagMeta,
  NotebookEntry,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  ConnectorActionLog,
  Question,
  AgentStructureProposal,
  ImportSession,
  IntegrationConnection,
  NoeisReceipt,
  syncNotebookReferences,
  enqueueArticleEmbedding,
  enqueueHighlightEmbedding,
  enqueueNotebookEmbedding,
  User
});
app.use(importRouter);

startReadwiseSync(importRouter.syncReadwiseConnection);

app.use(buildExportPublicRouter({
  mongoose,
  authenticateToken,
  NotebookEntry,
  SharedQuestion,
  createBlockId,
  ensureNotebookBlocks,
  buildNotebookMarkdown,
  slugify,
  TagMeta,
  getConceptMeta,
  getConceptRelated,
  Question,
  buildConceptMarkdown
}));

app.use(buildBulkExportRouter({
  authenticateToken,
  Article,
  NotebookEntry,
  Collection,
  TagMeta,
  SavedView
}));

app.use(buildHighlightMutationRouter({
  mongoose,
  authenticateToken: authenticateUserOrAgentToken,
  authenticateCapture,
  Article,
  normalizeTags,
  enqueueHighlightEmbedding,
  deleteHighlightEmbeddingState,
  markTourSignal,
  normalizeItemType,
  parseClaimId,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  NotebookEntry,
  TagMeta,
  Question
}));

app.use(buildAiMaintenanceRouter({ authenticateToken, EmbeddingJob }));

app.use(buildSystemRouter({
  authenticateToken,
  isDatabaseReady: () => mongoose.connection.readyState === 1,
  getWikiStorageStatus: () => readWikiStorageStatus(mongoose.connection.db),
  allowDebugFixtures: process.env.NODE_ENV !== 'production',
  IntegrationConnection,
  ImportSession,
  NotebookFolder,
  NotebookEntry,
  AgentThread,
  AgentStructureProposal,
  Article,
  WikiPage,
  Connection,
  Question
}));

startServer({ app, port: PORT });

const resumeBuiltInHandoffs = () => resumeHandoffs({ models: handoffModels, apiUrl: internalApiUrl })
  .catch(error => console.error('[handoff] resume failed', error.message));
// Last week's "What your agents read" is filed once the week is over, checked hourly while awake.
const fileAgentsReading = () => fileAgentsReadingEditions({ models: { Article, Edition, AgentToken }, apiUrl: internalApiUrl })
  .catch(error => console.error('[agents-reading] editions failed', error.message));
const wakeBuiltInAgent = () => {
  resumeBuiltInHandoffs();
  fileAgentsReading();
  setInterval(fileAgentsReading, 60 * 60 * 1000).unref?.();
};
whenConnected(wakeBuiltInAgent);
