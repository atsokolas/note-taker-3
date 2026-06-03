const express = require('express');
const mongoose = require('mongoose');
const archiver = require('archiver');
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
  renderWikiIndexMarkdown,
  renderWikiLogMarkdown,
  renderWikiPageMarkdown,
  renderWikiSchemaMarkdown,
  sanitizeFilename
} = require('../services/wikiMarkdownExportService');
const { lintWiki: defaultLintWiki } = require('../services/wikiLintService');
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
const INVERSE_CONNECTION_RELATION_TYPES = {
  related: 'referenced_by',
  referenced_by: 'related',
  supports: 'supported_by',
  supported_by: 'supports',
  contradicts: 'contradicted_by',
  contradicted_by: 'contradicts',
  contains: 'contained_by',
  contained_by: 'contains',
  shared_source: 'shared_source',
  needs_review: 'review_needed_by',
  review_needed_by: 'needs_review'
};

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

const countWords = (value = '') => (
  String(value || '').trim().split(/\s+/).filter(Boolean).length
);

const extractRelevanceTextFromDoc = (node, out = [], state = { paragraphSeen: false }) => {
  if (!node || out.join(' ').length > 1600) return out;
  if (Array.isArray(node)) {
    node.forEach(child => extractRelevanceTextFromDoc(child, out, state));
    return out;
  }
  if (typeof node !== 'object') return out;
  if (node.type === 'heading' || (node.type === 'paragraph' && !state.paragraphSeen)) {
    const text = extractPlainText(node);
    if (text) out.push(text);
    if (node.type === 'paragraph') state.paragraphSeen = true;
  }
  if (Array.isArray(node.content)) extractRelevanceTextFromDoc(node.content, out, state);
  return out;
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

const WIKI_SOURCE_RELEVANCE_STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'another', 'article', 'because', 'before', 'between',
  'claim', 'claims', 'concept', 'could', 'draft', 'enough', 'evidence', 'from', 'have', 'http',
  'into', 'just', 'make', 'more', 'most', 'name', 'needs', 'only', 'other', 'page', 'pages',
  'source', 'sources', 'still', 'than', 'that',
  'their', 'there', 'these', 'this', 'through', 'topic', 'what', 'when', 'where', 'which',
  'while', 'wiki', 'with', 'without', 'would'
]);

const tokenizeForSourceRelevance = (value = '') => (
  String(value || '')
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{3,}/g) || []
).map(token => token.replace(/(?:ing|ments?|ions?|ers?|ies|s)$/i, ''))
  .filter(token => token.length >= 4 && !WIKI_SOURCE_RELEVANCE_STOPWORDS.has(token));

const WIKI_SOURCE_SINGLE_OVERLAP_AMBIGUOUS = new Set([
  'busines', 'business', 'market', 'people', 'proces', 'process', 'signal', 'time', 'work'
]);

const sourceLooksOffTopicForPage = ({ pageTokens = new Set(), source = {} } = {}) => {
  if (!pageTokens.size || pageTokens.size < 2) return false;
  const titleTokens = tokenizeForSourceRelevance(source.title || '');
  const titleOverlap = titleTokens.filter(token => pageTokens.has(token));
  if (titleOverlap.length > 0) return false;
  const sourceText = [
    source.title,
    source.snippet,
    source.url,
    source.citationLabel
  ].filter(Boolean).join(' ');
  const sourceTokens = tokenizeForSourceRelevance(sourceText);
  if (!sourceTokens.length) return false;
  const overlap = Array.from(new Set(sourceTokens.filter(token => pageTokens.has(token))));
  if (overlap.length > 1) return false;
  if (overlap.length === 1 && !WIKI_SOURCE_SINGLE_OVERLAP_AMBIGUOUS.has(overlap[0])) return false;
  return true;
};

