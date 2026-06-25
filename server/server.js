const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { serializeHighlightWithArticle } = require('./utils/highlightUtils');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const multer = require('multer');
const Papa = require('papaparse');
const path = require('path');
const crypto = require('crypto');
const {
  ensureWorkspace,
  applyPatchOp,
  validateWorkspacePayload
} = require('./utils/workspaceUtils');
const { checkHealth } = require('./ai/ollamaClient');
const {
  enqueueArticleEmbedding,
  enqueueHighlightEmbedding,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding,
  drainEmbeddingJobQueue
} = require('./ai/embeddingJobs');
const { EVENT_NAMES, trackEvent } = require('./utils/analytics');
const { EmbeddingError } = require('./ai/embed');
const { enqueueBrainSummary, registerBrainSummaryHandler } = require('./ai/brainSummaryJobs');
const {
  isAiEnabled,
  upsertEmbeddings,
  deleteEmbeddings,
  semanticSearch: aiSemanticSearch,
  similarTo: aiSimilarTo,
  getEmbeddings: aiGetEmbeddings,
  embedTexts: aiEmbedTexts,
  checkUpstreamHealth
} = require('./config/aiClient');
const { buildEmbeddingId } = require('./ai/embeddingTypes');
const { buildConnectionScopeQuery } = require('./utils/connectionScopeQuery');
const {
  sanitizeRetrievalSnippet,
  classifyQuestionEvidenceTone,
  isBoilerplateRetrievalSentence
} = require('./utils/retrievalSanitizer');
const {
  highlightToEmbeddingItem,
  articleToEmbeddingItems,
  notebookEntryToEmbeddingItems,
  conceptToEmbeddingItem,
  questionToEmbeddingItem
} = require('./ai/mappers');
const { isGenerationEnabled, generateDraftInsights } = require('./ai/generation');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  console.log(`[REQ] ${requestId} ${req.method} ${req.originalUrl}`);
  next();
});

