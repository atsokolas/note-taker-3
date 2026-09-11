const { wordBoundaryTrim } = require('../lib/editorialText');
// Explicit human discovery. These reads never feed the automatic agent index.
const RESULT_LIMIT = 20;
const CANDIDATE_LIMIT = 50;
const MAX_QUERY_LENGTH = 160;
const MAX_QUERY_MS = 2000;
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const firstLine = value => String(value ?? '').split('\n').map(clean).find(Boolean) || '';
const id = value => String(value?._id || value || '');
const fields = [
  ['title', 'Title'], ['writing', 'Writing'], ['question', 'Question'], ['returnNote', 'Return note'],
  ['pressure.premise', 'Premise'], ['pressure.stillHolds', 'Still holds'], ['pressure.unknown', 'Unresolved'],
  ['meet.between', 'Writing'], ['meet.relation', 'Connection'], ['meet.limit', 'Limit'],
  ['essay.text', 'Writing'], ['proposal.text', 'Proposed wording']
];
const valueAt = (draft, path) => path.split('.').reduce((value, key) => value?.[key], draft);
const changedWording = draft => clean(draft?.provisionalText) !== clean(draft?.originalText);
const authoredFields = draft => [
  ...fields.map(([path, label]) => [label, valueAt(draft, path)]),
  ...(changedWording(draft) ? [['Proposed wording', draft?.provisionalText]] : [])
];
const authoredFilter = pattern => ({ $or: [
  ...fields.map(([path]) => ({ [`draft.${path}`]: pattern })),
  { 'draft.provisionalText': pattern, $expr: { $ne: ['$draft.provisionalText', '$draft.originalText'] } }
] });
const draftProjection = fields.map(([path]) => `draft.${path}`).join(' ');
const explorationProjection = `_id pageId claimId articleId highlightId ${draftProjection} draft.provisionalText draft.originalText origin.pageTitle updatedAt`;

const ownedOrigins = async ({ rows, WikiPage, Article, userId }) => {
  const load = async (Model, ids, select) => ids.length ? Model.find({
    _id: { $in: [...new Set(ids)] }, userId
  }).select(select).lean() : [];
  const [pages, articles] = await Promise.all([
    load(WikiPage, rows.filter(row => row.pageId).map(row => id(row.pageId)), '_id title status archived hiddenFromHome debugOnly'),
    load(Article, rows.filter(row => row.articleId).map(row => id(row.articleId)), '_id title highlights._id status archived hiddenFromHome debugOnly')
  ]);
  return new Map([...pages, ...articles].map(origin => [id(origin), origin]));
};

const suppressed = origin => origin && (origin.status === 'archived' || origin.archived || origin.hiddenFromHome || origin.debugOnly);

const explorationSummary = (row, origin) => {
  const draft = row.draft || {};
  const body = authoredFields(draft).filter(([label]) => !['Title', 'Question', 'Return note'].includes(label)).map(([, text]) => text).find(value => clean(value));
  return {
    id: id(row),
    ...(row.articleId
      ? { articleId: id(row.articleId), highlightId: id(row.highlightId), originMissing: !origin?.highlights?.some(highlight => id(highlight) === id(row.highlightId)) }
      : { pageId: id(row.pageId), claimId: row.claimId }),
    ...(origin ? {} : { sourceUnavailable: true }),
    pageTitle: clean(origin?.title || row.origin?.pageTitle || 'Earlier source').slice(0, 500),
    title: wordBoundaryTrim(clean(draft.title) || firstLine(body) || clean(draft.question) || clean(draft.returnNote), { maxLength: 160 }),
    returnNote: clean(draft.returnNote).slice(0, 320),
    updatedAt: row.updatedAt || null
  };
};

