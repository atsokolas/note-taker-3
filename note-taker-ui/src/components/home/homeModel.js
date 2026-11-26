import { buildCanonicalArticlePath, buildCanonicalHighlightPath } from '../../utils/sourceRoutes';
import { tokensOf } from '../../utils/libraryPassageRetrieval';

const DAY_MS = 24 * 60 * 60 * 1000;
// The server's fortnight: For now fades across it, then sinks.
export const SINKS_AFTER_DAYS = 14;
const NUMBERS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const counted = (n, one) => `${NUMBERS[n] || n} ${one}${n === 1 ? '' : 's'}`;
const timeOf = value => new Date(value).getTime() || 0;

// A thread opens on its own page; a book on its own, anything else in the Library reader, either at the passage.
export const pathOf = ({ threadId, book, articleId, highlightId }) => {
  if (threadId) return `/threads/${threadId}`;
  if (book) return `/books/${articleId}${highlightId ? `?highlight=${encodeURIComponent(highlightId)}` : ''}`;
  return highlightId ? buildCanonicalHighlightPath({ articleId, highlightId }) : buildCanonicalArticlePath(articleId);
};

export const monthOf = value => new Date(value).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

export const dayOf = (value, now = Date.now()) => {
  const days = Math.floor((now - timeOf(value)) / DAY_MS);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 7) return new Date(value).toLocaleDateString(undefined, { weekday: 'short' });
  return counted(Math.floor(days / 7) || 1, 'week').replace(/^one /, 'a ') + ' ago';
};

// How far toward sinking something is, from 1 (today) to 0.45 (about to go under).
export const depthOf = (value, now = Date.now()) => {
  const age = Math.min(1, Math.max(0, (now - timeOf(value)) / (SINKS_AFTER_DAYS * DAY_MS)));
  return Number((1 - age * 0.55).toFixed(2));
};

// The distance between two marks, said the way a person would.
export const apart = (a, b) => {
  const months = Math.round(Math.abs(timeOf(a) - timeOf(b)) / (30.44 * DAY_MS));
  if (months < 12) return `${counted(Math.max(1, months), 'month')} apart`.replace(/^one /, 'a ');
  return `${counted(Math.round(months / 12), 'year')} apart`.replace(/^one /, 'a ');
};

// How long you have been reading, from your first mark: the years of preparing.
export const depthSince = (since, now = Date.now()) => {
  if (!since) return '';
  const years = Math.floor((now - timeOf(since)) / (365.25 * DAY_MS));
  return years >= 1 ? `${counted(years, 'year')} of reading` : `reading since ${monthOf(since)}`;
};

const capital = words => words.charAt(0).toUpperCase() + words.slice(1);

// What a thread is, said plainly: how many works, and the years between its ends.
export const formedAcross = (marks = []) => {
  const works = new Set(marks.map(mark => mark.articleId)).size;
  const times = marks.map(mark => timeOf(mark.createdAt)).filter(Boolean);
  return `${capital(NUMBERS[works] || String(works))} things you read, ${apart(Math.min(...times), Math.max(...times))}`;
};

// What a kept thing is called, in a list: a passage by its words, anything else by its title.
export const keptLabel = held => (held.kind === 'mark' ? `“${held.text || held.note}” · ${held.title}` : held.title);

/* What you keep for good that bears on what you are working on, matched in
   the browser by the words the two share, so none of your writing leaves
   the page. Eligible: anything on Kept except threads' own titles, which
   name books, not ideas. Bar: two distinct words of four letters or more in
   common. Silence: below the bar, nothing. */
export const KEPT_BESIDE = 3;
const SHARED_WORDS = 2;
const wordsOf = text => new Set(tokensOf(text).filter(word => word.length >= 4).map(word => word.replace(/s$/, '')));

export const keptBeside = (kept, text) => {
  const writing = wordsOf(text);
  return kept
    .filter(held => held.kind !== 'thread')
    .map(held => ({ held, shared: [...wordsOf(`${held.title} ${held.text || ''} ${held.note || ''}`)].filter(word => writing.has(word)).length }))
    .filter(({ shared }) => shared >= SHARED_WORDS)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, KEPT_BESIDE)
    .map(({ held }) => ({ ...held, path: pathOf(held) }));
};
