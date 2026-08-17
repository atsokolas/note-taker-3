import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TagChip } from '../components/ui';
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
import AgentPresence from '../components/agent/AgentPresence';
import AgentTicker from '../components/agent/AgentTicker';
import ThoughtPartnerPanel from '../components/agent/ThoughtPartnerPanel';
import AgentContextShell from '../components/agent/AgentContextShell';
import AgentSkillDock from '../components/agent/AgentSkillDock';
import { EditorialSideRailCollapsible } from '../components/think/EditorialSideRail';
import { buildArticleAmbientContext } from '../utils/ambientAgentContext';
import { matchesCruftHeuristic, filterLibraryBrowseItems } from '../utils/cruftSuppression';
import { getLibrarySourceDetail } from '../api/libraryRelevance';
import { sourceRowKey } from '../components/library/librarySourceIdentity';
import { buildLibrarianSelectionPrompt, buildLibraryThinkHref } from '../utils/libraryThinkSeam';
import { librarySubject } from '../components/library/libraryColumnModel';
import { useAgentRailSurface } from '../agent/AgentRailContext';
import { takeFirstPaint } from '../motion/columnMotion';
import { oneSentence } from './judgmentModel';
import LibraryColumn from '../components/library/LibraryColumn';
import LibraryShelfNav from '../components/library/LibraryShelfNav';
import '../styles/library-room.css';
import '../styles/library-column.css';
import '../styles/reader-editorial.css';

