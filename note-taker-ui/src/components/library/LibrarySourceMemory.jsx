import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLibraryRelevance } from '../../api/libraryRelevance';
import {
  appendUniqueSourceRows,
  isSourceAllowed,
  sourceRowKey
} from './librarySourceIdentity';

const VIEW_OPTIONS = [
  {
    id: 'recent',
    label: 'Recently added',
    description: 'Sources in the order they entered your Library.'
  },
  {
    id: 'active',
    label: 'Active in my thinking',
    description: 'Sources currently supporting, challenging, or changing your work.'
  },
  {
    id: 'needs_review',
    label: 'Needs review',
    description: 'Sources attached to a candidate or unresolved change.'
  },
  {
    id: 'unconnected',
    label: 'Unconnected',
    description: 'Sources not yet used by a durable thinking object.'
  }
];

const PAGE_LIMIT = 40;

const formatDate = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
};

const destinationLabel = ref => {
  if (ref?.type === 'wiki_claim') return 'Claim';
  if (ref?.type === 'wiki_page') return 'Wiki';
  if (ref?.type === 'concept') return 'Concept';
  return 'Reference';
};
const hasSafeInternalHref = ref => (
  typeof ref?.href === 'string'
  && ref.href.startsWith('/')
  && !ref.href.startsWith('//')
);

const emptyState = () => ({
  loading: true,
  loadingMore: false,
  error: '',
  paginationError: '',
  sources: [],
  coverage: null,
  counts: {},
  nextCursor: null,
  hasMore: false
});

const formatCount = (count) => {
  const parsedCount = Number(count?.value);
  const hasCount = Number.isFinite(parsedCount) && parsedCount >= 0;
  if (!hasCount) {
    return { hasCount: false, label: '', accessible: '' };
  }
  return {
    hasCount: true,
    label: `${parsedCount}${count?.exact === false ? '+' : ''}`,
    accessible: `, ${parsedCount}${count?.exact === false ? ' or more' : ''} sources`,
    value: parsedCount
  };
};

