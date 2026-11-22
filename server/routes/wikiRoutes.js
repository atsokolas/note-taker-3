
const { reviewerMaintenanceArgs: defaultReviewerMaintenanceArgs } = require('../services/reviewerRehearsalBudget');
const express = require('express');
const mongoose = require('mongoose');
const { maintainWikiPage: defaultMaintainWikiPage, evaluateWikiArticleQuality: defaultEvaluateWikiArticleQuality } = require('../services/wikiMaintenanceService');
const { prepareOrdinaryWikiBuild: defaultPrepareOrdinaryWikiBuild } = require('../services/wikiBuildPreflightService');
const {
  buildSectionMaintenancePlan,
  deriveClaimsFromDoc
} = require('../services/wikiMaintenanceService');
const { askWikiPage: defaultAskWikiPage, loadWikiAskCorpus: defaultLoadWikiAskCorpus } = require('../services/wikiAskService');
const { buildWikiBriefing: defaultBuildWikiBriefing } = require('../services/wikiBriefingService');
const { fetchArticleBody } = require('../services/readableArticle');
const { takeSourcesIntoLibrary } = require('../services/takeSourcesIntoLibrary');
const { findWikiBacklinks: defaultFindWikiBacklinks } = require('../services/wikiBacklinkService');
const { getWikiSchemaPromptContent } = require('../services/wikiSchemaService');
const { createWikiRevision, restorePageSnapshot, snapshotPage } = require('../services/wikiRevisionService');
const { buildJudgmentChangeProposalRouter } = require('./judgmentChangeProposalRoutes');
const { buildOpenSentenceAcceptRouter } = require('./openSentenceAcceptRoutes');
const { buildSettleRouter } = require('./settleRoutes');
const { buildCompanyFactsOperatingBenchmark } = require('../services/investmentDossierFreeSourceService');
const {
  acquireOfficialProductSources: defaultAcquireOfficialProductSources
} = require('../services/investmentDossierOfficialSourceService');
const {
  acquireCompetitorPrimarySource: defaultAcquireCompetitorPrimarySource
} = require('../services/investmentDossierCompetitorSourceService');
const {
  acquireIndependentDomainSource: defaultAcquireIndependentDomainSource
} = require('../services/investmentDossierIndependentSourceService');
const {
  MAX_QUOTE_AGE_DAYS,
  acquireMarketSnapshotSource: defaultAcquireMarketSnapshotSource
} = require('../services/investmentDossierMarketSourceService');
const { buildWeekendReadingsRouter } = require('./weekendReadingsRoutes');
const { buildResearchOperatingLedgerRouter } = require('./researchOperatingLedgerRoutes');
const { HUMAN_ONLY_WIKI_LABEL_PATTERN, RESEARCH_LEDGER_LABEL_PATTERN, isHumanOnlyWikiArtifact } = require('../services/wikiProtectedArtifactService');
const { isCompanyDossier, withTransientRetries } = require('../services/wikiDossierBuildReliabilityService');
const { acquireRepoBuildLease } = require('../services/wikiRepoBuildLeaseService');
const { REPO_WIKI_GENERATOR_VERSION } = require('../services/repoWikiGeneratorVersion');
const { createWikiSourceEvent } = require('../services/wikiSourceEventService');
const {
  armEdgarWatchForPage: defaultArmEdgarWatchForPage,
  checkEdgarWatchForPage: defaultCheckEdgarWatchForPage,
  fetchCompanyFacts: defaultFetchCompanyFacts,
  inspectCompanyDossierFiler: defaultInspectCompanyDossierFiler,
  resolveCompanyIdentifier: defaultResolveEdgarCompanyIdentifier
} = require('../services/edgarWatcherService');
const { armTranscriptWatchForPage: defaultArmTranscriptWatchForPage, checkTranscriptWatchForPage: defaultCheckTranscriptWatchForPage } = require('../services/earningsTranscriptWatcherService');
const { armGitHubRepoWatchForPage: defaultArmGitHubRepoWatchForPage, checkGitHubRepoHeadForPage: defaultCheckGitHubRepoHeadForPage, checkGitHubRepoWatchForPage: defaultCheckGitHubRepoWatchForPage, fetchRepoHead: defaultFetchGitHubRepoHead } = require('../services/githubRepoWatcherService');
const { findAutolinkSuggestions } = require('../services/wikiAutolinkService');
const { applyWikiAutolinkToDoc } = require('../services/wikiAutolinkApplyService');
const {
  DEFAULT_PUBLIC_COMPARISON_CACHE_TTL_MS,
  DEFAULT_PUBLIC_PAGE_CACHE_TTL_MS,
  createPublicComparisonCache
} = require('../services/publicComparisonCache');
const { quotedArticleIds, serializePublicCasebook } = require('../services/judgmentPublicProjection');
const { CasebookLineageError, publicLineageTree } = require('../services/casebookLineageService');
const { syncWikiPageGraphConnections } = require('../services/wikiGraphConnectionService');
const { lintWiki: defaultLintWiki } = require('../services/wikiLintService');
const { docText } = require('../lib/editorialText');
const {
  activeProposalsNeedClusteringRefresh,
  autoMergeProposalCandidates,
  buildArchiveSignals,
  buildProposalCandidates,
  retireStaleActiveProposals,
  shapeWikiProposalCandidates
} = require('../services/wikiProposalService');
const {
  emptyDoc,
  normalizeBodyDoc,
  slugify,
  buildUniqueWikiSlugBuilder,
  normalizeTitle,
  normalizeCreatedFrom,
  buildDraftDoc,
  clonePlain,
  serializeWikiPage,
  buildPublicInvestmentValuation,
  serializePublicWikiPage,
  buildAdoptableWikiPageSnapshot,
  remapWikiLinkPageIdsInDoc,
  serializeId
} = require('../services/wikiPageShape');
const activeWikiDraftStreams = new Map();

