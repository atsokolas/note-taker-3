const { sentenceBoundaryTrim } = require('../lib/editorialText');

const normalizeSpaces = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const LOWERCASE_TITLE_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'vs',
  'via',
  'with'
]);

const preserveWord = (word = '') => (
  /[A-Z]{2,}/.test(word)
  || /[A-Z]&[A-Z]/.test(word)
  || /\d/.test(word)
  || /[A-Z][a-z]+[A-Z]/.test(word)
  || /[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(word)
  || /^[a-z0-9]+(?:-[a-z0-9_.]+)+$/i.test(word)
  || /^[A-Za-z0-9_]+\.[A-Za-z0-9_.-]+$/.test(word)
);

const REPO_WIKI_TITLE_SUFFIX = /\s+(?:—|–|-)\s*repo wiki\s*$/i;

const isRepoWikiTitle = (value = '') => (
  REPO_WIKI_TITLE_SUFFIX.test(value)
  || /\brepo wiki\s*$/i.test(value)
);

const titleHasCodeIdentifiers = (value = '') => (
  /[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(value)
  || /\b[a-z0-9]+(?:-[a-z0-9_.]+)+\b/.test(value)
);

const buildRepoWikiTitle = (repoSlug = '') => {
  const slug = normalizeSpaces(repoSlug).split('/').filter(Boolean).pop() || '';
  return slug ? `${slug} — repo wiki` : 'repo wiki';
};

const titleCaseWord = (word = '', index = 0, total = 1) => {
  if (!word) return '';
  const lower = word.toLowerCase();
  if (index > 0 && index < total - 1 && LOWERCASE_TITLE_WORDS.has(lower)) {
    return lower;
  }
  if (preserveWord(word) && word !== lower) return word;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const titleCasePhrase = (value = '') => {
  const words = normalizeSpaces(value)
    .split(/\s+/)
    .filter(Boolean);
  return words.map((word, index) => {
    const parts = word.split(/([-–—/])/);
    return parts.map((part) => (
      /^[-–—/]$/.test(part) ? part : titleCaseWord(part, index, words.length)
    )).join('');
  }).join(' ');
};

const normalizeWikiTitleForPresentation = (value = '', {
  maxLength = 180,
  stripLeadingArticle = true
} = {}) => {
  let title = normalizeSpaces(value || 'Untitled wiki page')
    .replace(/[“”"]/g, '')
    .replace(/^[#>\-*•\s]+/g, '')
    .replace(/[.?!:;,\s]+$/g, '')
    .slice(0, maxLength)
    .trim();

  if (!title) return 'Untitled wiki page';

  if (stripLeadingArticle) {
    title = title.replace(/^(?:the|a|an)\s+/, '').trim() || title;
  }

  if (isRepoWikiTitle(title)) {
    const repo = title
      .replace(/\s+(?:—|–|-)\s*repo wiki\s*$/i, '')
      .replace(/\s+repo wiki\s*$/i, '')
      .split('/').filter(Boolean).pop();
    return buildRepoWikiTitle(repo);
  }

  if (titleHasCodeIdentifiers(title)) {
    return title || 'Untitled wiki page';
  }

  const words = title.split(/\s+/).filter(Boolean);
  const looksGenerated = (
    words.length <= 8
    && (
      title === title.toLowerCase()
      || /^[a-z]/.test(title)
      || /\b(?:the|a|an|and|or|of|to|in|for)\b/.test(title)
    )
  );

  if (looksGenerated) {
    title = titleCasePhrase(title);
  } else {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  return title || 'Untitled wiki page';
};

const normalizeExistingWikiTitleForPresentation = (value = '', options = {}) => {
  const raw = normalizeSpaces(value || 'Untitled wiki page');
  return normalizeWikiTitleForPresentation(raw, {
    ...options,
    stripLeadingArticle: /^(?:the|a|an)\s+/.test(raw)
  });
};

/**
 * One title, every surface.
 *
 * Repo wikis used to wear two names at once: the stored/title-cased
 * "Atsokolas/Note-Taker-3 Repo Wiki" on paper attribution, and
 * "note-taker-3 — repo wiki" on the wiki table. Watch metadata wins;
 * otherwise the stored title is normalized through the same renderer.
 */
const canonicalWikiTitle = (page = {}, fallback = 'Untitled wiki page') => {
  const type = String(page?.pageType || '').toLowerCase();
  const stored = page?.title || fallback;
  const watch = page?.externalWatches?.githubRepo || {};
  const repo = String(watch.repo || '').trim();
  const repoWiki = type === 'repo' || isRepoWikiTitle(stored);
  if (repo && repoWiki) return buildRepoWikiTitle(repo);
  return normalizeExistingWikiTitleForPresentation(stored) || fallback;
};

/*
 * A model that answers with its scratchpad instead of its answer.
 *
 * The morning paper printed this, verbatim, as the day's editorial line:
 *
 *   "Here's a thinking process: 1. **Analyze User Request:** - Task: Write a
 *    1-2 sentence editorial summary of what's new in a personal knowledge base
 *    over the last 24 hours."
 *
 * A fallback model returned its reasoning, the trim function found a non-empty
 * string and accepted it, and the product's own voice became a transcript of
 * the machine talking to itself. The lead sentence is the one place that must
 * never babble, and a deterministic summary is always standing by — so
 * anything that reads like reasoning is refused rather than printed.
 *
 * These patterns are shaped to the scaffolding of thinking rather than to its
 * subject matter. A real summary about analysis or tasks is fine; one that
 * announces its own plan, numbers its steps, or wears markdown is not prose a
 * person wrote.
 */
const SCRATCHPAD_PATTERNS = Object.freeze([
  /\bthinking process\b/i,
  /\banaly[sz]e\s+(the\s+)?user\s+(request|prompt|input)\b/i,
  /\bhere('s| is)\s+(my|the)\s+(plan|approach|thinking|reasoning|process)\b/i,
  /\blet me\s+(think|start|begin|first)\b/i,
  /\b(?:we|i)\s+(?:need|have)\s+to\s+(?:produce|write|create|draft|summari[sz]e)\b/i,
  /\bstep\s*\d\b/i,
  /\b(draft|attempt|option|version)\s*\d\s*:/i,
  /^\s*\d+\.\s+\S/,
  /\*\*/,
  /^#{1,6}\s/m,
  /\b(task|output|constraints?|instructions?|requirements?)\s*:/i,
  /\b(system|assistant|user)\s*:/i
]);

/** True when text reads as a model's working rather than as the answer. */
const readsAsModelScratchpad = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  return SCRATCHPAD_PATTERNS.some(pattern => pattern.test(text));
};

/**
 * One editorial sentence, or nothing.
 *
 * The same trim as before with the scratchpad check in front of it. The raw
 * text is judged before it is cut down, because trimming to 280 characters can
 * slice the tell off the end and leave something that merely looks like prose.
 */
const editorialSentence = (value = '', { maxLength = 280, fallback = '' } = {}) => {
  if (readsAsModelScratchpad(value)) return fallback;
  const trimmed = sentenceBoundaryTrim(value, { maxLength, fallback });
  return readsAsModelScratchpad(trimmed) ? fallback : trimmed;
};

module.exports = {
  normalizeSpaces,
  editorialSentence,
  readsAsModelScratchpad,
  canonicalWikiTitle,
  normalizeExistingWikiTitleForPresentation,
  normalizeWikiTitleForPresentation,
  buildRepoWikiTitle,
  sentenceBoundaryTrim,
  __testables: {
    titleCasePhrase,
    isRepoWikiTitle,
    titleHasCodeIdentifiers
  }
};
