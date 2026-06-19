const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { formatWikiSchemaPromptBlock } = require('./wikiSchemaService');
const { isWikiPageSurfaceEligible } = require('./wikiPageQualityGuard');

/**
 * wikiAskService — answers a user's question about a wiki page using the page
 * body, attached source refs, and related wiki pages as context. Returns a TipTap doc
 * whose paragraphs/bullets are wrapped in the same `claim` mark the
 * maintenance pipeline emits, so the existing citation popover works on
 * answer text without any extra plumbing.
 *
 * Falls back to a deterministic stub when the HF client is unconfigured
 * (dev) so the round-trip is testable end-to-end.
 */

const MAX_PAGE_TEXT = 6000;
const MAX_SOURCE_TEXT = 800;
const MAX_QUESTION = 500;
const MAX_ANSWER_PARAGRAPHS = 6;
const MAX_RELATED_PAGES = 3;
const MAX_RELATED_PAGE_TEXT = 1400;
const MAX_GRAPH_HIGHLIGHTS = 5;
const MAX_GRAPH_CONCEPTS = 4;
const MAX_GRAPH_BACKLINKS = 4;
const MAX_WIKI_PAGE_SCAN = 200;
const MAX_WIKI_PAGE_CANDIDATES = 80;
const EXACT_SENTENCE_STOPWORDS = new Set([
  'about', 'answer', 'exact', 'from', 'page', 'quote', 'sentence', 'this',
  'verbatim', 'word', 'wording', 'words'
]);

const asString = (value = '') => String(value || '').trim();

const truncate = (value = '', limit = 1000) => {
  const text = asString(value).replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
};

const splitIntoSentences = (value = '') => {
  const placeholders = new Map();
  let index = 0;
  const protectedText = asString(value)
    .replace(/\s+/g, ' ')
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./gi, (match) => {
      const key = `__ABBR_${index}__`;
      index += 1;
      placeholders.set(key, match);
      return key;
    });
  return (protectedText.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [])
    .map((sentence) => {
      let restored = sentence.trim();
      placeholders.forEach((match, key) => {
        restored = restored.replace(key, match);
      });
      return restored;
    })
    .filter(Boolean);
};

const truncateAtSentenceBoundary = (value = '', limit = 1000) => {
  const text = asString(value).replace(/\s+/g, ' ');
  if (text.length <= limit) return text;
  const visible = text.slice(0, Math.max(0, limit));
  const lastSentenceEnd = Math.max(
    visible.lastIndexOf('.'),
    visible.lastIndexOf('!'),
    visible.lastIndexOf('?')
  );
  if (lastSentenceEnd >= Math.floor(limit * 0.55)) {
    return visible.slice(0, lastSentenceEnd + 1).trim();
  }
  return truncate(text, limit);
};

const isExactSentenceRequest = (question = '') => (
  /\b(exact|verbatim|quote|sentence|wording|word-for-word)\b/i.test(question)
);

const isSourceChangeQuestion = (question = '') => (
  /\b(changed?|updated?|new|ingest|source|added|since)\b/i.test(question)
);

const isSummaryRequest = (question = '') => (
  /\b(summarize|summary|overview|tl;?dr|tldr|main\s+(?:point|points|idea|ideas|thesis|takeaway|takeaways)|what\s+is\s+this\s+page\s+about)\b/i.test(question)
);

const requestedBulletCount = (question = '') => {
  const match = asString(question).match(/\b(?:give\s+me\s+|in\s+)?([2-6])\s*[- ]?(?:bullet|point)s?\b/i);
  if (!match) return 0;
  return Math.max(2, Math.min(6, Number(match[1]) || 0));
};

const extractQuestionTokens = (question = '') => {
  const tokens = asString(question)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]{2,}/g) || [];
  const deduped = [];
  const seen = new Set();
  tokens.forEach((token) => {
    if (EXACT_SENTENCE_STOPWORDS.has(token) || seen.has(token)) return;
    seen.add(token);
    deduped.push(token);
  });
  return deduped;
};

const ANSWER_STOPWORDS = new Set([
  ...EXACT_SENTENCE_STOPWORDS,
  'after', 'again', 'against', 'argument', 'between', 'could', 'does', 'from',
  'have', 'here', 'main', 'page', 'really', 'should', 'that', 'their', 'there',
  'these', 'thing', 'this', 'what', 'when', 'where', 'which', 'with', 'would'
]);