app.use(cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

mongoose.connect(process.env.MONGODB_URI) // useNewUrlParser and useUnifiedTopology are deprecated in recent Mongoose versions
  .then(() => console.log("✅ MongoDB connected successfully."))
  .catch(err => console.error("❌ MongoDB connection error:", err));

const {
  User,
  Feedback,
  Recommendation,
  Folder,
  Article,
  Note,
  NotebookEntry,
  NotebookFolder,
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
  ItemViewEvent,
  ConceptPath,
  ConceptPathProgress,
  BrainSummary,
  PersonalAgent,
  AgentToken,
  AgentConnectSession,
  AgentTaskLink,
  AgentThread,
  AgentActionApproval,
  AgentProtocolApproval,
  AgentProtocolHookRun,
  AgentActionAudit,
  AgentSoftDeleteRecord,
  AgentHandoff,
  AgentArtifactDraft,
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  AgentUpkeepCycle,
  ReferenceEdge,
  SavedView,
  Collection,
  IntegrationConnection,
  ImportSession,
  EmbeddingJob,
  SharedConcept,
  SharedQuestion,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiLintRun,
  WikiSourceEvent,
  WikiMaintenanceRun,
  WikiSharedCollection,
  ConnectorActionLog,
  dropLegacyConnectionIndex
} = require('./models/index');
const { drainWikiSourceEventQueue } = require('./services/wikiSourceEventWorker');
const { drainScheduledWikiMaintenance } = require('./services/wikiScheduledMaintenanceWorker');

if (mongoose.connection.readyState === 1) {
  dropLegacyConnectionIndex();
} else {
  mongoose.connection.once('open', () => {
    dropLegacyConnectionIndex();
  });
}

let wikiSourceEventWorkerTimer = null;
let wikiSourceEventWorkerRunning = false;
let wikiScheduledMaintenanceTimer = null;
let wikiScheduledMaintenanceRunning = false;
let embeddingJobWorkerTimer = null;
let embeddingJobWorkerRunning = false;

const runWikiSourceEventWorker = async () => {
  if (wikiSourceEventWorkerRunning || mongoose.connection.readyState !== 1) return;
  wikiSourceEventWorkerRunning = true;
  try {
    const result = await drainWikiSourceEventQueue({
      models: {
        WikiSourceEvent,
        WikiPage,
        WikiProposal,
        WikiRevision,
        WikiMaintenanceRun,
        Connection,
        Article,
        NotebookEntry,
        TagMeta,
        Question
      },
      limit: Number(process.env.WIKI_SOURCE_EVENT_WORKER_BATCH_SIZE || 10),
      perUserLimit: Number(process.env.WIKI_SOURCE_EVENT_WORKER_PER_USER || 3)
    });
    if (result.processed || result.failed) {
      console.log(`[wiki-worker] processed=${result.processed} failed=${result.failed}`);
    }
  } catch (error) {
    console.error('[wiki-worker] failed to drain source events:', error);
  } finally {
    wikiSourceEventWorkerRunning = false;
  }
};

const startWikiSourceEventWorker = () => {
  if (process.env.WIKI_SOURCE_EVENT_WORKER_DISABLED === 'true' || wikiSourceEventWorkerTimer) return;
  const intervalMs = Math.max(15000, Number(process.env.WIKI_SOURCE_EVENT_WORKER_INTERVAL_MS || 60000));
  wikiSourceEventWorkerTimer = setInterval(runWikiSourceEventWorker, intervalMs);
  runWikiSourceEventWorker();
};

if (mongoose.connection.readyState === 1) {
  startWikiSourceEventWorker();
} else {
  mongoose.connection.once('open', startWikiSourceEventWorker);
}

const runEmbeddingJobWorker = async () => {
  if (!isAiEnabled() || embeddingJobWorkerRunning || mongoose.connection.readyState !== 1) return;
  embeddingJobWorkerRunning = true;
  try {
    const result = await drainEmbeddingJobQueue({
      model: EmbeddingJob,
      limit: Number(process.env.EMBEDDING_JOB_WORKER_BATCH_SIZE || 5)
    });
    if (result.processed || result.failed) {
      console.log(`[embedding-worker] processed=${result.processed} failed=${result.failed}`);
    }
  } catch (error) {
    console.error('[embedding-worker] failed:', error);
  } finally {
    embeddingJobWorkerRunning = false;
  }
};

const startEmbeddingJobWorker = () => {
  if (!isAiEnabled() || process.env.EMBEDDING_JOB_WORKER_DISABLED === 'true' || embeddingJobWorkerTimer) return;
  const intervalMs = Math.max(15000, Number(process.env.EMBEDDING_JOB_WORKER_INTERVAL_MS || 60000));
  embeddingJobWorkerTimer = setInterval(runEmbeddingJobWorker, intervalMs);
  runEmbeddingJobWorker();
};

if (mongoose.connection.readyState === 1) {
  startEmbeddingJobWorker();
} else {
  mongoose.connection.once('open', startEmbeddingJobWorker);
}

const runWikiScheduledMaintenance = async () => {
  if (wikiScheduledMaintenanceRunning || mongoose.connection.readyState !== 1) return;
  wikiScheduledMaintenanceRunning = true;
  try {
    const result = await drainScheduledWikiMaintenance({
      models: {
        WikiPage,
        WikiRevision,
        WikiMaintenanceRun,
        Connection,
        Article,
        NotebookEntry,
        TagMeta,
        Question
      },
      limit: Number(process.env.WIKI_SCHEDULED_MAINTENANCE_BATCH_SIZE || 3),
      maxAgeMs: Number(process.env.WIKI_SCHEDULED_MAINTENANCE_MAX_AGE_MS || 24 * 60 * 60 * 1000)
    });
    if (result.processed || result.failed) {
      console.log(`[wiki-scheduled-maintenance] processed=${result.processed} failed=${result.failed}`);
    }
  } catch (error) {
    console.error('[wiki-scheduled-maintenance] failed:', error);
  } finally {
    wikiScheduledMaintenanceRunning = false;
  }
};

const startWikiScheduledMaintenance = () => {
  if (process.env.WIKI_SCHEDULED_MAINTENANCE_DISABLED === 'true' || wikiScheduledMaintenanceTimer) return;
  const intervalMs = Math.max(
    15 * 60 * 1000,
    Number(process.env.WIKI_SCHEDULED_MAINTENANCE_INTERVAL_MS || 6 * 60 * 60 * 1000)
  );
  wikiScheduledMaintenanceTimer = setInterval(runWikiScheduledMaintenance, intervalMs);
  if (process.env.WIKI_SCHEDULED_MAINTENANCE_RUN_ON_START === 'true') {
    runWikiScheduledMaintenance();
  }
};

if (mongoose.connection.readyState === 1) {
  startWikiScheduledMaintenance();
} else {
  mongoose.connection.once('open', startWikiScheduledMaintenance);
}
const { buildFolderService } = require('./services/folderService');
const { getFoldersWithCounts } = buildFolderService({ Folder, Article, mongoose });
const { buildNotebookRouter } = require('./routes/notebookRoutes');
const { buildWikiRouter } = require('./routes/wikiRoutes');
const { buildWorkingMemoryRouter } = require('./routes/workingMemoryRoutes');
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
const { buildTagTemplateRouter } = require('./routes/tagTemplateRoutes');
const { buildConceptMetaRouter } = require('./routes/conceptMetaRoutes');
const { buildSharedConceptRouter } = require('./routes/sharedConceptRoutes');
const { buildSharedQuestionRouter } = require('./routes/sharedQuestionRoutes');
const { buildConceptMaterialRouter } = require('./routes/conceptMaterialRoutes');
const { buildAgentNotionFetchRouter } = require('./routes/agentNotionFetchRoutes');
const { fetchNotionPagesForAgent } = require('./services/agentTools/notionFetchTool');
const notionClientForAgent = require('./services/import/notionClient');
const notionTransformForAgent = require('./services/import/notionTransform');
const { decryptSecret: decryptIntegrationSecretForAgent } = require('./utils/integrationSecrets');
const { buildAgentSettingsRouter } = require('./routes/agentSettingsRoutes');
const { buildPersonalAgentRouter } = require('./routes/personalAgentRoutes');
const { buildAgentTokenRouter } = require('./routes/agentTokenRoutes');
const { buildAgentBridgeRouter } = require('./routes/agentBridgeRoutes');
const { buildAgentConnectRouter } = require('./routes/agentConnectRoutes');
const { buildAgentTaskLinkRouter } = require('./routes/agentTaskLinkRoutes');
const { buildAgentThreadRouter } = require('./routes/agentThreadRoutes');
const { buildAgentHandoffRouter } = require('./routes/agentHandoffRoutes');
const { buildAgentActionRouter } = require('./routes/agentActionRoutes');
const { buildAgentRunRouter } = require('./routes/agentRunRoutes');
const { buildAgentProposedChangeRouter } = require('./routes/agentProposedChangeRoutes');
const { buildAgentStructureProposalRouter } = require('./routes/agentStructureProposalRoutes');
const { buildAgentChatRouter } = require('./routes/agentChatRoutes');
const { buildAgentArtifactDraftRouter } = require('./routes/agentArtifactDraftRoutes');
const {
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken,
  buildAuthenticateAgentToken,
  AGENT_TOKEN_PREFIX
} = require('./services/agentTokenService');
const { buildAgentHarnessMetricsRouter } = require('./routes/agentHarnessMetricsRoutes');
const { buildAgentWriteBoundaryRouter } = require('./routes/agentWriteBoundaryRoutes');
const { buildAgentMemoryApprovalRouter } = require('./routes/agentMemoryApprovalRoutes');
const { buildAgentUpkeepCycleRouter } = require('./routes/agentUpkeepCycleRoutes');
const { getAgentOutcomeTelemetrySnapshot } = require('./services/agentOutcomeTelemetry');
const {
  createMemoryCommitApproval,
  executeMemoryCommitApproval,
  MEMORY_APPROVAL_OP
} = require('./services/agentMemoryApprovals');
const { buildConceptAgentRouter } = require('./routes/conceptAgentRoutes');
const { buildConceptWorkspaceRouter } = require('./routes/conceptWorkspaceRoutes');
const { buildConceptLayoutRouter } = require('./routes/conceptLayoutRoutes');
const { buildConceptSuggestionRouter } = require('./routes/conceptSuggestionRoutes');
const { buildConceptPinRouter } = require('./routes/conceptPinRoutes');
const { buildAiInsightsRouter } = require('./routes/aiInsightsRoutes');
const { buildTagInsightRouter } = require('./routes/tagInsightRoutes');
const { buildConceptQuestionBoardRouter } = require('./routes/conceptQuestionBoardRoutes');
const { buildSemanticReferenceRouter } = require('./routes/semanticReferenceRoutes');
const { buildReferenceBacklinkRouter } = require('./routes/referenceBacklinkRoutes');
const { buildSavedViewRouter } = require('./routes/savedViewRoutes');
const { buildTodayRouter } = require('./routes/todayRoutes');
const { buildImportRouter } = require('./routes/importRoutes');
const { buildImportSessionRouter } = require('./routes/importSessionRoutes');
const { buildExportPublicRouter } = require('./routes/exportPublicRoutes');
const { buildBulkExportRouter } = require('./routes/bulkExportRoutes');
const { buildReflectionRouter } = require('./routes/reflectionRoutes');
const { buildCollectionRouter } = require('./routes/collectionRoutes');
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
const { buildConceptService } = require('./services/conceptService');
const { getConcepts, getConceptMeta, updateConceptMeta, getConceptRelated } = buildConceptService({
  Article,
  TagMeta,
  NotebookEntry,
  ReferenceEdge,
  mongoose
});
const { buildReflectionService } = require('./services/reflectionService');
const { getReflections } = buildReflectionService({
  Article,
  NotebookEntry,
  Question,
  TagMeta,
  mongoose
});
const {
  buildConceptWorkspace,
  createConceptSuggestionDraft,
  getConceptSuggestionDrafts,
  mutateConceptSuggestionDraft
} = require('./services/conceptAgentService');
const { generateCollaborativeReply } = require('./services/collaborativeAgentService');
const { listAgentSkills } = require('./services/agentSkillCatalog');
const {
  buildAgentPlanner,
  inferWorkerRole,
  listWorkerRoles,
  normalizeWorkerRole,
  sanitizeAgentPlanner
} = require('./services/agentWorkerRoles');
const {
  sanitizeAgentArtifactDraftDoc,
  createAgentArtifactDraftFromSkillReply,
  createAgentArtifactDraftRecord,
  promoteAgentArtifactDraftRecord
} = require('./services/agentArtifactDrafts');
const {
  sanitizeAgentRunDoc,
  createRunFromProposalBundle,
  applyProposalBundleRunOutcome
} = require('./services/agentRuns');
const {
  executeAgentRun
} = require('./services/agentRunExecution');
const {
  trackHarnessEvent,
  trackRunLifecycleEvents
} = require('./services/agentHarnessEvents');
const {
  requestRunStepApproval
} = require('./services/agentRunProtocolApprovals');
const {
  shouldResolveExecutionIntent,
  resolveExecutableProposalBundle,
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
  getAgentHarnessMetricsSnapshot
} = require('./services/agentHarnessMetrics');
const {
  getAgentHarnessRunHistorySnapshot
} = require('./services/agentHarnessRunArtifacts');
const {
  buildMarketingFunnelSnapshot,
  buildMarketingFunnelSeries
} = require('./services/marketingFunnelMetrics');
const {
  dismissBlockedRunStep,
  reconcileAgentRunState
} = require('./services/agentRunReviewState');
const {
  normalizeActor: normalizeThreadActor,
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
const { logAgentMetric, getAgentMetricsSnapshot } = require('./utils/agentMetrics');

registerBrainSummaryHandler({ Article, BrainSummary });

const createBlockId = () => (
  (crypto.randomUUID ? crypto.randomUUID() : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`)
);

const ITEM_TYPES = new Set(['claim', 'evidence', 'note']);

const normalizeItemType = (value, fallback = 'note') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (ITEM_TYPES.has(candidate)) return candidate;
  return fallback;
};

const normalizeTags = (input) => {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const output = [];
  input.forEach(tag => {
    const value = String(tag || '').trim();
    if (!value || seen.has(value.toLowerCase())) return;
    seen.add(value.toLowerCase());
    output.push(value);
  });
  return output.slice(0, 40);
};

const AGENT_ACTOR_TYPES = new Set(['user', 'native_agent', 'byo_agent']);
const AGENT_ACTION_FLOWS = new Set(['direct', 'cleanup', 'restructure']);
const PERSONAL_AGENT_STATUSES = new Set(['active', 'disabled']);
const AGENT_HANDOFF_STATUSES = new Set(['pending', 'claimed', 'completed', 'rejected', 'cancelled']);
const AGENT_HANDOFF_TASK_TYPES = new Set(['research', 'synthesis', 'restructure', 'qa', 'custom']);
const AGENT_HANDOFF_PRIORITIES = new Set(['low', 'normal', 'high']);
const MAX_AGENT_HANDOFF_LIST_LIMIT = 120;
const AGENT_PROTOCOL_ROUTING_MODES = new Set(['balanced', 'native_first', 'byo_first']);
const AGENT_BRIDGE_TOKEN_KIND = 'agent_bridge';
const DEFAULT_BRIDGE_TOKEN_TTL_SECONDS = 30 * 60;
const MAX_BRIDGE_TOKEN_TTL_SECONDS = 2 * 60 * 60;

const normalizeAgentActorType = (value, fallback = 'native_agent') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_ACTOR_TYPES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentActionFlow = (value, fallback = 'direct') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_ACTION_FLOWS.has(candidate)) return candidate;
  return fallback;
};

const normalizePersonalAgentStatus = (value, fallback = 'active') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (PERSONAL_AGENT_STATUSES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentHandoffStatus = (value, fallback = 'pending') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_HANDOFF_STATUSES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentHandoffTaskType = (value, fallback = 'custom') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_HANDOFF_TASK_TYPES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentHandoffPriority = (value, fallback = 'normal') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_HANDOFF_PRIORITIES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentProtocolRoutingMode = (value, fallback = 'balanced') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_PROTOCOL_ROUTING_MODES.has(candidate)) return candidate;
  return fallback;
};

const createPersonalAgentApiKey = () => (
  `ntk_ag_${crypto.randomBytes(24).toString('hex')}`
);

const hashPersonalAgentApiKey = (value) => (
  crypto.createHash('sha256').update(String(value || '')).digest('hex')
);

const PERSONAL_AGENT_DEFAULT_CAPABILITIES = Object.freeze({
  read: true,
  search: true,
  proposeChanges: true,
  executeWrites: true,
  executeDeletes: true
});
const WORKER_ROLE_VALUES = new Set(
  listWorkerRoles().map((entry) => String(entry?.role || '').trim().toLowerCase()).filter(Boolean)
);

const normalizePersonalAgentCapabilities = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    read: source.read !== undefined ? Boolean(source.read) : PERSONAL_AGENT_DEFAULT_CAPABILITIES.read,
    search: source.search !== undefined ? Boolean(source.search) : PERSONAL_AGENT_DEFAULT_CAPABILITIES.search,
    proposeChanges: source.proposeChanges !== undefined
      ? Boolean(source.proposeChanges)
      : PERSONAL_AGENT_DEFAULT_CAPABILITIES.proposeChanges,
    executeWrites: source.executeWrites !== undefined
      ? Boolean(source.executeWrites)
      : PERSONAL_AGENT_DEFAULT_CAPABILITIES.executeWrites,
    executeDeletes: source.executeDeletes !== undefined
      ? Boolean(source.executeDeletes)
      : PERSONAL_AGENT_DEFAULT_CAPABILITIES.executeDeletes
  };
};

const normalizePersonalAgentWorkerRoles = (input = []) => {
  const source = Array.isArray(input) ? input : [input];
  const seen = new Set();
  return source
    .map((value) => normalizeWorkerRole(value))
    .filter((value) => value && WORKER_ROLE_VALUES.has(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, 4);
};

const USER_AGENT_PREMIUM_TIERS = new Set(['free', 'premium']);

const normalizeUserPremiumTier = (value, fallback = 'free') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (USER_AGENT_PREMIUM_TIERS.has(candidate)) return candidate;
  return fallback;
};

const normalizeUserAgentProfile = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    premiumTier: normalizeUserPremiumTier(source.premiumTier, 'free'),
    webResearchEnabled: Boolean(source.webResearchEnabled),
    webResearchBetaEnabled: Boolean(source.webResearchBetaEnabled)
  };
};

const deriveAgentEntitlements = (agentProfileInput = {}) => {
  const profile = normalizeUserAgentProfile(agentProfileInput);
  const premiumWebResearchAvailable = (
    profile.premiumTier === 'premium'
    && profile.webResearchEnabled
  );
  return {
    premiumTier: profile.premiumTier,
    webResearchEnabled: profile.webResearchEnabled,
    webResearchBetaEnabled: profile.webResearchBetaEnabled,
    premiumWebResearchAvailable
  };
};

const getUserAgentEntitlements = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return deriveAgentEntitlements({});
  }
  const user = await User.findById(userId).select('agentProfile').lean();
  return deriveAgentEntitlements(user?.agentProfile || {});
};

const sanitizePersonalAgent = (doc) => ({
  _id: String(doc?._id || ''),
  name: String(doc?.name || ''),
  description: String(doc?.description || ''),
  status: normalizePersonalAgentStatus(doc?.status, 'active'),
  capabilities: normalizePersonalAgentCapabilities(doc?.capabilities || {}),
  preferredWorkerRoles: normalizePersonalAgentWorkerRoles(doc?.preferredWorkerRoles || []),
  apiKeyPrefix: String(doc?.apiKeyPrefix || ''),
  lastUsedAt: doc?.lastUsedAt ? new Date(doc.lastUsedAt).toISOString() : null,
  createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null
});

const safeAgentHandoffLimit = (value, fallback = 30) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_AGENT_HANDOFF_LIST_LIMIT, Math.trunc(parsed)));
};

const buildDefaultThreadTitle = (text = '', fallback = 'Agent thread') => (
  truncateThreadText(text || fallback, 120) || fallback
);

const buildDefaultHandoffPlan = ({
  taskType = 'custom',
  title = '',
  objective = ''
}) => {
  const safeTaskType = normalizeAgentHandoffTaskType(taskType, 'custom');
  const safeObjective = String(objective || '').trim();
  const plansByTaskType = {
    research: {
      successCriteria: [
        'Clarify the research question.',
        'Surface the strongest relevant sources.',
        'Deliver a concise findings summary with follow-up directions.'
      ],
      steps: [
        { id: 'clarify', title: 'Clarify the research target', status: 'pending', kind: 'analysis', workerRole: 'planner' },
        { id: 'gather', title: 'Gather supporting material', status: 'pending', kind: 'retrieval', workerRole: 'researcher' },
        { id: 'synthesize', title: 'Summarize findings and next moves', status: 'pending', kind: 'delivery', workerRole: 'synthesizer' }
      ]
    },
    synthesis: {
      successCriteria: [
        'Assemble the relevant source material.',
        'Produce a structured synthesis rather than scattered notes.',
        'Return a clean output the user can reuse.'
      ],
      steps: [
        { id: 'review', title: 'Review the current material', status: 'pending', kind: 'analysis', workerRole: 'researcher' },
        { id: 'draft', title: 'Draft the synthesis', status: 'pending', kind: 'writing', workerRole: 'synthesizer' },
        { id: 'tighten', title: 'Tighten the final output', status: 'pending', kind: 'editing', workerRole: 'editor' }
      ]
    },
    restructure: {
      successCriteria: [
        'Inspect the current structure before editing.',
        'Make the reorganization legible and reversible.',
        'Return the updated state with a short explanation.'
      ],
      steps: [
        { id: 'inspect', title: 'Inspect the current structure', status: 'pending', kind: 'analysis', workerRole: 'organizer' },
        { id: 'propose', title: 'Propose the restructure', status: 'pending', kind: 'planning', workerRole: 'planner' },
        { id: 'apply', title: 'Apply approved changes', status: 'pending', kind: 'execution', workerRole: 'editor' }
      ]
    },
    qa: {
      successCriteria: [
        'Review the target surface closely.',
        'Call out concrete gaps or risks.',
        'Return prioritized findings.'
      ],
      steps: [
        { id: 'inspect', title: 'Inspect the target surface', status: 'pending', kind: 'analysis', workerRole: 'critic' },
        { id: 'verify', title: 'Verify expected behavior', status: 'pending', kind: 'testing', workerRole: 'critic' },
        { id: 'report', title: 'Report prioritized findings', status: 'pending', kind: 'delivery', workerRole: 'editor' }
      ]
    },
    custom: {
      successCriteria: [
        'Clarify the task.',
        'Complete the requested work.',
        'Return a concrete result or blocker.'
      ],
      steps: [
        { id: 'clarify', title: 'Clarify the task', status: 'pending', kind: 'analysis', workerRole: 'planner' },
        { id: 'execute', title: 'Execute the work', status: 'pending', kind: 'execution', workerRole: 'synthesizer' },
        { id: 'deliver', title: 'Deliver the result', status: 'pending', kind: 'delivery', workerRole: 'editor' }
      ]
    }
  };
  const basePlan = plansByTaskType[safeTaskType] || plansByTaskType.custom;
  return normalizeThreadPlan({
    objective: safeObjective || title,
    currentStepId: basePlan.steps[0]?.id || '',
    successCriteria: basePlan.successCriteria,
    steps: basePlan.steps
  });
};

const buildDefaultHandoffCheckpoint = ({
  title = '',
  requestedActor = {}
}) => normalizeThreadCheckpoint({
  summary: `Handoff created and waiting for ${normalizeAgentActorType(requestedActor?.actorType, 'native_agent')}.`,
  openQuestions: [],
  nextActions: ['Claim the handoff and start the first plan step.'],
  updatedBy: normalizeThreadActor(requestedActor, 'native_agent')
});

const createThreadForHandoff = async ({
  userId,
  title = '',
  objective = '',
  taskType = 'custom',
  requestedActor = {},
  planner = null,
  createdBy = {},
  handoffId = null
}) => {
  const nextPlanner = sanitizeAgentPlanner(
    planner || buildAgentPlanner({ taskType, requestedActor })
  );
  const thread = await AgentThread.create({
    userId,
    title: buildDefaultThreadTitle(title || objective || 'Handoff thread'),
    status: 'active',
    summary: truncateThreadText(objective || title, 280),
    scope: normalizeThreadScope({
      type: 'handoff',
      id: String(handoffId || ''),
      title: title || 'Agent handoff'
    }),
    createdBy: normalizeThreadActor(createdBy, 'user'),
    lastActor: normalizeThreadActor(createdBy, 'user'),
    handoffId,
    planner: nextPlanner,
    plan: buildDefaultHandoffPlan({ taskType, title, objective }),
    checkpoint: buildDefaultHandoffCheckpoint({ title, requestedActor }),
    messages: []
  });
  appendThreadMessage(thread, {
    role: 'system',
    text: `Handoff thread opened for ${title || 'untitled handoff'}.`,
    actor: normalizeThreadActor(createdBy, 'user'),
    metadata: {
      taskType: normalizeAgentHandoffTaskType(taskType, 'custom'),
      requestedActor: normalizeActorIdentity(requestedActor || {}, 'native_agent'),
      planner: nextPlanner
    }
  });
  await thread.save();
  return thread;
};

const normalizeActorIdentity = (input = {}, fallbackType = 'user') => ({
  actorType: normalizeAgentActorType(input?.actorType, fallbackType),
  actorId: String(input?.actorId || '').trim()
});

const parseOptionalDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getAgentBridgeJwtSecret = () => (
  String(process.env.AGENT_BRIDGE_SECRET || process.env.JWT_SECRET || '').trim() || 'note-taker-agent-bridge-dev-secret'
);

const safeBridgeTokenTtlSeconds = (value, fallback = DEFAULT_BRIDGE_TOKEN_TTL_SECONDS) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.trunc(parsed);
  return Math.max(60, Math.min(MAX_BRIDGE_TOKEN_TTL_SECONDS, intValue));
};

const normalizeProtocolTaskOverride = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const actorTypeRaw = String(source.actorType || '').trim().toLowerCase();
  const actorType = AGENT_ACTOR_TYPES.has(actorTypeRaw) ? actorTypeRaw : '';
  const actorId = String(source.actorId || '').trim();
  if (!actorType) return { actorType: '', actorId: '' };
  return { actorType, actorId };
};

const PROTOCOL_HOOK_EFFECTS = new Set(['off', 'observe', 'warn', 'require_approval']);

const normalizeProtocolHookEffect = (value, fallback = 'off') => {
  if (typeof value === 'boolean') return value ? 'observe' : 'off';
  const safeValue = String(value || '').trim().toLowerCase();
  if (PROTOCOL_HOOK_EFFECTS.has(safeValue)) return safeValue;
  return PROTOCOL_HOOK_EFFECTS.has(String(fallback || '').trim().toLowerCase())
    ? String(fallback).trim().toLowerCase()
    : 'off';
};

const normalizeAgentProtocolHooksPolicy = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    beforeThreadOps: normalizeProtocolHookEffect(source.beforeThreadOps, 'off'),
    afterThreadOps: normalizeProtocolHookEffect(source.afterThreadOps, 'off'),
    beforeHandoffOps: normalizeProtocolHookEffect(source.beforeHandoffOps, 'observe'),
    afterHandoffOps: normalizeProtocolHookEffect(source.afterHandoffOps, 'observe')
  };
};

const normalizeAgentProtocolPolicy = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const taskOverridesSource = source.taskOverrides && typeof source.taskOverrides === 'object'
    ? source.taskOverrides
    : {};
  const defaultByoAgentIdRaw = String(source.defaultByoAgentId || '').trim();
  return {
    routingMode: normalizeAgentProtocolRoutingMode(source.routingMode, 'balanced'),
    defaultByoAgentId: mongoose.Types.ObjectId.isValid(defaultByoAgentIdRaw) ? defaultByoAgentIdRaw : '',
    allowByoForResearch: source.allowByoForResearch !== undefined ? Boolean(source.allowByoForResearch) : true,
    allowByoForSynthesis: source.allowByoForSynthesis !== undefined ? Boolean(source.allowByoForSynthesis) : true,
    preferByoSpecialists: source.preferByoSpecialists !== undefined ? Boolean(source.preferByoSpecialists) : true,
    hooks: normalizeAgentProtocolHooksPolicy(source.hooks || {}),
    taskOverrides: {
      research: normalizeProtocolTaskOverride(taskOverridesSource.research),
      synthesis: normalizeProtocolTaskOverride(taskOverridesSource.synthesis),
      restructure: normalizeProtocolTaskOverride(taskOverridesSource.restructure),
      qa: normalizeProtocolTaskOverride(taskOverridesSource.qa),
      custom: normalizeProtocolTaskOverride(taskOverridesSource.custom)
    }
  };
};

const sanitizeAgentProtocolPolicy = (input = {}) => {
  const policy = normalizeAgentProtocolPolicy(input);
  return {
    routingMode: policy.routingMode,
    defaultByoAgentId: policy.defaultByoAgentId || '',
    allowByoForResearch: Boolean(policy.allowByoForResearch),
    allowByoForSynthesis: Boolean(policy.allowByoForSynthesis),
    preferByoSpecialists: policy.preferByoSpecialists !== false,
    hooks: normalizeAgentProtocolHooksPolicy(policy.hooks || {}),
    taskOverrides: {
      research: policy.taskOverrides.research,
      synthesis: policy.taskOverrides.synthesis,
      restructure: policy.taskOverrides.restructure,
      qa: policy.taskOverrides.qa,
      custom: policy.taskOverrides.custom
    }
  };
};

const toStoredAgentProtocolPolicy = (policy = {}) => ({
  routingMode: policy.routingMode,
  defaultByoAgentId: policy.defaultByoAgentId && mongoose.Types.ObjectId.isValid(policy.defaultByoAgentId)
    ? new mongoose.Types.ObjectId(String(policy.defaultByoAgentId))
    : null,
  allowByoForResearch: Boolean(policy.allowByoForResearch),
  allowByoForSynthesis: Boolean(policy.allowByoForSynthesis),
  preferByoSpecialists: Boolean(policy.preferByoSpecialists),
  hooks: normalizeAgentProtocolHooksPolicy(policy.hooks || {}),
  taskOverrides: policy.taskOverrides || {}
});

const getUserAgentProtocolPolicy = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return sanitizeAgentProtocolPolicy({});
  }
  const user = await User.findById(userId).select('agentProtocolPolicy').lean();
  return sanitizeAgentProtocolPolicy(user?.agentProtocolPolicy || {});
};

const isByoAgentCompatibleForTask = (agent = {}, taskType = 'custom') => {
  const capabilities = normalizePersonalAgentCapabilities(agent.capabilities || {});
  const safeTaskType = normalizeAgentHandoffTaskType(taskType, 'custom');
  if (safeTaskType === 'research') return capabilities.read && capabilities.search;
  if (safeTaskType === 'synthesis') return capabilities.read && capabilities.proposeChanges;
  if (safeTaskType === 'restructure') return capabilities.executeWrites;
  if (safeTaskType === 'qa') return capabilities.read && capabilities.search;
  return capabilities.proposeChanges || capabilities.executeWrites || capabilities.read;
};

const listActivePersonalAgentsForUser = async (userId) => {
  const rows = await PersonalAgent.find({ userId, status: 'active' })
    .select('_id name capabilities updatedAt')
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  return Array.isArray(rows) ? rows : [];
};

const selectByoAgentForTask = ({
  agents = [],
  taskType = 'custom',
  preferredAgentId = '',
  preferredWorkerRole = ''
}) => {
  const compatible = agents.filter(agent => isByoAgentCompatibleForTask(agent, taskType));
  if (!compatible.length) return null;
  const safeWorkerRole = normalizeWorkerRole(preferredWorkerRole);
  const roleMatched = safeWorkerRole
    ? compatible.filter(agent => normalizePersonalAgentWorkerRoles(agent?.preferredWorkerRoles || []).includes(safeWorkerRole))
    : [];
  const pool = roleMatched.length > 0 ? roleMatched : compatible;
  const preferredId = String(preferredAgentId || '').trim();
  if (preferredId) {
    const preferred = pool.find(agent => String(agent._id) === preferredId)
      || compatible.find(agent => String(agent._id) === preferredId);
    if (preferred) return preferred;
  }
  return pool[0];
};

const resolveAutoHandoffRequestedActor = async ({
  userId,
  taskType = 'custom',
  policy = {},
  workerRole = ''
}) => {
  const safeTaskType = normalizeAgentHandoffTaskType(taskType, 'custom');
  const safePolicy = sanitizeAgentProtocolPolicy(policy);
  const preferredWorkerRole = normalizeWorkerRole(
    workerRole || inferWorkerRole({ taskType: safeTaskType }),
    ''
  );
  const override = safePolicy.taskOverrides[safeTaskType] || { actorType: '', actorId: '' };

  if (override.actorType) {
    let overrideActorId = String(override.actorId || '').trim();
    if (override.actorType === 'user' && !overrideActorId) overrideActorId = String(userId);
    if (override.actorType === 'byo_agent' && !overrideActorId) overrideActorId = String(safePolicy.defaultByoAgentId || '').trim();
    if (override.actorType !== 'byo_agent' || overrideActorId) {
      try {
        const resolved = await resolveAndValidateActorIdentity({
          userId,
          actor: { actorType: override.actorType, actorId: overrideActorId },
          fallbackType: 'native_agent'
        });
        return {
          requestedActor: resolved,
          planner: {
            routeSource: 'task_override',
            routingMode: safePolicy.routingMode
          }
        };
      } catch (_error) {
        // fall through to normal routing logic
      }
    }
  }

  const shouldConsiderByo = (
    safePolicy.routingMode === 'byo_first'
    || (
      safePolicy.routingMode === 'balanced'
      && (
        (safeTaskType === 'research' && safePolicy.allowByoForResearch)
        || (safeTaskType === 'synthesis' && safePolicy.allowByoForSynthesis)
      )
    )
  );

  if (shouldConsiderByo) {
    const agents = await listActivePersonalAgentsForUser(userId);
    const selectedByo = selectByoAgentForTask({
      agents,
      taskType: safeTaskType,
      preferredAgentId: safePolicy.defaultByoAgentId,
      preferredWorkerRole: safePolicy.preferByoSpecialists ? preferredWorkerRole : ''
    });
    if (selectedByo) {
      const selectedWorkerRoles = normalizePersonalAgentWorkerRoles(selectedByo.preferredWorkerRoles || []);
      return {
        requestedActor: { actorType: 'byo_agent', actorId: String(selectedByo._id) },
        planner: {
          routeSource: safePolicy.routingMode === 'byo_first' ? 'routing_mode_byo_first' : 'balanced_with_capability_match',
          routingMode: safePolicy.routingMode,
          activeWorkerRole: preferredWorkerRole || undefined,
          selectedByoAgent: {
            actorId: String(selectedByo._id),
            name: String(selectedByo.name || ''),
            preferredWorkerRoles: selectedWorkerRoles
          },
          specialistMatch: Boolean(preferredWorkerRole && selectedWorkerRoles.includes(preferredWorkerRole))
        }
      };
    }
  }

  return {
    requestedActor: { actorType: 'native_agent', actorId: '' },
    planner: {
      routeSource: safePolicy.routingMode === 'native_first' ? 'routing_mode_native_first' : 'fallback_native',
      routingMode: safePolicy.routingMode
    }
  };
};

const createSignedBridgeToken = ({
  userId,
  actorType = 'user',
  actorId = '',
  scope = 'agent_ops',
  ttlSeconds = DEFAULT_BRIDGE_TOKEN_TTL_SECONDS
}) => {
  const safeTtl = safeBridgeTokenTtlSeconds(ttlSeconds, DEFAULT_BRIDGE_TOKEN_TTL_SECONDS);
  const payload = {
    kind: AGENT_BRIDGE_TOKEN_KIND,
    userId: String(userId),
    actorType: normalizeAgentActorType(actorType, 'user'),
    actorId: String(actorId || '').trim(),
    scope: String(scope || 'agent_ops').trim() || 'agent_ops'
  };
  const token = jwt.sign(payload, getAgentBridgeJwtSecret(), {
    expiresIn: safeTtl,
    issuer: 'note-taker-3-1'
  });
  return { token, ttlSeconds: safeTtl };
};

const sanitizeProtocolApprovalDoc = (doc) => ({
  approvalId: String(doc?._id || ''),
  status: String(doc?.status || '').trim(),
  scope: String(doc?.scope || '').trim() || 'agent_ops',
  op: String(doc?.op || '').trim(),
  payload: doc?.payload && typeof doc.payload === 'object' ? doc.payload : {},
  preview: doc?.preview && typeof doc.preview === 'object' ? doc.preview : {},
  reason: String(doc?.reason || '').trim(),
  decisionNote: String(doc?.decisionNote || '').trim(),
  requestedBy: normalizeActorIdentity(doc?.requestedBy || {}, 'native_agent'),
  approvedBy: doc?.approvedBy ? normalizeActorIdentity(doc.approvedBy, 'user') : null,
  rejectedBy: doc?.rejectedBy ? normalizeActorIdentity(doc.rejectedBy, 'user') : null,
  approvedAt: doc?.approvedAt ? new Date(doc.approvedAt).toISOString() : null,
  rejectedAt: doc?.rejectedAt ? new Date(doc.rejectedAt).toISOString() : null,
  executedAt: doc?.executedAt ? new Date(doc.executedAt).toISOString() : null,
  createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  result: doc?.result && typeof doc.result === 'object' ? doc.result : {}
});

const sanitizeProtocolHookRunDoc = (doc) => ({
  hookRunId: String(doc?._id || ''),
  effect: normalizeProtocolHookEffect(doc?.effect, 'observe'),
  status: String(doc?.status || '').trim() || 'passed',
  source: String(doc?.source || '').trim() || 'native',
  phase: String(doc?.phase || '').trim(),
  scope: String(doc?.scope || '').trim() || 'agent_ops',
  op: String(doc?.op || '').trim(),
  actor: normalizeActorIdentity(doc?.actor || {}, 'native_agent'),
  threadId: String(doc?.threadId || '').trim(),
  handoffId: String(doc?.handoffId || '').trim(),
  approvalId: String(doc?.approvalId || '').trim(),
  preview: doc?.preview && typeof doc.preview === 'object' ? doc.preview : {},
  payload: doc?.payload && typeof doc.payload === 'object' ? doc.payload : {},
  result: doc?.result && typeof doc.result === 'object' ? doc.result : {},
  warningMessage: String(doc?.warningMessage || '').trim(),
  errorMessage: String(doc?.errorMessage || '').trim(),
  createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null
});

const BRIDGE_APPROVAL_REQUIRED_OPS = new Set([
  'project.write_draft',
  'threads.create',
  'threads.update',
  'threads.convert_to_handoff',
  'artifacts.drafts.create',
  'artifacts.drafts.promote',
  'artifacts.drafts.dismiss',
  'handoffs.create',
  'handoffs.claim',
  'handoffs.complete',
  'handoffs.reject'
]);

const BRIDGE_PROJECT_READ_TYPES = new Set([
  'article',
  'notebook',
  'concept',
  'question',
  'wiki_page',
  'thread',
  'handoff',
  'artifact_draft'
]);

const BRIDGE_PROJECT_ACCESS_OPERATIONS = [
  'project.search',
  'project.read',
  'project.write_draft',
  'bridge.access_check'
];

const clampBridgeText = (value = '', maxLength = 1200) => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
);

const buildBridgeProjectResult = ({
  type,
  id,
  title = '',
  snippet = '',
  updatedAt = null,
  route = '',
  metadata = {}
}) => ({
  type,
  id: String(id || ''),
  title: String(title || '').trim() || 'Untitled',
  snippet: clampBridgeText(snippet, 700),
  updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
  route,
  metadata: metadata && typeof metadata === 'object' ? metadata : {}
});

const buildBridgeSearchRegex = (query = '') => {
  const safeQuery = String(query || '').trim();
  if (!safeQuery) return null;
  const escaped = safeQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
};

const bridgeCanRetrieveProject = ({ actor = {}, bridgeByoCapabilities = null } = {}) => {
  if (actor.actorType !== 'byo_agent') return true;
  return Boolean(bridgeByoCapabilities?.read || bridgeByoCapabilities?.search);
};

const bridgeCanWriteProject = ({ actor = {}, bridgeByoCapabilities = null } = {}) => {
  if (actor.actorType !== 'byo_agent') return true;
  return Boolean(bridgeByoCapabilities?.proposeChanges || bridgeByoCapabilities?.executeWrites);
};

const searchBridgeProjectCorpus = async ({
  userId,
  query = '',
  types = [],
  limit = 20
} = {}) => {
  const safeLimit = safeAgentHandoffLimit(limit, 20);
  const selectedTypes = Array.isArray(types)
    ? types.map(type => String(type || '').trim().toLowerCase()).filter(type => BRIDGE_PROJECT_READ_TYPES.has(type))
    : [];
  const includeType = (type) => selectedTypes.length === 0 || selectedTypes.includes(type);
  const matcher = buildBridgeSearchRegex(query);
  const results = [];
  const remaining = () => Math.max(0, safeLimit - results.length);

  if (includeType('article') && remaining() > 0) {
    const articleQuery = {
      userId,
      hiddenFromHome: { $ne: true },
      debugOnly: { $ne: true },
      archived: { $ne: true }
    };
    if (matcher) {
      articleQuery.$or = [
        { title: matcher },
        { content: matcher },
        { author: matcher },
        { siteName: matcher },
        { 'highlights.text': matcher },
        { 'highlights.note': matcher }
      ];
    }
    const rows = await Article.find(articleQuery)
      .select('_id title content author siteName url updatedAt highlights')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      const highlight = Array.isArray(row.highlights) ? row.highlights.find(item => (
        !matcher || matcher.test(String(item?.text || '')) || matcher.test(String(item?.note || ''))
      )) : null;
      results.push(buildBridgeProjectResult({
        type: 'article',
        id: row._id,
        title: row.title,
        snippet: highlight?.text || row.content,
        updatedAt: row.updatedAt,
        route: `/library?articleId=${encodeURIComponent(String(row._id))}`,
        metadata: { author: row.author || '', siteName: row.siteName || '', url: row.url || '' }
      }));
    });
  }

  if (includeType('notebook') && remaining() > 0) {
    const notebookQuery = { userId };
    if (matcher) {
      notebookQuery.$or = [
        { title: matcher },
        { content: matcher },
        { tags: matcher },
        { 'blocks.text': matcher }
      ];
    }
    const rows = await NotebookEntry.find(notebookQuery)
      .select('_id title content blocks tags type updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      const block = Array.isArray(row.blocks) ? row.blocks.find(item => !matcher || matcher.test(String(item?.text || ''))) : null;
      results.push(buildBridgeProjectResult({
        type: 'notebook',
        id: row._id,
        title: row.title,
        snippet: block?.text || row.content,
        updatedAt: row.updatedAt,
        route: `/think?tab=notebook&entryId=${encodeURIComponent(String(row._id))}`,
        metadata: { noteType: row.type || 'note', tags: Array.isArray(row.tags) ? row.tags : [] }
      }));
    });
  }

  if (includeType('concept') && remaining() > 0) {
    const conceptQuery = { userId };
    if (matcher) {
      conceptQuery.$or = [
        { name: matcher },
        { description: matcher },
        { workspaceTemplateName: matcher }
      ];
    }
    const rows = await TagMeta.find(conceptQuery)
      .select('_id name description workspaceTemplateName updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      results.push(buildBridgeProjectResult({
        type: 'concept',
        id: row._id,
        title: row.name,
        snippet: row.description || row.workspaceTemplateName,
        updatedAt: row.updatedAt,
        route: `/think?tab=concepts&concept=${encodeURIComponent(String(row.name || ''))}`,
        metadata: { workspaceTemplateName: row.workspaceTemplateName || '' }
      }));
    });
  }

  if (includeType('question') && remaining() > 0) {
    const questionQuery = { userId };
    if (matcher) {
      questionQuery.$or = [
        { text: matcher },
        { conceptName: matcher },
        { linkedTagName: matcher },
        { 'blocks.text': matcher }
      ];
    }
    const rows = await Question.find(questionQuery)
      .select('_id text status conceptName linkedTagName blocks updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      const block = Array.isArray(row.blocks) ? row.blocks.find(item => !matcher || matcher.test(String(item?.text || ''))) : null;
      results.push(buildBridgeProjectResult({
        type: 'question',
        id: row._id,
        title: row.text,
        snippet: block?.text || row.conceptName || row.linkedTagName,
        updatedAt: row.updatedAt,
        route: `/think?tab=questions&questionId=${encodeURIComponent(String(row._id))}`,
        metadata: { status: row.status || 'open', conceptName: row.conceptName || row.linkedTagName || '' }
      }));
    });
  }

  if (includeType('wiki_page') && remaining() > 0) {
    const wikiQuery = { userId };
    if (matcher) {
      wikiQuery.$or = [
        { title: matcher },
        { plainText: matcher },
        { slug: matcher }
      ];
    }
    const rows = await WikiPage.find(wikiQuery)
      .select('_id title plainText status pageType updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      results.push(buildBridgeProjectResult({
        type: 'wiki_page',
        id: row._id,
        title: row.title,
        snippet: row.plainText,
        updatedAt: row.updatedAt,
        route: `/wiki/workspace?page=${encodeURIComponent(String(row._id))}`,
        metadata: { status: row.status || 'draft', pageType: row.pageType || 'topic' }
      }));
    });
  }

  return results.slice(0, safeLimit);
};

const readBridgeProjectItem = async ({
  userId,
  type = '',
  id = ''
} = {}) => {
  const safeType = String(type || '').trim().toLowerCase();
  const safeId = String(id || '').trim();
  if (!BRIDGE_PROJECT_READ_TYPES.has(safeType)) throw Object.assign(new Error('Unsupported project item type.'), { status: 400 });
  if (!mongoose.Types.ObjectId.isValid(safeId)) throw Object.assign(new Error('Invalid project item id.'), { status: 400 });

  if (safeType === 'article') {
    const row = await Article.findOne({ _id: safeId, userId }).select('_id title content author siteName url highlights updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project article not found.'), { status: 404 });
    return buildBridgeProjectResult({
      type: 'article',
      id: row._id,
      title: row.title,
      snippet: row.content,
      updatedAt: row.updatedAt,
      route: `/library?articleId=${encodeURIComponent(String(row._id))}`,
      metadata: {
        author: row.author || '',
        siteName: row.siteName || '',
        url: row.url || '',
        content: clampBridgeText(row.content, 12000),
        highlights: (Array.isArray(row.highlights) ? row.highlights : []).slice(0, 80).map(item => ({
          highlightId: String(item?._id || ''),
          text: clampBridgeText(item?.text, 2000),
          note: clampBridgeText(item?.note, 1000),
          tags: Array.isArray(item?.tags) ? item.tags : []
        }))
      }
    });
  }

  if (safeType === 'notebook') {
    const row = await NotebookEntry.findOne({ _id: safeId, userId }).select('_id title content blocks tags type updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project notebook entry not found.'), { status: 404 });
    return buildBridgeProjectResult({
      type: 'notebook',
      id: row._id,
      title: row.title,
      snippet: row.content,
      updatedAt: row.updatedAt,
      route: `/think?tab=notebook&entryId=${encodeURIComponent(String(row._id))}`,
      metadata: {
        noteType: row.type || 'note',
        tags: Array.isArray(row.tags) ? row.tags : [],
        content: clampBridgeText(row.content, 12000),
        blocks: (Array.isArray(row.blocks) ? row.blocks : []).slice(0, 200).map(block => ({
          id: String(block?.id || ''),
          type: String(block?.type || 'paragraph'),
          text: clampBridgeText(block?.text, 2000)
        }))
      }
    });
  }

  if (safeType === 'concept') {
    const row = await TagMeta.findOne({ _id: safeId, userId }).select('_id name description workspace workspaceTemplateName updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project concept not found.'), { status: 404 });
    return buildBridgeProjectResult({
      type: 'concept',
      id: row._id,
      title: row.name,
      snippet: row.description,
      updatedAt: row.updatedAt,
      route: `/think?tab=concepts&concept=${encodeURIComponent(String(row.name || ''))}`,
      metadata: {
        description: row.description || '',
        workspaceTemplateName: row.workspaceTemplateName || '',
        workspace: row.workspace || {}
      }
    });
  }

  if (safeType === 'question') {
    const row = await Question.findOne({ _id: safeId, userId }).select('_id text status conceptName linkedTagName blocks updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project question not found.'), { status: 404 });
    return buildBridgeProjectResult({
      type: 'question',
      id: row._id,
      title: row.text,
      snippet: row.conceptName || row.linkedTagName,
      updatedAt: row.updatedAt,
      route: `/think?tab=questions&questionId=${encodeURIComponent(String(row._id))}`,
      metadata: {
        status: row.status || 'open',
        conceptName: row.conceptName || row.linkedTagName || '',
        blocks: (Array.isArray(row.blocks) ? row.blocks : []).slice(0, 120).map(block => ({
          id: String(block?.id || ''),
          type: String(block?.type || 'paragraph'),
          text: clampBridgeText(block?.text, 2000)
        }))
      }
    });
  }

  if (safeType === 'wiki_page') {
    const row = await WikiPage.findOne({ _id: safeId, userId }).select('_id title plainText body status pageType claims citations sourceRefs updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project wiki page not found.'), { status: 404 });
    return buildBridgeProjectResult({
      type: 'wiki_page',
      id: row._id,
      title: row.title,
      snippet: row.plainText,
      updatedAt: row.updatedAt,
      route: `/wiki/workspace?page=${encodeURIComponent(String(row._id))}`,
      metadata: {
        status: row.status || 'draft',
        pageType: row.pageType || 'topic',
        plainText: clampBridgeText(row.plainText, 14000),
        claims: Array.isArray(row.claims) ? row.claims.slice(0, 120) : [],
        citations: Array.isArray(row.citations) ? row.citations.slice(0, 120) : [],
        sourceRefs: Array.isArray(row.sourceRefs) ? row.sourceRefs.slice(0, 120) : []
      }
    });
  }

  if (safeType === 'thread') {
    const row = await AgentThread.findOne({ _id: safeId, userId });
    if (!row) throw Object.assign(new Error('Project thread not found.'), { status: 404 });
    return { type: 'thread', item: sanitizeAgentThreadDoc(row) };
  }

  if (safeType === 'handoff') {
    const row = await AgentHandoff.findOne({ _id: safeId, userId });
    if (!row) throw Object.assign(new Error('Project handoff not found.'), { status: 404 });
    return { type: 'handoff', item: sanitizeAgentHandoffDoc(row) };
  }

  if (safeType === 'artifact_draft') {
    const row = await AgentArtifactDraft.findOne({ _id: safeId, userId });
    if (!row) throw Object.assign(new Error('Project artifact draft not found.'), { status: 404 });
    return { type: 'artifact_draft', item: sanitizeAgentArtifactDraftDoc(row) };
  }

  throw Object.assign(new Error('Unsupported project item type.'), { status: 400 });
};

const shouldRequireProtocolApproval = ({
  op = '',
  actor = {},
  source = 'bridge',
  policy = {}
} = {}) => {
  const safeOp = String(op || '').trim();
  const safeSource = String(source || 'bridge').trim().toLowerCase();
  if (!safeOp || !['bridge', 'native'].includes(safeSource)) return { requiresApproval: false, reason: '' };
  const beforeHookEffect = getProtocolHookEffect({ policy, phase: 'before', op: safeOp });
  if (beforeHookEffect === 'require_approval') {
    return {
      requiresApproval: true,
      reason: `Before hook for ${safeOp} requires approval.`
    };
  }
  if (String(actor?.actorType || '').trim().toLowerCase() === 'user') {
    return { requiresApproval: false, reason: '' };
  }
  if (!BRIDGE_APPROVAL_REQUIRED_OPS.has(safeOp)) {
    return { requiresApproval: false, reason: '' };
  }
  if (safeOp === 'threads.convert_to_handoff') {
    return {
      requiresApproval: true,
      reason: 'Agent-triggered conversion from thread to handoff requires approval.'
    };
  }
  if (safeOp === 'handoffs.complete' || safeOp === 'handoffs.reject') {
    return {
      requiresApproval: true,
      reason: 'Agent-driven handoff resolution requires approval.'
    };
  }
  return {
    requiresApproval: true,
    reason: 'Bridge-issued write operation requires approval.'
  };
};

const requestProtocolApproval = async ({
  userId,
  scope = 'agent_ops',
  op = '',
  payload = {},
  preview = {},
  reason = '',
  requestedBy = {}
} = {}) => {
  const approval = await AgentProtocolApproval.create({
    userId,
    status: 'pending',
    scope: String(scope || 'agent_ops').trim() || 'agent_ops',
    op: String(op || '').trim(),
    payload: payload && typeof payload === 'object' ? payload : {},
    preview: {
      title: String(
        preview?.title
        || payload?.draft?.title
        || payload?.title
        || payload?.message?.text
        || payload?.objective
        || ''
      ).trim(),
      threadId: String(preview?.threadId || payload?.threadId || '').trim(),
      handoffId: String(preview?.handoffId || payload?.handoffId || '').trim(),
      draftId: String(preview?.draftId || payload?.draftId || '').trim()
    },
    reason: String(reason || '').trim(),
    requestedBy: normalizeActorIdentity(requestedBy || {}, 'native_agent')
  });
  return sanitizeProtocolApprovalDoc(approval);
};

const getProtocolHookEffect = ({
  policy = {},
  phase = 'before',
  op = ''
} = {}) => {
  const safePhase = String(phase || 'before').trim().toLowerCase();
  const safeOp = String(op || '').trim().toLowerCase();
  const hooks = normalizeAgentProtocolHooksPolicy(policy?.hooks || {});
  if (safeOp.startsWith('threads.')) {
    return safePhase === 'before' ? hooks.beforeThreadOps : hooks.afterThreadOps;
  }
  if (safeOp.startsWith('handoffs.')) {
    return safePhase === 'before' ? hooks.beforeHandoffOps : hooks.afterHandoffOps;
  }
  if (safeOp.startsWith('artifacts.')) {
    return safePhase === 'before' ? hooks.beforeThreadOps : hooks.afterThreadOps;
  }
  return 'off';
};

const buildProtocolHookWarningMessage = ({
  phase = 'before',
  op = ''
} = {}) => {
  const safePhase = String(phase || 'before').trim().toLowerCase();
  const safeOp = String(op || '').trim();
  return `${safePhase} hook warning for ${safeOp || 'protocol operation'}.`;
};

const collectHookWarnings = (...runs) => (
  runs
    .filter(Boolean)
    .map((run) => String(run?.warningMessage || '').trim())
    .filter(Boolean)
);

const buildProtocolHookPreview = ({
  payload = {},
  result = {},
  errorMessage = ''
} = {}) => ({
  title: String(
    payload?.title
    || result?.draft?.title
    || result?.thread?.title
    || result?.handoff?.title
    || payload?.message?.text
    || payload?.objective
    || ''
  ).trim(),
  threadId: String(
    payload?.threadId
    || result?.thread?.threadId
    || result?.approval?.preview?.threadId
    || ''
  ).trim(),
  handoffId: String(
    payload?.handoffId
    || result?.handoff?.handoffId
    || result?.approval?.preview?.handoffId
    || ''
  ).trim(),
  draftId: String(
    payload?.draftId
    || result?.draft?.draftId
    || result?.approval?.preview?.draftId
    || ''
  ).trim(),
  summary: String(errorMessage || payload?.note || '').trim()
});

const triggerProtocolHookPhase = async ({
  userId,
  actor = {},
  source = 'native',
  phase = 'before',
  scope = 'agent_ops',
  op = '',
  payload = {},
  result = {},
  approvalId = '',
  errorMessage = ''
} = {}) => {
  try {
    const policy = await getUserAgentProtocolPolicy(String(userId));
    const effect = getProtocolHookEffect({ policy, phase, op });
    if (effect === 'off') return null;
    const warningMessage = effect === 'warn'
      ? buildProtocolHookWarningMessage({ phase, op })
      : '';
    const hookRun = await AgentProtocolHookRun.create({
      userId,
      source: ['bridge', 'approval_replay'].includes(String(source || '').trim()) ? source : 'native',
      phase: String(phase || 'before').trim().toLowerCase() === 'after' ? 'after' : 'before',
      effect,
      status: errorMessage ? 'error' : 'passed',
      scope: String(scope || 'agent_ops').trim() || 'agent_ops',
      op: String(op || '').trim().toLowerCase(),
      actor: normalizeActorIdentity(actor || {}, 'native_agent'),
      threadId: String(
        payload?.threadId
        || result?.thread?.threadId
        || result?.approval?.preview?.threadId
        || ''
      ).trim(),
      handoffId: String(
        payload?.handoffId
        || result?.handoff?.handoffId
        || result?.approval?.preview?.handoffId
        || ''
      ).trim(),
      approvalId: mongoose.Types.ObjectId.isValid(approvalId) ? new mongoose.Types.ObjectId(String(approvalId)) : null,
      preview: buildProtocolHookPreview({ payload, result, errorMessage }),
      payload: payload && typeof payload === 'object' ? payload : {},
      result: result && typeof result === 'object' ? result : {},
      warningMessage,
      errorMessage: String(errorMessage || '').trim()
    });
    return sanitizeProtocolHookRunDoc(hookRun);
  } catch (error) {
    console.error('❌ Error recording protocol hook run:', error);
    return null;
  }
};

const sanitizeAgentHandoffDoc = (doc) => {
  const events = Array.isArray(doc?.events) ? doc.events : [];
  return {
    handoffId: String(doc?._id || ''),
    threadId: String(doc?.threadId || ''),
    title: String(doc?.title || ''),
    taskType: normalizeAgentHandoffTaskType(doc?.taskType, 'custom'),
    objective: String(doc?.objective || ''),
    status: normalizeAgentHandoffStatus(doc?.status, 'pending'),
    priority: normalizeAgentHandoffPriority(doc?.priority, 'normal'),
    context: doc?.context || {},
    input: doc?.input || {},
    output: doc?.output || {},
    planner: doc?.planner ? sanitizeAgentPlanner(doc.planner) : null,
    plan: normalizeThreadPlan(doc?.plan || {}),
    checkpoint: doc?.checkpoint ? normalizeThreadCheckpoint(doc.checkpoint) : null,
    requestedActor: normalizeActorIdentity(doc?.requestedActor || {}, 'native_agent'),
    createdBy: normalizeActorIdentity(doc?.createdBy || {}, 'user'),
    claimedBy: doc?.claimedBy ? normalizeActorIdentity(doc.claimedBy, 'native_agent') : null,
    completedBy: doc?.completedBy ? normalizeActorIdentity(doc.completedBy, 'native_agent') : null,
    rejectedBy: doc?.rejectedBy ? normalizeActorIdentity(doc.rejectedBy, 'native_agent') : null,
    cancelledBy: doc?.cancelledBy ? normalizeActorIdentity(doc.cancelledBy, 'user') : null,
    dueAt: doc?.dueAt ? new Date(doc.dueAt).toISOString() : null,
    claimedAt: doc?.claimedAt ? new Date(doc.claimedAt).toISOString() : null,
    completedAt: doc?.completedAt ? new Date(doc.completedAt).toISOString() : null,
    rejectedAt: doc?.rejectedAt ? new Date(doc.rejectedAt).toISOString() : null,
    cancelledAt: doc?.cancelledAt ? new Date(doc.cancelledAt).toISOString() : null,
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    events: events.slice(-50).map((event) => ({
      eventType: String(event?.eventType || '').trim(),
      actor: normalizeActorIdentity(event?.actor || {}, 'native_agent'),
      note: String(event?.note || ''),
      payload: event?.payload || {},
      createdAt: event?.createdAt ? new Date(event.createdAt).toISOString() : null
    }))
  };
};

const appendHandoffEvent = (handoff, {
  eventType,
  actor = {},
  note = '',
  payload = {}
}) => {
  if (!handoff) return;
  const safeEventType = String(eventType || '').trim();
  if (!safeEventType) return;
  const events = Array.isArray(handoff.events) ? handoff.events : [];
  events.push({
    eventType: safeEventType,
    actor: normalizeActorIdentity(actor, 'native_agent'),
    note: String(note || '').trim().slice(0, 1000),
    payload: payload && typeof payload === 'object' ? payload : {},
    createdAt: new Date()
  });
  handoff.events = events.slice(-200);
};

const matchesActorIdentity = (target = {}, actor = {}) => {
  const targetType = normalizeAgentActorType(target?.actorType, '');
  const actorType = normalizeAgentActorType(actor?.actorType, '');
  if (!targetType || !actorType || targetType !== actorType) return false;
  const targetId = String(target?.actorId || '').trim();
  const actorId = String(actor?.actorId || '').trim();
  if (!targetId) return true;
  return targetId === actorId;
};

const normalizeHandoffPayload = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return source;
};

const resolveAndValidateActorIdentity = async ({
  userId,
  actor = {},
  fallbackType = 'user'
}) => {
  const normalized = normalizeActorIdentity(actor, fallbackType);
  if (normalized.actorType !== 'byo_agent') return normalized;
  if (!mongoose.Types.ObjectId.isValid(normalized.actorId)) {
    const error = new Error('actorId must be a valid personal agent id for byo_agent actors.');
    error.status = 400;
    throw error;
  }
  const personalAgent = await PersonalAgent.findOne({
    _id: normalized.actorId,
    userId,
    status: 'active'
  }).select('_id');
  if (!personalAgent) {
    const error = new Error('Requested BYO agent was not found or is disabled.');
    error.status = 404;
    throw error;
  }
  return normalized;
};

const canActorClaimHandoff = (handoff, actor) => (
  matchesActorIdentity(handoff?.requestedActor || {}, actor)
);

const canActorMutateClaimedHandoff = (handoff, actor) => (
  matchesActorIdentity(handoff?.claimedBy || {}, actor)
);

const buildHandoffActorFilter = (actor = {}, scope = 'mine') => {
  const safeScope = String(scope || 'mine').trim().toLowerCase();
  if (safeScope === 'all') return {};
  const safeActorType = normalizeAgentActorType(actor?.actorType, '');
  const safeActorId = String(actor?.actorId || '').trim();
  if (!safeActorType) return {};
  if (safeActorId) {
    return {
      $or: [
        { 'requestedActor.actorType': safeActorType, 'requestedActor.actorId': safeActorId },
        { 'claimedBy.actorType': safeActorType, 'claimedBy.actorId': safeActorId },
        { 'createdBy.actorType': safeActorType, 'createdBy.actorId': safeActorId }
      ]
    };
  }
  return {
    $or: [
      { 'requestedActor.actorType': safeActorType },
      { 'claimedBy.actorType': safeActorType },
      { 'createdBy.actorType': safeActorType }
    ]
  };
};

const runBridgeHandoffOperation = async ({
  bridgeActor,
  op,
  payload = {},
  executionSource = 'bridge',
  approvalId = ''
}) => {
  const userId = String(bridgeActor?.userId || '').trim();
  const policy = await getUserAgentProtocolPolicy(String(userId));
  const actor = {
    actorType: normalizeAgentActorType(bridgeActor?.actorType, 'user'),
    actorId: String(bridgeActor?.actorId || '').trim()
  };
  let operation = String(op || '').trim().toLowerCase();
  let bridgeByoCapabilities = null;
  if (actor.actorType === 'byo_agent') {
    const byAgent = await PersonalAgent.findOne({
      _id: actor.actorId,
      userId,
      status: 'active'
    }).select('capabilities');
    if (!byAgent) throw Object.assign(new Error('BYO bridge actor is not active.'), { status: 403 });
    bridgeByoCapabilities = normalizePersonalAgentCapabilities(byAgent.capabilities || {});
  }

  const bypassProtocolApproval = Boolean(payload?.__bypassProtocolApproval);
  const approvalPolicy = shouldRequireProtocolApproval({
    op: operation,
    actor,
    source: 'bridge',
    policy
  });
  if (approvalPolicy.requiresApproval && !bypassProtocolApproval) {
    const approval = await requestProtocolApproval({
      userId,
      scope: String(bridgeActor?.scope || 'agent_ops').trim() || 'agent_ops',
      op: operation,
      payload,
      reason: approvalPolicy.reason,
      requestedBy: actor
    });
    return {
      status: 'approval_required',
      reason: approvalPolicy.reason,
      approval
    };
  }

  const beforeHookRun = await triggerProtocolHookPhase({
    userId,
    actor,
    source: executionSource,
    phase: 'before',
    scope: String(bridgeActor?.scope || 'agent_ops').trim() || 'agent_ops',
    op: operation,
    payload,
    approvalId
  });

  const finalizeOperation = async (result) => {
    const afterHookRun = await triggerProtocolHookPhase({
      userId,
      actor,
      source: executionSource,
      phase: 'after',
      scope: String(bridgeActor?.scope || 'agent_ops').trim() || 'agent_ops',
      op: operation,
      payload,
      result,
      approvalId
    });
    const warnings = collectHookWarnings(beforeHookRun, afterHookRun);
    if (warnings.length > 0 && result && typeof result === 'object') {
      return { ...result, hookWarnings: warnings };
    }
    return result;
  };

  if (operation === 'bridge.access_check') {
    const projectReadable = bridgeCanRetrieveProject({ actor, bridgeByoCapabilities });
    const projectWritable = bridgeCanWriteProject({ actor, bridgeByoCapabilities });
    const searchResults = projectReadable
      ? await searchBridgeProjectCorpus({
          userId,
          query: payload.query || '',
          types: payload.types || [],
          limit: payload.limit || 5
        })
      : [];
    return finalizeOperation({
      status: 'ready',
      actor,
      scope: String(bridgeActor?.scope || 'agent_ops').trim() || 'agent_ops',
      access: {
        projectRead: projectReadable,
        projectRetrieve: projectReadable,
        projectSearch: projectReadable,
        projectEdit: projectWritable,
        writeMode: 'controlled_drafts_and_approval_gated_mutations',
        readableTypes: Array.from(BRIDGE_PROJECT_READ_TYPES),
        approvalGatedOperations: Array.from(BRIDGE_APPROVAL_REQUIRED_OPS)
      },
      checks: {
        manifest: true,
        projectSearch: projectReadable,
        projectWriteBoundary: projectWritable,
        protocolApprovals: actor.actorType !== 'user'
      },
      sampleResults: searchResults,
      nextMcpMethods: [
        'project/search',
        'project/read',
        'project/write_draft',
        'threads/create',
        'artifacts/drafts/create',
        'handoffs/create'
      ]
    });
  }

  if (operation === 'project.search') {
    if (!bridgeCanRetrieveProject({ actor, bridgeByoCapabilities })) {
      throw Object.assign(new Error('This BYO actor cannot search project context.'), { status: 403 });
    }
    const results = await searchBridgeProjectCorpus({
      userId,
      query: payload.query || '',
      types: payload.types || [],
      limit: payload.limit || 20
    });
    return finalizeOperation({
      query: String(payload.query || '').trim(),
      results
    });
  }

  if (operation === 'project.read') {
    if (!bridgeCanRetrieveProject({ actor, bridgeByoCapabilities })) {
      throw Object.assign(new Error('This BYO actor cannot read project context.'), { status: 403 });
    }
    const item = await readBridgeProjectItem({
      userId,
      type: payload.type,
      id: payload.id || payload.itemId
    });
    return finalizeOperation({ item });
  }

  if (operation === 'project.write_draft') {
    operation = 'artifacts.drafts.create';
  }

  if (operation === 'threads.list') {
    const query = { userId };
    const status = String(payload.status || 'active').trim().toLowerCase();
    if (status !== 'all') query.status = normalizeThreadStatus(status, 'active');
    const scopeType = String(payload.scopeType || '').trim().toLowerCase();
    const scopeId = String(payload.scopeId || '').trim();
    const handoffId = String(payload.handoffId || '').trim();
    if (scopeType) query['scope.type'] = scopeType;
    if (scopeId) query['scope.id'] = scopeId;
    if (handoffId && mongoose.Types.ObjectId.isValid(handoffId)) query.handoffId = handoffId;
    const limit = safeAgentHandoffLimit(payload.limit, 50);
    const rows = await AgentThread.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
    return finalizeOperation({ threads: rows.map(sanitizeAgentThreadDoc) });
  }

  if (operation === 'threads.get') {
    const threadId = String(payload.threadId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      throw Object.assign(new Error('Invalid thread id.'), { status: 400 });
    }
    const thread = await AgentThread.findOne({ _id: threadId, userId });
    if (!thread) throw Object.assign(new Error('Thread not found.'), { status: 404 });
    return finalizeOperation({ thread: sanitizeAgentThreadDoc(thread) });
  }

  if (operation === 'threads.create') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot create shared threads.'), { status: 403 });
    }
    const planner = payload.planner && typeof payload.planner === 'object'
      ? sanitizeAgentPlanner(payload.planner)
      : buildAgentPlanner({
          taskType: payload?.scope?.metadata?.taskType || 'custom',
          requestedActor: actor
        });
    const thread = await AgentThread.create({
      userId,
      title: buildDefaultThreadTitle(payload.title || payload?.initialMessage?.text || 'Agent thread'),
      status: normalizeThreadStatus(payload.status, 'active'),
      summary: String(payload.summary || '').trim().slice(0, 280),
      scope: normalizeThreadScope(payload.scope || {}),
      createdBy: actor,
      lastActor: actor,
      handoffId: mongoose.Types.ObjectId.isValid(payload.handoffId) ? payload.handoffId : null,
      planner,
      plan: normalizeThreadPlan(payload.plan || {}),
      checkpoint: payload.checkpoint ? normalizeThreadCheckpoint({ ...(payload.checkpoint || {}), updatedBy: actor }) : undefined,
      messages: []
    });
    if (payload.initialMessage) {
      appendThreadMessage(thread, {
        ...normalizeThreadMessage(payload.initialMessage, payload.initialMessage?.role || 'user'),
        actor
      });
      compactThreadState(thread, { actor });
      await thread.save();
    }
    return finalizeOperation({ thread: sanitizeAgentThreadDoc(thread) });
  }

  if (operation === 'threads.update' || operation === 'threads.append_message') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot update shared threads.'), { status: 403 });
    }
    const threadId = String(payload.threadId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      throw Object.assign(new Error('Invalid thread id.'), { status: 400 });
    }
    const thread = await AgentThread.findOne({ _id: threadId, userId });
    if (!thread) throw Object.assign(new Error('Thread not found.'), { status: 404 });

    if (operation === 'threads.update') {
      if (payload.title !== undefined) thread.title = String(payload.title || '').trim().slice(0, 200);
      if (payload.status !== undefined) thread.status = normalizeThreadStatus(payload.status, thread.status || 'active');
      if (payload.summary !== undefined) thread.summary = String(payload.summary || '').trim().slice(0, 280);
      if (payload.plan !== undefined) thread.plan = normalizeThreadPlan(payload.plan || {});
      if (payload.planner !== undefined) thread.planner = payload.planner ? normalizeThreadPlanner(payload.planner) : undefined;
      if (payload.checkpoint !== undefined) {
        thread.checkpoint = payload.checkpoint ? normalizeThreadCheckpoint({ ...(payload.checkpoint || {}), updatedBy: actor }) : undefined;
      }
      thread.lastActor = actor;
      await thread.save();
      return finalizeOperation({ thread: sanitizeAgentThreadDoc(thread) });
    }

    appendThreadMessage(thread, {
      ...normalizeThreadMessage(payload.message || {}, payload?.message?.role || 'assistant'),
      actor
    });
    if (payload.plan !== undefined) thread.plan = normalizeThreadPlan(payload.plan || {});
    if (payload.planner !== undefined) thread.planner = payload.planner ? normalizeThreadPlanner(payload.planner) : thread.planner;
    if (payload.checkpoint !== undefined) {
      thread.checkpoint = payload.checkpoint ? normalizeThreadCheckpoint({ ...(payload.checkpoint || {}), updatedBy: actor }) : undefined;
    }
    compactThreadState(thread, { actor });
    await thread.save();
    return finalizeOperation({ thread: sanitizeAgentThreadDoc(thread) });
  }

  if (operation === 'threads.convert_to_handoff') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot convert shared threads to handoffs.'), { status: 403 });
    }
    const threadId = String(payload.threadId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      throw Object.assign(new Error('Invalid thread id.'), { status: 400 });
    }
    const thread = await AgentThread.findOne({ _id: threadId, userId });
    if (!thread) throw Object.assign(new Error('Thread not found.'), { status: 404 });

    if (thread.handoffId && mongoose.Types.ObjectId.isValid(String(thread.handoffId))) {
      const existingHandoff = await AgentHandoff.findOne({ _id: thread.handoffId, userId });
      if (existingHandoff) {
        return finalizeOperation({
          thread: sanitizeAgentThreadDoc(thread),
          handoff: sanitizeAgentHandoffDoc(existingHandoff),
          reused: true
        });
      }
    }

    const title = String(payload.title || thread.title || thread?.scope?.title || 'Thread handoff').trim().slice(0, 200);
    const taskType = normalizeAgentHandoffTaskType(payload.taskType || thread?.scope?.metadata?.taskType || 'custom', 'custom');
    const priority = normalizeAgentHandoffPriority(payload.priority, 'normal');
    const objective = String(
      payload.objective
      || thread?.checkpoint?.summary
      || thread?.summary
      || thread?.plan?.objective
      || title
    ).trim().slice(0, 4000);
    let requestedActor = null;
    let planner = null;
    const autoRoute = payload.autoRoute !== false;
    if (autoRoute) {
      const policy = await getUserAgentProtocolPolicy(String(userId));
      const routingPlan = await resolveAutoHandoffRequestedActor({
        userId: String(userId),
        taskType,
        policy,
        workerRole: payload?.planner?.activeWorkerRole || thread?.planner?.activeWorkerRole || ''
      });
      requestedActor = routingPlan.requestedActor;
      planner = routingPlan.planner;
    } else {
      requestedActor = await resolveAndValidateActorIdentity({
        userId,
        actor: payload.requestedActor || { actorType: 'native_agent', actorId: '' },
        fallbackType: 'native_agent'
      });
    }
    if (requestedActor.actorType === 'user' && !requestedActor.actorId) requestedActor.actorId = String(userId);
    const plan = normalizeThreadPlan(
      Array.isArray(thread?.plan?.steps) && thread.plan.steps.length > 0
        ? thread.plan
        : buildDefaultHandoffPlan({ taskType, title, objective })
    );
    const checkpoint = thread?.checkpoint
      ? normalizeThreadCheckpoint({ ...(thread.checkpoint || {}), updatedBy: actor })
      : buildDefaultHandoffCheckpoint({ title, requestedActor });
    const handoffPlanner = sanitizeAgentPlanner(
      payload.planner
      || planner
      || thread?.planner
      || buildAgentPlanner({ taskType, requestedActor, routePlanner: planner })
    );
    const handoff = await AgentHandoff.create({
      userId,
      title,
      taskType,
      objective,
      status: 'pending',
      priority,
      context: {
        ...(payload.context && typeof payload.context === 'object' ? payload.context : {}),
        sourceThread: {
          threadId: String(thread._id),
          scope: normalizeThreadScope(thread.scope || {}),
          summary: String(thread.summary || '').trim().slice(0, 280)
        }
      },
      input: {
        ...(payload.input && typeof payload.input === 'object' ? payload.input : {}),
        threadCheckpoint: checkpoint,
        threadPlan: plan
      },
      output: {},
      threadId: thread._id,
      planner: handoffPlanner,
      plan,
      checkpoint,
      requestedActor,
      createdBy: actor,
      events: [{
        eventType: 'created',
        actor,
        note: 'Converted from shared thread.',
        payload: { sourceThreadId: String(thread._id), requestedActor, planner: handoffPlanner }
      }]
    });
    thread.handoffId = handoff._id;
    thread.planner = handoffPlanner;
    appendThreadMessage(thread, {
      role: 'system',
      text: `Converted to handoff "${title}".`,
      actor,
      metadata: { eventType: 'handoff_created', handoffId: String(handoff._id), planner: handoffPlanner }
    });
    thread.checkpoint = normalizeThreadCheckpoint({
      summary: checkpoint.summary || thread.summary || `Linked to handoff "${title}".`,
      openQuestions: Array.isArray(checkpoint.openQuestions) ? checkpoint.openQuestions : [],
      nextActions: [`Open the linked handoff "${title}".`],
      updatedBy: actor
    });
    await thread.save();
    return finalizeOperation({
      thread: sanitizeAgentThreadDoc(thread),
      handoff: sanitizeAgentHandoffDoc(handoff),
      planner: handoffPlanner
    });
  }

  if (operation === 'artifacts.drafts.list') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.read && !bridgeByoCapabilities?.search) {
      throw Object.assign(new Error('This BYO actor cannot inspect shared artifact drafts.'), { status: 403 });
    }
    const query = { userId };
    const status = String(payload.status || 'pending').trim().toLowerCase();
    if (status && status !== 'all') {
      if (!['pending', 'promoted', 'dismissed'].includes(status)) {
        throw Object.assign(new Error('Invalid draft status filter.'), { status: 400 });
      }
      query.status = status;
    }
    const artifactType = String(payload.artifactType || '').trim().toLowerCase();
    if (artifactType) {
      if (!['note', 'concept', 'question', 'handoff'].includes(artifactType)) {
        throw Object.assign(new Error('Invalid artifactType filter.'), { status: 400 });
      }
      query.artifactType = artifactType;
    }
    const threadId = String(payload.threadId || '').trim();
    const handoffId = String(payload.handoffId || '').trim();
    if (threadId) query.sourceThreadId = threadId;
    if (handoffId) query.sourceHandoffId = handoffId;
    const limit = safeAgentHandoffLimit(payload.limit, 50);
    const rows = await AgentArtifactDraft.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
    return finalizeOperation({ drafts: rows.map(sanitizeAgentArtifactDraftDoc) });
  }

  if (operation === 'artifacts.drafts.create') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot create artifact drafts.'), { status: 403 });
    }
    const sourceThreadId = String(payload.sourceThreadId || payload.threadId || '').trim();
    const sourceHandoffId = String(payload.sourceHandoffId || payload.handoffId || '').trim();
    if (sourceThreadId) {
      if (!mongoose.Types.ObjectId.isValid(sourceThreadId)) {
        throw Object.assign(new Error('Invalid sourceThreadId.'), { status: 400 });
      }
      const thread = await AgentThread.findOne({ _id: sourceThreadId, userId });
      if (!thread) throw Object.assign(new Error('Source thread not found.'), { status: 404 });
    }
    if (sourceHandoffId) {
      if (!mongoose.Types.ObjectId.isValid(sourceHandoffId)) {
        throw Object.assign(new Error('Invalid sourceHandoffId.'), { status: 400 });
      }
      const handoff = await AgentHandoff.findOne({ _id: sourceHandoffId, userId });
      if (!handoff) throw Object.assign(new Error('Source handoff not found.'), { status: 404 });
    }
    const draft = await createAgentArtifactDraftRecord({
      AgentArtifactDraft,
      userId,
      actor,
      payload
    });
    if (!draft) {
      throw Object.assign(new Error('artifactType and body are required to create a draft.'), { status: 400 });
    }
    return finalizeOperation({ draft: sanitizeAgentArtifactDraftDoc(draft) });
  }

  if (operation === 'artifacts.drafts.promote' || operation === 'artifacts.drafts.dismiss') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges && !bridgeByoCapabilities?.executeWrites) {
      throw Object.assign(new Error('This BYO actor cannot mutate artifact drafts.'), { status: 403 });
    }
    const draftId = String(payload.draftId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(draftId)) {
      throw Object.assign(new Error('Invalid draft id.'), { status: 400 });
    }
    const draft = await AgentArtifactDraft.findOne({ _id: draftId, userId });
    if (!draft) throw Object.assign(new Error('Draft not found.'), { status: 404 });

    if (operation === 'artifacts.drafts.dismiss') {
      draft.status = 'dismissed';
      await draft.save();
      return finalizeOperation({ draft: sanitizeAgentArtifactDraftDoc(draft) });
    }

    if (String(draft.status || '') === 'promoted') {
      return finalizeOperation({ draft: sanitizeAgentArtifactDraftDoc(draft), reused: true });
    }

    const result = await promoteAgentArtifactDraftRecord({
      draft,
      userId,
      NotebookEntry,
      Question,
      updateConceptMeta,
      syncNotebookReferences,
      enqueueNotebookEmbedding,
      enqueueQuestionEmbedding,
      createBlockId,
      AgentHandoff,
      buildDefaultHandoffPlan,
      buildDefaultHandoffCheckpoint,
      createThreadForHandoff,
      sanitizeAgentHandoffDoc
    });
    return finalizeOperation({
      draft: sanitizeAgentArtifactDraftDoc(result.draft),
      promoted: result.promoted
    });
  }

  if (operation === 'handoffs.list') {
    const query = { userId };
    const status = String(payload.status || 'all').trim().toLowerCase();
    if (status !== 'all') {
      if (!AGENT_HANDOFF_STATUSES.has(status)) throw Object.assign(new Error('Invalid handoff status filter.'), { status: 400 });
      query.status = status;
    }
    const taskType = String(payload.taskType || '').trim().toLowerCase();
    if (taskType) {
      if (!AGENT_HANDOFF_TASK_TYPES.has(taskType)) throw Object.assign(new Error('Invalid taskType filter.'), { status: 400 });
      query.taskType = taskType;
    }
    Object.assign(query, buildHandoffActorFilter(actor, payload.scope || 'mine'));
    const limit = safeAgentHandoffLimit(payload.limit, 50);
    const rows = await AgentHandoff.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
    return finalizeOperation({ handoffs: rows.map(sanitizeAgentHandoffDoc) });
  }

  if (operation === 'handoffs.create') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot create protocol handoffs.'), { status: 403 });
    }
    const title = String(payload.title || '').trim();
    if (!title) throw Object.assign(new Error('title is required.'), { status: 400 });
    const taskType = normalizeAgentHandoffTaskType(payload.taskType, 'custom');
    const priority = normalizeAgentHandoffPriority(payload.priority, 'normal');
    const objective = String(payload.objective || '').trim().slice(0, 4000);
    const dueAt = parseOptionalDate(payload.dueAt);
    if (payload.dueAt && !dueAt) throw Object.assign(new Error('dueAt must be a valid date when provided.'), { status: 400 });

    const requestedActor = await resolveAndValidateActorIdentity({
      userId,
      actor: payload.requestedActor || { actorType: 'native_agent', actorId: '' },
      fallbackType: 'native_agent'
    });
    if (requestedActor.actorType === 'user' && !requestedActor.actorId) requestedActor.actorId = String(userId);

    const plan = buildDefaultHandoffPlan({ taskType, title, objective });
    const checkpoint = buildDefaultHandoffCheckpoint({ title, requestedActor });
    const handoffPlanner = sanitizeAgentPlanner(
      payload.planner || buildAgentPlanner({ taskType, requestedActor })
    );
    const handoff = await AgentHandoff.create({
      userId,
      title: title.slice(0, 200),
      taskType,
      objective,
      status: 'pending',
      priority,
      context: payload.context && typeof payload.context === 'object' ? payload.context : {},
      input: payload.input && typeof payload.input === 'object' ? payload.input : {},
      output: {},
      planner: handoffPlanner,
      plan,
      checkpoint,
      requestedActor,
      createdBy: actor,
      dueAt,
      events: [{
        eventType: 'created',
        actor,
        note: '',
        payload: { taskType, priority, requestedActor, planner: handoffPlanner }
      }]
    });
    const thread = await createThreadForHandoff({
      userId,
      title,
      objective,
      taskType,
      requestedActor,
      planner: handoffPlanner,
      createdBy: actor,
      handoffId: handoff._id
    });
    handoff.threadId = thread._id;
    await handoff.save();
    return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
  }

  const handoffId = String(payload.handoffId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(handoffId)) {
    throw Object.assign(new Error('Invalid handoff id.'), { status: 400 });
  }
  const handoff = await AgentHandoff.findOne({ _id: handoffId, userId });
  if (!handoff) throw Object.assign(new Error('Handoff not found.'), { status: 404 });

  if (operation === 'handoffs.ensure_thread') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot continue handoffs in shared threads.'), { status: 403 });
    }
    let thread = null;
    if (handoff.threadId && mongoose.Types.ObjectId.isValid(String(handoff.threadId))) {
      thread = await AgentThread.findOne({ _id: handoff.threadId, userId });
    }
    if (!thread) {
      thread = await createThreadForHandoff({
        userId,
        title: handoff.title || 'Handoff thread',
        objective: handoff.objective || handoff.checkpoint?.summary || '',
        taskType: handoff.taskType || 'custom',
        requestedActor: handoff.requestedActor || {},
        planner: handoff.planner || buildAgentPlanner({
          taskType: handoff.taskType || 'custom',
          requestedActor: handoff.requestedActor || {}
        }),
        createdBy: actor,
        handoffId: handoff._id
      });
      if (handoff.plan) thread.plan = handoff.plan;
      if (handoff.planner) thread.planner = handoff.planner;
      if (handoff.checkpoint) {
        thread.checkpoint = normalizeThreadCheckpoint({ ...(handoff.checkpoint || {}), updatedBy: actor });
      }
      await thread.save();
      handoff.threadId = thread._id;
      appendHandoffEvent(handoff, {
        eventType: 'note',
        actor,
        note: 'Continued in linked thread.'
      });
      await handoff.save();
    }
    return finalizeOperation({
      handoff: sanitizeAgentHandoffDoc(handoff),
      thread: sanitizeAgentThreadDoc(thread)
    });
  }

  if (operation === 'handoffs.claim') {
    if (handoff.status === 'claimed') {
      if (!canActorMutateClaimedHandoff(handoff, actor)) {
        throw Object.assign(new Error('Handoff is already claimed by a different actor.'), { status: 409 });
      }
      return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
    }
    if (handoff.status !== 'pending') {
      throw Object.assign(new Error(`Handoff is ${handoff.status || 'not pending'} and cannot be claimed.`), { status: 400 });
    }
    if (!canActorClaimHandoff(handoff, actor)) {
      throw Object.assign(new Error('This actor is not allowed to claim this handoff.'), { status: 403 });
    }
    handoff.status = 'claimed';
    handoff.claimedBy = actor;
    handoff.claimedAt = new Date();
    handoff.checkpoint = normalizeThreadCheckpoint({
      summary: `Claimed by ${actor.actorType}.`,
      nextActions: ['Continue the active plan step.'],
      updatedBy: actor
    });
    appendHandoffEvent(handoff, { eventType: 'claimed', actor, note: String(payload.note || '').trim() });
    await handoff.save();
    if (handoff.threadId) {
      const thread = await AgentThread.findOne({ _id: handoff.threadId, userId });
      if (thread) {
        appendThreadMessage(thread, {
          role: 'assistant',
          text: `Claimed handoff "${handoff.title || 'Untitled handoff'}".`,
          actor,
          metadata: { eventType: 'claimed' }
        });
        thread.checkpoint = normalizeThreadCheckpoint({
          summary: `Claimed by ${actor.actorType}.`,
          nextActions: ['Continue the active plan step.'],
          updatedBy: actor
        });
        await thread.save();
      }
    }
    return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
  }

  if (operation === 'handoffs.complete') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges && !bridgeByoCapabilities?.executeWrites) {
      throw Object.assign(new Error('This BYO actor cannot complete protocol handoffs.'), { status: 403 });
    }
    if (handoff.status !== 'claimed') throw Object.assign(new Error('Only claimed handoffs can be completed.'), { status: 400 });
    if (!canActorMutateClaimedHandoff(handoff, actor)) {
      throw Object.assign(new Error('Only the claiming actor can complete this handoff.'), { status: 403 });
    }
    const output = payload.output && typeof payload.output === 'object' ? payload.output : {};
    handoff.status = 'completed';
    handoff.output = output;
    handoff.completedBy = actor;
    handoff.completedAt = new Date();
    handoff.checkpoint = normalizeThreadCheckpoint({
      summary: `Completed with ${Object.keys(output).length > 0 ? 'an output artifact' : 'no structured artifact'}.`,
      nextActions: [],
      updatedBy: actor
    });
    appendHandoffEvent(handoff, {
      eventType: 'completed',
      actor,
      note: String(payload.note || '').trim(),
      payload: { hasOutput: Object.keys(output).length > 0 }
    });
    await handoff.save();
    if (handoff.threadId) {
      const thread = await AgentThread.findOne({ _id: handoff.threadId, userId });
      if (thread) {
        appendThreadMessage(thread, {
          role: 'assistant',
          text: String(payload.note || '').trim() || `Completed handoff "${handoff.title || 'Untitled handoff'}".`,
          actor,
          metadata: { eventType: 'completed', output }
        });
        thread.checkpoint = normalizeThreadCheckpoint({
          summary: `Completed by ${actor.actorType}.`,
          nextActions: [],
          updatedBy: actor
        });
        thread.status = 'archived';
        await thread.save();
      }
    }
    return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
  }

  if (operation === 'handoffs.reject') {
    if (!['pending', 'claimed'].includes(handoff.status)) {
      throw Object.assign(new Error(`Handoff is ${handoff.status || 'not rejectable'}.`), { status: 400 });
    }
    if (handoff.status === 'pending' && !canActorClaimHandoff(handoff, actor)) {
      throw Object.assign(new Error('This actor cannot reject this handoff.'), { status: 403 });
    }
    if (handoff.status === 'claimed' && !canActorMutateClaimedHandoff(handoff, actor)) {
      throw Object.assign(new Error('Only the claiming actor can reject this handoff.'), { status: 403 });
    }
    handoff.status = 'rejected';
    handoff.rejectedBy = actor;
    handoff.rejectedAt = new Date();
    handoff.checkpoint = normalizeThreadCheckpoint({
      summary: `Rejected by ${actor.actorType}.`,
      nextActions: ['Review the rejection note and reroute if needed.'],
      updatedBy: actor
    });
    appendHandoffEvent(handoff, { eventType: 'rejected', actor, note: String(payload.note || '').trim() });
    await handoff.save();
    if (handoff.threadId) {
      const thread = await AgentThread.findOne({ _id: handoff.threadId, userId });
      if (thread) {
        appendThreadMessage(thread, {
          role: 'assistant',
          text: String(payload.note || '').trim() || `Rejected handoff "${handoff.title || 'Untitled handoff'}".`,
          actor,
          metadata: { eventType: 'rejected' }
        });
        thread.checkpoint = normalizeThreadCheckpoint({
          summary: `Rejected by ${actor.actorType}.`,
          nextActions: ['Review the rejection note and reroute if needed.'],
          updatedBy: actor
        });
        await thread.save();
      }
    }
    return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
  }

  throw Object.assign(new Error('Unsupported bridge operation.'), { status: 400 });
};

const listProtocolApprovals = async ({
  userId,
  status = 'pending',
  limit = 30,
  threadId = '',
  handoffId = '',
  op = ''
}) => {
  const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(String(userId)) : null;
  if (!userObjectId) throw Object.assign(new Error('userId must be a valid ObjectId.'), { status: 400 });
  const query = { userId: userObjectId };
  const safeStatus = String(status || 'pending').trim().toLowerCase();
  if (safeStatus && safeStatus !== 'all') {
    query.status = safeStatus;
  }
  const safeThreadId = String(threadId || '').trim();
  const safeHandoffId = String(handoffId || '').trim();
  const safeOp = String(op || '').trim().toLowerCase();
  if (safeThreadId) query['preview.threadId'] = safeThreadId;
  if (safeHandoffId) query['preview.handoffId'] = safeHandoffId;
  if (safeOp) query.op = safeOp;
  const safeLimit = safeAgentHandoffLimit(limit, 30);
  const rows = await AgentProtocolApproval.find(query).sort({ createdAt: -1 }).limit(safeLimit);
  return rows.map(sanitizeProtocolApprovalDoc);
};

const listProtocolHookRuns = async ({
  userId,
  phase = '',
  op = '',
  threadId = '',
  handoffId = '',
  limit = 30
}) => {
  const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(String(userId)) : null;
  if (!userObjectId) throw Object.assign(new Error('userId must be a valid ObjectId.'), { status: 400 });
  const query = { userId: userObjectId };
  const safePhase = String(phase || '').trim().toLowerCase();
  const safeOp = String(op || '').trim().toLowerCase();
  const safeThreadId = String(threadId || '').trim();
  const safeHandoffId = String(handoffId || '').trim();
  if (safePhase) query.phase = safePhase;
  if (safeOp) query.op = safeOp;
  if (safeThreadId) query.threadId = safeThreadId;
  if (safeHandoffId) query.handoffId = safeHandoffId;
  const safeLimit = safeAgentHandoffLimit(limit, 30);
  const rows = await AgentProtocolHookRun.find(query).sort({ createdAt: -1 }).limit(safeLimit);
  return rows.map(sanitizeProtocolHookRunDoc);
};

const approveProtocolApproval = async ({
  userId,
  approvalId,
  actorType = 'user',
  actorId = ''
}) => {
  const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(String(userId)) : null;
  const approvalObjectId = mongoose.Types.ObjectId.isValid(approvalId) ? new mongoose.Types.ObjectId(String(approvalId)) : null;
  if (!userObjectId) throw Object.assign(new Error('userId must be a valid ObjectId.'), { status: 400 });
  if (!approvalObjectId) throw Object.assign(new Error('approvalId must be a valid ObjectId.'), { status: 400 });

  const approval = await AgentProtocolApproval.findOne({ _id: approvalObjectId, userId: userObjectId });
  if (!approval) throw Object.assign(new Error('Protocol approval request not found.'), { status: 404 });
  if (String(approval.status || '') !== 'pending') {
    throw Object.assign(new Error(`Protocol approval request is ${approval.status || 'not pending'}.`), { status: 400 });
  }

  approval.status = 'approved';
  approval.approvedAt = new Date();
  approval.approvedBy = {
    actorType: normalizeAgentActorType(actorType, 'user'),
    actorId: String(actorId || userId || '').trim()
  };
  await approval.save();

  try {
    const approvalOp = String(approval.op || '').trim().toLowerCase();
    if (approvalOp === MEMORY_APPROVAL_OP) {
      const result = await executeMemoryCommitApproval({
        WorkingMemoryItem,
        approval
      });
      approval.status = 'executed';
      approval.executedAt = new Date();
      approval.result = result && typeof result === 'object'
        ? {
            createdCount: Number(result.createdCount || 0),
            skippedExistingCount: Number(result.skippedExistingCount || 0),
            itemCount: Number(result.itemCount || 0)
          }
        : {};
      await approval.save();
      return {
        approval: sanitizeProtocolApprovalDoc(approval),
        result: approval.result
      };
    }
    if (approvalOp === 'runs.resume') {
      const runId = String(approval.payload?.runId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(runId)) {
        throw Object.assign(new Error('Run approval payload is missing a valid run id.'), { status: 400 });
      }
      const runDoc = await AgentRun.findOne({ _id: runId, userId: userObjectId });
      if (!runDoc) throw Object.assign(new Error('Run not found for approval replay.'), { status: 404 });
      const thread = await AgentThread.findOne({ _id: runDoc.threadId, userId: userObjectId });
      if (!thread) throw Object.assign(new Error('Thread not found for run approval replay.'), { status: 404 });

      const advanced = await executeAgentRun({
        run: {
          ...runDoc.toObject({ getters: false, virtuals: false }),
          runId: String(runDoc._id)
        },
        thread,
        userId: String(userId),
        actor: {
          actorType: approval.requestedBy?.actorType || 'native_agent',
          actorId: approval.requestedBy?.actorId || ''
        },
        approveBlockedStep: true,
        AgentHandoff,
        buildDefaultHandoffPlan,
        buildDefaultHandoffCheckpoint,
        createThreadForHandoff,
        sanitizeAgentHandoffDoc,
        requestStepApproval: ({ run, step, thread: runThread, actor }) => requestRunStepApproval({
          AgentProtocolApproval,
          userId: String(userId),
          run,
          step,
          thread: runThread,
          actor
        })
      });

      runDoc.status = advanced.status;
      runDoc.lastActor = advanced.lastActor;
      runDoc.currentOpId = advanced.currentOpId;
      runDoc.blockedOpId = advanced.blockedOpId;
      runDoc.steps = advanced.steps;
      runDoc.completedStepCount = advanced.completedStepCount;
      runDoc.startedAt = advanced.startedAt;
      runDoc.pausedAt = advanced.pausedAt;
      runDoc.completedAt = advanced.completedAt;
      await runDoc.save();

      await createProposedChangesForRun({
        AgentProposedChange,
        TagMeta,
        NotebookEntry,
        userId: String(userId),
        thread,
        run: {
          ...advanced,
          runId: String(runDoc._id)
        },
        actor: {
          actorType: approval.requestedBy?.actorType || 'native_agent',
          actorId: approval.requestedBy?.actorId || ''
        }
      });

      const reconciledRun = await reconcileAgentRunState({
        AgentRun,
        AgentProposedChange,
        userId: String(userId),
        runId: String(runDoc._id)
      });

      applyProposalBundleRunOutcome({
        thread,
        run: {
          ...(reconciledRun?.toObject ? reconciledRun.toObject({ getters: false, virtuals: false }) : reconciledRun || advanced),
          runId: String(runDoc._id)
        }
      });
      await thread.save();

      const result = {
        run: sanitizeAgentRunDoc(reconciledRun || runDoc),
        thread: sanitizeAgentThreadDoc(thread)
      };
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES.AGENT_RUN_APPROVAL_APPROVED,
        userId: String(userId),
        properties: {
          threadId: String(thread?._id || ''),
          approvalId: String(approval._id || ''),
          runId: String(runDoc._id || '')
        }
      });
      trackRunLifecycleEvents({
        trackEvent,
        EVENT_NAMES,
        userId: String(userId),
        threadId: String(thread?._id || ''),
        run: reconciledRun || runDoc,
        source: 'protocol_approval_resume',
        includeStarted: false
      });
      approval.status = 'executed';
      approval.executedAt = new Date();
      approval.result = result;
      await approval.save();
      return {
        approval: sanitizeProtocolApprovalDoc(approval),
        result
      };
    }

    const result = await runBridgeHandoffOperation({
      bridgeActor: {
        userId: String(userId),
        actorType: approval.requestedBy?.actorType || 'native_agent',
        actorId: approval.requestedBy?.actorId || '',
        scope: String(approval.scope || 'agent_ops')
      },
      op: String(approval.op || '').trim(),
      payload: {
        ...(approval.payload && typeof approval.payload === 'object' ? approval.payload : {}),
        __bypassProtocolApproval: true
      },
      executionSource: 'approval_replay',
      approvalId: String(approval._id || '')
    });
    approval.status = 'executed';
    approval.executedAt = new Date();
    approval.result = result && typeof result === 'object' ? result : {};
    await approval.save();
    return {
      approval: sanitizeProtocolApprovalDoc(approval),
      result
    };
  } catch (error) {
    approval.status = 'pending';
    approval.approvedAt = null;
    approval.approvedBy = undefined;
    await approval.save();
    throw error;
  }
};

const rejectProtocolApproval = async ({
  userId,
  approvalId,
  actorType = 'user',
  actorId = '',
  note = ''
}) => {
  const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(String(userId)) : null;
  const approvalObjectId = mongoose.Types.ObjectId.isValid(approvalId) ? new mongoose.Types.ObjectId(String(approvalId)) : null;
  if (!userObjectId) throw Object.assign(new Error('userId must be a valid ObjectId.'), { status: 400 });
  if (!approvalObjectId) throw Object.assign(new Error('approvalId must be a valid ObjectId.'), { status: 400 });

  const approval = await AgentProtocolApproval.findOne({ _id: approvalObjectId, userId: userObjectId });
  if (!approval) throw Object.assign(new Error('Protocol approval request not found.'), { status: 404 });
  if (String(approval.status || '') !== 'pending') {
    throw Object.assign(new Error(`Protocol approval request is ${approval.status || 'not pending'}.`), { status: 400 });
  }
  approval.status = 'rejected';
  approval.rejectedAt = new Date();
  approval.rejectedBy = {
    actorType: normalizeAgentActorType(actorType, 'user'),
    actorId: String(actorId || userId || '').trim()
  };
  approval.decisionNote = String(note || '').trim().slice(0, 1000);
  const approvalOp = String(approval.op || '').trim().toLowerCase();
  if (approvalOp === 'runs.resume') {
    const runId = String(approval.payload?.runId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(runId)) {
      throw Object.assign(new Error('Run approval payload is missing a valid run id.'), { status: 400 });
    }
    const runDoc = await AgentRun.findOne({ _id: runId, userId: userObjectId });
    if (!runDoc) throw Object.assign(new Error('Run not found for approval rejection.'), { status: 404 });

    const dismissed = dismissBlockedRunStep({
      run: {
        ...runDoc.toObject({ getters: false, virtuals: false }),
        runId: String(runDoc._id)
      },
      approvalId: String(approval._id)
    });

    runDoc.status = dismissed.status;
    runDoc.lastActor = dismissed.lastActor;
    runDoc.currentOpId = dismissed.currentOpId;
    runDoc.blockedOpId = dismissed.blockedOpId;
    runDoc.steps = dismissed.steps;
    runDoc.completedStepCount = dismissed.completedStepCount;
    runDoc.startedAt = dismissed.startedAt;
    runDoc.pausedAt = dismissed.pausedAt;
    runDoc.completedAt = dismissed.completedAt;
    await runDoc.save();

    const reconciledRun = await reconcileAgentRunState({
      AgentRun,
      AgentProposedChange,
      userId: String(userId),
      runId: String(runDoc._id)
    });

    const thread = await AgentThread.findOne({ _id: runDoc.threadId, userId: userObjectId });
    if (thread) {
      applyProposalBundleRunOutcome({
        thread,
        run: {
          ...(reconciledRun?.toObject ? reconciledRun.toObject({ getters: false, virtuals: false }) : runDoc.toObject({ getters: false, virtuals: false })),
          runId: String(runDoc._id)
        }
      });
      await thread.save();
    }
    trackHarnessEvent({
      trackEvent,
      event: EVENT_NAMES.AGENT_RUN_APPROVAL_REJECTED,
      userId: String(userId),
      properties: {
        threadId: String(thread?._id || ''),
        approvalId: String(approval._id || ''),
        runId: String(runDoc._id || '')
      }
    });
    trackRunLifecycleEvents({
      trackEvent,
      EVENT_NAMES,
      userId: String(userId),
      threadId: String(thread?._id || ''),
      run: reconciledRun || runDoc,
      source: 'protocol_approval_rejection',
      includeStarted: false
    });
    approval.result = {
      run: sanitizeAgentRunDoc(reconciledRun || runDoc)
    };
  }
  await approval.save();
  return sanitizeProtocolApprovalDoc(approval);
};

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

const parseClaimId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const mapHighlightWithArticle = (article, highlight) => (
  serializeHighlightWithArticle(article, highlight, {
    includeAnchor: true,
    normalizeItemType
  })
);

const findHighlightById = async (userId, highlightId) => {
  if (!mongoose.Types.ObjectId.isValid(highlightId)) return null;
  const matches = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': new mongoose.Types.ObjectId(highlightId) } },
    { $project: {
      _id: '$highlights._id',
      text: '$highlights.text',
      note: '$highlights.note',
      tags: '$highlights.tags',
      type: '$highlights.type',
      claimId: '$highlights.claimId',
      articleId: '$_id',
      articleTitle: '$title',
      createdAt: '$highlights.createdAt'
    } }
  ]);
  return matches[0] || null;
};

const BOARD_SCOPE_TYPES = new Set(['concept', 'question']);
const BOARD_ITEM_TYPES = new Set(['note', 'highlight', 'article']);
const BOARD_ITEM_ROLES = new Set(['idea', 'claim', 'evidence']);
const BOARD_EDGE_RELATIONS = new Set(['supports', 'contradicts', 'explains', 'example']);

const normalizeBoardScopeType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!BOARD_SCOPE_TYPES.has(candidate)) return '';
  return candidate;
};

const normalizeBoardScopeId = (scopeType, value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (scopeType === 'concept') return raw.toLowerCase();
  return raw;
};

const normalizeBoardItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!BOARD_ITEM_TYPES.has(candidate)) return '';
  return candidate;
};

const normalizeBoardItemRole = (value, fallback = 'idea') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (BOARD_ITEM_ROLES.has(candidate)) return candidate;
  return fallback;
};

const normalizeBoardRelation = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!BOARD_EDGE_RELATIONS.has(candidate)) return '';
  return candidate;
};

const normalizeBoardNumber = (value, fallback, { min = 0, max = 10000 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const resolveBoardItemPayload = async ({ userId, type, sourceId, text }) => {
  const safeSourceId = String(sourceId || '').trim();
  const safeText = String(text || '').trim();
  if (!safeSourceId) {
    return { sourceId: '', text: safeText, noteId: '', articleId: '', highlightId: '' };
  }

  if (type === 'highlight') {
    const highlight = await findHighlightById(userId, safeSourceId);
    if (!highlight) return null;
    return {
      sourceId: String(highlight._id),
      text: safeText || highlight.text || '',
      noteId: '',
      articleId: '',
      highlightId: String(highlight._id)
    };
  }

  if (type === 'note') {
    if (!mongoose.Types.ObjectId.isValid(safeSourceId)) return null;
    const note = await NotebookEntry.findOne({ _id: safeSourceId, userId }).select('title content blocks');
    if (!note) return null;
    const blockText = Array.isArray(note.blocks)
      ? note.blocks.map(block => String(block?.text || '').trim()).filter(Boolean).join(' ')
      : '';
    return {
      sourceId: String(note._id),
      text: safeText || note.title || blockText || '',
      noteId: String(note._id),
      articleId: '',
      highlightId: ''
    };
  }

  if (type === 'article') {
    if (!mongoose.Types.ObjectId.isValid(safeSourceId)) return null;
    const article = await Article.findOne({ _id: safeSourceId, userId }).select('title');
    if (!article) return null;
    return {
      sourceId: String(article._id),
      text: safeText || article.title || '',
      noteId: '',
      articleId: String(article._id),
      highlightId: ''
    };
  }

  return null;
};

const ensureBoardOwnership = async (userId, boardId) => {
  if (!mongoose.Types.ObjectId.isValid(boardId)) return null;
  return Board.findOne({ _id: boardId, userId });
};

const WORKING_MEMORY_STATUSES = new Set(['active', 'archived']);
const WORKING_MEMORY_PROMOTE_TARGETS = new Set(['notebook', 'concept', 'question']);

const normalizeWorkingMemoryStatus = (value, fallback = 'active') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (WORKING_MEMORY_STATUSES.has(candidate)) return candidate;
  return fallback;
};

const normalizeWorkingMemoryTarget = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (WORKING_MEMORY_PROMOTE_TARGETS.has(candidate)) return candidate;
  return '';
};

const normalizeWorkingMemoryIds = (value) => {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const ids = [];
  values.forEach(raw => {
    const id = String(raw || '').trim();
    if (!id || seen.has(id) || !mongoose.Types.ObjectId.isValid(id)) return;
    seen.add(id);
    ids.push(new mongoose.Types.ObjectId(id));
  });
  return ids;
};

const activeWorkingMemoryStatusFilter = () => ({
  $or: [
    { status: 'active' },
    { status: { $exists: false } }
  ]
});

const parseWorkingMemoryTags = (value) => {
  if (Array.isArray(value)) return normalizeTags(value).slice(0, 20);
  const text = String(value || '').trim();
  if (!text) return [];
  return normalizeTags(text.split(',')).slice(0, 20);
};

const splitWorkingMemoryText = (value, mode = 'sentence') => {
  const text = String(value || '').replace(/\r/g, '\n').trim();
  if (!text) return [];
  const safeMode = String(mode || 'sentence').trim().toLowerCase();
  const chunks = safeMode === 'newline'
    ? text.split(/\n+/)
    : text.split(/(?<=[.!?])\s+|\n+/);
  return chunks
    .map(chunk => String(chunk || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 40);
};

const buildWorkingMemoryNotebookTitle = (text = '') => {
  const clean = stripHtml(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Working memory extract';
  const words = clean.split(' ').slice(0, 8).join(' ');
  return words.length > 80 ? `${words.slice(0, 80).trim()}...` : words;
};

const archiveWorkingMemoryItems = async ({
  userId,
  itemIds = [],
  reason = 'archived'
}) => {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { matchedCount: 0, modifiedCount: 0 };
  }
  return WorkingMemoryItem.updateMany(
    {
      _id: { $in: itemIds },
      userId,
      ...activeWorkingMemoryStatusFilter()
    },
    {
      $set: {
        status: 'archived',
        processedAt: new Date(),
        processedReason: String(reason || 'archived').trim().slice(0, 120)
      }
    }
  );
};

const unarchiveWorkingMemoryItems = async ({
  userId,
  itemIds = []
}) => {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { matchedCount: 0, modifiedCount: 0 };
  }
  return WorkingMemoryItem.updateMany(
    {
      _id: { $in: itemIds },
      userId,
      status: 'archived'
    },
    {
      $set: {
        status: 'active',
        processedAt: null,
        processedReason: ''
      }
    }
  );
};

const RETURN_QUEUE_ITEM_TYPES = new Set(['highlight', 'notebook', 'question', 'concept', 'article']);

const normalizeReturnQueueItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (RETURN_QUEUE_ITEM_TYPES.has(candidate)) return candidate;
  return '';
};

const UI_SETTINGS_DEFAULTS = Object.freeze({
  typographyScale: 'default',
  density: 'comfortable',
  theme: 'light',
  accent: 'blue',
  brandEnergy: true
});

const UI_SETTINGS_TYPOGRAPHY_VALUES = new Set(['small', 'default', 'large']);
const UI_SETTINGS_DENSITY_VALUES = new Set(['comfortable', 'compact']);
const UI_SETTINGS_THEME_VALUES = new Set(['light', 'dark']);
const UI_SETTINGS_ACCENT_VALUES = new Set(['blue', 'emerald', 'amber', 'rose']);
const UI_SETTINGS_SCOPE_TYPE_VALUES = new Set(['global', 'workspace', 'concept', 'question', 'notebook']);

const normalizeUiSettingsValue = (value, allowedValues, fallbackValue) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (allowedValues.has(candidate)) return candidate;
  return fallbackValue;
};

const normalizeUiSettingsScope = (workspaceType, workspaceId) => {
  const safeWorkspaceTypeCandidate = String(workspaceType || 'global').trim().toLowerCase();
  const safeWorkspaceType = UI_SETTINGS_SCOPE_TYPE_VALUES.has(safeWorkspaceTypeCandidate)
    ? safeWorkspaceTypeCandidate
    : 'global';
  if (safeWorkspaceType === 'global') {
    return { workspaceType: 'global', workspaceId: '' };
  }
  return {
    workspaceType: safeWorkspaceType,
    workspaceId: String(workspaceId || '').trim().slice(0, 120)
  };
};

const normalizeUiSettingsPayload = (input = {}) => ({
  typographyScale: normalizeUiSettingsValue(
    input.typographyScale,
    UI_SETTINGS_TYPOGRAPHY_VALUES,
    UI_SETTINGS_DEFAULTS.typographyScale
  ),
  density: normalizeUiSettingsValue(
    input.density,
    UI_SETTINGS_DENSITY_VALUES,
    UI_SETTINGS_DEFAULTS.density
  ),
  theme: normalizeUiSettingsValue(
    input.theme,
    UI_SETTINGS_THEME_VALUES,
    UI_SETTINGS_DEFAULTS.theme
  ),
  accent: normalizeUiSettingsValue(
    input.accent,
    UI_SETTINGS_ACCENT_VALUES,
    UI_SETTINGS_DEFAULTS.accent
  ),
  brandEnergy: typeof input.brandEnergy === 'boolean'
    ? input.brandEnergy
    : (String(input.brandEnergy || '').trim().toLowerCase() === 'false'
      ? false
      : (String(input.brandEnergy || '').trim().toLowerCase() === 'true'
        ? true
        : UI_SETTINGS_DEFAULTS.brandEnergy))
});

const buildUiSettingsResponse = (doc, scope = { workspaceType: 'global', workspaceId: '' }) => {
  const normalized = normalizeUiSettingsPayload(doc || {});
  return {
    ...UI_SETTINGS_DEFAULTS,
    ...normalized,
    workspaceType: scope.workspaceType || 'global',
    workspaceId: scope.workspaceId || ''
  };
};

const TOUR_STEP_IDS = Object.freeze([
  'install_extension',
  'capture_first_highlight',
  'create_concept_from_highlight',
  'organize_workspace',
  'semantic_search'
]);

const TOUR_STATUSES = new Set(['not_started', 'in_progress', 'paused', 'completed']);

const TOUR_SIGNAL_DEFAULTS = Object.freeze({
  extensionConnected: false,
  firstHighlightCaptured: false,
  conceptFromHighlight: false,
  workspaceOrganized: false,
  semanticSearchUsed: false
});

const TOUR_EVENT_TIMESTAMP_DEFAULTS = Object.freeze({
  extension_connected: null,
  highlight_captured: null,
  concept_from_highlight: null,
  workspace_organized: null,
  semantic_search_used: null
});

const TOUR_SIGNAL_TO_STEP = Object.freeze({
  extensionConnected: 'install_extension',
  firstHighlightCaptured: 'capture_first_highlight',
  conceptFromHighlight: 'create_concept_from_highlight',
  workspaceOrganized: 'organize_workspace',
  semanticSearchUsed: 'semantic_search'
});

const TOUR_EVENT_TO_SIGNAL = Object.freeze({
  extension_connected: 'extensionConnected',
  highlight_captured: 'firstHighlightCaptured',
  concept_from_highlight: 'conceptFromHighlight',
  workspace_organized: 'workspaceOrganized',
  semantic_search_used: 'semanticSearchUsed'
});

const getNextTourStepId = (completedStepIds = []) => {
  const completed = new Set((completedStepIds || []).map(value => String(value || '').trim()));
  return TOUR_STEP_IDS.find(stepId => !completed.has(stepId)) || null;
};

const normalizeTourStatus = (value, fallback = 'not_started') => {
  const candidate = String(value || '').trim().toLowerCase();
  return TOUR_STATUSES.has(candidate) ? candidate : fallback;
};

const normalizeTourCurrentStepId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const candidate = String(value).trim();
  return TOUR_STEP_IDS.includes(candidate) ? candidate : null;
};

const normalizeTourSignals = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    extensionConnected: Boolean(source.extensionConnected),
    firstHighlightCaptured: Boolean(source.firstHighlightCaptured),
    conceptFromHighlight: Boolean(source.conceptFromHighlight),
    workspaceOrganized: Boolean(source.workspaceOrganized),
    semanticSearchUsed: Boolean(source.semanticSearchUsed)
  };
};

const normalizeTourCompletedStepIds = (input = []) => {
  const source = Array.isArray(input) ? input : [];
  const unique = new Set();
  source.forEach((value) => {
    const candidate = String(value || '').trim();
    if (TOUR_STEP_IDS.includes(candidate)) {
      unique.add(candidate);
    }
  });
  return TOUR_STEP_IDS.filter(stepId => unique.has(stepId));
};

const deriveCompletedStepIdsFromSignals = (signalsInput = {}) => {
  const signals = normalizeTourSignals(signalsInput);
  const completed = [];
  Object.entries(TOUR_SIGNAL_TO_STEP).forEach(([signalKey, stepId]) => {
    if (signals[signalKey]) completed.push(stepId);
  });
  return normalizeTourCompletedStepIds(completed);
};

const normalizeTourEventTimestamps = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const next = { ...TOUR_EVENT_TIMESTAMP_DEFAULTS };
  Object.keys(next).forEach((key) => {
    const value = source[key];
    if (!value) return;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      next[key] = parsed.toISOString();
    }
  });
  return next;
};

const isTourStateEmpty = (doc) => {
  if (!doc) return true;
  const completed = normalizeTourCompletedStepIds(doc.completedStepIds || []);
  const signals = normalizeTourSignals(doc.signals || {});
  const hasAnySignal = Object.values(signals).some(Boolean);
  const hasCurrentStep = Boolean(normalizeTourCurrentStepId(doc.currentStepId));
  const status = normalizeTourStatus(doc.status, 'not_started');
  return !hasAnySignal
    && completed.length === 0
    && !hasCurrentStep
    && !doc.startedAt
    && !doc.completedAt
    && status === 'not_started';
};

const buildTourStateResponse = (doc, options = {}) => {
  const safeDoc = doc && typeof doc === 'object' ? doc : {};
  const signals = normalizeTourSignals(safeDoc.signals || {});
  const completedFromSignals = deriveCompletedStepIdsFromSignals(signals);
  const completedExplicit = normalizeTourCompletedStepIds(safeDoc.completedStepIds || []);
  const mergedCompleted = normalizeTourCompletedStepIds([...completedExplicit, ...completedFromSignals]);
  const completedAll = mergedCompleted.length === TOUR_STEP_IDS.length;
  const rawStatus = normalizeTourStatus(safeDoc.status, 'not_started');
  const status = completedAll ? 'completed' : rawStatus;
  const currentStepId = status === 'completed'
    ? null
    : (status === 'not_started'
      ? null
      : (normalizeTourCurrentStepId(safeDoc.currentStepId) || getNextTourStepId(mergedCompleted)));
  const isFirstTimeVisitor = options.isFirstTimeVisitor !== undefined
    ? Boolean(options.isFirstTimeVisitor)
    : isTourStateEmpty(safeDoc);

  return {
    status,
    currentStepId,
    completedStepIds: mergedCompleted,
    isFirstTimeVisitor,
    signals,
    eventTimestamps: normalizeTourEventTimestamps(safeDoc.eventTimestamps || {}),
    startedAt: safeDoc.startedAt ? new Date(safeDoc.startedAt).toISOString() : null,
    completedAt: safeDoc.completedAt ? new Date(safeDoc.completedAt).toISOString() : null,
    updatedAt: safeDoc.updatedAt ? new Date(safeDoc.updatedAt).toISOString() : null
  };
};

const getOrCreateTourState = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  return TourState.findOneAndUpdate(
    { userId: userObjectId },
    {
      $setOnInsert: {
        status: 'not_started',
        currentStepId: null,
        completedStepIds: [],
        signals: { ...TOUR_SIGNAL_DEFAULTS },
        eventTimestamps: { ...TOUR_EVENT_TIMESTAMP_DEFAULTS },
        startedAt: null,
        completedAt: null
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
};

const markTourSignal = async (userId, signalKey, eventType = null) => {
  if (!Object.prototype.hasOwnProperty.call(TOUR_SIGNAL_DEFAULTS, signalKey)) return null;
  const state = await getOrCreateTourState(userId);
  const signals = normalizeTourSignals(state.signals || {});
  const alreadySet = Boolean(signals[signalKey]);
  if (!alreadySet) {
    signals[signalKey] = true;
  }
  const completedStepIds = deriveCompletedStepIdsFromSignals(signals);
  const now = new Date();
  const nextStatus = completedStepIds.length === TOUR_STEP_IDS.length
    ? 'completed'
    : (state.status === 'not_started' ? 'in_progress' : normalizeTourStatus(state.status, 'in_progress'));
  const existingEventTimestamps = state.eventTimestamps?.toObject
    ? state.eventTimestamps.toObject()
    : (state.eventTimestamps || {});
  const nextEventTimestamps = {
    ...TOUR_EVENT_TIMESTAMP_DEFAULTS,
    ...existingEventTimestamps
  };
  if (eventType && Object.prototype.hasOwnProperty.call(nextEventTimestamps, eventType) && !nextEventTimestamps[eventType]) {
    nextEventTimestamps[eventType] = now;
  }

  state.signals = signals;
  state.completedStepIds = completedStepIds;
  state.status = nextStatus;
  state.currentStepId = nextStatus === 'completed'
    ? null
    : getNextTourStepId(completedStepIds);
  state.startedAt = state.startedAt || now;
  state.completedAt = nextStatus === 'completed' ? (state.completedAt || now) : null;
  state.eventTimestamps = nextEventTimestamps;
  await state.save();
  return state;
};

const parseDueAt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const buildUnavailableQueueItem = () => ({
  title: 'Unavailable item',
  snippet: 'This item could not be loaded.',
  openPath: '',
  exists: false
});

const decodeBasicHtmlEntities = (value = '') => (
  String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
);

const buildQueueSnippet = (...values) => {
  const first = values.find(value => String(value || '').trim());
  const clean = decodeBasicHtmlEntities(stripHtml(first || ''));
  return clean.slice(0, 280);
};

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CONCEPT_LAYOUT_CARD_TYPES = new Set(['highlight', 'article', 'note', 'question']);
const CONCEPT_LAYOUT_CARD_ROLES = new Set(['idea', 'claim', 'evidence']);
const CONCEPT_LAYOUT_CONNECTION_TYPES = new Set(['supports', 'contradicts', 'related']);

const makeConceptLayoutId = (prefix = 'id') => (
  `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Math.random().toString(36).slice(2, 9)}-${Date.now()}`}`
);

const createDefaultConceptLayout = () => ({
  sections: [
    { id: makeConceptLayoutId('section'), title: 'Claims', description: '', cardIds: [] },
    { id: makeConceptLayoutId('section'), title: 'Evidence', description: '', cardIds: [] },
    { id: makeConceptLayoutId('section'), title: 'Examples', description: '', cardIds: [] },
    { id: makeConceptLayoutId('section'), title: 'Questions', description: '', cardIds: [] },
    { id: makeConceptLayoutId('section'), title: 'To verify', description: '', cardIds: [] }
  ],
  cards: [],
  connections: []
});

const normalizeConceptLayoutCardType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!CONCEPT_LAYOUT_CARD_TYPES.has(candidate)) return '';
  return candidate;
};

