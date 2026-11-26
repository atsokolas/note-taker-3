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

// "2026-11" as the issue's name: "November 2026", or "November" this year.
export const issueMonth = (month, now = Date.now()) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en', {
  month: 'long', timeZone: 'UTC', ...(month.slice(0, 4) === new Date(now).toISOString().slice(0, 4) ? {} : { year: 'numeric' })
});

// Where a page from the open web lives, as its host.
export const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Web'; } };

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
   the page. Eligible: anything on Kept; a thread by its passages alone,
   since its title names books, not ideas. Bar: two distinct words of four
   letters or more in common. Silence: below the bar, nothing. */
export const KEPT_BESIDE = 3;
const SHARED_WORDS = 2;
const wordsOf = text => new Set(tokensOf(text).filter(word => word.length >= 4).map(word => word.replace(/s$/, '')));

export const keptBeside = (kept, text) => {
  const writing = wordsOf(text);
  return kept
    .map(held => ({ held, shared: [...wordsOf(held.kind === 'thread' ? held.text : `${held.title} ${held.text || ''} ${held.note || ''}`)].filter(word => writing.has(word)).length }))
    .filter(({ shared }) => shared >= SHARED_WORDS)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, KEPT_BESIDE)
    .map(({ held }) => ({ ...held, path: pathOf(held) }));
};

/* Kept passages that share a subject could be a page. Gate: passages on
   Kept only, and a word of five letters or more, not a common one, that no
   page of yours already has in its title or came from. Bar: KEPT_FOR_A_PAGE
   passages from at least two works say it (untuned). Silence: below the
   bar, nothing is offered. The match runs here, on what the page already
   read. */
export const KEPT_FOR_A_PAGE = 5;
const COMMON = new Set(['about', 'after', 'again', 'always', 'another', 'around', 'because', 'before', 'being', 'better', 'between', 'could', 'every', 'everything', 'first', 'great', 'little', 'never', 'other', 'people', 'really', 'should', 'something', 'still', 'their', 'there', 'these', 'thing', 'things', 'think', 'those', 'through', 'under', 'until', 'where', 'which', 'while', 'without', 'world', 'would', 'years']);
const subjectWords = text => new Set(tokensOf(text).map(word => word.replace(/'s$/, '').replace(/([^su])s$/, '$1')).filter(word => word.length >= 5 && !COMMON.has(word) && !COMMON.has(`${word}s`)));

export const couldBeAPage = (kept, taken = []) => {
  const named = taken.map(title => subjectWords(title));
  const bySubject = new Map();
  for (const held of kept.filter(held => held.kind === 'mark' && held.text)) {
    for (const word of subjectWords(held.text)) bySubject.set(word, [...(bySubject.get(word) || []), held]);
  }
  const [best] = [...bySubject]
    .filter(([word, marks]) => marks.length >= KEPT_FOR_A_PAGE && new Set(marks.map(mark => mark.articleId)).size >= 2 && !named.some(words => words.has(word)))
    .sort(([a, x], [b, y]) => y.length - x.length || b.length - a.length);
  return best ? { subject: best[0], title: capital(best[0]), marks: best[1] } : null;
};
