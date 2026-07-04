const express = require('express');
const mongoose = require('mongoose');
const archiver = require('archiver');
const { maintainWikiPage: defaultMaintainWikiPage } = require('../services/wikiMaintenanceService');
const {
  buildSectionMaintenancePlan,
  deriveClaimsFromDoc
} = require('../services/wikiMaintenanceService');
const { askWikiPage: defaultAskWikiPage, loadWikiAskCorpus: defaultLoadWikiAskCorpus } = require('../services/wikiAskService');
const {
  DEFAULT_BRIEFING_CACHE_MAX_AGE_MS,
  buildWikiBriefing: defaultBuildWikiBriefing,
  loadCachedWikiBriefing,
  persistWikiBriefingCache
} = require('../services/wikiBriefingService');
const { findWikiBacklinks: defaultFindWikiBacklinks } = require('../services/wikiBacklinkService');
const {
  getWikiSchemaPromptContent,
  getWikiSchemaSettings,
  revertWikiSchemaSettings,
  saveWikiSchemaSettings
} = require('../services/wikiSchemaService');
const { createWikiRevision, snapshotPage } = require('../services/wikiRevisionService');
const { createWikiSourceEvent, listWikiSourceEvents } = require('../services/wikiSourceEventService');
const {
  armEdgarWatchForPage: defaultArmEdgarWatchForPage,
  checkEdgarWatchForPage: defaultCheckEdgarWatchForPage,
  normalizeForms: normalizeEdgarForms,
  normalizeTicker: normalizeEdgarTicker,
  padCik: padEdgarCik
} = require('../services/edgarWatcherService');
const {
  armTranscriptWatchForPage: defaultArmTranscriptWatchForPage,
  checkTranscriptWatchForPage: defaultCheckTranscriptWatchForPage,
  normalizeTicker: normalizeTranscriptTicker
} = require('../services/earningsTranscriptWatcherService');
const {
  armGitHubRepoWatchForPage: defaultArmGitHubRepoWatchForPage,
  checkGitHubRepoWatchForPage: defaultCheckGitHubRepoWatchForPage,
  parseGitHubRepo: parseGitHubRepoWatchInput
} = require('../services/githubRepoWatcherService');
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
const {
  classifyWikiPageQuality,
  isWikiPageSurfaceEligible
} = require('../services/wikiPageQualityGuard');
const {
  normalizeExistingWikiTitleForPresentation,
  normalizeWikiTitleForPresentation
} = require('../services/wikiPresentationGuard');
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

const paragraphNode = (content = []) => ({
  type: 'paragraph',
  content: content.map(item => {
    if (typeof item === 'string') return { type: 'text', text: item };
    return item;
  })
});

const wikiLinkText = ({ text, pageId, title }) => ({
  type: 'text',
  text,
  marks: [{ type: 'wikiLink', attrs: { pageId, title: title || text } }]
});

const slugify = (value = '') => {
  const base = String(value || 'untitled-wiki-page')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'untitled-wiki-page';
};

const starterOriginId = (packId, title) => `starter:${packId}:${slugify(title)}`;
const STARTER_PACK_REVIEWED_AT = '2026-07-04T00:00:00.000Z';

const buildStarterPage = ({ packId, title, pageType = 'overview', summary, links = [] }) => {
  const pageId = starterOriginId(packId, title);
  const linkedContent = [];
  links.forEach((link, index) => {
    if (index > 0) linkedContent.push(', ');
    linkedContent.push(wikiLinkText({
      text: link,
      title: link,
      pageId: starterOriginId(packId, link)
    }));
  });
  const body = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
      paragraphNode([summary]),
      ...(links.length ? [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Connections' }] },
        paragraphNode(['This starter page connects to ', ...linkedContent, '.'])
      ] : []),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Make it yours' }] },
      paragraphNode(['Sample — feed me your reading to make these pages yours.'])
    ]
  };
  return {
    _id: pageId,
    title,
    slug: slugify(title),
    pageType,
    status: 'published',
    visibility: 'shared',
    createdAt: STARTER_PACK_REVIEWED_AT,
    updatedAt: STARTER_PACK_REVIEWED_AT,
    lastReviewedAt: STARTER_PACK_REVIEWED_AT,
    plainText: [title, summary, ...links, 'Sample — feed me your reading to make these pages yours.'].filter(Boolean).join('\n'),
    body,
    sourceRefs: [{
      type: 'external',
      title: 'Noeis starter pack',
      snippet: `Starter scaffold for ${title}.`,
      citationLabel: '[1]'
    }]
  };
};

