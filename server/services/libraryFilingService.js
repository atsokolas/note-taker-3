const { chatComplete } = require('../ai/hfTextClient');

const clean = (value) => String(value || '').trim();

const FILING_SCOPE_REF = 'library-filing';
const CLASSIFY_BATCH_SIZE = 20;

const inferOrganizationFolderNameRegex = (item = {}) => {
  const text = `${clean(item?.title)} ${clean(item?.snippet)}`.toLowerCase();
  if (/\b(shinkansen|rail|transport|train|mobility)\b/.test(text)) return 'Transportation';
  if (/\b(crypto|blockchain|exchange|hyperliquid|bitcoin|ethereum)\b/.test(text)) return 'Blockchain and Crypto';
  if (/\b(ai|artificial intelligence|startup|technology|innovation|model|gpt)\b/.test(text)) return 'Technology and Innovation';
  if (/\b(company|earnings|letter|ceo|executive|business|market|berkshire|update|news)\b/.test(text)) return 'Company News and Updates';
  if (/\b(personal|career|story|profile|memoir)\b/.test(text)) return 'Personal and Professional Updates';
  return 'Curated Research';
};

const extractJson = (raw = '') => {
  const text = clean(raw);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    // try fenced block
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch (_error) {
      // try slice
    }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (_error) {
      return null;
    }
  }
  return null;
};

const buildArticleSnippet = (article = {}) => {
  const highlights = Array.isArray(article?.highlights) ? article.highlights : [];
  const firstHighlight = highlights.find((entry) => clean(entry?.text));
  if (firstHighlight) return clean(firstHighlight.text).slice(0, 240);
  return clean(article?.title).slice(0, 240);
};

const resolveExistingFolderName = (proposedName = '', existingFolders = []) => {
  const safeProposed = clean(proposedName);
  if (!safeProposed) return '';
  const lower = safeProposed.toLowerCase();
  const match = (Array.isArray(existingFolders) ? existingFolders : [])
    .find((folder) => clean(folder?.name).toLowerCase() === lower);
  return match ? clean(match.name) : safeProposed.slice(0, 96);
};

const folderExists = (folderName = '', existingFolders = []) => {
  const lower = clean(folderName).toLowerCase();
  if (!lower) return false;
  return (Array.isArray(existingFolders) ? existingFolders : [])
    .some((folder) => clean(folder?.name).toLowerCase() === lower);
};

const buildFilingStructureOperations = ({
  classifications = [],
  existingFolders = []
} = {}) => {
  const folderOpsByKey = new Map();
  const operations = [];
  const seenMoves = new Set();

  classifications.forEach((entry) => {
    const itemId = clean(entry?.id);
    const folderName = resolveExistingFolderName(entry?.folderName, existingFolders);
    if (!itemId || !folderName) return;

    const folderKey = `library:${folderName.toLowerCase()}`;
    if (!folderOpsByKey.has(folderKey) && !folderExists(folderName, existingFolders)) {
      const createOp = {
        opId: `create-library-${folderOpsByKey.size + 1}`,
        type: 'create_folder',
        targetDomain: 'library',
        status: 'pending',
        payload: { name: folderName },
        preview: { folderName },
        risk: 'low'
      };
      folderOpsByKey.set(folderKey, createOp);
      operations.push(createOp);
    }

    const moveKey = `library:${itemId}`;
    if (seenMoves.has(moveKey)) return;
    seenMoves.add(moveKey);
    operations.push({
      opId: `move-library-${seenMoves.size}`,
      type: 'move_item',
      targetDomain: 'library',
      status: 'pending',
      payload: {
        itemId,
        destinationFolderName: folderName
      },
      preview: {
        itemTitle: clean(entry?.title) || itemId,
        destinationFolderName: folderName
      },
      risk: 'low'
    });
  });

  return operations;
};

const classifyArticlesWithRegex = (articles = []) => (
  articles.map((article) => {
    const id = clean(article?._id || article?.id);
    const title = clean(article?.title) || 'Untitled article';
    const snippet = buildArticleSnippet(article);
    return {
      id,
      title,
      snippet,
      folderName: inferOrganizationFolderNameRegex({ title, snippet }),
      method: 'regex'
    };
  }).filter((entry) => entry.id)
);

