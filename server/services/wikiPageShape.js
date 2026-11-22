// A wiki page's shape: the words it may use, its body and citations, and how it is serialized for its owner, for the public and for adoption.
const { WIKI_PAGE_TYPES, normalizePageType } = require('./wikiPageStructureService');
const { docText } = require('../lib/editorialText');
const { normalizeWikiTitleForPresentation, canonicalWikiTitle } = require('./wikiPresentationGuard');
const mongoose = require('mongoose');
const { classifyWikiPageQuality, isWikiPageSurfaceEligible } = require('./wikiPageQualityGuard');
const { applyBornAtToClaims } = require('./claimBornAt');
const { isResearchOperatingLedgerPage, isHumanOnlyWikiArtifact } = require('./wikiProtectedArtifactService');
const { buildPublicMaintenanceProof } = require('./publicProofService');

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

const INGEST_TEXT_LIMIT = 8000;

const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });

/* Prose arrives as a TipTap doc from the editor and as a plain string from
   every agent that ever wrote a page. Both are the same intent, so both land
   here: the string keeps its paragraph breaks, because a page written in
   paragraphs and stored as one block has lost something with no error to say
   so. Anything else returns null and lets the caller decide. */
const normalizeBodyDoc = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const paragraphs = value
    .split(/\n\s*\n/)
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!paragraphs.length) return null;
  return {
    type: 'doc',
    content: paragraphs.map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
  };
};

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

const buildUniqueWikiSlugBuilder = ({ WikiPage } = {}) => async (
  userId,
  title,
  existingId = null,
  { session = null } = {}
) => {
  const base = slugify(title);
  for (let i = 0; i < 25; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const query = { userId, slug };
    if (existingId) query._id = { $ne: existingId };
    let existingQuery = WikiPage.findOne(query).select('_id');
    if (session && typeof existingQuery.session === 'function') existingQuery = existingQuery.session(session);
    const existing = await existingQuery.lean();
    if (!existing) return slug;
  }
  return `${base}-${Date.now()}`;
};

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    const text = docText(node);
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
  const text = docText(node).toLowerCase().replace(/\s+/g, ' ');
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
    const text = docText(node).trim();
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

