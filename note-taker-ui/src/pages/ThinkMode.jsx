import React, { Profiler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageTitle, SectionHeader, QuietButton, Button, TagChip, SegmentedNav, SurfaceCard } from '../components/ui';
import useConcepts from '../hooks/useConcepts';
import useConcept from '../hooks/useConcept';
import useConceptRelated from '../hooks/useConceptRelated';
import ReferencesPanel from '../components/ReferencesPanel';
import { updateConcept, updateConceptPins } from '../api/concepts';
import NotebookList from '../components/think/notebook/NotebookList';
import NotebookEditor from '../components/think/notebook/NotebookEditor';
import NotebookContext from '../components/think/notebook/NotebookContext';
import useQuestions from '../hooks/useQuestions';
import { createQuestion, updateQuestion } from '../api/questions';
import QuestionInput from '../components/think/questions/QuestionInput';
import QuestionList from '../components/think/questions/QuestionList';
import HighlightCard from '../components/blocks/HighlightCard';
import NoteCard from '../components/blocks/NoteCard';
import ArticleCard from '../components/blocks/ArticleCard';
import AddToConceptModal from '../components/think/concepts/AddToConceptModal';
import QuestionEditor from '../components/think/questions/QuestionEditor';
import ThreePaneLayout from '../layout/ThreePaneLayout';
import useHighlights from '../hooks/useHighlights';
import useTags from '../hooks/useTags';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import LibraryConceptModal from '../components/library/LibraryConceptModal';
import LibraryNotebookModal from '../components/library/LibraryNotebookModal';
import LibraryQuestionModal from '../components/library/LibraryQuestionModal';
import SynthesisModal from '../components/think/SynthesisModal';
import WorkingMemoryPanel from '../components/working-memory/WorkingMemoryPanel';
import ReturnLaterControl from '../components/return-queue/ReturnLaterControl';
import ConnectionBuilder from '../components/connections/ConnectionBuilder';
import ConceptPathWorkspace from '../components/paths/ConceptPathWorkspace';
import ConceptNotebook from '../components/think/concepts/ConceptNotebook';
import ThinkHome from '../components/think/ThinkHome';
import VirtualList from '../components/virtual/VirtualList';
import { getConnectionsForScope } from '../api/connections';
import { createProfilerLogger, endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';
import { listReturnQueue } from '../api/returnQueue';
import { getArticles } from '../api/articles';
import {
  listWorkingMemory,
  createWorkingMemory,
  archiveWorkingMemory,
  unarchiveWorkingMemory,
  promoteWorkingMemory,
  splitWorkingMemory
} from '../api/workingMemory';

const THINK_RIGHT_STORAGE_KEY = 'workspace-right-open:/think';
const THINK_RECENTS_STORAGE_KEY = 'think.recent.targets';
const THINK_CONCEPT_ROW_HEIGHT = 46;
const THINK_QUESTION_ROW_HEIGHT = 88;
const THINK_HOME_LIMIT = 6;
const THINK_SUB_NAV_ITEMS = [
  { value: 'home', label: 'Home' },
  { value: 'notebook', label: 'Notebook' },
  { value: 'concepts', label: 'Concepts' },
  { value: 'questions', label: 'Questions' },
  { value: 'paths', label: 'Paths' },
  { value: 'insights', label: 'Insights' }
];

const readRecentTargets = () => {
  try {
    const raw = localStorage.getItem(THINK_RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || '').trim(),
        type: String(item?.type || '').trim(),
        title: String(item?.title || '').trim(),
        path: String(item?.path || '').trim(),
        openedAt: item?.openedAt || new Date().toISOString()
      }))
      .filter(item => item.id && item.type && item.path)
      .slice(0, 20);
  } catch (error) {
    return [];
  }
};

const formatAiError = (err, fallback = 'Request failed.') => {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const bodySnippet = typeof data === 'string'
    ? data.slice(0, 300)
    : data
      ? JSON.stringify(data).slice(0, 300)
      : '';
  const output = status
    ? `HTTP ${status} — ${bodySnippet || fallback}`
    : `${err?.name || 'Error'}: ${err?.message || fallback}`;
  console.error('AI request failed', {
    url: err?.config?.url,
    method: err?.config?.method,
    status,
    bodySnippet,
    thrownName: err?.name,
    thrownMessage: err?.message
  });
  return output;
};

const SidebarSkeletonRows = React.memo(({ rows = 4 }) => (
  <div className="library-article-skeletons" aria-hidden="true">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={`think-skeleton-${index}`} className="think-list-skeleton-row">
        <div className="skeleton skeleton-title" style={{ width: `${52 + (index % 3) * 14}%` }} />
        <div className="skeleton skeleton-text" style={{ width: `${28 + (index % 2) * 16}%` }} />
      </div>
    ))}
  </div>
));

const ConceptListItem = React.memo(({ conceptItem, isActive, onSelect }) => (
  <QuietButton
    className={`list-button ${isActive ? 'is-active' : ''}`}
    onClick={() => onSelect(conceptItem.name)}
  >
    <span>{conceptItem.name}</span>
    {typeof conceptItem.count === 'number' && (
      <span className="concept-count">{conceptItem.count}</span>
    )}
  </QuietButton>
));

const QuestionListItem = React.memo(({ question, isActive, onOpen }) => (
  <div className={`think-question-row ${isActive ? 'is-active' : ''}`}>
    <button
      type="button"
      className={`think-question-row-main list-button ${isActive ? 'is-active' : ''}`}
      onClick={() => onOpen(question._id)}
    >
      <div className="think-question-text">{question.text}</div>
      <div className="muted small">{question.linkedTagName || 'Uncategorized'}</div>
    </button>
    <div className="think-question-row-actions" onClick={(event) => event.stopPropagation()}>
      <ReturnLaterControl
        itemType="question"
        itemId={question._id}
        defaultReason={question.text || 'Question'}
      />
    </div>
  </div>
));

