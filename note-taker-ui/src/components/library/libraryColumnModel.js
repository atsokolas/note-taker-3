import { humanizeLabel } from '../../utils/humanizeLabel';
import { normalizeSpaces } from '../../utils/editorialText';

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

/** What the agent rail is looking at while the human is in the Library. */
export const librarySubject = ({ article = null, count = 0 } = {}) => {
  const title = normalizeSpaces(article?.title);
  if (title) return title;
  if (count > 0) return `${count} source${count === 1 ? '' : 's'} on the shelf.`;
  return 'Your library.';
};
