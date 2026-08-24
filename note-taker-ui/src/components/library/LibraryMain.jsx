import React, { useCallback, useMemo, useState } from 'react';
import ArticleReader from '../ArticleReader';
import LibraryArticleList from './LibraryArticleList';
import LibraryHighlights from './LibraryHighlights';
import LibraryReadingRoomLead from './LibraryReadingRoomLead';
import LibrarySourceList from './LibrarySourceList';
import LibrarySourceMemory from './LibrarySourceMemory';
import LibrarySourceTrace from './LibrarySourceTrace';
import { filterLibraryBrowseItems } from '../../utils/cruftSuppression';
import '../../styles/library-source-memory.css';

const LibraryMain = ({
  selectedArticleId,
  selectedArticle,
  articleHighlights,
  articleGraphConnections,
  articleLoading,
  articleError,
  articles,
  articlesLoading,
  articlesError,
  scope,
  selectedFolderName,
  readerRef,
  onSelectArticle,
  onOpenSource = null,
  onSelectScope = null,
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
  unfiledCount = 0,
  shelfNavigation = null,
  onReviewFiling,
  filingLaunching = false,
  filingReceipt = null,
  onToggleSuppressed,
  corpusTotal = 0,
  rawCorpusTotal = 0,
  suppressedCount = 0,
  latestReceipt = null,
  sourceView = 'recent',
  onSourceViewChange = null,
  selectedSourceKey = '',
  sourceDetail = null,
  sourceDetailLoading = false,
  sourceDetailError = ''
}) => {
  const [relevanceState, setRelevanceState] = useState({
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
  });
  const showReadingRoomLead = scope === 'unfiled';
  const isMixedBrowse = scope === 'all';
  const allowedSourceIds = useMemo(() => {
    // The mixed-source endpoint already applies the visibility contract. Do
    // not hold its first useful page behind the older all-articles request;
    // once that summary arrives it becomes a second, local safety fence.
    if (articlesLoading) return null;
    return new Set(
      (suppressedVisible ? allArticles : filterLibraryBrowseItems(allArticles))
        .map(article => String(article?._id || ''))
        .filter(Boolean)
    );
  }, [allArticles, articlesLoading, suppressedVisible]);
  const handleRelevanceDataChange = useCallback(next => {
    setRelevanceState(previous => {
      if (
        previous.loading === next.loading
        && previous.loadingMore === next.loadingMore
        && previous.error === next.error
        && previous.paginationError === next.paginationError
        && previous.coverage === next.coverage
        && previous.counts === next.counts
        && previous.sources === next.sources
        && previous.nextCursor === next.nextCursor
        && previous.hasMore === next.hasMore
        && previous.filteredOutCount === next.filteredOutCount
        && previous.loadMore === next.loadMore
      ) return previous;
      return next;
    });
  }, []);
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
  const viewSubtitle = sourceView === 'active'
    ? 'Sources currently supporting, challenging, or changing your work.'
    : sourceView === 'needs_review'
      ? 'Sources attached to a candidate or unresolved change.'
      : sourceView === 'unconnected'
        ? 'Sources not yet used by a durable thinking object.'
        : 'Sources in the order they entered your Library.';
  const relevancePending = isMixedBrowse && relevanceState.loading;
  const relevanceFailed = Boolean(
    isMixedBrowse
    && relevanceState.error
    && relevanceState.sources.length === 0
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
    return (
      <div className={`section-stack library-main-reading ${articleLoading ? 'is-loading' : ''} ${articleError ? 'has-error' : ''}`.trim()}>
        {articleError && <p className="status-message error-message">{articleError}</p>}
        {articleLoading && (
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
        {!articleLoading && (
          <ArticleReader
            ref={readerRef}
            article={selectedArticle}
            highlights={articleHighlights}
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
        <LibrarySourceMemory
            onSelectArticle={onSelectArticle}
            onSelectSource={handleOpenSource}
            view={sourceView}
            onViewChange={onSourceViewChange}
            allowedSourceIds={allowedSourceIds}
            renderRows={false}
            onDataChange={handleRelevanceDataChange}
            variant="index"
            scope={scope}
            unfiledCount={unfiledCount}
            onSelectScope={onSelectScope}
            shelfNavigation={shelfNavigation}
            coverageStatus={relevanceState.coverage?.status || null}
            showSuppressed={suppressedVisible}
            headless
          />

        <div className="library-composition__list">
          {!relevanceFailed ? (
            <LibrarySourceList
              sources={relevanceState.sources}
              loading={relevancePending}
              loadingMore={relevanceState.loadingMore}
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
              corpusTotal={Number(relevanceState.counts?.recent?.value ?? corpusTotal)}
              rawCorpusTotal={Number(relevanceState.counts?.recent?.value ?? rawCorpusTotal)}
              suppressedCount={relevanceState.filteredOutCount}
              latestReceipt={latestReceipt}
              coverage={relevanceState.coverage}
              counts={relevanceState.counts}
              sourceView={sourceView}
              paginationError={relevanceState.paginationError}
              filteredOutCount={relevanceState.filteredOutCount}
              hasMore={relevanceState.hasMore}
              onLoadMore={relevanceState.loadMore}
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
      {showReadingRoomLead ? (
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