const extractAnswerTokens = (value = '') => (
  (asString(value).toLowerCase().match(/[a-z0-9][a-z0-9'-]{3,}/g) || [])
    .filter(token => !ANSWER_STOPWORDS.has(token))
);

const scoreTextForQuestion = (text = '', question = '') => {
  const haystack = asString(text).toLowerCase();
  if (!haystack) return 0;
  return extractAnswerTokens(question)
    .reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
};

const normalizeComparableText = (value = '') => (
  asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const serializeObjectId = (value = '') => String(value?._id || value?.id || value || '').trim();

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WIKI_TITLE_MENTION_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'connect',
  'does',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'only',
  'or',
  'page',
  'relate',
  'related',
  'the',
  'this',
  'to',
  'what',
  'where',
  'why',
  'with'
]);

const normalizeTitleCandidate = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const exactTitleRegex = (title = '') => {
  const escaped = escapeRegExp(String(title || '').trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`^\\s*${escaped}\\s*$`, 'i');
};

const extractMentionedTitleCandidates = ({
  question = '',
  selectedTitle = '',
  limit = 32
} = {}) => {
  const normalizedSelected = normalizeTitleCandidate(selectedTitle);
  const words = String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const seen = new Set();
  const candidates = [];
  for (let size = Math.min(5, words.length); size >= 2; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const chunk = words.slice(index, index + size);
      if (chunk.every(word => WIKI_TITLE_MENTION_STOPWORDS.has(word))) continue;
      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      if (WIKI_TITLE_MENTION_STOPWORDS.has(first) || WIKI_TITLE_MENTION_STOPWORDS.has(last)) continue;
      const candidate = chunk.join(' ');
      const normalized = normalizeTitleCandidate(candidate);
      if (!normalized || normalized === normalizedSelected || seen.has(normalized)) continue;
      seen.add(normalized);
      candidates.push(candidate);
      if (candidates.length >= limit) return candidates;
    }
  }
  return candidates;
};

const mergeWikiPages = (primaryPages = [], extraPages = []) => {
  const rows = [];
  const seen = new Set();
  [...(Array.isArray(primaryPages) ? primaryPages : []), ...(Array.isArray(extraPages) ? extraPages : [])]
    .filter(Boolean)
    .forEach((page) => {
      const key = serializeObjectId(page) || normalizeTitleCandidate(page.title);
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      rows.push(page);
    });
  return rows;
};

const isSelectedPageOnlyQuestion = (question = '') => (
  !/\b(?:not|don't|do\s+not)\s+(?:only|just)\s+(?:use\s+)?(?:this|the)\s+(?:page|wiki\s+page)\b/i.test(question)
  && !/\b(?:not|don't|do\s+not)\s+(?:answer\s+)?(?:only|just)\s+from\s+(?:this|the)\s+(?:page|wiki\s+page)\b/i.test(question)
  && !/\bfrom\s+the\s+graph\b|\buse\s+the\s+graph\b|\bgraph\b.*\bnot\s+(?:just|only)\b/i.test(question)
  && (
    /\b(on|from|in)\s+(this|the)\s+(page|wiki\s+page)\s+only\b/i.test(question)
    || /\b(only|just)\s+(this|the)\s+(page|wiki\s+page)\b/i.test(question)
    || /\bscope(?:d)?\s+to\s+(this|the)\s+page\b/i.test(question)
    || /\banswer\s+(only|just)\s+from\s+(this|the)\s+page\b/i.test(question)
  )
);

const pageTitleMentionedInQuestion = (title = '', question = '') => {
  const normalizedTitle = normalizeComparableText(title);
  const normalizedQuestion = normalizeComparableText(question);
  if (!normalizedTitle || normalizedTitle.length < 3 || !normalizedQuestion) return false;
  return normalizedQuestion.includes(normalizedTitle);
};

const rankWikiPageCandidates = ({
  page,
  relatedPages = [],
  question = '',
  selectedPageOnly = false,
  limit = MAX_WIKI_PAGE_CANDIDATES
} = {}) => {
  const currentId = serializeObjectId(page);
  const pool = (Array.isArray(relatedPages) ? relatedPages : [])
    .filter(candidate => serializeObjectId(candidate) && serializeObjectId(candidate) !== currentId);
  if (selectedPageOnly) return pool.slice(0, Math.max(0, limit));

  const scored = pool.map((candidate) => {
    const title = truncate(candidate.title, 200) || 'Untitled page';
    const plainText = asString(candidate.plainText) || pageBodySentenceText(candidate);
    const titleMentioned = pageTitleMentionedInQuestion(title, question);
    const tokenScore = scoreTextForQuestion(`${title} ${plainText}`, question);
    return {
      candidate,
      score: (titleMentioned ? 100 : 0) + tokenScore,
      title
    };
  });
  scored.sort((left, right) => (
    right.score - left.score
    || left.title.localeCompare(right.title)
  ));
  const prioritized = scored.filter(row => row.score > 0).map(row => row.candidate);
  const remainder = scored.filter(row => row.score <= 0).map(row => row.candidate);
  return [...prioritized, ...remainder].slice(0, Math.max(0, limit));
};

const buildRelatedPageContexts = ({
  page,
  relatedPages = [],
  question = '',
  limit = MAX_RELATED_PAGES,
  selectedPageOnly = false
} = {}) => {
  if (selectedPageOnly) return [];
  const currentId = serializeObjectId(page);
  const normalizedQuestion = normalizeComparableText(question);
  const questionTokens = extractAnswerTokens(question);
  const rows = (Array.isArray(relatedPages) ? relatedPages : [])
    .filter(Boolean)
    .filter(candidate => serializeObjectId(candidate) && serializeObjectId(candidate) !== currentId)
    .map((candidate) => {
      const title = truncate(candidate.title, 200) || 'Untitled page';
      const plainText = asString(candidate.plainText) || pageBodySentenceText(candidate);
      const normalizedTitle = normalizeComparableText(title);
      const titleMentioned = normalizedTitle && normalizedQuestion.includes(normalizedTitle);
      const tokenScore = questionTokens.reduce((score, token) => {
        const haystack = normalizeComparableText(`${title} ${plainText}`);
        return score + (haystack.includes(token) ? 1 : 0);
      }, 0);
      const score = (titleMentioned ? 20 : 0) + tokenScore + scoreTextForQuestion(`${title} ${plainText}`, question);
      return {
        id: serializeObjectId(candidate),
        title,
        slug: candidate.slug || '',
        pageType: candidate.pageType || 'topic',
        plainText: truncateAtSentenceBoundary(plainText, MAX_RELATED_PAGE_TEXT),
        score
      };
    })
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, Math.max(0, limit));
  return rows;
};

const buildGraphHighlightContexts = ({
  page,
  relatedPages = [],
  relatedPageContexts = [],
  question = '',
  limit = MAX_GRAPH_HIGHLIGHTS
} = {}) => {
  const relatedIds = new Set(relatedPageContexts.map(candidate => candidate.id));
  const pages = [
    page,
    ...(Array.isArray(relatedPages) ? relatedPages : []).filter((candidate) => {
      const id = serializeObjectId(candidate);
      return relatedIds.has(id) || pageTitleMentionedInQuestion(candidate?.title, question);
    })
  ].filter(Boolean);
  const seen = new Set();
  const rows = [];
  pages.forEach((sourcePage) => {
    const fromPageTitle = truncate(sourcePage?.title, 160) || 'Untitled page';
    (Array.isArray(sourcePage?.sourceRefs) ? sourcePage.sourceRefs : []).forEach((ref) => {
      if (ref?.type !== 'highlight') return;
      const key = serializeObjectId(ref._id || ref.objectId || ref.id);
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      const snippet = truncateAtSentenceBoundary(ref.snippet || ref.text, 320);
      const title = truncate(ref.title, 200) || 'Highlight';
      const score = scoreTextForQuestion(`${title} ${snippet}`, question)
        + (pageTitleMentionedInQuestion(fromPageTitle, question) ? 2 : 0);
      if (score <= 0 && !relatedIds.has(serializeObjectId(sourcePage))) return;
      rows.push({
        id: key || `highlight-${rows.length}`,
        title,
        snippet,
        fromPageTitle,
        score
      });
    });
  });
  return rows
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, Math.max(0, limit));
};

const buildConceptContexts = ({
  question = '',
  conceptRecords = [],
  relatedPageContexts = [],
  limit = MAX_GRAPH_CONCEPTS
} = {}) => {
  const seen = new Set();
  const rows = [];
  const addRow = (row) => {
    const key = normalizeComparableText(row.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  (Array.isArray(conceptRecords) ? conceptRecords : []).forEach((record) => {
    const name = truncate(record?.name, 160);
    if (!name) return;
    if (!pageTitleMentionedInQuestion(name, question) && scoreTextForQuestion(name, question) <= 0) return;
    addRow({
      id: serializeObjectId(record),
      name,
      description: truncate(record?.description || record?.workspaceTemplateName, 420),
      source: 'tag_meta'
    });
  });

  relatedPageContexts
    .filter(candidate => candidate.pageType === 'concept')
    .forEach((candidate) => {
      addRow({
        id: candidate.id,
        name: candidate.title,
        description: truncate(candidate.plainText, 420),
        source: 'wiki_page'
      });
    });

  return rows.slice(0, Math.max(0, limit));
};

const buildBacklinkContexts = ({
  question = '',
  backlinkRows = [],
  relatedPageContexts = [],
  limit = MAX_GRAPH_BACKLINKS
} = {}) => {
  const relatedTitles = new Set(relatedPageContexts.map(candidate => normalizeComparableText(candidate.title)));
  return (Array.isArray(backlinkRows) ? backlinkRows : [])
    .map((row) => {
      const title = truncate(row?.title, 160) || 'Untitled wiki page';
      const snippet = truncateAtSentenceBoundary(row?.snippet || '', 260);
      const forPageTitle = truncate(row?.forPageTitle, 160);
      const score = scoreTextForQuestion(`${title} ${snippet} ${forPageTitle}`, question)
        + (relatedTitles.has(normalizeComparableText(forPageTitle)) ? 2 : 0);
      return {
        pageId: serializeObjectId(row?.pageId || row?._id),
        title,
        snippet,
        forPageTitle,
        mentionCount: Number(row?.mentionCount) || 0,
        score
      };
    })
    .filter(row => row.score > 0 || row.mentionCount > 0)
    .sort((left, right) => right.score - left.score || right.mentionCount - left.mentionCount)
    .slice(0, Math.max(0, limit));
};

const buildGraphSearchSummary = ({
  page,
  relatedPageContexts = [],
  highlightContexts = [],
  conceptContexts = [],
  backlinkContexts = [],
  selectedPageOnly = false
} = {}) => {
  const pageTitle = truncate(page?.title, 120) || 'the selected page';
  if (selectedPageOnly) return `Searched ${pageTitle} only.`;
  const parts = [pageTitle];
  if (relatedPageContexts.length) {
    parts.push(`${relatedPageContexts.length} related wiki page${relatedPageContexts.length === 1 ? '' : 's'}`);
  }
  if (highlightContexts.length) {
    parts.push(`${highlightContexts.length} highlight${highlightContexts.length === 1 ? '' : 's'}`);
  }
  if (conceptContexts.length) {
    parts.push(`${conceptContexts.length} concept record${conceptContexts.length === 1 ? '' : 's'}`);
  }
  if (backlinkContexts.length) {
    parts.push(`${backlinkContexts.length} backlink${backlinkContexts.length === 1 ? '' : 's'}`);
  }
  return `Searched ${parts.join(', ')}.`;
};

const provenanceFromContext = ({
  page,
  sources = [],
  relatedPageContexts = [],
  highlightContexts = [],
  conceptContexts = [],
  backlinkContexts = [],
  bridgeInsight = '',
  selectedPageOnly = false,
  searchedSummary = ''
} = {}) => {
  const wikiPages = [
    {
      id: serializeObjectId(page),
      title: truncate(page?.title, 160) || 'Selected page',
      role: 'selected'
    },
    ...relatedPageContexts.map(candidate => ({
      id: candidate.id,
      title: candidate.title,
      role: 'related'
    }))
  ].filter(item => item.id || item.title);
  const attachedHighlights = sources.filter(source => source.type === 'highlight').length;
  const graphHighlights = highlightContexts.length;
  const highlightCount = attachedHighlights + graphHighlights;
  const nonHighlightSources = sources.filter(source => source.type !== 'highlight').length;
  const conceptNames = new Set(conceptContexts.map(entry => normalizeComparableText(entry.name)).filter(Boolean));
  const extraWikiConcepts = relatedPageContexts.filter(
    candidate => candidate.pageType === 'concept'
      && !conceptNames.has(normalizeComparableText(candidate.title))
  ).length;
  const conceptCount = conceptContexts.length + extraWikiConcepts;
  const parts = [];
  if (wikiPages.length) parts.push(`${wikiPages.length} wiki page${wikiPages.length === 1 ? '' : 's'}`);
  if (highlightCount) parts.push(`${highlightCount} highlight${highlightCount === 1 ? '' : 's'}`);
  if (conceptCount) parts.push(`${conceptCount} concept${conceptCount === 1 ? '' : 's'}`);
  if (nonHighlightSources) {
    parts.push(`${nonHighlightSources} source${nonHighlightSources === 1 ? '' : 's'}`);
  }
  const graphExpanded = !selectedPageOnly && (
    relatedPageContexts.length > 0
    || highlightContexts.length > 0
    || conceptContexts.length > 0
    || backlinkContexts.length > 0
  );
  return {
    mode: selectedPageOnly ? 'page_only' : (graphExpanded ? 'graph_expanded' : 'page_first'),
    bridgeInsight: bridgeInsight || '',
    summary: parts.length
      ? `Used ${parts.join(' · ')}`
      : (selectedPageOnly ? 'Used selected page only' : 'Used selected page'),
    searchedSummary: searchedSummary || '',
    wikiPages,
    highlightCount,
    sourceCount: nonHighlightSources,
    conceptCount,
    backlinkCount: backlinkContexts.length
  };
};

const topRelevantSentences = ({ page, sources = [], question = '', limit = 3 } = {}) => {
  const sentences = splitIntoSentences(pageBodySentenceText(page));
  const pageMatches = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreTextForQuestion(sentence, question), citationIndexes: [] }))
    .filter(entry => entry.score > 0);
  const sourceMatches = sources
    .map(source => ({
      sentence: source.snippet,
      index: source.index,
      score: scoreTextForQuestion(`${source.title} ${source.snippet}`, question),
      citationIndexes: [source.index]
    }))
    .filter(entry => entry.score > 0 && entry.sentence);
  return [...pageMatches, ...sourceMatches]
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, limit));
};

