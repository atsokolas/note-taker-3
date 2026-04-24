const mongoose = require('mongoose');
const { buildAgentPlanner } = require('./agentWorkerRoles');
const { buildProposalBundle } = require('./agentProposalBundles');
const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');

const MAX_LIMIT = 12;
const DEFAULT_LIMIT = 6;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 16;
const SEARCH_MODEL_LIMIT = 6;
const MODEL_HISTORY_LIMIT = 6;
const SEARCH_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those',
  'your', 'you', 'are', 'was', 'were', 'have', 'has', 'had', 'will',
  'would', 'could', 'should', 'what', 'when', 'where', 'which', 'who',
  'whom', 'why', 'how', 'into', 'onto', 'about', 'between', 'within',
  'their', 'there', 'then', 'than'
]);

const toSafeString = (value) => String(value || '').trim();
const stripHtml = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);
const truncate = (value, limit = 220) => {
  const clean = stripHtml(value);
  if (clean.length <= limit) return clean;
  const visible = clean.slice(0, Math.max(0, limit));
  const punctuationMatches = [...visible.matchAll(/[.?!](?=\s|$)/g)];
  const lastPunctuationIndex = punctuationMatches.length > 0
    ? punctuationMatches.at(-1).index + 1
    : -1;
  if (lastPunctuationIndex >= Math.floor(limit * 0.55)) {
    return clean.slice(0, lastPunctuationIndex).trim();
  }
  const wordBoundary = visible.lastIndexOf(' ');
  if (wordBoundary >= Math.floor(limit * 0.55)) {
    return `${visible.slice(0, wordBoundary).trim()}...`;
  }
  return `${visible.trim()}...`;
};
const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeAmbientContextMetadata = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const relatedItems = Array.isArray(source.relatedItems)
    ? source.relatedItems
        .map((item) => ({
          type: toSafeString(item?.type).toLowerCase(),
          id: toSafeString(item?.id),
          title: toSafeString(item?.title) || toSafeString(item?.name),
          snippet: truncate(item?.snippet || '')
        }))
        .filter((item) => item.title || item.id)
        .slice(0, 8)
    : [];
  const openQuestions = Array.isArray(source.openQuestions)
    ? source.openQuestions.map((item) => truncate(item, 180)).filter(Boolean).slice(0, 6)
    : [];
  const nextActions = Array.isArray(source.nextActions)
    ? source.nextActions.map((item) => truncate(item, 180)).filter(Boolean).slice(0, 6)
    : [];

  return {
    summary: truncate(source.summary || source.snippet || '', 420),
    primaryText: truncate(source.primaryText || '', 1200),
    openQuestions,
    nextActions,
    relatedItems
  };
};

const buildAmbientContextHintText = (context = {}) => {
  const safeContext = context && typeof context === 'object' ? context : {};
  const metadata = normalizeAmbientContextMetadata(safeContext.metadata);
  const relatedTitles = metadata.relatedItems
    .map((item) => item.title)
    .filter(Boolean)
    .slice(0, 8)
    .join(' ');
  return [
    toSafeString(safeContext.title),
    metadata.summary,
    metadata.primaryText,
    metadata.openQuestions.join(' '),
    metadata.nextActions.join(' '),
    relatedTitles
  ].filter(Boolean).join(' ');
};

