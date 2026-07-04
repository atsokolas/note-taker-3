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
  corpusTotal = 0,
  rawCorpusTotal = 0,
  suppressedCount = 0,
  suppressedVisible = false,
  query = '',
  emptyLabel = ''
} = {}) => {
  const trimmedQuery = String(query || '').trim();
  const total = Number(corpusTotal) || 0;
  const rawTotal = Number(rawCorpusTotal) || 0;
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

export const formatLibraryCorpusCount = (count = 0) => {
  const total = Number(count) || 0;
  const label = total === 1 ? 'source is' : 'sources are';
  return `${total} ${label} in Library`;
};

export const formatLibrarySuppressedCount = (count = 0) => {
  const total = Number(count) || 0;
  const label = total === 1 ? 'import is' : 'imports are';
  return `${total} review ${label} hidden from this view`;
};