const pickExactPageSentence = ({ page, question } = {}) => {
  if (!isExactSentenceRequest(question)) return '';
  const pageText = pageBodySentenceText(page);
  if (!pageText) return '';
  const sentences = splitIntoSentences(pageText);
  if (!sentences.length) return '';
  const queryTokens = extractQuestionTokens(question);
  if (!queryTokens.length) return sentences[0];
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const score = queryTokens.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);
    return { sentence, index, score };
  });
  const best = scored.sort((left, right) => right.score - left.score || left.index - right.index)[0];
  return best?.score > 0 ? best.sentence : '';
};

const toPlainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(toPlainText).filter(Boolean).join(' ');
  if (typeof node !== 'object') return '';
  const own = typeof node.text === 'string' ? node.text : '';
  const child = Array.isArray(node.content) ? toPlainText(node.content) : '';
  return [own, child].filter(Boolean).join(' ').trim();
};

const toTextBlocks = (node) => {
  const blocks = [];
  const walk = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== 'object') return;
    if (['paragraph', 'blockquote', 'listItem'].includes(value.type)) {
      const text = toPlainText(value);
      if (text) blocks.push(text);
      return;
    }
    walk(value.content);
  };
  walk(node);
  return blocks;
};

const pageBodySentenceText = (page = {}) => {
  const blocks = toTextBlocks(page?.body)
    .map(text => asString(text).replace(/\s+/g, ' '))
    .filter(Boolean);
  return blocks.length ? blocks.join(' ') : asString(toPlainText(page?.body)).replace(/\s+/g, ' ');
};

