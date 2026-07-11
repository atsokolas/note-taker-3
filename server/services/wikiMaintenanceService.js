const { chatComplete, chatCompleteStream, isTextGenerationConfigured } = require('../ai/hfTextClient');
const {
  alignArticleToPageStructure,
  getWikiPageStructure
} = require('./wikiPageStructureService');
const { findAutolinkSuggestions } = require('./wikiAutolinkService');
const { applyWikiAutolinkToDoc } = require('./wikiAutolinkApplyService');
const { formatWikiSchemaPromptBlock } = require('./wikiSchemaService');

const DEFAULT_SOURCE_LIMIT = 24;
const FAST_SOURCE_LIMIT = 8;
const MAX_SOURCE_TEXT = 1800;
const DEFAULT_PROMPT_SOURCE_TEXT_LIMIT = 1300;
const FAST_PROMPT_SOURCE_TEXT_LIMIT = 800;
const MIN_SOURCE_RELEVANCE_SCORE = 2;
const MIN_SPARSE_PAGE_CANDIDATES = 3;
const QUALITY_MIN_WORDS = 450;
const QUALITY_MIN_WORDS_WITH_MANY_SOURCES = 650;
const SCAFFOLD_PATTERNS = [
  { label: 'instructional scaffold', pattern: /\bshould explain\b/i },
  { label: 'source-backed development placeholder', pattern: /\bstill needs source-backed development\b/i },
  { label: 'signal-list scaffold', pattern: /\bstrongest current signals\b/i },
  { label: 'source summary dump', pattern: /(^|\n|\s)Summary:/i },
  { label: 'maintenance phrasing', pattern: /\bmay change this page\b/i },
  { label: 'unfinished article placeholder', pattern: /\bwaiting for source-backed evidence\b/i },
  { label: 'source dump framing', pattern: /\bcontributes evidence for this page\b/i }
];
const GITHUB_REPO_UNSUPPORTED_PATTERNS = [
  { label: 'npm distribution claim', pattern: /\b(?:published|packaged|distributed)\s+(?:as|to|on)\s+(?:an?\s+)?npm\b|\bnpm package metadata confirms\b/i },
  { label: 'CI/test-suite claim', pattern: /\b(?:fully tested|comprehensive test suite|continuous[-\s]?integration|continuously integrated)\b/i },
  { label: 'provenance boilerplate', pattern: /\bprovenance[-‑–—\s]?aware|source[-‑–—\s]?provenance practices|Debug Fixture\b/i },
  { label: 'library-highlight framing', pattern: /\bLibrary highlights?\b/i },
  { label: 'issue tracker claim', pattern: /\b(?:issue tracker|issues? track|tasks? are tracked)\b/i },
  { label: 'testing framework claim', pattern: /\b(?:includes|has|uses)\s+(?:a\s+)?testing framework\b/i }
];
const GITHUB_REPO_SCAFFOLD_PATTERNS = [
  /details will appear after the first GitHub sync/i,
  /repository sources are being attached/i,
  /Noeis will maintain this as a developer dossier/i,
  /Noeis will build this project wiki/i
];
const GITHUB_REPO_TEMPLATE_LEAK_PATTERNS = [
  /\bproduct-aware developer operating manual\b/i,
  /\broute\/service\/model\/component\b/i,
  /\bworking map for a new contributor\b/i,
  /\bDeveloper posture:\s*preserve\b/i,
  /\b(?:wiki maintenance service|GitHub repo watcher service|frontend wiki API client|model definitions) (?:was|were) not attached\b/i
];
const GITHUB_REPO_MIN_WORDS = 900;
const GITHUB_REPO_MIN_SOURCE_REFS = 10;
const GITHUB_REPO_MAX_CLAIMS_PER_SOURCE = 4;
const NOEIS_REPO_PRODUCT_PATTERNS = [
  /\bLibrary\b/,
  /\bThink\b/,
  /\bWiki\b/,
  /\b(?:safe public sharing|public share|share privacy|private graph)\b/i
];
const NOEIS_REPO_FLOW_PATTERNS = [
  /\bcreateRepoWikiFromGitHub\b/,
  /\/api\/wiki\/pages\/from-github\b/,
  /\bgithubRepoWatcherService\b/,
  /\bexternalWatches\.githubRepo\b/,
  /\bwikiMaintenanceService\b/,
  /\bWikiRepoCreateComposer\b/,
  /\bWikiPageReadView\b/,
  /\bsourceRefs?\b/,
  /\bVersionError\b/,
  /\bSystemStatusContext\b/
];
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

const inferClaimSupport = (citationIndexes = [], contradictionIndexes = []) => {
  if (Array.isArray(contradictionIndexes) && contradictionIndexes.length) return 'conflicted';
  if (!Array.isArray(citationIndexes) || citationIndexes.length === 0) return 'unsupported';
  if (citationIndexes.length === 1) return 'partial';
  return 'supported';
};

let claimSeed = 0;
const buildClaimMark = (citationIndexes = [], support = null, contradictionIndexes = []) => {
  claimSeed += 1;
  const indexes = Array.isArray(citationIndexes)
    ? citationIndexes.map(Number).filter(Number.isFinite).filter(index => index > 0).slice(0, 8)
    : [];
  const contradictions = Array.isArray(contradictionIndexes)
    ? contradictionIndexes.map(Number).filter(Number.isFinite).filter(index => index > 0).slice(0, 8)
    : [];
  return {
    type: 'claim',
    attrs: {
      claimId: `claim-${Date.now()}-${claimSeed}`,
      support: support || inferClaimSupport(indexes, contradictions),
      citationIndexes: indexes,
      contradictionIndexes: contradictions
    }
  };
};

