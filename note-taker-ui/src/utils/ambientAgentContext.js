const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export const stripAmbientMarkup = (value = '') => (
  String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
);

export const truncateAmbientText = (value = '', limit = 280) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

export const collectAmbientBlockText = (blocks = [], limit = 8) => (
  (Array.isArray(blocks) ? blocks : [])
    .map((block) => clean(block?.text))
    .filter(Boolean)
    .slice(0, limit)
    .join(' ')
);

export const makeAmbientRelatedItem = ({
  type = '',
  id = '',
  title = '',
  snippet = ''
} = {}) => {
  const safeTitle = clean(title);
  const safeId = clean(id);
  if (!safeTitle && !safeId) return null;
  return {
    type: clean(type),
    id: safeId,
    title: safeTitle,
    snippet: truncateAmbientText(snippet, 180)
  };
};

const dedupeRelatedItems = (items = [], limit = 8) => {
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const normalized = makeAmbientRelatedItem(item);
    if (!normalized) continue;
    const key = `${clean(normalized.type).toLowerCase()}:${clean(normalized.id).toLowerCase() || clean(normalized.title).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
};

const dedupeLines = (values = [], limit = 6) => {
  const seen = new Set();
  const output = [];
  for (const value of Array.isArray(values) ? values : []) {
    const safe = truncateAmbientText(value, 180);
    const key = safe.toLowerCase();
    if (!safe || seen.has(key)) continue;
    seen.add(key);
    output.push(safe);
    if (output.length >= limit) break;
  }
  return output;
};

const extractQuestionLikeLines = (values = [], limit = 6) => {
  const candidates = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const safe = clean(value);
    if (!safe) return;
    safe
      .split(/(?<=[?])\s+|\n+/)
      .map((line) => clean(line))
      .filter(Boolean)
      .forEach((line) => {
        if (line.includes('?')) candidates.push(line);
      });
  });
  return dedupeLines(candidates, limit);
};

const getUrlHostLabel = (url = '') => {
  const safe = clean(url);
  if (!safe) return '';
  try {
    return clean(new URL(safe).hostname.replace(/^www\./i, ''));
  } catch (_error) {
    return '';
  }
};

const collectTags = (article = {}) => {
  const seen = new Set();
  const output = [];
  const push = (value) => {
    const safe = clean(value);
    const key = safe.toLowerCase();
    if (!safe || seen.has(key)) return;
    seen.add(key);
    output.push(safe);
  };
  (Array.isArray(article?.tags) ? article.tags : []).forEach(push);
  (Array.isArray(article?.highlights) ? article.highlights : []).forEach((highlight) => {
    (Array.isArray(highlight?.tags) ? highlight.tags : []).forEach(push);
  });
  return output;
};

const buildArticleRelatedItems = (article = {}) => {
  const highlights = Array.isArray(article?.highlights) ? article.highlights : [];
  const tags = collectTags(article);
  return dedupeRelatedItems([
    ...highlights.slice(0, 3).map((highlight) => ({
      type: 'highlight',
      id: highlight?._id,
      title: truncateAmbientText(highlight?.text || 'Highlight', 72),
      snippet: clean(highlight?.note)
        || (Array.isArray(highlight?.tags) && highlight.tags.length > 0 ? highlight.tags.join(' · ') : '')
    })),
    ...tags.slice(0, 3).map((tag) => ({
      type: 'concept',
      id: tag,
      title: tag,
      snippet: 'Linked article tag'
    }))
  ], 8);
};

const normalizeGraphConnectionItem = (row = {}, direction = 'outgoing') => {
  const itemType = direction === 'incoming'
    ? clean(row?.fromType || row?.source?.type || row?.source?.itemType)
    : clean(row?.toType || row?.target?.type || row?.target?.itemType);
  const itemId = direction === 'incoming'
    ? clean(row?.fromId || row?.source?.id || row?.source?.itemId)
    : clean(row?.toId || row?.target?.id || row?.target?.itemId);
  const item = direction === 'incoming' ? row?.source : row?.target;
  const title = clean(item?.title || row?.sourceTitle || row?.targetTitle || itemType);
  const relationType = clean(row?.relationType);
  const snippet = truncateAmbientText([
    direction === 'incoming' ? 'Uses this source' : 'Referenced from this source',
    relationType ? `relation: ${relationType}` : '',
    clean(item?.snippet || row?.snippet)
  ].filter(Boolean).join(' · '), 180);
  return makeAmbientRelatedItem({
    type: itemType,
    id: itemId,
    title,
    snippet
  });
};

const buildGraphRelatedItems = (graphConnections = {}) => {
  const outgoing = Array.isArray(graphConnections?.outgoing) ? graphConnections.outgoing : [];
  const incoming = Array.isArray(graphConnections?.incoming) ? graphConnections.incoming : [];
  return dedupeRelatedItems([
    ...incoming.slice(0, 4).map((row) => normalizeGraphConnectionItem(row, 'incoming')),
    ...outgoing.slice(0, 4).map((row) => normalizeGraphConnectionItem(row, 'outgoing'))
  ], 8);
};

const extractNotebookHighlightRefs = (entry = {}) => (
  (Array.isArray(entry?.blocks) ? entry.blocks : [])
    .filter((block) => block?.type === 'highlight-ref' || block?.type === 'highlight_embed')
    .slice(0, 4)
);

const extractNotebookQuestionRefs = (entry = {}) => (
  (Array.isArray(entry?.blocks) ? entry.blocks : [])
    .filter((block) => block?.type === 'questionRef')
    .slice(0, 4)
);

export const buildArticleAmbientContext = ({
  article = null,
  highlights: highlightsOverride = null,
  graphConnections = null,
  selectionText = ''
} = {}) => {
  const safeSelection = clean(selectionText);
  const sourceArticle = {
    ...(article || {}),
    highlights: Array.isArray(highlightsOverride)
      ? highlightsOverride
      : (Array.isArray(article?.highlights) ? article.highlights : [])
  };
  const highlights = sourceArticle.highlights;
  const tags = collectTags(sourceArticle);
  const host = getUrlHostLabel(article?.url);
  const highlightCount = highlights.length;
  const graphOutgoing = Array.isArray(graphConnections?.outgoing) ? graphConnections.outgoing.length : 0;
  const graphIncoming = Array.isArray(graphConnections?.incoming) ? graphConnections.incoming.length : 0;
  const graphRelatedItems = buildGraphRelatedItems(graphConnections);
  return {
    summary: truncateAmbientText([
      highlightCount > 0 ? `${highlightCount} saved highlight${highlightCount === 1 ? '' : 's'} attached to this article.` : '',
      graphIncoming || graphOutgoing ? `Graph traces: ${graphOutgoing} used, ${graphIncoming} used by.` : '',
      tags.length > 0 ? `Linked concepts: ${tags.slice(0, 2).join(' · ')}.` : '',
      host ? `Source host: ${host}.` : ''
    ].filter(Boolean).join(' '), 420),
    primaryText: truncateAmbientText(
      safeSelection || stripAmbientMarkup(article?.content || ''),
      1200
    ),
    openQuestions: dedupeLines([
      ...extractQuestionLikeLines([safeSelection]),
      ...extractQuestionLikeLines(highlights.map((highlight) => highlight?.note)),
      ...extractQuestionLikeLines(highlights.map((highlight) => highlight?.text))
    ], 6),
    nextActions: dedupeLines([
      safeSelection ? 'Use the selected passage as the working focus.' : '',
      highlightCount > 0 ? 'Anchor the reasoning in saved highlights from this article.' : '',
      graphIncoming > 0 ? 'Use the incoming graph traces to explain where this source already matters.' : '',
      graphOutgoing > 0 ? 'Follow the outgoing graph traces before treating this source in isolation.' : '',
      tags.length > 0 ? `Follow linked concepts: ${tags.slice(0, 2).join(' · ')}.` : ''
    ], 4),
    relatedItems: dedupeRelatedItems([
      ...buildArticleRelatedItems(sourceArticle),
      ...graphRelatedItems
    ], 10)
  };
};

export const buildConceptAmbientContext = ({
  concept = null,
  conceptQuestions = [],
  conceptSuggestions = [],
  conceptRelated = {},
  pinnedArticles = [],
  pinnedNotes = []
} = {}) => ({
  summary: truncateAmbientText(concept?.description || '', 360),
  primaryText: collectAmbientBlockText(concept?.blocks || [], 6) || truncateAmbientText(concept?.description || '', 1000),
  openQuestions: dedupeLines((Array.isArray(conceptQuestions) ? conceptQuestions : []).slice(0, 5).map((item) => item?.text), 5),
  nextActions: dedupeLines((Array.isArray(conceptSuggestions) ? conceptSuggestions : []).slice(0, 4).map((item) => item?.title || item?.name || item?.summary), 4),
  relatedItems: dedupeRelatedItems([
    ...(Array.isArray(conceptRelated?.concepts) ? conceptRelated.concepts : []).slice(0, 4).map((item) => ({
      type: 'concept',
      id: item?.objectId,
      title: item?.metadata?.name || item?.title,
      snippet: item?.snippet
    })),
    ...(Array.isArray(pinnedArticles) ? pinnedArticles : []).slice(0, 2).map((item) => ({
      type: 'article',
      id: item?._id,
      title: item?.title,
      snippet: item?.url
    })),
    ...(Array.isArray(pinnedNotes) ? pinnedNotes : []).slice(0, 2).map((item) => ({
      type: 'notebook',
      id: item?._id,
      title: item?.title,
      snippet: item?.content
    }))
  ], 8)
});

export const buildNotebookAmbientContext = ({
  entry = null
} = {}) => {
  const highlightRefs = extractNotebookHighlightRefs(entry);
  const questionRefs = extractNotebookQuestionRefs(entry);
  const tags = Array.isArray(entry?.tags) ? entry.tags.map((tag) => clean(tag)).filter(Boolean) : [];
  const primaryText = collectAmbientBlockText(entry?.blocks || [], 8) || stripAmbientMarkup(entry?.content || '');
  return {
    summary: truncateAmbientText(entry?.title || 'Notebook note', 220),
    primaryText: truncateAmbientText(primaryText, 1200),
    openQuestions: dedupeLines([
      ...questionRefs.map((block) => block?.text),
      ...extractQuestionLikeLines([primaryText])
    ], 6),
    nextActions: dedupeLines([
      highlightRefs.length > 0 ? 'Use the embedded highlights already attached to this note.' : '',
      tags.length > 0 ? `Follow linked concepts from this note: ${tags.slice(0, 2).join(' · ')}.` : ''
    ], 4),
    relatedItems: dedupeRelatedItems([
      ...tags.slice(0, 4).map((tag) => ({
        type: 'concept',
        id: tag,
        title: tag,
        snippet: 'Notebook tag'
      })),
      ...highlightRefs.map((block) => ({
        type: 'highlight',
        id: block?.highlightId || block?.id,
        title: truncateAmbientText(block?.text || 'Highlight reference', 72),
        snippet: tags.length > 0 ? tags.join(' · ') : 'Notebook highlight'
      })),
      ...questionRefs.map((block) => ({
        type: 'question',
        id: block?.questionId || block?.id,
        title: truncateAmbientText(block?.text || 'Question reference', 72),
        snippet: tags.length > 0 ? tags.join(' · ') : 'Notebook question'
      }))
    ], 8)
  };
};

export const buildQuestionAmbientContext = ({
  question = null,
  questionRelated = {}
} = {}) => ({
  summary: truncateAmbientText(question?.text || '', 280),
  primaryText: truncateAmbientText(
    collectAmbientBlockText(question?.blocks || [], 8) || question?.text || '',
    1200
  ),
  openQuestions: dedupeLines([question?.text], 4),
  nextActions: [],
  relatedItems: dedupeRelatedItems([
    clean(question?.linkedTagName) ? {
      type: 'concept',
      id: clean(question.linkedTagName),
      title: clean(question.linkedTagName),
      snippet: 'Linked concept'
    } : null,
    ...(Array.isArray(questionRelated?.concepts) ? questionRelated.concepts : []).slice(0, 4).map((item) => ({
      type: 'concept',
      id: item?.objectId,
      title: item?.metadata?.name || item?.title,
      snippet: item?.snippet
    })),
    ...(Array.isArray(questionRelated?.highlights) ? questionRelated.highlights : []).slice(0, 3).map((item) => ({
      type: 'highlight',
      id: item?.objectId,
      title: item?.title || 'Highlight',
      snippet: item?.snippet || item?.metadata?.articleTitle
    }))
  ], 8)
});

export const buildHandoffAmbientContext = ({
  handoff = null
} = {}) => ({
  summary: truncateAmbientText(handoff?.checkpoint?.summary || handoff?.objective || handoff?.title || '', 360),
  primaryText: truncateAmbientText(handoff?.objective || '', 1200),
  openQuestions: dedupeLines(Array.isArray(handoff?.checkpoint?.openQuestions) ? handoff.checkpoint.openQuestions : [], 6),
  nextActions: dedupeLines(
    Array.isArray(handoff?.checkpoint?.nextActions) && handoff.checkpoint.nextActions.length > 0
      ? handoff.checkpoint.nextActions
      : (Array.isArray(handoff?.plan?.steps)
        ? handoff.plan.steps.filter((step) => step?.status !== 'completed').slice(0, 4).map((step) => step?.title)
        : []),
    6
  ),
  relatedItems: []
});

export const buildHomeAmbientContext = ({
  homeWorkingSet = {},
  recentTargets = []
} = {}) => ({
  summary: `Think home currently has ${(homeWorkingSet?.notebooks || []).length} recent notes, ${(homeWorkingSet?.concepts || []).length} concepts, and ${(homeWorkingSet?.questions || []).length} open questions in motion.`,
  primaryText: '',
  openQuestions: dedupeLines((Array.isArray(homeWorkingSet?.questions) ? homeWorkingSet.questions : []).slice(0, 4).map((item) => item?.text), 4),
  nextActions: dedupeLines((Array.isArray(recentTargets) ? recentTargets : []).slice(0, 4).map((item) => item?.title), 4),
  relatedItems: dedupeRelatedItems([
    ...(Array.isArray(homeWorkingSet?.notebooks) ? homeWorkingSet.notebooks : []).slice(0, 2).map((item) => ({
      type: 'notebook',
      id: item?._id,
      title: item?.title,
      snippet: item?.content
    })),
    ...(Array.isArray(homeWorkingSet?.concepts) ? homeWorkingSet.concepts : []).slice(0, 2).map((item) => ({
      type: 'concept',
      id: item?._id,
      title: item?.name,
      snippet: item?.description
    })),
    ...(Array.isArray(homeWorkingSet?.questions) ? homeWorkingSet.questions : []).slice(0, 2).map((item) => ({
      type: 'question',
      id: item?._id,
      title: item?.text,
      snippet: item?.linkedTagName
    }))
  ], 8)
});