const normalizeConceptLayoutCardRole = (value, fallback = 'idea') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (CONCEPT_LAYOUT_CARD_ROLES.has(candidate)) return candidate;
  return fallback;
};

const normalizeConceptLayoutConnectionType = (value, fallback = 'related') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (CONCEPT_LAYOUT_CONNECTION_TYPES.has(candidate)) return candidate;
  return fallback;
};

const normalizeConceptLayout = (input = {}, options = {}) => {
  const base = options.baseLayout && typeof options.baseLayout === 'object'
    ? options.baseLayout
    : createDefaultConceptLayout();
  const source = input && typeof input === 'object' ? input : {};

  const cards = [];
  const cardIds = new Set();
  const incomingCards = Array.isArray(source.cards) ? source.cards : [];
  incomingCards.forEach((rawCard) => {
    if (!rawCard || typeof rawCard !== 'object') return;
    const itemType = normalizeConceptLayoutCardType(rawCard.itemType);
    const itemId = String(rawCard.itemId || '').trim();
    if (!itemType || !itemId) return;
    let id = String(rawCard.id || '').trim() || makeConceptLayoutId('card');
    if (cardIds.has(id)) id = makeConceptLayoutId('card');
    cardIds.add(id);
    cards.push({
      id,
      itemType,
      itemId,
      role: normalizeConceptLayoutCardRole(rawCard.role),
      title: String(rawCard.title || '').trim().slice(0, 220),
      snippet: String(rawCard.snippet || '').trim().slice(0, 4000),
      createdAt: rawCard.createdAt ? new Date(rawCard.createdAt) : new Date()
    });
  });

  const sections = [];
  const sectionIds = new Set();
  const incomingSections = Array.isArray(source.sections) && source.sections.length > 0
    ? source.sections
    : (Array.isArray(base.sections) ? base.sections : []);
  incomingSections.forEach((rawSection, index) => {
    if (!rawSection || typeof rawSection !== 'object') return;
    let id = String(rawSection.id || '').trim() || makeConceptLayoutId('section');
    if (sectionIds.has(id)) id = makeConceptLayoutId('section');
    sectionIds.add(id);
    const fallbackTitle = index === 0 ? 'Section' : `Section ${index + 1}`;
    const title = String(rawSection.title || '').trim() || fallbackTitle;
    const description = String(rawSection.description || '').trim().slice(0, 400);
    const list = Array.isArray(rawSection.cardIds) ? rawSection.cardIds : [];
    const seenCardInSection = new Set();
    const cardIdsForSection = [];
    list.forEach((rawCardId) => {
      const cardId = String(rawCardId || '').trim();
      if (!cardId || seenCardInSection.has(cardId) || !cardIds.has(cardId)) return;
      seenCardInSection.add(cardId);
      cardIdsForSection.push(cardId);
    });
    sections.push({ id, title: title.slice(0, 120), description, cardIds: cardIdsForSection });
  });

  if (sections.length === 0) {
    const fallback = createDefaultConceptLayout();
    fallback.sections.forEach(section => sections.push(section));
  }

  const assigned = new Set();
  sections.forEach(section => section.cardIds.forEach(cardId => assigned.add(cardId)));
  const unassigned = cards.filter(card => !assigned.has(card.id)).map(card => card.id);
  if (unassigned.length > 0) {
    sections[0].cardIds = [...sections[0].cardIds, ...unassigned];
  }

  const connections = [];
  const seenConnections = new Set();
  const incomingConnections = Array.isArray(source.connections) ? source.connections : [];
  incomingConnections.forEach((rawConnection) => {
    if (!rawConnection || typeof rawConnection !== 'object') return;
    const fromCardId = String(rawConnection.fromCardId || '').trim();
    const toCardId = String(rawConnection.toCardId || '').trim();
    if (!fromCardId || !toCardId || fromCardId === toCardId) return;
    if (!cardIds.has(fromCardId) || !cardIds.has(toCardId)) return;
    const type = normalizeConceptLayoutConnectionType(rawConnection.type, '');
    if (!type) return;
    const key = `${fromCardId}:${toCardId}:${type}`;
    if (seenConnections.has(key)) return;
    seenConnections.add(key);
    const id = String(rawConnection.id || '').trim() || makeConceptLayoutId('connection');
    connections.push({
      id,
      fromCardId,
      toCardId,
      type,
      label: String(rawConnection.label || '').trim().slice(0, 120)
    });
  });

  return { sections, cards, connections };
};

