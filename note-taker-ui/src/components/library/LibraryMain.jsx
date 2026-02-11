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
        {articleLoading && <p className="muted small">Loading article…</p>}
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

export default LibraryMain;