const normalizeExternalHttpUrl = (value = '', label = 'URL') => {
  const raw = String(value || '').trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_error) {
    const error = new Error(`${label} must be a valid public URL.`);
    error.statusCode = 400;
    throw error;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    const error = new Error(`${label} must use http or https.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed.toString();
};
const rejectAgentReservedWeekendReadingsCreation = (req, res, createdFrom) => {
  if (!req?.agentToken || !isHumanOnlyWikiArtifact({ createdFrom })) return false;
  res.status(403).json({ error: 'Only the human owner can create protected research artifacts.' });
  return true;
};

const assertHumanForResolvedWeekendReadingsTargets = async ({ WikiPage, req, pageIds = [] } = {}) => {
  if (!req?.agentToken) return;
  for (const pageId of Array.from(new Set(pageIds.map(serializeId).filter(Boolean)))) {
    const page = await WikiPage.findOne({ _id: pageId, userId: req.user.id })
      .select('createdFrom.label')
      .lean();
    if (isHumanOnlyWikiArtifact(page)) {
      const error = new Error('Only the human owner can mutate protected research artifacts.');
      error.statusCode = 403;
      throw error;
    }
  }
};

const buildRequireHumanForWeekendReadingsMutation = ({ WikiPage } = {}) => async (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (!req.agentToken || !['PATCH', 'POST', 'PUT', 'DELETE'].includes(method)) return next();
  if (!String(req.path || '').startsWith('/api/wiki/pages/') || !req.params?.id) return next();
  try {
    const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id })
      .select('createdFrom.label')
      .lean();
    if (isHumanOnlyWikiArtifact(page)) {
      return res.status(403).json({ error: 'Only the human owner can mutate protected research artifacts.' });
    }
    return next();
  } catch (_error) {
    return res.status(400).json({ error: 'Invalid wiki page id.' });
  }
};
const {
  buildWikiDraftState,
  cleanWikiSummary,
  attachSourceEventsToPageRefs,
  sortActivityEvents,
  normalizeSourceRef,
  serializeWikiProposal,
  proposalsAreStale
} = require('../services/wikiSourceRefs');

// How long a detached build may run before it is recorded as failed. Comfortably
// past a normal build (10-20s observed) and well inside the client's patience, so
// the page tells the truth before the user gives up on it.
const DEFAULT_ASYNC_BUILD_TIMEOUT_MS = 4 * 60 * 1000;
const {
  WIKI_JUDGMENT_INDEX_FIELDS,
  WIKI_COLLECTION_SEARCH_FIELDS,
  wikiCollectionSearchClause,
  WIKI_PAGE_SUMMARY_FIELDS,
  PUBLIC_WIKI_PAGE_SELECT
} = require('../services/wikiPageFields');

const buildWikiRouter = ({
  authenticateToken,
  WikiPage,
  /* Only for the masthead's edition number: the day the account began. */
  User = null,
  WikiProposal = null,
  WikiRevision = null,
  WikiLintRun = null,
  WikiSourceEvent = null,
  WikiMaintenanceRun = null,
  WikiRepoBaseline = null,
  WikiBriefingCache = null,
  /* Resolves the highlight a new claim cites. Optional: without it a claim
     can still be held, it just arrives without its evidence attached. */
  findHighlightById = null,
  /* The morning paper's own record. Optional: a deployment without it still
     serves the paper, it just cannot say how many times it has asked. */
  MorningPaperRecord = null,
  WikiPageVisit = null,
  WikiSharedCollection = null,
  CasebookLineage = null,
  WikiSchemaSettings = null,
  Connection = null,
  ConnectorActionLog = null,
  IntegrationConnection = null,
  ImportSession = null,
  NoeisReceipt = null,
  JudgmentResponseDraft = null,
  Article = null,
  /* Fills in the body of a source a shared wiki brought into the Library. */
  fetchSourceBody = url => fetchArticleBody({ url }),
  VectorItem = null,
  NotebookEntry = null,
  TagMeta = null,
  Question = null,
  createNotionPage = null,
  appendNotionBlockChildren = null,
  updateNotionPageTitle = null,
  decryptSecret = null,
  maintainWikiPage = defaultMaintainWikiPage,
  reviewerMaintenanceArgs = defaultReviewerMaintenanceArgs,
  asyncBuildTimeoutMs = DEFAULT_ASYNC_BUILD_TIMEOUT_MS,
  evaluateWikiArticleQuality = defaultEvaluateWikiArticleQuality,
  prepareOrdinaryWikiBuild = defaultPrepareOrdinaryWikiBuild,
  lintWiki = defaultLintWiki,
  askWikiPage = defaultAskWikiPage,
  loadWikiAskCorpus = defaultLoadWikiAskCorpus,
  buildWikiBriefing = defaultBuildWikiBriefing,
  armEdgarWatchForPage = defaultArmEdgarWatchForPage,
  checkEdgarWatchForPage = defaultCheckEdgarWatchForPage,
  fetchCompanyFacts = defaultFetchCompanyFacts,
  acquireOfficialProductSources = defaultAcquireOfficialProductSources,
  acquireCompetitorPrimarySource = defaultAcquireCompetitorPrimarySource,
  acquireIndependentDomainSource = defaultAcquireIndependentDomainSource,
  acquireMarketSnapshotSource = defaultAcquireMarketSnapshotSource,
  inspectCompanyDossierFiler = defaultInspectCompanyDossierFiler,
  resolveEdgarCompanyIdentifier = defaultResolveEdgarCompanyIdentifier,
  armTranscriptWatchForPage = defaultArmTranscriptWatchForPage,
  checkTranscriptWatchForPage = defaultCheckTranscriptWatchForPage,
  armGitHubRepoWatchForPage = defaultArmGitHubRepoWatchForPage,
  checkGitHubRepoHeadForPage = defaultCheckGitHubRepoHeadForPage,
  checkGitHubRepoWatchForPage = defaultCheckGitHubRepoWatchForPage,
  fetchGitHubRepoHead = defaultFetchGitHubRepoHead,
  findWikiBacklinks = defaultFindWikiBacklinks,
  shapeWikiProposalCandidates: shapeWikiProposalCandidatesRunner = shapeWikiProposalCandidates,
  trackEvent = null,
  EVENT_NAMES = {}
}) => {
  const router = express.Router();
  const publicComparisonCache = createPublicComparisonCache({
    ttlMs: Number(process.env.PUBLIC_COMPARISON_CACHE_TTL_MS || DEFAULT_PUBLIC_COMPARISON_CACHE_TTL_MS)
  });
  const publicPageCache = createPublicComparisonCache({
    ttlMs: Number(process.env.PUBLIC_WIKI_PAGE_CACHE_TTL_MS || DEFAULT_PUBLIC_PAGE_CACHE_TTL_MS)
  });

  const trackWikiEvent = (req, event, properties = {}) => {
    if (!trackEvent || !event) return;
    trackEvent({
      event,
      userId: req.user?.id,
      requestId: req.requestId,
      properties
    });
  };

  const summarizeAgentArgs = (req) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const summary = {
      params: req.params || {},
      query: req.query || {},
      bodyFields: Object.keys(body).slice(0, 30)
    };
    [
      'title',
      'pageType',
      'status',
      'visibility',
      'sourceScope',
      'sourceType',
      'url',
      'question',
      'connector',
      'action',
      'targetPageId',
      'proposalId',
      'runId',
      'snapshotId'
    ].forEach((field) => {
      if (body[field] !== undefined) summary[field] = body[field];
    });
    if (typeof body.text === 'string') summary.textLength = body.text.length;
    if (typeof body.markdown === 'string') summary.markdownLength = body.markdown.length;
    if (body.body !== undefined) summary.hasDocumentBody = true;
    if (Array.isArray(body.sources)) summary.sourceCount = body.sources.length;
    return summary;
  };

  const inferAgentAction = (req, responseBody = {}) => {
    const method = String(req.method || 'GET').toUpperCase();
    const path = String(req.path || '');
    const params = req.params || {};
    const metadata = {};
    let action = `${method.toLowerCase()}_wiki`;
    let targetType = 'wiki';
    let targetId = '';

    if (path === '/api/wiki/schema') {
      action = method === 'PUT' ? 'update_schema' : 'get_schema';
      targetType = 'wiki_schema';
      targetId = 'wiki_schema';
    } else if (path === '/api/wiki/schema/revert') {
      action = 'revert_schema';
      targetType = 'wiki_schema';
      targetId = 'wiki_schema';
    } else if (path.startsWith('/api/wiki/schema/suggestions')) {
      action = 'suggest_schema';
      targetType = 'wiki_schema';
      targetId = 'wiki_schema';
    } else if (path === '/api/wiki/lint' || path === '/api/wiki/lint/stream') {
      action = 'lint_wiki';
      targetType = 'wiki_lint_run';
      targetId = serializeId(responseBody.runId || responseBody.run?._id || responseBody.run?.id) || '';
    } else if (path.startsWith('/api/wiki/lint/')) {
      action = method === 'POST' ? 'resolve_lint_finding' : 'get_lint_run';
      targetType = 'wiki_lint_run';
      targetId = String(params.runId || '');
    } else if (path === '/api/wiki/pages') {
      action = method === 'POST'
        ? (req.body?.preset === 'living_thesis' ? 'create_judgment_page' : 'create_page')
        : 'list_pages';
      targetType = method === 'POST' ? 'wiki_page' : 'wiki';
      targetId = serializeId(responseBody.page?._id || responseBody.page?.id || responseBody._id || responseBody.id) || '';
    } else if (path.includes('/api/wiki/pages/') && path.includes('/markdown')) {
      action = 'get_page_markdown';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/ai/draft')) {
      action = path.includes('/stream') ? 'draft_page_stream' : 'draft_page';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/sources')) {
      action = method === 'DELETE' ? 'remove_page_source' : 'add_page_source';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/ask')) {
      action = 'ask_page';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/discussions')) {
      action = path.includes('/promote') ? 'promote_discussion_answer' : 'delete_discussion';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/backlinks')) {
      action = 'list_backlinks';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/graph/rebuild')) {
      action = 'rebuild_page_graph';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/revisions/latest/restore')) {
      action = 'restore_page_revision';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/revisions')) {
      action = 'list_page_revisions';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/connector-actions')) {
      action = 'list_page_connector_actions';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/autolinks')) {
      action = method === 'POST' ? 'apply_autolink' : 'list_autolinks';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/freshness/review')) {
      action = 'review_page_freshness';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.includes('/api/wiki/pages/') && path.includes('/write-back')) {
      action = 'write_back_page';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path.startsWith('/api/wiki/pages/')) {
      action = method === 'PATCH'
        ? (req.body?.judgment !== undefined ? 'update_judgment_page' : 'update_page')
        : method === 'DELETE' ? 'archive_page' : 'get_page';
      targetType = 'wiki_page';
      targetId = String(params.id || '');
    } else if (path === '/api/wiki/briefing') {
      action = 'get_briefing';
    } else if (path === '/api/wiki/graph/rebuild') {
      action = 'rebuild_graph';
      targetType = 'wiki_graph';
      targetId = 'wiki_graph';
    } else if (path === '/api/wiki/proposals') {
      action = 'list_proposals';
      targetType = 'wiki_proposal';
    } else if (path === '/api/wiki/proposals/generate-background') {
      action = 'generate_proposals';
      targetType = 'wiki_proposal';
    } else if (path.includes('/api/wiki/proposals/')) {
      action = path.includes('/accept') ? 'accept_proposal'
        : path.includes('/dismiss') ? 'dismiss_proposal'
          : path.includes('/merge') ? 'merge_proposal'
            : path.includes('/watch') ? 'watch_proposal'
              : 'update_proposal';
      targetType = 'wiki_proposal';
      targetId = String(params.proposalId || '');
    } else if (path === '/api/wiki/ingest') {
      action = 'ingest_source';
      targetType = 'wiki_ingest_run';
      targetId = serializeId(responseBody.runId || responseBody.run?._id || responseBody.sourceEventId) || '';
      if (targetId) metadata.undoPath = `/api/wiki/ingest/${targetId}/undo`;
    } else if (path.includes('/api/wiki/ingest/')) {
      action = path.includes('/undo') ? 'undo_ingest' : 'get_ingest_run';
      targetType = 'wiki_ingest_run';
      targetId = String(params.runId || '');
    } else if (path === '/api/wiki/activity') {
      action = 'list_activity';
    } else if (path === '/api/wiki/source-events') {
      action = 'list_source_events';
      targetType = 'wiki_source_event';
    } else if (path.includes('/api/wiki/source-events')) {
      action = path.includes('/process-pending') ? 'process_pending_source_events' : 'process_source_event';
      targetType = 'wiki_source_event';
      targetId = String(params.sourceEventId || '');
    }

    return { action, targetType, targetId, metadata };
  };

  const auditExternalAgentAction = (req, res, next) => {
    if (!ConnectorActionLog || !req.agentToken) return next();
    const startedAt = Date.now();
    let responseBody = null;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };
    res.on('finish', () => {
      const tokenId = serializeId(req.agentToken?._id || req.agentToken?.id);
      if (!tokenId) return;
      const inferred = inferAgentAction(req, responseBody || {});
      const statusCode = Number(res.statusCode) || 0;
      const direction = ['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase()) ? 'read' : 'write';
      if (
        direction === 'write' &&
        inferred.targetType === 'wiki_page' &&
        inferred.targetId &&
        !inferred.metadata.undoPath
      ) {
        inferred.metadata.undoPath = `/api/wiki/pages/${inferred.targetId}/revisions/latest/restore`;
      }
      const payload = {
        userId: req.user?.id,
        connector: 'wiki_mcp',
        action: inferred.action,
        direction,
        status: statusCode >= 400 ? 'failed' : 'completed',
        resultStatus: statusCode >= 400 ? 'error' : 'ok',
        targetType: inferred.targetType,
        targetId: inferred.targetId,
        beforeRef: inferred.metadata.undoPath || '',
        summary: `${req.agentToken.label || 'External agent'} ${inferred.action.replace(/_/g, ' ')}`,
        errorMessage: statusCode >= 400
          ? String(responseBody?.error || responseBody?.message || '')
          : '',
        agentTokenId: tokenId,
        agentTokenLabel: req.agentToken.label || '',
        actorType: 'agent_token',
        route: req.originalUrl || req.path,
        method: String(req.method || '').toUpperCase(),
        statusCode,
        durationMs: Date.now() - startedAt,
        metadata: {
          tool: inferred.action,
          mutating: direction === 'write',
          resultStatus: statusCode >= 400 ? 'error' : 'ok',
          scopes: req.agentToken.scopes || [],
          args: summarizeAgentArgs(req),
          ...inferred.metadata
        }
      };
      Promise.resolve(
        typeof ConnectorActionLog.create === 'function'
          ? ConnectorActionLog.create(payload)
          : new ConnectorActionLog(payload).save()
      ).catch((error) => {
        console.warn('Failed to audit external wiki action:', error?.message || error);
      });
    });
    return next();
  };

  const requireHumanForWeekendReadingsMutation = buildRequireHumanForWeekendReadingsMutation({ WikiPage });

  const wikiAuth = [authenticateToken, auditExternalAgentAction, requireHumanForWeekendReadingsMutation];

  const buildUniqueSlug = buildUniqueWikiSlugBuilder({ WikiPage });

  router.use(buildWeekendReadingsRouter({
    authenticateToken: wikiAuth,
    WikiPage,
    WikiRevision,
    NoeisReceipt,
    buildUniqueSlug,
    invalidatePublicPageCache: (...keys) => publicPageCache.invalidate(keys)
  }));

  router.use(buildResearchOperatingLedgerRouter({
    authenticateToken: wikiAuth,
    WikiPage,
    WikiRevision,
    NoeisReceipt,
    buildUniqueSlug
  }));

  const buildUniqueCollectionSlug = async (slugBase) => {
    const base = slugify(slugBase || 'shared-wiki');
    if (!WikiSharedCollection?.findOne) return base;
    for (let i = 0; i < 25; i += 1) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const existing = await WikiSharedCollection.findOne({ slug }).select('_id').lean();
      if (!existing) return slug;
    }
    return `${base}-${Date.now()}`;
  };

  const createAdoptedWikiPages = async ({
    userId,
    snapshots = [],
    originType = 'page',
    originCollectionId = '',
    originCollectionTitle = '',
    packId = ''
  } = {}) => {
    const validSnapshots = snapshots.filter(snapshot => snapshot?.page);
    const library = await takeSourcesIntoLibrary({
      Article,
      userId,
      pages: validSnapshots.map(snapshot => snapshot.page),
      label: originCollectionTitle || validSnapshots[0]?.origin?.originTitle || '',
      fetchBody: fetchSourceBody
    });
    const pageIdMap = new Map();
    const pageEntries = [];
    for (const snapshot of validSnapshots) {
      const titleExists = await WikiPage.findOne({
        userId,
        title: snapshot.page.title,
        status: { $ne: 'archived' }
      }).select('_id').lean();
      const title = titleExists ? `${snapshot.page.title} (adapted)` : snapshot.page.title;
      const page = new WikiPage({
        userId,
        title,
        slug: await buildUniqueSlug(userId, title),
        pageType: snapshot.page.pageType,
        status: 'draft',
        visibility: 'private',
        sourceScope: 'selected_sources',
        createdFrom: {
          type: 'wiki_index',
          text: snapshot.page.plainText || '',
          label: originCollectionTitle || snapshot.origin.originTitle || snapshot.page.title
        },
        adoptedFrom: {
          originType,
          kind: snapshot.origin.kind || 'adopt',
          originPageId: mongoose.Types.ObjectId.isValid(snapshot.origin.originPageId)
            ? snapshot.origin.originPageId
            : null,
          originCollectionId,
          originSlug: snapshot.origin.originSlug || '',
          originTitle: snapshot.origin.originTitle || snapshot.page.title,
          originHash: snapshot.origin.originHash || '',
          packId,
          adoptedAt: new Date()
        },
        body: clonePlain(snapshot.page.body || emptyDoc()),
        plainText: snapshot.page.plainText || '',
        sourceRefs: clonePlain(snapshot.page.sourceRefs || [])
      });
      pageIdMap.set(String(snapshot.origin.originPageId || ''), String(page._id));
      pageEntries.push({ page, snapshot, titleExists: Boolean(titleExists) });
    }

    const pages = [];
    for (const entry of pageEntries) {
      entry.page.body = remapWikiLinkPageIdsInDoc(clonePlain(entry.page.body || emptyDoc()), pageIdMap);
      entry.page.plainText = docText(entry.page.body);
      refreshPageClaims(entry.page);
      await entry.page.save();
      await syncPageGraph(entry.page, userId);
      await createWikiRevision({
        WikiRevision,
        userId,
        page: entry.page,
        reason: 'created',
        actorType: 'user',
        summary: originType === 'starter_pack'
          ? `Adopted starter pack "${originCollectionTitle}".`
          : `Adopted shared wiki "${originCollectionTitle || entry.snapshot.origin.originTitle || entry.page.title}".`
      });
      pages.push({ page: entry.page, mergeAvailable: entry.titleExists });
    }
    return {
      pages,
      pageIdMap,
      library
    };
  };

  const adoptStarterPackForUser = async ({ pack, userId }) => {
    const snapshots = pack.pages.map(buildAdoptableWikiPageSnapshot).filter(Boolean);
    return createAdoptedWikiPages({
      userId,
      snapshots,
      originType: 'starter_pack',
      originCollectionId: pack.id,
      originCollectionTitle: pack.name,
      packId: pack.id
    });
  };

  /* find() casts a string id for you; aggregate() does not. */
  const asObjectId = (value) => {
    if (!value || typeof value === 'object') return value;
    try {
      return new mongoose.Types.ObjectId(String(value));
    } catch (_castError) {
      return value;
    }
  };

  const findOwnedPage = (req) => WikiPage.findOne({ _id: req.params.id, userId: req.user.id });

  const sharedWikiQuery = (idOrSlug) => {
    const query = {
      visibility: 'shared',
      status: { $ne: 'archived' },
      'createdFrom.label': { $not: RESEARCH_LEDGER_LABEL_PATTERN }
    };
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) query._id = idOrSlug;
    else query.slug = idOrSlug;
    return query;
  };

  const loadSharedWikiPage = async (idOrSlug) => {
    let pageQuery = WikiPage.findOne(sharedWikiQuery(idOrSlug));
    if (pageQuery?.select) pageQuery = pageQuery.select(PUBLIC_WIKI_PAGE_SELECT);
    return pageQuery?.lean ? pageQuery.lean() : pageQuery;
  };

  const loadCasebookRevisions = async (pageId) => {
    if (!WikiRevision?.find) return [];
    let query = WikiRevision.find({
      pageId,
      promotionStatus: { $nin: ['candidate', 'rejected', 'deferred'] }
    });
    if (query.select) query = query.select('summary reason createdAt promotionStatus');
    if (query.sort) query = query.sort({ createdAt: 1 });
    if (query.limit) query = query.limit(80);
    const rows = query.lean ? await query.lean() : await query;
    return Array.isArray(rows) ? rows : [];
  };

  // The links of the saved pieces a change of mind quotes.
  const quotedArticleUrls = async (page) => {
    const ids = quotedArticleIds(page).filter(id => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length || !Article?.find) return new Map();
    const articles = await Article.find({ _id: { $in: ids }, userId: page.userId }).select('_id url').lean();
    return new Map(articles.map(article => [String(article._id), article.url]));
  };

  const loadPublicCasebook = async (page) => {
    if (!page || !String(page?.judgment?.currentJudgment || '').trim()) return null;
    const revisions = await loadCasebookRevisions(page._id);
    const lineage = await publicLineageTree({ CasebookLineage, WikiPage, page });
    return serializePublicCasebook({ page, revisions, lineage, articleUrls: await quotedArticleUrls(page) });
  };

  const sendLineageError = (res, error) => {
    if (error instanceof CasebookLineageError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error('Casebook lineage error:', error);
    return res.status(500).json({ error: 'Failed to record lineage.' });
  };

  const refreshWikiProposals = async ({ userId, force = false } = {}) => {
    if (!WikiProposal) return { proposals: [], generated: false };
    const activeStatuses = ['pending', 'watched'];
    const existing = await WikiProposal.find({ userId, status: { $in: activeStatuses } })
      .sort({ confidence: -1, updatedAt: -1 })
      .limit(20);
    if (!force && !proposalsAreStale(existing) && !activeProposalsNeedClusteringRefresh(existing)) {
      return { proposals: existing.map(serializeWikiProposal), generated: false };
    }

    const [articles, notebooks, concepts, pages, questions] = await Promise.all([
      /* Four hundred articles, and until now every one of them arrived with
         its whole body attached. buildArchiveSignals only ever keeps 600
         characters of it as a snippet, so the other however-many-hundred
         kilobytes per article were read into the heap purely to be thrown
         away — and on a 512MB box that is the difference between running and
         not. This is what was killing the process: thirteen
         "JavaScript heap out of memory" crashes in thirty-six hours, every one
         of them at ~251MB with the collector already spending 99.9% of its
         time in GC.

         Truncated in the database instead. Twice what the signal keeps, so
         nothing downstream changes. */
      Article?.aggregate ? Article.aggregate([
        { $match: { userId: asObjectId(userId) } },
        { $sort: { updatedAt: -1 } },
        { $limit: 400 },
        {
          $project: {
            title: 1,
            url: 1,
            summary: 1,
            updatedAt: 1,
            content: { $substrCP: [{ $ifNull: ['$content', ''] }, 0, 1200] },
            'highlights.text': 1,
            'highlights.note': 1,
            'highlights.tags': 1
          }
        }
      ]) : [],
      NotebookEntry?.find ? NotebookEntry.find({ userId }).sort({ updatedAt: -1 }).limit(300).lean() : [],
      TagMeta?.find ? TagMeta.find({ userId }).sort({ updatedAt: -1 }).limit(200).lean() : [],
      /* body and discussions are never read on this path — the signals use
         title and plainText — and they are the two largest fields a page
         carries. Excluding them changes nothing downstream. */
      WikiPage.find({ userId, status: { $ne: 'archived' } })
        .select('-body -discussions')
        .sort({ updatedAt: -1 })
        .limit(300)
        .lean(),
      Question?.find ? Question.find({ userId }).sort({ updatedAt: -1 }).limit(200).lean() : []
    ]);

    const signals = buildArchiveSignals({ articles, notebooks, concepts, pages, questions });
    const deterministicCandidates = buildProposalCandidates({ signals, existingPages: pages });
    const candidates = shapeWikiProposalCandidatesRunner
      ? await shapeWikiProposalCandidatesRunner({ candidates: deterministicCandidates, existingPages: pages })
      : deterministicCandidates;
    await autoMergeProposalCandidates({ WikiPage, userId, candidates });
    await retireStaleActiveProposals({ WikiProposal, userId, candidates });
    for (const candidate of candidates) {
      const prior = await WikiProposal.findOne({ userId, clusterKey: candidate.clusterKey });
      if (prior && ['dismissed', 'accepted', 'merged'].includes(prior.status)) continue;
      await WikiProposal.findOneAndUpdate(
        { userId, clusterKey: candidate.clusterKey },
        { $set: { ...candidate, status: candidate.status || 'pending', userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const proposals = await WikiProposal.find({ userId, status: { $in: activeStatuses } })
      .sort({ confidence: -1, updatedAt: -1 })
      .limit(8);
    return { proposals: proposals.map(serializeWikiProposal), generated: true };
  };

  const maintainProposalDraft = async ({ page, userId }) => {
    try {
      await maintainWikiPage({
        page,
        userId,
        wikiSchemaContent: await loadWikiSchemaContent(userId),
        models: { Article, NotebookEntry, TagMeta, Question, WikiSourceEvent }
      });
      await page.save();
      return page;
    } catch (maintenanceError) {
      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        draftStatus: 'error',
        lastError: String(maintenanceError.message || 'Draft maintenance failed.'),
        errorCode: 'PROPOSAL_DRAFT_FAILED'
      };
      await page.save();
      return page;
    }
  };

  router.param('id', (req, res, next, id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
      return res.status(400).json({ error: 'Invalid wiki page id.' });
    }
    return next();
  });

  router.param('sourceRefId', (req, res, next, sourceRefId) => {
    if (!mongoose.Types.ObjectId.isValid(String(sourceRefId || ''))) {
      return res.status(400).json({ error: 'Invalid wiki source id.' });
    }
    return next();
  });

  router.param('sourceEventId', (req, res, next, sourceEventId) => {
    if (!mongoose.Types.ObjectId.isValid(String(sourceEventId || ''))) {
      return res.status(400).json({ error: 'Invalid wiki source event id.' });
    }
    return next();
  });

  router.param('proposalId', (req, res, next, proposalId) => {
    if (!mongoose.Types.ObjectId.isValid(String(proposalId || ''))) {
      return res.status(400).json({ error: 'Invalid wiki proposal id.' });
    }
    return next();
  });

  const wikiModels = () => ({
    WikiSourceEvent,
    WikiPage,
    WikiProposal,
    WikiRevision,
    WikiLintRun,
    WikiMaintenanceRun,
    Connection,
    Article,
    NotebookEntry,
    TagMeta,
    Question,
    WikiSchemaSettings
  });

  const loadWikiSchemaContent = (userId) => getWikiSchemaPromptContent({
    WikiSchemaSettings,
    userId
  });

  const writeSse = (res, event, payload = {}) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const openWikiAskStream = (res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    writeSse(res, 'wiki-ask', {
      stage: 'connected',
      summary: 'Connected to wiki ask stream.'
    });
  };

  const openWikiDraftStream = (res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    writeSse(res, 'wiki-draft', {
      stage: 'connected',
      summary: 'Connected to wiki maintenance stream.'
    });
  };

  const openWikiLintStream = (res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    writeSse(res, 'wiki-lint', {
      stage: 'connected',
      summary: 'Connected to wiki lint stream.'
    });
  };

  const serializeLintRun = (run) => {
    if (!run) return null;
    const raw = typeof run.toObject === 'function' ? run.toObject({ virtuals: false }) : { ...run };
    return {
      ...raw,
      _id: serializeId(raw._id),
      runId: serializeId(raw._id),
      pageId: serializeId(raw.pageId),
      findings: raw.findings || {},
      resolutions: raw.resolutions || {},
      actions: Array.isArray(raw.actions) ? raw.actions : []
    };
  };

  const flattenLintFindings = (findings = {}) => Object.entries(findings || {})
    .flatMap(([group, rows]) => (
      Array.isArray(rows)
        ? rows.map((finding, index) => ({ ...finding, group, index }))
        : []
    ));

  const findLintRun = async (req) => {
    if (!WikiLintRun) return null;
    if (!mongoose.Types.ObjectId.isValid(String(req.params.runId || ''))) return null;
    return WikiLintRun.findOne({ _id: req.params.runId, userId: req.user.id });
  };

  const findLintFinding = (run, findingId = '') => (
    flattenLintFindings(run?.findings || {}).find(finding => String(finding.id || '') === String(findingId || '')) || null
  );

  const updateLintFinding = async ({ run, finding, status, action, result = {} }) => {
    const findings = run.findings?.toObject ? run.findings.toObject() : clonePlain(run.findings || {});
    const rows = Array.isArray(findings[finding.group]) ? findings[finding.group] : [];
    if (!rows[finding.index]) return serializeLintRun(run);
    rows[finding.index] = {
      ...rows[finding.index],
      status,
      resolvedAt: new Date().toISOString()
    };
    findings[finding.group] = rows;
    run.findings = findings;
    run.resolutions = {
      ...(run.resolutions?.toObject ? run.resolutions.toObject() : run.resolutions || {}),
      [finding.id]: {
        status,
        action,
        at: new Date().toISOString(),
        result
      }
    };
    run.actions = [
      ...(Array.isArray(run.actions) ? run.actions : []),
      {
        findingId: finding.id,
        findingType: finding.type,
        action,
        status,
        result,
        at: new Date()
      }
    ];
    run.markModified?.('findings');
    run.markModified?.('resolutions');
    run.markModified?.('actions');
    await run.save();
    return serializeLintRun(run);
  };

  const runMaintenanceForLintPage = async (page, userId) => {
    const before = snapshotPage(page);
    await maintainWikiPage({
      page,
      userId,
      wikiSchemaContent: await loadWikiSchemaContent(userId),
      models: {
        Article,
        NotebookEntry,
        TagMeta,
        Question,
        WikiSourceEvent
      }
    });
    await page.save();
    await syncPageGraph(page, userId);
    await createWikiRevision({
      WikiRevision,
      userId,
      page,
      before,
      reason: 'agent_maintenance',
      actorType: 'agent',
      summary: page.aiState?.maintenanceSummary || `Maintained "${page.title}".`
    });
    return serializeWikiPage(page);
  };

  const createPageFromLintFinding = async ({ finding, userId, maintain = false }) => {
    const title = normalizeTitle(finding.suggestedTitle || String(finding.title || '').replace(/^Potential page:\s*/i, ''));
    const seedText = finding.summary || `Build a source-backed overview page for ${title}.`;
    const page = new WikiPage({
      userId,
      title,
      slug: await buildUniqueSlug(userId, title),
      pageType: 'overview',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      createdFrom: {
        type: 'wiki_index',
        text: seedText,
        label: 'Wiki lint'
      },
      sourceRefs: [],
      body: buildDraftDoc({ title, seedText }),
      plainText: `${title} ${seedText}`,
      claims: [],
      citations: [],
      aiState: {
        draftStatus: 'idle',
        health: {},
        quality: {},
        changeLog: [],
        suggestions: []
      }
    });
    refreshPageClaims(page);
    await page.save();
    await syncPageGraph(page, userId);
    await createWikiRevision({
      WikiRevision,
      userId,
      page,
      before: null,
      reason: 'created',
      actorType: 'agent',
      summary: `Created "${page.title}" from wiki lint.`
    });
    if (maintain) return runMaintenanceForLintPage(page, userId);
    return serializeWikiPage(page);
  };

  const applyLinkFromLintFinding = async ({ finding, userId }) => {
    if (!finding.pageId || !finding.targetPageId) {
      const error = new Error('Lint finding is missing source or target page.');
      error.statusCode = 400;
      throw error;
    }
    const page = await WikiPage.findOne({ _id: finding.pageId, userId, status: { $ne: 'archived' } });
    if (!page) {
      const error = new Error('Source wiki page not found.');
      error.statusCode = 404;
      throw error;
    }
    const targetPage = await WikiPage.findOne({ _id: finding.targetPageId, userId, status: { $ne: 'archived' } }).lean();
    if (!targetPage) {
      const error = new Error('Target wiki page not found.');
      error.statusCode = 404;
      throw error;
    }
    const before = snapshotPage(page);
    const applied = applyWikiAutolinkToDoc({ doc: page.body || emptyDoc(), targetPage });
    if (!applied.applied) {
      const error = new Error('Could not apply link. The mention may already be linked or no longer exists.');
      error.statusCode = 409;
      throw error;
    }
    page.body = applied.doc;
    page.plainText = docText(applied.doc);
    await page.save();
    await syncPageGraph(page, userId);
    await createWikiRevision({
      WikiRevision,
      userId,
      page,
      before,
      reason: 'user_edit',
      actorType: 'agent',
      summary: `Linked "${targetPage.title}" from wiki lint.`
    });
    return serializeWikiPage(page);
  };

  const resolveLintFindingAction = async ({ action, finding, userId }) => {
    if (action === 'ignore') return { ignored: true };
    if (finding.type === 'missing_page' && (action === 'accept' || action === 'fix')) {
      return { page: await createPageFromLintFinding({ finding, userId, maintain: action === 'fix' }) };
    }
    if (finding.type === 'missing_link' && (action === 'accept' || action === 'fix')) {
      return { page: await applyLinkFromLintFinding({ finding, userId }) };
    }
    if (finding.type === 'stale' && (action === 'accept' || action === 'fix')) {
      const page = await WikiPage.findOne({ _id: finding.pageId, userId, status: { $ne: 'archived' } });
      if (!page) {
        const error = new Error('Wiki page not found.');
        error.statusCode = 404;
        throw error;
      }
      return { page: await runMaintenanceForLintPage(page, userId) };
    }
    return { reviewed: true };
  };

  const findMaintenanceRunBySourceEvent = async ({ userId, sourceEventId } = {}) => {
    if (!WikiMaintenanceRun || !sourceEventId) return null;
    return WikiMaintenanceRun.findOne({ userId, sourceEventId }).sort({ createdAt: -1 }).lean();
  };

  const buildIngestTimeline = async ({ userId, event, run = null } = {}) => {
    const rawEvent = event && typeof event.toObject === 'function' ? event.toObject({ virtuals: false }) : event;
    if (!rawEvent) return [];
    const rawRun = run && typeof run.toObject === 'function' ? run.toObject({ virtuals: false }) : run;
    const revisions = WikiRevision
      ? await WikiRevision.find({ userId, sourceEventId: rawEvent._id }).sort({ createdAt: -1 }).limit(50).lean()
      : [];
    return sortActivityEvents([
      {
        id: `${rawEvent._id}:created`,
        type: rawEvent.metadata?.ingest ? 'ingest' : 'source_event',
        runId: serializeId(rawEvent._id),
        status: rawEvent.status || 'pending',
        title: rawEvent.title || rawEvent.url || rawEvent.sourceType,
        summary: cleanWikiSummary(rawEvent.summary || ''),
        at: rawEvent.createdAt
      },
      rawRun ? {
        id: serializeId(rawRun._id),
        type: 'maintenance',
        runId: serializeId(rawRun._id),
        ingestRunId: serializeId(rawEvent._id),
        status: rawRun.status || '',
        pageId: serializeId(rawRun.pageId),
        title: 'Wiki maintenance',
        summary: cleanWikiSummary(rawRun.summary || rawRun.errorMessage || ''),
        at: rawRun.completedAt || rawRun.startedAt || rawRun.createdAt
      } : null,
      ...revisions.map(revision => ({
        id: serializeId(revision._id),
        type: 'revision',
        runId: serializeId(revision.maintenanceRunId),
        ingestRunId: serializeId(rawEvent._id),
        status: 'completed',
        pageId: serializeId(revision.pageId),
        title: revision.reason || 'wiki_revision',
        summary: cleanWikiSummary(revision.summary || ''),
        at: revision.createdAt
      }))
    ]);
  };

  const syncPageGraph = async (page, fallbackUserId = null) => {
    if (!Connection) return null;
    try {
      return await syncWikiPageGraphConnections({
        Connection,
        userId: page?.userId || fallbackUserId,
        page
      });
    } catch (graphError) {
      console.warn('Failed to sync wiki graph connections:', graphError);
      return null;
    }
  };

  const onOwnedPageChanged = async (page, userId) => {
    publicPageCache.invalidate(serializeId(page._id), page.slug);
    await syncPageGraph(page, userId);
  };

  /* A held-sentence edit is a receipt-bound proposal, not a silent Wiki
     mutation. Keep that human review boundary in its own small router so the
     ordinary Wiki reader, generator, and maintenance pipeline stay isolated. */
  router.use(buildJudgmentChangeProposalRouter({
    authenticateToken: wikiAuth,
    WikiPage,
    WikiRevision,
    NoeisReceipt,
    findOwnedPage,
    serializePage: serializeWikiPage,
    onPageChanged: onOwnedPageChanged,
    trackWikiEvent
  }));
  router.use(buildOpenSentenceAcceptRouter({
    authenticateToken: wikiAuth,
    WikiRevision,
    findOwnedPage,
    serializePage: serializeWikiPage,
    onPageChanged: onOwnedPageChanged
  }));

  const refreshPageClaims = (page) => {
    const previousClaims = page.claims?.toObject ? page.claims.toObject() : page.claims || [];
    const now = new Date();
    page.claims = deriveClaimsFromDoc({
      body: page.body || emptyDoc(),
      citations: page.citations || [],
      sourceRefs: page.sourceRefs || [],
      previousClaims,
      now
    });
    page.aiState = {
      ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
      sectionMaintenance: buildSectionMaintenancePlan({
        claims: page.claims,
        health: page.aiState?.health || {},
        changeLog: page.aiState?.changeLog || [],
        now
      })
    };
  };

  router.use(buildSettleRouter({
    authenticateToken: wikiAuth,
    NotebookEntry,
    TagMeta,
    Article,
    WikiPage,
    WikiRevision,
    buildUniqueSlug,
    refreshPageClaims,
    serializePage: serializeWikiPage,
    onPageChanged: onOwnedPageChanged
  }));

  const restorePageSnapshot = (page, snapshot = {}) => {
    if (!page || !snapshot) return;
    const initialRevisionId = page.judgment?.initialRevisionId || null;
    [
      'title',
      'slug',
      'pageType',
      'status',
      'visibility',
      'sourceScope',
      'body',
      'plainText',
      'sourceRefs',
      'claims',
      'citations',
      'judgment',
      'freshness',
      'aiState'
    ].forEach((field) => {
      if (snapshot[field] !== undefined) page[field] = clonePlain(snapshot[field]);
    });
    if (initialRevisionId && page.judgment) page.judgment.initialRevisionId = initialRevisionId;
  };

  const savePageWithVersionRetry = async (page, userId) => {
    try {
      await page.save();
      return page;
    } catch (error) {
      const versionConflict = error?.name === 'VersionError'
        || /No matching document found/i.test(String(error?.message || ''));
      if (!versionConflict) throw error;
      const snapshot = snapshotPage(page);
      const update = {};
      [
        'title',
        'slug',
        'pageType',
        'status',
        'visibility',
        'sourceScope',
        'body',
        'plainText',
        'sourceRefs',
        'claims',
        'citations',
        'judgment',
        'investmentDossier',
        'freshness',
        'aiState'
      ].forEach((field) => {
        if (snapshot[field] !== undefined) update[field] = clonePlain(snapshot[field]);
      });
      const updatedPage = await WikiPage.findOneAndUpdate(
        { _id: page._id, userId },
        { $set: update },
        { new: true, runValidators: true }
      );
      if (!updatedPage) throw error;
      return updatedPage;
    }
  };

  const acquireSecPrimaryPackForDossier = async ({
    page,
    userId,
    now = new Date()
  } = {}) => {
    if (!page || !isCompanyDossier(page)) {
      return {
        filings: [],
        events: [],
        sourcesAdded: 0,
        stop: null,
        skipped: true
      };
    }
    const priorProfile = page.investmentDossier?.toObject
      ? page.investmentDossier.toObject()
      : page.investmentDossier || {};
    const priorState = priorProfile.acquisition?.secPrimaryPack || {};
    if (priorState.status === 'checked') {
      return {
        filings: [],
        events: [],
        sourcesAdded: 0,
        stop: null,
        skipped: true
      };
    }
    const beforeSourceIds = new Set((page.sourceRefs || []).map(source => (
      serializeId(source?.metadata?.sourceEventId || source?.objectId)
    )).filter(Boolean));
    let result;
    let stop = null;
    try {
      result = await withTransientRetries({
        attempts: 3,
        delaysMs: [750, 2000],
        operation: () => checkEdgarWatchForPage({
          WikiSourceEvent,
          page,
          limit: 8,
          selectionMode: 'company_dossier_bootstrap'
        })
      });
      const bootstrapEvents = (result.events || []).map((event) => {
        const raw = event?.toObject ? event.toObject() : event;
        return {
          ...raw,
          metadata: {
            ...(raw?.metadata || {}),
            sourceEventId: serializeId(raw?._id),
            evidenceArchetype: 'filing',
            evidenceState: 'attached_at_creation',
            bootstrapDisposition: 'attached_for_first_build'
          }
        };
      });
      await attachSourceEventsToPageRefs({
        page,
        events: bootstrapEvents,
        limit: 8
      });
      await Promise.all((result.events || []).map(async (event) => {
        const raw = event?.toObject ? event.toObject() : event;
        const metadata = {
          ...(raw?.metadata || {}),
          sourceEventId: serializeId(raw?._id),
          evidenceArchetype: 'filing',
          evidenceState: 'attached_at_creation',
          bootstrapDisposition: 'attached_for_first_build'
        };
        if (typeof event?.save === 'function') {
          event.status = 'ignored';
          event.processedAt = now;
          event.errorMessage = '';
          event.metadata = metadata;
          event.markModified?.('metadata');
          await event.save();
          return;
        }
        if (WikiSourceEvent?.findOneAndUpdate && raw?._id) {
          await WikiSourceEvent.findOneAndUpdate(
            { _id: raw._id, userId },
            {
              $set: {
                status: 'ignored',
                processedAt: now,
                errorMessage: '',
                metadata
              }
            }
          );
        }
      }));
    } catch (error) {
      result = { filings: [], events: [] };
      stop = {
        code: 'SEC_PRIMARY_PACK_UNAVAILABLE',
        evidenceArchetype: 'filing',
        message: 'The broader SEC filing pack could not be loaded after automatic retries. The saved filing evidence is unchanged.'
      };
    }
    const filingSourceRefs = (page.sourceRefs || []).filter(source => (
      source?.provider === 'sec-edgar'
      && source?.metadata?.evidenceArchetype === 'filing'
    ));
    const sourcesAdded = filingSourceRefs.filter(source => {
      const id = serializeId(source?.metadata?.sourceEventId || source?.objectId);
      return id && !beforeSourceIds.has(id);
    }).length;
    page.investmentDossier = {
      ...priorProfile,
      acquisition: {
        ...(priorProfile.acquisition || {}),
        secPrimaryPack: {
          status: stop ? 'unavailable' : 'checked',
          lastAttemptedAt: now,
          selectedFilingCount: result.filings?.length || 0,
          attachedFilingCount: filingSourceRefs.length,
          stop
        }
      }
    };
    page.markModified?.('investmentDossier');
    return {
      filings: result.filings || [],
      events: result.events || [],
      sourcesAdded,
      stop,
      skipped: false
    };
  };

  const acquireCompanyFactsForDossier = async ({ page, now = new Date() } = {}) => {
    if (!page || !isCompanyDossier(page)) {
      return { sourceAdded: false, sourceRef: null, stop: null, skipped: true };
    }
    const existingSource = (page.sourceRefs || []).find(source => (
      source?.provider === 'sec-companyfacts'
      || source?.metadata?.acquisitionMethod === 'sec_companyfacts'
    ));
    if (existingSource) {
      return { sourceAdded: false, sourceRef: existingSource, stop: null, skipped: true };
    }
    const cik = page.investmentDossier?.company?.cik || page.externalWatches?.edgar?.cik || '';
    const ticker = page.investmentDossier?.company?.ticker || page.externalWatches?.edgar?.ticker || '';
    const companyName = page.investmentDossier?.company?.name || page.externalWatches?.edgar?.companyName || '';
    let acquisition;
    try {
      const companyFacts = await withTransientRetries({
        attempts: 3,
        delaysMs: [750, 2000],
        operation: () => fetchCompanyFacts({ cik })
      });
      acquisition = buildCompanyFactsOperatingBenchmark({
        companyFacts,
        cik,
        ticker,
        companyName,
        now
      });
    } catch (error) {
      acquisition = {
        sourceRef: null,
        stop: {
          code: 'SEC_COMPANY_FACTS_UNAVAILABLE',
          evidenceArchetype: 'operating_benchmark',
          message: 'SEC Company Facts could not be loaded after automatic retries. The saved filing evidence is unchanged.'
        },
        diagnostic: String(error?.message || '')
      };
    }
    if (acquisition.sourceRef) {
      page.sourceRefs = [...(page.sourceRefs || []), acquisition.sourceRef].slice(0, 80);
      page.markModified?.('sourceRefs');
    }
    const priorProfile = page.investmentDossier || {};
    page.investmentDossier = {
      ...priorProfile,
      acquisition: {
        ...(priorProfile.acquisition || {}),
        companyFacts: {
          status: acquisition.sourceRef ? 'attached' : 'unavailable',
          lastAttemptedAt: now,
          sourceUrl: acquisition.sourceRef?.url || '',
          stop: acquisition.stop || null
        }
      }
    };
    page.markModified?.('investmentDossier');
    return {
      sourceAdded: Boolean(acquisition.sourceRef),
      sourceRef: acquisition.sourceRef || null,
      stop: acquisition.stop || null,
      skipped: false
    };
  };

  const acquireIndependentDomainForDossier = async ({
    page,
    now = new Date()
  } = {}) => {
    if (!page || !isCompanyDossier(page)) {
      return { sourceAdded: false, sourceRef: null, stop: null, skipped: true };
    }
    const existingSource = (page.sourceRefs || []).find(source => (
      source?.metadata?.evidenceArchetype === 'independent_domain'
      && source?.metadata?.validation?.status === 'accepted'
    ));
    if (existingSource) {
      return { sourceAdded: false, sourceRef: existingSource, stop: null, skipped: true };
    }
    const priorProfile = page.investmentDossier?.toObject
      ? page.investmentDossier.toObject()
      : page.investmentDossier || {};
    const company = priorProfile.company || {};
    let acquisition;
    try {
      acquisition = await withTransientRetries({
        attempts: 2,
        delaysMs: [750],
        operation: () => acquireIndependentDomainSource({
          cik: company.cik || page.externalWatches?.edgar?.cik || '',
          sic: company.sic || '',
          sicDescription: company.sicDescription || '',
          now
        })
      });
    } catch (error) {
      acquisition = {
        sourceRef: null,
        stop: {
          code: 'INDEPENDENT_DOMAIN_SOURCE_UNAVAILABLE',
          evidenceArchetype: 'independent_domain',
          message: 'The verified independent benchmark could not be loaded after automatic retries. The saved evidence is unchanged.'
        },
        diagnostic: String(error?.message || '')
      };
    }
    if (acquisition.sourceRef) {
      page.sourceRefs = [...(page.sourceRefs || []), acquisition.sourceRef].slice(0, 80);
      page.markModified?.('sourceRefs');
    }
    page.investmentDossier = {
      ...priorProfile,
      company: {
        ...company,
        sic: acquisition.classification?.sic || company.sic || '',
        sicDescription: acquisition.classification?.sicDescription || company.sicDescription || ''
      },
      acquisition: {
        ...(priorProfile.acquisition || {}),
        independentDomain: {
          status: acquisition.sourceRef ? 'attached' : 'unavailable',
          lastAttemptedAt: now,
          registryId: acquisition.sourceRef?.metadata?.registryId || '',
          sourceUrl: acquisition.sourceRef?.url || '',
          stop: acquisition.stop || null
        }
      }
    };
    page.markModified?.('investmentDossier');
    return {
      sourceAdded: Boolean(acquisition.sourceRef),
      sourceRef: acquisition.sourceRef || null,
      stop: acquisition.stop || null,
      skipped: false
    };
  };

  const acquireMarketSnapshotForDossier = async ({
    page,
    now = new Date()
  } = {}) => {
    if (!page || !isCompanyDossier(page)) {
      return { sourceAdded: false, sourceRef: null, stop: null, skipped: true };
    }
    const existingSource = (page.sourceRefs || []).find((source) => {
      const asOf = source?.metadata?.asOf
        ? new Date(`${String(source.metadata.asOf).slice(0, 10)}T00:00:00.000Z`)
        : null;
      const ageDays = asOf && !Number.isNaN(asOf.getTime())
        ? Math.floor((new Date(now).getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return source?.metadata?.marketSnapshot === true
        && Number(source?.metadata?.price) > 0
        && ageDays >= 0
        && ageDays <= MAX_QUOTE_AGE_DAYS;
    });
    if (existingSource) {
      return { sourceAdded: false, sourceRef: existingSource, stop: null, skipped: true };
    }
    const priorProfile = page.investmentDossier?.toObject
      ? page.investmentDossier.toObject()
      : page.investmentDossier || {};
    const ticker = priorProfile.company?.ticker || page.externalWatches?.edgar?.ticker || '';
    let acquisition;
    try {
      acquisition = await withTransientRetries({
        attempts: 3,
        delaysMs: [750, 2000],
        operation: () => acquireMarketSnapshotSource({ ticker, now })
      });
    } catch (error) {
      acquisition = {
        sourceRef: null,
        stop: {
          code: 'MARKET_SNAPSHOT_UNAVAILABLE',
          evidenceArchetype: 'market_snapshot',
          message: 'A dated public market price could not be loaded after automatic retries. Noeis left the expectations clock incomplete.'
        },
        diagnostic: String(error?.message || '')
      };
    }
    if (acquisition.sourceRef) {
      page.sourceRefs = [...(page.sourceRefs || []), acquisition.sourceRef].slice(0, 80);
      page.markModified?.('sourceRefs');
    }
    page.investmentDossier = {
      ...priorProfile,
      acquisition: {
        ...(priorProfile.acquisition || {}),
        marketSnapshot: {
          status: acquisition.sourceRef ? 'attached' : 'unavailable',
          lastAttemptedAt: now,
          sourceUrl: acquisition.sourceRef?.url || '',
          asOf: acquisition.sourceRef?.metadata?.asOf || null,
          price: acquisition.sourceRef?.metadata?.price || null,
          stop: acquisition.stop || null
        }
      }
    };
    page.markModified?.('investmentDossier');
    return {
      sourceAdded: Boolean(acquisition.sourceRef),
      sourceRef: acquisition.sourceRef || null,
      stop: acquisition.stop || null,
      skipped: false
    };
  };

  const acquireOfficialProductSourcesForDossier = async ({ page, now = new Date() } = {}) => {
    if (!page || !isCompanyDossier(page)) {
      return { sourcesAdded: 0, sourceRefs: [], stop: null, skipped: true };
    }
    const existingSources = (page.sourceRefs || []).filter(source => (
      source?.provider === 'official-company-site'
      || source?.metadata?.acquisitionMethod === 'wikidata_jina_reader'
    ));
    if (existingSources.length) {
      return { sourcesAdded: 0, sourceRefs: existingSources, stop: null, skipped: true };
    }
    const cik = page.investmentDossier?.company?.cik || page.externalWatches?.edgar?.cik || '';
    const ticker = page.investmentDossier?.company?.ticker || page.externalWatches?.edgar?.ticker || '';
    const companyName = page.investmentDossier?.company?.name || page.externalWatches?.edgar?.companyName || '';
    let acquisition;
    try {
      acquisition = await withTransientRetries({
        attempts: 2,
        delaysMs: [750],
        operation: () => acquireOfficialProductSources({
          cik,
          ticker,
          companyName,
          now
        })
      });
    } catch (error) {
      acquisition = {
        sourceRefs: [],
        stop: {
          code: 'OFFICIAL_PRODUCT_ACQUISITION_UNAVAILABLE',
          evidenceArchetype: 'company_product',
          message: 'Official company evidence could not be loaded after automatic retries. The saved evidence is unchanged.'
        },
        diagnostic: String(error?.message || '')
      };
    }
    const existingUrls = new Set((page.sourceRefs || []).map(source => String(source?.url || '')));
    const sourceRefs = (acquisition.sourceRefs || []).filter(source => (
      source?.url && !existingUrls.has(String(source.url))
    ));
    if (sourceRefs.length) {
      page.sourceRefs = [...(page.sourceRefs || []), ...sourceRefs].slice(0, 80);
      page.markModified?.('sourceRefs');
    }
    const priorProfile = page.investmentDossier || {};
    page.investmentDossier = {
      ...priorProfile,
      acquisition: {
        ...(priorProfile.acquisition || {}),
        officialProduct: {
          status: sourceRefs.length ? 'attached' : 'unavailable',
          lastAttemptedAt: now,
          sourceUrls: sourceRefs.map(source => source.url),
          discovery: acquisition.discovery || null,
          stop: acquisition.stop || null
        }
      }
    };
    page.markModified?.('investmentDossier');
    return {
      sourcesAdded: sourceRefs.length,
      sourceRefs,
      stop: acquisition.stop || null,
      skipped: false
    };
  };

  const loadIssuerAnnualFilingForDossier = async ({ page, userId } = {}) => {
    if (!page || !WikiSourceEvent?.findOne) return null;
    const issuerSource = [...(page.sourceRefs || [])]
      .reverse()
      .find(source => (
        source?.provider === 'sec-edgar'
        && source?.metadata?.form === '10-K'
        && source?.metadata?.evidenceArchetype !== 'competitor_primary'
      ));
    const sourceEventId = issuerSource?.metadata?.sourceEventId || issuerSource?.objectId;
    if (!sourceEventId) return null;
    const event = await WikiSourceEvent.findOne({ _id: sourceEventId, userId });
    if (!event || String(event.text || '').trim().length < 2000) return null;
    return {
      text: event.text,
      url: event.url || issuerSource.url || '',
      accessionNumber: event.metadata?.accessionNumber || issuerSource.metadata?.accessionNumber || '',
      primaryDocument: event.metadata?.primaryDocument || issuerSource.metadata?.primaryDocument || '',
      filingDate: event.metadata?.filingDate || issuerSource.metadata?.filingDate || '',
      reportDate: event.metadata?.reportDate || issuerSource.metadata?.reportDate || ''
    };
  };

  const acquireCompetitorPrimaryForDossier = async ({
    page,
    userId,
    now = new Date()
  } = {}) => {
    if (!page || !isCompanyDossier(page)) {
      return { sourceAdded: false, sourceRef: null, stop: null, skipped: true };
    }
    const existingSource = (page.sourceRefs || []).find(source => (
      source?.metadata?.evidenceArchetype === 'competitor_primary'
      && source?.metadata?.sourceEventId
    ));
    if (existingSource) {
      return { sourceAdded: false, sourceRef: existingSource, stop: null, skipped: true };
    }
    const cik = page.investmentDossier?.company?.cik || page.externalWatches?.edgar?.cik || '';
    const ticker = page.investmentDossier?.company?.ticker || page.externalWatches?.edgar?.ticker || '';
    const companyName = page.investmentDossier?.company?.name || page.externalWatches?.edgar?.companyName || '';
    let acquisition;
    try {
      const issuerFiling = await loadIssuerAnnualFilingForDossier({ page, userId });
      acquisition = await withTransientRetries({
        attempts: 2,
        delaysMs: [750],
        operation: () => acquireCompetitorPrimarySource({
          issuer: { cik, ticker, companyName },
          issuerFiling,
          now
        })
      });
    } catch (error) {
      acquisition = {
        evidence: null,
        stop: {
          code: 'COMPETITOR_PRIMARY_ACQUISITION_UNAVAILABLE',
          evidenceArchetype: 'competitor_primary',
          message: 'Named-competitor evidence could not be loaded after automatic retries. The saved evidence is unchanged.'
        },
        diagnostic: String(error?.message || '')
      };
    }
    let sourceEvent = null;
    if (acquisition.evidence && WikiSourceEvent) {
      sourceEvent = WikiSourceEvent.findOne
        ? await WikiSourceEvent.findOne({
          userId,
          provider: acquisition.evidence.provider,
          externalId: acquisition.evidence.externalId
        })
        : null;
      if (!sourceEvent) {
        sourceEvent = await createWikiSourceEvent({
          WikiSourceEvent,
          userId,
          ...acquisition.evidence,
          affectedPageIds: [page._id]
        });
      }
      if (sourceEvent) {
        const rawMetadata = sourceEvent.metadata?.toObject
          ? sourceEvent.metadata.toObject()
          : sourceEvent.metadata || {};
        sourceEvent.status = 'ignored';
        sourceEvent.processedAt = sourceEvent.processedAt || now;
        sourceEvent.errorMessage = '';
        sourceEvent.metadata = {
          ...rawMetadata,
          sourceEventId: serializeId(sourceEvent._id),
          evidenceState: 'attached_for_dossier_build',
          bootstrapDisposition: 'attached_for_dossier_competitor'
        };
        const affectedPageIds = Array.isArray(sourceEvent.affectedPageIds)
          ? sourceEvent.affectedPageIds.map(serializeId).filter(Boolean)
          : [];
        if (!affectedPageIds.includes(serializeId(page._id))) {
          sourceEvent.affectedPageIds = [...affectedPageIds, page._id].slice(0, 50);
        }
        sourceEvent.markModified?.('metadata');
        sourceEvent.markModified?.('affectedPageIds');
        if (typeof sourceEvent.save === 'function') await sourceEvent.save();
        await attachSourceEventsToPageRefs({ page, events: [sourceEvent], limit: 1 });
      }
    }
    const sourceRef = sourceEvent
      ? (page.sourceRefs || []).find(source => (
        serializeId(source.objectId) === serializeId(sourceEvent._id)
      )) || null
      : null;
    const priorProfile = page.investmentDossier || {};
    page.investmentDossier = {
      ...priorProfile,
      acquisition: {
        ...(priorProfile.acquisition || {}),
        competitorPrimary: {
          status: sourceRef ? 'attached' : 'unavailable',
          lastAttemptedAt: now,
          sourceEventId: sourceRef?.metadata?.sourceEventId || null,
          sourceUrl: sourceRef?.url || '',
          stop: acquisition.stop || null
        }
      }
    };
    page.markModified?.('investmentDossier');
    return {
      sourceAdded: Boolean(sourceRef),
      sourceRef,
      stop: acquisition.stop || null,
      skipped: false
    };
  };

  const applyAutolinksForPage = async (page, userId, options = {}) => {
    const result = await findAutolinkSuggestions({
      targetPage: page,
      userId,
      models: { WikiPage },
      limit: options.limit || 600
    });
    let nextBody = page.body || emptyDoc();
    for (const suggestion of result.suggestions || []) {
      const targetPage = await WikiPage.findOne({ _id: suggestion.pageId, userId }).lean();
      if (!targetPage) continue;
      const applied = applyWikiAutolinkToDoc({ doc: nextBody, targetPage });
      if (applied.applied) nextBody = applied.doc;
    }
    page.body = nextBody;
    page.plainText = docText(nextBody);
    return result;
  };

  const autolinkPagesToTarget = async ({
    targetPage,
    userId,
    sourcePageId = null,
    candidateLimit = 600,
    concurrency = 1
  } = {}) => {
    if (!targetPage?._id || !targetPage?.title) return [];
    const query = {
      userId,
      status: { $ne: 'archived' },
      _id: { $ne: targetPage._id },
      'createdFrom.label': { $not: HUMAN_ONLY_WIKI_LABEL_PATTERN }
    };
    const candidates = await WikiPage.find(query).sort({ updatedAt: -1 }).limit(Math.max(1, Math.min(Number(candidateLimit) || 600, 600)));
    const updatedPages = [];
    const processCandidate = async (page) => {
      if (isHumanOnlyWikiArtifact(page)) return null;
      const before = snapshotPage(page);
      const result = applyWikiAutolinkToDoc({ doc: page.body || emptyDoc(), targetPage });
      if (!result.applied) return null;
      page.body = result.doc;
      page.plainText = docText(result.doc);
      refreshPageClaims(page);
      await page.save();
      await syncPageGraph(page, userId);
      await createWikiRevision({
        WikiRevision,
        userId,
        page,
        before,
        reason: 'agent_maintenance',
        actorType: 'agent',
        summary: `Linked "${targetPage.title}" from "${page.title}".`
      });
      return page;
    };
    const queue = (Array.isArray(candidates) ? candidates : []).filter(page => !isHumanOnlyWikiArtifact(page));
    const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, 10, queue.length || 1));
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const candidate = queue.shift();
        const updated = await processCandidate(candidate);
        if (updated) updatedPages.push(updated);
      }
    }));
    if (!updatedPages.length && sourcePageId) {
      await syncPageGraph(targetPage, userId);
    }
    return updatedPages;
  };

  const normalizeMaintenanceProfileOption = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'fast' || normalized === 'onboarding_fast' ? 'fast' : 'standard';
  };

  const positiveNumberOption = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };

  const readMaintenanceRequestOptions = (body = {}) => {
    const maintenanceProfile = normalizeMaintenanceProfileOption(body.maintenanceProfile || body.profile);
    const fastProfile = maintenanceProfile === 'fast';
    return {
      maintenanceProfile,
      sourceLimit: positiveNumberOption(body.sourceLimit),
      sourceTextLimit: positiveNumberOption(body.sourceTextLimit),
      inlineAutolinkLimit: positiveNumberOption(body.inlineAutolinkLimit) || (fastProfile ? 40 : 80),
      skipQualityRebuild: body.skipQualityRebuild === true || (fastProfile && body.skipQualityRebuild !== false),
      streamDraft: body.streamDraft === true || (fastProfile && body.streamDraft !== false),
      deferInboundAutolinks: body.deferInboundAutolinks !== false
    };
  };

  const isGitHubRepoWikiPage = (page = {}) => {
    const createdFrom = [page.createdFrom?.text, page.createdFrom?.label].join(' ');
    // externalWatches.githubRepo is a defaulted sub-document present on every page,
    // so testing its existence matched everything. That made every ordinary page
    // look like a repo page — which, among other things, skipped the corpus-wide
    // autolink pass that concept pages depend on. Require real repository identity.
    const watch = page.externalWatches?.githubRepo || {};
    const hasRepoIdentity = Boolean(
      String(watch.owner || '').trim()
      || String(watch.repo || '').trim()
      || String(watch.lastHeadSha || '').trim()
      || String(watch.publishedHeadSha || '').trim()
    );
    return hasRepoIdentity
      || /GitHub repo:|github\.com\/[^/\s]+\/[^/\s]+/i.test(createdFrom)
      || (Array.isArray(page.sourceRefs) && page.sourceRefs.some(source => (
        source.provider === 'github-repo'
        || source.metadata?.source === 'github-repo'
      )));
  };

  const acquireRepoMaintenanceLease = async ({ page, userId } = {}) => {
    const headSha = String(page?.externalWatches?.githubRepo?.lastHeadSha || '').trim();
    if (!isGitHubRepoWikiPage(page) || !headSha) return null;
    return acquireRepoBuildLease({
      WikiPage,
      pageId: page._id,
      userId,
      headSha,
      generatorVersion: REPO_WIKI_GENERATOR_VERSION
    });
  };

  const scheduleInboundAutolinks = ({ targetPage, userId, sourcePageId = null } = {}) => {
    const targetSnapshot = clonePlain(targetPage?.toObject ? targetPage.toObject() : targetPage);
    setImmediate(async () => {
      try {
        await autolinkPagesToTarget({
          targetPage: targetSnapshot,
          userId,
          sourcePageId,
          // Background graph work shares the user's database with foreground
          // reads and builds, so it must stay bounded too.
          candidateLimit: 80,
          concurrency: 10
        });
      } catch (error) {
        console.error('Deferred wiki inbound autolink failed:', error);
      }
    });
  };

  require('./wiki/schemaRoutes')(router, {
    EVENT_NAMES,
    WikiLintRun,
    WikiPage,
    WikiSchemaSettings,
    assertHumanForResolvedWeekendReadingsTargets,
    findLintFinding,
    findLintRun,
    lintWiki,
    openWikiLintStream,
    resolveLintFindingAction,
    serializeLintRun,
    trackWikiEvent,
    updateLintFinding,
    wikiAuth,
    wikiModels,
    writeSse
  });

  require('./wiki/pageListRoutes')(router, {
    Article,
    EVENT_NAMES,
    NotebookEntry,
    Question,
    TagMeta,
    WikiPage,
    WikiPageVisit,
    WikiRevision,
    buildUniqueSlug,
    prepareOrdinaryWikiBuild,
    refreshPageClaims,
    rejectAgentReservedWeekendReadingsCreation,
    syncPageGraph,
    trackWikiEvent,
    wikiAuth
  });

  require('./wiki/researchRoutes')(router, {
    EVENT_NAMES,
    JudgmentResponseDraft,
    NoeisReceipt,
    WikiMaintenanceRun,
    WikiPage,
    WikiRevision,
    WikiSourceEvent,
    acquireCompanyFactsForDossier,
    acquireCompetitorPrimaryForDossier,
    acquireIndependentDomainForDossier,
    acquireMarketSnapshotForDossier,
    acquireOfficialProductSourcesForDossier,
    acquireSecPrimaryPackForDossier,
    buildUniqueSlug,
    evaluateWikiArticleQuality,
    findOwnedPage,
    inspectCompanyDossierFiler,
    normalizeExternalHttpUrl,
    publicPageCache,
    refreshPageClaims,
    resolveEdgarCompanyIdentifier,
    restorePageSnapshot,
    syncPageGraph,
    trackWikiEvent,
    wikiAuth
  });

  require('./wiki/repoRoutes')(router, {
    Article,
    EVENT_NAMES,
    NotebookEntry,
    Question,
    TagMeta,
    WikiPage,
    WikiRevision,
    WikiSourceEvent,
    armGitHubRepoWatchForPage,
    buildUniqueSlug,
    loadWikiSchemaContent,
    maintainWikiPage,
    refreshPageClaims,
    savePageWithVersionRetry,
    syncPageGraph,
    trackWikiEvent,
    wikiAuth
  });

  require('./wiki/pageRoutes')(router, {
    Article,
    WikiPage,
    WikiSourceEvent,
    armEdgarWatchForPage,
    armGitHubRepoWatchForPage,
    armTranscriptWatchForPage,
    checkEdgarWatchForPage,
    checkGitHubRepoHeadForPage,
    checkGitHubRepoWatchForPage,
    checkTranscriptWatchForPage,
    wikiAuth
  });

  require('./wiki/sharingRoutes')(router, {
    CasebookLineage,
    EVENT_NAMES,
    NoeisReceipt,
    WikiMaintenanceRun,
    WikiPage,
    WikiRepoBaseline,
    WikiRevision,
    WikiSharedCollection,
    adoptStarterPackForUser,
    buildUniqueCollectionSlug,
    buildUniqueSlug,
    createAdoptedWikiPages,
    findOwnedPage,
    loadPublicCasebook,
    loadSharedWikiPage,
    publicComparisonCache,
    publicPageCache,
    sendLineageError,
    trackWikiEvent,
    wikiAuth
  });

  require('./wiki/paperRoutes')(router, {
    EVENT_NAMES,
    MorningPaperRecord,
    WikiBriefingCache,
    WikiPage,
    WikiRevision,
    buildUniqueSlug,
    findHighlightById,
    trackWikiEvent,
    wikiAuth
  });

  /* The reading that caused a change: the source event behind the revision,
     or behind the run that wrote it. Unknown stays unknown. */
  const changeSourcesFor = async (userId, revisions = []) => {
    const found = new Map();
    if (!WikiSourceEvent?.find) return found;
    const runIds = revisions.filter(revision => !revision.sourceEventId && revision.maintenanceRunId)
      .map(revision => revision.maintenanceRunId);
    const runs = runIds.length && WikiMaintenanceRun?.find
      ? await WikiMaintenanceRun.find({ userId, _id: { $in: runIds } }).select('sourceEventId').lean()
      : [];
    const eventByRun = new Map(runs.map(run => [String(run._id), run.sourceEventId]));
    const eventFor = revision => revision.sourceEventId || eventByRun.get(String(revision.maintenanceRunId || '')) || null;
    const eventIds = revisions.map(eventFor).filter(Boolean);
    if (!eventIds.length) return found;
    const events = await WikiSourceEvent.find({ userId, _id: { $in: eventIds } }).select('title createdAt').lean();
    const eventById = new Map(events.map(event => [String(event._id), event]));
    revisions.forEach((revision) => {
      const event = eventById.get(String(eventFor(revision) || ''));
      if (event?.title) found.set(String(revision._id), { title: event.title, at: event.createdAt || null });
    });
    return found;
  };

  require('./wiki/changeRoutes')(router, {
    Article,
    VectorItem,
    WikiPage,
    WikiRevision,
    changeSourcesFor,
    findOwnedPage,
    wikiAuth
  });

  require('./wiki/pageEditRoutes')(router, {
    EVENT_NAMES,
    NoeisReceipt,
    WikiMaintenanceRun,
    WikiPage,
    WikiRepoBaseline,
    WikiRevision,
    WikiSourceEvent,
    buildUniqueSlug,
    fetchGitHubRepoHead,
    findOwnedPage,
    publicPageCache,
    refreshPageClaims,
    restorePageSnapshot,
    syncPageGraph,
    trackWikiEvent,
    wikiAuth
  });

  require('./wiki/draftRoutes')(router, {
    Article,
    EVENT_NAMES,
    NotebookEntry,
    Question,
    TagMeta,
    WikiMaintenanceRun,
    WikiPage,
    WikiRevision,
    WikiSourceEvent,
    acquireCompanyFactsForDossier,
    acquireCompetitorPrimaryForDossier,
    acquireIndependentDomainForDossier,
    acquireMarketSnapshotForDossier,
    acquireOfficialProductSourcesForDossier,
    acquireRepoMaintenanceLease,
    acquireSecPrimaryPackForDossier,
    activeWikiDraftStreams,
    applyAutolinksForPage,
    asyncBuildTimeoutMs,
    autolinkPagesToTarget,
    findOwnedPage,
    isGitHubRepoWikiPage,
    loadWikiSchemaContent,
    maintainWikiPage,
    openWikiDraftStream,
    readMaintenanceRequestOptions,
    reviewerMaintenanceArgs,
    savePageWithVersionRetry,
    scheduleInboundAutolinks,
    syncPageGraph,
    trackWikiEvent,
    wikiAuth,
    writeSse
  });

  require('./wiki/askRoutes')(router, {
    EVENT_NAMES,
    TagMeta,
    WikiPage,
    WikiRevision,
    applyAutolinksForPage,
    askWikiPage,
    autolinkPagesToTarget,
    buildUniqueSlug,
    findOwnedPage,
    findWikiBacklinks,
    loadWikiAskCorpus,
    loadWikiSchemaContent,
    openWikiAskStream,
    refreshPageClaims,
    syncPageGraph,
    trackWikiEvent,
    wikiAuth,
    writeSse
  });

  require('./wiki/briefingRoutes')(router, {
    Article,
    Connection,
    ImportSession,
    NoeisReceipt,
    NotebookEntry,
    Question,
    TagMeta,
    User,
    WikiBriefingCache,
    WikiMaintenanceRun,
    WikiPage,
    WikiProposal,
    WikiRevision,
    WikiSourceEvent,
    buildUniqueSlug,
    buildWikiBriefing,
    findOwnedPage,
    findWikiBacklinks,
    maintainProposalDraft,
    refreshWikiProposals,
    wikiAuth
  });

  require('./wiki/ingestRoutes')(router, {
    Article,
    Connection,
    EVENT_NAMES,
    WikiPage,
    WikiRevision,
    WikiSourceEvent,
    assertHumanForResolvedWeekendReadingsTargets,
    buildIngestTimeline,
    buildUniqueSlug,
    findMaintenanceRunBySourceEvent,
    loadWikiSchemaContent,
    restorePageSnapshot,
    syncPageGraph,
    trackWikiEvent,
    wikiAuth,
    wikiModels
  });

  require('./wiki/maintenanceRoutes')(router, {
    ConnectorActionLog,
    EVENT_NAMES,
    IntegrationConnection,
    WikiLintRun,
    WikiMaintenanceRun,
    WikiPage,
    WikiRevision,
    WikiSourceEvent,
    appendNotionBlockChildren,
    buildUniqueSlug,
    changeSourcesFor,
    createNotionPage,
    decryptSecret,
    findOwnedPage,
    loadWikiSchemaContent,
    restorePageSnapshot,
    syncPageGraph,
    trackWikiEvent,
    updateNotionPageTitle,
    wikiAuth,
    wikiModels
  });

  return router;
};

module.exports = {
  assertHumanForResolvedWeekendReadingsTargets,
  buildPublicInvestmentValuation,
  buildRequireHumanForWeekendReadingsMutation,
  buildUniqueWikiSlugBuilder,
  buildWikiRouter,
  normalizeBodyDoc,
  buildWikiDraftState,
  normalizeCreatedFrom,
  normalizeSourceRef,
  rejectAgentReservedWeekendReadingsCreation,
  serializePublicCasebook,
  serializePublicWikiPage,
  serializeWikiPage,
  slugify,
  wikiCollectionSearchClause,
  WIKI_COLLECTION_SEARCH_FIELDS,
  WIKI_JUDGMENT_INDEX_FIELDS,
  WIKI_PAGE_SUMMARY_FIELDS
};