const ThinkMode = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryConcept = searchParams.get('concept') || '';
  const allowedViews = useMemo(() => ['home', 'notebook', 'concepts', 'questions', 'paths', 'insights'], []);
  const resolveActiveView = useCallback((params) => {
    const rawView = params.get('tab') || '';
    if (allowedViews.includes(rawView)) return rawView;
    if (params.get('entryId')) return 'notebook';
    if (params.get('questionId')) return 'questions';
    if (params.get('concept')) return 'concepts';
    if (params.get('pathId')) return 'paths';
    return 'home';
  }, [allowedViews]);
  const [activeView, setActiveView] = useState(() => resolveActiveView(searchParams));
  const selectedPathId = searchParams.get('pathId') || '';
  const [search, setSearch] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [conceptError, setConceptError] = useState('');
  const [highlightOffset, setHighlightOffset] = useState(0);
  const [recentHighlights, setRecentHighlights] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeNotebookEntry, setActiveNotebookEntry] = useState(null);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const highlightsEnabled = activeView !== 'insights';
  const { highlightMap, highlights: allHighlights } = useHighlights({ enabled: highlightsEnabled });
  const { tags } = useTags();
  const [addModal, setAddModal] = useState({ open: false, mode: 'highlight' });
  const notebookInsertRef = useRef(null);
  const questionInsertRef = useRef(null);
  const [highlightQuery, setHighlightQuery] = useState('');
  const [highlightTag, setHighlightTag] = useState('');
  const [highlightArticle, setHighlightArticle] = useState('');
  const [questionStatus, setQuestionStatus] = useState('open');
  const [questionConceptFilter, setQuestionConceptFilter] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState('');
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [highlightConceptModal, setHighlightConceptModal] = useState({ open: false, highlight: null });
  const [highlightNotebookModal, setHighlightNotebookModal] = useState({ open: false, highlight: null });
  const [highlightQuestionModal, setHighlightQuestionModal] = useState({ open: false, highlight: null });
  const [shareStatus, setShareStatus] = useState('');
  const [shareError, setShareError] = useState('');
  const [shareWorking, setShareWorking] = useState(false);
  const [shareSlug, setShareSlug] = useState('');
  const [conceptRelated, setConceptRelated] = useState({ highlights: [], concepts: [] });
  const [conceptRelatedLoading, setConceptRelatedLoading] = useState(false);
  const [conceptRelatedError, setConceptRelatedError] = useState('');
  const [conceptSuggestions, setConceptSuggestions] = useState([]);
  const [conceptSuggestionsLoading, setConceptSuggestionsLoading] = useState(false);
  const [conceptSuggestionsError, setConceptSuggestionsError] = useState('');
  const [insightsTab, setInsightsTab] = useState('themes');
  const [themesRange, setThemesRange] = useState('7d');
  const [themes, setThemes] = useState([]);
  const [themesLoading, setThemesLoading] = useState(false);
  const [themesError, setThemesError] = useState('');
  const [connections, setConnections] = useState([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState('');
  const [aiHealthStatus, setAiHealthStatus] = useState('idle');
  const [aiHealthError, setAiHealthError] = useState('');
  const [synthesisOpen, setSynthesisOpen] = useState(false);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisError, setSynthesisError] = useState('');
  const [synthesisData, setSynthesisData] = useState(null);
  const [synthesisScope, setSynthesisScope] = useState({ type: '', id: '' });
  const [questionRelated, setQuestionRelated] = useState({ highlights: [], concepts: [] });
  const [questionRelatedLoading, setQuestionRelatedLoading] = useState(false);
  const [questionRelatedError, setQuestionRelatedError] = useState('');
  const [contextConnections, setContextConnections] = useState([]);
  const [contextConnectionsLoading, setContextConnectionsLoading] = useState(false);
  const [contextConnectionsError, setContextConnectionsError] = useState('');

  const [notebookEntries, setNotebookEntries] = useState([]);
  const [notebookActiveId, setNotebookActiveId] = useState('');
  const [notebookLoadingList, setNotebookLoadingList] = useState(false);
  const [notebookLoadingEntry, setNotebookLoadingEntry] = useState(false);
  const [notebookSaving, setNotebookSaving] = useState(false);
  const [notebookListError, setNotebookListError] = useState('');
  const [notebookEntryError, setNotebookEntryError] = useState('');
  const [workingMemoryItems, setWorkingMemoryItems] = useState([]);
  const [workingMemoryLoading, setWorkingMemoryLoading] = useState(false);
  const [workingMemoryError, setWorkingMemoryError] = useState('');
  const [workingMemoryView, setWorkingMemoryView] = useState('active');
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const [cardsExpandVersion, setCardsExpandVersion] = useState(0);
  const [workspaceMovedNotice, setWorkspaceMovedNotice] = useState('');
  const [recentTargets, setRecentTargets] = useState(() => readRecentTargets());
  const [homeReturnQueue, setHomeReturnQueue] = useState([]);
  const [homeQueueLoading, setHomeQueueLoading] = useState(false);
  const [homeQueueError, setHomeQueueError] = useState('');
  const [homeArticles, setHomeArticles] = useState([]);
  const [homeArticlesLoading, setHomeArticlesLoading] = useState(false);
  const [homeArticlesError, setHomeArticlesError] = useState('');
  const [rightOpen, setRightOpen] = useState(() => {
    const stored = localStorage.getItem(THINK_RIGHT_STORAGE_KEY);
    if (stored === null) return true;
    return stored === 'true';
  });
  const conceptProfilerLogger = useMemo(() => createProfilerLogger('think.concept.render'), []);
  const questionListProfilerLogger = useMemo(() => createProfilerLogger('think.question-list.render'), []);
  const conceptListProfilerLogger = useMemo(() => createProfilerLogger('think.concept-list.render'), []);
  const leftListHeight = useMemo(() => {
    const viewport = typeof window !== 'undefined' ? window.innerHeight : 0;
    return Math.min(420, Math.max(240, viewport ? viewport - 520 : 320));
  }, []);

  const createBlockId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
  };

  const { concepts, loading: conceptsLoading, error: conceptsError } = useConcepts();
  const selectedName = queryConcept || concepts[0]?.name || '';
  const { concept, loading: conceptLoading, error: conceptLoadError, refresh, setConcept } = useConcept(selectedName, {
    enabled: activeView === 'concepts' && Boolean(selectedName)
  });
  const { related, loading: relatedLoading, error: relatedError } = useConceptRelated(selectedName, {
    enabled: activeView === 'concepts' && Boolean(selectedName),
    limit: 20,
    offset: highlightOffset
  });
  const {
    questions: conceptQuestions,
    loading: questionsLoading,
    error: questionsError,
    setQuestions: setConceptQuestions
  } = useQuestions({
    conceptName: selectedName,
    status: 'open',
    enabled: activeView === 'concepts' && Boolean(selectedName)
  });

  const filteredConcepts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return concepts;
    return concepts.filter(c => c.name.toLowerCase().includes(q));
  }, [concepts, search]);

  const pinnedHighlightIds = concept?.pinnedHighlightIds || [];
  const pinnedArticleIds = concept?.pinnedArticleIds || [];
  const pinnedHighlights = concept?.pinnedHighlights || [];
  const pinnedArticles = concept?.pinnedArticles || [];
  const pinnedNotes = concept?.pinnedNotes || [];

  const questionQuery = useQuestions({
    status: questionStatus,
    tag: questionConceptFilter || undefined,
    enabled: true
  });
  const { questions: allQuestions, loading: allQuestionsLoading, error: allQuestionsError, setQuestions: setAllQuestions } = questionQuery;

  const activeQuestionData = useMemo(
    () => allQuestions.find(q => q._id === activeQuestionId) || null,
    [allQuestions, activeQuestionId]
  );

  const workingMemoryScope = useMemo(() => {
    if (activeView === 'notebook' && activeNotebookEntry?._id) {
      return { workspaceType: 'notebook', workspaceId: activeNotebookEntry._id };
    }
    if (activeView === 'questions' && activeQuestionData?._id) {
      return { workspaceType: 'question', workspaceId: activeQuestionData._id };
    }
    if (activeView === 'concepts' && concept?._id) {
      return { workspaceType: 'concept', workspaceId: concept._id };
    }
    return { workspaceType: 'think', workspaceId: '' };
  }, [activeView, activeNotebookEntry?._id, activeQuestionData?._id, concept?._id]);

  const connectionScope = useMemo(() => {
    if (activeView === 'concepts' && concept?._id) {
      return { scopeType: 'concept', scopeId: concept._id };
    }
    if (activeView === 'questions' && activeQuestionData?._id) {
      return { scopeType: 'question', scopeId: activeQuestionData._id };
    }
    return { scopeType: '', scopeId: '' };
  }, [activeView, concept?._id, activeQuestionData?._id]);
  const connectionScopeType = connectionScope.scopeType;
  const connectionScopeId = connectionScope.scopeId;
  const resolveConceptNameFromScope = useCallback((scopeId) => {
    const safeScopeId = String(scopeId || '').trim();
    if (!safeScopeId) return '';
    const byId = concepts.find(item => String(item._id || '') === safeScopeId);
    if (byId?.name) return byId.name;
    const byName = concepts.find(
      item => String(item.name || '').trim().toLowerCase() === safeScopeId.toLowerCase()
    );
    return byName?.name || safeScopeId;
  }, [concepts]);

  const rememberRecentTarget = useCallback((target) => {
    const nextTarget = {
      id: String(target?.id || '').trim(),
      type: String(target?.type || '').trim(),
      title: String(target?.title || '').trim(),
      path: String(target?.path || '').trim(),
      openedAt: new Date().toISOString()
    };
    if (!nextTarget.id || !nextTarget.type || !nextTarget.path) return;
    setRecentTargets((prev) => {
      const deduped = prev.filter(item => !(item.id === nextTarget.id && item.type === nextTarget.type));
      const next = [nextTarget, ...deduped].slice(0, 20);
      localStorage.setItem(THINK_RECENTS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (activeView !== 'questions') return;
    if (allQuestions.length === 0) {
      setActiveQuestionId('');
      setActiveQuestion(null);
      return;
    }
    const requestedId = searchParams.get('questionId');
    const target = requestedId && allQuestions.find(q => q._id === requestedId);
    if (target) {
      setActiveQuestionId(target._id);
      setActiveQuestion(target);
      return;
    }
    if (!activeQuestionId || !allQuestions.some(q => q._id === activeQuestionId)) {
      setActiveQuestionId(allQuestions[0]._id);
      setActiveQuestion(allQuestions[0]);
    }
  }, [activeView, allQuestions, activeQuestionId, searchParams]);

  useEffect(() => {
    if (activeView !== 'questions') return;
    setActiveQuestion(activeQuestionData);
  }, [activeView, activeQuestionData]);

  useEffect(() => {
    if (activeView !== 'concepts' || !concept?._id) {
      setConceptRelated({ highlights: [], concepts: [] });
      setConceptRelatedLoading(false);
      setConceptRelatedError('');
      setConceptSuggestions([]);
      setConceptSuggestionsLoading(false);
      setConceptSuggestionsError('');
      return;
    }
    let cancelled = false;
    const fetchRelatedAndSuggestions = async () => {
      const startedAt = startPerfTimer();
      setConceptRelatedLoading(true);
      setConceptRelatedError('');
      setConceptSuggestionsLoading(true);
      setConceptSuggestionsError('');
      try {
        const [relatedRes, suggestionRes] = await Promise.all([
          api.get(`/api/concepts/${concept._id}/related`, getAuthHeaders()),
          api.get(`/api/concepts/${concept._id}/suggestions?limit=12`, getAuthHeaders())
        ]);
        if (cancelled) return;
        const items = relatedRes.data?.results || [];
        setConceptRelated({
          highlights: items.filter(item => item.objectType === 'highlight'),
          concepts: items.filter(item => item.objectType === 'concept')
        });
        setConceptSuggestions(suggestionRes.data?.results || []);
        logPerf('think.concept.batch-load', {
          conceptId: concept._id,
          relatedCount: items.length,
          suggestionCount: suggestionRes.data?.results?.length || 0,
          durationMs: endPerfTimer(startedAt)
        });
      } catch (err) {
        if (!cancelled) {
          const message = formatAiError(err, 'Failed to load concept context.');
          setConceptRelatedError(message);
          setConceptSuggestionsError(message);
        }
      } finally {
        if (!cancelled) {
          setConceptRelatedLoading(false);
          setConceptSuggestionsLoading(false);
        }
      }
    };
    fetchRelatedAndSuggestions();
    return () => {
      cancelled = true;
    };
  }, [activeView, concept?._id]);

  useEffect(() => {
    if (activeView !== 'insights' || insightsTab !== 'themes') {
      return;
    }
    if (aiHealthStatus !== 'ok') {
      return;
    }
    let cancelled = false;
    const fetchThemes = async () => {
      setThemesLoading(true);
      setThemesError('');
      try {
        const res = await api.get(`/api/ai/themes?range=${encodeURIComponent(themesRange)}`, getAuthHeaders());
        if (!cancelled) {
          setThemes(res.data?.clusters || []);
        }
      } catch (err) {
        if (!cancelled) {
          setThemesError(formatAiError(err, 'Failed to load themes.'));
        }
      } finally {
        if (!cancelled) setThemesLoading(false);
      }
    };
    fetchThemes();
    return () => {
      cancelled = true;
    };
  }, [activeView, insightsTab, themesRange, aiHealthStatus]);

  useEffect(() => {
    if (activeView !== 'insights' || insightsTab !== 'connections') {
      return;
    }
    if (aiHealthStatus !== 'ok') {
      return;
    }
    let cancelled = false;
    const fetchConnections = async () => {
      setConnectionsLoading(true);
      setConnectionsError('');
      try {
        const res = await api.get('/api/ai/connections?limit=20', getAuthHeaders());
        if (!cancelled) {
          setConnections(res.data?.pairs || []);
        }
      } catch (err) {
        if (!cancelled) {
          setConnectionsError(formatAiError(err, 'Failed to load connections.'));
        }
      } finally {
        if (!cancelled) setConnectionsLoading(false);
      }
    };
    fetchConnections();
    return () => {
      cancelled = true;
    };
  }, [activeView, insightsTab, aiHealthStatus]);

  useEffect(() => {
    if (activeView !== 'insights') {
      return;
    }
    let cancelled = false;
    const checkHealth = async () => {
      setAiHealthStatus('loading');
      setAiHealthError('');
      try {
        await api.get('/api/ai/health', getAuthHeaders());
        if (!cancelled) {
          setAiHealthStatus('ok');
        }
      } catch (err) {
        if (cancelled) return;
        const code = err.response?.data?.error;
        if (code === 'AI_DISABLED') {
          setAiHealthError('AI is disabled. Set AI_ENABLED=true on the server.');
        } else {
          setAiHealthError('AI service unreachable. Check server configuration.');
        }
        setAiHealthStatus('error');
      }
    };
    checkHealth();
    return () => {
      cancelled = true;
    };
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'questions' || !activeQuestion?._id) {
      setQuestionRelated({ highlights: [], concepts: [] });
      setQuestionRelatedLoading(false);
      setQuestionRelatedError('');
      return;
    }
    let cancelled = false;
    const fetchRelated = async () => {
      setQuestionRelatedLoading(true);
      setQuestionRelatedError('');
      try {
        const res = await api.get(`/api/questions/${activeQuestion._id}/related`, getAuthHeaders());
        if (cancelled) return;
        const items = res.data?.results || [];
        setQuestionRelated({
          highlights: items.filter(item => item.objectType === 'highlight'),
          concepts: items.filter(item => item.objectType === 'concept')
        });
      } catch (err) {
        if (!cancelled) {
          setQuestionRelatedError(formatAiError(err, 'Failed to load related items.'));
        }
      } finally {
        if (!cancelled) setQuestionRelatedLoading(false);
      }
    };
    fetchRelated();
    return () => {
      cancelled = true;
    };
  }, [activeView, activeQuestion?._id]);

  useEffect(() => {
    if (!connectionScopeType || !connectionScopeId) {
      setContextConnections([]);
      setContextConnectionsLoading(false);
      setContextConnectionsError('');
      return;
    }
    let cancelled = false;
    const fetchConnectionsForScope = async () => {
      setContextConnectionsLoading(true);
      setContextConnectionsError('');
      try {
        const data = await getConnectionsForScope({
          scopeType: connectionScopeType,
          scopeId: connectionScopeId
        });
        if (!cancelled) {
          setContextConnections(Array.isArray(data?.connections) ? data.connections : []);
        }
      } catch (err) {
        if (!cancelled) {
          setContextConnectionsError(err.response?.data?.error || 'Failed to load scoped connections.');
        }
      } finally {
        if (!cancelled) setContextConnectionsLoading(false);
      }
    };
    fetchConnectionsForScope();
    return () => {
      cancelled = true;
    };
  }, [connectionScopeType, connectionScopeId]);

  const loadNotebookEntries = useCallback(async () => {
    const startedAt = startPerfTimer();
    setNotebookLoadingList(true);
    setNotebookListError('');
    try {
      const res = await api.get('/api/notebook', getAuthHeaders());
      const data = res.data || [];
      setNotebookEntries(data);
      logPerf('think.notebook.list.load', {
        count: data.length,
        durationMs: endPerfTimer(startedAt)
      });
      if (data.length === 0) {
        setNotebookActiveId('');
        setActiveNotebookEntry(null);
      } else if (searchParams.get('entryId') && data.some(entry => entry._id === searchParams.get('entryId'))) {
        setNotebookActiveId(searchParams.get('entryId'));
      } else if (!searchParams.get('entryId')) {
        setNotebookActiveId(data[0]._id);
      }
    } catch (err) {
      setNotebookListError(err.response?.data?.error || 'Failed to load notebook.');
    } finally {
      setNotebookLoadingList(false);
    }
  }, [searchParams]);

  const loadNotebookEntry = useCallback(async (entryId) => {
    if (!entryId) return;
    const startedAt = startPerfTimer();
    setNotebookLoadingEntry(true);
    setNotebookEntryError('');
    try {
      const res = await api.get(`/api/notebook/${entryId}`, getAuthHeaders());
      const entry = res.data || null;
      setActiveNotebookEntry(entry);
      logPerf('think.notebook.entry.load', {
        entryId,
        durationMs: endPerfTimer(startedAt)
      });
    } catch (err) {
      setNotebookEntryError(err.response?.data?.error || 'Failed to load note.');
      setActiveNotebookEntry(null);
    } finally {
      setNotebookLoadingEntry(false);
    }
  }, []);

  useEffect(() => {
    loadNotebookEntries();
  }, [loadNotebookEntries]);

  useEffect(() => {
    const rawView = searchParams.get('tab');
    if (rawView === 'board' || searchParams.get('moved') === 'board') {
      const params = new URLSearchParams(searchParams);
      const scopeType = String(params.get('scopeType') || '').trim().toLowerCase();
      const scopeId = String(params.get('scopeId') || '').trim();
      let nextView = 'concepts';

      if (scopeType === 'question' && scopeId) {
        nextView = 'questions';
        params.set('questionId', scopeId);
        params.delete('concept');
      } else if (scopeType === 'concept' && scopeId) {
        nextView = 'concepts';
        params.set('concept', resolveConceptNameFromScope(scopeId));
        params.delete('questionId');
      }

      params.set('tab', nextView);
      params.delete('scopeType');
      params.delete('scopeId');
      params.delete('moved');

      setWorkspaceMovedNotice('Workspace has moved into Concepts. Open a concept to organize and connect material.');
      setActiveView(nextView);
      setSearchParams(params, { replace: true });
      return;
    }
    setActiveView(resolveActiveView(searchParams));
  }, [searchParams, resolveActiveView, resolveConceptNameFromScope, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    const loadThinkHomeData = async () => {
      setHomeQueueLoading(true);
      setHomeQueueError('');
      setHomeArticlesLoading(true);
      setHomeArticlesError('');
      try {
        const [queueRows, articleRows] = await Promise.all([
          listReturnQueue({ filter: 'all' }),
          getArticles({ sort: 'recent' })
        ]);
        if (cancelled) return;
        setHomeReturnQueue(Array.isArray(queueRows) ? queueRows.slice(0, THINK_HOME_LIMIT) : []);
        setHomeArticles(Array.isArray(articleRows) ? articleRows.slice(0, THINK_HOME_LIMIT) : []);
      } catch (homeError) {
        if (!cancelled) {
          const message = homeError?.response?.data?.error || 'Failed to load Think home.';
          setHomeQueueError(message);
          setHomeArticlesError(message);
        }
      } finally {
        if (!cancelled) {
          setHomeQueueLoading(false);
          setHomeArticlesLoading(false);
        }
      }
    };
    loadThinkHomeData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspaceMovedNotice) return undefined;
    const timer = window.setTimeout(() => setWorkspaceMovedNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [workspaceMovedNotice]);

  useEffect(() => {
    if (activeView !== 'notebook' || !activeNotebookEntry?._id) return;
    rememberRecentTarget({
      id: activeNotebookEntry._id,
      type: 'notebook',
      title: activeNotebookEntry.title || 'Untitled note',
      path: `/think?tab=notebook&entryId=${encodeURIComponent(activeNotebookEntry._id)}`
    });
  }, [activeNotebookEntry?._id, activeNotebookEntry?.title, activeView, rememberRecentTarget]);

  useEffect(() => {
    if (activeView !== 'concepts' || !concept?._id) return;
    rememberRecentTarget({
      id: concept._id,
      type: 'concept',
      title: concept.name || 'Concept',
      path: `/think?tab=concepts&concept=${encodeURIComponent(concept.name || '')}`
    });
  }, [activeView, concept?._id, concept?.name, rememberRecentTarget]);

  useEffect(() => {
    if (activeView !== 'questions' || !activeQuestionData?._id) return;
    rememberRecentTarget({
      id: activeQuestionData._id,
      type: 'question',
      title: activeQuestionData.text || 'Question',
      path: `/think?tab=questions&questionId=${encodeURIComponent(activeQuestionData._id)}`
    });
  }, [activeQuestionData?._id, activeQuestionData?.text, activeView, rememberRecentTarget]);

  useEffect(() => {
    if (!notebookActiveId || activeView !== 'notebook') return;
    loadNotebookEntry(notebookActiveId);
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'notebook');
    params.set('entryId', notebookActiveId);
    setSearchParams(params, { replace: true });
  }, [notebookActiveId, activeView, loadNotebookEntry, searchParams, setSearchParams]);

  React.useEffect(() => {
    setDescriptionDraft(concept?.description || '');
    setIsEditingSummary(false);
    setShareSlug(concept?.slug || '');
    setShareStatus('');
    setShareError('');
  }, [concept?.description, concept?.slug, concept?.isPublic]);

  React.useEffect(() => {
    setHighlightOffset(0);
    setRecentHighlights([]);
  }, [selectedName]);

  React.useEffect(() => {
    if (!related?.highlights) return;
    setRecentHighlights(prev => {
      const map = new Map(prev.map(h => [String(h._id), h]));
      related.highlights.forEach(h => {
        map.set(String(h._id), h);
      });
      return Array.from(map.values());
    });
  }, [related]);

  const handleSelectConcept = (name) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'concepts');
    params.set('concept', name);
    params.delete('scopeType');
    params.delete('scopeId');
    setActiveView('concepts');
    setSearchParams(params);
  };

  const handleSelectView = (view) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', view);
    if (view !== 'notebook') {
      params.delete('entryId');
    }
    if (view !== 'concepts') {
      params.delete('concept');
    }
    if (view !== 'questions') {
      params.delete('questionId');
    }
    if (view !== 'paths') {
      params.delete('pathId');
    }
    params.delete('scopeType');
    params.delete('scopeId');
    setActiveView(view);
    setSearchParams(params);
  };

  const handleOpenHomeTarget = useCallback((item) => {
    const path = String(item?.path || '').trim();
    if (!path) return;
    window.location.href = path;
  }, []);

  const handleOpenReturnQueueEntry = useCallback((entry) => {
    const openPath = String(entry?.item?.openPath || '').trim();
    if (!openPath) return;
    window.location.href = openPath;
  }, []);

  const handleOpenHomeArticle = useCallback((articleId) => {
    if (!articleId) return;
    window.location.href = `/articles/${encodeURIComponent(articleId)}`;
  }, []);

  const handleSelectPath = useCallback((pathId) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'paths');
    if (pathId) params.set('pathId', pathId);
    else params.delete('pathId');
    setActiveView('paths');
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);

  const handleToggleRight = useCallback((nextOpen) => {
    setRightOpen(nextOpen);
    localStorage.setItem(THINK_RIGHT_STORAGE_KEY, String(nextOpen));
  }, []);

  const handleSelectNotebookEntry = (id) => {
    setNotebookActiveId(id);
    setActiveView('notebook');
    handleSelectView('notebook');
  };

  const handleCreateNotebookEntry = async () => {
    setNotebookSaving(true);
    setNotebookEntryError('');
    try {
      const res = await api.post('/api/notebook', { title: 'Untitled', content: '', blocks: [] }, getAuthHeaders());
      const created = res.data;
      setNotebookEntries(prev => [created, ...prev]);
      setNotebookActiveId(created._id);
      setActiveNotebookEntry(created);
      handleSelectView('notebook');
    } catch (err) {
      setNotebookEntryError(err.response?.data?.error || 'Failed to create note.');
    } finally {
      setNotebookSaving(false);
    }
  };

  const handleSaveNotebookEntry = async (payload) => {
    if (!payload?.id) return;
    setNotebookSaving(true);
    setNotebookEntryError('');
    try {
      const res = await api.put(`/api/notebook/${payload.id}`, payload, getAuthHeaders());
      const updated = res.data;
      setNotebookEntries(prev => prev.map(entry => entry._id === updated._id ? updated : entry));
      setActiveNotebookEntry(updated);
    } catch (err) {
      setNotebookEntryError(err.response?.data?.error || 'Failed to save note.');
    } finally {
      setNotebookSaving(false);
    }
  };

  const handleDeleteNotebookEntry = async (entry) => {
    if (!entry?._id) return;
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setNotebookSaving(true);
    setNotebookEntryError('');
    try {
      await api.delete(`/api/notebook/${entry._id}`, getAuthHeaders());
      setNotebookEntries(prev => {
        const remaining = prev.filter(item => item._id !== entry._id);
        if (remaining.length > 0) {
          setNotebookActiveId(remaining[0]._id);
        } else {
          setNotebookActiveId('');
          setActiveNotebookEntry(null);
        }
        return remaining;
      });
    } catch (err) {
      setNotebookEntryError(err.response?.data?.error || 'Failed to delete note.');
    } finally {
      setNotebookSaving(false);
    }
  };

  const loadWorkingMemoryItems = useCallback(async () => {
    setWorkingMemoryLoading(true);
    setWorkingMemoryError('');
    try {
      const items = await listWorkingMemory({
        ...workingMemoryScope,
        status: workingMemoryView
      });
      setWorkingMemoryItems(items);
    } catch (err) {
      setWorkingMemoryError(err.response?.data?.error || 'Failed to load working memory.');
    } finally {
      setWorkingMemoryLoading(false);
    }
  }, [workingMemoryScope, workingMemoryView]);

  useEffect(() => {
    loadWorkingMemoryItems();
  }, [loadWorkingMemoryItems]);

  const addWorkingMemoryItem = useCallback(async ({
    sourceType,
    sourceId,
    textSnippet
  }) => {
    const cleanText = String(textSnippet || '').trim();
    if (!cleanText) return;
    if (workingMemoryView !== 'active') {
      try {
        await createWorkingMemory({
          ...workingMemoryScope,
          sourceType,
          sourceId: String(sourceId || ''),
          textSnippet: cleanText
        });
        setWorkingMemoryView('active');
      } catch (err) {
        setWorkingMemoryError(err.response?.data?.error || 'Failed to dump to working memory.');
      }
      return;
    }
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      sourceType,
      sourceId: String(sourceId || ''),
      textSnippet: cleanText.slice(0, 1200),
      createdAt: new Date().toISOString()
    };
    setWorkingMemoryItems(prev => [optimistic, ...prev]);
    try {
      const created = await createWorkingMemory({
        ...workingMemoryScope,
        sourceType,
        sourceId: String(sourceId || ''),
        textSnippet: cleanText
      });
      setWorkingMemoryItems(prev => prev.map(item => (
        item._id === optimistic._id ? created : item
      )));
    } catch (err) {
      setWorkingMemoryItems(prev => prev.filter(item => item._id !== optimistic._id));
      setWorkingMemoryError(err.response?.data?.error || 'Failed to dump to working memory.');
    }
  }, [workingMemoryScope, workingMemoryView]);

  const handleArchiveWorkingMemoryItems = useCallback(async (ids) => {
    const safeIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [String(ids || '')].filter(Boolean);
    if (safeIds.length === 0) return;
    const previous = workingMemoryItems;
    setWorkingMemoryItems(prev => prev.filter(item => !safeIds.includes(String(item._id))));
    try {
      await archiveWorkingMemory(safeIds);
      setWorkingMemoryError('');
    } catch (err) {
      setWorkingMemoryItems(previous);
      setWorkingMemoryError(err.response?.data?.error || 'Failed to archive working memory.');
      throw err;
    }
  }, [workingMemoryItems]);

  const handleRestoreWorkingMemoryItems = useCallback(async (ids) => {
    const safeIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [String(ids || '')].filter(Boolean);
    if (safeIds.length === 0) return;
    const previous = workingMemoryItems;
    setWorkingMemoryItems(prev => prev.filter(item => !safeIds.includes(String(item._id))));
    try {
      await unarchiveWorkingMemory(safeIds);
      setWorkingMemoryError('');
    } catch (err) {
      setWorkingMemoryItems(previous);
      setWorkingMemoryError(err.response?.data?.error || 'Failed to restore working memory.');
      throw err;
    }
  }, [workingMemoryItems]);

  const handleSplitWorkingMemoryItem = useCallback(async (itemId, mode = 'sentence') => {
    const safeItemId = String(itemId || '');
    if (!safeItemId) return;
    const previous = workingMemoryItems;
    setWorkingMemoryItems(prev => prev.filter(item => String(item._id) !== safeItemId));
    try {
      const result = await splitWorkingMemory(safeItemId, mode);
      const created = Array.isArray(result?.created) ? result.created : [];
      setWorkingMemoryItems(prev => [...created, ...prev]);
      setWorkingMemoryError('');
    } catch (err) {
      setWorkingMemoryItems(previous);
      setWorkingMemoryError(err.response?.data?.error || 'Failed to split working memory block.');
      throw err;
    }
  }, [workingMemoryItems]);

  const handlePromoteWorkingMemoryBlocks = useCallback(async ({
    target,
    itemIds = [],
    payload = {}
  }) => {
    const safeIds = Array.isArray(itemIds) ? itemIds.map(String).filter(Boolean) : [];
    if (safeIds.length === 0) return null;
    const previous = workingMemoryItems;
    setWorkingMemoryItems(prev => prev.filter(item => !safeIds.includes(String(item._id))));
    try {
      const result = await promoteWorkingMemory({
        target,
        ids: safeIds,
        ...payload
      });
      setWorkingMemoryError('');
      return result;
    } catch (err) {
      setWorkingMemoryItems(previous);
      setWorkingMemoryError(err.response?.data?.error || 'Failed to promote working memory blocks.');
      throw err;
    }
  }, [workingMemoryItems]);

  const buildFallbackDump = useCallback(() => {
    if (activeView === 'notebook' && activeNotebookEntry) {
      const blockText = (activeNotebookEntry.blocks || [])
        .map(block => block.text || '')
        .join(' ')
        .trim()
        .slice(0, 400);
      return {
        sourceType: 'notebook',
        sourceId: activeNotebookEntry._id,
        textSnippet: blockText || activeNotebookEntry.title || 'Notebook entry'
      };
    }
    if (activeView === 'questions' && activeQuestionData) {
      return {
        sourceType: 'question',
        sourceId: activeQuestionData._id,
        textSnippet: activeQuestionData.text || 'Question'
      };
    }
    if (activeView === 'concepts' && concept) {
      return {
        sourceType: 'concept',
        sourceId: concept._id,
        textSnippet: descriptionDraft || concept.name || 'Concept'
      };
    }
    return {
      sourceType: 'think',
      sourceId: activeView,
      textSnippet: 'Working memory item'
    };
  }, [activeNotebookEntry, activeQuestionData, activeView, concept, descriptionDraft]);

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

  const handleSaveDescription = async () => {
    if (!concept) return;
    setSavingDescription(true);
    setConceptError('');
    try {
      const updated = await updateConcept(concept.name, {
        description: descriptionDraft,
        pinnedHighlightIds,
        pinnedArticleIds,
        pinnedNoteIds: concept.pinnedNoteIds || [],
        isPublic: concept.isPublic || false,
        slug: concept.slug || ''
      });
      setConcept({ ...concept, description: updated.description || '' });
      setIsEditingSummary(false);
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to save description.');
    } finally {
      setSavingDescription(false);
    }
  };

  const handleToggleSharing = async () => {
    if (!concept) return;
    setShareWorking(true);
    setShareError('');
    try {
      const updated = await updateConcept(concept.name, {
        description: concept.description || '',
        pinnedHighlightIds: concept.pinnedHighlightIds || [],
        pinnedArticleIds: concept.pinnedArticleIds || [],
        pinnedNoteIds: concept.pinnedNoteIds || [],
        isPublic: !concept.isPublic,
        slug: shareSlug || concept.slug || ''
      });
      setConcept({ ...concept, ...updated });
      setShareSlug(updated.slug || '');
      setShareStatus(updated.isPublic ? 'Public link ready.' : 'Sharing disabled.');
    } catch (err) {
      setShareError(err.response?.data?.error || 'Failed to update sharing.');
    } finally {
      setShareWorking(false);
    }
  };

  const handleExportConcept = async () => {
    if (!concept?.name) return;
    try {
      const res = await api.get(`/api/export/concepts/${encodeURIComponent(concept.name)}`, {
        ...getAuthHeaders(),
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${concept.name}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to export concept.');
    }
  };

  const togglePinHighlight = async (highlightId) => {
    if (!concept) return;
    const exists = pinnedHighlightIds.some(id => String(id) === String(highlightId));
    try {
      await updateConceptPins(concept.name, {
        addHighlightIds: exists ? [] : [highlightId],
        removeHighlightIds: exists ? [highlightId] : []
      });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update pins.');
    }
  };

  const togglePinArticle = async (articleId) => {
    if (!concept) return;
    const exists = pinnedArticleIds.some(id => String(id) === String(articleId));
    try {
      await updateConceptPins(concept.name, {
        addArticleIds: exists ? [] : [articleId],
        removeArticleIds: exists ? [articleId] : []
      });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update pins.');
    }
  };

  const togglePinNote = async (noteId) => {
    if (!concept) return;
    const current = concept.pinnedNoteIds || [];
    const exists = current.some(id => String(id) === String(noteId));
    const nextIds = exists
      ? current.filter(id => String(id) !== String(noteId))
      : [...current, noteId];
    try {
      const updated = await updateConcept(concept.name, {
        description: concept.description || '',
        pinnedHighlightIds,
        pinnedArticleIds,
        pinnedNoteIds: nextIds
      });
      setConcept({ ...concept, pinnedNoteIds: updated.pinnedNoteIds || nextIds });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update pins.');
    }
  };

  const loadMoreHighlights = async () => {
    setLoadingMore(true);
    setHighlightOffset(prev => prev + 20);
    setLoadingMore(false);
  };

  const handleAddQuestion = async (text) => {
    if (!selectedName) return;
    try {
      const created = await createQuestion({
        text,
        conceptName: selectedName,
        blocks: [{ id: createBlockId(), type: 'paragraph', text }]
      });
      setConceptQuestions(prev => [created, ...prev]);
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to add question.');
    }
  };

  const handleAddHighlightToConcept = async (highlight, conceptName) => {
    await api.post(`/api/concepts/${encodeURIComponent(conceptName)}/add-highlight`, {
      highlightId: highlight._id
    }, getAuthHeaders());
    setHighlightConceptModal({ open: false, highlight: null });
  };

  const handleSendHighlightToNotebook = async (highlight, entryId) => {
    await api.post(`/api/notebook/${entryId}/append-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setHighlightNotebookModal({ open: false, highlight: null });
  };

  const handleCreateQuestionFromHighlight = async (highlight, conceptName, text) => {
    const created = await createQuestion({
      text,
      conceptName,
      blocks: [
        { id: createBlockId(), type: 'paragraph', text },
        { id: createBlockId(), type: 'highlight-ref', highlightId: highlight._id, text: highlight.text || '' }
      ],
      linkedHighlightIds: [highlight._id]
    });
    if (created?._id) {
      await api.post(`/api/questions/${created._id}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    }
    setHighlightQuestionModal({ open: false, highlight: null });
  };

  const handleAttachHighlightToQuestion = async (highlight, questionId) => {
    await api.post(`/api/questions/${questionId}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setHighlightQuestionModal({ open: false, highlight: null });
  };

  const handleAddHighlights = async (ids) => {
    if (!concept || ids.length === 0) return;
    try {
      await updateConceptPins(concept.name, { addHighlightIds: ids });
      setAddModal({ open: false, mode: 'highlight' });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to add highlights.');
    }
  };

  const handleAddArticles = async (ids) => {
    if (!concept || ids.length === 0) return;
    try {
      await updateConceptPins(concept.name, { addArticleIds: ids });
      setAddModal({ open: false, mode: 'article' });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to add articles.');
    }
  };

  const handleAddRelatedHighlight = async (highlightId) => {
    if (!concept || !highlightId) return;
    if (pinnedHighlightIds.some(id => String(id) === String(highlightId))) return;
    try {
      await updateConceptPins(concept.name, { addHighlightIds: [highlightId] });
      setConceptSuggestions(prev => prev.filter(item => String(item.objectId) !== String(highlightId)));
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to add highlight.');
    }
  };

  const handleDismissSuggestion = async (highlightId) => {
    if (!concept || !highlightId) return;
    try {
      await api.post(`/api/concepts/${concept._id}/suggestions/dismiss`, { highlightId }, getAuthHeaders());
      setConceptSuggestions(prev => prev.filter(item => String(item.objectId) !== String(highlightId)));
    } catch (err) {
      setConceptSuggestionsError(err.response?.data?.error || 'Failed to dismiss suggestion.');
    }
  };

  const openSynthesis = async (scopeType, scopeId) => {
    if (!scopeId || !scopeType) return;
    setSynthesisOpen(true);
    setSynthesisLoading(true);
    setSynthesisError('');
    setSynthesisScope({ type: scopeType, id: scopeId });
    try {
      const res = await api.post('/api/ai/synthesize', {
        scopeType,
        scopeId
      }, getAuthHeaders());
      setSynthesisData(res.data || {});
    } catch (err) {
      setSynthesisError(formatAiError(err, 'Failed to synthesize.'));
    } finally {
      setSynthesisLoading(false);
    }
  };

  const handleAddThemeConcept = async (title) => {
    if (!title) return;
    try {
      await updateConcept(title, { description: '' });
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to add concept.');
    }
  };

  const handleAddSynthesisQuestion = async (text) => {
    if (!text) return;
    try {
      await createQuestion({
        text,
        conceptName: activeView === 'concepts' ? selectedName : '',
        blocks: [{ id: createBlockId(), type: 'paragraph', text }]
      });
    } catch (err) {
      setQuestionError(err.response?.data?.error || 'Failed to add question.');
    }
  };

  const handleLinkSuggested = async (item) => {
    if (!item || item.objectType !== 'highlight') return;
    try {
      if (synthesisScope.type === 'concept') {
        await updateConceptPins(selectedName, { addHighlightIds: [item.objectId] });
        refresh();
      } else if (synthesisScope.type === 'question' && activeQuestion?._id) {
        await api.post(`/api/questions/${activeQuestion._id}/add-highlight`, { highlightId: item.objectId }, getAuthHeaders());
      } else if (synthesisScope.type === 'notebook' && activeNotebookEntry?._id) {
        await api.post(`/api/notebook/${activeNotebookEntry._id}/append-highlight`, { highlightId: item.objectId }, getAuthHeaders());
      }
      setSynthesisData(prev => prev ? {
        ...prev,
        suggestedLinks: (prev.suggestedLinks || []).filter(link => String(link.objectId) !== String(item.objectId))
      } : prev);
    } catch (err) {
      setSynthesisError(err.response?.data?.error || 'Failed to link highlight.');
    }
  };

  const handleAttachRelatedHighlight = async (highlightId) => {
    if (!activeQuestion || !highlightId) return;
    try {
      await api.post(`/api/questions/${activeQuestion._id}/add-highlight`, { highlightId }, getAuthHeaders());
      setActiveQuestion(prev => prev ? { ...prev, linkedHighlightIds: [...(prev.linkedHighlightIds || []), highlightId] } : prev);
    } catch (err) {
      setQuestionError(err.response?.data?.error || 'Failed to attach highlight.');
    }
  };

  const handleMarkAnswered = async (question) => {
    try {
      await updateQuestion(question._id, { status: 'answered' });
      setConceptQuestions(prev => prev.filter(item => item._id !== question._id));
      setAllQuestions(prev => prev.filter(item => item._id !== question._id));
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update question.');
    }
  };

  const handleCreateQuestion = async () => {
    setQuestionSaving(true);
    setQuestionError('');
    try {
      const created = await createQuestion({
        text: 'New question',
        conceptName: questionConceptFilter || '',
        blocks: [{ id: createBlockId(), type: 'paragraph', text: '' }]
      });
      setAllQuestions(prev => [created, ...prev]);
      setActiveQuestionId(created._id);
      setActiveQuestion(created);
    } catch (err) {
      setQuestionError(err.response?.data?.error || 'Failed to create question.');
    } finally {
      setQuestionSaving(false);
    }
  };

  const handleSaveQuestion = async (payload) => {
    if (!payload?._id) return;
    setQuestionSaving(true);
    setQuestionError('');
    try {
      const updated = await updateQuestion(payload._id, {
        text: payload.text,
        status: payload.status,
        conceptName: payload.conceptName || payload.linkedTagName || '',
        blocks: payload.blocks || []
      });
      setAllQuestions(prev => prev.map(q => q._id === updated._id ? updated : q));
    } catch (err) {
      setQuestionError(err.response?.data?.error || 'Failed to save question.');
    } finally {
      setQuestionSaving(false);
    }
  };

  const handleOpenQuestion = (questionId) => {
    setActiveQuestionId(questionId);
    handleSelectView('questions');
  };

  const renderConceptRow = (conceptItem) => (
    <ConceptListItem
      key={conceptItem.name}
      conceptItem={conceptItem}
      isActive={conceptItem.name === selectedName}
      onSelect={handleSelectConcept}
    />
  );

  const renderQuestionRow = (question) => (
    <QuestionListItem
      key={question._id}
      question={question}
      isActive={activeQuestionId === question._id}
      onOpen={handleOpenQuestion}
    />
  );


  const leftPanel = (
    <div className="section-stack">
      <SectionHeader title="Notebook" subtitle="Working notes." />
      <NotebookList
        entries={notebookEntries}
        activeId={notebookActiveId}
        loading={notebookLoadingList}
        error={notebookListError}
        onSelect={handleSelectNotebookEntry}
        onCreate={handleCreateNotebookEntry}
      />

      <SectionHeader title="Concepts" subtitle="Structured pages." />
      <label className="feedback-field" style={{ margin: 0 }}>
        <span>Search</span>
        <input
          type="text"
          value={search}
          placeholder="Find a concept"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {conceptsLoading && <SidebarSkeletonRows rows={5} />}
      {conceptsError && <p className="status-message error-message">{conceptsError}</p>}
      <Profiler id="ThinkConceptList" onRender={conceptListProfilerLogger}>
        <div className="concept-list">
          {!conceptsLoading && filteredConcepts.length > 200 ? (
            <VirtualList
              items={filteredConcepts}
              height={leftListHeight}
              itemSize={THINK_CONCEPT_ROW_HEIGHT}
              overscan={8}
              className="think-virtual-list"
              renderItem={(conceptItem, index) => (
                <div key={conceptItem.name || index} style={{ paddingBottom: 6 }}>
                  {renderConceptRow(conceptItem)}
                </div>
              )}
            />
          ) : (
            filteredConcepts.map(conceptItem => renderConceptRow(conceptItem))
          )}
          {!conceptsLoading && filteredConcepts.length === 0 && (
            <p className="muted small">No concepts found.</p>
          )}
        </div>
      </Profiler>

      <SectionHeader title="Questions" subtitle="Open loops." />
      <div className="think-question-filters">
        <select
          value={questionStatus}
          onChange={(event) => {
            setQuestionStatus(event.target.value);
            handleSelectView('questions');
          }}
        >
          <option value="open">Open</option>
          <option value="answered">Answered</option>
        </select>
        <select
          value={questionConceptFilter}
          onChange={(event) => {
            setQuestionConceptFilter(event.target.value);
            handleSelectView('questions');
          }}
        >
          <option value="">All concepts</option>
          {concepts.map(concept => (
            <option key={concept.name} value={concept.name}>{concept.name}</option>
          ))}
        </select>
        <Button variant="secondary" onClick={handleCreateQuestion} disabled={questionSaving}>
          New
        </Button>
      </div>
      {allQuestionsError && <p className="status-message error-message">{allQuestionsError}</p>}
      {questionError && <p className="status-message error-message">{questionError}</p>}
      {allQuestionsLoading && <SidebarSkeletonRows rows={4} />}
      {!allQuestionsLoading && allQuestions.length === 0 && (
        <p className="muted small">No questions in this view.</p>
      )}
      <Profiler id="ThinkQuestionList" onRender={questionListProfilerLogger}>
        <div className="think-question-list">
          {!allQuestionsLoading && allQuestions.length > 200 ? (
            <VirtualList
              items={allQuestions}
              height={leftListHeight}
              itemSize={THINK_QUESTION_ROW_HEIGHT}
              overscan={6}
              className="think-virtual-list"
              renderItem={(question, index) => (
                <div key={question._id || index} style={{ paddingBottom: 8 }}>
                  {renderQuestionRow(question)}
                </div>
              )}
            />
          ) : (
            allQuestions.map(question => renderQuestionRow(question))
          )}
        </div>
      </Profiler>
    </div>
  );

  const insightsPanel = (
    <div className="section-stack">
      <SectionHeader title="Insights" subtitle="Themes and connections across your thinking." />
      {aiHealthStatus === 'loading' && (
        <p className="muted small">Checking AI service…</p>
      )}
      {aiHealthStatus === 'error' && (
        <p className="status-message error-message">{aiHealthError}</p>
      )}
      <div className="library-highlight-filters">
        <button
          type="button"
          className={`ui-quiet-button ${insightsTab === 'themes' ? 'is-active' : ''}`}
          onClick={() => setInsightsTab('themes')}
        >
          Themes
        </button>
        <button
          type="button"
          className={`ui-quiet-button ${insightsTab === 'connections' ? 'is-active' : ''}`}
          onClick={() => setInsightsTab('connections')}
        >
          Connections
        </button>
      </div>

      {insightsTab === 'themes' && (
        <>
          <div className="library-highlight-filters">
            <select value={themesRange} onChange={(event) => setThemesRange(event.target.value)}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
          {themesLoading && <p className="muted small">Finding themes…</p>}
          {themesError && <p className="status-message error-message">{themesError}</p>}
          {!themesLoading && !themesError && (
            <div className="related-embed-list">
              {themes.length === 0 ? (
                <p className="muted small">No themes yet.</p>
              ) : (
                themes.map((cluster, idx) => (
                  <div key={`${cluster.title}-${idx}`} className="concept-highlight-card">
                    <div className="related-embed-title">{cluster.title || 'Theme'}</div>
                    {cluster.topTags?.length > 0 && (
                      <div className="concept-related-tags" style={{ marginTop: 6 }}>
                        {cluster.topTags.slice(0, 4).map(tag => (
                          <TagChip key={`${cluster.title}-${tag}`} to={`/tags/${encodeURIComponent(tag)}`}>
                            {tag}
                          </TagChip>
                        ))}
                      </div>
                    )}
                    <div className="concept-note-grid" style={{ marginTop: 10 }}>
                      {(cluster.representativeHighlights || []).map(highlight => (
                        <HighlightCard
                          key={highlight.id}
                          highlight={{
                            _id: highlight.id,
                            text: highlight.text,
                            tags: highlight.tags || [],
                            articleId: highlight.articleId,
                            articleTitle: highlight.articleTitle || ''
                          }}
                          compact
                          organizable
                          connectionScopeType={connectionScope.scopeType}
                          connectionScopeId={connectionScope.scopeId}
                          forceExpandedState={cardsExpanded}
                          forceExpandedVersion={cardsExpandVersion}
                          onDumpToWorkingMemory={(item) => handleDumpToWorkingMemory(item?.text || '')}
                          onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
                          onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
                          onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {insightsTab === 'connections' && (
        <>
          {connectionsLoading && <p className="muted small">Mapping connections…</p>}
          {connectionsError && <p className="status-message error-message">{connectionsError}</p>}
          {!connectionsLoading && !connectionsError && (
            <div className="related-embed-list">
              {connections.length === 0 ? (
                <p className="muted small">No connections yet.</p>
              ) : (
                connections.map((pair, idx) => (
                  <div key={`${pair.conceptA?.id}-${pair.conceptB?.id}-${idx}`} className="concept-highlight-card">
                    <div className="related-embed-title">
                      {pair.conceptA?.name || 'Concept'} ↔ {pair.conceptB?.name || 'Concept'}
                    </div>
                    {pair.sharedSuggestedHighlights?.length > 0 ? (
                      <div className="concept-note-grid" style={{ marginTop: 10 }}>
                        {pair.sharedSuggestedHighlights.map(highlight => (
                          <HighlightCard
                            key={highlight.objectId}
                            highlight={{
                              _id: highlight.objectId,
                              text: highlight.title,
                              tags: highlight.metadata?.tags || [],
                              articleId: highlight.metadata?.articleId,
                              articleTitle: highlight.metadata?.articleTitle || ''
                            }}
                            compact
                            organizable
                            connectionScopeType={connectionScope.scopeType}
                            connectionScopeId={connectionScope.scopeId}
                            forceExpandedState={cardsExpanded}
                            forceExpandedVersion={cardsExpandVersion}
                            onDumpToWorkingMemory={(item) => handleDumpToWorkingMemory(item?.text || '')}
                            onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
                            onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
                            onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="muted small" style={{ marginTop: 8 }}>No shared highlights yet.</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  const homeHighlights = useMemo(() => (
    [...allHighlights]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, THINK_HOME_LIMIT)
  ), [allHighlights]);

  const homeWorkingSet = useMemo(() => ({
    notebooks: notebookEntries.slice(0, THINK_HOME_LIMIT),
    concepts: concepts.slice(0, THINK_HOME_LIMIT),
    questions: allQuestions.filter(item => item.status !== 'answered').slice(0, THINK_HOME_LIMIT)
  }), [allQuestions, concepts, notebookEntries]);

  const openNotebookEntry = useCallback((entryId) => {
    if (!entryId) return;
    window.location.href = `/think?tab=notebook&entryId=${entryId}`;
  }, []);

  const mainPanel = activeView === 'home' ? (
    <ThinkHome
      recentTargets={recentTargets}
      workingSet={homeWorkingSet}
      returnQueue={homeReturnQueue}
      recentHighlights={homeHighlights}
      recentArticles={homeArticles}
      queueLoading={homeQueueLoading}
      articlesLoading={homeArticlesLoading}
      onOpenTarget={handleOpenHomeTarget}
      onOpenNotebook={handleSelectNotebookEntry}
      onOpenConcept={handleSelectConcept}
      onOpenQuestion={handleOpenQuestion}
      onOpenReturnQueueItem={handleOpenReturnQueueEntry}
      onOpenArticle={handleOpenHomeArticle}
    />
  ) : activeView === 'notebook' ? (
    <div className="think-notebook-editor-pane">
      {notebookLoadingEntry && <p className="muted small">Loading note…</p>}
      {!notebookLoadingEntry && (
        <NotebookEditor
          entry={activeNotebookEntry}
          saving={notebookSaving}
          error={notebookEntryError}
          onSave={handleSaveNotebookEntry}
          onDelete={handleDeleteNotebookEntry}
          onCreate={handleCreateNotebookEntry}
          onRegisterInsert={(fn) => { notebookInsertRef.current = fn; }}
          onSynthesize={(entry) => openSynthesis('notebook', entry?._id)}
          onDump={() => handleDumpToWorkingMemory()}
          claimCandidates={notebookEntries.filter(item => (item.type || 'note') === 'claim')}
        />
      )}
    </div>
  ) : activeView === 'questions' ? (
    <div className="think-question-editor-pane">
      <QuestionEditor
        question={activeQuestionData}
        saving={questionSaving}
        error={questionError}
        onSave={handleSaveQuestion}
        onRegisterInsert={(fn) => { questionInsertRef.current = fn; }}
        onSynthesize={(question) => openSynthesis('question', question?._id)}
      />
      {activeQuestionData && questionStatus === 'open' && (
        <div className="think-question-actions">
          <QuietButton onClick={() => handleMarkAnswered(activeQuestionData)}>Mark answered</QuietButton>
        </div>
      )}
    </div>
  ) : activeView === 'paths' ? (
    <ConceptPathWorkspace
      selectedPathId={selectedPathId}
      onSelectPath={handleSelectPath}
    />
  ) : activeView === 'insights' ? (
    <div className="section-stack">
      {insightsPanel}
    </div>
  ) : (
    <Profiler id="ThinkConceptMain" onRender={conceptProfilerLogger}>
      <div className="section-stack">
      {conceptLoadError && <p className="status-message error-message">{conceptLoadError}</p>}
      {conceptError && <p className="status-message error-message">{conceptError}</p>}
      {relatedError && <p className="status-message error-message">{relatedError}</p>}
      {conceptLoading && (
        <div className="think-concept-loading" aria-hidden="true">
          <div className="skeleton skeleton-title" style={{ width: '34%', height: 16 }} />
          <div className="skeleton skeleton-title" style={{ width: '62%', height: 28 }} />
          <div className="skeleton skeleton-text" style={{ width: '100%', height: 14 }} />
          <div className="skeleton skeleton-text" style={{ width: '90%', height: 14 }} />
          <div className="skeleton skeleton-text" style={{ width: '94%', height: 14 }} />
        </div>
      )}
      {!conceptLoading && concept && (
        <>
          <div className="think-concept-hero">
            <p className="think-concept-kicker">Concept</p>
            <h1>{concept.name}</h1>
            {!isEditingSummary && (
              <div className="think-concept-summary">
                {descriptionDraft?.trim() ? (
                  <p>{descriptionDraft}</p>
                ) : (
                  <p className="muted">No summary yet. Capture the core idea in your own words.</p>
                )}
              </div>
            )}
            {isEditingSummary && (
              <div className="think-concept-summary-editor">
                <textarea
                  className="concept-description"
                  rows={5}
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="What is this concept? Why does it matter?"
                />
                <div className="think-concept-summary-actions">
                  <Button onClick={handleSaveDescription} disabled={savingDescription}>
                    {savingDescription ? 'Saving…' : 'Save summary'}
                  </Button>
                  <QuietButton
                    onClick={() => {
                      setDescriptionDraft(concept.description || '');
                      setIsEditingSummary(false);
                    }}
                    disabled={savingDescription}
                  >
                    Cancel
                  </QuietButton>
                </div>
              </div>
            )}
          </div>

          <div className="think-concept-toolbar">
            {!isEditingSummary && (
              <Button variant="secondary" onClick={() => setIsEditingSummary(true)}>
                Edit summary
              </Button>
            )}
            <ReturnLaterControl
              itemType="concept"
              itemId={concept._id}
              defaultReason={concept.name || descriptionDraft || 'Concept'}
            />
            <Button variant="secondary" onClick={() => openSynthesis('concept', concept._id)}>
              Synthesize
            </Button>
            <Button variant="secondary" onClick={handleExportConcept}>
              Export markdown
            </Button>
            <ConnectionBuilder itemType="concept" itemId={concept._id} itemTitle={concept.name} />
          </div>

          <SectionHeader title="Workspace" subtitle="Move material around and connect ideas." />
          <ConceptNotebook concept={concept} />

          <SectionHeader title="Sharing" subtitle="Publish a read-only concept page." />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={handleToggleSharing} disabled={shareWorking}>
              {shareWorking ? 'Saving…' : (concept.isPublic ? 'Disable sharing' : 'Enable sharing')}
            </Button>
            {concept.isPublic && shareSlug && (
              <span className="muted small">
                Public link: {`${window.location.origin}/public/concepts/${shareSlug}`}
              </span>
            )}
          </div>
          {shareStatus && <p className="status-message">{shareStatus}</p>}
          {shareError && <p className="status-message error-message">{shareError}</p>}

          <SectionHeader title="Pinned Highlights" subtitle="Anchor ideas." />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setAddModal({ open: true, mode: 'highlight' })}>
              Add Highlights
            </Button>
          </div>
          {pinnedHighlights.length === 0 && <p className="muted small">No pinned highlights yet.</p>}
          <div className="concept-highlight-grid">
            {pinnedHighlights.map(h => (
              <div key={h._id} className="concept-highlight-card">
                <HighlightCard
                  highlight={h}
                  compact
                  organizable
                  connectionScopeType={connectionScope.scopeType}
                  connectionScopeId={connectionScope.scopeId}
                  forceExpandedState={cardsExpanded}
                  forceExpandedVersion={cardsExpandVersion}
                  onDumpToWorkingMemory={(item) => handleDumpToWorkingMemory(item?.text || '')}
                  onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
                  onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
                  onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
                />
                <QuietButton onClick={() => togglePinHighlight(h._id)}>Unpin</QuietButton>
              </div>
            ))}
          </div>

          <SectionHeader title="Suggested highlights" subtitle="AI recommendations you can approve." />
          {conceptSuggestionsLoading && <p className="muted small">Finding suggestions…</p>}
          {conceptSuggestionsError && <p className="status-message error-message">{conceptSuggestionsError}</p>}
          {!conceptSuggestionsLoading && !conceptSuggestionsError && (
            <div className="concept-highlight-grid">
              {conceptSuggestions.length === 0 ? (
                <p className="muted small">No suggestions yet.</p>
              ) : (
                conceptSuggestions.slice(0, 8).map(item => (
                  <div key={item.objectId} className="concept-highlight-card">
                    <HighlightCard
                      highlight={{
                        _id: item.objectId,
                        text: item.title,
                        tags: item.metadata?.tags || [],
                        articleId: item.metadata?.articleId,
                        articleTitle: item.metadata?.articleTitle || '',
                        createdAt: item.metadata?.createdAt
                      }}
                      compact
                      organizable
                      connectionScopeType={connectionScope.scopeType}
                      connectionScopeId={connectionScope.scopeId}
                      forceExpandedState={cardsExpanded}
                      forceExpandedVersion={cardsExpandVersion}
                      onDumpToWorkingMemory={(highlight) => handleDumpToWorkingMemory(highlight?.text || '')}
                      onAddNotebook={(highlight) => setHighlightNotebookModal({ open: true, highlight })}
                      onAddConcept={(highlight) => setHighlightConceptModal({ open: true, highlight })}
                      onAddQuestion={(highlight) => setHighlightQuestionModal({ open: true, highlight })}
                    />
                    <div className="concept-suggestion-actions">
                      <QuietButton onClick={() => handleAddRelatedHighlight(item.objectId)}>Add to concept</QuietButton>
                      <QuietButton onClick={() => handleDismissSuggestion(item.objectId)}>Dismiss</QuietButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <SectionHeader title="Recent Highlights" subtitle="Newest signals." />
          <div className="concept-highlight-grid">
            {recentHighlights.map(h => (
              <div key={h._id} className="concept-highlight-card">
                <HighlightCard
                  highlight={h}
                  compact
                  organizable
                  connectionScopeType={connectionScope.scopeType}
                  connectionScopeId={connectionScope.scopeId}
                  forceExpandedState={cardsExpanded}
                  forceExpandedVersion={cardsExpandVersion}
                  onDumpToWorkingMemory={(item) => handleDumpToWorkingMemory(item?.text || '')}
                  onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
                  onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
                  onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
                />
                <QuietButton onClick={() => togglePinHighlight(h._id)}>
                  {pinnedHighlightIds.some(id => String(id) === String(h._id)) ? 'Unpin' : 'Pin'}
                </QuietButton>
              </div>
            ))}
            {!relatedLoading && recentHighlights.length === 0 && (
              <p className="muted small">No highlights yet for this concept.</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={loadMoreHighlights} disabled={loadingMore || relatedLoading}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>

          <SectionHeader title="Notes referencing this concept" subtitle="Embedded fragments." />
          {related.notes.length === 0 && !relatedLoading && (
            <p className="muted small">No linked notes yet.</p>
          )}
          <div className="concept-note-grid">
            {related.notes.map((note, idx) => (
              <NoteCard
                key={`${note.notebookEntryId}-${idx}`}
                id={note.notebookEntryId}
                title={note.notebookTitle || 'Untitled note'}
                bodyText={note.blockPreviewText || 'No preview available.'}
                type="note"
                tags={note.tags || []}
                timestamp={note.updatedAt}
                connectionScopeType={connectionScope.scopeType}
                connectionScopeId={connectionScope.scopeId}
                forceExpandedState={cardsExpanded}
                forceExpandedVersion={cardsExpandVersion}
                onOrganize={() => openNotebookEntry(note.notebookEntryId)}
                onDumpToWorkingMemory={() => handleDumpToWorkingMemory(note.blockPreviewText || note.notebookTitle || 'Note')}
              >
                <QuietButton onClick={() => togglePinNote(note.notebookEntryId)}>
                  {(concept.pinnedNoteIds || []).some(id => String(id) === String(note.notebookEntryId))
                    ? 'Unpin'
                    : 'Pin'}
                </QuietButton>
                <QuietButton onClick={() => openNotebookEntry(note.notebookEntryId)}>
                  Open note
                </QuietButton>
              </NoteCard>
            ))}
            {pinnedNotes.map(note => (
              <NoteCard
                key={note._id}
                id={note._id}
                title={note.title || 'Untitled note'}
                bodyText={note.content || ''}
                type={note.type || 'note'}
                tags={note.tags || []}
                timestamp={note.updatedAt || note.createdAt}
                connectionScopeType={connectionScope.scopeType}
                connectionScopeId={connectionScope.scopeId}
                forceExpandedState={cardsExpanded}
                forceExpandedVersion={cardsExpandVersion}
                onOrganize={() => openNotebookEntry(note._id)}
                onDumpToWorkingMemory={() => handleDumpToWorkingMemory(note.content || note.title || 'Note')}
              >
                <QuietButton onClick={() => togglePinNote(note._id)}>Unpin</QuietButton>
                <QuietButton onClick={() => openNotebookEntry(note._id)}>
                  Open note
                </QuietButton>
              </NoteCard>
            ))}
          </div>

          <SectionHeader title="Source articles" subtitle="Where the highlights live." />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setAddModal({ open: true, mode: 'article' })}>
              Add Articles
            </Button>
          </div>
          {pinnedArticles.length > 0 && (
            <div className="concept-source-list">
              {pinnedArticles.map(article => (
                <ArticleCard
                  key={article._id}
                  article={article}
                  connectionScopeType={connectionScope.scopeType}
                  connectionScopeId={connectionScope.scopeId}
                  forceExpandedState={cardsExpanded}
                  forceExpandedVersion={cardsExpandVersion}
                >
                  <QuietButton onClick={() => togglePinArticle(article._id)}>Unpin</QuietButton>
                </ArticleCard>
              ))}
            </div>
          )}
          {related.articles.length === 0 && !relatedLoading && (
            <p className="muted small">No source articles yet.</p>
          )}
          <div className="concept-source-list">
            {related.articles.map(article => (
              <ArticleCard
                key={article._id}
                article={article}
                connectionScopeType={connectionScope.scopeType}
                connectionScopeId={connectionScope.scopeId}
                forceExpandedState={cardsExpanded}
                forceExpandedVersion={cardsExpandVersion}
              >
                <QuietButton onClick={() => togglePinArticle(article._id)}>
                  {pinnedArticleIds.some(id => String(id) === String(article._id)) ? 'Unpin' : 'Pin'}
                </QuietButton>
              </ArticleCard>
            ))}
          </div>
          <SectionHeader title="Questions" subtitle="Open loops tied to this concept." />
          {questionsError && <p className="status-message error-message">{questionsError}</p>}
          {questionsLoading && <p className="muted small">Loading questions…</p>}
          {!questionsLoading && (
            <>
              <QuestionInput onSubmit={handleAddQuestion} />
              <QuestionList questions={conceptQuestions} onMarkAnswered={handleMarkAnswered} />
            </>
          )}
        </>
      )}
      </div>
    </Profiler>
  );

  const filteredHighlights = useMemo(() => {
    const query = highlightQuery.trim().toLowerCase();
    return allHighlights.filter(h => {
      const textMatch = !query || (h.text || '').toLowerCase().includes(query);
      const tagMatch = !highlightTag || (h.tags || []).includes(highlightTag);
      const articleMatch = !highlightArticle || (h.articleTitle || '').toLowerCase().includes(highlightArticle.toLowerCase());
      return textMatch && tagMatch && articleMatch;
    });
  }, [allHighlights, highlightQuery, highlightTag, highlightArticle]);

  const articleOptions = useMemo(() => {
    const map = new Map();
    allHighlights.forEach(h => {
      if (h.articleTitle) map.set(h.articleTitle, h.articleTitle);
    });
    return Array.from(map.values());
  }, [allHighlights]);

  const handleInsertHighlight = async (highlight) => {
    if (activeView === 'notebook' && notebookInsertRef.current) {
      notebookInsertRef.current(highlight);
      return;
    }
    if (activeView === 'questions' && questionInsertRef.current) {
      questionInsertRef.current(highlight);
      return;
    }
    if (activeView === 'concepts' && concept?.name) {
      await updateConceptPins(concept.name, { addHighlightIds: [highlight._id] });
      refresh();
    }
  };

  const handleToggleExpandAllCards = () => {
    const next = !cardsExpanded;
    setCardsExpanded(next);
    setCardsExpandVersion(prev => prev + 1);
  };

  const workingMemoryDrawer = (
    <WorkingMemoryPanel
      items={workingMemoryItems}
      loading={workingMemoryLoading}
      error={workingMemoryError}
      viewMode={workingMemoryView}
      onViewModeChange={setWorkingMemoryView}
      onDumpText={(text) => handleDumpToWorkingMemory(text)}
      onArchiveItems={handleArchiveWorkingMemoryItems}
      onRestoreItems={handleRestoreWorkingMemoryItems}
      onSplitItem={handleSplitWorkingMemoryItem}
      onPromoteBlocks={handlePromoteWorkingMemoryBlocks}
    />
  );

  const rightPanel = (
    <div className="section-stack">
      {workingMemoryDrawer}
      {activeView === 'home' && (
        <>
          <SurfaceCard>
            <SectionHeader title="Recent activity" subtitle="Your latest trails in Think." />
            <div className="think-home__list">
              {recentTargets.slice(0, THINK_HOME_LIMIT).map((item) => (
                <button
                  key={`${item.type}:${item.id}`}
                  type="button"
                  className="think-home__row"
                  onClick={() => handleOpenHomeTarget(item)}
                >
                  <span>{item.title || item.type}</span>
                  <span className="muted small">{item.type}</span>
                </button>
              ))}
              {recentTargets.length === 0 && <p className="muted small">No recent activity yet.</p>}
            </div>
          </SurfaceCard>
          <SurfaceCard>
            <SectionHeader title="Pinned shortcuts" subtitle="Quick jumps into active work." />
            <div className="think-home__list">
              <QuietButton onClick={() => handleSelectView('notebook')}>Open notebook</QuietButton>
              <QuietButton onClick={() => handleSelectView('concepts')}>Open concepts</QuietButton>
              <QuietButton onClick={() => handleSelectView('questions')}>Open questions</QuietButton>
              <QuietButton onClick={() => handleSelectView('paths')}>Open paths</QuietButton>
            </div>
          </SurfaceCard>
          {(homeQueueError || homeArticlesError) && (
            <p className="status-message error-message">{homeQueueError || homeArticlesError}</p>
          )}
        </>
      )}
      {activeView === 'insights' ? (
        <>
          <SectionHeader title="Context" subtitle="Insights stay read-only." />
          <p className="muted small">Use themes and connections to decide what to deepen next.</p>
        </>
      ) : (
        <>
          {activeView !== 'home' && (
            <>
              <SectionHeader title="Insert" subtitle="Search highlights." />
              <div className="library-highlight-filters">
                <input
                  type="text"
                  placeholder="Search highlights"
                  value={highlightQuery}
                  onChange={(event) => setHighlightQuery(event.target.value)}
                />
                <select value={highlightTag} onChange={(event) => setHighlightTag(event.target.value)}>
                  <option value="">All concepts</option>
                  {tags.map(tag => (
                    <option key={tag.tag} value={tag.tag}>{tag.tag}</option>
                  ))}
                </select>
                <select value={highlightArticle} onChange={(event) => setHighlightArticle(event.target.value)}>
                  <option value="">All articles</option>
                  {articleOptions.map(article => (
                    <option key={article} value={article}>{article}</option>
                  ))}
                </select>
              </div>
              <div className="library-highlights-list">
                {filteredHighlights.slice(0, 8).map(highlight => (
                  <div key={highlight._id} className="library-highlight-row">
                    <HighlightCard
                      highlight={highlight}
                      compact
                      organizable
                      connectionScopeType={connectionScope.scopeType}
                      connectionScopeId={connectionScope.scopeId}
                      forceExpandedState={cardsExpanded}
                      forceExpandedVersion={cardsExpandVersion}
                      onDumpToWorkingMemory={(item) => handleDumpToWorkingMemory(item?.text || '')}
                      onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
                      onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
                      onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
                    />
                    <div className="library-highlight-row-actions">
                      <QuietButton onClick={() => handleInsertHighlight(highlight)}>
                        {activeView === 'concepts' ? 'Pin to concept' : 'Insert'}
                      </QuietButton>
                    </div>
                  </div>
                ))}
                {filteredHighlights.length === 0 && (
                  <p className="muted small">No highlights match.</p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {activeView === 'notebook' && (
        <NotebookContext entry={activeNotebookEntry} />
      )}

      {activeView === 'questions' && (
        <div className="section-stack">
          <SectionHeader title="Context" subtitle="Open loops." />
          {activeQuestion?.linkedTagName ? (
            <TagChip to={`/think?tab=concepts&concept=${encodeURIComponent(activeQuestion.linkedTagName)}`}>
              {activeQuestion.linkedTagName}
            </TagChip>
          ) : (
            <p className="muted small">No concept linked.</p>
          )}
          <SectionHeader title="Connections in this question" subtitle="Supports, contradictions, extensions." />
          {contextConnectionsLoading && <p className="muted small">Loading connections…</p>}
          {contextConnectionsError && <p className="status-message error-message">{contextConnectionsError}</p>}
          {!contextConnectionsLoading && !contextConnectionsError && (
            <div className="context-connection-list">
              {contextConnections.length === 0 ? (
                <p className="muted small">No scoped connections yet.</p>
              ) : (
                contextConnections.slice(0, 10).map(row => (
                  <div key={row._id} className="context-connection-row">
                    <span className="context-connection-node">{row.fromItem?.title || row.fromType}</span>
                    <span className="context-connection-relation">{row.relationType}</span>
                    <span className="context-connection-node">{row.toItem?.title || row.toType}</span>
                  </div>
                ))
              )}
            </div>
          )}
          <SectionHeader title="Embedded highlights" subtitle="References in this question." />
          {activeQuestion?.blocks?.filter(block => block.type === 'highlight-ref').length ? (
            <div className="concept-note-grid">
              {activeQuestion.blocks
                .filter(block => block.type === 'highlight-ref')
                .map(block => {
                  const highlight = highlightMap.get(String(block.highlightId)) || {
                    id: block.highlightId,
                    text: block.text || 'Highlight',
                    tags: [],
                    articleTitle: ''
                  };
                  return (
                    <HighlightCard
                      key={block.id}
                      highlight={highlight}
                      compact
                      organizable
                      connectionScopeType={connectionScope.scopeType}
                      connectionScopeId={connectionScope.scopeId}
                      forceExpandedState={cardsExpanded}
                      forceExpandedVersion={cardsExpandVersion}
                      onDumpToWorkingMemory={(item) => handleDumpToWorkingMemory(item?.text || '')}
                      onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
                      onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
                      onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
                    />
                  );
                })}
            </div>
          ) : (
            <p className="muted small">No highlights embedded yet.</p>
          )}
          <SectionHeader title="Related highlights" subtitle="Semantically similar." />
          {questionRelatedLoading && <p className="muted small">Finding related highlights…</p>}
          {questionRelatedError && <p className="status-message error-message">{questionRelatedError}</p>}
          {!questionRelatedLoading && !questionRelatedError && (
            <div className="related-embed-list">
              {questionRelated.highlights.length === 0 ? (
                <p className="muted small">No related highlights yet.</p>
              ) : (
                questionRelated.highlights.slice(0, 6).map(item => (
                  <div key={item.objectId} className="related-embed-row">
                    <div>
                      <div className="related-embed-title">{item.title || 'Highlight'}</div>
                      <div className="muted small">{item.snippet || item.metadata?.articleTitle || ''}</div>
                    </div>
                    <QuietButton onClick={() => handleAttachRelatedHighlight(item.objectId)}>Add</QuietButton>
                  </div>
                ))
              )}
            </div>
          )}
          <SectionHeader title="Related concepts" subtitle="Neighbors and cousins." />
          {questionRelatedLoading && <p className="muted small">Finding related concepts…</p>}
          {questionRelatedError && <p className="status-message error-message">{questionRelatedError}</p>}
          {!questionRelatedLoading && !questionRelatedError && (
            <div className="related-embed-list">
              {questionRelated.concepts.length === 0 ? (
                <p className="muted small">No related concepts yet.</p>
              ) : (
                <div className="concept-related-tags">
                  {questionRelated.concepts.slice(0, 8).map(item => {
                    const name = item.metadata?.name || item.title || '';
                    return (
                      <TagChip key={item.objectId} to={`/think?tab=concepts&concept=${encodeURIComponent(name)}`}>
                        {name || 'Concept'}
                      </TagChip>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {activeQuestion?._id && (
            <div>
              <SectionHeader title="Used in" subtitle="Backlinks to this question." />
              <ReferencesPanel targetType="question" targetId={activeQuestion._id} label="Show backlinks" />
            </div>
          )}
        </div>
      )}

      {activeView === 'concepts' && (
        <div className="section-stack">
          <SectionHeader title="Connections in this concept" subtitle="Supports, contradictions, extensions." />
          {contextConnectionsLoading && <p className="muted small">Loading connections…</p>}
          {contextConnectionsError && <p className="status-message error-message">{contextConnectionsError}</p>}
          {!contextConnectionsLoading && !contextConnectionsError && (
            <div className="context-connection-list">
              {contextConnections.length === 0 ? (
                <p className="muted small">No scoped connections yet.</p>
              ) : (
                contextConnections.slice(0, 10).map(row => (
                  <div key={row._id} className="context-connection-row">
                    <span className="context-connection-node">{row.fromItem?.title || row.fromType}</span>
                    <span className="context-connection-relation">{row.relationType}</span>
                    <span className="context-connection-node">{row.toItem?.title || row.toType}</span>
                  </div>
                ))
              )}
            </div>
          )}
          <SectionHeader title="Related highlights" subtitle="Semantically similar." />
          {conceptRelatedLoading && <p className="muted small">Finding related highlights…</p>}
          {conceptRelatedError && <p className="status-message error-message">{conceptRelatedError}</p>}
          {!conceptRelatedLoading && !conceptRelatedError && (
            <div className="related-embed-list">
              {conceptRelated.highlights.length === 0 ? (
                <p className="muted small">No related highlights yet.</p>
              ) : (
                conceptRelated.highlights.slice(0, 6).map(item => (
                  <div key={item.objectId} className="related-embed-row">
                    <div>
                      <div className="related-embed-title">{item.title || 'Highlight'}</div>
                      <div className="muted small">{item.snippet || item.metadata?.articleTitle || ''}</div>
                    </div>
                    <QuietButton onClick={() => handleAddRelatedHighlight(item.objectId)}>Add</QuietButton>
                  </div>
                ))
              )}
            </div>
          )}
          <SectionHeader title="Related concepts" subtitle="Neighbors and cousins." />
          {conceptRelatedLoading && <p className="muted small">Finding related concepts…</p>}
          {conceptRelatedError && <p className="status-message error-message">{conceptRelatedError}</p>}
          {!conceptRelatedLoading && !conceptRelatedError && (
            conceptRelated.concepts.length > 0 ? (
              <div className="concept-related-tags">
                {conceptRelated.concepts.slice(0, 8).map(item => {
                  const name = item.metadata?.name || item.title || '';
                  return (
                    <TagChip key={item.objectId} to={`/think?tab=concepts&concept=${encodeURIComponent(name)}`}>
                      {name || 'Concept'}
                    </TagChip>
                  );
                })}
              </div>
            ) : (
              <p className="muted small">No related concepts yet.</p>
            )
          )}
          <SectionHeader title="Tag correlations" subtitle="Co-occuring themes." />
          {concept?.relatedTags?.length > 0 ? (
            <div className="concept-related-tags">
              {concept.relatedTags.slice(0, 8).map(tag => (
                <TagChip key={`corr-${tag.tag}`} to={`/think?tab=concepts&concept=${encodeURIComponent(tag.tag)}`}>
                  {tag.tag}
                </TagChip>
              ))}
            </div>
          ) : (
            <p className="muted small">No correlations yet.</p>
          )}
          {concept?.name && (
            <div>
              <SectionHeader title="Used in" subtitle="Backlinks to this concept." />
              <ReferencesPanel targetType="concept" tagName={concept.name} label="Show backlinks" />
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {workspaceMovedNotice && (
        <div style={{ marginBottom: 8 }}>
          <p className="status-message success-message">{workspaceMovedNotice}</p>
        </div>
      )}
      <ThreePaneLayout
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle="Context"
        rightOpen={rightOpen}
        onToggleRight={handleToggleRight}
        leftOpen
        defaultLeftOpen
        defaultRightOpen
        mainHeader={<PageTitle eyebrow="Mode" title="Think" subtitle="Home for your notebook, concepts, and open questions." />}
        mainActions={(
          <div className="library-main-actions think-main-actions">
            <SegmentedNav
              className="think-main-actions__segments"
              items={THINK_SUB_NAV_ITEMS}
              value={activeView}
              onChange={handleSelectView}
            />
            <QuietButton className="list-button think-main-actions__utility think-main-actions__utility--first" onClick={handleCreateNotebookEntry}>
              New note
            </QuietButton>
            <QuietButton className="list-button think-main-actions__utility" onClick={handleToggleExpandAllCards}>
              {cardsExpanded ? 'Collapse all' : 'Expand all'}
            </QuietButton>
            <QuietButton
              className={`list-button think-main-actions__utility ${rightOpen ? 'is-active' : ''}`}
              onClick={() => handleToggleRight(!rightOpen)}
            >
              Context
            </QuietButton>
          </div>
        )}
      />
      <AddToConceptModal
        open={addModal.open}
        mode={addModal.mode}
        pinnedHighlightIds={pinnedHighlightIds}
        pinnedArticleIds={pinnedArticleIds}
        onClose={() => setAddModal({ open: false, mode: 'highlight' })}
        onAddHighlights={handleAddHighlights}
        onAddArticles={handleAddArticles}
      />
      <LibraryConceptModal
        open={highlightConceptModal.open}
        highlight={highlightConceptModal.highlight}
        onClose={() => setHighlightConceptModal({ open: false, highlight: null })}
        onSelect={handleAddHighlightToConcept}
      />
      <LibraryNotebookModal
        open={highlightNotebookModal.open}
        highlight={highlightNotebookModal.highlight}
        onClose={() => setHighlightNotebookModal({ open: false, highlight: null })}
        onSend={handleSendHighlightToNotebook}
      />
      <LibraryQuestionModal
        open={highlightQuestionModal.open}
        highlight={highlightQuestionModal.highlight}
        onClose={() => setHighlightQuestionModal({ open: false, highlight: null })}
        onCreate={handleCreateQuestionFromHighlight}
        onAttach={handleAttachHighlightToQuestion}
      />
      <SynthesisModal
        open={synthesisOpen}
        title="Synthesis"
        loading={synthesisLoading}
        error={synthesisError}
        data={synthesisData}
        onClose={() => setSynthesisOpen(false)}
        onAddTheme={handleAddThemeConcept}
        onAddQuestion={handleAddSynthesisQuestion}
        onLinkSuggested={handleLinkSuggested}
      />
    </>
  );
};

export default ThinkMode;
