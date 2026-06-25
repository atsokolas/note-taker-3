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
);

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
  let title = normalizeSpaces(value || 'Untitled Wiki Page')
    .replace(/[“”"]/g, '')
    .replace(/^[#>\-*•\s]+/g, '')
    .replace(/[.?!:;,\s]+$/g, '')
    .slice(0, maxLength)
    .trim();

  if (!title) return 'Untitled Wiki Page';

  if (stripLeadingArticle) {
    title = title.replace(/^(?:the|a|an)\s+/, '').trim() || title;
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

  return title || 'Untitled Wiki Page';
};

const sentenceBoundaryTrim = (value = '', {
  maxLength = 280,
  fallback = ''
} = {}) => {
  const text = normalizeSpaces(value)
    .replace(/^["']|["']$/g, '')
    .replace(/\s+\[\d+(?:,\s*\d+)*\]\s*$/g, '')
    .trim();

  if (!text) return fallback;
  if (text.length <= maxLength && /[.!?]$/.test(text)) return text;

  const boundaryPattern = /[.!?](?=\s|$)/g;
  let match;
  let boundary = -1;
  while ((match = boundaryPattern.exec(text)) !== null) {
    if (match.index + 1 <= maxLength) boundary = match.index + 1;
  }
  if (boundary > 0) return text.slice(0, boundary).trim();

  const clipped = text.slice(0, maxLength).trim();
  const wordBoundary = clipped.lastIndexOf(' ');
  const clean = (wordBoundary > 80 ? clipped.slice(0, wordBoundary) : clipped)
    .replace(/[,:;–—-]+$/g, '')
    .trim();

  if (!clean) return fallback;
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
};

module.exports = {
  normalizeSpaces,
  normalizeWikiTitleForPresentation,
  sentenceBoundaryTrim,
  __testables: {
    titleCasePhrase
  }
};
