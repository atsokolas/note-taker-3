import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LibraryMain from '../components/library/LibraryMain';
import LibraryContext from '../components/library/LibraryContext';
import MoveToFolderModal from '../components/library/MoveToFolderModal';
import { moveArticleToFolder, setArticleEvergreen } from '../api/articles';
import { createQuestion } from '../api/questions';
import useFolders from '../hooks/useFolders';
import useLibraryArticles from '../hooks/useLibraryArticles';
import useArticleDetail from '../hooks/useArticleDetail';
import useLibraryRoom from '../hooks/useLibraryRoom';
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
import { EditorialSideRailCollapsible } from '../components/think/EditorialSideRail';
import { filterLibraryBrowseItems } from '../utils/cruftSuppression';
import { getLibrarySourceDetail } from '../api/libraryRelevance';
import { sourceRowKey } from '../components/library/librarySourceIdentity';
import { buildLibrarianSelectionPrompt, buildLibraryThinkHref } from '../utils/libraryThinkSeam';
import { librarySubject } from '../components/library/libraryColumnModel';
import { useAgentRail, useNoeisAgentSurface } from '../agent/AgentRailContext';
import { takeFirstPaint } from '../motion/columnMotion';
import LibraryColumn from '../components/library/LibraryColumn';
import LibraryShelfNav from '../components/library/LibraryShelfNav';
import '../styles/library-column.css';
import '../styles/reader-editorial.css';

const SOURCE_TYPES = new Set(['article', 'highlight', 'note']);

// Folder contract: GET `/folders` -> [{ _id, name, createdAt, updatedAt }].
// Articles reference folders via `article.folder` (populated Folder) or null for unfiled.