const mergeAmbientRelatedItems = ({
  context = {},
  relatedItems = [],
  limit = DEFAULT_LIMIT
} = {}) => {
  const metadata = normalizeAmbientContextMetadata(context?.metadata);
  const ambientItems = metadata.relatedItems;
  if (ambientItems.length === 0) return relatedItems;

  const merged = [];
  const seen = new Set();
  [...ambientItems, ...(Array.isArray(relatedItems) ? relatedItems : [])].forEach((item) => {
    const type = toSafeString(item?.type).toLowerCase();
    const id = toSafeString(item?.id);
    const title = toSafeString(item?.title);
    const key = id ? `${type}:${id}` : `${type}:${title.toLowerCase()}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({
      type,
      id,
      title,
      snippet: truncate(item?.snippet || ''),
      updatedAt: item?.updatedAt || null
    });
  });

  return merged.slice(0, Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT)));
};

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const toObjectId = (value) => (
  mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null
);

const tokenize = (value = '') => {
  const tokens = String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9_-]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 3)
    .filter(token => !SEARCH_STOPWORDS.has(token));

  const deduped = [];
  const seen = new Set();
  tokens.forEach((token) => {
    if (seen.has(token)) return;
    seen.add(token);
    deduped.push(token);
  });
  return deduped.slice(0, 12);
};

const buildTokenRegex = (tokens = []) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;
  const pattern = tokens.map(escapeRegExp).join('|');
  if (!pattern) return null;
  return new RegExp(pattern, 'i');
};

const normalizeHistory = (history = []) => {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => ({
      role: toSafeString(entry?.role).toLowerCase() === 'user' ? 'user' : 'assistant',
      text: truncate(entry?.text || '', 320),
      action: toSafeString(entry?.action).toLowerCase()
    }))
    .filter((entry) => entry.text)
    .slice(-MAX_HISTORY_ITEMS);
};

const getEffectiveHistory = (history = [], currentMessage = '') => {
  const safeCurrentMessage = toSafeString(currentMessage);
  if (!safeCurrentMessage || history.length === 0) return history;
  const lastEntry = history.at(-1);
  if (lastEntry?.role === 'user' && toSafeString(lastEntry.text) === safeCurrentMessage) {
    return history.slice(0, -1);
  }
  return history;
};

const isShortFollowUp = (message = '') => {
  const safe = toSafeString(message).toLowerCase();
  if (!safe) return false;
  if (safe.length <= 20) return true;
  return /^(yes|yep|yeah|ok|okay|sure|do that|please do that|go ahead|sounds good|that one|those|use that|pull them in|bring them in|continue)$/i.test(safe);
};

const resolveConversationState = ({ message = '', history = [] }) => {
  const safeMessage = toSafeString(message);
  const normalizedHistory = normalizeHistory(history);
  const effectiveHistory = getEffectiveHistory(normalizedHistory, safeMessage);
  const reversedHistory = [...effectiveHistory].reverse();
  const previousUserMessage = reversedHistory.find((entry) => entry.role === 'user') || null;
  const previousSubstantiveUserMessage = reversedHistory.find(
    (entry) => entry.role === 'user' && !isShortFollowUp(entry.text)
  ) || null;
  const previousAssistantMessage = reversedHistory.find((entry) => entry.role === 'assistant') || null;
  const continuation = isShortFollowUp(safeMessage) && (previousUserMessage || previousAssistantMessage);
  const anchorUserMessage = previousSubstantiveUserMessage || previousUserMessage;

  if (!continuation) {
    return {
      continuation: false,
      resolvedMessage: safeMessage,
      retrievalMessage: safeMessage,
      history: effectiveHistory,
      anchorUserMessage: null,
      previousUserMessage,
      previousAssistantMessage
    };
  }

  const resolvedParts = [];
  if (anchorUserMessage?.text) {
    resolvedParts.push(`Continue the prior user request: ${anchorUserMessage.text}`);
  }
  if (previousAssistantMessage?.text) {
    resolvedParts.push(`Most recent assistant reply: ${previousAssistantMessage.text}`);
  }
  resolvedParts.push(`Latest follow-up: ${safeMessage}`);

  return {
    continuation: true,
    resolvedMessage: resolvedParts.join('. '),
    retrievalMessage: anchorUserMessage?.text
      ? `${anchorUserMessage.text} ${safeMessage}`.trim()
      : safeMessage,
    history: effectiveHistory,
    anchorUserMessage,
    previousUserMessage,
    previousAssistantMessage
  };
};

const joinLabels = (items = []) => {
  const labels = items.filter(Boolean);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
};

const looksLikeUrl = (value = '') => /^https?:\/\//i.test(toSafeString(value));
const looksLikeHostname = (value = '') => {
  const safe = toSafeString(value).toLowerCase();
  return Boolean(safe) && !safe.includes(' ') && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(safe);
};

const isLowSignalRelatedItem = (item = {}) => {
  const type = toSafeString(item?.type).toLowerCase();
  const title = toSafeString(item?.title);
  const snippet = toSafeString(item?.snippet);
  if (type !== 'source') return false;
  return looksLikeHostname(title) || looksLikeUrl(title) || looksLikeHostname(snippet) || looksLikeUrl(snippet);
};

const prepareRelatedItemsForReply = (items = [], limit = DEFAULT_LIMIT) => {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const hasRichItems = list.some((item) => !isLowSignalRelatedItem(item));
  const seenDisplay = new Set();
  const prepared = [];

  list.forEach((item) => {
    const title = toSafeString(item?.title);
    const snippet = truncate(item?.snippet || '', 180);
    const displayKey = `${title.toLowerCase()}|${snippet.toLowerCase()}`;

    if (hasRichItems && isLowSignalRelatedItem(item)) return;
    if (displayKey !== '|' && seenDisplay.has(displayKey)) return;
    if (displayKey !== '|') seenDisplay.add(displayKey);

    prepared.push({
      type: toSafeString(item?.type).toLowerCase(),
      id: toSafeString(item?.id),
      title,
      snippet,
      replySnippet: stripHtml(item?.snippet || ''),
      updatedAt: item?.updatedAt || null
    });
  });

  return prepared.slice(0, Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT)));
};

const buildReplyLabel = (item = {}) => {
  const safeTitle = toSafeString(item?.title);
  if (safeTitle && !isLowSignalRelatedItem(item)) return truncate(safeTitle, 56);

  const safeSnippet = truncate(item?.snippet || '', 56);
  if (safeSnippet && !looksLikeUrl(safeSnippet) && !looksLikeHostname(safeSnippet)) return safeSnippet;

  if (safeTitle) return truncate(safeTitle, 56);
  return truncate(item?.id || item?.type || 'related item', 56);
};

const isEllipsisTerminated = (value = '') => /(?:\.\.\.|…)\s*$/u.test(normalizeSentenceText(value));

const pickReplySentence = (value = '', { exclude = [] } = {}) => {
  const blocked = new Set(
    (Array.isArray(exclude) ? exclude : [exclude])
      .map((entry) => normalizeSentenceText(entry).toLowerCase())
      .filter(Boolean)
  );
  return splitIntoSentences(value).find((sentence) => {
    const safeSentence = normalizeSentenceText(sentence);
    if (!safeSentence || isBoilerplateSentence(safeSentence)) return false;
    if (isEllipsisTerminated(safeSentence)) return false;
    if (blocked.has(safeSentence.toLowerCase())) return false;
    return safeSentence.split(/\s+/).length >= 6;
  }) || '';
};

const buildReplyDetail = (item = {}) => {
  const safeSnippet = pickReplySentence(item?.replySnippet || item?.snippet || '');
  if (!safeSnippet || looksLikeUrl(safeSnippet) || looksLikeHostname(safeSnippet)) return '';
  const safeTitle = toSafeString(item?.title);
  if (safeTitle && safeSnippet.toLowerCase() === safeTitle.toLowerCase()) return '';
  return ensureSentence(safeSnippet);
};

const isGenericQuestionLabel = (value = '') => {
  const lower = toSafeString(value).toLowerCase();
  if (!lower) return true;
  return [
    'new question',
    'untitled question',
    'question'
  ].includes(lower);
};

const normalizeSentenceText = (value = '') => {
  const safe = stripHtml(value)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
  if (!safe) return '';
  return safe
    .replace(/\.{3,}/g, '…')
    .replace(/^[“"'`]+|[”"'`]+$/g, '')
    .trim();
};

const ensureSentence = (value = '') => {
  const safe = normalizeSentenceText(value);
  if (!safe) return '';
  return /[.?!]$/.test(safe) ? safe : `${safe}.`;
};

const splitIntoSentences = (value = '') => (
  normalizeSentenceText(value)
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => normalizeSentenceText(sentence))
    .filter(Boolean)
);

const isBoilerplateSentence = (sentence = '') => {
  const lower = normalizeSentenceText(sentence).toLowerCase();
  if (!lower) return true;
  if (lower.length < 40) return true;
  if (isEllipsisTerminated(lower)) return true;
  return [
    'welcome to',
    'joined us',
    'subscribe',
    'sign up',
    'utm_',
    'http://',
    'https://',
    'publication_id',
    'redirect',
    'free trial',
    'premium capability',
    'not enabled'
  ].some((token) => lower.includes(token));
};

const isNarrativeLeadSentence = (sentence = '') => {
  const lower = normalizeSentenceText(sentence).toLowerCase();
  if (!lower) return false;
  return [
    /\bhi friends\b/,
    /\bhappy (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\bjoin \d[\d,]*\b/,
    /\bnewly .* joined\b/,
    /\bwelcome to\b/,
    /\ba few months ago\b/,
    /\bi heard\b/,
    /\bi'd heard\b/,
    /\binvited me to\b/,
    /\bright here in\b/,
    /\bsubscribe\b/,
    /\blast essay\b/,
    /\bpublication\b/,
    /\bseed round\b/
  ].some((pattern) => pattern.test(lower));
};

const countTokenOverlap = (sentence = '', tokens = []) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return 0;
  const lower = normalizeSentenceText(sentence).toLowerCase();
  return tokens.reduce((count, token) => (
    lower.includes(token) ? count + 1 : count
  ), 0);
};

const scoreSummarySentence = (sentence = '', {
  role = 'primary',
  titleTokens = [],
  contextLabel = ''
} = {}) => {
  const safeSentence = normalizeSentenceText(sentence);
  const lower = safeSentence.toLowerCase();
  if (!safeSentence || isBoilerplateSentence(safeSentence)) return Number.NEGATIVE_INFINITY;
  if (isNarrativeLeadSentence(safeSentence)) return Number.NEGATIVE_INFINITY;
  if (looksLikeUrl(safeSentence) || looksLikeHostname(safeSentence)) return Number.NEGATIVE_INFINITY;
  if (contextLabel && lower === toSafeString(contextLabel).toLowerCase()) return Number.NEGATIVE_INFINITY;

  const wordCount = safeSentence.split(/\s+/).length;
  if (wordCount < 6) return Number.NEGATIVE_INFINITY;

  let score = countTokenOverlap(safeSentence, titleTokens) * 4;

  if (wordCount >= 9 && wordCount <= 28) score += 2;
  if (wordCount > 28 && wordCount <= 38) score += 1;
  if (/\b(i|we|my|our)\b/i.test(safeSentence)) score -= 2;

  if (role === 'primary') {
    if (/\b(is|are|means|suggests|shows|reveals|explains|lets?|allows?|can|builds?|turns?|compress(?:es)?|predict(?:s)?|simulate(?:s)?|represent(?:s)?|learn(?:s)?)\b/i.test(safeSentence)) score += 3;
    if (/\b(thesis|claim|idea|model|system|agent|reasoning|world|structure|mechanism)\b/i.test(safeSentence)) score += 2;
    if (/\b(risk|however|but|tension|pressure|unless|challenge)\b/i.test(safeSentence)) score -= 2;
  }

  if (role === 'support') {
    if (/\b(because|shows|showed|demonstrates?|evidence|allows?|lets?|by |plan|imagination|example|for instance|supports?)\b/i.test(safeSentence)) score += 3;
    if (/\b(risk|however|but|unless|challenge|pressure)\b/i.test(safeSentence)) score -= 2;
  }

  if (role === 'pressure') {
    if (/\b(risk|however|but|unless|except|tension|pressure|challenge|weak|fragile|drift|fails?|hallucination|contradiction)\b/i.test(safeSentence)) score += 4;
    if (/\b(if|when)\b/i.test(safeSentence) && safeSentence.length >= 70) score += 1;
  }

  return score;
};

const pickBestSummarySentence = (sentences = [], options = {}) => {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  return safeSentences
    .map((sentence) => ({
      sentence,
      score: scoreSummarySentence(sentence, options)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score || left.sentence.length - right.sentence.length)
    .map((entry) => entry.sentence)
    .at(0) || '';
};

const pickSupportSentence = (sentences = [], exclude = []) => pickReplySentence(
  (Array.isArray(sentences) ? sentences : []).join(' '),
  { exclude }
);

const pickPressureSentence = (sentences = [], fallback = '') => {
  const candidates = sentences.filter((sentence) => !isBoilerplateSentence(sentence));
  return candidates.find((sentence) => /\b(but|however|risk|unless|except|tension|pressure|challenge|weak|fragile|fails?|hallucination|contradiction)\b/i.test(sentence))
    || candidates.find((sentence) => /\b(if|when)\b/i.test(sentence) && sentence.length >= 70)
    || fallback;
};

const buildContextSummarySignals = ({ context = {}, contextItem = null }) => {
  const metadata = normalizeAmbientContextMetadata(context?.metadata);
  const contextLabel = toSafeString(contextItem?.title) || toSafeString(context?.title) || toSafeString(contextItem?.type);
  const titleTokens = tokenize(contextLabel).slice(0, 6);
  const contextType = toSafeString(context?.type || contextItem?.type).toLowerCase();
  const sourceText = contextType === 'article'
    ? [metadata.primaryText, contextItem?.snippet]
    : [metadata.primaryText, metadata.summary, contextItem?.snippet];
  const sentences = splitIntoSentences(sourceText.filter(Boolean).join(' '));
  const coreClaim = ensureSentence(pickBestSummarySentence(sentences, {
    role: 'primary',
    titleTokens,
    contextLabel
  }));
  const remainingSentences = sentences.filter((sentence) => ensureSentence(sentence) !== coreClaim);
  const supportPoint = ensureSentence(
    pickBestSummarySentence(remainingSentences, {
      role: 'support',
      titleTokens,
      contextLabel
    }) || pickSupportSentence(
      remainingSentences,
      [coreClaim, contextLabel]
    )
  );
  const pressurePoint = ensureSentence(pickPressureSentence(
    sentences.filter((sentence) => ![coreClaim, supportPoint].includes(ensureSentence(sentence))),
    metadata.openQuestions[0] || ''
  ));
  const openQuestion = ensureSentence(metadata.openQuestions[0] || '');
  return {
    contextLabel,
    coreClaim,
    supportPoint,
    pressurePoint,
    openQuestion
  };
};

const isContextEchoItem = ({ item = {}, context = {}, contextItem = null } = {}) => {
  const itemType = toSafeString(item?.type).toLowerCase();
  const itemId = toSafeString(item?.id);
  const itemTitle = toSafeString(item?.title).toLowerCase();
  const contextType = toSafeString(contextItem?.type || context?.type).toLowerCase();
  const contextId = toSafeString(contextItem?.id || context?.id);
  const contextTitle = toSafeString(contextItem?.title || context?.title).toLowerCase();

  if (itemType && contextType && itemType === contextType) {
    if (itemId && contextId && itemId === contextId) return true;
    if (itemTitle && contextTitle && itemTitle === contextTitle) return true;
  }
  return false;
};

const pruneRelatedItemsForContext = ({
  relatedItems = [],
  context = {},
  contextItem = null,
  limit = DEFAULT_LIMIT
} = {}) => {
  const filtered = prepareRelatedItemsForReply(relatedItems, limit).filter((item) => !isContextEchoItem({
    item,
    context,
    contextItem
  }));
  return filtered.slice(0, Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT)));
};

const lowercaseFirst = (value = '') => {
  const safe = normalizeSentenceText(value);
  if (!safe) return '';
  return safe.charAt(0).toLowerCase() + safe.slice(1);
};

const formatBulletLines = (items = [], fallback = 'No strong supporting material surfaced yet.') => {
  const lines = (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === 'string') return truncate(item, 180);
      const title = toSafeString(item?.title) || toSafeString(item?.name) || toSafeString(item?.label);
      const snippet = truncate(item?.snippet || item?.text || '', 140);
      if (title && snippet) return `**${title}**: ${snippet}`;
      return title || snippet;
    })
    .filter(Boolean)
    .slice(0, 5);
  if (lines.length === 0) return [`- ${fallback}`];
  return lines.map((line) => `- ${line}`);
};

