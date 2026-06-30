const { chatComplete } = require('../ai/hfTextClient');

const clean = (value) => String(value || '').trim();

const FILING_SCOPE_REF = 'library-filing';

const buildLibraryFilingReceipt = ({
  summary = '',
  articleCount = 0,
  folderCount = 0,
  classifiedWithLlm = null,
  classifiedWithFallback = null,
  uncertainCount = null,
  reused = false,
  proposalId = '',
  threadId = '',
  completedAt = new Date()
} = {}) => ({
  id: `filing-${proposalId || threadId || Date.now()}`,
  kind: 'filing',
  source: 'library',
  status: 'needs_review',
  title: reused ? 'Library filing review reopened' : 'Library filing suggestions ready',
  summary,
  metrics: {
    articleCount,
    folderCount,
    classifiedWithLlm,
    classifiedWithFallback,
    uncertainCount
  },
  touched: proposalId
    ? [{ type: 'folder', id: String(proposalId), title: 'Library filing proposal' }]
    : [],
  nextAction: {
    label: 'Review filing proposal',
    href: threadId ? `/think?tab=threads&threadId=${encodeURIComponent(String(threadId))}` : '/think?tab=threads',
    intent: 'review_filing'
  },
  createdAt: new Date(completedAt).toISOString(),
  completedAt: new Date(completedAt).toISOString()
});
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

const countHighlights = (article = {}) => (
  Array.isArray(article?.highlights)
    ? article.highlights.filter((entry) => clean(entry?.text)).length
    : 0
);

const normalizeConfidence = (value, fallback = 0.55) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
};

const normalizeSourceQuality = (value = '') => {
  const safe = clean(value).toLowerCase().replace(/[\s-]+/g, '_');
  return ['strong', 'thin', 'needs_review'].includes(safe) ? safe : '';
};

