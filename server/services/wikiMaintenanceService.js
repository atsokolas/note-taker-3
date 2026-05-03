const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');

const DEFAULT_SOURCE_LIMIT = 24;
const MAX_SOURCE_TEXT = 1800;
const HEALTH_KEYS = [
  'newItems',
  'unsupportedClaims',
  'missingCitations',
  'staleSections',
  'contradictions',
  'relatedPages'
];

const asString = (value = '') => String(value || '').trim();

const truncate = (value = '', limit = 1000) => {
  const text = asString(value).replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
};

const toPlainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node.trim();
  if (Array.isArray(node)) return node.map(toPlainText).filter(Boolean).join(' ').trim();
  if (typeof node !== 'object') return '';
  const ownText = typeof node.text === 'string' ? node.text : '';
  const childText = Array.isArray(node.content) ? toPlainText(node.content) : '';
  return [ownText, childText].filter(Boolean).join(' ').trim();
};

const textNode = (text = '') => ({ type: 'text', text: asString(text) || ' ' });

const paragraph = (text = '') => ({
  type: 'paragraph',
  content: [textNode(text)]
});

const heading = (text = '', level = 2) => ({
  type: 'heading',
  attrs: { level },
  content: [textNode(text || 'Untitled')]
});

const bulletList = (items = []) => ({
  type: 'bulletList',
  content: items.map((item) => ({
    type: 'listItem',
    content: [paragraph(item)]
  }))
});

const normalizeList = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { text: truncate(item, 600) };
      if (!item || typeof item !== 'object') return null;
      return {
        text: truncate(item.text || item.summary || item.title || '', 600),
        section: truncate(item.section || item.target || '', 160),
        sourceTitle: truncate(item.sourceTitle || item.source || '', 180),
        status: truncate(item.status || item.support || '', 80)
      };
    })
    .filter(item => item?.text);
};

const normalizeHealth = (health = {}) => HEALTH_KEYS.reduce((acc, key) => {
  acc[key] = normalizeList(health?.[key]);
  return acc;
}, {});

const tokenize = (value = '') => (
  asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2)
);

