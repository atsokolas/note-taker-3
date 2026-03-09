const mongoose = require('mongoose');

const MAX_LIMIT = 12;
const DEFAULT_LIMIT = 6;
const MAX_MESSAGE_LENGTH = 2000;
const SEARCH_MODEL_LIMIT = 6;
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
  return `${clean.slice(0, limit).trim()}...`;
};
const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const resolveContextItem = async ({
  userObjectId,
  context = {},
  Article,
  NotebookEntry,
  TagMeta
}) => {
  const contextType = toSafeString(context.type).toLowerCase();
  const contextId = toSafeString(context.id);
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
  contextItem,
  relatedItems = []
}) => {
  const intro = contextItem
    ? `You are currently in ${contextItem.type}: "${contextItem.title}".`
    : 'I can help you reason across your saved notes, concepts, and articles.';

  const contextLine = contextItem?.snippet
    ? `Context summary: ${contextItem.snippet}`
    : 'No specific context item was found for this request.';

  const relatedLine = relatedItems.length > 0
    ? `I found ${relatedItems.length} related item${relatedItems.length === 1 ? '' : 's'} in your library.`
    : 'I did not find strong related matches yet; try adding more specific keywords.';

  const suggestionLine = relatedItems.length > 0
    ? 'If you want, I can now restructure these into inbox/working/draft buckets.'
    : 'If you want, describe a remembered phrase and I will run a broader internal search.';

  return [
    intro,
    `You asked: "${truncate(message, 220)}"`,
    contextLine,
    relatedLine,
    suggestionLine
  ].join(' ');
};

const generateCollaborativeReply = async ({
  userId,
  message = '',
  context = {},
  limit = DEFAULT_LIMIT,
  premiumWebResearchAvailable = false
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
  const tokens = tokenize(safeMessage);
  const contextItem = await resolveContextItem({
    userObjectId,
    context,
    Article,
    NotebookEntry,
    TagMeta
  });
  const relatedItems = await searchInternalItems({
    userObjectId,
    tokens,
    limit: safeLimit,
    Article,
    NotebookEntry,
    TagMeta
  });

  const reply = buildReply({
    message: safeMessage,
    contextItem,
    relatedItems
  });

  return {
    mode: 'internal_only',
    premiumWebResearchAvailable: Boolean(premiumWebResearchAvailable),
    reply,
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
      ? [{
        type: 'restructure_candidates',
        label: 'Restructure Related Items',
        itemCount: relatedItems.length
      }]
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
    buildReply
  }
};
