import React from 'react';
import ArticleReader from '../ArticleReader';
import LibraryArticleList from './LibraryArticleList';
import LibraryHighlights from './LibraryHighlights';
import LibraryReadingRoomLead from './LibraryReadingRoomLead';

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
  onToggleSuppressed
}) => {
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
          />
        )}
      </div>
    );
  }

  const showReadingRoomLead = scope === 'all' || scope === 'unfiled';

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
      />
    </div>
  );
};

export default React.memo(LibraryMain);
