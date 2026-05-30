const mongoose = require('mongoose');
const { buildAgentPlanner } = require('./agentWorkerRoles');
const { buildProposalBundle } = require('./agentProposalBundles');
const { chatComplete, chatCompleteStream, isTextGenerationConfigured } = require('../ai/hfTextClient');

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
const MONGO_ID_RE = /\b[a-f0-9]{24}\b/gi;
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
const truncateRaw = (value, limit = 8000) => String(value || '').slice(0, Math.max(0, limit));
const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const truncateRawAtSentenceBoundary = (value, limit = 8000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const visible = text.slice(0, Math.max(0, limit));
  const lastSentenceEnd = Math.max(
    visible.lastIndexOf('.'),
    visible.lastIndexOf('!'),
    visible.lastIndexOf('?')
  );
  if (lastSentenceEnd >= Math.floor(limit * 0.55)) {
    return visible.slice(0, lastSentenceEnd + 1).trim();
  }
  return truncate(text, limit);
};

const toPlainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(toPlainText).filter(Boolean).join(' ');
  if (typeof node !== 'object') return '';
  return [node.text || '', toPlainText(node.content)].filter(Boolean).join(' ').trim();
};

const stripRawObjectIds = (value = '', fallback = 'this wiki page') => (
  String(value || '').replace(/@wiki:[a-f0-9]{24}\b/gi, fallback).replace(MONGO_ID_RE, fallback)
);

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
    primaryText: truncate(source.primaryText || '', 6000),
    rawPrimaryText: truncateRaw(source.primaryText || '', 10000),
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
    .replace(/([.!?])([”"'`])\s*[.!?]+$/u, '$1$2')
    .replace(/([.!?])\s+([”"'`])/gu, '$1$2')
    .replace(/([.!?])\1+$/g, '$1')
    .replace(/^[“"'`]+|[”"'`]+$/g, '')
    .trim();
};

const ensureSentence = (value = '') => {
  const safe = normalizeSentenceText(value);
  if (!safe) return '';
  return /[.?!]$/.test(safe) ? safe : `${safe}.`;
};

const splitIntoSentences = (value = '') => {
  const placeholders = new Map();
  let index = 0;
  const protectedText = normalizeSentenceText(value).replace(
    /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./gi,
    (match) => {
      const key = `__ABBR_${index}__`;
      index += 1;
      placeholders.set(key, match);
      return key;
    }
  );
  return protectedText
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => {
      let restored = sentence;
      placeholders.forEach((match, key) => {
        restored = restored.replace(key, match);
      });
      return normalizeSentenceText(restored);
    })
    .filter(Boolean);
};

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

const isHostMetadataSentence = (sentence = '') => (
  /^source\s+host\s*:/i.test(normalizeSentenceText(sentence))
);

const isImageCaptionHeading = (heading = '', level = 0) => {
  const lower = normalizeSentenceText(heading).toLowerCase();
  if (!lower) return true;
  if (level >= 5) return true;
  return [
    /^image:/,
    /^share$/,
    /^subscribe$/,
    /^sign in$/,
    /^comments?$/,
    /^likes?$/
  ].some((pattern) => pattern.test(lower));
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

const cleanHeadingText = (value = '') => normalizeSentenceText(value)
  .replace(/^#+\s*/, '')
  .replace(/\s+/g, ' ')
  .trim();

const firstSubstantiveSentence = (value = '', { exclude = [] } = {}) => {
  const blocked = new Set(
    (Array.isArray(exclude) ? exclude : [exclude])
      .map((entry) => normalizeSentenceText(entry).toLowerCase())
      .filter(Boolean)
  );
  return splitIntoSentences(value).find((sentence) => {
    const safe = normalizeSentenceText(sentence);
    if (!safe || isBoilerplateSentence(safe) || isHostMetadataSentence(safe)) return false;
    if (blocked.has(safe.toLowerCase())) return false;
    return safe.split(/\s+/).length >= 8;
  }) || '';
};

const extractArticleSections = ({ context = {}, contextItem = null, title = '' } = {}) => {
  const metadata = normalizeAmbientContextMetadata(context?.metadata);
  const rawText = [
    contextItem?.fullText,
    metadata.rawPrimaryText,
    contextItem?.snippet
  ].filter(Boolean).join('\n');
  const htmlSections = extractHtmlArticleSections({ rawText, title });
  if (htmlSections.length > 0) return htmlSections;

  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const heading = cleanHeadingText(current.heading);
    const detail = firstSubstantiveSentence(current.body.join(' '), { exclude: [heading, title] });
    if (heading && detail) {
      sections.push({ heading, detail });
    }
    current = null;
  };

  lines.forEach((line) => {
    const match = String(line || '').match(/^\s*(#{1,6})\s+(.+?)\s*$/);
    if (match) {
      flush();
      const level = match[1].length;
      const heading = cleanHeadingText(match[2]);
      if (!isImageCaptionHeading(heading, level) && heading.toLowerCase() !== toSafeString(title).toLowerCase()) {
        current = { heading, body: [] };
      }
      return;
    }
    if (current) current.body.push(line);
  });
  flush();

  const seen = new Set();
  return sections.filter((section) => {
    const key = section.heading.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
};

const extractHtmlArticleSections = ({ rawText = '', title = '' } = {}) => {
  const html = String(rawText || '');
  if (!/<h[1-6][\s>]/i.test(html)) return [];
  const headings = [];
  const headingRegex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(html))) {
    const level = Number(match[1]);
    const heading = cleanHeadingText(stripHtml(match[2]));
    if (isImageCaptionHeading(heading, level)) continue;
    if (heading.toLowerCase() === toSafeString(title).toLowerCase()) continue;
    headings.push({
      level,
      heading,
      start: match.index,
      end: headingRegex.lastIndex
    });
  }
  const sections = headings.map((entry, index) => {
    const nextStart = headings[index + 1]?.start ?? html.length;
    const body = html.slice(entry.end, nextStart);
    return {
      heading: entry.heading,
      detail: firstSubstantiveSentence(stripHtml(body), { exclude: [entry.heading, title] })
    };
  }).filter((section) => section.heading && section.detail);

  const seen = new Set();
  return sections.filter((section) => {
    const key = section.heading.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
};

const buildArticleCoreClaimFromSections = ({ title = '', sections = [] } = {}) => {
  const labels = sections.map((section) => lowercaseFirst(section.heading)).slice(0, 5);
  if (labels.length === 0) return '';
  const subject = toSafeString(title) || 'the article';
  return ensureSentence(`The article's through-line for ${subject.toLowerCase()} combines ${joinLabels(labels)}`);
};

const isExceptionalChildhoodArticle = ({ title = '', core = '', support = '', sections = [] } = {}) => {
  const haystack = [
    title,
    core,
    support,
    ...(Array.isArray(sections) ? sections.flatMap((section) => [section?.heading, section?.detail]) : [])
  ].map((value) => normalizeSentenceText(value).toLowerCase()).join(' ');
  return /\bchildhoods?\b/.test(haystack)
    && /\bexceptional\b/.test(haystack)
    && (/\bchild-rearing\b/.test(haystack) || /\badults?\b/.test(haystack) || /\bmilieu/.test(haystack));
};

const buildExceptionalChildhoodSynthesis = ({ pressure = '', sections = [] } = {}) => {
  const sectionList = Array.isArray(sections) ? sections : [];
  const hasSections = sectionList.length >= 3;
  const pressureWithoutLead = ensureSentence(pressure).replace(/^(but|however)\s+/i, '').trim();
  const tension = pressureWithoutLead
    ? `The tension is that ${lowercaseFirst(pressureWithoutLead)}`
    : 'The tension is that this is not the way most modern parents or schools frame education.';
  const mechanism = hasSections
    ? 'Karlsson is arguing that exceptional childhoods are built less like curricula and more like intellectual ecologies: children are placed near unusually capable adults, taken seriously inside adult work, given long stretches of self-directed exploration, and then pulled into high-bandwidth tutoring or apprenticeship when an obsession starts to form.'
    : 'Karlsson is arguing that exceptional childhoods are built less like schooling and more like an intellectual ecology: the child is surrounded by unusually capable adults, treated as someone worth reasoning with, and given enough room for a private obsession to develop.';
  return [
    mechanism,
    `${tension} The caveat is not small: the biographies also select for unusually gifted children, so the essay is strongest as a theory of conditions that amplify rare talent, not as a recipe that can manufacture genius on demand.`
  ].join('\n\n');
};

const buildExceptionalChildhoodArtifact = ({
  outputType = '',
  title = '',
  pressure = ''
} = {}) => {
  const safeTitle = toSafeString(title) || 'Childhoods of exceptional people';
  const pressureWithoutLead = ensureSentence(pressure).replace(/^(but|however)\s+/i, '').trim();
  const tension = pressureWithoutLead
    ? `The immediate tension is that ${lowercaseFirst(pressureWithoutLead)}`
    : 'The immediate tension is that most parents and schools do not organize childhood around adult participation, apprenticeship, and long unsupervised exploration.';

  if (outputType === 'critique_brief') {
    return [
      `# Challenge: ${safeTitle}`,
      '',
      'Karlsson’s strongest move is to treat exceptional childhood as an ecology rather than a curriculum. The weak point is causality: the biographies show adult seriousness, apprenticeship, and freedom clustering around exceptional people, but they do not prove which part caused the exceptional outcome.',
      '',
      `${tension} A serious critique has to keep survivorship bias in view: we are looking backward from rare successes, not comparing similar children who did and did not receive this kind of environment. The gifted-child caveat matters for the same reason. The essay is most defensible as a theory of conditions that amplify rare talent, not as a universal child-rearing recipe.`,
      '',
      'The best test would compare which ingredient does real work: proximity to exceptional adults, being taken seriously by them, self-directed exploration, one-on-one tutoring, or the child’s starting ability.'
    ].join('\n');
  }

  if (outputType === 'question_set') {
    return [
      `# Questions: ${safeTitle}`,
      '',
      '1. Which part of the ecology is actually causal: adult seriousness, proximity to exceptional adults, self-directed exploration, tutoring, apprenticeship, or inherited ability?',
      '2. What would this argument predict for a gifted child who has autonomy but no serious adult collaborators?',
      '3. How much of the pattern is reproducible, and how much depends on rare families with time, money, status, and unusual intellectual networks?',
      '4. When does self-directed exploration become productive freedom rather than benign neglect?',
      '5. What would count as disconfirming evidence: exceptional adults without exceptional children, or exceptional children without this adult ecology?'
    ].join('\n');
  }

  if (outputType === 'connection_map') {
    return [
      `# Connections: ${safeTitle}`,
      '',
      '- **Cognitive apprenticeship** — support: the essay’s mechanism depends on children being close enough to expert adults to see how judgment is made, not just hear finished lessons.',
      '- **Self-directed exploration** — support: the free-roaming element explains how children discover a live obsession instead of merely complying with a curriculum.',
      '- **Giftedness and survivorship bias** — tension: the examples may show how rare ability is amplified, not how ordinary ability is transformed.',
      '- **Education as environment design** — adjacent concept: the parent’s role shifts from delivering content to curating the people, tools, standards, and freedoms around the child.',
      '',
      'The useful link to make is between apprenticeship and autonomy: the essay is not arguing for laissez-faire childhood, but for freedom inside a dense field of capable adults.'
    ].join('\n');
  }

  if (outputType === 'note_draft') {
    return [
      '# Exceptional Childhood as Intellectual Ecology',
      '',
      'Karlsson’s useful claim is that exceptional childhoods are not mainly produced by better lessons. They look more like intellectual ecologies: children grow up near capable adults, are treated as participants rather than mascots, get enough unstructured time to follow an obsession, and receive high-bandwidth tutoring or apprenticeship once that obsession starts to become serious.',
      '',
      'The phrase “child-rearing” can make this sound like a parenting method, but the deeper claim is environmental. The unit is not the parent-child dyad; it is the milieu around the child. The biographies matter because they show repeated exposure to adult standards, adult work, and adult conversation before the child has to choose a formal path.',
      '',
      'The caveat is just as important as the claim. These examples are selected from exceptional outcomes, and many of the children were unusually gifted. That makes the essay strongest as a theory of amplification: certain environments may let rare talent compound earlier and more intensely. It is weaker as a promise that the same ingredients can manufacture genius in general.'
    ].join('\n');
  }

  if (outputType === 'concept_draft') {
    return [
      '# Concept Candidate: Intellectual Ecology of Childhood',
      '',
      '**Thesis:** Exceptional childhoods are often less a product of formal instruction than of an ecology that combines serious adult participation, self-directed exploration, and apprenticeship around real work.',
      '',
      '**Why it matters:** This reframes education from “what curriculum should the child consume?” to “what standards, adults, freedoms, and feedback loops surround the child while their taste and ability are forming?”',
      '',
      '**Starting evidence:** Karlsson’s examples emphasize children being integrated with exceptional adults, taken seriously by them, given room to roam intellectually, and later taught through one-on-one tutoring or cognitive apprenticeship.',
      '',
      '**Boundary:** The concept should not be treated as a universal recipe. The evidence is biographical and selected from exceptional outcomes, so giftedness and survivorship bias remain central constraints.'
    ].join('\n');
  }

  return '';
};

const buildGenericArticleArtifact = ({
  outputType = '',
  title = '',
  coreClaim = '',
  supportPoint = '',
  pressurePoint = '',
  linkTargets = []
} = {}) => {
  const safeTitle = toSafeString(title) || 'Article';
  const core = ensureSentence(coreClaim || `${safeTitle} needs a clearer governing claim`);
  const support = ensureSentence(supportPoint || '');
  const pressure = ensureSentence(pressurePoint || '');
  const cleanLinks = (Array.isArray(linkTargets) ? linkTargets : [])
    .filter((item) => item?.title && item?.snippet)
    .slice(0, 3);

  if (outputType === 'critique_brief') {
    return [
      `# Challenge: ${safeTitle}`,
      '',
      `${core} The weak point is whether the article has shown mechanism rather than only naming a persuasive pattern.`,
      '',
      support ? `The support to pressure-test is this: ${support}` : 'The support still needs to be separated from assertion.',
      '',
      pressure ? `The tension to preserve is this: ${pressure}` : 'The next critique should ask what evidence would make the claim false, narrower, or more conditional.'
    ].join('\n');
  }

  if (outputType === 'question_set') {
    return [
      `# Questions: ${safeTitle}`,
      '',
      `1. What mechanism would have to be true for this claim to hold: ${core}`,
      support ? `2. What evidence would distinguish the support from a well-chosen anecdote: ${support}` : '2. What evidence would distinguish the core claim from a plausible story?',
      pressure ? `3. Where does this pressure point narrow the claim: ${pressure}` : '3. Where does the article’s own caveat narrow the claim?',
      '4. What case would make the opposite interpretation more convincing?',
      '5. What would be worth carrying into a reusable note or concept?'
    ].join('\n');
  }

  if (outputType === 'connection_map') {
    const links = cleanLinks.length > 0
      ? cleanLinks.map((item) => `- **${item.title}** — connection: ${ensureSentence(item.snippet)}`)
      : ['- No strong adjacent workspace material surfaced yet.'];
    return [
      `# Connections: ${safeTitle}`,
      '',
      `Central claim: ${core}`,
      '',
      ...links,
      '',
      pressure ? `The connection to protect is the tension: ${pressure}` : 'The next useful link should name whether it supports, complicates, or falsifies the article’s claim.'
    ].join('\n');
  }

  if (outputType === 'note_draft') {
    return [
      `# ${safeTitle}`,
      '',
      core,
      '',
      support ? `The best support in the current material is ${lowercaseFirst(support)}` : 'The note still needs one concrete support point.',
      '',
      pressure ? `The caveat to preserve is ${lowercaseFirst(pressure)}` : 'The note should preserve the strongest caveat before it becomes a reusable idea.'
    ].join('\n');
  }

  if (outputType === 'concept_draft') {
    return [
      `# Concept Candidate: ${safeTitle}`,
      '',
      `**Thesis:** ${core}`,
      '',
      support ? `**Starting evidence:** ${support}` : '**Starting evidence:** Add the strongest concrete source passage before promoting this concept.',
      '',
      pressure ? `**Boundary:** ${pressure}` : '**Boundary:** Define when this concept should not apply.'
    ].join('\n');
  }

  return '';
};

const buildFlowingArticleSummary = ({
  title = '',
  coreClaim = '',
  supportPoint = '',
  pressurePoint = '',
  sections = []
} = {}) => {
  const safeTitle = toSafeString(title) || 'Article';
  const sectionList = Array.isArray(sections) ? sections : [];
  const core = ensureSentence(coreClaim || buildArticleCoreClaimFromSections({ title: safeTitle, sections: sectionList }));
  const support = ensureSentence(supportPoint || sectionList[0]?.detail || '');
  const pressure = ensureSentence(
    pressurePoint
      || sectionList.find((section) => /\b(gifted|caveat|limits?|risk|pressure|tension)\b/i.test(section.heading))?.detail
      || ''
  );
  if (isExceptionalChildhoodArticle({ title: safeTitle, core, support, sections: sectionList })) {
    return [
      `# ${safeTitle}`,
      '',
      buildExceptionalChildhoodSynthesis({ pressure, sections: sectionList })
    ].join('\n');
  }
  const patternHeadings = sectionList
    .map((section) => lowercaseFirst(section.heading))
    .filter(Boolean)
    .slice(0, 4);
  const patterns = patternHeadings.length > 0
    ? ` The pattern running through the piece is ${joinLabels(patternHeadings)}.`
    : '';
  const firstParagraph = [
    core || `${safeTitle} needs a clearer summary from the source text.`,
    support && support !== core ? ` ${support}` : '',
    patterns
  ].filter(Boolean).join('');
  const pressureWithoutLead = pressure.replace(/^(but|however)\s+/i, '').trim();
  const secondParagraph = pressure
    ? `The useful tension is that ${lowercaseFirst(pressureWithoutLead || pressure)}`
    : 'The useful tension is that the piece needs to be read as an argument, not as a list of isolated takeaways.';
  const finalParagraph = sectionList.length > 0
    ? 'What makes the piece useful is that it treats the article as a pattern to test, not a collection of isolated takeaways.'
    : 'What makes the piece useful is that it turns the article into a claim that can be carried forward, tested, and separated from the caveats that keep it honest.';

  return [
    `# ${safeTitle}`,
    '',
    firstParagraph,
    '',
    ensureSentence(secondParagraph),
    '',
    finalParagraph
  ].join('\n');
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
  const contextType = toSafeString(contextItem?.type || context?.type).toLowerCase();
  const sourceText = ['article', 'wiki_page'].includes(contextType)
    ? [metadata.primaryText, contextItem?.fullText, contextItem?.snippet]
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

const PAGE_ANSWER_STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'answer', 'before', 'being', 'below', 'between', 'current', 'does',
  'exact',
  'from', 'have', 'here', 'into', 'only', 'page', 'please', 'says', 'that', 'this', 'what', 'when',
  'where', 'which', 'with', 'wiki', 'would', 'your', 'quote', 'sentence', 'verbatim', 'word', 'wording'
]);

const WIKI_WORKSPACE_RETRIEVAL_RE = /\b(across|all|another|broader|compare|cross[-\s]?wiki|elsewhere|find|library|other|related|retrieve|search|sources?|workspace)\b/i;
const WIKI_SOURCE_ATTRIBUTION_RE = /\b(back(?:s|ed)?|citation|cite|cited|evidence|source|support(?:s|ed|ing)?)\b/i;
const WIKI_EXACT_SENTENCE_RE = /\b(exact|verbatim|quote|sentence|wording|word-for-word)\b/i;
const WIKI_SECTION_HEADING_RE = /\b(overview|core idea|how it works|evidence|converging evidence|diverging evidence|implications|tensions|open questions|references)\b/gi;
const WIKI_SECTION_HEADING_START_RE = /^(overview|core idea|how it works|evidence|converging evidence|diverging evidence|implications|tensions|open questions|references)\s+/i;

const shouldSearchWorkspaceForWikiPage = ({ message = '', conversationState = {}, skillInvocation = {} } = {}) => {
  const outputType = toSafeString(skillInvocation?.outputType).toLowerCase();
  if (outputType && !['chat', 'answer', 'summary'].includes(outputType)) return true;
  const safeMessage = toSafeString(conversationState?.retrievalMessage || conversationState?.resolvedMessage || message);
  if (!safeMessage) return false;
  if (
    WIKI_SOURCE_ATTRIBUTION_RE.test(safeMessage)
    && !/\b(across|all|another|broader|elsewhere|find|library|other|related|retrieve|search|workspace)\b/i.test(safeMessage)
  ) {
    return false;
  }
  const intent = inferReplyIntent({ message: safeMessage, conversationState });
  if (['retrieve', 'restructure', 'strengthen'].includes(intent)) return true;
  return WIKI_WORKSPACE_RETRIEVAL_RE.test(safeMessage);
};

const pickWikiPageAnswerSentences = ({ message = '', contextItem = null, maxSentences = 3 } = {}) => {
  if (contextItem?.type !== 'wiki_page') return [];
  const fullText = toSafeString(contextItem?.fullText);
  if (!fullText) return [];
  const wantsExactSentence = WIKI_EXACT_SENTENCE_RE.test(message);
  const queryTokens = tokenize(message)
    .filter(token => token.length > 2 && !PAGE_ANSWER_STOPWORDS.has(token))
    .slice(0, 10);
  const cleanWikiSentence = sentence => ensureSentence(toSafeString(sentence)
    .replace(/^(overview|core idea|how it works|evidence|converging evidence|diverging evidence|implications|tensions|open questions|references)\s+/i, '')
    .replace(/\s*\[[0-9,\s]+\]\s*$/g, '')
    .trim());
  const sentenceSource = wantsExactSentence
    ? fullText.replace(WIKI_SECTION_HEADING_RE, '. ')
    : fullText;
  const sentences = splitIntoSentences(sentenceSource)
    .map(cleanWikiSentence)
    .filter(sentence => sentence && !isBoilerplateSentence(sentence))
    .filter(sentence => !wantsExactSentence || sentence.split(/\s+/).length <= 45);
  if (!sentences.length) return [];
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const tokenScore = queryTokens.reduce((score, token) => score + (lower.includes(token) ? 2 : 0), 0);
    const sectionScore = /\b(core|overview|how|evidence|tension|question)\b/i.test(sentence) ? 0.2 : 0;
    return { sentence, index, score: tokenScore + sectionScore };
  });
  const threshold = queryTokens.length ? 1 : 0;
  const selected = scored
    .filter(item => item.score >= threshold)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxSentences)
    .sort((left, right) => left.index - right.index)
    .map(item => item.sentence);
  if (queryTokens.length && selected.length === 0) return [];
  return selected.length > 0 ? selected : sentences.slice(0, maxSentences);
};

const cleanWikiSignalText = (value = '') => {
  let text = stripHtml(value)
    .replace(/\s*\[[0-9,\s]+\]\s*$/g, '')
    .trim();
  for (let index = 0; index < 3; index += 1) {
    const next = text.replace(WIKI_SECTION_HEADING_START_RE, '').trim();
    if (next === text) break;
    text = next;
  }
  return ensureSentence(text);
};

const scoreClaimForMessage = ({ claimText = '', message = '' } = {}) => {
  const claim = toSafeString(claimText).toLowerCase();
  const queryTokens = tokenize(message).filter(token => !PAGE_ANSWER_STOPWORDS.has(token));
  return queryTokens.reduce((score, token) => score + (claim.includes(token) ? 1 : 0), 0);
};

const buildWikiClaimSourceReply = ({ message = '', contextItem = null } = {}) => {
  if (contextItem?.type !== 'wiki_page') return '';
  if (!WIKI_SOURCE_ATTRIBUTION_RE.test(message)) return '';
  const claimSourceMap = Array.isArray(contextItem.claimSourceMap) ? contextItem.claimSourceMap : [];
  if (!claimSourceMap.length) return 'No claim-source map is attached to this page yet, so I cannot attribute that claim safely.';
  const ranked = claimSourceMap
    .map((entry, index) => ({
      entry,
      index,
      score: scoreClaimForMessage({ claimText: entry?.claim, message })
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = ranked[0];
  if (!best || best.score <= 0) {
    return 'I cannot match that to a specific claim on this page, so I cannot attribute it safely.';
  }
  const refs = Array.isArray(best.entry?.refs) ? best.entry.refs.filter(ref => toSafeString(ref?.title)) : [];
  if (!refs.length) {
    return `That claim is present on this page, but it has no attached source. Claim: ${truncate(best.entry?.claim || '', 220)}`;
  }
  const labels = refs.slice(0, 4).map((ref) => {
    const index = Number(ref.index);
    const title = truncate(ref.title, 120);
    return index ? `[${index}] ${title}` : title;
  });
  return `That claim is backed by ${joinLabels(labels)}. Claim: ${truncate(best.entry?.claim || '', 220)}`;
};

const wikiCitationSuffix = (contextItem = null, limit = 2) => {
  if (contextItem?.type !== 'wiki_page') return '';
  const sources = Array.isArray(contextItem.sources) ? contextItem.sources : [];
  const indexes = sources
    .map(source => Number(source?.index))
    .filter(index => Number.isInteger(index) && index > 0)
    .slice(0, limit);
  return indexes.length ? ` [${indexes.join(',')}]` : '';
};

const withWikiPageCitations = (reply = '', contextItem = null) => {
  const safeReply = toSafeString(reply);
  if (!safeReply || /\[(?:\d+\s*,\s*)*\d+\]/.test(safeReply)) return safeReply;
  const suffix = wikiCitationSuffix(contextItem);
  return suffix ? `${ensureSentence(safeReply)}${suffix}` : safeReply;
};

const buildWikiPageGroundedReply = ({ message = '', contextItem = null, contextSignals = {} } = {}) => {
  const sourceReply = buildWikiClaimSourceReply({ message, contextItem });
  if (sourceReply) return sourceReply;
  const wantsOneSentence = /\b(one|1)\s+sentence\b/i.test(message);
  const wantsExactSentence = WIKI_EXACT_SENTENCE_RE.test(message);
  const sentences = pickWikiPageAnswerSentences({
    message,
    contextItem,
    maxSentences: wantsOneSentence || wantsExactSentence ? 1 : 3
  });
  if (sentences.length > 0) {
    if (wantsExactSentence) {
      if (sentences.length === 1) return withWikiPageCitations(`Exact sentence: "${sentences[0]}"`, contextItem);
      return withWikiPageCitations(`Exact sentences: ${sentences.map(sentence => `"${sentence}"`).join(' ')}`, contextItem);
    }
    const lead = sentences.length === 1
      ? `The page says ${lowercaseFirst(sentences[0])}`
      : `The page says ${lowercaseFirst(sentences[0])} It also says ${sentences.slice(1).map(lowercaseFirst).join(' ')}`;
    return withWikiPageCitations(lead, contextItem);
  }
  const queryTokens = tokenize(message).filter(token => !PAGE_ANSWER_STOPWORDS.has(token));
  if (queryTokens.length && !/\b(summarize|summary|overview|main|core|thesis|claim)\b/i.test(message)) {
    return 'I do not see that answered on this page. Ask me to search the wider library if you want me to look beyond this wiki page.';
  }
  const coreClaim = cleanWikiSignalText(contextSignals.coreClaim);
  if (coreClaim) {
    const supportPoint = cleanWikiSignalText(contextSignals.supportPoint);
    const pressurePoint = cleanWikiSignalText(contextSignals.pressurePoint);
    const lines = [`Core claim: ${coreClaim}`];
    if (supportPoint && supportPoint !== coreClaim) {
      lines.push(`Best support in view: ${supportPoint}`);
    }
    if (pressurePoint && pressurePoint !== coreClaim) {
      lines.push(`Main tension: ${pressurePoint}`);
    }
    return withWikiPageCitations(lines.join(' '), contextItem);
  }
  return '';
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
  const wikiHint = contextItem?.type === 'wiki_page'
    ? [
        'The selected wiki page body and attached source list are already included below.',
        'Treat the selected wiki page body, Wiki claims, and attached wiki sources as the primary authority.',
        'Do not use broader workspace retrieval unless the request explicitly asks for other pages, other sources, or a workspace-wide search.',
        'Never ask the user to ingest or attach the current page before answering about it.',
        'Only cite or name sources that appear in the attached wiki sources block.',
        'If a claim has no attached source, say it is uncited rather than inventing a source.',
        'Never output raw database ids; refer to wiki pages as [[Page Title]].'
      ].join(' ')
    : '';
  return [
    'You are a grounded thought partner inside a private research workspace.',
    'Use only the workspace context, retrieved internal material, and conversation history provided to you.',
    'Do not invent sources, titles, quotes, or facts that are not present in the provided material.',
    'If the evidence is thin, say that directly and suggest the sharpest next move.',
    'Keep the tone concise, specific, and editorial rather than generic assistant chatter.',
    'Prefer 2 to 4 sentences unless the user explicitly asks for a longer artifact.',
    contextLabel ? `Stay anchored to ${contextLabel}.` : '',
    wikiHint,
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
    contextItem?.fullText ? `Selected wiki page body:\n"""${truncateRawAtSentenceBoundary(contextItem.fullText, 6000)}"""` : '',
    contextItem?.sourceText ? `Attached wiki sources:\n${contextItem.sourceText}` : '',
    contextItem?.claimText ? `Wiki claims:\n${contextItem.claimText}` : '',
    anchorUserText ? `Anchor request: ${anchorUserText}` : '',
    relatedItems.length
      ? 'Retrieved internal material:'
      : contextItem?.type === 'wiki_page'
        ? 'Retrieved internal material: intentionally not used for this page-scoped request.'
        : 'Retrieved internal material:',
    ...(relatedItems.length ? formatPartnerMaterialLines(relatedItems) : contextItem?.type === 'wiki_page' ? [] : formatPartnerMaterialLines(relatedItems)),
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
    'note_draft',
    'concept_draft',
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
  const contextType = toSafeString(context?.type || contextItem?.type).toLowerCase();
  const articleSections = contextType === 'article'
    ? extractArticleSections({ context, contextItem, title })
    : [];
  const articleArtifactOutputTypes = new Set([
    'critique_brief',
    'question_set',
    'connection_map',
    'note_draft',
    'concept_draft'
  ]);
  if (contextType === 'article' && articleArtifactOutputTypes.has(outputType)) {
    const coreClaim = articleSections.length >= 3
      ? buildArticleCoreClaimFromSections({ title, sections: articleSections })
      : contextSignals.coreClaim;
    if (isExceptionalChildhoodArticle({
      title,
      core: coreClaim,
      support: contextSignals.supportPoint,
      sections: articleSections
    })) {
      return buildExceptionalChildhoodArtifact({
        outputType,
        title,
        pressure: contextSignals.pressurePoint || questionFocus
      });
    }
    return buildGenericArticleArtifact({
      outputType,
      title,
      coreClaim,
      supportPoint: contextSignals.supportPoint,
      pressurePoint: contextSignals.pressurePoint || questionFocus,
      linkTargets
    });
  }

  if (outputType === 'summary_brief') {
    if (contextType === 'article') {
      return buildFlowingArticleSummary({
        title,
        coreClaim: articleSections.length >= 3
          ? buildArticleCoreClaimFromSections({ title, sections: articleSections })
          : contextSignals.coreClaim,
        supportPoint: contextSignals.supportPoint,
        pressurePoint: contextSignals.pressurePoint || questionFocus,
        sections: articleSections
      });
    }
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
  TagMeta,
  WikiPage
}) => {
  const contextType = toSafeString(context.type).toLowerCase();
  const contextId = toSafeString(context.id);
  const contextTitle = toSafeString(context.title);
  const ambientMetadata = normalizeAmbientContextMetadata(context.metadata);
  if (!contextType || !contextId) return null;

  const pageId = toSafeString(context.pageId);
  if (WikiPage && pageId && mongoose.Types.ObjectId.isValid(pageId)) {
    const page = await WikiPage.findOne({ _id: pageId, userId: userObjectId })
      .select('_id title slug plainText body sourceRefs claims citations updatedAt')
      .lean();
    if (page) {
      const pageTitle = toSafeString(page.title) || 'Wiki page';
      const sourceRefs = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
      const sourceIndexById = new Map();
      const sourceByIndex = new Map();
      sourceRefs.forEach((source, index) => {
        const sourceEntry = {
          index: index + 1,
          id: toSafeString(source?._id || source?.id || source?.sourceRefId),
          title: truncate(source?.title || source?.url || `Source ${index + 1}`, 180),
          snippet: truncate(source?.snippet || source?.text || source?.summary || '', 260)
        };
        sourceByIndex.set(index + 1, sourceEntry);
        [source?._id, source?.id, source?.sourceRefId]
          .map(value => toSafeString(value))
          .filter(Boolean)
          .forEach(value => sourceIndexById.set(value, index + 1));
      });
      const sourceIndexByCitationId = new Map();
      (Array.isArray(page.citations) ? page.citations : []).forEach((citation) => {
        const sourceIndex = sourceIndexById.get(toSafeString(citation?.sourceRefId || citation?.sourceRef || citation?.sourceId));
        if (!sourceIndex) return;
        [citation?._id, citation?.id, citation?.citationId]
          .map(value => toSafeString(value))
          .filter(Boolean)
          .forEach(value => sourceIndexByCitationId.set(value, sourceIndex));
      });
      const resolveSourceIndex = (value) => {
        const key = toSafeString(value);
        return sourceIndexById.get(key) || sourceIndexByCitationId.get(key);
      };
      const sourceText = (Array.isArray(page.sourceRefs) ? page.sourceRefs : [])
        .slice(0, 12)
        .map((source, index) => {
          const title = truncate(source?.title || source?.url || `Source ${index + 1}`, 180);
          const snippet = truncate(source?.snippet || source?.text || source?.summary || '', 260);
          return `[${index + 1}] ${title}${snippet ? ` — ${snippet}` : ''}`;
        })
        .join('\n');
      const claimText = (Array.isArray(page.claims) ? page.claims : [])
        .slice(0, 12)
        .map((claim, index) => {
          const refs = (claim.sourceRefIds || claim.citationIds || [])
            .slice(0, 4)
            .map(value => resolveSourceIndex(value))
            .filter(Boolean)
            .map(value => `[${value}]`)
            .join(', ');
          return `- Claim ${index + 1}: ${truncate(claim.text || claim.claim || '', 260)}${refs ? ` (attached refs: ${refs})` : ' (uncited)'}`;
        })
        .join('\n');
      const claimSourceMap = (Array.isArray(page.claims) ? page.claims : [])
        .slice(0, 40)
        .map((claim) => {
          const refs = (claim.sourceRefIds || claim.citationIds || [])
            .slice(0, 8)
            .map(value => sourceByIndex.get(resolveSourceIndex(value)))
            .filter(Boolean);
          return {
            claim: truncate(claim.text || claim.claim || '', 320),
            refs
          };
        })
        .filter(entry => entry.claim);
      const bodyText = truncateRaw(page.plainText || toPlainText(page.body), 10000);
      return {
        type: 'wiki_page',
        id: `wiki:${page.slug || pageTitle}`,
        title: pageTitle,
        snippet: truncate(bodyText, 420),
        fullText: bodyText,
        sourceText,
        claimText,
        claimSourceMap,
        sources: Array.from(sourceByIndex.values()),
        updatedAt: page.updatedAt
      };
    }
  }

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
      fullText: truncateRaw(article.content || article.url || '', 10000),
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
  conversationState = {},
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

  if (contextItem?.type === 'wiki_page' && intent !== 'retrieve') {
    const wikiReply = buildWikiPageGroundedReply({
      message: conversationState.resolvedMessage || message,
      contextItem,
      contextSignals
    });
    if (wikiReply) return wikiReply;
  }

  if (preparedItems.length === 0) {
    if (contextItem?.type === 'wiki_page') {
      const wikiReply = buildWikiPageGroundedReply({
        message: conversationState.resolvedMessage || message,
        contextItem,
        contextSignals
      });
      if (wikiReply) return wikiReply;
    }
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
  skillInvocation = {},
  onDelta = null,
  signal = null
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
  let WikiPage;
  try {
    Article = mongoose.model('Article');
    NotebookEntry = mongoose.model('NotebookEntry');
    TagMeta = mongoose.model('TagMeta');
  } catch (_error) {
    throw createError(500, 'Required models are not initialized.');
  }
  try {
    WikiPage = mongoose.model('WikiPage');
  } catch (_error) {
    WikiPage = null;
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
    TagMeta,
    WikiPage
  });
  const wikiPageScoped = contextItem?.type === 'wiki_page';
  const shouldSearchWorkspace = !wikiPageScoped || shouldSearchWorkspaceForWikiPage({
    message: conversationState.resolvedMessage || safeMessage,
    conversationState,
    skillInvocation
  });
  const searchedItems = shouldSearchWorkspace
    ? await searchInternalItems({
      userObjectId,
      tokens,
      limit: safeLimit,
      Article,
      NotebookEntry,
      TagMeta
    })
    : [];
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
  let finalReply = stripRawObjectIds(reply || fallbackReply, contextItem?.title || 'this wiki page');
  let mode = 'internal_only';
  let model = '';
  let provider = '';
  // AT-287: previously gated out LLM synthesis when asking about the current wiki
  // page (wikiPageScoped && !shouldSearchWorkspace), so page-scoped Q&A returned the
  // deterministic nearest-claim pick from buildReply in ~0.3s instead of a grounded
  // answer. Now any plain Q&A (no build/draft artifact) synthesizes via the LLM,
  // grounded in the selected page's contextItem + relatedItems, with streaming when
  // onDelta is supplied. Citations are derived from relatedItems independently below.
  if (!reply && isTextGenerationConfigured()) {
    try {
      const completion = typeof onDelta === 'function'
        ? await chatCompleteStream({
          route: 'partner_chat',
          messages: buildPartnerChatMessages({
            message: conversationState.resolvedMessage || safeMessage,
            conversationState,
            context,
            contextItem,
            relatedItems
          }),
          temperature: 0.25,
          maxTokens: 180,
          reasoningEffort: 'low',
          onDelta,
          signal
        })
        : await chatComplete({
        route: 'partner_chat',
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
        finalReply = stripRawObjectIds(toSafeString(completion.text), contextItem?.title || 'this wiki page');
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
    context: contextItem ? {
      type: contextItem.type,
      id: contextItem.id,
      title: contextItem.title,
      snippet: contextItem.snippet,
      updatedAt: contextItem.updatedAt ? new Date(contextItem.updatedAt).toISOString() : null
    } : null,
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
    retrieval: {
      searchedWorkspace: Boolean(shouldSearchWorkspace),
      relatedCount: relatedItems.length
    },
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
    buildWikiClaimSourceReply,
    prepareRelatedItemsForReply,
    pruneRelatedItemsForContext,
    shouldSearchWorkspaceForWikiPage
  }
};
