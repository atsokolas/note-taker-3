import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, SectionHeader, TagChip } from '../components/ui';
import LibraryCabinet from '../components/library/LibraryCabinet';
import LibraryShell from '../components/library/LibraryShell';
import LibraryMain from '../components/library/LibraryMain';
import LibraryContext from '../components/library/LibraryContext';
import MoveToFolderModal from '../components/library/MoveToFolderModal';
import { moveArticleToFolder } from '../api/articles';
import useFolders from '../hooks/useFolders';
import useLibraryArticles from '../hooks/useLibraryArticles';
import useArticleDetail from '../hooks/useArticleDetail';
import useArticleReferences from '../hooks/useArticleReferences';
import useTags from '../hooks/useTags';
import { getContextPanelOpen } from '../utils/readingMode';

const RIGHT_STORAGE_KEY = 'workspace-right-open:/library';
const CONTEXT_OVERRIDE_KEY = 'library.context.override:/library';
const LEFT_STORAGE_KEY = 'workspace-left-open:/library';
const CABINET_OVERRIDE_KEY = 'library.cabinet.override:/library';

// Folder contract: GET `/folders` -> [{ _id, name, createdAt, updatedAt }].
// Articles reference folders via `article.folder` (populated Folder) or null for unfiled.

const Library = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = searchParams.get('scope') || 'all';
  const folderId = searchParams.get('folderId') || '';
  const highlightQuery = searchParams.get('hq') || '';
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
  const [leftOpen, setLeftOpen] = useState(() => {
    const stored = localStorage.getItem(LEFT_STORAGE_KEY);
    if (stored === null) return true;
    return stored === 'true';
  });
  const [contextOverride, setContextOverride] = useState(() => (
    localStorage.getItem(CONTEXT_OVERRIDE_KEY) === 'true'
  ));
  const [cabinetOverride, setCabinetOverride] = useState(() => (
    localStorage.getItem(CABINET_OVERRIDE_KEY) === 'true'
  ));
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
    error: articleError,
    addHighlightOptimistic,
    replaceHighlight,
    removeHighlight
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
    if (nextScope !== 'highlights') {
      params.delete('hq');
    }
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

  const handleToggleRight = useCallback((nextOpen) => {
    if (selectedArticleId && nextOpen && !contextOverride) {
      setContextOverride(true);
      localStorage.setItem(CONTEXT_OVERRIDE_KEY, 'true');
    }
    setRightOpen(nextOpen);
    localStorage.setItem(RIGHT_STORAGE_KEY, String(nextOpen));
  }, [contextOverride, selectedArticleId]);

  const handleToggleLeft = useCallback((nextOpen) => {
    if (selectedArticleId && nextOpen && !cabinetOverride) {
      setCabinetOverride(true);
      localStorage.setItem(CABINET_OVERRIDE_KEY, 'true');
    }
    setLeftOpen(nextOpen);
    localStorage.setItem(LEFT_STORAGE_KEY, String(nextOpen));
  }, [cabinetOverride, selectedArticleId]);

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
  const folderOptions = useMemo(() => {
    const options = [{ value: 'unfiled', label: 'Unfiled' }];
    folders.forEach(folder => {
      options.push({ value: folder._id, label: folder.name });
    });
    return options;
  }, [folders]);
  const articleOptions = useMemo(
    () => allArticles.map(article => ({ value: article._id, label: article.title || 'Untitled article' })),
    [allArticles]
  );

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
      <div className="library-search-panel">
        <SectionHeader title="Search" subtitle="Find highlights fast." />
        <label className="feedback-field" style={{ margin: 0 }}>
          <span>Highlight search</span>
          <input
            type="text"
            value={highlightQuery}
            placeholder="Search highlights..."
            onChange={(event) => {
              const params = new URLSearchParams(searchParams);
              const value = event.target.value;
              if (value) {
                params.set('scope', 'highlights');
                params.set('hq', value);
              } else {
                params.delete('hq');
              }
              setSearchParams(params);
            }}
          />
        </label>
      </div>
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

  const effectiveRightOpen = getContextPanelOpen({
    hasSelection: Boolean(selectedArticleId),
    storedOpen: rightOpen,
    userOverride: contextOverride
  });
  const effectiveLeftOpen = getContextPanelOpen({
    hasSelection: Boolean(selectedArticleId),
    storedOpen: leftOpen,
    userOverride: cabinetOverride
  });

  useEffect(() => {
    if (!effectiveRightOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleToggleRight(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [effectiveRightOpen, handleToggleRight]);

  const mainPanel = (
    <LibraryMain
      selectedArticleId={selectedArticleId}
      selectedArticle={selectedArticle}
      articleHighlights={articleHighlights}
      articleLoading={articleLoading}
      articleError={articleError}
      articles={articles}
      articlesLoading={articlesLoading}
      articlesError={articlesError}
      scope={scope}
      selectedFolderName={selectedFolderName}
      readerRef={readerRef}
      onSelectArticle={handleSelectArticle}
      onMoveArticle={openMoveModal}
      onHighlightOptimistic={addHighlightOptimistic}
      onHighlightReplace={replaceHighlight}
      onHighlightRemove={removeHighlight}
      folderOptions={folderOptions}
      articleOptions={articleOptions}
      externalQuery={highlightQuery}
      onQueryChange={(value) => {
        const params = new URLSearchParams(searchParams);
        if (value) {
          params.set('scope', 'highlights');
          params.set('hq', value);
        } else {
          params.delete('hq');
        }
        setSearchParams(params);
      }}
    />
  );

  const rightPanel = (
    <LibraryContext
      selectedArticleId={selectedArticleId}
      articleHighlights={articleHighlights}
      articleLoading={articleLoading}
      references={references}
      referencesLoading={referencesLoading}
      referencesError={referencesError}
      highlightGroups={highlightGroups}
      groupedHighlights={groupedHighlights}
      activeHighlightId={activeHighlightId}
      onHighlightClick={handleHighlightClick}
      onSelectHighlight={setActiveHighlightId}
    />
  );

  return (
    <Page>
      <LibraryShell
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        leftOpen={effectiveLeftOpen}
        onToggleLeft={handleToggleLeft}
        leftToggleLabel="Cabinet"
        rightOpen={effectiveRightOpen}
        onToggleRight={handleToggleRight}
        rightToggleLabel="Context"
        persistRightOpen={false}
        className={`library-shell ${selectedArticleId && !effectiveRightOpen ? 'library-shell--reading' : ''}`}
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
