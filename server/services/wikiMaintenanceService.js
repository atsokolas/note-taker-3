const {
  chatComplete,
  chatCompleteStream,
  getConfig: getTextGenerationConfig,
  isTextGenerationConfigured
} = require('../ai/hfTextClient');
const {
  alignArticleToPageStructure,
  getWikiPageStructure,
  getWikiPageStructureForPage
} = require('./wikiPageStructureService');
const { findAutolinkSuggestions, loadAutolinkCandidates } = require('./wikiAutolinkService');
const { applyWikiAutolinkToDoc } = require('./wikiAutolinkApplyService');
const { formatWikiSchemaPromptBlock } = require('./wikiSchemaService');
const { fetchFilingDocument } = require('./edgarWatcherService');
const {
  BUSINESS_MODEL_ADAPTERS,
  compileInvestmentDossierResearchPlan,
  upgradeInvestmentDossierProfile
} = require('./investmentDossierProfileService');
const { evaluateInvestmentDossierQuality } = require('./investmentDossierQualityService');
const { withTransientRetries } = require('./wikiDossierBuildReliabilityService');
const {
  sourceFamilyKey,
  evaluateOwnedSourceUtilization,
  normalizeExclusions,
  resolveExclusionFamilies,
  isOwnedSource
} = require('./wikiOwnedSourceUtilizationService');

const AUTOLINK_CANDIDATE_LIMIT = 80;
const DEFAULT_SOURCE_LIMIT = 24;
const FAST_SOURCE_LIMIT = 8;
// Per-source floor. Every page keeps at least what it had before this budget
// existed; pages with few sources get more, never less.
const MAX_SOURCE_TEXT = 1800;
// How much of a source we retain while collecting, before the budget decides how
// much of it a given build may spend. Truncating to the floor at collection time
// threw the rest away before anyone could choose to use it.
const MAX_COLLECTED_SOURCE_TEXT = 12000;
// A whole-build allowance, shared across sources. Eight sources keep roughly what
// they have today; one source — the onboarding case, where that source *is* the
// page — gets a window it can actually be written from.
const SOURCE_TEXT_TOTAL_BUDGET = 24000;
const MAX_SINGLE_SOURCE_TEXT = 12000;

/**
 * How much text each source may contribute to this build.
 *
 * Observed on production: a 45,636-character article was cut to 1,800 characters,
 * the model wrote a full reference article from that 4%, and the evidence gate
 * correctly rejected the sentences it had to invent to fill the gap. Raising the
 * writer's window without raising the judge's would only have hidden that, so the
 * same number feeds both.
 */
const perSourceTextBudget = (sourceCount = 1) => {
  const count = Math.max(1, Number(sourceCount) || 1);
  const share = Math.floor(SOURCE_TEXT_TOTAL_BUDGET / count);
  return Math.min(MAX_SINGLE_SOURCE_TEXT, Math.max(MAX_SOURCE_TEXT, share));
};

const applySourceTextBudget = (candidates = []) => {
  const list = Array.isArray(candidates) ? candidates : [];
  const budget = perSourceTextBudget(list.length);
  return list.map(candidate => (
    candidate && typeof candidate.text === 'string' && candidate.text.length > budget
      ? { ...candidate, text: truncate(candidate.text, budget) }
      : candidate
  ));
};
const DEFAULT_PROMPT_SOURCE_TEXT_LIMIT = 1300;
const FAST_PROMPT_SOURCE_TEXT_LIMIT = 800;
const INVESTMENT_DOSSIER_PROMPT_SOURCE_TEXT_LIMIT = 6000;
const SEC_FILING_EVIDENCE_TEXT_LIMIT = 36000;
const DEFAULT_DRAFT_MAX_TOKENS = 2600;
const DEFAULT_REBUILD_MAX_TOKENS = 3600;
const ORDINARY_WIKI_MAX_TOKENS = 4200;
const INVESTMENT_DOSSIER_DRAFT_MAX_TOKENS = 8000;
const INVESTMENT_DOSSIER_REBUILD_MAX_TOKENS = 8000;
const MAX_ARTICLE_BLOCK_TEXT = 2400;
const MIN_SOURCE_RELEVANCE_SCORE = 2;
const MIN_SPARSE_PAGE_CANDIDATES = 3;
const QUALITY_MIN_WORDS = 450;
const QUALITY_MIN_WORDS_WITH_MANY_SOURCES = 650;

// The reviewer and the writer held different opinions about depth. The gate
// derived a floor from the supplied evidence; the prompt only said "do not
// force a target length" and asked for "at least 6 evidence-bearing
// paragraphs", which the model satisfied at roughly eighty words each — landing
// near 500 against a 650 floor. Articles were rejected for a standard nobody
// had told them. Compute the floor once so both sides read the same number.
const ordinaryArticleMinimumWords = ({ sourceCount = 0, evidenceWordCount = 0 } = {}) => (
  Number(sourceCount) >= 5
    ? Math.min(
        QUALITY_MIN_WORDS_WITH_MANY_SOURCES,
        Math.max(QUALITY_MIN_WORDS, Math.round(Number(evidenceWordCount) * 1.25))
      )
    : QUALITY_MIN_WORDS
);
const ORDINARY_WIKI_FREE_MODEL = String(process.env.ORDINARY_WIKI_FREE_MODEL || '').trim()
  || 'nvidia/nemotron-3.5-lightning:free';
