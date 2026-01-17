import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageTitle, SectionHeader, TagChip, QuietButton } from '../components/ui';
import LibraryMain from '../components/library/LibraryMain';
import LibraryContext from '../components/library/LibraryContext';
import FolderTree from '../components/library/FolderTree';
import MoveToFolderModal from '../components/library/MoveToFolderModal';
import { moveArticleToFolder } from '../api/articles';
import { createQuestion } from '../api/questions';
import useFolders from '../hooks/useFolders';
import useLibraryArticles from '../hooks/useLibraryArticles';
import useArticleDetail from '../hooks/useArticleDetail';
import useArticleReferences from '../hooks/useArticleReferences';
import useTags from '../hooks/useTags';
import { getContextPanelOpen } from '../utils/readingMode';
import ThreePaneLayout from '../layout/ThreePaneLayout';
import LibraryConceptModal from '../components/library/LibraryConceptModal';
import LibraryNotebookModal from '../components/library/LibraryNotebookModal';
import LibraryQuestionModal from '../components/library/LibraryQuestionModal';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

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
  const highlightView = searchParams.get('highlightView') || 'concept';
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [articleToMove, setArticleToMove] = useState(null);
  const [moveError, setMoveError] = useState('');
  const [moving, setMoving] = useState(false);
  const [conceptModal, setConceptModal] = useState({ open: false, highlight: null });
  const [notebookModal, setNotebookModal] = useState({ open: false, highlight: null });
  const [questionModal, setQuestionModal] = useState({ open: false, highlight: null });
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
  const [relatedHighlights, setRelatedHighlights] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState('');
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
      params.delete('highlightView');
    } else if (!params.get('highlightView')) {
      params.set('highlightView', 'concept');
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

  const handleSelectHighlightView = (view) => {
    const params = new URLSearchParams(searchParams);
    params.set('scope', 'highlights');
    params.set('highlightView', view);
    setSearchParams(params);
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

  const createId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
  };

  const handleAddConcept = async (highlight, conceptName) => {
    await api.post(`/api/concepts/${encodeURIComponent(conceptName)}/add-highlight`, {
      highlightId: highlight._id
    }, getAuthHeaders());
    setConceptModal({ open: false, highlight: null });
  };

  const handleAddQuestion = async (highlight, conceptName, text) => {
    const created = await createQuestion({
      text,
      conceptName,
      blocks: [
        { id: createId(), type: 'paragraph', text },
        { id: createId(), type: 'highlight-ref', highlightId: highlight._id, text: highlight.text || '' }
      ],
      linkedHighlightIds: [highlight._id]
    });
    if (created?._id) {
      await api.post(`/api/questions/${created._id}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    }
    setQuestionModal({ open: false, highlight: null });
  };

  const handleAttachQuestion = async (highlight, questionId) => {
    await api.post(`/api/questions/${questionId}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setQuestionModal({ open: false, highlight: null });
  };

  const handleSendToNotebook = async (highlight, entryId) => {
    await api.post(`/api/notebook/${entryId}/append-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setNotebookModal({ open: false, highlight: null });
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

  useEffect(() => {
    if (!selectedArticleId) {
      setRelatedHighlights([]);
      setRelatedLoading(false);
      setRelatedError('');
      return;
    }
    const targetId = activeHighlightId || articleHighlights[0]?._id;
    if (!targetId) {
      setRelatedHighlights([]);
      setRelatedLoading(false);
      setRelatedError('');
      return;
    }
    let cancelled = false;
    const fetchRelated = async () => {
      setRelatedLoading(true);
      setRelatedError('');
      try {
        const res = await api.get(`/api/highlights/${targetId}/related`, getAuthHeaders());
        if (!cancelled) {
          setRelatedHighlights(res.data?.results || []);
        }
      } catch (err) {
        if (!cancelled) {
          setRelatedError(err.response?.data?.error || 'Failed to load related highlights.');
        }
      } finally {
        if (!cancelled) setRelatedLoading(false);
      }
    };
    fetchRelated();
    return () => {
      cancelled = true;
    };
  }, [selectedArticleId, activeHighlightId, articleHighlights]);

  const selectedFolderName = useMemo(() => {
    if (scope !== 'folder') return '';
    const folder = folders.find(item => item._id === folderId);
    return folder ? folder.name : '';
  }, [folders, folderId, scope]);

  const leftPanel = (
    <div className="section-stack">
      <SectionHeader title="Cabinet" subtitle="Your filing system." />
      <div className="library-cabinet-actions">
        <QuietButton
          className={`list-button ${scope === 'all' ? 'is-active' : ''}`}
          onClick={() => handleSelectScope('all')}
        >
          <span>All Articles</span>
          {typeof allCount === 'number' && <span className="library-cabinet-count">{allCount}</span>}
        </QuietButton>
        <div className="library-cabinet-nested">
          <QuietButton
            className={`list-button ${scope === 'unfiled' ? 'is-active' : ''}`}
            onClick={() => handleSelectScope('unfiled')}
          >
            <span>Unfiled</span>
            {typeof unfiledCount === 'number' && <span className="library-cabinet-count">{unfiledCount}</span>}
          </QuietButton>
          {foldersLoading && <p className="muted small">Loading cabinet…</p>}
          {foldersError && <p className="status-message error-message">{foldersError}</p>}
          {!foldersLoading && !foldersError && (
            <div className="library-folder-items">
              <FolderTree
                folders={folders}
                counts={folderCounts}
                selectedFolderId={folderId}
                onSelectFolder={handleSelectFolder}
              />
            </div>
          )}
        </div>
        <QuietButton
          className={`list-button ${scope === 'highlights' ? 'is-active' : ''}`}
          onClick={() => handleSelectScope('highlights')}
        >
          <span>Highlights</span>
        </QuietButton>
        {scope === 'highlights' && (
          <div className="library-highlight-scope">
            <QuietButton
              className={`list-button ${highlightView === 'concept' ? 'is-active' : ''}`}
              onClick={() => handleSelectHighlightView('concept')}
            >
              By Concept
            </QuietButton>
            <QuietButton
              className={`list-button ${highlightView === 'article' ? 'is-active' : ''}`}
              onClick={() => handleSelectHighlightView('article')}
            >
              By Article
            </QuietButton>
            <QuietButton
              className={`list-button ${highlightView === 'untagged' ? 'is-active' : ''}`}
              onClick={() => handleSelectHighlightView('untagged')}
            >
              Untagged
            </QuietButton>
          </div>
        )}
      </div>
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
                if (!params.get('highlightView')) {
                  params.set('highlightView', 'concept');
                }
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
      highlightView={highlightView}
      onQueryChange={(value) => {
        const params = new URLSearchParams(searchParams);
        if (value) {
          params.set('scope', 'highlights');
          params.set('hq', value);
          if (!params.get('highlightView')) {
            params.set('highlightView', 'concept');
          }
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
      relatedHighlights={relatedHighlights}
      relatedLoading={relatedLoading}
      relatedError={relatedError}
      onHighlightClick={handleHighlightClick}
      onSelectHighlight={setActiveHighlightId}
      onAddConcept={(highlight) => setConceptModal({ open: true, highlight })}
      onAddNotebook={(highlight) => setNotebookModal({ open: true, highlight })}
      onAddQuestion={(highlight) => setQuestionModal({ open: true, highlight })}
    />
  );

  return (
    <>
      <ThreePaneLayout
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle="Context"
        rightOpen={effectiveRightOpen}
        onToggleRight={handleToggleRight}
        leftOpen={effectiveLeftOpen}
        onToggleLeft={handleToggleLeft}
        rightToggleLabel="Context"
        mainHeader={<PageTitle eyebrow="Mode" title="Library" subtitle="Reading room for your saved work." />}
        mainActions={(
          <div className="library-main-actions">
            <QuietButton onClick={() => handleToggleLeft(!effectiveLeftOpen)}>
              Cabinet
            </QuietButton>
            <QuietButton onClick={() => handleToggleRight(!effectiveRightOpen)}>
              Context
            </QuietButton>
          </div>
        )}
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
      <LibraryConceptModal
        open={conceptModal.open}
        highlight={conceptModal.highlight}
        onClose={() => setConceptModal({ open: false, highlight: null })}
        onSelect={handleAddConcept}
      />
      <LibraryNotebookModal
        open={notebookModal.open}
        highlight={notebookModal.highlight}
        onClose={() => setNotebookModal({ open: false, highlight: null })}
        onSend={handleSendToNotebook}
      />
      <LibraryQuestionModal
        open={questionModal.open}
        highlight={questionModal.highlight}
        onClose={() => setQuestionModal({ open: false, highlight: null })}
        onCreate={handleAddQuestion}
        onAttach={handleAttachQuestion}
      />
    </>
  );
};

export default Library;
