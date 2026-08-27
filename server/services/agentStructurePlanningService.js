const { chatComplete } = require('../ai/hfTextClient');

const clean = (value) => String(value || '').trim();
const lower = (value) => clean(value).toLowerCase();

const OPERATION_TYPES = new Set([
  'create_folder',
  'rename_folder',
  'move_item',
  'merge_folder',
  'delete_folder'
]);

const LIBRARY_STRUCTURE_PLAN_SCHEMA = Object.freeze({
  type: 'json_schema',
  json_schema: {
    name: 'library_structure_plan',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'summary', 'rationale', 'operations'],
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'type',
              'folderId',
              'name',
              'itemId',
              'destinationFolderId',
              'destinationFolderName',
              'sourceFolderId',
              'reason'
            ],
            properties: {
              type: { type: 'string', enum: Array.from(OPERATION_TYPES) },
              folderId: { type: 'string' },
              name: { type: 'string' },
              itemId: { type: 'string' },
              destinationFolderId: { type: 'string' },
              destinationFolderName: { type: 'string' },
              sourceFolderId: { type: 'string' },
              reason: { type: 'string' }
            }
          }
        }
      }
    }
  }
});

const structureError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const queryRows = async ({ model, query = {}, select = '', sort = {}, limit = 500 } = {}) => {
  if (!model || typeof model.find !== 'function') return [];
  let cursor = model.find(query);
  if (cursor?.select) cursor = cursor.select(select);
  if (cursor?.sort) cursor = cursor.sort(sort);
  if (cursor?.limit) cursor = cursor.limit(limit);
  const rows = cursor?.lean ? await cursor.lean() : await cursor;
  return Array.isArray(rows) ? rows : [];
};

const loadLibraryStructureInventory = async ({
  Folder,
  Article,
  userId = '',
  maxArticles = 500
} = {}) => {
  const articleLimit = Math.max(1, Math.min(1000, Number(maxArticles) || 500));
  const [folderRows, articleRows] = await Promise.all([
    queryRows({
      model: Folder,
      query: { userId },
      select: '_id name',
      sort: { name: 1 },
      limit: 300
    }),
    queryRows({
      model: Article,
      query: {
        userId,
        archived: { $ne: true },
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true }
      },
      select: '_id title folder siteName createdAt',
      sort: { createdAt: -1, _id: -1 },
      limit: articleLimit + 1
    })
  ]);

  const folders = folderRows
    .map((folder) => ({ id: clean(folder?._id), name: clean(folder?.name) }))
    .filter((folder) => folder.id && folder.name);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const articles = articleRows
    .slice(0, articleLimit)
    .map((article) => {
      const folderId = clean(article?.folder);
      return {
        id: clean(article?._id),
        title: clean(article?.title),
        siteName: clean(article?.siteName),
        folderId: folderById.has(folderId) ? folderId : '',
        folderName: folderById.get(folderId)?.name || 'Unfiled'
      };
    })
    .filter((article) => article.id && article.title);

  const articleCountByFolder = new Map();
  articles.forEach((article) => {
    const key = article.folderId || 'unfiled';
    articleCountByFolder.set(key, (articleCountByFolder.get(key) || 0) + 1);
  });

  return {
    folders: folders.map((folder) => ({
      ...folder,
      articleCount: articleCountByFolder.get(folder.id) || 0
    })),
    articles,
    totalArticles: articles.length,
    unfiledCount: articleCountByFolder.get('unfiled') || 0,
    truncated: articleRows.length > articleLimit
  };
};

const compactInventoryForPrompt = (inventory = {}) => ({
  folders: (Array.isArray(inventory.folders) ? inventory.folders : []).map((folder) => ({
    id: folder.id,
    name: folder.name,
    articleCount: folder.articleCount
  })),
  articles: (Array.isArray(inventory.articles) ? inventory.articles : []).map((article) => ({
    id: article.id,
    title: article.title.slice(0, 160),
    siteName: article.siteName.slice(0, 80),
    folderId: article.folderId,
    folderName: article.folderName
  })),
  totalArticles: Number(inventory.totalArticles || 0),
  unfiledCount: Number(inventory.unfiledCount || 0),
  truncated: Boolean(inventory.truncated)
});

