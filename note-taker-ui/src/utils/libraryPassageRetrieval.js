import { isSuppressedFromLibraryBrowse } from './cruftSuppression';
import { cleanSourceTextForDisplay } from './sourceDisplayText';

const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const clean = (value) => cleanSourceTextForDisplay(value || '');

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into', 'is',
  'it', 'me', 'my', 'not', 'of', 'on', 'or', 'our', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'to', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose',
  'why', 'with', 'you', 'your'
]);

const tokensOf = (value) => (
  (String(value || '').toLowerCase().match(/[a-z0-9']+/g) || [])
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
);

export const needleFromQuestion = (question = '') => {
  const words = tokensOf(question);
  return words.join(' ').trim().slice(0, 80);
};

export const passageSpeaksToQuery = (row = {}, query = '') => {
  const needed = new Set(tokensOf(query));
  if (!needed.size) return Boolean(clean(query));
  const hay = new Set(tokensOf(`${row.title || ''} ${row.passage || ''}`));
  return [...needed].some((token) => hay.has(token));
};

export const passageIsStale = ({ passage, articleText } = {}) => {
  const needle = clean(passage).toLowerCase();
  const hay = clean(articleText).toLowerCase();
  if (!needle || !hay) return false;
  return !hay.includes(needle);
};

export const librarySearchSilence = ({ query = '', boundQuestion = '', mode = 'search' } = {}) => {
  if (mode === 'browse') return '';
  const needle = String(query || '').trim();
  if (boundQuestion.trim()) {
    return needle
      ? `Nothing you already have speaks to “${needle}”.`
      : 'Nothing you already have speaks to this question.';
  }
  return `Nothing in your Library matches “${needle}”.`;
};

export const librarySearchRows = (payload = {}) => {
  const seen = new Set();
  const rows = [];
  const add = (row) => {
    const key = row.kind === 'highlight'
      ? `highlight:${row.articleId}:${row.highlightId}`
      : `article:${row.articleId}`;
    if (!row.articleId || seen.has(key)) return;
    seen.add(key);
    rows.push({ ...row, key });
  };
  (Array.isArray(payload?.highlights) ? payload.highlights : []).forEach((highlight) => add({
    kind: 'highlight',
    articleId: idOf(highlight.articleId),
    highlightId: idOf(highlight),
    title: String(highlight.articleTitle || '').trim() || 'Untitled source',
    passage: clean(highlight.text || highlight.anchor?.text),
    highlight
  }));
  (Array.isArray(payload?.articles) ? payload.articles : []).forEach((article) => add({
    kind: 'article',
    articleId: idOf(article),
    highlightId: '',
    title: String(article.title || '').trim() || 'Untitled source',
    passage: clean(article.content || article.firstGraph),
    article
  }));
  return rows;
};

export const qualifyLibraryRows = (rows = [], { query = '', mode = 'search' } = {}) => (
  (Array.isArray(rows) ? rows : []).filter((row) => {
    if (isSuppressedFromLibraryBrowse({
      title: row.title,
      ...(row.article || {}),
      ...(row.highlight || {})
    })) return false;
    if (mode === 'search' && String(query || '').trim() && !passageSpeaksToQuery(row, query)) {
      return false;
    }
    return true;
  })
);