const formatOrderedLines = (items = [], fallback = 'No sequence proposed yet.') => {
  const lines = (Array.isArray(items) ? items : [])
    .map((item) => truncate(
      typeof item === 'string'
        ? item
        : item?.title || item?.name || item?.label || item?.snippet || '',
      160
    ))
    .filter(Boolean)
    .slice(0, 7);
  if (lines.length === 0) return ['1. No sequence proposed yet.'];
  return lines.map((line, index) => `${index + 1}. ${line}`);
};

const formatPartnerMaterialLines = (items = []) => {
  const safeItems = Array.isArray(items) ? items : [];
  if (safeItems.length === 0) return ['- none'];
  return safeItems.slice(0, 4).map((item) => {
    const title = toSafeString(item?.title) || toSafeString(item?.type) || 'Untitled item';
    const snippet = truncate(item?.snippet || '', 120);
    return `- [${toSafeString(item?.type).toLowerCase() || 'item'}] ${title}${snippet ? ` — ${snippet}` : ''}`;
  });
};

const buildPartnerSystemPrompt = ({ intent = '', contextItem = null } = {}) => {
  const contextLabel = toSafeString(contextItem?.title) || 'the active workspace';
  const intentHint = intent ? `Current reply mode: ${intent}.` : '';
  return [
    'You are a grounded thought partner inside a private research workspace.',
    'Use only the workspace context, retrieved internal material, and conversation history provided to you.',
    'Do not invent sources, titles, quotes, or facts that are not present in the provided material.',
    'If the evidence is thin, say that directly and suggest the sharpest next move.',
    'Keep the tone concise, specific, and editorial rather than generic assistant chatter.',
    'Prefer 2 to 4 sentences unless the user explicitly asks for a longer artifact.',
    contextLabel ? `Stay anchored to ${contextLabel}.` : '',
    intentHint
  ].filter(Boolean).join(' ');
};

