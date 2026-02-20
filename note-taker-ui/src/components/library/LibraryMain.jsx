import React from 'react';
import ArticleReader from '../ArticleReader';
import LibraryArticleList from './LibraryArticleList';
import LibraryHighlights from './LibraryHighlights';

const LibraryMain = ({
  selectedArticleId,
  selectedArticle,
  articleHighlights,
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
  folderOptions,
  articleOptions,
  externalQuery,
  highlightView,
  onQueryChange,
  onDumpHighlight
}) => {
  if (scope === 'highlights') {
    return (
      <LibraryHighlights
        folderOptions={folderOptions}
        articleOptions={articleOptions}
        externalQuery={externalQuery}
        view={highlightView}
        onQueryChange={onQueryChange}
        onDumpHighlight={onDumpHighlight}
      />
    );
  }

  if (selectedArticleId) {
    return (
      <div className="section-stack">
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
            onMove={() => selectedArticle && onMoveArticle(selectedArticle)}
            onHighlightOptimistic={onHighlightOptimistic}
            onHighlightReplace={onHighlightReplace}
            onHighlightRemove={onHighlightRemove}
          />
        )}
      </div>
    );
  }

  return (
    <LibraryArticleList
      articles={articles}
      loading={articlesLoading}
      error={articlesError}
      emptyLabel={scope === 'unfiled'
        ? 'No unfiled articles right now.'
        : scope === 'folder'
          ? `No articles in ${selectedFolderName || 'this folder'} yet.`
          : 'No articles saved yet.'}
      onSelectArticle={onSelectArticle}
      onMoveArticle={onMoveArticle}
    />
  );
};

export default React.memo(LibraryMain);
