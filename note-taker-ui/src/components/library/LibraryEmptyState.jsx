import React from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, buttonClass } from '../ui';
import { TOUR_EXTENSION_URL } from '../../tour/tourConfig';
import {
  formatLibraryCorpusCount,
  formatLibrarySuppressedCount,
  resolveLibraryEmptyState
} from './libraryEmptyStateModel';

const primary = buttonClass('primary');
const quietLink = 'ui-empty-state__link';

const clearSearch = (onClearSearch, href) => (onClearSearch ? (
  <Button variant="primary" data-testid="library-empty-clear-search" onClick={() => onClearSearch()}>
    Clear search
  </Button>
) : (
  <Link className={primary} to={href}>Clear search</Link>
));

/* One empty Library, whichever list is empty. */
export default function LibraryEmptyState({
  scope,
  corpusTotal,
  rawCorpusTotal,
  suppressedCount,
  suppressedVisible,
  query,
  emptyLabel,
  latestReceipt,
  /* The mixed source list knows a little more: what a loaded page holds,
     and how many sources review-import filters hid. */
  mixed = false,
  hasMore = false,
  filteredOutCount = 0,
  onClearSearch
}) {
  if (mixed && query) {
    return (
      <EmptyState
        data-testid="library-empty-search"
        eyebrow="Library · Search"
        title={<>{hasMore ? 'No loaded sources' : 'No sources'} match &ldquo;{query}&rdquo;</>}
        actions={onClearSearch ? clearSearch(onClearSearch) : null}
      >
        {hasMore ? 'More sources remain outside the loaded pages.' : null}
      </EmptyState>
    );
  }

  if (mixed && filteredOutCount > 0) {
    return (
      <EmptyState
        data-testid="library-empty-suppressed"
        eyebrow="Library · Sources"
        title="No visible sources in this view."
        actions={<Link className={primary} to="/library?scope=all&showSuppressed=1">Show review imports</Link>}
      >
        {filteredOutCount} {filteredOutCount === 1 ? 'source is' : 'sources are'} hidden by review-import filters.
      </EmptyState>
    );
  }

  if (mixed && corpusTotal > 0) {
    return (
      <EmptyState data-testid="library-empty-scoped" eyebrow="Library · Sources" title="No sources in this view.">
        {emptyLabel || 'Try another source view.'}
      </EmptyState>
    );
  }

  const model = resolveLibraryEmptyState({
    scope,
    corpusTotal,
    rawCorpusTotal,
    suppressedCount,
    suppressedVisible,
    query,
    emptyLabel
  });
  if (!model) return null;
  const eyebrow = `Library · ${model.scopeLabel}`;

  if (model.kind === 'first-run') {
    return (
      <EmptyState
        data-testid="library-empty-first-run"
        eyebrow={eyebrow}
        title="Save your first source"
        actions={(
          <>
            <Link className={primary} to="/connections#sources">Connect a source</Link>
            <a className={quietLink} href={TOUR_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
              Install browser extension
            </a>
            <Link className={quietLink} to="/how-to-use">See the full walkthrough</Link>
          </>
        )}
      >
        <p>
          Connect Readwise, import notes, or use the browser extension to save articles.
          Sources you add show up here, ready to read, highlight, and turn into concepts.
        </p>
        {latestReceipt?.summary ? (
          <p data-testid="library-empty-receipt">Last import: {latestReceipt.summary}</p>
        ) : null}
      </EmptyState>
    );
  }

  if (model.kind === 'scoped-empty') {
    return (
      <EmptyState
        data-testid="library-empty-scoped"
        data-scope={scope}
        eyebrow={eyebrow}
        title={model.scopeLabel === 'All' ? 'No sources in this view.' : `No sources in ${model.scopeLabel}.`}
        actions={<Link className={primary} to="/library?scope=all" data-testid="library-empty-show-all">Show all sources</Link>}
      >
        {[formatLibraryCorpusCount(model.corpusTotal), model.emptyLabel].filter(Boolean).join(' ')}
      </EmptyState>
    );
  }

  if (model.kind === 'suppressed-empty') {
    return (
      <EmptyState
        data-testid="library-empty-suppressed"
        data-scope={scope}
        eyebrow={eyebrow}
        title="No visible sources in this view."
        actions={(
          <>
            <Link
              className={primary}
              to={`/library?scope=${encodeURIComponent(scope || 'all')}&showSuppressed=1`}
              data-testid="library-empty-show-suppressed"
            >
              Show review imports
            </Link>
            <Link className={quietLink} to="/library?scope=all" data-testid="library-empty-show-all">
              Show all sources
            </Link>
          </>
        )}
      >
        {formatLibrarySuppressedCount(model.suppressedCount)}
        {model.emptyLabel ? ` ${model.emptyLabel}` : ''}
      </EmptyState>
    );
  }

  if (model.kind === 'search-empty') {
    const clearSearchHref = scope && scope !== 'all'
      ? `/library?scope=${encodeURIComponent(scope)}`
      : '/library?scope=all';
    return (
      <EmptyState
        data-testid="library-empty-search"
        eyebrow="Library · Search"
        title={<>No sources match &ldquo;{model.query}&rdquo;</>}
        actions={(
          <>
            {clearSearch(onClearSearch, clearSearchHref)}
            <Link className={quietLink} to="/library?scope=all">Search all Library</Link>
          </>
        )}
      >
        {model.corpusTotal > 0 ? formatLibraryCorpusCount(model.corpusTotal) : null}
      </EmptyState>
    );
  }

  return (
    <EmptyState actions={<Link className={quietLink} to="/library?scope=all">Show all sources</Link>}>
      {model.emptyLabel || 'No articles here yet.'}
    </EmptyState>
  );
}
