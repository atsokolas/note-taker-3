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
  { label: 'library-highlight framing', pattern: /\bLibrary highlights?\b/i }
];
const GITHUB_REPO_DEVELOPER_SECTION_PATTERNS = [
  /\bRun locally\b/i,
  /\bArchitecture\b/i,
  /\bKey files\b/i,
  /\bTests? (?:and|&|\+)?\s*deploy\b|\bDeploy(?:ment)?\b/i
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
  if (page.externalWatches?.githubRepo) return true;
  if (/GitHub repo:|github\.com\/[^/\s]+\/[^/\s]+/i.test(createdFrom)) return true;
  return (Array.isArray(candidates) ? candidates : []).some(source => (
    source.provider === 'github-repo'
    || source.metadata?.source === 'github-repo'
    || /github-repo|repository documentation source|release notes/i.test([source.type, source.title, source.text].join(' '))
  ));
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
  const raw = [
    source.metadata?.evidenceType,
    source.metadata?.path,
    source.title,
    source.url,
    source.snippet,
    source.text
  ].filter(Boolean).join(' ');
  if (/\bpackage\.json\b|\.ya?ml\b|\.github\/workflows\//i.test(raw)) return 'config';
  if (/\b(server|src|routes|services|models|pages|utils|layout)\/[^ ]+\.(js|jsx|ts|tsx)\b/i.test(raw)) return 'code';
  if (/\brecent commits?\b|commit:|head commit/i.test(raw)) return 'recent_commits';
  return 'document';
};

const findGitHubRepoDeveloperDossierFailures = ({ page = {}, text = '', sourceRefs = [] } = {}) => {
  if (!isGitHubRepoPage({ page })) return [];
  const failures = [];
  const refs = Array.isArray(sourceRefs) ? sourceRefs : [];
  const evidenceTypes = new Set(refs.map(repoSourceEvidenceType));
  const codeOrConfigCount = refs.filter(source => ['code', 'config'].includes(repoSourceEvidenceType(source))).length;
  if (!GITHUB_REPO_DEVELOPER_SECTION_PATTERNS.every(pattern => pattern.test(text))) {
    failures.push('GitHub repo article is missing developer-dossier sections: Run locally, Architecture, Key files, and Tests/deploy.');
  }
  if (!/\bnpm\s+(?:start|run|install|test|build|wiki:qa)\b|\byarn\s+(?:start|test|build)\b|\bpnpm\s+(?:start|test|build)\b/i.test(text)) {
    failures.push('GitHub repo article does not expose concrete local run or test commands.');
  }
  if (codeOrConfigCount < 3) {
    failures.push(`GitHub repo article has too little code/config evidence: ${codeOrConfigCount}/3 required.`);
  }
  if (!evidenceTypes.has('recent_commits')) {
    failures.push('GitHub repo article is missing recent-commit evidence for current active work.');
  }
  if (/\b(?:April|May|June)\s+202[0-5]\b|\bQA sweeps?\b|\bOAuth spike\b/i.test(text) && !/\bHistorical notes?\b/i.test(text)) {
    failures.push('GitHub repo article foregrounds stale planning or QA history instead of developer-facing current state.');
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
- This page is about a public GitHub repository. Write it as a developer dossier for someone trying to understand, run, change, and maintain the repo today.
- Write only what the repository evidence actually supports.
- Use this exact section shape: Summary | Run locally | Architecture | Key files | Tests and deploy | Current active work | How to extend | Known risks.
- Include a "Developer quickstart" section or subsection with exactly these labels when evidence exists: Run, Test, Deploy, Key paths.
- Do not claim the repo is published to npm, continuously integrated, fully tested, provenance-aware, or accompanied by a wiki unless a cited repository source explicitly says that.
- Prefer concrete repo facts: purpose, app/package type, major directories, package scripts, API routes, service/model entrypoints, frontend entrypoints, deployment targets, recent commits, documentation files, release notes, and open implementation risks.
- Include exact local commands only when package/config evidence supports them. Include exact key file paths only when they are present in the repository evidence.
- Treat README, package files, docs, changelogs, and releases as repository evidence. Do not describe them as Library highlights.
- Treat source metadata docClass="planned" as roadmap/spec material. It can appear only under Known risks, Current active work, or explicitly labeled planned work; never present it as shipped repository behavior.
- If the repo evidence is thin, say which repository documents/files were found and what remains unknown.`;
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
  const structure = getWikiPageStructure(page.pageType || 'topic');
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
Required section shape, in this order: ${structure.sections.join(' | ')}
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

const sourceRefFromCandidate = (candidate) => ({
  type: candidate.type,
  objectId: candidate.objectId || null,
  parentObjectId: candidate.parentObjectId || null,
  title: truncate(candidate.title, 240),
  snippet: truncate(candidate.text, 1000),
  url: truncateRaw(candidate.url, 1000),
  citationLabel: `[${candidate.index}]`,
  addedBy: 'ai',
  provider: candidate.provider || '',
  metadata: candidate.metadata || {}
});

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
    if (repoCandidates.length) {
      const currentHead = asString(page.externalWatches?.githubRepo?.lastHeadSha);
      return repoCandidates
        .sort((a, b) => (
          githubRepoEvidenceRank(a, currentHead) - githubRepoEvidenceRank(b, currentHead)
          || asString(a.metadata?.path || a.title).localeCompare(asString(b.metadata?.path || b.title))
        ))
        .slice(0, Math.max(limit, Math.min(repoCandidates.length, 14)))
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

const extractPackageScripts = (source = {}) => {
  const text = asString(source.text || source.snippet);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    const looseScripts = [];
    const scriptsBlock = text.match(/"scripts"\s*:\s*\{([\s\S]*)/i);
    if (scriptsBlock) {
      const pairPattern = /"([^"]+)"\s*:\s*"([^"]+)"/g;
      let pair = pairPattern.exec(scriptsBlock[1]);
      while (pair && looseScripts.length < 8) {
        looseScripts.push({ name: pair[1], command: asString(pair[2]) });
        pair = pairPattern.exec(scriptsBlock[1]);
      }
    }
    return looseScripts.filter(script => script.name && script.command);
  }
  try {
    const parsed = JSON.parse(match[0]);
    return Object.entries(parsed.scripts || {})
      .map(([name, command]) => ({ name, command: asString(command) }))
      .filter(script => script.name && script.command)
      .slice(0, 8);
  } catch (_error) {
    const scriptsBlock = match[0].match(/"scripts"\s*:\s*\{([\s\S]*)/i);
    if (!scriptsBlock) return [];
    const scripts = [];
    const pairPattern = /"([^"]+)"\s*:\s*"([^"]+)"/g;
    let pair = pairPattern.exec(scriptsBlock[1]);
    while (pair && scripts.length < 8) {
      scripts.push({ name: pair[1], command: asString(pair[2]) });
      pair = pairPattern.exec(scriptsBlock[1]);
    }
    return scripts.filter(script => script.name && script.command);
  }
};

const repoFallbackParagraph = ({ text, sourceIndexes = [], support = 'supported' } = {}) => ({
  text,
  citationIndexes: sourceIndexes.filter(Boolean).slice(0, 6),
  support
});

const fallbackGitHubRepoMaintenance = ({ page, candidates, manualNotes = '' }) => {
  const repoSources = (Array.isArray(candidates) ? candidates : [])
    .filter(isGitHubRepoCandidate)
    .slice(0, 16);
  const byEvidence = (kind) => repoSources.filter(source => repoSourceEvidenceType(source) === kind);
  const configSources = byEvidence('config');
  const codeSources = byEvidence('code');
  const commitSources = byEvidence('recent_commits');
  const readmeSource = repoSources.find(source => asString(source.metadata?.docClass).toLowerCase() === 'readme') || repoSources[0] || null;
  const packageSource = configSources.find(source => /\bpackage\.json$/i.test(extractRepoPath(source))) || configSources[0] || null;
  const scripts = packageSource ? extractPackageScripts(packageSource) : [];
  const runScript = scripts.find(script => /^(start|dev|serve)$/i.test(script.name)) || scripts[0] || null;
  const testScript = scripts.find(script => /^test|wiki:qa|lint/i.test(script.name)) || null;
  const buildScript = scripts.find(script => /build/i.test(script.name)) || null;
  const keyPaths = repoSources
    .map(source => extractRepoPath(source))
    .filter(Boolean)
    .slice(0, 10);
  const title = truncate(page.title, 120) || 'Repository wiki';
  const sourceIndexesUsed = Array.from(new Set([
    readmeSource?.index,
    packageSource?.index,
    ...configSources.slice(0, 3).map(source => source.index),
    ...codeSources.slice(0, 5).map(source => source.index),
    ...commitSources.slice(0, 1).map(source => source.index)
  ].filter(Boolean))).slice(0, 14);
  const runCommand = runScript ? `npm run ${runScript.name}` : 'the repository evidence does not expose a run command yet';
  const testCommand = testScript ? `npm run ${testScript.name}` : 'no explicit test command was found in the selected package evidence';
  const buildCommand = buildScript ? `npm run ${buildScript.name}` : 'no explicit build command was found in the selected package evidence';
  const summaryParagraph = repoFallbackParagraph({
    text: `${title} is a GitHub-backed project page. The useful reading is developer-facing: start with the package/config evidence, then use the code entrypoints and recent commits to understand how to run, change, and maintain the repo today.`,
    sourceIndexes: [readmeSource?.index, packageSource?.index, commitSources[0]?.index]
  });
  const article = {
    summary: summaryParagraph,
    sections: [
      {
        heading: 'Summary',
        paragraphs: [summaryParagraph],
        bullets: []
      },
      {
        heading: 'Run locally',
        paragraphs: [repoFallbackParagraph({
          text: `Start from the package/config evidence. Run: ${runCommand}. Test: ${testCommand}. Deploy/build: ${buildCommand}. Treat missing commands as unknown rather than inferred.`,
          sourceIndexes: [packageSource?.index]
        })],
        bullets: scripts.slice(0, 6).map(script => ({
          text: `npm run ${script.name} — ${script.command}`,
          citationIndexes: [packageSource?.index].filter(Boolean)
        }))
      },
      {
        heading: 'Architecture',
        paragraphs: [repoFallbackParagraph({
          text: codeSources.length
            ? `The current code evidence points to these active implementation areas: ${codeSources.slice(0, 6).map(source => extractRepoPath(source) || source.title).join(', ')}.`
            : 'The selected repository evidence did not include enough code entrypoints to describe the architecture safely.',
          sourceIndexes: codeSources.slice(0, 6).map(source => source.index),
          support: codeSources.length ? 'supported' : 'partial'
        })],
        bullets: []
      },
      {
        heading: 'Key files',
        paragraphs: [repoFallbackParagraph({
          text: keyPaths.length
            ? `The most useful files to open first are ${keyPaths.join(', ')}.`
            : 'No key file paths were attached by the repository watch yet.',
          sourceIndexes: sourceIndexesUsed
        })],
        bullets: keyPaths.slice(0, 8).map((path) => {
          const source = repoSources.find(candidate => extractRepoPath(candidate) === path);
          return {
            text: path,
            citationIndexes: [source?.index].filter(Boolean)
          };
        })
      },
      {
        heading: 'Tests and deploy',
        paragraphs: [repoFallbackParagraph({
          text: `Use the explicit scripts from package/config evidence: ${testCommand}; ${buildCommand}. Do not assume CI or deployment health without workflow or deployment evidence.`,
          sourceIndexes: [packageSource?.index, ...configSources.slice(0, 2).map(source => source.index)]
        })],
        bullets: []
      },
      {
        heading: 'Current active work',
        paragraphs: [repoFallbackParagraph({
          text: commitSources.length
            ? `Recent commit evidence is attached and should be treated as the freshest signal for what changed under the repo wiki.`
            : 'No recent-commit evidence was attached, so current active work remains unknown until the watch refreshes.',
          sourceIndexes: commitSources.slice(0, 1).map(source => source.index),
          support: commitSources.length ? 'supported' : 'partial'
        })],
        bullets: []
      },
      {
        heading: 'Known risks',
        paragraphs: [repoFallbackParagraph({
          text: 'The main risk is letting stale planning, QA, or spike documents masquerade as shipped repo behavior. Keep planned docs quarantined as context unless current code/config or recent commits support the claim.',
          sourceIndexes: sourceIndexesUsed.slice(0, 4),
          support: 'partial'
        })],
        bullets: []
      },
      {
        heading: 'How to extend',
        paragraphs: [repoFallbackParagraph({
          text: 'Extend the page by refreshing the GitHub watch, attaching current code/config evidence, then asking the agent to rebuild this developer dossier from the selected repository sources.',
          sourceIndexes: sourceIndexesUsed.slice(0, 4)
        })],
        bullets: []
      }
    ],
    preservedUserContent: manualNotes
      ? [{ text: manualNotes, placement: 'Notes', reason: 'Existing page text looked user-authored.' }]
      : []
  };
  return {
    title,
    article: alignArticleToPageStructure({
      pageType: 'repo',
      article
    }),
    maintenance: {
      summary: `Built a developer dossier from ${repoSources.length} GitHub repository evidence source${repoSources.length === 1 ? '' : 's'}.`,
      changelog: repoSources.slice(0, 10).map(source => ({
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

const addMandatoryGitHubRepoSourceIndexes = ({ page = {}, candidates = [], used }) => {
  if (!used || !isGitHubRepoPage({ page, candidates })) return;
  const repoCandidates = (Array.isArray(candidates) ? candidates : []).filter(isGitHubRepoCandidate);
  const byEvidence = (kind) => repoCandidates.filter(source => repoSourceEvidenceType(source) === kind);
  const configSources = byEvidence('config');
  const codeSources = byEvidence('code');
  const commitSources = byEvidence('recent_commits');
  const packageSource = configSources.find(source => /\bpackage\.json$/i.test(extractRepoPath(source))) || configSources[0] || null;
  [
    packageSource,
    configSources.find(source => source.index !== packageSource?.index),
    codeSources[0],
    codeSources[1],
    commitSources[0]
  ].filter(Boolean).forEach(source => used.add(source.index));
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
  const article = alignArticleToPageStructure({
    pageType: page.pageType || 'topic',
    article: normalizeArticle({
      rawArticle: raw.article || {
        summary: raw.summary,
        sections: raw.sections,
        preservedUserContent: raw.preservedUserContent
      },
      page,
      manualNotes,
      candidates
    })
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
  const failures = [];

  SCAFFOLD_PATTERNS.forEach(({ label, pattern }) => {
    if (pattern.test(plainText)) failures.push(`Article contains ${label}.`);
  });
  const minWords = isGitHubRepoPage({ page, candidates: sourceRefs })
    ? 280
    : (sourceCount >= 5 ? QUALITY_MIN_WORDS_WITH_MANY_SOURCES : QUALITY_MIN_WORDS);
  if (sourceCount >= 3 && words < minWords) {
    failures.push(`Article is too thin for ${sourceCount} sources: ${words} words, expected at least ${minWords}.`);
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
  const mergedSourceRefs = dedupeSourceRefs(sourceRefs);
  const body = docFromArticle({
    title: normalized.title || page.title,
    article: normalized.article
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
        temperature: 0.2,
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
        temperature: 0.28,
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
        if (!retryMaterialized.quality?.ok && isGitHubRepoPage({ page, candidates })) {
          finalRetryNormalized = fallbackMaintenance({ page, candidates, manualNotes });
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

  page.title = materialized.title || page.title;
  page.pageType = inferMaintainedPageType({ page, candidates });
  page.sourceScope = 'entire_library';
  page.body = materialized.body;
  page.plainText = materialized.plainText;
  page.sourceRefs = materialized.sourceRefs;
  const persistedSourceRefs = page.sourceRefs?.toObject
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
  const persistedQuality = evaluateWikiArticleQuality({
    page,
    body: page.body,
    claims: page.claims,
    sourceRefs: persistedSourceRefs,
    now
  });
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
