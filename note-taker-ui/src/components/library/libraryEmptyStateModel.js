/** @typedef {'first-run' | 'scoped-empty' | 'search-empty' | 'suppressed-empty' | 'legacy'} LibraryEmptyStateKind */

/**
 * @typedef {{
 *   kind: LibraryEmptyStateKind;
 *   scopeLabel?: string;
 *   corpusTotal?: number;
 *   suppressedCount?: number;
 *   query?: string;
 *   emptyLabel?: string;
 * }} LibraryEmptyStateModel
 */

const SCOPE_LABELS = {
  all: 'All',
  unfiled: 'Unfiled',
  folder: 'Cabinet',
  highlights: 'Highlights'
};

export const getLibraryScopeLabel = (scope = 'all') => (
  SCOPE_LABELS[scope] || 'All'
);

/**
 * Decide which empty-state presentation fits the current Library browse context.
 *
 * @param {{
 *   scope?: string;
 *   corpusTotal?: number;
 *   rawCorpusTotal?: number;
 *   suppressedCount?: number;
 *   suppressedVisible?: boolean;
 *   query?: string;
 *   emptyLabel?: string;
 * }} params
 * @returns {LibraryEmptyStateModel | null}
 */
export const resolveLibraryEmptyState = ({
  scope = 'all',
  corpusTotal,
  rawCorpusTotal,
  suppressedCount = 0,
  suppressedVisible = false,
  query = '',
  emptyLabel = ''
} = {}) => {
  const trimmedQuery = String(query || '').trim();
  if (!Number.isFinite(Number(corpusTotal)) && !trimmedQuery) return null;
  const total = Number(corpusTotal) || 0;
  const rawTotal = Number.isFinite(Number(rawCorpusTotal)) ? Number(rawCorpusTotal) : 0;
  const hiddenCount = Number(suppressedCount) || 0;

  if (trimmedQuery) {
    return {
      kind: 'search-empty',
      scopeLabel: getLibraryScopeLabel(scope),
      corpusTotal: total,
      query: trimmedQuery
    };
  }

  if (total === 0 && rawTotal === 0) {
    return { kind: 'first-run', scopeLabel: getLibraryScopeLabel(scope) };
  }

  if (total === 0 && hiddenCount > 0 && !suppressedVisible) {
    return {
      kind: 'suppressed-empty',
      scopeLabel: getLibraryScopeLabel(scope),
      suppressedCount: hiddenCount,
      emptyLabel
    };
  }

  if (total > 0) {
    return {
      kind: 'scoped-empty',
      scopeLabel: getLibraryScopeLabel(scope),
      corpusTotal: total,
      emptyLabel
    };
  }

  return {
    kind: 'legacy',
    scopeLabel: getLibraryScopeLabel(scope),
    emptyLabel: emptyLabel || 'No articles here yet.'
  };
};

/*
 * A count nobody has yet is not zero. These refuse to state one — an unknown
 * total returns nothing at all, so a Library that is merely still reading can
 * never announce "0 sources are in Library" over a shelf that is full. The
 * sentence carries its own full stop, because punctuation belongs to the
 * phrase that knows whether there is a phrase.
 */
const countSentence = (count, one, many) => {
  // Number(null) is 0, which is how "we have not looked yet" becomes a
  // confident "none". Absence is checked before arithmetic gets a say.
  if (count === null || count === undefined || count === '') return '';
  const total = Number(count);
  if (!Number.isFinite(total)) return '';
  return `${total} ${total === 1 ? one : many}.`;
};

export const formatLibraryCorpusCount = count => (
  countSentence(count, 'source is in Library', 'sources are in Library')
);

export const formatLibrarySuppressedCount = count => (
  countSentence(count, 'review import is hidden from this view', 'review imports are hidden from this view')
);
