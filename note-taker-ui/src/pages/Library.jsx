import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import useTags from '../hooks/useTags';
import { getContextPanelOpen } from '../utils/readingMode';
import ThreePaneLayout from '../layout/ThreePaneLayout';
import LibraryConceptModal from '../components/library/LibraryConceptModal';
import LibraryNotebookModal from '../components/library/LibraryNotebookModal';
import LibraryQuestionModal from '../components/library/LibraryQuestionModal';
import ReferencePullIn from '../components/references/ReferencePullIn';
import { getConnectionsForItem } from '../api/connections';
import { createWorkingMemory } from '../api/workingMemory';
import { updateHighlight, deleteHighlight } from '../api/highlights';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { chatWithAgent } from '../api/agent';
import { startLibraryFilingSuggestions } from '../api/library';
import { useSystemStatusControls, useSystemStatusSnapshot } from '../system/SystemStatusContext';
import { normalizeSystemReceipt } from '../system/systemStatusModel';
import { AGENT_DISPLAY_NAME } from '../constants/agentIdentity';
import AgentPresence from '../components/agent/AgentPresence';
import AgentTicker from '../components/agent/AgentTicker';
import ThoughtPartnerPanel from '../components/agent/ThoughtPartnerPanel';
import AgentSkillDock from '../components/agent/AgentSkillDock';
import { EditorialSideRailCollapsible } from '../components/think/EditorialSideRail';
import { buildArticleAmbientContext } from '../utils/ambientAgentContext';
import { matchesCruftHeuristic, filterLibraryBrowseItems } from '../utils/cruftSuppression';

const RIGHT_STORAGE_KEY = 'workspace-right-open:/library';
const CONTEXT_OVERRIDE_KEY = 'library.context.override:/library';
const LEFT_STORAGE_KEY = 'workspace-left-open:/library';
const CABINET_OVERRIDE_KEY = 'library.cabinet.override:/library';

// Folder contract: GET `/folders` -> [{ _id, name, createdAt, updatedAt }].
// Articles reference folders via `article.folder` (populated Folder) or null for unfiled.

