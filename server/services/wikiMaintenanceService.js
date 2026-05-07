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

const decodeHtmlEntities = (value = '') => (
  asString(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
);

const stripHtml = (value = '') => (
  decodeHtmlEntities(value)
    .replace(/<\/(p|div|li|h[1-6]|br|section|article)>/gi, '\n')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
);

const cleanWikiText = (value = '') => {
  const lines = stripHtml(value)
    .replace(/\((?:attr\(href\)|href|url)\)/gi, ' ')
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .split(/\n|(?=\b(?:Name|URL|Title|Author|Source):\s)/i)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^(name|url|source|title|author):\s*/i.test(line))
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines.join(' ').replace(/\s+/g, ' ').trim();
};

const truncate = (value = '', limit = 1000) => {
  const text = cleanWikiText(value).replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
};

const truncateRaw = (value = '', limit = 1000) => {
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

const textNode = (text = '', { marks } = {}) => {
  const node = { type: 'text', text: asString(text) || ' ' };
  if (Array.isArray(marks) && marks.length) node.marks = marks;
  return node;
};

const inferClaimSupport = (citationIndexes = []) => {
  if (!Array.isArray(citationIndexes) || citationIndexes.length === 0) return 'unsupported';
  if (citationIndexes.length === 1) return 'partial';
  return 'supported';
};

let claimSeed = 0;
const buildClaimMark = (citationIndexes = [], support = null) => {
  claimSeed += 1;
  const indexes = Array.isArray(citationIndexes)
    ? citationIndexes.map(Number).filter(Number.isFinite).filter(index => index > 0).slice(0, 8)
    : [];
  return {
    type: 'claim',
    attrs: {
      claimId: `claim-${Date.now()}-${claimSeed}`,
      support: support || inferClaimSupport(indexes),
      citationIndexes: indexes
    }
  };
};

// Wrap the text in a claim mark so the editor can render the colored
// underline + citation popover. Falls back to a plain paragraph if the
// text is empty.
const claimParagraph = (text = '', citationIndexes = [], support = null) => ({
  type: 'paragraph',
  content: [textNode(text, { marks: [buildClaimMark(citationIndexes, support)] })]
});

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
  content: items.map((item) => {
    if (item && typeof item === 'object' && (item.text || item.citationIndexes)) {
      return {
        type: 'listItem',
        content: [claimParagraph(item.text, item.citationIndexes, item.support)]
      };
    }
    return {
      type: 'listItem',
      content: [paragraph(item)]
    };
  })
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

const isLikelyGeneratedPage = (page) => Boolean(
  page?.aiState?.lastDraftedAt
  || page?.aiState?.maintenanceSummary
  || page?.aiState?.model
  || page?.aiState?.draftStatus === 'ready'
);

const extractManualNotes = (page) => {
  const text = truncate(page?.plainText || toPlainText(page?.body), 1800);
  if (!text || text.length < 80 || isLikelyGeneratedPage(page)) return '';
  const title = asString(page?.title).toLowerCase();
  const withoutTitle = text.toLowerCase() === title ? '' : text;
  return withoutTitle;
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
    const title = truncate(article.title, 220) || 'Untitled article';
    const highlightText = Array.isArray(article.highlights)
      ? article.highlights.map(h => [h.text, h.note].filter(Boolean).join(' - ')).filter(Boolean).join('\n')
      : '';
    sources.push({
      type: 'article',
      objectId: articleId,
      title,
      url: truncateRaw(article.url, 1000),
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
        title: truncate(`${title} highlight`, 220),
        url: truncateRaw(article.url, 1000),
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
      title: truncate(entry.title, 220) || 'Untitled notebook entry',
      text: truncate([entry.content, blockText].filter(Boolean).join('\n'), MAX_SOURCE_TEXT),
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    });
  });

  concepts.forEach((concept) => {
    const name = truncate(concept.name || concept.title || concept.slug, 220);
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
      title: truncate(question.text, 180) || 'Untitled question',
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

const buildPrompt = ({ page, candidates, manualNotes = '' }) => {
  const sourceBlock = candidates.map(source => (
    `[${source.index}] ${source.type.toUpperCase()}: ${source.title}\n` +
    `Updated: ${source.updatedAt || source.createdAt || 'unknown'}\n` +
    `Text: ${truncate(source.text, 1300)}`
  )).join('\n\n');

  return `Maintain this Wiki page by directly rewriting it into a clean, durable Wiki article.

Hard rules:
- The article body must read like a Wiki page, not a maintenance report and not a source dump.
- Do not include HTML tags, JSON, raw URLs, scraped metadata labels, source indexes as prose, support labels, or sentences like "X contributes evidence for this page."
- Use source titles only as evidence behind the writing. The page should say the idea, not list the source title as the idea.
- Keep lightweight citation indexes only at the end of factual paragraphs or bullets, e.g. [1] or [1, 3].
- Put evidence gaps, new items, contradictions, stale sections, and changelog entries only in maintenance.
- Preserve likely user-authored notes when they are not duplicate, contradicted, navigation text, or metadata.

Page:
Title: ${page.title}
Type: ${page.pageType || 'topic'}
Existing text: ${truncate(page.plainText || toPlainText(page.body), 2400)}
Creation seed: ${truncate(page.createdFrom?.text || page.createdFrom?.label || '', 1200)}
Manual notes to preserve when useful: ${manualNotes || 'None detected.'}

Candidate library sources:
${sourceBlock || 'No library sources were found.'}

Return strict JSON only:
{
  "title": "page title",
  "article": {
    "summary": { "text": "one clean introductory paragraph", "citationIndexes": [1] },
    "sections": [
      {
        "heading": "What It Means",
        "paragraphs": [
          { "text": "clean wiki paragraph", "citationIndexes": [1, 2] }
        ],
        "bullets": [
          { "text": "optional clean article bullet", "citationIndexes": [3] }
        ]
      }
    ],
    "preservedUserContent": [
      { "text": "preserved user note", "placement": "section name", "reason": "why preserved" }
    ]
  },
  "maintenance": {
    "summary": "specific summary of what changed",
    "changelog": [
      { "type": "preserved|rewrote|removed_metadata|attached_source|flagged_gap|merged_new_evidence", "target": "section, claim, or source", "summary": "specific action applied", "sourceIndexes": [1] }
    ],
    "health": {
      "newItems": [{ "text": "new item affecting this page", "sourceTitle": "source" }],
      "unsupportedClaims": [{ "text": "claim needing support", "section": "section" }],
      "missingCitations": [{ "text": "citation gap", "section": "section" }],
      "staleSections": [{ "text": "stale section", "section": "section" }],
      "contradictions": [{ "text": "contradiction", "sourceTitle": "source" }],
      "relatedPages": [{ "text": "related topic or page" }]
    }
  },
  "sourceIndexesUsed": [1, 2]
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
  url: truncateRaw(candidate.url, 1000),
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
      type: ['support_claim', 'flag_new_item', 'flagged_gap', 'merged_new_evidence'].includes(operation?.type) ? 'claim' : 'edit',
      title: truncate(operation?.target || operation?.type || 'Maintenance update', 120),
      text: truncate(operation?.summary || '', 800),
      sourceRefIds: []
    }))
    .filter(operation => operation.title || operation.text)
    .slice(0, 12);
};

const normalizeCitationIndexes = (value = []) => (
  Array.isArray(value)
    ? value.map(Number).filter(Number.isFinite).filter(index => index > 0).slice(0, 8)
    : []
);

const citationSuffix = (indexes = []) => {
  const clean = normalizeCitationIndexes(indexes);
  return clean.length ? ` [${clean.join(', ')}]` : '';
};

const normalizeArticleTextBlock = (value = {}) => {
  if (typeof value === 'string') {
    return { text: truncate(value, 1000), citationIndexes: [] };
  }
  if (!value || typeof value !== 'object') return null;
  const text = truncate(value.text || value.body || value.summary || '', 1000);
  if (!text) return null;
  return {
    text,
    citationIndexes: normalizeCitationIndexes(value.citationIndexes || value.sourceIndexes || value.sources)
  };
};

const normalizeArticle = ({ rawArticle = {}, page, manualNotes = '', candidates = [] }) => {
  const fallback = fallbackMaintenance({ page, candidates, manualNotes });
  const source = rawArticle && typeof rawArticle === 'object' ? rawArticle : {};
  const summary = normalizeArticleTextBlock(source.summary) || fallback.article.summary;
  const sections = Array.isArray(source.sections) && source.sections.length
    ? source.sections.map((section) => {
        const headingText = truncate(section?.heading || section?.title || '', 140);
        const paragraphs = Array.isArray(section?.paragraphs)
          ? section.paragraphs.map(normalizeArticleTextBlock).filter(Boolean).slice(0, 5)
          : [normalizeArticleTextBlock(section?.body || section?.summary)].filter(Boolean);
        const bullets = Array.isArray(section?.bullets)
          ? section.bullets.map(normalizeArticleTextBlock).filter(Boolean).slice(0, 8)
          : [];
        return {
          heading: headingText || 'Key Ideas',
          paragraphs,
          bullets
        };
      }).filter(section => section.heading && (section.paragraphs.length || section.bullets.length)).slice(0, 8)
    : fallback.article.sections;
  const preservedUserContent = Array.isArray(source.preservedUserContent)
    ? source.preservedUserContent.map((entry) => ({
        text: truncate(entry?.text || '', 800),
        placement: truncate(entry?.placement || '', 120),
        reason: truncate(entry?.reason || '', 240)
      })).filter(entry => entry.text).slice(0, 8)
    : fallback.article.preservedUserContent;

  return {
    summary,
    sections,
    preservedUserContent
  };
};

const docFromArticle = ({ title, article = {} }) => {
  const content = [heading(title, 1)];
  const summary = normalizeArticleTextBlock(article.summary);
  if (summary?.text) content.push(claimParagraph(summary.text, summary.citationIndexes));
  (article.sections || []).forEach((section) => {
    const sectionTitle = truncate(section.heading || section.title, 140);
    if (sectionTitle) content.push(heading(sectionTitle, 2));
    (section.paragraphs || []).forEach((item) => {
      const block = normalizeArticleTextBlock(item);
      if (block?.text) content.push(claimParagraph(block.text, block.citationIndexes));
    });
    const bulletItems = (section.bullets || [])
      .map(normalizeArticleTextBlock)
      .filter(Boolean)
      .map(block => ({ text: block.text, citationIndexes: block.citationIndexes }));
    if (bulletItems.length) content.push(bulletList(bulletItems));
  });
  const preserved = Array.isArray(article.preservedUserContent) ? article.preservedUserContent : [];
  if (preserved.length) {
    content.push(heading('Notes', 2));
    preserved.forEach((entry) => {
      const text = truncate(entry.text || '', 800);
      if (text) content.push(paragraph(text));
    });
  }
  return { type: 'doc', content };
};

const collectClaimsFromDoc = (node, section = '') => {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(child => collectClaimsFromDoc(child, section));
  if (typeof node !== 'object') return [];
  const nextSection = node.type === 'heading' ? toPlainText(node) || section : section;
  const ownText = typeof node.text === 'string' ? node.text.trim() : '';
  const claimMark = Array.isArray(node.marks)
    ? node.marks.find(mark => mark?.type === 'claim')
    : null;
  const own = claimMark && ownText ? [{
    claimId: claimMark.attrs?.claimId || `claim-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: ownText,
    section,
    support: claimMark.attrs?.support || inferClaimSupport(claimMark.attrs?.citationIndexes || []),
    citationIds: [],
    lastReviewedAt: new Date()
  }] : [];
  return [...own, ...collectClaimsFromDoc(node.content, nextSection)];
};