const resolveConceptByParam = async (userId, rawParam, { createIfMissing = false } = {}) => {
  const safeParam = String(rawParam || '').trim();
  if (!safeParam) return null;
  const userObjectId = new mongoose.Types.ObjectId(userId);
  if (mongoose.Types.ObjectId.isValid(safeParam)) {
    const byId = await TagMeta.findOne({ _id: safeParam, userId: userObjectId });
    if (byId) return byId;
  }
  const byName = await TagMeta.findOne({
    name: new RegExp(`^${escapeRegExp(safeParam)}$`, 'i'),
    userId: userObjectId
  });
  if (byName) return byName;
  if (!createIfMissing) return null;
  const created = await TagMeta.findOneAndUpdate(
    { name: safeParam, userId: userObjectId },
    { $setOnInsert: { name: safeParam } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return created;
};

const stripInlineHtml = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const createConceptLayoutCard = async ({ userId, itemType, itemId, title, snippet, role }) => {
  const safeType = normalizeConceptLayoutCardType(itemType);
  const safeItemId = String(itemId || '').trim();
  const safeRole = normalizeConceptLayoutCardRole(role);
  if (!safeType || !safeItemId) return null;

  if (safeType === 'highlight') {
    const highlight = await findHighlightById(userId, safeItemId);
    if (!highlight) return null;
    return {
      id: makeConceptLayoutId('card'),
      itemType: safeType,
      itemId: String(highlight._id),
      role: safeRole,
      title: String(title || '').trim().slice(0, 220) || highlight.articleTitle || 'Highlight',
      snippet: String(snippet || '').trim().slice(0, 4000) || String(highlight.text || '').trim(),
      createdAt: new Date()
    };
  }

  if (!mongoose.Types.ObjectId.isValid(safeItemId)) return null;
  if (safeType === 'article') {
    const article = await Article.findOne({ _id: safeItemId, userId }).select('title content url').lean();
    if (!article) return null;
    const fallbackSnippet = stripInlineHtml(article.content || article.url || '').slice(0, 320);
    return {
      id: makeConceptLayoutId('card'),
      itemType: safeType,
      itemId: String(article._id),
      role: safeRole,
      title: String(title || '').trim().slice(0, 220) || article.title || 'Article',
      snippet: String(snippet || '').trim().slice(0, 4000) || fallbackSnippet,
      createdAt: new Date()
    };
  }

  if (safeType === 'note') {
    const note = await NotebookEntry.findOne({ _id: safeItemId, userId }).select('title content blocks').lean();
    if (!note) return null;
    const blockSnippet = Array.isArray(note.blocks)
      ? note.blocks.map(block => String(block?.text || '').trim()).filter(Boolean).join(' ')
      : '';
    return {
      id: makeConceptLayoutId('card'),
      itemType: safeType,
      itemId: String(note._id),
      role: safeRole,
      title: String(title || '').trim().slice(0, 220) || note.title || 'Notebook note',
      snippet: String(snippet || '').trim().slice(0, 4000) || stripInlineHtml(note.content || blockSnippet).slice(0, 320),
      createdAt: new Date()
    };
  }

  if (safeType === 'question') {
    const question = await Question.findOne({ _id: safeItemId, userId })
      .select('text linkedTagName')
      .lean();
    if (!question) return null;
    return {
      id: makeConceptLayoutId('card'),
      itemType: safeType,
      itemId: String(question._id),
      role: safeRole,
      title: String(title || '').trim().slice(0, 220) || question.text || 'Question',
      snippet: String(snippet || '').trim().slice(0, 4000) || String(question.linkedTagName || '').trim(),
      createdAt: new Date()
    };
  }

  return null;
};

const resolveReturnQueueItem = async (userId, itemType, itemId) => {
  const safeItemId = String(itemId || '').trim();
  if (!safeItemId) return null;
  if (itemType === 'highlight') {
    const highlight = await findHighlightById(userId, safeItemId);
    if (!highlight) return null;
    return {
      title: highlight.articleTitle || 'Highlight',
      snippet: buildQueueSnippet(highlight.text, highlight.note),
      openPath: highlight.articleId ? `/library?articleId=${highlight.articleId}` : '/library?scope=highlights',
      exists: true
    };
  }
  if (!mongoose.Types.ObjectId.isValid(safeItemId)) return null;
  if (itemType === 'notebook') {
    const entry = await NotebookEntry.findOne({ _id: safeItemId, userId })
      .select('title content blocks')
      .lean();
    if (!entry) return null;
    const blockText = Array.isArray(entry.blocks)
      ? entry.blocks.find(block => String(block?.text || '').trim())?.text
      : '';
    return {
      title: entry.title || 'Notebook entry',
      snippet: buildQueueSnippet(entry.content, blockText, entry.title),
      openPath: `/think?tab=notebook&entryId=${entry._id}`,
      exists: true
    };
  }
  if (itemType === 'question') {
    const question = await Question.findOne({ _id: safeItemId, userId })
      .select('text')
      .lean();
    if (!question) return null;
    return {
      title: 'Question',
      snippet: buildQueueSnippet(question.text),
      openPath: `/think?tab=questions&questionId=${question._id}`,
      exists: true
    };
  }
  if (itemType === 'concept') {
    const conceptQuery = mongoose.Types.ObjectId.isValid(safeItemId)
      ? { _id: safeItemId, userId }
      : { userId, name: new RegExp(`^${escapeRegExp(safeItemId)}$`, 'i') };
    const concept = await TagMeta.findOne(conceptQuery)
      .select('name description')
      .lean();
    if (!concept) return null;
    return {
      title: concept.name || 'Concept',
      snippet: buildQueueSnippet(concept.description, concept.name),
      openPath: concept.name ? `/think?tab=concepts&concept=${encodeURIComponent(concept.name)}` : '/think?tab=concepts',
      exists: true
    };
  }
  if (itemType === 'article') {
    const article = await Article.findOne({ _id: safeItemId, userId })
      .select('title content')
      .lean();
    if (!article) return null;
    return {
      title: article.title || 'Article',
      snippet: buildQueueSnippet(article.content, article.title),
      openPath: `/library?articleId=${article._id}`,
      exists: true
    };
  }
  if (itemType === 'wiki_page') {
    const page = await WikiPage.findOne({ _id: safeItemId, userId, status: { $ne: 'archived' } })
      .select('title plainText pageType status')
      .lean();
    if (!page) return null;
    return {
      title: page.title || 'Wiki page',
      snippet: buildQueueSnippet(page.plainText, page.pageType),
      openPath: `/wiki/${page._id}`,
      exists: true
    };
  }
  if (itemType === 'wiki_claim') {
    const [pageId, ...claimParts] = safeItemId.split(':');
    const claimId = claimParts.join(':');
    if (!mongoose.Types.ObjectId.isValid(pageId) || !claimId) return null;
    const page = await WikiPage.findOne({ _id: pageId, userId, status: { $ne: 'archived' } })
      .select('title claims updatedAt')
      .lean();
    if (!page) return null;
    const claim = (Array.isArray(page.claims) ? page.claims : [])
      .find(row => String(row?.claimId || '') === claimId);
    if (!claim) return null;
    return {
      title: claim.section || 'Wiki claim',
      snippet: buildQueueSnippet(claim.text, page.title),
      openPath: `/wiki/${page._id}`,
      exists: true
    };
  }
  return null;
};

const CONNECTION_RELATION_TYPES = new Set([
  'supports',
  'supported_by',
  'contradicts',
  'contradicted_by',
  'extends',
  'related',
  'referenced_by',
  'example',
  'definition',
  'shared_source',
  'contains',
  'contained_by',
  'needs_review',
  'review_needed_by'
]);
const CONNECTION_ITEM_TYPES = new Set(['highlight', 'notebook', 'article', 'concept', 'question', 'wiki_page', 'wiki_claim']);
const CONNECTION_SCOPE_TYPES = new Set(['', 'article', 'concept', 'question']);

const normalizeConnectionItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'note') return 'notebook';
  if (CONNECTION_ITEM_TYPES.has(candidate)) return candidate;
  return '';
};

