import React, { useCallback } from 'react';
import ArticleReader from '../ArticleReader';
import LibraryArticleList from './LibraryArticleList';
import LibraryHighlights from './LibraryHighlights';
import LibraryReadingRoomLead from './LibraryReadingRoomLead';
import LibrarySourceList from './LibrarySourceList';
import LibrarySourceTrace from './LibrarySourceTrace';
import { formatReviewTriageFrame } from '../wiki/reviewTriageModel';
import '../../styles/library-source-memory.css';

const LibraryMain = ({
  selectedArticleId,
  selectedArticle,
  articleHighlights,
  focusedHighlightId = '',
  articleGraphConnections,
  articleLoading,
  articleError,
  articleErrorKind = '',
  articles,
  articlesLoading,
  articlesError,
  scope,
  selectedFolderName,
  onSelectArticle,
  onRetryArticle = null,
  onOpenSource = null,
  onMoveArticle,
  onHighlightOptimistic,
  onHighlightReplace,
  onHighlightRemove,
  onOpenConcept,
  onOpenQuestion,
  onAskLibrarian,
  onToggleEvergreen,
  folderOptions,
  articleOptions,
  articleQuery,
  suppressedVisible = false,
  externalQuery,
  highlightView,
  onArticleQueryChange,
  onQueryChange,
  onDumpHighlight,
  allArticles = [],
  unfiledCount,
  onReviewFiling,
  filingLaunching = false,
  filingReceipt = null,
  onToggleSuppressed,
  corpusTotal,
  rawCorpusTotal,
  suppressedCount = 0,
  latestReceipt = null,
  sourceView = 'recent',
  selectedSourceKey = '',
  sourceDetail = null,
  sourceDetailLoading = false,
  sourceDetailError = '',
  relevanceState = null,
  reviewBacklogCount,
  reviewBacklogHref = ''
}) => {
  const relevance = relevanceState || {
    loading: true,
    loadingMore: false,
    error: '',
    paginationError: '',
    coverage: null,
    counts: {},
    sources: [],
    nextCursor: null,
    hasMore: false,
    filteredOutCount: 0,
    loadMore: null
  };
  const showReadingRoomLead = scope === 'unfiled';
  const isMixedBrowse = scope === 'all';
  const handleOpenSource = useCallback((source) => {
    if (onOpenSource) {
      onOpenSource(source);
      return;
    }
    if (source?.type === 'note') return;
    if (source?.type === 'highlight' && source.parentId) {
      onSelectArticle?.(source.parentId);
      return;
    }
    onSelectArticle?.(source?.id);
  }, [onOpenSource, onSelectArticle]);
  const viewLabel = sourceView === 'active'
    ? 'Active in my thinking'
    : sourceView === 'needs_review'
      ? 'Needs review'
      : sourceView === 'unconnected'
        ? 'Unconnected'
        : 'Recently added';
  const surfacedReviewCount = Math.min(3, relevance.sources.length);
  const rawMixedReviewTotal = relevance.counts?.needs_review?.value;
  const mixedReviewTotal = rawMixedReviewTotal == null ? NaN : Number(rawMixedReviewTotal);
  const reviewTotal = Number.isFinite(reviewBacklogCount)
    ? reviewBacklogCount
    : mixedReviewTotal;
  const viewSubtitle = sourceView === 'active'
    ? 'Sources currently supporting, challenging, or changing your work.'
    : sourceView === 'needs_review'
      ? formatReviewTriageFrame({
        promotedCount: surfacedReviewCount,
        minorCount: Number.isFinite(reviewTotal)
          ? Math.max(0, reviewTotal - surfacedReviewCount)
          : 0
      })
      : sourceView === 'unconnected'
        ? 'Sources not yet used by a durable thinking object.'
        : 'Sources in the order they entered your Library.';
  const relevancePending = isMixedBrowse && relevance.loading;
  const relevanceFailed = Boolean(
    isMixedBrowse
    && relevance.error
    && relevance.sources.length === 0
  );
  const sourceViewEmptyLabel = sourceView === 'active'
    ? 'No visible source is currently used by a durable thinking object.'
    : sourceView === 'needs_review'
      ? 'No visible source is attached to an unresolved change.'
      : sourceView === 'unconnected'
        ? 'Every visible source is connected.'
        : 'No sources saved yet.';

  if (scope === 'highlights') {
    return (
      <div className="library-main-highlights">
        <LibraryHighlights
          folderOptions={folderOptions}
          articleOptions={articleOptions}
          externalQuery={externalQuery}
          view={highlightView}
          onQueryChange={onQueryChange}
          onDumpHighlight={onDumpHighlight}
        />
      </div>
    );
  }

  if (selectedArticleId) {
    const hasReadableArticle = Boolean(selectedArticle);
    const isInitialLoad = articleLoading && !hasReadableArticle;
    const isUnavailable = !articleLoading && !hasReadableArticle && Boolean(articleError);
    const unavailableTitle = articleErrorKind === 'missing'
      ? 'This source left the shelf.'
      : articleErrorKind === 'unavailable'
        ? 'This source belongs elsewhere.'
        : 'The shelf did not answer.';
    const unavailableCopy = articleErrorKind === 'missing'
      ? 'It may have been deleted since this link was made.'
      : articleErrorKind === 'unavailable'
        ? 'The link is valid, but this account cannot read it.'
        : 'Your place is held. Try again when the connection settles.';

    return (
      <div className={`section-stack library-main-reading ${articleLoading ? 'is-loading' : ''} ${articleError ? 'has-error' : ''}`.trim()}>
        {hasReadableArticle && articleError && (
          <div className="library-reader-refresh" role="status">
            <span>Could not refresh. Your reading copy is still here.</span>
            {onRetryArticle ? <button type="button" onClick={onRetryArticle}>Try again</button> : null}
          </div>
        )}
        {isInitialLoad && (
          <div className="think-concept-loading" aria-hidden="true">
            <div className="skeleton skeleton-title" style={{ width: '58%', height: 22 }} />
            <div className="skeleton skeleton-text" style={{ width: '28%' }} />
            <div className="skeleton skeleton-text" style={{ width: '100%', height: 14 }} />
            <div className="skeleton skeleton-text" style={{ width: '96%', height: 14 }} />
            <div className="skeleton skeleton-text" style={{ width: '92%', height: 14 }} />
            <div className="skeleton skeleton-text" style={{ width: '89%', height: 14 }} />
            <div className="skeleton skeleton-text" style={{ width: '98%', height: 14 }} />
          </div>
        )}
        {isUnavailable && (
          <section className="library-reader-state" aria-labelledby="library-reader-state-title">
            <span className="library-reader-state__eyebrow">Source unavailable</span>
            <h1 id="library-reader-state-title">{unavailableTitle}</h1>
            <p>{unavailableCopy}</p>
            <div className="library-reader-state__actions">
              {onRetryArticle ? <button type="button" onClick={onRetryArticle}>Try again</button> : null}
              <button type="button" onClick={() => onSelectArticle?.('')}>Back to Library</button>
            </div>
            <span className="library-reader-state__thread" aria-hidden="true">The thread remains tied here.</span>
          </section>
        )}
        {hasReadableArticle && (
          <ArticleReader
            article={selectedArticle}
            highlights={articleHighlights}
            focusedHighlightId={focusedHighlightId}
            graphConnections={articleGraphConnections}
            onMove={() => selectedArticle && onMoveArticle(selectedArticle)}
            onHighlightOptimistic={onHighlightOptimistic}
            onHighlightReplace={onHighlightReplace}
            onHighlightRemove={onHighlightRemove}
            onAskLibrarian={onAskLibrarian}
            onToggleEvergreen={onToggleEvergreen}
            sourceTrace={(
              <LibrarySourceTrace
                source={sourceDetail}
                loading={sourceDetailLoading}
                error={sourceDetailError}
              />
            )}
          />
        )}
      </div>
    );
  }

  if (isMixedBrowse) {
    return (
      <div
        className="library-main-browse library-composition"
        data-testid="library-composition"
        data-composition-layout="list"
      >
        <div className="library-composition__list">
          {!relevanceFailed ? (
            <LibrarySourceList
              sources={relevance.sources}
              loading={relevancePending}
              loadingMore={relevance.loadingMore}
              error={articlesError}
              emptyLabel={articleQuery
                ? `No sources match "${articleQuery}".`
                : sourceViewEmptyLabel}
              query={articleQuery}
              onQueryChange={null}
              onOpenSource={handleOpenSource}
              onMoveArticle={onMoveArticle}
              articles={allArticles}
              scope={scope}
              suppressedVisible={suppressedVisible}
              corpusTotal={Number.isFinite(Number(relevance.counts?.recent?.value))
                ? Number(relevance.counts.recent.value)
                : corpusTotal}
              rawCorpusTotal={Number.isFinite(Number(relevance.counts?.recent?.value))
                ? Number(relevance.counts.recent.value)
                : rawCorpusTotal}
              suppressedCount={relevance.filteredOutCount || 0}
              latestReceipt={latestReceipt}
              coverage={relevance.coverage}
              counts={relevance.counts}
              sourceView={sourceView}
              reviewBacklogCount={reviewBacklogCount}
              reviewBacklogHref={reviewBacklogHref}
              paginationError={relevance.paginationError}
              filteredOutCount={relevance.filteredOutCount || 0}
              hasMore={relevance.hasMore}
              onLoadMore={relevance.loadMore}
              title={viewLabel}
              subtitle={viewSubtitle}
              selectedSourceKey={selectedSourceKey}
              variant="room"
            />
          ) : (
            <LibraryArticleList
              articles={articles}
              loading={articlesLoading}
              error={articlesError}
              scope={scope}
              emptyLabel={articleQuery
                ? `No articles match "${articleQuery}".`
                : 'No articles saved yet.'}
              query={articleQuery}
              onQueryChange={onArticleQueryChange}
              onSelectArticle={onSelectArticle}
              onMoveArticle={onMoveArticle}
              suppressedVisible={suppressedVisible}
              corpusTotal={corpusTotal}
              rawCorpusTotal={rawCorpusTotal}
              suppressedCount={suppressedCount}
              latestReceipt={latestReceipt}
              title="Articles · offline fallback"
              subtitle="Source context is temporarily unavailable; your saved articles remain accessible."
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="library-main-browse">
      {showReadingRoomLead && Number.isFinite(unfiledCount) ? (
        <LibraryReadingRoomLead
          articles={articles}
          allArticles={allArticles}
          unfiledCount={unfiledCount}
          suppressedVisible={suppressedVisible}
          onSelectArticle={onSelectArticle}
          onReviewFiling={onReviewFiling}
          filingLaunching={filingLaunching}
          filingReceipt={filingReceipt}
          onToggleSuppressed={onToggleSuppressed}
        />
      ) : null}
      <LibraryArticleList
        articles={articles}
        loading={articlesLoading}
        error={articlesError}
        scope={scope}
        emptyLabel={scope === 'unfiled'
          ? 'No unfiled articles right now.'
          : scope === 'folder'
            ? `No articles in ${selectedFolderName || 'this folder'} yet.`
            : articleQuery
              ? `No articles match "${articleQuery}".`
              : 'No articles saved yet.'}
        query={articleQuery}
        onQueryChange={onArticleQueryChange}
        onSelectArticle={onSelectArticle}
        onMoveArticle={onMoveArticle}
        suppressedVisible={suppressedVisible}
        corpusTotal={corpusTotal}
        rawCorpusTotal={rawCorpusTotal}
        suppressedCount={suppressedCount}
        latestReceipt={latestReceipt}
        title="Articles"
        subtitle="Saved reads and source material."
      />
    </div>
  );
};

export default React.memo(LibraryMain);