const SCAFFOLD_PATTERNS = [
  { label: 'instructional scaffold', pattern: /\bshould explain\b/i },
  { label: 'source-backed development placeholder', pattern: /\bstill needs source-backed development\b/i },
  { label: 'signal-list scaffold', pattern: /\bstrongest current signals\b/i },
  { label: 'source summary dump', pattern: /(^|\n|\s)Summary:/i },
  { label: 'maintenance phrasing', pattern: /\bmay change this page\b/i },
  { label: 'unfinished article placeholder', pattern: /\bwaiting for source-backed evidence\b/i },
  { label: 'source dump framing', pattern: /\bcontributes evidence for this page\b/i }
];
// "Open questions" is deliberately absent from this list. It is not filler on
// an ordinary Wiki: wikiOpenQuestionsService collects a page's questions only
// from a section headed exactly that, and both the Concept question board and
// the briefing read the result. Rejecting the heading as generic stripped those
// surfaces of their input on every page that complied, and the model could not
// satisfy the gate and the feature at once. A landmark other features navigate
// by has to stay stable; every other section still earns a subject-specific
// heading.
const OPEN_QUESTIONS_LANDMARK_HEADING = 'open questions';
const GENERIC_REFERENCE_HEADINGS = new Set([
  'core idea',
  'how it works',
  'evidence',
  'tensions',
  'definition and scope',
  'key mechanisms',
  'examples and evidence',
  'limits and competing views',
  'evidence and evaluation',
  'why it matters'
]);
const ORDINARY_REFERENCE_FILLER_PATTERNS = [
  /\b(?:analysts|experts|researchers|companies|firms) often (?:say|use|view|consider|describe)\b/i,
  /\bserves as a powerful (?:tool|framework|concept)\b/i,
  /\bplays? (?:an important|a crucial|a vital) role\b/i
];
const ORDINARY_MECHANISM_PATTERNS = [
  /\b(?:because|therefore|which causes|which leads|results? in|drives?|depends? on|works? by|mechanism|process|feedback loop|sequence|stage)\b/i,
  /\b(?:first|second|then|next|finally)\b[^.]{0,180}\b(?:causes?|changes?|produces?|allows?|prevents?|reinforces?)\b/i
];
const ORDINARY_EXAMPLE_PATTERNS = [
  /\b(?:for example|for instance|examples? (?:include|of)|consider|worked example|case study|in practice|a common case|one case)\b/i,
  /\b(?:imagine|suppose|when a|when an)\b[^.]{20,220}\b(?:then|because|so|can|will)\b/i,
  // Historical and scientific articles often make a mechanism observable
  // through a dated event or measured episode rather than the phrase "for
  // example". Require a real date/quantity plus a concrete unit so scene-
  // setting prose alone cannot satisfy the case gate.
  /\b(?:18|19|20)\d{2}\b[^.]{0,180}\b(?:hours?|minutes?|days?|kilograms?|miles?|percent|people|samples?|missions?|patients?|cells?)\b/i,
  /\b\d+(?:\.\d+)?\s+(?:hours?|minutes?|days?|years?|kilograms?|miles?|percent|patients?|samples?|orbits?)\b/i
];
const ORDINARY_BOUNDARY_PATTERNS = [
  /\b(?:however|but|although|by contrast|limit(?:ation)?s?|boundary|exception|misconception|does not|cannot|uncertain|counterevidence|tension|trade[- ]?off)\b/i
];
const selectBoundedOrdinaryModelRoutes = (routes = []) => {
  const valid = (Array.isArray(routes) ? routes : []).filter(route => route?.model);
  if (valid.length <= 1) return valid;
  const primary = valid[0];
  const configuredFreeFallback = valid.slice(1).find(route => /(?:\/free|:free)$/i.test(asString(route.model)));
  const freeFallback = configuredFreeFallback
    ? { ...configuredFreeFallback, model: ORDINARY_WIKI_FREE_MODEL }
    : null;
  return [primary, freeFallback || valid[1]].filter(Boolean);
};
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
const GITHUB_REPO_PLANNING_PATH_PATTERN = /\b(?:docs\/(?:deep-dive-qa-report|full-qa-sweep|evernote-cloud-oauth-spike|noeis-[\w-]*(?:spec|plan|qa|review|feedback|polish|roadmap)|test-plans\/)[\w./-]*\.(?:md|mdx|txt)|output\/[\w./-]+)\b/gi;
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
const NOEIS_REPO_OPERATIONAL_BOUNDARY_PATTERNS = [
  { label: 'authentication boundary', pattern: /\b(?:authRoutes|JWT|authenticated|authentication boundary)\b/i },
  { label: 'persistence boundary', pattern: /\b(?:server\/models\/index\.js|WikiPage persistence|Mongo(?:DB)?)\b/i },
  { label: 'background worker', pattern: /\b(?:wikiScheduledMaintenanceWorker|background (?:worker|maintenance)|scheduled maintenance)\b/i },
  { label: 'publication transaction', pattern: /\b(?:wikiMaintenancePublicationService|publishedHeadSha|candidateHeadSha|last trusted page|publication transaction)\b/i },
  { label: 'feedback state', pattern: /\b(?:SystemStatusContext|background work|recoverable failure|success receipt)\b/i }
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

const collectDocHeadings = (node, headings = []) => {
  if (!node) return headings;
  if (Array.isArray(node)) {
    node.forEach(child => collectDocHeadings(child, headings));
    return headings;
  }
  if (typeof node !== 'object') return headings;
  if (node.type === 'heading') {
    const heading = toPlainText(node);
    if (heading) headings.push(heading);
  }
  if (Array.isArray(node.content)) collectDocHeadings(node.content, headings);
  return headings;
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

const ORDINARY_QUERY_STOP_WORDS = new Set([
  'about', 'against', 'among', 'around', 'because', 'between', 'from', 'into',
  'over', 'that', 'their', 'these', 'this', 'through', 'under', 'what', 'when',
  'where', 'which', 'while', 'with', 'without'
]);
const ORDINARY_GROUNDING_STOP_WORDS = new Set([
  ...ORDINARY_QUERY_STOP_WORDS,
  'also', 'been', 'being', 'does', 'each', 'every', 'have', 'having', 'more',
  'most', 'other', 'same', 'some', 'such', 'than', 'there', 'they', 'very',
  'will', 'would', 'page', 'topic', 'source', 'sources', 'evidence'
]);

const topicTokens = (value = '') => Array.from(new Set(
  tokenize(value).filter(token => !ORDINARY_QUERY_STOP_WORDS.has(token))
));

const groundingToken = (value = '') => String(value || '')
  .replace(/(?:ing|edly|edly|ed|es|s)$/i, '')
  .trim();

const ordinaryGroundingTokens = (value = '') => Array.from(new Set(
  tokenize(value)
    .filter(token => !ORDINARY_GROUNDING_STOP_WORDS.has(token))
    .map(groundingToken)
    .filter(token => token.length >= 4)
));

// Real synthesis draws a relationship that no single source states in its own
// words, so a pure lexical-overlap gate punishes the article for doing its job.
// The repaired judge keeps rejecting free-floating abstraction — a sentence
// with no recognizable anchor in its own cited evidence — while accepting a
// sentence that visibly bridges two or more cited sources by carrying anchors
// from each of them.
const MIN_ORDINARY_GROUNDING_RATIO = 0.2;
const MIN_SYNTHESIS_BRIDGE_SOURCES = 2;
const MIN_SYNTHESIS_ANCHORS_TOTAL = 3;

const findOrdinaryGroundingGaps = ({ claims = [], sourceRefs = [] } = {}) => (
  (Array.isArray(claims) ? claims : []).flatMap((claim) => {
    if (normalizeClaimSupport(claim?.support) === 'unsupported') return [];
    const indexes = normalizeCitationIndexes([
      ...(claim?.citationIndexes || []),
      ...(claim?.contradictionIndexes || [])
    ]);
    if (!indexes.length) return [];
    const perSourceTokens = indexes.map((index) => {
      const source = sourceRefs[index - 1] || {};
      return new Set(ordinaryGroundingTokens(
        [source.title, source.snippet, source.quote, source.text].filter(Boolean).join(' ')
      ));
    }).filter(tokens => tokens.size);
    const evidenceTokens = new Set(perSourceTokens.flatMap(tokens => Array.from(tokens)));
    if (!evidenceTokens.size) return [];
    return String(claim?.text || '')
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(Boolean)
      .filter((sentence) => {
        const tokens = ordinaryGroundingTokens(sentence);
        if (tokens.length < 5) return false;
        const anchors = tokens.filter(token => evidenceTokens.has(token));
        if (anchors.length / tokens.length >= MIN_ORDINARY_GROUNDING_RATIO) return false;
        // A sentence with almost no anchor is an unsupported abstraction no
        // matter how many sources the paragraph cites.
        if (anchors.length < MIN_SYNTHESIS_ANCHORS_TOTAL) return true;
        if (perSourceTokens.length < MIN_SYNTHESIS_BRIDGE_SOURCES) return true;
        // A term every cited source shares says nothing about which source the
        // sentence drew on, so it cannot establish a bridge. Only an anchor
        // distinctive to one source shows that source was actually used; a
        // sentence restating one source while nodding at a shared word is
        // still ungrounded drift, not synthesis.
        const bridgedSources = perSourceTokens
          .filter(sourceTokens => anchors.some(token => (
            sourceTokens.has(token)
            && perSourceTokens.some(other => !other.has(token))
          )))
          .length;
        return bridgedSources < MIN_SYNTHESIS_BRIDGE_SOURCES;
      })
      .map(sentence => truncate(sentence, 220));
  }).filter(Boolean).slice(0, 4)
);

const normalizeOrdinarySentence = (value = '') => asString(value)
  .toLowerCase()
  .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, ' ')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// A reference article should synthesize evidence once, then advance it. Long
// sentences repeated across separate evidence blocks are a reliable signal
// that the model padded a section by restating the opening rather than giving
// the section a distinct job. Keep this deliberately conservative so recurring
// technical terms and short definitions do not trigger it.
const findOrdinaryRepeatedSentences = (claims = []) => {
  const occurrences = new Map();
  (Array.isArray(claims) ? claims : []).forEach((claim, blockIndex) => {
    String(claim?.text || '')
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(Boolean)
      .forEach((sentence) => {
        const normalized = normalizeOrdinarySentence(sentence);
        if (normalized.length < 70 || normalized.split(/\s+/).length < 10) return;
        const current = occurrences.get(normalized) || { sentence, blocks: new Set() };
        current.blocks.add(blockIndex);
        occurrences.set(normalized, current);
      });
  });
  return Array.from(occurrences.values())
    .filter(item => item.blocks.size >= 2)
    .map(item => truncate(item.sentence, 220))
    .slice(0, 4);
};

// Descriptive subtitles help humans understand a Wiki page, but they should not
// turn its evidence gate into an exact-title matcher. For example, a source
// directly about "Investing" is topical for "Investing: Principles, Process,
// and Decision Quality" even when it does not repeat every subtitle word.
const primaryTopicTitle = (value = '') => (
  asString(value)
    .split(/\s*(?::|[\u2013\u2014])\s*/u, 1)[0]
    .trim()
);

const escapeTopicRegex = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Targeted retrieval carried the same shape of bug as the build preflight: it
// strips stop words and connectors, then demands the survivors sit next to each
// other, so "Parenting through independence" searched for
// /parenting\s+independence/ and matched nothing. That failed silently —
// targeted queries came back empty and selection fell back to whatever was
// recent, which produces a worse article rather than a visible error.
//
// Allow one dropped connector between significant words. Retrieval wants reach,
// so this stays looser than the preflight's exact-phrase test.
const exactTopicPattern = (value = '') => {
  const words = topicTokens(value);
  if (!words.length) return null;
  const gap = '(?:\\s+|[-–—]\\s*)(?:[a-z]{1,6}(?:\\s+|[-–—]\\s*))?';
  return new RegExp(words.map(escapeTopicRegex).join(gap), 'i');
};

const maintenanceQueryText = (page = {}) => {
  const generated = isLikelyGeneratedPage(page);
  const userSourceText = (Array.isArray(page.sourceRefs) ? page.sourceRefs : [])
    .filter(source => source?.addedBy === 'user')
    .map(source => `${source.title || ''} ${source.snippet || source.quote || ''}`)
    .join(' ');
  return [
    page.title,
    page.createdFrom?.text,
    page.createdFrom?.label,
    generated ? '' : page.plainText || toPlainText(page.body),
    userSourceText
  ].filter(Boolean).join(' ');
};

const sourceTopicCoverage = (source = {}, title = '') => {
  const tokens = topicTokens(title);
  if (!tokens.length) return 0;
  const haystack = cleanWikiText([
    source.title,
    source.text,
    source.snippet,
    source.quote,
    ...(Array.isArray(source.tags) ? source.tags : [])
  ].filter(Boolean).join(' ')).toLowerCase();
  if (!haystack) return 0;
  const matched = tokens.filter((token) => {
    if (haystack.includes(token)) return true;
    const stem = token.replace(/(?:ing|ment|tion|s)$/i, '');
    return stem.length >= 5 && haystack.includes(stem);
  });
  return Number((matched.length / tokens.length).toFixed(2));
};

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

const mergeModelRows = (...groups) => {
  const seen = new Set();
  return groups.flat().filter((row) => {
    const id = sourceObjectId(row);
    const key = id || `${asString(row?.title || row?.name)}:${asString(row?.url)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// includeIds carries the results of semantic retrieval. The lexical scan finds
// sources that share the subject's words; retrieval finds sources that share
// its meaning, and those are frequently not the same rows. Without a way to
// force them into the pool, a semantic hit can only re-rank material the
// lexical scan already surfaced — which is no help at all when the point is
// that it surfaced nothing.
const collectLibrarySources = async ({ userId, models = {}, fastProfile = false, page = null, includeIds = {} } = {}) => {
  const limits = fastProfile ? FAST_LIBRARY_LIMITS : STANDARD_LIBRARY_LIMITS;
  const topicPattern = exactTopicPattern(page?.title || '');
  const targetedLimit = fastProfile ? 24 : 80;
  const [recentArticles, recentNotebooks, recentConcepts, recentQuestions] = await Promise.all([
    runFind(models.Article, { userId }, limits.article, ARTICLE_SOURCE_PROJECTION),
    runFind(models.NotebookEntry, { userId }, limits.notebook),
    runFind(models.TagMeta, { userId }, limits.concept),
    runFind(models.Question, { userId }, limits.question)
  ]);
  const [targetedArticles, targetedNotebooks, targetedConcepts, targetedQuestions] = topicPattern
    ? await Promise.all([
        runFind(models.Article, {
          userId,
          $or: [
            { title: topicPattern },
            { content: topicPattern },
            { 'highlights.text': topicPattern },
            { 'highlights.note': topicPattern },
            { 'highlights.tags': topicPattern }
          ]
        }, targetedLimit, ARTICLE_SOURCE_PROJECTION),
        runFind(models.NotebookEntry, {
          userId,
          $or: [
            { title: topicPattern },
            { content: topicPattern },
            { 'blocks.text': topicPattern },
            { tags: topicPattern }
          ]
        }, targetedLimit),
        runFind(models.TagMeta, {
          userId,
          $or: [
            { name: topicPattern },
            { title: topicPattern },
            { description: topicPattern }
          ]
        }, targetedLimit),
        runFind(models.Question, {
          userId,
          $or: [
            { text: topicPattern },
            { 'blocks.text': topicPattern },
            { linkedTagName: topicPattern },
            { conceptName: topicPattern }
          ]
        }, targetedLimit)
      ])
    : [[], [], [], []];
  const idList = (key) => {
    const rows = Array.isArray(includeIds?.[key]) ? includeIds[key] : [];
    return rows.map(id => asString(id)).filter(Boolean).slice(0, 40);
  };
  const findByIds = async (Model, ids, projection = null) => (
    ids.length ? runFind(Model, { userId, _id: { $in: ids } }, ids.length, projection) : []
  );
  const [namedArticles, namedNotebooks, namedConcepts, namedQuestions] = await Promise.all([
    findByIds(models.Article, idList('article'), ARTICLE_SOURCE_PROJECTION),
    findByIds(models.NotebookEntry, idList('notebook')),
    findByIds(models.TagMeta, idList('concept')),
    findByIds(models.Question, idList('question'))
  ]);

  const articles = mergeModelRows(namedArticles, targetedArticles, recentArticles);
  const notebooks = mergeModelRows(namedNotebooks, targetedNotebooks, recentNotebooks);
  const concepts = mergeModelRows(namedConcepts, targetedConcepts, recentConcepts);
  const questions = mergeModelRows(namedQuestions, targetedQuestions, recentQuestions);

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
      text: truncate([article.content, highlightText].filter(Boolean).join('\n'), MAX_COLLECTED_SOURCE_TEXT),
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
      text: truncate([entry.content, blockText].filter(Boolean).join('\n'), MAX_COLLECTED_SOURCE_TEXT),
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
  const queryText = maintenanceQueryText(page);
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
  const ordinaryStructure = getWikiPageStructureForPage({ page, candidates: [] });
  const shouldBackfill = (!ordinaryStructure.flexibleSections || !isLikelyGeneratedPage(page))
    && sources.length >= minCandidateCount
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
  const sorted = selected.sort(sortSources);
  const familyCounts = new Map();
  const diverse = sorted.filter((source) => {
    const family = sourceFamilyKey(source);
    const count = familyCounts.get(family) || 0;
    if (count >= 3) return false;
    familyCounts.set(family, count + 1);
    return true;
  });
  return diverse.slice(0, limit).map((source, index) => ({
    ...source,
    topicCoverage: sourceTopicCoverage(source, page?.title),
    index: index + 1
  }));
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
    limit,
    // The prompt only needs identity and a short editorial label. Loading
    // every page body, claim, citation, and dossier made this 40-row lookup
    // take tens of seconds on a mature personal Wiki.
    { title: 1, pageType: 1, summary: 1, description: 1 }
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
  const operationalBoundaryMatches = NOEIS_REPO_OPERATIONAL_BOUNDARY_PATTERNS
    .filter(({ pattern }) => pattern.test(text));
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
  const hasRootPackage = repoPaths.some(path => path.toLowerCase() === 'package.json');
  const hasUiPackage = repoPaths.some(path => path.toLowerCase() === 'note-taker-ui/package.json');
  const hasEnvExample = repoPaths.some(path => path.toLowerCase() === '.env.example');
  const unqualifiedPlannedPaths = refs
    .filter(source => asString(source.metadata?.docClass).toLowerCase() === 'planned')
    .map(extractRepoPath)
    .filter(Boolean)
    .filter((path) => {
      const matchIndex = text.toLowerCase().indexOf(path.toLowerCase());
      if (matchIndex < 0) return false;
      const context = text.slice(Math.max(0, matchIndex - 140), matchIndex + path.length + 140);
      return !/\b(?:planned|planning|proposal|roadmap|historical|context only|not shipped|not current)\b/i.test(context);
    });
  const unqualifiedPlanningPathMentions = Array.from(text.matchAll(GITHUB_REPO_PLANNING_PATH_PATTERN))
    .map(match => match[0])
    .filter((path) => {
      const matchIndex = text.toLowerCase().indexOf(path.toLowerCase());
      if (matchIndex < 0) return false;
      const context = text.slice(Math.max(0, matchIndex - 140), matchIndex + path.length + 140);
      return !/\b(?:planned|planning|proposal|roadmap|historical|context only|not shipped|not current|known unknown|current active work)\b/i.test(context);
    });
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
  if (/\bnpm run wiki:qa\b[\s\S]{0,300}(?:\.\.\.|…)/i.test(text)) {
    failures.push('GitHub repo article exposes a truncated setup or proof command.');
  }
  if (hasRootPackage && hasUiPackage && (!/\brepository root\b/i.test(text) || !/\bnote-taker-ui\/?\b|\bcd\s+note-taker-ui\b/i.test(text))) {
    failures.push('GitHub repo article does not distinguish root and UI working directories.');
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
  if (unqualifiedPlannedPaths.length || unqualifiedPlanningPathMentions.length) {
    failures.push(`GitHub repo article promotes planning or QA documents as current implementation paths: ${Array.from(new Set([...unqualifiedPlannedPaths, ...unqualifiedPlanningPathMentions])).slice(0, 5).join(', ')}.`);
  }
  if (isNoeisRepo && productSignalCount < 4) {
    failures.push(`Noeis repo article does not orient the product loop clearly enough: ${productSignalCount}/4 product surfaces mentioned.`);
  }
  if (isNoeisRepo && flowSignalCount < 4) {
    failures.push(`Noeis repo article does not trace enough real repo flows: ${flowSignalCount}/4 implementation signals mentioned.`);
  }
  if (isNoeisRepo && operationalBoundaryMatches.length < 5) {
    const missing = NOEIS_REPO_OPERATIONAL_BOUNDARY_PATTERNS
      .filter(({ pattern }) => !pattern.test(text))
      .map(({ label }) => label);
    failures.push(`Noeis repo article omits operational boundaries: ${missing.join(', ')}.`);
  }
  if (isNoeisRepo && !/Repo creation:[\s\S]{0,700}(?:->|→)[\s\S]{0,700}(?:->|→)/i.test(text)) {
    failures.push('Noeis repo article does not trace the repo creation flow across UI, API, service, persistence, and render state.');
  }
  if (isNoeisRepo && !/Repo refresh:[\s\S]{0,700}\b(?:githubRepoWatcherService|source events?)\b[\s\S]{0,700}\b(?:wikiMaintenanceService|publication)\b/i.test(text)) {
    failures.push('Noeis repo article does not trace the repository refresh and publication flow.');
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
  if (isNoeisRepo && hasEnvExample && (!/\bJWT_SECRET\b/.test(text) || !/\bMONGODB_URI\b/.test(text))) {
    failures.push('Noeis repo article omits core local environment variable names from .env.example.');
  }
  if (isNoeisRepo && hasEnvExample && hasUiPackage && (!/localhost:5500/i.test(text) || !/localhost:3000/i.test(text))) {
    failures.push('Noeis repo article omits the supported local API or UI URL.');
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
- For a multi-process application, explicitly identify authentication, persistence, background-worker, publication, and user-feedback boundaries. Do not flatten them into “the backend.”
- Trace at least two concrete flows from visible control through client, route, service, persistence/publication, and rendered feedback. Name exact paths at each supported hop.
- Include a symptom-routing table or bullets that map a user-visible failure to the first owning file and the closest proof command.
- Include a quickstart section or subsection with concrete Run, Test, Build/Deploy, and Key paths only when package/config evidence supports them.
- Make every command copyable and name its working directory. Use "repository root" for root package scripts and "cd <directory> && npm run <script>" for nested packages.
- Never expand a long package script into truncated prose. Show the named command and cite the package file instead.
- When .env.example is attached, list variable names only, never values. Include local URLs only when port/proxy evidence supports them.
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

const formatInvestmentDossierPromptBlock = ({ structure = {}, page = {} } = {}) => {
  if (structure.profile !== 'investment_dossier') return '';
  const profile = page?.investmentDossier || {};
  const model = profile?.businessModel || {};
  const plan = profile?.researchPlan || {};
  const modelLabel = BUSINESS_MODEL_ADAPTERS[model.primary]?.label || 'Unclassified';
  return `
Investment dossier rules:
- Return all nine required section headings exactly as written and omit none.
- Lead with a current judgment, not a company description. Separate business quality from security attractiveness.
- The selected business-model adapter is "${modelLabel}". Do not import AI-infrastructure metrics unless this company's economics actually require them.
- Required analytical modules: ${(plan.requiredModuleIds || []).join(', ') || 'research plan is not classified yet'}.
- Missing evidence archetypes: ${(plan.missingEvidenceArchetypes || []).join(', ') || 'none identified'}.
- Missing analytical modules: ${(plan.missingModuleIds || []).join(', ') || 'none identified'}.
- Produce at least 1,800 words and at least 20 distinct claim-level analytical paragraphs or bullets. These are minimum decision-dossier gates, not permission to add filler.
- Every paragraph or bullet must establish a mechanism, calculation, counterargument, falsifier, or next evidence test.
- Cover every required analytical module explicitly. For the "${modelLabel}" adapter, name the company-specific operating evidence behind each adapter module rather than substituting generic industry language.
- Tie every paragraph containing reported facts to citationIndexes. Use "supported" when the cited filing directly establishes the material facts, "partial" only when the paragraph mixes filing facts with interpretation, and "unsupported" only for an explicitly labeled owner judgment or unresolved question.
- Include at least four directly filing-supported paragraphs when the supplied filings contain substantive business or financial evidence. Do not downgrade directly reported facts merely because only two primary filings are attached.
- Make valuation an implied-expectations problem. State the price or market-value snapshot date, distinguish reported figures from calculations, and show what operating outcome must be true for a reasonable return.
- Include at least one reproducible, numeric calculation in Implied Expectations and at least one in System and Unit Economics. State the inputs, arithmetic or ratio, period, and source citations in the same paragraph so another analyst can reproduce it.
- Never turn one quarter into a forecast. If annualizing a quarter, label it as a sensitivity boundary and compare it with the last full fiscal year.
- Explain what the customer buys, why it chooses the company, the scarce control point, and how that control point becomes cash. Use the selected adapter's economics rather than generic technology language.
- Treat capital commitments, customer concentration, regulation, and ecosystem financing as mechanisms that can strengthen or weaken the moat, not as a generic risk list.
- End with observable falsifiers and the exact next filing or public evidence that should update the page.
- Do not issue a buy/sell instruction or invent a founder conviction. The page may conclude that evidence is insufficient to establish an attractive expected return.
- The prose cannot complete research modules by assertion. Missing structured modules or evidence must remain visibly incomplete.
`;
};

const formatOrdinaryEvidenceMap = ({ page = {}, candidates = [] } = {}) => {
  const topic = primaryTopicTitle(page?.title || '') || asString(page?.title);
  const direct = candidates
    .filter(source => sourceTopicCoverage(source, topic) >= 0.8)
    .map(source => source.index);
  const adjacent = candidates
    .filter(source => !direct.includes(source.index))
    .map(source => source.index);
  const familyJobs = Array.from(new Map(candidates.map(source => [
    sourceFamilyKey(source),
    {
      family: sourceFamilyKey(source),
      indexes: candidates
        .filter(candidate => sourceFamilyKey(candidate) === sourceFamilyKey(source))
        .map(candidate => candidate.index)
    }
  ])).values())
    .filter(item => item.family)
    .map((item, index) => `  ${index + 1}. Sources [${item.indexes.join(', ')}] are one evidence family; give that family one distinct job.`)
    .join('\n');
  const ownedIndexes = candidates.filter(isOwnedSource).map(source => source.index);
  return `
Ordinary Wiki evidence map:
- Page subject: "${topic}".
- Direct subject sources: ${direct.length ? `[${direct.join(', ')}]` : 'none'}.
- Adjacent or contextual sources: ${adjacent.length ? `[${adjacent.join(', ')}]` : 'none'}.
- Account-owned Library sources: ${ownedIndexes.length ? `[${ownedIndexes.join(', ')}]` : 'none'}.
- The opening definition and core mechanism must be supported by direct subject sources. Adjacent sources may illustrate a clearly labeled application, analogy, or tension; they cannot define the subject.
${familyJobs || '  No distinct evidence families were detected.'}

Owned-source utilization contract:
- Every account-owned evidence family above must either shape a visible claim or be explicitly excluded. Listing a source in the reference ledger is not use.
- Shaping a claim means the family supports it, challenges or complicates it, or supplies the context or example that makes it concrete. Cite that family in the paragraph's citationIndexes or contradictionIndexes.
- When two owned families disagree, write the disagreement as a tension with both cited and support "conflicted". Do not average them into one agreeable sentence.
- Do not force an owned source into the article. If a family is irrelevant to this subject, duplicates another family, or is too thin to carry a claim, list it in excludedSources with a specific reason. An unexplained omission is a failure; an explained one is not.
- Public or general-authority sources may strengthen an account-grounded article, but they cannot stand in for the user's own material.
`;
};

const formatStandardWikiPromptBlock = ({ structure = {}, page = {}, candidates = [] } = {}) => {
  if (structure.profile === 'investment_dossier' || structure.type === 'repo' || !structure.flexibleSections) return '';
  return `
Ordinary reference Wiki rules:
- Write an encyclopedic reference article, not a mini investment memo, magazine essay, or five-section template filled with generic prose.
- First infer the evidence-appropriate article shape: concept, mechanism, practice, history, system, person, or question. Let that shape determine the section sequence. Do not expose this classification as a heading or metadata label.
- Use subject-specific section headings that make the page skimmable without reading like a form. The coverage goals below are a checklist, not mandated heading names; for example, prefer "Compounding frequency" or "Continuous compounding" over "How It Works" when the evidence supports that specificity.
- The opening summary must answer "What is this?" precisely in its first sentence. Define important terms and notation before extending the idea into applications or analogies.
- Explain the causal or technical mechanism step by step. For mathematical, scientific, legal, or technical topics, include a concrete worked example, boundary case, or observable test when the supplied evidence supports one.
- For social, historical, practical, or human topics, replace the worked calculation with a concrete situation, behavior, case, or sequence that makes the mechanism observable.
- Use only examples or sequences present in the supplied evidence. Do not invent a plausible family, quotation, action sequence, or downstream benefit merely to satisfy the example requirement; state the missing example as an evidence gap instead.
- With five or more sources, let the subject determine the shape: usually 3-7 subject-specific sections and at least 6 evidence-bearing paragraphs, most of which develop their point across several sentences rather than asserting it in one. A paragraph that reports a finding should also say by what mechanism it works, under what limit it holds, or what follows from it. The article must cover a precise definition and scope, a causal process or organizing structure, a concrete case, meaningful limits or disagreement, and practical implications only when the evidence supports them.
- Distinguish a formal equivalence from an analogy. Never call two mechanisms "mathematically identical," "the same," or "proven" unless a cited source directly establishes that relationship.
- Prefer specific claims over broad scene-setting. Remove paragraphs that merely say analysts, studies, or firms "often" do something without naming the mechanism and attaching evidence.
- Never name a person, institution, study, statistic, or doctrine that is absent from the supplied evidence. Never write "research shows" or "empirical evidence" unless the cited source itself reports that evidence.
- Do not invent the hidden reason behind a reported relationship. If a source says a practice supports an outcome but does not explain why, preserve that limit instead of supplying a plausible causal story.
- Separate source-reported effects from your own implication. A plausible implication must be labeled as interpretation and marked partial; it cannot be presented as a supported source fact.
- Build the generally useful definition and mechanism before explaining why the subject recurs in this user's Library. Personal connections should deepen the article, not replace the subject.
- Use a source as authority only when it directly addresses the subject or the specific claim. Adjacent sources may support a labeled analogy or application, but cannot carry the definition.
- Treat repeated highlights from one article as one evidence family. Do not manufacture authority by citing the same underlying source repeatedly or by spreading one source across many claims.
- Put citationIndexes at the end of the paragraph they support. Do not attach a citation after every phrase or make one citation appear to support several unrelated assertions.
- When the library cannot support a definition, example, or important boundary, state the exact gap in Open Questions or maintenance instead of filling the article with plausible general knowledge.
- Make each included section earn its place. A section may be concise, but it must add a definition, mechanism, evidence synthesis, limitation, implication, or genuinely unresolved question.
- Give the opening and every section a different analytical job. State a definition or mechanism once; do not repeat a long sentence or rephrase the same paragraph in the summary and a later section.
- Never use a template heading such as "Definition and scope", "How it works", "Evidence", "Tensions", "Core idea", or "Why it matters". Name what the section actually covers. The coverage goals above are analytical jobs, not heading text; reusing one as a heading is a failure.
- The single exception is "Open Questions". Use exactly that heading, once, for the section holding genuinely unresolved questions and evidence gaps, because other parts of the product read that section by name. Omit the section entirely rather than inventing questions to fill it.
- Treat existing generated prose as evidence to salvage, not wording to preserve. If it repeats itself, retain the supported fact once and rewrite the surrounding structure from the sources.
${formatOrdinaryEvidenceMap({ page, candidates })}`;
};

const buildPrompt = ({
  page,
  candidates,
  manualNotes = '',
  recoveryDraftText = '',
  recoveryDraftQuality = null,
  wikiSchemaContent = '',
  knownWikiPages = [],
  sourceTextLimit = DEFAULT_PROMPT_SOURCE_TEXT_LIMIT
}) => {
  const repoPage = isGitHubRepoPage({ page, candidates });
  const structure = repoPage
    ? getWikiPageStructure('repo')
    : getWikiPageStructureForPage({ page, candidates });
  const sourceBlock = candidates.map(source => (
    `[${source.index}] ${source.type.toUpperCase()}: ${source.title}\n` +
    `Updated: ${source.updatedAt || source.createdAt || 'unknown'}\n` +
    formatCandidateMetadataLine(source) +
    `Text: ${truncate(source.text, sourceTextLimit)}`
  )).join('\n\n');
  // Derive the floor from the evidence the model is actually shown, so the
  // number in the prompt is the number the reviewer will compute rather than an
  // approximation of it.
  const ordinaryMinimumWords = ordinaryArticleMinimumWords({
    sourceCount: candidates.length,
    evidenceWordCount: candidates.reduce(
      (total, source) => total + countWords(truncate(source.text, sourceTextLimit)),
      0
    )
  });
  const omitGeneratedOrdinaryProse = structure.flexibleSections
    && isLikelyGeneratedPage(page)
    && !repoPage
    && structure.profile !== 'investment_dossier';
  const existingTextForPrompt = omitGeneratedOrdinaryProse
    ? 'Prior generated article prose intentionally omitted. Reconstruct from the source ledger and preserved user notes so earlier repetition or unsupported wording cannot become the template.'
    : truncate(page.plainText || toPlainText(page.body), 2400);

  return `Maintain this Wiki page by directly rewriting it into a clean, durable Wiki article.

Hard rules:
- The article body must read like a Wiki page, not a maintenance report and not a source dump.
${structure.flexibleSections && structure.profile !== 'investment_dossier'
    ? '- Be source-faithful. State only definitions, relationships, mechanisms, examples, and limits that the supplied evidence directly establishes. Prefer a narrower article to a plausible bridge claim that the sources do not say.'
    : '- Be opinionated. State what the evidence implies, which mechanisms matter, and where the tension is. Mark uncertainty in Open Questions instead of writing filler.'}
- Do not include HTML tags, JSON, raw URLs, scraped metadata labels, source indexes as prose, support labels, or sentences like "X contributes evidence for this page."
- Use source titles only as evidence behind the writing. The page should say the idea, not list the source title as the idea.
- Do not write scaffold or placeholder phrases such as "should explain", "still needs source-backed development", "strongest current signals", or "Summary:" bullets.
- Do not restate the page title as a body heading. The page chrome already renders the title; the article body should begin with the summary paragraph.
${structure.flexibleSections && structure.profile !== 'investment_dossier'
    ? `- This article is reviewed against a floor of ${ordinaryMinimumWords} words. That number follows from the evidence supplied, not from a house style: explaining a body of material takes more words than summarizing it. Reaching it by padding fails the repetition and filler checks; reach it by explaining.
- Every substantive sentence must retain recognizable terms and relationships from its cited evidence; omit unsupported connective prose.`
    : '- If there are 5 or more candidate sources, write at least 650 words of synthesis across the required sections.'}
- Keep lightweight citation indexes only at the end of factual paragraphs or bullets, e.g. [1] or [1, 3].
- When a paragraph has both supporting and contradicting evidence, put supporting sources in citationIndexes and contradicting sources in contradictionIndexes. Set support to "conflicted".
- Put evidence gaps, new items, contradictions, stale sections, and changelog entries only in maintenance.
- Preserve likely user-authored notes when they are not duplicate, contradicted, navigation text, or metadata.
- Where it is natural, specific, and directly supported, mention existing related wiki pages by their exact titles in plain text so the article becomes navigable through autolinking. Never emit raw [[wiki link]] syntax, force links, list related pages as a directory, or invent a relationship merely because a page exists.
${formatGitHubRepoPromptBlock({ page, candidates })}${formatInvestmentDossierPromptBlock({ structure, page })}${formatStandardWikiPromptBlock({ structure, page, candidates })}

Page:
Title: ${page.title}
Type: ${page.pageType || 'topic'}
Page intent: ${structure.intent}
${repoPage
    ? `Repo dossier section goals, not mandated headings: ${structure.sections.join(' | ')}`
    : structure.flexibleSections
      ? `Coverage goals, not mandated headings: ${structure.sections.join(' | ')}`
      : `Required section shape, in this order: ${structure.sections.join(' | ')}`}
Existing text: ${existingTextForPrompt}
Creation seed: ${truncate(page.createdFrom?.text || page.createdFrom?.label || '', 1200)}
Manual notes to preserve when useful: ${manualNotes || 'None detected.'}
${recoveryDraftText ? `
Highest-scoring prior rejected candidate to continue from:
${truncateRaw(recoveryDraftText, 30000)}
Prior candidate gate failures:
${(Array.isArray(recoveryDraftQuality?.failures) ? recoveryDraftQuality.failures : []).map(failure => `- ${failure}`).join('\n') || '- Candidate still required quality repair.'}
Preserve its supported analysis and repair these failures. Do not restart from the original scaffold.
` : ''}

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
        "heading": "${structure.flexibleSections ? 'subject-specific section heading' : structure.sections[0]}",
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
  "sourceIndexesUsed": [1, 2],
  "excludedSources": [
    { "index": 4, "reason": "specific reason this owned source does not belong in the article" }
  ]
}`;
};

const buildRebuildPrompt = ({
  page,
  candidates,
  manualNotes = '',
  recoveryDraftText = '',
  recoveryDraftQuality = null,
  wikiSchemaContent = '',
  knownWikiPages = [],
  failures = [],
  draftArticle = null,
  sourceTextLimit = DEFAULT_PROMPT_SOURCE_TEXT_LIMIT,
  repairAttempt = 1
}) => (
  `${buildPrompt({
    page,
    candidates,
    manualNotes,
    recoveryDraftText,
    recoveryDraftQuality,
    wikiSchemaContent,
    knownWikiPages,
    sourceTextLimit
  })}

Your previous draft failed the wiki quality gate:
${failures.map(failure => `- ${failure}`).join('\n') || '- The draft was too thin or scaffold-like.'}

Here is the actual failed draft. Preserve its source-backed substance and repair the listed failures; do not replace a substantive draft with a shorter scaffold:
${draftArticle ? truncateRaw(JSON.stringify(draftArticle), 30000) : 'No recoverable draft body was available.'}

${getWikiPageStructureForPage({ page, candidates }).flexibleSections ? `
Ordinary Wiki repair contract (attempt ${repairAttempt}):
- Return the complete article, not an outline, abstract, or abbreviated rewrite.
- This attempt must directly clear every listed gate failure. Before returning, check the proposed article against each failure line above.
- Budget depth in proportion to the supplied evidence. With five or more sources, use 3-7 subject-specific sections and 6-12 evidence-bearing paragraphs plus a concise opening summary; do not pad a narrow evidence set to imitate an investment dossier.
- If a failure above says the article is too thin, the repair is depth, not volume: take the paragraphs that assert a finding in one sentence and give them the mechanism, the limit, or the consequence the evidence already supports. Do not add sections, restate the summary, or reach the number with filler.
- Use subject-specific headings. Most sections should contain at least two paragraphs that add a definition, mechanism, example, boundary, implication, or unresolved tension.
- Include a concrete case, behavior, worked example, or observable situation appropriate to this subject; do not force a calculation onto a human or historical topic. Make that case unmistakable by introducing it with the literal transition "For example," and cite the evidence that supplies it.
- Explain at least one causal process or organizing structure and one meaningful limit, exception, disagreement, or misconception.
- Give each relevant evidence family a distinct analytical job. Synthesize sources together instead of repeating titles or padding the article.
- Remove repeated sentences and repeated explanations. The opening should orient once; every later section must advance the article with a distinct mechanism, case, boundary, implication, or unresolved tension.
- Replace generic section labels with headings that name the actual subject matter covered there.
- If a source does not directly support the subject, omit it rather than inventing a connection. Keep any resulting evidence gap explicit in Open Questions.
- If the failures name unused owned Library evidence, repair it by having that material shape a real claim — supporting, complicating, or supplying a concrete case — or by listing it in excludedSources with a specific reason. Do not repair it by appending a citation to an unrelated sentence.
` : ''}
Return the complete repaired article. Make defensible claims, compare evidence, and include concrete tensions.`
);

const extractJson = (value = '') => {
  const text = asString(value);
  if (!text) return null;
  const parseLooseJson = (candidate = '') => {
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      // Repair only the mechanical trailing-comma defect commonly returned
      // by free JSON-capable routes. Never guess missing content or structure.
      try {
        return JSON.parse(String(candidate).replace(/,\s*([}\]])/g, '$1'));
      } catch (__error) {
        return null;
      }
    }
  };
  const parsed = parseLooseJson(text);
  if (parsed) return parsed;
  {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      const fencedParsed = parseLooseJson(fenced[1]);
      if (fencedParsed) return fencedParsed;
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return parseLooseJson(text.slice(start, end + 1));
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

const isQualityImprovement = ({ current = {}, retry = {} } = {}) => {
  if (retry?.ok && !current?.ok) return true;
  if (current?.ok && !retry?.ok) return false;
  const currentMetrics = current?.metrics || {};
  const retryMetrics = retry?.metrics || {};
  const currentWords = Number(currentMetrics.words || 0);
  const retryWords = Number(retryMetrics.words || 0);
  if (currentWords > 0 && retryWords < currentWords * 0.6) return false;
  const scaffoldFailureCount = quality => (
    (Array.isArray(quality?.failures) ? quality.failures : [])
      .filter(failure => /scaffold|placeholder/i.test(String(failure || '')))
      .length
  );
  const currentScaffolds = scaffoldFailureCount(current);
  const retryScaffolds = scaffoldFailureCount(retry);
  if (retryScaffolds !== currentScaffolds) return retryScaffolds < currentScaffolds;
  const currentScore = Number(current?.score || 0);
  const retryScore = Number(retry?.score || 0);
  if (retryScore !== currentScore) return retryScore > currentScore;
  const currentFailures = Array.isArray(current?.failures) ? current.failures.length : Number.MAX_SAFE_INTEGER;
  const retryFailures = Array.isArray(retry?.failures) ? retry.failures.length : Number.MAX_SAFE_INTEGER;
  if (retryFailures !== currentFailures) return retryFailures < currentFailures;
  if (Number(retryMetrics.words || 0) !== Number(currentMetrics.words || 0)) {
    return Number(retryMetrics.words || 0) > Number(currentMetrics.words || 0);
  }
  if (Number(retryMetrics.cited || 0) !== Number(currentMetrics.cited || 0)) {
    return Number(retryMetrics.cited || 0) > Number(currentMetrics.cited || 0);
  }
  return Number(retryMetrics.supportedLike || 0) > Number(currentMetrics.supportedLike || 0);
};

const sourceRefFromCandidate = (candidate, { investmentDossier = false } = {}) => {
  const isGitHubConfig = isGitHubRepoCandidate(candidate)
    && /\b(?:package\.json|\.github\/workflows\/[^/]+\.ya?ml)\b/i.test(String(candidate.metadata?.path || candidate.title || ''));
  const snippetLimit = isGitHubConfig
    ? 4000
    : investmentDossier
      ? INVESTMENT_DOSSIER_PROMPT_SOURCE_TEXT_LIMIT
      : 1000;
  return {
    type: candidate.type,
    objectId: candidate.objectId || null,
    parentObjectId: candidate.parentObjectId || null,
    title: truncate(candidate.title, 240),
    snippet: truncate(candidate.text, snippetLimit),
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

// Ordinary Wiki generation may hydrate a Library article beyond the short
// snippet retained on the page's reference card. Quality review must evaluate
// the resulting prose against that same private evidence window, or valid
// claims drawn from later in the source are falsely rejected. Keep the richer
// text ephemeral: this value is passed only to the quality evaluator and is
// never assigned back to page.sourceRefs or a public envelope.
const groundingSourceRefsForCandidates = ({ sourceRefs = [], candidates = [] } = {}) => (
  (Array.isArray(sourceRefs) ? sourceRefs : []).map((sourceRef) => {
    const sourceObjectId = asString(sourceRef?.objectId);
    const sourceUrl = asString(sourceRef?.url);
    const sourceTitle = asString(sourceRef?.title).toLowerCase();
    const sourceType = asString(sourceRef?.type).toLowerCase();
    const candidate = (Array.isArray(candidates) ? candidates : []).find((item) => {
      const candidateObjectId = asString(item?.objectId);
      if (sourceObjectId && candidateObjectId && sourceObjectId === candidateObjectId) return true;
      const candidateUrl = asString(item?.url);
      if (sourceUrl && candidateUrl && sourceUrl === candidateUrl) return true;
      return sourceTitle
        && sourceTitle === asString(item?.title).toLowerCase()
        && (!sourceType || sourceType === asString(item?.type).toLowerCase());
    });
    if (!candidate?.text) return sourceRef;
    return { ...sourceRef, text: candidate.text };
  })
);

const isSecFilingCandidate = (source = {}) => {
  const provider = asString(source?.provider).toLowerCase();
  const metadataProvider = asString(source?.metadata?.source || source?.metadata?.provider).toLowerCase();
  return provider === 'sec-edgar' || metadataProvider === 'sec-edgar';
};

const extractSecFilingEvidenceText = (value = '', limit = SEC_FILING_EVIDENCE_TEXT_LIMIT) => {
  const text = asString(value).replace(/\s+/g, ' ');
  if (text.length <= limit) return text;
  const windows = [];
  const ranges = [];
  const addWindow = ({ start, end, label }) => {
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(text.length, end);
    if (safeEnd <= safeStart || ranges.some(range => safeStart < range.end && safeEnd > range.start)) return;
    const remaining = limit - windows.join('\n\n').length;
    if (remaining < 600) return;
    ranges.push({ start: safeStart, end: safeEnd });
    windows.push(`[Filing excerpt: ${label}]\n${text.slice(safeStart, Math.min(safeEnd, safeStart + remaining))}`);
  };
  addWindow({ start: 0, end: 2400, label: 'filing identity and period' });
  [
    ['business and platform', /\b(?:business overview|our platform|our cloud platform|products and services)\b/ig],
    ['technical infrastructure', /\b(?:technology and infrastructure|accelerated computing|gpu infrastructure|data centers?)\b/ig],
    ['competition', /\bcompetition\b/ig],
    ['customer concentration', /\b(?:customer concentration|major customers?|largest customer)\b/ig],
    ['contracted demand', /\b(?:remaining performance obligations|revenue backlog|contracted backlog)\b/ig],
    ['results of operations', /\b(?:management['’]s discussion and analysis|results of operations)\b/ig],
    ['revenue and cost structure', /\b(?:cost of revenue|gross profit|gross margin|operating loss)\b/ig],
    ['cash flow and capital intensity', /\b(?:cash flows?|capital expenditures?|purchases of property and equipment|depreciation and amortization)\b/ig],
    ['financing and obligations', /\b(?:long-term debt|credit facilit|commitments and contingencies|purchase commitments?|lease liabilities)\b/ig],
    ['power and facilities', /\b(?:power capacity|power commitments?|data center leases?|facility commitments?)\b/ig],
    ['supplier and GPU dependency', /\b(?:NVIDIA|GPU supply|supplier concentration)\b/ig],
    ['material risks', /\bRisk Factors\b/ig]
  ].forEach(([label, pattern]) => {
    const positions = [];
    let match = pattern.exec(text);
    while (match) {
      if (match.index > 1800) positions.push(match.index);
      match = pattern.exec(text);
    }
    if (!positions.length) return;
    const selected = positions.length > 1
      ? [positions[Math.floor(positions.length / 2)], positions.at(-1)]
      : positions;
    selected.forEach(position => addWindow({
      start: position - 700,
      end: position + 3000,
      label
    }));
  });
  return truncateRaw(windows.join('\n\n'), limit);
};

const hydrateSecFilingCandidates = async ({
  candidates = [],
  userId,
  models = {},
  onProgress = null
} = {}) => {
  const WikiSourceEvent = models?.WikiSourceEvent;
  if (!WikiSourceEvent?.find) return candidates;
  const sourceEventIds = candidates
    .filter(isSecFilingCandidate)
    .map(source => asString(source?.metadata?.sourceEventId))
    .filter(Boolean);
  if (!sourceEventIds.length) return candidates;
  let query = WikiSourceEvent.find({
    _id: { $in: sourceEventIds },
    ...(userId ? { userId } : {})
  });
  if (typeof query?.select === 'function') query = query.select('_id text url metadata');
  if (typeof query?.lean === 'function') query = query.lean();
  const events = await query;
  const eventById = new Map(
    (Array.isArray(events) ? events : []).map(event => [asString(event?._id), event])
  );
  return Promise.all(candidates.map(async (source) => {
    if (!isSecFilingCandidate(source)) return source;
    const event = eventById.get(asString(source?.metadata?.sourceEventId));
    let eventText = asString(event?.text);
    const expectedLength = Number(event?.metadata?.filingTextLength || source?.metadata?.filingTextLength || 0);
    const filingUrl = asString(event?.url || source?.url);
    if (
      expectedLength > eventText.length
      && /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//i.test(filingUrl)
    ) {
      try {
        eventText = await withTransientRetries({
          attempts: 3,
          delaysMs: [750, 2000],
          onAttempt: ({ attempt, total }) => (
            attempt > 1
              ? onProgress?.({
                  stage: 'fetch_filings_retry',
                  summary: `SEC filing text was interrupted; retrying automatically (${attempt}/${total}).`,
                  attempt
                })
              : null
          ),
          operation: () => fetchFilingDocument({ url: filingUrl })
        });
      } catch (_error) {
        // Keep the persisted excerpt; the quality gate will reject an under-evidenced dossier.
      }
    }
    if (!eventText || eventText.length <= asString(source.text).length) return source;
    return {
      ...source,
      text: extractSecFilingEvidenceText(eventText)
    };
  }));
};

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

const selectMaintenanceCandidates = ({ page, sources, limit = DEFAULT_SOURCE_LIMIT, preferredSourceObjectId = '' }) => {
  const existingCandidates = collectExistingSourceCandidates({ page });
  if (isGitHubRepoPage({ page, candidates: existingCandidates })) {
    const repoCandidates = existingCandidates.filter(isGitHubRepoCandidate);
    const candidatePool = repoCandidates.length >= Math.min(existingCandidates.length, 8)
      ? repoCandidates
      : existingCandidates;
    if (candidatePool.length) {
      const currentHead = asString(page.externalWatches?.githubRepo?.lastHeadSha);
      const seenPaths = new Set();
      const currentEvidence = candidatePool
        .sort((a, b) => (
          githubRepoEvidenceRank(a, currentHead) - githubRepoEvidenceRank(b, currentHead)
          || asString(a.metadata?.path || a.title).localeCompare(asString(b.metadata?.path || b.title))
        ))
        .filter((source) => {
          const path = asString(source.metadata?.path).toLowerCase();
          if (!path) return true;
          if (seenPaths.has(path)) return false;
          seenPaths.add(path);
          return true;
        });
      // Use the same job-aware priority as deterministic synthesis. The
      // ordinary relevance cap dropped publication and feedback boundaries
      // after GitHub had already collected them.
      return selectRepoFallbackSources(
        currentEvidence,
        Math.max(limit, Math.min(currentEvidence.length, 48))
      )
        .map((source, index) => ({ ...source, index: index + 1 }));
    }
  }
  if (asString(page?.sourceScope).toLowerCase() === 'selected_sources' && existingCandidates.length) {
    const seen = new Set();
    return existingCandidates
      .filter((source) => {
        const key = [source.type, asString(source.objectId), asString(source.url), asString(source.title)].join(':');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map((source, index) => ({ ...source, index: index + 1 }));
  }
  const preferredId = asString(preferredSourceObjectId);
  if (preferredId) {
    const preferred = existingCandidates.filter(source => asString(source.objectId) === preferredId);
    const attached = existingCandidates.filter(source => asString(source.objectId) !== preferredId);
    const library = selectCandidateSources({ page, sources, limit });
    const seen = new Set();
    return [...preferred, ...attached, ...library]
      .filter((source) => {
        const key = [source.type, asString(source.objectId), asString(source.url), asString(source.title)].join(':');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map((source, index) => ({ ...source, index: index + 1 }));
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

const inlineCitationIndexes = (value = '') => {
  const indexes = [];
  String(value || '').replace(/\[([1-9]\d{0,2}(?:\s*,\s*[1-9]\d{0,2})*)\]/g, (_match, group) => {
    group.split(',').forEach(index => indexes.push(Number(index.trim())));
    return _match;
  });
  return normalizeCitationIndexes(indexes);
};

const stripInlineCitationIndexes = (value = '') => (
  String(value || '')
    .replace(/\s*\[([1-9]\d{0,2}(?:\s*,\s*[1-9]\d{0,2})*)\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
);

const citationSuffix = (indexes = []) => {
  const clean = normalizeCitationIndexes(indexes);
  return clean.length ? ` [${clean.join(', ')}]` : '';
};

const normalizeArticleTextBlock = (value = {}) => {
  if (typeof value === 'string') {
    const citationIndexes = inlineCitationIndexes(value);
    return {
      text: truncate(stripInlineCitationIndexes(value), MAX_ARTICLE_BLOCK_TEXT),
      citationIndexes,
      contradictionIndexes: [],
      support: citationIndexes.length ? inferClaimSupport(citationIndexes) : null
    };
  }
  if (!value || typeof value !== 'object') return null;
  const rawText = value.text || value.body || value.summary || '';
  const explicitCitationIndexes = normalizeCitationIndexes(value.citationIndexes || value.sourceIndexes || value.sources);
  const citationIndexes = explicitCitationIndexes.length
    ? explicitCitationIndexes
    : inlineCitationIndexes(rawText);
  const text = truncate(stripInlineCitationIndexes(rawText), MAX_ARTICLE_BLOCK_TEXT);
  if (!text) return null;
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

const mergeAdjacentClaimFragments = (claims = []) => (
  (Array.isArray(claims) ? claims : []).reduce((merged, claim) => {
    const previous = merged[merged.length - 1];
    const sameMarkedClaim = previous
      && claim?.claimId
      && String(previous.claimId || '') === String(claim.claimId)
      && String(previous.section || '') === String(claim.section || '');
    if (!sameMarkedClaim) {
      merged.push(claim);
      return merged;
    }
    previous.text = `${previous.text || ''} ${claim.text || ''}`
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    previous.citationIndexes = Array.from(new Set(normalizeCitationIndexes([
      ...(previous.citationIndexes || []),
      ...(claim.citationIndexes || [])
    ])));
    previous.contradictionIndexes = Array.from(new Set(normalizeCitationIndexes([
      ...(previous.contradictionIndexes || []),
      ...(claim.contradictionIndexes || [])
    ])));
    return merged;
  }, [])
);

const collectClaimsFromDocRaw = (node, section = '') => {
  if (!node) return [];
  if (Array.isArray(node)) {
    let currentSection = section;
    return node.flatMap((child) => {
      const claims = collectClaimsFromDocRaw(child, currentSection);
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
  return [...own, ...collectClaimsFromDocRaw(node.content, nextSection)];
};

// Linkification and other inline transforms can split one marked sentence into
// several text nodes while preserving the same claimId on every fragment. The
// ledger represents the marked sentence, not the editor's incidental node
// boundaries, so reassemble those adjacent fragments before persistence.
const collectClaimsFromDoc = (node, section = '') => (
  mergeAdjacentClaimFragments(collectClaimsFromDocRaw(node, section))
);

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
          summary: truncate(entry.summary || '', 300),
          action: ['reaffirmed', 'revised', 'retired', 'restored'].includes(asString(entry.action))
            ? asString(entry.action)
            : '',
          note: truncate(entry.note || '', 500),
          evidenceDelta: entry.evidenceDelta && typeof entry.evidenceDelta === 'object'
            ? entry.evidenceDelta
            : null,
          actorType: ['user', 'agent', 'system'].includes(asString(entry.actorType))
            ? asString(entry.actorType)
            : 'system'
        }))
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
  JSON.stringify((previous.contradictedByCitationIds || []).map(String).sort()) !== JSON.stringify((next.contradictedByCitationIds || []).map(String).sort()) ||
  asString(previous.epistemicStatus) !== asString(next.epistemicStatus) ||
  asString(previous.materiality) !== asString(next.materiality) ||
  asString(previous.implication) !== asString(next.implication) ||
  JSON.stringify((previous.falsifierIds || []).map(String).sort()) !== JSON.stringify((next.falsifierIds || []).map(String).sort())
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
  confidence: Number.isFinite(Number(claim.confidence)) ? Number(claim.confidence) : null,
  epistemicStatus: claim.epistemicStatus || 'plausible_hypothesis',
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

  const matchedPreviousIds = new Set();
  const nextClaims = (Array.isArray(claims) ? claims : []).map((claim) => {
    const previousById = claim.claimId ? byId.get(String(claim.claimId)) : null;
    const previousByText = byText.get(normalizeClaimIdentity(claim.text));
    const previous = previousById || previousByText || null;
    if (previous?.claimId) matchedPreviousIds.add(String(previous.claimId));
    if (previous?.checkInStatus === 'retired' || previous?.retiredAt) {
      return {
        ...previous,
        checkInStatus: 'retired',
        retiredAt: previous.retiredAt || previous.lastCheckedAt || now,
        history: normalizeClaimHistory(previous.history)
      };
    }
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
      epistemicStatus: previous?.epistemicStatus || claim.epistemicStatus || 'plausible_hypothesis',
      materiality: previous?.materiality || claim.materiality || 'supporting',
      implication: truncate(previous?.implication || claim.implication || '', 4000),
      falsifierIds: Array.isArray(previous?.falsifierIds || claim.falsifierIds)
        ? (previous?.falsifierIds || claim.falsifierIds).map(String).filter(Boolean).slice(0, 100)
        : [],
      lastReviewedAt: now,
      lastVerifiedAt: citationIds.length || sourceRefIds.length
        ? now
        : previous?.lastVerifiedAt || null,
      checkInStatus: previous?.checkInStatus || 'unreviewed',
      lastCheckedAt: previous?.lastCheckedAt || null,
      retiredAt: previous?.retiredAt || null,
      restoredAt: previous?.restoredAt || null,
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
    next.history = history;
    return next;
  });
  (Array.isArray(previousClaims) ? previousClaims : []).forEach((claim) => {
    const previous = claim?.toObject ? claim.toObject() : claim;
    const claimId = String(previous?.claimId || '');
    if (!claimId || matchedPreviousIds.has(claimId)) return;
    if (previous?.checkInStatus !== 'retired' && !previous?.retiredAt) return;
    nextClaims.push({
      ...previous,
      checkInStatus: 'retired',
      retiredAt: previous.retiredAt || previous.lastCheckedAt || now,
      history: normalizeClaimHistory(previous.history)
    });
  });
  return nextClaims;
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

const scriptWorkingDirectory = (script = {}) => {
  const sourcePath = asString(script.sourcePath);
  if (!sourcePath || sourcePath === 'package.json') return 'repository root';
  const parts = sourcePath.split('/').filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join('/')}/` : 'repository root';
};

const scriptRunnableCommand = (script = {}) => {
  if (!script?.name) return '';
  const workingDirectory = scriptWorkingDirectory(script);
  return workingDirectory === 'repository root'
    ? `npm run ${script.name}`
    : `cd ${workingDirectory.replace(/\/$/, '')} && npm run ${script.name}`;
};

const scriptExecutionNote = (script = {}) => {
  const command = asString(script.command);
  if (!command) return '';
  return command.length <= 80
    ? ` (executes ${command})`
    : ` (defined in ${script.sourcePath || 'package.json'})`;
};

const extractEnvVariableNames = (source = {}) => Array.from(new Set(
  Array.from(
    asString(source.text || source.snippet).matchAll(/(?:^|\s)(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/g),
    match => match[1]
  ).filter(Boolean)
));

const prioritizedEnvVariableNames = (source = {}) => {
  const priority = ['PORT', 'JWT_SECRET', 'MONGODB_URI', 'OPENROUTER_API_KEY', 'HF_TOKEN'];
  const names = extractEnvVariableNames(source);
  return [
    ...priority.filter(name => names.includes(name)),
    ...names.filter(name => !priority.includes(name))
  ].slice(0, 12);
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
  /^\.env\.example$/i,
  /^server\/server\.[jt]s$/i,
  /^server\/routes\/authDiscoveryRoutes\.[jt]s$/i,
  /^server\/routes\/wikiRoutes\.[jt]s$/i,
  /^server\/services\/wikiMaintenanceService\.[jt]s$/i,
  /^server\/services\/wikiMaintenancePublicationService\.[jt]s$/i,
  /^server\/services\/githubRepoWatcherService\.[jt]s$/i,
  /^server\/models\/index\.[jt]s$/i,
  /^server\/routes\/agentChatRoutes\.[jt]s$/i,
  /^server\/services\/wikiAskService\.[jt]s$/i,
  /^note-taker-ui\/src\/api\/wiki\.[jt]sx?$/i,
  /^note-taker-ui\/src\/system\/SystemStatusContext\.[jt]sx?$/i,
  /^note-taker-ui\/src\/components\/wiki\/WikiRepoCreateComposer\.[jt]sx?$/i,
  /^note-taker-ui\/src\/components\/wiki\/WikiPageReadView\.[jt]sx?$/i,
  /^note-taker-ui\/src\/pages\/DataIntegrations\.[jt]sx?$/i,
  /^note-taker-ui\/src\/pages\/SharedWikiPage\.[jt]sx?$/i,
  /^server\/services\/wikiScheduledMaintenanceWorker\.[jt]s$/i,
  /^server\/(?:config\/aiClient|ai\/hfTextClient)\.[jt]s$/i,
  /^packages\/wiki-mcp\/(?:README[^/]*|package\.json)$/i
];

const repoSourceDocClass = (source = {}) => asString(source.metadata?.docClass).toLowerCase();

const repoFallbackSourcePriority = (source = {}) => {
  const path = extractRepoPath(source);
  const mandatoryIndex = REPO_FALLBACK_PRIORITY_PATHS.findIndex(pattern => pattern.test(path));
  if (mandatoryIndex >= 0) return mandatoryIndex;
  const docClass = repoSourceDocClass(source);
  if (docClass === 'planned') return 500;
  if (repoSourceEvidenceType(source) === 'policy') return 600;
  const evidenceType = repoSourceEvidenceType(source);
  if (evidenceType === 'inventory') return 40;
  if (evidenceType === 'config') return 50;
  if (evidenceType === 'code') return 60;
  if (evidenceType === 'recent_commits') return 70;
  if (['readme', 'runbook', 'decision', 'document', 'changelog'].includes(docClass)) return 80;
  return 100;
};

const selectRepoFallbackSources = (candidates = [], limit = 48) => {
  const repoCandidates = (Array.isArray(candidates) ? candidates : [])
    .filter(isGitHubRepoCandidate)
    .sort((a, b) => (
      repoFallbackSourcePriority(a) - repoFallbackSourcePriority(b)
      || extractRepoPath(a).localeCompare(extractRepoPath(b))
      || Number(a.index || 0) - Number(b.index || 0)
    ));
  const isNoeisRepo = repoCandidates.some(source => /(?:^|\/)note-taker-3\b/i.test([
    source.title,
    source.url,
    source.metadata?.repo,
    source.metadata?.fullName
  ].filter(Boolean).join(' ')));
  const nonPlanned = repoCandidates.filter(source => repoSourceDocClass(source) !== 'planned');
  const basePool = nonPlanned.length >= Math.min(24, repoCandidates.length)
    ? nonPlanned
    : repoCandidates;
  const selected = basePool.slice(0, 40);
  REPO_FALLBACK_PRIORITY_PATHS.forEach((pattern) => {
    const source = repoCandidates.find(candidate => pattern.test(extractRepoPath(candidate)));
    if (source && !selected.some(candidate => candidate.index === source.index)) selected.push(source);
  });
  if (!isNoeisRepo && selected.length < limit) {
    repoCandidates
      .filter(source => repoSourceDocClass(source) === 'planned')
      .slice(0, 2)
      .forEach((source) => {
        if (!selected.some(candidate => candidate.index === source.index)) selected.push(source);
      });
  }
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
  const scriptLine = (script) => `${scriptWorkingDirectory(script)}: ${scriptRunnableCommand(script)}${scriptExecutionNote(script)} [${script.sourceIndex}]`;
  const runScript = scripts.find(script => /^(start|dev|serve)$/i.test(script.name)) || scripts[0] || null;
  const testScripts = scripts
    .filter(script => /^(wiki:qa|wiki:.*harness|agent:harness(?::ci)?|test|lint)/i.test(script.name))
    .slice(0, 3);
  const buildScripts = scripts.filter(script => /build|deploy/i.test(script.name)).slice(0, 3);
  const keyPathLines = repoSources
    .map(source => ({ path: extractRepoPath(source), index: source.index, type: repoSourceEvidenceType(source) }))
    .filter(row => row.path && ['code', 'config'].includes(row.type))
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
  const inventorySourceIndex = inventorySources[0]?.index;
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
    .filter(source => ['code', 'config'].includes(repoSourceEvidenceType(source)))
    .map(source => extractRepoPath(source))
    .filter(path => path && path !== '__repo_inventory__/code-inventory.txt')
    .slice(0, 14);
  const title = truncate(page.title, 120) || 'Repository wiki';
  const sourceIndexesUsed = Array.from(new Set([
    readmeSource?.index,
    packageSource?.index,
    repoSourceForPath(repoSources, /^\.env\.example$/i)?.index,
    repoSourceForPath(repoSources, /^note-taker-ui\/package\.json$/i)?.index,
    repoSourceForPath(repoSources, /^server\/server\.[jt]s$/i)?.index,
    repoSourceForPath(repoSources, /^server\/routes\/(?:wikiRoutes|authDiscoveryRoutes|agentChatRoutes)\.[jt]s$/i)?.index,
    repoSourceForPath(repoSources, /^server\/services\/wikiMaintenanceService\.[jt]s$/i)?.index,
    repoSourceForPath(repoSources, /^server\/services\/wikiMaintenancePublicationService\.[jt]s$/i)?.index,
    repoSourceForPath(repoSources, /^server\/services\/githubRepoWatcherService\.[jt]s$/i)?.index,
    repoSourceForPath(repoSources, /^server\/services\/wikiScheduledMaintenanceWorker\.[jt]s$/i)?.index,
    repoSourceForPath(repoSources, /^server\/models\/index\.[jt]s$/i)?.index,
    repoSourceForPath(repoSources, /^note-taker-ui\/src\/api\/wiki\.[jt]sx?$/i)?.index,
    repoSourceForPath(repoSources, /^note-taker-ui\/src\/system\/SystemStatusContext\.[jt]sx?$/i)?.index,
    repoSourceForPath(repoSources, /^note-taker-ui\/src\/components\/wiki\/WikiRepoCreateComposer\.[jt]sx?$/i)?.index,
    repoSourceForPath(repoSources, /^note-taker-ui\/src\/components\/wiki\/WikiPageReadView\.[jt]sx?$/i)?.index,
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
  const envVariableNames = envExamplePath ? prioritizedEnvVariableNames(envExamplePath) : [];
  const uiAppPath = repoSourceForPath(repoSources, /^note-taker-ui\/src\/App\.[jt]sx?$/i);
  const mcpPackagePath = repoSourceForPath(repoSources, /^packages\/wiki-mcp\/(?:README[^/]*|package\.json)$/i);
  const aiClientPath = repoSourceForPath(repoSources, /^server\/(?:config\/aiClient|ai\/hfTextClient)\.[jt]s$/i);
  const scheduledWorkerPath = repoSourceForPath(repoSources, /^server\/services\/wikiScheduledMaintenanceWorker\.[jt]s$/i);
  const publicationPath = repoSourceForPath(repoSources, /^server\/services\/wikiMaintenancePublicationService\.[jt]s$/i);
  const authRoutesPath = repoSourceForPath(repoSources, /^server\/routes\/authDiscoveryRoutes\.[jt]s$/i);
  const systemStatusPath = repoSourceForPath(repoSources, /^note-taker-ui\/src\/system\/SystemStatusContext\.[jt]sx?$/i);
  const repoComposerPath = repoSourceForPath(repoSources, /^note-taker-ui\/src\/components\/wiki\/WikiRepoCreateComposer\.[jt]sx?$/i);
  const readViewPath = repoSourceForPath(repoSources, /^note-taker-ui\/src\/components\/wiki\/WikiPageReadView\.[jt]sx?$/i);
  const wikiAskPath = repoSourceForPath(repoSources, /^server\/services\/wikiAskService\.[jt]s$/i);
  const integrationsPath = repoSourceForPath(repoSources, /^note-taker-ui\/src\/pages\/DataIntegrations\.[jt]sx?$/i);
  const sharedWikiPath = repoSourceForPath(repoSources, /^note-taker-ui\/src\/pages\/SharedWikiPage\.[jt]sx?$/i);
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
    publicationPath ? extractRepoPath(publicationPath) : '',
    authRoutesPath ? extractRepoPath(authRoutesPath) : '',
    systemStatusPath ? extractRepoPath(systemStatusPath) : '',
    repoComposerPath ? extractRepoPath(repoComposerPath) : '',
    readViewPath ? extractRepoPath(readViewPath) : '',
    wikiAskPath ? extractRepoPath(wikiAskPath) : '',
    integrationsPath ? extractRepoPath(integrationsPath) : '',
    sharedWikiPath ? extractRepoPath(sharedWikiPath) : '',
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
  const publicationDescription = publicationPath ? 'server/services/wikiMaintenancePublicationService.js owns candidate-versus-published state and preserves the last trusted page when a rebuild fails.' : '';
  const authDescription = authRoutesPath ? 'server/routes/authDiscoveryRoutes.js owns the login/token boundary; authenticated wiki routes remain distinct from deliberately public share serialization.' : '';
  const statusDescription = systemStatusPath ? 'note-taker-ui/src/system/SystemStatusContext.js carries background work, durable receipts, and recoverable failures into the shared status surface.' : '';
  const commandSourceIndexes = Array.from(new Set([
    runScript?.sourceIndex,
    ...testScripts.map(script => script.sourceIndex),
    ...buildScripts.map(script => script.sourceIndex)
  ].filter(Boolean)));
  const runCommandDetail = runScript
    ? `${scriptWorkingDirectory(runScript)}: ${scriptRunnableCommand(runScript)}${scriptExecutionNote(runScript)}`
    : 'No explicit run command was found in the selected package evidence.';
  const uiCommandDetail = uiStartScript
    ? `${scriptWorkingDirectory(uiStartScript)}: ${scriptRunnableCommand(uiStartScript)}${scriptExecutionNote(uiStartScript)}`
    : 'UI start command was not attached; inspect the UI package before inventing one.';
  const proofCommandDetail = testScripts[0]
    ? `${scriptWorkingDirectory(testScripts[0])}: ${scriptRunnableCommand(testScripts[0])}${scriptExecutionNote(testScripts[0])}`
    : 'No explicit wiki/test command was found in the selected package evidence.';
  const buildCommandDetail = buildScripts[0]
    ? `${scriptWorkingDirectory(buildScripts[0])}: ${scriptRunnableCommand(buildScripts[0])}${scriptExecutionNote(buildScripts[0])}`
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
          text: isNoeisRepo
            ? `${productOrientationText} For Noeis work, the product should be understood as one maintained-object system: Library keeps the user's source corpus, Think keeps the active concepts/questions/notebook work, Wiki turns durable ideas into cited pages, and safe public sharing exposes only article/reference material. That product loop matters because backend changes that look local to a route often surface as trust problems in the reader, public share page, command palette, or topbar receipt system.`
            : `${productOrientationText} Treat the README as the product contract and package manifests as executable ownership evidence. In a monorepo, identify the package that owns the behavior, follow its public entrypoint into the implementation, and verify the change with commands actually declared by the repository. Do not transplant product language, commands, or architecture from a different repository.`,
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
          text: `Start from package evidence and keep root commands distinct from nested package commands. A useful first pass is: install with the repository's declared package manager, run the narrow package only when its work is involved, prove behavior with an attached test or lint script, then build before shipping. Do not invent a generic start command; a contributor needs the exact working directory and repository-declared proof command, not a familiar script name borrowed from another project.`,
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
            text: `Environment from .env.example: copy it locally and configure ${envVariableNames.join(', ') || 'the listed variable names'}. Keep values private.`,
            citationIndexes: [envExamplePath.index].filter(Boolean)
          } : null,
          envExamplePath && envVariableNames.includes('PORT') ? {
            text: 'Local URLs: API localhost:5500; UI localhost:3000. The UI development proxy targets the API on port 5500.',
            citationIndexes: [envExamplePath.index, uiPackagePath?.index].filter(Boolean)
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
            text: 'Repo creation: note-taker-ui/src/components/wiki/WikiRepoCreateComposer.jsx -> note-taker-ui/src/api/wiki.js -> POST /api/wiki/pages/from-github -> server/routes/wikiRoutes.js -> server/services/githubRepoWatcherService.js -> server/services/wikiMaintenanceService.js -> server/models/index.js WikiPage persistence -> note-taker-ui/src/components/wiki/WikiPageReadView.jsx.',
            citationIndexes: [repoComposerPath?.index, wikiClientApiPath?.index, wikiRoutesPath?.index, watcherPath?.index, maintenancePath?.index, modelsPath?.index, readViewPath?.index, inventorySourceIndex].filter(Boolean)
          },
          {
            text: 'Repo refresh: externalWatches.githubRepo records observed and candidate heads -> server/services/githubRepoWatcherService.js refreshes read-only evidence -> source events attach to the page -> server/services/wikiMaintenanceService.js builds a candidate -> server/services/wikiMaintenancePublicationService.js publishes only an accepted candidate and otherwise leaves the last trusted page visible.',
            citationIndexes: [watcherPath?.index, maintenancePath?.index, publicationPath?.index, modelsPath?.index, inventorySourceIndex].filter(Boolean)
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
            text: 'System status flow: long-running builds publish background work, success receipts, or recoverable failures through note-taker-ui/src/system/SystemStatusContext.js so the user can distinguish rebuilding, ready, and needs-review states.',
            citationIndexes: [systemStatusPath?.index, wikiClientApiPath?.index, wikiRoutesPath?.index, inventorySourceIndex].filter(Boolean)
          }
        ]
      },
      {
        heading: 'Architecture and ownership',
        paragraphs: [
          repoFallbackParagraph({
            text: [uiAppPath ? uiAppDescription : '', wikiClientApiPath ? wikiClientDescription : '', systemStatusPath ? statusDescription : '', mcpPackagePath ? mcpDescription : ''].filter(Boolean).join(' '),
            sourceIndexes: [uiAppPath?.index, wikiClientApiPath?.index, systemStatusPath?.index, mcpPackagePath?.index].filter(Boolean),
            support: [uiAppPath, wikiClientApiPath, systemStatusPath, mcpPackagePath].some(Boolean) ? 'supported' : 'unsupported'
          }),
          repoFallbackParagraph({
            text: [apiPath ? apiDescription : '', authRoutesPath ? authDescription : 'Authentication boundary: the selected evidence does not identify the login or token-owning route, so its implementation remains unknown.', wikiRoutesPath ? wikiRoutesDescription : '', modelsPath ? modelsDescription : ''].filter(Boolean).join(' '),
            sourceIndexes: [apiPath?.index, authRoutesPath?.index, wikiRoutesPath?.index, modelsPath?.index].filter(Boolean),
            support: [apiPath, authRoutesPath, wikiRoutesPath, modelsPath].some(Boolean) ? 'supported' : 'unsupported'
          }),
          repoFallbackParagraph({
            text: [maintenancePath ? maintenanceDescription : '', publicationPath ? publicationDescription : '', watcherPath ? watcherDescription : '', chatRoutesPath ? chatDescription : '', aiClientPath ? aiDescription : '', scheduledWorkerPath ? workerDescription : ''].filter(Boolean).join(' '),
            sourceIndexes: [maintenancePath?.index, publicationPath?.index, watcherPath?.index, chatRoutesPath?.index, aiClientPath?.index, scheduledWorkerPath?.index].filter(Boolean),
            support: [maintenancePath, publicationPath, watcherPath, chatRoutesPath, aiClientPath, scheduledWorkerPath].some(Boolean) ? 'supported' : 'unsupported'
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
          publicationPath ? {
            text: `${extractRepoPath(publicationPath)}: candidate acceptance, published-head advancement, and last-trusted-page preservation live here.`,
            citationIndexes: [publicationPath.index].filter(Boolean)
          } : null,
          authRoutesPath ? {
            text: `${extractRepoPath(authRoutesPath)}: authentication and token issuance start here; public share access is a separate, deliberately sanitized boundary.`,
            citationIndexes: [authRoutesPath.index].filter(Boolean)
          } : null,
          systemStatusPath ? {
            text: `${extractRepoPath(systemStatusPath)}: background work, receipts, and recoverable failure feedback live here.`,
            citationIndexes: [systemStatusPath.index].filter(Boolean)
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
          text: `Use this as the routing table before editing. Pick the row that matches the visible symptom, open that file first, run its focused sibling test, then run ${primaryProofCommand || 'the repository proof command'}. If the page exists but reads generic, start in generation and evidence selection; if it cannot open, start in route/id/navigation behavior; if it looks stale, start in watch refresh, publication state, and client receipt state.`,
          sourceIndexes: sourceIndexesUsed.slice(0, 8)
        })],
        bullets: [
          bulletForSourcePath({ sources: repoSources, path: 'server/services/wikiMaintenanceService.js', label: 'Generated article is thin or wrong', reason: `change evidence selection, prompts, fallback sections, gates, and citations here; prove with ${primaryProofCommand || 'the wiki quality test'}.` }),
          bulletForSourcePath({ sources: repoSources, path: 'server/services/githubRepoWatcherService.js', label: 'Repository evidence is stale or thin', reason: `change GitHub path selection, fetch behavior, source events, and watch refresh here; run the watcher service test, then ${primaryProofCommand || 'the wiki quality test'}.` }),
          bulletForSourcePath({ sources: repoSources, path: 'server/services/wikiMaintenancePublicationService.js', label: 'A rejected candidate replaced trusted content or head state is wrong', reason: `change publication transaction and head advancement here; run its focused service test, then ${primaryProofCommand || 'the wiki quality test'}.` }),
          bulletForSourcePath({ sources: repoSources, path: 'server/routes/wikiRoutes.js', label: 'Create, rebuild, or public-share API behavior fails', reason: `change repo creation, source attachment, watch, maintenance, and sanitized share routes here; run focused route tests, then ${primaryProofCommand || 'the wiki quality test'}.` }),
          bulletForSourcePath({ sources: repoSources, path: 'server/models/index.js', label: 'Persisted page, watch, claim, or source-reference shape is wrong', reason: 'change model schemas here and prove migration/backward compatibility before the broader wiki gate.' }),
          bulletForSourcePath({ sources: repoSources, path: 'server/services/wikiAskService.js', label: 'Wiki answers ignore graph context', reason: `change graph-aware retrieval here; run wikiAskService.test.js, then ${primaryProofCommand || 'the wiki quality test'}.` }),
          bulletForSourcePath({ sources: repoSources, path: 'note-taker-ui/src/components/wiki/WikiPageReadView.jsx', label: 'Reader layout or live build feedback is wrong', reason: `change the maintained-page reader here; run WikiPageReadView.test.jsx and ${buildCommandDetail}.` }),
          bulletForSourcePath({ sources: repoSources, path: 'note-taker-ui/src/system/SystemStatusContext.js', label: 'Background progress, receipt, or recoverable failure is missing', reason: 'change the shared status contract here and run SystemStatusContext.test.js.' }),
          bulletForSourcePath({ sources: repoSources, path: 'note-taker-ui/src/pages/DataIntegrations.jsx', label: 'Notion, Readwise, or Evernote connection UX is wrong', reason: `change connection status and sync presentation here; run DataIntegrations.test.jsx and ${buildCommandDetail}.` }),
          bulletForSourcePath({ sources: repoSources, path: 'note-taker-ui/src/pages/SharedWikiPage.jsx', label: 'Public wiki presentation leaks private chrome or cannot scroll', reason: `change the public share surface here while preserving server-side serialization; run SharedWikiPage.test.jsx and ${buildCommandDetail}.` })
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
  const genericImplementationSection = !isNoeisRepo && (codeSources.length || configSources.length) ? {
    heading: 'Implementation map',
    paragraphs: [repoFallbackParagraph({
      text: 'Read the repository as a set of explicit package boundaries. Root configuration establishes workspace-wide commands and dependency policy; nested manifests identify independently owned packages; public index files define supported imports; and implementation modules behind those entrypoints own runtime behavior. Start at the narrowest public boundary that matches the change, then trace inward. This keeps a contributor from editing an example, generated artifact, or adjacent package that resembles the real owner but does not ship the behavior.',
      sourceIndexes: [...configSources.slice(0, 6), ...codeSources.slice(0, 2)].map(source => source.index),
      support: 'supported'
    }), repoFallbackParagraph({
      text: 'For agent frameworks, inspect the run loop, model/provider boundary, tool invocation, handoff behavior, guardrails, tracing, realtime support, and extension packages separately when those modules are present. These are distinct contracts: a change to orchestration can affect tool execution and handoffs without belonging in the model adapter, while a provider change should not silently rewrite the agent lifecycle. The exact package and file names below are the attached evidence; anything absent remains unknown.',
      sourceIndexes: codeSources.slice(0, 8).map(source => source.index),
      support: codeSources.length ? 'supported' : 'unsupported'
    })],
    bullets: [...configSources.slice(0, 8), ...codeSources.slice(0, 14)].map(source => ({
      text: `${extractRepoPath(source) || source.title}: ${repoSourceEvidenceType(source) === 'config' ? 'package or workflow boundary; inspect declared scripts, exports, dependencies, and workspace role.' : 'implementation evidence; inspect its exports and callers before changing the owning flow.'}`,
      citationIndexes: [source.index],
      support: 'supported'
    }))
  } : null;
  const genericProofSection = !isNoeisRepo ? {
    heading: 'How to prove a change',
    paragraphs: [repoFallbackParagraph({
      text: `Use repository-declared commands as the source of truth. Begin with the narrowest package test or lint command covering the edited module, then run the broader workspace proof when the change crosses package boundaries. The selected evidence reports the run command as ${runCommandDetail}, the first available proof command as ${proofCommandDetail}, and the build command as ${buildCommandDetail}. A missing command is an evidence gap, not permission to invent a conventional start script or substitute a command from another project.`,
      sourceIndexes: commandSourceIndexes.length ? commandSourceIndexes : configSources.slice(0, 4).map(source => source.index),
      support: commandSourceIndexes.length ? 'supported' : 'partial'
    }), repoFallbackParagraph({
      text: 'Review workflow files and contribution documentation for required runtimes, package managers, formatting, type checks, generated artifacts, and integration suites. Separate local command success from CI and release truth: a declared script proves how to invoke a check, not that the current commit passed it. After implementation, record the exact working directory, command, result, and any unverified external condition so the next maintainer can reproduce the proof.',
      sourceIndexes: [...configSources.slice(0, 8), ...currentDocumentSources.slice(0, 4)].map(source => source.index),
      support: 'supported'
    })],
    bullets: [...configSources.slice(0, 10), ...currentDocumentSources.slice(0, 6)].map(source => ({
      text: `${extractRepoPath(source) || source.title}: use this evidence to verify commands, contribution constraints, or current documented behavior; do not infer live CI or release status from its presence alone.`,
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
        genericImplementationSection,
        genericProofSection,
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
        heading: `What ${topic} means`,
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
        heading: 'What the current sources establish',
        paragraphs: top.length
          ? [{
              text: `The current evidence base is broad enough to suggest direction but not yet deep enough to settle the page. The most useful sources should be compared for agreement, contradiction, and specificity rather than copied into the article as summaries.`,
              citationIndexes: top.slice(0, 4).map(source => source.index)
            }]
          : [{ text: `No matching library evidence was found during this maintenance pass.`, citationIndexes: [] }],
        bullets: []
      },
      {
        heading: 'Limits of the current evidence',
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
        heading: 'Questions this page must resolve',
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
    structure: getWikiPageStructureForPage({ page, candidates }),
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

const fillInvestmentDossierMaintenanceTest = ({ article = {}, page = {}, candidates = [] } = {}) => {
  const structure = getWikiPageStructureForPage({ page, candidates });
  if (structure.profile !== 'investment_dossier') return article;
  const citationIndexes = candidates.filter(isSecFilingCandidate).map(source => source.index).slice(0, 4);
  if (!citationIndexes.length) return article;
  return {
    ...article,
    sections: (Array.isArray(article.sections) ? article.sections : []).map((section) => {
      if (normalizeSectionHeading(section?.heading) !== 'next evidence and maintenance test') return section;
      const sectionText = JSON.stringify(section || {});
      if (!/\bstill needs source-backed development\b/i.test(sectionText)) return section;
      const companyLabel = asString(page?.externalWatches?.edgar?.companyName || page?.title)
        .replace(/\s+investment dossier$/i, '')
        .trim() || 'the company';
      return {
        ...section,
        paragraphs: [{
          text: `At ${companyLabel}'s next 10-Q, compare revenue growth with cost of revenue, technology and infrastructure expense, operating loss, operating cash flow, remaining performance obligation conversion, customer concentration, and debt or lease obligations. Before that filing, review any 8-K for material customer-contract, financing, capacity, or supplier changes. Treat each change as a candidate update until the owner accepts the revised judgment.`,
          citationIndexes,
          contradictionIndexes: [],
          support: 'partial'
        }],
        bullets: []
      };
    })
  };
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
  const rawArticleSource = raw.article && typeof raw.article === 'object'
    ? {
        ...raw.article,
        // Smaller structured-output models commonly close `article` after
        // the summary and emit sections beside it. Preserve the substantive
        // response instead of replacing it with the generic fallback.
        sections: Array.isArray(raw.article.sections) && raw.article.sections.length
          ? raw.article.sections
          : raw.sections,
        preservedUserContent: raw.article.preservedUserContent || raw.preservedUserContent,
        summary: typeof raw.article.summary === 'string' && (
          raw.article.citationIndexes || raw.article.sourceIndexes || raw.article.support
        )
          ? {
              text: raw.article.summary,
              citationIndexes: raw.article.citationIndexes || raw.article.sourceIndexes,
              contradictionIndexes: raw.article.contradictionIndexes,
              support: raw.article.support
            }
          : raw.article.summary
      }
    : {
      summary: raw.summary,
      sections: raw.sections,
      preservedUserContent: raw.preservedUserContent
    };
  const normalizedArticle = normalizeArticle({
    rawArticle: rawArticleSource,
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
        structure: getWikiPageStructureForPage({ page, candidates }),
        article: normalizedArticle
      });
  article = fillInvestmentDossierMaintenanceTest({ article, page, candidates });
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
    }),
    excludedSources: normalizeExclusions(raw.excludedSources || raw.excludedSourceIndexes || [])
  };
};

const countWords = (value = '') => asString(value).split(/\s+/).filter(Boolean).length;
const escapeRegex = (value = '') => asString(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const evaluateWikiArticleQuality = ({
  page,
  body,
  claims = [],
  sourceRefs = [],
  availableSourceCount = null,
  excludedSources = [],
  selectedSources = [],
  now = new Date(),
  skipDurableCitationCheck = false
} = {}) => {
  const plainText = toPlainText(body || page?.body || '');
  const titlePattern = escapeRegex(page?.title || '');
  const words = countWords(titlePattern ? plainText.replace(new RegExp(`^${titlePattern}\\s*`, 'i'), '') : plainText);
  const sourceCount = Array.isArray(sourceRefs) ? sourceRefs.length : 0;
  const ordinaryEvidenceWordCount = (Array.isArray(sourceRefs) ? sourceRefs : [])
    .reduce((total, source) => total + countWords([
      source?.snippet,
      source?.quote,
      source?.text
    ].filter(Boolean).join(' ')), 0);
  const evidenceBudgetSourceCount = Number.isFinite(Number(availableSourceCount))
    ? Math.max(sourceCount, Number(availableSourceCount))
    : sourceCount;
  const claimList = Array.isArray(claims) ? claims : [];
  const supportedLike = claimList.filter(claim => ['supported', 'partial', 'conflicted'].includes(normalizeClaimSupport(claim.support))).length;
  const unsupported = claimList.filter(claim => normalizeClaimSupport(claim.support) === 'unsupported').length;
  const partial = claimList.filter(claim => normalizeClaimSupport(claim.support) === 'partial').length;
  const cited = claimList.filter(claim => (
    (claim.citationIds || []).length ||
    (claim.sourceRefIds || []).length ||
    (claim.citationIndexes || []).length
  )).length;
  const uncitedSupported = claimList.filter(claim => (
    ['supported', 'conflicted'].includes(normalizeClaimSupport(claim.support))
    && !(claim.citationIds || []).length
    && !(claim.sourceRefIds || []).length
    && !(claim.citationIndexes || []).length
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
  let topicallyGroundedSourceCount = null;
  let evidenceFamilyCount = null;
  let ordinaryHeadingCount = null;
  let ordinaryEvidenceBlockCount = null;
  let ordinaryCoverageSignals = null;
  let ordinaryGroundingGaps = [];
  let ordinaryRepeatedSentences = [];
  let ordinaryGenericHeadingCount = null;
  let ownedSourceUtilization = null;
  const failures = [];

  SCAFFOLD_PATTERNS.forEach(({ label, pattern }) => {
    if (pattern.test(plainText)) failures.push(`Article contains ${label}.`);
  });
  const isRepoQualityPage = isGitHubRepoPage({ page, candidates: sourceRefs });
  const isInvestmentQualityPage = getWikiPageStructureForPage({
    page,
    candidates: sourceRefs
  }).profile === 'investment_dossier';
  const ordinaryStructure = getWikiPageStructureForPage({ page, candidates: sourceRefs });
  const isFlexibleReferencePage = !isRepoQualityPage
    && !isInvestmentQualityPage
    && ordinaryStructure.flexibleSections;
  if (isFlexibleReferencePage) {
    const headings = collectDocHeadings(body || page?.body || {})
      .map(heading => heading.toLowerCase().trim());
    ordinaryHeadingCount = headings.length;
    ordinaryEvidenceBlockCount = docClaims.length;
    ordinaryGroundingGaps = findOrdinaryGroundingGaps({
      claims: docClaims,
      sourceRefs
    });
    ordinaryRepeatedSentences = findOrdinaryRepeatedSentences(docClaims);
    const genericHeadingCount = headings.filter(heading => GENERIC_REFERENCE_HEADINGS.has(heading)).length;
    ordinaryGenericHeadingCount = genericHeadingCount;
    if (headings.length >= 4 && genericHeadingCount >= Math.ceil(headings.length * 0.75)) {
      failures.push('Ordinary reference article uses generic template headings instead of subject-specific sections.');
    } else if (genericHeadingCount > 0) {
      failures.push(`Ordinary reference article contains ${genericHeadingCount} generic section heading${genericHeadingCount === 1 ? '' : 's'}; give every substantial section a subject-specific analytical role.`);
    }
    const fillerCount = ORDINARY_REFERENCE_FILLER_PATTERNS
      .reduce((count, pattern) => count + (pattern.test(plainText) ? 1 : 0), 0);
    if (fillerCount >= 2) {
      failures.push('Ordinary reference article relies on generic scene-setting instead of definitions, mechanisms, or evidence.');
    }
    if (ordinaryGroundingGaps.length) {
      failures.push(`Ordinary reference article introduces claims with no lexical anchor in their cited evidence: ${ordinaryGroundingGaps.map(gap => `"${gap}"`).join('; ')}`);
    }
    if (ordinaryRepeatedSentences.length) {
      failures.push(`Ordinary reference article repeats substantive sentences across sections instead of advancing the synthesis: ${ordinaryRepeatedSentences.map(sentence => `"${sentence}"`).join('; ')}`);
    }
    const topicalTitle = primaryTopicTitle(page?.title || '') || asString(page?.title);
    const titleTopicTokens = topicTokens(topicalTitle);
    topicallyGroundedSourceCount = sourceRefs.filter(source => (
      sourceTopicCoverage(source, topicalTitle) >= 0.8
    )).length;
    evidenceFamilyCount = new Set(sourceRefs.map(sourceFamilyKey).filter(Boolean)).size;
    // Selecting the user's material is not the same as using it. Bind every
    // owned source family to a visible claim, an explicit exclusion, or a
    // failure — so a page can never look personalized on reference cards alone.
    const utilization = evaluateOwnedSourceUtilization({
      sourceRefs,
      selectedSources,
      topic: topicalTitle,
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes,
      exclusions: excludedSources
    });
    ownedSourceUtilization = utilization.metrics;
    utilization.failures.forEach(failure => failures.push(failure));
    if (!sourceCount && !skipDurableCitationCheck) {
      failures.push('Ordinary reference article has no cited Library sources; add or import material that directly explains the subject before rebuilding.');
    }
    if (sourceCount && titleTopicTokens.length >= 1 && topicallyGroundedSourceCount === 0) {
      failures.push(`No cited source directly addresses the page subject "${asString(page?.title)}"; add or import a source that explains the topic before rebuilding.`);
    }
    if (sourceCount >= 4 && evidenceFamilyCount < 2) {
      failures.push('Ordinary reference article draws all evidence from one source family; add an independent source or narrow the article to what that source alone establishes.');
    }
    ordinaryCoverageSignals = {
      mechanism: ORDINARY_MECHANISM_PATTERNS.some(pattern => pattern.test(plainText)),
      example: ORDINARY_EXAMPLE_PATTERNS.some(pattern => pattern.test(plainText)),
      boundary: ORDINARY_BOUNDARY_PATTERNS.some(pattern => pattern.test(plainText))
    };
    if (evidenceBudgetSourceCount >= 5) {
      const minimumEvidenceBlocks = Math.max(6, Math.min(8, Math.ceil(evidenceBudgetSourceCount * 1.15)));
      if (ordinaryHeadingCount < 3) {
        failures.push(`Ordinary reference article has too little subject structure: ${ordinaryHeadingCount} sections, expected at least 3 subject-shaped sections for ${evidenceBudgetSourceCount} available sources.`);
      }
      if (ordinaryEvidenceBlockCount < minimumEvidenceBlocks) {
        failures.push(`Ordinary reference article has too few evidence-bearing blocks: ${ordinaryEvidenceBlockCount}, expected at least ${minimumEvidenceBlocks} for ${evidenceBudgetSourceCount} available sources.`);
      }
      if (!ordinaryCoverageSignals.mechanism) {
        failures.push('Ordinary reference article does not explain a causal process or organizing mechanism.');
      }
      if (!ordinaryCoverageSignals.example) {
        failures.push('Ordinary reference article lacks a concrete example, case, or observable situation.');
      }
      if (!ordinaryCoverageSignals.boundary) {
        failures.push('Ordinary reference article lacks a meaningful limit, exception, disagreement, or boundary.');
      }
      const minimumUsedSources = Math.min(4, evidenceBudgetSourceCount);
      if (usedCitationIndexes.length < minimumUsedSources) {
        failures.push(`Ordinary reference article underuses its evidence: ${usedCitationIndexes.length}/${evidenceBudgetSourceCount} available sources cited, expected at least ${minimumUsedSources}.`);
      }
    }
    const firstArticleClaim = docClaims[0] || null;
    if (sourceCount && firstArticleClaim && !(firstArticleClaim.citationIndexes || []).length) {
      failures.push('Ordinary reference article opens with an uncited definition or synthesis.');
    }
    if (danglingCitationIndexes.length) {
      failures.push(`Ordinary reference article has dangling citation indexes: ${danglingCitationIndexes.slice(0, 8).join(', ')}.`);
    }
    // The first materialization happens before Mongoose assigns durable ids to
    // newly retained sourceRefs. Enforce this at the persisted quality pass,
    // but do not force a second model generation merely because ids do not yet
    // exist in the pre-save object graph.
    if (!skipDurableCitationCheck && uncitedSupported > 0) {
      failures.push(`Ordinary reference article marks claims as supported without durable citations: ${uncitedSupported}.`);
    }
    const equivalencePattern = /\b(?:mathematically identical|formally identical|exactly equivalent|the same mechanism)\b/i;
    if (
      equivalencePattern.test(plainText)
      && !sourceRefs.some(source => equivalencePattern.test([
        source.snippet,
        source.quote,
        source.text
      ].filter(Boolean).join(' ')))
    ) {
      failures.push('Ordinary reference article asserts a formal equivalence that the cited source text does not establish.');
    }
  }
  const wordGateSourceCount = isFlexibleReferencePage ? evidenceBudgetSourceCount : sourceCount;
  const minWords = isRepoQualityPage
    ? GITHUB_REPO_MIN_WORDS
    : (isFlexibleReferencePage
        ? ordinaryArticleMinimumWords({
            sourceCount: wordGateSourceCount,
            evidenceWordCount: ordinaryEvidenceWordCount
          })
        : (wordGateSourceCount >= 5 ? QUALITY_MIN_WORDS_WITH_MANY_SOURCES : QUALITY_MIN_WORDS));
  if (wordGateSourceCount >= 3 && words < minWords) {
    failures.push(`Article is too thin for ${wordGateSourceCount} available sources: ${words} words, expected at least ${minWords}.`);
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
  if (!isInvestmentQualityPage
    && claimList.length >= 6
    && unsupported + partial > Math.ceil(claimList.length * 0.75)) {
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

  const investmentDossierQuality = isInvestmentQualityPage
    ? evaluateInvestmentDossierQuality({
        page,
        body: body || page?.body || {},
        claims: claimList,
        sourceRefs,
        words
      })
    : null;
  if (investmentDossierQuality && !investmentDossierQuality.ok) {
    investmentDossierQuality.failures.forEach(failure => failures.push(failure));
  }

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
      availableSourceCount: evidenceBudgetSourceCount,
      claimCount: claimList.length,
      supportedLike,
      unsupported,
      partial,
      cited,
      uncitedSupported,
      usedSourceCount: usedCitationIndexes.length,
      usedSubstantiveSourceCount,
      claimsPerUsedSource: repoClaimsPerUsedSource,
      danglingCitationCount: danglingCitationIndexes.length,
      topicallyGroundedSourceCount,
      evidenceFamilyCount,
      ordinaryHeadingCount,
      ordinaryEvidenceBlockCount,
      ordinaryCoverageSignals,
      ordinaryGroundingGapCount: ordinaryGroundingGaps.length,
      ordinaryRepeatedSentenceCount: ordinaryRepeatedSentences.length,
      ordinaryGenericHeadingCount,
      ownedSourceUtilization,
      durableCitationCheckSkipped: Boolean(skipDurableCitationCheck),
      ...(investmentDossierQuality
        ? { investmentDossier: investmentDossierQuality.metrics }
        : {})
    }
  };
};

const inferMaintainedPageType = ({ page, candidates = [] } = {}) => {
  if (isGitHubRepoPage({ page, candidates })) return 'repo';
  const current = asString(page?.pageType).toLowerCase();
  // Page type is user-owned architecture. Source count must not silently turn
  // a topic into an overview or make an ordinary Wiki dossier-shaped.
  if (current) return current;
  const createdType = asString(page?.createdFrom?.type).toLowerCase();
  const title = asString(page?.title).toLowerCase();
  if (['article', 'highlight', 'notebook', 'external', 'paste', 'sources'].includes(createdType)) return 'source';
  if (/\b(overview|strategy|strategies|landscape|system|systems|concepts|ideas)\b/i.test(title)) return 'overview';
  if (candidates.length >= 5) return 'overview';
  return 'concept';
};

const materializeMaintenanceResult = async ({ page, normalized, candidates, previousClaims, now, userId, models, autolinkCandidates = null }) => {
  const investmentDossier = getWikiPageStructureForPage({
    page,
    candidates
  }).profile === 'investment_dossier';
  const sourceRefs = normalized.sourceIndexesUsed
    .map(index => candidates.find(source => source.index === index))
    .filter(Boolean)
    .map(candidate => sourceRefFromCandidate(candidate, { investmentDossier }));
  const mergedSourceRefs = mergeMandatoryGitHubRepoSourceRefs({
    page,
    candidates,
    sourceRefs: dedupeSourceRefs(sourceRefs)
  });
  const qualitySourceRefs = groundingSourceRefsForCandidates({
    sourceRefs: mergedSourceRefs,
    candidates
  });
  // Model citation indexes address the candidate list. The rendered reference
  // list contains only retained, deduplicated sources, so every page type must
  // translate candidate positions into final reference positions before the
  // body and claim ledger are materialized. Repo pages already did this; doing
  // it only there left ordinary Wiki pages with visible markers such as [17]
  // against a ten-item reference list.
  const article = remapRepoArticleCitationIndexes({
    article: normalized.article,
    candidates,
    sourceRefs: mergedSourceRefs
  });
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
  const compiledInvestmentDossier = investmentDossier
    ? compileInvestmentDossierResearchPlan({
        profile: page.investmentDossier || {},
        page,
        candidates,
        claims,
        sourceRefs: mergedSourceRefs,
        now
      })
    : page.investmentDossier;
  const linkedBody = await applyKnownWikiLinks({
    page,
    body,
    plainText,
    userId,
    models,
    autolinkCandidates
  });
  return {
    title: normalized.title || page.title,
    body: linkedBody,
    plainText,
    sourceRefs: mergedSourceRefs,
    citations,
    claims,
    quality: evaluateWikiArticleQuality({
      page: {
        ...page,
        title: normalized.title || page.title,
        investmentDossier: compiledInvestmentDossier
      },
      body: linkedBody,
      claims,
      sourceRefs: qualitySourceRefs,
      availableSourceCount: candidates.length,
      // Ordinary Wiki utilization is measured against what the account actually
      // selected, not only against what survived onto the reference card.
      selectedSources: investmentDossier || isGitHubRepoPage({ page, candidates })
        ? []
        : collectExistingSourceCandidates({ page }),
      excludedSources: resolveExclusionFamilies({
        exclusions: normalized.excludedSources || [],
        sources: candidates
      }),
      now,
      skipDurableCitationCheck: true
    })
  };
};

const applyKnownWikiLinks = async ({
  page,
  body,
  plainText,
  userId,
  models = {},
  autolinkCandidates = null
} = {}) => {
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
    models: { WikiPage },
    // A large personal Wiki must not turn article publication into a
    // full-corpus scan just to add optional links.
    limit: AUTOLINK_CANDIDATE_LIMIT,
    // Reuse the candidate set this build already loaded. Matching still runs
    // against the current attempt's prose; only the repeated fetch is skipped.
    candidatePages: autolinkCandidates
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
  preferredSourceObjectId = '',
  recoveryDraftText = '',
  recoveryDraftQuality = null,
  skipQualityRebuild = false,
  streamDraft = false,
  onProgress = null
}) => {
  const normalizedProfile = normalizeMaintenanceProfile(maintenanceProfile);
  const fastProfile = normalizedProfile === 'fast';
  const effectiveSourceLimit = Number.isFinite(Number(sourceLimit)) && Number(sourceLimit) > 0
    ? Number(sourceLimit)
    : (fastProfile ? FAST_SOURCE_LIMIT : DEFAULT_SOURCE_LIMIT);
  const requestedSourceTextLimit = Number.isFinite(Number(sourceTextLimit)) && Number(sourceTextLimit) > 0
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
  const attachedCandidates = collectExistingSourceCandidates({ page });
  const investmentDossierAtStart = getWikiPageStructureForPage({
    page,
    candidates: attachedCandidates
  }).profile === 'investment_dossier';
  const allSources = asString(page?.sourceScope).toLowerCase() === 'selected_sources' || investmentDossierAtStart
    ? []
    : await collectLibrarySources({ userId, models, fastProfile, page });
  const selectionPage = investmentDossierAtStart
    ? {
        ...(typeof page?.toObject === 'function' ? page.toObject() : page),
        sourceScope: 'selected_sources'
      }
    : page;
  let candidates = selectMaintenanceCandidates({
    page: selectionPage,
    sources: allSources,
    limit: effectiveSourceLimit,
    preferredSourceObjectId
  });
  await emitProgress({
    stage: 'fetch_filings',
    summary: candidates.length
      ? 'Loading saved filing evidence and completing any missing SEC document text.'
      : 'Checking the page for saved SEC filing evidence.',
    sourceCount: candidates.length
  });
  candidates = await hydrateSecFilingCandidates({
    candidates,
    userId,
    models,
    onProgress: emitProgress
  });
  await emitProgress({
    stage: 'parse_filings',
    summary: `${candidates.length} saved source${candidates.length === 1 ? '' : 's'} ready for analysis.`,
    sourceCount: candidates.length
  });
  // Spend the build's source-text allowance now that the final source count is
  // known. Everything downstream — the prompt and the evidence gate alike — reads
  // candidate text from here, so the writer and its judge stay on the same window
  // by construction.
  candidates = applySourceTextBudget(candidates);
  const budgetedSourceTextLimit = perSourceTextBudget(candidates.length);
  const repoMaintenance = isGitHubRepoPage({ page, candidates });
  const investmentDossier = getWikiPageStructureForPage({ page, candidates }).profile === 'investment_dossier';
  if (investmentDossier) {
    page.investmentDossier = upgradeInvestmentDossierProfile({
      profile: page.investmentDossier || {},
      page,
      candidates,
      now
    });
    if (typeof page.markModified === 'function') page.markModified('investmentDossier');
  }
  const explicitSourceTextLimit = Number.isFinite(Number(sourceTextLimit)) && Number(sourceTextLimit) > 0;
  const effectiveSourceTextLimit = investmentDossier
    ? (explicitSourceTextLimit
        ? Math.min(requestedSourceTextLimit, INVESTMENT_DOSSIER_PROMPT_SOURCE_TEXT_LIMIT)
        : INVESTMENT_DOSSIER_PROMPT_SOURCE_TEXT_LIMIT)
    // A caller asking for less than the budget still gets less — the fast profile
    // is entitled to trade context for latency. A caller that says nothing gets the
    // budget rather than the old flat default, which is what starved single-source
    // pages.
    : (explicitSourceTextLimit
        ? Math.min(requestedSourceTextLimit, budgetedSourceTextLimit)
        : budgetedSourceTextLimit);
  const ordinaryFlexibleMaintenance = !investmentDossier
    && !repoMaintenance
    && getWikiPageStructureForPage({ page, candidates }).flexibleSections;
  const draftTemperature = repoMaintenance ? 0.08 : (ordinaryFlexibleMaintenance ? 0.1 : 0.2);
  const rebuildTemperature = repoMaintenance ? 0.12 : (ordinaryFlexibleMaintenance ? 0.12 : 0.28);
  const draftMaxTokens = investmentDossier
    ? INVESTMENT_DOSSIER_DRAFT_MAX_TOKENS
    : (ordinaryFlexibleMaintenance ? ORDINARY_WIKI_MAX_TOKENS : DEFAULT_DRAFT_MAX_TOKENS);
  const rebuildMaxTokens = investmentDossier
    ? INVESTMENT_DOSSIER_REBUILD_MAX_TOKENS
    : (ordinaryFlexibleMaintenance ? ORDINARY_WIKI_MAX_TOKENS : DEFAULT_REBUILD_MAX_TOKENS);
  const textGenerationConfig = getTextGenerationConfig();
  const dossierModelRoutes = investmentDossier
    ? (textGenerationConfig.noReasoningArtifactRoutes || [])
    : [];
  const boundedOrdinaryRoutes = (route = 'artifact_draft') => (
    ordinaryFlexibleMaintenance
      // Keep the latency cap, but never achieve it by cutting off the
      // configured free route. A paid primary can fail immediately on account
      // budget; the second slot must retain a usable fallback instead of a
      // second paid model with the same failure mode.
      ? selectBoundedOrdinaryModelRoutes(textGenerationConfig.routeProfiles?.[route] || [])
      : []
  );
  const knownWikiPages = await collectKnownWikiPages({
    page,
    userId,
    models,
    limit: fastProfile ? 16 : 40
  });
  // Load the autolink candidate set once per build. Every materialize pass —
  // the first draft and each quality repair — used to re-run this scan to get
  // the same rows back, so a two-repair build paid for it three times and threw
  // two away with the drafts they linked.
  const autolinkCandidates = modelForPage({ page, models })
    ? await loadAutolinkCandidates({
        targetPage: { _id: asString(page?._id || page?.id), id: page?.id },
        userId,
        models: { WikiPage: modelForPage({ page, models }) },
        limit: AUTOLINK_CANDIDATE_LIMIT
      })
    : null;
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
        maxTokens: draftMaxTokens,
        temperature: draftTemperature,
        reasoningEffort: investmentDossier || ordinaryFlexibleMaintenance ? '' : draftReasoningEffort,
        reasoning: investmentDossier || ordinaryFlexibleMaintenance ? { effort: 'none' } : null,
        modelRoutes: investmentDossier ? dossierModelRoutes : boundedOrdinaryRoutes('artifact_draft'),
        responseFormat: ordinaryFlexibleMaintenance ? null : { type: 'json_object' },
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
              recoveryDraftText,
              recoveryDraftQuality,
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
        completion = await withTransientRetries({
          // chatComplete already walks the configured provider/model routes.
          // Repeating that whole fallback cycle multiplied an ordinary Wiki
          // build into several minutes without adding a new recovery strategy.
          attempts: ordinaryFlexibleMaintenance ? 1 : 3,
          delaysMs: ordinaryFlexibleMaintenance ? [] : [1000, 3000],
          onAttempt: ({ attempt, total }) => (
            attempt > 1
              ? emitProgress({
                  stage: 'model_retry',
                  summary: `The model request was interrupted; retrying automatically (${attempt}/${total}).`,
                  attempt
                })
              : null
          ),
          operation: () => chat(draftRequest)
        });
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
        stage: investmentDossier ? 'model_unavailable' : 'model_fallback',
        summary: investmentDossier
          ? 'The research model was unavailable before drafting; preserving the saved evidence for Resume.'
          : 'Maintenance model failed; falling back to deterministic synthesis.',
        errorCode: Number(error?.status || 0) === 402
          ? 'MODEL_BUDGET_UNAVAILABLE'
          : 'MODEL_REQUEST_FAILED'
      });
      if (investmentDossier) throw error;
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
    models,
    autolinkCandidates
  });

  const shouldRebuildInline = shouldInlineQualityRebuild({
    quality: materialized.quality,
    plainText: materialized.plainText,
    fastProfile,
    skipQualityRebuild
  });

  if (!materialized.quality.ok && candidates.length && isConfigured() && shouldRebuildInline) {
    const repoPage = isGitHubRepoPage({ page, candidates });
    // A single repair pass reliably moves an ordinary article toward the gate
    // without reaching it — trimming generic headings and adding depth, but
    // still landing short of the length its own evidence supports. Creation
    // already had a second pass; maintenance was left with one and therefore
    // published rejected candidates it was one attempt away from fixing.
    //
    // This is not an unbounded retry loop. The break below stops as soon as the
    // remaining failures are no longer editorially repairable, so a page that
    // is failing for a reason more prose cannot fix still costs one attempt.
    const maxQualityRebuildAttempts = ordinaryFlexibleMaintenance ? 2 : 1;
    for (let repairAttempt = 1; repairAttempt <= maxQualityRebuildAttempts && !materialized.quality.ok; repairAttempt += 1) {
      if (repairAttempt > 1) {
        const remainingFailures = (materialized.quality.failures || []).join(' ');
        const editorialRepairStillActionable = /repeats substantive sentences|generic section heading|concrete example|too thin|lexical anchor|uncited|underuses its evidence|owned Library evidence|owned Library source|causal process|meaningful limit/i.test(remainingFailures);
        if (!editorialRepairStillActionable) break;
      }
      try {
      await emitProgress({
        stage: 'quality_rebuild',
        summary: `The candidate missed quality gates; making bounded evidence repair ${repairAttempt}/${maxQualityRebuildAttempts}.`,
        failures: materialized.quality.failures || [],
        repairAttempt,
        maxRepairAttempts: maxQualityRebuildAttempts
      });
      const rebuildRequest = {
        // The ordinary-page repair prompt is already the critic: it carries
        // the exact failed draft and gate failures. Reusing artifact_draft
        // keeps the repair on the responsive route that produced the first
        // candidate, instead of moving recovery onto a slower route that can
        // exhaust every provider before returning any article.
        route: 'artifact_draft',
        maxTokens: rebuildMaxTokens,
        temperature: rebuildTemperature,
        reasoningEffort: investmentDossier || ordinaryFlexibleMaintenance ? '' : 'medium',
        reasoning: investmentDossier || ordinaryFlexibleMaintenance ? { effort: 'none' } : null,
        modelRoutes: investmentDossier
          ? dossierModelRoutes
          : boundedOrdinaryRoutes('artifact_draft'),
        responseFormat: ordinaryFlexibleMaintenance ? null : { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: ordinaryFlexibleMaintenance
              ? `You are a strict, source-faithful reference editor. Repair only the listed quality failures using relationships and examples directly established by the supplied evidence. Do not invent connective claims to make the article sound more opinionated or complete. Return JSON only.${formatWikiSchemaPromptBlock(wikiSchemaContent)}`
              : `You are a strict, opinionated wiki editor. Your job is to rebuild weak wiki pages into real synthesis. Return JSON only.${formatWikiSchemaPromptBlock(wikiSchemaContent)}`
          },
          {
            role: 'user',
            content: buildRebuildPrompt({
              page,
              candidates,
              manualNotes,
              recoveryDraftText,
              recoveryDraftQuality,
              wikiSchemaContent,
              knownWikiPages,
              failures: materialized.quality.failures,
              draftArticle: finalNormalized.article,
              sourceTextLimit: effectiveSourceTextLimit,
              repairAttempt
            })
          }
        ]
      };
      const completion = await withTransientRetries({
        attempts: ordinaryFlexibleMaintenance ? 1 : 3,
        delaysMs: ordinaryFlexibleMaintenance ? [] : [1000, 3000],
        onAttempt: ({ attempt, total }) => (
          attempt > 1
            ? emitProgress({
                stage: 'quality_rebuild_retry',
                summary: `The evidence rebuild was interrupted; retrying automatically (${attempt}/${total}).`,
                attempt,
                repairAttempt
              })
            : null
        ),
        operation: () => chat(rebuildRequest)
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
          models,
          autolinkCandidates
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
            models,
            autolinkCandidates
          });
        }
        if (isQualityImprovement({ current: materialized.quality, retry: retryMaterialized.quality })) {
          const previousFailures = materialized.quality.failures;
          finalNormalized = finalRetryNormalized;
          materialized = {
            ...retryMaterialized,
            quality: {
              ...retryMaterialized.quality,
              fallbackApplied: retryFallbackApplied,
              rebuiltAutomatically: true,
              previousFailures,
              rebuildAttempts: repairAttempt
            }
          };
          rebuiltAutomatically = true;
          await emitProgress({
            stage: 'quality_rebuilt',
            summary: 'Automatic rebuild completed.',
            model: modelInfo.model,
            provider: modelInfo.provider,
            repairAttempt
          });
        } else {
          materialized.quality = {
            ...materialized.quality,
            rebuildAttempted: true,
            rebuildRejected: true,
            retryFailures: retryMaterialized.quality?.failures || [],
            rebuildAttempts: repairAttempt
          };
          await emitProgress({
            stage: 'quality_rebuild_preserved',
            summary: 'The retry scored worse; preserving the stronger first draft.',
            model: modelInfo.model,
            provider: modelInfo.provider,
            repairAttempt
          });
        }
      }
      } catch (_error) {
        materialized.quality = {
          ...materialized.quality,
          rebuildAttempted: true,
          rebuildError: 'Automatic rebuild failed.',
          rebuildAttempts: repairAttempt
        };
        await emitProgress({
          stage: 'quality_rebuild_failed',
          summary: 'Automatic rebuild failed; preserving the best available draft for Resume.',
          repairAttempt
        });
      }
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
      models,
      autolinkCandidates
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
  page.sourceScope = investmentDossier
    ? 'selected_sources'
    : (['entire_library', 'current_item', 'selected_sources'].includes(asString(page.sourceScope))
        ? asString(page.sourceScope)
        : 'entire_library');
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
  if (investmentDossier) {
    page.investmentDossier = compileInvestmentDossierResearchPlan({
      profile: page.investmentDossier || {},
      page,
      candidates,
      claims: page.claims,
      sourceRefs: persistedSourceRefs,
      now
    });
    if (typeof page.markModified === 'function') page.markModified('investmentDossier');
  }
  await emitProgress({
    stage: 'claims_built',
    summary: `${page.claims.length} claim${page.claims.length === 1 ? '' : 's'} extracted into the evidence ledger.`,
    claimCount: page.claims.length
  });
  const persistedGroundingSourceRefs = groundingSourceRefsForCandidates({
    sourceRefs: persistedSourceRefs,
    candidates
  });
  let persistedQuality = evaluateWikiArticleQuality({
    page,
    body: page.body,
    claims: page.claims,
    sourceRefs: persistedGroundingSourceRefs,
    availableSourceCount: candidates.length,
    now,
    skipDurableCitationCheck: isGitHubRepoPage({ page, candidates })
  });
  await emitProgress({
    stage: 'evidence_gate',
    summary: persistedQuality.ok
      ? `The ${investmentDossier || repoMaintenance ? 'dossier' : 'Wiki article'} reached the evidence bar.`
      : `The ${investmentDossier || repoMaintenance ? 'dossier' : 'Wiki article'} needs stronger evidence before it can become a trusted head.`,
    failureCount: Array.isArray(persistedQuality.failures) ? persistedQuality.failures.length : 0
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
      models,
      autolinkCandidates
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
    page.sourceScope = investmentDossier
      ? 'selected_sources'
      : (['entire_library', 'current_item', 'selected_sources'].includes(asString(page.sourceScope))
          ? asString(page.sourceScope)
          : 'entire_library');
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
      availableSourceCount: candidates.length,
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
    sourceScopeAtDraft: page.sourceScope || (investmentDossier ? 'selected_sources' : 'entire_library'),
    sourceRefIdsAtDraft: page.sourceScope === 'entire_library'
      ? []
      : persistedSourceRefs.map(source => source.objectId).filter(Boolean),
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
    perSourceTextBudget,
    applySourceTextBudget,
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
    fallbackGitHubRepoMaintenance,
    materializeMaintenanceResult,
    formatKnownWikiPages,
    buildPrompt,
    selectBoundedOrdinaryModelRoutes,
    normalizeModelResult,
    normalizeArticleTextBlock,
    findOrdinaryGroundingGaps,
    ordinaryArticleMinimumWords,
    // Exported so the live eval asserts against the same heading vocabulary the
    // gate enforces, rather than a second list that can drift away from it.
    GENERIC_REFERENCE_HEADINGS,
    collectDocHeadings,
    sourceFamilyKey,
    sourceTopicCoverage,
    groundingSourceRefsForCandidates,
    buildRebuildPrompt,
    evaluateWikiArticleQuality,
    inferMaintainedPageType,
    isGitHubRepoPage,
    selectMaintenanceCandidates,
    extractSecFilingEvidenceText,
    hydrateSecFilingCandidates,
    fillInvestmentDossierMaintenanceTest,
    findUnsupportedGitHubRepoClaims,
    findGitHubRepoDeveloperDossierFailures,
    cleanWikiText,
    toPlainText
  }
};