const normalizeRelationType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (CONNECTION_RELATION_TYPES.has(candidate)) return candidate;
  return '';
};

const normalizeConnectionScopeType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === '') return '';
  if (CONNECTION_SCOPE_TYPES.has(candidate)) return candidate;
  return null;
};

const resolveConnectionScope = async (userId, scopeType, scopeId) => {
  const safeScopeType = normalizeConnectionScopeType(scopeType);
  const safeScopeId = String(scopeId || '').trim();
  if (safeScopeType === null) return null;
  if (safeScopeType === '') {
    return { scopeType: '', scopeId: '', title: '' };
  }
  if (!safeScopeId) return null;
  if (safeScopeType === 'concept') {
    if (mongoose.Types.ObjectId.isValid(safeScopeId)) {
      const conceptById = await TagMeta.findOne({ _id: safeScopeId, userId }).select('name').lean();
      if (conceptById) {
        return {
          scopeType: 'concept',
          scopeId: String(conceptById._id),
          title: conceptById.name || 'Concept',
          conceptName: conceptById.name || ''
        };
      }
    }
    const conceptByName = await TagMeta.findOne({
      userId,
      name: new RegExp(`^${escapeRegExp(safeScopeId)}$`, 'i')
    }).select('name').lean();
    if (!conceptByName) return null;
    return {
      scopeType: 'concept',
      scopeId: String(conceptByName._id),
      title: conceptByName.name || 'Concept',
      conceptName: conceptByName.name || ''
    };
  }
  if (safeScopeType === 'article') {
    if (!mongoose.Types.ObjectId.isValid(safeScopeId)) return null;
    const article = await Article.findOne({ _id: safeScopeId, userId }).select('title').lean();
    if (!article) return null;
    return {
      scopeType: 'article',
      scopeId: String(article._id),
      title: article.title || 'Article'
    };
  }
  if (safeScopeType === 'question') {
    if (!mongoose.Types.ObjectId.isValid(safeScopeId)) return null;
    const question = await Question.findOne({ _id: safeScopeId, userId }).select('text').lean();
    if (!question) return null;
    return {
      scopeType: 'question',
      scopeId: String(safeScopeId),
      title: question.text || 'Question'
    };
  }
  return null;
};