const buildPartnerGroundingBlock = ({
  message = '',
  context = {},
  contextItem = null,
  relatedItems = [],
  conversationState = {}
} = {}) => {
  const metadata = normalizeAmbientContextMetadata(context?.metadata);
  const activeTitle = toSafeString(contextItem?.title) || toSafeString(context?.title) || 'Workspace';
  const activeType = toSafeString(contextItem?.type || context?.type) || 'workspace';
  const summary = truncate(
    contextItem?.snippet || metadata.summary || metadata.primaryText || '',
    260
  );
  const openQuestions = metadata.openQuestions.slice(0, 3);
  const nextActions = metadata.nextActions.slice(0, 2);
  const anchorUserText = truncate(conversationState?.anchorUserMessage?.text || '', 160);

  return [
    `Active surface: ${activeType}`,
    `Active title: ${activeTitle}`,
    summary ? `Active summary: ${summary}` : '',
    anchorUserText ? `Anchor request: ${anchorUserText}` : '',
    'Retrieved internal material:',
    ...formatPartnerMaterialLines(relatedItems),
    'Open questions:',
    ...formatPartnerMaterialLines(openQuestions.map((text, index) => ({
      type: 'question',
      title: `Question ${index + 1}`,
      snippet: text
    }))),
    'Next actions in the workspace:',
    ...formatPartnerMaterialLines(nextActions.map((text, index) => ({
      type: 'action',
      title: `Action ${index + 1}`,
      snippet: text
    }))),
    `Current user request: ${message}`
  ].filter(Boolean).join('\n');
};

const buildPartnerChatMessages = ({
  message = '',
  conversationState = {},
  context = {},
  contextItem = null,
  relatedItems = []
} = {}) => {
  const intent = inferReplyIntent({ message, conversationState });
  const messages = [
    {
      role: 'system',
      content: buildPartnerSystemPrompt({ intent, contextItem })
    },
    {
      role: 'user',
      content: buildPartnerGroundingBlock({
        message,
        conversationState,
        context,
        contextItem,
        relatedItems
      })
    }
  ];

  const history = Array.isArray(conversationState?.history)
    ? conversationState.history.slice(-MODEL_HISTORY_LIMIT)
    : [];
  history.forEach((entry) => {
    const role = toSafeString(entry?.role).toLowerCase();
    const text = truncate(entry?.text || '', 320);
    if (!text || !['user', 'assistant'].includes(role)) return;
    messages.push({ role, content: text });
  });
  messages.push({
    role: 'user',
    content: toSafeString(message)
  });
  return messages;
};

const leadDetailFromItems = (items = []) => {
  const firstItem = Array.isArray(items) ? items[0] : null;
  return firstItem?.snippet || firstItem?.title || '';
};