const buildStructurePlannerMessages = ({ inventory = {}, request = '' } = {}) => ([
  {
    role: 'system',
    content: [
      'You are the Noeis Library structure planner.',
      'Return only the requested JSON structure plan.',
      'Every referenced folderId and itemId must come verbatim from the supplied inventory.',
      'Prefer a small number of high-confidence changes over a sweeping taxonomy.',
      'Do not rename, merge, or delete a folder unless the inventory makes the case explicit.',
      'A move may target an existing destinationFolderId or a destinationFolderName created earlier in the same plan.',
      'Never move an article into its current folder.',
      'All actions are proposals and require human review before application.'
    ].join(' ')
  },
  {
    role: 'user',
    content: JSON.stringify({
      request: clean(request) || 'Organize my library.',
      inventory: compactInventoryForPrompt(inventory)
    })
  }
]);

const parsePlan = (value = '') => {
  const text = clean(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fenced) return null;
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_nestedError) {
      return null;
    }
  }
};

const validateAndBuildOperations = ({ plan = {}, inventory = {} } = {}) => {
  const rawOperations = Array.isArray(plan.operations) ? plan.operations : [];
  if (rawOperations.length === 0 || rawOperations.length > 30) {
    throw structureError(422, 'The structure planner did not return a bounded set of operations.');
  }

  const folders = Array.isArray(inventory.folders) ? inventory.folders : [];
  const articles = Array.isArray(inventory.articles) ? inventory.articles : [];
  const folderById = new Map(folders.map((folder) => [clean(folder.id), folder]));
  const articleById = new Map(articles.map((article) => [clean(article.id), article]));
  const reservedFolderNames = new Set(folders.map((folder) => lower(folder.name)).filter(Boolean));
  const createdFolderNames = new Set();

  return rawOperations.map((rawOperation, index) => {
    const type = lower(rawOperation?.type);
    const reason = clean(rawOperation?.reason);
    if (!OPERATION_TYPES.has(type) || !reason) {
      throw structureError(422, `Structure operation ${index + 1} is incomplete.`);
    }

    const folderId = clean(rawOperation?.folderId);
    const name = clean(rawOperation?.name);
    const itemId = clean(rawOperation?.itemId);
    const destinationFolderId = clean(rawOperation?.destinationFolderId);
    const destinationFolderName = clean(rawOperation?.destinationFolderName);
    const sourceFolderId = clean(rawOperation?.sourceFolderId);
    const opId = `${type}-${index + 1}`;
    let payload = {};
    let preview = { reason, source: 'agent_chat' };
    let risk = 'low';

    if (type === 'create_folder') {
      const nameKey = lower(name);
      if (!nameKey || reservedFolderNames.has(nameKey) || createdFolderNames.has(nameKey)) {
        throw structureError(422, `Structure operation ${index + 1} proposes an invalid or duplicate folder name.`);
      }
      createdFolderNames.add(nameKey);
      payload = { name };
      preview = { ...preview, folderName: name };
    }

    if (type === 'rename_folder') {
      const folder = folderById.get(folderId);
      const nameKey = lower(name);
      if (!folder || !nameKey || (reservedFolderNames.has(nameKey) && lower(folder.name) !== nameKey)) {
        throw structureError(422, `Structure operation ${index + 1} references an invalid folder rename.`);
      }
      payload = { folderId, name };
      preview = { ...preview, folderName: folder.name, proposedName: name };
    }

    if (type === 'move_item') {
      const article = articleById.get(itemId);
      const destinationFolder = folderById.get(destinationFolderId);
      const createdDestination = createdFolderNames.has(lower(destinationFolderName));
      if (!article || (!destinationFolder && !createdDestination)) {
        throw structureError(422, `Structure operation ${index + 1} references an unknown article or destination.`);
      }
      if (destinationFolder && article.folderId === destinationFolder.id) {
        throw structureError(422, `Structure operation ${index + 1} would leave an article in its current folder.`);
      }
      payload = {
        itemId,
        ...(destinationFolder ? { destinationFolderId } : { destinationFolderName })
      };
      preview = {
        ...preview,
        itemTitle: article.title,
        fromFolderName: article.folderName,
        destinationFolderName: destinationFolder?.name || destinationFolderName
      };
    }

    if (type === 'merge_folder') {
      const sourceFolder = folderById.get(sourceFolderId);
      const destinationFolder = folderById.get(destinationFolderId);
      if (!sourceFolder || !destinationFolder || sourceFolder.id === destinationFolder.id) {
        throw structureError(422, `Structure operation ${index + 1} references an invalid folder merge.`);
      }
      payload = { sourceFolderId, destinationFolderId };
      preview = {
        ...preview,
        sourceFolderName: sourceFolder.name,
        destinationFolderName: destinationFolder.name
      };
      risk = 'medium';
    }

    if (type === 'delete_folder') {
      const folder = folderById.get(folderId);
      if (!folder || Number(folder.articleCount || 0) !== 0) {
        throw structureError(422, `Structure operation ${index + 1} may delete only an owned empty folder.`);
      }
      payload = { folderId };
      preview = { ...preview, folderName: folder.name };
      risk = 'medium';
    }

    return {
      opId,
      type,
      targetDomain: 'library',
      status: 'pending',
      payload,
      preview,
      risk,
      undoPayload: {}
    };
  });
};