const STARTER_PACK_CONFIG = [
  {
    id: 'mental-models',
    name: 'Mental Models',
    tagline: 'The Munger latticework for better judgment.',
    description: 'Core models for tradeoffs, safety, incentives, and compounding.',
    hero: true,
    pages: [
      ['First Principles Thinking', 'Reason from constraints and irreducible facts before reaching for analogy.', ['Opportunity Cost', 'Inversion']],
      ['Opportunity Cost', 'Every choice spends the best alternative you did not take.', ['Margin of Safety', 'Circle of Competence']],
      ['Margin of Safety', 'Leave room for error when the world is uncertain and your model is incomplete.', ['Circle of Competence', 'Inversion']],
      ['Circle of Competence', 'Knowing the boundary of what you understand is itself an advantage.', ['Incentives', 'Margin of Safety']],
      ['Incentives', 'Behavior follows rewards, penalties, status, and friction more often than stated intent.', ['Opportunity Cost', 'Inversion']],
      ['Compound Interest', 'Small gains, repeated and protected from interruption, become nonlinear.', ['Margin of Safety', 'Incentives']],
      ['Inversion', 'Solve hard problems by asking what would guarantee failure and avoiding it.', ['First Principles Thinking', 'Margin of Safety']]
    ]
  },
  {
    id: 'behavioral-economics',
    name: 'Behavioral Economics & Decision-Making',
    tagline: 'Biases, base rates, and the psychology of judgment.',
    description: 'A tight decision-making cluster that shows claims, examples, and counterweights.',
    pages: [
      ['Loss Aversion', 'People often feel losses more sharply than equivalent gains.', ['Prospect Theory', 'Opportunity Cost']],
      ['Prospect Theory', 'Choices shift when outcomes are framed as gains or losses from a reference point.', ['Loss Aversion', 'Anchoring']],
      ['Anchoring', 'Initial numbers and frames pull later judgments toward themselves.', ['Base Rates', 'Availability Heuristic']],
      ['Availability Heuristic', 'Memorable examples can crowd out representative evidence.', ['Base Rates', 'Loss Aversion']],
      ['Base Rates', 'Prior probabilities protect decisions from vivid but unrepresentative stories.', ['Availability Heuristic', 'Anchoring']],
      ['Hyperbolic Discounting', 'Near-term rewards can dominate larger long-term payoffs.', ['Loss Aversion', 'Base Rates']]
    ]
  },
  {
    id: 'how-to-think-about-ai',
    name: 'How to Think About AI',
    tagline: 'A practical map for agents, evals, context, and capability.',
    description: 'A tech-curious starter graph for reasoning about modern AI systems.',
    pages: [
      ['Scaling Laws', 'Model capability often improves predictably with compute, data, and parameters.', ['Evals', 'Capability vs Alignment']],
      ['Agents', 'Agentic systems combine model reasoning with tools, memory, and delegated action.', ['Context Windows', 'Evals']],
      ['Context Windows', 'Context is the working set a model can use during one task, not durable memory.', ['Agents', 'Evals']],
      ['Evals', 'Evaluation turns vague capability claims into observable behavior under test.', ['Capability vs Alignment', 'Scaling Laws']],
      ['Capability vs Alignment', 'A system can become more capable without becoming more reliably directed at the desired goal.', ['Agents', 'Evals']]
    ]
  },
  {
    id: 'value-investing',
    name: 'Value Investing',
    tagline: 'Durable investing concepts for business-quality thinking.',
    description: 'Intrinsic value, moats, capital allocation, and owner-oriented judgment.',
    pages: [
      ['Intrinsic Value', 'Intrinsic value estimates the cash a business can produce for owners over time.', ['Owner Earnings', 'Margin of Safety']],
      ['Moats', 'A moat protects returns from competition, substitution, and time.', ['Capital Allocation', 'Intrinsic Value']],
      ['Mr. Market', 'Market prices can be useful servants and poor masters.', ['Margin of Safety', 'Intrinsic Value']],
      ['Capital Allocation', 'Managers create or destroy value by deciding where each dollar goes next.', ['Owner Earnings', 'Moats']],
      ['Owner Earnings', 'Owner earnings focus attention on cash that can truly accrue to owners.', ['Intrinsic Value', 'Capital Allocation']]
    ]
  }
];

const STARTER_PACKS = STARTER_PACK_CONFIG.map(pack => ({
  ...pack,
  pages: pack.pages.map(([title, summary, links]) => buildStarterPage({ packId: pack.id, title, summary, links }))
}));

const starterPackSummary = (pack) => ({
  id: pack.id,
  name: pack.name,
  tagline: pack.tagline,
  description: pack.description,
  hero: Boolean(pack.hero),
  pageCount: pack.pages.length,
  pages: pack.pages.map(page => ({
    id: page._id,
    title: page.title,
    slug: page.slug,
    pageType: page.pageType
  }))
});

const findStarterPack = (idOrSlug = '') => {
  const safe = String(idOrSlug || '').trim();
  if (!safe) return null;
  return STARTER_PACKS.find(pack => pack.id === safe || slugify(pack.name) === safe) || null;
};

