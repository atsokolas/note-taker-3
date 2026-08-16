import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LibraryMain from '../components/library/LibraryMain';
import LibraryColumn from '../components/library/LibraryColumn';
import LibraryShelfNav from '../components/library/LibraryShelfNav';
import { librarySubject } from '../components/library/libraryColumnModel';
import LibraryContext from '../components/library/LibraryContext';
import MoveToFolderModal from '../components/library/MoveToFolderModal';
import { moveArticleToFolder } from '../api/articles';
import { createQuestion } from '../api/questions';
import useFolders from '../hooks/useFolders';
import useLibraryArticles from '../hooks/useLibraryArticles';
import useArticleDetail from '../hooks/useArticleDetail';
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
import { EditorialSideRailCollapsible } from '../components/think/EditorialSideRail';
import { filterLibraryBrowseItems } from '../utils/cruftSuppression';
import { useAgentRailSurface } from '../agent/AgentRailContext';
import { takeFirstPaint } from '../motion/columnMotion';
import { oneSentence } from './judgmentModel';
import '../styles/library-column.css';
import '../styles/reader-editorial.css';

const RIGHT_STORAGE_KEY = 'workspace-right-open:/library';
const CONTEXT_OVERRIDE_KEY = 'library.context.override:/library';

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
  const [contextOverride, setContextOverride] = useState(() => (
    localStorage.getItem(CONTEXT_OVERRIDE_KEY) === 'true'
  ));
  const [activeHighlightId, setActiveHighlightId] = useState('');
  const [articleGraphConnections, setArticleGraphConnections] = useState({ outgoing: [], incoming: [] });
  const [filingLaunching, setFilingLaunching] = useState(false);
  const [filingReceipt, setFilingReceipt] = useState(null);
  const readerRef = useRef(null);
  const systemStatus = useSystemStatusControls();
  const systemStatusSnapshot = useSystemStatusSnapshot();

  const { folders } = useFolders();
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

  // Changing shelf clears the open source — but only when the human actually
  // changed shelf. On the first render this used to run before anything was
  // selected, which is what made a bare /library always land on the list.
  const shelfKey = `${scope}:${folderId}`;
  const lastShelfKey = useRef(shelfKey);
  useEffect(() => {
    if (lastShelfKey.current === shelfKey) return;
    lastShelfKey.current = shelfKey;
    setSelectedArticleId('');
    setActiveHighlightId('');
  }, [shelfKey]);

  useEffect(() => {
    if (!requestedArticleId) return;
    if (requestedArticleId === selectedArticleId) return;
    setSelectedArticleId(requestedArticleId);
    localStorage.setItem('library.lastArticleId', requestedArticleId);
  }, [requestedArticleId, selectedArticleId]);

  /* Returning to the Library returns you to what you were reading. The last
     article has always been written down; nothing ever read it back, so every
     return dropped the human on the shelf they had already walked past. This
     runs once, and only for a bare /library — an explicit ?articleId, a folder,
     or a search is a request for something else. */
  const restoredLastArticle = useRef(false);
  useEffect(() => {
    if (restoredLastArticle.current) return;
    restoredLastArticle.current = true;
    if (requestedArticleId || selectedArticleId) return;
    if (scope !== 'all' || folderId || articleQuery) return;
    const lastArticleId = localStorage.getItem('library.lastArticleId');
    if (!lastArticleId) return;
    setSelectedArticleId(lastArticleId);
    const params = new URLSearchParams(searchParams);
    params.set('articleId', lastArticleId);
    setSearchParams(params, { replace: true });
  }, [articleQuery, folderId, requestedArticleId, scope, searchParams, selectedArticleId, setSearchParams]);

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

  const handleSelectFolder = useCallback((id) => {
    const params = new URLSearchParams(searchParams);
    params.set('scope', 'folder');
    params.set('folderId', id);
    params.delete('articleId');
    params.delete('highlightId');
    params.delete('hq');
    params.delete('highlightView');
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

  useEffect(() => {
    if (!shouldOpenReferencePullIn) return;
    if (selectedArticleId) {
      handleToggleRight(true);
    }
    const params = new URLSearchParams(searchParams);
    params.delete('pull');
    setSearchParams(params, { replace: true });
  }, [handleToggleRight, searchParams, selectedArticleId, setSearchParams, shouldOpenReferencePullIn]);

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

  // The cabinet is no longer the face of the Library. Folder and highlight
  // scopes still render through LibraryMain when a URL asks for them; the
  // reading is what greets you.

  const isReadingView = Boolean(selectedArticleId);
  const effectiveRightOpen = getContextPanelOpen({
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

  // The shelf is the default face: everything you have, with one thing to
  // continue. Folder, unfiled, and highlight scopes still open the cabinet
  // views, but behind the reading rather than in front of it.
  const isShelfView = !isReadingView && scope === 'all';
  const columnEntering = useMemo(() => takeFirstPaint('library-shelf'), []);
  const readerEntering = Boolean(selectedArticleId);

  /* What the rail is looking at while the human is in here, and how it retrieves
     on this page's behalf. Reading a source narrows it to that source. */
  useAgentRailSurface(
    {
      id: selectedArticleId ? `library:${selectedArticleId}` : 'library',
      subject: librarySubject({
        article: selectedArticleId ? selectedArticle : null,
        count: allArticles.length
      }),
      empty: selectedArticleId
        ? 'Nothing to retrieve until you ask.'
        : allArticles.length
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
      // Accepting keeps the line where the human's loose material already
      // goes. Dismissing leaves nothing behind, which is the point.
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

  // The agent used to be a third pane here — a thought-partner column that
  // arrived and left with this page. It lives in the shell's rail now, so it
  // survives the column changing and does not need to be rebuilt per surface.
  //
  // Its neighbour in that pane was the source's own marginalia: the highlights,
  // with the only controls in the app for editing and deleting them. That is
  // not agent work, so it stays with the reading — under the article, in the
  // column, behind one disclosure rather than a second rail.
  const sourceMarginalia = isReadingView ? (
    <EditorialSideRailCollapsible
      title="Marginalia"
      subtitle="Your highlights on this source, and where they went."
      className="library-reader__marginalia"
      testId="library-reading-secondary-rail"
    >
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
  ) : null;

  const shelfNav = (
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
  );

  return (
    <div className={`library-page-shell ${isReadingView ? 'is-reading' : 'is-browse'}`}>
      {/* The cabinet is a faint list of shelf names beside the reading — the
          same shape as the note shelf in Think — not a filing system you open
          before you can read. The agent is the shell's rail, not a third pane. */}
      {shelfNav}
      <div className="library-page-shell__column">
        {isReadingView ? (
          <div className={`library-reader ${readerEntering ? 'wfp-anim wfp-anim--1' : ''}`}>
            <button type="button" className="library-reader__back" onClick={() => handleSelectArticle('')}>
              ← All sources
            </button>
            {mainPanel}
            {sourceMarginalia}
          </div>
        ) : isShelfView ? (
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
        ) : (
          <div className="library-reader">
            {mainPanel}
          </div>
        )}
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