const buildOutputArtifactReply = ({
  skillInvocation = {},
  context = {},
  contextItem = null,
  relatedItems = [],
  conversationState = {},
  message = ''
}) => {
  const outputType = toSafeString(skillInvocation?.outputType).toLowerCase();
  if (![
    'summary_brief',
    'critique_brief',
    'question_set',
    'connection_map',
    'research_brief_draft',
    'synthesis_doc_draft',
    'slide_outline_draft',
    'missing_link_report',
    'concept_health_report',
    'workspace_hygiene_report',
    'concept_network_report',
    'recurring_hygiene_report'
  ].includes(outputType)) return '';

  const metadata = normalizeAmbientContextMetadata(context?.metadata);
  const title = toSafeString(contextItem?.title)
    || toSafeString(context?.title)
    || toSafeString(skillInvocation?.skillTitle)
    || 'Workspace';
  const focus = truncate(
    metadata.summary
      || contextItem?.snippet
      || metadata.primaryText
      || conversationState?.anchorUserMessage?.text
      || message,
    260
  );
  const evidenceItems = relatedItems.slice(0, 4);
  const tensionItems = metadata.openQuestions.length > 0
    ? metadata.openQuestions
    : relatedItems.slice(1, 4).map((item) => item?.title || item?.snippet).filter(Boolean);
  const nextActionItems = metadata.nextActions.length > 0
    ? metadata.nextActions
    : relatedItems.slice(0, 4).map((item) => `Follow ${item?.title || item?.type || 'this lead'} next.`).filter(Boolean);
  const linkTargets = relatedItems.slice(0, 5).map((item) => ({
    title: item?.title || item?.type || 'Untitled item',
    snippet: item?.snippet || `Connect this ${item?.type || 'item'} back into the active workspace.`
  }));
  const repairItems = metadata.nextActions.length > 0
    ? metadata.nextActions
    : [
        'Tighten the core claim before adding more material.',
        'Add clearer supporting evidence to the weakest concept nodes.',
        'Link disconnected notes and questions back into the active concept graph.'
      ];
  const contextSignals = buildContextSummarySignals({ context, contextItem });
  const questionFocus = contextSignals.openQuestion || metadata.openQuestions[0] || '';
  const nextMoves = metadata.nextActions.length > 0
    ? metadata.nextActions
    : [
        contextSignals.supportPoint ? `Anchor the next pass in ${lowercaseFirst(contextSignals.supportPoint)}` : '',
        contextSignals.pressurePoint ? `Test the draft against ${lowercaseFirst(contextSignals.pressurePoint)}` : '',
        relatedItems[0]?.title ? `Check ${relatedItems[0].title} before widening the frame.` : ''
      ].filter(Boolean);

  if (outputType === 'summary_brief') {
    return [
      `# Summary Brief: ${title}`,
      '',
      '## Core claim',
      contextSignals.coreClaim || focus || 'The article still needs a sharper governing claim.',
      '',
      '## Best support in view',
      contextSignals.supportPoint || leadDetailFromItems(evidenceItems) || 'No strong support surfaced yet.',
      '',
      '## Pressure to keep in view',
      contextSignals.pressurePoint || questionFocus || 'No explicit pressure point surfaced yet.',
      '',
      '## Why it matters',
      focus || 'Clarify why this matters before widening the draft.',
      '',
      '## Next move',
      ...formatOrderedLines(nextMoves.slice(0, 3), 'Choose one claim to tighten before drafting.')
    ].join('\n');
  }

  if (outputType === 'critique_brief') {
    return [
      `# Critique Brief: ${title}`,
      '',
      '## Claim under test',
      contextSignals.coreClaim || focus || 'The current claim is still too diffuse to critique cleanly.',
      '',
      '## Softest assumption',
      contextSignals.supportPoint || 'The strongest assumption has not been named yet.',
      '',
      '## Main pressure',
      contextSignals.pressurePoint || questionFocus || 'No sharp contradiction surfaced yet.',
      '',
      '## What would make this stronger',
      ...formatBulletLines(nextMoves, 'Name the missing evidence or boundary condition.'),
      '',
      '## Next test',
      ...formatOrderedLines([
        questionFocus || 'Write the falsification test the draft still has to answer.',
        relatedItems[0]?.title ? `Inspect ${relatedItems[0].title} for the strongest counterexample.` : '',
        'Rewrite the claim so it names when it should and should not hold.'
      ].filter(Boolean), 'Define one direct test for the claim.')
    ].join('\n');
  }

  if (outputType === 'question_set') {
    const questionLines = [
      questionFocus,
      metadata.openQuestions[1] || '',
      contextSignals.pressurePoint ? `What evidence would answer this pressure directly: ${lowercaseFirst(contextSignals.pressurePoint)}` : '',
      contextSignals.supportPoint ? `What would confirm the support line without overgeneralizing it: ${lowercaseFirst(contextSignals.supportPoint)}` : ''
    ].filter(Boolean);
    return [
      `# Question Set: ${title}`,
      '',
      '## Highest-leverage questions',
      ...formatOrderedLines(questionLines, 'No high-leverage questions surfaced yet.'),
      '',
      '## Nearby material to check',
      ...formatBulletLines(linkTargets, 'No nearby material surfaced yet.')
    ].join('\n');
  }

  if (outputType === 'connection_map') {
    return [
      `# Connection Map: ${title}`,
      '',
      '## Central node',
      contextSignals.coreClaim || focus || title,
      '',
      '## Useful adjacent material',
      ...formatBulletLines(linkTargets, 'No useful adjacent material surfaced yet.'),
      '',
      '## Links worth making',
      ...formatOrderedLines(
        linkTargets.map((item) => `${item.title}: ${item.snippet}`),
        'Define the first useful link.'
      )
    ].join('\n');
  }

  if (outputType === 'research_brief_draft') {
    return [
      `# Research Brief: ${title}`,
      '',
      '## Focus',
      focus || 'Clarify the target area before the next pass.',
      '',
      '## What matters',
      ...formatBulletLines(evidenceItems, 'No strong evidence cluster surfaced yet.'),
      '',
      '## Tensions and open questions',
      ...formatBulletLines(tensionItems, 'No explicit tensions are captured yet.'),
      '',
      '## Recommended next moves',
      ...formatBulletLines(nextActionItems, 'No next moves proposed yet.')
    ].join('\n');
  }

  if (outputType === 'synthesis_doc_draft') {
    return [
      `# Synthesis Doc: ${title}`,
      '',
      '## Central thesis',
      focus || 'The current material still needs a sharper synthesis thesis.',
      '',
      '## Supporting signals',
      ...formatBulletLines(evidenceItems, 'Supporting signals are still thin.'),
      '',
      '## Tensions to preserve',
      ...formatBulletLines(tensionItems, 'No tensions are explicitly preserved yet.'),
      '',
      '## What to strengthen next',
      ...formatBulletLines(nextActionItems, 'No strengthening moves proposed yet.')
    ].join('\n');
  }

  if (outputType === 'missing_link_report') {
    return [
      `# Missing Link Report: ${title}`,
      '',
      '## Current focus',
      focus || 'Clarify the active area before linking the surrounding material.',
      '',
      '## Highest-value missing links',
      ...formatBulletLines(linkTargets, 'No obvious missing links surfaced yet.'),
      '',
      '## Why these links matter',
      ...formatBulletLines(
        linkTargets.map((item) => `${item.title}: ${item.snippet}`),
        'No strong linking rationale surfaced yet.'
      ),
      '',
      '## Link actions',
      ...formatOrderedLines(
        linkTargets.map((item) => `Connect ${item.title} back to ${title} and note what the relationship actually is.`),
        'Define the first link to create.'
      )
    ].join('\n');
  }

  if (outputType === 'concept_health_report') {
    return [
      `# Concept Health Scan: ${title}`,
      '',
      '## Working frame',
      focus || 'The active concept set still needs a sharper frame.',
      '',
      '## Healthy signals',
      ...formatBulletLines(evidenceItems, 'The current concept set has not surfaced strong healthy signals yet.'),
      '',
      '## Fragile areas',
      ...formatBulletLines(tensionItems, 'No fragile areas were explicitly surfaced yet.'),
      '',
      '## Repairs to prioritize',
      ...formatBulletLines(repairItems, 'No repair moves were proposed yet.')
    ].join('\n');
  }

  if (outputType === 'workspace_hygiene_report') {
    return [
      `# Workspace Hygiene Summary: ${title}`,
      '',
      '## Overall state',
      focus || 'The workspace needs a clearer operating read before the next maintenance pass.',
      '',
      '## Cleanup priorities',
      ...formatBulletLines(linkTargets, 'No obvious cleanup priorities surfaced yet.'),
      '',
      '## Drift risks',
      ...formatBulletLines(tensionItems, 'No drift risks were explicitly surfaced yet.'),
      '',
      '## Next maintenance pass',
      ...formatOrderedLines(repairItems, 'Define the next maintenance pass.')
    ].join('\n');
  }

  if (outputType === 'concept_network_report') {
    const networkTargets = relatedItems.slice(0, 5).map((item) => ({
      title: item?.title || item?.type || 'Untitled node',
      snippet: item?.snippet || `Reconnect this ${item?.type || 'node'} to the surrounding concept graph.`
    }));
    return [
      `# Concept Network Scan: ${title}`,
      '',
      '## Network frame',
      focus || 'The active concept graph still needs a clearer structural read.',
      '',
      '## Connected strengths',
      ...formatBulletLines(evidenceItems, 'No strong network anchors surfaced yet.'),
      '',
      '## Weak bridges and isolated nodes',
      ...formatBulletLines(networkTargets, 'No weak bridges were explicitly surfaced yet.'),
      '',
      '## Structural repairs',
      ...formatOrderedLines(
        repairItems.map((item) => `${item}`),
        'Name the first structural repair to make.'
      )
    ].join('\n');
  }

  if (outputType === 'recurring_hygiene_report') {
    const cadenceLines = metadata.nextActions.length > 0
      ? metadata.nextActions
      : [
          'Run a lightweight hygiene pass on the active workspace each cycle.',
          'Check concept links, stale frames, and unresolved drift before new synthesis work.',
          'Escalate the sharpest maintenance issue into a handoff or draft.'
        ];
    return [
      `# Recurring Hygiene Summary: ${title}`,
      '',
      '## Current maintenance frame',
      focus || 'The recurring maintenance cycle still needs a clearer operating frame.',
      '',
      '## Focus areas for the next cycle',
      ...formatBulletLines(linkTargets, 'No focus areas were surfaced yet.'),
      '',
      '## Recurring cadence',
      ...formatOrderedLines(cadenceLines, 'Define the recurring upkeep cadence.'),
      '',
      '## Next recurring pass',
      ...formatBulletLines(repairItems, 'No recurring pass has been defined yet.')
    ].join('\n');
  }

  return [
    `# Slide Outline: ${title}`,
    '',
    '## Story arc',
    focus || 'Open with the core problem, then move through evidence, tension, and the next move.',
    '',
    '## Slide sequence',
    ...formatOrderedLines([
      `Opening frame: ${title}`,
      ...evidenceItems.map((item) => item?.title || item?.snippet),
      ...tensionItems.slice(0, 2),
      ...nextActionItems.slice(0, 2)
    ], 'Define the narrative sequence.')
  ].join('\n');
};

