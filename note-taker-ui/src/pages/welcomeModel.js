/* What first run says, kept apart from how it is drawn so the words can be
   tested without a browser. Every function here is pure. */

import { countWord, oneSentence } from './judgmentModel';

export const STEPS = [
  { id: 'view', label: 'Your view' },
  { id: 'reading', label: 'Your reading' },
  { id: 'moment', label: 'What it says' }
];

/* Borrowed, then edited. Each one is a sentence a reasonable person could argue
   with, which is the only thing that makes a view worth reading against. */
export const EXAMPLE_VIEWS = [
  'Costco’s membership fees make it very hard to compete with.',
  'Remote teams write better than they meet.',
  'Most productivity advice describes people who already had the time.'
];

export const READWISE_TOKEN_URL = 'https://readwise.io/access_token';

const words = (value = '') => String(value || '').trim().split(/\s+/).filter(Boolean);

/* A view is a sentence someone could disagree with. One word is a topic, and a
   topic cannot be supported or cut against. */
export const viewProblem = (draft = '') => {
  const sentence = oneSentence(draft);
  if (!sentence) return '';
  if (words(sentence).length < 3) return 'A view is a sentence someone could disagree with. Say what you think about it.';
  return '';
};

/* Only the first sentence is held. Saying so before Hold beats discovering it
   after. */
export const extraSentenceNotice = (draft = '') => {
  const text = String(draft || '').trim();
  const sentence = oneSentence(text);
  if (!sentence || sentence.length >= text.replace(/\s+/g, ' ').length - 1) return '';
  return 'Noeis holds the first sentence. You can add the rest as a reason later.';
};

const MIN_PROSE_WORDS = 40;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

/* What was pasted: links, one source each, or a passage long enough to stand as
   a source. A sentence is too thin to find anything in. */
export const readPastedReading = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return { urls: [], prose: '', problem: 'Paste a link, or a few paragraphs.' };
  const urls = [...new Set((text.match(URL_PATTERN) || []).map(url => url.replace(/[.,;:]+$/, '')))];
  if (urls.length) return { urls, prose: '', problem: '' };
  if (words(text).length < MIN_PROSE_WORDS) {
    return {
      urls: [],
      prose: '',
      problem: 'That is too short to find anything in. Paste the link instead, or a few paragraphs.'
    };
  }
  return { urls: [], prose: text, problem: '' };
};

/* The host, for a link whose page has not answered yet. */
export const linkLabel = (url = '') => {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname.replace(/\/$/, '');
    return `${hostname.replace(/^www\./, '')}${path.length > 1 ? path : ''}`;
  } catch (_error) {
    return url;
  }
};

/* A pasted passage is named by how it begins. "Pasted text" twice in a row
   tells a reader nothing about which is which. */
export const passageTitle = (prose = '', max = 60) => {
  const first = String(prose || '').trim().replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0];
  if (first.length <= max) return first.replace(/[.!?]$/, '');
  const cut = first.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : max).replace(/[,;:]$/, '')}…`;
};

const capitalize = (value = '') => value.charAt(0).toUpperCase() + value.slice(1);

export const passagesHeadline = (count = 0) => (
  count === 1
    ? 'One passage you saved bears on this.'
    : `${capitalize(countWord(count))} passages you saved bear on this.`
);

export const readwiseReceipt = ({ importedHighlights = 0, importedArticles = 0 } = {}) => {
  if (!importedHighlights && !importedArticles) return 'Readwise is connected. Nothing new came in.';
  const highlights = `${importedHighlights} ${importedHighlights === 1 ? 'highlight' : 'highlights'}`;
  const sources = `${importedArticles} ${importedArticles === 1 ? 'source' : 'sources'}`;
  return `${highlights} from ${sources} came in from Readwise.`;
};

export const savedOn = (value, now = new Date()) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === now.getFullYear();
  return `saved ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })}`;
};

/* The words that brought a passage here, marked where they occur. Retrieval
   cannot tell support from contradiction, so the honest thing to show is why it
   came up and let the reader decide what it does. */
export const markMatches = (text = '', terms = []) => {
  const stems = (Array.isArray(terms) ? terms : [])
    .map(term => String(term || '').toLowerCase().trim())
    .filter(term => term.length > 2);
  if (!stems.length) return [{ text, match: false }];
  const matches = (word) => {
    const bare = word.toLowerCase().replace(/[^a-z0-9'-]/g, '');
    return bare.length > 2 && stems.some(stem => bare === stem || (stem.length >= 4 && bare.startsWith(stem)));
  };
  return String(text || '')
    .split(/(\s+)/)
    .filter(Boolean)
    .reduce((segments, piece) => {
      const match = !/^\s+$/.test(piece) && matches(piece);
      const last = segments[segments.length - 1];
      if (!match && last && !last.match) last.text += piece;
      else segments.push({ text: piece, match });
      return segments;
    }, []);
};

export const FILED_LINE = {
  why: 'Filed under why you hold it.',
  against: 'Filed against it.',
  skip: 'Set aside.'
};