const LibrarySourceMemory = ({
  onSelectArticle,
  onSelectSource = null,
  view: controlledView = 'recent',
  onViewChange,
  allowedSourceIds = null,
  renderRows = true,
  onDataChange = null,
  variant = 'index',
  scope = 'all',
  unfiledCount = 0,
  onSelectScope = null,
  coverageStatus = null
}) => {
  const view = VIEW_OPTIONS.some(option => option.id === controlledView)
    ? controlledView
    : 'recent';
  const [state, setState] = useState(emptyState);
  const requestSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const nextCursorRef = useRef(null);
  const hasMoreRef = useRef(false);
  const isIndex = variant === 'index';

  useEffect(() => {
    nextCursorRef.current = state.nextCursor;
    hasMoreRef.current = state.hasMore;
  }, [state.hasMore, state.nextCursor]);

  useEffect(() => {
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    loadingMoreRef.current = false;
    setState(previous => ({
      ...emptyState(),
      coverage: previous.coverage,
      counts: previous.counts
    }));

    getLibraryRelevance({
      view,
      limit: PAGE_LIMIT,
      sourceScope: 'mixed',
      force: true
    })
      .then(payload => {
        if (requestSeqRef.current !== requestId) return;
        setState({
          loading: false,
          loadingMore: false,
          error: '',
          paginationError: '',
          sources: Array.isArray(payload?.sources) ? payload.sources : [],
          coverage: payload?.coverage || null,
          counts: payload?.counts && typeof payload.counts === 'object' ? payload.counts : {},
          nextCursor: payload?.nextCursor || null,
          hasMore: Boolean(payload?.hasMore)
        });
      })
      .catch(error => {
        if (requestSeqRef.current !== requestId) return;
        setState({
          loading: false,
          loadingMore: false,
          error: error?.response?.data?.error || 'Could not load source connections.',
          paginationError: '',
          sources: [],
          coverage: null,
          counts: {},
          nextCursor: null,
          hasMore: false
        });
      });
  }, [view]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    if (!hasMoreRef.current) return;
    const cursor = String(nextCursorRef.current || '').trim();
    if (!cursor) return;

    const requestId = requestSeqRef.current;
    loadingMoreRef.current = true;
    setState(previous => ({ ...previous, loadingMore: true, paginationError: '' }));

    getLibraryRelevance({
      view,
      limit: PAGE_LIMIT,
      sourceScope: 'mixed',
      cursor
    })
      .then(payload => {
        if (requestSeqRef.current !== requestId) return;
        setState(previous => ({
          ...previous,
          loading: false,
          loadingMore: false,
          error: '',
          paginationError: '',
          sources: appendUniqueSourceRows(
            previous.sources,
            Array.isArray(payload?.sources) ? payload.sources : []
          ),
          coverage: payload?.coverage || previous.coverage,
          counts: payload?.counts && typeof payload.counts === 'object'
            ? payload.counts
            : previous.counts,
          nextCursor: payload?.nextCursor || null,
          hasMore: Boolean(payload?.hasMore)
        }));
      })
      .catch(error => {
        if (requestSeqRef.current !== requestId) return;
        setState(previous => ({
          ...previous,
          loadingMore: false,
          paginationError: error?.response?.data?.error || 'Could not load more sources.'
        }));
      })
      .finally(() => {
        if (requestSeqRef.current === requestId) {
          loadingMoreRef.current = false;
        }
      });
  }, [view]);

  const current = useMemo(
    () => VIEW_OPTIONS.find(option => option.id === view) || VIEW_OPTIONS[0],
    [view]
  );
  const visibleSources = useMemo(() => {
    if (!(allowedSourceIds instanceof Set)) return state.sources;
    return state.sources.filter(row => isSourceAllowed(row, allowedSourceIds));
  }, [allowedSourceIds, state.sources]);

  useEffect(() => {
    onDataChange?.({
      loading: state.loading,
      loadingMore: state.loadingMore,
      error: state.error,
      paginationError: state.paginationError,
      coverage: state.coverage,
      counts: state.counts,
      sources: visibleSources,
      filteredOutCount: Math.max(0, state.sources.length - visibleSources.length),
      nextCursor: state.nextCursor,
      hasMore: state.hasMore,
      loadMore
    });
  }, [
    loadMore,
    onDataChange,
    state.coverage,
    state.counts,
    state.error,
    state.paginationError,
    state.hasMore,
    state.loading,
    state.loadingMore,
    state.nextCursor,
    state.sources.length,
    visibleSources
  ]);

  const handleTabKeyDown = (event, optionIndex) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    let nextIndex = optionIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (optionIndex + 1) % VIEW_OPTIONS.length;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (optionIndex - 1 + VIEW_OPTIONS.length) % VIEW_OPTIONS.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = VIEW_OPTIONS.length - 1;
    const next = VIEW_OPTIONS[nextIndex];
    onViewChange?.(next.id);
    event.currentTarget.parentElement
      ?.querySelector(`[data-source-view="${next.id}"]`)
      ?.focus();
  };

  const handleOpenSource = (source) => {
    if (onSelectSource) {
      onSelectSource(source);
      return;
    }
    if (source?.type === 'article') {
      onSelectArticle?.(source.id);
      return;
    }
    if (source?.type === 'highlight' && source.parentId) {
      onSelectArticle?.(source.parentId);
    }
  };

  const allCount = formatCount(state.counts?.recent);
  const liveCoverage = coverageStatus || state.coverage?.status;
  const connectedHint = (() => {
    const active = formatCount(state.counts?.active);
    if (!active.hasCount) return '';
    return `${active.label} active in thinking`;
  })();

  return (
    <section
      className={`library-source-memory${isIndex ? ' library-source-memory--index' : ''}`}
      aria-labelledby="library-source-memory-title"
      data-testid="library-source-index"
    >
      {isIndex ? (
        <header className="library-source-memory__index-head">
          <p
            className="library-source-memory__inscription library-source-memory__inscription--index"
            id="library-source-memory-title"
          >
            <span className="library-source-memory__greek" lang="el" aria-hidden="true">ΜΝΗΜΗ</span>
            <span className="library-source-memory__inscription-sep" aria-hidden="true"> · </span>
            <span>Source index</span>
          </p>
        </header>
      ) : (
        <header className="library-source-memory__header">
          <div>
            <p className="library-source-memory__inscription" aria-hidden="true">
              ΒΙΒΛΙΟΘΗΚΗ · SOURCE MEMORY
            </p>
            <h2 id="library-source-memory-title">Your sources, in context</h2>
            <p>{current.description}</p>
          </div>
          <span className="library-source-memory__rosette" aria-hidden="true">✦</span>
        </header>
      )}

      {isIndex ? (
        <div className="library-source-index">
          <div className="library-source-index__group">
            <h3 className="library-source-index__label">Sources</h3>
            <nav className="library-source-index__nav" aria-label="Library sources">
              <button
                type="button"
                className={scope === 'all' ? 'is-active' : ''}
                aria-current={scope === 'all' ? 'true' : undefined}
                onClick={() => onSelectScope?.('all')}
              >
                <span>All material</span>
                {allCount.hasCount ? (
                  <span className="library-source-memory__view-count" aria-hidden="true">
                    {allCount.label}
                  </span>
                ) : null}
              </button>
              {Number(unfiledCount) > 0 ? (
                <button
                  type="button"
                  className={scope === 'unfiled' ? 'is-active' : ''}
                  aria-current={scope === 'unfiled' ? 'true' : undefined}
                  onClick={() => onSelectScope?.('unfiled')}
                >
                  <span>Unfiled</span>
                  <span className="library-source-memory__view-count" aria-hidden="true">
                    {Number(unfiledCount)}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className={scope === 'highlights' ? 'is-active' : ''}
                aria-current={scope === 'highlights' ? 'true' : undefined}
                onClick={() => onSelectScope?.('highlights')}
              >
                <span>Highlights</span>
              </button>
            </nav>
          </div>

          <div className="library-source-index__group">
            <h3 className="library-source-index__label">Views</h3>
            <div
              className="library-source-memory__views library-source-memory__views--stack"
              role="tablist"
              aria-label="Source views"
              aria-orientation="vertical"
            >
              {VIEW_OPTIONS.map((option, optionIndex) => {
                const count = formatCount(state.counts?.[option.id]);
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-label={`${option.label}${count.accessible}`}
                    aria-selected={view === option.id}
                    tabIndex={view === option.id ? 0 : -1}
                    data-source-view={option.id}
                    className={view === option.id ? 'is-active' : ''}
                    onClick={() => onViewChange?.(option.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, optionIndex)}
                  >
                    <span>{option.label}</span>
                    {count.hasCount ? (
                      <span className="library-source-memory__view-count" aria-hidden="true">
                        {count.label}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <footer className="library-source-index__footer" aria-live="polite">
            {state.loading ? (
              <span>Tracing…</span>
            ) : state.error ? (
              <span className="is-error">{state.error}</span>
            ) : (
              <span>
                {connectedHint || 'Source views'}
                {liveCoverage === 'partial' ? ' · Partial scan' : liveCoverage === 'complete' ? ' · Current' : ''}
              </span>
            )}
          </footer>
        </div>
      ) : (
        <div className="library-source-memory__views" role="tablist" aria-label="Source views">
          {VIEW_OPTIONS.map((option, optionIndex) => {
            const count = formatCount(state.counts?.[option.id]);
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-label={`${option.label}${count.accessible}`}
                aria-selected={view === option.id}
                tabIndex={view === option.id ? 0 : -1}
                data-source-view={option.id}
                className={view === option.id ? 'is-active' : ''}
                onClick={() => onViewChange?.(option.id)}
                onKeyDown={(event) => handleTabKeyDown(event, optionIndex)}
              >
                <span>{option.label}</span>
                {count.hasCount ? (
                  <span className="library-source-memory__view-count" aria-hidden="true">
                    {count.label}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div
        className="library-source-memory__body"
        role="tabpanel"
        aria-label={current.label}
        aria-live="polite"
        hidden={isIndex && !renderRows}
      >
        {state.loading && renderRows ? (
          <p className="library-source-memory__status">Tracing source provenance…</p>
        ) : null}
        {!state.loading && state.error && renderRows && !isIndex ? (
          <p className="library-source-memory__status is-error">{state.error}</p>
        ) : null}
        {!state.loading && !state.error && visibleSources.length === 0 && renderRows ? (
          <p className="library-source-memory__status">
            {view === 'needs_review'
              ? 'No source is attached to an unresolved change.'
              : view === 'unconnected'
                ? 'Every visible source is connected.'
                : 'No sources appear in this view yet.'}
          </p>
        ) : null}
        {!state.loading && !state.error && visibleSources.length > 0 && renderRows ? (
          <>
            {state.coverage?.status === 'partial' ? (
              <p className="library-source-memory__coverage">
                Showing a bounded source scan; older matches may not appear yet.
              </p>
            ) : null}
            <ol className="library-source-memory__list">
              {visibleSources.map(row => {
                const source = row?.source || {};
                const connected = Array.isArray(row?.relevance?.connected)
                  ? row.relevance.connected
                    .filter(hasSafeInternalHref)
                    .filter((ref, index, list) => (
                      list.findIndex(candidate => (
                        `${candidate?.type}:${candidate?.id}:${candidate?.parentId || ''}`
                        === `${ref?.type}:${ref?.id}:${ref?.parentId || ''}`
                      )) === index
                    ))
                    .slice(0, 3)
                  : [];
                const movementCount = Number(row?.relevance?.movementCount || 0);
                return (
                  <li key={sourceRowKey(row)} className="library-source-memory__row">
                    <div className="library-source-memory__source">
                      <button
                        type="button"
                        onClick={() => handleOpenSource(source)}
                        aria-label={`Open ${source.title || 'source'}`}
                      >
                        {source.title || 'Untitled source'}
                      </button>
                      <p>
                        {[
                          source.type,
                          row?.provenance?.author,
                          row?.provenance?.provider,
                          formatDate(row?.createdAt)
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="library-source-memory__uses">
                      {movementCount > 0 ? (
                        <span className="library-source-memory__movement">
                          {movementCount} material {movementCount === 1 ? 'change' : 'changes'}
                        </span>
                      ) : null}
                      {connected.length > 0 ? connected.map(ref => (
                        <a key={`${ref.type}:${ref.id}:${ref.parentId || ''}`} href={ref.href}>
                          <span>{destinationLabel(ref)}</span>
                          <span className="library-source-memory__target-title">{ref.title}</span>
                        </a>
                      )) : (
                        <span className="library-source-memory__unconnected">Not used yet</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {state.hasMore ? (
              <div className="library-source-memory__more">
                <button
                  type="button"
                  className="library-source-list__more-button"
                  onClick={loadMore}
                  disabled={state.loadingMore}
                  aria-busy={state.loadingMore}
                >
                  {state.loadingMore ? 'Loading more…' : 'Load more sources'}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
};

export default LibrarySourceMemory;