const classifyArticleBatchWithLlm = async ({
  articles = [],
  existingFolders = []
} = {}) => {
  if (!Array.isArray(articles) || articles.length === 0) return [];

  const folderNames = (Array.isArray(existingFolders) ? existingFolders : [])
    .map((folder) => clean(folder?.name))
    .filter(Boolean)
    .slice(0, 80);

  const payloadArticles = articles.map((article) => ({
    id: clean(article?._id || article?.id),
    title: clean(article?.title) || 'Untitled article',
    snippet: buildArticleSnippet(article)
  })).filter((entry) => entry.id);

  const completion = await chatComplete({
    route: 'structure_planner',
    temperature: 0.2,
    maxTokens: 1800,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You classify library articles into folders for a personal knowledge base.',
          'Prefer an existing folder when it is a sensible fit.',
          'Only propose a new folder when nothing existing fits.',
          'Return JSON: {"classifications":[{"id":"...","folderName":"...","confidence":0.0,"isNew":false}]}',
          `Existing folders: ${folderNames.length ? folderNames.join(' | ') : '(none yet)'}`
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({ articles: payloadArticles })
      }
    ]
  });

  const parsed = extractJson(completion?.text || completion?.content || '');
  const rows = Array.isArray(parsed?.classifications) ? parsed.classifications : [];
  const byId = new Map(
    rows
      .map((entry) => [clean(entry?.id), entry])
      .filter(([id]) => id)
  );

  return payloadArticles.map((article) => {
    const match = byId.get(article.id);
    const folderName = resolveExistingFolderName(match?.folderName, existingFolders)
      || inferOrganizationFolderNameRegex(article);
    return {
      id: article.id,
      title: article.title,
      snippet: article.snippet,
      folderName,
      method: match?.folderName ? 'llm' : 'regex'
    };
  });
};

const classifyArticles = async ({
  articles = [],
  existingFolders = []
} = {}) => {
  const safeArticles = Array.isArray(articles) ? articles : [];
  if (safeArticles.length === 0) return { classifications: [], llmCount: 0, regexCount: 0 };

  const output = [];
  let llmCount = 0;
  let regexCount = 0;

  for (let index = 0; index < safeArticles.length; index += CLASSIFY_BATCH_SIZE) {
    const batch = safeArticles.slice(index, index + CLASSIFY_BATCH_SIZE);
    try {
      const classified = await classifyArticleBatchWithLlm({ articles: batch, existingFolders });
      classified.forEach((entry) => {
        output.push(entry);
        if (entry.method === 'llm') llmCount += 1;
        else regexCount += 1;
      });
    } catch (_error) {
      classifyArticlesWithRegex(batch).forEach((entry) => {
        output.push(entry);
        regexCount += 1;
      });
    }
  }

  return { classifications: output, llmCount, regexCount };
};

const findExistingLibraryFilingProposal = async ({
  AgentStructureProposal,
  userId = ''
} = {}) => {
  if (!AgentStructureProposal || typeof AgentStructureProposal.findOne !== 'function') return null;
  if (!clean(userId)) return null;
  return AgentStructureProposal.findOne({
    userId,
    scope: 'workspace',
    scopeRef: FILING_SCOPE_REF,
    status: 'pending'
  });
};

const loadUnfiledArticlesWithHighlights = async ({
  Article,
  userId = ''
} = {}) => {
  if (!Article || typeof Article.find !== 'function' || !clean(userId)) return [];
  return Article.find({
    userId,
    $or: [{ folder: null }, { folder: { $exists: false } }],
    'highlights.0': { $exists: true }
  })
    .select('title url highlights folder')
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
};

const buildLibraryFilingProposalPayload = ({
  userId = '',
  classifications = [],
  existingFolders = [],
  sourceThreadId = ''
} = {}) => {
  const operations = buildFilingStructureOperations({ classifications, existingFolders });
  const articleCount = classifications.length;
  const folderNames = new Set(classifications.map((entry) => clean(entry?.folderName)).filter(Boolean));

  if (!clean(userId) || operations.length === 0) return null;

  return {
    userId,
    sourceThreadId: clean(sourceThreadId) || null,
    sourceBundleId: `library-filing:${Date.now()}`,
    scope: 'workspace',
    scopeRef: FILING_SCOPE_REF,
    status: 'pending',
    title: 'Review library filing suggestions',
    summary: `Review ${articleCount} unfiled ${articleCount === 1 ? 'article' : 'articles'} with highlights across ${folderNames.size} proposed ${folderNames.size === 1 ? 'folder' : 'folders'}. Nothing moves until you approve.`,
    rationale: 'Library filing should stay reviewable and reversible instead of silently reshaping the cabinet.',
    operations,
    createdBy: {
      actorType: 'native_agent',
      actorId: 'library-filing'
    }
  };
};