const serializeStarterPackAsPublicCollection = (pack) => {
  if (!pack) return null;
  return serializePublicWikiCollection({
    collection: {
      _id: pack.id,
      name: pack.name,
      description: pack.description || pack.tagline || '',
      slug: pack.id,
      visibility: 'shared',
      sourceType: 'starter_pack',
      packId: pack.id
    },
    pages: pack.pages
  });
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

const normalizeTitle = (value = '') => normalizeWikiTitleForPresentation(value, { maxLength: 180 });

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
  const qualityReview = classifyWikiPageQuality({ ...raw, plainText });
  const presentationTitle = normalizeExistingWikiTitleForPresentation(raw.title || 'Untitled Wiki Page');
  return {
    ...raw,
    title: presentationTitle,
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
    qualityReview,
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

const serializePublicWikiPage = (page) => {
  const full = serializeWikiPage(page);
  if (!full) return full;
  if (full.qualityReview && full.qualityReview.surfaceEligible === false) return null;
  const publicSourceRefs = (Array.isArray(full.sourceRefs) ? full.sourceRefs : [])
    .map((source, index) => ({
      id: String(source?._id || source?.id || source?.sourceRefId || `source-${index}`),
      type: String(source?.type || source?.sourceType || 'source'),
      title: String(source?.title || source?.url || 'Source').trim(),
      url: String(source?.url || '').trim(),
      snippet: String(source?.snippet || source?.quote || source?.excerpt || '').trim()
    }))
    .filter((source) => source.title || source.url || source.snippet);

  return {
    _id: String(full._id || ''),
    title: full.title || 'Untitled wiki page',
    slug: full.slug || '',
    pageType: full.pageType || 'topic',
    status: full.status || 'draft',
    visibility: 'shared',
    body: full.body || emptyDoc(),
    plainText: full.plainText || '',
    createdAt: full.createdAt || null,
    updatedAt: full.updatedAt || null,
    lastReviewedAt: full.lastReviewedAt
      || full.freshness?.lastReviewedAt
      || full.aiState?.quality?.checkedAt
      || full.updatedAt
      || full.createdAt
      || null,
    sourceRefs: publicSourceRefs,
    sourceCount: full.sourceCount ?? publicSourceRefs.length,
    claimCount: full.claimCount ?? 0,
    wordCount: full.wordCount ?? countWords(full.plainText || '')
  };
};

const sanitizeSharedWikiSourceRefsForAdoption = (sourceRefs = []) => (
  (Array.isArray(sourceRefs) ? sourceRefs : [])
    .map((source, index) => ({
      type: 'external',
      title: String(source?.title || source?.url || `Shared reference ${index + 1}`).trim(),
      snippet: String(source?.snippet || source?.quote || source?.excerpt || '').trim(),
      url: String(source?.url || '').trim(),
      citationLabel: `[${index + 1}]`,
      addedBy: 'ai'
    }))
    .filter(source => source.title || source.url || source.snippet)
);

const buildAdoptableWikiPageSnapshot = (page) => {
  const publicPage = serializePublicWikiPage(page);
  if (!publicPage) return null;
  const body = clonePlain(publicPage.body || emptyDoc());
  const sourceRefs = sanitizeSharedWikiSourceRefsForAdoption(publicPage.sourceRefs || []);
  return {
    origin: {
      originPageId: publicPage._id || null,
      originSlug: publicPage.slug || '',
      originTitle: publicPage.title || 'Untitled wiki page'
    },
    page: {
      title: publicPage.title || 'Untitled wiki page',
      pageType: normalizePageType(publicPage.pageType || 'topic'),
      body,
      plainText: publicPage.plainText || extractPlainText(body),
      sourceRefs
    }
  };
};

const remapWikiLinkPageIdsInDoc = (node, pageIdMap = new Map()) => {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(child => remapWikiLinkPageIdsInDoc(child, pageIdMap));
  const next = { ...node };
  if (Array.isArray(next.marks)) {
    next.marks = next.marks.map((mark) => {
      if (mark?.type !== 'wikiLink') return mark;
      const rawPageId = String(mark.attrs?.pageId || '');
      const mappedPageId = pageIdMap.get(rawPageId);
      if (!mappedPageId) return mark;
      return {
        ...mark,
        attrs: {
          ...(mark.attrs || {}),
          pageId: mappedPageId
        }
      };
    });
  }
  if (Array.isArray(next.content)) {
    next.content = next.content.map(child => remapWikiLinkPageIdsInDoc(child, pageIdMap));
  }
  return next;
};

const serializePublicWikiCollection = ({ collection, pages = [] } = {}) => {
  if (!collection) return null;
  const raw = typeof collection.toObject === 'function'
    ? collection.toObject({ virtuals: false })
    : { ...collection };
  return {
    _id: serializeId(raw._id),
    name: raw.name || 'Shared wiki',
    description: raw.description || '',
    slug: raw.slug || '',
    visibility: raw.visibility || 'shared',
    sourceType: raw.sourceType || 'user',
    packId: raw.packId || '',
    pageCount: pages.filter(isWikiPageSurfaceEligible).length,
    pages: pages.map(serializePublicWikiPage).filter(Boolean)
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
  WikiBriefingCache = null,
  WikiSharedCollection = null,
  WikiSchemaSettings = null,
  Connection = null,
  ConnectorActionLog = null,
  IntegrationConnection = null,
  ImportSession = null,
  NoeisReceipt = null,
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
  loadWikiAskCorpus = defaultLoadWikiAskCorpus,
  buildWikiBriefing = defaultBuildWikiBriefing,
  armEdgarWatchForPage = defaultArmEdgarWatchForPage,
  checkEdgarWatchForPage = defaultCheckEdgarWatchForPage,
  armTranscriptWatchForPage = defaultArmTranscriptWatchForPage,
  checkTranscriptWatchForPage = defaultCheckTranscriptWatchForPage,
  armGitHubRepoWatchForPage = defaultArmGitHubRepoWatchForPage,
  checkGitHubRepoWatchForPage = defaultCheckGitHubRepoWatchForPage,
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
    packId = '',
    sample = false
  } = {}) => {
    const validSnapshots = snapshots.filter(snapshot => snapshot?.page);
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
          originPageId: mongoose.Types.ObjectId.isValid(snapshot.origin.originPageId)
            ? snapshot.origin.originPageId
            : null,
          originCollectionId,
          originSlug: snapshot.origin.originSlug || '',
          originTitle: snapshot.origin.originTitle || snapshot.page.title,
          packId,
          sample,
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
      entry.page.plainText = extractPlainText(entry.page.body);
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
      pageIdMap
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
      packId: pack.id,
      sample: true
    });
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

  const savePageWithVersionRetry = async (page, userId) => {
    try {
      await page.save();
      return page;
    } catch (error) {
      const versionConflict = error?.name === 'VersionError'
        || /No matching document found/i.test(String(error?.message || ''));
      if (!versionConflict) throw error;
      const snapshot = snapshotPage(page);
      const freshPage = await WikiPage.findOne({ _id: page._id, userId });
      if (!freshPage) throw error;
      restorePageSnapshot(freshPage, snapshot);
      await freshPage.save();
      return freshPage;
    }
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
    page.plainText = extractPlainText(nextBody);
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
      _id: { $ne: targetPage._id }
    };
    const candidates = await WikiPage.find(query).sort({ updatedAt: -1 }).limit(Math.max(1, Math.min(Number(candidateLimit) || 600, 600)));
    const updatedPages = [];
    const processCandidate = async (page) => {
      const before = snapshotPage(page);
      const result = applyWikiAutolinkToDoc({ doc: page.body || emptyDoc(), targetPage });
      if (!result.applied) return null;
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
      return page;
    };
    const queue = Array.isArray(candidates) ? [...candidates] : [];
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
      inlineAutolinkLimit: positiveNumberOption(body.inlineAutolinkLimit) || (fastProfile ? 150 : 600),
      skipQualityRebuild: body.skipQualityRebuild === true || (fastProfile && body.skipQualityRebuild !== false),
      streamDraft: body.streamDraft === true || (fastProfile && body.streamDraft !== false),
      deferInboundAutolinks: body.deferInboundAutolinks === true || (fastProfile && body.deferInboundAutolinks !== false)
    };
  };

  const scheduleInboundAutolinks = ({ targetPage, userId, sourcePageId = null } = {}) => {
    const targetSnapshot = clonePlain(targetPage?.toObject ? targetPage.toObject() : targetPage);
    setImmediate(async () => {
      try {
        await autolinkPagesToTarget({
          targetPage: targetSnapshot,
          userId,
          sourcePageId,
          candidateLimit: 600,
          concurrency: 10
        });
      } catch (error) {
        console.error('Deferred wiki inbound autolink failed:', error);
      }
    });
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
      const qualityFilter = String(req.query.quality || '').trim().toLowerCase();
      if (qualityFilter && !['ok', 'needs_review', 'blocked'].includes(qualityFilter)) {
        return res.status(400).json({ error: 'quality must be one of: ok, needs_review, blocked.' });
      }
      const includeLowQuality = ['1', 'true', 'yes'].includes(String(req.query.includeLowQuality || '').toLowerCase());
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
      const scanLimit = (qualityFilter || includeLowQuality)
        ? limit
        : Math.min(1000, Math.max(limit * 3, limit));
      const pages = await WikiPage.find(query).sort({ updatedAt: -1 }).limit(scanLimit).lean();
      const serialized = pages.map(serializeWikiPage).filter((page) => {
        const review = page.qualityReview || classifyWikiPageQuality(page);
        if (qualityFilter === 'ok') return review.status === 'ok';
        if (qualityFilter === 'needs_review') return review.status === 'needs_review';
        if (qualityFilter === 'blocked') return review.surfaceEligible === false;
        if (includeLowQuality) return true;
        return review.surfaceEligible !== false;
      }).slice(0, limit);
      res.status(200).json(serialized);
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
      trackWikiEvent(req, EVENT_NAMES.WIKI_PAGE_CREATED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
        sourceScope: page.sourceScope
      });
      if (Array.isArray(page.sourceRefs) && page.sourceRefs.length > 0) {
        trackWikiEvent(req, EVENT_NAMES.WIKI_SOURCE_ATTACHED, {
          pageId: serializeId(page._id),
          title: page.title,
          pageType: page.pageType,
          sourceCount: page.sourceRefs.length,
          sourceType: page.sourceRefs[0]?.type || ''
        });
      }
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

  router.post('/api/wiki/pages/:id/edgar-watch', wikiAuth, async (req, res) => {
    try {
      const ticker = normalizeEdgarTicker(req.body?.ticker);
      const cik = padEdgarCik(req.body?.cik);
      if (!ticker && !cik) return res.status(400).json({ error: 'ticker or cik is required.' });
      const result = await armEdgarWatchForPage({
        WikiPage,
        WikiSourceEvent,
        userId: req.user.id,
        pageId: req.params.id,
        ticker,
        cik,
        companyName: req.body?.companyName,
        forms: normalizeEdgarForms(req.body?.forms),
        checkNow: req.body?.checkNow !== false
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        filings: Array.isArray(result.filings) ? result.filings : [],
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            url: event.url,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to arm EDGAR watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/edgar-watch/check', wikiAuth, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id, status: { $ne: 'archived' } });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await checkEdgarWatchForPage({
        WikiSourceEvent,
        page,
        limit: req.body?.limit
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        filings: Array.isArray(result.filings) ? result.filings : [],
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            url: event.url,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to check EDGAR watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/transcript-watch', wikiAuth, async (req, res) => {
    try {
      const ticker = normalizeTranscriptTicker(req.body?.ticker);
      if (!ticker) return res.status(400).json({ error: 'ticker is required.' });
      const result = await armTranscriptWatchForPage({
        WikiPage,
        WikiSourceEvent,
        userId: req.user.id,
        pageId: req.params.id,
        ticker,
        checkNow: req.body?.checkNow !== false
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        transcript: result.transcript || null,
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to arm transcript watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/transcript-watch/check', wikiAuth, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id, status: { $ne: 'archived' } });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await checkTranscriptWatchForPage({
        WikiSourceEvent,
        page
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        transcript: result.transcript || null,
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to check transcript watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/github-repo-watch', wikiAuth, async (req, res) => {
    try {
      const repoInput = String(req.body?.repo || req.body?.repoUrl || '').trim();
      const owner = String(req.body?.owner || '').trim();
      const repoName = String(req.body?.repoName || '').trim();
      if (!repoInput && (!owner || !repoName)) return res.status(400).json({ error: 'repo or owner/repoName is required.' });
      if (repoInput) parseGitHubRepoWatchInput(repoInput);
      const result = await armGitHubRepoWatchForPage({
        WikiPage,
        WikiSourceEvent,
        userId: req.user.id,
        pageId: req.params.id,
        repo: repoInput,
        owner,
        repoName,
        checkNow: req.body?.checkNow !== false
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        snapshot: result.snapshot ? {
          fullName: result.snapshot.fullName,
          description: result.snapshot.description,
          defaultBranch: result.snapshot.defaultBranch,
          headSha: result.snapshot.headSha,
          docCount: Array.isArray(result.snapshot.docs) ? result.snapshot.docs.length : 0,
          latestRelease: result.snapshot.latestRelease || null
        } : null,
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            url: event.url,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to arm GitHub repo watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/github-repo-watch/check', wikiAuth, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id, status: { $ne: 'archived' } });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await checkGitHubRepoWatchForPage({
        WikiSourceEvent,
        page
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        snapshot: result.snapshot ? {
          fullName: result.snapshot.fullName,
          description: result.snapshot.description,
          defaultBranch: result.snapshot.defaultBranch,
          headSha: result.snapshot.headSha,
          docCount: Array.isArray(result.snapshot.docs) ? result.snapshot.docs.length : 0,
          latestRelease: result.snapshot.latestRelease || null
        } : null,
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            url: event.url,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to check GitHub repo watch.' });
    }
  });

  router.get('/api/public/wiki/pages/:idOrSlug', async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      if (!idOrSlug) return res.status(400).json({ error: 'Wiki page id or slug is required.' });
      const query = {
        visibility: 'shared',
        status: { $ne: 'archived' }
      };
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
        query._id = idOrSlug;
      } else {
        query.slug = idOrSlug;
      }
      const page = await WikiPage.findOne(query).lean();
      if (!page) return res.status(404).json({ error: 'Shared wiki page not found.' });
      const publicPage = serializePublicWikiPage(page);
      if (!publicPage) return res.status(404).json({ error: 'Shared wiki page not found.' });
      res.status(200).json({
        page: publicPage,
        sharedAt: page.updatedAt || page.createdAt || null
      });
    } catch (error) {
      console.error('Error fetching public wiki page:', error);
      res.status(500).json({ error: 'Failed to fetch shared wiki page.' });
    }
  });

  router.post('/api/public/wiki/pages/:idOrSlug/adopt', wikiAuth, async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      if (!idOrSlug) return res.status(400).json({ error: 'Wiki page id or slug is required.' });
      const query = {
        visibility: 'shared',
        status: { $ne: 'archived' }
      };
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
        query._id = idOrSlug;
      } else {
        query.slug = idOrSlug;
      }
      const originPage = await WikiPage.findOne(query).lean();
      if (!originPage) return res.status(404).json({ error: 'Shared wiki page not found.' });

      const adoptable = buildAdoptableWikiPageSnapshot(originPage);
      if (!adoptable?.page) return res.status(422).json({ error: 'Shared wiki page could not be adopted.' });
      const result = await createAdoptedWikiPages({
        userId: req.user.id,
        snapshots: [adoptable],
        originType: 'page'
      });
      const adopted = result.pages[0] || {};
      const page = adopted.page;
      trackWikiEvent(req, EVENT_NAMES.WIKI_SHARED_ADOPTED, {
        originType: 'page',
        originPageId: serializeId(originPage._id),
        originSlug: originPage.slug || '',
        originTitle: originPage.title || '',
        adoptedPageId: serializeId(page?._id),
        pageCount: 1,
        mergeAvailable: Boolean(adopted.mergeAvailable)
      });
      res.status(201).json({
        page: serializeWikiPage(page),
        adoptedFrom: page.adoptedFrom || {},
        mergeAvailable: Boolean(adopted.mergeAvailable)
      });
    } catch (error) {
      console.error('Error adopting shared wiki page:', error);
      res.status(500).json({ error: 'Failed to adopt shared wiki page.' });
    }
  });

  router.get('/api/public/wiki/starter-packs', async (_req, res) => {
    res.status(200).json({
      packs: STARTER_PACKS.map(starterPackSummary)
    });
  });

  router.get('/api/public/wiki/starter-packs/:packId', async (req, res) => {
    const pack = STARTER_PACKS.find(candidate => candidate.id === String(req.params.packId || '').trim());
    if (!pack) return res.status(404).json({ error: 'Starter pack not found.' });
    res.status(200).json({
      pack: {
        ...starterPackSummary(pack),
        pages: pack.pages.map(serializePublicWikiPage)
      }
    });
  });

  router.post('/api/public/wiki/starter-packs/:packId/adopt', wikiAuth, async (req, res) => {
    try {
      const pack = findStarterPack(req.params.packId);
      if (!pack) return res.status(404).json({ error: 'Starter pack not found.' });
      const result = await adoptStarterPackForUser({ pack, userId: req.user.id });
      trackWikiEvent(req, EVENT_NAMES.WIKI_SHARED_ADOPTED, {
        originType: 'starter_pack',
        packId: pack.id,
        originSlug: pack.id,
        originTitle: pack.name,
        pageCount: result.pages.length,
        mergeAvailable: result.pages.some(entry => entry.mergeAvailable)
      });
      res.status(201).json({
        pack: starterPackSummary(pack),
        pages: result.pages.map(entry => serializeWikiPage(entry.page)),
        mergeAvailable: result.pages.some(entry => entry.mergeAvailable)
      });
    } catch (error) {
      console.error('Error adopting starter pack:', error);
      res.status(500).json({ error: 'Failed to adopt starter pack.' });
    }
  });

  router.post('/api/wiki/collections', wikiAuth, async (req, res) => {
    try {
      if (!WikiSharedCollection) return res.status(501).json({ error: 'Wiki collections are not configured.' });
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Collection name is required.' });
      const pageIds = Array.isArray(req.body?.pageIds)
        ? req.body.pageIds.map(id => String(id || '').trim()).filter(Boolean)
        : [];
      if (!pageIds.length) return res.status(400).json({ error: 'At least one page is required.' });
      const pages = await WikiPage.find({
        _id: { $in: pageIds },
        userId: req.user.id,
        status: { $ne: 'archived' }
      }).select('_id').lean();
      const allowedIds = new Set((Array.isArray(pages) ? pages : []).map(page => String(page._id)));
      const sanitizedPageIds = pageIds.filter(id => allowedIds.has(String(id)));
      if (!sanitizedPageIds.length) return res.status(404).json({ error: 'No owned wiki pages found for this collection.' });
      const visibility = req.body?.visibility === 'private' ? 'private' : 'shared';
      const slug = await buildUniqueCollectionSlug(req.body?.slug || name);
      const collection = new WikiSharedCollection({
        userId: req.user.id,
        name,
        description: String(req.body?.description || '').trim(),
        slug,
        pageIds: sanitizedPageIds,
        visibility,
        sourceType: 'user'
      });
      await collection.save();
      res.status(201).json({ collection: serializePublicWikiCollection({ collection, pages: [] }) });
    } catch (error) {
      console.error('Error creating wiki collection:', error);
      if (error.code === 11000) return res.status(409).json({ error: 'Collection slug already exists.' });
      res.status(500).json({ error: 'Failed to create wiki collection.' });
    }
  });

  router.get('/api/public/wiki/collections/:idOrSlug', async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      const starterPack = findStarterPack(idOrSlug);
      if (starterPack) {
        return res.status(200).json({
          collection: serializeStarterPackAsPublicCollection(starterPack)
        });
      }
      if (!WikiSharedCollection) return res.status(404).json({ error: 'Shared wiki collection not found.' });
      const query = { visibility: 'shared' };
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) query._id = idOrSlug;
      else query.slug = idOrSlug;
      const collection = await WikiSharedCollection.findOne(query).lean();
      if (!collection) return res.status(404).json({ error: 'Shared wiki collection not found.' });
      const pages = await WikiPage.find({
        _id: { $in: collection.pageIds || [] },
        visibility: 'shared',
        status: { $ne: 'archived' }
      }).sort({ updatedAt: -1 }).lean();
      res.status(200).json({
        collection: serializePublicWikiCollection({ collection, pages })
      });
    } catch (error) {
      console.error('Error reading public wiki collection:', error);
      res.status(500).json({ error: 'Failed to read shared wiki collection.' });
    }
  });

  router.post('/api/public/wiki/collections/:idOrSlug/adopt', wikiAuth, async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      const starterPack = findStarterPack(idOrSlug);
      if (starterPack) {
        const result = await adoptStarterPackForUser({ pack: starterPack, userId: req.user.id });
        trackWikiEvent(req, EVENT_NAMES.WIKI_SHARED_ADOPTED, {
          originType: 'starter_pack',
          packId: starterPack.id,
          originSlug: starterPack.id,
          originTitle: starterPack.name,
          surface: 'collection_route',
          pageCount: result.pages.length,
          mergeAvailable: result.pages.some(entry => entry.mergeAvailable)
        });
        return res.status(201).json({
          collection: {
            _id: starterPack.id,
            name: starterPack.name,
            slug: starterPack.id,
            sourceType: 'starter_pack',
            packId: starterPack.id,
            pageCount: result.pages.length
          },
          pages: result.pages.map(entry => serializeWikiPage(entry.page)),
          mergeAvailable: result.pages.some(entry => entry.mergeAvailable)
        });
      }
      if (!WikiSharedCollection) return res.status(404).json({ error: 'Shared wiki collection not found.' });
      const query = { visibility: 'shared' };
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) query._id = idOrSlug;
      else query.slug = idOrSlug;
      const collection = await WikiSharedCollection.findOne(query).lean();
      if (!collection) return res.status(404).json({ error: 'Shared wiki collection not found.' });
      const pages = await WikiPage.find({
        _id: { $in: collection.pageIds || [] },
        visibility: 'shared',
        status: { $ne: 'archived' }
      }).sort({ updatedAt: -1 }).lean();
      const snapshots = (Array.isArray(pages) ? pages : []).map(buildAdoptableWikiPageSnapshot).filter(Boolean);
      if (!snapshots.length) return res.status(422).json({ error: 'Shared wiki collection has no adoptable pages.' });
      const result = await createAdoptedWikiPages({
        userId: req.user.id,
        snapshots,
        originType: 'collection',
        originCollectionId: serializeId(collection._id) || collection.slug || '',
        originCollectionTitle: collection.name || 'Shared wiki'
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_SHARED_ADOPTED, {
        originType: 'collection',
        originCollectionId: serializeId(collection._id),
        originSlug: collection.slug || '',
        originTitle: collection.name || '',
        pageCount: result.pages.length,
        mergeAvailable: result.pages.some(entry => entry.mergeAvailable)
      });
      res.status(201).json({
        collection: {
          _id: serializeId(collection._id),
          name: collection.name,
          slug: collection.slug,
          pageCount: result.pages.length
        },
        pages: result.pages.map(entry => serializeWikiPage(entry.page)),
        mergeAvailable: result.pages.some(entry => entry.mergeAvailable)
      });
    } catch (error) {
      console.error('Error adopting shared wiki collection:', error);
      res.status(500).json({ error: 'Failed to adopt shared wiki collection.' });
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
      if (enumChecks[2]?.value === 'shared' && !isWikiPageSurfaceEligible(page)) {
        return res.status(422).json({
          error: 'Fix or archive this page before sharing it publicly.'
        });
      }
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
      trackWikiEvent(req, EVENT_NAMES.WIKI_DRAFT_GENERATED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
        claimCount: Array.isArray(page.claims) ? page.claims.length : 0
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
      const maintenanceOptions = readMaintenanceRequestOptions(req.body || {});
      openWikiDraftStream(res);

      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        draftStatus: 'maintaining',
        draftRequestedAt: new Date(),
        draftStartedAt: new Date(),
        lastError: '',
        errorCode: ''
      };
      page = await savePageWithVersionRetry(page, req.user.id);
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
        maintenanceProfile: maintenanceOptions.maintenanceProfile,
        sourceLimit: maintenanceOptions.sourceLimit,
        sourceTextLimit: maintenanceOptions.sourceTextLimit,
        skipQualityRebuild: maintenanceOptions.skipQualityRebuild,
        streamDraft: maintenanceOptions.streamDraft,
        onProgress: (event) => {
          writeSse(res, 'wiki-draft', event);
        }
      });

      // AT-288: convert concept mentions in the freshly-maintained body into
      // outbound wikilinks before emitting 'drafted', so the streamed page the
      // reader sees already reads like a wiki.
      await applyAutolinksForPage(page, req.user.id, { limit: maintenanceOptions.inlineAutolinkLimit });

      writeSse(res, 'wiki-page', {
        stage: 'drafted',
        summary: page.aiState?.maintenanceSummary || 'Wiki draft generated.',
        page: serializeWikiPage(page)
      });

      page = await savePageWithVersionRetry(page, req.user.id);
      writeSse(res, 'wiki-page', {
        stage: 'saved',
        summary: 'Wiki page saved.',
        page: serializeWikiPage(page)
      });

      await syncPageGraph(page, req.user.id);
      if (maintenanceOptions.deferInboundAutolinks) {
        scheduleInboundAutolinks({ targetPage: page, userId: req.user.id, sourcePageId: page._id });
        writeSse(res, 'wiki-draft', {
          stage: 'inbound_links_deferred',
          summary: 'Backlinks will settle in the background while you start reading.'
        });
      } else {
        // AT-288: link this page FROM existing pages that mention its title (inbound).
        await autolinkPagesToTarget({ targetPage: page, userId: req.user.id });
        writeSse(res, 'wiki-draft', {
          stage: 'graph_synced',
          summary: 'Wiki graph connections synced.'
        });
      }

      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'agent_maintenance',
        actorType: 'agent',
        summary: page.aiState?.maintenanceSummary || `Maintained "${page.title}".`
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_DRAFT_GENERATED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
        claimCount: Array.isArray(page.claims) ? page.claims.length : 0,
        stream: true
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
      trackWikiEvent(req, EVENT_NAMES.WIKI_SOURCE_ATTACHED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
        sourceType: sourceRef.value?.type || ''
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
      const corpus = await loadWikiAskCorpus({
        page,
        question,
        userId: req.user.id,
        WikiPage,
        WikiRevision,
        TagMeta,
        findWikiBacklinks
      });

      const result = await askWikiPage({
        page,
        question,
        relatedPages: corpus.relatedPages,
        conceptRecords: corpus.conceptRecords,
        backlinkRows: corpus.backlinkRows,
        revisionRows: corpus.revisionRows,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });

      page.discussions.push({
        question,
        answer: result.answer,
        citationIndexesUsed: result.citationIndexesUsed || [],
        provenance: result.provenance || {},
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
      const corpus = await loadWikiAskCorpus({
        page,
        question,
        userId: req.user.id,
        WikiPage,
        WikiRevision,
        TagMeta,
        findWikiBacklinks
      });

      writeSse(res, 'wiki-ask', {
        stage: 'thinking',
        summary: 'Reading selected page, related wiki pages, highlights, concepts, and backlinks.'
      });
      const result = await askWikiPage({
        page,
        question,
        relatedPages: corpus.relatedPages,
        conceptRecords: corpus.conceptRecords,
        backlinkRows: corpus.backlinkRows,
        revisionRows: corpus.revisionRows,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });
      const answerText = answerDocText(result.answer);
      await streamAnswerText(res, answerText);

      page.discussions.push({
        question,
        answer: result.answer,
        citationIndexesUsed: result.citationIndexesUsed || [],
        provenance: result.provenance || {},
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

  // Daily wiki briefing for the index page. A fresh read model is served first
  // so warm opens do not re-run the full page/library scan.
  router.get('/api/wiki/briefing', wikiAuth, async (req, res) => {
    try {
      const now = Date.now();
      const maxAgeMs = Math.max(
        60 * 1000,
        Number(process.env.WIKI_BRIEFING_CACHE_MAX_AGE_MS || DEFAULT_BRIEFING_CACHE_MAX_AGE_MS)
      );
      const cachedBriefing = await loadCachedWikiBriefing({
        userId: req.user.id,
        WikiBriefingCache,
        now,
        maxAgeMs
      });
      if (cachedBriefing) {
        res.setHeader('X-Noeis-Briefing-Cache', 'HIT');
        return res.status(200).json(cachedBriefing);
      }
      const briefing = await buildWikiBriefing({
        userId: req.user.id,
        models: {
          WikiPage,
          Article,
          NotebookEntry,
          TagMeta,
          Question,
          ImportSession,
          NoeisReceipt,
          WikiRevision,
          WikiMaintenanceRun,
          WikiSourceEvent,
          Connection
        }
      });
      await persistWikiBriefingCache({
        userId: req.user.id,
        WikiBriefingCache,
        briefing,
        now,
        maxAgeMs
      });
      res.setHeader('X-Noeis-Briefing-Cache', 'MISS');
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

      res.status(202).json(serializeIngestRun({ event }));

      const sourceEventId = event._id;
      const userId = req.user.id;
      const sourceType = source.rawType;
      const requestForAnalytics = req;
      setImmediate(async () => {
        try {
          const result = await processWikiSourceEvent({
            sourceEventId,
            userId,
            models: wikiModels(),
            buildUniqueSlug,
            wikiSchemaContent: await loadWikiSchemaContent(userId)
          });
          const affectedPageCount = Array.isArray((result.event || event).affectedPageIds)
            ? (result.event || event).affectedPageIds.length
            : 0;
          trackWikiEvent(requestForAnalytics, affectedPageCount > 0 ? EVENT_NAMES.WIKI_INGEST_COMPLETED : EVENT_NAMES.WIKI_INGEST_NO_MATCH, {
            sourceEventId: serializeId((result.event || event)._id),
            sourceType,
            affectedPageCount,
            status: (result.event || event).status || '',
            suggestedCreatePage: Boolean((result.event || event).metadata?.ignoredReason === 'no_matching_wiki_page')
          });
        } catch (error) {
          console.error('Error processing queued wiki ingest source:', error);
        }
      });
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
