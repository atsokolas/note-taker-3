import { filterLibraryBrowseItems } from '../../utils/cruftSuppression';
import { pickReopenCandidate } from './libraryReadingRoomModel';
import { getExcerpt } from './LibraryArticleList';
import { humanizeLabel } from '../../utils/humanizeLabel';
import { normalizeSpaces } from '../../utils/editorialText';

// The Library column's read model.
//
// The face of the Library is one thing to continue and then a list of what you
// have. Not a cabinet, not a dashboard of counts — a shelf you can read down.
// Everything here is a projection of the articles the API already returned.

const idOf = (article) => normalizeSpaces(article?._id || article?.id);

/** The publication, as a person would name it: "SemiAnalysis", not a hostname. */
export const sourceLabel = (article) => {
  const explicit = normalizeSpaces(article?.source || article?.publication || article?.publisher || article?.siteName);
  if (explicit) return explicit;
  const author = normalizeSpaces(article?.author);
  if (author) return author;
  const url = normalizeSpaces(article?.url);
  if (!url) return '';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const named = host.split('.').filter(Boolean).slice(0, -1).join(' ');
    return humanizeLabel(named || host);
  } catch (_error) {
    return '';
  }
};

const savedAt = (article) => article?.updatedAt || article?.createdAt || null;

const row = (article) => ({
  id: idOf(article),
  title: normalizeSpaces(article?.title) || 'Untitled',
  source: sourceLabel(article),
  date: savedAt(article)
});

const time = (value) => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(at) ? 0 : at;
};

/**
 * One thing to continue, then the shelf.
 *
 * The continue candidate is the same one the reading room already picks — the
 * source you left highlights in — so returning to the Library keeps pointing at
 * the same place rather than reshuffling under you.
 */
export const buildLibraryColumn = ({ articles = [], allArticles = [] } = {}) => {
  const source = (Array.isArray(allArticles) && allArticles.length) ? allArticles : articles;
  const pool = filterLibraryBrowseItems(Array.isArray(source) ? source : []).filter(idOf);
  const candidate = pickReopenCandidate(pool);
  const continueId = idOf(candidate);

  return {
    continueItem: continueId
      ? { ...row(candidate), dek: normalizeSpaces(getExcerpt(candidate)) }
      : null,
    rows: pool
      .filter(article => idOf(article) !== continueId)
      .map(row)
      .sort((left, right) => time(right.date) - time(left.date))
  };
};

/** What the agent rail is looking at while the human is in the Library. */
export const librarySubject = ({ article = null, count = 0 } = {}) => {
  const title = normalizeSpaces(article?.title);
  if (title) return title;
  if (count > 0) return `${count} source${count === 1 ? '' : 's'} on the shelf.`;
  return 'Your library.';
};