const buildLibraryStructureProposalDraft = ({
  plan = {},
  inventory = {},
  userId = '',
  sourceBundleId = '',
  actor = { actorType: 'native_agent', actorId: 'resident' }
} = {}) => {
  const title = clean(plan.title);
  const summary = clean(plan.summary);
  const rationale = clean(plan.rationale);
  if (!title || !summary || !rationale) {
    throw structureError(422, 'The structure planner did not return a complete proposal description.');
  }
  return {
    userId,
    sourceThreadId: null,
    sourceRunId: null,
    sourceBundleId: clean(sourceBundleId),
    scope: 'workspace',
    scopeRef: 'library',
    status: 'pending',
    title,
    summary,
    rationale,
    operations: validateAndBuildOperations({ plan, inventory }),
    createdBy: actor
  };
};

const planLibraryStructureProposal = async ({
  Folder,
  Article,
  userId = '',
  request = '',
  sourceBundleId = '',
  actor,
  complete = chatComplete
} = {}) => {
  const inventory = await loadLibraryStructureInventory({ Folder, Article, userId });
  if (inventory.totalArticles === 0) {
    throw structureError(409, 'There are no visible Library articles to organize.');
  }
  const completion = await complete({
    route: 'structure_planner',
    messages: buildStructurePlannerMessages({ inventory, request }),
    responseFormat: LIBRARY_STRUCTURE_PLAN_SCHEMA
  });
  const plan = parsePlan(completion?.text);
  if (!plan) throw structureError(422, 'The structure planner did not return valid JSON.');
  return {
    draft: buildLibraryStructureProposalDraft({
      plan,
      inventory,
      userId,
      sourceBundleId,
      actor
    }),
    inventory: {
      folderCount: inventory.folders.length,
      articleCount: inventory.totalArticles,
      unfiledCount: inventory.unfiledCount,
      truncated: inventory.truncated
    },
    model: clean(completion?.model),
    provider: clean(completion?.provider),
    upstream: clean(completion?.upstream),
    upstreamAttempts: Array.isArray(completion?.upstreamAttempts) ? completion.upstreamAttempts : []
  };
};

const persistLibraryStructureProposal = async ({
  AgentStructureProposal,
  draft = {},
  threadId = ''
} = {}) => {
  if (!AgentStructureProposal || typeof AgentStructureProposal.create !== 'function') {
    throw structureError(500, 'AgentStructureProposal is unavailable.');
  }
  const sourceBundleId = clean(draft.sourceBundleId);
  if (sourceBundleId && typeof AgentStructureProposal.findOne === 'function') {
    const existing = await AgentStructureProposal.findOne({
      userId: draft.userId,
      sourceBundleId
    });
    if (existing) return existing;
  }
  return AgentStructureProposal.create({
    ...draft,
    sourceThreadId: clean(threadId) || null
  });
};

module.exports = {
  LIBRARY_STRUCTURE_PLAN_SCHEMA,
  loadLibraryStructureInventory,
  buildStructurePlannerMessages,
  validateAndBuildOperations,
  buildLibraryStructureProposalDraft,
  planLibraryStructureProposal,
  persistLibraryStructureProposal
};
