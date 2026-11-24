// The Museum's shapes: what a source offers the wall, how a piece is numbered, and what a visitor may see.
const { stripHtmlToLines } = require('./import/evernoteTransform');

// A passage longer than this no longer reads as one; the wall asks for a shorter cut.
const PASSAGE_MAX = 400;
// What the owner may write on a piece, when hanging it or later.
const PIECE_DETAIL = Object.freeze(['passage', 'why', 'title', 'author', 'medium', 'year', 'room', 'own', 'ledTo']);

const yearOf = date => String(new Date(date || Date.now()).getFullYear());
const onTheWeb = url => (/^https?:\/\//i.test(url || '') ? url : '');
const opening = text => (String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+/g) || [])
  .slice(0, 2).map(sentence => sentence.trim()).join(' ');
const fits = text => text && text.length <= PASSAGE_MAX;
const offered = (text, note = '') => (fits(text) ? [{ text, note }] : []);

/* Each kind of thing that can hang, read by one rule. A reading offers the
   passages its reader marked; a page or a note of your own offers its opening. */
const SOURCES = Object.freeze({
  article: {
    model: 'Article',
    fields: 'title author siteName url publicationDate createdAt highlights.text highlights.note',
    read: article => ({
      title: article.title,
      author: article.author || article.siteName,
      year: (String(article.publicationDate).match(/\b\d{4}\b/) || [''])[0],
      url: onTheWeb(article.url),
      own: false,
      passages: (article.highlights || []).filter(mark => fits(mark.text)).map(mark => ({ text: mark.text, note: mark.note || '' }))
    })
  },
  wiki: {
    model: 'WikiPage',
    fields: 'title plainText createdAt',
    read: page => ({ title: page.title, medium: 'Wiki page in Noeis', own: true, passages: offered(opening(page.plainText)) })
  },
  note: {
    model: 'NotebookEntry',
    fields: 'title content createdAt',
    read: note => ({ title: note.title, medium: 'Note in Noeis', own: true, passages: offered(opening(stripHtmlToLines(note.content).join(' '))) })
  }
});

// Your own pages and notes are dated by when you began them; a reading carries its own date.
const sourceOffer = (kind, record) => ({
  author: '', medium: '', url: '', year: yearOf(record.createdAt), ...SOURCES[kind].read(record), arrivedAt: record.createdAt
});

/* "2016.1": the year it arrived in the collection, then its place among that
   year's arrivals. Numbers of pieces taken down stay spent. */
const nextAccession = ({ pieces = [], retired = [] }, arrivedAt) => {
  const year = yearOf(arrivedAt);
  const taken = [...pieces.map(piece => piece.accession), ...retired].filter(accession => accession.startsWith(`${year}.`));
  return `${year}.${taken.length + 1}`;
};

/* Everything a visitor may see, and nothing else: the wall is an allow-list.
   A page of your own links to its public share only while it is shared. */
const publicMuseum = (museum, pages = new Map()) => {
  const hung = new Set(museum.pieces.map(piece => piece.accession));
  return {
    name: museum.name,
    handle: museum.handle,
    intro: museum.intro,
    retired: museum.retired,
    pieces: museum.pieces.map(piece => {
      const page = piece.kind === 'wiki' ? pages.get(String(piece.targetId)) : null;
      return {
        accession: piece.accession,
        own: piece.own,
        passage: piece.passage,
        why: piece.why,
        title: piece.title,
        author: piece.author,
        medium: piece.medium,
        year: piece.year,
        room: piece.room,
        ledTo: piece.ledTo.filter(accession => hung.has(accession)),
        url: page ? (page.visibility === 'shared' ? `/share/wiki/${page.slug || page._id}` : '') : piece.url,
        reviewedAt: page?.lastReviewedAt || null
      };
    })
  };
};

// The owner sees the same wall, plus what each piece came from and whether the door is open.
const ownerMuseum = (museum, pages) => {
  const wall = publicMuseum(museum, pages);
  return {
    ...wall,
    open: museum.open,
    pieces: wall.pieces.map((piece, at) => ({ ...piece, kind: museum.pieces[at].kind, id: String(museum.pieces[at].targetId) }))
  };
};

module.exports = { PASSAGE_MAX, PIECE_DETAIL, SOURCES, nextAccession, ownerMuseum, publicMuseum, sourceOffer };
