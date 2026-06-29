import { buildWikiCreatePayload } from './wikiCreate';

export const HIGHLIGHT_ACTION_CONTEXT_KEY = 'noeis.highlightActionContext';

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const cleanTopic = (value = '') => clean(value).replace(/[.?!]+$/g, '').trim();

export const parseHighlightToQuestionIntent = (value = '') => {
  const text = clean(value);
  if (!text) return null;
  const patterns = [
    {
      regex: /^turn(?:\s+these|\s+the(?:se)?)?\s+highlights?\s+into\s+(?:a\s+)?question\.?$/i,
      useContextHighlights: true
    },
    {
      regex: /^turn(?:\s+my)?\s+highlights?\s+(?:on|about|from)\s+(.+?)\s+into\s+(?:a\s+)?question\.?$/i,
      topicIndex: 1
    },
    {
      regex: /^turn\s+(.+?)\s+highlights?\s+into\s+(?:a\s+)?question\.?$/i,
      topicIndex: 1
    },
    {
      regex: /^(?:make|create)\s+(?:a\s+)?question\s+from(?:\s+my)?\s+highlights?\s+(?:on|about)\s+(.+?)\.?$/i,
      topicIndex: 1
    }
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) continue;
    const topic = cleanTopic(match[pattern.topicIndex] || '');
    const label = pattern.useContextHighlights
      ? 'Turn selected highlights into a question'
      : `Turn highlights on "${topic.slice(0, 48)}" into a question`;
    return {
      topic,
      label,
      sourceText: text,
      useContextHighlights: Boolean(pattern.useContextHighlights)
    };
  }
  return null;
};

export const parseHighlightToWikiSectionIntent = (value = '') => {
  const text = clean(value);
  if (!text) return null;
  const patterns = [
    {
      regex: /^turn(?:\s+these|\s+the(?:se)?)?\s+highlights?\s+into\s+(?:a\s+)?wiki\s+section(?:\s+draft)?\.?$/i,
      useContextHighlights: true
    },
    {
      regex: /^turn(?:\s+my)?\s+highlights?\s+(?:on|about|from)\s+(.+?)\s+into\s+(?:a\s+)?wiki\s+section(?:\s+draft)?\.?$/i,
      topicIndex: 1
    },
    {
      regex: /^turn\s+(.+?)\s+highlights?\s+into\s+(?:a\s+)?wiki\s+section(?:\s+draft)?\.?$/i,
      topicIndex: 1
    },
    {
      regex: /^(?:draft|create)\s+(?:a\s+)?wiki\s+section\s+from(?:\s+my)?\s+highlights?\s+(?:on|about)\s+(.+?)\.?$/i,
      topicIndex: 1
    }
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) continue;
    const topic = cleanTopic(match[pattern.topicIndex] || '');
    const label = pattern.useContextHighlights
      ? 'Turn selected highlights into a wiki section draft'
      : `Turn highlights on "${topic.slice(0, 48)}" into a wiki section`;
    return {
      topic,
      label,
      sourceText: text,
      useContextHighlights: Boolean(pattern.useContextHighlights)
    };
  }
  return null;
};

export const normalizeHighlightRecord = (item = {}) => {
  const id = String(item._id || item.id || '').trim();
  if (!id) return null;
  return {
    _id: id,
    text: String(item.text || item.snippet || '').trim(),
    articleId: String(item.articleId || item.parentObjectId || '').trim(),
    articleTitle: String(item.articleTitle || item.title || '').trim(),
    tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : []
  };
};

export const readHighlightActionContext = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(HIGHLIGHT_ACTION_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const highlights = (Array.isArray(parsed?.highlights) ? parsed.highlights : [])
      .map(normalizeHighlightRecord)
      .filter(Boolean);
    if (highlights.length === 0) return null;
    return { highlights, updatedAt: parsed?.updatedAt || null };
  } catch (_error) {
    return null;
  }
};

export const writeHighlightActionContext = (highlights = []) => {
  if (typeof window === 'undefined') return;
  const normalized = highlights.map(normalizeHighlightRecord).filter(Boolean);
  if (normalized.length === 0) {
    window.sessionStorage.removeItem(HIGHLIGHT_ACTION_CONTEXT_KEY);
    return;
  }
  window.sessionStorage.setItem(HIGHLIGHT_ACTION_CONTEXT_KEY, JSON.stringify({
    highlights: normalized,
    updatedAt: new Date().toISOString()
  }));
};

export const scoreHighlightMatch = (item = {}, topic = '') => {
  const label = [
    item.text,
    item.note,
    item.snippet,
    item.articleTitle,
    item.title,
    ...(Array.isArray(item.tags) ? item.tags : [])
  ].filter(Boolean).join(' ');
  const normalizedLabel = clean(label).toLowerCase();
  const normalizedQuery = clean(topic).toLowerCase();
  if (!normalizedLabel || !normalizedQuery) return 0;
  if (normalizedLabel.includes(normalizedQuery)) return 100;
  const topicWords = normalizedQuery.split(/\s+/).filter(Boolean);
  if (topicWords.length === 0) return 0;
  const matchedWords = topicWords.filter(word => normalizedLabel.includes(word));
  if (matchedWords.length === 0) return 0;
  return 40 + Math.round((matchedWords.length / topicWords.length) * 50);
};

