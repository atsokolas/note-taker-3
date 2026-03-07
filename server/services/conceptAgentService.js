const mongoose = require('mongoose');
const { ensureWorkspace, applyPatchOp } = require('../utils/workspaceUtils');
const { semanticSearch, planConcept } = require('../config/aiClient');

const SUPPORTED_MODE = 'library_only';
const MAX_INITIAL_QUERIES = 6;
const MAX_CANDIDATE_ITEMS = 40;
const SEARCH_LIMIT_PER_QUERY = 20;
const AGENT_BUILD_PREFIX = 'Agent Build';

const toSafeString = (value) => String(value || '').trim();

const clampMaxLoops = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  const rounded = Math.round(numeric);
  return Math.max(1, Math.min(2, rounded));
};

const toSafeScore = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const buildSnippet = (value, limit = 320) => {
  const clean = toSafeString(value).replace(/\s+/g, ' ');
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
    name: new RegExp(`^${safeConceptId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
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

const parseSemanticResultIdentity = (result) => {
  const parsed = parseEmbeddingId(result?.id || '');
  const metadata = result?.metadata && typeof result.metadata === 'object' ? result.metadata : {};
  const rawType = toSafeString(result?.objectType || metadata.objectType || parsed.objectType).toLowerCase();
  const type = rawType === 'article' || rawType === 'highlight' ? rawType : '';
  const objectId = toSafeString(result?.objectId || metadata.objectId || parsed.objectId);
  if (!type || !objectId) return null;
  return { type, id: objectId, metadata };
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

const buildCandidateItems = async ({ queryResults, userId }) => {
  const allParsed = [];
  (Array.isArray(queryResults) ? queryResults : []).forEach((result) => {
    const identity = parseSemanticResultIdentity(result);
    if (!identity) return;
    allParsed.push({
      type: identity.type,
      id: identity.id,
      metadata: identity.metadata || {},
      score: toSafeScore(result?.score),
      document: toSafeString(result?.document)
    });
  });

  if (allParsed.length === 0) return [];

  const articleIds = new Set();
  const highlightIds = new Set();
  allParsed.forEach((entry) => {
    if (entry.type === 'article') articleIds.add(entry.id);
    if (entry.type === 'highlight') highlightIds.add(entry.id);
    const metadataArticleId = toSafeString(entry.metadata?.articleId);
    if (metadataArticleId) articleIds.add(metadataArticleId);
  });

  const [articleMap, highlightMap] = await Promise.all([
    fetchArticleDetails({ userId, articleIds: Array.from(articleIds) }),
    fetchHighlightDetails({ userId, highlightIds: Array.from(highlightIds) })
  ]);

  const deduped = new Map();
  allParsed.forEach((entry) => {
    const key = `${entry.type}:${entry.id}`;
    const linkedArticleId = entry.type === 'highlight'
      ? (highlightMap.get(entry.id)?.articleId || toSafeString(entry.metadata?.articleId))
      : entry.id;
    const linkedArticle = articleMap.get(linkedArticleId);

    let title = null;
    let text = '';
    let source = null;

    if (entry.type === 'article') {
      title = linkedArticle?.title || toSafeString(entry.metadata?.title) || null;
      text = buildSnippet(entry.document || linkedArticle?.content || '', 420);
      source = linkedArticle?.url || null;
    } else if (entry.type === 'highlight') {
      const highlight = highlightMap.get(entry.id);
      title = highlight?.articleTitle || null;
      const quote = buildSnippet(highlight?.text || entry.document || '', 320);
      const note = buildSnippet(highlight?.note || '', 180);
      text = note ? `${quote} (Note: ${note})` : quote;
      source = linkedArticle?.url || null;
    }

    if (!text) return;
    const candidate = {
      type: entry.type,
      id: entry.id,
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

const formatGroupTitle = (timestampLabel, title) => {
  const suffix = toSafeString(title) || 'Theme';
  return `${AGENT_BUILD_PREFIX} ${timestampLabel} · ${suffix}`.slice(0, 180);
};

const normalizeRefType = (value) => {
  const type = toSafeString(value).toLowerCase();
  return type === 'article' || type === 'highlight' ? type : '';
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

const appendAgentWorkspaceMeta = ({ concept, timestampIso, mode, queries, plan, candidateItems }) => {
  const previousMeta = concept.get('meta.workspace.agentBuilds') || [];
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
  const nextMeta = [...(Array.isArray(previousMeta) ? previousMeta : []), nextEntry].slice(-20);
  concept.set('meta.workspace.agentBuilds', nextMeta, { strict: false });
  concept.markModified('meta');
};

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
    const semanticResults = [];
    for (const query of initialQueries) {
      const response = await semanticSearch({
        userId: safeUserId,
        query,
        types: ['article', 'highlight'],
        limit: SEARCH_LIMIT_PER_QUERY
      });
      const matches = Array.isArray(response?.results) ? response.results : [];
      semanticResults.push(...matches);
    }
    candidateItems = await buildCandidateItems({
      queryResults: semanticResults,
      userId: safeUserId
    });
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

  if (!candidateItems.length) {
    const error = new Error('Concept agent retrieval produced no candidate items. Try adding more source material before building.');
    error.status = 422;
    throw error;
  }

  const planResponse = await planConcept({
    concept_title: conceptTitle,
    concept_description: conceptDescription || null,
    candidate_items: candidateItems
  });
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
  buildConceptWorkspace
};
