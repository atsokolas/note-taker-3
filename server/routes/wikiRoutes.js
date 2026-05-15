const express = require('express');
const mongoose = require('mongoose');
const { maintainWikiPage: defaultMaintainWikiPage } = require('../services/wikiMaintenanceService');
const {
  buildSectionMaintenancePlan,
  deriveClaimsFromDoc
} = require('../services/wikiMaintenanceService');
const { askWikiPage: defaultAskWikiPage } = require('../services/wikiAskService');
const { buildWikiBriefing: defaultBuildWikiBriefing } = require('../services/wikiBriefingService');
const { findWikiBacklinks: defaultFindWikiBacklinks } = require('../services/wikiBacklinkService');
const {
  getWikiSchemaPromptContent,
  getWikiSchemaSettings,
  revertWikiSchemaSettings,
  saveWikiSchemaSettings
} = require('../services/wikiSchemaService');
const { createWikiRevision, snapshotPage } = require('../services/wikiRevisionService');
const { createWikiSourceEvent, listWikiSourceEvents } = require('../services/wikiSourceEventService');
const { processWikiSourceEvent } = require('../services/wikiMaintenanceOrchestrator');
const { processPendingWikiSourceEvents } = require('../services/wikiSourceEventWorker');
const { writeWikiPageToConnector } = require('../services/wikiConnectorWritebackService');
const { findAutolinkSuggestions } = require('../services/wikiAutolinkService');
const { applyWikiAutolinkToDoc } = require('../services/wikiAutolinkApplyService');
const {
  WIKI_PAGE_TYPES,
  normalizePageType
} = require('../services/wikiPageStructureService');
const {
  rebuildWikiGraphConnections,
  syncWikiPageGraphConnections
} = require('../services/wikiGraphConnectionService');
const {
  suggestWikiSchemaUpdates
} = require('../services/wikiSchemaSuggestionService');
const {
  activeProposalsNeedClusteringRefresh,
  autoMergeProposalCandidates,
  buildArchiveSignals,
  buildProposalCandidates,
  createDraftPageFromProposal,
  retireStaleActiveProposals,
  shapeWikiProposalCandidates
} = require('../services/wikiProposalService');

const PAGE_TYPES = new Set(WIKI_PAGE_TYPES);
const PAGE_TYPE_ALIASES = {
  person: 'entity',
  synthesis: 'overview'
};
const STATUSES = new Set(['draft', 'published', 'archived']);
const VISIBILITIES = new Set(['private', 'shared']);
const SOURCE_SCOPES = new Set(['entire_library', 'current_item', 'selected_sources']);
const CREATED_FROM_TYPES = new Set([
  'wiki_index',
  'idea',
  'question',
  'highlight',
  'article',
  'notebook',
  'concept',
  'sources',
  'paste',
  'search',
  'thought_partner'
]);
const SOURCE_REF_TYPES = new Set(['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external']);
const SOURCE_REF_ADDED_BY = new Set(['user', 'ai']);
const INGEST_SOURCE_TYPES = new Set(['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external', 'url', 'text']);

const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });

const slugify = (value = '') => {
  const base = String(value || 'untitled-wiki-page')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'untitled-wiki-page';
};

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractPlainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node.trim();
  if (Array.isArray(node)) return node.map(extractPlainText).filter(Boolean).join(' ').trim();
  if (typeof node !== 'object') return '';
  const ownText = typeof node.text === 'string' ? node.text : '';
  const childText = Array.isArray(node.content) ? extractPlainText(node.content) : '';
  return [ownText, childText].filter(Boolean).join(' ').trim();
};

const normalizeTitle = (value = '') => (
  String(value || 'Untitled Wiki Page').trim().slice(0, 180) || 'Untitled Wiki Page'
);

const deriveTitleFromQuestion = (question = '') => {
  const title = String(question || '')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
  return normalizeTitle(title || 'Answer from discussion');
};

const normalizeObjectId = (value) => {
  const id = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const normalizeCreatedFrom = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { type: 'wiki_index' };
  const type = CREATED_FROM_TYPES.has(String(value.type || '')) ? String(value.type) : 'wiki_index';
  return {
    type,
    objectId: normalizeObjectId(value.objectId),
    objectIds: Array.isArray(value.objectIds)
      ? value.objectIds.map(normalizeObjectId).filter(Boolean).slice(0, 50)
      : [],
    text: String(value.text || '').trim().slice(0, 8000),
    label: String(value.label || '').trim().slice(0, 240)
  };
};

const buildDraftDoc = ({ title, seedText }) => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: seedText || 'Start writing. AI can help expand this page from your sources.' }]
    }
  ]
});

const clonePlain = (value) => JSON.parse(JSON.stringify(value || null));

const collectCitationIndexesFromDoc = (node, out = new Set()) => {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach(child => collectCitationIndexesFromDoc(child, out));
    return out;
  }
  if (typeof node !== 'object') return out;
  (node.marks || []).forEach((mark) => {
    const attrs = mark?.attrs || {};
    [
      ...(Array.isArray(attrs.citationIndexes) ? attrs.citationIndexes : []),
      ...(Array.isArray(attrs.contradictionIndexes) ? attrs.contradictionIndexes : [])
    ].forEach((index) => {
      const numeric = Number(index);
      if (Number.isInteger(numeric) && numeric >= 1) out.add(numeric);
    });
  });
  if (Array.isArray(node.content)) collectCitationIndexesFromDoc(node.content, out);
  return out;
};

const remapCitationIndexesInDoc = (node, citationIndexMap = new Map()) => {
  if (!node) return node;
  if (Array.isArray(node)) return node.map(child => remapCitationIndexesInDoc(child, citationIndexMap));
  if (typeof node !== 'object') return node;
  const next = { ...node };
  if (Array.isArray(next.marks)) {
    next.marks = next.marks.map((mark) => {
      const attrs = mark?.attrs || {};
      const remapIndexes = (indexes = []) => (
        Array.isArray(indexes)
          ? indexes
            .map(index => citationIndexMap.get(Number(index)))
            .filter(Number.isInteger)
          : indexes
      );
      if (!Array.isArray(attrs.citationIndexes) && !Array.isArray(attrs.contradictionIndexes)) return mark;
      return {
        ...mark,
        attrs: {
          ...attrs,
          ...(Array.isArray(attrs.citationIndexes)
            ? { citationIndexes: remapIndexes(attrs.citationIndexes) }
            : {}),
          ...(Array.isArray(attrs.contradictionIndexes)
            ? { contradictionIndexes: remapIndexes(attrs.contradictionIndexes) }
            : {})
        }
      };
    });
  }
  if (Array.isArray(next.content)) next.content = remapCitationIndexesInDoc(next.content, citationIndexMap);
  return next;
};

const cloneSourceRefForPromotion = (source) => {
  const raw = source?.toObject ? source.toObject({ virtuals: false }) : clonePlain(source);
  if (!raw || typeof raw !== 'object') return null;
  delete raw._id;
  return raw;
};

const buildPromotedDiscussionDoc = ({ title, discussion, citationIndexMap = new Map() }) => {
  const answerContent = Array.isArray(discussion?.answer?.content) && discussion.answer.content.length > 0
    ? remapCitationIndexesInDoc(clonePlain(discussion.answer.content), citationIndexMap)
    : [{ type: 'paragraph', content: [{ type: 'text', text: 'No answer yet.' }] }];
  const standaloneAnswerContent = answerContent.filter((node) => {
    const text = extractPlainText(node).trim();
    return !/^you asked:/i.test(text);
  });
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Answer' }] },
      ...(standaloneAnswerContent.length ? standaloneAnswerContent : answerContent),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Source question' }] },
      { type: 'paragraph', content: [{ type: 'text', text: String(discussion?.question || '').trim() }] }
    ]
  };
};

