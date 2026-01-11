import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, SectionHeader, QuietButton, TagChip } from '../components/ui';
import WorkspaceShell from '../layouts/WorkspaceShell';
import ArticleReader from '../components/ArticleReader';
import LibraryCabinet from '../components/library/LibraryCabinet';
import LibraryArticleList from '../components/library/LibraryArticleList';
import MoveToFolderModal from '../components/library/MoveToFolderModal';
import { moveArticleToFolder } from '../api/articles';
import useFolders from '../hooks/useFolders';
import useLibraryArticles from '../hooks/useLibraryArticles';
import useArticleDetail from '../hooks/useArticleDetail';
import useArticleReferences from '../hooks/useArticleReferences';
import useTags from '../hooks/useTags';

const RIGHT_STORAGE_KEY = 'workspace-right-open:/library';

// Folder contract: GET `/folders` -> [{ _id, name, createdAt, updatedAt }].
// Articles reference folders via `article.folder` (populated Folder) or null for unfiled.

const Library = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = searchParams.get('scope') || 'all';
  const folderId = searchParams.get('folderId') || '';
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [articleToMove, setArticleToMove] = useState(null);
  const [moveError, setMoveError] = useState('');
  const [moving, setMoving] = useState(false);
  const [rightOpen, setRightOpen] = useState(() => {
    const stored = localStorage.getItem(RIGHT_STORAGE_KEY);
    if (stored === null) return true;
    return stored === 'true';
  });
  const [readingMode, setReadingMode] = useState(false);
  const [savedRightOpen, setSavedRightOpen] = useState(null);
  const [activeHighlightId, setActiveHighlightId] = useState('');
  const readerRef = useRef(null);

  const { folders, loading: foldersLoading, error: foldersError } = useFolders();
  const {
    articles,
    allArticles,
    loading: articlesLoading,
    error: articlesError,
    setAllArticles
  } = useLibraryArticles({
    scope,
    folderId,
    sort: 'recent'
  });
  const { tags, loading: tagsLoading } = useTags();
  const {
    article: selectedArticle,
    highlights: articleHighlights,
    loading: articleLoading,
    error: articleError
  } = useArticleDetail(selectedArticleId, { enabled: Boolean(selectedArticleId) });
  const {
    references,
    loading: referencesLoading,
    error: referencesError
  } = useArticleReferences(selectedArticleId, { enabled: Boolean(selectedArticleId) });

  useEffect(() => {
    setSelectedArticleId('');
    setActiveHighlightId('');
  }, [scope, folderId]);

  useEffect(() => {
    if (searchParams.get('scope')) return;
    const params = new URLSearchParams(searchParams);
    params.set('scope', 'all');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (scope !== 'all' || selectedArticleId) return;
    const saved = localStorage.getItem('library.lastArticleId');
    if (saved && allArticles.some(article => article._id === saved)) {
      setSelectedArticleId(saved);
    }
  }, [allArticles, scope, selectedArticleId]);

  const handleSelectScope = (nextScope) => {
    const params = new URLSearchParams(searchParams);
    params.set('scope', nextScope);
    params.delete('folderId');
    setSearchParams(params);
  };

  const handleSelectFolder = (id) => {
    const params = new URLSearchParams(searchParams);
    params.set('scope', 'folder');
    params.set('folderId', id);
    setSearchParams(params);
  };

  const handleSelectArticle = (id) => {
    setSelectedArticleId(id);
    localStorage.setItem('library.lastArticleId', id);
  };

  const openMoveModal = (article) => {
    setArticleToMove(article);
    setMoveError('');
    setMoveModalOpen(true);
  };

  const closeMoveModal = () => {
    setMoveModalOpen(false);
    setArticleToMove(null);
    setMoving(false);
  };

  const handleMoveArticle = async (nextFolderId) => {
    if (!articleToMove) return;
    setMoving(true);
    setMoveError('');
    const previous = allArticles;
    const nextFolder = nextFolderId
      ? folders.find(folder => folder._id === nextFolderId) || { _id: nextFolderId, name: 'Folder' }
      : null;
    setAllArticles(prevArticles =>
      prevArticles.map(article =>
        article._id === articleToMove._id ? { ...article, folder: nextFolder } : article
      )
    );
    try {
      const updated = await moveArticleToFolder(articleToMove._id, nextFolderId);
      if (updated) {
        setAllArticles(prevArticles =>
          prevArticles.map(article =>
            article._id === articleToMove._id ? updated : article
          )
        );
      }
      closeMoveModal();
      if (scope === 'folder' && nextFolderId !== folderId && selectedArticleId === articleToMove._id) {
        setSelectedArticleId('');
      }
      if (scope === 'unfiled' && nextFolderId && selectedArticleId === articleToMove._id) {
        setSelectedArticleId('');
      }
    } catch (err) {
      setMoveError(err.response?.data?.error || 'Failed to move article.');
      setAllArticles(previous);
      setMoving(false);
    }
  };

  const handleHighlightClick = (highlight) => {
    setActiveHighlightId(highlight._id);
    readerRef.current?.scrollToHighlight(highlight._id);
  };

  const handleToggleRight = (nextOpen) => {
    if (readingMode && nextOpen) {
      setReadingMode(false);
    }
    setRightOpen(nextOpen);
    localStorage.setItem(RIGHT_STORAGE_KEY, String(nextOpen));
  };

  const toggleReadingMode = () => {
    setReadingMode(prev => {
      const next = !prev;
      if (next) {
        setSavedRightOpen(rightOpen);
        setRightOpen(false);
      } else {
        const restore = savedRightOpen === null ? true : savedRightOpen;
        setRightOpen(restore);
      }
      return next;
    });
  };

  const fallbackCounts = useMemo(() => {
    const counts = {};
    allArticles.forEach(article => {
      const id = article.folder?._id || 'unfiled';
      counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  }, [allArticles]);

  const countsFromFolders = useMemo(() => {
    const counts = {};
    folders.forEach(folder => {
      if (typeof folder.articleCount === 'number') {
        counts[folder._id] = folder.articleCount;
      }
    });
    return counts;
  }, [folders]);

  const folderCounts = useMemo(
    () => ({ ...fallbackCounts, ...countsFromFolders }),
    [fallbackCounts, countsFromFolders]
  );

  const unfiledCount = folderCounts.unfiled || 0;
  const allCount = useMemo(() => allArticles.length, [allArticles.length]);

  const groupedHighlights = useMemo(() => {
    const groups = {};
    (articleHighlights || []).forEach(highlight => {
      const tags = highlight.tags && highlight.tags.length > 0 ? highlight.tags : ['Untagged'];
      tags.forEach(tag => {
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(highlight);
      });
    });
    return groups;
  }, [articleHighlights]);

  const highlightGroups = useMemo(
    () => Object.keys(groupedHighlights).sort((a, b) => a.localeCompare(b)),
    [groupedHighlights]
  );

  const selectedFolderName = useMemo(() => {
    if (scope !== 'folder') return '';
    const folder = folders.find(item => item._id === folderId);
    return folder ? folder.name : '';
  }, [folders, folderId, scope]);

  const leftPanel = (
    <div className="section-stack">
      {foldersLoading && <p className="muted small">Loading cabinet…</p>}
      {foldersError && <p className="status-message error-message">{foldersError}</p>}
      {!foldersLoading && !foldersError && (
        <LibraryCabinet
          folders={folders}
          folderCounts={folderCounts}
          allCount={allCount}
          unfiledCount={unfiledCount}
          scope={scope}
          selectedFolderId={folderId}
          onSelectScope={handleSelectScope}
          onSelectFolder={handleSelectFolder}
        />
      )}
      <div className="library-saved-views">
        <SectionHeader title="Saved Views" subtitle="Optional shortcuts." />
        <Link className="library-saved-view-link" to="/views">Open Saved Views</Link>
        {!tagsLoading && tags.length > 0 && (
          <div className="library-saved-view-tags">
            {tags.slice(0, 6).map(tag => (
              <TagChip key={tag.tag} to={`/tags/${encodeURIComponent(tag.tag)}`}>{tag.tag}</TagChip>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const mainPanel = selectedArticleId ? (
    <div className="section-stack">
      {articleError && <p className="status-message error-message">{articleError}</p>}
      {articleLoading && <p className="muted small">Loading article…</p>}
      {!articleLoading && (
        <ArticleReader
          ref={readerRef}
          article={selectedArticle}
          highlights={articleHighlights}
          readingMode={readingMode}
          onToggleReadingMode={toggleReadingMode}
          onMove={() => selectedArticle && openMoveModal(selectedArticle)}
        />
      )}
    </div>
  ) : (
    <LibraryArticleList
      articles={articles}
      loading={articlesLoading}
      error={articlesError}
      emptyLabel={scope === 'unfiled'
        ? 'No unfiled articles right now.'
        : scope === 'folder'
          ? `No articles in ${selectedFolderName || 'this folder'} yet.`
          : 'No articles saved yet.'}
      onSelectArticle={handleSelectArticle}
      onMoveArticle={openMoveModal}
    />
  );

  const rightPanel = selectedArticleId ? (
    <div className="section-stack">
      <SectionHeader title="Highlights" subtitle="Grouped by concept." />
      {articleHighlights.length === 0 && !articleLoading && (
        <p className="muted small">No highlights saved for this article yet.</p>
      )}
      {highlightGroups.map(tag => (
        <div key={tag} className="library-highlight-group">
          <div className="library-highlight-group-header">
            <span className="library-highlight-group-title">{tag}</span>
            {tag !== 'Untagged' && (
              <Link to={`/tags/${encodeURIComponent(tag)}`} className="muted small">Open concept</Link>
            )}
          </div>
          <div className="library-highlight-list">
            {groupedHighlights[tag].map(highlight => (
              <div
                key={highlight._id}
                className={`library-highlight-item ${activeHighlightId === highlight._id ? 'is-active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => handleHighlightClick(highlight)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleHighlightClick(highlight);
                }}
              >
                <div className="library-highlight-text">{highlight.text}</div>
                <div className="library-highlight-tags">
                  {(highlight.tags || []).length > 0 ? (
                    highlight.tags.map(tagName => (
                      <TagChip key={`${highlight._id}-${tagName}`} to={`/tags/${encodeURIComponent(tagName)}`}>
                        {tagName}
                      </TagChip>
                    ))
                  ) : (
                    <span className="muted small">Untagged</span>
                  )}
                </div>
                <div className="library-highlight-actions">
                  <QuietButton
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveHighlightId(highlight._id);
                    }}
                  >
                    Select
                  </QuietButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <SectionHeader title="Used in Notes" subtitle="Backlinks for this article." />
      {referencesLoading && <p className="muted small">Loading references…</p>}
      {referencesError && <p className="status-message error-message">{referencesError}</p>}
      {!referencesLoading && !referencesError && (
        <div className="library-references">
          {references.notebookBlocks.length === 0 ? (
            <p className="muted small">No notes yet.</p>
          ) : (
            references.notebookBlocks.slice(0, 6).map((block, idx) => (
              <button
                key={`${block.notebookEntryId}-${block.blockId}-${idx}`}
                className="library-reference-item"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('entryId', block.notebookEntryId);
                  if (block.blockId) params.set('blockId', block.blockId);
                  window.location.href = `/notebook?${params.toString()}`;
                }}
              >
                <div className="library-reference-title">{block.notebookTitle || 'Untitled note'}</div>
                <div className="muted small">{block.blockPreviewText || 'Referenced block'}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  ) : (
    <div className="section-stack">
      <SectionHeader title="Context" subtitle="Select an article to see highlights." />
    </div>
  );

  return (
    <Page>
      <WorkspaceShell
        title="Library"
        subtitle="Reading room for your saved work."
        eyebrow="Mode"
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle="Context"
        defaultRightOpen
        rightOpen={readingMode ? false : rightOpen}
        onToggleRight={handleToggleRight}
        className={`library-shell ${readingMode ? 'library-shell--reading' : ''}`}
      />
      <MoveToFolderModal
        open={moveModalOpen}
        folders={folders}
        currentFolderId={articleToMove?.folder?._id || ''}
        onClose={closeMoveModal}
        onMove={handleMoveArticle}
        loading={moving}
        error={moveError}
      />
    </Page>
  );
};

export default Library;