const inferReplyIntent = ({ message = '', conversationState = {} }) => {
  const lower = toSafeString(message).toLowerCase();
  const assistantLower = toSafeString(conversationState?.previousAssistantMessage?.text).toLowerCase();

  if (/\b(summarize|summary|distill|what matters|key claim|brief|synthesis)\b/i.test(lower)) return 'summarize';
  if (/\b(what is this question really asking|really asking|what is the real question|what is this actually asking)\b/i.test(lower)) return 'summarize';
  if (/\b(challenge|push back|pressure|weak|hole|counter|falsif|rethink|rethought)\b/i.test(lower)) return 'challenge';
  if (/\b(organize|organise|reorganize|reorganise|cleanup structure|clean up structure|clean up library|cleanup library|library cleanup|folder cleanup|folder structure|workspace cleanup|organize library|organize notebook|organize workspace|stage a reviewable organization plan)\b/i.test(lower)) return 'cleanup_structure';
  if (/\b(restructure|bucket|sort|cluster)\b/i.test(lower)) return 'restructure';
  if (/\b(clarify|rewrite|clean up|sharper|clearer|polish)\b/i.test(lower)) return 'clarify';
  if (/\b(strengthen|support|make it stronger|firm up)\b/i.test(lower)) return 'strengthen';
  if (/\b(bring|pull|find|surface|get me|show me|notes|highlights|sources|articles|material)\b/i.test(lower)) return 'retrieve';

  if (conversationState?.continuation && /\b(yes|yep|yeah|ok|okay|sure|do that|please do that|go ahead|sounds good|use that|pull them in|bring them in|continue)\b/i.test(lower)) {
    if (/\b(clean up|cleanup|organization plan|organize|folder structure|workspace structure)\b/i.test(assistantLower)) return 'cleanup_structure';
    if (/\b(restructure|bucket|sort|cluster)\b/i.test(assistantLower)) return 'restructure';
    if (/\b(pull|bring|find|surface|related item|matches|library)\b/i.test(assistantLower)) return 'retrieve';
    if (/\b(strengthen)\b/i.test(assistantLower)) return 'strengthen';
    if (/\b(challenge|contradiction)\b/i.test(assistantLower)) return 'challenge';
    if (/\b(clarify|rewrite)\b/i.test(assistantLower)) return 'clarify';
  }

  return conversationState?.continuation ? 'continue' : 'chat';
};

const resolveContextItem = async ({
  userObjectId,
  context = {},
  Article,
  NotebookEntry,
  TagMeta
}) => {
  const contextType = toSafeString(context.type).toLowerCase();
  const contextId = toSafeString(context.id);
  const contextTitle = toSafeString(context.title);
  const ambientMetadata = normalizeAmbientContextMetadata(context.metadata);
  if (!contextType || !contextId) return null;

  if (contextType === 'concept') {
    if (mongoose.Types.ObjectId.isValid(contextId)) {
      const byId = await TagMeta.findOne({ _id: contextId, userId: userObjectId })
        .select('_id name description updatedAt')
        .lean();
      if (byId) {
        return {
          type: 'concept',
          id: String(byId._id),
          title: toSafeString(byId.name) || 'Concept',
          snippet: truncate(byId.description || ''),
          updatedAt: byId.updatedAt
        };
      }
    }
    const byName = await TagMeta.findOne({
      userId: userObjectId,
      name: new RegExp(`^${escapeRegExp(contextId)}$`, 'i')
    })
      .select('_id name description updatedAt')
      .lean();
    if (!byName) return null;
    return {
      type: 'concept',
      id: String(byName._id),
      title: toSafeString(byName.name) || 'Concept',
      snippet: truncate(byName.description || ''),
      updatedAt: byName.updatedAt
    };
  }

  if (contextType === 'notebook' || contextType === 'note') {
    if (!mongoose.Types.ObjectId.isValid(contextId)) return null;
    const note = await NotebookEntry.findOne({ _id: contextId, userId: userObjectId })
      .select('_id title content blocks updatedAt')
      .lean();
    if (!note) return null;
    const blockText = Array.isArray(note.blocks)
      ? note.blocks.map(block => toSafeString(block?.text)).filter(Boolean).join(' ')
      : '';
    return {
      type: 'notebook',
      id: String(note._id),
      title: toSafeString(note.title) || 'Notebook note',
      snippet: truncate(note.content || blockText),
      updatedAt: note.updatedAt
    };
  }

  if (contextType === 'article') {
    if (!mongoose.Types.ObjectId.isValid(contextId)) return null;
    const article = await Article.findOne({ _id: contextId, userId: userObjectId })
      .select('_id title content url updatedAt')
      .lean();
    if (!article) return null;
    return {
      type: 'article',
      id: String(article._id),
      title: toSafeString(article.title) || 'Article',
      snippet: truncate(article.content || article.url || ''),
      updatedAt: article.updatedAt
    };
  }

  if (['selection', 'workspace', 'think', 'handoff', 'global', 'concept-index', 'question'].includes(contextType)) {
    return {
      type: contextType,
      id: contextId,
      title: contextTitle || 'Workspace',
      snippet: ambientMetadata.summary || ambientMetadata.primaryText || '',
      updatedAt: null
    };
  }

  if (contextTitle || ambientMetadata.summary || ambientMetadata.primaryText) {
    return {
      type: contextType,
      id: contextId,
      title: contextTitle || 'Workspace',
      snippet: ambientMetadata.summary || ambientMetadata.primaryText || '',
      updatedAt: null
    };
  }

  return null;
};

const searchInternalItems = async ({
  userObjectId,
  tokens = [],
  limit = DEFAULT_LIMIT,
  Article,
  NotebookEntry,
  TagMeta
}) => {
  if (!tokens.length) return [];
  const regex = buildTokenRegex(tokens);
  if (!regex) return [];

  const [articles, notes, concepts] = await Promise.all([
    Article.find({
      userId: userObjectId,
      $or: [
        { title: regex },
        { content: regex }
      ]
    })
      .select('_id title content url updatedAt')
      .sort({ updatedAt: -1 })
      .limit(SEARCH_MODEL_LIMIT)
      .lean(),
    NotebookEntry.find({
      userId: userObjectId,
      $or: [
        { title: regex },
        { content: regex },
        { tags: regex }
      ]
    })
      .select('_id title content blocks tags updatedAt')
      .sort({ updatedAt: -1 })
      .limit(SEARCH_MODEL_LIMIT)
      .lean(),
    TagMeta.find({
      userId: userObjectId,
      $or: [
        { name: regex },
        { description: regex }
      ]
    })
      .select('_id name description updatedAt')
      .sort({ updatedAt: -1 })
      .limit(SEARCH_MODEL_LIMIT)
      .lean()
  ]);

  const scoreText = (text = '') => {
    const lower = String(text || '').toLowerCase();
    if (!lower) return 0;
    return tokens.reduce((score, token) => (
      lower.includes(token) ? score + 1 : score
    ), 0);
  };

  const items = [];
  articles.forEach((entry) => {
    const combined = `${entry.title || ''} ${entry.content || ''}`;
    items.push({
      type: 'article',
      id: String(entry._id),
      title: toSafeString(entry.title) || 'Article',
      snippet: truncate(entry.content || entry.url || ''),
      updatedAt: entry.updatedAt,
      score: scoreText(combined) + 0.3
    });
  });
  notes.forEach((entry) => {
    const blocks = Array.isArray(entry.blocks)
      ? entry.blocks.map(block => toSafeString(block?.text)).filter(Boolean).join(' ')
      : '';
    const combined = `${entry.title || ''} ${entry.content || ''} ${blocks}`;
    items.push({
      type: 'notebook',
      id: String(entry._id),
      title: toSafeString(entry.title) || 'Notebook note',
      snippet: truncate(entry.content || blocks),
      updatedAt: entry.updatedAt,
      score: scoreText(combined) + 0.2
    });
  });
  concepts.forEach((entry) => {
    const combined = `${entry.name || ''} ${entry.description || ''}`;
    items.push({
      type: 'concept',
      id: String(entry._id),
      title: toSafeString(entry.name) || 'Concept',
      snippet: truncate(entry.description || ''),
      updatedAt: entry.updatedAt,
      score: scoreText(combined)
    });
  });

  const seen = new Set();
  return items
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime;
    })
    .filter((item) => {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT)));
};

