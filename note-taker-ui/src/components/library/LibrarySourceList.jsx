import React, { Profiler, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../ui';
import VirtualList from '../virtual/VirtualList';
import { createProfilerLogger } from '../../utils/perf';
import { TOUR_EXTENSION_URL } from '../../tour/tourConfig';
import {
  formatLibraryCorpusCount,
  formatLibrarySuppressedCount,
  resolveLibraryEmptyState
} from './libraryEmptyStateModel';
import { matchesSourceQuery, sourceRowKey } from './librarySourceIdentity';
import { formatSurfaceDate } from '../../utils/dateDisplay';

const SOURCE_ROW_HEIGHT = 168;
const ROOM_SOURCE_ROW_HEIGHT = 94;
const SKELETON_ROWS = 6;

const hasSafeInternalHref = ref => (
  typeof ref?.href === 'string'
  && ref.href.startsWith('/')
  && !ref.href.startsWith('//')
);

const relevanceLabel = type => {
  if (type === 'wiki_claim') return 'Claim';
  if (type === 'wiki_page') return 'Wiki';
  if (type === 'concept') return 'Concept';
  return 'Reference';
};

const sourceTypeLabel = type => {
  if (type === 'highlight') return 'Highlight';
  if (type === 'note') return 'Notebook';
  return 'Article';
};

const humanizeSourceLabel = value => String(value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase())
  .trim();

const coverageMessage = ({ coverage, counts, sourceView, hasMore }) => {
  if (coverage?.status !== 'partial') return '';
  const limitations = Array.isArray(coverage?.limitations) ? coverage.limitations : [];
  const scanLimited = limitations.some(value => /scan_limited|scan_may_be_limited/.test(String(value)));
  if (hasMore || scanLimited) {
    return 'Showing a bounded mixed-source scan; older matches may not appear yet.';
  }
  if (counts?.[sourceView]?.exact === true && limitations.every(value => (
    String(value) === 'material_movements_limited_to_50'
  ))) {
    return '';
  }
  if (limitations.includes('material_movements_limited_to_50')) {
    return 'Movement-based relevance uses the 50 most recent material changes.';
  }
  return 'Some relevance connections are outside this bounded view.';
};

const suppressedRecoveryHref = ({ sourceView, query }) => {
  const params = new URLSearchParams({ scope: 'all', showSuppressed: '1' });
  if (sourceView && sourceView !== 'recent') params.set('sourceView', sourceView);
  if (query) params.set('aq', query);
  return `/library?${params.toString()}`;
};

const openLabelFor = (source) => {
  const title = source?.title || 'Untitled source';
  if (source?.type === 'highlight') return `Open highlight: ${title}`;
  if (source?.type === 'note') return `Open notebook entry: ${title}`;
  return `Open in Reading Room: ${title}`;
};

const SourceRowSkeleton = React.memo(() => (
  <div className="library-article-row" aria-hidden="true">
    <div style={{ flex: 1 }}>
      <div className="skeleton skeleton-title" style={{ width: '58%', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="skeleton skeleton-text" style={{ width: 72 }} />
        <div className="skeleton skeleton-text" style={{ width: 110 }} />
      </div>
    </div>
  </div>
));

const LibrarySourceRow = React.memo(({
  row,
  onOpenSource,
  onMoveArticle,
  articleById = null,
  selected = false,
  variant = 'default'
}) => {
  const isRoom = variant === 'room';
  const [activated, setActivated] = useState(false);
  const receiptTimerRef = useRef(null);
  const source = row?.source || {};
  const provenance = row?.provenance || {};
  const connectedRefs = (Array.isArray(row?.relevance?.connected)
    ? row.relevance.connected
    : [])
    .filter(hasSafeInternalHref)
    .filter((ref, index, refs) => refs.findIndex(candidate => (
      `${candidate?.type}:${candidate?.id}:${candidate?.parentId || ''}`
      === `${ref?.type}:${ref?.id}:${ref?.parentId || ''}`
    )) === index);
  const visibleRefs = connectedRefs.slice(0, 2);
  const remainingRefs = Math.max(0, connectedRefs.length - visibleRefs.length);
  const movementCount = Number(row?.relevance?.movementCount || 0);
  const rowDate = row?.createdAt || provenance.importedAt || provenance.updatedAt;
  const typeLabel = sourceTypeLabel(source.type);
  const metaBits = [
    provenance.parentTitle,
    provenance.author,
    humanizeSourceLabel(provenance.provider || provenance.siteName)
  ].filter(Boolean).filter(value => (
    String(value).trim().toLowerCase() !== typeLabel.toLowerCase()
  ));
  const canMove = source.type === 'article' && typeof onMoveArticle === 'function';
  const moveArticle = canMove
    ? (articleById?.get(String(source.id || '')) || { _id: source.id, title: source.title })
    : null;
  const connectionSummary = (() => {
    if (movementCount > 0) {
      return `${movementCount} material ${movementCount === 1 ? 'change' : 'changes'}`;
    }
    if (Number(row?.relevance?.connectedCount || connectedRefs.length) > 0) {
      const first = visibleRefs[0];
      if (first?.title) {
        return `Appears in ${first.title}`;
      }
      return 'In your thinking';
    }
    return 'Not used yet';
  })();

  const handlePointerMove = (event) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--row-bloom-x', `${event.clientX - rect.left}px`);
    target.style.setProperty('--row-bloom-y', `${event.clientY - rect.top}px`);
  };
  const handlePointerLeave = (event) => {
    const target = event.currentTarget;
    target.style.removeProperty('--row-bloom-x');
    target.style.removeProperty('--row-bloom-y');
  };
  const triggerReceipt = () => {
    setActivated(true);
    if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
    receiptTimerRef.current = window.setTimeout(() => setActivated(false), 720);
  };

  useEffect(() => () => {
    if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
  }, []);

  return (
    <div
      className={`library-article-row library-source-row${isRoom ? ' library-source-row--room' : ''} is-magnetic${activated ? ' is-activated' : ''}${selected ? ' is-selected' : ''}`}
      data-source-type={source.type || 'article'}
      data-source-key={sourceRowKey(row)}
      aria-selected={selected ? 'true' : undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="library-article-row-date">{formatSurfaceDate(rowDate, { includeYear: true })}</div>
      <div className="library-article-row-content">
        <button
          className="library-article-row-main"
          type="button"
          aria-label={openLabelFor(source)}
          aria-current={selected ? 'true' : undefined}
          data-testid="library-source-open"
          onClick={() => {
            triggerReceipt();
            onOpenSource?.(source);
          }}
        >
          <div className="library-article-row-title">{source.title || 'Untitled source'}</div>
          <div className="library-article-row-kicker">
            {!isRoom ? <span className="library-source-row__type">{typeLabel}</span> : null}
            {metaBits.length > 0 ? (
              <span className="library-article-row-source">{metaBits.join(' · ')}</span>
            ) : null}
          </div>
          {source.type === 'highlight' && provenance.parentTitle ? (
            <div className="library-article-row-excerpt">
              From {provenance.parentTitle}
            </div>
          ) : null}
          {!isRoom ? (
            <div className="library-article-row-meta">
              <span>{connectionSummary}</span>
            </div>
          ) : null}
        </button>
        {!isRoom && visibleRefs.length > 0 ? (
          <div className="library-article-row-relevance" aria-label="Appears in">
            {visibleRefs.map(ref => (
              <a
                key={`${ref.type}:${ref.id}:${ref.parentId || ''}`}
                href={ref.href}
                onClick={event => event.stopPropagation()}
              >
                <span>{relevanceLabel(ref.type)}</span>
                {ref.title}
              </a>
            ))}
            {remainingRefs > 0 ? <span>+{remainingRefs} more</span> : null}
          </div>
        ) : null}
      </div>
      {!isRoom && canMove ? (
        <button
          className="library-article-row-action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            triggerReceipt();
            onMoveArticle(moveArticle);
          }}
        >
          Move
        </button>
      ) : null}
      {activated ? <span className="library-article-row-receipt" role="status">Opening</span> : null}
    </div>
  );
});

const LibraryEmptyState = ({
  scope,
  corpusTotal,
  rawCorpusTotal,
  suppressedCount,
  suppressedVisible,
  query,
  emptyLabel,
  latestReceipt,
  mixed = false,
  hasMore = false,
  filteredOutCount = 0,
  onClearSearch
}) => {
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
    return (
      <div
        className="library-empty-state library-empty-state--scoped"
        data-testid="library-empty-scoped"
        data-scope={scope}
      >
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · {model.scopeLabel}</span>
          <h3 className="library-empty-state__title">No sources in this view.</h3>
          <p className="library-empty-state__body">
            {formatLibraryCorpusCount(model.corpusTotal)}.
            {model.emptyLabel ? ` ${model.emptyLabel}` : ''}
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
            {formatLibrarySuppressedCount(model.suppressedCount)}.
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
    return (
      <div className="library-empty-state library-empty-state--scoped" data-testid="library-empty-search">
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · Search</span>
          <h3 className="library-empty-state__title">No sources match &ldquo;{model.query}&rdquo;</h3>
          {model.corpusTotal > 0 ? (
            <p className="library-empty-state__body">{formatLibraryCorpusCount(model.corpusTotal)}.</p>
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
            <Link className="library-empty-state__primary ui-quiet-button" to="/library?scope=all">
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
      <p className="muted">{model.emptyLabel || 'No sources here yet.'}</p>
      <Link className="library-empty-cta" to="/library?scope=all">
        Show all sources
      </Link>
    </div>
  );
};

const LibrarySourceList = ({
  sources,
  loading,
  loadingMore = false,
  error,
  emptyLabel,
  onOpenSource,
  onMoveArticle,
  articles = [],
  scope = 'all',
  query = '',
  onQueryChange = null,
  suppressedVisible = false,
  corpusTotal = 0,
  rawCorpusTotal = 0,
  suppressedCount = 0,
  latestReceipt = null,
  coverage = null,
  counts = {},
  sourceView = 'recent',
  hasMore = false,
  paginationError = '',
  filteredOutCount = 0,
  onLoadMore = null,
  title = 'Sources',
  subtitle = 'Articles, highlights, and notebook entries in one index.',
  selectedSourceKey = '',
  inlinePreview = null,
  variant = 'default'
}) => {
  const isRoom = variant === 'room';
  const hasError = Boolean(error);
  const articleById = useMemo(() => new Map(
    (Array.isArray(articles) ? articles : [])
      .map(article => [String(article?._id || ''), article])
      .filter(([id]) => id)
  ), [articles]);
  const visibleSources = useMemo(() => {
    const list = Array.isArray(sources) ? sources : [];
    return list.filter(row => matchesSourceQuery(row, query));
  }, [query, sources]);
  const isEmpty = !loading && !hasError && visibleSources.length === 0;
  const coverageCopy = coverageMessage({ coverage, counts, sourceView, hasMore });
  const virtualHeight = useMemo(() => {
    const viewport = typeof window !== 'undefined' ? window.innerHeight : 0;
    return Math.min(680, Math.max(320, viewport ? viewport - 290 : 560));
  }, []);
  const selectedPreviewRef = useRef(null);

  useEffect(() => {
    if (!inlinePreview || !selectedSourceKey) return undefined;
    const node = selectedPreviewRef.current;
    if (!node || typeof node.scrollIntoView !== 'function') return undefined;
    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = window.requestAnimationFrame(() => {
      node.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth'
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inlinePreview, selectedSourceKey]);

  const renderSourceBlock = (row, index, { withKey = true } = {}) => {
    const key = sourceRowKey(row) || String(index);
    const selected = Boolean(selectedSourceKey) && key === selectedSourceKey;
    return (
      <div
        key={withKey ? key : undefined}
        className={`library-source-list__block${selected ? ' is-selected-block' : ''}`}
        data-source-block-key={key}
      >
        <LibrarySourceRow
          row={row}
          onOpenSource={onOpenSource}
          onMoveArticle={onMoveArticle}
          articleById={articleById}
          selected={selected}
          variant={variant}
        />
        {selected && inlinePreview ? (
          <div
            ref={selectedPreviewRef}
            className="library-composition__inline-preview"
            data-testid="library-inline-preview"
          >
            {inlinePreview}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={`library-article-list library-source-list${isRoom ? ' library-source-list--room' : ''} ${loading ? 'is-loading' : ''} ${hasError ? 'has-error' : ''} ${isEmpty ? 'is-empty' : ''}`.trim()}
      data-ui-surface-state={loading ? 'loading' : hasError ? 'error' : isEmpty ? 'empty' : 'ready'}
      data-testid="library-source-list"
    >
      <SectionHeader
        title={title}
        subtitle={subtitle}
        className="library-section-head is-articles"
      />
      {onQueryChange ? (
        <label className="library-article-search" htmlFor="library-source-search">
          <span>Search sources</span>
          <input
            id="library-source-search"
            type="search"
            value={query}
            placeholder="Search articles, highlights, notes..."
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
      ) : null}
      {!loading && !hasError && coverageCopy ? (
        <p className="library-source-list__coverage" data-testid="library-source-coverage">
          {coverageCopy}
        </p>
      ) : null}
      {!loading
        && !hasError
        && !suppressedVisible
        && filteredOutCount > 0
        && visibleSources.length > 0 ? (
          <div
            className="library-source-list__suppressed-notice"
            data-testid="library-source-suppressed-notice"
          >
            <span>
              {filteredOutCount} {filteredOutCount === 1 ? 'source is' : 'sources are'} hidden by review-import filters.
            </span>
            <Link to={suppressedRecoveryHref({ sourceView, query })}>Show review imports</Link>
          </div>
        ) : null}
      {loading && (
        <div className="library-article-skeletons">
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <SourceRowSkeleton key={`source-skeleton-${index}`} />
          ))}
        </div>
      )}
      {error && <p className="status-message error-message">{error}</p>}
      {!loading && !error && visibleSources.length === 0 && (
        <LibraryEmptyState
          scope={scope}
          corpusTotal={corpusTotal}
          rawCorpusTotal={rawCorpusTotal}
          suppressedCount={suppressedCount}
          suppressedVisible={suppressedVisible}
          query={query}
          emptyLabel={emptyLabel}
          latestReceipt={latestReceipt}
          mixed
          hasMore={hasMore}
          filteredOutCount={filteredOutCount}
          onClearSearch={onQueryChange ? () => onQueryChange('') : null}
        />
      )}
      {!loading && !error && (
        <Profiler id="LibrarySourceRows" onRender={createProfilerLogger('library.source-list')}>
          {visibleSources.length > 40 ? (
            <VirtualList
              items={visibleSources}
              height={virtualHeight}
              itemSize={isRoom ? ROOM_SOURCE_ROW_HEIGHT : SOURCE_ROW_HEIGHT}
              dynamicItemHeights
              className="library-article-list-virtual"
              renderItem={(row, index) => (
                <div style={{ paddingBottom: 10 }}>
                  {renderSourceBlock(row, index, { withKey: false })}
                </div>
              )}
            />
          ) : (
            visibleSources.map((row, index) => renderSourceBlock(row, index))
          )}
        </Profiler>
      )}
      {!loading && !error && hasMore && typeof onLoadMore === 'function' ? (
        <div className="library-source-list__more">
          <button
            type="button"
            className="library-source-list__more-button"
            data-testid="library-source-load-more"
            onClick={onLoadMore}
            disabled={loadingMore}
            aria-busy={loadingMore}
          >
            {loadingMore ? 'Loading more…' : 'Load more sources'}
          </button>
        </div>
      ) : null}
      {!loading && !error && paginationError ? (
        <p className="library-source-list__coverage is-error" role="status">
          {paginationError} Your loaded sources are still available.
        </p>
      ) : null}
    </div>
  );
};

export default LibrarySourceList;
