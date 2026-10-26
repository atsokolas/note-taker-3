/* The reading desk's grammar, and what it reads back off the marks.

   A line is typed with the book open beside it, so it has no modes: a number
   in front turns to that page, a quote mark makes it the book's words, and
   anything else is the reader's own. A question is a thought ending in "?".
   A #word anywhere files the mark under that concept.
   Everything the desk shows — the page you are on, tonight's tally, the line
   from last time — is read off the marks themselves and never stored. */

const PAGE_FIRST = /^(\d{1,4})(?:\s+|$)/;
const QUOTED = /^(?:>\s*["“„«]?|["“„«])\s*/;
const CLOSING = /\s*["”»]$/;
const TAG = /(^|\s)#(\p{L}[\p{L}\p{N}_-]*)/gu;
const WORD = /[\p{L}\p{N}]+/gu;
// Marks further apart than this were made in different sittings.
const SITTING_GAP_MS = 90 * 60 * 1000;
// A book untouched this long was set down.
const SET_DOWN_MS = 30 * 24 * 60 * 60 * 1000;

export const readLine = (raw = '', page = null) => {
  const tags = [...String(raw).matchAll(TAG)].map(match => match[2]);
  const filed = tags.length ? { tags } : {};
  let line = String(raw).replace(TAG, '$1').replace(/\s+/g, ' ').trim();
  const turned = PAGE_FIRST.exec(line);
  if (turned) {
    page = Number(turned[1]) || page;
    line = line.slice(turned[0].length).trim();
  }
  if (!line) return { page, ...filed };
  const quoted = QUOTED.exec(line);
  return quoted
    ? { page, ...filed, text: line.slice(quoted[0].length).replace(CLOSING, '') }
    : { page, ...filed, note: line };
};

export const isUnfinished = (text = '') => /…|\.{3}/.test(text);

export const kindOf = (mark = {}) => (
  mark.text ? 'quote' : String(mark.note || '').trim().endsWith('?') ? 'question' : 'note'
);

const at = mark => new Date(mark.createdAt || 0).getTime();
const sameWords = (value = '') => (String(value).match(WORD) || []).join(' ').toLowerCase();

/* A book read again keeps every reading. This one began when the book was
   last started again; marks made before it are earlier ink, still on the
   page, faded and dated. A first reading began at 0, so nothing is earlier. */
export const readingSince = (book = {}) => Math.max(0, ...(book.readBefore || []).map(({ until }) => new Date(until).getTime()));
export const isEarlier = (mark, since) => at(mark) < since;

/* The earlier mark of the same passage, when one marked again was marked last time too. */
export const markedBefore = (text, marks = [], since = 0) => (
  text ? marks.find(mark => isEarlier(mark, since) && mark.text && sameWords(mark.text) === sameWords(text)) : null
);

/* A book you stopped reading: not finished, and nothing written in it for a
   month. A note added to an old mark touches the book, not the mark, so the
   book's own last change counts too. It stays on the shelf, never moved off; the desk only asks why, and
   the answer, typed in the line, is a mark that picks it up again. */
export const setDownOn = (book = {}, marks = [], now = Date.now()) => {
  if (book.finishedOn) return null;
  const last = Math.max(at(book), new Date(book.updatedAt || 0).getTime() || 0, readingSince(book), ...marks.map(at));
  return last && now - last > SET_DOWN_MS ? new Date(last) : null;
};

// A book is finished on a calendar day ("2026-10-19"), read here as that day.
export const dayOf = (day, years = 0) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year + years, month - 1, date);
};
export const longDate = date => date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
export const monthOf = date => date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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

/* The spine: every mark placed along the book, by printed page, or by Kindle
   location for a book read on the Kindle. The book's length is not known,
   so it runs to the furthest mark, and says so. The thickest tenth is named,
   with the first mark in it, only when it stands out: twice its share and at
   least three marks. Marks from an earlier reading are on it too, faded. */
