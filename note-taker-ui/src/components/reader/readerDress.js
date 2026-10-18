/* The reader dresses for the source, lightly, from fields it already has. */

const FILING_HOSTS = /(^|\.)sec\.gov$/i;
const FILING_TITLE = /\b(10-K|10-Q|8-K|20-F|40-F|6-K|S-1|S-4|F-1|DEF 14A|424B\d|annual report|quarterly report|proxy statement|prospectus|earnings release|shareholder letter)\b/i;
const PASTED = new Set(['text', 'paste', 'manual-note']);
/* Past this the piece is an essay, and gets a slower line. */
export const ESSAY_WORDS = 3000;
/* A thoughtful pace for serious prose, not a skim. */
export const WORDS_PER_MINUTE = 230;

export const wordCount = (text) => (String(text || '').match(/\S+/g) || []).length;

const hostOf = (url) => {
  try {
    return new URL(String(url || '')).hostname;
  } catch (_error) {
    return '';
  }
};

/**
 * 'filing' (tabular figures), 'essay' (wider measure, slower leading),
 * 'plain' (pasted text, left as written), or '' (the reader's default).
 */
export const sourceKind = (article) => {
  if (!article) return '';
  if (PASTED.has(String(article.importMeta?.sourceType || '').toLowerCase())) return 'plain';
  if (FILING_HOSTS.test(hostOf(article.url)) || FILING_HOSTS.test(hostOf(article.importMeta?.sourceUrl))
    || FILING_TITLE.test(String(article.title || ''))) return 'filing';
  const text = String(article.content || '').replace(/<[^>]*>/g, ' ');
  return wordCount(text) >= ESSAY_WORDS ? 'essay' : '';
};

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/**
 * "Two minutes left." Only once you are past halfway, and silent in the
 * last stretch, where a clock would only interrupt the ending.
 */
export const timeLeftLine = (words, seen) => {
  if (!(words > 0) || !(seen > 0.5) || seen >= 0.97) return '';
  const minutes = Math.round((words * (1 - seen)) / WORDS_PER_MINUTE);
  if (minutes < 1) return 'Under a minute left';
  if (minutes === 1) return 'A minute left';
  return `${NUMBER_WORDS[minutes] || minutes} minutes left`;
};