const listRecentExplorations = async ({ AuthoredExploration, WikiPage, Article, userId }) => {
  const rows = await AuthoredExploration.find({ userId, ...authoredFilter(/\S/) })
    .sort({ updatedAt: -1, _id: -1 }).limit(CANDIDATE_LIMIT).select(explorationProjection).lean();
  const origins = await ownedOrigins({ rows, WikiPage, Article, userId });
  return rows.filter(row => !suppressed(origins.get(id(row.pageId || row.articleId))))
    .filter(row => authoredFields(row.draft).some(([, value]) => clean(value)))
    .slice(0, 5).map(row => explorationSummary(row, origins.get(id(row.pageId || row.articleId))));
};

// Older notes may predate blocks. Their visible text can still supply a preview.
const plainNotebookText = value => clean(String(value ?? '')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(nbsp|amp|lt|gt|quot|apos);/g, (_, entity) => ({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity]))
  .replace(/&#(x[\da-f]+|\d+);/gi, (raw, code) => {
    const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : raw;
  }));
const notebookFields = row => [
  ['Title', /^untitled(?: note| notebook page)?$/i.test(clean(row.title)) ? '' : row.title],
  ...(row.blocks?.length ? row.blocks.map(block => ['Note', block.text]) : [['Note', plainNotebookText(row.content)]])
];
const literalPattern = query => new RegExp(query.split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'i');
const excerptMatch = (values, pattern) => {
  for (const [label, value] of values) {
    const text = clean(value);
    const match = pattern.exec(text);
    if (!match) continue;
    const start = Math.max(0, match.index - 64);
    const end = Math.min(text.length, Math.max(start + 240, match.index + match[0].length + 40));
    const prefix = start ? '…' : '';
    return {
      label, excerpt: `${prefix}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
      matchStart: prefix.length + match.index - start, matchLength: match[0].length
    };
  }
  return null;
};

const searchAuthoredWork = async ({ NotebookEntry, AuthoredExploration, WikiPage, Article, userId, query }) => {
  const phrase = clean(query);
  if (phrase.length < 2 || phrase.length > MAX_QUERY_LENGTH) {
    const error = new Error(`Use between 2 and ${MAX_QUERY_LENGTH} characters to find your writing.`);
    error.status = 400;
    throw error;
  }
  const pattern = literalPattern(phrase);
  const read = (Model, filter, projection) => Model.find({ userId, ...filter })
    .sort({ updatedAt: -1, _id: -1 }).limit(CANDIDATE_LIMIT)
    .select(projection).maxTimeMS(MAX_QUERY_MS).lean();
  const [notes, explorations] = await Promise.all([
    read(NotebookEntry, {
      archived: { $ne: true }, hiddenFromHome: { $ne: true }, debugOnly: { $ne: true },
      $or: [{ title: pattern }, { 'blocks.text': pattern },
        { 'blocks.0': { $exists: false }, content: literalPattern(phrase.split(' ')[0]) }]
    }, '_id title blocks.text content updatedAt'),
    read(AuthoredExploration, authoredFilter(pattern), explorationProjection)
  ]);
  const origins = await ownedOrigins({ rows: explorations, WikiPage, Article, userId });
  const matches = [
    ...notes.map(row => {
      const match = excerptMatch(notebookFields(row), pattern);
      const preview = notebookFields(row).slice(1).map(([, value]) => firstLine(value)).find(Boolean) || '';
      return match && { kind: 'notebook', id: id(row), title: wordBoundaryTrim(row.title || '', { maxLength: 160 }), snippet: wordBoundaryTrim(preview, { maxLength: 240 }), updatedAt: row.updatedAt, ...match };
    }),
    ...explorations.map(row => {
      const origin = origins.get(id(row.pageId || row.articleId));
      if (suppressed(origin)) return null;
      const match = excerptMatch(authoredFields(row.draft), pattern);
      return match && { kind: 'exploration', ...explorationSummary(row, origin), ...match };
    })
  ].filter(Boolean).sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0) || right.id.localeCompare(left.id));
  return {
    results: matches.slice(0, RESULT_LIMIT),
    limited: notes.length === CANDIDATE_LIMIT || explorations.length === CANDIDATE_LIMIT || matches.length > RESULT_LIMIT
  };
};

module.exports = { listRecentExplorations, searchAuthoredWork, plainNotebookText };