const resolveConnectionItem = async (userId, itemType, itemId) => {
  const normalizedType = normalizeConnectionItemType(itemType);
  if (!normalizedType) return null;
  return resolveReturnQueueItem(userId, normalizedType, itemId);
};

const resolveConnectionScopeInput = async (userId, scopeType, scopeId, hasInput = false) => {
  if (!hasInput) return { scopeType: '', scopeId: '', title: '' };
  const scope = await resolveConnectionScope(userId, scopeType, scopeId);
  if (!scope) return null;
  return {
    scopeType: scope.scopeType || '',
    scopeId: scope.scopeId || '',
    title: scope.title || ''
  };
};

const toObjectIdList = (ids = []) => (
  ids
    .map(value => String(value || '').trim())
    .filter(value => mongoose.Types.ObjectId.isValid(value))
    .map(value => new mongoose.Types.ObjectId(value))
);

const normalizeConnectionScopeCandidates = (rows = []) => {
  const set = new Set();
  rows.forEach(row => {
    const value = String(row?._id || row || '').trim();
    if (value) set.add(value);
  });
  return set;
};

const createEmptyConnectionCandidateSets = () => ({
  highlightIds: new Set(),
  notebookIds: new Set(),
  articleIds: new Set(),
  conceptIds: new Set(),
  questionIds: new Set(),
  wikiPageIds: new Set(),
  wikiClaimIds: new Set()
});

const addToCandidateSet = (set, value) => {
  if (!set || typeof set.add !== 'function') return;
  const safe = String(value || '').trim();
  if (safe) set.add(safe);
};

const addManyToCandidateSet = (set, values = []) => {
  values.forEach(value => addToCandidateSet(set, value));
};

const addArticleIdsForHighlightIds = async (userId, highlightIds, articleSet) => {
  const highlightObjectIds = toObjectIdList(Array.from(highlightIds));
  if (!highlightObjectIds.length) return;
  const articleRows = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': { $in: highlightObjectIds } } },
    { $group: { _id: '$_id' } }
  ]);
  articleRows.forEach(row => addToCandidateSet(articleSet, row?._id));
};

const buildConnectionScopeCandidates = async (userId, scope) => {
  if (!scope?.scopeType || !scope?.scopeId) return null;

  if (scope.scopeType === 'concept') {
    const concept = await TagMeta.findOne({ _id: scope.scopeId, userId })
      .select('name pinnedHighlightIds pinnedNoteIds pinnedArticleIds')
      .lean();
    if (!concept) return null;

    const candidates = createEmptyConnectionCandidateSets();
    addToCandidateSet(candidates.conceptIds, concept._id);
    addManyToCandidateSet(candidates.highlightIds, normalizeConnectionScopeCandidates(concept.pinnedHighlightIds || []));
    addManyToCandidateSet(candidates.notebookIds, normalizeConnectionScopeCandidates(concept.pinnedNoteIds || []));
    addManyToCandidateSet(candidates.articleIds, normalizeConnectionScopeCandidates(concept.pinnedArticleIds || []));
    const conceptName = String(concept.name || '').trim();

    if (conceptName) {
      const regex = new RegExp(`^${escapeRegExp(conceptName)}$`, 'i');
      const taggedHighlights = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': regex } },
        { $project: { _id: '$highlights._id', articleId: '$_id' } },
        { $limit: 600 }
      ]);
      taggedHighlights.forEach(row => {
        addToCandidateSet(candidates.highlightIds, row?._id);
        addToCandidateSet(candidates.articleIds, row?.articleId);
      });

      const taggedNotes = await NotebookEntry.find({ userId, tags: regex })
        .select('_id')
        .lean();
      taggedNotes.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));

      const conceptQuestions = await Question.find({ userId, linkedTagName: regex })
        .select('_id')
        .limit(200)
        .lean();
      conceptQuestions.forEach(row => addToCandidateSet(candidates.questionIds, row?._id));

    const conceptReferenceEdges = await ReferenceEdge.find({
      userId: new mongoose.Types.ObjectId(userId),
      targetType: 'concept',
      targetTagName: regex
      })
        .select('sourceId')
      .lean();
      conceptReferenceEdges.forEach(edge => addToCandidateSet(candidates.notebookIds, edge?.sourceId));
    }

    const scopedWikiEdges = await Connection.find({
      userId,
      scopeType: 'concept',
      scopeId: String(concept._id),
      $or: [{ fromType: 'wiki_page' }, { toType: 'wiki_page' }]
    })
      .select('fromType fromId toType toId')
      .limit(300)
      .lean();
    scopedWikiEdges.forEach(edge => {
      if (edge?.fromType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.fromId);
      if (edge?.toType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.toId);
    });

    const highlightObjectIds = toObjectIdList(Array.from(candidates.highlightIds));
    if (highlightObjectIds.length > 0) {
      const notesLinkedToHighlights = await NotebookEntry.find({
        userId,
        linkedHighlightIds: { $in: highlightObjectIds }
      })
        .select('_id')
        .lean();
      notesLinkedToHighlights.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));
    }

    await addArticleIdsForHighlightIds(userId, candidates.highlightIds, candidates.articleIds);
    return candidates;
  }

  if (scope.scopeType === 'question') {
    const question = await Question.findOne({ _id: scope.scopeId, userId })
      .select('blocks linkedHighlightId linkedHighlightIds linkedNotebookEntryId linkedTagName')
      .lean();
    if (!question) return null;

    const candidates = createEmptyConnectionCandidateSets();
    addToCandidateSet(candidates.questionIds, question._id);
    addToCandidateSet(candidates.notebookIds, question.linkedNotebookEntryId);

    if (question.linkedTagName) {
      const linkedConcept = await TagMeta.findOne({
        userId,
        name: new RegExp(`^${escapeRegExp(question.linkedTagName)}$`, 'i')
      }).select('_id').lean();
      addToCandidateSet(candidates.conceptIds, linkedConcept?._id);
    }

    const addHighlightId = (value) => {
      const clean = String(value || '').trim();
      if (clean) candidates.highlightIds.add(clean);
    };

    addHighlightId(question.linkedHighlightId);
    (question.linkedHighlightIds || []).forEach(addHighlightId);
    (question.blocks || []).forEach(block => {
      if (block?.type === 'highlight-ref') addHighlightId(block.highlightId);
    });

    const highlightObjectIds = toObjectIdList(Array.from(candidates.highlightIds));
    if (highlightObjectIds.length > 0) {
      const notesLinkedToHighlights = await NotebookEntry.find({
        userId,
        linkedHighlightIds: { $in: highlightObjectIds }
      })
        .select('_id')
        .lean();
      notesLinkedToHighlights.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));
    }

    await addArticleIdsForHighlightIds(userId, candidates.highlightIds, candidates.articleIds);
    const scopedWikiEdges = await Connection.find({
      userId,
      scopeType: 'question',
      scopeId: String(question._id),
      $or: [{ fromType: 'wiki_page' }, { toType: 'wiki_page' }]
    })
      .select('fromType fromId toType toId')
      .limit(300)
      .lean();
    scopedWikiEdges.forEach(edge => {
      if (edge?.fromType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.fromId);
      if (edge?.toType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.toId);
    });
    return candidates;
  }

  if (scope.scopeType === 'article') {
    const article = await Article.findOne({ _id: scope.scopeId, userId })
      .select('highlights._id')
      .lean();
    if (!article) return null;

    const candidates = createEmptyConnectionCandidateSets();
    addToCandidateSet(candidates.articleIds, article._id);
    (article.highlights || []).forEach(highlight => addToCandidateSet(candidates.highlightIds, highlight?._id));

    const highlightObjectIds = toObjectIdList(Array.from(candidates.highlightIds));
    if (highlightObjectIds.length > 0) {
      const [notesLinkedToHighlights, questionsLinkedToHighlights] = await Promise.all([
        NotebookEntry.find({
          userId,
          linkedHighlightIds: { $in: highlightObjectIds }
        })
          .select('_id')
          .lean(),
        Question.find({
          userId,
          $or: [
            { linkedHighlightId: { $in: Array.from(candidates.highlightIds) } },
            { linkedHighlightIds: { $in: Array.from(candidates.highlightIds) } },
            { 'blocks.highlightId': { $in: Array.from(candidates.highlightIds) } }
          ]
        })
          .select('_id')
          .lean()
      ]);
      notesLinkedToHighlights.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));
      questionsLinkedToHighlights.forEach(row => addToCandidateSet(candidates.questionIds, row?._id));
    }

    const scopedWikiEdges = await Connection.find({
      userId,
      scopeType: 'article',
      scopeId: String(article._id),
      $or: [{ fromType: 'wiki_page' }, { toType: 'wiki_page' }]
    })
      .select('fromType fromId toType toId')
      .limit(300)
      .lean();
    scopedWikiEdges.forEach(edge => {
      if (edge?.fromType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.fromId);
      if (edge?.toType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.toId);
    });
    return candidates;
  }

  return null;
};

const isConnectionItemInScopeCandidates = (itemType, itemId, candidates) => {
  if (!candidates) return true;
  const safeType = normalizeConnectionItemType(itemType);
  const safeId = String(itemId || '').trim();
  if (!safeType || !safeId) return false;
  if (safeType === 'highlight') return candidates.highlightIds.has(safeId);
  if (safeType === 'notebook') return candidates.notebookIds.has(safeId);
  if (safeType === 'article') return candidates.articleIds.has(safeId);
  if (safeType === 'concept') return candidates.conceptIds.has(safeId);
  if (safeType === 'question') return candidates.questionIds.has(safeId);
  if (safeType === 'wiki_page') return candidates.wikiPageIds.has(safeId);
  if (safeType === 'wiki_claim') return candidates.wikiClaimIds.has(safeId);
  return false;
};

const normalizeConceptPathItemType = (value) => normalizeConnectionItemType(value);

const normalizeConceptPathNotes = (value) => String(value || '').trim().slice(0, 400);

const sortPathItemRefs = (itemRefs = []) => (
  [...itemRefs]
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((item, index) => ({ ...item, order: index }))
);

const normalizePathItemRefsInput = (itemRefs = []) => {
  if (!Array.isArray(itemRefs)) return [];
  const normalized = [];
  itemRefs.forEach((item, index) => {
    const type = normalizeConceptPathItemType(item?.type);
    const id = String(item?.id || '').trim();
    if (!type || !id) return;
    normalized.push({
      type,
      id,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      notes: normalizeConceptPathNotes(item?.notes)
    });
  });
  return sortPathItemRefs(normalized);
};

const hydratePathItemRefs = async (userId, itemRefs = []) => {
  const sorted = sortPathItemRefs(itemRefs);
  const hydrated = await Promise.all(sorted.map(async (itemRef) => {
    const item = await resolveConnectionItem(userId, itemRef.type, itemRef.id);
    return {
      _id: itemRef._id,
      type: itemRef.type,
      id: itemRef.id,
      order: itemRef.order,
      notes: itemRef.notes || '',
      item
    };
  }));
  return hydrated.filter(row => row.item);
};

const ensureConceptPathOwnership = async (userId, pathId) => {
  if (!mongoose.Types.ObjectId.isValid(pathId)) return null;
  return ConceptPath.findOne({ _id: pathId, userId });
};

const getConceptPathWithProgress = async (userId, pathDoc) => {
  const path = pathDoc.toObject ? pathDoc.toObject() : pathDoc;
  const [itemRefs, progressDoc] = await Promise.all([
    hydratePathItemRefs(userId, path.itemRefs || []),
    ConceptPathProgress.findOne({ userId, pathId: path._id }).lean()
  ]);
  const progress = progressDoc || {
    understoodItemRefIds: [],
    currentIndex: 0
  };
  return {
    ...path,
    itemRefs,
    progress: {
      understoodItemRefIds: progress.understoodItemRefIds || [],
      currentIndex: Math.max(0, Math.min(progress.currentIndex || 0, Math.max(itemRefs.length - 1, 0)))
    }
  };
};