const collectPageHeadings = (node) => {
  const headings = [];
  const walk = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== 'object') return;
    if (value.type === 'heading') {
      const text = toPlainText(value);
      if (text) headings.push(text);
      return;
    }
    walk(value.content);
  };
  walk(node);
  return headings;
};

const firstMeaningfulSentence = (value = '') => {
  const sentences = splitIntoSentences(value)
    .map(sentence => asString(sentence).replace(/\[[0-9,\s]+\]\s*$/g, '').trim())
    .filter(sentence => sentence.length >= 24);
  return sentences[0] || truncateAtSentenceBoundary(value, 240);
};

const buildPageSummaryAnswer = ({ page, question = '' } = {}) => {
  const title = truncate(page?.title, 120) || 'This page';
  const pageText = pageBodySentenceText(page);
  const lead = firstMeaningfulSentence(pageText);
  const leadStem = lead.replace(/[.!?]\s*$/g, '');
  const headings = collectPageHeadings(page?.body)
    .map(heading => truncate(heading, 80))
    .filter(Boolean)
    .filter((heading, index, list) => list.findIndex(item => normalizeComparableText(item) === normalizeComparableText(heading)) === index)
    .filter(heading => !/^references?$/i.test(heading))
    .slice(0, 5);
  const bulletCount = requestedBulletCount(question);
  if (bulletCount > 0) {
    const bullets = [];
    if (lead) bullets.push(`${title}: ${lead}`);
    headings.slice(0, bulletCount - bullets.length).forEach((heading) => {
      bullets.push(`Covers ${heading.toLowerCase()} as part of the page's structure.`);
    });
    while (bullets.length < bulletCount && pageText) {
      const nextSentence = splitIntoSentences(pageText).find(sentence => (
        sentence !== lead && !bullets.some(existing => normalizeComparableText(existing).includes(normalizeComparableText(sentence).slice(0, 40)))
      ));
      if (!nextSentence) break;
      bullets.push(truncateAtSentenceBoundary(nextSentence, 220));
    }
    return {
      paragraphs: bullets.slice(0, bulletCount).map(text => ({ text, citationIndexes: [] })),
      citationIndexesUsed: []
    };
  }
  const sectionPhrase = headings.length
    ? `, spanning ${headings.slice(0, 3).join(', ')}${headings.length > 3 ? ', and related sections' : ''}`
    : '';
  const summary = lead
    ? `${title} argues that ${leadStem.charAt(0).toLowerCase()}${leadStem.slice(1)}${sectionPhrase}.`
    : `${title} is a sparse wiki page that needs more source-backed development before it can be summarized reliably.`;
  return {
    paragraphs: [{ text: truncateAtSentenceBoundary(summary.replace(/\s+/g, ' '), 420), citationIndexes: [] }],
    citationIndexesUsed: []
  };
};

