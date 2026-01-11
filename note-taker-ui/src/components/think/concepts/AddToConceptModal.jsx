import React, { useMemo, useState } from 'react';
import { Button, QuietButton } from '../../ui';
import HighlightBlock from '../../blocks/HighlightBlock';
import useFolders from '../../../hooks/useFolders';
import useArticles from '../../../hooks/useArticles';
import useHighlightsQuery from '../../../hooks/useHighlightsQuery';
import SearchResultsList from './SearchResultsList';

/**
 * @param {{
 *  open: boolean,
 *  mode: 'highlight' | 'article',
 *  pinnedHighlightIds: string[],
 *  pinnedArticleIds: string[],
 *  onClose: () => void,
 *  onAddHighlights: (ids: string[]) => void,
 *  onAddArticles: (ids: string[]) => void
 * }} props
 */
const AddToConceptModal = ({
  open,
  mode,
  pinnedHighlightIds,
  pinnedArticleIds,
  onClose,
  onAddHighlights,
  onAddArticles
}) => {
  const [query, setQuery] = useState('');
  const [folderId, setFolderId] = useState('');
  const [articleId, setArticleId] = useState('');
  const { folders } = useFolders();
  const { articles: articleOptions } = useArticles({ enabled: open });
  const { articles: articleResults, loading: articleLoading, error: articleError } = useArticles({
    query,
    folderId,
    enabled: open && mode === 'article'
  });
  const highlightFilters = useMemo(() => ({
    folderId: folderId || undefined,
    articleId: articleId || undefined,
    q: query || undefined
  }), [folderId, articleId, query]);
  const { highlights, loading: highlightsLoading, error: highlightsError } = useHighlightsQuery(highlightFilters, {
    enabled: open && mode === 'highlight'
  });

  if (!open) return null;

  const folderOptions = [
    { value: '', label: 'All folders' },
    { value: 'unfiled', label: 'Unfiled' },
    ...folders.map(folder => ({ value: folder._id, label: folder.name }))
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3>{mode === 'highlight' ? 'Add Highlights' : 'Add Articles'}</h3>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <div className="concept-search-filters">
          <label className="feedback-field">
            <span>Search</span>
            <input
              type="text"
              value={query}
              placeholder={`Search ${mode === 'highlight' ? 'highlights' : 'articles'}...`}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="feedback-field">
            <span>Folder</span>
            <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
              {folderOptions.map(option => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {mode === 'highlight' && (
            <label className="feedback-field">
              <span>Article</span>
              <select value={articleId} onChange={(event) => setArticleId(event.target.value)}>
                <option value="">All articles</option>
                {articleOptions.map(article => (
                  <option key={article._id} value={article._id}>
                    {article.title || 'Untitled article'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {mode === 'highlight' ? (
          <SearchResultsList
            items={highlights}
            loading={highlightsLoading}
            error={highlightsError}
            emptyLabel="No highlights found."
            renderItem={(highlight) => {
              const isPinned = pinnedHighlightIds.includes(String(highlight._id));
              return (
                <div key={highlight._id} className="concept-search-row">
                  <HighlightBlock highlight={highlight} compact />
                  <Button
                    variant="secondary"
                    disabled={isPinned}
                    onClick={() => onAddHighlights([highlight._id])}
                  >
                    {isPinned ? 'Added' : 'Add'}
                  </Button>
                </div>
              );
            }}
          />
        ) : (
          <SearchResultsList
            items={articleResults}
            loading={articleLoading}
            error={articleError}
            emptyLabel="No articles found."
            renderItem={(article) => {
              const isPinned = pinnedArticleIds.includes(String(article._id));
              return (
                <div key={article._id} className="concept-search-row">
                  <div className="concept-search-article">
                    <div className="concept-search-title">{article.title || 'Untitled article'}</div>
                    {article.url && <div className="muted small">{article.url}</div>}
                  </div>
                  <Button
                    variant="secondary"
                    disabled={isPinned}
                    onClick={() => onAddArticles([article._id])}
                  >
                    {isPinned ? 'Added' : 'Add'}
                  </Button>
                </div>
              );
            }}
          />
        )}

        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <QuietButton onClick={onClose}>Close</QuietButton>
        </div>
      </div>
    </div>
  );
};

export default AddToConceptModal;