const serializeWikiPage = (page) => {
  if (!page) return page;
  const raw = typeof page.toObject === 'function'
    ? page.toObject({ virtuals: false })
    : { ...page };
  return {
    ...raw,
    pageType: normalizePageType(raw.pageType || 'topic'),
    body: raw.body || emptyDoc(),
    createdFrom: raw.createdFrom || { type: 'wiki_index', objectIds: [], text: '', label: '' },
    sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [],
    discussions: Array.isArray(raw.discussions) ? raw.discussions : [],
    aiState: {
      draftStatus: raw.aiState?.draftStatus || 'idle',
      draftRequestedAt: raw.aiState?.draftRequestedAt || null,
      draftStartedAt: raw.aiState?.draftStartedAt || null,
      draftCompletedAt: raw.aiState?.draftCompletedAt || null,
      lastDraftedAt: raw.aiState?.lastDraftedAt || null,
      lastError: raw.aiState?.lastError || '',
      errorCode: raw.aiState?.errorCode || '',
      model: raw.aiState?.model || '',
      provider: raw.aiState?.provider || '',
      sourceScopeAtDraft: raw.aiState?.sourceScopeAtDraft || raw.sourceScope || 'entire_library',
      sourceRefIdsAtDraft: Array.isArray(raw.aiState?.sourceRefIdsAtDraft) ? raw.aiState.sourceRefIdsAtDraft : [],
      maintenanceSummary: raw.aiState?.maintenanceSummary || '',
      health: raw.aiState?.health || {
        newItems: [],
        unsupportedClaims: [],
        missingCitations: [],
        staleSections: [],
        contradictions: [],
        relatedPages: []
      },
      quality: raw.aiState?.quality || {
        ok: true,
        status: 'pass',
        score: 1,
        failures: [],
        checkedAt: null,
        rebuiltAutomatically: false
      },
      changeLog: Array.isArray(raw.aiState?.changeLog) ? raw.aiState.changeLog : [],
      suggestions: Array.isArray(raw.aiState?.suggestions) ? raw.aiState.suggestions : []
    }
  };
};

const buildWikiDraftSuggestions = ({ page }) => {
  const sourceIds = Array.isArray(page.sourceRefs)
    ? page.sourceRefs.map(source => source._id).filter(Boolean)
    : [];
  const stamp = Date.now();
  const seedText = String(page.createdFrom?.text || '').trim();
  return [
    {
      id: `outline-${stamp}`,
      type: 'outline',
      title: 'Suggested outline',
      text: `Turn "${page.title}" into a short page with context, source-backed claims, and open questions.`,
      sourceRefIds: sourceIds
    },
    {
      id: `edit-${stamp}`,
      type: 'edit',
      title: 'Next edit',
      text: seedText || 'Add a concise working thesis, then attach the sources that support or challenge it.',
      sourceRefIds: sourceIds
    },
    {
      id: `gap-${stamp}`,
      type: 'gap',
      title: 'Evidence gap',
      text: sourceIds.length > 0
        ? 'Review each attached source and cite the strongest claim before publishing.'
        : 'Attach at least one source so the page has a traceable evidence trail.',
      sourceRefIds: []
    }
  ];
};

const buildWikiDraftState = ({ page, now = new Date(), model = 'local-stub', error = null }) => {
  if (error) {
    return {
      ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
      draftStatus: 'error',
      lastError: String(error.message || error || 'Draft failed.'),
      errorCode: String(error.code || 'DRAFT_FAILED'),
      model,
      sourceScopeAtDraft: page.sourceScope
    };
  }

  return {
    draftStatus: 'ready',
    draftRequestedAt: page.aiState?.draftRequestedAt || now,
    draftStartedAt: page.aiState?.draftStartedAt || now,
    draftCompletedAt: now,
    lastDraftedAt: now,
    lastError: '',
    errorCode: '',
    model,
    sourceScopeAtDraft: page.sourceScope,
    sourceRefIdsAtDraft: Array.isArray(page.sourceRefs)
      ? page.sourceRefs.map(source => source._id).filter(Boolean)
      : [],
    suggestions: buildWikiDraftSuggestions({ page })
  };
};

const validateEnumField = (field, value, allowedValues) => {
  if (value === undefined) return null;
  const normalized = String(value || '').trim();
  if (!allowedValues.has(normalized)) {
    return { error: `${field} must be one of: ${Array.from(allowedValues).join(', ')}.` };
  }
  return { value: normalized };
};

const validatePageType = (value) => {
  if (value === undefined) return null;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return { error: `pageType must be one of: ${Array.from(PAGE_TYPES).join(', ')}.` };
  const normalized = normalizePageType(raw);
  if (normalized === 'topic' && raw !== 'topic' && PAGE_TYPE_ALIASES[raw] !== 'topic') {
    return { error: `pageType must be one of: ${Array.from(PAGE_TYPES).join(', ')}.` };
  }
  return { value: normalized, raw };
};

const pageTypeQueryValue = (pageType) => {
  if (!pageType?.value) return null;
  const legacyValues = Object.entries(PAGE_TYPE_ALIASES)
    .filter(([, normalized]) => normalized === pageType.value)
    .map(([legacy]) => legacy);
  return legacyValues.length ? { $in: [pageType.value, ...legacyValues] } : pageType.value;
};

const normalizeIngestSource = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'source payload must be an object.' };
  }
  const rawType = String(value.type || '').trim().toLowerCase();
  if (!INGEST_SOURCE_TYPES.has(rawType)) {
    return { error: `source.type must be one of: ${Array.from(INGEST_SOURCE_TYPES).join(', ')}.` };
  }
  const objectId = normalizeObjectId(value.objectId);
  if (value.objectId && !objectId) return { error: 'source.objectId must be a valid id.' };
  const url = String(value.url || '').trim().slice(0, 1000);
  const text = String(value.text || '').trim().slice(0, 8000);
  if (!objectId && !url && !text) {
    return { error: 'source must include objectId, url, or text.' };
  }
  const sourceType = rawType === 'url' || rawType === 'text' ? 'external' : rawType;
  return {
    value: {
      sourceType,
      objectId,
      url,
      text,
      title: String(value.title || '').trim().slice(0, 240),
      summary: String(value.summary || '').trim().slice(0, 1200),
      rawType
    }
  };
};

const serializeId = (value) => (value ? String(value) : null);

const cleanWikiSummary = (value = '', maxLength = 360) => {
  const text = String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
};

const serializeSourceRefFromEvent = (event = {}) => ({
  type: event.sourceType || 'external',
  objectId: serializeId(event.sourceObjectId),
  url: event.url || '',
  title: event.title || '',
  summary: cleanWikiSummary(event.summary || ''),
  text: event.text || ''
});