const parseCsvList = (value) => (
  String(value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
);

const buildGraphNodeKey = (itemType, itemId) => `${itemType}:${itemId}`;

const buildGraphNodeMap = async (userId, idsByType = {}) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const nodeMap = new Map();

  const highlightIds = toObjectIdList(Array.from(idsByType.highlight || []));
  if (highlightIds.length > 0) {
    const highlights = await Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights._id': { $in: highlightIds } } },
      { $project: {
        itemId: '$highlights._id',
        articleId: '$_id',
        articleTitle: '$title',
        text: '$highlights.text',
        tags: '$highlights.tags',
        createdAt: '$highlights.createdAt'
      } }
    ]);
    highlights.forEach(row => {
      const itemId = String(row.itemId);
      const key = buildGraphNodeKey('highlight', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'highlight',
        itemId,
        title: row.articleTitle || 'Highlight',
        snippet: buildQueueSnippet(row.text, row.articleTitle),
        tags: Array.isArray(row.tags) ? row.tags : [],
        updatedAt: row.createdAt || null,
        openPath: row.articleId ? `/library?articleId=${row.articleId}` : '/library?scope=highlights'
      });
    });
  }

  const notebookIds = toObjectIdList(Array.from(idsByType.notebook || []));
  if (notebookIds.length > 0) {
    const notes = await NotebookEntry.find({ userId, _id: { $in: notebookIds } })
      .select('title content tags updatedAt')
      .lean();
    notes.forEach(note => {
      const itemId = String(note._id);
      const key = buildGraphNodeKey('notebook', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'notebook',
        itemId,
        title: note.title || 'Note',
        snippet: buildQueueSnippet(note.content, note.title),
        tags: Array.isArray(note.tags) ? note.tags : [],
        updatedAt: note.updatedAt || null,
        openPath: `/think?tab=notebook&entryId=${note._id}`
      });
    });
  }

  const articleIds = toObjectIdList(Array.from(idsByType.article || []));
  if (articleIds.length > 0) {
    const articles = await Article.find({ userId, _id: { $in: articleIds } })
      .select('title content updatedAt')
      .lean();
    articles.forEach(article => {
      const itemId = String(article._id);
      const key = buildGraphNodeKey('article', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'article',
        itemId,
        title: article.title || 'Article',
        snippet: buildQueueSnippet(article.content, article.title),
        tags: [],
        updatedAt: article.updatedAt || null,
        openPath: `/library?articleId=${article._id}`
      });
    });
  }

  const conceptIds = toObjectIdList(Array.from(idsByType.concept || []));
  if (conceptIds.length > 0) {
    const concepts = await TagMeta.find({ userId, _id: { $in: conceptIds } })
      .select('name description updatedAt')
      .lean();
    concepts.forEach(concept => {
      const itemId = String(concept._id);
      const key = buildGraphNodeKey('concept', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'concept',
        itemId,
        title: concept.name || 'Concept',
        snippet: buildQueueSnippet(concept.description, concept.name),
        tags: concept.name ? [concept.name] : [],
        updatedAt: concept.updatedAt || null,
        openPath: concept.name ? `/think?tab=concepts&concept=${encodeURIComponent(concept.name)}` : '/think?tab=concepts'
      });
    });
  }

  const questionIds = toObjectIdList(Array.from(idsByType.question || []));
  if (questionIds.length > 0) {
    const questions = await Question.find({ userId, _id: { $in: questionIds } })
      .select('text linkedTagName updatedAt')
      .lean();
    questions.forEach(question => {
      const itemId = String(question._id);
      const key = buildGraphNodeKey('question', itemId);
      const tags = question.linkedTagName ? [question.linkedTagName] : [];
      nodeMap.set(key, {
        id: key,
        itemType: 'question',
        itemId,
        title: 'Question',
        snippet: buildQueueSnippet(question.text),
        tags,
        updatedAt: question.updatedAt || null,
        openPath: `/think?tab=questions&questionId=${question._id}`
      });
    });
  }

  const wikiPageIds = toObjectIdList(Array.from(idsByType.wiki_page || []));
  if (wikiPageIds.length > 0) {
    const pages = await WikiPage.find({ userId, _id: { $in: wikiPageIds }, status: { $ne: 'archived' } })
      .select('title plainText pageType status updatedAt')
      .lean();
    pages.forEach(page => {
      const itemId = String(page._id);
      const key = buildGraphNodeKey('wiki_page', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'wiki_page',
        itemId,
        title: page.title || 'Wiki page',
        snippet: buildQueueSnippet(page.plainText, page.pageType),
        tags: page.pageType ? [page.pageType] : [],
        updatedAt: page.updatedAt || null,
        openPath: `/wiki/${page._id}`
      });
    });
  }

  const wikiClaimRefs = Array.from(idsByType.wiki_claim || [])
    .map((value) => {
      const [pageId, ...claimParts] = String(value || '').split(':');
      const claimId = claimParts.join(':');
      return { raw: String(value || ''), pageId, claimId };
    })
    .filter(ref => mongoose.Types.ObjectId.isValid(ref.pageId) && ref.claimId);
  if (wikiClaimRefs.length > 0) {
    const claimPageIds = toObjectIdList([...new Set(wikiClaimRefs.map(ref => ref.pageId))]);
    const pages = await WikiPage.find({ userId, _id: { $in: claimPageIds }, status: { $ne: 'archived' } })
      .select('title claims updatedAt')
      .lean();
    const pageById = new Map(pages.map(page => [String(page._id), page]));
    wikiClaimRefs.forEach((ref) => {
      const page = pageById.get(ref.pageId);
      if (!page) return;
      const claim = (Array.isArray(page.claims) ? page.claims : [])
        .find(row => String(row?.claimId || '') === ref.claimId);
      if (!claim) return;
      const key = buildGraphNodeKey('wiki_claim', ref.raw);
      const support = String(claim.support || '').trim();
      nodeMap.set(key, {
        id: key,
        itemType: 'wiki_claim',
        itemId: ref.raw,
        title: claim.section || 'Wiki claim',
        snippet: buildQueueSnippet(claim.text, page.title),
        tags: ['claim', support].filter(Boolean),
        updatedAt: claim.lastReviewedAt || page.updatedAt || null,
        openPath: `/wiki/${page._id}`
      });
    });
  }

  return nodeMap;
};
// --- AUTHENTICATION ADDITIONS: JWT Verification Middleware ---
const getCookieValue = (cookieHeader, name) => {
  if (!cookieHeader) return '';
  const parts = cookieHeader.split(';').map(part => part.trim());
  const match = parts.find(part => part.startsWith(`${name}=`));
  if (!match) return '';
  return decodeURIComponent(match.slice(name.length + 1));
};

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const headerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const cookieHeader = req.headers.cookie || '';
  const cookieToken =
    getCookieValue(cookieHeader, 'token') ||
    getCookieValue(cookieHeader, 'authToken') ||
    getCookieValue(cookieHeader, 'jwt');

  const token = headerToken || cookieToken;
  const tokenSource = headerToken ? 'header' : (cookieToken ? 'cookie' : 'none');

  if (!token) {
    if (process.env.DEBUG_AUTH === 'true') {
      console.log('[AUTH] missing token', {
        tokenSource,
        serverNowSec: Math.floor(Date.now() / 1000)
      });
    }
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    const serverNowSec = Math.floor(Date.now() / 1000);
    const decoded = jwt.decode(token) || {};
    if (process.env.DEBUG_AUTH === 'true') {
      const diffSec = decoded.exp ? serverNowSec - decoded.exp : null;
      console.log('[AUTH] verify', {
        tokenSource,
        serverNowSec,
        iat: decoded.iat,
        exp: decoded.exp,
        diffSec
      });
    }

    if (err) {
      if (err.name === 'TokenExpiredError') {
        console.warn("JWT Verification Error: token expired");
        return res.status(401).json({ error: "AUTH_EXPIRED" });
      }
      console.warn("JWT Verification Error:", err.message);
      return res.status(401).json({ error: "AUTH_INVALID" });
    }
    req.user = user;
    req.authInfo = {
      tokenSource,
      iat: user.iat,
      exp: user.exp
    };
    next();
  });
}

const authenticateAgentToken = buildAuthenticateAgentToken({ AgentToken });

function authenticateUserOrAgentToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const headerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (headerToken.startsWith(AGENT_TOKEN_PREFIX)) {
    return authenticateAgentToken(req, res, next);
  }
  return authenticateToken(req, res, next);
}

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
    }).select('_id userId name status capabilities preferredWorkerRoles');

    if (!personalAgent) {
      return res.status(401).json({ error: 'AGENT_AUTH_INVALID' });
    }

    personalAgent.lastUsedAt = new Date();
    await personalAgent.save();

    req.personalAgent = {
      id: String(personalAgent._id),
      userId: String(personalAgent.userId),
      name: String(personalAgent.name || ''),
      capabilities: normalizePersonalAgentCapabilities(personalAgent.capabilities || {}),
      preferredWorkerRoles: normalizePersonalAgentWorkerRoles(personalAgent.preferredWorkerRoles || [])
    };
    next();
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
      issuer: 'note-taker-3-1'
    });
    if (String(decoded?.kind || '') !== AGENT_BRIDGE_TOKEN_KIND) {
      return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });
    }

    const userId = String(decoded?.userId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ error: 'BRIDGE_AUTH_INVALID' });
    }

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

const findRowValue = (row, keys) => {
  if (!row) return '';
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const match = Object.keys(row).find(k => k.toLowerCase() === String(key).toLowerCase());
    if (match && row[match] !== undefined && row[match] !== null) return row[match];
  }
  return '';
};

const parseTagList = (value) => (
  String(value || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
);

const slugify = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
);

const extractConceptTags = (text = '') => {
  const matches = String(text).match(/#([a-zA-Z0-9_-]+)/g) || [];
  return Array.from(new Set(matches.map(tag => tag.slice(1).toLowerCase())));
};

const stripHtml = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const buildNotebookMarkdown = (entry) => {
  const title = entry?.title || 'Untitled';
  const blocks = Array.isArray(entry?.blocks) && entry.blocks.length > 0
    ? entry.blocks
    : [{ type: 'paragraph', text: stripHtml(entry?.content || '') }];
  const lines = [`# ${title}`, ''];
  blocks.forEach((block) => {
    const type = block.type || 'paragraph';
    const text = String(block.text || '').trim();
    if (type === 'heading') {
      const level = Math.min(Math.max(block.level || 1, 1), 4);
      lines.push(`${'#'.repeat(level)} ${text}`);
      lines.push('');
      return;
    }
    if (type === 'bullet') {
      const indent = '  '.repeat(block.indent || 0);
      lines.push(`${indent}- ${text}`);
      return;
    }
    if (type === 'highlight_embed' || type === 'highlight-ref') {
      if (text) {
        lines.push(`> ${text}`);
        lines.push('');
      }
      return;
    }
    if (type === 'article_ref' || type === 'article-ref') {
      lines.push(`- Article: ${block.articleTitle || text || 'Untitled article'}`);
      return;
    }
    if (type === 'concept_ref' || type === 'concept-ref') {
      lines.push(`- Concept: ${block.conceptName || text || 'Concept'}`);
      return;
    }
    if (type === 'question_ref' || type === 'question-ref') {
      lines.push(`- Question: ${block.questionText || text || 'Question'}`);
      return;
    }
    if (text) {
      lines.push(text);
      lines.push('');
    }
  });
  return lines.join('\n').trim() + '\n';
};

const buildConceptMarkdown = ({ concept, related, questions }) => {
  const lines = [`# ${concept?.name || 'Concept'}`, ''];
  if (concept?.description) {
    lines.push(concept.description);
    lines.push('');
  }
  if (related?.highlights?.length) {
    lines.push('## Highlights');
    related.highlights.forEach(h => {
      lines.push(`- ${h.text || 'Highlight'}${h.articleTitle ? ` — ${h.articleTitle}` : ''}`);
    });
    lines.push('');
  }
  if (related?.articles?.length) {
    lines.push('## Source articles');
    related.articles.forEach(article => {
      lines.push(`- ${article.title || 'Untitled article'} (${article.highlightCount || 0} highlights)`);
    });
    lines.push('');
  }
  if (questions?.length) {
    lines.push('## Questions');
    questions.forEach(question => {
      lines.push(`- ${question.text}`);
    });
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
};

const queueEmbeddingUpsert = (items) => {
  if (!isAiEnabled()) return;
  const payload = (items || []).filter(Boolean);
  if (payload.length === 0) return;
  setImmediate(() => {
    upsertEmbeddings(payload, { requestId: 'embedding-upsert' })
      .catch(err => {
        console.error('❌ AI upsert failed:', err.message || err);
      });
  });
};

const queueEmbeddingDelete = (ids) => {
  if (!isAiEnabled()) return;
  const payload = (ids || []).filter(Boolean);
  if (payload.length === 0) return;
  setImmediate(() => {
    deleteEmbeddings(payload).catch(err => {
      console.error('❌ AI delete failed:', err.message || err);
    });
  });
};

const sendEmbeddingError = (res, error) => {
  const status = error.status || 503;
  const payload = error.payload || { error: error.message };
  res.status(status).json(payload);
};

const safeMapEmbedding = (fn, label) => {
  try {
    return fn();
  } catch (err) {
    console.error(`❌ AI mapping failed (${label}):`, err.message || err);
    return null;
  }
};

const ensureNotebookBlocks = (entry, createId) => {
  if (!entry) return entry;
  if (Array.isArray(entry.blocks) && entry.blocks.length > 0) return entry;
  const text = stripHtml(entry.content || '');
  if (!text) return entry;
  const blockId = createId ? createId() : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
  entry.blocks = [{ id: blockId, type: 'paragraph', text }];
  return entry;
};

const buildNotebookBlocksFromEdges = async ({ userId, edges }) => {
  if (!edges || edges.length === 0) return [];
  const entryIds = Array.from(new Set(edges.map(edge => String(edge.sourceId))));
  const entries = await NotebookEntry.find({ userId, _id: { $in: entryIds } })
    .select('title updatedAt')
    .lean();
  const entryMap = new Map(entries.map(entry => [String(entry._id), entry]));

  const seen = new Set();
  return edges.reduce((acc, edge) => {
    const key = `${edge.sourceId}:${edge.sourceBlockId || ''}`;
    if (seen.has(key)) return acc;
    seen.add(key);
    const entry = entryMap.get(String(edge.sourceId));
    acc.push({
      notebookEntryId: edge.sourceId,
      notebookTitle: entry?.title || 'Untitled',
      blockId: edge.sourceBlockId,
      blockPreviewText: edge.blockPreviewText || '',
      updatedAt: entry?.updatedAt
    });
    return acc;
  }, []);
};

const loadNotebookBacklinks = async ({ userId, targetType, targetId, targetTagName }) => {
  const query = { userId, targetType };
  if (targetId) query.targetId = targetId;
  if (targetTagName) query.targetTagName = targetTagName;
  const edges = await ReferenceEdge.find(query).lean();
  return buildNotebookBlocksFromEdges({ userId, edges });
};

const syncNotebookReferences = async (userId, entryId, blocks = []) => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    await ReferenceEdge.deleteMany({ userId, sourceType: 'notebook', sourceId: entryId });
    return;
  }

  await ReferenceEdge.deleteMany({ userId, sourceType: 'notebook', sourceId: entryId });
  const edges = [];

  blocks.forEach((block) => {
    const blockId = block.id || block.blockId;
    if (!blockId) return;
    const preview = String(block.text || '').slice(0, 180);

    const blockType = block.type || '';
    if ((blockType === 'highlight-ref' || blockType === 'highlight_embed') && block.highlightId) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'highlight',
        targetId: block.highlightId,
        blockPreviewText: preview,
        userId
      });
    }

    if ((blockType === 'article_ref' || blockType === 'article-ref') && block.articleId) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'article',
        targetId: block.articleId,
        blockPreviewText: preview,
        userId
      });
    }

    if ((blockType === 'concept_ref' || blockType === 'concept-ref') && block.conceptName) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'concept',
        targetTagName: String(block.conceptName).toLowerCase(),
        blockPreviewText: preview,
        userId
      });
    }

    if ((blockType === 'question_ref' || blockType === 'question-ref') && block.questionId) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'question',
        targetId: block.questionId,
        blockPreviewText: preview,
        userId
      });
    }

    const tags = extractConceptTags(block.text || '');
    tags.forEach((tagName) => {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'concept',
        targetTagName: tagName,
        blockPreviewText: preview,
        userId
      });
    });
  });

  if (edges.length > 0) {
    await ReferenceEdge.insertMany(edges);
  }
};


app.use(buildAuthDiscoveryRouter({
  bcrypt,
  jwt,
  User,
  authenticateToken,
  Recommendation,
  Article,
  trackEvent,
  EVENT_NAMES
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
  enqueueArticleEmbedding,
  safeMapEmbedding,
  articleToEmbeddingItems,
  queueEmbeddingUpsert,
  getFoldersWithCounts,
  normalizeItemType,
  buildEmbeddingId,
  queueEmbeddingDelete,
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
app.use(buildNotebookRouter({
  authenticateToken,
  NotebookEntry,
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
  Question
}));

app.use(buildWikiRouter({
  authenticateToken: authenticateUserOrAgentToken,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  WikiSharedCollection,
  WikiSchemaSettings,
  Connection,
  ConnectorActionLog,
  IntegrationConnection,
  Article,
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

app.use(buildWorkingMemoryRouter({
  mongoose,
  authenticateToken,
  WorkingMemoryItem,
  NotebookEntry,
  TagMeta,
  ConceptNote,
  Question,
  normalizeWorkingMemoryStatus,
  activeWorkingMemoryStatusFilter,
  parseWorkingMemoryTags,
  normalizeWorkingMemoryIds,
  archiveWorkingMemoryItems,
  unarchiveWorkingMemoryItems,
  splitWorkingMemoryText,
  normalizeWorkingMemoryTarget,
  buildWorkingMemoryNotebookTitle,
  createBlockId,
  escapeRegExp,
  syncNotebookReferences,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding
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
  markTourSignal
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

const SEARCH_SCOPE_VALUES = new Set(['all', 'articles', 'highlights', 'notebook']);
const SEARCH_TYPE_VALUES = new Set(['article', 'highlight', 'notebook', 'note', 'claim', 'evidence']);
const SEARCH_ENTRY_TYPE_VALUES = new Set(['note', 'claim', 'evidence']);

const normalizeSearchScope = (value) => {
  const candidate = String(value || 'all').trim().toLowerCase();
  if (SEARCH_SCOPE_VALUES.has(candidate)) return candidate;
  return 'all';
};

const normalizeSearchTypeFilters = (value) => (
  parseCsvList(value)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => SEARCH_TYPE_VALUES.has(item))
);

const normalizeSearchTagFilters = (value) => (
  parseCsvList(value)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 10)
);

const normalizeEntryTypeFilters = (types = []) => {
  const entryTypes = types.filter(type => SEARCH_ENTRY_TYPE_VALUES.has(type));
  return Array.from(new Set(entryTypes));
};

const hasRequestedType = (typeSet, candidates = []) => (
  typeSet.size === 0 || candidates.some(candidate => typeSet.has(candidate))
);

const toCaseInsensitiveTagRegexes = (tags = []) => (
  tags
    .map(tag => String(tag || '').trim())
    .filter(Boolean)
    .map(tag => new RegExp(`^${escapeRegExp(tag)}$`, 'i'))
);

const toSafeObjectId = (value) => (
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null
);

const resolveNotebookSnippet = (entry) => {
  const blockText = Array.isArray(entry?.blocks)
    ? (entry.blocks.find(block => String(block?.text || '').trim())?.text || '')
    : '';
  return buildQueueSnippet(entry?.content || '', blockText, entry?.title || '');
};

const RELATED_REASON_SCORES = Object.freeze({
  connection: 5,
  tag: 3,
  coview: 2
});

const normalizeRelatedLimit = (value, fallback = 8) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), 20);
};

const buildRelatedKey = (itemType, itemId) => `${itemType}:${itemId}`;

const scoreRelatedCandidate = (candidateMap, itemType, itemId, reason, score = 1) => {
  const safeType = normalizeConnectionItemType(itemType);
  const safeId = String(itemId || '').trim();
  if (!safeType || !safeId) return;
  const key = buildRelatedKey(safeType, safeId);
  const existing = candidateMap.get(key);
  const reasonScore = Number(score) || 0;
  if (!existing) {
    candidateMap.set(key, {
      itemType: safeType,
      itemId: safeId,
      score: reasonScore,
      reasons: new Set([reason])
    });
    return;
  }
  existing.score += reasonScore;
  existing.reasons.add(reason);
};

const normalizeTagValues = (tags = []) => {
  const set = new Set();
  (Array.isArray(tags) ? tags : []).forEach(tag => {
    const value = String(tag || '').trim();
    if (!value) return;
    set.add(value.toLowerCase());
  });
  return Array.from(set);
};

const computeTagOverlapScore = (sourceTagSet, targetTags = []) => {
  if (!sourceTagSet.size) return 0;
  const overlap = normalizeTagValues(targetTags).reduce((count, tag) => (
    sourceTagSet.has(tag) ? count + 1 : count
  ), 0);
  return overlap;
};

const resolveItemTagSignals = async (userId, itemType, itemId) => {
  const safeType = normalizeConnectionItemType(itemType);
  const safeId = String(itemId || '').trim();
  if (!safeType || !safeId) return [];

  if (safeType === 'highlight') {
    const highlight = await findHighlightById(userId, safeId);
    return normalizeTagValues(highlight?.tags || []);
  }
  if (safeType === 'notebook') {
    if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
    const note = await NotebookEntry.findOne({ _id: safeId, userId })
      .select('tags')
      .lean();
    return normalizeTagValues(note?.tags || []);
  }
  if (safeType === 'concept') {
    if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
    const concept = await TagMeta.findOne({ _id: safeId, userId })
      .select('name')
      .lean();
    return concept?.name ? normalizeTagValues([concept.name]) : [];
  }
  if (safeType === 'question') {
    if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
    const question = await Question.findOne({ _id: safeId, userId })
      .select('linkedTagName conceptName')
      .lean();
    return normalizeTagValues([question?.linkedTagName, question?.conceptName]);
  }
  if (safeType === 'article') {
    if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
    const article = await Article.findOne({ _id: safeId, userId })
      .select('highlights.tags')
      .lean();
    const tags = [];
    (article?.highlights || []).forEach(highlight => {
      (highlight?.tags || []).forEach(tag => tags.push(tag));
    });
    return normalizeTagValues(tags).slice(0, 20);
  }
  return [];
};

const collectTagRelatedCandidates = async (userId, sourceType, sourceId, sourceTags = [], candidateMap) => {
  if (!sourceTags.length) return;
  const sourceTagSet = new Set(sourceTags);
  const tagRegexes = toCaseInsensitiveTagRegexes(sourceTags);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [highlightRows, notebookRows, conceptRows, questionRows, articleRows] = await Promise.all([
    Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': { $in: tagRegexes } } },
      {
        $project: {
          _id: '$highlights._id',
          tags: '$highlights.tags'
        }
      },
      { $sort: { 'highlights.createdAt': -1 } },
      { $limit: 120 }
    ]),
    NotebookEntry.find({ userId, tags: { $in: tagRegexes } })
      .select('_id tags updatedAt')
      .sort({ updatedAt: -1 })
      .limit(120)
      .lean(),
    TagMeta.find({ userId, name: { $in: tagRegexes } })
      .select('_id name updatedAt')
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean(),
    Question.find({
      userId,
      $or: [{ linkedTagName: { $in: tagRegexes } }, { conceptName: { $in: tagRegexes } }]
    })
      .select('_id linkedTagName conceptName updatedAt')
      .sort({ updatedAt: -1 })
      .limit(60)
      .lean(),
    Article.find({ userId, 'highlights.tags': { $in: tagRegexes } })
      .select('_id highlights.tags updatedAt')
      .sort({ updatedAt: -1 })
      .limit(60)
      .lean()
  ]);

  highlightRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'highlight' && itemId === sourceId) return;
    const overlap = computeTagOverlapScore(sourceTagSet, row?.tags || []);
    scoreRelatedCandidate(
      candidateMap,
      'highlight',
      itemId,
      'tag',
      RELATED_REASON_SCORES.tag + overlap
    );
  });

  notebookRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'notebook' && itemId === sourceId) return;
    const overlap = computeTagOverlapScore(sourceTagSet, row?.tags || []);
    scoreRelatedCandidate(
      candidateMap,
      'notebook',
      itemId,
      'tag',
      RELATED_REASON_SCORES.tag + overlap
    );
  });

  conceptRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'concept' && itemId === sourceId) return;
    scoreRelatedCandidate(candidateMap, 'concept', itemId, 'tag', RELATED_REASON_SCORES.tag + 1);
  });

  questionRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'question' && itemId === sourceId) return;
    const overlap = computeTagOverlapScore(sourceTagSet, [row?.linkedTagName, row?.conceptName]);
    scoreRelatedCandidate(
      candidateMap,
      'question',
      itemId,
      'tag',
      RELATED_REASON_SCORES.tag + overlap
    );
  });

  articleRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'article' && itemId === sourceId) return;
    const articleTags = [];
    (row?.highlights || []).forEach(highlight => {
      (highlight?.tags || []).forEach(tag => articleTags.push(tag));
    });
    const overlap = computeTagOverlapScore(sourceTagSet, articleTags);
    scoreRelatedCandidate(
      candidateMap,
      'article',
      itemId,
      'tag',
      RELATED_REASON_SCORES.tag + overlap
    );
  });
};