let claimSeed = 0;
const claimMark = (citationIndexes = [], maxCitationIndex = Infinity) => {
  claimSeed += 1;
  const maxIndex = Number.isFinite(Number(maxCitationIndex)) ? Number(maxCitationIndex) : Infinity;
  const indexes = Array.isArray(citationIndexes)
    ? citationIndexes.map(Number).filter(Number.isFinite).filter(index => index > 0).slice(0, 6)
      .filter(index => index <= maxIndex)
    : [];
  const support = indexes.length === 0 ? 'unsupported' : indexes.length === 1 ? 'partial' : 'supported';
  return {
    type: 'claim',
    attrs: {
      claimId: `ask-${Date.now()}-${claimSeed}`,
      support,
      citationIndexes: indexes
    }
  };
};

const claimParagraph = (text, citationIndexes = [], maxCitationIndex = Infinity) => ({
  type: 'paragraph',
  content: [{
    type: 'text',
    text: asString(text) || ' ',
    marks: [claimMark(citationIndexes, maxCitationIndex)]
  }]
});

const buildSourceList = (sourceRefs = []) => {
  const list = Array.isArray(sourceRefs) ? sourceRefs.slice(0, 12) : [];
  return list.map((source, index) => ({
    index: index + 1,
    title: truncate(source?.title, 240) || 'Untitled source',
    snippet: truncateAtSentenceBoundary(source?.snippet || source?.text, MAX_SOURCE_TEXT),
    url: truncate(source?.url, 600),
    type: asString(source?.type) || 'source'
  }));
};

const buildPageContext = ({ page, question } = {}) => {
  const pageText = pageBodySentenceText(page);
  if (!pageText) return '';
  const sentences = splitIntoSentences(pageText);
  if (!sentences.length) return truncateAtSentenceBoundary(pageText, MAX_PAGE_TEXT);
  if (!isExactSentenceRequest(question)) return truncateAtSentenceBoundary(sentences.join(' '), MAX_PAGE_TEXT);

  const queryTokens = extractQuestionTokens(question);
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const score = queryTokens.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);
    return { sentence, index, score };
  });
  const best = scored.sort((left, right) => right.score - left.score || left.index - right.index)[0];
  const center = best?.score > 0 ? best.index : 0;
  const start = Math.max(0, center - 3);
  const selected = [];
  for (let index = start; index < sentences.length; index += 1) {
    const next = [...selected, sentences[index]].join(' ');
    if (next.length > MAX_PAGE_TEXT) break;
    selected.push(sentences[index]);
    if (index >= center + 5 && selected.join(' ').length >= Math.floor(MAX_PAGE_TEXT * 0.45)) break;
  }
  return selected.join(' ') || truncateAtSentenceBoundary(sentences.join(' '), MAX_PAGE_TEXT);
};