// Wrap the text in a claim mark so the editor can render the colored
// underline + citation popover. Falls back to a plain paragraph if the
// text is empty.
const claimParagraph = (text = '', citationIndexes = [], support = null, contradictionIndexes = []) => ({
  type: 'paragraph',
  content: [textNode(text, { marks: [buildClaimMark(citationIndexes, support, contradictionIndexes)] })]
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
        content: [claimParagraph(item.text, item.citationIndexes, item.support, item.contradictionIndexes)]
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
  let relevanceScore = 0;
  unique.forEach((token) => {
    if (haystack.includes(token)) relevanceScore += token.length > 5 ? 3 : 1;
    else {
      const stem = token.replace(/(?:ing|ment|tion|s)$/i, '');
      if (stem.length >= 5 && haystack.includes(stem)) relevanceScore += 2;
    }
  });
  if (relevanceScore === 0) return 0;
  let score = relevanceScore;
  if (source.createdAt && Date.now() - new Date(source.createdAt).getTime() < 1000 * 60 * 60 * 24 * 30) score += 1;
  if (source.updatedAt && Date.now() - new Date(source.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 14) score += 1;
  if (source.type === 'highlight' || source.type === 'notebook') score += 0.5;
  return score;
};

const scoreSourceTitle = (source, queryTokens = []) => {
  const title = asString(source.title).toLowerCase();
  if (!title) return 0;
  let score = 0;
  new Set(queryTokens).forEach((token) => {
    if (title.includes(token)) score += token.length > 5 ? 3 : 1;
    else {
      const stem = token.replace(/(?:ing|ment|tion|s)$/i, '');
      if (stem.length >= 5 && title.includes(stem)) score += 2;
    }
  });
  return score;
};

const runFind = async (Model, query = {}, limit = 200, projection = null) => {
  if (!Model?.find) return [];
  try {
    let cursor = Model.find(query, projection || undefined);
    cursor = cursor.sort?.({ updatedAt: -1, createdAt: -1 }) || cursor;
    cursor = cursor.limit?.(limit) || cursor;
    cursor = cursor.lean?.() || cursor;
    const result = await cursor;
    return Array.isArray(result) ? result : [];
  } catch (_error) {
    try {
      const result = await Model.find(query);
      return Array.isArray(result) ? result : [];
    } catch (__error) {
      return [];
    }
  }
};

const modelForPage = ({ page, models = {} } = {}) => models.WikiPage || page?.constructor || null;

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
  const repoScaffold = (
    (page?.externalWatches?.githubRepo || /GitHub repo:|github\.com\/[^/\s]+\/[^/\s]+/i.test([page?.createdFrom?.text, page?.createdFrom?.label].join(' ')))
    && GITHUB_REPO_SCAFFOLD_PATTERNS.some(pattern => pattern.test(text))
  );
  if (repoScaffold) return '';
  const title = asString(page?.title).toLowerCase();
  const withoutTitle = text.toLowerCase() === title ? '' : text;
  return withoutTitle;
};

// Heavy article fields the maintenance loader never reads (PDF attachment
// payloads, import metadata, highlight anchors). Excluding them server-side
// is the difference between transferring full documents and the slim text we
// actually score on — collectLibrarySources was taking 20-46s loading the
// whole library before this projection + the profile-aware caps below.
const ARTICLE_SOURCE_PROJECTION = '-pdfs -importMeta -annotations -highlights.anchor -highlights.importMeta';
const FAST_LIBRARY_LIMITS = { article: 40, notebook: 20, concept: 20, question: 20 };
const STANDARD_LIBRARY_LIMITS = { article: 150, notebook: 150, concept: 120, question: 120 };

const collectLibrarySources = async ({ userId, models = {}, fastProfile = false } = {}) => {
  const limits = fastProfile ? FAST_LIBRARY_LIMITS : STANDARD_LIBRARY_LIMITS;
  const [articles, notebooks, concepts, questions] = await Promise.all([
    runFind(models.Article, { userId }, limits.article, ARTICLE_SOURCE_PROJECTION),
    runFind(models.NotebookEntry, { userId }, limits.notebook),
    runFind(models.TagMeta, { userId }, limits.concept),
    runFind(models.Question, { userId }, limits.question)
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
  const scoredSources = sources
    .map((source, index) => ({
      ...source,
      libraryIndex: index + 1,
      score: scoreSource(source, queryTokens),
      titleScore: scoreSourceTitle(source, queryTokens)
    }));
  const sortSources = (a, b) => (
    b.titleScore - a.titleScore
    || b.score - a.score
    || new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
  );
  const relevantSources = scoredSources
    .filter(source => source.score >= MIN_SOURCE_RELEVANCE_SCORE);
  const minCandidateCount = Math.min(MIN_SPARSE_PAGE_CANDIDATES, limit);
  const shouldBackfill = sources.length >= minCandidateCount
    && relevantSources.length > 0
    && relevantSources.length < minCandidateCount;
  const selected = !shouldBackfill
    ? relevantSources
    : [
        ...relevantSources,
        ...scoredSources
          .filter(source => !relevantSources.some(relevant => relevant.libraryIndex === source.libraryIndex))
          .sort(sortSources)
          .slice(0, Math.max(0, minCandidateCount - relevantSources.length))
      ];
  return selected
    .sort(sortSources)
    .slice(0, limit)
    .map((source, index) => ({ ...source, index: index + 1 }));
};

const collectKnownWikiPages = async ({ page, userId, models = {}, limit = 40 } = {}) => {
  const WikiPage = modelForPage({ page, models });
  if (!WikiPage) return [];
  const pageId = asString(page?._id || page?.id);
  const pages = await runFind(
    WikiPage,
    {
      userId,
      status: { $ne: 'archived' },
      _id: { $ne: pageId }
    },
    limit
  );
  return pages
    .map((knownPage) => ({
      id: asString(knownPage._id || knownPage.id),
      title: truncate(knownPage.title, 180),
      pageType: truncate(knownPage.pageType || 'topic', 80),
      summary: truncate(knownPage.summary || knownPage.description || knownPage.plainText || '', 220)
    }))
    .filter(knownPage => knownPage.id && knownPage.title)
    .slice(0, limit);
};

const formatKnownWikiPages = (knownWikiPages = []) => {
  if (!knownWikiPages.length) return 'No existing wiki pages were available.';
  return knownWikiPages
    .slice(0, 30)
    .map((knownPage, index) => {
      const suffix = knownPage.summary ? ` — ${knownPage.summary}` : '';
      return `${index + 1}. ${knownPage.title} (${knownPage.pageType || 'topic'})${suffix}`;
    })
    .join('\n');
};

const isGitHubRepoPage = ({ page = {}, candidates = [] } = {}) => {
  const createdFrom = [page.createdFrom?.text, page.createdFrom?.label].join(' ');
  const repoWatch = page.externalWatches?.githubRepo;
  if (asString(page.pageType).toLowerCase() === 'repo') return true;
  if (asString(repoWatch?.owner) && asString(repoWatch?.repo)) return true;
  if (/GitHub repo:|github\.com\/[^/\s]+\/[^/\s]+/i.test(createdFrom)) return true;
  return (Array.isArray(candidates) ? candidates : []).some(source => (
    source.provider === 'github-repo'
    || source.metadata?.source === 'github-repo'
    || /github-repo|repository documentation source|release notes/i.test([source.type, source.title, source.text].join(' '))
  ));
};

const isNoeisRepositoryPage = ({ page = {}, sourceRefs = [], candidates = [] } = {}) => {
  const haystack = [
    page.title,
    page.createdFrom?.text,
    page.createdFrom?.label,
    ...(Array.isArray(sourceRefs) ? sourceRefs : []).flatMap(ref => [
      ref.title,
      ref.snippet,
      ref.text,
      ref.metadata?.path
    ]),
    ...(Array.isArray(candidates) ? candidates : []).flatMap(source => [
      source.title,
      source.snippet,
      source.text,
      source.metadata?.path
    ])
  ].filter(Boolean).join('\n');
  return /\b(?:Noeis|Note[-\s]?Taker[-\s]?3|note-taker-3|Think-first|Morning Paper)\b/i.test(haystack);
};

const repoEvidenceText = ({ page = {}, sourceRefs = [] } = {}) => {
  const refs = Array.isArray(sourceRefs) && sourceRefs.length ? sourceRefs : (Array.isArray(page.sourceRefs) ? page.sourceRefs : []);
  return [
    page.createdFrom?.text,
    page.createdFrom?.label,
    page.title,
    ...refs.flatMap(ref => [ref.title, ref.snippet, ref.quote, ref.text, ref.url])
  ].filter(Boolean).join('\n');
};

const repoSourceEvidenceType = (source = {}) => {
  const explicitEvidenceType = asString(source.metadata?.evidenceType).toLowerCase();
  if (explicitEvidenceType === 'inventory') return 'inventory';
  if (explicitEvidenceType === 'policy') return 'policy';
  const raw = [
    source.metadata?.evidenceType,
    source.metadata?.path,
    source.title,
    source.url,
    source.snippet,
    source.text
  ].filter(Boolean).join(' ');
  if (/\bevidenceType=inventory\b|__repo_inventory__|code inventory/i.test(raw)) return 'inventory';
  if (/\bevidenceType=policy\b|\bdocClass=policy\b|(^|\/)(AGENTS|CLAUDE)\.md\b|\.cursorrules|copilot-instructions/i.test(raw)) return 'policy';
  if (/\bpackage\.json\b|\.ya?ml\b|\.github\/workflows\//i.test(raw)) return 'config';
  if (/\b(server|src|routes|services|models|pages|utils|layout)\/[^ ]+\.(js|jsx|ts|tsx)\b/i.test(raw)) return 'code';
  if (/\brecent commits?\b|commit:|head commit/i.test(raw)) return 'recent_commits';
  return 'document';
};

const repoSubstantiveSources = (sourceRefs = []) => (
  (Array.isArray(sourceRefs) ? sourceRefs : [])
    .filter(source => !['policy'].includes(repoSourceEvidenceType(source)))
);

const repoPolicySources = (sourceRefs = []) => (
  (Array.isArray(sourceRefs) ? sourceRefs : [])
    .filter(source => repoSourceEvidenceType(source) === 'policy')
);

const extractMarkdownHeadings = (text = '') => (
  asString(text)
    .split(/\n+/)
    .map(line => line.match(/^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/)?.[1] || '')
    .filter(Boolean)
);

const repoTitleMentionsDomain = ({ page = {}, text = '', sourceRefs = [] } = {}) => {
  const evidence = repoEvidenceText({ page, sourceRefs });
  const domainTerms = Array.from(new Set(
    evidence
      .replace(/https?:\/\/\S+/g, ' ')
      .match(/\b(?:wiki|library|think|note|notes|knowledge|reader|reading|agent|extension|github|repo|repository|developer|workflow|api|server|react|chrome|capture|source|highlight|concept|question)\b/gi) || []
  )).map(term => term.toLowerCase());
  if (!domainTerms.length) return true;
  const opening = asString(text).slice(0, 900).toLowerCase();
  return domainTerms.some(term => opening.includes(term));
};

const findGitHubRepoDeveloperDossierFailures = ({ page = {}, text = '', sourceRefs = [] } = {}) => {
  if (!isGitHubRepoPage({ page })) return [];
  const failures = [];
  const refs = Array.isArray(sourceRefs) ? sourceRefs : [];
  const substantiveRefs = repoSubstantiveSources(refs);
  const evidenceTypes = new Set(refs.map(repoSourceEvidenceType));
  const codeOrConfigCount = refs.filter(source => ['code', 'config', 'inventory'].includes(repoSourceEvidenceType(source))).length;
  const repoPaths = refs.map(extractRepoPath).filter(Boolean);
  const mentionedPathCount = repoPaths.filter(path => new RegExp(`\\b${escapeRegex(path)}\\b`, 'i').test(text)).length;
  const packageScripts = collectPackageScripts(refs);
  const mentionedScriptCount = packageScripts.filter(script => {
    const name = escapeRegex(script.name);
    return new RegExp(`\\bnpm\\s+(?:run\\s+${name}|${name})\\b`, 'i').test(text);
  }).length;
  const unqualifiedScriptMentions = findUnqualifiedPackageScriptMentions({ text, scripts: packageScripts });
  const isNoeisRepo = isNoeisRepositoryPage({ page, sourceRefs: refs });
  const exactPathMentions = repoPaths.filter(path => new RegExp(`\\b${escapeRegex(path)}\\b`, 'i').test(text));
  const flowSignalCount = NOEIS_REPO_FLOW_PATTERNS.filter(pattern => pattern.test(text)).length;
  const productSignalCount = NOEIS_REPO_PRODUCT_PATTERNS.filter(pattern => pattern.test(text)).length;
  const watchedRepo = Boolean(page.externalWatches?.githubRepo?.owner || page.externalWatches?.githubRepo?.repo);
  const noeisCorePaths = [
    'package.json',
    'server/server.js',
    'server/routes/wikiRoutes.js',
    'server/services/wikiMaintenanceService.js',
    'server/services/githubRepoWatcherService.js',
    'server/models/index.js',
    'note-taker-ui/src/api/wiki.js'
  ];
  const attachedNoeisCorePaths = noeisCorePaths.filter(requiredPath => (
    repoPaths.some(path => path.toLowerCase() === requiredPath.toLowerCase())
  ));
  const mentionedNoeisCorePaths = attachedNoeisCorePaths.filter(requiredPath => (
    new RegExp(`\\b${escapeRegex(requiredPath)}\\b`, 'i').test(text)
  ));
  GITHUB_REPO_TEMPLATE_LEAK_PATTERNS.forEach((pattern) => {
    if (pattern.test(text)) failures.push('GitHub repo article leaks repo-wiki template or quality-gate phrasing.');
  });
  if (watchedRepo && substantiveRefs.length < GITHUB_REPO_MIN_SOURCE_REFS) {
    failures.push(`GitHub repo article has too little substantive repository evidence: ${substantiveRefs.length}/${GITHUB_REPO_MIN_SOURCE_REFS} non-policy sources.`);
  }
  if (!repoTitleMentionsDomain({ page, text, sourceRefs: refs })) {
    failures.push('GitHub repo article summary does not state what this repository actually does.');
  }
  if (extractMarkdownHeadings(text).length < 4 && !/\b(?:run|test|build|architecture|flow|risk|unknown|entrypoint|service|route)\b/i.test(text)) {
    failures.push('GitHub repo article is not structured enough to orient a developer.');
  }
  if (!/\bnpm\s+(?:start|run|install|test|build|wiki:qa)\b|\byarn\s+(?:start|test|build)\b|\bpnpm\s+(?:start|test|build)\b/i.test(text)) {
    failures.push('GitHub repo article does not expose concrete local run or test commands.');
  }
  if (codeOrConfigCount < 3) {
    failures.push(`GitHub repo article has too little code/config evidence: ${codeOrConfigCount}/3 required.`);
  }
  if (repoPaths.length >= 3 && mentionedPathCount < 2) {
    failures.push(`GitHub repo article is too vague about concrete file paths: ${mentionedPathCount}/2 exact paths mentioned.`);
  }
  if (repoPaths.length >= 6 && exactPathMentions.length < 5) {
    failures.push(`GitHub repo article is not yet a developer handoff: ${exactPathMentions.length}/5 exact repository paths mentioned.`);
  }
  if (packageScripts.length >= 2 && mentionedScriptCount < 2) {
    failures.push(`GitHub repo article is too vague about package scripts: ${mentionedScriptCount}/2 exact scripts mentioned.`);
  }
  if (unqualifiedScriptMentions.length) {
    failures.push(`GitHub repo article has unsupported or unqualified package script references: ${unqualifiedScriptMentions.slice(0, 4).join(', ')}.`);
  }
  if (repoPolicySources(refs).length && /\bDeveloper posture:\b/i.test(text)) {
    failures.push('GitHub repo article repeats internal agent-policy language as product documentation.');
  }
  if (!evidenceTypes.has('recent_commits') && /\b(?:current|ongoing)\s+(?:development|active work|efforts)|\bdevelopment (?:focuses|is focused)|\bexpanding functionality\b|\bimproving the UI\b|\brecent commits?\b|\bissue tracker\b/i.test(text) && !/\b(?:no recent[-\s]?commit evidence|current active work remains unknown|no recent commits? (?:were|was) attached)\b/i.test(text)) {
    failures.push('GitHub repo article invents current active-work signals without recent-commit evidence.');
  }
  if (/\b(?:April|May|June)\s+202[0-5]\b|\bQA sweeps?\b|\bOAuth spike\b/i.test(text) && !/\bHistorical notes?\b/i.test(text)) {
    failures.push('GitHub repo article foregrounds stale planning or QA history instead of developer-facing current state.');
  }
  if (isNoeisRepo && productSignalCount < 4) {
    failures.push(`Noeis repo article does not orient the product loop clearly enough: ${productSignalCount}/4 product surfaces mentioned.`);
  }
  if (isNoeisRepo && flowSignalCount < 4) {
    failures.push(`Noeis repo article does not trace enough real repo flows: ${flowSignalCount}/4 implementation signals mentioned.`);
  }
  if (isNoeisRepo && watchedRepo && attachedNoeisCorePaths.length < 6) {
    const missing = noeisCorePaths.filter(path => !attachedNoeisCorePaths.includes(path));
    failures.push(`Noeis repo article is missing central implementation evidence: ${missing.join(', ')}.`);
  }
  if (isNoeisRepo && attachedNoeisCorePaths.length >= 6 && mentionedNoeisCorePaths.length < 5) {
    failures.push(`Noeis repo article does not use enough central implementation paths: ${mentionedNoeisCorePaths.length}/5 mentioned.`);
  }
  if (isNoeisRepo && !/\b(?:Render|Vercel)\b/i.test(text)) {
    failures.push('Noeis repo article omits the split production deploy targets.');
  }
  if (isNoeisRepo && !/\bVersionError\b|\boverlapping\b.*\b(?:stream|maintenance|draft)\b|\bduplicate\b.*\b(?:stream|build)\b/i.test(text)) {
    failures.push('Noeis repo article omits the known duplicate-stream or VersionError failure mode.');
  }
  return failures;
};

const findUnsupportedGitHubRepoClaims = ({ page = {}, text = '', sourceRefs = [] } = {}) => {
  if (!isGitHubRepoPage({ page })) return [];
  const evidence = repoEvidenceText({ page, sourceRefs });
  return GITHUB_REPO_UNSUPPORTED_PATTERNS
    .filter(({ pattern }) => pattern.test(text) && !pattern.test(evidence))
    .map(({ label }) => `GitHub repo article contains unsupported ${label}.`);
};

const formatGitHubRepoPromptBlock = ({ page = {}, candidates = [] } = {}) => {
  if (!isGitHubRepoPage({ page, candidates })) return '';
  return `

GitHub repository page rules:
- This page is about a public GitHub repository. Write it as an evidence-first developer dossier for someone trying to understand, run, change, and maintain the repo today.
- Write only what the repository evidence actually supports.
- Let the section structure follow the repository. A web app, CLI, SDK, and infrastructure repo should not read like the same template.
- Cover these jobs somewhere in the article when evidence supports them: what the repo/product is; how a developer runs and proves changes; the architecture map; critical user/request flows; common change paths; risks, invariants, and unknowns.
- Include a quickstart section or subsection with concrete Run, Test, Build/Deploy, and Key paths only when package/config evidence supports them.
- The first viewport must be useful before the References section: name the concrete run command, the proof command, and at least two exact owning file paths when evidence supports them.
- For the Noeis repo, explicitly orient the product as Library -> Think -> Wiki -> safe public sharing before describing implementation files.
- For the Noeis repo, trace real implementation flows by name: createRepoWikiFromGitHub, /api/wiki/pages/from-github, githubRepoWatcherService, wikiMaintenanceService, sourceRefs/externalWatches.githubRepo, and WikiPageReadView when those sources are attached.
- For the Noeis repo, include the split deploy reality when evidence supports it: frontend on Vercel/noeis.io and API on Render/note-taker-3-unrg.
- For the Noeis repo, include the known repo-wiki failure modes when evidence supports them: thin fallback output, stale GitHub evidence, duplicate streams, and Mongoose VersionError.
- Do not write placeholder sentences such as "details will appear after sync", "commands will appear later", "first question", or "repository sources are being attached." If evidence is missing, say exactly which command/path remains unknown.
- Prefer a practical handoff over a prose summary: each section should tell the developer what to run, what to inspect, what file owns the change, or what proof is missing.
- Start with what the product is and what user experience the repo serves before explaining files. Map user-visible rooms or flows to code only when evidence supports them.
- Include at least three critical request/user flows with UI entrypoint, API route/client, service, persistence, and rendering surface when those paths are attached.
- Include product/code invariants and failure modes. Prefer explicit "do not" rules over vague risk language.
- Do not claim the repo is published to npm, continuously integrated, fully tested, provenance-aware, or accompanied by a wiki unless a cited repository source explicitly says that.
- Prefer concrete repo facts: purpose, app/package type, major directories, package scripts, API routes, service/model entrypoints, frontend entrypoints, deployment targets, recent commits, documentation files, release notes, and open implementation risks.
- Include exact local commands only when package/config evidence supports them. Include exact key file paths only when they are present in the repository evidence.
- Treat README, package files, docs, changelogs, and releases as repository evidence. Do not describe them as Library highlights.
- Treat source metadata docClass="planned" as roadmap/spec material. It can appear only under Known risks, Current active work, or explicitly labeled planned work; never present it as shipped repository behavior.
- Treat source metadata docClass="policy" as internal working convention evidence only. It can explain repo-local development expectations, but it must not become product truth or the article's lead.
- Treat source metadata evidenceType="inventory" as structural evidence. Use it to name real directories and paths, not to infer behavior that source text does not show.
- If the repo evidence is thin, say which repository documents/files were found and what remains unknown.
- Do not use these phrases anywhere: "product-aware developer operating manual", "route/service/model/component", "working map for a new contributor", or "Developer posture:".
${formatGitHubRepoEvidenceDigest({ page, candidates })}`;
};

const formatCandidateMetadataLine = (source = {}) => {
  const meta = source.metadata || {};
  const parts = [
    source.provider ? `provider=${source.provider}` : '',
    meta.path ? `path=${meta.path}` : '',
    meta.evidenceType ? `evidenceType=${meta.evidenceType}` : '',
    meta.docClass ? `docClass=${meta.docClass}` : '',
    meta.commitSha ? `commit=${String(meta.commitSha).slice(0, 7)}` : ''
  ].filter(Boolean);
  return parts.length ? `Repository metadata: ${parts.join(' · ')}\n` : '';
};

const buildPrompt = ({
  page,
  candidates,
  manualNotes = '',
  wikiSchemaContent = '',
  knownWikiPages = [],
  sourceTextLimit = DEFAULT_PROMPT_SOURCE_TEXT_LIMIT
}) => {
  const repoPage = isGitHubRepoPage({ page, candidates });
  const structure = getWikiPageStructure(repoPage ? 'repo' : (page.pageType || 'topic'));
  const sourceBlock = candidates.map(source => (
    `[${source.index}] ${source.type.toUpperCase()}: ${source.title}\n` +
    `Updated: ${source.updatedAt || source.createdAt || 'unknown'}\n` +
    formatCandidateMetadataLine(source) +
    `Text: ${truncate(source.text, sourceTextLimit)}`
  )).join('\n\n');

  return `Maintain this Wiki page by directly rewriting it into a clean, durable Wiki article.

Hard rules:
- The article body must read like a Wiki page, not a maintenance report and not a source dump.
- Be opinionated. State what the evidence implies, which mechanisms matter, and where the tension is. Mark uncertainty in Open Questions instead of writing filler.
- Do not include HTML tags, JSON, raw URLs, scraped metadata labels, source indexes as prose, support labels, or sentences like "X contributes evidence for this page."
- Use source titles only as evidence behind the writing. The page should say the idea, not list the source title as the idea.
- Do not write scaffold or placeholder phrases such as "should explain", "still needs source-backed development", "strongest current signals", or "Summary:" bullets.
- Do not restate the page title as a body heading. The page chrome already renders the title; the article body should begin with the summary paragraph.
- If there are 5 or more candidate sources, write at least 650 words of synthesis across the required sections.
- Keep lightweight citation indexes only at the end of factual paragraphs or bullets, e.g. [1] or [1, 3].
- When a paragraph has both supporting and contradicting evidence, put supporting sources in citationIndexes and contradicting sources in contradictionIndexes. Set support to "conflicted".
- Put evidence gaps, new items, contradictions, stale sections, and changelog entries only in maintenance.
- Preserve likely user-authored notes when they are not duplicate, contradicted, navigation text, or metadata.
- Where it is natural and specific, mention existing related wiki pages by their exact titles so the article becomes navigable through inline wiki links. Do not force links, do not list related pages as a directory, and do not mention generic page titles that add no explanatory value.
${formatGitHubRepoPromptBlock({ page, candidates })}

Page:
Title: ${page.title}
Type: ${page.pageType || 'topic'}
Page intent: ${structure.intent}
${repoPage ? `Repo dossier section goals, not mandated headings: ${structure.sections.join(' | ')}` : `Required section shape, in this order: ${structure.sections.join(' | ')}`}
Existing text: ${truncate(page.plainText || toPlainText(page.body), 2400)}
Creation seed: ${truncate(page.createdFrom?.text || page.createdFrom?.label || '', 1200)}
Manual notes to preserve when useful: ${manualNotes || 'None detected.'}

Candidate library sources:
${sourceBlock || 'No library sources were found.'}

Existing related wiki pages available for natural inline references:
${formatKnownWikiPages(knownWikiPages)}${formatWikiSchemaPromptBlock(wikiSchemaContent)}

Return strict JSON only:
{
  "title": "page title",
  "article": {
    "summary": { "text": "one clean introductory paragraph", "citationIndexes": [1], "contradictionIndexes": [], "support": "supported|partial|unsupported|conflicted" },
    "sections": [
      {
        "heading": "${structure.sections[0]}",
        "paragraphs": [
          { "text": "clean wiki paragraph", "citationIndexes": [1, 2], "contradictionIndexes": [], "support": "supported|partial|unsupported|conflicted" }
        ],
        "bullets": [
          { "text": "optional clean article bullet", "citationIndexes": [3], "contradictionIndexes": [], "support": "supported|partial|unsupported|conflicted" }
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
      "contradictions": [{ "text": "contradiction", "sourceTitle": "source", "sourceIndexes": [2], "section": "section" }],
      "relatedPages": [{ "text": "related topic or page" }]
    }
  },
  "sourceIndexesUsed": [1, 2]
}`;
};

const buildRebuildPrompt = ({
  page,
  candidates,
  manualNotes = '',
  wikiSchemaContent = '',
  knownWikiPages = [],
  failures = [],
  sourceTextLimit = DEFAULT_PROMPT_SOURCE_TEXT_LIMIT
}) => (
  `${buildPrompt({ page, candidates, manualNotes, wikiSchemaContent, knownWikiPages, sourceTextLimit })}

Your previous draft failed the wiki quality gate:
${failures.map(failure => `- ${failure}`).join('\n') || '- The draft was too thin or scaffold-like.'}

Rewrite again from scratch. Produce a real article, not a patch. Make defensible claims, compare evidence, and include concrete tensions.`
);

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

const normalizeMaintenanceProfile = (value = '') => {
  const normalized = asString(value).toLowerCase();
  return normalized === 'fast' || normalized === 'onboarding_fast' ? 'fast' : 'standard';
};

const sanitizeDraftStreamDelta = (value = '') => (
  String(value || '')
    .replace(/[{}\[\]":,_]/g, ' ')
    .replace(/\b(?:title|article|summary|text|citationIndexes|sections|heading|paragraphs|bullets|maintenance|sourceIndexesUsed|changelog|health)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const shouldInlineQualityRebuild = ({ quality = {}, plainText = '', fastProfile = false, skipQualityRebuild = false } = {}) => {
  if (!quality || quality.ok) return false;
  if (skipQualityRebuild) return false;
  const failures = Array.isArray(quality.failures) ? quality.failures.join(' ') : '';
  if (/GitHub repo article|developer-dossier/i.test(failures)) return true;
  if (!fastProfile) return true;
  const wordCount = cleanWikiText(plainText).split(/\s+/).filter(Boolean).length;
  return wordCount < 30;
};

const sourceRefFromCandidate = (candidate) => {
  const isGitHubConfig = isGitHubRepoCandidate(candidate)
    && /\b(?:package\.json|\.github\/workflows\/[^/]+\.ya?ml)\b/i.test(String(candidate.metadata?.path || candidate.title || ''));
  return {
    type: candidate.type,
    objectId: candidate.objectId || null,
    parentObjectId: candidate.parentObjectId || null,
    title: truncate(candidate.title, 240),
    snippet: truncate(candidate.text, isGitHubConfig ? 4000 : 1000),
    url: truncateRaw(candidate.url, 1000),
    citationLabel: `[${candidate.index}]`,
    addedBy: 'ai',
    provider: candidate.provider || '',
    metadata: candidate.metadata || {}
  };
};

const candidateFromSourceRef = (sourceRef = {}, index = 1) => ({
  type: sourceRef.type || 'external',
  objectId: sourceRef.objectId || sourceRef._id || null,
  parentObjectId: sourceRef.parentObjectId || null,
  title: truncate(sourceRef.title || sourceRef.sourceTitle || '', 240),
  url: truncateRaw(sourceRef.url || '', 1000),
  text: truncate([sourceRef.snippet, sourceRef.quote, sourceRef.text].filter(Boolean).join('\n'), MAX_SOURCE_TEXT),
  tags: [],
  createdAt: sourceRef.createdAt,
  updatedAt: sourceRef.updatedAt,
  provider: sourceRef.provider || sourceRef.metadata?.source || '',
  metadata: sourceRef.metadata || {},
  index
});

const dedupeSourceRefs = (existing = [], next = []) => {
  const seen = new Set();
  return [...existing, ...next].filter((source) => {
    const key = source.objectId
      ? `${source.type}:${source.objectId}`
      : `${source.type}:${source.title || ''}:${source.url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(source.type && (source.objectId || source.title || source.snippet || source.url));
  }).slice(0, 80);
};

const isGitHubRepoCandidate = (source = {}) => (
  source.provider === 'github-repo'
  || source.metadata?.source === 'github-repo'
  || /github-repo|repository documentation source|release notes|default branch|latest release|github repository/i
    .test([source.type, source.title, source.text, source.url].join(' '))
);

const githubRepoEvidenceRank = (source = {}, currentHead = '') => {
  const meta = source.metadata || {};
  const evidenceType = repoSourceEvidenceType(source);
  const docClass = asString(meta.docClass).toLowerCase();
  const path = asString(meta.path).toLowerCase();
  const commitSha = asString(meta.commitSha);
  let rank = 100;
  if (commitSha && currentHead && commitSha === currentHead) rank -= 50;
  else if (commitSha && currentHead && commitSha !== currentHead) rank += 75;
  if (evidenceType === 'config') rank += 0;
  else if (evidenceType === 'recent_commits') rank -= 2;
  else if (evidenceType === 'code') rank += 6;
  else if (docClass === 'readme') rank += 18;
  else if (docClass === 'runbook') rank += 24;
  else if (docClass === 'changelog') rank += 42;
  else if (docClass === 'planned') rank += 90;
  else rank += 36;
  if (path === 'package.json') rank -= 8;
  if (/^server\/(server|routes|services|models)\//.test(path) || path === 'server/server.js') rank -= 4;
  if (/^note-taker-ui\/src\/(app|index|main|pages|components|api)\b/.test(path)) rank -= 2;
  if (path === 'server/routes/wikiroutes.js') rank -= 16;
  if (path === 'server/services/wikimaintenanceservice.js') rank -= 15;
  if (path === 'server/services/githubrepowatcherservice.js') rank -= 14;
  if (path === 'server/services/wikiaskservice.js') rank -= 10;
  if (path === 'note-taker-ui/src/api/wiki.js') rank -= 9;
  if (path === 'note-taker-ui/src/components/wiki/wikipagereadview.jsx') rank -= 8;
  if (/^server\/routes\/authdiscoveryroutes\.[jt]s$/.test(path)) rank += 8;
  if (/^server\/services\/wikimaintenance(?:qualityharness|orchestrator)\.[jt]s$/.test(path)) rank += 4;
  return rank;
};

const collectExistingSourceCandidates = ({ page = {} } = {}) => (
  (Array.isArray(page.sourceRefs) ? page.sourceRefs : [])
    .map((sourceRef, index) => candidateFromSourceRef(sourceRef, index + 1))
    .filter(source => asString(source.title) || asString(source.text) || asString(source.url))
);

const selectMaintenanceCandidates = ({ page, sources, limit = DEFAULT_SOURCE_LIMIT }) => {
  const existingCandidates = collectExistingSourceCandidates({ page });
  if (isGitHubRepoPage({ page, candidates: existingCandidates })) {
    const repoCandidates = existingCandidates.filter(isGitHubRepoCandidate);
    const candidatePool = repoCandidates.length >= Math.min(existingCandidates.length, 8)
      ? repoCandidates
      : existingCandidates;
    if (candidatePool.length) {
      const currentHead = asString(page.externalWatches?.githubRepo?.lastHeadSha);
      return candidatePool
        .sort((a, b) => (
          githubRepoEvidenceRank(a, currentHead) - githubRepoEvidenceRank(b, currentHead)
          || asString(a.metadata?.path || a.title).localeCompare(asString(b.metadata?.path || b.title))
        ))
        // Repo pages need enough breadth to connect product docs to the files
        // that own the described flows. The ordinary 24-source cap routinely
        // excluded those implementation files in documentation-heavy repos.
        .slice(0, Math.max(limit, Math.min(candidatePool.length, 32)))
        .map((source, index) => ({ ...source, index: index + 1 }));
    }
  }
  return selectCandidateSources({ page, sources, limit });
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
    return { text: truncate(value, 1000), citationIndexes: [], contradictionIndexes: [], support: null };
  }
  if (!value || typeof value !== 'object') return null;
  const text = truncate(value.text || value.body || value.summary || '', 1000);
  if (!text) return null;
  const citationIndexes = normalizeCitationIndexes(value.citationIndexes || value.sourceIndexes || value.sources);
  const contradictionIndexes = normalizeCitationIndexes(
    value.contradictionIndexes ||
    value.contradictedByIndexes ||
    value.contradictingSourceIndexes ||
    value.contradictionSourceIndexes
  );
  return {
    text,
    citationIndexes,
    contradictionIndexes,
    support: normalizeClaimSupport(value.support || value.status || (contradictionIndexes.length ? 'conflicted' : inferClaimSupport(citationIndexes)))
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
  const content = [];
  const summary = normalizeArticleTextBlock(article.summary);
  if (summary?.text) content.push(claimParagraph(summary.text, summary.citationIndexes, summary.support, summary.contradictionIndexes));
  (article.sections || []).forEach((section) => {
    const sectionTitle = truncate(section.heading || section.title, 140);
    if (sectionTitle) content.push(heading(sectionTitle, 2));
    (section.paragraphs || []).forEach((item) => {
      const block = normalizeArticleTextBlock(item);
      if (block?.text) content.push(claimParagraph(block.text, block.citationIndexes, block.support, block.contradictionIndexes));
    });
    const bulletItems = (section.bullets || [])
      .map(normalizeArticleTextBlock)
      .filter(Boolean)
      .map(block => ({
        text: block.text,
        citationIndexes: block.citationIndexes,
        contradictionIndexes: block.contradictionIndexes,
        support: block.support
      }));
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
  if (Array.isArray(node)) {
    let currentSection = section;
    return node.flatMap((child) => {
      const claims = collectClaimsFromDoc(child, currentSection);
      if (child?.type === 'heading') currentSection = toPlainText(child) || currentSection;
      return claims;
    });
  }
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
    support: claimMark.attrs?.support || inferClaimSupport(
      claimMark.attrs?.citationIndexes || [],
      claimMark.attrs?.contradictionIndexes || []
    ),
    citationIndexes: normalizeCitationIndexes(claimMark.attrs?.citationIndexes || []),
    contradictionIndexes: normalizeCitationIndexes(claimMark.attrs?.contradictionIndexes || []),
    citationIds: [],
    lastReviewedAt: new Date()
  }] : [];
  return [...own, ...collectClaimsFromDoc(node.content, nextSection)];
};

const normalizeMaybeObjectId = (value) => {
  const text = asString(value);
  return text || null;
};

const normalizeClaimSupport = (support = '') => {
  if (support === 'contradicted') return 'conflicted';
  return ['supported', 'partial', 'unsupported', 'conflicted'].includes(support)
    ? support
    : 'unsupported';
};

const normalizeClaimIdentity = (value = '') => (
  cleanWikiText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const resolveClaimCitationIds = ({ citationIndexes = [], citations = [], sourceRefs = [] } = {}) => {
  const indexes = normalizeCitationIndexes(citationIndexes);
  const ids = [];
  const seen = new Set();
  indexes.forEach((index) => {
    const citation = citations[index - 1] || null;
    const source = sourceRefs[index - 1] || null;
    const id = normalizeMaybeObjectId(citation?._id || citation?.id || citation?.sourceRefId || source?._id || source?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
};

const resolveClaimSourceRefIds = ({ citationIndexes = [], citations = [], sourceRefs = [] } = {}) => {
  const indexes = normalizeCitationIndexes(citationIndexes);
  const ids = [];
  const seen = new Set();
  indexes.forEach((index) => {
    const citation = citations[index - 1] || null;
    const source = sourceRefs[index - 1] || null;
    const id = normalizeMaybeObjectId(citation?.sourceRefId || source?._id || source?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
};

const claimConfidence = ({ support, citationIds = [], sourceRefIds = [] } = {}) => {
  const citationCount = Math.max(citationIds.length, sourceRefIds.length);
  const base = {
    supported: 0.72,
    partial: 0.48,
    unsupported: 0.12,
    conflicted: 0.32
  }[normalizeClaimSupport(support)] || 0.12;
  const boost = Math.min(0.18, citationCount * 0.06);
  return Math.min(0.95, Number((base + boost).toFixed(2)));
};

const normalizeClaimHistory = (history = []) => (
  Array.isArray(history)
    ? history
        .filter(Boolean)
        .map(entry => ({
          at: entry.at || new Date(),
          event: truncateRaw(entry.event || 'reviewed', 80),
          support: normalizeClaimSupport(entry.support),
          text: truncate(entry.text || '', 500),
          section: truncate(entry.section || '', 160),
          citationIds: Array.isArray(entry.citationIds) ? entry.citationIds.filter(Boolean).slice(0, 12) : [],
          sourceRefIds: Array.isArray(entry.sourceRefIds) ? entry.sourceRefIds.filter(Boolean).slice(0, 12) : [],
          contradictedByCitationIds: Array.isArray(entry.contradictedByCitationIds) ? entry.contradictedByCitationIds.filter(Boolean).slice(0, 12) : [],
          summary: truncate(entry.summary || '', 300)
        }))
        .slice(-12)
    : []
);

const attachClaimCitationIds = ({ claims = [], citations = [], sourceRefs = [] } = {}) => (
  (Array.isArray(claims) ? claims : []).map((claim) => {
    const { citationIndexes, contradictionIndexes, ...rest } = claim || {};
    const support = normalizeClaimSupport(rest.support);
    const citationIds = resolveClaimCitationIds({ citationIndexes, citations, sourceRefs });
    const sourceRefIds = resolveClaimSourceRefIds({ citationIndexes, citations, sourceRefs });
    const contradictedByCitationIds = resolveClaimCitationIds({
      citationIndexes: contradictionIndexes,
      citations,
      sourceRefs
    });
    return {
      ...rest,
      support,
      citationIds,
      sourceRefIds,
      contradictedByCitationIds: contradictedByCitationIds.length
        ? contradictedByCitationIds
        : support === 'conflicted'
          ? citationIds
          : [],
      confidence: claimConfidence({ support, citationIds, sourceRefIds })
    };
  })
);

const hasClaimChanged = (previous = {}, next = {}) => (
  normalizeClaimSupport(previous.support) !== normalizeClaimSupport(next.support) ||
  asString(previous.text) !== asString(next.text) ||
  asString(previous.section) !== asString(next.section) ||
  JSON.stringify((previous.citationIds || []).map(String).sort()) !== JSON.stringify((next.citationIds || []).map(String).sort()) ||
  JSON.stringify((previous.sourceRefIds || []).map(String).sort()) !== JSON.stringify((next.sourceRefIds || []).map(String).sort()) ||
  JSON.stringify((previous.contradictedByCitationIds || []).map(String).sort()) !== JSON.stringify((next.contradictedByCitationIds || []).map(String).sort())
);

const claimHistoryEntry = ({ claim, event, now, summary }) => ({
  at: now,
  event,
  support: normalizeClaimSupport(claim.support),
  text: truncate(claim.text || '', 500),
  section: truncate(claim.section || '', 160),
  citationIds: Array.isArray(claim.citationIds) ? claim.citationIds.filter(Boolean).slice(0, 12) : [],
  sourceRefIds: Array.isArray(claim.sourceRefIds) ? claim.sourceRefIds.filter(Boolean).slice(0, 12) : [],
  contradictedByCitationIds: Array.isArray(claim.contradictedByCitationIds) ? claim.contradictedByCitationIds.filter(Boolean).slice(0, 12) : [],
  summary: truncate(summary || '', 300)
});

const buildClaimLedger = ({ claims = [], previousClaims = [], now = new Date() } = {}) => {
  const byId = new Map();
  const byText = new Map();
  (Array.isArray(previousClaims) ? previousClaims : []).forEach((claim) => {
    if (!claim) return;
    const plain = claim.toObject ? claim.toObject() : claim;
    if (plain.claimId) byId.set(String(plain.claimId), plain);
    const identity = normalizeClaimIdentity(plain.text);
    if (identity && !byText.has(identity)) byText.set(identity, plain);
  });

  return (Array.isArray(claims) ? claims : []).map((claim) => {
    const previousById = claim.claimId ? byId.get(String(claim.claimId)) : null;
    const previousByText = byText.get(normalizeClaimIdentity(claim.text));
    const previous = previousById || previousByText || null;
    const support = normalizeClaimSupport(claim.support);
    const citationIds = Array.isArray(claim.citationIds) ? claim.citationIds.filter(Boolean).slice(0, 12) : [];
    const sourceRefIds = Array.isArray(claim.sourceRefIds) ? claim.sourceRefIds.filter(Boolean).slice(0, 12) : [];
    const explicitContradictions = Array.isArray(claim.contradictedByCitationIds)
      ? claim.contradictedByCitationIds.filter(Boolean).slice(0, 12)
      : [];
    const next = {
      claimId: claim.claimId,
      text: truncate(claim.text || '', 800),
      section: truncate(claim.section || '', 160),
      support,
      citationIds,
      sourceRefIds,
      contradictedByCitationIds: explicitContradictions.length
        ? explicitContradictions
        : support === 'conflicted'
          ? citationIds
          : [],
      confidence: claimConfidence({ support, citationIds, sourceRefIds }),
      lastReviewedAt: now,
      lastVerifiedAt: citationIds.length || sourceRefIds.length
        ? now
        : previous?.lastVerifiedAt || null,
      createdAt: previous?.createdAt || claim.createdAt || now
    };
    const history = normalizeClaimHistory(previous?.history);
    if (!previous) {
      history.push(claimHistoryEntry({
        claim: next,
        event: 'created',
        now,
        summary: 'Claim added to the page ledger.'
      }));
    } else if (hasClaimChanged(previous, next)) {
      history.push(claimHistoryEntry({
        claim: next,
        event: 'updated',
        now,
        summary: 'Claim text, support, section, or evidence changed.'
      }));
    } else if (!history.length) {
      history.push(claimHistoryEntry({
        claim: next,
        event: 'reviewed',
        now,
        summary: 'Claim reviewed with no material change.'
      }));
    }
    next.history = history.slice(-12);
    return next;
  });
};

const deriveClaimsFromDoc = ({
  body,
  title = '',
  citations = [],
  sourceRefs = [],
  previousClaims = [],
  limit = 80,
  now = new Date()
} = {}) => buildClaimLedger({
  claims: attachClaimCitationIds({
    claims: collectClaimsFromDoc(body, title).slice(0, limit),
    citations,
    sourceRefs
  }),
  previousClaims,
  now
});

const buildSectionMaintenancePlan = ({ claims = [], health = {}, changeLog = [], now = new Date() } = {}) => {
  const sections = new Map();
  const ensure = (section = '') => {
    const name = truncate(section || 'Unsectioned', 160);
    if (!sections.has(name)) {
      sections.set(name, {
        section: name,
        totalClaims: 0,
        supportedClaims: 0,
        partialClaims: 0,
        unsupportedClaims: 0,
        conflictedClaims: 0,
        averageConfidence: 0,
        lastReviewedAt: null,
        actions: []
      });
    }
    return sections.get(name);
  };

  (Array.isArray(claims) ? claims : []).forEach((claim) => {
    const row = ensure(claim.section);
    row.totalClaims += 1;
    const support = normalizeClaimSupport(claim.support);
    if (support === 'supported') row.supportedClaims += 1;
    else if (support === 'partial') row.partialClaims += 1;
    else if (support === 'conflicted') row.conflictedClaims += 1;
    else row.unsupportedClaims += 1;
    row.averageConfidence += Number(claim.confidence || 0);
    const reviewed = claim.lastReviewedAt ? new Date(claim.lastReviewedAt) : null;
    if (reviewed && (!row.lastReviewedAt || reviewed > new Date(row.lastReviewedAt))) {
      row.lastReviewedAt = reviewed;
    }
  });

  HEALTH_KEYS.forEach((key) => {
    (Array.isArray(health?.[key]) ? health[key] : []).forEach((item) => {
      const row = ensure(item.section || item.target);
      row.actions.push({
        type: key,
        text: truncate(item.text || item.summary || item.title || '', 220)
      });
    });
  });

  (Array.isArray(changeLog) ? changeLog : []).forEach((entry) => {
    const row = ensure(entry.target || entry.title);
    row.actions.push({
      type: entry.type || 'maintenance',
      text: truncate(entry.summary || entry.text || '', 220)
    });
  });

  return {
    updatedAt: now,
    sections: Array.from(sections.values()).map((row) => ({
      ...row,
      averageConfidence: row.totalClaims
        ? Number((row.averageConfidence / row.totalClaims).toFixed(2))
        : 0,
      lastReviewedAt: row.lastReviewedAt || null,
      actions: row.actions.filter(action => action.text).slice(0, 6)
    })).sort((a, b) => (
      b.conflictedClaims - a.conflictedClaims ||
      b.unsupportedClaims - a.unsupportedClaims ||
      b.totalClaims - a.totalClaims ||
      a.section.localeCompare(b.section)
    ))
  };
};

const extractRepoPath = (source = {}) => asString(source.metadata?.path);
const MAX_REPO_PACKAGE_SCRIPTS = 80;

const extractPackageScripts = (source = {}) => {
  const text = asString(source.text || source.snippet);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    const looseScripts = [];
    const scriptsBlock = text.match(/"scripts"\s*:\s*\{([\s\S]*)/i);
    if (scriptsBlock) {
      const pairPattern = /"([^"]+)"\s*:\s*"([^"]*)"?/g;
      let pair = pairPattern.exec(scriptsBlock[1]);
      while (pair && looseScripts.length < MAX_REPO_PACKAGE_SCRIPTS) {
        looseScripts.push({ name: pair[1], command: asString(pair[2]) });
        pair = pairPattern.exec(scriptsBlock[1]);
      }
    }
    return looseScripts.filter(script => script.name && script.command);
  }
  try {
    const parsed = JSON.parse(match[0]);
    const scriptsObject = parsed.scripts || parsed;
    return Object.entries(scriptsObject || {})
      .map(([name, command]) => ({ name, command: asString(command) }))
      .filter(script => script.name && script.command)
      .slice(0, MAX_REPO_PACKAGE_SCRIPTS);
  } catch (_error) {
    const scriptsBlock = match[0].match(/"scripts"\s*:\s*\{([\s\S]*)/i);
    if (!scriptsBlock) return [];
    const scripts = [];
    const pairPattern = /"([^"]+)"\s*:\s*"([^"]*)"?/g;
    let pair = pairPattern.exec(scriptsBlock[1]);
    while (pair && scripts.length < MAX_REPO_PACKAGE_SCRIPTS) {
      scripts.push({ name: pair[1], command: asString(pair[2]) });
      pair = pairPattern.exec(scriptsBlock[1]);
    }
    return scripts.filter(script => script.name && script.command);
  }
};

const repoScriptScore = (script = {}) => {
  const name = asString(script.name).toLowerCase();
  const path = asString(script.sourcePath).toLowerCase();
  let score = 50;
  if (path === 'package.json') score -= 20;
  if (/^start$/.test(name)) score -= 18;
  else if (/^dev$/.test(name)) score -= 14;
  else if (/^wiki:qa$/.test(name)) score -= 16;
  else if (/^wiki:.*harness/.test(name)) score -= 14;
  else if (/^agent:harness(?::ci)?$/.test(name)) score -= 13;
  else if (/^test/.test(name)) score -= 12;
  else if (/^lint/.test(name)) score -= 8;
  else if (/build/.test(name)) score -= 10;
  if (/extension|generate|seed|debug|cleanup|script|bakeoff/i.test(name)) score += 8;
  return score;
};

const collectPackageScripts = (sources = []) => {
  const seen = new Set();
  return (Array.isArray(sources) ? sources : [])
    .filter(source => /\bpackage\.json$/i.test(extractRepoPath(source)))
    .flatMap(source => extractPackageScripts(source).map(script => ({
      ...script,
      sourceIndex: source.index,
      sourcePath: extractRepoPath(source) || source.title
    })))
    .filter((script) => {
      const key = `${script.sourcePath || ''}:${script.name}`;
      if (!script.name || !script.command || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => repoScriptScore(a) - repoScriptScore(b) || asString(a.name).localeCompare(asString(b.name)));
};

const scriptCommandLabel = (script = {}) => {
  if (!script?.name) return '';
  const suffix = script.sourcePath && script.sourcePath !== 'package.json'
    ? ` from ${script.sourcePath}`
    : '';
  return `npm run ${script.name}${suffix}`;
};

const repoSourceForPath = (sources = [], pattern) => (
  (Array.isArray(sources) ? sources : []).find(source => pattern.test(extractRepoPath(source) || source.title || '')) || null
);

const packageSnippetHasScript = (sources = [], name = '') => {
  const needle = escapeRegex(name);
  return (Array.isArray(sources) ? sources : [])
    .some(source => /\bpackage\.json$/i.test(extractRepoPath(source))
      && new RegExp(`["']${needle}["']\\s*:`, 'i').test(asString(source.text || source.snippet)));
};

const commandForScript = (scripts = [], namePattern, fallback = '') => {
  const script = (Array.isArray(scripts) ? scripts : []).find(item => namePattern.test(item.name));
  if (script) return scriptCommandLabel(script);
  return fallback;
};

const bulletForSourcePath = ({ sources = [], path = '', label = '', reason = '' } = {}) => {
  const source = repoSourceForPath(sources, new RegExp(`^${escapeRegex(path)}$`, 'i'));
  return {
    text: `${label || path}: ${reason || 'open this file first.'}`,
    citationIndexes: [source?.index].filter(Boolean)
  };
};

const findUnqualifiedPackageScriptMentions = ({ text = '', scripts = [] } = {}) => {
  const sourceScripts = Array.isArray(scripts) ? scripts : [];
  if (!sourceScripts.length) return [];
  const byName = new Map();
  sourceScripts.forEach((script) => {
    const name = asString(script.name);
    if (!name) return;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(script);
  });
  const issues = [];
  const pattern = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)\b/g;
  let match = pattern.exec(text);
  while (match) {
    const name = match[1];
    const matches = byName.get(name) || [];
    if (!matches.length) {
      issues.push(`npm run ${name}`);
    } else if (!matches.some(script => asString(script.sourcePath) === 'package.json')) {
      const start = Math.max(0, match.index - 60);
      const end = Math.min(text.length, match.index + match[0].length + 120);
      const context = text.slice(start, end).toLowerCase();
      const qualified = matches.some((script) => {
        const sourcePath = asString(script.sourcePath).toLowerCase();
        const sourceDir = sourcePath.includes('/') ? sourcePath.split('/').slice(0, -1).join('/') : '';
        const explicitSourcePhrase = sourcePath && text.toLowerCase().includes(`npm run ${name.toLowerCase()} from ${sourcePath}`);
        return explicitSourcePhrase
          || (sourcePath && context.includes(sourcePath))
          || (sourceDir && context.includes(sourceDir))
          || /\b--workspace\b|\bworkspace\b|\bfrontend\b|\bclient\b|\bui package\b/.test(context);
      });
      if (!qualified) issues.push(`npm run ${name}`);
    }
    match = pattern.exec(text);
  }
  return Array.from(new Set(issues));
};

const REPO_FALLBACK_PRIORITY_PATHS = [
  /^package\.json$/i,
  /^note-taker-ui\/package\.json$/i,
  /^server\/server\.[jt]s$/i,
  /^server\/routes\/wikiRoutes\.[jt]s$/i,
  /^server\/services\/wikiMaintenanceService\.[jt]s$/i,
  /^server\/services\/githubRepoWatcherService\.[jt]s$/i,
  /^server\/models\/index\.[jt]s$/i,
  /^server\/routes\/agentChatRoutes\.[jt]s$/i,
  /^note-taker-ui\/src\/api\/wiki\.[jt]sx?$/i,
  /^note-taker-ui\/src\/components\/wiki\/WikiRepoCreateComposer\.[jt]sx?$/i,
  /^note-taker-ui\/src\/components\/wiki\/WikiPageReadView\.[jt]sx?$/i,
  /^server\/services\/wikiScheduledMaintenanceWorker\.[jt]s$/i,
  /^server\/(?:config\/aiClient|ai\/hfTextClient)\.[jt]s$/i,
  /^packages\/wiki-mcp\/(?:README[^/]*|package\.json)$/i
];

const selectRepoFallbackSources = (candidates = [], limit = 48) => {
  const repoCandidates = (Array.isArray(candidates) ? candidates : []).filter(isGitHubRepoCandidate);
  const selected = repoCandidates.slice(0, 40);
  REPO_FALLBACK_PRIORITY_PATHS.forEach((pattern) => {
    const source = repoCandidates.find(candidate => pattern.test(extractRepoPath(candidate)));
    if (source && !selected.some(candidate => candidate.index === source.index)) selected.push(source);
  });
  return selected.slice(0, limit);
};

const formatGitHubRepoEvidenceDigest = ({ page = {}, candidates = [] } = {}) => {
  if (!isGitHubRepoPage({ page, candidates })) return '';
  const repoSources = selectRepoFallbackSources(candidates);
  const byEvidence = (kind) => repoSources.filter(source => repoSourceEvidenceType(source) === kind);
  const configSources = byEvidence('config');
  const codeSources = byEvidence('code');
  const commitSources = byEvidence('recent_commits');
  const scripts = collectPackageScripts(configSources);
  const scriptLine = (script) => `${scriptCommandLabel(script)} -> ${script.command} [${script.sourceIndex}]`;
  const runScript = scripts.find(script => /^(start|dev|serve)$/i.test(script.name)) || scripts[0] || null;
  const testScripts = scripts
    .filter(script => /^(wiki:qa|wiki:.*harness|agent:harness(?::ci)?|test|lint)/i.test(script.name))
    .slice(0, 3);
  const buildScripts = scripts.filter(script => /build|deploy/i.test(script.name)).slice(0, 3);
  const keyPathLines = repoSources
    .map(source => ({ path: extractRepoPath(source), index: source.index, type: repoSourceEvidenceType(source) }))
    .filter(row => row.path)
    .slice(0, 14)
    .map(row => `${row.path} [${row.index}]`);
  const plannedLines = repoSources
    .filter(source => asString(source.metadata?.docClass).toLowerCase() === 'planned')
    .map(source => `${extractRepoPath(source) || source.title} [${source.index}]`)
    .slice(0, 5);
  const currentHead = asString(page.externalWatches?.githubRepo?.lastHeadSha).slice(0, 7);
  return [
    '',
    'Repository evidence digest. Use only these concrete facts unless another cited source block explicitly supports more:',
    `- Current head: ${currentHead || 'unknown from attached evidence'}.`,
    `- Run command: ${runScript ? scriptLine(runScript) : 'unknown; say no explicit run command was found.'}`,
    `- Test commands: ${testScripts.length ? testScripts.map(scriptLine).join('; ') : 'unknown; say no explicit test command was found.'}`,
    `- Build/deploy commands: ${buildScripts.length ? buildScripts.map(scriptLine).join('; ') : 'unknown; say no explicit build/deploy command was found.'}`,
    `- Key paths you may name: ${keyPathLines.length ? keyPathLines.join('; ') : 'none attached yet.'}`,
    `- Evidence mix: ${configSources.length} config/package source(s), ${codeSources.length} code source(s), ${commitSources.length} recent-commit source(s).`,
    plannedLines.length
      ? `- Planned/spec docs are context only, not shipped behavior: ${plannedLines.join('; ')}.`
      : '- No planned/spec docs are in the selected source set.',
    '- Unsupported unless cited verbatim: fully tested, comprehensive test suite, CI passing, published to npm, provenance-aware, React-Webpack, local-storage persistence.'
  ].join('\n');
};

const repoFallbackParagraph = ({ text, sourceIndexes = [], support = 'supported' } = {}) => ({
  text,
  citationIndexes: sourceIndexes.filter(Boolean).slice(0, 8),
  support
});

const fallbackGitHubRepoMaintenance = ({ page, candidates, manualNotes = '' }) => {
  const safeManualNotes = GITHUB_REPO_SCAFFOLD_PATTERNS.some(pattern => pattern.test(manualNotes))
    ? ''
    : manualNotes;
  const repoSources = selectRepoFallbackSources(candidates);
  const byEvidence = (kind) => repoSources.filter(source => repoSourceEvidenceType(source) === kind);
  const configSources = byEvidence('config');
  const codeSources = byEvidence('code');
  const documentSources = byEvidence('document');
  const currentDocumentSources = documentSources.filter(source => (
    asString(source.metadata?.docClass).toLowerCase() !== 'planned'
  ));
  const inventorySources = byEvidence('inventory');
  const policySources = byEvidence('policy');
  const commitSources = byEvidence('recent_commits');
  const readmeSource = repoSources.find(source => asString(source.metadata?.docClass).toLowerCase() === 'readme') || repoSources[0] || null;
  const packageSource = configSources.find(source => /\bpackage\.json$/i.test(extractRepoPath(source))) || configSources[0] || null;
  const scripts = collectPackageScripts(configSources);
  const runScript = scripts.find(script => /^(start|dev|serve)$/i.test(script.name)) || scripts[0] || null;
  const testScripts = scripts
    .filter(script => /^(wiki:qa|wiki:.*harness|agent:harness(?::ci)?|test|lint)/i.test(script.name))
    .slice(0, 3);
  const buildScripts = scripts.filter(script => /build|deploy/i.test(script.name)).slice(0, 3);
  const keyPaths = repoSources
    .map(source => extractRepoPath(source))
    .filter(Boolean)
    .slice(0, 14);
  const title = truncate(page.title, 120) || 'Repository wiki';
  const sourceIndexesUsed = Array.from(new Set([
    readmeSource?.index,
    packageSource?.index,
    ...documentSources.slice(0, 24).map(source => source.index),
    ...configSources.slice(0, 3).map(source => source.index),
    ...inventorySources.slice(0, 1).map(source => source.index),
    ...codeSources.slice(0, 12).map(source => source.index),
    ...commitSources.slice(0, 1).map(source => source.index),
    ...policySources.slice(0, 4).map(source => source.index)
  ].filter(Boolean))).slice(0, 48);
  const runCommand = runScript ? `npm run ${runScript.name}` : 'the repository evidence does not expose a run command yet';
  const testCommand = testScripts.length
    ? testScripts.map(scriptCommandLabel).join('; ')
    : 'no explicit test command was found in the selected package evidence';
  const buildCommand = buildScripts.length
    ? buildScripts.map(scriptCommandLabel).join('; ')
    : 'no explicit build command was found in the selected package evidence';
  const uiStartScript = scripts.find(script => /^start$/i.test(script.name) && /note-taker-ui\/package\.json/i.test(script.sourcePath || ''));
  const uiStartCommand = uiStartScript ? scriptCommandLabel(uiStartScript) : '';
  const rootWikiQaCommand = packageSnippetHasScript(configSources, 'wiki:qa') ? 'npm run wiki:qa' : '';
  const primaryProofCommand = rootWikiQaCommand || testScripts.map(scriptCommandLabel).find(command => /^npm run wiki:/i.test(command)) || testScripts.map(scriptCommandLabel)[0] || '';
  const apiPath = repoSourceForPath(repoSources, /^server\/server\.[jt]s$/i);
  const wikiRoutesPath = repoSourceForPath(repoSources, /^server\/routes\/wikiRoutes\.[jt]s$/i);
  const maintenancePath = repoSourceForPath(repoSources, /^server\/services\/wikiMaintenanceService\.[jt]s$/i);
  const watcherPath = repoSourceForPath(repoSources, /^server\/services\/githubRepoWatcherService\.[jt]s$/i);
  const modelsPath = repoSourceForPath(repoSources, /^server\/models\/index\.[jt]s$/i);
  const chatRoutesPath = repoSourceForPath(repoSources, /^server\/routes\/agentChatRoutes\.[jt]s$/i);
  const wikiClientApiPath = repoSourceForPath(repoSources, /^note-taker-ui\/src\/api\/wiki\.[jt]sx?$/i);
  const uiPackagePath = repoSourceForPath(repoSources, /^note-taker-ui\/package\.json$/i);
  const envExamplePath = repoSourceForPath(repoSources, /^\.env\.example$/i);
  const uiAppPath = repoSourceForPath(repoSources, /^note-taker-ui\/src\/App\.[jt]sx?$/i);
  const mcpPackagePath = repoSourceForPath(repoSources, /^packages\/wiki-mcp\/(?:README[^/]*|package\.json)$/i);
  const aiClientPath = repoSourceForPath(repoSources, /^server\/(?:config\/aiClient|ai\/hfTextClient)\.[jt]s$/i);
  const scheduledWorkerPath = repoSourceForPath(repoSources, /^server\/services\/wikiScheduledMaintenanceWorker\.[jt]s$/i);
  const coreArchitecturePaths = new Set([
    'server/server.js',
    'server/routes/wikiRoutes.js',
    'server/services/wikiMaintenanceService.js',
    'server/services/githubRepoWatcherService.js',
    'server/models/index.js',
    'server/routes/agentChatRoutes.js',
    'note-taker-ui/src/api/wiki.js',
    'note-taker-ui/src/App.js',
    aiClientPath ? extractRepoPath(aiClientPath) : '',
    scheduledWorkerPath ? extractRepoPath(scheduledWorkerPath) : '',
    mcpPackagePath ? extractRepoPath(mcpPackagePath) : ''
  ].filter(Boolean));
  const additionalCodeSources = codeSources
    .filter(source => !coreArchitecturePaths.has(extractRepoPath(source)))
    .slice(0, 4);
  const apiDescription = apiPath ? 'server/server.js boots the Express API process.' : 'The API bootstrap file was not attached.';
  const wikiRoutesDescription = wikiRoutesPath ? 'server/routes/wikiRoutes.js owns the wiki HTTP surface, including GitHub repo page creation and maintenance routes.' : 'The wiki route file was not attached.';
  const maintenanceDescription = maintenancePath ? 'server/services/wikiMaintenanceService.js owns drafting, fallback generation, quality gates, citations, and article persistence.' : 'The wiki maintenance service was not attached.';
  const watcherDescription = watcherPath ? 'server/services/githubRepoWatcherService.js attaches repository evidence from GitHub and maintains the repo watch state.' : 'The GitHub repo watcher service was not attached.';
  const modelsDescription = modelsPath ? 'server/models/index.js defines the Mongo models and wiki source/reference shapes used by the page.' : 'The model definitions were not attached.';
  const chatDescription = chatRoutesPath ? 'server/routes/agentChatRoutes.js is the adjacent agent-chat route surface; inspect it before changing ask/retrieval behavior.' : 'The agent chat route surface was not attached.';
  const wikiClientDescription = wikiClientApiPath ? 'note-taker-ui/src/api/wiki.js is the frontend API client for wiki calls.' : 'The frontend wiki API client was not attached.';
  const uiAppDescription = uiAppPath ? 'note-taker-ui/src/App.js owns the top-level React routes and authenticated product shell.' : '';
  const mcpDescription = mcpPackagePath ? 'packages/wiki-mcp exposes the wiki tool surface used by connected agents such as OpenClaw.' : '';
  const aiDescription = aiClientPath ? `${extractRepoPath(aiClientPath)} owns text-model provider selection and upstream routing.` : '';
  const workerDescription = scheduledWorkerPath ? 'server/services/wikiScheduledMaintenanceWorker.js runs background wiki maintenance outside the request path.' : '';
  const commandSourceIndexes = Array.from(new Set([
    runScript?.sourceIndex,
    ...testScripts.map(script => script.sourceIndex),
    ...buildScripts.map(script => script.sourceIndex)
  ].filter(Boolean)));
  const runCommandDetail = runScript
    ? `${scriptCommandLabel(runScript)} - ${runScript.command}`
    : 'No explicit run command was found in the selected package evidence.';
  const uiCommandDetail = uiStartScript
    ? `${scriptCommandLabel(uiStartScript)} - ${uiStartScript.command}`
    : 'UI start command was not attached; inspect the UI package before inventing one.';
  const proofCommandDetail = testScripts[0]
    ? `${scriptCommandLabel(testScripts[0])} - ${testScripts[0].command}`
    : 'No explicit wiki/test command was found in the selected package evidence.';
  const buildCommandDetail = buildScripts[0]
    ? `${scriptCommandLabel(buildScripts[0])} - ${buildScripts[0].command}`
    : 'No explicit frontend build command was found in the selected package evidence.';
  const repoEvidenceCorpus = [
    page.title,
    page.createdFrom?.text,
    page.createdFrom?.label,
    ...repoSources.flatMap(source => [source.title, source.text, source.snippet, source.metadata?.path])
  ].filter(Boolean).join('\n');
  const isNoeisRepo = /\b(?:Noeis|Note Taker|note-taker-3|Think-first|Library|Morning Paper)\b/i.test(repoEvidenceCorpus);
  const deployDescription = isNoeisRepo
    ? 'Deploy split: the user-facing React app ships to Vercel at noeis.io while the API runs on Render as note-taker-3-unrg; treat both as separate deploys and verify each before declaring a production fix live.'
    : 'Deployment targets were not fully attached; do not infer production health from package scripts alone.';
  const productOrientationText = isNoeisRepo
    ? 'This repository powers Noeis, a concept-centered knowledge workspace where saved reading moves through Library, Think, and Wiki into maintained, source-grounded pages. The same repository contains the React product, Express API, persistence layer, background maintenance workers, integration clients, and connected-agent tooling.'
    : 'This repository should be read as the implementation of a user-facing product or service, not just as a package tree. Start from README/package evidence to understand what user job the code serves before changing routes, services, models, or UI.';
  const uxMapText = isNoeisRepo
    ? 'The core experience is a maintained thinking loop: Library collects source material, Think turns source fragments into concepts/questions/notebook work, Wiki synthesizes mature material into durable cited pages, and sharing exposes safe public versions without private graph data.'
    : 'The user experience map should connect visible entrypoints to code ownership. If the evidence does not name a product surface, state that the UX map is unknown rather than inventing flows.';
  const repoFlowLabel = title
    .replace(/\s+(?:—|–|-)\s*repo wiki$/i, '')
    .replace(/\s+Repo Wiki$/i, '')
    .replace(/\s+Wiki$/i, '')
    .trim() || 'repository';
  const summaryParagraph = repoFallbackParagraph({
    text: isNoeisRepo
      ? `${repoFlowLabel} powers Noeis: a reading-to-thinking-to-wiki workspace where source material moves from Library into Think and then into maintained, cited Wiki pages that can be shared without exposing the private graph. A developer should start with the product loop, then use the package scripts and owning files below to change the right layer.`
      : `${repoFlowLabel} is a GitHub-backed project page grounded in repository evidence. Use it to understand what the repository does, how to run and prove changes, which paths own the main flows, and which risks remain unknown from the attached sources.`,
    sourceIndexes: [readmeSource?.index, packageSource?.index, commitSources[0]?.index]
  });
  const article = {
    summary: summaryParagraph,
    sections: [
      {
        heading: 'Product orientation',
        paragraphs: [repoFallbackParagraph({
          text: `${productOrientationText} For Noeis work, the product should be understood as one maintained-object system: Library keeps the user's source corpus, Think keeps the active concepts/questions/notebook work, Wiki turns durable ideas into cited pages, and safe public sharing exposes only article/reference material. That product loop matters because backend changes that look local to a route often surface as trust problems in the reader, public share page, command palette, or topbar receipt system.`,
          sourceIndexes: [
            readmeSource?.index,
            packageSource?.index,
            ...currentDocumentSources.slice(0, 4).map(source => source.index)
          ].filter(Boolean),
          support: readmeSource || packageSource ? 'supported' : 'partial'
        })],
        bullets: [
          isNoeisRepo ? {
            text: 'Core product loop: source intake and reading in Library, active synthesis in Think, maintained cited pages in Wiki, and safe public sharing when the user chooses to publish.',
            citationIndexes: [readmeSource?.index].filter(Boolean)
          } : {
            text: 'First developer job: identify the product or service from README/package evidence before changing implementation details.',
            citationIndexes: [readmeSource?.index, packageSource?.index].filter(Boolean)
          }
        ].filter(Boolean)
      },
      {
        heading: 'User experience map',
        paragraphs: [repoFallbackParagraph({
          text: `${uxMapText} A developer should be able to follow a feature from the first visible control to the persisted page state and back to the rendered article. In this repo, the important reader-facing contract is not merely that a route returns 200; it is that the user sees a maintained page, understands whether the source monitor is armed, knows whether the agent is still rebuilding, and can share a privacy-safe public version without leaking backlinks, highlights, notes, or agent work.`,
          sourceIndexes: [
            readmeSource?.index,
            wikiClientApiPath?.index,
            wikiRoutesPath?.index,
            ...currentDocumentSources.slice(4, 8).map(source => source.index)
          ].filter(Boolean),
          support: isNoeisRepo ? 'supported' : 'partial'
        })],
        bullets: [
          {
            text: `Create repo wiki: user pastes a GitHub URL, the UI calls the wiki API client, the backend creates or updates a maintained page, attaches repository evidence, and opens the wiki reader with the GitHub watch armed.`,
            citationIndexes: [wikiClientApiPath?.index, wikiRoutesPath?.index, watcherPath?.index].filter(Boolean)
          },
          {
            text: 'Read maintained page: the reader should show article content, citations, share privacy state, watch status, and quality state without requiring the user to inspect raw sources first.',
            citationIndexes: [wikiRoutesPath?.index, maintenancePath?.index].filter(Boolean)
          },
          {
            text: 'Public sharing must expose the article and references only; backlinks, highlights, private source notes, and agent work stay private.',
            citationIndexes: [wikiRoutesPath?.index, modelsPath?.index].filter(Boolean)
          },
          {
            text: 'Live update feedback must be visible: repo creation, watch refresh, maintenance, and quality rebuild should tell the user what is happening instead of leaving a static thin page that looks finished.',
            citationIndexes: [wikiRoutesPath?.index, maintenancePath?.index, wikiClientApiPath?.index].filter(Boolean)
          }
        ]
      },
      {
        heading: 'Developer quickstart',
        paragraphs: [repoFallbackParagraph({
          text: `Start from package evidence and keep root commands distinct from nested UI commands. A useful first pass is: run the API, run the UI only when UI work is involved, prove wiki behavior, then build the frontend before shipping UI changes. Do not collapse root and nested package scripts into a single generic "npm run start" instruction without naming where it runs; a contributor needs the working directory and the proof command, not just the script name.`,
          sourceIndexes: commandSourceIndexes.length ? commandSourceIndexes : [packageSource?.index],
          support: commandSourceIndexes.length ? 'supported' : 'partial'
        })],
        bullets: [
          packageSource ? {
            text: 'Install API dependencies from the repository root with npm install.',
            citationIndexes: [packageSource.index].filter(Boolean)
          } : null,
          uiPackagePath ? {
            text: 'Install UI dependencies with cd note-taker-ui && npm install.',
            citationIndexes: [uiPackagePath.index].filter(Boolean)
          } : null,
          envExamplePath ? {
            text: 'Environment: copy .env.example locally, then configure JWT_SECRET and MONGODB_URI; text generation uses OPENROUTER_API_KEY when present, while HF_TOKEN remains the embedding credential.',
            citationIndexes: [envExamplePath.index].filter(Boolean)
          } : null,
          {
            text: `Run: ${runCommandDetail}`,
            citationIndexes: [runScript?.sourceIndex].filter(Boolean)
          },
          uiStartScript ? {
            text: `UI: ${uiCommandDetail}`,
            citationIndexes: [uiStartScript?.sourceIndex].filter(Boolean)
          } : null,
          {
            text: `Test: ${proofCommandDetail}`,
            citationIndexes: [testScripts[0]?.sourceIndex].filter(Boolean)
          },
          buildScripts[0] ? {
            text: `Build: ${buildCommandDetail}`,
            citationIndexes: [buildScripts[0]?.sourceIndex].filter(Boolean)
          } : null,
          {
            text: `Key paths: ${keyPaths.slice(0, 6).join(', ') || 'No exact key paths were attached yet.'}`,
            citationIndexes: keyPaths
              .slice(0, 6)
              .map(path => repoSourceForPath(repoSources, new RegExp(`^${escapeRegex(path)}$`, 'i'))?.index)
              .filter(Boolean)
          }
        ].filter(Boolean)
      },
      {
        heading: 'Critical flows',
        paragraphs: [repoFallbackParagraph({
          text: 'Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries. The goal is to make the first correct file obvious, not to summarize the whole tree. A repo-wiki failure can begin in WikiRepoCreateComposer, move through createRepoWikiFromGitHub, POST /api/wiki/pages/from-github, githubRepoWatcherService evidence capture, wikiMaintenanceService quality checks, sourceRefs persistence, and finally WikiPageReadView rendering; debugging only the visible article misses most of that path.',
          sourceIndexes: [wikiClientApiPath?.index, wikiRoutesPath?.index, maintenancePath?.index, watcherPath?.index, modelsPath?.index].filter(Boolean),
          support: [wikiClientApiPath, wikiRoutesPath, maintenancePath].filter(Boolean).length >= 2 ? 'supported' : 'partial'
        })],
        bullets: [
          {
            text: 'Repo creation: WikiRepoCreateComposer -> note-taker-ui/src/api/wiki.js -> POST /api/wiki/pages/from-github -> server/routes/wikiRoutes.js -> server/services/githubRepoWatcherService.js -> server/services/wikiMaintenanceService.js -> WikiPage persistence -> wiki reader.',
            citationIndexes: [wikiClientApiPath?.index, wikiRoutesPath?.index, watcherPath?.index, maintenancePath?.index, modelsPath?.index].filter(Boolean)
          },
          {
            text: 'Repo refresh: externalWatches.githubRepo marks the watch, githubRepoWatcherService refreshes read-only GitHub evidence, source events attach to the page, and wikiMaintenanceService rebuilds the maintained article from current sources.',
            citationIndexes: [watcherPath?.index, maintenancePath?.index, modelsPath?.index].filter(Boolean)
          },
          {
            text: 'Ask and retrieval: inspect agentChatRoutes before changing page-aware answers, then confirm whether the behavior should route through page-only retrieval or graph-aware wiki asking.',
            citationIndexes: [chatRoutesPath?.index, maintenancePath?.index].filter(Boolean)
          },
          {
            text: 'Share flow: wiki routes and serializers must create a safe public article/reference surface without exposing private graph, library, highlights, or agent state.',
            citationIndexes: [wikiRoutesPath?.index, modelsPath?.index].filter(Boolean)
          },
          {
            text: 'System status flow: long-running builds should publish background work, success receipts, or recoverable failures through the shared status surface so the user can tell the page is changing live.',
            citationIndexes: [wikiClientApiPath?.index, wikiRoutesPath?.index].filter(Boolean)
          }
        ]
      },
      {
        heading: 'Architecture and ownership',
        paragraphs: [
          repoFallbackParagraph({
            text: [uiAppPath ? uiAppDescription : '', wikiClientApiPath ? wikiClientDescription : '', mcpPackagePath ? mcpDescription : ''].filter(Boolean).join(' '),
            sourceIndexes: [uiAppPath?.index, wikiClientApiPath?.index, mcpPackagePath?.index].filter(Boolean),
            support: [uiAppPath, wikiClientApiPath, mcpPackagePath].some(Boolean) ? 'supported' : 'unsupported'
          }),
          repoFallbackParagraph({
            text: [apiPath ? apiDescription : '', wikiRoutesPath ? wikiRoutesDescription : '', modelsPath ? modelsDescription : ''].filter(Boolean).join(' '),
            sourceIndexes: [apiPath?.index, wikiRoutesPath?.index, modelsPath?.index].filter(Boolean),
            support: [apiPath, wikiRoutesPath, modelsPath].some(Boolean) ? 'supported' : 'unsupported'
          }),
          repoFallbackParagraph({
            text: [maintenancePath ? maintenanceDescription : '', watcherPath ? watcherDescription : '', chatRoutesPath ? chatDescription : '', aiClientPath ? aiDescription : '', scheduledWorkerPath ? workerDescription : ''].filter(Boolean).join(' '),
            sourceIndexes: [maintenancePath?.index, watcherPath?.index, chatRoutesPath?.index, aiClientPath?.index, scheduledWorkerPath?.index].filter(Boolean),
            support: [maintenancePath, watcherPath, chatRoutesPath, aiClientPath, scheduledWorkerPath].some(Boolean) ? 'supported' : 'unsupported'
          }),
          additionalCodeSources.length ? repoFallbackParagraph({
            text: `Additional implementation entrypoints worth opening for adjacent changes: ${additionalCodeSources.map(source => extractRepoPath(source)).join(', ')}.`,
            sourceIndexes: additionalCodeSources.map(source => source.index),
            support: 'supported'
          }) : null,
          repoFallbackParagraph({
            text: deployDescription,
            sourceIndexes: [packageSource?.index, uiPackagePath?.index].filter(Boolean),
            support: isNoeisRepo ? 'partial' : 'unsupported'
          })
        ].filter(paragraph => paragraph?.text),
        bullets: [
          bulletForSourcePath({ sources: repoSources, path: 'server/server.js', label: 'API entrypoint', reason: 'boots the Express server.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/routes/wikiRoutes.js', label: 'Wiki API', reason: 'page create/read/build/share/watch routes live here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/services/wikiMaintenanceService.js', label: 'Wiki generator', reason: 'drafting, fallback, quality checks, and citation assembly live here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/services/githubRepoWatcherService.js', label: 'GitHub watcher', reason: 'repo evidence selection and watch refresh live here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/models/index.js', label: 'Data model', reason: 'wiki page/source/ref schemas live here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/routes/agentChatRoutes.js', label: 'Agent chat', reason: 'adjacent agent ask/retrieval routes live here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'note-taker-ui/src/api/wiki.js', label: 'Wiki client API', reason: 'frontend calls into the wiki API from here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'note-taker-ui/src/App.js', label: 'React application shell', reason: 'top-level routes and authenticated product surfaces start here.' }),
          aiClientPath ? {
            text: `${extractRepoPath(aiClientPath)}: AI provider selection, model routing, and upstream configuration start here.`,
            citationIndexes: [aiClientPath.index].filter(Boolean)
          } : null,
          scheduledWorkerPath ? {
            text: `${extractRepoPath(scheduledWorkerPath)}: scheduled wiki maintenance and background refresh orchestration live here.`,
            citationIndexes: [scheduledWorkerPath.index].filter(Boolean)
          } : null,
          mcpPackagePath ? {
            text: `${extractRepoPath(mcpPackagePath)}: connected-agent wiki tools and runtime transport are documented here.`,
            citationIndexes: [mcpPackagePath.index].filter(Boolean)
          } : null,
          bulletForSourcePath({ sources: repoSources, path: 'AGENTS.md', label: 'Workspace runbook', reason: 'local/deploy conventions and user preferences live here.' }),
        ].filter(bullet => bullet?.citationIndexes?.length)
      },
      {
        heading: 'Common change paths',
        paragraphs: [repoFallbackParagraph({
          text: 'Use this as the routing table before editing. Pick the row that matches the intended change, open that file first, then add the closest focused test before running the broader wiki proof command. If the symptom is "the page exists but reads generic," start in generation and evidence selection; if the symptom is "the page cannot open," start in route/id/navigation behavior; if the symptom is "the page looks stale," start in watch refresh and client receipt state.',
          sourceIndexes: sourceIndexesUsed.slice(0, 8)
        })],
        bullets: [
          bulletForSourcePath({ sources: repoSources, path: 'server/services/wikiMaintenanceService.js', label: 'Repo-wiki output is wrong', reason: 'change generation prompts, deterministic fallback sections, quality gates, citations, and claim extraction here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/services/githubRepoWatcherService.js', label: 'Repo evidence is stale or thin', reason: 'change GitHub path selection, fetch behavior, source-event payloads, and watch refresh behavior here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/routes/wikiRoutes.js', label: 'Create/update flow fails', reason: 'change repo page creation, source attachment, share/adopt, watch, and draft endpoints here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/models/index.js', label: 'Data shape has to change', reason: 'change wiki page, source reference, watch, and claim model schemas here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/routes/agentChatRoutes.js', label: 'Agent answers are wrong', reason: 'inspect this route before changing chat, retrieval, and answer behavior.' }),
          bulletForSourcePath({ sources: repoSources, path: 'note-taker-ui/src/api/wiki.js', label: 'Frontend call is wrong', reason: 'change wiki API helpers and response handling here.' }),
          bulletForSourcePath({ sources: repoSources, path: 'note-taker-ui/package.json', label: 'Frontend proof changes', reason: 'React scripts and browser test commands are declared here.' })
        ].filter(bullet => bullet.citationIndexes.length)
      },
      {
        heading: 'Quality bar and invariants',
        paragraphs: [repoFallbackParagraph({
          text: 'A repo page is not done because references exist. It must orient the developer to the product, expose concrete commands and paths, cite repository evidence, name unsupported unknowns, and preserve privacy boundaries. The quality bar is deliberately higher than a normal generated wiki page because this page is itself a proof surface: it should show that Noeis can maintain a useful object that changes under the user.',
          sourceIndexes: [maintenancePath?.index, wikiRoutesPath?.index, packageSource?.index].filter(Boolean)
        })],
        bullets: [
          {
            text: 'Do not optimize build speed by accepting thin output; repo pages should fail quality when they lack product orientation, concrete commands, exact file paths, or developer flow traces.',
            citationIndexes: [maintenancePath?.index].filter(Boolean)
          },
          {
            text: 'Do not expose private backlinks, highlights, source notes, user IDs, or agent state in public share surfaces.',
            citationIndexes: [wikiRoutesPath?.index, modelsPath?.index].filter(Boolean)
          },
          {
            text: 'Do not claim CI, deploy health, issue status, npm publication, or full test coverage unless workflow/status evidence explicitly supports it.',
            citationIndexes: configSources.slice(0, 3).map(source => source.index)
          },
          {
            text: 'Watchers should attach read-only evidence to maintained pages; they should not create a parallel repo product outside the wiki/source-monitor loop.',
            citationIndexes: [watcherPath?.index, wikiRoutesPath?.index].filter(Boolean)
          }
        ].filter(bullet => bullet.citationIndexes.length)
      },
      {
        heading: 'Failure modes',
        paragraphs: [repoFallbackParagraph({
          text: 'When this page feels wrong, debug the layer that owns the symptom instead of rebuilding blindly. Most repo-wiki failures are evidence-selection, quality-gate, route, stream, or render-state problems. The known bad smell is a short, polished page that says "developer quickstart" but only offers generic login/capture/settings prose; that should be treated as a failed build, not as acceptable output.',
          sourceIndexes: [wikiRoutesPath?.index, maintenancePath?.index, watcherPath?.index, wikiClientApiPath?.index].filter(Boolean)
        })],
        bullets: [
          bulletForSourcePath({ sources: repoSources, path: 'server/services/wikiMaintenanceService.js', label: 'Thin or generic article', reason: 'inspect prompt rules, deterministic fallback, sourceIndexesUsed, quality failures, and claim extraction.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/services/githubRepoWatcherService.js', label: 'Stale or missing GitHub evidence', reason: 'inspect token/rate-limit behavior, selected paths, source events, and lastHeadSha.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/routes/wikiRoutes.js', label: 'Page cannot open or duplicate builds race', reason: 'inspect create response, stream route, single-flight guards, and page id navigation.' }),
          bulletForSourcePath({ sources: repoSources, path: 'note-taker-ui/src/api/wiki.js', label: 'Frontend opens stale or wrong page', reason: 'inspect createRepoWikiFromGitHub response handling and route construction.' }),
          {
            text: 'If Render logs show Mongoose VersionError during maintenance, suspect overlapping draft/maintenance streams on the same page before blaming the model provider.',
            citationIndexes: [wikiRoutesPath?.index, maintenancePath?.index, ...sourceIndexesUsed.slice(0, 2)].filter(Boolean)
          }
        ].filter(bullet => bullet.citationIndexes.length)
      },
      {
        heading: 'Deploy and unknowns',
        paragraphs: [repoFallbackParagraph({
          text: commitSources.length
            ? `Recent commit evidence is attached, but this page still should not infer roadmap, issue-tracker state, CI status, package publication, or production health unless those exact sources are present. Treat ${buildCommand} as build evidence only when attached. ${deployDescription}`
            : `No recent-commit evidence was attached, so current active work remains unknown until the watch refreshes. Treat ${buildCommand} as build evidence only when attached. ${deployDescription}`,
          sourceIndexes: [
            ...commitSources.slice(0, 1).map(source => source.index),
            ...buildScripts.map(script => script.sourceIndex),
            ...configSources.slice(0, 3).map(source => source.index)
          ].filter(Boolean),
          support: 'partial'
        })],
        bullets: [
          {
            text: 'Unknown unless cited: CI pass/fail, production deploy status, open issue status, npm publication, and complete test coverage.',
            citationIndexes: sourceIndexesUsed.slice(0, 4)
          },
          isNoeisRepo ? {
            text: 'Production verification should check both surfaces: Vercel for the frontend bundle and Render for the API behavior.',
            citationIndexes: [packageSource?.index].filter(Boolean)
          } : null
        ].filter(Boolean)
      }
    ],
    preservedUserContent: safeManualNotes
      ? [{ text: safeManualNotes, placement: 'Notes', reason: 'Existing page text looked user-authored.' }]
      : []
  };
  const sectionByHeading = new Map(article.sections.map(section => [section.heading, section]));
  const renameSection = (from, heading) => {
    const section = sectionByHeading.get(from);
    return section ? { ...section, heading } : null;
  };
  const policySection = policySources.length ? {
    heading: 'Repository conventions',
    paragraphs: [repoFallbackParagraph({
      text: 'Agent and editor instruction files are retained as repository policy evidence. They can explain local contribution and automation conventions, but they are not evidence for product behavior, architecture, production health, or user-facing claims.',
      sourceIndexes: policySources.map(source => source.index),
      support: 'supported'
    })],
    bullets: policySources.slice(0, 6).map(source => ({
      text: `${extractRepoPath(source) || source.title}: internal repository convention evidence; do not treat it as product truth.`,
      citationIndexes: [source.index],
      support: 'supported'
    }))
  } : null;
  const evidenceShapedSections = isNoeisRepo
    ? [
        renameSection('Product orientation', 'What Noeis is'),
        renameSection('User experience map', 'User experience map'),
        renameSection('Developer quickstart', 'Run and prove changes'),
        renameSection('Architecture and ownership', 'System map'),
        renameSection('Critical flows', 'Critical product flows'),
        renameSection('Common change paths', 'Where to make changes'),
        renameSection('Quality bar and invariants', 'Engineering invariants'),
        policySection,
        renameSection('Failure modes', 'Failure modes'),
        renameSection('Deploy and unknowns', 'Deploy and unknowns')
      ]
    : [
        renameSection('Product orientation', 'What this repository is'),
        renameSection('Developer quickstart', 'Run and prove changes'),
        renameSection('Architecture and ownership', 'Architecture evidence'),
        renameSection('Common change paths', 'Where to make changes'),
        policySection,
        renameSection('Deploy and unknowns', 'Risks and unknowns')
      ];
  const shapedArticle = {
    ...article,
    sections: evidenceShapedSections.filter(Boolean)
  };
  const citeFallbackItem = (item) => {
    if (!item || typeof item !== 'object') return item;
    const citationIndexes = Array.isArray(item.citationIndexes)
      ? item.citationIndexes.filter(Boolean)
      : [];
    if (citationIndexes.length) {
      return item.support ? item : { ...item, support: 'supported' };
    }
    return {
      ...item,
      citationIndexes: [],
      support: item.support || 'unsupported'
    };
  };
  const supportedArticle = {
    ...shapedArticle,
    summary: citeFallbackItem(shapedArticle.summary),
    sections: shapedArticle.sections.map(section => ({
      ...section,
      paragraphs: (section.paragraphs || []).map(citeFallbackItem),
      bullets: (section.bullets || []).map(citeFallbackItem)
    }))
  };
  return {
    title,
    article: alignArticleToPageStructure({
      pageType: 'repo',
      article: supportedArticle
    }),
    maintenance: {
      summary: `Built a developer dossier from ${repoSources.length} GitHub repository evidence source${repoSources.length === 1 ? '' : 's'}.`,
      changelog: repoSources.slice(0, 32).map(source => ({
        type: 'attached_source',
        target: source.title,
        summary: `Used ${extractRepoPath(source) || source.title} as repository evidence.`,
        sourceIndexes: [source.index]
      })),
      health: normalizeHealth({
        newItems: commitSources.slice(0, 1).map(source => ({
          text: `${source.title} should be reviewed as the current active-work signal.`,
          sourceTitle: source.title
        })),
        unsupportedClaims: repoSources.length ? [] : [{ text: 'No GitHub repository evidence is attached yet.' }],
        missingCitations: [],
        staleSections: [],
        contradictions: [],
        relatedPages: []
      })
    },
    sourceIndexesUsed
  };
};

const fallbackMaintenance = ({ page, candidates, manualNotes = '' }) => {
  if (isGitHubRepoPage({ page, candidates })) {
    return fallbackGitHubRepoMaintenance({ page, candidates, manualNotes });
  }
  const top = candidates.slice(0, 6);
  const sourceTitles = top.map(source => source.title).filter(Boolean);
  const sourceTheme = sourceTitles.length
    ? sourceTitles.slice(0, 3).join(', ')
    : 'the available library material';
  const newItems = top
    .filter(source => source.updatedAt || source.createdAt)
    .slice(0, 4)
    .map(source => ({ text: `${source.title} adds fresh evidence that should be weighed against the current claims.`, sourceTitle: source.title }));
  const leadSources = top.slice(0, 3);
  const topic = truncate(page.title, 120) || 'This topic';
  const article = {
    summary: {
      text: leadSources.length
        ? `${topic} is best treated as a provisional synthesis, not a bucket of saved notes. The recurring pattern across ${sourceTheme} is that the useful claim is narrower than the topic label: the page should preserve the mechanism that keeps reappearing, then separate evidence-backed claims from unresolved judgment calls.`
        : `${topic} needs stronger source material before it can become a durable wiki article.`,
      citationIndexes: leadSources.map(source => source.index)
    },
    sections: [
      {
        heading: 'Core Idea',
        paragraphs: [
          {
            text: leadSources.length
              ? `${topic} should not be read as a complete answer. The defensible core is that several saved sources point toward the same working pattern, but the page still needs sharper evidence before turning that pattern into a settled principle.`
              : `There is not enough source material yet to make a strong claim about ${topic}.`,
            citationIndexes: leadSources.map(source => source.index)
          }
        ],
        bullets: []
      },
      {
        heading: 'Evidence',
        paragraphs: top.length
          ? [{
              text: `The current evidence base is broad enough to suggest direction but not yet deep enough to settle the page. The most useful sources should be compared for agreement, contradiction, and specificity rather than copied into the article as summaries.`,
              citationIndexes: top.slice(0, 4).map(source => source.index)
            }]
          : [{ text: `No matching library evidence was found during this maintenance pass.`, citationIndexes: [] }],
        bullets: []
      },
      {
        heading: 'Tensions',
        paragraphs: [
          {
            text: top.length
              ? `The main risk is false coherence: related sources can make ${topic} feel more settled than it is. A better page should keep the strongest shared mechanism while explicitly marking where evidence is thin, stale, or merely adjacent.`
              : `The main tension is that the page title exists before the evidence base does.`,
            citationIndexes: top.slice(0, 2).map(source => source.index),
            support: top.length ? 'partial' : 'unsupported'
          }
        ],
        bullets: []
      },
      {
        heading: 'Open Questions',
        paragraphs: [
          {
            text: newItems.length
              ? `The page needs a rebuild that turns the freshest material into claims: what does ${topic} explain, what would falsify it, and which source should carry the most weight?`
              : `The next question is which source would make ${topic} specific enough to maintain as a wiki page.`,
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
  const structuredArticle = alignArticleToPageStructure({
    pageType: page.pageType || 'topic',
    article
  });
  return {
    title: topic,
    article: structuredArticle,
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

const normalizeSectionHeading = (value = '') => asString(value).replace(/\s+/g, ' ').trim().toLowerCase();

const mergeGitHubRepoFallbackSections = ({ article = {}, fallbackArticle = {} } = {}) => {
  const fallbackByHeading = new Map(
    (Array.isArray(fallbackArticle.sections) ? fallbackArticle.sections : [])
      .map(section => [normalizeSectionHeading(section?.heading || section?.title), section])
  );
  return {
    ...article,
    sections: (Array.isArray(article.sections) ? article.sections : []).map((section) => {
      const text = JSON.stringify(section || {});
      if (!/\bstill needs source-backed development\b/i.test(text)) return section;
      const fallbackSection = fallbackByHeading.get(normalizeSectionHeading(section?.heading || section?.title));
      return fallbackSection || section;
    })
  };
};

const addMandatoryGitHubRepoSourceIndexes = ({ page = {}, candidates = [], used }) => {
  if (!used || !isGitHubRepoPage({ page, candidates })) return;
  const repoCandidates = (Array.isArray(candidates) ? candidates : []).filter(isGitHubRepoCandidate);
  const byEvidence = (kind) => repoCandidates.filter(source => repoSourceEvidenceType(source) === kind);
  const configSources = byEvidence('config');
  const codeSources = byEvidence('code');
  const documentSources = byEvidence('document');
  const inventorySources = byEvidence('inventory');
  const policySources = byEvidence('policy');
  const commitSources = byEvidence('recent_commits');
  const packageSource = configSources.find(source => /\bpackage\.json$/i.test(extractRepoPath(source))) || configSources[0] || null;
  [
    packageSource,
    configSources.find(source => source.index !== packageSource?.index),
    inventorySources[0],
    ...documentSources.slice(0, 24),
    ...configSources.slice(0, 6),
    ...codeSources.slice(0, 18),
    commitSources[0],
    policySources[0]
  ].filter(Boolean).forEach(source => used.add(source.index));
};

const mandatoryGitHubRepoSourceIndexes = ({ page = {}, candidates = [] } = {}) => {
  const used = new Set();
  addMandatoryGitHubRepoSourceIndexes({ page, candidates, used });
  return Array.from(used).filter(index => candidates.some(source => source.index === index)).slice(0, 48);
};

const dedupeGitHubRepoSourceRefs = (sourceRefs = []) => {
  const seen = new Set();
  return (Array.isArray(sourceRefs) ? sourceRefs : []).filter((source) => {
    const path = asString(source?.metadata?.path);
    const key = path
      ? `path:${path.toLowerCase()}`
      : [
        'fallback',
        asString(source?.type),
        asString(source?.url).toLowerCase(),
        asString(source?.title).toLowerCase()
      ].join(':');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const repoSourceIdentityKey = (source = {}) => {
  const path = asString(source?.metadata?.path).toLowerCase();
  if (path) return `path:${path}`;
  const objectId = asString(source?.objectId || source?._id || source?.id);
  if (objectId) return `object:${asString(source?.type)}:${objectId}`;
  const url = asString(source?.url).toLowerCase();
  if (url) return `url:${url}`;
  return `title:${asString(source?.type)}:${asString(source?.title).toLowerCase()}`;
};

const relabelSourceRefs = (sourceRefs = []) => (
  (Array.isArray(sourceRefs) ? sourceRefs : []).map((source, index) => ({
    ...source,
    citationLabel: `[${index + 1}]`
  }))
);

const remapRepoArticleCitationIndexes = ({ article = {}, candidates = [], sourceRefs = [] } = {}) => {
  const sourcePositionByKey = new Map(
    (Array.isArray(sourceRefs) ? sourceRefs : []).map((source, index) => [repoSourceIdentityKey(source), index + 1])
  );
  const positionByCandidateIndex = new Map(
    (Array.isArray(candidates) ? candidates : [])
      .map(candidate => [candidate.index, sourcePositionByKey.get(repoSourceIdentityKey(candidate))])
      .filter(([, position]) => Number.isFinite(position))
  );
  const remapIndexes = (indexes = []) => Array.from(new Set(
    normalizeCitationIndexes(indexes)
      .map(index => positionByCandidateIndex.get(index))
      .filter(Number.isFinite)
  )).slice(0, 8);
  const remapBlock = (block = {}) => ({
    ...block,
    citationIndexes: remapIndexes(block.citationIndexes || block.sourceIndexes),
    contradictionIndexes: remapIndexes(
      block.contradictionIndexes
      || block.contradictedByIndexes
      || block.contradictingSourceIndexes
      || block.contradictionSourceIndexes
    )
  });
  return {
    ...article,
    summary: article?.summary ? remapBlock(article.summary) : article?.summary,
    sections: (Array.isArray(article?.sections) ? article.sections : []).map(section => ({
      ...section,
      paragraphs: (Array.isArray(section?.paragraphs) ? section.paragraphs : []).map(remapBlock),
      bullets: (Array.isArray(section?.bullets) ? section.bullets : []).map(remapBlock)
    }))
  };
};

const mergeMandatoryGitHubRepoSourceRefs = ({ page = {}, candidates = [], sourceRefs = [] } = {}) => {
  if (!isGitHubRepoPage({ page, candidates })) return sourceRefs;
  const attachedRefs = (Array.isArray(page.sourceRefs) ? page.sourceRefs : [])
    .map(source => (source && typeof source.toObject === 'function' ? source.toObject({ virtuals: false }) : source))
    .filter(source => source && (asString(source.title) || asString(source.snippet) || asString(source.url)));
  const initialRefs = dedupeGitHubRepoSourceRefs(dedupeSourceRefs([...attachedRefs, ...(Array.isArray(sourceRefs) ? sourceRefs : [])]));
  const existingKeys = new Set(initialRefs.map(source => [
    source.type || '',
    source.objectId ? String(source.objectId) : '',
    source.url || '',
    source.title || '',
    source.metadata?.path || ''
  ].join(':')));
  const additions = mandatoryGitHubRepoSourceIndexes({ page, candidates })
    .map(index => candidates.find(source => source.index === index))
    .filter(Boolean)
    .map(sourceRefFromCandidate)
    .filter((source) => {
      const key = [
        source.type || '',
        source.objectId ? String(source.objectId) : '',
        source.url || '',
        source.title || '',
        source.metadata?.path || ''
      ].join(':');
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
  return relabelSourceRefs(
    dedupeGitHubRepoSourceRefs(dedupeSourceRefs([...initialRefs, ...additions])).slice(0, 80)
  );
};

const normalizeSourceIndexesUsed = ({ page = {}, rawIndexes = [], article = {}, changelog = [], candidates = [] }) => {
  const used = new Set();
  normalizeCitationIndexes(rawIndexes).forEach(index => used.add(index));
  const addBlock = (block = {}) => {
    normalizeCitationIndexes(block.citationIndexes || block.sourceIndexes)
      .forEach(index => used.add(index));
    normalizeCitationIndexes(
      block.contradictionIndexes ||
      block.contradictedByIndexes ||
      block.contradictingSourceIndexes ||
      block.contradictionSourceIndexes
    ).forEach(index => used.add(index));
  };
  addBlock(article.summary);
  (article.sections || []).forEach((section) => {
    (section.paragraphs || []).forEach(addBlock);
    (section.bullets || []).forEach(addBlock);
  });
  (changelog || []).forEach((entry) => normalizeCitationIndexes(entry.sourceIndexes).forEach(index => used.add(index)));
  addMandatoryGitHubRepoSourceIndexes({ page, candidates, used });
  const maxSources = isGitHubRepoPage({ page, candidates }) ? 48 : 16;
  return Array.from(used).filter(index => candidates.some(source => source.index === index)).slice(0, maxSources);
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
  const repoPage = isGitHubRepoPage({ page, candidates });
  const normalizedArticle = normalizeArticle({
    rawArticle: raw.article || {
      summary: raw.summary,
      sections: raw.sections,
      preservedUserContent: raw.preservedUserContent
    },
    page,
    manualNotes,
    candidates
  });
  let article = repoPage
    ? {
        ...normalizedArticle,
        sections: (Array.isArray(normalizedArticle.sections) ? normalizedArticle.sections : []).slice(0, 10)
      }
    : alignArticleToPageStructure({
        pageType: page.pageType || 'topic',
        article: normalizedArticle
      });
  if (repoPage) {
    article = mergeGitHubRepoFallbackSections({
      article,
      fallbackArticle: fallback.article
    });
  }
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
      page,
      article,
      changelog,
      candidates
    })
  };
};

const countWords = (value = '') => asString(value).split(/\s+/).filter(Boolean).length;
const escapeRegex = (value = '') => asString(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const evaluateWikiArticleQuality = ({ page, body, claims = [], sourceRefs = [], now = new Date(), skipDurableCitationCheck = false } = {}) => {
  const plainText = toPlainText(body || page?.body || '');
  const titlePattern = escapeRegex(page?.title || '');
  const words = countWords(titlePattern ? plainText.replace(new RegExp(`^${titlePattern}\\s*`, 'i'), '') : plainText);
  const sourceCount = Array.isArray(sourceRefs) ? sourceRefs.length : 0;
  const claimList = Array.isArray(claims) ? claims : [];
  const supportedLike = claimList.filter(claim => ['supported', 'partial', 'conflicted'].includes(normalizeClaimSupport(claim.support))).length;
  const unsupported = claimList.filter(claim => normalizeClaimSupport(claim.support) === 'unsupported').length;
  const partial = claimList.filter(claim => normalizeClaimSupport(claim.support) === 'partial').length;
  const cited = claimList.filter(claim => (
    (claim.citationIds || []).length ||
    (claim.sourceRefIds || []).length ||
    (claim.citationIndexes || []).length
  )).length;
  const docClaims = collectClaimsFromDoc(body || page?.body || '');
  const usedCitationIndexes = Array.from(new Set(
    docClaims.flatMap(claim => [
      ...(claim.citationIndexes || []),
      ...(claim.contradictionIndexes || [])
    ])
  )).filter(index => index > 0 && index <= sourceCount);
  const danglingCitationIndexes = Array.from(new Set(
    docClaims.flatMap(claim => [
      ...(claim.citationIndexes || []),
      ...(claim.contradictionIndexes || [])
    ])
  )).filter(index => index <= 0 || index > sourceCount);
  const usedSubstantiveSourceCount = usedCitationIndexes.filter(index => (
    repoSourceEvidenceType(sourceRefs[index - 1] || {}) !== 'policy'
  )).length;
  let repoClaimsPerUsedSource = null;
  const failures = [];

  SCAFFOLD_PATTERNS.forEach(({ label, pattern }) => {
    if (pattern.test(plainText)) failures.push(`Article contains ${label}.`);
  });
  const isRepoQualityPage = isGitHubRepoPage({ page, candidates: sourceRefs });
  const minWords = isRepoQualityPage
    ? GITHUB_REPO_MIN_WORDS
    : (sourceCount >= 5 ? QUALITY_MIN_WORDS_WITH_MANY_SOURCES : QUALITY_MIN_WORDS);
  if (sourceCount >= 3 && words < minWords) {
    failures.push(`Article is too thin for ${sourceCount} sources: ${words} words, expected at least ${minWords}.`);
  }
  if (isRepoQualityPage && unsupported > 0) {
    failures.push(`GitHub repo article has unsupported claim ledger entries: ${unsupported}.`);
  }
  if (isRepoQualityPage) {
    const substantiveSourceCount = repoSubstantiveSources(sourceRefs).length || sourceCount || 1;
    const claimsPerSource = claimList.length / Math.max(1, usedSubstantiveSourceCount);
    repoClaimsPerUsedSource = Number(claimsPerSource.toFixed(2));
    const minimumUsedSources = sourceCount >= 25
      ? Math.min(14, Math.max(10, Math.ceil(substantiveSourceCount * 0.25)))
      : Math.min(substantiveSourceCount, Math.max(3, Math.ceil(substantiveSourceCount * 0.35)));
    if (danglingCitationIndexes.length) {
      failures.push(`GitHub repo article has dangling citation indexes: ${danglingCitationIndexes.slice(0, 8).join(', ')}.`);
    }
    if (substantiveSourceCount >= 8 && usedSubstantiveSourceCount < minimumUsedSources) {
      failures.push(`GitHub repo article underuses attached evidence: ${usedSubstantiveSourceCount}/${substantiveSourceCount} substantive sources cited, expected at least ${minimumUsedSources}.`);
    }
    if (claimList.length >= 12 && claimsPerSource > GITHUB_REPO_MAX_CLAIMS_PER_SOURCE) {
      failures.push(`GitHub repo article overstates thin evidence: ${claimsPerSource.toFixed(1)} claims per used substantive source, expected <= ${GITHUB_REPO_MAX_CLAIMS_PER_SOURCE}.`);
    }
    const inventoryIndexes = sourceRefs
      .map((source, index) => repoSourceEvidenceType(source) === 'inventory' ? index + 1 : null)
      .filter(Boolean);
    const pathCitationMismatches = [];
    docClaims.forEach((claim) => {
      const claimIndexes = new Set(claim.citationIndexes || []);
      sourceRefs.forEach((source, index) => {
        const path = extractRepoPath(source);
        if (!path || !asString(claim.text).includes(path)) return;
        const citedSourceMentionsPath = Array.from(claimIndexes).some((citationIndex) => {
          const citedSource = sourceRefs[citationIndex - 1] || {};
          return [citedSource.snippet, citedSource.quote, citedSource.text]
            .some(value => asString(value).includes(path));
        });
        if (!claimIndexes.has(index + 1)
          && !inventoryIndexes.some(inventoryIndex => claimIndexes.has(inventoryIndex))
          && !citedSourceMentionsPath) {
          pathCitationMismatches.push(path);
        }
      });
    });
    if (pathCitationMismatches.length) {
      failures.push(`GitHub repo article cites the wrong evidence for exact paths: ${Array.from(new Set(pathCitationMismatches)).slice(0, 6).join(', ')}.`);
    }
  }
  if (claimList.length >= 4 && supportedLike < Math.ceil(claimList.length * 0.45)) {
    failures.push(`Too few claims are evidence-backed: ${supportedLike}/${claimList.length}.`);
  }
  if (claimList.length >= 6 && unsupported + partial > Math.ceil(claimList.length * 0.75)) {
    failures.push(`Too many claims are weak or unsupported: ${unsupported + partial}/${claimList.length}.`);
  }
  if (!skipDurableCitationCheck && claimList.length >= 4 && cited < Math.ceil(claimList.length * 0.4)) {
    failures.push(`Too few claims are tied to durable citations: ${cited}/${claimList.length}.`);
  }
  if (/(\n|\s)[-•]\s*Summary:/i.test(plainText)) {
    failures.push('Article uses source-summary bullets instead of synthesis.');
  }
  findUnsupportedGitHubRepoClaims({ page, text: plainText, sourceRefs })
    .forEach(failure => failures.push(failure));
  findGitHubRepoDeveloperDossierFailures({ page, text: plainText, sourceRefs })
    .forEach(failure => failures.push(failure));

  const score = Math.max(0, Number((1 - Math.min(1, failures.length / 6)).toFixed(2)));
  return {
    ok: failures.length === 0,
    status: failures.length ? 'needs_rebuild' : 'pass',
    score,
    failures,
    checkedAt: now,
    metrics: {
      words,
      sourceCount,
      claimCount: claimList.length,
      supportedLike,
      unsupported,
      partial,
      cited,
      usedSourceCount: usedCitationIndexes.length,
      usedSubstantiveSourceCount,
      claimsPerUsedSource: repoClaimsPerUsedSource,
      danglingCitationCount: danglingCitationIndexes.length,
      durableCitationCheckSkipped: Boolean(skipDurableCitationCheck)
    }
  };
};

const inferMaintainedPageType = ({ page, candidates = [] } = {}) => {
  if (isGitHubRepoPage({ page, candidates })) return 'repo';
  const current = asString(page?.pageType || 'topic').toLowerCase();
  if (current && current !== 'topic') return current;
  const createdType = asString(page?.createdFrom?.type).toLowerCase();
  const title = asString(page?.title).toLowerCase();
  if (['article', 'highlight', 'notebook', 'external', 'paste', 'sources'].includes(createdType)) return 'source';
  if (/\b(overview|strategy|strategies|landscape|system|systems|concepts|ideas)\b/i.test(title)) return 'overview';
  if (candidates.length >= 5) return 'overview';
  return 'concept';
};

const materializeMaintenanceResult = async ({ page, normalized, candidates, previousClaims, now, userId, models }) => {
  const sourceRefs = normalized.sourceIndexesUsed
    .map(index => candidates.find(source => source.index === index))
    .filter(Boolean)
    .map(sourceRefFromCandidate);
  const mergedSourceRefs = mergeMandatoryGitHubRepoSourceRefs({
    page,
    candidates,
    sourceRefs: dedupeSourceRefs(sourceRefs)
  });
  const article = isGitHubRepoPage({ page, candidates })
    ? remapRepoArticleCitationIndexes({
        article: normalized.article,
        candidates,
        sourceRefs: mergedSourceRefs
      })
    : normalized.article;
  const body = docFromArticle({
    title: normalized.title || page.title,
    article
  });
  const plainText = toPlainText(body);
  const citations = mergedSourceRefs.map(source => ({
    sourceRefId: source._id || null,
    sourceType: source.type || '',
    sourceObjectId: source.objectId || null,
    sourceTitle: source.title || '',
    quote: source.snippet || '',
    url: source.url || '',
    confidence: source.addedBy === 'ai' ? 0.72 : 0.9,
    createdAt: now
  }));
  const claims = deriveClaimsFromDoc({
    body,
    title: normalized.title || page.title,
    citations,
    sourceRefs: mergedSourceRefs,
    previousClaims,
    now
  });
  const linkedBody = await applyKnownWikiLinks({
    page,
    body,
    plainText,
    userId,
    models
  });
  return {
    title: normalized.title || page.title,
    body: linkedBody,
    plainText,
    sourceRefs: mergedSourceRefs,
    citations,
    claims,
    quality: evaluateWikiArticleQuality({
      page: { ...page, title: normalized.title || page.title },
      body: linkedBody,
      claims,
      sourceRefs: mergedSourceRefs,
      now,
      skipDurableCitationCheck: true
    })
  };
};

const applyKnownWikiLinks = async ({ page, body, plainText, userId, models = {} } = {}) => {
  const WikiPage = modelForPage({ page, models });
  if (!WikiPage) return body;
  const pageId = asString(page?._id || page?.id);
  const result = await findAutolinkSuggestions({
    targetPage: {
      _id: pageId,
      id: page?.id,
      title: page?.title,
      plainText
    },
    userId,
    models: { WikiPage }
  });
  return (result.suggestions || [])
    .filter(suggestion => asString(suggestion.pageId) && asString(suggestion.pageId) !== pageId)
    .reduce((doc, suggestion) => (
      applyWikiAutolinkToDoc({
        doc,
        targetPage: {
          _id: suggestion.pageId,
          id: suggestion.pageId,
          title: suggestion.title,
          matchText: suggestion.matchedAlias
        }
      }).doc
    ), body);
};

const maintainWikiPage = async ({
  page,
  userId,
  models = {},
  chat = chatComplete,
  streamChat = chatCompleteStream,
  isConfigured = isTextGenerationConfigured,
  now = new Date(),
  trigger = 'manual',
  wikiSchemaContent = '',
  maintenanceProfile = 'standard',
  sourceLimit = null,
  sourceTextLimit = null,
  skipQualityRebuild = false,
  streamDraft = false,
  onProgress = null
}) => {
  const normalizedProfile = normalizeMaintenanceProfile(maintenanceProfile);
  const fastProfile = normalizedProfile === 'fast';
  const effectiveSourceLimit = Number.isFinite(Number(sourceLimit)) && Number(sourceLimit) > 0
    ? Number(sourceLimit)
    : (fastProfile ? FAST_SOURCE_LIMIT : DEFAULT_SOURCE_LIMIT);
  const effectiveSourceTextLimit = Number.isFinite(Number(sourceTextLimit)) && Number(sourceTextLimit) > 0
    ? Number(sourceTextLimit)
    : (fastProfile ? FAST_PROMPT_SOURCE_TEXT_LIMIT : DEFAULT_PROMPT_SOURCE_TEXT_LIMIT);
  // The draft model (gpt-oss-class) spends most of its wall-clock generating an
  // internal reasoning trace. On the fast/onboarding path that reasoning is the
  // dominant latency (~40s+) and buys little for a source-grounded rewrite, so
  // drop to low effort; the scheduled maintenance loop deepens the page later.
  const draftReasoningEffort = fastProfile ? 'low' : 'medium';
  const emitProgress = async (payload = {}) => {
    if (typeof onProgress !== 'function') return;
    await onProgress({
      at: new Date().toISOString(),
      ...payload
    });
  };
  const allSources = await collectLibrarySources({ userId, models, fastProfile });
  const candidates = selectMaintenanceCandidates({ page, sources: allSources, limit: effectiveSourceLimit });
  const repoMaintenance = isGitHubRepoPage({ page, candidates });
  const draftTemperature = repoMaintenance ? 0.08 : 0.2;
  const rebuildTemperature = repoMaintenance ? 0.12 : 0.28;
  const knownWikiPages = await collectKnownWikiPages({
    page,
    userId,
    models,
    limit: fastProfile ? 16 : 40
  });
  const manualNotes = extractManualNotes(page);
  let modelInfo = { model: 'local-maintainer', provider: '' };
  let result = null;
  let rebuiltAutomatically = false;
  let draftDeltaBuffer = '';
  let lastDraftDeltaAt = 0;
  const flushDraftDelta = ({ force = false } = {}) => {
    if (typeof onProgress !== 'function' || !draftDeltaBuffer.trim()) return;
    const nowMs = Date.now();
    if (!force && nowMs - lastDraftDeltaAt < 500 && draftDeltaBuffer.length < 160) return;
    const delta = truncate(draftDeltaBuffer.replace(/\s+/g, ' ').trim(), 320);
    draftDeltaBuffer = '';
    lastDraftDeltaAt = nowMs;
    Promise.resolve(onProgress({
      at: new Date().toISOString(),
      stage: 'model_streaming',
      summary: 'The first draft is writing itself...',
      delta
    })).catch(() => {});
  };
  const handleDraftDelta = (delta = '') => {
    const cleaned = sanitizeDraftStreamDelta(delta);
    if (!cleaned) return;
    draftDeltaBuffer = `${draftDeltaBuffer} ${cleaned}`.trim();
    flushDraftDelta();
  };

  await emitProgress({
    stage: 'sources_selected',
    summary: `${candidates.length} candidate source${candidates.length === 1 ? '' : 's'} selected for maintenance.`,
    sourceCount: candidates.length
  });

  if (candidates.length && isConfigured()) {
    try {
      await emitProgress({
        stage: 'model_drafting',
        summary: 'Drafting a source-backed wiki revision.'
      });
      const draftRequest = {
        route: 'artifact_draft',
        maxTokens: 2600,
        temperature: draftTemperature,
        reasoningEffort: draftReasoningEffort,
        responseFormat: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a Wiki maintenance engine. Rewrite pages directly from supplied sources. Return JSON only.${formatWikiSchemaPromptBlock(wikiSchemaContent)}`
          },
          {
            role: 'user',
            content: buildPrompt({
              page,
              candidates,
              manualNotes,
              wikiSchemaContent,
              knownWikiPages,
              sourceTextLimit: effectiveSourceTextLimit
            })
          }
        ]
      };
      const shouldTryStream = streamDraft && typeof streamChat === 'function';
      let completion = null;
      if (shouldTryStream) {
        try {
          completion = await streamChat({
            ...draftRequest,
            onDelta: handleDraftDelta
          });
        } catch (_streamError) {
          draftDeltaBuffer = '';
          await emitProgress({
            stage: 'model_stream_fallback',
            summary: 'Live draft stream was unavailable; finishing the draft with the standard model call.'
          });
        }
      }
      if (!completion) {
        completion = await chat(draftRequest);
      }
      flushDraftDelta({ force: true });
      modelInfo = {
        model: completion.model || modelInfo.model,
        provider: completion.provider || ''
      };
      result = extractJson(completion.text);
      await emitProgress({
        stage: 'model_drafted',
        summary: 'Draft response received from the maintenance model.',
        model: modelInfo.model,
        provider: modelInfo.provider
      });
    } catch (error) {
      modelInfo = { model: 'local-maintainer', provider: '' };
      result = null;
      await emitProgress({
        stage: 'model_fallback',
        summary: 'Maintenance model failed; falling back to deterministic synthesis.'
      });
    }
  }

  await emitProgress({
    stage: 'materializing',
    summary: 'Materializing the page body, citations, and claim ledger.'
  });
  const normalized = normalizeModelResult({ raw: result, page, candidates, manualNotes });
  const previousClaims = page.claims?.toObject ? page.claims.toObject() : page.claims || [];
  let finalNormalized = normalized;
  let materialized = await materializeMaintenanceResult({
    page,
    normalized: finalNormalized,
    candidates,
    previousClaims,
    now,
    userId,
    models
  });

  const shouldRebuildInline = shouldInlineQualityRebuild({
    quality: materialized.quality,
    plainText: materialized.plainText,
    fastProfile,
    skipQualityRebuild
  });

  if (!materialized.quality.ok && candidates.length && isConfigured() && shouldRebuildInline) {
    try {
      await emitProgress({
        stage: 'quality_rebuild',
        summary: 'Initial draft missed quality gates; rebuilding once with stricter instructions.',
        failures: materialized.quality.failures || []
      });
      const completion = await chat({
        route: 'artifact_draft',
        maxTokens: 3600,
        temperature: rebuildTemperature,
        reasoningEffort: 'medium',
        responseFormat: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a strict, opinionated wiki editor. Your job is to rebuild weak wiki pages into real synthesis. Return JSON only.${formatWikiSchemaPromptBlock(wikiSchemaContent)}`
          },
          {
            role: 'user',
            content: buildRebuildPrompt({
              page,
              candidates,
              manualNotes,
              wikiSchemaContent,
              knownWikiPages,
              failures: materialized.quality.failures,
              sourceTextLimit: effectiveSourceTextLimit
            })
          }
        ]
      });
      const retryRaw = extractJson(completion.text);
      if (retryRaw) {
        modelInfo = {
          model: completion.model || modelInfo.model,
          provider: completion.provider || modelInfo.provider || ''
        };
        const retryNormalized = normalizeModelResult({ raw: retryRaw, page, candidates, manualNotes });
        let retryMaterialized = await materializeMaintenanceResult({
          page,
          normalized: retryNormalized,
          candidates,
          previousClaims,
          now,
          userId,
          models
        });
        let finalRetryNormalized = retryNormalized;
        let retryFallbackApplied = false;
        if (!retryMaterialized.quality?.ok && isGitHubRepoPage({ page, candidates })) {
          finalRetryNormalized = fallbackMaintenance({ page, candidates, manualNotes });
          retryFallbackApplied = true;
          retryMaterialized = await materializeMaintenanceResult({
            page,
            normalized: finalRetryNormalized,
            candidates,
            previousClaims,
            now,
            userId,
            models
          });
        }
        finalNormalized = finalRetryNormalized;
        materialized = {
          ...retryMaterialized,
          quality: {
            ...retryMaterialized.quality,
            fallbackApplied: retryFallbackApplied,
            rebuiltAutomatically: true,
            previousFailures: materialized.quality.failures
          }
        };
        rebuiltAutomatically = true;
        await emitProgress({
          stage: 'quality_rebuilt',
          summary: 'Automatic rebuild completed.',
          model: modelInfo.model,
          provider: modelInfo.provider
        });
      }
    } catch (_error) {
      materialized.quality = {
        ...materialized.quality,
        rebuildAttempted: true,
        rebuildError: 'Automatic rebuild failed.'
      };
      await emitProgress({
        stage: 'quality_rebuild_failed',
        summary: 'Automatic rebuild failed; preserving the best available draft.'
      });
    }
  } else if (!materialized.quality.ok && candidates.length && isConfigured() && !shouldRebuildInline) {
    materialized.quality = {
      ...materialized.quality,
      rebuildDeferred: true
    };
    await emitProgress({
      stage: 'quality_rebuild_deferred',
      summary: 'First draft is readable; deeper quality rebuild deferred to background maintenance.',
      failures: materialized.quality.failures || []
    });
  }

  if (!materialized.quality.ok && candidates.length && isGitHubRepoPage({ page, candidates })) {
    const repoFallbackNormalized = fallbackMaintenance({ page, candidates, manualNotes });
    const repoFallbackMaterialized = await materializeMaintenanceResult({
      page,
      normalized: repoFallbackNormalized,
      candidates,
      previousClaims,
      now,
      userId,
      models
    });
    finalNormalized = repoFallbackNormalized;
    materialized = {
      ...repoFallbackMaterialized,
      quality: {
        ...repoFallbackMaterialized.quality,
        fallbackApplied: true,
        previousFailures: materialized.quality.failures || materialized.quality.previousFailures || []
      }
    };
    rebuiltAutomatically = rebuiltAutomatically || Boolean(materialized.quality.previousFailures?.length);
    await emitProgress({
      stage: 'repo_dossier_fallback',
      summary: 'Repo draft failed developer-dossier checks; using deterministic repository evidence.',
      failures: materialized.quality.previousFailures || []
    });
  }

  page.title = materialized.title || page.title;
  page.pageType = inferMaintainedPageType({ page, candidates });
  page.sourceScope = 'entire_library';
  page.body = materialized.body;
  page.plainText = materialized.plainText;
  page.sourceRefs = materialized.sourceRefs;
  let persistedSourceRefs = page.sourceRefs?.toObject
    ? page.sourceRefs.toObject()
    : page.sourceRefs || [];
  page.citations = persistedSourceRefs.map(source => ({
    sourceRefId: source._id || null,
    sourceType: source.type || '',
    sourceObjectId: source.objectId || null,
    sourceTitle: source.title || '',
    quote: source.snippet || '',
    url: source.url || '',
    confidence: source.addedBy === 'ai' ? 0.72 : 0.9,
    createdAt: now
  }));
  page.claims = deriveClaimsFromDoc({
    body: page.body,
    title: page.title,
    citations: page.citations,
    sourceRefs: persistedSourceRefs,
    previousClaims,
    now
  });
  let persistedQuality = evaluateWikiArticleQuality({
    page,
    body: page.body,
    claims: page.claims,
    sourceRefs: persistedSourceRefs,
    now,
    skipDurableCitationCheck: isGitHubRepoPage({ page, candidates })
  });
  if (!persistedQuality.ok && candidates.length && isGitHubRepoPage({ page, candidates })) {
    const repoFallbackNormalized = fallbackMaintenance({ page, candidates, manualNotes });
    const repoFallbackMaterialized = await materializeMaintenanceResult({
      page,
      normalized: repoFallbackNormalized,
      candidates,
      previousClaims,
      now,
      userId,
      models
    });
    finalNormalized = repoFallbackNormalized;
    materialized = {
      ...repoFallbackMaterialized,
      quality: {
        ...repoFallbackMaterialized.quality,
        fallbackApplied: true,
        previousFailures: persistedQuality.failures || []
      }
    };
    rebuiltAutomatically = true;
    page.title = materialized.title || page.title;
    page.pageType = inferMaintainedPageType({ page, candidates });
    page.sourceScope = 'entire_library';
    page.body = materialized.body;
    page.plainText = materialized.plainText;
    page.sourceRefs = materialized.sourceRefs;
    const fallbackSourceRefs = page.sourceRefs?.toObject
      ? page.sourceRefs.toObject()
      : page.sourceRefs || [];
    persistedSourceRefs = fallbackSourceRefs;
    page.citations = fallbackSourceRefs.map(source => ({
      sourceRefId: source._id || null,
      sourceType: source.type || '',
      sourceObjectId: source.objectId || null,
      sourceTitle: source.title || '',
      quote: source.snippet || '',
      url: source.url || '',
      confidence: source.addedBy === 'ai' ? 0.72 : 0.9,
      createdAt: now
    }));
    page.claims = deriveClaimsFromDoc({
      body: page.body,
      title: page.title,
      citations: page.citations,
      sourceRefs: fallbackSourceRefs,
      previousClaims,
      now
    });
    persistedQuality = evaluateWikiArticleQuality({
      page,
      body: page.body,
      claims: page.claims,
      sourceRefs: fallbackSourceRefs,
      now,
      skipDurableCitationCheck: true
    });
    await emitProgress({
      stage: 'repo_dossier_fallback',
      summary: 'Repo draft failed final developer-dossier checks; using deterministic repository evidence.',
      failures: materialized.quality.previousFailures || []
    });
  }
  const sectionMaintenance = buildSectionMaintenancePlan({
    claims: page.claims,
    health: finalNormalized.maintenance.health,
    changeLog: finalNormalized.maintenance.changelog,
    now
  });
  page.freshness = {
    ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
    status: !persistedQuality.ok
      ? 'needs_review'
      : Array.isArray(finalNormalized.maintenance.health?.contradictions) && finalNormalized.maintenance.health.contradictions.length
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
    maintenanceProfile: normalizedProfile,
    maintenanceSummary: finalNormalized.maintenance.summary,
    sectionMaintenance,
    quality: {
      ...materialized.quality,
      ...persistedQuality,
      previousFailures: materialized.quality.previousFailures,
      rebuiltAutomatically
    },
    health: finalNormalized.maintenance.health,
    changeLog: normalizeOperations(finalNormalized.maintenance.changelog),
    suggestions: normalizeOperations(finalNormalized.maintenance.changelog)
  };

  await emitProgress({
    stage: 'ready',
    summary: page.aiState.maintenanceSummary || 'Wiki maintenance draft is ready.',
    quality: page.aiState.quality || {},
    sourceCount: persistedSourceRefs.length
  });

  return page;
};

module.exports = {
  maintainWikiPage,
  evaluateWikiArticleQuality,
  isGitHubRepoPage,
  deriveClaimsFromDoc,
  buildSectionMaintenancePlan,
  collectLibrarySources,
  selectCandidateSources,
  fallbackMaintenance,
  __testables: {
    extractJson,
    docFromArticle,
    collectClaimsFromDoc,
    resolveClaimCitationIds,
    attachClaimCitationIds,
    deriveClaimsFromDoc,
    buildClaimLedger,
    buildSectionMaintenancePlan,
    claimConfidence,
    normalizeClaimIdentity,
    normalizeSourceIndexesUsed,
    remapRepoArticleCitationIndexes,
    normalizeHealth,
    applyKnownWikiLinks,
    collectKnownWikiPages,
    fallbackMaintenance,
    formatKnownWikiPages,
    buildPrompt,
    buildRebuildPrompt,
    evaluateWikiArticleQuality,
    inferMaintainedPageType,
    isGitHubRepoPage,
    selectMaintenanceCandidates,
    findUnsupportedGitHubRepoClaims,
    findGitHubRepoDeveloperDossierFailures,
    cleanWikiText,
    toPlainText
  }
};