const Library = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = searchParams.get('scope') || 'all';
  const folderId = searchParams.get('folderId') || '';
  const requestedArticleId = searchParams.get('articleId') || '';
  const requestedHighlightId = searchParams.get('highlightId') || '';
  const shouldOpenReferencePullIn = searchParams.get('pull') === '1';
  const articleQuery = searchParams.get('aq') || '';
  const showSuppressedItems = searchParams.get('showSuppressed') === '1';
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
    if (stored === null) return false;
    return stored === 'true';
  });
  const [contextOverride, setContextOverride] = useState(() => (
    localStorage.getItem(CONTEXT_OVERRIDE_KEY) === 'true'
  ));
  const [cabinetOverride, setCabinetOverride] = useState(() => (
    localStorage.getItem(CABINET_OVERRIDE_KEY) === 'true'
  ));
  const [activeHighlightId, setActiveHighlightId] = useState('');
  const [articleGraphConnections, setArticleGraphConnections] = useState({ outgoing: [], incoming: [] });
  const [organizeLaunching, setOrganizeLaunching] = useState(false);
  const [filingLaunching, setFilingLaunching] = useState(false);
  const [filingReceipt, setFilingReceipt] = useState(null);
  const [queuedPrompt, setQueuedPrompt] = useState(null);
  const readerRef = useRef(null);
  const systemStatus = useSystemStatusControls();
  const systemStatusSnapshot = useSystemStatusSnapshot();

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
    query: articleQuery,
    sort: 'recent',
    includeSuppressed: showSuppressedItems
  });
  const { tags, loading: tagsLoading } = useTags();
  const {
    article: selectedArticle,
    highlights: articleHighlights,
    references,
    loading: articleLoading,
    error: articleError,
    addHighlightOptimistic,
    replaceHighlight,
    removeHighlight
  } = useArticleDetail(selectedArticleId, { enabled: Boolean(selectedArticleId) });

  const workingMemoryScope = useMemo(() => {
    if (selectedArticleId) {
      return { workspaceType: 'article', workspaceId: selectedArticleId };
    }
    return { workspaceType: 'library', workspaceId: '' };
  }, [selectedArticleId]);

  useEffect(() => {
    setSelectedArticleId('');
    setActiveHighlightId('');
  }, [scope, folderId]);

  useEffect(() => {
    if (!requestedArticleId) return;
    if (requestedArticleId === selectedArticleId) return;
    setSelectedArticleId(requestedArticleId);
    localStorage.setItem('library.lastArticleId', requestedArticleId);
  }, [requestedArticleId, selectedArticleId]);

  useEffect(() => {
    if (!selectedArticleId) return;
    if (window.navigator?.userAgent?.includes('jsdom')) return;
    window.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
  }, [selectedArticleId]);

  useEffect(() => {
    let cancelled = false;
    setArticleGraphConnections({ outgoing: [], incoming: [] });
    if (!selectedArticleId) return () => {
      cancelled = true;
    };

    getConnectionsForItem({ itemType: 'article', itemId: selectedArticleId })
      .then((connections) => {
        if (cancelled) return;
        setArticleGraphConnections({
          outgoing: Array.isArray(connections?.outgoing) ? connections.outgoing : [],
          incoming: Array.isArray(connections?.incoming) ? connections.incoming : []
        });
      })
      .catch(() => {
        if (!cancelled) setArticleGraphConnections({ outgoing: [], incoming: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedArticleId]);

  useEffect(() => {
    if (!requestedHighlightId || !selectedArticleId) return;
    setActiveHighlightId(requestedHighlightId);
    window.setTimeout(() => {
      readerRef.current?.scrollToHighlight(requestedHighlightId);
    }, 0);
  }, [requestedHighlightId, selectedArticleId, articleHighlights]);

  useEffect(() => {
    if (requestedArticleId) return;
    setSelectedArticleId('');
    setActiveHighlightId('');
  }, [requestedArticleId]);

  useEffect(() => {
    if (searchParams.get('scope')) return;
    const params = new URLSearchParams(searchParams);
    params.set('scope', 'all');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleSelectScope = useCallback((nextScope) => {
    const params = new URLSearchParams(searchParams);
    params.set('scope', nextScope);
    params.delete('folderId');
    params.delete('articleId');
    params.delete('highlightId');
    if (nextScope !== 'highlights') {
      params.delete('hq');
      params.delete('highlightView');
    } else if (!params.get('highlightView')) {
      params.set('highlightView', 'concept');
    }
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleReviewFiling = useCallback(async () => {
    if (filingLaunching) return;
    setFilingLaunching(true);
    setFilingReceipt(null);
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({ label: 'Filing the library', stage: 'Staging suggestions' });
    try {
      const result = await startLibraryFilingSuggestions();
      const receipt = result?.receipt && typeof result.receipt === 'object' ? result.receipt : null;
      if (receipt?.summary) {
        setFilingReceipt(receipt);
      }
      const nextThreadId = String(result?.thread?.threadId || result?.thread?._id || '').trim();
      const href = nextThreadId
        ? `/think?tab=threads&threadId=${encodeURIComponent(nextThreadId)}`
        : '/think?tab=threads';
      systemStatus.setLatestReceipt(normalizeSystemReceipt(receipt, { href }) || {
        title: 'Filing suggestions ready',
        summary: receipt?.summary || 'Review the staged plan in Think.',
        status: 'needs_review',
        href
      });
      navigate(href);
    } catch (error) {
      console.error('Failed to start library filing suggestions:', error);
      setFilingReceipt({
        stage: 'error',
        summary: 'Could not stage filing suggestions. Try again in a moment.'
      });
      systemStatus.setRecoverableFailure({
        stage: 'Library filing',
        message: 'Could not stage filing suggestions. Try again in a moment.',
        retryable: true,
        retry: () => { handleReviewFiling(); }
      });
    } finally {
      setFilingLaunching(false);
      systemStatus.setBackgroundWork(null);
    }
  }, [filingLaunching, navigate, systemStatus]);

  const handleToggleSuppressedItems = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (showSuppressedItems) {
      params.delete('showSuppressed');
    } else {
      params.set('showSuppressed', '1');
      params.set('scope', scope || 'all');
    }
    params.delete('articleId');
    params.delete('highlightId');
    setSearchParams(params);
  }, [scope, searchParams, setSearchParams, showSuppressedItems]);

  const handleArticleQueryChange = useCallback((value) => {
    const nextValue = String(value || '');
    const params = new URLSearchParams(searchParams);
    if (nextValue.trim()) {
      params.set('aq', nextValue);
      if (scope === 'highlights') {
        params.set('scope', 'all');
        params.delete('hq');
        params.delete('highlightView');
      }
    } else {
      params.delete('aq');
    }
    params.delete('articleId');
    params.delete('highlightId');
    setSearchParams(params);
  }, [scope, searchParams, setSearchParams]);

  const handleSelectFolder = useCallback((id) => {
    const params = new URLSearchParams(searchParams);
    params.set('scope', 'folder');
    params.set('folderId', id);
    params.delete('articleId');
    params.delete('highlightId');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleSelectArticle = useCallback((id) => {
    setSelectedArticleId(id);
    localStorage.setItem('library.lastArticleId', id);
    const params = new URLSearchParams(searchParams);
    if (id) {
      params.set('articleId', id);
    } else {
      params.delete('articleId');
    }
    params.delete('highlightId');
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);

  const handleSelectHighlightView = useCallback((view) => {
    const params = new URLSearchParams(searchParams);
    params.set('scope', 'highlights');
    params.set('highlightView', view);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const openMoveModal = useCallback((article) => {
    setArticleToMove(article);
    setMoveError('');
    setMoveModalOpen(true);
  }, []);

  const closeMoveModal = useCallback(() => {
    setMoveModalOpen(false);
    setArticleToMove(null);
    setMoving(false);
  }, []);

  const handleMoveArticle = useCallback(async (nextFolderId) => {
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
  }, [allArticles, articleToMove, closeMoveModal, folderId, folders, scope, selectedArticleId, setAllArticles]);

  const handleHighlightClick = useCallback((highlight) => {
    setActiveHighlightId(highlight._id);
    readerRef.current?.scrollToHighlight(highlight._id);
  }, []);

  const handleUpdateHighlight = useCallback(async (highlightId, payload) => {
    if (!selectedArticleId || !highlightId) return null;
    const updated = await updateHighlight({
      articleId: selectedArticleId,
      highlightId,
      payload
    });
    replaceHighlight(highlightId, updated);
    return updated;
  }, [replaceHighlight, selectedArticleId]);

  const handleDeleteHighlight = useCallback(async (highlight) => {
    if (!highlight?._id || !selectedArticleId) return;
    if (!window.confirm('Delete this highlight?')) return;
    await deleteHighlight({
      articleId: selectedArticleId,
      highlightId: highlight._id
    });
    removeHighlight(highlight._id);
    if (String(activeHighlightId) === String(highlight._id)) {
      setActiveHighlightId('');
    }
  }, [activeHighlightId, removeHighlight, selectedArticleId]);

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

  useEffect(() => {
    if (!shouldOpenReferencePullIn) return;
    if (selectedArticleId) {
      handleToggleRight(true);
    }
    const params = new URLSearchParams(searchParams);
    params.delete('pull');
    setSearchParams(params, { replace: true });
  }, [handleToggleRight, searchParams, selectedArticleId, setSearchParams, shouldOpenReferencePullIn]);

  const handleOrganizeLibrary = useCallback(async () => {
    if (organizeLaunching) return;
    setOrganizeLaunching(true);
    try {
      const result = await chatWithAgent({
        message: 'Clean up library structure and stage a reviewable organization plan.',
        persistThread: true,
        threadTitle: 'Library cleanup',
        context: {
          type: 'workspace',
          id: 'library',
          title: 'Library'
        }
      });
      const nextThreadId = String(result?.thread?.threadId || '').trim();
      navigate(nextThreadId
        ? `/think?tab=threads&threadId=${encodeURIComponent(nextThreadId)}`
        : '/think?tab=threads');
    } catch (error) {
      console.error('Failed to start library cleanup thread:', error);
    } finally {
      setOrganizeLaunching(false);
    }
  }, [navigate, organizeLaunching]);

  const createId = useCallback(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
  }, []);

  const handleAddConcept = useCallback(async (highlight, conceptName) => {
    await api.post(`/api/concepts/${encodeURIComponent(conceptName)}/add-highlight`, {
      highlightId: highlight._id
    }, getAuthHeaders());
    setConceptModal({ open: false, highlight: null });
  }, []);

  const handleAddQuestion = useCallback(async (highlight, conceptName, text) => {
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
  }, [createId]);

  const handleAttachQuestion = useCallback(async (highlight, questionId) => {
    await api.post(`/api/questions/${questionId}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setQuestionModal({ open: false, highlight: null });
  }, []);

  const handleSendToNotebook = useCallback(async (highlight, entryId) => {
    await api.post(`/api/notebook/${entryId}/append-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setNotebookModal({ open: false, highlight: null });
  }, []);

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
  const corpusTotal = useMemo(() => {
    if (showSuppressedItems) return allArticles.length;
    return filterLibraryBrowseItems(allArticles).length;
  }, [allArticles, showSuppressedItems]);
  const rawCorpusTotal = useMemo(() => allArticles.length, [allArticles.length]);
  const suppressedCount = useMemo(() => {
    if (showSuppressedItems) return 0;
    return Math.max(0, allArticles.length - filterLibraryBrowseItems(allArticles).length);
  }, [allArticles, showSuppressedItems]);
  const folderOptions = useMemo(() => {
    const options = [{ value: 'unfiled', label: 'Unfiled' }];
    folders.forEach(folder => {
      options.push({ value: folder._id, label: folder.name });
    });
    return options;
  }, [folders]);
  const visibleTags = useMemo(
    () => (Array.isArray(tags) ? tags : []).filter(tag => !matchesCruftHeuristic(tag?.tag || tag?.name)),
    [tags]
  );
  const articleOptions = useMemo(
    () => allArticles.map(article => ({ value: article._id, label: article.title || 'Untitled article' })),
    [allArticles]
  );

  const addWorkingMemoryItem = useCallback(async ({
    sourceType,
    sourceId,
    textSnippet
  }) => {
    const cleanText = String(textSnippet || '').trim();
    if (!cleanText) return;
    try {
      await createWorkingMemory({
        ...workingMemoryScope,
        sourceType,
        sourceId: String(sourceId || ''),
        textSnippet: cleanText
      });
    } catch (err) {
      console.error(err.response?.data?.error || 'Failed to dump to working memory.');
    }
  }, [workingMemoryScope]);

  const handleHighlightQueryChange = useCallback((value) => {
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
  }, [searchParams, setSearchParams]);

  const handleOpenConceptModal = useCallback((highlight) => {
    setConceptModal({ open: true, highlight });
  }, []);

  const handleOpenNotebookModal = useCallback((highlight) => {
    setNotebookModal({ open: true, highlight });
  }, []);

  const handleOpenQuestionModal = useCallback((highlight) => {
    setQuestionModal({ open: true, highlight });
  }, []);

  const buildFallbackDump = useCallback(() => {
    if (selectedArticle) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(selectedArticle.content || '', 'text/html');
      const excerpt = (doc.body?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400);
      return {
        sourceType: 'article',
        sourceId: selectedArticle._id,
        textSnippet: excerpt || selectedArticle.title || 'Article'
      };
    }
    return {
      sourceType: 'library',
      sourceId: 'library',
      textSnippet: 'Library working memory item'
    };
  }, [selectedArticle]);

  const handleDumpToWorkingMemory = useCallback(async (manualText = '') => {
    const selectedText = window.getSelection?.()?.toString()?.trim() || '';
    if (manualText) {
      const fallback = buildFallbackDump();
      await addWorkingMemoryItem({
        sourceType: fallback.sourceType,
        sourceId: fallback.sourceId,
        textSnippet: manualText
      });
      return;
    }
    if (selectedText) {
      const fallback = buildFallbackDump();
      await addWorkingMemoryItem({
        sourceType: `${fallback.sourceType}-selection`,
        sourceId: fallback.sourceId,
        textSnippet: selectedText
      });
      return;
    }
    await addWorkingMemoryItem(buildFallbackDump());
  }, [addWorkingMemoryItem, buildFallbackDump]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isDump = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'd';
      if (!isDump) return;
      event.preventDefault();
      handleDumpToWorkingMemory();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDumpToWorkingMemory]);

  const selectedFolderName = useMemo(() => {
    if (scope !== 'folder') return '';
    const folder = folders.find(item => item._id === folderId);
    return folder ? folder.name : '';
  }, [folders, folderId, scope]);

  const leftPanel = (
    <div className="section-stack">
      <SectionHeader title="Cabinet" subtitle="Your filing system." className="library-section-head is-articles" />
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
          data-tour-anchor="library-highlights-scope"
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
      <div className="library-saved-views">
        <SectionHeader title="Saved Views" subtitle="Optional shortcuts." />
        <Link className="library-saved-view-link" to="/views">Open Saved Views</Link>
        {!tagsLoading && visibleTags.length > 0 && (
          <div className="library-saved-view-tags">
            {visibleTags.slice(0, 6).map(tag => (
              <TagChip key={tag.tag} to={`/tags/${encodeURIComponent(tag.tag)}`}>{tag.tag}</TagChip>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const isReadingView = Boolean(selectedArticleId);
  const articleContextMetadata = useMemo(() => (
    buildArticleAmbientContext({
      article: selectedArticle,
      highlights: articleHighlights,
      graphConnections: articleGraphConnections,
      selectionText: ''
    })
  ), [articleGraphConnections, articleHighlights, selectedArticle]);
  const topThemeTags = useMemo(
    () => (Array.isArray(tags) ? tags.slice(0, 3).map((tag) => String(tag?.tag || '')).filter(Boolean) : []),
    [tags]
  );
  const articleHighlightCount = Array.isArray(articleHighlights) ? articleHighlights.length : 0;
  const articleReferenceCount = Array.isArray(references) ? references.length : 0;
  const libraryAgentTickerLines = useMemo(() => {
    if (isReadingView) {
      return [
        selectedArticle?.title ? `reading ${selectedArticle.title}` : 'reading selected source',
        `${articleHighlightCount} highlights available`,
        `${articleReferenceCount} source references in margin`
      ];
    }

    const shelfLabel = scope === 'folder' && selectedFolderName ? selectedFolderName : scope;
    return [
      `${allArticles.length} sources in library`,
      articleQuery
        ? `filtering articles for "${articleQuery}"`
        : highlightQuery
          ? `filtering highlights for "${highlightQuery}"`
          : `watching ${shelfLabel} shelf`,
      topThemeTags.length > 0 ? `themes: ${topThemeTags.join(', ')}` : 'waiting for highlights to reveal themes'
    ];
  }, [
    allArticles.length,
    articleQuery,
    articleHighlightCount,
    articleReferenceCount,
    highlightQuery,
    isReadingView,
    scope,
    selectedArticle?.title,
    selectedFolderName,
    topThemeTags
  ]);
  const libraryAgentPanel = (
    <section className="library-agent-card" aria-label="Library thought partner">
      <AgentPresence
        className="library-agent-card__presence"
        status={articleLoading || articlesLoading ? 'working' : 'idle'}
        title={AGENT_DISPLAY_NAME}
        subtitle={isReadingView ? 'Source context visible' : 'Library context visible'}
      />
      <AgentTicker
        className="library-agent-card__ticker"
        label={`${AGENT_DISPLAY_NAME} library trace`}
        state={articleLoading || articlesLoading ? 'working' : 'idle'}
        lines={libraryAgentTickerLines}
        sharedMemory
        surface="Library"
      />
      <p className="library-agent-card__note">
        {isReadingView
          ? 'Use the margin to pull this source into Wiki or Think with provenance intact.'
          : 'Open a source or pull highlights into Think; the agent keeps the active shelf, themes, and provenance in view.'}
      </p>
    </section>
  );
  const browseRailActions = useMemo(() => ([
    {
      label: 'Highlights',
      isActive: scope === 'highlights',
      onClick: () => handleSelectScope('highlights')
    },
    {
      label: 'Notebook',
      to: '/think?tab=notebook'
    },
    {
      label: 'Concepts',
      to: '/think?tab=concepts'
    },
    {
      label: 'Questions',
      to: '/think?tab=questions'
    }
  ]), [handleSelectScope, scope]);

  const effectiveRightOpen = getContextPanelOpen({
    hasSelection: Boolean(selectedArticleId),
    storedOpen: rightOpen,
    userOverride: contextOverride
  });
  const effectiveLeftOpen = isReadingView ? false : getContextPanelOpen({
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
      articleGraphConnections={articleGraphConnections}
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
      onOpenConcept={handleOpenConceptModal}
      onOpenNotebook={handleOpenNotebookModal}
      onOpenQuestion={handleOpenQuestionModal}
      onDumpToWorkingMemory={(highlight) => handleDumpToWorkingMemory(highlight?.text || '')}
      folderOptions={folderOptions}
      articleOptions={articleOptions}
      articleQuery={articleQuery}
      suppressedVisible={showSuppressedItems}
      externalQuery={highlightQuery}
      highlightView={highlightView}
      onArticleQueryChange={handleArticleQueryChange}
      onQueryChange={handleHighlightQueryChange}
      onDumpHighlight={(highlight) => handleDumpToWorkingMemory(highlight?.text || '')}
      allArticles={allArticles}
      unfiledCount={unfiledCount}
      onReviewFiling={handleReviewFiling}
      filingLaunching={filingLaunching}
      filingReceipt={filingReceipt}
      onToggleSuppressed={handleToggleSuppressedItems}
      corpusTotal={corpusTotal}
      rawCorpusTotal={rawCorpusTotal}
      suppressedCount={suppressedCount}
      latestReceipt={systemStatusSnapshot.latestReceipt}
    />
  );

  const rightPanel = isReadingView ? (
    <div className="editorial-side-rail section-stack library-context-stack library-context-stack--reading">
      <ThoughtPartnerPanel
        className="editorial-side-rail__partner library-reading-rail__partner"
        variant="stream"
        title={AGENT_DISPLAY_NAME}
        subtitle="Ask against the full article and your connected workspace."
        contextType="article"
        contextId={selectedArticleId}
        contextTitle={selectedArticle?.title || 'Article'}
        contextMetadata={articleContextMetadata}
        queuedPrompt={queuedPrompt}
        placeholder="Ask about this article, connected notes, or what to do next."
        promptTemplates={[
          'Summarize what matters most in this article.',
          'Challenge the strongest claim in this article.',
          'Find related concepts or notes for this article.'
        ]}
        showQuickPrompts={false}
        emptyStateText="Ask directly, or open Source context for article moves and provenance."
        submitLabel="↗"
      />
      <EditorialSideRailCollapsible
        title="Source context"
        subtitle="Highlights, pull-in, provenance, and article moves."
        className="library-reading-rail__secondary"
        testId="library-reading-secondary-rail"
      >
        <AgentSkillDock
          surface="article"
          contextType="article"
          contextId={selectedArticleId}
          targetContextType="article"
          targetContextId={selectedArticleId}
          contextTitle={selectedArticle?.title || 'Article'}
          headline="Draft-first article moves"
          title={AGENT_DISPLAY_NAME}
          subtitle="Turn the current article into a sharper summary, critique, question set, or concept lead."
          className="library-reading-rail__skills agent-skill-dock--inline"
          onInvoke={(nextPrompt) => setQueuedPrompt(nextPrompt)}
        />
        <ReferencePullIn
          targetType="article"
          targetId={selectedArticleId}
          targetTitle={selectedArticle?.title || 'Source'}
          className="library-context-stack__reference-pull-in"
        />
        <LibraryContext
          selectedArticleId={selectedArticleId}
          articleHighlights={articleHighlights}
          articleLoading={articleLoading}
          references={references}
          referencesLoading={articleLoading}
          referencesError={articleError}
          activeHighlightId={activeHighlightId}
          onHighlightClick={handleHighlightClick}
          onSelectHighlight={setActiveHighlightId}
          onAddConcept={handleOpenConceptModal}
          onAddNotebook={handleOpenNotebookModal}
          onAddQuestion={handleOpenQuestionModal}
          onUpdateHighlight={handleUpdateHighlight}
          onDeleteHighlight={handleDeleteHighlight}
          onDumpToWorkingMemory={(highlight) => handleDumpToWorkingMemory(highlight?.text || '')}
        />
      </EditorialSideRailCollapsible>
    </div>
  ) : (
    <div className="section-stack library-context-stack library-context-stack--browse">
      {libraryAgentPanel}
      <section className="library-browse-rail">
        <div className="library-browse-rail__header">
          <span>Marginalia</span>
          <p>Active reasoning</p>
        </div>

        <nav className="library-browse-rail__nav" aria-label="Library marginalia">
          {browseRailActions.map((item) => (
            item.to ? (
              <Link
                key={item.label}
                to={item.to}
                className="library-browse-rail__nav-item"
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                className={`library-browse-rail__nav-item ${item.isActive ? 'is-active' : ''}`}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            )
          ))}
        </nav>

        <div className="library-browse-rail__section">
          <div className="library-browse-rail__section-head">
            <h3>Current shelf</h3>
            <span>{scope === 'folder' && selectedFolderName ? selectedFolderName : scope}</span>
          </div>
          <p>
            Open a source from the reading room list. Cabinet stays available when you want filing or batch organization.
          </p>
        </div>

        <div className="library-browse-rail__section">
          <div className="library-browse-rail__section-head">
            <h3>Curated theme</h3>
            <span>{allArticles.length} sources</span>
          </div>
          <p>
            {topThemeTags.length > 0
              ? `Your library currently trends toward ${topThemeTags.join(', ')}.`
              : 'Tag a few highlights to let recurring themes emerge here.'}
          </p>
        </div>

        <div className="library-browse-rail__section">
          <div className="library-browse-rail__section-head">
            <h3>Next move</h3>
            <span>{selectedArticleId ? 'Reading room' : 'Browse mode'}</span>
          </div>
          <p>
            {selectedArticleId
              ? 'Stay in the reading room to capture highlights, send them into notebook, and attach them to concepts or questions.'
              : 'Use the quick links above to sort highlights, deepen a concept, or turn an open loop into a working question.'}
          </p>
        </div>
      </section>
    </div>
  );

  return (
    <div className={`library-page-shell ${isReadingView ? 'is-reading' : 'is-browse'}`}>
      <ThreePaneLayout
        className={`three-pane--editorial three-pane--library ${isReadingView ? 'three-pane--library-reading' : 'three-pane--library-browse'}`}
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle={AGENT_DISPLAY_NAME}
        rightOpen={effectiveRightOpen}
        onToggleRight={handleToggleRight}
        leftOpen={effectiveLeftOpen}
        onToggleLeft={handleToggleLeft}
        rightToggleLabel={AGENT_DISPLAY_NAME}
        mainHeader={isReadingView ? null : <PageTitle title="Library" subtitle="Reading room for your saved work." />}
        mainActions={isReadingView ? null : (
          <div className="library-main-actions">
            <QuietButton
              className="list-button"
              onClick={handleOrganizeLibrary}
              disabled={organizeLaunching}
            >
              {organizeLaunching ? 'Starting…' : 'Clean up structure'}
            </QuietButton>
            <QuietButton className="list-button" onClick={() => handleToggleLeft(!effectiveLeftOpen)}>
              Cabinet
            </QuietButton>
            <QuietButton className="list-button" onClick={() => handleToggleRight(!effectiveRightOpen)}>
              {AGENT_DISPLAY_NAME}
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
      {conceptModal.open && (
        <LibraryConceptModal
          open={conceptModal.open}
          highlight={conceptModal.highlight}
          onClose={() => setConceptModal({ open: false, highlight: null })}
          onSelect={handleAddConcept}
        />
      )}
      {notebookModal.open && (
        <LibraryNotebookModal
          open={notebookModal.open}
          highlight={notebookModal.highlight}
          onClose={() => setNotebookModal({ open: false, highlight: null })}
          onSend={handleSendToNotebook}
        />
      )}
      {questionModal.open && (
        <LibraryQuestionModal
          open={questionModal.open}
          highlight={questionModal.highlight}
          onClose={() => setQuestionModal({ open: false, highlight: null })}
          onCreate={handleAddQuestion}
          onAttach={handleAttachQuestion}
        />
      )}
    </div>
  );
};

export default Library;
