/**
 * Reaching for a source mid-sentence.
 *
 * Why and Against are where a belief is actually formed, and until now the
 * only way a source got onto one was to accept something the agent had already
 * brought you. You could not go and find the thing you were thinking of. So
 * the line you wrote said "lead times are stretching" and the case had no idea
 * where you got that, which is the one question the whole product exists to
 * answer later.
 *
 * `@` is the reach. It is the same key the note editor already uses to pull a
 * source into a note, so it is one gesture in two places rather than two
 * gestures to learn.
 */

import { normalizeSpaces } from '../utils/editorialText';

/** The mark. One character, and it only opens at a word boundary. */
export const MENTION = '@';

const clean = (value = '') => normalizeSpaces(String(value || ''));

/**
 * What the writer is reaching for, or null.
 *
 * Only the `@` nearest the caret counts, and only when it opens a word — an
 * address in the middle of a sentence is an address, not a request. The query
 * ends at the caret rather than at the next space, so a two-word title can be
 * searched for without the picker closing halfway through typing it.
 */
export const readMention = (draft = '', caret = null) => {
  const text = String(draft || '');
  const at = caret === null || caret === undefined ? text.length : Math.max(0, Math.min(caret, text.length));
  const start = text.lastIndexOf(MENTION, Math.max(0, at - 1));
  if (start < 0) return null;

  const before = start > 0 ? text[start - 1] : '';
  if (before && !/\s/.test(before)) return null;

  const query = text.slice(start + 1, at);
  // A newline closes it. So does the writer moving the caret back past the mark.
  if (/[\n\r]/.test(query) || at <= start) return null;

  return { query, from: start, to: at };
};

/**
 * The draft with the reach replaced by nothing.
 *
 * The mention is a gesture, not text: once a source is chosen the sentence
 * should read as though you had simply written it. What stays behind is the
 * source itself, pinned to the line.
 */
export const clearMention = (draft = '', mention = null) => {
  if (!mention) return String(draft || '');
  const text = String(draft || '');
  const head = text.slice(0, mention.from).replace(/\s+$/, '');
  const tail = text.slice(mention.to).replace(/^\s+/, '');
  if (!head) return tail;
  if (!tail) return head;
  return `${head} ${tail}`;
};

const matches = (label, query) => {
  const needle = clean(query).toLowerCase();
  if (!needle) return true;
  return clean(label).toLowerCase().includes(needle);
};

const keyOf = (source) => clean(source?.id) || clean(source?.href) || clean(source?.label).toLowerCase();

/**
 * What tells two sources of the same name apart.
 *
 * A shelf of Berkshire letters is twenty rows all called "To the Shareholders
 * of Berkshire Hathaway Inc.:", and a picker that prints that four times is
 * asking the reader to guess. Their own addresses already distinguish them —
 * letters/1994, letters/1995 — so the address is what gets shown, and only
 * where a name is actually ambiguous. A piece with a name of its own says
 * nothing extra.
 */
const distinguisher = (url = '') => {
  const address = clean(url);
  if (!address) return '';
  try {
    const { hostname, pathname } = new URL(address);
    const last = pathname.split('/').filter(Boolean).pop() || '';
    const named = last.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[-_]+/g, ' ').trim();
    return named || hostname.replace(/^www\./, '');
  } catch (_error) {
    return '';
  }
};

/** A picker is a shortlist. Twenty rows is a search results page. */
export const PICKER_LIMIT = 8;

/**
 * What to offer, in the order it deserves to be offered.
 *
 * Sources already on the case come first and are never dropped by a search:
 * the reader bound them to this belief, which is a stronger signal about
 * relevance than any query. Everything the library turned up follows, minus
 * whatever is already bound — the same thing listed twice under two headings
 * is the picker asking the reader to notice it is two lists.
 */
export const rankSourceOptions = ({ bound = [], found = [], query = '' } = {}) => {
  const options = [];
  const seen = new Set();

  const add = (source, origin) => {
    const label = clean(source?.label || source?.title);
    const key = keyOf({ ...source, label });
    if (!label || !key || seen.has(key)) return;
    seen.add(key);
    options.push({
      id: clean(source?.id) || key,
      label,
      href: clean(source?.href) || '',
      url: clean(source?.url) || '',
      origin
    });
  };

  (Array.isArray(bound) ? bound : [])
    .filter((source) => matches(source?.label || source?.title, query))
    .forEach((source) => add(source, 'bound'));

  (Array.isArray(found) ? found : []).forEach((source) => add(source, 'library'));

  const shortlist = options.slice(0, PICKER_LIMIT);

  /* Only a name that repeats inside what is actually being offered needs
     telling apart. Marking every row with its address would make the picker
     harder to read in order to solve a problem most of it does not have. */
  const seenLabels = new Map();
  shortlist.forEach((option) => {
    seenLabels.set(option.label, (seenLabels.get(option.label) || 0) + 1);
  });

  return shortlist.map((option) => (
    seenLabels.get(option.label) > 1
      ? { ...option, detail: distinguisher(option.url) }
      : option
  ));
};

/**
 * The library's answer, in the shape the picker speaks.
 *
 * Search answers in kinds — `{ articles, highlights, notebook }` — and the two
 * that can be cited on a belief are the first two. A highlight is read back to
 * the piece it was taken from, because what a reason rests on is the source,
 * not the sentence someone once marked in it; that also means a piece found
 * twice, once whole and once through a highlight, is offered once.
 *
 * A result with nothing to call it is dropped rather than listed as
 * "Untitled". An unnamed citation is not a citation.
 */
export const sourcesFromSearch = (payload) => {
  const rows = Array.isArray(payload)
    ? payload
    : [...(payload?.articles || []), ...(payload?.highlights || [])];
  return rows.reduce((sources, row) => {
    const id = clean(row?.articleId || row?._id || row?.id);
    const label = clean(row?.articleTitle || row?.title);
    if (!id || !label) return sources;
    sources.push({ id, label, url: clean(row?.url), href: `/articles/${encodeURIComponent(id)}` });
    return sources;
  }, []);
};