export const spineOf = (marks = [], since = 0) => {
  const paged = marks.filter(mark => mark.page).map(mark => [mark, mark.page]);
  const located = marks.filter(mark => !mark.page && locationOf(mark)).map(mark => [mark, locationOf(mark)]);
  const [unit, span, placed] = paged.length >= located.length ? ['p.', 'pp.', paged] : ['Loc.', 'Loc.', located];
  if (placed.length < 3) return null;
  const end = Math.max(...placed.map(([, at]) => at));
  const ticks = placed.map(([mark, place]) => ({
    id: mark._id, at: place / end, kind: kindOf(mark), label: `${unit} ${place}`, earlier: isEarlier(mark, since)
  }));
  const tenthOf = tick => Math.min(9, Math.floor(tick.at * 10));
  const tenths = Array.from({ length: 10 }, (_, tenth) => ticks.filter(tick => tenthOf(tick) === tenth).length);
  const most = Math.max(...tenths);
  const tenth = tenths.indexOf(most);
  const thickest = most >= 3 && most >= placed.length / 5 ? {
    label: `${span} ${Math.max(1, Math.round((tenth * end) / 10))}–${Math.round(((tenth + 1) * end) / 10)}`,
    id: [...ticks].sort((a, b) => a.at - b.at).find(tick => tenthOf(tick) === tenth).id
  } : null;
  return { ticks, end: `${unit} ${end}`, thickest };
};

/* The marks split into the sittings they were made in, oldest first. */
export const sittingsOf = (marks = []) => [...marks].sort((a, b) => at(a) - at(b)).reduce((runs, mark) => {
  const run = runs[runs.length - 1];
  if (run && at(mark) - at(run[run.length - 1]) <= SITTING_GAP_MS) run.push(mark);
  else runs.push([mark]);
  return runs;
}, []);

/* The marks of the sitting still going on: the newest run, if its last mark
   was made just now. */
export const sittingOf = (marks = [], now = Date.now()) => {
  const run = sittingsOf(marks).pop() || [];
  return run.length && now - at(run[run.length - 1]) <= SITTING_GAP_MS ? run : [];
};

export const pageNow = (marks = []) => (
  [...marks].filter(mark => mark.page).sort((a, b) => at(b) - at(a))[0]?.page || null
);

const counted = (n, one, many = `${one}s`) => (n ? `${n} ${n === 1 ? one : many}` : '');

/* A run of marks as a receipt: the pages it covered and what was written.
   Tonight's sitting at the desk, or a whole book on the shelf. */
export const tallyLine = (marks = []) => {
  if (!marks.length) return '';
  const pages = marks.map(mark => mark.page).filter(Boolean);
  const span = !pages.length ? ''
    : Math.min(...pages) === Math.max(...pages) ? `p. ${pages[0]}` : `pp. ${Math.min(...pages)}–${Math.max(...pages)}`;
  const kinds = marks.map(kindOf);
  const tally = [
    counted(kinds.filter(kind => kind === 'quote').length, 'quote'),
    counted(kinds.filter(kind => kind === 'note').length, 'note'),
    counted(kinds.filter(kind => kind === 'question').length, 'question')
  ].filter(Boolean).join(', ');
  return [span, tally].filter(Boolean).join(' · ');
};

/* What a sitting is called, by the hour of its newest mark on your clock. */
export const sittingLabel = (date) => {
  const hour = date.getHours();
  return hour < 5 ? 'Past midnight' : hour < 12 ? 'This morning' : hour < 18 ? 'This afternoon' : 'Tonight';
};

/* An answer you kept from the book sits under your question as a paragraph
   of its own, opening with these words, and is never counted as yours. */
export const BOOK_SAYS = 'The book: ';
const ownParagraphs = (note = '') => String(note).split(/\n\n/).filter(part => part.trim() && !part.startsWith(BOOK_SAYS));
const ownWords = mark => ownParagraphs(mark.note).join(' ').match(WORD)?.length || 0;

/* Where you left off: the last thing you wrote in your own words, or the last
   passage you marked. Nothing when nothing was marked. */
export const lastTime = (marks = []) => {
  const newest = [...marks].sort((a, b) => at(b) - at(a));
  const mark = newest.find(ownWords) || newest[0];
  if (!mark) return null;
  // A note written to over several sittings ends with the newest of them.
  const own = Boolean(ownWords(mark));
  return { page: mark.page || null, words: own ? ownParagraphs(mark.note).pop() : mark.text, own };
};

/* A finished book's bookends: the first thing you marked in it and the last,
   in its words or yours, and how many words of your own you wrote beside it. */
export const bookendsOf = (marks = []) => {
  const read = [...marks].sort((a, b) => at(a) - at(b));
  const wordsOf = mark => mark.text || ownParagraphs(mark.note)[0] || '';
  return {
    first: read.length > 1 ? wordsOf(read[0]) : '',
    last: read.length > 1 ? wordsOf(read[read.length - 1]) : '',
    words: read.reduce((sum, mark) => sum + ownWords(mark), 0)
  };
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