const RIGHT_STORAGE_KEY = 'workspace-right-open:/library';
const CONTEXT_OVERRIDE_KEY = 'library.context.override:/library';
const SOURCE_TYPES = new Set(['article', 'highlight', 'note']);
const LIBRARY_AGENT_TITLE = 'Librarian';

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
  /* The Librarian is folded now: it opens from a word rather than holding a
     pane open before anyone asks. Someone who opened it before still finds it
     open — the stored preference is honoured — but the first visit is one
     agent, which is the rail. */
  const [rightOpen, setRightOpen] = useState(() => {
    if (requestedHighlightId) return true;
    const stored = localStorage.getItem(RIGHT_STORAGE_KEY);
    if (stored === null) return false;
    return stored === 'true';
  });
  /* A URL that names an exact highlight is asking to see that highlight, and
     source context is where it is shown. Without counting that as an override,
     getContextPanelOpen forces the panel shut the moment the source is
     selected — so the link opened the source and hid the thing it named. */
  const [contextOverride, setContextOverride] = useState(() => (
    Boolean(requestedHighlightId) || localStorage.getItem(CONTEXT_OVERRIDE_KEY) === 'true'
  ));
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
  const [queuedPrompt, setQueuedPrompt] = useState(null);
  const [librarianSelection, setLibrarianSelection] = useState(null);
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

  const handleSourceViewChange = useCallback((nextView) => {
    const params = new URLSearchParams(searchParams);
    if (nextView === 'recent') {
      params.delete('sourceView');
    } else {
      params.set('sourceView', nextView);
    }
    params.delete('articleId');
    params.delete('highlightId');
    clearBrowseSelectionParams(params);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

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

  const handleSelectSource = useCallback((source) => {
    const type = String(source?.type || 'article').trim();
    const id = String(source?.id || '').trim();
    const parentId = String(source?.parentId || '').trim();
    if (!SOURCE_TYPES.has(type) || !id) return;
    const params = new URLSearchParams(searchParams);
    params.set('scope', 'all');
    params.set('sourceType', type);
    params.set('sourceId', id);
    if (type === 'highlight' && parentId) {
      params.set('parentId', parentId);
    } else {
      params.delete('parentId');
    }
    params.delete('articleId');
    params.delete('highlightId');
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

  const handleToggleRight = useCallback((nextOpen) => {
    /* Opening the Librarian is a decision, and it outlives the next click.
       getContextPanelOpen forces the panel shut whenever a source is selected
       and no override is on record — so recording the override only when a
       source was *already* selected meant opening the Librarian and then
       opening a source silently closed it again, with nothing to say why. An
       explicit open is an override whenever it happens. */
    if (!contextOverride) {
      setContextOverride(true);
      localStorage.setItem(CONTEXT_OVERRIDE_KEY, 'true');
    }
    setRightOpen(nextOpen);
    localStorage.setItem(RIGHT_STORAGE_KEY, String(nextOpen));
  }, [contextOverride]);


  useEffect(() => {
    if (!shouldOpenReferencePullIn) return;
    handleToggleRight(true);
    if (!selectedArticleId) return;
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

  const unfiledCount = folderCounts.unfiled || 0;
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

  const handleAskLibrarian = useCallback((highlight) => {
    const prompt = buildLibrarianSelectionPrompt(highlight);
    if (!prompt) return;
    retainHighlightInLibraryHistory(highlight);
    setLibrarianSelection(highlight);
    handleToggleRight(true);
    setQueuedPrompt({
      id: `library-selection-${highlight._id}-${Date.now()}`,
      mode: 'draft',
      contextType: 'article',
      contextId: selectedArticleId || highlight?.articleId || '',
      prompt
    });
  }, [handleToggleRight, retainHighlightInLibraryHistory, selectedArticleId]);

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


  const sourceIndexFolders = (
    <div className="library-source-index-folders" data-testid="library-source-index-folders">
      {foldersLoading ? <p className="muted small">Loading folders…</p> : null}
      {foldersError ? <p className="status-message error-message">{foldersError}</p> : null}
      {!foldersLoading && !foldersError ? (
        <FolderTree
          folders={folders}
          counts={folderCounts}
          selectedFolderId={folderId}
          onSelectFolder={handleSelectFolder}
        />
      ) : null}
      <Link className="library-source-index-folders__saved" to="/views">Saved views</Link>
      {!tagsLoading && visibleTags.length > 0 ? (
        <div className="library-source-index-folders__tags">
          {visibleTags.slice(0, 6).map(tag => (
            <TagChip key={tag.tag} to={`/tags/${encodeURIComponent(tag.tag)}`}>{tag.tag}</TagChip>
          ))}
        </div>
      ) : null}
    </div>
  );

  const isReadingView = Boolean(selectedArticleId);
  const articleContextMetadata = useMemo(() => (
    buildArticleAmbientContext({
      article: selectedArticle,
      highlights: articleHighlights,
      graphConnections: articleGraphConnections,
      selectionText: librarianSelection?.text || ''
    })
  ), [articleGraphConnections, articleHighlights, librarianSelection?.text, selectedArticle]);
  const topThemeTags = useMemo(
    () => (Array.isArray(tags) ? tags.slice(0, 3).map((tag) => String(tag?.tag || '')).filter(Boolean) : []),
    [tags]
  );
  const articleHighlightCount = Array.isArray(articleHighlights) ? articleHighlights.length : 0;
  const articleReferenceCount = (
    (Array.isArray(references?.notebookBlocks) ? references.notebookBlocks.length : 0)
    + (Array.isArray(references?.collections) ? references.collections.length : 0)
  );
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
        title={LIBRARY_AGENT_TITLE}
        subtitle={isReadingView ? 'Source context visible' : 'Library context visible'}
      />
      <AgentTicker
        className="library-agent-card__ticker"
        label={`${LIBRARY_AGENT_TITLE} library trace`}
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

  const effectiveRightOpen = isReadingView && !contextOverride
    ? true
    : getContextPanelOpen({
      hasSelection: Boolean(selectedArticleId),
      storedOpen: rightOpen,
      userOverride: contextOverride
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

  /* The cabinet stopped being the face of the Library: the reading is what
     greets you, and the shelves are a faint list beside it. Folder, unfiled and
     highlight scopes still open the older cabinet views — behind the reading
     rather than in front of it. */
  const isShelfView = !isReadingView && scope === 'all';
  const columnEntering = useMemo(() => takeFirstPaint('library-shelf'), []);
  const readingEntering = Boolean(selectedArticleId) || columnEntering;

  /* What the rail is looking at while the human is in here, and how it
     retrieves on this page's behalf. Reading a source narrows it to that
     source. The Librarian panel is still here and still does more; this is the
     one line of retrieval that every room in the product shares. */
  useAgentRailSurface(
    {
      id: selectedArticleId ? `library:${selectedArticleId}` : 'library',
      subject: librarySubject({
        article: selectedArticleId ? selectedArticle : null,
        count: allArticles.length
      }),
      empty: allArticles.length
        ? 'Nothing to retrieve until you ask.'
        : 'Nothing on the shelf to retrieve from yet.'
    },
    {
      onAsk: async (question) => {
        const result = await chatWithAgent({
          message: question,
          context: selectedArticleId
            ? { type: 'article', id: selectedArticleId, title: selectedArticle?.title || 'Article' }
            : { type: 'workspace', id: 'library', title: 'Library' }
        });
        const sentence = oneSentence(String(result?.reply || result?.message || result?.answer || ''));
        if (!sentence) return null;
        return {
          id: `library-ask:${sentence.slice(0, 32)}`,
          sentence,
          body: sentence,
          origin: selectedArticleId ? 'Asked of this source' : 'Asked of the library',
          // There is no claim contract to write into here, so there is one
          // decision to make: keep the line or let it go.
          fields: ['keep']
        };
      },
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
      articles={articles}
      articlesLoading={articlesLoading}
      articlesError={articlesError}
      scope={scope}
      selectedFolderName={selectedFolderName}
      readerRef={readerRef}
      onSelectArticle={handleSelectArticle}
      onSelectSource={handleSelectSource}
      onOpenSource={handleOpenSource}
      onSelectScope={handleSelectScope}
      onMoveArticle={openMoveModal}
      onHighlightOptimistic={addHighlightOptimistic}
      onHighlightReplace={replaceHighlight}
      onHighlightRemove={removeHighlight}
      onOpenConcept={handleOpenConceptModal}
      onOpenQuestion={handleOpenQuestionModal}
      onAskLibrarian={handleAskLibrarian}
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
      shelfNavigation={sourceIndexFolders}
      onReviewFiling={handleReviewFiling}
      filingLaunching={filingLaunching}
      filingReceipt={filingReceipt}
      onToggleSuppressed={handleToggleSuppressedItems}
      corpusTotal={corpusTotal}
      rawCorpusTotal={rawCorpusTotal}
      suppressedCount={suppressedCount}
      latestReceipt={systemStatusSnapshot.latestReceipt}
      sourceView={sourceView}
      onSourceViewChange={handleSourceViewChange}
      selectedSourceKey={selectedSourceKey}
      sourceDetail={sourceDetailState.source}
      sourceDetailLoading={sourceDetailState.loading}
      sourceDetailError={sourceDetailState.error}
    />
  );

  const rightPanel = isReadingView ? (
    <div className="editorial-side-rail section-stack library-context-stack library-context-stack--reading">
      <ThoughtPartnerPanel
        className="editorial-side-rail__partner library-reading-rail__partner"
        variant="stream"
        title={LIBRARY_AGENT_TITLE}
        subtitle="Ask against this source and everything your Library already knows."
        contextType="article"
        contextId={selectedArticleId}
        contextTitle={selectedArticle?.title || 'Article'}
        contextMetadata={articleContextMetadata}
        queuedPrompt={queuedPrompt}
        placeholder="Ask about this source or find something related in your Library."
        promptTemplates={[
          'Summarize what matters most in this article.',
          'Challenge the strongest claim in this article.',
          'Find related concepts or notes for this article.'
        ]}
        showQuickPrompts={false}
        emptyStateText="Ask directly, or select a passage to carry its exact source into the question."
        submitLabel="↗"
      />
      {librarianSelection?.text ? (
        <section className="library-librarian-selection" aria-label="Selected passage for Librarian">
          <div>
            <span>In the margin</span>
            <button type="button" onClick={() => setLibrarianSelection(null)}>Clear</button>
          </div>
          <blockquote>{librarianSelection.text}</blockquote>
          <p>Saved as a highlight. Its source travels with the question.</p>
        </section>
      ) : null}
      <EditorialSideRailCollapsible
        title="Source context"
        subtitle="Highlights, pull-in, provenance, and article moves."
        className="library-reading-rail__secondary"
        testId="library-reading-secondary-rail"
        defaultOpen={sourceContextOpen || Boolean(activeHighlightId)}
      >
        <AgentSkillDock
          surface="article"
          contextType="article"
          contextId={selectedArticleId}
          targetContextType="article"
          targetContextId={selectedArticleId}
          contextTitle={selectedArticle?.title || 'Article'}
          headline="Draft-first article moves"
          title={LIBRARY_AGENT_TITLE}
          subtitle="Turn the current article into a sharper summary, critique, question set, or concept lead."
          className="library-reading-rail__skills agent-skill-dock--inline"
          onInvoke={(nextPrompt) => setQueuedPrompt(nextPrompt)}
        />
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
  const contextualRightPanel = (
    <AgentContextShell
      surface="library"
      title={LIBRARY_AGENT_TITLE}
      orientation={isReadingView
        ? `Reading ${selectedArticle?.title || 'the selected source'} with provenance intact.`
        : `Browsing ${scope === 'folder' && selectedFolderName ? selectedFolderName : scope} source memory.`}
      loading={Boolean(articleLoading || articlesLoading)}
      loadingMessage="Retrieving Library context…"
      error={isReadingView ? articleError : articlesError}
      showPresence={false}
    >
      {rightPanel}
    </AgentContextShell>
  );

  return (
    <div className={`library-page-shell ${isReadingView ? 'is-reading' : 'is-browse'}`}>
      {/* The shelves, down the left. The locked middle is the reading and the
          list, so the filing system is not in it — but it still has to be
          somewhere, and a list of names beside the reading is where it goes.
          Highlights is a shelf like any other; choosing it puts you in your
          highlights with the same folders alongside. */}
      <LibraryShelfNav
        folders={folders}
        scope={scope}
        folderId={folderId}
        unfiledCount={unfiledCount}
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
            {/* The reading-room lead used to carry filing and review inside
                the column. The locked middle is the reading and the list, so
                the two verbs move up here with the other doors rather than
                being lost — still one click, just not in the way. */}
            {!isReadingView ? (
              <>
                <button type="button" onClick={handleOrganizeLibrary} disabled={organizeLaunching}>
                  {organizeLaunching ? 'Starting' : 'Clean up structure'}
                </button>
                <button type="button" onClick={handleReviewFiling} disabled={filingLaunching}>
                  {filingLaunching ? 'Starting' : 'Review filing suggestions'}
                </button>
                <button type="button" onClick={handleToggleSuppressedItems}>
                  {showSuppressedItems ? 'Hide review imports' : 'Show review imports'}
                </button>
              </>
            ) : null}
            <button type="button" onClick={() => handleToggleRight(!effectiveRightOpen)}>
              {LIBRARY_AGENT_TITLE}
            </button>
          </span>
        </div>
        {/* The locked middle: the reading you were in, then the sources as a
            list of title, source and date. LibraryMain still renders every
            other scope — folders, unfiled, highlights — because those are its
            own views and the lock does not redraw them. */}
        <div
          className={`library-reader ${readingEntering ? 'wfp-anim wfp-anim--1' : ''} ${isShelfView ? 'is-shelf' : ''}`}
          data-testid="library-main"
        >
          {isShelfView ? (
            <LibraryColumn
              articles={articles}
              allArticles={allArticles}
              loading={articlesLoading}
              error={articlesError}
              query={articleQuery}
              onQueryChange={handleArticleQueryChange}
              onSelectArticle={handleSelectArticle}
              entering={columnEntering}
            />
          ) : mainPanel}
        </div>
      </div>
      {/* The Librarian, when it is asked for — the same fold whether you are
          browsing the shelf or reading a source. Arriving on an exact highlight
          opens it, because that link is a request to see that highlight. */}
      {effectiveRightOpen ? (
        <aside
          className="library-page-shell__librarian"
          aria-label={LIBRARY_AGENT_TITLE}
          data-testid="library-right"
          data-open="true"
        >
          <div className="library-page-shell__librarian-head">
            <span>{LIBRARY_AGENT_TITLE}</span>
            <button type="button" onClick={() => handleToggleRight(false)}>Close</button>
          </div>
          {contextualRightPanel}
        </aside>
      ) : null}
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