const scoreSource = (source, queryTokens = []) => {
  const haystack = `${source.title} ${source.text} ${(source.tags || []).join(' ')}`.toLowerCase();
  const unique = new Set(queryTokens);
  let score = 0;
  unique.forEach((token) => {
    if (haystack.includes(token)) score += token.length > 5 ? 3 : 1;
  });
  if (source.createdAt && Date.now() - new Date(source.createdAt).getTime() < 1000 * 60 * 60 * 24 * 30) score += 2;
  if (source.updatedAt && Date.now() - new Date(source.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 14) score += 2;
  if (source.type === 'highlight' || source.type === 'notebook') score += 1;
  return score;
};

const runFind = async (Model, query = {}, limit = 200) => {
  if (!Model?.find) return [];
  try {
    const result = Model.find(query).sort?.({ updatedAt: -1, createdAt: -1 }).limit?.(limit).lean?.();
    return Array.isArray(await result) ? await result : [];
  } catch (_error) {
    try {
      const result = await Model.find(query);
      return Array.isArray(result) ? result : [];
    } catch (__error) {
      return [];
    }
  }
};

const sourceObjectId = (value) => {
  const id = asString(value?._id || value?.id || value?.objectId);
  return id || null;
};

const collectLibrarySources = async ({ userId, models = {} }) => {
  const [articles, notebooks, concepts, questions] = await Promise.all([
    runFind(models.Article, { userId }, 250),
    runFind(models.NotebookEntry, { userId }, 250),
    runFind(models.TagMeta, { userId }, 200),
    runFind(models.Question, { userId }, 200)
  ]);

  const sources = [];

  articles.forEach((article) => {
    const articleId = sourceObjectId(article);
    const title = asString(article.title) || 'Untitled article';
    const highlightText = Array.isArray(article.highlights)
      ? article.highlights.map(h => [h.text, h.note].filter(Boolean).join(' - ')).filter(Boolean).join('\n')
      : '';
    sources.push({
      type: 'article',
      objectId: articleId,
      title,
      url: asString(article.url),
      text: truncate([article.content, highlightText].filter(Boolean).join('\n'), MAX_SOURCE_TEXT),
      tags: Array.isArray(article.highlights) ? article.highlights.flatMap(h => h.tags || []) : [],
      createdAt: article.createdAt,
      updatedAt: article.updatedAt
    });
    (article.highlights || []).slice(0, 12).forEach((highlight) => {
      const text = [highlight.text, highlight.note].filter(Boolean).join(' - ');
      if (!asString(text)) return;
      sources.push({
        type: 'highlight',
        objectId: sourceObjectId(highlight),
        parentObjectId: articleId,
        title: `${title} highlight`,
        url: asString(article.url),
        text: truncate(text, 900),
        tags: Array.isArray(highlight.tags) ? highlight.tags : [],
        createdAt: highlight.createdAt || article.createdAt,
        updatedAt: article.updatedAt
      });
    });
  });

  notebooks.forEach((entry) => {
    const blockText = Array.isArray(entry.blocks)
      ? entry.blocks.map(block => block.text).filter(Boolean).join('\n')
      : '';
    sources.push({
      type: 'notebook',
      objectId: sourceObjectId(entry),
      title: asString(entry.title) || 'Untitled notebook entry',
      text: truncate([entry.content, blockText].filter(Boolean).join('\n'), MAX_SOURCE_TEXT),
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    });
  });

  concepts.forEach((concept) => {
    const name = asString(concept.name || concept.title || concept.slug);
    if (!name) return;
    const workspaceText = concept.workspace ? JSON.stringify(concept.workspace).slice(0, 1200) : '';
    sources.push({
      type: 'concept',
      objectId: sourceObjectId(concept),
      title: name,
      text: truncate([concept.description, workspaceText].filter(Boolean).join('\n'), MAX_SOURCE_TEXT),
      tags: [name],
      createdAt: concept.createdAt,
      updatedAt: concept.updatedAt
    });
  });

  questions.forEach((question) => {
    const blockText = Array.isArray(question.blocks)
      ? question.blocks.map(block => block.text).filter(Boolean).join('\n')
      : '';
    sources.push({
      type: 'question',
      objectId: sourceObjectId(question),
      title: asString(question.text).slice(0, 180) || 'Untitled question',
      text: truncate([question.text, blockText].filter(Boolean).join('\n'), MAX_SOURCE_TEXT),
      tags: [question.linkedTagName, question.conceptName].filter(Boolean),
      createdAt: question.createdAt,
      updatedAt: question.updatedAt
    });
  });

  return sources.filter(source => asString(source.title) || asString(source.text));
};

const selectCandidateSources = ({ page, sources, limit = DEFAULT_SOURCE_LIMIT }) => {
  const queryText = [
    page.title,
    page.plainText,
    page.createdFrom?.text,
    page.createdFrom?.label,
    (page.sourceRefs || []).map(source => `${source.title} ${source.snippet}`).join(' ')
  ].filter(Boolean).join(' ');
  const queryTokens = tokenize(queryText);
  return sources
    .map((source, index) => ({ ...source, libraryIndex: index + 1, score: scoreSource(source, queryTokens) }))
    .sort((a, b) => b.score - a.score || new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, limit)
    .map((source, index) => ({ ...source, index: index + 1 }));
};

const buildPrompt = ({ page, candidates }) => {
  const sourceBlock = candidates.map(source => (
    `[${source.index}] ${source.type.toUpperCase()}: ${source.title}\n` +
    `Updated: ${source.updatedAt || source.createdAt || 'unknown'}\n` +
    `Text: ${truncate(source.text, 1300)}`
  )).join('\n\n');

  return `Maintain this Wiki page by directly rewriting it from the user's library. Use section-level structure and claim-level support. Do not return generic advice. If evidence is weak, keep the claim but mark it in health instead of pretending it is supported.

Page:
Title: ${page.title}
Type: ${page.pageType || 'topic'}
Existing text: ${truncate(page.plainText || toPlainText(page.body), 2400)}
Creation seed: ${truncate(page.createdFrom?.text || page.createdFrom?.label || '', 1200)}

Candidate library sources:
${sourceBlock || 'No library sources were found.'}

Return strict JSON only:
{
  "title": "page title",
  "maintenanceSummary": "specific summary of what changed",
  "sections": [
    {
      "heading": "section name",
      "body": "one or two grounded paragraphs",
      "claims": [
        { "text": "claim text", "support": "supported|unsupported|conflict|new_evidence", "sourceIndexes": [1] }
      ]
    }
  ],
  "health": {
    "newItems": [{ "text": "new item affecting this page", "sourceTitle": "source" }],
    "unsupportedClaims": [{ "text": "claim needing support", "section": "section" }],
    "missingCitations": [{ "text": "citation gap", "section": "section" }],
    "staleSections": [{ "text": "stale section", "section": "section" }],
    "contradictions": [{ "text": "contradiction", "sourceTitle": "source" }],
    "relatedPages": [{ "text": "related topic or page" }]
  },
  "operations": [
    { "type": "rewrite_section|support_claim|attach_source|flag_new_item|link_page", "target": "section or claim", "summary": "specific action applied", "sourceIndexes": [1] }
  ]
}`;
};

const extractJson = (value = '') => {
  const text = asString(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch (__error) {
        // Continue to loose object extraction below.
      }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (__error) {
        return null;
      }
    }
  }
  return null;
};