const serializeIngestRun = ({ event, run = null } = {}) => {
  if (!event) return null;
  const rawEvent = typeof event.toObject === 'function' ? event.toObject({ virtuals: false }) : event;
  const rawRun = run && typeof run.toObject === 'function' ? run.toObject({ virtuals: false }) : run;
  return {
    runId: serializeId(rawEvent._id),
    sourceRef: serializeSourceRefFromEvent(rawEvent),
    affectedPageIds: Array.isArray(rawEvent.affectedPageIds) ? rawEvent.affectedPageIds.map(serializeId).filter(Boolean) : [],
    summary: cleanWikiSummary(rawRun?.summary || rawEvent.summary || rawEvent.errorMessage || ''),
    status: rawEvent.status || rawRun?.status || 'pending',
    suggestedCreatePage: (
      rawEvent.status === 'ignored'
      && !(Array.isArray(rawEvent.affectedPageIds) && rawEvent.affectedPageIds.length)
      && rawEvent.metadata?.ignoredReason === 'no_matching_wiki_page'
    ) ? {
        title: rawEvent.title || rawEvent.url || rawEvent.sourceType || 'Untitled wiki page',
        source: serializeSourceRefFromEvent(rawEvent)
      } : null,
    undoneAt: rawEvent.metadata?.undoneAt || null,
    startedAt: rawRun?.startedAt || rawEvent.createdAt || null,
    completedAt: rawEvent.processedAt || rawRun?.completedAt || null,
    sourceEventId: serializeId(rawEvent._id),
    maintenanceRunId: serializeId(rawRun?._id)
  };
};

const activityEventTime = (event = {}) => new Date(event.at || 0).getTime();

const sortActivityEvents = (events = []) => events
  .filter(event => event && event.at)
  .sort((a, b) => activityEventTime(b) - activityEventTime(a));

const normalizeSourceRef = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'sourceRef payload must be an object.' };
  }

  const type = String(value.type || '').trim();
  if (!SOURCE_REF_TYPES.has(type)) {
    return { error: `type must be one of: ${Array.from(SOURCE_REF_TYPES).join(', ')}.` };
  }

  const addedBy = String(value.addedBy || 'user').trim();
  if (!SOURCE_REF_ADDED_BY.has(addedBy)) {
    return { error: "addedBy must be one of: user, ai." };
  }

  const objectId = normalizeObjectId(value.objectId);
  if (value.objectId && !objectId) {
    return { error: 'objectId must be a valid id.' };
  }
  const parentObjectId = normalizeObjectId(value.parentObjectId);
  if (value.parentObjectId && !parentObjectId) {
    return { error: 'parentObjectId must be a valid id.' };
  }

  const sourceRef = {
    type,
    objectId,
    parentObjectId,
    title: String(value.title || '').trim().slice(0, 240),
    snippet: String(value.snippet || '').trim().slice(0, 1000),
    url: String(value.url || '').trim().slice(0, 1000),
    citationLabel: String(value.citationLabel || '').trim().slice(0, 120),
    addedBy
  };

  if (!sourceRef.objectId && !sourceRef.title && !sourceRef.snippet && !sourceRef.url) {
    return { error: 'sourceRef must include objectId, title, snippet, or url.' };
  }

  return { value: sourceRef };
};

const serializeWikiProposal = (proposal) => {
  if (!proposal) return proposal;
  const raw = typeof proposal.toObject === 'function'
    ? proposal.toObject({ virtuals: false })
    : { ...proposal };
  return {
    ...raw,
    sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [],
    connectedPageRefs: Array.isArray(raw.connectedPageRefs) ? raw.connectedPageRefs : [],
    connectedConceptRefs: Array.isArray(raw.connectedConceptRefs) ? raw.connectedConceptRefs : [],
    signals: Array.isArray(raw.signals) ? raw.signals : [],
    starterClaims: Array.isArray(raw.starterClaims) ? raw.starterClaims : [],
    openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions : []
  };
};

const proposalsAreStale = (proposals = [], maxAgeMs = 24 * 60 * 60 * 1000) => {
  if (!Array.isArray(proposals) || proposals.length === 0) return true;
  const latest = proposals.reduce((max, proposal) => {
    const t = new Date(proposal?.generation?.generatedAt || proposal?.updatedAt || 0).getTime();
    return Number.isFinite(t) ? Math.max(max, t) : max;
  }, 0);
  return Date.now() - latest > maxAgeMs;
};

