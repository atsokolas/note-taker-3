import React from 'react';
import { Link } from 'react-router-dom';
import { TOUR_EXTENSION_URL } from '../../tour/tourConfig';
import {
  formatLibraryCorpusCount,
  formatLibrarySuppressedCount,
  resolveLibraryEmptyState
} from './libraryEmptyStateModel';

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
      <div className="library-empty-state library-empty-state--scoped" data-testid="library-empty-search">
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · Search</span>
          <h3 className="library-empty-state__title">
            {hasMore ? 'No loaded sources' : 'No sources'} match &ldquo;{query}&rdquo;
          </h3>
          {hasMore ? (
            <p className="library-empty-state__body">
              More sources remain outside the loaded pages.
            </p>
          ) : null}
        </div>
        {onClearSearch ? (
          <div className="library-empty-state__actions">
            <button
              type="button"
              className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
              onClick={() => onClearSearch()}
            >
              Clear search
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (mixed && filteredOutCount > 0) {
    return (
      <div className="library-empty-state library-empty-state--scoped" data-testid="library-empty-suppressed">
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · Sources</span>
          <h3 className="library-empty-state__title">No visible sources in this view.</h3>
          <p className="library-empty-state__body">
            {filteredOutCount} {filteredOutCount === 1 ? 'source is' : 'sources are'} hidden by review-import filters.
          </p>
        </div>
        <div className="library-empty-state__actions">
          <Link
            className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
            to="/library?scope=all&showSuppressed=1"
          >
            Show review imports
          </Link>
        </div>
      </div>
    );
  }

  if (mixed && corpusTotal > 0) {
    return (
      <div className="library-empty-state library-empty-state--scoped" data-testid="library-empty-scoped">
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · Sources</span>
          <h3 className="library-empty-state__title">No sources in this view.</h3>
          <p className="library-empty-state__body">{emptyLabel || 'Try another source view.'}</p>
        </div>
      </div>
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

  if (model.kind === 'first-run') {
    return (
      <div className="library-empty-state library-empty-state--first-run" data-testid="library-empty-first-run">
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · {model.scopeLabel}</span>
          <h3 className="library-empty-state__title">Save your first source</h3>
          <p className="library-empty-state__body">
            Connect Readwise, import notes, or use the browser extension to save articles.
            Sources you add show up here, ready to read, highlight, and turn into concepts.
          </p>
          {latestReceipt?.summary ? (
            <p className="library-empty-state__receipt muted small" data-testid="library-empty-receipt">
              Last import: {latestReceipt.summary}
            </p>
          ) : null}
        </div>
        <div className="library-empty-state__actions">
          <Link
            className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
            to="/connections#sources"
          >
            Connect a source
          </Link>
          <a
            className="library-empty-state__secondary muted small"
            href={TOUR_EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Install browser extension
          </a>
          <Link className="library-empty-state__secondary muted small" to="/how-to-use">
            See the full walkthrough
          </Link>
        </div>
      </div>
    );
  }

  if (model.kind === 'scoped-empty') {
    const scopeLine = model.scopeLabel === 'All'
      ? 'No sources in this view.'
      : `No sources in ${model.scopeLabel}.`;
    return (
      <div
        className="library-empty-state library-empty-state--scoped"
        data-testid="library-empty-scoped"
        data-scope={scope}
      >
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · {model.scopeLabel}</span>
          <h3 className="library-empty-state__title">{scopeLine}</h3>
          <p className="library-empty-state__body">
            {[formatLibraryCorpusCount(model.corpusTotal), model.emptyLabel].filter(Boolean).join(' ')}
          </p>
        </div>
        <div className="library-empty-state__actions">
          <Link
            className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
            to="/library?scope=all"
            data-testid="library-empty-show-all"
          >
            Show all sources
          </Link>
        </div>
      </div>
    );
  }

  if (model.kind === 'suppressed-empty') {
    return (
      <div
        className="library-empty-state library-empty-state--scoped"
        data-testid="library-empty-suppressed"
        data-scope={scope}
      >
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · {model.scopeLabel}</span>
          <h3 className="library-empty-state__title">No visible sources in this view.</h3>
          <p className="library-empty-state__body">
            {formatLibrarySuppressedCount(model.suppressedCount)}
            {model.emptyLabel ? ` ${model.emptyLabel}` : ''}
          </p>
        </div>
        <div className="library-empty-state__actions">
          <Link
            className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
            to={`/library?scope=${encodeURIComponent(scope || 'all')}&showSuppressed=1`}
            data-testid="library-empty-show-suppressed"
          >
            Show review imports
          </Link>
          <Link
            className="library-empty-state__secondary muted small"
            to="/library?scope=all"
            data-testid="library-empty-show-all"
          >
            Show all sources
          </Link>
        </div>
      </div>
    );
  }

  if (model.kind === 'search-empty') {
    const clearSearchHref = scope && scope !== 'all'
      ? `/library?scope=${encodeURIComponent(scope)}`
      : '/library?scope=all';
    return (
      <div className="library-empty-state library-empty-state--scoped" data-testid="library-empty-search">
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · Search</span>
          <h3 className="library-empty-state__title">No sources match &ldquo;{model.query}&rdquo;</h3>
          {model.corpusTotal > 0 ? (
            <p className="library-empty-state__body">{formatLibraryCorpusCount(model.corpusTotal)}</p>
          ) : null}
        </div>
        <div className="library-empty-state__actions">
          {onClearSearch ? (
            <button
              type="button"
              className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
              data-testid="library-empty-clear-search"
              onClick={() => onClearSearch()}
            >
              Clear search
            </button>
          ) : (
            <Link className="library-empty-state__primary ui-quiet-button" to={clearSearchHref}>
              Clear search
            </Link>
          )}
          <Link className="library-empty-state__secondary muted small" to="/library?scope=all">
            Search all Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="library-empty-state">
      <p className="muted">{model.emptyLabel || 'No articles here yet.'}</p>
      <Link className="library-empty-cta" to="/library?scope=all">
        Show all sources
      </Link>
    </div>
  );
}