const normalizeUrlForMerge = (value = '') => {
  const raw = clean(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source'].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.hostname.replace(/^www\./, '').toLowerCase()}${path.toLowerCase()}${parsed.searchParams.toString() ? `?${parsed.searchParams.toString()}` : ''}`;
  } catch (_error) {
    return raw.toLowerCase().replace(/[#?].*$/, '').replace(/\/+$/, '');
  }
};

const normalizeTitleForMerge = (value = '') => (
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const buildSourceMergeKey = (entry = {}) => {
  const urlKey = normalizeUrlForMerge(entry?.url || entry?.sourceUrl || entry?.importMeta?.sourceUrl);
  if (urlKey) return `url:${urlKey}`;
  const titleKey = normalizeTitleForMerge(entry?.title);
  const siteKey = normalizeTitleForMerge(entry?.siteName || entry?.sourceName || entry?.author);
  if (titleKey && siteKey) return `title:${siteKey}:${titleKey}`;
  return '';
};

const inferSourceQuality = (article = {}, confidence = 0.55) => {
  const highlightCount = countHighlights(article);
  const title = clean(article?.title);
  const snippet = buildArticleSnippet(article);
  if (!title || /^untitled/i.test(title) || confidence < 0.5) return 'needs_review';
  if (highlightCount >= 5 || (highlightCount >= 3 && snippet.length >= 120)) return 'strong';
  if (highlightCount <= 1 || snippet.length < 80) return 'thin';
  return 'needs_review';
};

const buildSourceMergeOperations = (classifications = []) => {
  const groups = new Map();
  (Array.isArray(classifications) ? classifications : []).forEach((entry) => {
    const id = clean(entry?.id);
    const key = buildSourceMergeKey(entry);
    if (!id || !key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });

  const operations = [];
  groups.forEach((entries) => {
    if (entries.length < 2) return;
    const sorted = [...entries].sort((left, right) => {
      const rightHighlights = Number(right?.highlightCount) || 0;
      const leftHighlights = Number(left?.highlightCount) || 0;
      if (rightHighlights !== leftHighlights) return rightHighlights - leftHighlights;
      return clean(right?.title).length - clean(left?.title).length;
    });
    const canonical = sorted[0];
    sorted.slice(1).forEach((duplicate) => {
      const sourceItemId = clean(duplicate?.id);
      const destinationItemId = clean(canonical?.id);
      if (!sourceItemId || !destinationItemId || sourceItemId === destinationItemId) return;
      const duplicateHighlights = Number(duplicate?.highlightCount) || 0;
      const canonicalHighlights = Number(canonical?.highlightCount) || 0;
      const reason = `Likely duplicate source: same ${normalizeUrlForMerge(duplicate?.url || duplicate?.sourceUrl) ? 'URL' : 'title/source'} as ${clean(canonical?.title) || 'the canonical article'}. Merge ${duplicateHighlights} ${duplicateHighlights === 1 ? 'highlight' : 'highlights'} into the stronger copy with ${canonicalHighlights} ${canonicalHighlights === 1 ? 'highlight' : 'highlights'}.`;
      operations.push({
        opId: `merge-library-source-${operations.length + 1}`,
        type: 'merge_item',
        targetDomain: 'library',
        status: 'pending',
        payload: {
          sourceItemId,
          destinationItemId,
          reason,
          sourceQuality: 'needs_review',
          duplicateKey: buildSourceMergeKey(duplicate)
        },
        preview: {
          sourceTitle: clean(duplicate?.title) || sourceItemId,
          destinationTitle: clean(canonical?.title) || destinationItemId,
          reason,
          sourceQuality: 'needs_review',
          highlightCount: duplicateHighlights,
          classificationMethod: 'duplicate_detector'
        },
        risk: 'medium'
      });
    });
  });
  return operations;
};

const buildClassificationRationale = ({
  title = '',
  folderName = '',
  snippet = '',
  method = 'regex',
  confidence = 0.55,
  sourceQuality = ''
} = {}) => {
  const safeFolder = clean(folderName) || 'Curated Research';
  const topicHint = clean(snippet)
    ? clean(snippet).split(/\s+/).slice(0, 10).join(' ')
    : clean(title);
  const qualityNote = sourceQuality === 'strong'
    ? 'source has several saved highlights'
    : sourceQuality === 'thin'
      ? 'source has limited highlight material'
      : 'source should be reviewed before bulk filing';
  const methodNote = method === 'llm' ? 'agent classification' : 'fallback classifier';
  return `${safeFolder} fits because ${topicHint || 'the title and saved highlight'} point to that shelf; ${qualityNote}. ${methodNote}, confidence ${Math.round(normalizeConfidence(confidence) * 100)}%.`;
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
    const confidence = normalizeConfidence(entry?.confidence, clean(entry?.method) === 'llm' ? 0.72 : 0.58);
    const sourceQuality = normalizeSourceQuality(entry?.sourceQuality) || 'needs_review';
    const rationale = clean(entry?.rationale || entry?.reason) || buildClassificationRationale({
      title: entry?.title,
      folderName,
      snippet: entry?.snippet,
      method: entry?.method,
      confidence,
      sourceQuality
    });
    const classificationMethod = clean(entry?.method) || 'regex';
    const highlightCount = Number(entry?.highlightCount) || 0;
    operations.push({
      opId: `move-library-${seenMoves.size}`,
      type: 'move_item',
      targetDomain: 'library',
      status: 'pending',
      payload: {
        itemId,
        destinationFolderName: folderName,
        reason: rationale,
        classificationMethod,
        sourceQuality,
        confidence,
        highlightCount
      },
      preview: {
        itemTitle: clean(entry?.title) || itemId,
        destinationFolderName: folderName,
        reason: rationale,
        classificationMethod,
        sourceQuality,
        confidence,
        highlightCount
      },
      risk: 'low'
    });
  });

  return [...operations, ...buildSourceMergeOperations(classifications)];
};

const classifyArticlesWithRegex = (articles = []) => (
  articles.map((article) => {
    const id = clean(article?._id || article?.id);
    const title = clean(article?.title) || 'Untitled article';
    const snippet = buildArticleSnippet(article);
    const confidence = 0.58;
    const sourceQuality = inferSourceQuality(article, confidence);
    const folderName = inferOrganizationFolderNameRegex({ title, snippet });
    return {
      id,
      title,
      snippet,
      url: clean(article?.url),
      siteName: clean(article?.siteName),
      author: clean(article?.author),
      folderName,
      method: 'regex',
      confidence,
      sourceQuality,
      highlightCount: countHighlights(article),
      rationale: buildClassificationRationale({
        title,
        folderName,
        snippet,
        method: 'regex',
        confidence,
        sourceQuality
      })
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
    snippet: buildArticleSnippet(article),
    highlightCount: countHighlights(article),
    url: clean(article?.url),
    siteName: clean(article?.siteName),
    author: clean(article?.author)
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
          'For each row include a short rationale and sourceQuality: strong, thin, or needs_review.',
          'Return JSON: {"classifications":[{"id":"...","folderName":"...","confidence":0.0,"isNew":false,"rationale":"...","sourceQuality":"strong"}]}',
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
    const method = match?.folderName ? 'llm' : 'regex';
    const confidence = normalizeConfidence(match?.confidence, method === 'llm' ? 0.72 : 0.58);
    const sourceQuality = normalizeSourceQuality(match?.sourceQuality)
      || inferSourceQuality(article, confidence);
    const rationale = clean(match?.rationale) || buildClassificationRationale({
      title: article.title,
      folderName,
      snippet: article.snippet,
      method,
      confidence,
      sourceQuality
    });
    return {
      id: article.id,
      title: article.title,
      snippet: article.snippet,
      url: article.url,
      siteName: article.siteName,
      author: article.author,
      folderName,
      method,
      confidence,
      sourceQuality,
      highlightCount: Number(article.highlightCount) || 0,
      rationale
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
    .select('title url siteName author highlights folder')
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
  const uncertainCount = classifications.filter((entry) => (
    normalizeSourceQuality(entry?.sourceQuality) !== 'strong'
    || normalizeConfidence(entry?.confidence) < 0.68
    || clean(entry?.method).toLowerCase() !== 'llm'
  )).length;

  if (!clean(userId) || operations.length === 0) return null;

  return {
    userId,
    sourceThreadId: clean(sourceThreadId) || null,
    sourceBundleId: `library-filing:${Date.now()}`,
    scope: 'workspace',
    scopeRef: FILING_SCOPE_REF,
    status: 'pending',
    title: 'Review library filing suggestions',
    summary: `Review ${articleCount} unfiled ${articleCount === 1 ? 'article' : 'articles'} with highlights across ${folderNames.size} proposed ${folderNames.size === 1 ? 'folder' : 'folders'}. ${uncertainCount ? `${uncertainCount} need ${uncertainCount === 1 ? 'a closer look' : 'closer review'}. ` : ''}Nothing moves until you approve.`,
    rationale: 'Library filing should stay reviewable and reversible. Each move includes the filing reason, source-quality state, highlight count, and confidence before the cabinet changes.',
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
  resumeExisting = false,
  actor = null
} = {}) => {
  const safeUserId = clean(userId);
  if (!safeUserId) {
    const error = new Error('userId is required.');
    error.status = 400;
    throw error;
  }

  const existing = resumeExisting ? await findExistingLibraryFilingProposal({
    AgentStructureProposal,
    userId: safeUserId
  }) : null;
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
      receipt: buildLibraryFilingReceipt({
        reused: true,
        summary: `Reopened ${clean(existing.summary) || 'the pending filing review'}.`,
        articleCount: (existing.operations || []).filter((op) => clean(op?.type) === 'move_item').length,
        folderCount: new Set(
          (existing.operations || [])
            .map((op) => clean(op?.payload?.destinationFolderName || op?.preview?.folderName || op?.preview?.destinationFolderName))
            .filter(Boolean)
        ).size,
        classifiedWithLlm: null,
        classifiedWithFallback: null,
        proposalId: String(existing._id || ''),
        threadId,
        completedAt: new Date()
      })
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
  const uncertainCount = classifications.filter((entry) => (
    normalizeSourceQuality(entry?.sourceQuality) !== 'strong'
    || normalizeConfidence(entry?.confidence) < 0.68
    || clean(entry?.method).toLowerCase() !== 'llm'
  )).length;

  return {
    reused: false,
    structureProposal: sanitizeAgentStructureProposalDoc
      ? sanitizeAgentStructureProposalDoc(proposal)
      : proposal,
    thread: thread && sanitizeAgentThreadDoc ? sanitizeAgentThreadDoc(thread) : thread,
    receipt: buildLibraryFilingReceipt({
      summary: `Staged ${classifications.length} filing ${classifications.length === 1 ? 'suggestion' : 'suggestions'} across ${folderCount} ${folderCount === 1 ? 'folder' : 'folders'} for review.`,
      articleCount: classifications.length,
      folderCount,
      classifiedWithLlm: llmCount,
      classifiedWithFallback: regexCount,
      uncertainCount,
      proposalId: String(proposal?._id || ''),
      threadId: String(thread?._id || ''),
      completedAt: new Date()
    })
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
  buildLibraryFilingReceipt,
  loadUnfiledArticlesWithHighlights,
  buildLibraryFilingProposalPayload,
  stageLibraryFilingSuggestions
};
