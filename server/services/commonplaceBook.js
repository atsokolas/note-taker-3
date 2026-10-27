const { ACTIVE, buildReadingMap } = require('./readingMapService');

/* A year of reading as a commonplace book: every passage you marked that
   year, with the note you wrote beside it, gathered into the subjects the
   reading map already found and set to be printed.

   Eligibility: highlights made in the year (UTC), on the sources the
   reading map draws from (the default Library, nothing hidden).
   Quality bar: a passage of at least MIN_PASSAGE characters; nothing else
   is judged, because it is your own commonplace book.
   Chapters: the reading map's subjects. A source the map did not place, or
   any source when the map is quiet, goes to the chapter with no name.
   Epigraph: the passage you went back to most that year, if you opened
   any passage at least EPIGRAPH_OPENS times. Otherwise there is none.
   Silence: a year with nothing marked has no chapters, and the page says
   so in one line. */

const MIN_PASSAGE = 12;
const EPIGRAPH_OPENS = 2;

const plain = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const yearOf = value => new Date(value).getUTCFullYear();

const composeBook = ({ year, articles = [], map = null }) => {
  const marks = articles.flatMap(article => (article.highlights || [])
    .filter(mark => mark.createdAt && plain(mark.text).length >= MIN_PASSAGE)
    .map(mark => ({ article, mark })));
  const years = [...new Set(marks.map(({ mark }) => yearOf(mark.createdAt)))].sort((a, b) => b - a);
  const chosen = Number.isInteger(year) ? year : (years[0] || new Date().getUTCFullYear());
  const passages = marks
    .filter(({ mark }) => yearOf(mark.createdAt) === chosen)
    .sort((a, b) => new Date(a.mark.createdAt) - new Date(b.mark.createdAt));

  const subjects = new Map((map?.clusters || []).map(cluster => [cluster.id, cluster.name]));
  const subjectOf = new Map((map?.sources || []).map(source => [source.id, subjects.get(source.cluster) || null]));

  const sources = new Map();
  passages.forEach(({ article, mark }) => {
    const id = String(article._id);
    if (!sources.has(id)) {
      sources.set(id, {
        id,
        title: plain(article.title),
        byline: plain(article.author || article.siteName),
        subject: subjectOf.get(id) || null,
        passages: []
      });
    }
    sources.get(id).passages.push({ id: String(mark._id), text: plain(mark.text), note: plain(mark.note) });
  });

  const chapters = new Map();
  sources.forEach((source) => {
    const { subject, ...rest } = source;
    if (!chapters.has(subject)) chapters.set(subject, { name: subject, passages: 0, sources: [] });
    const chapter = chapters.get(subject);
    chapter.sources.push(rest);
    chapter.passages += rest.passages.length;
  });

  const returnedTo = passages
    .filter(({ mark }) => Number(mark.opens) >= EPIGRAPH_OPENS)
    .reduce((best, item) => (!best || Number(item.mark.opens) > Number(best.mark.opens) ? item : best), null);

  return {
    year: chosen,
    years,
    passages: passages.length,
    sources: sources.size,
    epigraph: returnedTo ? {
      text: plain(returnedTo.mark.text),
      title: plain(returnedTo.article.title),
      articleId: String(returnedTo.article._id),
      highlightId: String(returnedTo.mark._id)
    } : null,
    // Named subjects, largest first; the unnamed chapter always closes the book.
    chapters: [...chapters.values()].sort((a, b) => (a.name === null) - (b.name === null)
      || b.passages - a.passages
      || String(a.name).localeCompare(String(b.name)))
  };
};

const buildCommonplaceBook = async ({ userId, year, models, readingMap = buildReadingMap }) => {
  const articles = await models.Article.find({ userId, ...ACTIVE, 'highlights.0': { $exists: true } })
    .select('title author siteName highlights._id highlights.text highlights.note highlights.createdAt highlights.opens')
    .lean();
  // The chapters are a courtesy; a map that cannot be drawn leaves one chapter.
  const map = await readingMap({ userId, models }).catch(() => null);
  return composeBook({ year, articles, map });
};

module.exports = { buildCommonplaceBook, composeBook };
