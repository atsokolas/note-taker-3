const crypto = require('crypto');
const mongoose = require('mongoose');
const { ensureWorkspace, applyPatchOp } = require('../utils/workspaceUtils');
const { semanticSearch, planConcept } = require('../config/aiClient');

const SUPPORTED_MODE = 'library_only';
const MAX_INITIAL_QUERIES = 6;
const MAX_CANDIDATE_ITEMS = 40;
const MAX_ITEM_SUGGESTIONS = 20;
const MAX_CONCEPT_SUGGESTIONS = 8;
const MAX_STORED_SUGGESTION_DRAFTS = 20;
const SEARCH_LIMIT_PER_QUERY = 20;
const AGENT_BUILD_PREFIX = 'Agent Build';
const FALLBACK_MIN_KEYWORD_MATCHES = 1;
const FALLBACK_MIN_SCORE = 0.35;
const FALLBACK_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those',
  'into', 'onto', 'about', 'your', 'you', 'are', 'was', 'were', 'have', 'has',
  'had', 'will', 'would', 'could', 'should', 'what', 'when', 'where', 'which',
  'who', 'whom', 'why', 'how', 'than', 'then', 'them', 'they', 'their', 'there',
  'concept', 'generate', 'generated', 'based', 'build',
  'building', 'people', 'overview', 'companies', 'pros', 'cons', 'key'
]);

const toSafeString = (value) => String(value || '').trim();

const clampMaxLoops = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  const rounded = Math.round(numeric);
  return Math.max(1, Math.min(2, rounded));
};