export const resolveHighlightsForIntent = ({
  intent = {},
  searchGroups = {},
  topic = '',
  limit = 10
} = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 10));
  if (intent.useContextHighlights) {
    const context = readHighlightActionContext();
    if (context?.highlights?.length) {
      return context.highlights.slice(0, safeLimit);
    }
  }

  const candidates = [
    ...(Array.isArray(searchGroups.highlights) ? searchGroups.highlights : []),
    ...(Array.isArray(searchGroups.claims) ? searchGroups.claims : []),
    ...(Array.isArray(searchGroups.evidence) ? searchGroups.evidence : [])
  ]
    .map(normalizeHighlightRecord)
    .filter(Boolean);

  const safeTopic = cleanTopic(topic);
  if (!safeTopic) return candidates.slice(0, safeLimit);

  const ranked = candidates
    .map((item, index) => ({ item, index, score: scoreHighlightMatch(item, safeTopic) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (ranked.length > 0) {
    return ranked.slice(0, safeLimit).map(({ item }) => item);
  }
  return candidates.slice(0, safeLimit);
};

export const deriveQuestionDraftText = ({ highlights = [], topic = '' } = {}) => {
  const safeTopic = cleanTopic(topic);
  const count = highlights.length;
  if (safeTopic) {
    return count > 1
      ? `What should I conclude about ${safeTopic} from these ${count} highlights?`
      : `What should I conclude about ${safeTopic}?`;
  }
  if (count === 1) {
    const snippet = clean(highlights[0]?.text || '');
    if (snippet.length >= 12 && snippet.length <= 180) {
      return snippet.endsWith('?') ? snippet : `What does this imply: ${snippet.slice(0, 140)}?`;
    }
    return 'What does this highlight imply?';
  }
  return `What question connects these ${count} highlights?`;
};

export const deriveWikiSectionTitle = ({ highlights = [], topic = '' } = {}) => {
  const safeTopic = cleanTopic(topic);
  if (safeTopic) return safeTopic.slice(0, 120);
  const firstTag = highlights.flatMap(item => item.tags || []).find(Boolean);
  if (firstTag) return String(firstTag).slice(0, 120);
  const firstText = clean(highlights[0]?.text || '');
  if (firstText) {
    return firstText.split(/\s+/).slice(0, 8).join(' ').slice(0, 120);
  }
  return highlights.length > 1 ? 'Highlight cluster' : 'Highlight section';
};

export const buildQuestionPayloadFromHighlights = ({
  highlights = [],
  topic = '',
  conceptName = '',
  createId = () => `block-${Date.now()}`
} = {}) => {
  const normalized = highlights.map(normalizeHighlightRecord).filter(Boolean);
  const linkedHighlightIds = normalized.map(item => item._id);
  const text = deriveQuestionDraftText({ highlights: normalized, topic });
  const resolvedConcept = clean(conceptName)
    || normalized.flatMap(item => item.tags || []).find(Boolean)
    || '';
  const blocks = [
    { id: createId(), type: 'paragraph', text },
    ...normalized.map(item => ({
      id: createId(),
      type: 'highlight-ref',
      highlightId: item._id,
      text: item.text || ''
    }))
  ];
  return {
    text,
    conceptName: resolvedConcept,
    blocks,
    linkedHighlightIds
  };
};

export const buildWikiSectionPayloadFromHighlights = ({
  highlights = [],
  topic = '',
  label = ''
} = {}) => {
  const normalized = highlights.map(normalizeHighlightRecord).filter(Boolean);
  const highlightIds = normalized.map(item => item._id);
  const title = deriveWikiSectionTitle({ highlights: normalized, topic });
  const combinedText = normalized
    .map(item => clean(item.text))
    .filter(Boolean)
    .join(' ')
    .slice(0, 800);
  const seedText = combinedText || `Draft wiki section from ${normalized.length} highlight${normalized.length === 1 ? '' : 's'}.`;
  const payload = buildWikiCreatePayload({
    type: 'highlight',
    title,
    text: seedText,
    label: label || `${normalized.length} highlight${normalized.length === 1 ? '' : 's'} → wiki section`,
    objectIds: highlightIds,
    sourceScope: 'selected_sources',
    pageType: 'topic'
  });
  return {
    ...(payload && typeof payload === 'object' ? payload : {}),
    initialSourceRefs: normalized.slice(0, 8).map(item => ({
      type: 'highlight',
      objectId: item._id,
      parentObjectId: item.articleId || null,
      title: item.articleTitle || 'Highlight',
      snippet: String(item.text || '').slice(0, 1000),
      addedBy: 'user'
    }))
  };
};

export const buildQuestionReviewPath = (questionId = '') => {
  const safeId = String(questionId || '').trim();
  return safeId
    ? `/think?tab=questions&questionId=${encodeURIComponent(safeId)}`
    : '/think?tab=questions';
};