const buildReply = ({
  message,
  conversationState,
  contextItem,
  context = {},
  relatedItems = []
}) => {
  const intent = inferReplyIntent({ message, conversationState });
  const preparedItems = prepareRelatedItemsForReply(relatedItems);
  const titles = preparedItems
    .map((item) => buildReplyLabel(item))
    .filter(Boolean)
    .slice(0, 3);
  const titleLine = titles.length > 0 ? joinLabels(titles) : '';
  const contextLabel = toSafeString(contextItem?.title) || toSafeString(contextItem?.type);
  const contextType = toSafeString(context?.type || contextItem?.type).toLowerCase();
  const contextMetadata = normalizeAmbientContextMetadata(context?.metadata);
  const contextSnippet = truncate(
    contextItem?.snippet || contextMetadata.summary || contextMetadata.primaryText || '',
    180
  );
  const contextSignals = buildContextSummarySignals({ context, contextItem });
  const leadDetail = buildReplyDetail(preparedItems[0]);
  const secondLabel = titles[1] || '';

  if (preparedItems.length === 0) {
    if (intent === 'summarize' && contextSignals.coreClaim) {
      const lines = [`Core claim: ${contextSignals.coreClaim}`];
      if (contextSignals.supportPoint && contextSignals.supportPoint !== contextSignals.coreClaim) {
        lines.push(`Best support in view: ${contextSignals.supportPoint}`);
      }
      if (contextSignals.pressurePoint && contextSignals.pressurePoint !== contextSignals.coreClaim) {
        lines.push(`Pressure to keep in view: ${contextSignals.pressurePoint}`);
      } else if (contextSignals.openQuestion && contextSignals.openQuestion !== contextSignals.coreClaim) {
        lines.push(`Open question: ${contextSignals.openQuestion}`);
      }
      return lines.join(' ');
    }
    if (intent === 'challenge' && contextSignals.pressurePoint) {
      return `Here is the pressure point I would keep in view: ${contextSignals.pressurePoint} That is the material most likely to force the draft to get sharper.`;
    }
    if (intent === 'strengthen' && (contextSignals.supportPoint || contextSignals.coreClaim)) {
      return `The strongest footing right now comes from ${contextSignals.supportPoint || contextSignals.coreClaim} I would anchor the next revision there rather than widening the claim.`;
    }
    if (intent === 'clarify' && (contextSignals.supportPoint || contextSignals.coreClaim)) {
      return `There is cleaner language already in the source material: ${contextSignals.supportPoint || contextSignals.coreClaim} Pull that line forward and the draft should read with less fog.`;
    }
    if (contextType === 'concept') {
      return contextLabel
        ? `I do not have enough anchored material attached to ${contextLabel} yet. Pin one highlight, note, or article and I can turn it into support, tension, or an open question.`
        : 'I do not have enough anchored material attached to this concept yet. Pin one highlight, note, or article and I can turn it into support, tension, or an open question.';
    }
    if (intent === 'restructure') {
      return 'I can do that, but the stream is still too thin. Give me one sharper clue and I will sort the next pass into support, tension, and open questions.';
    }
    if (conversationState?.continuation) {
      return 'I stayed with the thread, but this pass did not surface anything strong enough to move. Give me a sharper keyword, source name, or phrase and I will keep digging.';
    }
    if (contextSnippet) {
      return contextLabel
        ? `I can see the frame around ${contextLabel}, but not enough attached material is indexed yet to move the draft. Point me at one phrase, highlight, or source and I will make the next pass concrete.`
        : 'I can see the current frame, but not enough attached material is indexed yet to move the draft. Point me at one phrase, highlight, or source and I will make the next pass concrete.';
    }
    return contextLabel
      ? `Nothing strong lit up around ${contextLabel} yet. Give me a sharper phrase or point me at a source and I will dig again.`
      : 'Nothing strong lit up yet. Give me a sharper phrase or point me at a source and I will dig again.';
  }

  if (intent === 'summarize') {
    if (contextType === 'question') {
      if (isGenericQuestionLabel(contextLabel)) {
        return 'This question is still too generic. Rewrite it so it names the uncertainty, decision, or contradiction you want resolved, then I can gather the right evidence.';
      }
      const lines = [`Core question: ${ensureSentence(contextLabel.endsWith('?') ? contextLabel : `${contextLabel}?`)}`];
      if (contextSignals.supportPoint) {
        lines.push(`Best evidence lead: ${contextSignals.supportPoint}`);
      } else if (leadDetail) {
        lines.push(`Best evidence lead: ${leadDetail}`);
      }
      if (contextSignals.openQuestion && contextSignals.openQuestion !== contextLabel) {
        lines.push(`What still needs answering: ${contextSignals.openQuestion}`);
      } else if (contextSignals.pressurePoint) {
        lines.push(`Pressure to resolve: ${contextSignals.pressurePoint}`);
      } else {
        lines.push('Next move: name the evidence that would count as a real answer.');
      }
      return lines.join(' ');
    }
    if (contextSignals.coreClaim) {
      const lines = [
        `Core claim: ${contextSignals.coreClaim}`
      ];
      if (contextSignals.supportPoint && contextSignals.supportPoint !== contextSignals.coreClaim) {
        lines.push(`Best support in view: ${contextSignals.supportPoint}`);
      } else if (leadDetail) {
        lines.push(`Best support in view: ${ensureSentence(leadDetail)}`);
      }
      if (contextSignals.pressurePoint && contextSignals.pressurePoint !== contextSignals.coreClaim) {
        lines.push(`Pressure to keep in view: ${contextSignals.pressurePoint}`);
      } else if (contextSignals.openQuestion && contextSignals.openQuestion !== contextSignals.coreClaim) {
        lines.push(`Open question: ${contextSignals.openQuestion}`);
      }
      return lines.join(' ');
    }
    const leadSentence = leadDetail ? `Keep the draft anchored to ${leadDetail}.` : 'That is the clearest footing for the next draft pass.';
    if (secondLabel) {
      return contextLabel
        ? `What matters most in ${contextLabel} right now is the cluster around ${titleLine}. ${leadSentence}`
        : `What matters most right now is the cluster around ${titleLine}. ${leadSentence}`;
    }
    return contextLabel
      ? `What matters most in ${contextLabel} right now is ${titleLine}. ${leadSentence}`
      : `What matters most right now is ${titleLine}. ${leadSentence}`;
  }

  if (intent === 'restructure') {
    if (titles.length >= 3) {
      return `I sorted the best leads: ${titles[0]} belongs in support, ${titles[1]} adds pressure, and ${titles[2]} stays open as the next thread to test.`;
    }
    return `I sorted the best lead${preparedItems.length === 1 ? '' : 's'} into a cleaner working set. Start with ${titleLine} and I can tighten the grouping on the next pass.`;
  }

  if (intent === 'retrieve') {
    return preparedItems.length === 1
      ? `One good lead popped out: ${titleLine}.${leadDetail ? ` ${leadDetail}.` : ''} I can sort it into support, tension, or an open question next.`
      : `A few usable leads lit up around ${contextLabel || 'this thread'}: ${titleLine}.${leadDetail ? ` ${leadDetail}.` : ''} I can sort them into support, tension, and open questions next.`;
  }

  if (intent === 'challenge') {
    return `Here is the pressure point I would keep in view: ${titles[0] || titleLine}.${leadDetail ? ` ${leadDetail}.` : ''} That is the material most likely to force the draft to get sharper.`;
  }

  if (intent === 'clarify') {
    return `There is cleaner language to borrow in ${titles[0] || titleLine}.${leadDetail ? ` ${leadDetail}.` : ''} Pull one of those lines into the draft and the idea should read with less fog.`;
  }

  if (intent === 'strengthen') {
    return `The strongest footing right now comes from ${titles[0] || titleLine}.${leadDetail ? ` ${leadDetail}.` : ''} I would anchor the next revision there rather than widening the claim.`;
  }

  if (conversationState?.continuation) {
    return `Kept going from the last move. The best next material is ${titleLine}.${leadDetail ? ` ${leadDetail}.` : ''}`;
  }

  return contextLabel
    ? `A few usable threads lit up around ${contextLabel}: ${titleLine}.${leadDetail ? ` ${leadDetail}.` : ''}`
    : `A few usable threads lit up: ${titleLine}.${leadDetail ? ` ${leadDetail}.` : ''}`;
};