const createId = (prefix = 'id') => {
  const random = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${random}`;
};

const toSafeScore = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const stripMarkup = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const buildSnippet = (value, limit = 320) => {
  const clean = stripMarkup(value);
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

const extractHost = (urlValue) => {
  const raw = toSafeString(urlValue);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.hostname || raw;
  } catch (_err) {
    return raw;
  }
};

const escapeRegex = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSemanticObjectType = (value = '') => {
  const raw = toSafeString(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'notebook' || raw === 'notebook_entry' || raw === 'note') return 'notebook_block';
  return raw;
};

const normalizeSuggestionItemType = (value = '') => {
  const raw = toSafeString(value).toLowerCase();
  if (raw === 'highlight' || raw === 'article' || raw === 'note' || raw === 'question') return raw;
  return '';
};

const normalizeSuggestionState = (value = '') => {
  const raw = toSafeString(value).toLowerCase();
  if (raw === 'accepted' || raw === 'discarded') return raw;
  return 'pending';
};

const resolveConceptModel = () => {
  try {
    return mongoose.model('TagMeta');
  } catch (_err) {
    throw new Error('TagMeta model is not registered. Ensure server models are initialized before using conceptAgentService.');
  }
};

const resolveArticleModel = () => {
  try {
    return mongoose.model('Article');
  } catch (_err) {
    throw new Error('Article model is not registered. Ensure server models are initialized before using conceptAgentService.');
  }
};

const resolveNotebookModel = () => {
  try {
    return mongoose.model('NotebookEntry');
  } catch (_err) {
    throw new Error('NotebookEntry model is not registered. Ensure server models are initialized before using conceptAgentService.');
  }
};

const resolveQuestionModel = () => {
  try {
    return mongoose.model('Question');
  } catch (_err) {
    throw new Error('Question model is not registered. Ensure server models are initialized before using conceptAgentService.');
  }
};

const resolveConceptByParam = async ({ conceptId, userId }) => {
  const TagMeta = resolveConceptModel();
  const safeConceptId = toSafeString(conceptId);
  const safeUserId = toSafeString(userId);
  if (!safeConceptId) {
    const error = new Error('conceptId is required.');
    error.status = 400;
    throw error;
  }
  if (!mongoose.Types.ObjectId.isValid(safeUserId)) {
    const error = new Error('userId must be a valid ObjectId.');
    error.status = 400;
    throw error;
  }
  const userObjectId = new mongoose.Types.ObjectId(safeUserId);
  if (mongoose.Types.ObjectId.isValid(safeConceptId)) {
    const byId = await TagMeta.findOne({ _id: safeConceptId, userId: userObjectId });
    if (byId) return byId;
  }
  return TagMeta.findOne({
    name: new RegExp(`^${escapeRegex(safeConceptId)}$`, 'i'),
    userId: userObjectId
  });
};

const buildInitialQueries = ({ title, description }) => {
  const safeTitle = toSafeString(title);
  const safeDescription = toSafeString(description);
  const baseQueries = [
    safeTitle,
    `${safeTitle} overview`,
    `${safeTitle} key concepts`,
    `${safeTitle} companies`,
    `${safeTitle} pros cons`
  ].filter(Boolean);

  if (safeTitle && safeDescription) {
    const descriptionWords = safeDescription
      .split(/\s+/)
      .map(word => word.replace(/[^a-zA-Z0-9-]/g, ''))
      .filter(word => word.length > 2)
      .slice(0, 8)
      .join(' ');
    if (descriptionWords) {
      baseQueries.push(`${safeTitle} ${descriptionWords}`);
    }
  }

  const deduped = [];
  const seen = new Set();
  baseQueries.forEach((query) => {
    const clean = toSafeString(query).replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    deduped.push(clean);
  });
  return deduped.slice(0, MAX_INITIAL_QUERIES);
};

const parseSemanticResultIdentity = (result, allowedTypes = []) => {
  const parsed = parseEmbeddingId(result?.id || '');
  const metadata = result?.metadata && typeof result.metadata === 'object' ? result.metadata : {};
  const rawType = normalizeSemanticObjectType(result?.objectType || metadata.objectType || parsed.objectType);
  const objectType = rawType;
  const objectId = toSafeString(result?.objectId || metadata.objectId || parsed.objectId);
  const subId = toSafeString(metadata.subId || parsed.subId || '');
  const allowSet = new Set((Array.isArray(allowedTypes) ? allowedTypes : []).map(normalizeSemanticObjectType));
  if (!objectType || !objectId || (allowSet.size > 0 && !allowSet.has(objectType))) return null;
  return {
    objectType,
    objectId,
    subId,
    metadata,
    score: toSafeScore(result?.score),
    document: toSafeString(result?.document)
  };
};

const fetchHighlightDetails = async ({ userId, highlightIds }) => {
  const Article = resolveArticleModel();
  const validIds = (Array.isArray(highlightIds) ? highlightIds : [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!validIds.length) return new Map();
  const rows = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': { $in: validIds } } },
    {
      $project: {
        _id: '$highlights._id',
        text: '$highlights.text',
        note: '$highlights.note',
        articleId: '$_id',
        articleTitle: '$title'
      }
    }
  ]);
  const map = new Map();
  rows.forEach((row) => {
    map.set(String(row._id), {
      id: String(row._id),
      text: toSafeString(row.text),
      note: toSafeString(row.note),
      articleId: row.articleId ? String(row.articleId) : '',
      articleTitle: toSafeString(row.articleTitle)
    });
  });
  return map;
};

const fetchArticleDetails = async ({ userId, articleIds }) => {
  const Article = resolveArticleModel();
  const validIds = (Array.isArray(articleIds) ? articleIds : [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!validIds.length) return new Map();
  const rows = await Article.find({
    userId: new mongoose.Types.ObjectId(String(userId)),
    _id: { $in: validIds }
  })
    .select('_id title content url')
    .lean();
  const map = new Map();
  rows.forEach((row) => {
    map.set(String(row._id), {
      id: String(row._id),
      title: toSafeString(row.title),
      content: toSafeString(row.content),
      url: toSafeString(row.url)
    });
  });
  return map;
};

const fetchNoteDetails = async ({ userId, noteIds }) => {
  const NotebookEntry = resolveNotebookModel();
  const validIds = (Array.isArray(noteIds) ? noteIds : [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!validIds.length) return new Map();
  const rows = await NotebookEntry.find({
    userId: new mongoose.Types.ObjectId(String(userId)),
    _id: { $in: validIds }
  })
    .select('_id title content blocks updatedAt')
    .lean();

  const map = new Map();
  rows.forEach((row) => {
    const blockText = Array.isArray(row.blocks)
      ? row.blocks
        .map(block => toSafeString(block?.text))
        .filter(Boolean)
        .join(' ')
      : '';
    map.set(String(row._id), {
      id: String(row._id),
      title: toSafeString(row.title) || 'Note',
      text: toSafeString(row.content) || blockText,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ''
    });
  });
  return map;
};

const fetchQuestionDetails = async ({ userId, questionIds }) => {
  const Question = resolveQuestionModel();
  const validIds = (Array.isArray(questionIds) ? questionIds : [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!validIds.length) return new Map();
  const rows = await Question.find({
    userId: new mongoose.Types.ObjectId(String(userId)),
    _id: { $in: validIds }
  })
    .select('_id text conceptName linkedTagName updatedAt')
    .lean();

  const map = new Map();
  rows.forEach((row) => {
    map.set(String(row._id), {
      id: String(row._id),
      text: toSafeString(row.text) || 'Question',
      conceptName: toSafeString(row.conceptName || row.linkedTagName),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ''
    });
  });
  return map;
};

const fetchConceptDetails = async ({ userId, conceptIds }) => {
  const TagMeta = resolveConceptModel();
  const validIds = (Array.isArray(conceptIds) ? conceptIds : [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!validIds.length) return new Map();
  const rows = await TagMeta.find({
    userId: new mongoose.Types.ObjectId(String(userId)),
    _id: { $in: validIds }
  })
    .select('_id name description updatedAt')
    .lean();

  const map = new Map();
  rows.forEach((row) => {
    map.set(String(row._id), {
      id: String(row._id),
      name: toSafeString(row.name) || 'Concept',
      description: toSafeString(row.description),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ''
    });
  });
  return map;
};

const buildCandidateItems = async ({ queryResults, userId }) => {
  const allParsed = [];
  (Array.isArray(queryResults) ? queryResults : []).forEach((result) => {
    const identity = parseSemanticResultIdentity(result, ['article', 'highlight']);
    if (!identity) return;
    allParsed.push(identity);
  });

  if (allParsed.length === 0) return [];

  const articleIds = new Set();
  const highlightIds = new Set();
  allParsed.forEach((entry) => {
    if (entry.objectType === 'article') articleIds.add(entry.objectId);
    if (entry.objectType === 'highlight') highlightIds.add(entry.objectId);
    const metadataArticleId = toSafeString(entry.metadata?.articleId);
    if (metadataArticleId) articleIds.add(metadataArticleId);
  });

  const [articleMap, highlightMap] = await Promise.all([
    fetchArticleDetails({ userId, articleIds: Array.from(articleIds) }),
    fetchHighlightDetails({ userId, highlightIds: Array.from(highlightIds) })
  ]);

  const deduped = new Map();
  allParsed.forEach((entry) => {
    const type = entry.objectType;
    const id = entry.objectId;
    const key = `${type}:${id}`;
    const linkedArticleId = entry.objectType === 'highlight'
      ? (highlightMap.get(id)?.articleId || toSafeString(entry.metadata?.articleId))
      : id;
    const linkedArticle = articleMap.get(linkedArticleId);

    let title = null;
    let text = '';
    let source = null;

    if (entry.objectType === 'article') {
      title = linkedArticle?.title || toSafeString(entry.metadata?.title) || null;
      text = buildSnippet(entry.document || linkedArticle?.content || '', 420);
      source = linkedArticle?.url || null;
    } else if (entry.objectType === 'highlight') {
      const highlight = highlightMap.get(id);
      title = highlight?.articleTitle || null;
      const quote = buildSnippet(highlight?.text || entry.document || '', 320);
      const note = buildSnippet(highlight?.note || '', 180);
      text = note ? `${quote} (Note: ${note})` : quote;
      source = linkedArticle?.url || null;
    }

    if (!text) return;
    const candidate = {
      type,
      id,
      title: title || null,
      text,
      source: source || extractHost(linkedArticle?.url || '') || null,
      score: entry.score
    };

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, candidate);
      return;
    }
    if ((candidate.score || 0) > (existing.score || 0)) {
      deduped.set(key, candidate);
      return;
    }
    if (!existing.title && candidate.title) existing.title = candidate.title;
    if ((!existing.text || existing.text.length < candidate.text.length) && candidate.text) existing.text = candidate.text;
    if (!existing.source && candidate.source) existing.source = candidate.source;
  });

  return Array.from(deduped.values())
    .sort((a, b) => (b.score - a.score) || a.type.localeCompare(b.type))
    .slice(0, MAX_CANDIDATE_ITEMS);
};

const buildSuggestionItems = async ({ queryResults, userId, concept }) => {
  const allParsed = [];
  (Array.isArray(queryResults) ? queryResults : []).forEach((result) => {
    const identity = parseSemanticResultIdentity(result, ['article', 'highlight', 'notebook_block', 'question', 'concept']);
    if (!identity) return;
    allParsed.push(identity);
  });
  if (!allParsed.length) {
    return {
      itemSuggestions: [],
      conceptSuggestions: []
    };
  }

  const articleIds = new Set();
  const highlightIds = new Set();
  const noteIds = new Set();
  const questionIds = new Set();
  const conceptIds = new Set();

  allParsed.forEach((entry) => {
    if (entry.objectType === 'article') articleIds.add(entry.objectId);
    if (entry.objectType === 'highlight') highlightIds.add(entry.objectId);
    if (entry.objectType === 'notebook_block') noteIds.add(entry.objectId);
    if (entry.objectType === 'question') questionIds.add(entry.objectId);
    if (entry.objectType === 'concept') conceptIds.add(entry.objectId);
    if (entry.objectType === 'highlight') {
      const metadataArticleId = toSafeString(entry.metadata?.articleId);
      if (metadataArticleId) articleIds.add(metadataArticleId);
    }
  });

  const [articleMap, highlightMap, noteMap, questionMap, conceptMap] = await Promise.all([
    fetchArticleDetails({ userId, articleIds: Array.from(articleIds) }),
    fetchHighlightDetails({ userId, highlightIds: Array.from(highlightIds) }),
    fetchNoteDetails({ userId, noteIds: Array.from(noteIds) }),
    fetchQuestionDetails({ userId, questionIds: Array.from(questionIds) }),
    fetchConceptDetails({ userId, conceptIds: Array.from(conceptIds) })
  ]);

  const currentConceptId = toSafeString(concept?._id);
  const currentConceptName = toSafeString(concept?.name).toLowerCase();

  const itemSuggestionsMap = new Map();
  const conceptSuggestionsMap = new Map();

  allParsed.forEach((entry) => {
    const score = toSafeScore(entry.score);

    if (entry.objectType === 'article') {
      const article = articleMap.get(entry.objectId);
      if (!article) return;
      const suggestion = {
        id: `item:article:${article.id}`,
        type: 'article',
        refId: article.id,
        title: article.title || 'Article',
        text: buildSnippet(entry.document || article.content, 360),
        source: article.url || extractHost(article.url) || null,
        score,
        state: 'pending',
        generatedBy: 'ai_agent'
      };
      const existing = itemSuggestionsMap.get(suggestion.id);
      if (!existing || suggestion.score > existing.score) itemSuggestionsMap.set(suggestion.id, suggestion);
      return;
    }

    if (entry.objectType === 'highlight') {
      const highlight = highlightMap.get(entry.objectId);
      if (!highlight) return;
      const linkedArticle = articleMap.get(highlight.articleId);
      const quote = buildSnippet(highlight.text || entry.document, 260);
      const note = buildSnippet(highlight.note, 120);
      const suggestion = {
        id: `item:highlight:${highlight.id}`,
        type: 'highlight',
        refId: highlight.id,
        title: highlight.articleTitle || 'Highlight',
        text: note ? `${quote} (Note: ${note})` : quote,
        source: linkedArticle?.url || null,
        score,
        state: 'pending',
        generatedBy: 'ai_agent'
      };
      const existing = itemSuggestionsMap.get(suggestion.id);
      if (!existing || suggestion.score > existing.score) itemSuggestionsMap.set(suggestion.id, suggestion);
      return;
    }

    if (entry.objectType === 'notebook_block') {
      const note = noteMap.get(entry.objectId);
      if (!note) return;
      const suggestion = {
        id: `item:note:${note.id}`,
        type: 'note',
        refId: note.id,
        title: note.title || 'Note',
        text: buildSnippet(entry.document || note.text, 320),
        source: null,
        score,
        state: 'pending',
        generatedBy: 'ai_agent'
      };
      const existing = itemSuggestionsMap.get(suggestion.id);
      if (!existing || suggestion.score > existing.score) itemSuggestionsMap.set(suggestion.id, suggestion);
      return;
    }

    if (entry.objectType === 'question') {
      const question = questionMap.get(entry.objectId);
      if (!question) return;
      const suggestion = {
        id: `item:question:${question.id}`,
        type: 'question',
        refId: question.id,
        title: question.text || 'Question',
        text: question.conceptName || '',
        source: null,
        score,
        state: 'pending',
        generatedBy: 'ai_agent'
      };
      const existing = itemSuggestionsMap.get(suggestion.id);
      if (!existing || suggestion.score > existing.score) itemSuggestionsMap.set(suggestion.id, suggestion);
      return;
    }

    if (entry.objectType === 'concept') {
      const relatedConcept = conceptMap.get(entry.objectId);
      if (!relatedConcept) return;
      if (currentConceptId && relatedConcept.id === currentConceptId) return;
      if (currentConceptName && relatedConcept.name.toLowerCase() === currentConceptName) return;
      const suggestion = {
        id: `concept:${relatedConcept.id}`,
        type: 'concept',
        refId: relatedConcept.id,
        title: relatedConcept.name || 'Concept',
        text: buildSnippet(relatedConcept.description, 260),
        source: null,
        score,
        state: 'pending',
        generatedBy: 'ai_agent'
      };
      const existing = conceptSuggestionsMap.get(suggestion.id);
      if (!existing || suggestion.score > existing.score) conceptSuggestionsMap.set(suggestion.id, suggestion);
    }
  });

  return {
    itemSuggestions: Array.from(itemSuggestionsMap.values())
      .sort((a, b) => (b.score - a.score) || a.type.localeCompare(b.type))
      .slice(0, MAX_ITEM_SUGGESTIONS),
    conceptSuggestions: Array.from(conceptSuggestionsMap.values())
      .sort((a, b) => (b.score - a.score) || a.title.localeCompare(b.title))
      .slice(0, MAX_CONCEPT_SUGGESTIONS)
  };
};

const buildKeywordList = ({ title, description }) => {
  const text = `${toSafeString(title)} ${toSafeString(description)}`.toLowerCase();
  const seen = new Set();
  const keywords = [];
  text
    .split(/[^a-z0-9]+/g)
    .map(token => token.trim())
    .filter(token => token.length >= 3)
    .forEach((token) => {
      if (FALLBACK_STOPWORDS.has(token)) return;
      if (seen.has(token)) return;
      seen.add(token);
      keywords.push(token);
      if (token.endsWith('s') && token.length > 4) {
        const singular = token.slice(0, -1);
        if (!seen.has(singular) && !FALLBACK_STOPWORDS.has(singular)) {
          seen.add(singular);
          keywords.push(singular);
        }
      }
    });
  return keywords.slice(0, 12);
};

const scoreTextAgainstKeywords = (text, keywords = [], recencyRank = 0) => {
  const haystack = stripMarkup(text).toLowerCase();
  if (!Array.isArray(keywords) || keywords.length === 0) return 0;
  let matches = 0;
  if (haystack) {
    keywords.forEach((keyword) => {
      if (keyword && haystack.includes(keyword)) matches += 1;
    });
  }
  const minMatches = keywords.length >= 5 ? 2 : FALLBACK_MIN_KEYWORD_MATCHES;
  const recencyBoost = Math.max(0, 1 - (Number(recencyRank) / 50)) * 0.15;
  if (matches < minMatches) {
    return 0;
  }
  const keywordScore = matches / keywords.length;
  return Number((keywordScore + recencyBoost).toFixed(4));
};

const dedupeSuggestionItems = (items = []) => {
  const keyed = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const safeType = toSafeString(item?.type).toLowerCase();
    const refId = toSafeString(item?.refId);
    const title = toSafeString(item?.title).toLowerCase();
    const text = buildSnippet(item?.text || '', 160).toLowerCase();
    const primaryKey = `${safeType}:${refId}`;
    const semanticKey = `${safeType}:${title}:${text}`;
    const key = primaryKey || semanticKey;
    if (!key) return;
    const existing = keyed.get(key);
    if (!existing || toSafeScore(item?.score) > toSafeScore(existing?.score)) {
      keyed.set(key, item);
    }
  });
  return Array.from(keyed.values());
};

const isTransientSemanticUpstreamError = (error) => {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = toSafeString(error?.message).toLowerCase();
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  return (
    message.includes('too many requests')
    || message.includes('rate-limit')
    || message.includes('upstream')
    || message.includes('temporarily unavailable')
  );
};

const buildFallbackCandidateItemsFromLibrary = async ({ userId, conceptTitle, conceptDescription }) => {
  const Article = resolveArticleModel();
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const keywords = buildKeywordList({ title: conceptTitle, description: conceptDescription });

  const articles = await Article.find({ userId: userObjectId })
    .select('_id title content url highlights updatedAt createdAt')
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(50)
    .lean();

  const deduped = new Map();
  const upsertCandidate = (candidate) => {
    if (!candidate || !candidate.type || !candidate.id || !candidate.text) return;
    const key = `${candidate.type}:${candidate.id}`;
    const existing = deduped.get(key);
    if (!existing || Number(candidate.score || 0) > Number(existing.score || 0)) {
      deduped.set(key, candidate);
      return;
    }
    if (!existing.title && candidate.title) existing.title = candidate.title;
    if ((!existing.text || existing.text.length < candidate.text.length) && candidate.text) existing.text = candidate.text;
    if (!existing.source && candidate.source) existing.source = candidate.source;
  };

  articles.forEach((article, articleIndex) => {
    const articleId = String(article?._id || '');
    if (!articleId) return;
    const articleTitle = toSafeString(article?.title) || null;
    const articleBody = toSafeString(article?.content);
    const articleUrl = toSafeString(article?.url);
    const articleText = buildSnippet(articleBody, 420);
    if (articleText) {
      const score = scoreTextAgainstKeywords(`${articleTitle || ''} ${articleBody}`, keywords, articleIndex);
      if (score < FALLBACK_MIN_SCORE) return;
      upsertCandidate({
        type: 'article',
        id: articleId,
        title: articleTitle,
        text: articleText,
        source: articleUrl || extractHost(articleUrl) || null,
        score
      });
    }

    const highlights = Array.isArray(article?.highlights) ? article.highlights : [];
    const sortedHighlights = highlights
      .slice()
      .sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0))
      .slice(0, 4);
    sortedHighlights.forEach((highlight, highlightIndex) => {
      const highlightId = toSafeString(highlight?._id);
      const quote = buildSnippet(toSafeString(highlight?.text), 320);
      const note = buildSnippet(toSafeString(highlight?.note), 180);
      if (!highlightId || !quote) return;
      const score = scoreTextAgainstKeywords(`${quote} ${note}`, keywords, articleIndex + (highlightIndex * 0.1));
      if (score < FALLBACK_MIN_SCORE) return;
      upsertCandidate({
        type: 'highlight',
        id: highlightId,
        title: articleTitle,
        text: note ? `${quote} (Note: ${note})` : quote,
        source: articleUrl || extractHost(articleUrl) || null,
        score
      });
    });
  });

  return Array.from(deduped.values())
    .sort((a, b) => (b.score - a.score) || a.type.localeCompare(b.type))
    .slice(0, MAX_CANDIDATE_ITEMS);
};

const buildFallbackSuggestionsFromLibrary = async ({ userId, conceptTitle, conceptDescription, concept }) => {
  const Article = resolveArticleModel();
  const NotebookEntry = resolveNotebookModel();
  const Question = resolveQuestionModel();
  const TagMeta = resolveConceptModel();
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const keywords = buildKeywordList({ title: conceptTitle, description: conceptDescription });

  const [articles, notes, questions, concepts] = await Promise.all([
    Article.find({ userId: userObjectId })
      .select('_id title content url highlights updatedAt createdAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(40)
      .lean(),
    NotebookEntry.find({ userId: userObjectId })
      .select('_id title content blocks updatedAt createdAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(30)
      .lean(),
    Question.find({ userId: userObjectId })
      .select('_id text conceptName linkedTagName updatedAt createdAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(30)
      .lean(),
    TagMeta.find({ userId: userObjectId })
      .select('_id name description updatedAt createdAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(30)
      .lean()
  ]);

  const itemSuggestions = [];
  const conceptSuggestions = [];
  const currentConceptId = toSafeString(concept?._id);
  const currentConceptName = toSafeString(concept?.name).toLowerCase();
  const seenItem = new Set();
  const seenConcept = new Set();

  articles.forEach((article, index) => {
    const id = toSafeString(article?._id);
    if (!id) return;
    const title = toSafeString(article?.title) || 'Article';
    const body = toSafeString(article?.content);
    const url = toSafeString(article?.url) || null;
    const articleText = buildSnippet(body, 320);
    if (articleText) {
      const key = `article:${id}`;
      if (!seenItem.has(key)) {
        const score = scoreTextAgainstKeywords(`${title} ${body}`, keywords, index);
        if (score < FALLBACK_MIN_SCORE) return;
        seenItem.add(key);
        itemSuggestions.push({
          id: `item:article:${id}`,
          type: 'article',
          refId: id,
          title,
          text: articleText,
          source: url,
          score,
          state: 'pending',
          generatedBy: 'ai_agent'
        });
      }
    }

    const highlights = Array.isArray(article?.highlights) ? article.highlights : [];
    highlights
      .slice()
      .sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0))
      .slice(0, 3)
      .forEach((highlight, highlightIndex) => {
        const highlightId = toSafeString(highlight?._id);
        const quote = buildSnippet(toSafeString(highlight?.text), 260);
        const note = buildSnippet(toSafeString(highlight?.note), 120);
        if (!highlightId || !quote) return;
        const key = `highlight:${highlightId}`;
        if (seenItem.has(key)) return;
        const score = scoreTextAgainstKeywords(`${quote} ${note}`, keywords, index + (highlightIndex * 0.1));
        if (score < FALLBACK_MIN_SCORE) return;
        seenItem.add(key);
        itemSuggestions.push({
          id: `item:highlight:${highlightId}`,
          type: 'highlight',
          refId: highlightId,
          title,
          text: note ? `${quote} (Note: ${note})` : quote,
          source: url,
          score,
          state: 'pending',
          generatedBy: 'ai_agent'
        });
      });
  });

  notes.forEach((note, index) => {
    const id = toSafeString(note?._id);
    if (!id) return;
    const key = `note:${id}`;
    if (seenItem.has(key)) return;
    seenItem.add(key);
    const blockText = Array.isArray(note?.blocks)
      ? note.blocks.map(block => toSafeString(block?.text)).filter(Boolean).join(' ')
      : '';
    const text = buildSnippet(toSafeString(note?.content) || blockText, 320);
    if (!text) return;
    const score = scoreTextAgainstKeywords(`${note?.title || ''} ${text}`, keywords, index);
    if (score < FALLBACK_MIN_SCORE) return;
    itemSuggestions.push({
      id: `item:note:${id}`,
      type: 'note',
      refId: id,
      title: toSafeString(note?.title) || 'Note',
      text,
      source: null,
      score,
      state: 'pending',
      generatedBy: 'ai_agent'
    });
  });

  questions.forEach((question, index) => {
    const id = toSafeString(question?._id);
    if (!id) return;
    const key = `question:${id}`;
    if (seenItem.has(key)) return;
    seenItem.add(key);
    const text = toSafeString(question?.text);
    if (!text) return;
    const score = scoreTextAgainstKeywords(text, keywords, index);
    if (score < FALLBACK_MIN_SCORE) return;
    itemSuggestions.push({
      id: `item:question:${id}`,
      type: 'question',
      refId: id,
      title: text,
      text: toSafeString(question?.conceptName || question?.linkedTagName),
      source: null,
      score,
      state: 'pending',
      generatedBy: 'ai_agent'
    });
  });

  concepts.forEach((entry, index) => {
    const id = toSafeString(entry?._id);
    const name = toSafeString(entry?.name);
    if (!id || !name) return;
    if (currentConceptId && id === currentConceptId) return;
    if (currentConceptName && name.toLowerCase() === currentConceptName) return;
    const key = `concept:${id}`;
    if (seenConcept.has(key)) return;
    const score = scoreTextAgainstKeywords(`${name} ${entry?.description || ''}`, keywords, index);
    if (score < FALLBACK_MIN_SCORE) return;
    seenConcept.add(key);
    conceptSuggestions.push({
      id: `concept:${id}`,
      type: 'concept',
      refId: id,
      title: name,
      text: buildSnippet(toSafeString(entry?.description), 260),
      source: null,
      score,
      state: 'pending',
      generatedBy: 'ai_agent'
    });
  });

  return {
    itemSuggestions: dedupeSuggestionItems(itemSuggestions)
      .sort((a, b) => (b.score - a.score) || a.type.localeCompare(b.type))
      .slice(0, MAX_ITEM_SUGGESTIONS),
    conceptSuggestions: dedupeSuggestionItems(conceptSuggestions)
      .sort((a, b) => (b.score - a.score) || a.title.localeCompare(b.title))
      .slice(0, MAX_CONCEPT_SUGGESTIONS)
  };
};

const normalizePlan = (plan) => {
  const safe = plan && typeof plan === 'object' ? plan : {};
  return {
    queries: Array.isArray(safe.queries) ? safe.queries : [],
    groups: Array.isArray(safe.groups) ? safe.groups : [],
    outline: Array.isArray(safe.outline) ? safe.outline : [],
    claims: Array.isArray(safe.claims) ? safe.claims : [],
    open_questions: Array.isArray(safe.open_questions) ? safe.open_questions : [],
    next_actions: Array.isArray(safe.next_actions) ? safe.next_actions : []
  };
};

const buildLocalFallbackPlan = ({ conceptTitle, conceptDescription, initialQueries, candidateItems }) => {
  const title = toSafeString(conceptTitle) || 'Concept';
  const description = toSafeString(conceptDescription);
  const ranked = (Array.isArray(candidateItems) ? candidateItems : [])
    .slice()
    .sort((a, b) => (toSafeScore(b?.score) - toSafeScore(a?.score)));

  const topRefs = ranked.slice(0, 24);
  const chunkedRefs = [topRefs.slice(0, 8), topRefs.slice(8, 16), topRefs.slice(16, 24)];
  const groupTemplates = [
    {
      title: `${title} - core signals`,
      description: 'High-signal sources likely to shape the central argument.'
    },
    {
      title: `${title} - supporting context`,
      description: 'Background sources that add nuance and counterpoints.'
    },
    {
      title: `${title} - follow-up leads`,
      description: 'Additional sources worth reviewing after the core narrative is drafted.'
    }
  ];

  const groups = groupTemplates.map((template, index) => ({
    title: template.title,
    description: template.description,
    item_refs: chunkedRefs[index].map(item => ({
      type: item.type === 'highlight' ? 'highlight' : 'article',
      id: toSafeString(item.id),
      why: `Matched concept keywords with score ${toSafeScore(item.score).toFixed(3)}.`
    }))
  }));

  const topHighlights = ranked
    .filter(item => item?.type === 'highlight' && toSafeString(item?.id))
    .slice(0, 5);

  const claims = topHighlights.map((item, index) => ({
    claim: `${title}: claim candidate ${index + 1}`,
    evidence: [{
      type: 'highlight',
      id: toSafeString(item.id),
      quote: buildSnippet(item.text || '', 180)
    }],
    confidence: 'medium'
  }));

  const outline = [
    { heading: `${title} at a glance`, bullets: ['Define the problem and scope.', 'Summarize why this concept matters now.'] },
    { heading: 'Key themes', bullets: ['Identify recurring ideas across top sources.', 'Highlight key terminology and assumptions.'] },
    { heading: 'Evidence review', bullets: ['Compare strongest highlights and snippets.', 'Note conflicts and open ambiguities.'] },
    { heading: 'Synthesis', bullets: ['Draft a coherent narrative from grouped sources.', 'Separate facts, interpretations, and hypotheses.'] },
    { heading: 'Action plan', bullets: ['Pick immediate follow-up reading.', 'Define next 1-2 concrete experiments.'] }
  ];

  const openQuestions = [
    `What is the strongest definition of "${title}" for this workspace?`,
    `Which sources provide the most credible evidence for "${title}"?`,
    'Where do the top sources disagree, and why?',
    `What assumptions about "${title}" still need validation?`,
    'What evidence is missing for a confident synthesis?'
  ];

  const nextActions = [
    'Review top-ranked sources and accept the most relevant items into Inbox.',
    'Write a short synthesis summary using the grouped evidence.',
    'Capture unresolved questions and assign follow-up research tasks.'
  ];

  const queries = (() => {
    const base = Array.isArray(initialQueries) ? initialQueries.map(entry => toSafeString(entry)).filter(Boolean) : [];
    const fallbacks = [
      title,
      `${title} overview`,
      `${title} key concepts`,
      `${title} examples`,
      `${title} tradeoffs`,
      description ? `${title} ${description.split(/\s+/).slice(0, 8).join(' ')}` : `${title} deep dive`
    ];
    const merged = [...base, ...fallbacks];
    const seen = new Set();
    const out = [];
    merged.forEach((query) => {
      const clean = toSafeString(query).replace(/\s+/g, ' ');
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    });
    return out.slice(0, 12);
  })();

  return {
    queries,
    groups,
    outline,
    claims,
    open_questions: openQuestions,
    next_actions: nextActions
  };
};

const formatGroupTitle = (timestampLabel, title) => {
  const suffix = toSafeString(title) || 'Theme';
  return `${AGENT_BUILD_PREFIX} ${timestampLabel} · ${suffix}`.slice(0, 180);
};

const normalizeRefType = (value) => {
  const type = toSafeString(value).toLowerCase();
  return type === 'article' || type === 'highlight' ? type : '';
};

const normalizeStoredSuggestionDraft = (draft, index = 0) => {
  const safeDraft = draft && typeof draft === 'object' ? draft : {};
  const itemSuggestions = Array.isArray(safeDraft.itemSuggestions)
    ? safeDraft.itemSuggestions
      .map((entry) => {
        const safeEntry = entry && typeof entry === 'object' ? entry : {};
        const type = normalizeSuggestionItemType(safeEntry.type);
        const refId = toSafeString(safeEntry.refId);
        if (!type || !refId) return null;
        const id = toSafeString(safeEntry.id) || `item:${type}:${refId}`;
        return {
          id,
          type,
          refId,
          title: toSafeString(safeEntry.title) || (type === 'question' ? 'Question' : type.charAt(0).toUpperCase() + type.slice(1)),
          text: toSafeString(safeEntry.text),
          source: toSafeString(safeEntry.source) || null,
          score: toSafeScore(safeEntry.score),
          state: normalizeSuggestionState(safeEntry.state),
          generatedBy: 'ai_agent',
          acceptedAt: toSafeString(safeEntry.acceptedAt) || null,
          discardedAt: toSafeString(safeEntry.discardedAt) || null
        };
      })
      .filter(Boolean)
    : [];

  const conceptSuggestions = Array.isArray(safeDraft.conceptSuggestions)
    ? safeDraft.conceptSuggestions
      .map((entry) => {
        const safeEntry = entry && typeof entry === 'object' ? entry : {};
        const refId = toSafeString(safeEntry.refId);
        if (!refId) return null;
        const id = toSafeString(safeEntry.id) || `concept:${refId}`;
        return {
          id,
          type: 'concept',
          refId,
          title: toSafeString(safeEntry.title) || 'Concept',
          text: toSafeString(safeEntry.text),
          source: toSafeString(safeEntry.source) || null,
          score: toSafeScore(safeEntry.score),
          state: normalizeSuggestionState(safeEntry.state),
          generatedBy: 'ai_agent',
          acceptedAt: toSafeString(safeEntry.acceptedAt) || null,
          discardedAt: toSafeString(safeEntry.discardedAt) || null
        };
      })
      .filter(Boolean)
    : [];

  return {
    id: toSafeString(safeDraft.id) || createId(`draft${index + 1}`),
    createdAt: toSafeString(safeDraft.createdAt) || new Date().toISOString(),
    mode: SUPPORTED_MODE,
    status: toSafeString(safeDraft.status) || 'pending',
    generatedBy: 'ai_agent',
    queries: Array.isArray(safeDraft.queries)
      ? safeDraft.queries.map(entry => toSafeString(entry)).filter(Boolean).slice(0, MAX_INITIAL_QUERIES)
      : [],
    itemSuggestions,
    conceptSuggestions
  };
};

const toPlainObject = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  return value;
};

const ensureAgentMetaWorkspace = (concept) => {
  const currentMetaRaw = toPlainObject(concept?.get('meta'));
  const currentMeta = (currentMetaRaw && typeof currentMetaRaw === 'object' && !Array.isArray(currentMetaRaw))
    ? { ...currentMetaRaw }
    : {};
  const currentWorkspaceRaw = toPlainObject(currentMeta.workspace);
  const currentWorkspace = (currentWorkspaceRaw && typeof currentWorkspaceRaw === 'object' && !Array.isArray(currentWorkspaceRaw))
    ? { ...currentWorkspaceRaw }
    : {};
  currentMeta.workspace = currentWorkspace;
  concept.set('meta', currentMeta, { strict: false });
  return currentMeta;
};

const getStoredSuggestionDrafts = (concept) => {
  const meta = toPlainObject(concept?.get('meta'));
  const workspace = meta && typeof meta === 'object' && !Array.isArray(meta) ? toPlainObject(meta.workspace) : null;
  const raw = workspace && typeof workspace === 'object' && !Array.isArray(workspace)
    ? (workspace.agentSuggestionDrafts || [])
    : [];
  const drafts = Array.isArray(raw) ? raw : [];
  return drafts.map((draft, index) => normalizeStoredSuggestionDraft(draft, index));
};

const setStoredSuggestionDrafts = (concept, drafts) => {
  const safeDrafts = (Array.isArray(drafts) ? drafts : [])
    .map((draft, index) => normalizeStoredSuggestionDraft(draft, index))
    .slice(-MAX_STORED_SUGGESTION_DRAFTS);
  const nextMeta = ensureAgentMetaWorkspace(concept);
  nextMeta.workspace.agentSuggestionDrafts = safeDrafts;
  concept.set('meta', nextMeta, { strict: false });
  concept.markModified('meta');
};

const appendAgentWorkspaceMeta = ({ concept, timestampIso, mode, queries, plan, candidateItems }) => {
  const metaDoc = ensureAgentMetaWorkspace(concept);
  const previousMeta = metaDoc.workspace.agentBuilds || [];
  const nextEntry = {
    createdAt: timestampIso,
    mode,
    queries: Array.isArray(queries) ? queries : [],
    candidate_items_count: Array.isArray(candidateItems) ? candidateItems.length : 0,
    outline: Array.isArray(plan?.outline) ? plan.outline : [],
    claims: Array.isArray(plan?.claims) ? plan.claims : [],
    open_questions: Array.isArray(plan?.open_questions) ? plan.open_questions : [],
    next_actions: Array.isArray(plan?.next_actions) ? plan.next_actions : []
  };
  const nextBuilds = [...(Array.isArray(previousMeta) ? previousMeta : []), nextEntry].slice(-20);
  metaDoc.workspace.agentBuilds = nextBuilds;
  concept.set('meta', metaDoc, { strict: false });
  concept.markModified('meta');
};

const attachPlanToWorkspace = ({ workspaceInput, plan, candidateItems, timestampLabel }) => {
  const candidateByKey = new Map();
  (Array.isArray(candidateItems) ? candidateItems : []).forEach((item) => {
    const key = `${item.type}:${item.id}`;
    if (!candidateByKey.has(key)) candidateByKey.set(key, item);
  });

  const safePlan = normalizePlan(plan);
  let workspace = ensureWorkspace({ workspace: workspaceInput || {} });
  let createdGroups = 0;
  let linkedItems = 0;

  safePlan.groups.forEach((group, groupIndex) => {
    const title = formatGroupTitle(timestampLabel, group?.title || `Group ${groupIndex + 1}`);
    const description = toSafeString(group?.description).slice(0, 500);
    const previousGroupIds = new Set((workspace.groups || []).map((entry) => String(entry.id)));
    workspace = applyPatchOp(workspace, {
      op: 'addGroup',
      payload: { title, description }
    });
    const created = (workspace.groups || []).find((entry) => !previousGroupIds.has(String(entry.id)));
    if (!created || !created.id) {
      throw new Error(`Failed to create workspace group for "${title}".`);
    }
    createdGroups += 1;

    const refs = Array.isArray(group?.item_refs) ? group.item_refs : [];
    refs.forEach((ref) => {
      const type = normalizeRefType(ref?.type);
      const refId = toSafeString(ref?.id);
      const why = toSafeString(ref?.why);
      if (!type || !refId) return;
      const candidate = candidateByKey.get(`${type}:${refId}`);
      if (!candidate) return;
      const inlineTitle = toSafeString(candidate.title) || `${type} ${refId}`;
      const inlineText = why ? `Agent rationale: ${why}` : '';
      workspace = applyPatchOp(workspace, {
        op: 'addItem',
        payload: {
          type,
          refId,
          sectionId: String(created.id),
          stage: 'working',
          inlineTitle,
          inlineText
        }
      });
      linkedItems += 1;
    });
  });

  return {
    workspace,
    createdGroups,
    linkedItems,
    outlineHeadings: safePlan.outline.length,
    claims: safePlan.claims.length,
    openQuestions: safePlan.open_questions.length
  };
};

const buildSemanticResultSet = async ({ userId, queries, types }) => {
  const semanticResults = [];
  for (const query of queries) {
    try {
      const response = await semanticSearch({
        userId,
        query,
        types,
        limit: SEARCH_LIMIT_PER_QUERY
      });
      const matches = Array.isArray(response?.results) ? response.results : [];
      semanticResults.push(...matches);
    } catch (error) {
      const transientUpstreamError = isTransientSemanticUpstreamError(error);
      console.warn('[CONCEPT-AGENT] semantic search query failed, continuing with fallback', {
        query,
        status: error?.status || error?.response?.status || null,
        message: error?.message || '',
        stopEarly: transientUpstreamError
      });
      if (transientUpstreamError) break;
    }
  }
  return semanticResults;
};

async function createConceptSuggestionDraft({ conceptId, userId, mode = SUPPORTED_MODE, maxLoops } = {}) {
  const safeUserId = toSafeString(userId);
  const safeConceptId = toSafeString(conceptId);
  const safeMode = toSafeString(mode || SUPPORTED_MODE).toLowerCase();
  const loops = clampMaxLoops(maxLoops === undefined ? 2 : maxLoops);

  if (!safeUserId) {
    const error = new Error('createConceptSuggestionDraft requires userId.');
    error.status = 400;
    throw error;
  }
  if (!safeConceptId) {
    const error = new Error('createConceptSuggestionDraft requires conceptId.');
    error.status = 400;
    throw error;
  }
  if (safeMode !== SUPPORTED_MODE) {
    const error = new Error(`Unsupported mode "${safeMode}". Only "${SUPPORTED_MODE}" is currently supported.`);
    error.status = 400;
    throw error;
  }

  const concept = await resolveConceptByParam({ conceptId: safeConceptId, userId: safeUserId });
  if (!concept) {
    const error = new Error('Concept not found.');
    error.status = 404;
    throw error;
  }

  const conceptTitle = toSafeString(concept.name || safeConceptId);
  const conceptDescription = toSafeString(concept.description);
  if (!conceptTitle && !conceptDescription) {
    const error = new Error('Concept title or description is required for suggestions.');
    error.status = 400;
    throw error;
  }

  const initialQueries = buildInitialQueries({
    title: conceptTitle,
    description: conceptDescription
  });
  if (!initialQueries.length) {
    const error = new Error('Failed to build initial semantic queries from concept title/description.');
    error.status = 400;
    throw error;
  }

  let itemSuggestions = [];
  let conceptSuggestions = [];

  if (loops >= 1) {
    const semanticResults = await buildSemanticResultSet({
      userId: safeUserId,
      queries: initialQueries,
      types: ['article', 'highlight', 'notebook_block', 'question', 'concept']
    });

    const built = await buildSuggestionItems({
      queryResults: semanticResults,
      userId: safeUserId,
      concept
    });
    itemSuggestions = built.itemSuggestions;
    conceptSuggestions = built.conceptSuggestions;

    if (itemSuggestions.length === 0 && conceptSuggestions.length === 0) {
      const fallback = await buildFallbackSuggestionsFromLibrary({
        userId: safeUserId,
        conceptTitle,
        conceptDescription,
        concept
      });
      itemSuggestions = fallback.itemSuggestions;
      conceptSuggestions = fallback.conceptSuggestions;
    }
  }

  const draft = {
    id: createId('draft'),
    createdAt: new Date().toISOString(),
    mode: safeMode,
    status: 'pending',
    generatedBy: 'ai_agent',
    queries: initialQueries,
    itemSuggestions,
    conceptSuggestions
  };

  const drafts = getStoredSuggestionDrafts(concept);
  drafts.push(draft);
  setStoredSuggestionDrafts(concept, drafts);
  await concept.save();

  return {
    conceptId: String(concept._id),
    draftId: draft.id,
    summary: {
      itemSuggestions: draft.itemSuggestions.length,
      conceptSuggestions: draft.conceptSuggestions.length
    }
  };
}

async function getConceptSuggestionDrafts({ conceptId, userId } = {}) {
  const safeUserId = toSafeString(userId);
  const safeConceptId = toSafeString(conceptId);
  if (!safeUserId || !safeConceptId) {
    const error = new Error('conceptId and userId are required.');
    error.status = 400;
    throw error;
  }

  const concept = await resolveConceptByParam({ conceptId: safeConceptId, userId: safeUserId });
  if (!concept) {
    const error = new Error('Concept not found.');
    error.status = 404;
    throw error;
  }

  const drafts = getStoredSuggestionDrafts(concept)
    .map((draft) => ({
      ...draft,
      itemSuggestions: draft.itemSuggestions.filter(entry => entry.state !== 'discarded'),
      conceptSuggestions: draft.conceptSuggestions.filter(entry => entry.state !== 'discarded')
    }))
    .filter((draft) => draft.itemSuggestions.length > 0 || draft.conceptSuggestions.length > 0);

  return {
    conceptId: String(concept._id),
    drafts
  };
}

const findInboxSectionId = (workspace) => {
  const groups = Array.isArray(workspace?.groups) ? workspace.groups : [];
  const inbox = groups.find(group => toSafeString(group?.id) === 'inbox');
  if (inbox?.id) return String(inbox.id);
  return groups[0]?.id ? String(groups[0].id) : 'inbox';
};

async function mutateConceptSuggestionDraft({ conceptId, userId, draftId, action, suggestionIds } = {}) {
  const safeUserId = toSafeString(userId);
  const safeConceptId = toSafeString(conceptId);
  const safeDraftId = toSafeString(draftId);
  const safeAction = toSafeString(action).toLowerCase();

  if (!safeUserId || !safeConceptId || !safeDraftId) {
    const error = new Error('conceptId, draftId, and userId are required.');
    error.status = 400;
    throw error;
  }
  if (!['accept', 'discard'].includes(safeAction)) {
    const error = new Error('action must be "accept" or "discard".');
    error.status = 400;
    throw error;
  }

  const concept = await resolveConceptByParam({ conceptId: safeConceptId, userId: safeUserId });
  if (!concept) {
    const error = new Error('Concept not found.');
    error.status = 404;
    throw error;
  }

  const drafts = getStoredSuggestionDrafts(concept);
  const draft = drafts.find(entry => entry.id === safeDraftId);
  if (!draft) {
    const error = new Error('Suggestion draft not found.');
    error.status = 404;
    throw error;
  }

  const idFilter = new Set(
    (Array.isArray(suggestionIds) ? suggestionIds : [])
      .map(entry => toSafeString(entry))
      .filter(Boolean)
  );

  const nowIso = new Date().toISOString();
  const canMutate = (entry) => {
    if (!entry || entry.state !== 'pending') return false;
    if (!idFilter.size) return true;
    return idFilter.has(entry.id);
  };

  let updatedCount = 0;
  const acceptedItemSuggestions = [];

  draft.itemSuggestions = draft.itemSuggestions.map((entry) => {
    if (!canMutate(entry)) return entry;
    updatedCount += 1;
    if (safeAction === 'accept') {
      acceptedItemSuggestions.push(entry);
      return {
        ...entry,
        state: 'accepted',
        acceptedAt: nowIso,
        discardedAt: null
      };
    }
    return {
      ...entry,
      state: 'discarded',
      discardedAt: nowIso
    };
  });

  draft.conceptSuggestions = draft.conceptSuggestions.map((entry) => {
    if (!canMutate(entry)) return entry;
    updatedCount += 1;
    if (safeAction === 'accept') {
      return {
        ...entry,
        state: 'accepted',
        acceptedAt: nowIso,
        discardedAt: null
      };
    }
    return {
      ...entry,
      state: 'discarded',
      discardedAt: nowIso
    };
  });

  let workspaceSummary = null;
  if (safeAction === 'accept') {
    let workspace = ensureWorkspace({ workspace: concept.workspace || {} });
    const inboxSectionId = findInboxSectionId(workspace);
    const attachedItems = Array.isArray(workspace?.attachedItems)
      ? workspace.attachedItems
      : (Array.isArray(workspace?.items) ? workspace.items : []);
    const existingRefKeys = new Set(
      attachedItems.map((item) => `${toSafeString(item?.type)}:${toSafeString(item?.refId)}`)
    );

    let addedToInbox = 0;
    acceptedItemSuggestions.forEach((entry) => {
      const type = normalizeSuggestionItemType(entry.type);
      const refId = toSafeString(entry.refId);
      if (!type || !refId) return;
      const key = `${type}:${refId}`;
      if (existingRefKeys.has(key)) return;
      workspace = applyPatchOp(workspace, {
        op: 'addItem',
        payload: {
          type,
          refId,
          groupId: inboxSectionId,
          stage: 'inbox',
          inlineTitle: toSafeString(entry.title),
          inlineText: 'AI generated suggestion'
        }
      });
      existingRefKeys.add(key);
      addedToInbox += 1;
    });

    workspaceSummary = { addedToInbox };
    if (addedToInbox > 0) {
      concept.workspace = workspace;
      concept.markModified('workspace');
    }
  }

  draft.status = 'pending';
  setStoredSuggestionDrafts(concept, drafts);

  if (updatedCount > 0 || (workspaceSummary && workspaceSummary.addedToInbox > 0)) {
    await concept.save();
  }

  return {
    conceptId: String(concept._id),
    draftId: draft.id,
    updatedCount,
    workspaceSummary
  };
}

async function buildConceptWorkspace({ conceptId, userId, mode = SUPPORTED_MODE, maxLoops } = {}) {
  const safeUserId = toSafeString(userId);
  const safeConceptId = toSafeString(conceptId);
  const safeMode = toSafeString(mode || SUPPORTED_MODE).toLowerCase();
  const loops = clampMaxLoops(maxLoops === undefined ? 2 : maxLoops);

  if (!safeUserId) {
    const error = new Error('buildConceptWorkspace requires userId.');
    error.status = 400;
    throw error;
  }
  if (!safeConceptId) {
    const error = new Error('buildConceptWorkspace requires conceptId.');
    error.status = 400;
    throw error;
  }
  if (safeMode !== SUPPORTED_MODE) {
    const error = new Error(`Unsupported mode "${safeMode}". Only "${SUPPORTED_MODE}" is currently supported.`);
    error.status = 400;
    throw error;
  }

  const concept = await resolveConceptByParam({ conceptId: safeConceptId, userId: safeUserId });
  if (!concept) {
    const error = new Error('Concept not found.');
    error.status = 404;
    throw error;
  }

  const conceptTitle = toSafeString(concept.name || safeConceptId);
  const conceptDescription = toSafeString(concept.description);
  if (!conceptTitle) {
    const error = new Error('Concept is missing a usable title/name.');
    error.status = 400;
    throw error;
  }

  const initialQueries = buildInitialQueries({
    title: conceptTitle,
    description: conceptDescription
  });
  if (!initialQueries.length) {
    const error = new Error('Failed to build initial semantic queries from concept title/description.');
    error.status = 400;
    throw error;
  }

  let candidateItems = [];
  if (loops >= 1) {
    const semanticResults = await buildSemanticResultSet({
      userId: safeUserId,
      queries: initialQueries,
      types: ['article', 'highlight']
    });

    candidateItems = await buildCandidateItems({
      queryResults: semanticResults,
      userId: safeUserId
    });

    if (candidateItems.length === 0) {
      candidateItems = await buildFallbackCandidateItemsFromLibrary({
        userId: safeUserId,
        conceptTitle,
        conceptDescription
      });
    }
  }

  if (loops === 1) {
    return {
      createdGroups: 0,
      linkedItems: 0,
      outlineHeadings: 0,
      claims: 0,
      openQuestions: 0
    };
  }

  let planResponse;
  try {
    planResponse = await planConcept({
      concept_title: conceptTitle,
      concept_description: conceptDescription || null,
      candidate_items: candidateItems
    });
  } catch (error) {
    if (!isTransientSemanticUpstreamError(error)) throw error;
    console.warn('[AGENT-BUILD] planConcept unavailable, using local fallback plan', {
      conceptId: safeConceptId,
      userId: safeUserId,
      status: error?.status || error?.response?.status || null,
      message: error?.message || ''
    });
    planResponse = buildLocalFallbackPlan({
      conceptTitle,
      conceptDescription,
      initialQueries,
      candidateItems
    });
  }
  const plan = normalizePlan(planResponse);
  const timestampIso = new Date().toISOString();
  const timestampLabel = timestampIso.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');

  const attached = attachPlanToWorkspace({
    workspaceInput: concept.workspace || {},
    plan,
    candidateItems,
    timestampLabel
  });

  concept.workspace = attached.workspace;
  concept.markModified('workspace');
  appendAgentWorkspaceMeta({
    concept,
    timestampIso,
    mode: safeMode,
    queries: initialQueries,
    plan,
    candidateItems
  });
  await concept.save();

  return {
    createdGroups: attached.createdGroups,
    linkedItems: attached.linkedItems,
    outlineHeadings: attached.outlineHeadings,
    claims: attached.claims,
    openQuestions: attached.openQuestions
  };
}

module.exports = {
  buildConceptWorkspace,
  createConceptSuggestionDraft,
  getConceptSuggestionDrafts,
  mutateConceptSuggestionDraft
};
