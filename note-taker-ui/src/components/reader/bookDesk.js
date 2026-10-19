/* The reading desk's grammar, and what it reads back off the marks.

   A line is typed with the book open beside it, so it has no modes: a number
   in front turns to that page, a quote mark makes it the book's words, and
   anything else is the reader's own. A question is a thought ending in "?".
   Everything the desk shows — the page you are on, tonight's tally, the line
   from last time — is read off the marks themselves and never stored. */

const PAGE_FIRST = /^(\d{1,4})(?:\s+|$)/;
const QUOTED = /^(?:>\s*["“„«]?|["“„«])\s*/;
const CLOSING = /\s*["”»]$/;
const WORD = /[\p{L}\p{N}]+/gu;
// Marks further apart than this were made in different sittings.
const SITTING_GAP_MS = 90 * 60 * 1000;

export const readLine = (raw = '', page = null) => {
  let line = String(raw).trim();
  const turned = PAGE_FIRST.exec(line);
  if (turned) {
    page = Number(turned[1]) || page;
    line = line.slice(turned[0].length).trim();
  }
  if (!line) return { page };
  const quoted = QUOTED.exec(line);
  return quoted
    ? { page, text: line.slice(quoted[0].length).replace(CLOSING, '') }
    : { page, note: line };
};

export const isUnfinished = (text = '') => /…|\.{3}/.test(text);

export const kindOf = (mark = {}) => (
  mark.text ? 'quote' : String(mark.note || '').trim().endsWith('?') ? 'question' : 'note'
);

const at = mark => new Date(mark.createdAt || 0).getTime();
const locationOf = mark => Number((String(mark.location || '').match(/\d+/) || [])[0]) || 0;

/* Kindle marks know a location, desk marks a page. They cannot be put in one
   order, so the Kindle's run comes first and the pages you typed follow it,
   which keeps the desk line beside the marks you are making now. */
export const pagesOf = (marks = []) => {
  const ordered = [...marks].sort((a, b) => (
    (a.page ? 1 : 0) - (b.page ? 1 : 0)
    || (a.page || 0) - (b.page || 0)
    || locationOf(a) - locationOf(b)
    || at(a) - at(b)
  ));
  return ordered.reduce((pages, mark) => {
    const label = mark.page ? `p. ${mark.page}` : mark.location ? mark.location.replace(/^Location\b/, 'Loc.') : '';
    const last = pages[pages.length - 1];
    if (last && last.label === label) last.marks.push(mark);
    else pages.push({ label, marks: [mark] });
    return pages;
  }, []);
};

/* The marks of the sitting still going on: the newest run with no long gap,
   if its last mark was made just now. */
export const sittingOf = (marks = [], now = Date.now()) => {
  const newest = [...marks].sort((a, b) => at(b) - at(a));
  if (!newest.length || now - at(newest[0]) > SITTING_GAP_MS) return [];
  const sitting = [newest[0]];
  for (const mark of newest.slice(1)) {
    if (at(sitting[sitting.length - 1]) - at(mark) > SITTING_GAP_MS) break;
    sitting.push(mark);
  }
  return sitting.reverse();
};

export const pageNow = (marks = []) => (
  [...marks].filter(mark => mark.page).sort((a, b) => at(b) - at(a))[0]?.page || null
);

const counted = (n, one, many = `${one}s`) => (n ? `${n} ${n === 1 ? one : many}` : '');

/* Tonight, as a receipt: the pages it covered and what was written. */
export const tonightLine = (sitting = []) => {
  if (!sitting.length) return '';
  const pages = sitting.map(mark => mark.page).filter(Boolean);
  const span = !pages.length ? ''
    : Math.min(...pages) === Math.max(...pages) ? `p. ${pages[0]}` : `pp. ${Math.min(...pages)}–${Math.max(...pages)}`;
  const kinds = sitting.map(kindOf);
  const tally = [
    counted(kinds.filter(kind => kind === 'quote').length, 'quote'),
    counted(kinds.filter(kind => kind === 'note').length, 'note'),
    counted(kinds.filter(kind => kind === 'question').length, 'question')
  ].filter(Boolean).join(', ');
  return [span, tally].filter(Boolean).join(' · ');
};

/* Where you left off: the last thing you wrote in your own words, or the last
   passage you marked. Nothing when nothing was marked. */
export const lastTime = (marks = []) => {
  const newest = [...marks].sort((a, b) => at(b) - at(a));
  const mark = newest.find(item => item.note) || newest[0];
  if (!mark) return null;
  // A note written to over several sittings ends with the newest of them.
  return { page: mark.page || null, words: mark.note ? mark.note.split(/\n\n/).pop() : mark.text, own: Boolean(mark.note) };
};

/* The book finishing a quote as you type it: the rest of a passage already
   marked (on the Kindle, say) that begins with the words typed so far, so
   that what is sent is that mark. The last word may be half typed. */
const escape = word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const completionFor = (typed = '', marks = []) => {
  const words = String(typed).match(WORD) || [];
  if (words.length < 3 || String(typed).trim().length < 12) return '';
  const midWord = /[\p{L}\p{N}]$/u.test(typed);
  const pattern = new RegExp(
    `^[^\\p{L}\\p{N}]*${words.map(escape).join('[^\\p{L}\\p{N}]+')}${midWord ? '([\\p{L}\\p{N}]*)' : '(?![\\p{L}\\p{N}])'}`,
    'iu'
  );
  for (const { text = '' } of marks) {
    const found = pattern.exec(text);
    const rest = found ? text.slice(found.index + found[0].length - (found[1] || '').length) : '';
    if (rest.trim()) return midWord ? rest : rest.replace(/^\s+/, typed.endsWith(' ') ? '' : ' ');
  }
  return '';
};
