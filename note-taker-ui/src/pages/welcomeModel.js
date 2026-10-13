/* What first run says, kept apart from how it is drawn so the words can be
   tested without a browser. Every function here is pure. */

import { oneSentence } from './judgmentModel';

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const countWord = n => COUNT_WORDS[n] || String(n);

export const STEPS = [
  { id: 'start', label: 'What it builds' },
  { id: 'reading', label: 'Your reading' },
  { id: 'page', label: 'Your first page' },
  { id: 'moment', label: 'What it says' }
];

/* The page first run opens on: what a Noeis page looks like, shown as an
   example and labelled as one. */
export const EXAMPLE_PAGE = {
  title: 'Loss aversion',
  lede: 'People feel a loss more sharply than a gain of the same size, and that pressure bends decisions: a small downside can outweigh a larger upside when the choice feels personal or hard to undo.',
  sections: [
    ['Where it shows up', 'Investors hold losing positions too long; teams keep projects alive to avoid admitting the cost already spent.'],
    ['Where it breaks', 'Caution that protects the downside can also hide the better path nobody chose.']
  ],
  sources: 'Every line points back to a passage you saved.'
};

/* A pack's pages as a line, so the reader sees what they would be taking. */
export const packContents = (pack = {}, max = 4) => {
  const titles = (Array.isArray(pack.pages) ? pack.pages : []).map(page => page?.title).filter(Boolean);
  if (!titles.length) return '';
  const shown = titles.slice(0, max).join(' · ');
  return titles.length > max ? `${shown} · ${titles.length - max} more` : shown;
};

export const READWISE_TOKEN_URL = 'https://readwise.io/access_token';

const words = (value = '') => String(value || '').trim().split(/\s+/).filter(Boolean);

/* A topic is a few words a library can be searched for. A sentence is a
   view, and belongs on the page once it exists, not in its title. */
export const topicProblem = (draft = '') => {
  const topic = String(draft || '').trim();
  if (!topic) return 'Name what the page should be about.';
  if (words(topic).length > 8) return 'Keep it to a few words, like a page title. What you think about it comes next.';
  return '';
};

/* Where a page build stands, read off the page itself. A page someone took
   arrives written, with no build behind it. */
export const pageState = (page) => {
  if (!page) return 'none';
  const status = page.aiState?.draftStatus || 'idle';
  if (status === 'maintaining') return 'writing';
  if (status === 'error') return 'failed';
  return 'written';
};

/* A refused build means one of two things. Either the reading is thin (no
   source speaks to the subject, or a claim lacks a cited source), or every
   claim was backed and a writing check caught something else, which another
   attempt can pass, so that kind gets a retry. */
const thinReading = (quality = {}) => {
  const m = quality?.metrics;
  const backed = m
    && m.topicallyGroundedSourceCount > 0
    && !m.unsupported && !m.partial && !m.uncitedSupported
    && m.cited >= m.claimCount;
  return !backed;
};

export const buildFailure = (page = {}) => {
  const title = page.title || 'this';
  if (page?.aiState?.errorCode !== 'WIKI_CANDIDATE_REJECTED') {
    return {
      headline: 'That page did not finish.',
      lede: 'The writing stopped partway. Nothing you brought was lost.',
      retry: true
    };
  }
  return thinReading(page.aiState.lastCandidateQuality)
    ? {
      headline: `Your reading does not say enough about ${title} yet.`,
      lede: 'Noeis would have had to invent parts of the page, so it stopped. Pick a topic your sources share, or bring a few more about this one.',
      retry: false
    }
    : {
      headline: `${title} did not pass the last check.`,
      lede: 'Every claim had a source behind it, but the page missed one of the writing checks, so Noeis held it back rather than show it. Try it once more.',
      retry: true
    };
};

/* The page's opening paragraph, which is the first thing worth reading on it:
   headings and empty lines are skipped. */
export const pageLede = (page = {}, max = 420) => {
  const paragraph = String(page?.plainText || '')
    .split(/\n\s*\n/)
    .map(block => block.replace(/\s+/g, ' ').trim())
    .find(block => block && !/^#/.test(block) && words(block).length >= 8) || '';
  if (paragraph.length <= max) return paragraph;
  const cut = paragraph.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
};

export const writtenFrom = (count = 0) => {
  if (!count) return 'Your first page is written.';
  return `Your first page is written, from ${count === 1 ? 'one of your sources' : `${countWord(count)} of your sources`}.`;
};

/* Where taking a wiki lands in first run, carrying what came with it. */
export const tookPath = (pageId, library = null) => {
  const params = new URLSearchParams({ took: pageId });
  if (library?.sources) {
    params.set('sources', library.sources);
    params.set('had', library.alreadyHad || 0);
  }
  return `/welcome?${params}`;
};

export const tookReceipt = ({ sources = 0, had = 0 } = {}) => {
  if (!sources) return 'The wiki you took is in your Wiki now.';
  const arrived = sources === 1 ? 'its source is' : `its ${countWord(sources)} sources are`;
  let already = '';
  if (had >= sources) already = sources === 1 ? ' You had already saved it.' : ' You had already saved every one.';
  else if (had) already = ` ${had === 1 ? 'One' : countWord(had).replace(/^./, c => c.toUpperCase())} of them you had already saved.`;
  return `The wiki you took is in your Wiki, and ${arrived} in your Library.${already}`;
};

export const proposalSources = (count = 0) => (
  count === 1 ? 'from one of your sources' : `from ${countWord(count)} of your sources`
);

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
