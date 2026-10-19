/* A passage is the same passage however it was written down. A reader at the
   desk types a quote by hand, often only its ends with an ellipsis for the
   middle the book already holds; a Kindle or an EPUB has every word. These
   say when two of them are one, and give back the book's own words. */

const WORDS = /[\p{L}\p{N}]+/gu;
const ELLIPSIS = /\s*(?:…|\.{3})\s*/;
// Ends further apart than this are two thoughts, not one quote.
const LONGEST_PASSAGE = 3000;
// A Kindle highlight and the note typed beside it a moment later are one thought.
const SAME_MOMENT_MS = 2 * 60 * 1000;

const wordsOf = value => String(value || '').match(WORDS) || [];
const sameWords = value => wordsOf(value).join(' ').toLowerCase();
const isUnfinished = text => ELLIPSIS.test(String(text || ''));
const escape = word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const run = words => new RegExp(`(?<![\\p{L}\\p{N}])${words.map(escape).join('[^\\p{L}\\p{N}]+')}(?![\\p{L}\\p{N}])`, 'iu');

/* The words of `text` that `typed` stands for, as `text` prints them, or ''
   when `text` does not hold them. Too few words to be sure is no match. */
const passageIn = (text = '', typed = '') => {
  const ends = String(typed || '').split(ELLIPSIS).map(wordsOf).filter(words => words.length);
  if (!ends.length || ends.flat().length < 4) return '';
  const start = run(ends[0]).exec(text);
  if (!start || ends.length === 1) return start ? start[0] : '';
  const from = start.index + start[0].length;
  const end = run(ends[ends.length - 1]).exec(text.slice(from, start.index + LONGEST_PASSAGE));
  return end ? text.slice(start.index, from + end.index + end[0].length) : '';
};

/* Two passages are one when they carry the same words, or when one was typed
   with only its ends and both ends are in the other. */
const samePassage = (a = '', b = '') => {
  if (!a || !b) return false;
  if (sameWords(a) === sameWords(b)) return true;
  return Boolean((isUnfinished(a) && passageIn(b, a)) || (isUnfinished(b) && passageIn(a, b)));
};

const joinNotes = (held = '', arriving = '') => (
  !arriving || held.includes(arriving) ? held : held ? `${held}\n\n${arriving}` : arriving
);

/* The mark already in the book that an arriving passage is: the same words,
   a quote typed with only its ends that these words complete, or a note
   typed on its own at the moment this passage was marked. It takes the
   book's words and the arriving note, and is returned; null when the
   passage is new. */
const absorbPassage = (highlights = [], { text = '', note = '', at = null } = {}) => {
  const moment = at ? new Date(at).getTime() : NaN;
  const held = highlights.find(mark => (mark.text
    ? samePassage(mark.text, text)
    : Number.isFinite(moment) && Math.abs(new Date(mark.createdAt).getTime() - moment) <= SAME_MOMENT_MS));
  if (!held) return null;
  held.text = !held.text ? text : isUnfinished(held.text) ? passageIn(text, held.text) || held.text : held.text;
  held.note = joinNotes(held.note || '', note);
  return held;
};

module.exports = { absorbPassage, isUnfinished, joinNotes, passageIn, samePassage, sameWords };