const sourceTitlePhrase = (source = {}) => (
  String(source.title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
);

const stripSourceTitlePhrases = (value = '', sources = []) => (
  sources.reduce((text, source) => {
    const phrase = sourceTitlePhrase(source);
    if (phrase.length < 6) return text;
    return text.replace(new RegExp(escapeRegExp(phrase), 'gi'), ' ');
  }, String(value || ''))
);

const nodeMentionsRemovedSource = (node, removedSources = []) => {
  const text = extractPlainText(node).toLowerCase().replace(/\s+/g, ' ');
  if (!text) return false;
  return removedSources
    .map(sourceTitlePhrase)
    .filter(phrase => phrase.length >= 6)
    .some(phrase => text.includes(phrase));
};

const stripRemovedSourceMentionsFromDoc = (node, removedSources = []) => {
  if (!node || !removedSources.length) return node;
  if (Array.isArray(node)) {
    return node
      .map(child => stripRemovedSourceMentionsFromDoc(child, removedSources))
      .filter(Boolean);
  }
  if (typeof node !== 'object') return node;
  if (['paragraph', 'listItem', 'blockquote'].includes(node.type) && nodeMentionsRemovedSource(node, removedSources)) {
    return null;
  }
  const next = { ...node };
  if (Array.isArray(next.content)) {
    const stripped = stripRemovedSourceMentionsFromDoc(next.content, removedSources);
    next.content = stripped.length ? stripped : next.content;
  }
  return next;
};

const remapClaimSourceReferences = ({ claims = [], citationIndexMap = new Map(), keptSourceIds = new Set(), keptCitationIds = new Set() } = {}) => (
  Array.isArray(claims)
    ? claims.map((claim) => {
      const remapIndexes = (indexes = []) => (
        Array.isArray(indexes)
          ? indexes.map(index => citationIndexMap.get(Number(index))).filter(Number.isInteger)
          : indexes
      );
      return {
        ...claim,
        ...(Array.isArray(claim.citationIndexes) ? { citationIndexes: remapIndexes(claim.citationIndexes) } : {}),
        ...(Array.isArray(claim.contradictionIndexes) ? { contradictionIndexes: remapIndexes(claim.contradictionIndexes) } : {}),
        ...(Array.isArray(claim.sourceRefIds)
          ? { sourceRefIds: claim.sourceRefIds.filter(id => keptSourceIds.has(String(id))) }
          : {}),
        ...(Array.isArray(claim.citationIds)
          ? { citationIds: claim.citationIds.filter(id => keptCitationIds.has(String(id))) }
          : {}),
        ...(Array.isArray(claim.contradictedByCitationIds)
          ? { contradictedByCitationIds: claim.contradictedByCitationIds.filter(id => keptCitationIds.has(String(id))) }
          : {})
      };
    })
    : []
);

const sanitizeSourceLedgerForRead = (raw = {}) => {
  const sourceRefs = Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [];
  if (sourceRefs.length < 4) return raw;
  const pageText = [
    raw.title,
    raw.infobox?.scope,
    raw.infobox?.summary,
    raw.metadata?.scope,
    raw.metadata?.summary,
    stripSourceTitlePhrases(raw.plainText, sourceRefs),
    extractRelevanceTextFromDoc(raw.body).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();
  const pageTokens = new Set(tokenizeForSourceRelevance(pageText));
  const keepFlags = sourceRefs.map(source => !sourceLooksOffTopicForPage({ pageTokens, source }));
  const removedCount = keepFlags.filter(keep => !keep).length;
  if (!removedCount || sourceRefs.length - removedCount < 3) {
    return raw;
  }
  const citationIndexMap = new Map();
  const keptSourceRefs = [];
  sourceRefs.forEach((source, index) => {
    if (!keepFlags[index]) return;
    citationIndexMap.set(index + 1, keptSourceRefs.length + 1);
    keptSourceRefs.push({
      ...source,
      citationLabel: `[${keptSourceRefs.length + 1}]`
    });
  });
  const keptSourceIds = new Set(keptSourceRefs.map(source => String(source._id || source.id || '')).filter(Boolean));
  const removedSourceRefs = sourceRefs.filter((_source, index) => !keepFlags[index]);
  const citations = Array.isArray(raw.citations) ? raw.citations : [];
  const keptCitations = citations.filter((citation, index) => {
    const sourceId = String(citation?.sourceRefId || '');
    return keepFlags[index] || (sourceId && keptSourceIds.has(sourceId));
  });
  const keptCitationIds = new Set(keptCitations.map(citation => String(citation._id || citation.id || '')).filter(Boolean));
  return {
    ...raw,
    body: remapCitationIndexesInDoc(
      stripRemovedSourceMentionsFromDoc(clonePlain(raw.body || emptyDoc()), removedSourceRefs),
      citationIndexMap
    ),
    sourceRefs: keptSourceRefs,
    citations: keptCitations,
    claims: remapClaimSourceReferences({
      claims: raw.claims || [],
      citationIndexMap,
      keptSourceIds,
      keptCitationIds
    }),
    aiState: {
      ...(raw.aiState || {}),
      sourceRefIdsAtDraft: Array.isArray(raw.aiState?.sourceRefIdsAtDraft)
        ? raw.aiState.sourceRefIdsAtDraft.filter(id => keptSourceIds.has(String(id)))
        : []
    }
  };
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
  const rawPage = typeof page.toObject === 'function'
    ? page.toObject({ virtuals: false })
    : { ...page };
  const raw = sanitizeSourceLedgerForRead(rawPage);
  const sourceRefs = Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [];
  const claims = Array.isArray(raw.claims) ? raw.claims : [];
  const citations = Array.isArray(raw.citations) ? raw.citations : [];
  const sourceIds = new Set();
  sourceRefs.forEach((source, index) => {
    sourceIds.add(String(source?._id || source?.id || source?.sourceRefId || `source-${index}`));
  });
  citations.forEach((citation) => {
    const id = citation?.sourceRefId || citation?.sourceId || citation?.sourceRef?._id || citation?.sourceRef?.id;
    if (id) sourceIds.add(String(id));
  });
  const claimIds = new Set();
  claims.forEach((claim, index) => {
    claimIds.add(String(claim?.claimId || claim?._id || claim?.id || `claim-${index}`));
  });
  citations.forEach((citation) => {
    const id = citation?.claimId || citation?.claim?._id || citation?.claim?.id;
    if (id) claimIds.add(String(id));
  });
  const plainText = raw.plainText || extractPlainText(raw.body || emptyDoc());
  return {
    ...raw,
    pageType: normalizePageType(raw.pageType || 'topic'),
    body: raw.body || emptyDoc(),
    createdFrom: raw.createdFrom || { type: 'wiki_index', objectIds: [], text: '', label: '' },
    plainText,
    sourceRefs,
    claims,
    citations,
    sourceCount: sourceIds.size,
    claimCount: claimIds.size,
    wordCount: countWords(plainText),
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
    candidateUpdates: Array.isArray(rawEvent.metadata?.candidateUpdates) ? rawEvent.metadata.candidateUpdates : [],
    reviewStatus: rawEvent.metadata?.ingestReviewStatus || '',
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

const connectionTargetForIngestCandidate = (candidate = {}) => {
  const targetType = String(candidate.targetType || candidate.target_type || '').trim().toLowerCase();
  const pageId = serializeId(candidate.pageId || candidate.page_id);
  const objectId = String(candidate.objectId || candidate.object_id || '').trim();
  if (targetType === 'wiki_page' && pageId) return { type: 'wiki_page', id: pageId };
  if (['concept', 'question', 'notebook'].includes(targetType) && objectId) return { type: targetType, id: objectId };
  return null;
};

const connectionSourceForIngestEvent = (event = {}) => {
  const sourceType = SOURCE_REF_TYPES.has(String(event.sourceType || '').trim())
    ? String(event.sourceType || '').trim()
    : 'external';
  const objectId = serializeId(event.sourceObjectId);
  const fallbackId = serializeId(event._id);
  if (objectId) return { type: sourceType, id: objectId };
  if (fallbackId) return { type: 'external', id: fallbackId };
  return null;
};

const persistIngestCandidateGraphTrace = async ({
  Connection,
  userId,
  event,
  candidate
} = {}) => {
  if (!Connection || !userId || !event || !candidate) return null;
  const source = connectionSourceForIngestEvent(event);
  const target = connectionTargetForIngestCandidate(candidate);
  if (!source || !target || (source.type === target.type && source.id === target.id)) return null;

  const relationType = 'supports';
  const reciprocalRelationType = INVERSE_CONNECTION_RELATION_TYPES[relationType] || 'supported_by';
  const scopeType = target.type === 'question' ? 'question' : '';
  const scopeId = target.type === 'question' ? target.id : '';
  const forward = {
    userId,
    fromType: source.type,
    fromId: source.id,
    toType: target.type,
    toId: target.id,
    relationType,
    scopeType,
    scopeId
  };
  const reciprocal = {
    userId,
    fromType: target.type,
    fromId: target.id,
    toType: source.type,
    toId: source.id,
    relationType: reciprocalRelationType,
    scopeType,
    scopeId
  };

  const save = async (row) => {
    if (typeof Connection.findOneAndUpdate === 'function') {
      return Connection.findOneAndUpdate(
        row,
        { $setOnInsert: row, $set: { updatedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    if (typeof Connection.create === 'function') {
      try {
        return await Connection.create(row);
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    return null;
  };

  const [forwardRow, reciprocalRow] = await Promise.all([save(forward), save(reciprocal)]);
  return {
    bidirectional: Boolean(forwardRow && reciprocalRow),
    relationType,
    reciprocalRelationType,
    source,
    target,
    forwardId: serializeId(forwardRow?._id),
    reciprocalId: serializeId(reciprocalRow?._id)
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

  const type = String(value.type || '').trim().toLowerCase();
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

const normalizeInitialSourceRefs = ({ initialSourceRef, initialSourceRefs, createdFrom }) => {
  const rawRefs = [];
  if (initialSourceRef !== undefined) rawRefs.push(initialSourceRef);
  if (initialSourceRefs !== undefined) {
    if (!Array.isArray(initialSourceRefs)) {
      return { error: 'initialSourceRefs must be an array.' };
    }
    rawRefs.push(...initialSourceRefs);
  }
  const sourceRefs = [];
  const seen = new Set();
  for (const rawRef of rawRefs.slice(0, 8)) {
    const sourceRef = normalizeSourceRef(rawRef);
    if (sourceRef?.error) return { error: sourceRef.error };
    const value = {
      ...sourceRef.value,
      objectId: sourceRef.value.objectId
        || (sourceRef.value.type === createdFrom.type ? createdFrom.objectId : null)
    };
    const key = [
      value.type,
      value.objectId || '',
      value.url || '',
      value.citationLabel || '',
      value.title || '',
      value.snippet || ''
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    sourceRefs.push(value);
  }
  return { value: sourceRefs };
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
  WikiLintRun = null,
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
  lintWiki = defaultLintWiki,
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
      action = method === 'POST' ? 'create_page' : 'list_pages';
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
      action = method === 'PATCH' ? 'update_page' : method === 'DELETE' ? 'archive_page' : 'get_page';
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

  const wikiAuth = [authenticateToken, auditExternalAgentAction];

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
        Question
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
    page.plainText = extractPlainText(applied.doc);
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

  router.get('/api/wiki/schema', wikiAuth, async (req, res) => {
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

  router.put('/api/wiki/schema', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/schema/revert', wikiAuth, async (req, res) => {
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

  router.get('/api/wiki/export.zip', wikiAuth, async (req, res) => {
    try {
      const [pages, schemaSettings, lintRuns] = await Promise.all([
        WikiPage.find({ userId: req.user.id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(1000).lean(),
        WikiSchemaSettings
          ? getWikiSchemaSettings({ WikiSchemaSettings, userId: req.user.id }).catch(() => null)
          : null,
        WikiLintRun
          ? WikiLintRun.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).lean()
          : []
      ]);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (error) => {
        if (!res.headersSent) res.status(500).json({ error: 'Failed to export wiki.' });
        else res.destroy(error);
      });
      res.status(200);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="wiki-export.zip"');
      archive.pipe(res);
      archive.append(renderWikiIndexMarkdown(pages), { name: 'index.md' });
      archive.append(renderWikiLogMarkdown({ pages, lintRuns }), { name: 'log.md' });
      archive.append(renderWikiSchemaMarkdown(schemaSettings), { name: 'schema.md' });
      const usedNames = new Map();
      pages.forEach((page) => {
        const base = sanitizeFilename(page.slug || page.title);
        const count = (usedNames.get(base) || 0) + 1;
        usedNames.set(base, count);
        const name = count === 1 ? `${base}.md` : `${base}-${count}.md`;
        archive.append(renderWikiPageMarkdown(page), { name });
      });
      await archive.finalize();
    } catch (error) {
      console.error('Error exporting wiki:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to export wiki.' });
    }
  });

  router.post('/api/wiki/lint', wikiAuth, async (req, res) => {
    try {
      const pageId = String(req.body?.pageId || '').trim();
      if (pageId && !mongoose.Types.ObjectId.isValid(pageId)) {
        return res.status(400).json({ error: 'Invalid wiki page id.' });
      }
      if (pageId) {
        const exists = await WikiPage.findOne({ _id: pageId, userId: req.user.id, status: { $ne: 'archived' } }).lean();
        if (!exists) return res.status(404).json({ error: 'Wiki page not found.' });
      }
      const result = await lintWiki({
        userId: req.user.id,
        scope: pageId ? 'page' : 'all',
        pageId,
        models: wikiModels(),
        findAutolinkSuggestions
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error linting wiki:', error);
      res.status(500).json({ error: 'Failed to lint wiki.' });
    }
  });

  router.post('/api/wiki/lint/stream', wikiAuth, async (req, res) => {
    try {
      const pageId = String(req.body?.pageId || '').trim();
      if (pageId && !mongoose.Types.ObjectId.isValid(pageId)) {
        return res.status(400).json({ error: 'Invalid wiki page id.' });
      }
      if (pageId) {
        const exists = await WikiPage.findOne({ _id: pageId, userId: req.user.id, status: { $ne: 'archived' } }).lean();
        if (!exists) return res.status(404).json({ error: 'Wiki page not found.' });
      }
      openWikiLintStream(res);
      const result = await lintWiki({
        userId: req.user.id,
        scope: pageId ? 'page' : 'all',
        pageId,
        models: wikiModels(),
        findAutolinkSuggestions,
        onProgress: event => writeSse(res, 'wiki-lint', event)
      });
      writeSse(res, 'wiki-lint', {
        stage: 'complete',
        summary: result.summary,
        run: result
      });
      writeSse(res, 'done', { ok: true, runId: result.runId });
      res.end();
    } catch (error) {
      console.error('Error streaming wiki lint:', error);
      if (!res.headersSent) return res.status(500).json({ error: 'Failed to lint wiki.' });
      writeSse(res, 'error', {
        error: 'Failed to lint wiki.',
        message: String(error.message || '')
      });
      res.end();
    }
  });

  router.get('/api/wiki/lint/:runId', wikiAuth, async (req, res) => {
    try {
      const run = await findLintRun(req);
      if (!run) return res.status(404).json({ error: 'Wiki lint run not found.' });
      res.status(200).json(serializeLintRun(run));
    } catch (error) {
      console.error('Error loading wiki lint run:', error);
      res.status(500).json({ error: 'Failed to load wiki lint run.' });
    }
  });

  router.post('/api/wiki/lint/:runId/findings/:findingId/:action', wikiAuth, async (req, res) => {
    try {
      const action = String(req.params.action || '').trim();
      if (!['accept', 'ignore', 'fix'].includes(action)) {
        return res.status(400).json({ error: 'Unsupported lint action.' });
      }
      const run = await findLintRun(req);
      if (!run) return res.status(404).json({ error: 'Wiki lint run not found.' });
      const finding = findLintFinding(run, req.params.findingId);
      if (!finding) return res.status(404).json({ error: 'Wiki lint finding not found.' });
      const result = await resolveLintFindingAction({ action, finding, userId: req.user.id });
      const status = action === 'ignore' ? 'ignored' : action === 'fix' ? 'fixed' : 'accepted';
      const updatedRun = await updateLintFinding({ run, finding, status, action, result });
      res.status(200).json({ run: updatedRun, findingId: finding.id, status, action, ...result });
    } catch (error) {
      console.error('Error resolving wiki lint finding:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to resolve wiki lint finding.' });
    }
  });

  router.get('/api/wiki/pages', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/pages', wikiAuth, async (req, res) => {
    try {
      const unsupportedMetadataFields = ['sourceRefs', 'claims', 'citations']
        .filter(field => req.body?.[field] !== undefined);
      if (unsupportedMetadataFields.length) {
        return res.status(400).json({
          error: `Unsupported wiki page metadata fields: ${unsupportedMetadataFields.join(', ')}. Use initialSourceRef when creating a page; source and claim ledgers are managed by wiki maintenance.`
        });
      }
      const pageType = validatePageType(req.body?.pageType);
      const sourceScope = validateEnumField('sourceScope', req.body?.sourceScope, SOURCE_SCOPES);
      if (pageType?.error) return res.status(400).json({ error: pageType.error });
      if (sourceScope?.error) return res.status(400).json({ error: sourceScope.error });

      const createdFrom = normalizeCreatedFrom(req.body?.createdFrom);
      const initialSourceRefs = normalizeInitialSourceRefs({
        initialSourceRef: req.body?.initialSourceRef,
        initialSourceRefs: req.body?.initialSourceRefs,
        createdFrom
      });
      if (initialSourceRefs?.error) return res.status(400).json({ error: initialSourceRefs.error });
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
        sourceRefs: initialSourceRefs.value
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

  router.get('/api/wiki/pages/:id', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req).lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      res.status(200).json(serializeWikiPage(page));
    } catch (_error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  router.get('/api/wiki/pages/:id/markdown', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req).lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const filename = `${sanitizeFilename(page.slug || page.title)}.md`;
      res.status(200);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(renderWikiPageMarkdown(page));
    } catch (_error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  router.patch('/api/wiki/pages/:id', wikiAuth, async (req, res) => {
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

  router.delete('/api/wiki/pages/:id', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/pages/:id/ai/draft', wikiAuth, async (req, res) => {
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

      // AT-288: the agent just (re)wrote this page's body. Convert concept
      // mentions of other pages into wikilinks (outbound) so the body reads
      // like a wiki, not a footnoted doc.
      await applyAutolinksForPage(page, req.user.id);

      await page.save();
      await syncPageGraph(page, req.user.id);
      // AT-288: link this page FROM existing pages that mention its title (inbound),
      // so a newly-authored concept becomes reachable across the wiki.
      await autolinkPagesToTarget({ targetPage: page, userId: req.user.id });
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

  router.post('/api/wiki/pages/:id/ai/draft/stream', wikiAuth, async (req, res) => {
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

      // AT-288: convert concept mentions in the freshly-maintained body into
      // outbound wikilinks before emitting 'drafted', so the streamed page the
      // reader sees already reads like a wiki.
      await applyAutolinksForPage(page, req.user.id);

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
      // AT-288: link this page FROM existing pages that mention its title (inbound).
      await autolinkPagesToTarget({ targetPage: page, userId: req.user.id });
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

  router.post('/api/wiki/pages/:id/sources', wikiAuth, async (req, res) => {
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

  router.delete('/api/wiki/pages/:id/sources/:sourceRefId', wikiAuth, async (req, res) => {
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
  router.post('/api/wiki/pages/:id/ask', wikiAuth, async (req, res) => {
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

  const answerDocText = (node) => {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(answerDocText).filter(Boolean).join(' ');
    if (typeof node !== 'object') return '';
    const own = typeof node.text === 'string' ? node.text : '';
    const child = Array.isArray(node.content) ? answerDocText(node.content) : '';
    return [own, child].filter(Boolean).join(' ').trim();
  };

  const streamAnswerText = async (res, text = '') => {
    const chunks = String(text || '')
      .split(/(\s+)/)
      .filter(Boolean);
    for (const chunk of chunks) {
      writeSse(res, 'wiki-ask-delta', { delta: chunk });
      // Yield between chunks so browser rendering sees a real stream instead
      // of one buffered terminal event.
      await new Promise(resolve => setTimeout(resolve, 8));
    }
  };

  router.post('/api/wiki/pages/:id/ask/stream', wikiAuth, async (req, res) => {
    openWikiAskStream(res);
    try {
      const question = String(req.body?.question || '').trim();
      if (!question) {
        writeSse(res, 'error', { error: 'Question is required.' });
        return res.end();
      }
      if (question.length > 1000) {
        writeSse(res, 'error', { error: 'Question is too long.' });
        return res.end();
      }

      const page = await findOwnedPage(req);
      if (!page) {
        writeSse(res, 'error', { error: 'Wiki page not found.' });
        return res.end();
      }

      writeSse(res, 'wiki-ask', {
        stage: 'thinking',
        summary: 'Reading page and source context.'
      });
      const result = await askWikiPage({
        page,
        question,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });
      const answerText = answerDocText(result.answer);
      await streamAnswerText(res, answerText);

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

      writeSse(res, 'wiki-ask', {
        stage: 'complete',
        page: serializeWikiPage(page)
      });
      writeSse(res, 'done', { ok: true, pageId: serializeId(page._id) });
      res.end();
    } catch (error) {
      console.error('Error streaming wiki page ask:', error);
      writeSse(res, 'error', {
        error: 'Failed to ask wiki page.',
        message: error?.message || ''
      });
      res.end();
    }
  });

  router.post('/api/wiki/pages/:id/discussions/:discussionId/promote', wikiAuth, async (req, res) => {
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

  router.delete('/api/wiki/pages/:id/discussions/:discussionId', wikiAuth, async (req, res) => {
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
  router.get('/api/wiki/briefing', wikiAuth, async (req, res) => {
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
  router.get('/api/wiki/pages/:id/backlinks', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/pages/:id/graph/rebuild', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/graph/rebuild', wikiAuth, async (req, res) => {
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

  router.get('/api/wiki/proposals', wikiAuth, async (req, res) => {
    try {
      const result = await refreshWikiProposals({ userId: req.user.id, force: false });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error listing wiki proposals:', error);
      res.status(500).json({ error: 'Failed to list wiki proposals.' });
    }
  });

  router.post('/api/wiki/proposals/generate-background', wikiAuth, async (req, res) => {
    try {
      const result = await refreshWikiProposals({ userId: req.user.id, force: Boolean(req.body?.force) });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error refreshing wiki proposals:', error);
      res.status(500).json({ error: 'Failed to refresh wiki proposals.' });
    }
  });

  router.post('/api/wiki/proposals/:proposalId/watch', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/proposals/:proposalId/dismiss', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/proposals/:proposalId/merge', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/proposals/:proposalId/accept', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/ingest', wikiAuth, async (req, res) => {
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

  router.get('/api/wiki/ingest/:runId', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/ingest/:runId/review', wikiAuth, async (req, res) => {
    try {
      if (!WikiSourceEvent) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      if (!mongoose.Types.ObjectId.isValid(String(req.params.runId || ''))) {
        return res.status(400).json({ error: 'Invalid ingest run id.' });
      }
      const action = String(req.body?.action || '').trim().toLowerCase();
      const allowed = new Set(['accept', 'defer', 'reject']);
      if (!allowed.has(action)) {
        return res.status(400).json({ error: 'action must be one of: accept, defer, reject.' });
      }
      const event = await WikiSourceEvent.findOne({ _id: req.params.runId, userId: req.user.id });
      if (!event) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      const metadata = event.metadata?.toObject ? event.metadata.toObject() : (event.metadata || {});
      const reviewedAt = new Date();
      const candidateIds = Array.isArray(req.body?.candidateIds)
        ? req.body.candidateIds.map(id => String(id || '').trim()).filter(Boolean)
        : [];
      const selectedCandidateIds = new Set(candidateIds);
      const existingCandidates = Array.isArray(metadata.candidateUpdates) ? metadata.candidateUpdates : [];
      const baseStatus = action === 'accept' ? 'accepted' : (action === 'reject' ? 'rejected' : 'deferred');
      const candidateUpdates = [];
      for (const candidate of existingCandidates) {
        const candidateId = String(candidate?.id || '').trim();
        const shouldReview = !selectedCandidateIds.size || selectedCandidateIds.has(candidateId);
        if (!shouldReview) {
          candidateUpdates.push(candidate);
          continue;
        }
        const graphTrace = action === 'accept'
          ? await persistIngestCandidateGraphTrace({
              Connection,
              userId: req.user.id,
              event,
              candidate
            })
          : null;
        candidateUpdates.push({
          ...candidate,
          status: baseStatus,
          reviewAction: action,
          reviewedAt,
          ...(graphTrace ? { graphTrace } : {})
        });
      }
      const selectedKnownCount = candidateIds.filter(id => (
        existingCandidates.some(candidate => String(candidate?.id || '').trim() === id)
      )).length;
      const isPartialReview = Boolean(existingCandidates.length && selectedCandidateIds.size && selectedKnownCount < existingCandidates.length);
      event.metadata = {
        ...metadata,
        ...(existingCandidates.length ? { candidateUpdates } : {}),
        ingestReviewStatus: isPartialReview ? `partially_${baseStatus}` : baseStatus,
        ingestReviewedAt: reviewedAt,
        ingestReviewNote: String(req.body?.note || '').trim().slice(0, 500)
      };
      await event.save();
      const run = await findMaintenanceRunBySourceEvent({ userId: req.user.id, sourceEventId: event._id });
      res.status(200).json(serializeIngestRun({ event, run }));
    } catch (error) {
      console.error('Error reviewing wiki ingest run:', error);
      res.status(500).json({ error: 'Failed to review wiki ingest run.' });
    }
  });

  router.post('/api/wiki/ingest/:runId/undo', wikiAuth, async (req, res) => {
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

  router.get('/api/wiki/activity', wikiAuth, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
      const sinceRaw = String(req.query.since || '').trim();
      const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
      if (sinceRaw && Number.isNaN(sinceDate.getTime())) {
        return res.status(400).json({ error: 'since must be a valid date or timestamp.' });
      }
      const [sourceEvents, maintenanceRuns, lintRuns, pages, externalAgentActions] = await Promise.all([
        WikiSourceEvent
          ? WikiSourceEvent.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiMaintenanceRun
          ? WikiMaintenanceRun.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiLintRun
          ? WikiLintRun.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiPage.find({ userId: req.user.id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(200).lean(),
        ConnectorActionLog?.find
          ? ConnectorActionLog.find({ userId: req.user.id, connector: 'wiki_mcp' }).sort({ createdAt: -1 }).limit(limit).lean()
          : []
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
        ...(Array.isArray(lintRuns) ? lintRuns : []).map(run => ({
          id: serializeId(run._id),
          type: 'lint',
          runId: serializeId(run._id),
          status: run.status || 'completed',
          pageId: serializeId(run.pageId),
          title: 'Wiki lint',
          summary: cleanWikiSummary(run.summary || ''),
          at: run.completedAt || run.createdAt
        })),
        ...(Array.isArray(externalAgentActions) ? externalAgentActions : []).map(action => ({
          id: serializeId(action._id),
          type: 'external_agent_action',
          status: action.status || '',
          pageId: action.targetType === 'wiki_page' ? serializeId(action.targetId) : null,
          runId: action.targetType === 'wiki_ingest_run' ? serializeId(action.targetId) : null,
          sourceEventId: action.targetType === 'wiki_source_event' ? serializeId(action.targetId) : null,
          title: `${action.agentTokenLabel || 'External agent'} · ${(action.action || 'wiki action').replace(/_/g, ' ')}`,
          summary: cleanWikiSummary(action.summary || action.errorMessage || ''),
          targetType: action.targetType || '',
          targetId: serializeId(action.targetId),
          at: action.createdAt
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
      ]).filter(event => {
        if (!sinceDate) return true;
        const eventDate = new Date(event.at);
        return !Number.isNaN(eventDate.getTime()) && eventDate.getTime() >= sinceDate.getTime();
      }).slice(0, limit);
      res.status(200).json({ events });
    } catch (error) {
      console.error('Error listing wiki activity:', error);
      res.status(500).json({ error: 'Failed to list wiki activity.' });
    }
  });

  router.post('/api/wiki/schema/suggestions', wikiAuth, async (req, res) => {
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

  router.get('/api/wiki/source-events', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/source-events/process-pending', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/source-events/:sourceEventId/process', wikiAuth, async (req, res) => {
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

  router.get('/api/wiki/pages/:id/revisions', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req).select('_id').lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      if (!WikiRevision) return res.status(200).json({ revisions: [] });
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
      const revisions = await WikiRevision.find({ userId: req.user.id, pageId: req.params.id }).sort({ createdAt: -1 }).limit(limit).lean();
      res.status(200).json({ revisions });
    } catch (error) {
      console.error('Error listing wiki revisions:', error);
      res.status(500).json({ error: 'Failed to list wiki revisions.' });
    }
  });

  router.post('/api/wiki/pages/:id/revisions/latest/restore', wikiAuth, async (req, res) => {
    try {
      if (!WikiRevision) return res.status(503).json({ error: 'Wiki revisions are not available.' });
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const revision = await WikiRevision.findOne({ userId: req.user.id, pageId: req.params.id })
        .sort({ createdAt: -1 });
      if (!revision?.before) return res.status(404).json({ error: 'No restorable wiki revision found.' });
      const beforeRestore = snapshotPage(page);
      restorePageSnapshot(page, revision.before);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before: beforeRestore,
        reason: 'external_agent_undo',
        actorType: 'user',
        summary: `Restored "${page.title}" from the latest captured revision.`
      });
      res.status(200).json({
        page: serializeWikiPage(page),
        restoredRevisionId: serializeId(revision._id)
      });
    } catch (error) {
      console.error('Error restoring latest wiki revision:', error);
      res.status(500).json({ error: 'Failed to restore wiki revision.' });
    }
  });

  router.get('/api/wiki/pages/:id/connector-actions', wikiAuth, async (req, res) => {
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

  router.get('/api/wiki/pages/:id/autolinks', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/pages/:id/autolinks/:targetPageId/apply', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/pages/:id/freshness/review', wikiAuth, async (req, res) => {
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

  router.post('/api/wiki/pages/:id/write-back/:connector', wikiAuth, async (req, res) => {
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