const sourceRefFromCandidate = (candidate) => ({
  type: candidate.type,
  objectId: candidate.objectId || null,
  title: truncate(candidate.title, 240),
  snippet: truncate(candidate.text, 1000),
  url: truncate(candidate.url, 1000),
  citationLabel: `[${candidate.index}]`,
  addedBy: 'ai'
});

const dedupeSourceRefs = (existing = [], next = []) => {
  const seen = new Set();
  return [...existing, ...next].filter((source) => {
    const key = `${source.type}:${source.objectId || ''}:${source.title || ''}:${source.url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(source.type && (source.objectId || source.title || source.snippet || source.url));
  }).slice(0, 80);
};

const normalizeOperations = (operations = []) => {
  if (!Array.isArray(operations)) return [];
  return operations
    .map((operation, index) => ({
      id: `maintenance-${Date.now()}-${index}`,
      type: ['support_claim', 'flag_new_item'].includes(operation?.type) ? 'claim' : 'edit',
      title: truncate(operation?.target || operation?.type || 'Maintenance update', 120),
      text: truncate(operation?.summary || '', 800),
      sourceRefIds: []
    }))
    .filter(operation => operation.title || operation.text)
    .slice(0, 12);
};

const docFromSections = ({ title, sections = [], sourceRefs = [] }) => {
  const content = [heading(title, 1)];
  sections.forEach((section) => {
    const sectionTitle = asString(section.heading || section.title);
    const body = asString(section.body || section.summary);
    const claims = Array.isArray(section.claims) ? section.claims : [];
    if (sectionTitle) content.push(heading(sectionTitle, 2));
    if (body) content.push(paragraph(body));
    const claimLines = claims
      .map((claim) => {
        const support = asString(claim.support);
        const citation = Array.isArray(claim.sourceIndexes) && claim.sourceIndexes.length
          ? ` [${claim.sourceIndexes.join(', ')}]`
          : '';
        return `${asString(claim.text)}${support ? ` (${support})` : ''}${citation}`;
      })
      .filter(Boolean);
    if (claimLines.length) content.push(bulletList(claimLines));
  });
  if (sourceRefs.length) {
    content.push(heading('Sources', 2));
    content.push(bulletList(sourceRefs.map(source => `${source.citationLabel || ''} ${source.title || source.url || 'Source'}`.trim())));
  }
  return { type: 'doc', content };
};

const fallbackMaintenance = ({ page, candidates }) => {
  const top = candidates.slice(0, 6);
  const newItems = top
    .filter(source => source.updatedAt || source.createdAt)
    .slice(0, 4)
    .map(source => ({ text: `${source.title} may affect this page.`, sourceTitle: source.title }));
  const sections = [
    {
      heading: 'Working Thesis',
      body: top.length
        ? `${page.title} is currently best understood through ${top.map(source => source.title).slice(0, 3).join(', ')}. This page has been rebuilt from the most relevant library items available.`
        : `${page.title} needs source material before it can become a reliable Wiki page.`,
      claims: top.slice(0, 3).map(source => ({
        text: `${source.title} contributes evidence for this page.`,
        support: 'supported',
        sourceIndexes: [source.index]
      }))
    },
    {
      heading: 'Claims To Nail',
      body: 'These claims should stay explicit so the page can be maintained at claim level as new sources arrive.',
      claims: top.slice(0, 5).map(source => ({
        text: truncate(source.text || source.title, 180),
        support: source.text ? 'supported' : 'unsupported',
        sourceIndexes: [source.index]
      }))
    },
    {
      heading: 'New Material To Review',
      body: newItems.length
        ? 'Recent or relevant library items are listed below so this page can keep moving as the library changes.'
        : 'No newly relevant library items were found during this maintenance run.',
      claims: newItems.map((item, index) => ({
        text: item.text,
        support: 'new_evidence',
        sourceIndexes: [top[index]?.index].filter(Boolean)
      }))
    }
  ];
  return {
    title: page.title,
    maintenanceSummary: top.length
      ? `Rebuilt from ${top.length} relevant library source${top.length === 1 ? '' : 's'}.`
      : 'Rebuilt with no matching library sources available yet.',
    sections,
    health: normalizeHealth({
      newItems,
      unsupportedClaims: top.length ? [] : [{ text: 'No library evidence found for this page.' }],
      missingCitations: [],
      staleSections: [],
      contradictions: [],
      relatedPages: []
    }),
    operations: top.map(source => ({
      type: 'attach_source',
      target: source.title,
      summary: `Attached ${source.title} as page evidence.`,
      sourceIndexes: [source.index]
    }))
  };
};

const normalizeModelResult = ({ raw, page, candidates }) => {
  const fallback = fallbackMaintenance({ page, candidates });
  if (!raw || typeof raw !== 'object') return fallback;
  const sections = Array.isArray(raw.sections) && raw.sections.length
    ? raw.sections.map((section) => ({
        heading: truncate(section.heading || section.title || 'Section', 160),
        body: truncate(section.body || section.summary || '', 1600),
        claims: Array.isArray(section.claims)
          ? section.claims.map(claim => ({
              text: truncate(claim.text || claim.claim || '', 600),
              support: ['supported', 'unsupported', 'conflict', 'new_evidence'].includes(claim.support)
                ? claim.support
                : 'unsupported',
              sourceIndexes: Array.isArray(claim.sourceIndexes)
                ? claim.sourceIndexes.map(Number).filter(Number.isFinite).slice(0, 6)
                : []
            })).filter(claim => claim.text)
          : []
      })).filter(section => section.heading || section.body || section.claims.length)
    : fallback.sections;

  return {
    title: truncate(raw.title || page.title, 180),
    maintenanceSummary: truncate(raw.maintenanceSummary || fallback.maintenanceSummary, 900),
    sections,
    health: normalizeHealth(raw.health || fallback.health),
    operations: Array.isArray(raw.operations) ? raw.operations : fallback.operations
  };
};

const maintainWikiPage = async ({
  page,
  userId,
  models = {},
  chat = chatComplete,
  isConfigured = isTextGenerationConfigured,
  now = new Date()
}) => {
  const allSources = await collectLibrarySources({ userId, models });
  const candidates = selectCandidateSources({ page, sources: allSources });
  let modelInfo = { model: 'local-maintainer', provider: '' };
  let result = null;

  if (candidates.length && isConfigured()) {
    try {
      const completion = await chat({
        route: 'artifact_draft',
        maxTokens: 2600,
        temperature: 0.2,
        reasoningEffort: 'medium',
        responseFormat: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a Wiki maintenance engine. Rewrite pages directly from supplied sources. Return JSON only.'
          },
          {
            role: 'user',
            content: buildPrompt({ page, candidates })
          }
        ]
      });
      modelInfo = {
        model: completion.model || modelInfo.model,
        provider: completion.provider || ''
      };
      result = extractJson(completion.text);
    } catch (error) {
      modelInfo = { model: 'local-maintainer', provider: '' };
      result = null;
    }
  }

  const normalized = normalizeModelResult({ raw: result, page, candidates });
  const usedIndexes = new Set();
  normalized.sections.forEach((section) => {
    (section.claims || []).forEach((claim) => {
      (claim.sourceIndexes || []).forEach(index => usedIndexes.add(Number(index)));
    });
  });
  (normalized.operations || []).forEach((operation) => {
    (operation.sourceIndexes || []).forEach(index => usedIndexes.add(Number(index)));
  });
  if (usedIndexes.size === 0) candidates.slice(0, 6).forEach(source => usedIndexes.add(source.index));

  const sourceRefs = Array.from(usedIndexes)
    .map(index => candidates.find(source => source.index === index))
    .filter(Boolean)
    .map(sourceRefFromCandidate);
  const mergedSourceRefs = dedupeSourceRefs(page.sourceRefs || [], sourceRefs);
  const body = docFromSections({
    title: normalized.title || page.title,
    sections: normalized.sections,
    sourceRefs
  });

  page.title = normalized.title || page.title;
  page.sourceScope = 'entire_library';
  page.body = body;
  page.plainText = toPlainText(body);
  page.sourceRefs = mergedSourceRefs;
  page.aiState = {
    ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
    draftStatus: 'ready',
    draftRequestedAt: page.aiState?.draftRequestedAt || now,
    draftStartedAt: page.aiState?.draftStartedAt || now,
    draftCompletedAt: now,
    lastDraftedAt: now,
    lastError: '',
    errorCode: '',
    model: modelInfo.provider ? `${modelInfo.model}:${modelInfo.provider}` : modelInfo.model,
    provider: modelInfo.provider || '',
    sourceScopeAtDraft: 'entire_library',
    sourceRefIdsAtDraft: [],
    maintenanceSummary: normalized.maintenanceSummary,
    health: normalized.health,
    suggestions: normalizeOperations(normalized.operations)
  };

  return page;
};

module.exports = {
  maintainWikiPage,
  collectLibrarySources,
  selectCandidateSources,
  fallbackMaintenance,
  __testables: {
    extractJson,
    docFromSections,
    normalizeHealth,
    toPlainText
  }
};