const stageLibraryFilingSuggestions = async ({
  AgentStructureProposal,
  AgentThread,
  Article,
  Folder,
  appendThreadMessage,
  compactThreadState,
  sanitizeAgentStructureProposalDoc,
  sanitizeAgentThreadDoc,
  userId = '',
  actor = null
} = {}) => {
  const safeUserId = clean(userId);
  if (!safeUserId) {
    const error = new Error('userId is required.');
    error.status = 400;
    throw error;
  }

  const existing = await findExistingLibraryFilingProposal({
    AgentStructureProposal,
    userId: safeUserId
  });
  if (existing) {
    const threadId = clean(existing.sourceThreadId);
    const thread = threadId && AgentThread
      ? await AgentThread.findOne({ _id: threadId, userId: safeUserId }).lean()
      : null;
    return {
      reused: true,
      structureProposal: sanitizeAgentStructureProposalDoc
        ? sanitizeAgentStructureProposalDoc(existing)
        : existing,
      thread: thread && sanitizeAgentThreadDoc ? sanitizeAgentThreadDoc(thread) : thread,
      receipt: {
        stage: 'ready',
        summary: `Reopened ${clean(existing.summary) || 'the pending filing review'}.`,
        articleCount: (existing.operations || []).filter((op) => clean(op?.type) === 'move_item').length,
        folderCount: new Set(
          (existing.operations || [])
            .map((op) => clean(op?.payload?.destinationFolderName || op?.preview?.folderName || op?.preview?.destinationFolderName))
            .filter(Boolean)
        ).size,
        classifiedWithLlm: null,
        classifiedWithFallback: null
      }
    };
  }

  const [articles, folders] = await Promise.all([
    loadUnfiledArticlesWithHighlights({ Article, userId: safeUserId }),
    Folder && typeof Folder.find === 'function'
      ? Folder.find({ userId: safeUserId }).select('name').sort({ name: 1 }).lean()
      : []
  ]);

  if (!articles.length) {
    const error = new Error('No unfiled articles with highlights are ready to classify.');
    error.status = 404;
    throw error;
  }

  const { classifications, llmCount, regexCount } = await classifyArticles({
    articles,
    existingFolders: folders
  });

  const payload = buildLibraryFilingProposalPayload({
    userId: safeUserId,
    classifications,
    existingFolders: folders
  });

  if (!payload) {
    const error = new Error('Could not build a filing proposal for the current library state.');
    error.status = 500;
    throw error;
  }

  const safeActor = actor && typeof actor === 'object'
    ? actor
    : { actorType: 'user', actorId: safeUserId };

  let thread = null;
  if (AgentThread && typeof AgentThread.create === 'function') {
    thread = await AgentThread.create({
      userId: safeUserId,
      title: 'Library filing suggestions',
      status: 'active',
      summary: '',
      scope: { type: 'workspace', id: 'library', title: 'Library' },
      createdBy: safeActor,
      lastActor: safeActor,
      messages: []
    });
    payload.sourceThreadId = thread._id;
  }

  const proposal = await AgentStructureProposal.create(payload);

  if (thread && typeof appendThreadMessage === 'function') {
    appendThreadMessage(thread, {
      role: 'user',
      text: 'Review filing suggestions for unfiled library articles with highlights.',
      actor: safeActor
    });
    appendThreadMessage(thread, {
      role: 'assistant',
      text: payload.summary,
      actor: { actorType: 'native_agent', actorId: 'library-filing' },
      suggestedActions: ['Review filing proposal', 'Apply approved moves'],
      metadata: {
        structureProposalId: String(proposal._id)
      }
    });
    if (typeof compactThreadState === 'function') {
      compactThreadState(thread, {
        actor: { actorType: 'native_agent', actorId: 'library-filing' }
      });
    }
    await thread.save();
  }

  const folderCount = new Set(classifications.map((entry) => clean(entry?.folderName)).filter(Boolean)).size;

  return {
    reused: false,
    structureProposal: sanitizeAgentStructureProposalDoc
      ? sanitizeAgentStructureProposalDoc(proposal)
      : proposal,
    thread: thread && sanitizeAgentThreadDoc ? sanitizeAgentThreadDoc(thread) : thread,
    receipt: {
      stage: 'ready',
      summary: `Staged ${classifications.length} filing ${classifications.length === 1 ? 'suggestion' : 'suggestions'} across ${folderCount} ${folderCount === 1 ? 'folder' : 'folders'} for review.`,
      articleCount: classifications.length,
      folderCount,
      classifiedWithLlm: llmCount,
      classifiedWithFallback: regexCount
    }
  };
};

module.exports = {
  FILING_SCOPE_REF,
  inferOrganizationFolderNameRegex,
  buildArticleSnippet,
  resolveExistingFolderName,
  buildFilingStructureOperations,
  classifyArticlesWithRegex,
  classifyArticles,
  findExistingLibraryFilingProposal,
  loadUnfiledArticlesWithHighlights,
  buildLibraryFilingProposalPayload,
  stageLibraryFilingSuggestions
};