const collectConnectionRelatedCandidates = async (userId, sourceType, sourceId, candidateMap) => {
  const connections = await Connection.find({
    userId,
    $or: [
      { fromType: sourceType, fromId: sourceId },
      { toType: sourceType, toId: sourceId }
    ]
  })
    .select('fromType fromId toType toId relationType')
    .sort({ createdAt: -1 })
    .limit(160)
    .lean();

  connections.forEach(connection => {
    const pointsFromSource = connection.fromType === sourceType && connection.fromId === sourceId;
    const itemType = pointsFromSource ? connection.toType : connection.fromType;
    const itemId = pointsFromSource ? connection.toId : connection.fromId;
    if (!itemType || !itemId) return;
    scoreRelatedCandidate(
      candidateMap,
      itemType,
      itemId,
      'connection',
      RELATED_REASON_SCORES.connection
    );
  });
};

const collectCoViewCandidates = async (userId, sourceType, sourceId, candidateMap) => {
  const lookbackStart = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const rows = await ItemViewEvent.find({
    userId,
    createdAt: { $gte: lookbackStart },
    $or: [
      { itemType: sourceType, itemId: sourceId, previousItemType: { $ne: '' }, previousItemId: { $ne: '' } },
      { previousItemType: sourceType, previousItemId: sourceId }
    ]
  })
    .select('itemType itemId previousItemType previousItemId')
    .sort({ createdAt: -1 })
    .limit(260)
    .lean();

  rows.forEach(row => {
    const sourceIsCurrent = row.itemType === sourceType && row.itemId === sourceId;
    const candidateType = sourceIsCurrent ? row.previousItemType : row.itemType;
    const candidateId = sourceIsCurrent ? row.previousItemId : row.itemId;
    scoreRelatedCandidate(candidateMap, candidateType, candidateId, 'coview', RELATED_REASON_SCORES.coview);
  });
};

const hydrateRelatedCandidates = async (userId, candidateMap, limit = 8) => {
  const idsByType = {
    highlight: new Set(),
    notebook: new Set(),
    article: new Set(),
    concept: new Set(),
    question: new Set(),
    wiki_page: new Set(),
    wiki_claim: new Set()
  };
  candidateMap.forEach(candidate => {
    addToCandidateSet(idsByType[candidate.itemType], candidate.itemId);
  });
  const nodeMap = await buildGraphNodeMap(userId, idsByType);

  const hydrated = [];
  candidateMap.forEach((candidate, key) => {
    const nodeKey = buildGraphNodeKey(candidate.itemType, candidate.itemId);
    const node = nodeMap.get(nodeKey);
    if (!node) return;
    hydrated.push({
      id: key,
      itemType: candidate.itemType,
      itemId: candidate.itemId,
      title: node.title || 'Untitled',
      snippet: node.snippet || '',
      tags: Array.isArray(node.tags) ? node.tags : [],
      updatedAt: node.updatedAt || null,
      openPath: node.openPath || '',
      score: candidate.score,
      reasons: Array.from(candidate.reasons)
    });
  });

  return hydrated
    .sort((a, b) => (
      (b.score - a.score) ||
      (new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    ))
    .slice(0, limit);
};

app.use(buildSearchRetrievalRouter({
  mongoose,
  authenticateToken,
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

const normalizeSearchTypes = (types) => {
  if (!Array.isArray(types)) return undefined;
  return types
    .map((type) => String(type || '').trim())
    .filter(Boolean)
    .map((type) => {
      if (type === 'notebook' || type === 'notebook_entry') return 'notebook_block';
      return type;
    });
};

const normalizeRelatedTypes = (types) => normalizeSearchTypes(types);
const SEMANTIC_RESULT_TYPES = new Set(['highlight', 'concept']);

const parseSemanticResultTypes = (value, fallback = ['highlight']) => {
  const parsed = parseCsvList(value)
    .map(type => normalizeConnectionItemType(type))
    .filter(type => SEMANTIC_RESULT_TYPES.has(type));
  if (parsed.length === 0) return fallback;
  return Array.from(new Set(parsed));
};

const isAiRouteMissingError = (error) => {
  if (!error || Number(error.status) !== 404) return false;
  const detail = String(error?.payload?.detail || '').trim();
  return detail === 'Not Found' && error?.payload?.upstream === 'ai_service';
};

const isAiTransientCapacityError = (error) => {
  const status = Number(error?.status);
  if (![429, 502, 503, 504].includes(status)) return false;
  const detail = String(error?.payload?.detail || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 429 ||
    detail.includes('rate-limited') ||
    detail.includes('credits depleted') ||
    message.includes('service error 429') ||
    message.includes('timed out')
  );
};

const fetchSimilarEmbeddingsWithAvailability = async ({ userId, sourceId, types, limit, requestId }) => {
  if (!isAiEnabled()) {
    return { results: [], modelAvailable: false };
  }
  try {
    const response = await aiSimilarTo({
      userId: String(userId),
      sourceId: String(sourceId),
      types,
      limit
    }, { requestId });
    return {
      results: Array.isArray(response?.results) ? response.results : [],
      modelAvailable: true
    };
  } catch (error) {
    if (isAiRouteMissingError(error)) {
      console.warn('[AI-UPSTREAM] similar endpoint missing on ai_service; returning empty results', {
        requestId,
        sourceId: String(sourceId),
        types: Array.isArray(types) ? types : []
      });
      return { results: [], modelAvailable: false };
    }
    if (isAiTransientCapacityError(error)) {
      console.warn('[AI-UPSTREAM] similar endpoint transient upstream error; returning empty results', {
        requestId,
        sourceId: String(sourceId),
        status: Number(error?.status) || 0
      });
      return { results: [], modelAvailable: false };
    }
    throw error;
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

const toSimilarityBand = (score) => {
  const safeScore = Number(score);
  if (!Number.isFinite(safeScore) || safeScore <= 0) return 'Low';
  if (safeScore >= 0.82) return 'High';
  if (safeScore >= 0.72) return 'Medium';
  return 'Low';
};

const buildSemanticSourceId = async (sourceType, sourceId, userId) => {
  const safeType = normalizeConnectionItemType(sourceType);
  const safeSourceId = String(sourceId || '').trim();
  if (!safeType || !safeSourceId) return null;
  if (safeType === 'highlight') {
    const highlight = await findHighlightById(userId, safeSourceId);
    if (!highlight) return null;
    return {
      sourceType: 'highlight',
      sourceObjectId: String(highlight._id),
      embeddingId: buildEmbeddingId({
        userId: String(userId),
        objectType: 'highlight',
        objectId: String(highlight._id)
      })
    };
  }
  if (safeType === 'concept') {
    const concept = await resolveConceptByParam(userId, safeSourceId, { createIfMissing: false });
    if (!concept) return null;
    return {
      sourceType: 'concept',
      sourceObjectId: String(concept._id),
      embeddingId: buildEmbeddingId({
        userId: String(userId),
        objectType: 'concept',
        objectId: String(concept._id)
      })
    };
  }
  return null;
};

const buildRangeStart = (range) => {
  const mapping = { '7d': 7, '30d': 30, '90d': 90 };
  const days = mapping[range] || 7;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
};

const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const stopWords = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you',
  'are', 'was', 'were', 'have', 'has', 'had', 'but', 'not', 'about', 'what',
  'when', 'where', 'who', 'why', 'how', 'can', 'could', 'should', 'would',
  'their', 'they', 'them', 'then', 'than', 'these', 'those', 'its', 'it', 'in',
  'on', 'of', 'to', 'a', 'an', 'as', 'is', 'be', 'by', 'or', 'we', 'our'
]);

const labelCluster = (highlights) => {
  const tagCounts = new Map();
  highlights.forEach(item => {
    (item.tags || []).forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  if (tagCounts.size > 0) {
    return Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }
  const wordCounts = new Map();
  highlights.forEach(item => {
    const words = stripHtml(item.text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
  });
  if (wordCounts.size === 0) return 'Highlights';
  return Array.from(wordCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
};

const getObjectIdFromEmbedding = (item) => {
  if (item?.metadata?.objectId) return String(item.metadata.objectId);
  const parsed = parseEmbeddingId(item?.id || '');
  return parsed.objectId ? String(parsed.objectId) : '';
};

const sentimentScore = (text = '') => {
  const positive = ['growth', 'improve', 'benefit', 'win', 'success', 'good', 'great', 'strong', 'positive'];
  const negative = ['risk', 'problem', 'failure', 'bad', 'weak', 'negative', 'loss', 'decline', 'conflict'];
  const lower = stripHtml(text).toLowerCase();
  let score = 0;
  positive.forEach(word => {
    if (lower.includes(word)) score += 1;
  });
  negative.forEach(word => {
    if (lower.includes(word)) score -= 1;
  });
  return score;
};

const extractQuestions = (texts = []) => {
  const questions = new Set();
  texts.forEach(text => {
    const clean = stripHtml(text || '');
    const parts = clean.split(/(?<=[?.!])\s+/);
    parts.forEach(part => {
      const trimmed = part.trim();
      if (!trimmed) return;
      if (trimmed.endsWith('?')) {
        questions.add(trimmed);
        return;
      }
      if (/^(why|how|what|where|when|who)\b/i.test(trimmed)) {
        questions.add(trimmed.endsWith('?') ? trimmed : `${trimmed}?`);
      }
    });
  });
  return Array.from(questions).slice(0, 10);
};

const uniqueStrings = (values = []) => {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const clean = String(value || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  });
  return out;
};

const titleCaseWord = (value = '') => {
  const clean = String(value || '').trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const inferThemeTitlesFromTexts = (texts = [], limit = 3) => {
  const counts = new Map();
  texts.forEach((text) => {
    const words = stripHtml(String(text || ''))
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word));
    words.forEach((word) => {
      counts.set(word, (counts.get(word) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => titleCaseWord(word))
    .filter(Boolean);
};

const normalizeThemeObjects = (themes = []) => (
  (Array.isArray(themes) ? themes : [])
    .map((theme) => {
      const title = String(theme?.title || '').trim();
      if (!title) return null;
      return {
        title,
        evidence: Array.isArray(theme?.evidence) ? theme.evidence : [],
        representative: Array.isArray(theme?.representative) ? theme.representative : []
      };
    })
    .filter(Boolean)
);

const normalizeConnectionObjects = (connections = []) => (
  (Array.isArray(connections) ? connections : [])
    .map((item) => {
      const description = String(item?.description || '').trim();
      if (!description) return null;
      return {
        description,
        evidence: Array.isArray(item?.evidence) ? item.evidence : []
      };
    })
    .filter(Boolean)
);

const ensureBestEffortSynthesis = ({
  themes = [],
  connections = [],
  questions = [],
  sourceTexts = []
}) => {
  const safeThemes = normalizeThemeObjects(themes);
  const themeTitles = uniqueStrings([
    ...safeThemes.map((theme) => theme.title),
    ...inferThemeTitlesFromTexts(sourceTexts, 6)
  ]);
  const fallbackThemeTitles = ['Core Pattern', 'Practical Implications', 'Open Risks'];
  const finalThemeTitles = uniqueStrings([...themeTitles, ...fallbackThemeTitles]).slice(0, 3);
  const finalThemes = finalThemeTitles.map((title, idx) => (
    safeThemes[idx] || { title, evidence: [], representative: [] }
  ));

  const safeConnections = normalizeConnectionObjects(connections);
  const fallbackConnections = [
    finalThemeTitles.length >= 2
      ? `Several excerpts connect ${finalThemeTitles[0]} with ${finalThemeTitles[1]}.`
      : 'Several excerpts point to recurring links across the material.',
    'The notes combine concrete examples with broader principles.',
    'There are signals of trade-offs that may require explicit prioritization.'
  ];
  const finalConnections = [
    ...safeConnections,
    ...fallbackConnections.map((description) => ({ description, evidence: [] }))
  ].slice(0, 3);

  const safeQuestions = uniqueStrings((Array.isArray(questions) ? questions : []).map((q) => {
    const text = String(q || '').trim();
    if (!text) return '';
    return text.endsWith('?') ? text : `${text}?`;
  }));
  const fallbackQuestions = [
    `What would strengthen confidence in "${finalThemeTitles[0] || 'this pattern'}"?`,
    `What assumptions could weaken "${finalThemeTitles[1] || 'the current direction'}"?`,
    `What is the next small test to validate "${finalThemeTitles[2] || 'the key risk'}"?`
  ];
  const finalQuestions = uniqueStrings([...safeQuestions, ...fallbackQuestions]).slice(0, 3);

  return {
    themes: finalThemes,
    connections: finalConnections,
    questions: finalQuestions
  };
};

const { parseAiServiceUrl, normalizeAiServiceOrigin, joinUrl } = require('./utils/aiUpstream');

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const truncateText = (text, limit) => (
  text.length > limit ? text.slice(0, limit) : text
);

const applySynthesisLimits = (items = [], limits = {}) => {
  const maxItems = toPositiveInt(limits.maxItems, 60);
  const maxTotalChars = toPositiveInt(limits.maxTotalChars, 25000);
  const maxItemChars = toPositiveInt(limits.maxItemChars, 1200);
  const prepared = items
    .map(item => ({
      ...item,
      text: truncateText(String(item.text || ''), maxItemChars)
    }))
    .filter(item => item.text);

  const recencyValue = (item) => {
    if (typeof item.createdAt === 'number' && !Number.isNaN(item.createdAt)) {
      return item.createdAt;
    }
    if (typeof item.order === 'number' && !Number.isNaN(item.order)) {
      return item.order;
    }
    return 0;
  };

  const byRecency = [...prepared].sort((a, b) => {
    const aValue = recencyValue(a);
    const bValue = recencyValue(b);
    if (aValue === bValue) {
      return (b.order || 0) - (a.order || 0);
    }
    return bValue - aValue;
  });

  const cappedByTotal = [];
  let totalChars = 0;
  for (const item of byRecency) {
    let text = item.text;
    if (text.length > maxTotalChars) {
      text = text.slice(0, maxTotalChars);
    }
    if (totalChars + text.length > maxTotalChars) {
      continue;
    }
    totalChars += text.length;
    cappedByTotal.push({ ...item, text });
    if (totalChars >= maxTotalChars) break;
  }

  let capped = cappedByTotal;
  if (capped.length > maxItems) {
    capped = capped.slice(0, maxItems);
  }

  const stats = {
    item_count: capped.length,
    total_chars: capped.reduce((sum, item) => sum + item.text.length, 0),
    max_item_chars: capped.reduce((max, item) => Math.max(max, item.text.length), 0)
  };

  return { items: capped, stats, limits: { maxItems, maxTotalChars, maxItemChars } };
};

const fetchHighlightsByIds = async (userId, highlightIds) => {
  const ids = (highlightIds || [])
    .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null)
    .filter(Boolean);
  if (!ids.length) return [];
  const results = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': { $in: ids } } },
    { $project: {
      _id: '$highlights._id',
      text: '$highlights.text',
      note: '$highlights.note',
      tags: '$highlights.tags',
      articleId: '$_id',
      articleTitle: '$title',
      createdAt: '$highlights.createdAt'
    } }
  ]);
  return results;
};

const kMeans = (vectors, k, maxIterations = 12) => {
  const count = vectors.length;
  const dims = vectors[0]?.length || 0;
  const centroids = [];
  const used = new Set();
  while (centroids.length < k && centroids.length < count) {
    const idx = Math.floor(Math.random() * count);
    if (used.has(idx)) continue;
    used.add(idx);
    centroids.push([...vectors[idx]]);
  }
  const assignments = new Array(count).fill(0);
  for (let iter = 0; iter < maxIterations; iter += 1) {
    let changed = false;
    for (let i = 0; i < count; i += 1) {
      let bestIdx = 0;
      let bestScore = -Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const score = cosineSimilarity(vectors[i], centroids[c]);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = c;
        }
      }
      if (assignments[i] !== bestIdx) {
        assignments[i] = bestIdx;
        changed = true;
      }
    }
    const sums = Array.from({ length: centroids.length }, () => new Array(dims).fill(0));
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < count; i += 1) {
      const cluster = assignments[i];
      counts[cluster] += 1;
      for (let d = 0; d < dims; d += 1) {
        sums[cluster][d] += vectors[i][d];
      }
    }
    for (let c = 0; c < centroids.length; c += 1) {
      if (!counts[c]) continue;
      for (let d = 0; d < dims; d += 1) {
        centroids[c][d] = sums[c][d] / counts[c];
      }
    }
    if (!changed) break;
  }
  return { centroids, assignments };
};

const handleSemanticSearch = async (req, res, query, rawTypes, rawLimit) => {
  if (!isAiEnabled()) {
    return res.status(503).json({ error: 'AI_DISABLED', hint: 'Set AI_ENABLED=true to enable AI search.' });
  }
  const q = String(query || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Query is required.' });
  }
  const limit = Math.min(Number(rawLimit) || 12, 30);
  const types = normalizeSearchTypes(rawTypes);
  try {
    const response = await aiSemanticSearch({
      userId: String(req.user.id),
      query: q,
      types,
      limit
    }, { requestId: req.requestId });
    const matches = Array.isArray(response?.results) ? response.results : [];
    const results = await hydrateSemanticResults({ matches, userId: req.user.id });
    await markTourSignal(req.user.id, 'semanticSearchUsed', 'semantic_search_used');
    res.status(200).json({ results });
  } catch (error) {
    if (isAiRouteMissingError(error)) {
      console.warn('[AI-UPSTREAM] search endpoint missing on ai_service; returning empty semantic search results', {
        requestId: req.requestId,
        query: q.slice(0, 80)
      });
      return res.status(200).json({ results: [] });
    }
    if (isAiTransientCapacityError(error)) {
      console.warn('[AI-UPSTREAM] search endpoint transient upstream error; returning empty semantic search results', {
        requestId: req.requestId,
        status: Number(error?.status) || 0
      });
      return res.status(200).json({ results: [] });
    }
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
};

app.use(buildSemanticSearchRouter({
  authenticateToken,
  parseCsvList,
  normalizeConnectionItemType,
  isAiEnabled,
  aiSemanticSearch,
  aiSimilarTo,
  hydrateSemanticResults,
  findHighlightById,
  resolveConceptByParam,
  buildEmbeddingId,
  markTourSignal,
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
  escapeRegExp,
  trackEvent,
  EVENT_NAMES
}));

app.use(buildSharedConceptRouter({
  authenticateToken,
  SharedConcept,
  TagMeta,
  ConceptNote,
  User,
  escapeRegExp,
  getConceptRelated
}));

app.use(buildSharedQuestionRouter({
  authenticateToken,
  SharedQuestion,
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

app.use(buildAgentTokenRouter({
  mongoose,
  authenticateToken,
  AgentToken,
  ConnectorActionLog,
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken
}));

app.use(buildAgentConnectRouter({
  authenticateToken,
  AgentConnectSession,
  AgentToken,
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken
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
  listProtocolHookRuns,
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

app.use(buildAgentMemoryApprovalRouter({
  authenticateToken,
  AgentProtocolApproval,
  createMemoryCommitApproval
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
  WikiPage,
  WikiSchemaSettings,
  normalizeThreadScope,
  appendThreadMessage,
  compactThreadState,
  normalizeThreadPlanner,
  sanitizeAgentThreadDoc,
  sanitizeAgentRunDoc,
  AgentArtifactDraft,
  createAgentArtifactDraftFromSkillReply,
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
  shouldResolveExecutionIntent,
  resolveExecutableProposalBundle,
  applyProposalBundleInvalidations,
  sanitizeAgentArtifactDraftDoc,
  threadMessagesToHistory,
  truncate: truncateThreadText,
  trackEvent,
  EVENT_NAMES
}));

app.use(buildAgentArtifactDraftRouter({
  authenticateToken,
  AgentArtifactDraft,
  NotebookEntry,
  Question,
  updateConceptMeta,
  syncNotebookReferences,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding,
  createBlockId,
  AgentHandoff,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc,
  sanitizeAgentArtifactDraftDoc,
  promoteAgentArtifactDraftRecord,
  trackEvent,
  EVENT_NAMES
}));

app.use(buildAgentHarnessMetricsRouter({
  authenticateToken,
  AgentThread,
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  AgentArtifactDraft,
  AgentProtocolApproval,
  getAgentHarnessMetricsSnapshot,
  getAgentHarnessRunHistorySnapshot,
  getAgentOutcomeTelemetrySnapshot
}));

app.use(buildAgentUpkeepCycleRouter({
  mongoose,
  authenticateToken,
  AgentUpkeepCycle,
  AgentHandoff,
  sanitizeAgentHandoffDoc,
  sanitizeAgentThreadDoc,
  resolveAutoHandoffRequestedActor,
  getUserAgentProtocolPolicy,
  buildAgentPlanner,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority,
  parseOptionalDate
}));

app.use(buildConceptAgentRouter({
  authenticateToken,
  resolveConceptByParam,
  buildConceptWorkspace,
  createConceptSuggestionDraft,
  getConceptSuggestionDrafts,
  mutateConceptSuggestionDraft,
  getUserAgentEntitlements,
  logAgentMetric,
  getAgentMetricsSnapshot
}));

app.use(buildConceptWorkspaceRouter({
  mongoose,
  authenticateToken,
  resolveConceptByParam,
  ensureWorkspace,
  toSafeObjectId,
  findHighlightById,
  Article,
  NotebookEntry,
  validateWorkspacePayload,
  applyPatchOp,
  executeWorkspaceActionsWithPolicy,
  normalizeAgentActionFlow,
  normalizeAgentActorType,
  markTourSignal
}));

app.use(buildConceptLayoutRouter({
  authenticateToken,
  resolveConceptByParam,
  normalizeConceptLayout,
  createConceptLayoutCard,
  normalizeConceptLayoutCardRole
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

app.use(buildAiInsightsRouter({
  mongoose,
  authenticateToken,
  Article,
  TagMeta,
  Question,
  NotebookEntry,
  buildRangeStart,
  buildEmbeddingId,
  aiGetEmbeddings,
  labelCluster,
  kMeans,
  cosineSimilarity,
  fetchSimilarEmbeddings,
  getObjectIdFromEmbedding,
  findHighlightById,
  EmbeddingError,
  sendEmbeddingError,
  fetchHighlightsByIds,
  buildSnippet,
  applySynthesisLimits,
  parseAiServiceUrl,
  joinUrl,
  toPositiveInt,
  aiEmbedTexts,
  sentimentScore,
  extractQuestions,
  ensureBestEffortSynthesis,
  aiSemanticSearch,
  hydrateSemanticResults,
  isGenerationEnabled,
  generateDraftInsights
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
  Article,
  NotebookEntry,
  ReferenceEdge,
  ConceptNote,
  Question,
  enqueueQuestionEmbedding,
  findHighlightById,
  createBlockId,
  normalizeBoardScopeType,
  normalizeBoardScopeId,
  TagMeta,
  escapeRegExp,
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

app.use(buildSavedViewRouter({
  mongoose,
  authenticateToken,
  SavedView,
  Article,
  NotebookEntry
}));

app.use(buildTodayRouter({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry
}));

app.use(buildImportSessionRouter({
  authenticateToken,
  ImportSession
}));

app.use(buildImportRouter({
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
  syncNotebookReferences,
  enqueueArticleEmbedding,
  enqueueHighlightEmbedding,
  enqueueNotebookEmbedding
}));

app.use(buildExportPublicRouter({
  mongoose,
  authenticateToken,
  NotebookEntry,
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
  SavedView,
  PDFDocument,
  archiver
}));

app.use(buildReflectionRouter({
  mongoose,
  authenticateToken,
  enqueueBrainSummary,
  BrainSummary,
  Article,
  Question,
  getReflections
}));

app.use(buildCollectionRouter({
  mongoose,
  authenticateToken,
  Collection,
  slugify,
  Article
}));

app.use(buildHighlightMutationRouter({
  mongoose,
  authenticateToken: authenticateUserOrAgentToken,
  Article,
  normalizeTags,
  enqueueHighlightEmbedding,
  safeMapEmbedding,
  highlightToEmbeddingItem,
  queueEmbeddingUpsert,
  markTourSignal,
  normalizeItemType,
  parseClaimId,
  buildEmbeddingId,
  queueEmbeddingDelete,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  NotebookEntry,
  TagMeta,
  Question
}));

app.use(buildAiMaintenanceRouter({
  authenticateToken,
  isAiEnabled,
  Article,
  NotebookEntry,
  TagMeta,
  Question,
  EmbeddingJob,
  safeMapEmbedding,
  articleToEmbeddingItems,
  highlightToEmbeddingItem,
  notebookEntryToEmbeddingItems,
  conceptToEmbeddingItem,
  questionToEmbeddingItem,
  upsertEmbeddings,
  checkUpstreamHealth,
  EmbeddingError,
  sendEmbeddingError
}));

app.use(buildSystemRouter({
  authenticateToken,
  parseAiServiceUrl,
  joinUrl,
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

startServer({
  app,
  port: PORT,
  parseAiServiceUrl,
  joinUrl
});
