import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ArticleReader from '../ArticleReader';
import LibraryArticleList from './LibraryArticleList';
import LibraryHighlights from './LibraryHighlights';
import LibraryReadingRoomLead from './LibraryReadingRoomLead';
import LibrarySourceList from './LibrarySourceList';
import LibrarySourceMemory from './LibrarySourceMemory';
import LibrarySourceTrace from './LibrarySourceTrace';
import { filterLibraryBrowseItems } from '../../utils/cruftSuppression';
import { sourceRowKey } from './librarySourceIdentity';
import '../../styles/library-source-memory.css';

const COMPACT_COMPOSITION_QUERY = '(max-width: 1100px)';

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
  onSelectSource = null,
  onOpenSource = null,
  onSelectScope = null,
  onMoveArticle,
  onHighlightOptimistic,
  onHighlightReplace,
  onHighlightRemove,
  onOpenConcept,
  onOpenNotebook,
  onOpenQuestion,
  onDumpToWorkingMemory,
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
  selectedSourceRow = null,
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
  const [compactComposition, setCompactComposition] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(COMPACT_COMPOSITION_QUERY).matches
      : false
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(COMPACT_COMPOSITION_QUERY);
    const sync = () => setCompactComposition(Boolean(media.matches));
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);
  const showReadingRoomLead = scope === 'unfiled';
  const isMixedBrowse = scope === 'all';
  const allowedSourceIds = useMemo(() => new Set(
    (suppressedVisible ? allArticles : filterLibraryBrowseItems(allArticles))
      .map(article => String(article?._id || ''))
      .filter(Boolean)
  ), [allArticles, suppressedVisible]);
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
  const handleSelectSource = useCallback((source) => {
    if (onSelectSource) {
      onSelectSource(source);
      return;
    }
    if (source?.type === 'article' || !source?.type) {
      onSelectArticle?.(source?.id);
      return;
    }
    if (source?.type === 'highlight' && source.parentId) {
      onSelectArticle?.(source.parentId);
    }
  }, [onSelectArticle, onSelectSource]);
  const handleOpenSource = useCallback((source) => {
    if (onOpenSource) {
      onOpenSource(source);
      return;
    }
    handleSelectSource(source);
  }, [handleSelectSource, onOpenSource]);
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

  const previewSource = useMemo(() => {
    const selectedType = String(selectedSourceKey || '').split(':')[0];
    const fromList = selectedSourceRow
      || (selectedSourceKey
        ? relevanceState.sources.find(row => sourceRowKey(row) === selectedSourceKey) || null
        : null);
    if (fromList) {
      if (
        selectedType === 'article'
        && sourceDetail
        && String(sourceDetail.id || '') === String(fromList?.source?.id || '')
      ) {
        return {
          ...fromList,
          provenance: {
            ...(fromList.provenance || {}),
            ...(sourceDetail.provenance || {})
          },
          relevance: sourceDetail.relevance || fromList.relevance,
          sourceUrl: sourceDetail.sourceUrl || fromList.source?.sourceUrl || ''
        };
      }
      return fromList;
    }
    if (selectedType === 'article' && sourceDetail) return sourceDetail;
    return null;
  }, [relevanceState.sources, selectedSourceKey, selectedSourceRow, sourceDetail]);

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
            onOpenConcept={onOpenConcept}
            onOpenNotebook={onOpenNotebook}
            onOpenQuestion={onOpenQuestion}
            onDumpToWorkingMemory={onDumpToWorkingMemory}
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
    const sourceTrace = (
      <LibrarySourceTrace
        source={previewSource}
        loading={Boolean(selectedSourceKey) && sourceDetailLoading && !previewSource}
        error={sourceDetailError}
        variant="preview"
        onOpenSource={handleOpenSource}
      />
    );
    return (
      <div
        className={`library-main-browse library-composition${compactComposition ? ' is-compact' : ''}`}
        data-testid="library-composition"
        data-composition-layout={compactComposition ? 'compact' : 'rail'}
      >
        <aside className="library-composition__index" aria-label="Source index">
          <LibrarySourceMemory
            onSelectArticle={onSelectArticle}
            onSelectSource={handleSelectSource}
            view={sourceView}
            onViewChange={onSourceViewChange}
            allowedSourceIds={allowedSourceIds}
            renderRows={false}
            onDataChange={handleRelevanceDataChange}
            variant="index"
            scope={scope}
            unfiledCount={unfiledCount}
            onSelectScope={onSelectScope}
            coverageStatus={relevanceState.coverage?.status || null}
            showSuppressed={suppressedVisible}
          />
        </aside>

        <div className="library-composition__list">
          {compactComposition && !selectedSourceKey && !relevanceFailed ? (
            <div
              className="library-composition__inline-preview library-composition__inline-preview--empty"
              data-testid="library-inline-preview"
            >
              {sourceTrace}
            </div>
          ) : null}
          {!relevanceFailed ? (
            <LibrarySourceList
              sources={relevanceState.sources}
              loading={articlesLoading || relevancePending}
              loadingMore={relevanceState.loadingMore}
              error={articlesError}
              emptyLabel={articleQuery
                ? `No sources match "${articleQuery}".`
                : sourceViewEmptyLabel}
              query={articleQuery}
              onQueryChange={onArticleQueryChange}
              onSelectSource={handleSelectSource}
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
              inlinePreview={compactComposition ? sourceTrace : null}
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

        {!compactComposition ? (
          <aside className="library-composition__preview" aria-label="Selected source">
            {sourceTrace}
          </aside>
        ) : null}
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
