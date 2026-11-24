/*
 * The Museum: one wall of the few pieces that shaped how someone thinks.
 *
 * The server keeps only what the owner chose. Everything a visitor reads off
 * a frame (its size, its tag, the year it arrived, what it stands on) is
 * worked out here from those choices, so nothing on the wall can drift from
 * the pieces it describes.
 */

// A line this short hangs as a maxim, set large; anything longer hangs as a passage.
export const MAXIM = 60;

const words = text => String(text || '').match(/\p{L}+/gu) || [];

/** "Athan Tsokolas" → "AT", "Athan" → "AT": the mark stamped before every number. */
export const markOf = (name = '') => {
  const [first = 'No', ...rest] = words(name);
  return (rest.length ? first[0] + rest.at(-1)[0] : first.slice(0, 2)).toUpperCase();
};

export const tagOf = (piece, name) => `${markOf(name)}.${piece.accession}`;

// The year it entered the collection is the first part of its number.
export const arrivedIn = piece => String(piece.accession || '').split('.')[0];

const maximSize = length => (length <= 8 ? 104 : Math.round(Math.max(40, Math.min(64, 64 - (length - 18) * 0.6))));
const passageSize = length => (length <= 120 ? 28 : length <= 220 ? 24 : 21);

// The longest word must fit across its mat: a ceiling, in hundredths of the mat's width.
const fitOf = text => Math.floor(190 / Math.max(4, ...words(text).map(word => word.length)));

/** What a frame shows and how large: the passage, or the title when nothing was quoted. */
export const frameOf = (piece = {}) => {
  const text = piece.passage || piece.title || '';
  const maxim = text.length <= MAXIM;
  return { text, maxim, quoted: Boolean(piece.passage), size: maxim ? maximSize(text.length) : passageSize(text.length), fit: fitOf(text) };
};

export const standsOn = (pieces = [], accession = '') => pieces.filter(piece => piece.ledTo?.includes(accession));

export const roomsOf = (pieces = []) => [...new Set(pieces.map(piece => piece.room).filter(Boolean))];

const fragment = text => encodeURIComponent(text).replace(/-/g, '%2D');

/*
 * A link that opens the original at the very lines on the wall: the browser
 * scrolls to them and marks them. A long passage is named by its first and
 * last few words, which is how text fragments name a range.
 */
export const atThePassage = (url = '', passage = '') => {
  if (!/^https?:\/\//.test(url) || !passage) return url;
  const said = passage.trim().replace(/^["“‘']|["”’']$/g, '').split(/\s+/);
  const named = said.length > 10
    ? `${fragment(said.slice(0, 4).join(' '))},${fragment(said.slice(-4).join(' '))}`
    : fragment(said.join(' '));
  return `${url.split('#')[0]}#:~:text=${named}`;
};

export const reviewedLine = (at) => (at
  ? `Last reviewed ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  : '');

export const wallTitle = (name = '') => (name ? `${name}’s wall` : 'Your wall');

export const museumPath = (handle = '', accession = '') => ['/museum', handle, accession].filter(Boolean).join('/');