const clearBrowseSelectionParams = (params) => {
  params.delete('sourceType');
  params.delete('sourceId');
  params.delete('parentId');
  return params;
};

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
  const sourceView = ['recent', 'active', 'needs_review', 'unconnected']
    .includes(searchParams.get('sourceView'))
    ? searchParams.get('sourceView')
    : 'recent';
  const browseSourceType = SOURCE_TYPES.has(searchParams.get('sourceType'))
    ? searchParams.get('sourceType')
    : '';
  const browseSourceId = String(searchParams.get('sourceId') || '').trim();
  const browseParentId = String(searchParams.get('parentId') || '').trim();
  const selectedSourceKey = browseSourceType && browseSourceId
    ? sourceRowKey({
      type: browseSourceType,
      id: browseSourceId,
      parentId: browseParentId
    })
    : '';
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [articleToMove, setArticleToMove] = useState(null);
  const [moveError, setMoveError] = useState('');
  const [moving, setMoving] = useState(false);
  const [conceptModal, setConceptModal] = useState({ open: false, highlight: null });
  const [notebookModal, setNotebookModal] = useState({ open: false, highlight: null });
  const [questionModal, setQuestionModal] = useState({ open: false, highlight: null });
  const [activeHighlightId, setActiveHighlightId] = useState('');
  const [sourceContextOpen, setSourceContextOpen] = useState(Boolean(requestedHighlightId));
  const [articleGraphConnections, setArticleGraphConnections] = useState({ outgoing: [], incoming: [] });
  const [sourceDetailState, setSourceDetailState] = useState({
    source: null,
    loading: false,
    error: ''
  });
  const [organizeLaunching, setOrganizeLaunching] = useState(false);
  const [filingLaunching, setFilingLaunching] = useState(false);
  const [filingReceipt, setFilingReceipt] = useState(null);
  const readerRef = useRef(null);
  const systemStatus = useSystemStatusControls();
  const systemStatusSnapshot = useSystemStatusSnapshot();

  // The room projection belongs to Library, not merely its index. Keep it
  // alive while a source is open so shelves and counts do not disappear and
  // the legacy full-corpus loaders do not return behind the reader.
  const roomProjectionEnabled = scope === 'all';
  const libraryRoom = useLibraryRoom({
    view: sourceView,
    showSuppressed: showSuppressedItems,
    enabled: roomProjectionEnabled
  });
  const legacyFolders = useFolders({ enabled: !roomProjectionEnabled || Boolean(libraryRoom.error) });
  const folders = roomProjectionEnabled && !libraryRoom.error
    ? libraryRoom.folders
    : legacyFolders.folders;
  const foldersLoading = roomProjectionEnabled && !libraryRoom.error
    ? libraryRoom.loading
    : legacyFolders.loading;
  const foldersError = roomProjectionEnabled && !libraryRoom.error
    ? ''
    : legacyFolders.error;
  const {
    articles,
    allArticles,
    loading: articlesLoading,
    error: articlesError,
    resolved: articlesResolved,
    setAllArticles
  } = useLibraryArticles({
    scope,
    folderId,
    query: articleQuery,
    sort: 'recent',
    includeSuppressed: showSuppressedItems,
    enabled: !roomProjectionEnabled || Boolean(libraryRoom.error)
  });
  const {
    article: selectedArticle,
    highlights: articleHighlights,
    references,
    loading: articleLoading,
    error: articleError,
    errorKind: articleErrorKind,
    refresh: retryArticle,
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

  /* Changing shelf drops the source you were reading — except when the URL is
     still naming one. A link into an exact source arrives with both a scope and
     an articleId, and this effect ran after the scope settled and cleared the
     selection the other effect had just made, so the link opened the Library
     rather than the source it named. */
  useEffect(() => {
    if (requestedArticleId) return;
    setSelectedArticleId('');
    setActiveHighlightId('');
  }, [scope, folderId, requestedArticleId]);

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
    const detailArticleId = selectedArticleId
      || (browseSourceType === 'article' ? browseSourceId : '')
      || (browseSourceType === 'highlight' ? browseParentId : '');
    setSourceDetailState({
      source: null,
      loading: Boolean(detailArticleId),
      error: ''
    });
    if (!detailArticleId) return () => {
      cancelled = true;
    };

    getLibrarySourceDetail(detailArticleId)
      .then(source => {
        if (cancelled) return;
        setSourceDetailState({ source, loading: false, error: '' });
      })
      .catch(error => {
        if (cancelled) return;
        setSourceDetailState({
          source: null,
          loading: false,
          error: error?.response?.data?.error || 'Could not load source context.'
        });
      });

    return () => {
      cancelled = true;
    };
  }, [browseParentId, browseSourceId, browseSourceType, selectedArticleId]);

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
    setSourceContextOpen(true);
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
    clearBrowseSelectionParams(params);
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
    clearBrowseSelectionParams(params);
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
    clearBrowseSelectionParams(params);
    setSearchParams(params);
  }, [scope, searchParams, setSearchParams]);

  const handleSelectFolder = useCallback((id) => {
    const params = new URLSearchParams(searchParams);
    params.set('scope', 'folder');
    params.set('folderId', id);
    params.delete('articleId');
    params.delete('highlightId');
    clearBrowseSelectionParams(params);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleSelectArticle = useCallback((id, options = {}) => {
    const nextId = String(id || '').trim();
    const highlightId = String(options?.highlightId || '').trim();
    setSelectedArticleId(nextId);
    if (nextId) localStorage.setItem('library.lastArticleId', nextId);
    const params = new URLSearchParams(searchParams);
    if (nextId) {
      params.set('articleId', nextId);
    } else {
      params.delete('articleId');
    }
    if (highlightId) {
      params.set('highlightId', highlightId);
      setSourceContextOpen(true);
    } else {
      params.delete('highlightId');
    }
    clearBrowseSelectionParams(params);
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);

  const handleOpenSource = useCallback((source) => {
    const type = String(source?.type || 'article').trim();
    const id = String(source?.id || '').trim();
    const parentId = String(source?.parentId || '').trim();
    if (type === 'note' && id) {
      navigate(`/think?tab=notebook&entryId=${encodeURIComponent(id)}`);
      return;
    }
    if (type === 'highlight' && id && parentId) {
      handleSelectArticle(parentId, { highlightId: id });
      return;
    }
    if (id) handleSelectArticle(id);
  }, [handleSelectArticle, navigate]);


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

  useEffect(() => {
    if (!shouldOpenReferencePullIn) return;
    setSourceContextOpen(true);
    if (!selectedArticleId) return;
    const params = new URLSearchParams(searchParams);
    params.delete('pull');
    setSearchParams(params, { replace: true });
  }, [searchParams, selectedArticleId, setSearchParams, shouldOpenReferencePullIn]);

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
    const response = await api.post(`/api/concepts/${encodeURIComponent(conceptName)}/add-highlight`, {
      highlightId: highlight._id
    }, getAuthHeaders());
    setConceptModal({ open: false, highlight: null });
    navigate(buildLibraryThinkHref({
      type: 'concept',
      id: response?.data?._id,
      name: conceptName
    }));
  }, [navigate]);

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
    navigate(buildLibraryThinkHref({ type: 'question', id: created?._id }));
  }, [createId, navigate]);

  const handleAttachQuestion = useCallback(async (highlight, questionId) => {
    await api.post(`/api/questions/${questionId}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setQuestionModal({ open: false, highlight: null });
    navigate(buildLibraryThinkHref({ type: 'question', id: questionId }));
  }, [navigate]);

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

  const projectedShelfCounts = roomProjectionEnabled && !libraryRoom.error && !libraryRoom.loading
    ? libraryRoom.shelfCounts
    : null;
  const libraryTotalsReady = roomProjectionEnabled && !libraryRoom.error
    ? !libraryRoom.loading
    : articlesResolved;
  const unfiledCount = libraryTotalsReady
    ? projectedShelfCounts?.unfiledArticles ?? folderCounts.unfiled ?? 0
    : undefined;
  const corpusTotal = useMemo(() => {
    if (!libraryTotalsReady) return undefined;
    if (projectedShelfCounts) return projectedShelfCounts.articles || 0;
    if (showSuppressedItems) return allArticles.length;
    return filterLibraryBrowseItems(allArticles).length;
  }, [allArticles, libraryTotalsReady, projectedShelfCounts, showSuppressedItems]);
  const rawCorpusTotal = useMemo(() => {
    if (!libraryTotalsReady) return undefined;
    return projectedShelfCounts?.rawArticles ?? allArticles.length;
  }, [allArticles.length, libraryTotalsReady, projectedShelfCounts]);
  const suppressedCount = useMemo(() => {
    if (projectedShelfCounts) return projectedShelfCounts.suppressedArticles || 0;
    if (showSuppressedItems) return 0;
    return Math.max(0, allArticles.length - filterLibraryBrowseItems(allArticles).length);
  }, [allArticles, projectedShelfCounts, showSuppressedItems]);
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

  const retainHighlightInLibraryHistory = useCallback((highlight) => {
    const highlightId = String(highlight?._id || '').trim();
    if (!highlightId) return;
    const params = new URLSearchParams(searchParams);
    const articleId = String(selectedArticleId || highlight?.articleId || '').trim();
    if (articleId) params.set('articleId', articleId);
    params.set('highlightId', highlightId);
    setSearchParams(params, { replace: true });
    setActiveHighlightId(highlightId);
    setSourceContextOpen(true);
  }, [searchParams, selectedArticleId, setSearchParams]);

  const handleOpenConceptModal = useCallback((highlight) => {
    retainHighlightInLibraryHistory(highlight);
    setConceptModal({ open: true, highlight });
  }, [retainHighlightInLibraryHistory]);

  const handleOpenNotebookModal = useCallback((highlight) => {
    setNotebookModal({ open: true, highlight });
  }, []);

  const handleOpenQuestionModal = useCallback((highlight) => {
    retainHighlightInLibraryHistory(highlight);
    setQuestionModal({ open: true, highlight });
  }, [retainHighlightInLibraryHistory]);

  /* Asking about a passage goes to the rail — the one agent on this page.
     It used to open a second panel below the article with its own textarea, so
     selecting a sentence produced a fourth input on a screen that already had
     three, while the rail sat beside it saying it had nothing to retrieve. The
     rail already owns the durable conversation and receives the article's
     exact context from the active Library surface. */
  const { ask: askRail } = useAgentRail();

  /* Keeping a source for life. The reader owns this one — no agent sets it —
     and the reader's own list has to reflect it without a refetch, because the
     control settles the moment it is pressed. */
  const handleToggleEvergreen = useCallback(async (articleId, evergreen) => {
    const saved = await setArticleEvergreen(articleId, evergreen);
    const next = Boolean(saved?.evergreen ?? evergreen);
    setAllArticles(current => current.map(item => (
      String(item._id) === String(articleId) ? { ...item, evergreen: next, evergreenAt: saved?.evergreenAt ?? item.evergreenAt } : item
    )));
    libraryRoom.adjustShelfCount?.('keptArticles', next ? 1 : -1);
    libraryRoom.refresh?.();
    return saved;
  }, [libraryRoom, setAllArticles]);

  const handleAskLibrarian = useCallback((highlight) => {
    const prompt = buildLibrarianSelectionPrompt(highlight);
    if (!prompt) return;
    retainHighlightInLibraryHistory(highlight);
    askRail?.(prompt, { origin: 'Asked of this passage' });
  }, [askRail, retainHighlightInLibraryHistory]);

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


  const isReadingView = Boolean(selectedArticleId);
  const articleHighlightCount = Array.isArray(articleHighlights) ? articleHighlights.length : 0;
  const articleReferenceCount = (
    (Array.isArray(references?.notebookBlocks) ? references.notebookBlocks.length : 0)
    + (Array.isArray(references?.collections) ? references.collections.length : 0)
  );
  const exactBrowseSource = sourceDetailState.source?.source || sourceDetailState.source || null;
  const exactSourceTitle = String(selectedArticle?.title || exactBrowseSource?.title || '').trim();
  const exactSourceType = selectedArticleId ? 'article' : (browseSourceType || 'library_workspace');
  const exactSourceId = selectedArticleId || browseSourceId || 'library';

  /* The Library owns source identity; the persistent shell owns the room. A
     selected highlight or imported note must not collapse back to a generic
     Library context merely because it has not opened the full article reader. */
  const librarySurfaceDescriptor = {
    room: 'library',
    objectType: exactSourceType,
    objectId: exactSourceId,
    title: exactSourceTitle || 'Library',
    orientation: exactSourceId === 'library'
      ? 'Recover source material, its provenance, and the thinking it already supports.'
      : 'Inspect this exact source, where it came from, and where it can move next.'
  };

  /* The cabinet stopped being the face of the Library: the reading is what
     greets you, and the shelves are a faint list beside it. Folder, unfiled and
     highlight scopes still open the older cabinet views — behind the reading
     rather than in front of it. */
  /* Kept reads like the shelf, because it is the shelf — a narrower one. */
  const isKeptShelf = !isReadingView && scope === 'kept';
  const keptCount = useMemo(
    () => libraryTotalsReady
      ? projectedShelfCounts?.keptArticles
        ?? allArticles.filter(item => item?.evergreen).length
      : undefined,
    [allArticles, libraryTotalsReady, projectedShelfCounts]
  );
  const columnEntering = useMemo(() => takeFirstPaint('library-shelf'), []);
  const readingEntering = Boolean(selectedArticleId) || columnEntering;

  /* One persistent agent, narrowed to the same exact source as the room. The
     page no longer mounts a second Librarian identity beside it. */
  useNoeisAgentSurface(
    'agent-surface.library',
    librarySurfaceDescriptor,
    {
      subject: librarySubject({
        article: exactSourceId !== 'library' ? { title: exactSourceTitle } : null,
        count: corpusTotal
      }),
      lines: exactSourceId === 'library'
        ? []
        : [
          articleHighlightCount
            ? { id: 'highlights', text: `${articleHighlightCount} saved highlight${articleHighlightCount === 1 ? '' : 's'}.` }
            : null,
          articleReferenceCount
            ? { id: 'references', text: `Used in ${articleReferenceCount} note${articleReferenceCount === 1 ? '' : 's'} or collection${articleReferenceCount === 1 ? '' : 's'}.` }
            : null
        ].filter(Boolean),
      empty: corpusTotal == null
        ? 'Reading your shelf…'
        : corpusTotal
          ? 'Nothing to retrieve until you ask.'
          : 'Nothing on the shelf to retrieve from yet.'
    },
    {
      // Accepting keeps the line where the human's loose material already goes.
      // Dismissing leaves nothing behind, which is the point.
      onAccept: (proposal) => handleDumpToWorkingMemory(proposal.body)
    }
  );


  const mainPanel = (
    <LibraryMain
      selectedArticleId={selectedArticleId}
      selectedArticle={selectedArticle}
      articleHighlights={articleHighlights}
      articleGraphConnections={articleGraphConnections}
      articleLoading={articleLoading}
      articleError={articleError}
      articleErrorKind={articleErrorKind}
      articles={articles}
      articlesLoading={articlesLoading}
      articlesError={articlesError}
      scope={scope}
      selectedFolderName={selectedFolderName}
      readerRef={readerRef}
      onSelectArticle={handleSelectArticle}
      onRetryArticle={retryArticle}
      onOpenSource={handleOpenSource}
      onMoveArticle={openMoveModal}
      onHighlightOptimistic={addHighlightOptimistic}
      onHighlightReplace={replaceHighlight}
      onHighlightRemove={removeHighlight}
      onOpenConcept={handleOpenConceptModal}
      onOpenQuestion={handleOpenQuestionModal}
      onAskLibrarian={handleAskLibrarian}
      onToggleEvergreen={handleToggleEvergreen}
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
      sourceView={sourceView}
      selectedSourceKey={selectedSourceKey}
      sourceDetail={sourceDetailState.source}
      sourceDetailLoading={sourceDetailState.loading}
      sourceDetailError={sourceDetailState.error}
      relevanceState={roomProjectionEnabled ? libraryRoom : null}
    />
  );

  const readingContext = isReadingView && selectedArticle ? (
    <div className="section-stack library-context-stack library-context-stack--reading">
      {/* This is source work, not another agent. The persistent shell rail is
          the only place that asks and proposes; this fold keeps the exact
          highlights, references, and connection actions with the article. */}
      <EditorialSideRailCollapsible
        title="Continue with this source"
        className="library-reading-rail__secondary"
        testId="library-reading-secondary-rail"
        defaultOpen={sourceContextOpen || Boolean(activeHighlightId)}
      >
        <ReferencePullIn
          targetType="article"
          targetId={selectedArticleId}
          targetTitle={selectedArticle?.title || 'Source'}
          mode="reference-source"
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
  ) : null;

  return (
    <div className={`library-page-shell ${isReadingView ? 'is-reading' : 'is-browse'}`}>
      {/* The shelves, down the left. The locked middle is the reading and the
          list, so the filing system is not in it — but it still has to be
          somewhere, and a list of names beside the reading is where it goes.
          Highlights is a shelf like any other; choosing it puts you in your
          highlights with the same folders alongside. */}
      <LibraryShelfNav
        count={corpusTotal}
        folders={folders}
        folderCounts={folderCounts}
        foldersLoading={foldersLoading}
        foldersError={foldersError}
        scope={scope}
        folderId={folderId}
        unfiledCount={unfiledCount}
        keptCount={keptCount}
        query={articleQuery}
        onQueryChange={handleArticleQueryChange}
        onSelectScope={handleSelectScope}
        onSelectFolder={handleSelectFolder}
        onReviewFiling={handleReviewFiling}
        filingLaunching={filingLaunching}
        className={columnEntering ? 'wfp-anim wfp-anim--1' : ''}
      />
      <div className="library-page-shell__column">
        <div className="library-page-shell__column-head">
          {isReadingView ? (
            <button type="button" className="library-reader__back" onClick={() => handleSelectArticle('')}>
              ← All sources
            </button>
          ) : <span />}
          <span className="library-page-shell__doors">
            {/* Filing already lives in the shelf. The less-frequent cleanup
                controls stay available without sitting above every source. */}
            {!isReadingView ? (
              <details className="library-page-shell__tools">
                <summary>Library actions</summary>
                <div>
                  <button type="button" onClick={handleOrganizeLibrary} disabled={organizeLaunching}>
                    {organizeLaunching ? 'Starting' : 'Clean up structure'}
                  </button>
                  <button type="button" onClick={handleToggleSuppressedItems}>
                    {showSuppressedItems ? 'Hide review imports' : 'Show review imports'}
                  </button>
                </div>
              </details>
            ) : null}
          </span>
        </div>
        {/* The locked middle: the reading you were in, then the sources as a
            list of title, source and date. LibraryMain still renders every
            other scope — folders, unfiled, highlights — because those are its
            own views and the lock does not redraw them. */}
        <div
          className={`library-reader ${readingEntering ? 'wfp-anim wfp-anim--1' : ''} ${isKeptShelf ? 'is-shelf' : ''}`}
          data-testid="library-main"
        >
          {isKeptShelf ? (
            <LibraryColumn
              shelf="kept"
              articles={articles}
              allArticles={allArticles}
              loading={articlesLoading}
              error={articlesError}
              query={articleQuery}
              onQueryChange={handleArticleQueryChange}
              onSelectArticle={handleSelectArticle}
              entering={columnEntering}
            />
          ) : (
            <>
              {mainPanel}
              {readingContext}
            </>
          )}
        </div>
      </div>
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