const fallbackMaintenance = ({ page, candidates, manualNotes = '' }) => {
  const top = candidates.slice(0, 6);
  const newItems = top
    .filter(source => source.updatedAt || source.createdAt)
    .slice(0, 4)
    .map(source => ({ text: `${source.title} may change this page.`, sourceTitle: source.title }));
  const leadSources = top.slice(0, 3);
  const topic = truncate(page.title, 120) || 'This topic';
  const article = {
    summary: {
      text: leadSources.length
        ? `${topic} is a living synthesis built from the strongest related material in the library. The current evidence points to a set of working ideas rather than a finished answer.`
        : `${topic} is a draft Wiki page waiting for source-backed evidence.`,
      citationIndexes: leadSources.map(source => source.index)
    },
    sections: [
      {
        heading: 'Core Idea',
        paragraphs: [
          {
            text: leadSources.length
              ? `The page should explain the concept in terms of the ideas that recur across the relevant sources, then separate durable claims from open questions.`
              : `Add sources or notes so this page can move from a placeholder into a source-backed Wiki article.`,
            citationIndexes: leadSources.map(source => source.index)
          }
        ],
        bullets: []
      },
      {
        heading: 'Key Signals',
        paragraphs: top.length
          ? [{ text: 'The strongest current signals from the library are:', citationIndexes: [] }]
          : [],
        bullets: top.slice(0, 5).map(source => ({
          text: truncate(source.text || source.title, 220),
          citationIndexes: [source.index]
        }))
      },
      {
        heading: 'Open Questions',
        paragraphs: [
          {
            text: newItems.length
              ? 'New or recently touched material should be reviewed before this page is treated as settled.'
              : 'No newly relevant material was found during this maintenance run.',
            citationIndexes: newItems.map((_item, index) => top[index]?.index).filter(Boolean)
          }
        ],
        bullets: []
      }
    ],
    preservedUserContent: manualNotes
      ? [{ text: manualNotes, placement: 'Notes', reason: 'Existing page text looked user-authored.' }]
      : []
  };
  const changelog = [
    {
      type: 'rewrote',
      target: 'Article body',
      summary: top.length
        ? `Rebuilt the page into article sections from ${top.length} relevant library source${top.length === 1 ? '' : 's'}.`
        : 'Created a source-ready article structure.',
      sourceIndexes: top.map(source => source.index)
    },
    ...(manualNotes ? [{
      type: 'preserved',
      target: 'Notes',
      summary: 'Preserved likely user-authored notes in the article.',
      sourceIndexes: []
    }] : []),
    ...top.slice(0, 6).map(source => ({
      type: 'attached_source',
      target: source.title,
      summary: `Attached ${source.title} as supporting context.`,
      sourceIndexes: [source.index]
    }))
  ];
  return {
    title: topic,
    article,
    maintenance: {
      summary: top.length
        ? `Rebuilt as a Wiki article from ${top.length} relevant library source${top.length === 1 ? '' : 's'}.`
        : 'Created a Wiki article shell with no matching library sources available yet.',
      changelog,
      health: normalizeHealth({
        newItems,
        unsupportedClaims: top.length ? [] : [{ text: 'No library evidence found for this page.' }],
        missingCitations: [],
        staleSections: [],
        contradictions: [],
        relatedPages: []
      })
    },
    sourceIndexesUsed: top.map(source => source.index)
  };
};