const generateCollaborativeReply = async ({
  userId,
  message = '',
  history = [],
  context = {},
  limit = DEFAULT_LIMIT,
  premiumWebResearchAvailable = false,
  skillInvocation = {}
}) => {
  const userObjectId = toObjectId(userId);
  if (!userObjectId) throw createError(400, 'userId must be a valid ObjectId.');

  const safeMessage = toSafeString(message);
  if (!safeMessage) throw createError(400, 'message is required.');
  if (safeMessage.length > MAX_MESSAGE_LENGTH) {
    throw createError(400, `message must be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  let Article;
  let NotebookEntry;
  let TagMeta;
  try {
    Article = mongoose.model('Article');
    NotebookEntry = mongoose.model('NotebookEntry');
    TagMeta = mongoose.model('TagMeta');
  } catch (_error) {
    throw createError(500, 'Required models are not initialized.');
  }

  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));
  const conversationState = resolveConversationState({
    message: safeMessage,
    history
  });
  const contextHintText = buildAmbientContextHintText(context);
  const tokens = tokenize([
    conversationState.retrievalMessage || conversationState.resolvedMessage || safeMessage,
    contextHintText
  ].filter(Boolean).join(' '));
  const contextItem = await resolveContextItem({
    userObjectId,
    context,
    Article,
    NotebookEntry,
    TagMeta
  });
  const searchedItems = await searchInternalItems({
    userObjectId,
    tokens,
    limit: safeLimit,
    Article,
    NotebookEntry,
    TagMeta
  });
  const relatedItems = pruneRelatedItemsForContext({
    context,
    contextItem,
    relatedItems: mergeAmbientRelatedItems({
      context,
      relatedItems: searchedItems,
      limit: safeLimit
    }),
    limit: safeLimit
  });

  const reply = buildOutputArtifactReply({
    skillInvocation,
    context,
    contextItem,
    relatedItems,
    conversationState,
    message: conversationState.resolvedMessage || safeMessage
  });
  const fallbackReply = buildReply({
    message: conversationState.resolvedMessage || safeMessage,
    conversationState,
    contextItem,
    context,
    relatedItems
  });
  let finalReply = reply || fallbackReply;
  let mode = 'internal_only';
  let model = '';
  let provider = '';
  if (!reply && isTextGenerationConfigured()) {
    try {
      const completion = await chatComplete({
        messages: buildPartnerChatMessages({
          message: conversationState.resolvedMessage || safeMessage,
          conversationState,
          context,
          contextItem,
          relatedItems
        }),
        temperature: 0.25,
        maxTokens: 180,
        reasoningEffort: 'low'
      });
      if (toSafeString(completion?.text)) {
        finalReply = toSafeString(completion.text);
        mode = 'hf_chat';
        model = toSafeString(completion?.model);
        provider = toSafeString(completion?.provider);
      }
    } catch (error) {
      console.warn('[agent-chat] HF chat fallback engaged', {
        status: error?.status,
        message: error?.message,
        detail: error?.payload?.detail || ''
      });
    }
  }
  const planner = buildAgentPlanner({
    taskType: context?.metadata?.taskType || 'custom',
    skillInvocation,
    message: conversationState.resolvedMessage || safeMessage
  });
  const intent = inferReplyIntent({
    message: conversationState.resolvedMessage || safeMessage,
    conversationState
  });
  const proposalBundle = buildProposalBundle({
    intent,
    context,
    contextItem,
    relatedItems,
    skillInvocation,
    planner
  });

  return {
    mode,
    model: model || undefined,
    provider: provider || undefined,
    premiumWebResearchAvailable: Boolean(premiumWebResearchAvailable),
    reply: finalReply,
    planner,
    proposalBundle,
    context: contextItem || null,
    relatedItems: relatedItems.map((item) => ({
      type: item.type,
      id: item.id,
      title: item.title,
      snippet: item.snippet,
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null
    })),
    citations: relatedItems.map((item) => ({
      type: item.type,
      id: item.id,
      title: item.title
    })),
    suggestedActions: relatedItems.length > 0
      ? [
        {
          type: 'restructure_candidates',
          label: 'Restructure Related Items',
          itemCount: relatedItems.length
        },
        {
          type: 'activate_worker_role',
          label: `Continue with ${planner.activeWorkerLabel}`,
          workerRole: planner.activeWorkerRole
        }
      ]
      : [{
        type: 'broaden_search',
        label: 'Broaden Internal Search'
      }]
  };
};

module.exports = {
  generateCollaborativeReply,
  __testables: {
    tokenize,
    buildTokenRegex,
    buildReply,
    inferReplyIntent,
    buildPartnerChatMessages,
    buildOutputArtifactReply,
    prepareRelatedItemsForReply,
    pruneRelatedItemsForContext
  }
};
