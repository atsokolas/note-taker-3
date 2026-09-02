import { filterLibraryBrowseItems } from '../../utils/cruftSuppression';
import { isImboxArticle } from '../../pages/placementModel';
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

const SIX_DAYS = 6 * 24 * 60 * 60 * 1000;

/**
 * Where you left off in the thing you are being offered back.
 *
 *   You were 40% through, Tuesday.
 *
 * Both halves come from highlights that already exist: the furthest point you
 * marked in the piece, and the day you marked it. Nothing new is stored — a
 * reading position nobody wrote down is a reading position we do not have, and
 * the honest thing to do with one of those is say nothing.
 *
 * So it is silent when the ratio is unknown, when nothing has been marked, and
 * at both ends: 0% is "you opened it", 100% is "you finished it", and neither
 * is a place to return to.
 */
export const continueLine = (item = {}, now = new Date()) => {
  const place = item?.lastPlace;
  const ratio = Number(place?.ratio);
  if (!place || !Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return '';
  const at = place.at ? new Date(place.at) : null;
  if (!at || Number.isNaN(at.getTime())) return '';

  const percent = Math.round(ratio * 100);
  if (percent <= 0 || percent >= 100) return '';

  /* A weekday inside the week, a date beyond it: "Tuesday" stops meaning
     anything once there has been more than one of them. */
  const elapsed = now.getTime() - at.getTime();
  const when = elapsed >= 0 && elapsed <= SIX_DAYS
    ? at.toLocaleDateString(undefined, { weekday: 'long' })
    : at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return `You were ${percent}% through, ${when}.`;
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
  const pool = filterLibraryBrowseItems(Array.isArray(source) ? source : [])
    .filter(idOf)
    .filter(isImboxArticle);
  const candidate = pickReopenCandidate(pool);
  const continueId = idOf(candidate);

  return {
    continueItem: continueId
      ? {
        ...row(candidate),
        dek: normalizeSpaces(getExcerpt(candidate)),
        place: continueLine({ lastPlace: candidate?.lastPlace })
      }
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