// Lists need one stable presentation flag, not knowledge of every specialized
// page contract. Derive it at the API boundary from authoritative fields so
// old repository and dossier pages group correctly without a data migration.
const serializeWikiKind = (page = {}) => {
  const github = page?.externalWatches?.githubRepo || {};
  const repository = String(page?.pageType || '').toLowerCase() === 'repo'
    || Boolean(String(page?.repoKey || '').trim())
    || ['owner', 'repo', 'lastHeadSha', 'publishedHeadSha']
      .some(field => Boolean(String(github?.[field] || '').trim()));
  if (repository) return 'repository';
  if (page?.investmentDossier?.version) return 'investment';
  return 'general';
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
  const plainText = raw.plainText || docText(raw.body || emptyDoc());
  const qualityReview = classifyWikiPageQuality({ ...raw, plainText });
  const presentationTitle = canonicalWikiTitle(raw);
  return {
    ...raw,
    evergreen: Boolean(raw.evergreen),
    evergreenAt: raw.evergreenAt || null,
    wikiKind: serializeWikiKind(raw),
    title: presentationTitle,
    pageType: normalizePageType(raw.pageType || 'topic'),
    body: raw.body || emptyDoc(),
    createdFrom: raw.createdFrom || { type: 'wiki_index', objectIds: [], text: '', label: '' },
    plainText,
    sourceRefs,
    claims: applyBornAtToClaims(claims, { pageCreatedAt: raw.createdAt }),
    citations,
    sourceCount: sourceIds.size,
    claimCount: claimIds.size,
    wordCount: countWords(plainText),
    bodyWordCount: countWords(docText(raw.body || emptyDoc())),
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
      candidateStatus: raw.aiState?.candidateStatus || 'idle',
      firstHeadCandidateRevisionId: raw.aiState?.firstHeadCandidateRevisionId || '',
      firstHeadCandidateAt: raw.aiState?.firstHeadCandidateAt || null,
      firstHeadCandidateSummary: raw.aiState?.firstHeadCandidateSummary || null,
      firstHeadAcceptedAt: raw.aiState?.firstHeadAcceptedAt || null,
      maintenanceCandidateRevisionId: raw.aiState?.maintenanceCandidateRevisionId || '',
      maintenanceCandidateAt: raw.aiState?.maintenanceCandidateAt || null,
      maintenanceCandidateSummary: raw.aiState?.maintenanceCandidateSummary || null,
      lastCandidateAt: raw.aiState?.lastCandidateAt || null,
      lastCandidateQuality: raw.aiState?.lastCandidateQuality || {},
      lastCandidateSummary: raw.aiState?.lastCandidateSummary || '',
      lastCandidateSourceRefIds: Array.isArray(raw.aiState?.lastCandidateSourceRefIds)
        ? raw.aiState.lastCandidateSourceRefIds
        : [],
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

const sanitizePublicWikiBody = (node, citationIndexMap = null) => {
  if (Array.isArray(node)) return node.map(child => sanitizePublicWikiBody(child, citationIndexMap));
  if (!node || typeof node !== 'object') return node;
  const next = { ...node };
  if (Array.isArray(next.marks)) {
    next.marks = next.marks
      .filter(mark => mark?.type !== 'wikiLink')
      .map((mark) => {
        if (mark?.type !== 'claim') return sanitizePublicWikiBody(mark, citationIndexMap);
        const attrs = mark.attrs || {};
        const remapIndexes = (values) => (Array.isArray(values) ? values : [])
          .map(Number)
          .filter(Number.isFinite)
          .map(index => (citationIndexMap instanceof Map ? citationIndexMap.get(index) : index))
          .filter(Number.isFinite);
        return {
          type: 'claim',
          attrs: {
            support: String(attrs.support || 'supported'),
            citationIndexes: remapIndexes(attrs.citationIndexes),
            contradictionIndexes: remapIndexes(attrs.contradictionIndexes)
          }
        };
      });
  }
  if (Array.isArray(next.content)) next.content = next.content.map(child => sanitizePublicWikiBody(child, citationIndexMap));
  return next;
};

const isRepoWikiPage = (page = {}) => (
  String(page.pageType || '').toLowerCase() === 'repo'
  || page.externalWatches?.githubRepo?.status === 'active'
);

const publicRepoTitle = (page = {}) => canonicalWikiTitle(page, 'Untitled wiki page');

const buildPublicRepoEnvelope = (page = {}) => {
  const watch = page.externalWatches?.githubRepo || {};
  const owner = String(watch.owner || '').trim();
  const repo = String(watch.repo || '').trim();
  if (!owner || !repo) return null;
  const publishedHeadSha = String(watch.publishedHeadSha || '').trim();
  const observedHeadSha = String(watch.lastHeadSha || '').trim();
  const candidateHeadSha = String(watch.candidateHeadSha || '').trim();
  const buildStatus = String(watch.buildStatus || 'idle').trim().toLowerCase();
  const hasUnacceptedState = (
    !publishedHeadSha
    || (observedHeadSha && observedHeadSha !== publishedHeadSha)
    || (candidateHeadSha && candidateHeadSha !== publishedHeadSha)
    || ['queued', 'building', 'ready', 'needs_review', 'error'].includes(buildStatus)
  );
  return {
    githubRepo: {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      defaultBranch: String(watch.defaultBranch || '').trim(),
      publishedHeadSha,
      lastPublishedAt: watch.lastPublishedAt || null
    },
    buildStateLabel: !publishedHeadSha
      ? 'Awaiting accepted build'
      : hasUnacceptedState
        ? 'Last trusted version'
        : 'Current'
  };
};

const isQaOnlyPublicSource = (source = {}) => {
  const value = `${source.title || ''} ${source.url || ''}`.toLowerCase();
  return /\bdebug fixture\b|debug-fixture\.noeis\.local|\bqa[_ -]?(?:fixture|seed)\b/.test(value);
};

/* Shared wiki, private evidence.
   A snippet is the passage you pulled out of something you read: your
   extraction, from someone else's work. Publishing it did both a private and a
   public wrong — it put your reading on a URL under your name, and it
   republished up to a thousand verbatim characters of a third party's article
   for every source on the page. Repo pages already blanked theirs, which was
   the same instinct applied to one case.

   What a public page owes a reader is the ability to check it: the source
   named, and a link to the original so they can go and read it where it was
   published. That it survives without the passage is the point — a claim that
   only holds up because you quoted the source at length was never checkable,
   it was just long. */
const publicSourceSnippet = () => '';

const buildPublicInvestmentValuation = (page = {}) => {
  const valuation = page?.investmentDossier?.valuation || {};
  if (valuation.status !== 'complete' || !Array.isArray(valuation.scenarios) || valuation.scenarios.length === 0) {
    return null;
  }
  const sourceById = new Map(
    (Array.isArray(page.sourceRefs) ? page.sourceRefs : [])
      .map(source => [String(source?._id || source?.id || ''), source])
      .filter(([id]) => id)
  );
  const publicSources = (Array.isArray(valuation.sourceRefIds) ? valuation.sourceRefIds : [])
    .map((sourceRefId) => {
      const source = sourceById.get(String(sourceRefId));
      if (!source) return null;
      return {
        title: String(source.title || source.url || 'Valuation source').trim(),
        url: String(source.url || '').trim()
      };
    })
    .filter(Boolean);
  return {
    status: 'complete',
    asOf: valuation.asOf || null,
    currency: String(valuation.currency || 'USD'),
    unitScale: String(valuation.unitScale || 'millions'),
    price: Number(valuation.price),
    dilutedShares: Number(valuation.dilutedShares),
    equityValue: Number(valuation.equityValue),
    netCashOrDebt: Number(valuation.netCashOrDebt || 0),
    enterpriseValue: Number(valuation.enterpriseValue),
    currentOperatingMultiple: Number(valuation.currentOperatingMultiple),
    currentOperatingYield: Number(valuation.currentOperatingYield),
    requiredEndingEquityValue: Number(valuation.requiredEndingEquityValue),
    operatingBase: {
      metric: String(valuation.operatingBase?.metric || ''),
      period: String(valuation.operatingBase?.period || ''),
      value: Number(valuation.operatingBase?.value),
      derivation: String(valuation.operatingBase?.derivation || '')
    },
    hurdle: {
      annualReturn: Number(valuation.hurdle?.annualReturn),
      horizonYears: Number(valuation.hurdle?.horizonYears),
      terminalMultiples: (valuation.hurdle?.terminalMultiples || []).map(Number).filter(Number.isFinite)
    },
    scenarios: valuation.scenarios.map(row => ({
      terminalMultiple: Number(row.terminalMultiple),
      requiredOperatingValue: Number(row.requiredOperatingValue),
      requiredCagr: Number(row.requiredCagr)
    })).filter(row => (
      Number.isFinite(row.terminalMultiple)
      && Number.isFinite(row.requiredOperatingValue)
      && Number.isFinite(row.requiredCagr)
    )),
    sources: publicSources,
    calculatedAt: valuation.calculatedAt || null
  };
};

const serializePublicWikiPage = (page) => {
  if (isResearchOperatingLedgerPage(page)) return null;
  const full = serializeWikiPage(page);
  if (!full) return full;
  if (full.qualityReview && full.qualityReview.surfaceEligible === false) return null;
  const repoPage = isRepoWikiPage(full);
  const publicSourceRows = (Array.isArray(full.sourceRefs) ? full.sourceRefs : [])
    .map((source, originalIndex) => ({ source, originalIndex: originalIndex + 1 }))
    .filter(({ source }) => !repoPage || !isQaOnlyPublicSource(source));
  const citationIndexMap = new Map(publicSourceRows.map((row, index) => [row.originalIndex, index + 1]));
  const publicSourceRefs = publicSourceRows
    .map(({ source }) => ({
      type: String(source?.type || source?.sourceType || 'source'),
      title: String(source?.title || source?.url || 'Source').trim(),
      url: String(source?.url || '').trim(),
      snippet: publicSourceSnippet(source, { repoPage })
    }))
    .filter((source) => source.title || source.url || source.snippet);
  const maintenanceProof = buildPublicMaintenanceProof(page);
  if (repoPage && maintenanceProof) maintenanceProof.sourceCount = publicSourceRefs.length;
  const publicRepoEnvelope = repoPage ? buildPublicRepoEnvelope(full) : null;
  const investmentValuation = buildPublicInvestmentValuation(full);
  const investmentDossierPage = Boolean(full?.investmentDossier?.version);

  return {
    _id: String(full._id || ''),
    title: repoPage ? publicRepoTitle(full) : (full.title || 'Untitled wiki page'),
    slug: full.slug || '',
    pageType: full.pageType || 'topic',
    status: full.status || 'draft',
    visibility: 'shared',
    body: sanitizePublicWikiBody(full.body || emptyDoc(), citationIndexMap),
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
    sourceCount: repoPage ? publicSourceRefs.length : (full.sourceCount ?? publicSourceRefs.length),
    claimCount: full.claimCount ?? 0,
    wordCount: full.wordCount ?? countWords(full.plainText || ''),
    maintenanceProof,
    wikiKind: repoPage ? 'repository' : investmentDossierPage ? 'investment' : 'general',
    ...(investmentDossierPage ? { artifactType: 'investment_dossier' } : {}),
    ...(investmentValuation ? { investmentValuation } : {}),
    ...(publicRepoEnvelope || {})
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
  // Adoption runs server-side against an already-authorized shared page. Keep
  // the original wiki-link ids here so collection adoption can remap them;
  // the public transport serializer still strips those ids from responses.
  const internalPage = serializeWikiPage(page);
  const body = clonePlain(internalPage?.body || publicPage.body || emptyDoc());
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
      plainText: publicPage.plainText || docText(body),
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
  const publicPages = pages.filter(page => !isHumanOnlyWikiArtifact(page));
  return {
    _id: serializeId(raw._id),
    name: raw.name || 'Shared wiki',
    description: raw.description || '',
    slug: raw.slug || '',
    visibility: raw.visibility || 'shared',
    sourceType: raw.sourceType || 'user',
    packId: raw.packId || '',
    pageCount: publicPages.filter(isWikiPageSurfaceEligible).length,
    pages: publicPages.map(serializePublicWikiPage).filter(Boolean)
  };
};

const serializeId = (value) => (value ? String(value) : null);

module.exports = {
  PAGE_TYPES,
  PAGE_TYPE_ALIASES,
  STATUSES,
  VISIBILITIES,
  SOURCE_SCOPES,
  SOURCE_REF_TYPES,
  SOURCE_REF_ADDED_BY,
  INGEST_SOURCE_TYPES,
  INVERSE_CONNECTION_RELATION_TYPES,
  INGEST_TEXT_LIMIT,
  emptyDoc,
  normalizeBodyDoc,
  paragraphNode,
  wikiLinkText,
  slugify,
  buildUniqueWikiSlugBuilder,
  escapeRegExp,
  normalizeTitle,
  deriveTitleFromQuestion,
  normalizeObjectId,
  normalizeCreatedFrom,
  buildDraftDoc,
  clonePlain,
  collectCitationIndexesFromDoc,
  cloneSourceRefForPromotion,
  buildPromotedDiscussionDoc,
  serializeWikiPage,
  buildPublicInvestmentValuation,
  serializePublicWikiPage,
  sanitizeSharedWikiSourceRefsForAdoption,
  buildAdoptableWikiPageSnapshot,
  remapWikiLinkPageIdsInDoc,
  serializePublicWikiCollection,
  serializeId
};