const buildSystemPrompt = ({
  page,
  sources,
  relatedPageContexts = [],
  highlightContexts = [],
  conceptContexts = [],
  backlinkContexts = [],
  question,
  wikiSchemaContent = '',
  selectedPageOnly = false
}) => {
  const sourceLines = sources
    .map(source => `[${source.index}] ${source.type.toUpperCase()} — ${source.title}\n${source.snippet || '(no snippet)'}${source.url ? `\n(${source.url})` : ''}`)
    .join('\n\n');
  const pageText = buildPageContext({ page, question });
  const relatedPageLines = relatedPageContexts
    .map((related, index) => `RELATED WIKI PAGE ${index + 1}: ${related.title}\n${related.plainText || '(empty page)'}`)
    .join('\n\n');
  const highlightLines = highlightContexts
    .map((highlight, index) => `HIGHLIGHT ${index + 1}: ${highlight.title}${highlight.fromPageTitle ? ` (from ${highlight.fromPageTitle})` : ''}\n${highlight.snippet || '(empty highlight)'}`)
    .join('\n\n');
  const conceptLines = conceptContexts
    .map((concept, index) => `CONCEPT ${index + 1}: ${concept.name}\n${concept.description || '(no concept description)'}`)
    .join('\n\n');
  const backlinkLines = backlinkContexts
    .map((backlink, index) => `BACKLINK ${index + 1}: ${backlink.title}${backlink.forPageTitle ? ` (mentions ${backlink.forPageTitle})` : ''}\n${backlink.snippet || '(no snippet)'}`)
    .join('\n\n');
  const exactRule = isExactSentenceRequest(question)
    ? '\n- This is an exact/quote request: answer from complete sentences in the page context, and preserve quoted sentence wording exactly when quoting.'
    : '';
  const summaryRule = isSummaryRequest(question)
    ? '\n- This is a summary/overview request: synthesize the whole selected page from its lead and section structure. Do not answer with one isolated sub-point unless the page itself has only that sub-point.'
    : '';
  const scopeRule = selectedPageOnly
    ? '\n- The reader scoped this question to the selected page only. Do not synthesize from related pages or graph context.'
    : '\n- When related pages, highlights, concepts, or backlinks are provided, synthesize across them instead of treating the selected page as the only evidence.';
  return `You are answering a reader's question about a wiki page in a personal knowledge base.

The selected page is titled "${truncate(page.title, 200) || 'Untitled'}" and reads as follows:
"""
${pageText || '(empty page)'}
"""

${relatedPageLines ? `Related wiki pages selected from the reader's question and graph context:\n${relatedPageLines}` : 'No related wiki pages matched the question strongly enough.'}

${highlightLines ? `Relevant highlights from the corpus:\n${highlightLines}` : ''}

${conceptLines ? `Relevant concept records:\n${conceptLines}` : ''}

${backlinkLines ? `Backlinks that mention related pages:\n${backlinkLines}` : ''}

The reader has attached the following sources on the selected page, each prefixed with a 1-based index:
${sourceLines || '(no attached sources)'}

The reader's question:
"""
${truncate(question, MAX_QUESTION)}
"""${formatWikiSchemaPromptBlock(wikiSchemaContent)}

Respond with a JSON object only. Schema:
{
  "bridgeInsight": "one concise connective insight if related pages were used, otherwise empty string",
  "paragraphs": [
    { "text": "single answer paragraph (1-3 sentences)", "citationIndexes": [1, 2] }
  ],
  "citationIndexesUsed": [1, 2]
}

Rules:
- Output 1 to ${MAX_ANSWER_PARAGRAPHS} paragraphs.
- If related wiki pages, highlights, concepts, or backlinks are provided and relevant, synthesize across selected page + graph context.
- If a bridge exists, set bridgeInsight to a single specific sentence beginning with neither a heading nor markdown.
- Never say "Answered from the selected wiki page" unless the reader explicitly scoped the question to the selected page only.
- Every paragraph must be self-contained prose (no markdown, no headings).
- citationIndexes per paragraph point to the reader's attached sources only.
- Use [] for citationIndexes when the paragraph relies only on the page text or general reasoning.
- Never invent sources or indexes outside the attached set.
- Never include trailing "[1, 2]" suffixes inside the text — citations live in the JSON, not the prose.
- Treat the page body above as coherent page context; do not answer from partial words or broken sentence fragments.${scopeRule}${exactRule}${summaryRule}

Return only the JSON, no prose around it.`;
};

const extractJson = (raw = '') => {
  const text = asString(raw);
  if (!text) return null;
  try { return JSON.parse(text); } catch (_err) { /* try fenced */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch (_err) { /* try slice */ }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_err) { return null; }
  }
  return null;
};

const buildFallbackAnswer = ({ page, sources, question, searchedSummary = '' }) => {
  const matches = topRelevantSentences({ page, sources, question, limit: 3 });
  if (!matches.length) {
    if (isSourceChangeQuestion(question) && sources.length) {
      const citationIndexes = sources.slice(0, 2).map(source => source.index);
      return {
        paragraphs: [{
          text: `The relevant change is tied to the newest attached source material on this page. Treat the answer as provisional until maintenance rewrites the page around that source.`,
          citationIndexes
        }],
        citationIndexesUsed: citationIndexes
      };
    }
    const pageTitle = truncate(page?.title, 100) || 'this page';
    const searched = searchedSummary ? ` ${searchedSummary}` : '';
    return {
      paragraphs: [{
        text: `I do not see enough evidence on ${pageTitle} to answer that directly.${searched} Expand the page or attach stronger source material before treating this as answered.`,
        citationIndexes: []
      }],
      citationIndexesUsed: []
    };
  }
  const citationIndexes = Array.from(new Set(matches.flatMap(match => match.citationIndexes || []))).slice(0, 4);
  const directAnswer = matches
    .map(match => asString(match.sentence).replace(/\[[0-9,\s]+\]\s*$/g, '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
  const sourceLine = citationIndexes.length
    ? ` The strongest cited support is ${citationIndexes.map(index => `[${index}]`).join(', ')}.`
    : '';
  return {
    paragraphs: [
      {
        text: `${directAnswer}${sourceLine}`,
        citationIndexes
      }
    ],
    citationIndexesUsed: citationIndexes
  };
};

const buildGraphFallbackAnswer = ({
  page,
  sources,
  relatedPageContexts = [],
  highlightContexts = [],
  conceptContexts = [],
  question,
  searchedSummary = ''
}) => {
  if (!relatedPageContexts.length && !highlightContexts.length && !conceptContexts.length) {
    return buildFallbackAnswer({ page, sources, question, searchedSummary });
  }
  const selectedTitle = truncate(page?.title, 100) || 'the selected page';
  const related = relatedPageContexts[0];
  const selectedMatches = topRelevantSentences({ page, sources: [], question, limit: 1 });
  const selectedSentence = selectedMatches[0]?.sentence || truncateAtSentenceBoundary(pageBodySentenceText(page), 260);
  const relatedSentence = related
    ? truncateAtSentenceBoundary(related.plainText, 320)
    : truncateAtSentenceBoundary(highlightContexts[0]?.snippet || conceptContexts[0]?.description || '', 320);
  const relatedLabel = related?.title || highlightContexts[0]?.fromPageTitle || conceptContexts[0]?.name || 'a related concept';
  const bridgeInsight = relatedSentence && selectedSentence
    ? `${selectedTitle} and ${relatedLabel} connect because ${selectedSentence} while ${relatedSentence}`.replace(/\s+/g, ' ').trim()
    : `${selectedTitle} connects to ${relatedLabel} through shared evidence in the archive.`;
  const bridgeSentence = truncate(bridgeInsight, 260);
  return {
    bridgeInsight: bridgeSentence,
    paragraphs: [{
      text: `${selectedSentence ? `On ${selectedTitle}, ${selectedSentence}` : ''} ${relatedSentence ? `On ${relatedLabel}, ${relatedSentence}` : ''}`.replace(/\s+/g, ' ').trim(),
      citationIndexes: []
    }],
    citationIndexesUsed: []
  };
};

const buildAskGraphContext = ({
  page,
  relatedPages = [],
  question = '',
  conceptRecords = [],
  backlinkRows = []
} = {}) => {
  const selectedPageOnly = isSelectedPageOnlyQuestion(question);
  const rankedPages = rankWikiPageCandidates({
    page,
    relatedPages,
    question,
    selectedPageOnly,
    limit: MAX_WIKI_PAGE_CANDIDATES
  });
  const relatedPageContexts = buildRelatedPageContexts({
    page,
    relatedPages: rankedPages,
    question,
    selectedPageOnly
  });
  const highlightContexts = selectedPageOnly
    ? []
    : buildGraphHighlightContexts({ page, relatedPages: rankedPages, relatedPageContexts, question });
  const conceptContexts = selectedPageOnly
    ? []
    : buildConceptContexts({ question, conceptRecords, relatedPageContexts });
  const backlinkContexts = selectedPageOnly
    ? []
    : buildBacklinkContexts({ question, backlinkRows, relatedPageContexts });
  const searchedSummary = buildGraphSearchSummary({
    page,
    relatedPageContexts,
    highlightContexts,
    conceptContexts,
    backlinkContexts,
    selectedPageOnly
  });
  return {
    rankedPages,
    relatedPageContexts,
    highlightContexts,
    conceptContexts,
    backlinkContexts,
    selectedPageOnly,
    searchedSummary
  };
};

const loadWikiAskCorpus = async ({
  page,
  question,
  userId,
  WikiPage,
  TagMeta,
  findWikiBacklinks,
  pageScanLimit = MAX_WIKI_PAGE_SCAN,
  candidateLimit = MAX_WIKI_PAGE_CANDIDATES
} = {}) => {
  if (!WikiPage?.find || !userId) {
    return { relatedPages: [], conceptRecords: [], backlinkRows: [] };
  }
  const trimmed = asString(question);
  const visibleWikiPageMatch = {
    userId,
    status: { $ne: 'archived' },
    hiddenFromHome: { $ne: true },
    debugOnly: { $ne: true },
    archived: { $ne: true }
  };
  const recentPagesRaw = await WikiPage.find(visibleWikiPageMatch)
    .sort({ updatedAt: -1 })
    .limit(Math.max(1, pageScanLimit))
    .select('title slug pageType plainText body sourceRefs updatedAt')
    .lean();
  const recentPages = (Array.isArray(recentPagesRaw) ? recentPagesRaw : []).filter(isWikiPageSurfaceEligible);
  const selectedPageOnly = isSelectedPageOnlyQuestion(trimmed);
  let allPages = recentPages;
  const titleCandidates = selectedPageOnly
    ? []
    : extractMentionedTitleCandidates({
      question: trimmed,
      selectedTitle: page?.title,
      limit: Math.min(32, Math.max(8, candidateLimit))
    });
  if (titleCandidates.length > 0) {
    const mentionedPagesRaw = await WikiPage.find({
      ...visibleWikiPageMatch,
      $or: titleCandidates.map(title => ({ title: exactTitleRegex(title) }))
    })
      .limit(Math.max(1, candidateLimit))
      .select('title slug pageType plainText body sourceRefs updatedAt')
      .lean();
    const mentionedPages = (Array.isArray(mentionedPagesRaw) ? mentionedPagesRaw : []).filter(isWikiPageSurfaceEligible);
    allPages = mergeWikiPages(recentPages, mentionedPages);
  }
  const relatedPages = rankWikiPageCandidates({
    page,
    relatedPages: allPages,
    question: trimmed,
    selectedPageOnly,
    limit: candidateLimit
  });

  const conceptNames = new Set();
  allPages.forEach((candidate) => {
    if (candidate.pageType !== 'concept') return;
    if (pageTitleMentionedInQuestion(candidate.title, trimmed)) {
      conceptNames.add(asString(candidate.title));
    }
  });
  buildRelatedPageContexts({
    page,
    relatedPages,
    question: trimmed,
    selectedPageOnly
  }).forEach((candidate) => {
    if (candidate.pageType === 'concept') conceptNames.add(candidate.title);
  });

  let conceptRecords = [];
  if (TagMeta?.find && conceptNames.size > 0) {
    const names = Array.from(conceptNames).filter(Boolean);
    conceptRecords = await TagMeta.find({
      userId,
      $or: names.map(name => ({ name: new RegExp(`^${escapeRegExp(name)}$`, 'i') }))
    })
      .select('name description workspaceTemplateName updatedAt')
      .limit(MAX_GRAPH_CONCEPTS)
      .lean();
  }

  const backlinkRows = [];
  if (findWikiBacklinks && !selectedPageOnly) {
    const namedRelated = buildRelatedPageContexts({
      page,
      relatedPages,
      question: trimmed,
      limit: 2
    });
    for (const related of namedRelated) {
      const targetPage = allPages.find(candidate => serializeObjectId(candidate) === related.id) || {
        _id: related.id,
        title: related.title,
        plainText: related.plainText
      };
      const result = await findWikiBacklinks({
        targetPage,
        userId,
        models: { WikiPage }
      });
      (result?.backlinks || []).slice(0, MAX_GRAPH_BACKLINKS).forEach((row) => {
        backlinkRows.push({ ...row, forPageTitle: related.title });
      });
    }
  }

  return { relatedPages, conceptRecords, backlinkRows };
};

const normalizeAnswerSchema = (raw, fallback, maxCitationIndex = Infinity) => {
  if (!raw || typeof raw !== 'object') return fallback;
  const maxIndex = Number.isFinite(Number(maxCitationIndex)) ? Number(maxCitationIndex) : Infinity;
  const paragraphs = Array.isArray(raw.paragraphs) ? raw.paragraphs : [];
  const cleaned = paragraphs
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const text = truncate(entry.text, 800).replace(/\[[0-9,\s]+\]\s*$/g, '').trim();
      if (!text) return null;
      const citationIndexes = Array.isArray(entry.citationIndexes)
        ? entry.citationIndexes.map(Number).filter(Number.isFinite).filter(idx => idx > 0 && idx <= maxIndex).slice(0, 6)
        : [];
      return { text, citationIndexes };
    })
    .filter(Boolean)
    .slice(0, MAX_ANSWER_PARAGRAPHS);
  if (!cleaned.length) return fallback;
  const fallbackIndexes = Array.isArray(fallback?.citationIndexesUsed)
    ? fallback.citationIndexesUsed.map(Number).filter(Number.isFinite).filter(index => index > 0 && index <= maxIndex)
    : [];
  const hasModelCitations = cleaned.some(entry => entry.citationIndexes.length > 0);
  if (!hasModelCitations && fallbackIndexes.length) {
    cleaned[0].citationIndexes = fallbackIndexes.slice(0, 6);
  }
  const flat = new Set();
  cleaned.forEach(entry => entry.citationIndexes.forEach(idx => flat.add(idx)));
  return {
    paragraphs: cleaned,
    citationIndexesUsed: Array.from(flat).sort((a, b) => a - b),
    bridgeInsight: truncate(raw.bridgeInsight, 260)
  };
};

const docFromAnswer = (answer, maxCitationIndex = Infinity) => ({
  type: 'doc',
  content: answer.paragraphs.map(entry => claimParagraph(entry.text, entry.citationIndexes, maxCitationIndex))
});

/**
 * Answer a question against a single wiki page.
 *
 * @param {object} params
 * @param {object} params.page         The mongoose wiki page document.
 * @param {string} params.question     User's question (raw).
 * @param {object} [params.aiClient]   Optional override for the chat client (used in tests).
 * @returns {Promise<{answer:object,citationIndexesUsed:number[],model:string,status:'answered'|'failed',errorMessage:string}>}
 */
const askWikiPage = async ({
  page,
  question,
  aiClient,
  wikiSchemaContent = '',
  relatedPages = [],
  conceptRecords = [],
  backlinkRows = []
} = {}) => {
  const trimmed = truncate(question, MAX_QUESTION);
  if (!trimmed) {
    return {
      answer: { type: 'doc', content: [claimParagraph('Ask a question about this page to get a source-backed answer.', [])] },
      citationIndexesUsed: [],
      model: 'stub',
      status: 'failed',
      errorMessage: 'Question is empty.'
    };
  }
  const sources = buildSourceList(page?.sourceRefs);
  const graphContext = buildAskGraphContext({
    page,
    relatedPages,
    question: trimmed,
    conceptRecords,
    backlinkRows
  });
  const {
    relatedPageContexts,
    highlightContexts,
    conceptContexts,
    backlinkContexts,
    selectedPageOnly,
    searchedSummary
  } = graphContext;
  const buildProvenance = (bridgeInsight = '') => provenanceFromContext({
    page,
    sources,
    relatedPageContexts,
    highlightContexts,
    conceptContexts,
    backlinkContexts,
    bridgeInsight,
    selectedPageOnly,
    searchedSummary
  });
  const fallback = buildGraphFallbackAnswer({
    page,
    sources,
    relatedPageContexts,
    highlightContexts,
    conceptContexts,
    question: trimmed,
    searchedSummary
  });
  if (isSummaryRequest(trimmed)) {
    const summaryAnswer = buildPageSummaryAnswer({ page, question: trimmed });
    return {
      answer: docFromAnswer(summaryAnswer, sources.length),
      citationIndexesUsed: summaryAnswer.citationIndexesUsed,
      provenance: provenanceFromContext({
        page,
        sources,
        selectedPageOnly: true,
        searchedSummary: buildGraphSearchSummary({ page, selectedPageOnly: true })
      }),
      model: 'deterministic',
      status: 'answered',
      errorMessage: ''
    };
  }

  const exactSentence = pickExactPageSentence({ page, question: trimmed });
  if (exactSentence) {
    const answer = {
      paragraphs: [{ text: exactSentence, citationIndexes: [] }],
      citationIndexesUsed: []
    };
    return {
      answer: docFromAnswer(answer, sources.length),
      citationIndexesUsed: [],
      provenance: buildProvenance(''),
      model: 'deterministic',
      status: 'answered',
      errorMessage: ''
    };
  }

  if (isSourceChangeQuestion(trimmed) && sources.length) {
    const sourceFallback = buildFallbackAnswer({
      page,
      sources,
      question: trimmed,
      searchedSummary
    });
    return {
      answer: docFromAnswer(sourceFallback, sources.length),
      citationIndexesUsed: sourceFallback.citationIndexesUsed,
      provenance: buildProvenance(fallback.bridgeInsight || ''),
      model: 'deterministic',
      status: 'answered',
      errorMessage: ''
    };
  }

  const chatClient = aiClient?.chatComplete || chatComplete;
  const isConfigured = aiClient?.isTextGenerationConfigured || isTextGenerationConfigured;

  if (!isConfigured()) {
    return {
      answer: docFromAnswer(fallback, sources.length),
      citationIndexesUsed: fallback.citationIndexesUsed,
      provenance: buildProvenance(fallback.bridgeInsight || ''),
      model: 'stub',
      status: 'answered',
      errorMessage: ''
    };
  }

  const systemPrompt = buildSystemPrompt({
    page,
    sources,
    relatedPageContexts,
    highlightContexts,
    conceptContexts,
    backlinkContexts,
    question: trimmed,
    wikiSchemaContent,
    selectedPageOnly
  });
  let completion = null;
  try {
    completion = await chatClient({
      route: 'artifact_draft',
      maxTokens: 1200,
      temperature: 0.3,
      reasoningEffort: 'medium',
      responseFormat: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: trimmed }
      ]
    });
  } catch (error) {
    return {
      answer: docFromAnswer(fallback, sources.length),
      citationIndexesUsed: fallback.citationIndexesUsed,
      provenance: buildProvenance(fallback.bridgeInsight || ''),
      model: 'fallback',
      status: 'failed',
      errorMessage: String(error?.message || error || 'Ask request failed.').slice(0, 400)
    };
  }
  const raw = typeof completion === 'string' ? completion : completion?.text || '';
  const parsed = extractJson(raw);
  const answer = normalizeAnswerSchema(parsed, fallback, sources.length);
  return {
    answer: docFromAnswer(answer, sources.length),
    citationIndexesUsed: answer.citationIndexesUsed,
    provenance: buildProvenance(answer.bridgeInsight || ''),
    model: completion?.model || 'hf',
    status: 'answered',
    errorMessage: ''
  };
};

module.exports = {
  askWikiPage,
  loadWikiAskCorpus,
  __testables: {
    buildSourceList,
    buildRelatedPageContexts,
    buildGraphHighlightContexts,
    buildConceptContexts,
    buildBacklinkContexts,
    buildAskGraphContext,
    buildGraphSearchSummary,
    provenanceFromContext,
    buildSystemPrompt,
    extractJson,
    normalizeAnswerSchema,
    buildFallbackAnswer,
    buildGraphFallbackAnswer,
    topRelevantSentences,
    scoreTextForQuestion,
    docFromAnswer,
    claimParagraph,
    splitIntoSentences,
    truncateAtSentenceBoundary,
    buildPageContext,
    buildPageSummaryAnswer,
    isSummaryRequest,
    requestedBulletCount,
    isExactSentenceRequest,
    isSelectedPageOnlyQuestion,
    pageTitleMentionedInQuestion,
    extractMentionedTitleCandidates,
    rankWikiPageCandidates,
    pickExactPageSentence
  }
};