const normalizeSourceIndexesUsed = ({ rawIndexes = [], article = {}, changelog = [], candidates = [] }) => {
  const used = new Set();
  normalizeCitationIndexes(rawIndexes).forEach(index => used.add(index));
  const addBlock = (block = {}) => normalizeCitationIndexes(block.citationIndexes || block.sourceIndexes)
    .forEach(index => used.add(index));
  addBlock(article.summary);
  (article.sections || []).forEach((section) => {
    (section.paragraphs || []).forEach(addBlock);
    (section.bullets || []).forEach(addBlock);
  });
  (changelog || []).forEach((entry) => normalizeCitationIndexes(entry.sourceIndexes).forEach(index => used.add(index)));
  if (used.size === 0) candidates.slice(0, 6).forEach(source => used.add(source.index));
  return Array.from(used).filter(index => candidates.some(source => source.index === index)).slice(0, 16);
};

const normalizeModelResult = ({ raw, page, candidates, manualNotes = '' }) => {
  const fallback = fallbackMaintenance({ page, candidates, manualNotes });
  if (!raw || typeof raw !== 'object') return fallback;
  const rawMaintenance = raw.maintenance && typeof raw.maintenance === 'object'
    ? raw.maintenance
    : {
        summary: raw.maintenanceSummary,
        changelog: raw.operations,
        health: raw.health
      };
  const article = normalizeArticle({
    rawArticle: raw.article || {
      summary: raw.summary,
      sections: raw.sections,
      preservedUserContent: raw.preservedUserContent
    },
    page,
    manualNotes,
    candidates
  });
  const changelog = Array.isArray(rawMaintenance.changelog)
    ? rawMaintenance.changelog
    : Array.isArray(rawMaintenance.operations)
      ? rawMaintenance.operations
      : fallback.maintenance.changelog;
  const maintenance = {
    summary: truncate(rawMaintenance.summary || fallback.maintenance.summary, 900),
    changelog,
    health: normalizeHealth(rawMaintenance.health || fallback.maintenance.health)
  };
  return {
    title: truncate(raw.title || page.title, 180),
    article,
    maintenance,
    sourceIndexesUsed: normalizeSourceIndexesUsed({
      rawIndexes: raw.sourceIndexesUsed || raw.sourceIndexes || [],
      article,
      changelog,
      candidates
    })
  };
};