const buildWikiRouter = ({
  authenticateToken,
  WikiPage,
  WikiProposal = null,
  WikiRevision = null,
  WikiSourceEvent = null,
  WikiMaintenanceRun = null,
  WikiSchemaSettings = null,
  Connection = null,
  ConnectorActionLog = null,
  IntegrationConnection = null,
  Article = null,
  NotebookEntry = null,
  TagMeta = null,
  Question = null,
  createNotionPage = null,
  appendNotionBlockChildren = null,
  updateNotionPageTitle = null,
  decryptSecret = null,
  maintainWikiPage = defaultMaintainWikiPage,
  askWikiPage = defaultAskWikiPage,
  buildWikiBriefing = defaultBuildWikiBriefing,
  findWikiBacklinks = defaultFindWikiBacklinks,
  shapeWikiProposalCandidates: shapeWikiProposalCandidatesRunner = shapeWikiProposalCandidates,
  trackEvent = null,
  EVENT_NAMES = {}
}) => {
  const router = express.Router();

  const trackWikiEvent = (req, event, properties = {}) => {
    if (!trackEvent || !event) return;
    trackEvent({
      event,
      userId: req.user?.id,
      requestId: req.requestId,
      properties
    });
  };

  const buildUniqueSlug = async (userId, title, existingId = null) => {
    const base = slugify(title);
    for (let i = 0; i < 25; i += 1) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const query = { userId, slug };
      if (existingId) query._id = { $ne: existingId };
      const existing = await WikiPage.findOne(query).select('_id').lean();
      if (!existing) return slug;
    }
    return `${base}-${Date.now()}`;
  };

  const findOwnedPage = (req) => WikiPage.findOne({ _id: req.params.id, userId: req.user.id });

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
      Article?.find ? Article.find({ userId }).sort({ updatedAt: -1 }).limit(400).lean() : [],
      NotebookEntry?.find ? NotebookEntry.find({ userId }).sort({ updatedAt: -1 }).limit(300).lean() : [],
      TagMeta?.find ? TagMeta.find({ userId }).sort({ updatedAt: -1 }).limit(200).lean() : [],
      WikiPage.find({ userId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(300).lean(),
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
        models: { Article, NotebookEntry, TagMeta, Question }
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

  const restorePageSnapshot = (page, snapshot = {}) => {
    if (!page || !snapshot) return;
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
      'freshness',
      'aiState'
    ].forEach((field) => {
      if (snapshot[field] !== undefined) page[field] = clonePlain(snapshot[field]);
    });
  };

  const applyAutolinksForPage = async (page, userId) => {
    const result = await findAutolinkSuggestions({
      targetPage: page,
      userId,
      models: { WikiPage }
    });
    let nextBody = page.body || emptyDoc();
    for (const suggestion of result.suggestions || []) {
      const targetPage = await WikiPage.findOne({ _id: suggestion.pageId, userId }).lean();
      if (!targetPage) continue;
      const applied = applyWikiAutolinkToDoc({ doc: nextBody, targetPage });
      if (applied.applied) nextBody = applied.doc;
    }
    page.body = nextBody;
    page.plainText = extractPlainText(nextBody);
    return result;
  };

  const autolinkPagesToTarget = async ({ targetPage, userId, sourcePageId = null } = {}) => {
    if (!targetPage?._id || !targetPage?.title) return [];
    const query = {
      userId,
      status: { $ne: 'archived' },
      _id: { $ne: targetPage._id }
    };
    const candidates = await WikiPage.find(query).sort({ updatedAt: -1 }).limit(600);
    const updatedPages = [];
    for (const page of Array.isArray(candidates) ? candidates : []) {
      const before = snapshotPage(page);
      const result = applyWikiAutolinkToDoc({ doc: page.body || emptyDoc(), targetPage });
      if (!result.applied) continue;
      page.body = result.doc;
      page.plainText = extractPlainText(result.doc);
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
      updatedPages.push(page);
    }
    if (!updatedPages.length && sourcePageId) {
      await syncPageGraph(targetPage, userId);
    }
    return updatedPages;
  };

  router.get('/api/wiki/schema', authenticateToken, async (req, res) => {
    try {
      const settings = await getWikiSchemaSettings({
        WikiSchemaSettings,
        userId: req.user.id
      });
      res.status(200).json(settings);
    } catch (error) {
      console.error('Error reading wiki schema:', error);
      res.status(500).json({ error: 'Failed to read wiki schema.' });
    }
  });

  router.put('/api/wiki/schema', authenticateToken, async (req, res) => {
    try {
      const settings = await saveWikiSchemaSettings({
        WikiSchemaSettings,
        userId: req.user.id,
        content: req.body?.content
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_SCHEMA_SAVED, {
        contentLength: String(settings.content || '').length,
        snapshotCount: Array.isArray(settings.snapshots) ? settings.snapshots.length : 0
      });
      res.status(200).json(settings);
    } catch (error) {
      console.error('Error saving wiki schema:', error);
      res.status(500).json({ error: 'Failed to save wiki schema.' });
    }
  });

  router.post('/api/wiki/schema/revert', authenticateToken, async (req, res) => {
    try {
      const settings = await revertWikiSchemaSettings({
        WikiSchemaSettings,
        userId: req.user.id,
        snapshotId: req.body?.snapshotId
      });
      res.status(200).json(settings);
    } catch (error) {
      if (error.code === 'WIKI_SCHEMA_SNAPSHOT_NOT_FOUND') {
        return res.status(404).json({ error: 'Wiki schema snapshot not found.' });
      }
      console.error('Error reverting wiki schema:', error);
      res.status(500).json({ error: 'Failed to revert wiki schema.' });
    }
  });

  router.get('/api/wiki/pages', authenticateToken, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const status = validateEnumField('status', req.query.status, STATUSES);
      const visibility = validateEnumField('visibility', req.query.visibility, VISIBILITIES);
      const pageType = validatePageType(req.query.pageType);
      const invalidEnum = [status, visibility, pageType].find(result => result?.error);
      if (invalidEnum) return res.status(400).json({ error: invalidEnum.error });
      if (status?.value) query.status = status.value;
      else query.status = { $ne: 'archived' };
      if (visibility?.value) query.visibility = visibility.value;
      if (pageType?.value) query.pageType = pageTypeQueryValue(pageType);

      const q = String(req.query.q || '').trim();
      if (q) {
        const regex = new RegExp(escapeRegExp(q), 'i');
        query.$or = [{ title: regex }, { plainText: regex }];
      }

      const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
      const pages = await WikiPage.find(query).sort({ updatedAt: -1 }).limit(limit).lean();
      res.status(200).json(pages.map(serializeWikiPage));
    } catch (error) {
      console.error('Error listing wiki pages:', error);
      res.status(500).json({ error: 'Failed to list wiki pages.' });
    }
  });

  router.post('/api/wiki/pages', authenticateToken, async (req, res) => {
    try {
      const pageType = validatePageType(req.body?.pageType);
      const sourceScope = validateEnumField('sourceScope', req.body?.sourceScope, SOURCE_SCOPES);
      if (pageType?.error) return res.status(400).json({ error: pageType.error });
      if (sourceScope?.error) return res.status(400).json({ error: sourceScope.error });
      const initialSourceRef = req.body?.initialSourceRef
        ? normalizeSourceRef(req.body.initialSourceRef)
        : null;
      if (initialSourceRef?.error) return res.status(400).json({ error: initialSourceRef.error });

      const createdFrom = normalizeCreatedFrom(req.body?.createdFrom);
      const title = normalizeTitle(req.body?.title || createdFrom.label);
      const body = req.body?.body && typeof req.body.body === 'object' && !Array.isArray(req.body.body)
        ? req.body.body
        : emptyDoc();
      const page = new WikiPage({
        userId: req.user.id,
        title,
        slug: await buildUniqueSlug(req.user.id, title),
        pageType: pageType?.value || 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: sourceScope?.value || 'entire_library',
        createdFrom,
        body,
        plainText: extractPlainText(body),
        sourceRefs: initialSourceRef?.value ? [initialSourceRef.value] : []
      });
      refreshPageClaims(page);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'created',
        actorType: 'user',
        summary: `Created "${page.title}".`
      });
      res.status(201).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error creating wiki page:', error);
      res.status(500).json({ error: 'Failed to create wiki page.' });
    }
  });

  router.get('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req).lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      res.status(200).json(serializeWikiPage(page));
    } catch (_error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  router.patch('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    try {
      const enumChecks = [
        validatePageType(req.body?.pageType),
        validateEnumField('status', req.body?.status, STATUSES),
        validateEnumField('visibility', req.body?.visibility, VISIBILITIES),
        validateEnumField('sourceScope', req.body?.sourceScope, SOURCE_SCOPES)
      ];
      const invalidEnum = enumChecks.find(result => result?.error);
      if (invalidEnum) return res.status(400).json({ error: invalidEnum.error });

      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const before = snapshotPage(page);

      if (req.body?.title !== undefined) {
        page.title = normalizeTitle(req.body.title);
        page.slug = await buildUniqueSlug(req.user.id, page.title, page._id);
      }
      if (enumChecks[0]?.value) page.pageType = enumChecks[0].value;
      if (enumChecks[1]?.value) page.status = enumChecks[1].value;
      if (enumChecks[2]?.value) page.visibility = enumChecks[2].value;
      if (enumChecks[3]?.value) page.sourceScope = enumChecks[3].value;
      if (req.body?.body !== undefined) {
        if (!req.body.body || typeof req.body.body !== 'object' || Array.isArray(req.body.body)) {
          return res.status(400).json({ error: 'body must be a TipTap JSON object.' });
        }
        page.body = req.body.body;
        page.plainText = extractPlainText(req.body.body);
      }
      if (req.body?.body !== undefined) refreshPageClaims(page);

      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Updated "${page.title}".`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error updating wiki page:', error);
      res.status(500).json({ error: 'Failed to update wiki page.' });
    }
  });

  router.delete('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const before = snapshotPage(page);
      page.status = 'archived';
      await page.save();
      await syncPageGraph({
        _id: page._id,
        userId: page.userId,
        body: emptyDoc(),
        sourceRefs: []
      }, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'archived',
        actorType: 'user',
        summary: `Archived "${page.title}".`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (_error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  router.post('/api/wiki/pages/:id/ai/draft', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const before = snapshotPage(page);

      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        draftStatus: 'maintaining',
        draftRequestedAt: new Date(),
        draftStartedAt: new Date(),
        lastError: '',
        errorCode: ''
      };

      await maintainWikiPage({
        page,
        userId: req.user.id,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id),
        models: {
          Article,
          NotebookEntry,
          TagMeta,
          Question
        }
      });

      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'agent_maintenance',
        actorType: 'agent',
        summary: page.aiState?.maintenanceSummary || `Maintained "${page.title}".`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error maintaining wiki page:', error);
      res.status(500).json({ error: 'Failed to maintain wiki page.' });
    }
  });

  router.post('/api/wiki/pages/:id/ai/draft/stream', authenticateToken, async (req, res) => {
    let page = null;
    try {
      page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const before = snapshotPage(page);
      openWikiDraftStream(res);

      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        draftStatus: 'maintaining',
        draftRequestedAt: new Date(),
        draftStartedAt: new Date(),
        lastError: '',
        errorCode: ''
      };
      await page.save();
      writeSse(res, 'wiki-page', {
        stage: 'maintaining',
        summary: 'Wiki maintenance started.',
        page: serializeWikiPage(page)
      });

      await maintainWikiPage({
        page,
        userId: req.user.id,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id),
        models: {
          Article,
          NotebookEntry,
          TagMeta,
          Question
        },
        onProgress: (event) => {
          writeSse(res, 'wiki-draft', event);
        }
      });
      writeSse(res, 'wiki-page', {
        stage: 'drafted',
        summary: page.aiState?.maintenanceSummary || 'Wiki draft generated.',
        page: serializeWikiPage(page)
      });

      await page.save();
      writeSse(res, 'wiki-page', {
        stage: 'saved',
        summary: 'Wiki page saved.',
        page: serializeWikiPage(page)
      });

      await syncPageGraph(page, req.user.id);
      writeSse(res, 'wiki-draft', {
        stage: 'graph_synced',
        summary: 'Wiki graph connections synced.'
      });

      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'agent_maintenance',
        actorType: 'agent',
        summary: page.aiState?.maintenanceSummary || `Maintained "${page.title}".`
      });
      writeSse(res, 'wiki-page', {
        stage: 'complete',
        summary: page.aiState?.maintenanceSummary || 'Wiki maintenance completed.',
        page: serializeWikiPage(page)
      });
      writeSse(res, 'done', { ok: true, pageId: serializeId(page._id) });
      res.end();
    } catch (error) {
      console.error('Error streaming wiki maintenance:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to maintain wiki page.' });
      }
      if (page) {
        page.aiState = {
          ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
          draftStatus: 'error',
          lastError: String(error.message || 'Failed to maintain wiki page.'),
          errorCode: 'WIKI_DRAFT_STREAM_FAILED'
        };
        try {
          await page.save();
        } catch (_saveError) {
          // The stream error is the actionable failure for the client.
        }
      }
      writeSse(res, 'error', {
        error: 'Failed to maintain wiki page.',
        message: String(error.message || '')
      });
      res.end();
    }
  });

  router.post('/api/wiki/pages/:id/sources', authenticateToken, async (req, res) => {
    try {
      const sourceRef = normalizeSourceRef(req.body);
      if (sourceRef.error) return res.status(400).json({ error: sourceRef.error });

      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      page.sourceRefs.push(sourceRef.value);
      refreshPageClaims(page);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Attached a source to "${page.title}".`
      });
      res.status(201).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error adding wiki source:', error);
      res.status(500).json({ error: 'Failed to add wiki source.' });
    }
  });

  router.delete('/api/wiki/pages/:id/sources/:sourceRefId', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      const source = page.sourceRefs.id(req.params.sourceRefId);
      if (!source) return res.status(404).json({ error: 'Wiki source not found.' });

      source.deleteOne();
      refreshPageClaims(page);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Removed a source from "${page.title}".`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error removing wiki source:', error);
      res.status(500).json({ error: 'Failed to remove wiki source.' });
    }
  });

  // Ask the agent a question about this page. The answer is appended to
  // the page's discussions array and the updated page is returned so the
  // editor can re-render the discussions section.
  router.post('/api/wiki/pages/:id/ask', authenticateToken, async (req, res) => {
    try {
      const question = String(req.body?.question || '').trim();
      if (!question) return res.status(400).json({ error: 'Question is required.' });
      if (question.length > 1000) return res.status(400).json({ error: 'Question is too long.' });

      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      const result = await askWikiPage({
        page,
        question,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });

      page.discussions.push({
        question,
        answer: result.answer,
        citationIndexesUsed: result.citationIndexesUsed || [],
        model: result.model || '',
        status: result.status || 'answered',
        errorMessage: result.errorMessage || '',
        askedAt: new Date()
      });
      await page.save();

      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error asking wiki page:', error);
      res.status(500).json({ error: 'Failed to ask wiki page.' });
    }
  });

  router.post('/api/wiki/pages/:id/discussions/:discussionId/promote', authenticateToken, async (req, res) => {
    try {
      const sourcePage = await findOwnedPage(req);
      if (!sourcePage) return res.status(404).json({ error: 'Wiki page not found.' });

      const discussion = sourcePage.discussions.id(req.params.discussionId);
      if (!discussion) return res.status(404).json({ error: 'Discussion not found.' });
      if (discussion.status === 'failed') {
        return res.status(400).json({ error: 'Only answered discussions can become wiki pages.' });
      }

      const title = normalizeTitle(req.body?.title || deriveTitleFromQuestion(discussion.question));
      const citationIndexes = collectCitationIndexesFromDoc(discussion.answer);
      (discussion.citationIndexesUsed || []).forEach((index) => {
        const numeric = Number(index);
        if (Number.isInteger(numeric) && numeric >= 1) citationIndexes.add(numeric);
      });
      const sourceRefs = Array.from(citationIndexes)
        .sort((a, b) => a - b)
        .map(index => sourcePage.sourceRefs?.[index - 1])
        .map(cloneSourceRefForPromotion)
        .filter(Boolean);
      const citationIndexMap = new Map(
        Array.from(citationIndexes)
          .sort((a, b) => a - b)
          .map((index, nextIndex) => [index, nextIndex + 1])
      );
      const body = buildPromotedDiscussionDoc({ title, discussion, citationIndexMap });
      const promotedPage = new WikiPage({
        userId: req.user.id,
        title,
        slug: await buildUniqueSlug(req.user.id, title),
        pageType: 'question',
        status: 'draft',
        visibility: 'private',
        sourceScope: sourceRefs.length > 0 ? 'selected_sources' : 'current_item',
        createdFrom: {
          type: 'question',
          objectId: sourcePage._id,
          objectIds: [sourcePage._id],
          text: discussion.question,
          label: sourcePage.title
        },
        body,
        plainText: extractPlainText(body),
        sourceRefs
      });

      await applyAutolinksForPage(promotedPage, req.user.id);
      refreshPageClaims(promotedPage);
      await promotedPage.save();
      await syncPageGraph(promotedPage, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page: promotedPage,
        reason: 'created',
        actorType: 'agent',
        summary: `Created "${promotedPage.title}" from a discussion on "${sourcePage.title}".`
      });
      const linkedNeighborPages = await autolinkPagesToTarget({
        targetPage: promotedPage,
        userId: req.user.id,
        sourcePageId: sourcePage._id
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_QA_PROMOTED, {
        sourcePageId: serializeId(sourcePage._id),
        promotedPageId: serializeId(promotedPage._id),
        citationCount: sourceRefs.length,
        linkedNeighborPageCount: linkedNeighborPages.length
      });
      res.status(201).json({
        page: serializeWikiPage(promotedPage),
        sourcePage: serializeWikiPage(sourcePage),
        linkedNeighborPageIds: linkedNeighborPages.map(page => serializeId(page._id)).filter(Boolean)
      });
    } catch (error) {
      console.error('Error promoting wiki discussion:', error);
      res.status(500).json({ error: 'Failed to create wiki page from discussion.' });
    }
  });

  router.delete('/api/wiki/pages/:id/discussions/:discussionId', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      const discussion = page.discussions.id(req.params.discussionId);
      if (!discussion) return res.status(404).json({ error: 'Discussion not found.' });

      discussion.deleteOne();
      await page.save();
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error removing wiki discussion:', error);
      res.status(500).json({ error: 'Failed to remove discussion.' });
    }
  });

  // Daily wiki briefing for the index page. The route is intentionally
  // computed on demand rather than scheduled — the user's signal volume
  // doesn't justify a cron and on-demand keeps the data fresh.
  router.get('/api/wiki/briefing', authenticateToken, async (req, res) => {
    try {
      const briefing = await buildWikiBriefing({
        userId: req.user.id,
        models: { WikiPage, Article, NotebookEntry, TagMeta, Question }
      });
      res.status(200).json(briefing);
    } catch (error) {
      console.error('Error building wiki briefing:', error);
      res.status(500).json({ error: 'Failed to build wiki briefing.' });
    }
  });

  // Backlinks for a single page — "Mentioned in N other pages." Computed
  // on demand by scanning the user's other pages' plainText for substring
  // matches against this page's title.
  router.get('/api/wiki/pages/:id/backlinks', authenticateToken, async (req, res) => {
    try {
      const targetPage = await findOwnedPage(req).lean();
      if (!targetPage) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await findWikiBacklinks({
        targetPage,
        userId: req.user.id,
        models: { WikiPage }
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error finding wiki backlinks:', error);
      res.status(500).json({ error: 'Failed to compute wiki backlinks.' });
    }
  });

  router.post('/api/wiki/pages/:id/graph/rebuild', authenticateToken, async (req, res) => {
    try {
      if (!Connection) return res.status(503).json({ error: 'Wiki graph storage is not available.' });
      const page = await findOwnedPage(req).lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await syncWikiPageGraphConnections({
        Connection,
        userId: req.user.id,
        page
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error rebuilding wiki page graph:', error);
      res.status(500).json({ error: 'Failed to rebuild wiki page graph.' });
    }
  });

  router.post('/api/wiki/graph/rebuild', authenticateToken, async (req, res) => {
    try {
      if (!Connection) return res.status(503).json({ error: 'Wiki graph storage is not available.' });
      const limit = Math.max(1, Math.min(Number(req.body?.limit) || 500, 1000));
      const result = await rebuildWikiGraphConnections({
        Connection,
        WikiPage,
        userId: req.user.id,
        limit
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error rebuilding wiki graph:', error);
      res.status(500).json({ error: 'Failed to rebuild wiki graph.' });
    }
  });

  router.get('/api/wiki/proposals', authenticateToken, async (req, res) => {
    try {
      const result = await refreshWikiProposals({ userId: req.user.id, force: false });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error listing wiki proposals:', error);
      res.status(500).json({ error: 'Failed to list wiki proposals.' });
    }
  });

  router.post('/api/wiki/proposals/generate-background', authenticateToken, async (req, res) => {
    try {
      const result = await refreshWikiProposals({ userId: req.user.id, force: Boolean(req.body?.force) });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error refreshing wiki proposals:', error);
      res.status(500).json({ error: 'Failed to refresh wiki proposals.' });
    }
  });

  router.post('/api/wiki/proposals/:proposalId/watch', authenticateToken, async (req, res) => {
    try {
      if (!WikiProposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const proposal = await WikiProposal.findOneAndUpdate(
        { _id: req.params.proposalId, userId: req.user.id, status: 'pending' },
        { status: 'watched' },
        { new: true }
      );
      if (!proposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      res.status(200).json(serializeWikiProposal(proposal));
    } catch (error) {
      console.error('Error watching wiki proposal:', error);
      res.status(500).json({ error: 'Failed to watch wiki proposal.' });
    }
  });

  router.post('/api/wiki/proposals/:proposalId/dismiss', authenticateToken, async (req, res) => {
    try {
      if (!WikiProposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const proposal = await WikiProposal.findOneAndUpdate(
        { _id: req.params.proposalId, userId: req.user.id, status: { $in: ['pending', 'watched'] } },
        { status: 'dismissed', dismissedReason: String(req.body?.reason || '').trim().slice(0, 500) },
        { new: true }
      );
      if (!proposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      res.status(200).json(serializeWikiProposal(proposal));
    } catch (error) {
      console.error('Error dismissing wiki proposal:', error);
      res.status(500).json({ error: 'Failed to dismiss wiki proposal.' });
    }
  });

  router.post('/api/wiki/proposals/:proposalId/merge', authenticateToken, async (req, res) => {
    try {
      if (!WikiProposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const pageId = normalizeObjectId(req.body?.pageId);
      if (!pageId) return res.status(400).json({ error: 'pageId must be a valid id.' });
      const targetPage = await WikiPage.findOne({ _id: pageId, userId: req.user.id }).select('_id').lean();
      if (!targetPage) return res.status(404).json({ error: 'Merge target page not found.' });
      const proposal = await WikiProposal.findOneAndUpdate(
        { _id: req.params.proposalId, userId: req.user.id, status: { $in: ['pending', 'watched'] } },
        { status: 'merged', mergedIntoPageId: pageId },
        { new: true }
      );
      if (!proposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      res.status(200).json(serializeWikiProposal(proposal));
    } catch (error) {
      console.error('Error merging wiki proposal:', error);
      res.status(500).json({ error: 'Failed to merge wiki proposal.' });
    }
  });

  router.post('/api/wiki/proposals/:proposalId/accept', authenticateToken, async (req, res) => {
    try {
      if (!WikiProposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const proposal = await WikiProposal.findOne({
        _id: req.params.proposalId,
        userId: req.user.id,
        status: { $in: ['pending', 'watched'] }
      });
      if (!proposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const page = await createDraftPageFromProposal({ proposal, WikiPage, buildUniqueSlug });
      const maintainedPage = await maintainProposalDraft({ page, userId: req.user.id });
      res.status(201).json({ proposal: serializeWikiProposal(proposal), page: serializeWikiPage(maintainedPage) });
    } catch (error) {
      console.error('Error accepting wiki proposal:', error);
      res.status(500).json({ error: 'Failed to accept wiki proposal.' });
    }
  });

  router.post('/api/wiki/ingest', authenticateToken, async (req, res) => {
    try {
      if (!WikiSourceEvent) return res.status(503).json({ error: 'Wiki ingest storage is not available.' });
      const normalized = normalizeIngestSource(req.body?.source);
      if (normalized.error) return res.status(400).json({ error: normalized.error });
      const source = normalized.value;
      const sourceLabel = source.title || source.url || source.text.slice(0, 120) || 'Untitled source';
      const event = await createWikiSourceEvent({
        WikiSourceEvent,
        userId: req.user.id,
        sourceType: source.sourceType,
        sourceObjectId: source.objectId,
        provider: source.rawType === 'url' ? 'url' : (source.rawType === 'text' ? 'paste' : ''),
        eventType: 'imported',
        title: sourceLabel,
        summary: source.summary || source.text || source.url || sourceLabel,
        text: source.text,
        url: source.url,
        metadata: {
          ingest: true,
          ingestSourceType: source.rawType
        }
      });
      if (!event) return res.status(400).json({ error: 'Could not create ingest run.' });
      trackWikiEvent(req, EVENT_NAMES.WIKI_INGEST_SUBMITTED, {
        sourceEventId: serializeId(event._id),
        sourceType: source.rawType,
        hasUrl: Boolean(source.url),
        hasText: Boolean(source.text)
      });

      const result = await processWikiSourceEvent({
        sourceEvent: event,
        userId: req.user.id,
        models: wikiModels(),
        buildUniqueSlug,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });
      const run = result.run || await findMaintenanceRunBySourceEvent({ userId: req.user.id, sourceEventId: event._id });
      const affectedPageCount = Array.isArray((result.event || event).affectedPageIds)
        ? (result.event || event).affectedPageIds.length
        : 0;
      trackWikiEvent(req, affectedPageCount > 0 ? EVENT_NAMES.WIKI_INGEST_COMPLETED : EVENT_NAMES.WIKI_INGEST_NO_MATCH, {
        sourceEventId: serializeId((result.event || event)._id),
        sourceType: source.rawType,
        affectedPageCount,
        status: (result.event || event).status || '',
        suggestedCreatePage: Boolean((result.event || event).metadata?.ignoredReason === 'no_matching_wiki_page')
      });
      res.status(202).json(serializeIngestRun({ event: result.event || event, run }));
    } catch (error) {
      console.error('Error ingesting wiki source:', error);
      res.status(500).json({ error: 'Failed to ingest wiki source.' });
    }
  });

  router.get('/api/wiki/ingest/:runId', authenticateToken, async (req, res) => {
    try {
      if (!WikiSourceEvent) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      if (!mongoose.Types.ObjectId.isValid(String(req.params.runId || ''))) {
        return res.status(400).json({ error: 'Invalid ingest run id.' });
      }
      const event = await WikiSourceEvent.findOne({
        _id: req.params.runId,
        userId: req.user.id
      }).lean();
      if (!event) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      const run = await findMaintenanceRunBySourceEvent({ userId: req.user.id, sourceEventId: event._id });
      const timeline = await buildIngestTimeline({ userId: req.user.id, event, run });
      res.status(200).json({
        ...serializeIngestRun({ event, run }),
        timeline
      });
    } catch (error) {
      console.error('Error reading wiki ingest run:', error);
      res.status(500).json({ error: 'Failed to read wiki ingest run.' });
    }
  });

  router.post('/api/wiki/ingest/:runId/undo', authenticateToken, async (req, res) => {
    try {
      if (!WikiSourceEvent || !WikiRevision) {
        return res.status(503).json({ error: 'Wiki ingest undo is not available.' });
      }
      if (!mongoose.Types.ObjectId.isValid(String(req.params.runId || ''))) {
        return res.status(400).json({ error: 'Invalid ingest run id.' });
      }
      const event = await WikiSourceEvent.findOne({ _id: req.params.runId, userId: req.user.id });
      if (!event) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      if (event.metadata?.undoneAt) {
        return res.status(409).json({ error: 'Wiki ingest run has already been undone.' });
      }

      const revisions = await WikiRevision.find({
        userId: req.user.id,
        sourceEventId: event._id
      }).sort({ createdAt: -1 }).limit(100);
      const latestByPage = new Map();
      (Array.isArray(revisions) ? revisions : []).forEach((revision) => {
        const pageId = serializeId(revision.pageId);
        if (pageId && !latestByPage.has(pageId)) latestByPage.set(pageId, revision);
      });

      const restoredPageIds = [];
      for (const revision of latestByPage.values()) {
        const page = await WikiPage.findOne({ _id: revision.pageId, userId: req.user.id });
        if (!page) continue;
        const beforeUndo = snapshotPage(page);
        if (revision.before) restorePageSnapshot(page, revision.before);
        else page.status = 'archived';
        await page.save();
        await syncPageGraph(page, req.user.id);
        await createWikiRevision({
          WikiRevision,
          userId: req.user.id,
          page,
          before: beforeUndo,
          reason: 'user_edit',
          actorType: 'user',
          sourceEventId: event._id,
          summary: `Undid ingest changes from "${event.title || event.sourceType}".`
        });
        restoredPageIds.push(serializeId(page._id));
      }

      event.metadata = {
        ...(event.metadata?.toObject ? event.metadata.toObject() : event.metadata || {}),
        undoneAt: new Date(),
        undonePageIds: restoredPageIds
      };
      await event.save();
      const run = await findMaintenanceRunBySourceEvent({ userId: req.user.id, sourceEventId: event._id });
      res.status(200).json({
        ...serializeIngestRun({ event, run }),
        restoredPageIds
      });
    } catch (error) {
      console.error('Error undoing wiki ingest run:', error);
      res.status(500).json({ error: 'Failed to undo wiki ingest run.' });
    }
  });

  router.get('/api/wiki/activity', authenticateToken, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
      const [sourceEvents, maintenanceRuns, pages] = await Promise.all([
        WikiSourceEvent
          ? WikiSourceEvent.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiMaintenanceRun
          ? WikiMaintenanceRun.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiPage.find({ userId: req.user.id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(200).lean()
      ]);
      const events = sortActivityEvents([
        ...(Array.isArray(sourceEvents) ? sourceEvents : []).flatMap(event => ([{
          id: serializeId(event._id),
          type: event.metadata?.ingest ? 'ingest' : 'source_event',
          runId: event.metadata?.ingest ? serializeId(event._id) : null,
          sourceEventId: serializeId(event._id),
          status: event.status || '',
          title: event.title || event.url || event.sourceType,
          summary: cleanWikiSummary(event.summary || event.errorMessage || ''),
          affectedPageIds: Array.isArray(event.affectedPageIds) ? event.affectedPageIds.map(serializeId).filter(Boolean) : [],
          at: event.processedAt || event.updatedAt || event.createdAt
        }, event.metadata?.undoneAt ? {
          id: `${serializeId(event._id)}:undo`,
          type: 'ingest_undo',
          runId: event.metadata?.ingest ? serializeId(event._id) : null,
          sourceEventId: serializeId(event._id),
          status: 'completed',
          title: `Undid ${event.title || event.url || event.sourceType}`,
          summary: `${Array.isArray(event.metadata?.undonePageIds) ? event.metadata.undonePageIds.length : 0} page${Array.isArray(event.metadata?.undonePageIds) && event.metadata.undonePageIds.length === 1 ? '' : 's'} restored.`,
          affectedPageIds: Array.isArray(event.metadata?.undonePageIds) ? event.metadata.undonePageIds.map(serializeId).filter(Boolean) : [],
          at: event.metadata.undoneAt
        } : null]).filter(Boolean)),
        ...(Array.isArray(maintenanceRuns) ? maintenanceRuns : []).map(run => ({
          id: serializeId(run._id),
          type: 'maintenance',
          runId: serializeId(run._id),
          sourceEventId: serializeId(run.sourceEventId),
          status: run.status || '',
          pageId: serializeId(run.pageId),
          title: 'Wiki maintenance',
          summary: cleanWikiSummary(run.summary || run.errorMessage || ''),
          at: run.completedAt || run.startedAt || run.createdAt
        })),
        ...(Array.isArray(pages) ? pages : []).flatMap(page => (
          Array.isArray(page.discussions) ? page.discussions : []
        ).map(discussion => ({
          id: serializeId(discussion._id) || `${page._id}:${discussion.askedAt}`,
          type: 'ask',
          pageId: serializeId(page._id),
          status: discussion.status || 'answered',
          title: discussion.question || 'Wiki question',
          summary: cleanWikiSummary(discussion.errorMessage || ''),
          at: discussion.askedAt || page.updatedAt
        })))
      ]).slice(0, limit);
      res.status(200).json({ events });
    } catch (error) {
      console.error('Error listing wiki activity:', error);
      res.status(500).json({ error: 'Failed to list wiki activity.' });
    }
  });

  router.post('/api/wiki/schema/suggestions', authenticateToken, async (req, res) => {
    try {
      const limit = Math.max(5, Math.min(Number(req.body?.limit) || 50, 100));
      const [sourceEvents, maintenanceRuns, pages] = await Promise.all([
        WikiSourceEvent
          ? WikiSourceEvent.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiMaintenanceRun
          ? WikiMaintenanceRun.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiPage.find({ userId: req.user.id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(limit).lean()
      ]);
      const now = new Date();
      const result = suggestWikiSchemaUpdates({
        currentSchema: req.body?.currentSchema,
        sourceEvents,
        maintenanceRuns,
        pages,
        now
      });
      let run = null;
      if (WikiMaintenanceRun) {
        run = new WikiMaintenanceRun({
          userId: req.user.id,
          status: 'completed',
          trigger: 'batch',
          summary: result.summary,
          startedAt: now,
          completedAt: now,
          metadata: {
            kind: 'schema_suggestions',
            suggestionCount: result.suggestions.length,
            currentSchemaLength: result.currentSchema.length,
            context: result.context
          }
        });
        await run.save();
      }
      trackWikiEvent(req, EVENT_NAMES.WIKI_SCHEMA_SUGGESTED, {
        runId: serializeId(run?._id),
        suggestionCount: Array.isArray(result.suggestions) ? result.suggestions.length : 0,
        currentSchemaLength: String(result.currentSchema || '').length
      });
      res.status(200).json({
        runId: serializeId(run?._id),
        ...result
      });
    } catch (error) {
      console.error('Error suggesting wiki schema updates:', error);
      res.status(500).json({ error: 'Failed to suggest wiki schema updates.' });
    }
  });

  router.get('/api/wiki/source-events', authenticateToken, async (req, res) => {
    try {
      const status = String(req.query.status || '').trim();
      if (status && !['pending', 'processing', 'processed', 'failed', 'ignored'].includes(status)) {
        return res.status(400).json({ error: 'Invalid source event status.' });
      }
      const events = await listWikiSourceEvents({
        WikiSourceEvent,
        userId: req.user.id,
        status,
        limit: req.query.limit
      });
      res.status(200).json({ events });
    } catch (error) {
      console.error('Error listing wiki source events:', error);
      res.status(500).json({ error: 'Failed to list wiki source events.' });
    }
  });

  router.post('/api/wiki/source-events/process-pending', authenticateToken, async (req, res) => {
    try {
      const results = await processPendingWikiSourceEvents({
        userId: req.user.id,
        models: wikiModels(),
        limit: req.body?.limit,
        buildUniqueSlug,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });
      res.status(200).json({
        processed: results.filter(result => !result.error).length,
        failed: results.filter(result => result.error).length,
        results: results.map(result => ({
          eventId: result.event?._id || null,
          status: result.event?.status || (result.error ? 'failed' : ''),
          pageIds: Array.isArray(result.pages) ? result.pages.map(page => page._id).filter(Boolean) : [],
          error: result.error || ''
        }))
      });
    } catch (error) {
      console.error('Error processing pending wiki source events:', error);
      res.status(500).json({ error: 'Failed to process pending wiki source events.' });
    }
  });

  router.post('/api/wiki/source-events/:sourceEventId/process', authenticateToken, async (req, res) => {
    try {
      const result = await processWikiSourceEvent({
        sourceEventId: req.params.sourceEventId,
        userId: req.user.id,
        models: wikiModels(),
        buildUniqueSlug,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });
      res.status(200).json({
        event: result.event,
        pages: Array.isArray(result.pages) ? result.pages.map(serializeWikiPage) : [],
        run: result.run || null
      });
    } catch (error) {
      if (error.code === 'SOURCE_EVENT_NOT_FOUND') return res.status(404).json({ error: 'Wiki source event not found.' });
      console.error('Error processing wiki source event:', error);
      res.status(500).json({ error: 'Failed to process wiki source event.' });
    }
  });

  router.get('/api/wiki/pages/:id/revisions', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req).select('_id').lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      if (!WikiRevision) return res.status(200).json({ revisions: [] });
      const revisions = await WikiRevision.find({ userId: req.user.id, pageId: req.params.id }).sort({ createdAt: -1 }).limit(50).lean();
      res.status(200).json({ revisions });
    } catch (error) {
      console.error('Error listing wiki revisions:', error);
      res.status(500).json({ error: 'Failed to list wiki revisions.' });
    }
  });

  router.get('/api/wiki/pages/:id/connector-actions', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req).select('_id').lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      if (!ConnectorActionLog) return res.status(200).json({ actions: [] });
      const actions = await ConnectorActionLog.find({
        userId: req.user.id,
        targetType: 'wiki_page',
        targetId: String(req.params.id)
      }).sort({ createdAt: -1 }).limit(20).lean();
      res.status(200).json({ actions });
    } catch (error) {
      console.error('Error listing wiki connector actions:', error);
      res.status(500).json({ error: 'Failed to list wiki connector actions.' });
    }
  });

  router.get('/api/wiki/pages/:id/autolinks', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req).lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await findAutolinkSuggestions({
        targetPage: page,
        userId: req.user.id,
        models: { WikiPage }
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error listing wiki autolink suggestions:', error);
      res.status(500).json({ error: 'Failed to list wiki autolink suggestions.' });
    }
  });

  router.post('/api/wiki/pages/:id/autolinks/:targetPageId/apply', authenticateToken, async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(req.params.targetPageId || ''))) {
        return res.status(400).json({ error: 'Invalid target wiki page id.' });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const targetPage = await WikiPage.findOne({
        _id: req.params.targetPageId,
        userId: req.user.id,
        status: { $ne: 'archived' }
      }).lean();
      if (!targetPage) return res.status(404).json({ error: 'Target wiki page not found.' });
      if (String(targetPage._id) === String(page._id)) return res.status(400).json({ error: 'Cannot link a Wiki page to itself.' });
      const before = snapshotPage(page);
      const result = applyWikiAutolinkToDoc({ doc: page.body || emptyDoc(), targetPage });
      if (!result.applied) {
        return res.status(409).json({ error: 'Could not apply link. The mention may already be linked or no longer exists.' });
      }
      page.body = result.doc;
      page.plainText = extractPlainText(result.doc);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Linked "${targetPage.title}" from "${page.title}".`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error applying wiki autolink:', error);
      res.status(500).json({ error: 'Failed to apply wiki link.' });
    }
  });

  router.post('/api/wiki/pages/:id/freshness/review', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      page.freshness = {
        ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
        status: 'fresh',
        conflictCount: 0,
        staleSectionCount: 0,
        reviewedAt: new Date()
      };
      await page.save();
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Marked "${page.title}" freshness reviewed.`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error reviewing wiki freshness:', error);
      res.status(500).json({ error: 'Failed to mark wiki freshness reviewed.' });
    }
  });

  router.post('/api/wiki/pages/:id/write-back/:connector', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await writeWikiPageToConnector({
        page,
        userId: req.user.id,
        connector: req.params.connector,
        connectionId: req.body?.connectionId,
        parentPageId: req.body?.parentPageId,
        notionPageId: req.body?.notionPageId,
        models: { IntegrationConnection, ConnectorActionLog },
        createNotionPage,
        appendNotionBlockChildren,
        updateNotionPageTitle,
        decryptSecret
      });
      res.status(201).json(result);
    } catch (error) {
      if (error.code === 'CONNECTOR_CONNECTION_NOT_FOUND') return res.status(404).json({ error: error.message });
      if (error.code === 'CONNECTOR_WRITEBACK_UNSUPPORTED') return res.status(400).json({ error: error.message });
      if (error.code === 'CONNECTOR_TOKEN_MISSING' || error.code === 'CONNECTOR_WRITEBACK_NOT_CONFIGURED') {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error writing wiki page to connector:', error);
      res.status(500).json({ error: 'Failed to write wiki page to connector.' });
    }
  });

  return router;
};

module.exports = {
  buildWikiRouter,
  buildWikiDraftState,
  extractPlainText,
  normalizeCreatedFrom,
  normalizeSourceRef,
  serializeWikiPage,
  slugify
};