const maintainWikiPage = async ({
  page,
  userId,
  models = {},
  chat = chatComplete,
  isConfigured = isTextGenerationConfigured,
  now = new Date(),
  trigger = 'manual'
}) => {
  const allSources = await collectLibrarySources({ userId, models });
  const candidates = selectCandidateSources({ page, sources: allSources });
  const manualNotes = extractManualNotes(page);
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
            content: buildPrompt({ page, candidates, manualNotes })
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

  const normalized = normalizeModelResult({ raw: result, page, candidates, manualNotes });
  const sourceRefs = normalized.sourceIndexesUsed
    .map(index => candidates.find(source => source.index === index))
    .filter(Boolean)
    .map(sourceRefFromCandidate);
  const mergedSourceRefs = dedupeSourceRefs(page.sourceRefs || [], sourceRefs);
  const body = docFromArticle({
    title: normalized.title || page.title,
    article: normalized.article
  });

  page.title = normalized.title || page.title;
  page.sourceScope = 'entire_library';
  page.body = body;
  page.plainText = toPlainText(body);
  page.sourceRefs = mergedSourceRefs;
  page.citations = mergedSourceRefs.map(source => ({
    sourceRefId: source._id || null,
    sourceType: source.type || '',
    sourceObjectId: source.objectId || null,
    sourceTitle: source.title || '',
    quote: source.snippet || '',
    url: source.url || '',
    confidence: source.addedBy === 'ai' ? 0.72 : 0.9,
    createdAt: now
  }));
  page.claims = collectClaimsFromDoc(body).slice(0, 80).map(claim => ({
    ...claim,
    citationIds: []
  }));
  page.freshness = {
    ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
    status: Array.isArray(normalized.maintenance.health?.contradictions) && normalized.maintenance.health.contradictions.length
      ? 'conflicted'
      : 'fresh',
    reason: trigger === 'source_event'
      ? 'Updated from new source material.'
      : 'Page maintained against current library sources.',
    lastReviewedAt: now,
    lastDirectUpdateAt: now
  };
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
    maintenanceSummary: normalized.maintenance.summary,
    health: normalized.maintenance.health,
    changeLog: normalizeOperations(normalized.maintenance.changelog),
    suggestions: normalizeOperations(normalized.maintenance.changelog)
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
    docFromArticle,
    normalizeHealth,
    cleanWikiText,
    toPlainText
  }
};
