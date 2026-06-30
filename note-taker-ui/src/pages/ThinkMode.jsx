import React, { Profiler, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageTitle, SectionHeader, QuietButton, Button, TagChip, SegmentedNav, SurfaceCard } from '../components/ui';
import useConcepts from '../hooks/useConcepts';
import useConcept from '../hooks/useConcept';
import useConceptRelated from '../hooks/useConceptRelated';
import ReferencesPanel from '../components/ReferencesPanel';
import ReferencePullIn from '../components/references/ReferencePullIn';
import {
  updateConcept,
  updateConceptPins,
  suggestConceptWorkspaceFromLibrary
} from '../api/concepts';
import useQuestions from '../hooks/useQuestions';
import { createQuestion, updateQuestion } from '../api/questions';
import ConceptsIndexView from '../components/think/concepts/ConceptsIndexView';
import HighlightCard from '../components/blocks/HighlightCard';
import ThreePaneLayout from '../layout/ThreePaneLayout';
import useHighlights from '../hooks/useHighlights';
import useTags from '../hooks/useTags';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import useIdeaWorkbenchModel from '../components/think/concepts/idea-workbench/useIdeaWorkbenchModel';
import { formatEditorialEvidenceHtml } from '../components/think/concepts/formatEditorialEvidenceHtml';
import VirtualList from '../components/virtual/VirtualList';
import { createConnection, getConnectionsForScope } from '../api/connections';
import { createWikiPage, listWikiActivity, listWikiPages } from '../api/wiki';
import { wikiPagePath } from '../utils/wikiFeatureFlags';
import { createProfilerLogger, endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';
import { getArticles } from '../api/articles';
import { listReturnQueue } from '../api/returnQueue';
import { getNotebookFolders, getNotebookSummaries } from '../api/notebook';
import { resolveThoughtPartnerContext } from './thinkPartnerContext';
import useHandoffs from '../hooks/useHandoffs';
import {
  listWorkingMemory,
  createWorkingMemory,
  archiveWorkingMemory,
  unarchiveWorkingMemory,
  promoteWorkingMemory,
  splitWorkingMemory
} from '../api/workingMemory';
import { buildNotebookDraftFromConcept } from '../utils/conceptNotebookDraft';
import useAgentThreads from '../hooks/useAgentThreads';
import useProtocolApprovals from '../hooks/useProtocolApprovals';
import useProtocolHookRuns from '../hooks/useProtocolHookRuns';
import useAgentArtifactDrafts from '../hooks/useAgentArtifactDrafts';
import useAgentUpkeepCycles from '../hooks/useAgentUpkeepCycles';
import { createAgentThread, createAutoAgentHandoff, createAgentUpkeepCycle } from '../api/agent';
import {
  buildConceptAmbientContext,
  buildHandoffAmbientContext,
  buildHomeAmbientContext,
  buildNotebookAmbientContext,
  buildQuestionAmbientContext,
  makeAmbientRelatedItem
} from '../utils/ambientAgentContext';
import { buildQueuedAgentSkillPrompt } from '../utils/agentSkillInvocation';
import { buildConceptAgentHandoffPayload } from '../utils/conceptAgentHandoff';
import { buildThinkWikiPromotionPayload } from '../utils/thinkWikiPromotion';
import { classifyHomeUniversalCommand } from '../utils/homeUniversalCommand';
import { navigateWithViewTransition } from '../utils/viewTransitionNavigation';
import { AGENT_DISPLAY_NAME } from '../constants/agentIdentity';
import { CalmEmptyLine, SidebarSkeletonRows } from '../components/think/EditorialRail';
import ThinkShelfRail from '../components/think/ThinkShelfRail';
import CalmIndexView from '../components/think/CalmIndexView';
import ThinkHomeUniversalCommand from '../components/think/ThinkHomeUniversalCommand';
import {
  buildConceptIndexMotion,
  buildQuestionIndexMotion,
  buildNotebookIndexMotion,
  buildHomeIndexMotion,
  composeConceptIndexOrientation,
  composeQuestionIndexOrientation,
  composeNotebookIndexOrientation,
  composeHomeIndexOrientation,
  composeCruftSuppressionNotice,
  countSuppressedInCollection,
  describeThreadMotionNote
} from '../components/think/calmIndexModel';

const NotebookFolderTree = lazy(() => import('../components/think/notebook/NotebookFolderTree'));
const NotebookMoveEntryModal = lazy(() => import('../components/think/notebook/NotebookMoveEntryModal'));
const NotebookEditorialView = lazy(() => import('../components/think/notebook/NotebookEditorialView'));
const LibraryConceptModal = lazy(() => import('../components/library/LibraryConceptModal'));
const LibraryNotebookModal = lazy(() => import('../components/library/LibraryNotebookModal'));
const LibraryQuestionModal = lazy(() => import('../components/library/LibraryQuestionModal'));
const SynthesisModal = lazy(() => import('../components/think/SynthesisModal'));
const WorkingMemoryPanel = lazy(() => import('../components/working-memory/WorkingMemoryPanel'));
const ThoughtPartnerPanel = lazy(() => import('../components/agent/ThoughtPartnerPanel'));
const AgentSkillDock = lazy(() => import('../components/agent/AgentSkillDock'));
const AgentArtifactDraftsPanel = lazy(() => import('../components/agent/AgentArtifactDraftsPanel'));
const UpkeepCyclesPanel = lazy(() => import('../components/agent/UpkeepCyclesPanel'));
const ConceptTemplatePickerModal = lazy(() => import('../components/think/concepts/ConceptTemplatePickerModal'));
const ConceptEvidenceStreamView = lazy(() => import('../components/think/concepts/ConceptEvidenceStreamView'));
const ConceptEvidenceStreamRail = lazy(() => import('../components/think/concepts/ConceptEvidenceStreamView')
  .then((module) => ({ default: module.ConceptEvidenceStreamRail })));
const ConceptPartnerRail = lazy(() => import('../components/think/concepts/ConceptEvidenceStreamView')
  .then((module) => ({ default: module.ConceptPartnerRail })));
const ConceptShareModal = lazy(() => import('../components/think/concepts/ConceptShareModal'));
const QuestionShareModal = lazy(() => import('../components/think/questions/QuestionShareModal'));
const SemanticRelatedPanel = lazy(() => import('../components/retrieval/SemanticRelatedPanel'));
const QuestionEditorialView = lazy(() => import('../components/think/questions/QuestionEditorialView'));
const InsightsPanel = lazy(() => import('../components/think/insights/InsightsPanel'));
const ProtocolRouteView = lazy(() => import('../components/think/protocol/ProtocolRouteView'));
const PathsRouteView = lazy(() => import('../components/think/paths/PathsRouteView'));

const THINK_RIGHT_STORAGE_KEY = 'workspace-right-open:/think';
const THINK_RIGHT_MIGRATION_KEY = 'workspace-right-open:/think:migrated-v2';
const THINK_RECENTS_STORAGE_KEY = 'think.recent.targets';
const THINK_INDEX_GROUPS_STORAGE_KEY = 'think.index.groups.collapsed';
const HOME_COMMAND_REFERENCES_STORAGE_KEY = 'noeis.homeCommand.pendingReferences';
const THINK_CONCEPT_ROW_HEIGHT = 46;
const THINK_QUESTION_ROW_HEIGHT = 60;
const THINK_HOME_LIMIT = 6;
const CONCEPT_COMPOSER_DEFAULT_STATE = { message: '', tone: 'success' };
const cleanText = (value = '') => String(value || '').trim();

const normalizeHomeReferenceConnectionType = (type = '') => {
  const candidate = cleanText(type).toLowerCase();
  if (candidate === 'wiki') return 'wiki_page';
  if (candidate === 'note' || candidate === 'notebook_entry') return 'notebook';
  return candidate;
};

const normalizeHomeCommandReferences = (references = []) => (
  Array.isArray(references)
    ? references
      .map((reference) => ({
        itemType: normalizeHomeReferenceConnectionType(reference?.itemType || reference?.type),
        itemId: cleanText(reference?.itemId || reference?.id || reference?._id),
        title: cleanText(reference?.title || reference?.label),
        articleId: cleanText(reference?.articleId || reference?.metadata?.articleId),
        snippet: cleanText(reference?.snippet || reference?.text || reference?.description)
      }))
      .filter(reference => reference.itemType && reference.itemId)
      .slice(0, 8)
    : []
);

const persistHomeCommandReferences = (references = []) => {
  const normalizedReferences = normalizeHomeCommandReferences(references);
  try {
    if (normalizedReferences.length > 0) {
      sessionStorage.setItem(HOME_COMMAND_REFERENCES_STORAGE_KEY, JSON.stringify(normalizedReferences));
    } else {
      sessionStorage.removeItem(HOME_COMMAND_REFERENCES_STORAGE_KEY);
    }
  } catch (error) {
    // Best-effort handoff only; route still works without session storage.
  }
  return normalizedReferences;
};
const pulledReferenceKey = (item = {}) => `${cleanText(item.itemType || item.type)}:${cleanText(item.itemId || item.id)}`;
const pulledReferenceRelatedItem = (item = {}) => ({
  type: cleanText(item.itemType || item.type),
  id: cleanText(item.itemId || item.id),
  title: cleanText(item.title || item.label || item.url || item.snippet),
  snippet: cleanText(item.snippet || item.description || item.url)
});
const normalizeNotebookFolderId = (value = '') => String(value || '').trim();
const THINK_SUB_NAV_ITEMS = [
  { value: 'concepts', label: 'Generative', meta: 'Concept', ariaLabel: 'Generative concept posture' },
  { value: 'notebook', label: 'Quiet', meta: 'Notebook', ariaLabel: 'Quiet notebook posture' },
  { value: 'questions', label: 'Dialectical', meta: 'Question', ariaLabel: 'Dialectical question posture' }
];

const THINK_POSTURE_OPTIONS = [
  {
    value: 'concept',
    label: 'Concept',
    summary: 'Builder mode: develop one idea, pull related material, and decide what deserves structure.'
  },
  {
    value: 'question',
    label: 'Question',
    summary: 'Challenger mode: pressure-test claims, ask what would change your mind, and surface counter-evidence.'
  },
  {
    value: 'notebook',
    label: 'Notebook',
    summary: 'Quiet mode: keep loose notes nearby until they are ready to become a concept, question, or draft.'
  }
];

const THINK_POSTURE_BY_VIEW = {
  concepts: 'concept',
  questions: 'question',
  notebook: 'notebook'
};

const THINK_VIEW_BY_POSTURE = {
  concept: 'concepts',
  question: 'questions',
  notebook: 'notebook'
};

const THINK_ADVANCED_NAV_ITEMS = [
  { value: 'threads', label: 'Threads' },
  { value: 'handoffs', label: 'Handoffs' },
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

const readCollapsedIndexGroups = () => {
  const fallback = { notebook: false, concepts: false, questions: false };
  try {
    const raw = localStorage.getItem(THINK_INDEX_GROUPS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    return {
      notebook: Boolean(parsed.notebook),
      concepts: Boolean(parsed.concepts),
      questions: Boolean(parsed.questions)
    };
  } catch (error) {
    return fallback;
  }
};

const formatAiError = (err, fallback = 'Request failed.') => {
  if (!err?.response && /network error/i.test(String(err?.message || ''))) {
    return 'Could not reach the server.';
  }
  const status = err?.response?.status;
  const data = err?.response?.data;
  const detail = typeof data?.detail === 'string' ? data.detail : '';
  const provider = typeof data?.provider === 'string' ? data.provider : '';
  const model = typeof data?.model === 'string' ? data.model : '';
  const message = typeof data?.message === 'string' ? data.message : '';
  if (status === 400 && detail === 'HF model not supported by enabled provider') {
    return `Thought partner model configuration issue (${provider || 'unknown provider'} / ${model || 'unknown model'}). Ask admin to update HF_TEXT_MODEL or HF_PROVIDER.`;
  }
  if (status === 429 && detail === 'HF credits depleted') {
    return 'Thought partner credits are depleted. Buy Hugging Face credits or wait for reset.';
  }
  if (status === 502 && /service error 429/i.test(message)) {
    return 'Thought partner provider is temporarily rate-limited. Please retry in a minute.';
  }
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

const formatIndexDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
};

const NotebookListItem = React.memo(({ entry, isActive, onSelect }) => (
  <button
    type="button"
    className={`think-index__row ${isActive ? 'is-active' : ''}`}
    onClick={() => onSelect(entry._id)}
  >
    <span className="think-index__row-title">{entry.title || 'Untitled'}</span>
    <span className="think-index__row-meta">{formatIndexDate(entry.updatedAt)}</span>
  </button>
));

const ConceptListItem = React.memo(({ conceptItem, isActive, onSelect }) => (
  <button
    type="button"
    className={`think-index__row ${isActive ? 'is-active' : ''}`}
    onClick={() => onSelect(conceptItem.name)}
  >
    <span className="think-index__row-title">{conceptItem.name}</span>
    {Number.isFinite(conceptItem.count) && (
      <span className="think-index__row-meta">{conceptItem.count}</span>
    )}
  </button>
));

const QuestionListItem = React.memo(({ question, isActive, onOpen }) => (
  <button
    type="button"
    className={`think-index__row ${isActive ? 'is-active' : ''}`}
    onClick={() => onOpen(question._id)}
  >
    <span className="think-index__row-title">{question.text || 'Untitled question'}</span>
    <span className="think-index__row-meta">{question.linkedTagName || 'Uncategorized'}</span>
  </button>
));

const PartnerLineList = React.memo(({ items = [], emptyMessage = 'Nothing here yet.' }) => (
  items.length > 0 ? <ul>{items}</ul> : <p>{emptyMessage}</p>
));

const ThinkPanelFallback = () => (
  <div className="section-stack">
    <p className="muted small">Loading workspace…</p>
  </div>
);

const ThinkMode = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryConcept = searchParams.get('concept') || '';
  const allowedViews = useMemo(() => ['home', 'notebook', 'concepts', 'questions', 'threads', 'handoffs', 'paths', 'insights'], []);
  const resolveActiveView = useCallback((params) => {
    const rawView = params.get('tab') || '';
    if (allowedViews.includes(rawView)) return rawView;
    if (params.get('entryId')) return 'notebook';
    if (params.get('questionId')) return 'questions';
    if (params.get('concept')) return 'concepts';
    if (params.get('threadId')) return 'threads';
    if (params.get('handoffId')) return 'handoffs';
    if (params.get('pathId')) return 'paths';
    return 'concepts';
  }, [allowedViews]);
  const activeView = resolveActiveView(searchParams);
  const [notebookEditorialSection, setNotebookEditorialSection] = useState('assistant');
  const [questionEditorialSection, setQuestionEditorialSection] = useState('assistant');
  const [queuedThoughtPartnerPrompt, setQueuedThoughtPartnerPrompt] = useState(null);
  const selectedPathId = searchParams.get('pathId') || '';
  const selectedHandoffId = searchParams.get('handoffId') || '';
  const selectedThreadId = searchParams.get('threadId') || '';
  const shouldOpenReferencePullIn = searchParams.get('pull') === '1';
  const [search, setSearch] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [conceptError, setConceptError] = useState('');
  const [activeNotebookEntry, setActiveNotebookEntry] = useState(null);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const highlightSearchEnabled = (
    activeView === 'notebook'
    || activeView === 'questions'
    || activeView === 'paths'
    || activeView === 'insights'
  );
  const highlightsEnabled = activeView === 'home' || highlightSearchEnabled;
  const questionsListEnabled = activeView === 'home' || activeView === 'questions';
  const notebookListEnabled = activeView === 'home' || activeView === 'notebook';
  const notebookFoldersEnabled = activeView === 'notebook';
  const conceptsListEnabled = activeView === 'home' || activeView === 'concepts';
  const workingMemoryEnabled = activeView !== 'concepts';
  const { highlightMap, highlights: allHighlights } = useHighlights({ enabled: highlightsEnabled });
  const { tags } = useTags({ enabled: highlightSearchEnabled });
  const notebookInsertRef = useRef(null);
  const questionInsertRef = useRef(null);
  const [highlightQuery, setHighlightQuery] = useState('');
  const [highlightTag, setHighlightTag] = useState('');
  const [highlightArticle, setHighlightArticle] = useState('');
  const [questionStatus, setQuestionStatus] = useState('open');
  const [activeQuestionId, setActiveQuestionId] = useState('');
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [highlightConceptModal, setHighlightConceptModal] = useState({ open: false, highlight: null });
  const [highlightNotebookModal, setHighlightNotebookModal] = useState({ open: false, highlight: null });
  const [highlightQuestionModal, setHighlightQuestionModal] = useState({ open: false, highlight: null });
  const [conceptRelated, setConceptRelated] = useState({ highlights: [], concepts: [] });
  const [conceptRelatedLoading, setConceptRelatedLoading] = useState(false);
  const [conceptRelatedError, setConceptRelatedError] = useState('');
  const [conceptSuggestions, setConceptSuggestions] = useState([]);
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
  const [pulledThinkReferences, setPulledThinkReferences] = useState([]);
  const [wikiPromotionState, setWikiPromotionState] = useState({ busyTarget: '', error: '', phase: '' });

  const [notebookEntries, setNotebookEntries] = useState([]);
  const [notebookFolders, setNotebookFolders] = useState([]);
  const [notebookActiveId, setNotebookActiveId] = useState('');
  const [notebookLoadingList, setNotebookLoadingList] = useState(false);
  const [notebookFoldersLoading, setNotebookFoldersLoading] = useState(false);
  const [notebookLoadingEntry, setNotebookLoadingEntry] = useState(false);
  const [notebookSaving, setNotebookSaving] = useState(false);
  const [notebookListError, setNotebookListError] = useState('');
  const [notebookFoldersError, setNotebookFoldersError] = useState('');
  const [notebookEntryError, setNotebookEntryError] = useState('');
  const [notebookMoveModalEntry, setNotebookMoveModalEntry] = useState(null);
  const [notebookMovePendingId, setNotebookMovePendingId] = useState('');
  const [notebookMoveError, setNotebookMoveError] = useState('');
  const [workingMemoryItems, setWorkingMemoryItems] = useState([]);
  const [workingMemoryLoading, setWorkingMemoryLoading] = useState(false);
  const [workingMemoryError, setWorkingMemoryError] = useState('');
  const [workingMemoryView, setWorkingMemoryView] = useState('active');
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const [cardsExpandVersion, setCardsExpandVersion] = useState(0);
  const [recentTargets, setRecentTargets] = useState(() => readRecentTargets());
  const [, setHomeArticles] = useState([]);
  const [, setHomeArticlesLoading] = useState(false);
  const [homeArticlesError, setHomeArticlesError] = useState('');
  const [, setHomeWikiPages] = useState([]);
  const [homeWikiActivity, setHomeWikiActivity] = useState([]);
  const [homeReturnQueue, setHomeReturnQueue] = useState([]);
  const [collapsedIndexGroups, setCollapsedIndexGroups] = useState(() => readCollapsedIndexGroups());
  const [rightOpen, setRightOpen] = useState(() => {
    try {
      const migrated = localStorage.getItem(THINK_RIGHT_MIGRATION_KEY) === 'true';
      if (!migrated) {
        localStorage.setItem(THINK_RIGHT_STORAGE_KEY, 'false');
        localStorage.setItem(THINK_RIGHT_MIGRATION_KEY, 'true');
        return false;
      }
      const stored = localStorage.getItem(THINK_RIGHT_STORAGE_KEY);
      if (stored === null) return false;
      return stored === 'true';
    } catch (error) {
      return false;
    }
  });

  const handleOpenHandoff = useCallback((handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'handoffs');
    params.set('handoffId', safeId);
    params.delete('scopeType');
    params.delete('scopeId');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleOpenThread = useCallback((threadId) => {
    const safeId = String(threadId || '').trim();
    if (!safeId) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'threads');
    params.set('threadId', safeId);
    params.delete('scopeType');
    params.delete('scopeId');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!shouldOpenReferencePullIn) return;
    setRightOpen(true);
    const params = new URLSearchParams(searchParams);
    params.delete('pull');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, shouldOpenReferencePullIn]);

  const threadsModel = useAgentThreads({
    enabled: activeView === 'threads',
    selectedThreadId,
    onOpenThread: handleOpenThread,
    onProtocolApprovalQueued: async () => {
      await protocolApprovalsModel.loadProtocolApprovals?.();
    }
  });

  const handoffsModel = useHandoffs({
    enabled: activeView === 'handoffs',
    selectedHandoffId,
    onOpenHandoff: handleOpenHandoff,
    onOpenThread: handleOpenThread,
    onProtocolApprovalQueued: async () => {
      await protocolApprovalsModel.loadProtocolApprovals?.();
    }
  });

  const {
    threads,
    activeThreadData
  } = threadsModel;

  const {
    handoffs,
    activeHandoffData,
  } = handoffsModel;

  const handleProtocolApprovalChanged = useCallback(async () => {
    await Promise.all([
      threadsModel.loadThreads?.(),
      handoffsModel.loadHandoffs?.()
    ]);
  }, [handoffsModel, threadsModel]);

  const protocolApprovalsModel = useProtocolApprovals({
    initialStatus: 'pending',
    limit: 20,
    autoLoad: activeView === 'threads' || activeView === 'handoffs',
    onChanged: handleProtocolApprovalChanged
  });

  const threadApprovalHistoryModel = useProtocolApprovals({
    initialStatus: 'all',
    limit: 8,
    threadId: activeThreadData?.threadId || '',
    autoLoad: activeView === 'threads' && Boolean(activeThreadData?.threadId),
    onChanged: handleProtocolApprovalChanged
  });

  const handoffApprovalHistoryModel = useProtocolApprovals({
    initialStatus: 'all',
    limit: 8,
    handoffId: activeHandoffData?.handoffId || '',
    autoLoad: activeView === 'handoffs' && Boolean(activeHandoffData?.handoffId),
    onChanged: handleProtocolApprovalChanged
  });

  const threadHookRunsModel = useProtocolHookRuns({
    threadId: activeThreadData?.threadId || '',
    limit: 8,
    autoLoad: activeView === 'threads' && Boolean(activeThreadData?.threadId)
  });

  const handoffHookRunsModel = useProtocolHookRuns({
    handoffId: activeHandoffData?.handoffId || '',
    limit: 8,
    autoLoad: activeView === 'handoffs' && Boolean(activeHandoffData?.handoffId)
  });

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

  const normalizeConceptName = useCallback((value = '') => (
    String(value || '').replace(/\s+/g, ' ').trim()
  ), []);

  const [conceptComposerOpen, setConceptComposerOpen] = useState(false);
  const [conceptComposerAnchor, setConceptComposerAnchor] = useState('header');
  const [conceptComposerDraft, setConceptComposerDraft] = useState('');
  const [conceptComposerDescriptionDraft, setConceptComposerDescriptionDraft] = useState('');
  const [conceptComposerAutoScout, setConceptComposerAutoScout] = useState(true);
  const [conceptComposerSaving, setConceptComposerSaving] = useState(false);
  const [conceptComposerScouting, setConceptComposerScouting] = useState(false);
  const [conceptComposerStatus, setConceptComposerStatus] = useState(CONCEPT_COMPOSER_DEFAULT_STATE);
  const [conceptEditorialEditor, setConceptEditorialEditor] = useState(null);
  const [conceptReceivingDrop, setConceptReceivingDrop] = useState(false);
  const [conceptEditorialSection, setConceptEditorialSection] = useState('assistant');
  const [conceptPartnerCollapsed, setConceptPartnerCollapsed] = useState(false);
  const [conceptShareModalOpen, setConceptShareModalOpen] = useState(false);
  const [questionShareModalOpen, setQuestionShareModalOpen] = useState(false);
  const conceptComposerInputRef = useRef(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [headerNewMenuOpen, setHeaderNewMenuOpen] = useState(false);
  const [headerActionsMenuOpen, setHeaderActionsMenuOpen] = useState(false);
  const headerNewMenuRef = useRef(null);
  const headerActionsMenuRef = useRef(null);

  const { concepts, loading: conceptsLoading, error: conceptsError, refresh: refreshConcepts } = useConcepts({ enabled: conceptsListEnabled });
  const selectedName = queryConcept;
  // Seed useConcept with the row from the already-loaded concepts list so the
  // manuscript renders its title immediately on click instead of showing a
  // full skeleton for the duration of the network round-trip.
  const cachedConceptForName = useMemo(
    () => (selectedName ? (concepts || []).find((c) => c?.name === selectedName) || null : null),
    [concepts, selectedName]
  );
  const { concept, loading: conceptLoading, error: conceptLoadError, refresh, setConcept } = useConcept(selectedName, {
    enabled: activeView === 'concepts' && Boolean(selectedName),
    initial: cachedConceptForName
  });
  const { related, error: relatedError } = useConceptRelated(selectedName, {
    enabled: activeView === 'concepts' && Boolean(selectedName),
    limit: 20,
    offset: 0
  });
  const {
    questions: conceptQuestions,
    setQuestions: setConceptQuestions
  } = useQuestions({
    conceptName: selectedName,
    status: 'open',
    enabled: activeView === 'concepts' && Boolean(selectedName)
  });

  const searchQuery = useMemo(() => search.trim().toLowerCase(), [search]);
  const filteredConcepts = useMemo(() => {
    if (!searchQuery) return concepts;
    return concepts.filter(c => c.name.toLowerCase().includes(searchQuery));
  }, [concepts, searchQuery]);
  const conceptIndexMotion = useMemo(
    () => buildConceptIndexMotion(filteredConcepts),
    [filteredConcepts]
  );

  const conceptIndexOrientation = useMemo(
    () => composeConceptIndexOrientation(conceptIndexMotion),
    [conceptIndexMotion]
  );

  const findExistingConcept = useCallback((name) => {
    const normalized = normalizeConceptName(name).toLowerCase();
    if (!normalized) return null;
    return concepts.find((item) => normalizeConceptName(item.name).toLowerCase() === normalized) || null;
  }, [concepts, normalizeConceptName]);
  const filteredNotebookEntries = useMemo(() => {
    if (!searchQuery) return notebookEntries;
    return notebookEntries.filter((entry) =>
      (entry.title || 'Untitled').toLowerCase().includes(searchQuery)
    );
  }, [notebookEntries, searchQuery]);

  const pinnedHighlightIds = useMemo(() => concept?.pinnedHighlightIds || [], [concept?.pinnedHighlightIds]);
  const pinnedArticles = useMemo(() => concept?.pinnedArticles || [], [concept?.pinnedArticles]);
  const pinnedNotes = useMemo(() => concept?.pinnedNotes || [], [concept?.pinnedNotes]);
  const createNotebookEntry = useCallback(async (payload = {}) => {
    setNotebookSaving(true);
    setNotebookEntryError('');
    try {
      const requestPayload = {
        title: typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'Untitled',
        content: typeof payload.content === 'string' ? payload.content : '',
        blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
        ...(Array.isArray(payload.tags) ? { tags: payload.tags } : {}),
        ...(typeof payload.type === 'string' && payload.type.trim() ? { type: payload.type.trim() } : {}),
        ...(typeof payload.source === 'string' && payload.source.trim() ? { source: payload.source.trim() } : {}),
        ...(payload.importMeta && typeof payload.importMeta === 'object' ? { importMeta: payload.importMeta } : {})
      };
      const res = await api.post('/api/notebook', requestPayload, getAuthHeaders());
      const created = res.data;
      setNotebookEntries(prev => [created, ...prev]);
      setNotebookActiveId(created._id);
      setActiveNotebookEntry(created);
      const params = new URLSearchParams(searchParams);
      params.set('tab', 'notebook');
      params.delete('concept');
      params.delete('questionId');
      params.delete('threadId');
      params.delete('handoffId');
      params.delete('pathId');
      params.delete('scopeType');
      params.delete('scopeId');
      setSearchParams(params);
      return created;
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to create note.';
      setNotebookEntryError(message);
      throw err;
    } finally {
      setNotebookSaving(false);
    }
  }, [searchParams, setSearchParams]);
  const ideaWorkbenchModel = useIdeaWorkbenchModel({
    concept,
    related,
    questions: conceptQuestions,
    onCreateNotebookDraft: ({
      concept: activeConcept,
      state,
      currentMaturity,
      hypothesisVersion,
      template = ''
    }) => {
      const notebookDraft = buildNotebookDraftFromConcept({
        concept: activeConcept,
        state,
        currentMaturity,
        hypothesisVersion,
        template
      });
      const { conceptContext: _conceptContext, ...requestPayload } = notebookDraft;
      return createNotebookEntry(requestPayload);
    },
    onCreateConceptHandoff: ({
      concept: activeConcept,
      state,
      currentMaturity,
      hypothesisVersion,
      requestedActorId = '',
      requestedActorName = ''
    }) => {
      const payload = buildConceptAgentHandoffPayload({
        concept: activeConcept,
        state,
        currentMaturity,
        hypothesisVersion,
        requestedActorId,
        requestedActorName
      });
      return handoffsModel.handleCreateScopedHandoff(payload);
    }
  });

  const handleIntegrateConceptCard = useCallback((cardInput, dropEvent = null, editorOverride = null) => {
    const streamCard = cardInput && typeof cardInput === 'object' ? cardInput : null;
    const safeId = cleanText(streamCard?.id || cardInput);
    if (!safeId && !streamCard) return;
    const existingCard = safeId
      ? ideaWorkbenchModel.state.cards.find((item) => String(item.id) === safeId)
      : null;
    const card = existingCard || streamCard;
    if (!card) return;
    if (!existingCard && streamCard) {
      ideaWorkbenchModel.actions.addSuggestedCard(streamCard, streamCard.zone || 'workspace');
    }
    const editor = editorOverride || conceptEditorialEditor;
    const html = formatEditorialEvidenceHtml(card);
    if (!editor) {
      if (existingCard && safeId) {
        ideaWorkbenchModel.actions.insertCardIntoHypothesis(safeId);
        return;
      }
      ideaWorkbenchModel.actions.updateHypothesisHtml(
        `${ideaWorkbenchModel.state.hypothesis.html || '<p></p>'}${html}`
      );
      return;
    }
    setConceptReceivingDrop(Boolean(dropEvent));
    window.requestAnimationFrame(() => {
      const coords = dropEvent
        ? editor.view.posAtCoords({ left: dropEvent.clientX, top: dropEvent.clientY })
        : null;
      const targetPos = coords?.pos ?? editor.state.selection.from;
      editor.chain().focus().insertContentAt(targetPos, html).run();
      setConceptReceivingDrop(false);
    });
  }, [conceptEditorialEditor, ideaWorkbenchModel]);

  const questionQuery = useQuestions({
    status: questionStatus,
    enabled: questionsListEnabled
  });
  const { questions: allQuestions, loading: allQuestionsLoading, error: allQuestionsError, setQuestions: setAllQuestions } = questionQuery;
  const filteredQuestions = useMemo(() => {
    if (!searchQuery) return allQuestions;
    return allQuestions.filter((question) => (question.text || '').toLowerCase().includes(searchQuery));
  }, [allQuestions, searchQuery]);

  const questionIndexMotion = useMemo(
    () => buildQuestionIndexMotion(filteredQuestions),
    [filteredQuestions]
  );

  const questionIndexOrientation = useMemo(
    () => composeQuestionIndexOrientation(questionIndexMotion),
    [questionIndexMotion]
  );

  const notebookIndexMotion = useMemo(
    () => buildNotebookIndexMotion(filteredNotebookEntries),
    [filteredNotebookEntries]
  );

  const notebookIndexOrientation = useMemo(
    () => composeNotebookIndexOrientation(notebookIndexMotion),
    [notebookIndexMotion]
  );

  const homeIndexMotion = useMemo(
    () => buildHomeIndexMotion({
      concepts: filteredConcepts,
      questions: filteredQuestions.filter((item) => String(item?.status || '').toLowerCase() !== 'answered'),
      notebookEntries: filteredNotebookEntries,
      returnQueueEntries: homeReturnQueue,
      wikiActivity: homeWikiActivity
    }),
    [filteredConcepts, filteredNotebookEntries, filteredQuestions, homeReturnQueue, homeWikiActivity]
  );

  const homeIndexOrientation = useMemo(
    () => composeHomeIndexOrientation(homeIndexMotion, { returnQueueEntries: homeReturnQueue }),
    [homeIndexMotion, homeReturnQueue]
  );

  const homeCruftNotice = useMemo(
    () => composeCruftSuppressionNotice(
      countSuppressedInCollection([
        ...concepts,
        ...allQuestions,
        ...notebookEntries,
        ...(Array.isArray(homeWikiActivity) ? homeWikiActivity : [])
      ])
    ),
    [allQuestions, concepts, homeWikiActivity, notebookEntries]
  );

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

  const toggleIndexGroup = useCallback((groupName) => {
    const key = String(groupName || '').trim();
    if (!key) return;
    setCollapsedIndexGroups((previous) => {
      const next = { ...previous, [key]: !previous[key] };
      try {
        localStorage.setItem(THINK_INDEX_GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch (_error) {
        // Ignore localStorage write errors.
      }
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
    if (requestedId && !target) {
      setActiveQuestionId('');
      setActiveQuestion(null);
      return;
    }
    if (activeQuestionId && !allQuestions.some(q => q._id === activeQuestionId)) {
      setActiveQuestionId('');
      setActiveQuestion(null);
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
      return;
    }
    let cancelled = false;
    const fetchRelatedAndSuggestions = async () => {
      const startedAt = startPerfTimer();
      setConceptRelatedLoading(true);
      setConceptRelatedError('');
      try {
        const relatedParams = new URLSearchParams({
          sourceType: 'concept',
          sourceId: String(concept._id),
          limit: '12',
          resultTypes: 'concept'
        });
        const [relatedRes, suggestionRes] = await Promise.all([
          api.get(`/api/semantic/related?${relatedParams.toString()}`, getAuthHeaders()),
          api.get(`/api/concepts/${concept._id}/suggestions?limit=12`, getAuthHeaders())
        ]);
        if (cancelled) return;
        const items = relatedRes.data?.results || [];
        setConceptRelated({
          highlights: [],
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
        }
      } finally {
        if (!cancelled) {
          setConceptRelatedLoading(false);
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
        const response = await api.get('/api/ai/health', getAuthHeaders());
        if (!cancelled) {
          if (response?.data?.status === 'disabled' || response?.data?.error === 'AI_DISABLED') {
            setAiHealthError('Partner insights are currently disabled. Use themes and connections later, but keep working in concepts, notebook, and questions now.');
            setAiHealthStatus('disabled');
          } else {
            setAiHealthStatus('ok');
          }
        }
      } catch (err) {
        if (cancelled) return;
        const code = err.response?.data?.error;
        if (code === 'AI_DISABLED') {
          setAiHealthError('Partner insights are currently disabled. Enable the partner service on the server to restore this tab.');
        } else {
          setAiHealthError('Partner insights are temporarily unavailable. You can keep working while we reconnect.');
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
          setContextConnectionsError(
            err?.response?.data?.error
            || (!err?.response && /network error/i.test(String(err?.message || '')) ? 'Could not reach the server.' : 'Failed to load scoped connections.')
          );
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

  const loadNotebookEntries = useCallback(async ({ force = false } = {}) => {
    const startedAt = startPerfTimer();
    setNotebookLoadingList(true);
    setNotebookListError('');
    try {
      const data = await getNotebookSummaries({ force });
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
        setNotebookActiveId('');
        setActiveNotebookEntry(null);
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
    if (!notebookListEnabled) return;
    loadNotebookEntries();
  }, [loadNotebookEntries, notebookListEnabled]);

  const loadNotebookFolders = useCallback(async ({ force = false } = {}) => {
    setNotebookFoldersLoading(true);
    setNotebookFoldersError('');
    try {
      const data = await getNotebookFolders({ force });
      setNotebookFolders(Array.isArray(data) ? data : []);
    } catch (err) {
      setNotebookFoldersError(err.response?.data?.error || 'Failed to load notebook folders.');
      setNotebookFolders([]);
    } finally {
      setNotebookFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!notebookFoldersEnabled) return;
    loadNotebookFolders();
  }, [loadNotebookFolders, notebookFoldersEnabled]);

  const handleArtifactDraftChanged = useCallback(async (result) => {
    await Promise.all([
      threadsModel.loadThreads?.(),
      handoffsModel.loadHandoffs?.()
    ]);

    const artifactType = String(result?.draft?.artifactType || '').trim().toLowerCase();
    const promoted = result?.promoted || null;
    if (!promoted || !artifactType) return;

    if (artifactType === 'note' && promoted?._id) {
      await loadNotebookEntries({ force: true });
      return;
    }

    if (artifactType === 'concept') {
      await refreshConcepts();
      if (selectedName && String(promoted?.name || '').trim().toLowerCase() === String(selectedName).trim().toLowerCase()) {
        await refresh();
      }
      return;
    }

    if (artifactType === 'question' && promoted?._id) {
      setAllQuestions((prev) => {
        const existing = Array.isArray(prev) ? prev : [];
        const remaining = existing.filter((item) => item?._id !== promoted._id);
        return [promoted, ...remaining];
      });
    }
  }, [handoffsModel, loadNotebookEntries, refresh, refreshConcepts, selectedName, setAllQuestions, threadsModel]);

  const sharedArtifactDraftsModel = useAgentArtifactDrafts({
    status: 'all',
    autoLoad: activeView !== 'threads' && activeView !== 'handoffs' && activeView !== 'concepts',
    onChanged: handleArtifactDraftChanged
  });

  const activeProtocolThreadId = activeView === 'threads'
    ? (activeThreadData?.threadId || '')
    : activeView === 'handoffs'
      ? (activeHandoffData?.threadId || '')
      : '';

  const protocolArtifactDraftsModel = useAgentArtifactDrafts({
    status: 'all',
    threadId: activeProtocolThreadId,
    autoLoad: Boolean(activeProtocolThreadId),
    onChanged: handleArtifactDraftChanged
  });

  const upkeepCyclesModel = useAgentUpkeepCycles({
    status: 'all',
    limit: 12,
    autoLoad: activeView === 'home' || activeView === 'threads' || activeView === 'handoffs',
    onChanged: async () => {
      await Promise.all([
        threadsModel.loadThreads?.(),
        handoffsModel.loadHandoffs?.()
      ]);
    }
  });

  useEffect(() => {
    if (activeView !== 'handoffs') return;
    if (handoffs.length === 0) {
      if (!selectedHandoffId) return;
      const params = new URLSearchParams(searchParams);
      params.delete('handoffId');
      setSearchParams(params, { replace: true });
      return;
    }
    const exists = selectedHandoffId && handoffs.some((row) => String(row?.handoffId || '') === selectedHandoffId);
    if (exists) return;
    const nextId = String(handoffs[0]?.handoffId || '').trim();
    if (!nextId) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'handoffs');
    params.set('handoffId', nextId);
    setSearchParams(params, { replace: true });
  }, [activeView, handoffs, searchParams, selectedHandoffId, setSearchParams]);

  useEffect(() => {
    if (activeView !== 'threads') return;
    const hasSelectedThread = selectedThreadId
      && (threads.some((row) => String(row?.threadId || '') === selectedThreadId)
        || String(activeThreadData?.threadId || '') === selectedThreadId);
    if (selectedThreadId) {
      return;
    }
    if (threads.length === 0) {
      if (!selectedThreadId || hasSelectedThread) return;
      const params = new URLSearchParams(searchParams);
      params.delete('threadId');
      setSearchParams(params, { replace: true });
      return;
    }
    if (hasSelectedThread) return;
    const nextId = String(threads[0]?.threadId || '').trim();
    if (!nextId) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'threads');
    params.set('threadId', nextId);
    setSearchParams(params, { replace: true });
  }, [activeThreadData?.threadId, activeView, searchParams, selectedThreadId, setSearchParams, threads]);

  useEffect(() => {
    if (activeView !== 'home') return;
    let cancelled = false;
    const loadThinkHomeData = async () => {
      setHomeArticlesLoading(true);
      setHomeArticlesError('');
      try {
        const [queueResult, articleResult, wikiPagesResult, wikiActivityResult] = await Promise.allSettled([
          listReturnQueue({ filter: 'all' }),
          getArticles({ sort: 'recent', limit: THINK_HOME_LIMIT }),
          listWikiPages({ limit: 500 }),
          listWikiActivity({ limit: THINK_HOME_LIMIT })
        ]);
        if (cancelled) return;
        const queueRows = queueResult.status === 'fulfilled' ? queueResult.value : [];
        const articleRows = articleResult.status === 'fulfilled' ? articleResult.value : [];
        const wikiPageRows = wikiPagesResult.status === 'fulfilled' ? wikiPagesResult.value : [];
        const wikiActivityRows = wikiActivityResult.status === 'fulfilled' ? wikiActivityResult.value : [];
        setHomeReturnQueue(Array.isArray(queueRows) ? queueRows.slice(0, THINK_HOME_LIMIT) : []);
        setHomeArticles(Array.isArray(articleRows) ? articleRows.slice(0, THINK_HOME_LIMIT) : []);
        setHomeWikiPages(Array.isArray(wikiPageRows) ? wikiPageRows : []);
        setHomeWikiActivity(Array.isArray(wikiActivityRows) ? wikiActivityRows.slice(0, THINK_HOME_LIMIT) : []);
        const failed = [articleResult, wikiPagesResult, wikiActivityResult].find(result => result.status === 'rejected');
        if (failed) {
          const message = failed.reason?.response?.data?.error || 'Failed to load Think home.';
          setHomeArticlesError(message);
        }
      } catch (homeError) {
        if (!cancelled) {
          const message = homeError?.response?.data?.error || 'Failed to load Think home.';
          setHomeArticlesError(message);
        }
      } finally {
        if (!cancelled) {
          setHomeArticlesLoading(false);
        }
      }
    };
    loadThinkHomeData();
    return () => {
      cancelled = true;
    };
  }, [activeView]);

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
    if (activeView !== 'handoffs' || !activeHandoffData?.handoffId) return;
    rememberRecentTarget({
      id: activeHandoffData.handoffId,
      type: 'handoff',
      title: activeHandoffData.title || 'Agent handoff',
      path: `/think?tab=handoffs&handoffId=${encodeURIComponent(activeHandoffData.handoffId)}`
    });
  }, [activeHandoffData?.handoffId, activeHandoffData?.title, activeView, rememberRecentTarget]);

  useEffect(() => {
    if (activeView !== 'threads' || !activeThreadData?.threadId) return;
    rememberRecentTarget({
      id: activeThreadData.threadId,
      type: 'thread',
      title: activeThreadData.title || 'Shared thread',
      path: `/think?tab=threads&threadId=${encodeURIComponent(activeThreadData.threadId)}`
    });
  }, [activeThreadData?.threadId, activeThreadData?.title, activeView, rememberRecentTarget]);

  useEffect(() => {
    if (!notebookActiveId || activeView !== 'notebook') return;
    loadNotebookEntry(notebookActiveId);
  }, [notebookActiveId, activeView, loadNotebookEntry]);

  useEffect(() => {
    if (!notebookActiveId || activeView !== 'notebook') return;
    if (searchParams.get('tab') === 'notebook' && searchParams.get('entryId') === notebookActiveId) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'notebook');
    params.set('entryId', notebookActiveId);
    setSearchParams(params, { replace: true });
  }, [notebookActiveId, activeView, searchParams, setSearchParams]);

  React.useEffect(() => {
    setDescriptionDraft(concept?.description || '');
  }, [concept?.description]);

  useEffect(() => {
    if (!conceptComposerOpen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      conceptComposerInputRef.current?.focus();
      conceptComposerInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conceptComposerAnchor, conceptComposerOpen]);

  const handleSelectConcept = useCallback((name) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'concepts');
    params.set('concept', name);
    params.delete('scopeType');
    params.delete('scopeId');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const openConceptComposer = useCallback((anchor = 'header', seed = '') => {
    setConceptComposerAnchor(anchor);
    setConceptComposerDraft(normalizeConceptName(seed));
    setConceptComposerDescriptionDraft('');
    setConceptComposerAutoScout(true);
    setConceptComposerScouting(false);
    setConceptComposerStatus(CONCEPT_COMPOSER_DEFAULT_STATE);
    setConceptComposerOpen(true);
  }, [normalizeConceptName]);

  const closeConceptComposer = useCallback(() => {
    setConceptComposerOpen(false);
    setConceptComposerSaving(false);
    setConceptComposerScouting(false);
    setConceptComposerDraft('');
    setConceptComposerDescriptionDraft('');
    setConceptComposerAutoScout(true);
  }, []);

  const openTemplatePicker = useCallback(() => {
    setTemplatePickerOpen(true);
  }, []);

  const closeTemplatePicker = useCallback(() => {
    setTemplatePickerOpen(false);
  }, []);

  const closeHeaderMenus = useCallback(() => {
    setHeaderNewMenuOpen(false);
    setHeaderActionsMenuOpen(false);
  }, []);

  const handleSelectView = useCallback((view) => {
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
    if (view !== 'threads') {
      params.delete('threadId');
    }
    if (view !== 'handoffs') {
      params.delete('handoffId');
    }
    if (view !== 'paths') {
      params.delete('pathId');
    }
    params.delete('scopeType');
    params.delete('scopeId');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleTemplateCreated = useCallback(async (created = null) => {
    const nextConceptName = String(created?.conceptName || '').trim();
    const target = String(created?.target || '').trim().toLowerCase();
    const nextNotebookId = String(created?.notebookEntryId || created?.notebookEntry?._id || '').trim();

    if (target === 'notebook' && nextNotebookId) {
      await loadNotebookEntries({ force: true });
      setNotebookActiveId(nextNotebookId);
      handleSelectView('notebook');
    } else {
      await refreshConcepts();
      if (nextConceptName) {
        handleSelectConcept(nextConceptName);
      }
    }
    closeTemplatePicker();
    closeConceptComposer();
    closeHeaderMenus();
    setConceptError('');
    setConceptComposerStatus({
      message: target === 'notebook'
        ? `Created notebook from template${created?.notebookEntry?.title ? `: ${created.notebookEntry.title}` : '.'}`
        : (nextConceptName ? `Created concept from template: ${nextConceptName}.` : 'Created concept from template.'),
      tone: 'success'
    });
  }, [
    closeConceptComposer,
    closeHeaderMenus,
    closeTemplatePicker,
    handleSelectConcept,
    handleSelectView,
    loadNotebookEntries,
    refreshConcepts
  ]);

  useEffect(() => {
    if (!headerNewMenuOpen && !headerActionsMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      const target = event.target;
      if (headerNewMenuRef.current?.contains(target) || headerActionsMenuRef.current?.contains(target)) {
        return;
      }
      closeHeaderMenus();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeHeaderMenus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [headerActionsMenuOpen, headerNewMenuOpen, closeHeaderMenus]);

  useEffect(() => {
    closeHeaderMenus();
  }, [activeView, closeHeaderMenus]);

  const submitConceptComposer = useCallback(async (rawName, source = 'manual') => {
    const candidate = normalizeConceptName(rawName);
    const description = String(conceptComposerDescriptionDraft || '').trim();
    const runScout = Boolean(conceptComposerAutoScout);
    if (!candidate) {
      setConceptComposerStatus({ message: 'Enter a concept name.', tone: 'error' });
      return { ok: false, reason: 'empty' };
    }

    const existing = findExistingConcept(candidate);
    if (existing) {
      handleSelectConcept(existing.name);
      setConceptComposerStatus({
        message: `Opened existing concept: ${existing.name}.`,
        tone: 'success'
      });
      setConceptComposerOpen(false);
      setConceptComposerDraft('');
      if (source === 'search-enter') setSearch('');
      return { ok: true, action: 'opened-existing', conceptName: existing.name };
    }

    setConceptComposerSaving(true);
    setConceptComposerScouting(false);
    setConceptComposerStatus({
      message: runScout ? 'Creating concept and preparing partner scan...' : 'Creating concept...',
      tone: 'success'
    });
    setConceptError('');
    try {
      const updatedConcept = await updateConcept(candidate, { description });
      await refreshConcepts();
      handleSelectConcept(candidate);
      setConceptComposerStatus({
        message: runScout
          ? `Created concept: ${candidate}. Running partner scan...`
          : `Created concept: ${candidate}.`,
        tone: 'success'
      });
      setConceptComposerOpen(false);
      setConceptComposerDraft('');
      setConceptComposerDescriptionDraft('');
      setConceptComposerAutoScout(true);
      if (source === 'search-enter') setSearch('');

      if (runScout) {
        const conceptRef = String(updatedConcept?._id || candidate);
        setConceptComposerScouting(true);
        suggestConceptWorkspaceFromLibrary(conceptRef, {
          mode: 'library_only',
          maxLoops: 2
        })
          .then((response) => {
            const itemCount = Number(response?.summary?.itemSuggestions || 0);
            const conceptCount = Number(response?.summary?.conceptSuggestions || 0);
            setConceptComposerStatus({
              message: `Partner scan ready: ${itemCount} items and ${conceptCount} concepts suggested.`,
              tone: 'success'
            });
          })
          .catch((scoutError) => {
            const scoutStatus = Number(scoutError?.response?.status || 0);
            setConceptComposerStatus({
              message: scoutStatus === 401
                ? 'Concept created, but your session expired before the partner scan completed.'
                : (scoutError?.response?.data?.error || 'Concept created, but the partner scan failed.'),
              tone: 'error'
            });
          })
          .finally(() => {
            setConceptComposerScouting(false);
          });
      }

      return { ok: true, action: 'created', conceptName: candidate };
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to add concept.';
      setConceptComposerStatus({ message, tone: 'error' });
      setConceptError(message);
      return { ok: false, reason: 'error' };
    } finally {
      setConceptComposerSaving(false);
    }
  }, [
    conceptComposerAutoScout,
    conceptComposerDescriptionDraft,
    findExistingConcept,
    normalizeConceptName,
    refreshConcepts,
    handleSelectConcept
  ]);

  const handleSelectPath = useCallback((pathId) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'paths');
    if (pathId) params.set('pathId', pathId);
    else params.delete('pathId');
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);

  const handleToggleRight = useCallback((nextOpen) => {
    setRightOpen(nextOpen);
    localStorage.setItem(THINK_RIGHT_STORAGE_KEY, String(nextOpen));
  }, []);

  const handleSelectNotebookEntry = useCallback((id) => {
    setNotebookActiveId(id);
    handleSelectView('notebook');
  }, [handleSelectView]);

  const handleCreateNotebookEntry = useCallback(async () => {
    await createNotebookEntry({ title: 'Untitled', content: '', blocks: [] });
  }, [createNotebookEntry]);

  const applyNotebookEntryUpdate = useCallback((updated) => {
    if (!updated?._id) return;
    setNotebookEntries(prev => prev.map(entry => entry._id === updated._id ? updated : entry));
    setActiveNotebookEntry(prev => (prev?._id === updated._id ? updated : prev));
  }, []);

  const handleSaveNotebookEntry = async (payload) => {
    if (!payload?.id) return;
    setNotebookSaving(true);
    setNotebookEntryError('');
    try {
      const res = await api.put(`/api/notebook/${payload.id}`, payload, getAuthHeaders());
      const updated = res.data;
      applyNotebookEntryUpdate(updated);
    } catch (err) {
      setNotebookEntryError(err.response?.data?.error || 'Failed to save note.');
    } finally {
      setNotebookSaving(false);
    }
  };

  const handleOpenNotebookMoveModal = useCallback((entry) => {
    if (!entry?._id) return;
    setNotebookMoveError('');
    setNotebookMoveModalEntry(entry);
  }, []);

  const handleCloseNotebookMoveModal = useCallback(() => {
    if (notebookMovePendingId) return;
    setNotebookMoveError('');
    setNotebookMoveModalEntry(null);
  }, [notebookMovePendingId]);

  const handleCreateNotebookFolder = useCallback(async (name, options = {}) => {
    const candidate = cleanText(name);
    if (!candidate) throw new Error('Folder name is required.');

    const parentFolderId = normalizeNotebookFolderId(options?.parentFolderId) || null;
    const siblingFolders = notebookFolders.filter(
      (folder) => normalizeNotebookFolderId(folder?.parentFolderId) === normalizeNotebookFolderId(parentFolderId)
    );
    const nextSortOrder = siblingFolders.reduce((maxSort, folder) => {
      const sortOrder = Number(folder?.sortOrder);
      return Number.isFinite(sortOrder) ? Math.max(maxSort, sortOrder) : maxSort;
    }, -1) + 1;

    const res = await api.post('/api/notebook/folders', {
      name: candidate,
      parentFolderId,
      sortOrder: nextSortOrder
    }, getAuthHeaders());

    const created = res.data;
    setNotebookFolders((prev) => {
      const existing = Array.isArray(prev) ? prev : [];
      if (!created?._id) return existing;
      const remaining = existing.filter((folder) => folder?._id !== created._id);
      return [...remaining, created];
    });
    setNotebookFoldersError('');
    return created;
  }, [notebookFolders]);

  const handleMoveNotebookEntry = useCallback(async (entry, folderId) => {
    const entryId = cleanText(entry?._id);
    if (!entryId || cleanText(entry?.folder) === cleanText(folderId)) return;
    setNotebookMovePendingId(entryId);
    setNotebookMoveError('');
    try {
      const res = await api.put(`/api/notebook/${entryId}`, { folder: folderId || null }, getAuthHeaders());
      const updated = res.data;
      applyNotebookEntryUpdate(updated);
      setNotebookMoveModalEntry(prev => (prev?._id === updated?._id ? updated : prev));
      setNotebookMoveModalEntry(null);
    } catch (err) {
      setNotebookMoveError(err.response?.data?.error || 'Failed to move note.');
    } finally {
      setNotebookMovePendingId('');
    }
  }, [applyNotebookEntryUpdate]);

  const handleDeleteNotebookEntry = async (entry) => {
    if (!entry?._id) return;
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setNotebookSaving(true);
    setNotebookEntryError('');
    try {
      await api.delete(`/api/notebook/${entry._id}`, getAuthHeaders());
      setNotebookEntries(prev => {
        const remaining = prev.filter(item => item._id !== entry._id);
        setNotebookActiveId('');
        setActiveNotebookEntry(null);
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
    if (!workingMemoryEnabled) return;
    loadWorkingMemoryItems();
  }, [loadWorkingMemoryItems, workingMemoryEnabled]);

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
        conceptName: activeView === 'concepts' ? selectedName : '',
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

  const linkHomeCommandReferences = useCallback(async ({
    targetType = '',
    targetId = '',
    references = []
  } = {}) => {
    const safeTargetType = normalizeHomeReferenceConnectionType(targetType);
    const safeTargetId = cleanText(targetId);
    const normalizedReferences = normalizeHomeCommandReferences(references);
    if (!safeTargetType || !safeTargetId || normalizedReferences.length === 0) {
      return { linked: 0, attempted: normalizedReferences.length };
    }

    let linked = 0;
    for (const reference of normalizedReferences) {
      try {
        await createConnection({
          fromType: safeTargetType,
          fromId: safeTargetId,
          toType: reference.itemType,
          toId: reference.itemId,
          relationType: 'related',
          scopeType: safeTargetType === 'question' ? 'question' : '',
          scopeId: safeTargetType === 'question' ? safeTargetId : ''
        });
        linked += 1;
      } catch (error) {
        if (error?.response?.status === 409) {
          linked += 1;
          continue;
        }
        throw error;
      }
    }

    return { linked, attempted: normalizedReferences.length };
  }, []);

  const handleHomeUniversalCommand = useCallback(async (rawText = '', commandContext = {}) => {
    const intent = classifyHomeUniversalCommand(rawText);
    const text = cleanText(intent.text || rawText);
    if (!text) return '';
    const commandReferences = normalizeHomeCommandReferences(commandContext?.references);
    const title = text.length > 90 ? `${text.slice(0, 87)}...` : text;

    if (intent.kind === 'think-home') {
      handleSelectView('home');
      return `${AGENT_DISPLAY_NAME} is keeping you in Think.`;
    }

    if (intent.kind === 'wiki-ingest') {
      const ingestCommand = intent.command || `/ingest ${intent.source || text}`;
      try {
        sessionStorage.setItem('noeis.homeCommand.pendingSourceIngest', intent.source || text.replace(/^\/ingest\s+/i, '').trim());
      } catch (error) {
        // Best-effort handoff only; route still works without session storage.
      }
      persistHomeCommandReferences(commandReferences);
      window.location.href = `/wiki/workspace?pane=chat&homeCommand=${encodeURIComponent(ingestCommand)}`;
      return `${AGENT_DISPLAY_NAME} is feeding this source to Wiki.`;
    }

    if (intent.kind === 'wiki-build') {
      try {
        sessionStorage.setItem('noeis.homeCommand.pendingWikiBuild', text);
      } catch (error) {
        // Best-effort handoff only; route still works without session storage.
      }
      persistHomeCommandReferences(commandReferences);
      window.location.href = `/wiki/workspace?pane=chat&homeCommand=${encodeURIComponent(text)}`;
      return `${AGENT_DISPLAY_NAME} is sending this to Wiki.`;
    }

    if (intent.kind === 'wiki-graph') {
      try {
        sessionStorage.setItem('noeis.homeCommand.pendingGraphQuery', text);
      } catch (error) {
        // Best-effort handoff only; route still works without session storage.
      }
      persistHomeCommandReferences(commandReferences);
      window.location.href = `/wiki/workspace?view=graph&query=${encodeURIComponent(text)}`;
      return `${AGENT_DISPLAY_NAME} is opening the corpus map.`;
    }

    if (intent.kind === 'library-search') {
      window.location.href = `/library?query=${encodeURIComponent(text)}`;
      return `${AGENT_DISPLAY_NAME} is pulling this up in Library.`;
    }

    if (intent.kind === 'question') {
      setQuestionSaving(true);
      setQuestionError('');
      try {
        const created = await createQuestion({
          text,
          conceptName: '',
          blocks: [{ id: createBlockId(), type: 'paragraph', text }]
        });
        setAllQuestions(prev => [created, ...prev]);
        setActiveQuestionId(created._id);
        setActiveQuestion(created);
        const linkResult = await linkHomeCommandReferences({
          targetType: 'question',
          targetId: created._id,
          references: commandReferences
        });
        handleSelectView('questions');
        return linkResult.linked > 0
          ? `${AGENT_DISPLAY_NAME} opened this as a question with ${linkResult.linked} provenance trace${linkResult.linked === 1 ? '' : 's'}.`
          : `${AGENT_DISPLAY_NAME} opened this as a question.`;
      } catch (err) {
        const message = err.response?.data?.error || 'Failed to create question.';
        setQuestionError(message);
        throw new Error(message);
      } finally {
        setQuestionSaving(false);
      }
    }

    if (intent.kind === 'concept') {
      handleSelectView('concepts');
      openConceptComposer('hero', text);
      return `${AGENT_DISPLAY_NAME} is shaping this as a concept.`;
    }

    try {
      const created = await createNotebookEntry({
        title,
        content: text,
        blocks: [{ id: createBlockId(), type: 'paragraph', text }]
      });
      const linkResult = await linkHomeCommandReferences({
        targetType: 'notebook',
        targetId: created?._id,
        references: commandReferences
      });
      return linkResult.linked > 0
        ? `${AGENT_DISPLAY_NAME} saved this as a note with ${linkResult.linked} provenance trace${linkResult.linked === 1 ? '' : 's'}.`
        : `${AGENT_DISPLAY_NAME} saved this as a note.`;
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to create note.';
      throw new Error(message);
    }
  }, [createNotebookEntry, handleSelectView, linkHomeCommandReferences, openConceptComposer, setAllQuestions]);

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

  const handleOpenQuestion = useCallback((questionId) => {
    setActiveQuestionId(questionId);
    handleSelectView('questions');
  }, [handleSelectView]);

  const handleCalmThreadSelect = useCallback((thread) => {
    if (!thread?.type) return;
    switch (thread.type) {
      case 'concept':
        handleSelectConcept(thread.id);
        break;
      case 'question':
        handleOpenQuestion(thread.id);
        break;
      case 'notebook':
        handleSelectNotebookEntry(thread.id);
        break;
      case 'wiki': {
        const pageId = thread.raw?.pageId || thread.id;
        if (pageId) {
          navigateWithViewTransition(navigate, wikiPagePath(pageId));
        }
        break;
      }
      default:
        break;
    }
  }, [handleOpenQuestion, handleSelectConcept, handleSelectNotebookEntry, navigate]);

  const thinkShelfRail = (
    <ThinkShelfRail
      search={search}
      onSearchChange={setSearch}
      concepts={concepts}
      questions={allQuestions}
      notebookEntries={notebookEntries}
      conceptsLoading={conceptsLoading}
      questionsLoading={allQuestionsLoading}
      notebookLoading={notebookLoadingList}
      onSelectConcept={handleSelectConcept}
      onSelectQuestion={handleOpenQuestion}
      onSelectNotebook={handleSelectNotebookEntry}
    />
  );

  const renderNotebookRow = (entry) => (
    <NotebookListItem
      key={entry._id}
      entry={entry}
      isActive={activeView === 'notebook' && notebookActiveId === entry._id}
      onSelect={handleSelectNotebookEntry}
    />
  );

  const renderConceptRow = (conceptItem) => (
    <ConceptListItem
      key={conceptItem.name}
      conceptItem={conceptItem}
      isActive={activeView === 'concepts' && conceptItem.name === selectedName}
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

  const renderPartnerConceptList = useCallback((items, emptyMessage = 'No concepts yet.') => (
    <PartnerLineList
      emptyMessage={emptyMessage}
      items={items.map((conceptItem) => {
        const name = cleanText(conceptItem?.name);
        if (!name) return null;
        const count = Number.isFinite(conceptItem?.count) ? conceptItem.count : null;
        const label = count !== null ? `${name} · ${count}` : name;
        const isCurrent = name === cleanText(selectedName);
        return (
          <li key={name}>
            {isCurrent ? (
              <span className="concept-editorial-partner__concept-link is-current">{label}</span>
            ) : (
              <button
                type="button"
                className="concept-editorial-partner__concept-link"
                onClick={() => handleSelectConcept(name)}
              >
                {label}
              </button>
            )}
          </li>
        );
      }).filter(Boolean)}
    />
  ), [handleSelectConcept, selectedName]);

  const renderPartnerQuestionList = useCallback((items, emptyMessage = 'No questions yet.') => (
    <PartnerLineList
      emptyMessage={emptyMessage}
      items={items.map((question) => {
        const id = cleanText(question?._id);
        const text = cleanText(question?.text) || 'Untitled question';
        const scope = cleanText(question?.linkedTagName) || 'Uncategorized';
        return (
          <li key={id || text}>
            <button
              type="button"
              className="concept-editorial-partner__concept-link"
              onClick={() => handleOpenQuestion(id)}
            >
              {`${text} · ${scope}`}
            </button>
          </li>
        );
      })}
    />
  ), [handleOpenQuestion]);

  const renderNotebookFolderList = useCallback((items, {
    emptyMessage = 'No notebook entries yet.',
    skeletonRows = 8
  } = {}) => {
    if (notebookLoadingList || notebookFoldersLoading) {
      return <SidebarSkeletonRows rows={skeletonRows} />;
    }

    return (
      <div className="think-notebook-folder-tree-panel">
        {notebookFoldersError ? (
          <p className="muted small think-notebook-folder-tree-panel__status">{notebookFoldersError}</p>
        ) : null}
        {!notebookMoveModalEntry && notebookMoveError ? (
          <p className="muted small think-notebook-folder-tree-panel__status">{notebookMoveError}</p>
        ) : null}
        <NotebookFolderTree
          folders={notebookFolders}
          entries={items}
          activeEntryId={notebookActiveId}
          emptyMessage={emptyMessage}
          movingEntryId={notebookMovePendingId}
          onSelectEntry={handleSelectNotebookEntry}
          onRequestMoveEntry={handleOpenNotebookMoveModal}
          onMoveEntry={handleMoveNotebookEntry}
          onCreateFolder={handleCreateNotebookFolder}
        />
      </div>
    );
  }, [
    handleCreateNotebookFolder,
    handleMoveNotebookEntry,
    handleOpenNotebookMoveModal,
    handleSelectNotebookEntry,
    notebookActiveId,
    notebookFolders,
    notebookFoldersError,
    notebookFoldersLoading,
    notebookLoadingList,
    notebookMoveError,
    notebookMoveModalEntry,
    notebookMovePendingId
  ]);

  const renderConceptComposer = (anchor) => {
    if (!conceptComposerOpen || conceptComposerAnchor !== anchor) return null;
    return (
      <div className="think-concept-composer-popover" data-testid="think-concept-composer-popover">
        <label className="feedback-field think-concept-composer-field">
          <span>Concept name</span>
          <input
            ref={conceptComposerInputRef}
            type="text"
            value={conceptComposerDraft}
            data-testid="think-concept-composer-input"
            placeholder="Type a concept name"
            onChange={(event) => {
              setConceptComposerDraft(event.target.value);
              if (conceptComposerStatus.message) {
                setConceptComposerStatus(CONCEPT_COMPOSER_DEFAULT_STATE);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeConceptComposer();
              }
              if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
                event.preventDefault();
                submitConceptComposer(conceptComposerDraft, 'composer');
              }
            }}
          />
        </label>
        <label className="feedback-field think-concept-composer-field">
          <span>Description</span>
          <textarea
            value={conceptComposerDescriptionDraft}
            placeholder="Describe what this concept is about..."
            rows={3}
            onChange={(event) => {
              setConceptComposerDescriptionDraft(event.target.value);
              if (conceptComposerStatus.message) {
                setConceptComposerStatus(CONCEPT_COMPOSER_DEFAULT_STATE);
              }
            }}
          />
        </label>
        <label className="think-concept-composer-toggle">
          <input
            type="checkbox"
            checked={conceptComposerAutoScout}
            onChange={(event) => setConceptComposerAutoScout(Boolean(event.target.checked))}
          />
          <span>Run partner scan after create</span>
        </label>
        <div className="think-concept-composer-actions">
          <Button
            variant="secondary"
            onClick={() => submitConceptComposer(conceptComposerDraft, 'composer')}
            disabled={conceptComposerSaving}
            data-testid="think-concept-composer-submit"
          >
            {conceptComposerSaving ? 'Creating…' : 'Create'}
          </Button>
          <QuietButton
            onClick={() => {
              closeConceptComposer();
              openTemplatePicker();
            }}
            disabled={conceptComposerSaving}
          >
            Use template
          </QuietButton>
          <QuietButton onClick={closeConceptComposer} disabled={conceptComposerSaving}>
            Cancel
          </QuietButton>
        </div>
        {conceptComposerStatus.message && (
          <p className={`think-concept-composer-status ${conceptComposerStatus.tone === 'error' ? 'is-error' : 'is-success'}`}>
            {(conceptComposerSaving || conceptComposerScouting) && (
              <span className="think-inline-spinner" aria-hidden="true" />
            )}
            {conceptComposerStatus.message}
          </p>
        )}
      </div>
    );
  };


  const defaultLeftPanel = (
    <div className="section-stack think-layout__left-panel think-index">
      <div className={`think-index__controls ${(notebookListError || allQuestionsError || questionError || conceptsError) ? 'has-error' : ''}`}>
        <label className="feedback-field think-index__search" style={{ margin: 0 }}>
          <span>Index</span>
          <input
            type="text"
            value={search}
            placeholder="Search notes, concepts, questions"
            data-testid="think-index-search-input"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              if (event.nativeEvent?.isComposing) return;
              if (activeView !== 'concepts') return;
              const candidate = normalizeConceptName(search);
              if (!candidate) return;
              event.preventDefault();
              submitConceptComposer(candidate, 'search-enter');
            }}
          />
        </label>
        <div className="think-index__control-row">
          <label className="think-index__filter">
            <span>Question status</span>
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
          </label>
          <Button
            variant="secondary"
            className="think-index__new-question"
            onClick={handleCreateQuestion}
            disabled={questionSaving}
          >
            New question
          </Button>
        </div>
      </div>

      {notebookListError && <p className="status-message error-message">{notebookListError}</p>}
      {allQuestionsError && <p className="status-message error-message">{allQuestionsError}</p>}
      {questionError && <p className="status-message error-message">{questionError}</p>}

      <div className={`think-index__group ${collapsedIndexGroups.notebook ? 'is-collapsed' : 'is-expanded'} ${notebookLoadingList ? 'is-loading' : ''} ${!notebookLoadingList && filteredNotebookEntries.length === 0 ? 'is-empty' : ''}`.trim()}>
        <div className="think-index__label-row">
          <button
            type="button"
            className="think-index__label-toggle"
            onClick={() => toggleIndexGroup('notebook')}
            aria-expanded={!collapsedIndexGroups.notebook}
          >
            <span className="think-index__label">Notebook</span>
            <span className="think-index__label-chevron" aria-hidden="true">{collapsedIndexGroups.notebook ? '▸' : '▾'}</span>
          </button>
        </div>
        {!collapsedIndexGroups.notebook && (
          <div className="think-index__list">
            {notebookLoadingList ? (
              <SidebarSkeletonRows rows={4} />
            ) : (
              filteredNotebookEntries.map((entry) => renderNotebookRow(entry))
            )}
            {!notebookLoadingList && filteredNotebookEntries.length === 0 && (
              <CalmEmptyLine>No notebook entries match.</CalmEmptyLine>
            )}
          </div>
        )}
      </div>

      <div className={`think-index__group ${collapsedIndexGroups.concepts ? 'is-collapsed' : 'is-expanded'} ${conceptsLoading ? 'is-loading' : ''} ${!conceptsLoading && filteredConcepts.length === 0 ? 'is-empty' : ''}`.trim()}>
        <div className="think-index__label-row">
          <button
            type="button"
            className="think-index__label-toggle"
            onClick={() => toggleIndexGroup('concepts')}
            aria-expanded={!collapsedIndexGroups.concepts}
          >
            <span className="think-index__label">Concepts</span>
            <span className="think-index__label-chevron" aria-hidden="true">{collapsedIndexGroups.concepts ? '▸' : '▾'}</span>
          </button>
          <div className="think-concept-composer-anchor">
            <button
              type="button"
              className="think-index__label-add"
              onClick={() => openConceptComposer('sidebar', search)}
              aria-label="Create concept"
              data-testid="think-new-concept-sidebar-button"
            >
              +
            </button>
            {renderConceptComposer('sidebar')}
          </div>
        </div>
        {conceptComposerStatus.message && !conceptComposerOpen && (
          <p
            className={`think-concept-composer-status ${conceptComposerStatus.tone === 'error' ? 'is-error' : 'is-success'}`}
            data-testid="think-concept-composer-status"
          >
            {conceptComposerScouting && (
              <span className="think-inline-spinner" aria-hidden="true" />
            )}
            {conceptComposerStatus.message}
          </p>
        )}
        {conceptsError && <p className="status-message error-message">{conceptsError}</p>}
        {!collapsedIndexGroups.concepts && (
          <Profiler id="ThinkConceptList" onRender={conceptListProfilerLogger}>
            <div className="think-index__list">
              {conceptsLoading ? (
                <SidebarSkeletonRows rows={5} />
              ) : filteredConcepts.length > 200 ? (
                <VirtualList
                  items={filteredConcepts}
                  height={leftListHeight}
                  itemSize={THINK_CONCEPT_ROW_HEIGHT}
                  overscan={8}
                  className="think-virtual-list"
                  renderItem={(conceptItem, index) => (
                    <div key={conceptItem.name || index} className="think-index__virtual-row">
                      {renderConceptRow(conceptItem)}
                    </div>
                  )}
                />
              ) : (
                filteredConcepts.map((conceptItem) => renderConceptRow(conceptItem))
              )}
              {!conceptsLoading && filteredConcepts.length === 0 && (
                <CalmEmptyLine>No concepts match.</CalmEmptyLine>
              )}
            </div>
          </Profiler>
        )}
      </div>

      <div className={`think-index__group ${collapsedIndexGroups.questions ? 'is-collapsed' : 'is-expanded'} ${allQuestionsLoading ? 'is-loading' : ''} ${!allQuestionsLoading && filteredQuestions.length === 0 ? 'is-empty' : ''}`.trim()}>
        <div className="think-index__label-row">
          <button
            type="button"
            className="think-index__label-toggle"
            onClick={() => toggleIndexGroup('questions')}
            aria-expanded={!collapsedIndexGroups.questions}
          >
            <span className="think-index__label">Questions</span>
            <span className="think-index__label-chevron" aria-hidden="true">{collapsedIndexGroups.questions ? '▸' : '▾'}</span>
          </button>
        </div>
        {!collapsedIndexGroups.questions && (
          <Profiler id="ThinkQuestionList" onRender={questionListProfilerLogger}>
            <div className="think-index__list">
              {allQuestionsLoading ? (
                <SidebarSkeletonRows rows={4} />
              ) : filteredQuestions.length > 200 ? (
                <VirtualList
                  items={filteredQuestions}
                  height={leftListHeight}
                  itemSize={THINK_QUESTION_ROW_HEIGHT}
                  overscan={6}
                  className="think-virtual-list"
                  renderItem={(question, index) => (
                    <div key={question._id || index} className="think-index__virtual-row">
                      {renderQuestionRow(question)}
                    </div>
                  )}
                />
              ) : (
                filteredQuestions.map((question) => renderQuestionRow(question))
              )}
              {!allQuestionsLoading && filteredQuestions.length === 0 && (
                <CalmEmptyLine>No questions match.</CalmEmptyLine>
              )}
            </div>
          </Profiler>
        )}
      </div>
    </div>
  );

  const homeWorkingSet = useMemo(() => ({
    notebooks: notebookEntries.slice(0, THINK_HOME_LIMIT),
    concepts: concepts.slice(0, THINK_HOME_LIMIT),
    questions: allQuestions.filter(item => item.status !== 'answered').slice(0, THINK_HOME_LIMIT)
  }), [allQuestions, concepts, notebookEntries]);
  const conceptsWithHighlights = useMemo(
    () => concepts.filter((item) => Number(item?.count || 0) > 0).slice(0, THINK_HOME_LIMIT),
    [concepts]
  );
  const partnerRailNavItems = useMemo(() => ([
    { key: 'assistant', label: AGENT_DISPLAY_NAME, short: 'Tp' },
    { key: 'sources', label: 'Sources', short: 'So' },
    { key: 'highlights', label: 'Highlights', short: 'Hi' },
    { key: 'annotations', label: 'Annotations', short: 'An' }
  ]), []);

  const homeEditorialLeftPanel = thinkShelfRail;

  const isConceptWorkbenchView = activeView === 'concepts' && Boolean(selectedName);
  const isQuestionEditorialView = activeView === 'questions';

  useEffect(() => {
    if (!isConceptWorkbenchView) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [isConceptWorkbenchView, selectedName]);

  useEffect(() => {
    if (!isQuestionEditorialView) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [isQuestionEditorialView, activeQuestionData?._id]);

  useEffect(() => {
    setConceptEditorialSection('assistant');
    setConceptPartnerCollapsed(false);
  }, [selectedName]);

  const insightsPanel = (
    <InsightsPanel
      aiHealthStatus={aiHealthStatus}
      aiHealthError={aiHealthError}
      insightsTab={insightsTab}
      onInsightsTabChange={setInsightsTab}
      themesRange={themesRange}
      onThemesRangeChange={setThemesRange}
      themes={themes}
      themesLoading={themesLoading}
      themesError={themesError}
      connections={connections}
      connectionsLoading={connectionsLoading}
      connectionsError={connectionsError}
      connectionScope={connectionScope}
      cardsExpanded={cardsExpanded}
      cardsExpandVersion={cardsExpandVersion}
      onDumpToWorkingMemory={handleDumpToWorkingMemory}
      onAddNotebook={setHighlightNotebookModal}
      onAddConcept={setHighlightConceptModal}
      onAddQuestion={setHighlightQuestionModal}
      onSelectView={handleSelectView}
    />
  );

  const hasExplicitConceptSelection = activeView === 'concepts' && Boolean(selectedName);
  const thoughtPartnerContext = useMemo(() => resolveThoughtPartnerContext({
    activeView,
    concept,
    activeNotebookEntry,
    activeQuestionData,
    activeHandoffData
  }), [
    activeHandoffData,
    activeNotebookEntry,
    activeQuestionData,
    activeView,
    concept
  ]);
  const thoughtPartnerContextMetadata = useMemo(() => {
    let baseContext;
    if (activeView === 'concepts' && concept?._id) {
      baseContext = buildConceptAmbientContext({
        concept,
        conceptQuestions,
        conceptSuggestions,
        conceptRelated,
        pinnedArticles,
        pinnedNotes
      });
    } else if (activeView === 'notebook' && activeNotebookEntry?._id) {
      baseContext = buildNotebookAmbientContext({ entry: activeNotebookEntry });
    } else if (activeView === 'questions' && activeQuestionData?._id) {
      baseContext = buildQuestionAmbientContext({
        question: activeQuestionData,
        questionRelated
      });
    } else if (activeView === 'handoffs' && activeHandoffData?.handoffId) {
      baseContext = buildHandoffAmbientContext({ handoff: activeHandoffData });
    } else if (activeView === 'home') {
      baseContext = buildHomeAmbientContext({
        homeWorkingSet,
        recentTargets
      });
    } else {
      baseContext = {
        summary: '',
        primaryText: '',
        openQuestions: [],
        nextActions: [],
        relatedItems: []
      };
    }
    if (!pulledThinkReferences.length) return baseContext;
    const pulledKeys = new Set(pulledThinkReferences.map(pulledReferenceKey));
    const baseRelated = Array.isArray(baseContext.relatedItems) ? baseContext.relatedItems : [];
    return {
      ...baseContext,
      relatedItems: [
        ...pulledThinkReferences,
        ...baseRelated.filter(item => !pulledKeys.has(pulledReferenceKey(item)))
      ].slice(0, 8)
    };
  }, [
    activeView,
    activeHandoffData,
    activeNotebookEntry,
    activeQuestionData,
    concept,
    conceptQuestions,
    conceptRelated,
    conceptSuggestions,
    homeWorkingSet,
    pinnedArticles,
    pinnedNotes,
    pulledThinkReferences,
    questionRelated,
    recentTargets
  ]);
  const queueThoughtPartnerPrompt = useCallback((queuedPrompt) => {
    if (!queuedPrompt?.prompt) return;
    setQueuedThoughtPartnerPrompt(queuedPrompt);
  }, []);

  const organizationPrompt = useMemo(() => {
    if (activeView === 'notebook') {
      return {
        id: 'organize-notebook-structure',
        prompt: 'Clean up notebook structure and stage a reviewable organization plan.',
        contextType: 'workspace',
        contextId: 'think-notebook',
        contextTitle: 'Notebook'
      };
    }
    if (activeView === 'concepts') {
      return {
        id: 'organize-concepts-structure',
        prompt: 'Clean up concepts structure and stage a reviewable organization plan.',
        contextType: 'workspace',
        contextId: 'think-concepts',
        contextTitle: 'Concepts'
      };
    }
    if (activeView === 'questions') {
      return {
        id: 'organize-questions-structure',
        prompt: 'Clean up questions structure and stage a reviewable organization plan.',
        contextType: 'workspace',
        contextId: 'think-questions',
        contextTitle: 'Questions'
      };
    }
    return null;
  }, [activeView]);
  const activeThinkPosture = THINK_POSTURE_BY_VIEW[activeView] || 'concept';
  const handleSelectThinkPosture = useCallback((posture) => {
    const nextView = THINK_VIEW_BY_POSTURE[posture];
    if (!nextView) return;
    handleSelectView(nextView);
  }, [handleSelectView]);
  const thoughtPartnerPostureProps = useMemo(() => ({
    posture: activeThinkPosture,
    postureOptions: THINK_POSTURE_OPTIONS,
    onPostureChange: handleSelectThinkPosture
  }), [activeThinkPosture, handleSelectThinkPosture]);
  const activeThinkPostureMeta = useMemo(
    () => THINK_POSTURE_OPTIONS.find((option) => option.value === activeThinkPosture) || THINK_POSTURE_OPTIONS[0],
    [activeThinkPosture]
  );
  const renderThinkPostureStrip = useCallback((className = '') => (
    <div className={`think-posture-strip ${className}`.trim()} data-testid="think-posture-strip">
      <div className="think-posture-strip__copy">
        <span>Think posture</span>
        <strong>{activeThinkPostureMeta.label}</strong>
        <p>{activeThinkPostureMeta.summary}</p>
      </div>
      <div className="think-posture-strip__controls" role="group" aria-label="Switch Think posture">
        {THINK_POSTURE_OPTIONS.map((option) => {
          const isActive = option.value === activeThinkPosture;
          return (
            <button
              key={option.value}
              type="button"
              className={`think-posture-strip__button ${isActive ? 'is-active' : ''}`.trim()}
              aria-pressed={isActive}
              onClick={() => handleSelectThinkPosture(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  ), [activeThinkPosture, activeThinkPostureMeta.label, activeThinkPostureMeta.summary, handleSelectThinkPosture]);
  const referencePullInTarget = useMemo(() => {
    if (activeView === 'concepts' && (concept?._id || concept?.name || selectedName)) {
      const conceptTitle = concept?.name || selectedName || 'Concept';
      if (concept?._id) {
        return {
          targetType: 'concept',
          targetId: concept._id,
          targetTitle: conceptTitle,
          scopeType: 'concept',
          scopeId: concept._id
        };
      }
      return {
        targetType: '',
        targetId: '',
        targetTitle: conceptTitle,
        scopeType: '',
        scopeId: '',
        conceptName: conceptTitle
      };
    }
    if (activeView === 'questions' && activeQuestionData?._id) {
      return {
        targetType: 'question',
        targetId: activeQuestionData._id,
        targetTitle: activeQuestionData.text || 'Question',
        scopeType: 'question',
        scopeId: activeQuestionData._id
      };
    }
    if (activeView === 'notebook' && activeNotebookEntry?._id) {
      return {
        targetType: 'notebook',
        targetId: activeNotebookEntry._id,
        targetTitle: activeNotebookEntry.title || 'Notebook page',
        scopeType: '',
        scopeId: ''
      };
    }
    return null;
  }, [
    activeNotebookEntry?._id,
    activeNotebookEntry?.title,
    activeQuestionData?._id,
    activeQuestionData?.text,
    activeView,
    concept?._id,
    concept?.name,
    selectedName
  ]);
  const referencePullInTargetKey = referencePullInTarget
    ? `${referencePullInTarget.targetType}:${referencePullInTarget.targetId}`
    : '';
  useEffect(() => {
    setPulledThinkReferences([]);
  }, [referencePullInTargetKey]);
  const handleThinkReferencePulled = useCallback(({ item } = {}) => {
    const relatedItem = pulledReferenceRelatedItem(item);
    if (!relatedItem.type || !relatedItem.id) return;
    setPulledThinkReferences(current => [
      relatedItem,
      ...current.filter(existing => pulledReferenceKey(existing) !== pulledReferenceKey(relatedItem))
    ].slice(0, 6));
  }, []);
  const ensureThinkReferenceTarget = useCallback(async () => {
    if (referencePullInTarget?.targetType && referencePullInTarget?.targetId) {
      return {
        targetType: referencePullInTarget.targetType,
        targetId: referencePullInTarget.targetId,
        scopeType: referencePullInTarget.scopeType || '',
        scopeId: referencePullInTarget.scopeId || ''
      };
    }
    const conceptName = String(
      referencePullInTarget?.conceptName || selectedName || concept?.name || ''
    ).trim();
    if (!conceptName || activeView !== 'concepts') return null;
    const saved = await updateConcept(conceptName, {
      description: concept?.description || ''
    });
    if (saved) setConcept(saved);
    await refreshConcepts();
    const conceptId = String(saved?._id || '').trim();
    if (!conceptId) return null;
    return {
      targetType: 'concept',
      targetId: conceptId,
      scopeType: 'concept',
      scopeId: conceptId
    };
  }, [
    activeView,
    concept?.description,
    concept?.name,
    referencePullInTarget,
    refreshConcepts,
    selectedName,
    setConcept
  ]);
  const renderReferencePullIn = useCallback((className = '') => {
    if (!referencePullInTarget) return null;
    return (
      <ReferencePullIn
        {...referencePullInTarget}
        relatedItems={thoughtPartnerContextMetadata.relatedItems}
        className={className}
        ensureTarget={ensureThinkReferenceTarget}
        onPulled={handleThinkReferencePulled}
        relationOptions={referencePullInTarget.targetType === 'question' ? [
          { value: 'supports', label: 'Support' },
          { value: 'contradicts', label: 'Counter' },
          { value: 'related', label: 'Related' }
        ] : []}
        defaultRelationType={referencePullInTarget.targetType === 'question' ? 'supports' : 'related'}
      />
    );
  }, [ensureThinkReferenceTarget, handleThinkReferencePulled, referencePullInTarget, thoughtPartnerContextMetadata.relatedItems]);
  const resolveThinkPromotionSource = useCallback(async (type) => {
    if (type === 'concept') {
      if (concept?._id) return concept;
      const conceptName = String(selectedName || concept?.name || '').trim();
      if (!conceptName) return null;
      const saved = await updateConcept(conceptName, {
        description: concept?.description || ''
      });
      if (saved) setConcept(saved);
      await refreshConcepts();
      return saved;
    }
    if (type === 'notebook') return activeNotebookEntry;
    return activeQuestionData;
  }, [
    activeNotebookEntry,
    activeQuestionData,
    concept,
    refreshConcepts,
    selectedName,
    setConcept
  ]);
  const handlePromoteThinkObjectToWiki = useCallback(async (type) => {
    const source = await resolveThinkPromotionSource(type);
    const sourceId = String(source?._id || '').trim();
    if (!sourceId) {
      setWikiPromotionState({
        busyTarget: '',
        error: type === 'concept'
          ? 'Save this concept before promoting it to the wiki.'
          : 'Nothing to promote yet.',
        phase: ''
      });
      return;
    }
    const busyTarget = `${type}:${sourceId}`;
    setWikiPromotionState({ busyTarget, error: '', phase: 'drafting' });
    try {
      const payload = buildThinkWikiPromotionPayload({
        type,
        concept: type === 'concept' ? source : concept,
        question: type === 'question' ? source : activeQuestionData,
        notebook: type === 'notebook' ? source : activeNotebookEntry,
        conceptQuestions,
        pulledReferences: pulledThinkReferences
      });
      if (!payload) throw new Error('Nothing to promote yet.');
      const created = await createWikiPage(payload);
      const pageId = created?._id || created?.id;
      if (!pageId) throw new Error('Wiki page was created without an id.');
      setWikiPromotionState({ busyTarget, error: '', phase: 'linking' });
      try {
        await createConnection({
          fromType: type,
          fromId: sourceId,
          toType: 'wiki_page',
          toId: pageId,
          relationType: 'extends',
          scopeType: type === 'notebook' ? '' : type,
          scopeId: type === 'notebook' ? '' : sourceId
        });
      } catch (connectionError) {
        if (connectionError?.response?.status !== 409) throw connectionError;
      }
      const promotionParams = new URLSearchParams({
        promoted: type,
        from: 'think',
        sourceId,
        transition: 'register',
        receipt: 'settled'
      });
      const sourceTitle = type === 'concept'
        ? source?.name
        : (type === 'notebook' ? activeNotebookEntry?.title : activeQuestionData?.text);
      if (sourceTitle) promotionParams.set('sourceTitle', sourceTitle);
      setWikiPromotionState({ busyTarget, error: '', phase: 'opening' });
      navigateWithViewTransition(navigate, wikiPagePath(pageId, promotionParams.toString()));
    } catch (error) {
      setWikiPromotionState({
        busyTarget: '',
        error: error?.response?.data?.error || error?.message || 'Failed to promote this item to the wiki.',
        phase: ''
      });
      return;
    }
    setWikiPromotionState({ busyTarget: '', error: '', phase: '' });
  }, [activeNotebookEntry, activeQuestionData, concept, conceptQuestions, navigate, pulledThinkReferences, resolveThinkPromotionSource]);
  const conceptWikiPromotionTarget = concept?._id
    ? `concept:${concept._id}`
    : (selectedName ? `concept:new:${selectedName}` : '');
  const notebookWikiPromotionTarget = activeNotebookEntry?._id ? `notebook:${activeNotebookEntry._id}` : '';
  const questionWikiPromotionTarget = activeQuestionData?._id ? `question:${activeQuestionData._id}` : '';
  const renderWikiPromotionTrace = useCallback((target) => {
    if (!target || wikiPromotionState.busyTarget !== target) return null;
    const phases = [
      { id: 'drafting', label: 'Drafting wiki page' },
      { id: 'linking', label: 'Writing graph edge' },
      { id: 'opening', label: 'Opening settled register' }
    ];
    const activeIndex = Math.max(0, phases.findIndex((phase) => phase.id === wikiPromotionState.phase));
    return (
      <div
        className="think-wiki-promotion__trace"
        role="status"
        aria-label="Wiki promotion trace"
        data-promotion-phase={wikiPromotionState.phase || 'drafting'}
      >
        <span className="think-wiki-promotion__trace-label">Raw -> Wiki</span>
        <ol>
          {phases.map((phase, index) => (
            <li
              key={phase.id}
              className={[
                index < activeIndex ? 'is-complete' : '',
                index === activeIndex ? 'is-active' : ''
              ].filter(Boolean).join(' ')}
            >
              {phase.label}
            </li>
          ))}
        </ol>
      </div>
    );
  }, [wikiPromotionState.busyTarget, wikiPromotionState.phase]);
  const wikiPromotionError = wikiPromotionState.error ? (
    <p className="status-message error-message think-wiki-promotion__error">{wikiPromotionState.error}</p>
  ) : null;

  function handleQueueOrganizationPrompt() {
    if (!organizationPrompt) return;
    queueThoughtPartnerPrompt(organizationPrompt);
  }

  const reloadProtocolCanvasState = useCallback(async () => {
    await Promise.all([
      threadsModel.loadThreads?.(),
      handoffsModel.loadHandoffs?.(),
      protocolApprovalsModel.loadProtocolApprovals?.(),
      sharedArtifactDraftsModel.loadArtifactDrafts?.(),
      protocolArtifactDraftsModel.loadArtifactDrafts?.(),
      upkeepCyclesModel.loadUpkeepCycles?.()
    ]);
  }, [
    handoffsModel,
    protocolApprovalsModel,
    protocolArtifactDraftsModel,
    sharedArtifactDraftsModel,
    threadsModel,
    upkeepCyclesModel
  ]);

  const resolveDraftScope = useCallback((draft) => {
    const sourceType = cleanText(draft?.sourceContext?.type).toLowerCase();
    const sourceId = cleanText(draft?.sourceContext?.id);
    const sourceTitle = cleanText(draft?.sourceContext?.title) || cleanText(draft?.title) || 'Workspace';

    if (sourceType === 'article') return { type: 'article', id: sourceId, title: sourceTitle };
    if (sourceType === 'notebook') return { type: 'notebook', id: sourceId, title: sourceTitle };
    if (sourceType === 'concept') return { type: 'concept', id: sourceId, title: sourceTitle };
    if (sourceType === 'handoff') return { type: 'handoff', id: sourceId, title: sourceTitle };
    if (sourceType === 'selection') return { type: 'selection', id: sourceId, title: sourceTitle };
    return { type: 'workspace', id: sourceId, title: sourceTitle };
  }, []);

  const buildDraftSeedText = useCallback((draft) => {
    const title = cleanText(draft?.title) || 'Untitled draft';
    const summary = cleanText(draft?.summary);
    const body = cleanText(draft?.body);
    const sourceTitle = cleanText(draft?.sourceContext?.title);
    return [
      'Use this draft as the working brief for the next pass.',
      `Draft title: ${title}`,
      sourceTitle ? `Source context: ${sourceTitle}` : '',
      summary ? `Summary: ${summary}` : '',
      body ? `Body:\n${body}` : ''
    ].filter(Boolean).join('\n\n');
  }, []);

  const inferDraftHandoffTaskType = useCallback((draft, { followUpLoop = false } = {}) => {
    if (followUpLoop) return 'custom';
    const outputType = cleanText(draft?.skill?.outputType).toLowerCase();
    const track = cleanText(draft?.skill?.workflow?.track).toLowerCase();
    if (track === 'maintenance' || outputType.includes('report')) return 'restructure';
    if (outputType.includes('synthesis') || outputType.includes('slide')) return 'synthesis';
    if (outputType.includes('brief') || outputType.includes('question')) return 'research';
    return 'custom';
  }, []);

  const buildFollowUpDueAt = useCallback((draft) => {
    const cadence = cleanText(draft?.skill?.workflow?.cadence).toLowerCase();
    const dueAt = new Date();
    dueAt.setHours(dueAt.getHours() + 1);
    if (cadence === 'recurring') {
      dueAt.setDate(dueAt.getDate() + 7);
    } else {
      dueAt.setDate(dueAt.getDate() + 2);
    }
    return dueAt.toISOString();
  }, []);

  const handleOpenThreadFromDraft = useCallback(async (draft) => {
    const scope = resolveDraftScope(draft);
    const response = await createAgentThread({
      title: cleanText(draft?.title) || `${scope.title} thread`,
      summary: cleanText(draft?.summary).slice(0, 280),
      scope: {
        type: scope.type,
        id: scope.id,
        title: scope.title,
        metadata: {
          seedDraftId: cleanText(draft?.draftId),
          seedOutputType: cleanText(draft?.skill?.outputType),
          sourceContextType: cleanText(draft?.sourceContext?.type)
        }
      },
      checkpoint: {
        summary: cleanText(draft?.summary) || `Turn ${cleanText(draft?.title) || 'this draft'} into active working state.`,
        openQuestions: [],
        nextActions: [
          'Pressure-test the current framing.',
          'Decide whether to refine, promote, or delegate the draft.'
        ]
      },
      initialMessage: {
        role: 'user',
        text: buildDraftSeedText(draft)
      }
    });

    await reloadProtocolCanvasState();
    if (cleanText(response?.status).toLowerCase() === 'approval_required') return response;
    const nextThreadId = cleanText(response?.thread?.threadId);
    if (nextThreadId) handleOpenThread(nextThreadId);
    return response;
  }, [buildDraftSeedText, handleOpenThread, reloadProtocolCanvasState, resolveDraftScope]);

  const handleCreateHandoffFromDraft = useCallback(async (draft) => {
    const scope = resolveDraftScope(draft);
    const response = await createAutoAgentHandoff({
      title: `Delegate: ${cleanText(draft?.title) || scope.title}`,
      objective: cleanText(draft?.summary) || `Drive the next pass for ${cleanText(draft?.title) || scope.title}.`,
      taskType: inferDraftHandoffTaskType(draft),
      priority: 'normal',
      context: {
        sourceDraftId: cleanText(draft?.draftId),
        sourceContextType: cleanText(draft?.sourceContext?.type),
        sourceContextId: cleanText(draft?.sourceContext?.id),
        sourceContextTitle: scope.title,
        workflow: draft?.skill?.workflow || null
      },
      input: {
        seedDraft: {
          title: cleanText(draft?.title),
          summary: cleanText(draft?.summary),
          body: cleanText(draft?.body),
          outputType: cleanText(draft?.skill?.outputType)
        }
      },
      planner: {
        activeWorkerRole: cleanText(draft?.skill?.workerRole) || 'planner'
      }
    });

    await reloadProtocolCanvasState();
    if (cleanText(response?.status).toLowerCase() === 'approval_required') return response;
    const nextHandoffId = cleanText(response?.handoff?.handoffId);
    if (nextHandoffId) handleOpenHandoff(nextHandoffId);
    return response;
  }, [handleOpenHandoff, inferDraftHandoffTaskType, reloadProtocolCanvasState, resolveDraftScope]);

  const handleQueueFollowUpLoopFromDraft = useCallback(async (draft) => {
    const scope = resolveDraftScope(draft);
    const loopSkill = {
      id: 'draft_recurring_hygiene_summary',
      title: 'Recurring hygiene summary',
      workerRole: 'planner',
      outputType: 'recurring_hygiene_report',
      instruction: 'Draft a recurring hygiene summary. Turn the current maintenance findings into a repeatable cycle with focus areas, cadence, and the next recurring pass.',
      workflow: {
        id: 'recurring_hygiene_flow',
        label: 'Recurring upkeep loop',
        track: 'maintenance',
        cadence: 'recurring',
        loop: true,
        steps: [
          'Summarize the current maintenance state.',
          'Define the next recurring upkeep pass.',
          'Schedule the follow-up cycle and its focus areas.'
        ]
      }
    };

    const response = await createAgentUpkeepCycle({
      title: `Scheduled upkeep: ${cleanText(draft?.title) || scope.title}`,
      summary: cleanText(draft?.summary) || `Run the next recurring upkeep cycle for ${scope.title}.`,
      status: 'active',
      cadence: cleanText(draft?.skill?.workflow?.cadence) || 'recurring',
      taskType: inferDraftHandoffTaskType(draft, { followUpLoop: true }),
      workerRole: 'planner',
      nextDueAt: buildFollowUpDueAt(draft),
      sourceDraftId: cleanText(draft?.draftId),
      sourceContext: {
        sourceDraftId: cleanText(draft?.draftId),
        sourceContextType: cleanText(draft?.sourceContext?.type),
        sourceContextId: cleanText(draft?.sourceContext?.id),
        sourceContextTitle: scope.title,
        followUpLoop: true,
        workflow: draft?.skill?.workflow || loopSkill.workflow
      },
      workflow: draft?.skill?.workflow || loopSkill.workflow,
      seed: {
        priority: 'high',
        seedDraft: {
          title: cleanText(draft?.title),
          summary: cleanText(draft?.summary),
          body: cleanText(draft?.body),
          outputType: cleanText(draft?.skill?.outputType)
        },
        recurringPrompt: buildQueuedAgentSkillPrompt(loopSkill, {
          contextType: cleanText(draft?.sourceContext?.type) || 'think',
          contextId: cleanText(draft?.sourceContext?.id) || activeView,
          contextTitle: cleanText(draft?.sourceContext?.title) || cleanText(draft?.title) || 'Think',
          mode: 'submit'
        })
      },
    });

    await reloadProtocolCanvasState();
    const nextHandoffId = cleanText(response?.handoff?.handoffId);
    if (nextHandoffId) handleOpenHandoff(nextHandoffId);
    return response;
  }, [
    activeView,
    buildFollowUpDueAt,
    handleOpenHandoff,
    inferDraftHandoffTaskType,
    reloadProtocolCanvasState,
    resolveDraftScope
  ]);

  const renderNotebookEditorialView = (variant = 'shell') => (
    <NotebookEditorialView
      variant={variant}
      activeNotebookEntry={activeNotebookEntry}
      notebookLoadingEntry={notebookLoadingEntry}
      notebookSaving={notebookSaving}
      notebookEntryError={notebookEntryError}
      notebookEntries={notebookEntries}
      filteredNotebookEntries={filteredNotebookEntries}
      notebookEditorialSection={notebookEditorialSection}
      onChangeNotebookEditorialSection={setNotebookEditorialSection}
      partnerRailNavItems={partnerRailNavItems}
      search={search}
      onSearchChange={setSearch}
      renderNotebookFolderList={renderNotebookFolderList}
      renderPartnerConceptList={renderPartnerConceptList}
      renderPartnerQuestionList={renderPartnerQuestionList}
      conceptsLoading={conceptsLoading}
      conceptsWithHighlights={conceptsWithHighlights}
      homeWorkingSet={homeWorkingSet}
      allQuestionsLoading={allQuestionsLoading}
      filteredQuestions={filteredQuestions}
      onSelectNotebookEntry={handleSelectNotebookEntry}
      onCreateNotebookEntry={handleCreateNotebookEntry}
      onSaveNotebookEntry={handleSaveNotebookEntry}
      onDeleteNotebookEntry={handleDeleteNotebookEntry}
      onRegisterNotebookInsert={(fn) => { notebookInsertRef.current = fn; }}
      onOpenSynthesis={openSynthesis}
      onDumpToWorkingMemory={handleDumpToWorkingMemory}
      renderThinkPostureStrip={renderThinkPostureStrip}
      queueThoughtPartnerPrompt={queueThoughtPartnerPrompt}
      thoughtPartnerContext={thoughtPartnerContext}
      thoughtPartnerContextMetadata={thoughtPartnerContextMetadata}
      queuedThoughtPartnerPrompt={queuedThoughtPartnerPrompt}
      thoughtPartnerPostureProps={thoughtPartnerPostureProps}
      renderReferencePullIn={renderReferencePullIn}
      sharedArtifactDraftsModel={sharedArtifactDraftsModel}
      onOpenThreadFromDraft={handleOpenThreadFromDraft}
      onCreateHandoffFromDraft={handleCreateHandoffFromDraft}
      onQueueFollowUpLoopFromDraft={handleQueueFollowUpLoopFromDraft}
      onQueueOrganizationPrompt={handleQueueOrganizationPrompt}
      onPromoteThinkObjectToWiki={handlePromoteThinkObjectToWiki}
      wikiPromotionState={wikiPromotionState}
      notebookWikiPromotionTarget={notebookWikiPromotionTarget}
      conceptWikiPromotionTarget={conceptWikiPromotionTarget}
      wikiPromotionError={wikiPromotionError}
      renderWikiPromotionTrace={renderWikiPromotionTrace}
      onSelectView={handleSelectView}
      shelfRail={thinkShelfRail}
      indexMotion={notebookIndexMotion}
      indexOrientation={notebookIndexOrientation}
      indexLoading={notebookLoadingList}
      indexError=""
      allNotebookCount={notebookEntries.length}
      onCalmThreadSelect={handleCalmThreadSelect}
    />
  );

  const leftPanel = isConceptWorkbenchView
    ? (
      <ConceptPartnerRail
        concept={concept}
        concepts={concepts}
        selectedConceptName={selectedName}
        model={ideaWorkbenchModel}
        activeSection={conceptEditorialSection}
        onChangeSection={setConceptEditorialSection}
        onOpenConcept={handleSelectConcept}
      />
    )
    : (activeView === 'threads'
      ? (
        <ProtocolRouteView
          variant="left"
          mode="threads"
          threadsModel={threadsModel}
          onOpenThread={handleOpenThread}
        />
      )
      : activeView === 'handoffs'
      ? (
        <ProtocolRouteView
          variant="left"
          mode="handoffs"
          handoffsModel={handoffsModel}
          onOpenHandoff={handleOpenHandoff}
        />
      )
      : activeView === 'notebook'
        ? renderNotebookEditorialView('left')
        : activeView === 'concepts' && !hasExplicitConceptSelection
        ? thinkShelfRail
        : defaultLeftPanel);

  const mainPanel = activeView === 'home' ? (
    <CalmIndexView
      eyebrow="Think"
      orientation={homeIndexOrientation}
      motion={homeIndexMotion}
      loading={conceptsLoading || notebookLoadingList || allQuestionsLoading}
      showPostureTag
      describeMotionNote={describeThreadMotionNote}
      onSelectThread={handleCalmThreadSelect}
      motionStatusTestIdPrefix="think-home-status"
      maintenanceNote={homeCruftNotice}
      homeCommand={(
        <ThinkHomeUniversalCommand onUniversalCommand={handleHomeUniversalCommand} />
      )}
      actions={(
        <>
          <QuietButton onClick={openTemplatePicker}>Use template</QuietButton>
          <QuietButton onClick={handleCreateNotebookEntry}>New page</QuietButton>
          <QuietButton onClick={() => openConceptComposer('home', search)}>New concept</QuietButton>
          <QuietButton onClick={handleCreateQuestion}>New question</QuietButton>
        </>
      )}
    />
  ) : activeView === 'notebook' ? (
    renderNotebookEditorialView('main')
  ) : activeView === 'threads' ? (
    <ProtocolRouteView
      mode="threads"
      threadsModel={threadsModel}
      threadApprovalHistoryModel={threadApprovalHistoryModel}
      threadHookRunsModel={threadHookRunsModel}
      protocolArtifactDraftsModel={protocolArtifactDraftsModel}
      upkeepCyclesModel={upkeepCyclesModel}
      onOpenHandoff={handleOpenHandoff}
      onOpenThread={handleOpenThread}
      onInvokeWorkflowSkill={queueThoughtPartnerPrompt}
      onOpenThreadFromDraft={handleOpenThreadFromDraft}
      onCreateHandoffFromDraft={handleCreateHandoffFromDraft}
      onQueueFollowUpLoop={handleQueueFollowUpLoopFromDraft}
    />
  ) : activeView === 'handoffs' ? (
    <ProtocolRouteView
      mode="handoffs"
      handoffsModel={handoffsModel}
      handoffApprovalHistoryModel={handoffApprovalHistoryModel}
      handoffHookRunsModel={handoffHookRunsModel}
      protocolArtifactDraftsModel={protocolArtifactDraftsModel}
      upkeepCyclesModel={upkeepCyclesModel}
      onOpenThread={handleOpenThread}
      onOpenHandoff={handleOpenHandoff}
      onInvokeWorkflowSkill={queueThoughtPartnerPrompt}
      onOpenThreadFromDraft={handleOpenThreadFromDraft}
      onCreateHandoffFromDraft={handleCreateHandoffFromDraft}
      onQueueFollowUpLoop={handleQueueFollowUpLoopFromDraft}
    />
  ) : activeView === 'paths' ? (
    <PathsRouteView
      selectedPathId={selectedPathId}
      onSelectPath={handleSelectPath}
    />
  ) : activeView === 'insights' ? (
    <div className="section-stack">
      {insightsPanel}
    </div>
  ) : activeView === 'concepts' && !hasExplicitConceptSelection ? (
    <ConceptsIndexView
      orientation={conceptIndexOrientation}
      conceptsError={conceptsError}
      conceptsLoading={conceptsLoading}
      filteredConcepts={filteredConcepts}
      motion={conceptIndexMotion}
      allConceptsCount={concepts.length}
      search={search}
      onSelectConcept={handleSelectConcept}
      onOpenComposer={openConceptComposer}
      onOpenTemplatePicker={openTemplatePicker}
      renderConceptComposer={renderConceptComposer}
    />
  ) : null;

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

  const rightPanel = isConceptWorkbenchView ? (
    <ConceptEvidenceStreamRail
      concept={concept}
      model={ideaWorkbenchModel}
      referencePullInSlot={renderReferencePullIn('concept-editorial-evidence__reference-control')}
    />
  ) : activeView === 'concepts' ? (
    // AT-329 (b): calm door — the instructional rail card and duplicate
    // actions are gone; the agent alone keeps the right-rail seat.
    <div className="section-stack think-layout__right-panel">
      <ThoughtPartnerPanel
        contextType="think"
        contextId="concept-index"
        contextTitle="Concepts"
        contextMetadata={{
          summary: `You have ${concepts.length} concepts in the workspace.`,
          nextActions: concepts.slice(0, 5).map((item) => item?.name).filter(Boolean),
          relatedItems: concepts.slice(0, 5).map((item) => makeAmbientRelatedItem({
            type: 'concept',
            id: item?._id,
            title: item?.name,
            snippet: item?.description
          })).filter(Boolean)
        }}
        queuedPrompt={queuedThoughtPartnerPrompt}
        {...thoughtPartnerPostureProps}
        title={AGENT_DISPLAY_NAME}
        subtitle="Use this for naming, framing, and deciding which concept to deepen next."
        placeholder="Ask which concept to open, create, or refine next."
        promptTemplates={[
          'Which concept should I deepen next?',
          'Suggest a sharper name for a new concept.',
          'What concept is missing from this workspace?'
        ]}
        emptyStateText="Use the concept route to choose what deserves a page, then deepen it without clutter."
        submitLabel="Send"
      />
    </div>
  ) : activeView === 'notebook' ? (
    renderNotebookEditorialView('right')
  ) : activeView === 'threads' || activeView === 'handoffs' ? (
    <ProtocolRouteView
      variant="right"
      mode={activeView}
      protocolApprovalsModel={protocolApprovalsModel}
      workingMemoryDrawer={workingMemoryDrawer}
    />
  ) : (
    <div className="section-stack think-layout__right-panel">
      {workingMemoryDrawer}
      {thoughtPartnerContext && (
        <ThoughtPartnerPanel
          contextType={thoughtPartnerContext.contextType}
          contextId={thoughtPartnerContext.contextId}
          contextTitle={thoughtPartnerContext.contextTitle}
          contextMetadata={thoughtPartnerContextMetadata}
          placeholder={thoughtPartnerContext.placeholder}
          queuedPrompt={queuedThoughtPartnerPrompt}
          {...thoughtPartnerPostureProps}
        />
      )}
      {renderReferencePullIn('think-layout__reference-pull-in')}
      <AgentArtifactDraftsPanel
        draftsModel={sharedArtifactDraftsModel}
        title="Draft staging"
        subtitle="Agent-created outputs waiting for a human decision."
        emptyText="No staged drafts yet."
        className="think-draft-staging-panel"
        onInvokeWorkflowSkill={queueThoughtPartnerPrompt}
        onOpenThreadFromDraft={handleOpenThreadFromDraft}
        onCreateHandoffFromDraft={handleCreateHandoffFromDraft}
        onQueueFollowUpLoop={handleQueueFollowUpLoopFromDraft}
        contextType={thoughtPartnerContext?.contextType || 'think'}
        contextId={thoughtPartnerContext?.contextId || activeView}
        contextTitle={thoughtPartnerContext?.contextTitle || 'Think'}
      />
      {activeView === 'home' && (
        <div className="think-home-rail">
          {homeArticlesError && (
            <p className="status-message error-message">{homeArticlesError}</p>
          )}
        </div>
      )}
      {activeView === 'insights' ? (
        <>
          <SectionHeader title="Context" subtitle="Insights stay read-only." />
          <p className="muted small">Use themes and connections to decide what to deepen next.</p>
        </>
      ) : activeView === 'handoffs' ? (
        <>
          <SectionHeader title="Queue context" subtitle="Collaboration protocol in Think." />
          <p className="muted small">
            Use auto routing for delegation, then claim, complete, reject, or cancel from the selected handoff.
          </p>
          <p className="muted small">
            Specialist agents only appear when active agent keys exist in Integrations.
          </p>
        </>
      ) : (
        <>
          {activeView !== 'home' && activeView !== 'concepts' && activeView !== 'handoffs' && (
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

      {activeView === 'questions' && (
        <div className="section-stack">
          <SectionHeader title="Context" subtitle="Open loops." />
          {activeQuestion?.linkedTagName ? (
            <TagChip to={`/think?tab=concepts&concept=${encodeURIComponent(activeQuestion.linkedTagName)}`}>
              {activeQuestion.linkedTagName}
            </TagChip>
          ) : (
            <CalmEmptyLine>No concept linked.</CalmEmptyLine>
          )}
          <SectionHeader title="Connections in this question" subtitle="Supports, contradictions, extensions." />
          {contextConnectionsLoading && <p className="muted small">Loading connections…</p>}
          {contextConnectionsError && <p className="status-message error-message">{contextConnectionsError}</p>}
          {!contextConnectionsLoading && !contextConnectionsError && (
            <div className="context-connection-list">
              {contextConnections.length === 0 ? (
                <CalmEmptyLine>No scoped connections yet.</CalmEmptyLine>
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
                <CalmEmptyLine>No related highlights yet.</CalmEmptyLine>
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
                <CalmEmptyLine>No related concepts yet.</CalmEmptyLine>
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
              <ReferencesPanel
                targetType="question"
                targetId={activeQuestion._id}
                label="Show backlinks"
                defaultOpen
                showToggle={false}
              />
            </div>
          )}
        </div>
      )}

      {activeView === 'concepts' && !isConceptWorkbenchView && (
        <div className="section-stack">
          <SectionHeader title="Connections in this concept" subtitle="Supports, contradictions, extensions." />
          {contextConnectionsLoading && <p className="muted small">Loading connections…</p>}
          {contextConnectionsError && <p className="status-message error-message">{contextConnectionsError}</p>}
          {!contextConnectionsLoading && !contextConnectionsError && (
            <div className="context-connection-list">
              {contextConnections.length === 0 ? (
                <CalmEmptyLine>No scoped connections yet.</CalmEmptyLine>
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
          <SemanticRelatedPanel
            sourceType="concept"
            sourceId={concept?._id || ''}
            title="Related highlights"
            limit={6}
            resultTypes={['highlight']}
            enabled={Boolean(concept?._id)}
            renderAction={(item) => (
              <QuietButton onClick={() => handleAddRelatedHighlight(item.objectId)}>Add</QuietButton>
            )}
          />
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
              <CalmEmptyLine>No related concepts yet.</CalmEmptyLine>
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
            <CalmEmptyLine>No correlations yet.</CalmEmptyLine>
          )}
          {concept?.name && (
            <div>
              <SectionHeader title="Used in" subtitle="Backlinks to this concept." />
              <ReferencesPanel
                targetType="concept"
                targetId={concept._id}
                tagName={concept.name}
                label="Show backlinks"
                defaultOpen
                showToggle={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );

  const selectedConceptLayout = isConceptWorkbenchView ? (
    <div className="concept-editorial-shell-page" data-think-posture="concept">
      <div className={`concept-editorial-shell ${conceptPartnerCollapsed ? 'is-partner-collapsed' : ''}`.trim()}>
        <aside className={`concept-editorial-shell__partner ${conceptPartnerCollapsed ? 'is-collapsed' : ''}`.trim()}>
          <ConceptPartnerRail
            concept={concept}
            concepts={concepts}
            selectedConceptName={selectedName}
            model={ideaWorkbenchModel}
            activeSection={conceptEditorialSection}
            onChangeSection={setConceptEditorialSection}
            onOpenConcept={handleSelectConcept}
            collapsed={conceptPartnerCollapsed}
            onToggleCollapse={() => setConceptPartnerCollapsed((current) => !current)}
          />
          {renderReferencePullIn('concept-editorial-shell__reference-pull-in')}
          <div className="concept-editorial-shell__promotion">
            <SectionHeader title="Create" subtitle="Start a new working thought without leaving Think." />
            <div className="think-concept-composer-anchor">
              <QuietButton
                type="button"
                onClick={() => openConceptComposer('selected-concept')}
                data-testid="think-new-concept-sidebar-button"
              >
                New concept
              </QuietButton>
              {renderConceptComposer('selected-concept')}
            </div>
          </div>
          {(concept?._id || selectedName) && (
            <div className="concept-editorial-shell__promotion">
              <SectionHeader title="Graduate" subtitle="Turn this working thought into a durable wiki page." />
              <Button
                type="button"
                onClick={() => { void handlePromoteThinkObjectToWiki('concept'); }}
                disabled={wikiPromotionState.busyTarget === conceptWikiPromotionTarget}
              >
                {wikiPromotionState.busyTarget === conceptWikiPromotionTarget ? 'Promoting...' : 'Promote to wiki page'}
              </Button>
              {renderWikiPromotionTrace(conceptWikiPromotionTarget)}
              {wikiPromotionState.error && wikiPromotionState.busyTarget !== questionWikiPromotionTarget ? wikiPromotionError : null}
            </div>
          )}
        </aside>
        <main className="concept-editorial-shell__main">
          <div className="concept-editorial-shell__main-actions">
            <input
              type="search"
              className="think-index__search-input concept-editorial-shell__quick-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return;
                event.preventDefault();
                submitConceptComposer(search, 'search-enter');
              }}
              placeholder="Search or create concept"
              data-testid="think-index-search-input"
            />
            <div className="think-concept-composer-anchor">
              <QuietButton
                type="button"
                onClick={() => openConceptComposer('selected-concept-header')}
                data-testid="think-new-concept-header-button"
              >
                New concept
              </QuietButton>
              {renderConceptComposer('selected-concept-header')}
            </div>
            <QuietButton type="button" onClick={openTemplatePicker}>
              Use template
            </QuietButton>
          </div>
          {!conceptComposerOpen && conceptComposerStatus.message ? (
            <p
              className={`think-concept-composer-status ${conceptComposerStatus.tone === 'error' ? 'is-error' : 'is-success'}`}
              data-testid="think-concept-composer-status"
            >
              {conceptComposerStatus.message}
            </p>
          ) : null}
          {renderThinkPostureStrip('think-posture-strip--concept')}
          {conceptLoadError && <p className="status-message error-message">{conceptLoadError}</p>}
          {conceptError && <p className="status-message error-message">{conceptError}</p>}
          {relatedError && <p className="status-message error-message">{relatedError}</p>}
          {conceptLoading && !concept ? (
            <div className="think-concept-loading concept-editorial-loading" aria-hidden="true">
              <div className="concept-editorial-loading__head">
                <span className="concept-editorial-loading__eyebrow">Active reasoning draft</span>
                <p className="concept-editorial-loading__note">
                  Gathering the draft, fresh pressure, and nearby source memory from the archive.
                </p>
              </div>
              <div className="concept-editorial-loading__hero">
                <div className="skeleton skeleton-title" style={{ width: '26%', height: 12 }} />
                <div className="skeleton skeleton-title" style={{ width: '54%', height: 32 }} />
                <div className="skeleton skeleton-text" style={{ width: '66%', height: 16 }} />
              </div>
              <div className="concept-editorial-loading__editor">
                <div className="skeleton skeleton-text" style={{ width: '18%', height: 12 }} />
                <div className="concept-editorial-loading__toolbar">
                  <div className="skeleton skeleton-text" style={{ width: 70, height: 10 }} />
                  <div className="skeleton skeleton-text" style={{ width: 78, height: 10 }} />
                  <div className="skeleton skeleton-text" style={{ width: 58, height: 10 }} />
                  <div className="skeleton skeleton-text" style={{ width: 84, height: 10 }} />
                </div>
                <div className="concept-editorial-loading__manuscript">
                  <div className="skeleton skeleton-text" style={{ width: '100%', height: 18 }} />
                  <div className="skeleton skeleton-text" style={{ width: '96%', height: 18 }} />
                  <div className="skeleton skeleton-text" style={{ width: '92%', height: 18 }} />
                  <div className="skeleton skeleton-text" style={{ width: '84%', height: 18 }} />
                  <div className="skeleton skeleton-text" style={{ width: '88%', height: 18 }} />
                </div>
              </div>
            </div>
          ) : concept ? (
            <ConceptEvidenceStreamView
              concept={concept}
              model={ideaWorkbenchModel}
              personalAgents={handoffsModel.sortedPersonalAgents}
              onEditorReady={setConceptEditorialEditor}
              onDropCard={handleIntegrateConceptCard}
              isReceivingDrop={conceptReceivingDrop}
              onRunAction={setConceptEditorialSection}
              onOpenTemplatePicker={openTemplatePicker}
              onShareConcept={() => setConceptShareModalOpen(true)}
            />
          ) : (
            <SurfaceCard className="think-concepts-empty-state">
              <SectionHeader
                title={selectedName || 'Concept'}
                subtitle={conceptLoadError || 'This concept could not be loaded yet.'}
              />
              <div className="think-concepts-empty-state__actions">
                <QuietButton onClick={refresh} disabled={conceptLoading}>
                  Retry
                </QuietButton>
                <QuietButton onClick={() => handleSelectView('concepts')}>
                  Open concepts
                </QuietButton>
              </div>
            </SurfaceCard>
          )}
        </main>
        <aside className="concept-editorial-shell__stream">
          <ConceptEvidenceStreamRail
            concept={concept}
            model={ideaWorkbenchModel}
            personalAgents={handoffsModel.sortedPersonalAgents}
            onIntegrateCard={handleIntegrateConceptCard}
            activeSection={conceptEditorialSection}
            onOpenTemplatePicker={openTemplatePicker}
            referencePullInSlot={renderReferencePullIn('concept-editorial-evidence__reference-control')}
          />
        </aside>
      </div>
      <ConceptShareModal
        open={conceptShareModalOpen}
        conceptName={concept?.name || selectedName || ''}
        onClose={() => setConceptShareModalOpen(false)}
      />
    </div>
  ) : null;

  const conceptIndexEditorialRightPanel = (
    <div className="editorial-side-rail">
      <ThoughtPartnerPanel
        className="editorial-side-rail__partner"
        variant="stream"
        contextType="concept-index"
        contextId="concept-index"
        contextTitle="Concept index"
        contextMetadata={{
          summary: `The concept index currently contains ${concepts.length} concepts.`,
          nextActions: concepts.slice(0, 5).map((item) => item?.name).filter(Boolean),
          relatedItems: concepts.slice(0, 5).map((item) => makeAmbientRelatedItem({
            type: 'concept',
            id: item?._id,
            title: item?.name,
            snippet: item?.description
          })).filter(Boolean)
        }}
        queuedPrompt={queuedThoughtPartnerPrompt}
        {...thoughtPartnerPostureProps}
        title={AGENT_DISPLAY_NAME}
        subtitle="Concept contextualization"
        placeholder="Ask which concept to open, create, or refine next."
        promptTemplates={[
          'Which concept should I deepen next?',
          'Suggest a sharper name for a new concept.',
          'What concept is missing from this workspace?'
        ]}
        emptyStateText="Use the index rail to choose what to develop before you open the manuscript."
        submitLabel="↗"
      />
      <div className="editorial-side-rail__section">
        <SectionHeader title="Workbench posture" subtitle="How to use this rail." />
        <p className="muted small">
          Name the concept first. Pull support, contradiction, and related material only after the page has somewhere calm for them to land.
        </p>
        <div className="think-home-rail__actions">
          <div className="think-concept-composer-anchor">
            <QuietButton onClick={() => openConceptComposer('index-rail', search)} data-testid="think-concepts-index-rail-create-button">
              New concept
            </QuietButton>
            {renderConceptComposer('index-rail')}
          </div>
          <QuietButton onClick={handleQueueOrganizationPrompt}>Clean up structure</QuietButton>
          <QuietButton onClick={openTemplatePicker}>
            Browse templates
          </QuietButton>
        </div>
      </div>
    </div>
  );

  const homeEditorialRightPanel = (
    <div className="editorial-side-rail">
      <ThoughtPartnerPanel
        className="editorial-side-rail__partner"
        variant="stream"
        contextType="think"
        contextId="think-home"
        contextTitle="Think home"
        contextMetadata={thoughtPartnerContextMetadata}
        queuedPrompt={queuedThoughtPartnerPrompt}
        {...thoughtPartnerPostureProps}
        title={AGENT_DISPLAY_NAME}
        subtitle="Workspace contextualization"
        placeholder="Ask what to resume, refine, or gather next."
        promptTemplates={[
          'What should I resume first?',
          'Which concept has the strongest motion right now?',
          'What question is still most unresolved?'
        ]}
        emptyStateText="Use the stream to sort the notebook, concepts, and open questions before diving deeper."
        submitLabel="↗"
      />
      <AgentArtifactDraftsPanel
        draftsModel={sharedArtifactDraftsModel}
        title="Draft staging"
        subtitle="Recent agent outputs that are ready to land somewhere in Think."
        emptyText="No staged drafts yet."
        accent="output"
        className="editorial-side-rail__section editorial-side-rail__drafts think-draft-staging-panel"
        compact
        maxPending={3}
        showPromoted={false}
        onInvokeWorkflowSkill={queueThoughtPartnerPrompt}
        onOpenThreadFromDraft={handleOpenThreadFromDraft}
        onCreateHandoffFromDraft={handleCreateHandoffFromDraft}
        onQueueFollowUpLoop={handleQueueFollowUpLoopFromDraft}
        contextType="think"
        contextId="think-home"
        contextTitle="Think home"
      />
      <UpkeepCyclesPanel
        upkeepCyclesModel={upkeepCyclesModel}
        className="editorial-side-rail__section"
        onOpenThread={handleOpenThread}
        onOpenHandoff={handleOpenHandoff}
      />
      <AgentSkillDock
        surface="workspace"
        contextType="think"
        category="output"
        contextId="think-home"
        targetContextType="think"
        targetContextId="think-home"
        contextTitle="Think home"
        title="Output studio"
        subtitle="Package the workspace into briefs, synthesis docs, and presentation-ready outlines."
        className="editorial-side-rail__section agent-skill-dock--output"
        maxVisible={4}
        onInvoke={queueThoughtPartnerPrompt}
      />
      <AgentSkillDock
        surface="workspace"
        contextType="think"
        category="maintain"
        contextId="think-home"
        targetContextType="think"
        targetContextId="think-home"
        contextTitle="Think home"
        title="Workspace maintenance"
        subtitle="Scan the workspace for gaps, duplicates, stale framing, contradictions, missing links, concept health, and hygiene drift."
        className="editorial-side-rail__section agent-skill-dock--maintenance"
        maxVisible={10}
        onInvoke={queueThoughtPartnerPrompt}
      />

      {homeArticlesError && (
        <p className="status-message error-message">{homeArticlesError}</p>
      )}
    </div>
  );

  const homeEditorialLayout = activeView === 'home' ? (
    <div className="think-home-editorial-shell-page" data-think-posture={activeThinkPosture}>
      <div className="think-home-editorial-shell">
        <aside className="think-home-editorial-shell__left">
          {homeEditorialLeftPanel}
        </aside>
        <main className="think-home-editorial-shell__main">
          {mainPanel}
        </main>
        <aside className="think-home-editorial-shell__right">
          {homeEditorialRightPanel}
        </aside>
      </div>
    </div>
  ) : null;

  const notebookEditorialLayout = activeView === 'notebook' ? renderNotebookEditorialView('shell') : null;

  const questionScopedArtifactDraftsModel = useMemo(() => {
    if (!sharedArtifactDraftsModel || typeof sharedArtifactDraftsModel !== 'object') return sharedArtifactDraftsModel;
    const activeQuestionId = cleanText(
      thoughtPartnerContext?.contextType === 'question'
        ? thoughtPartnerContext?.contextId
        : activeQuestionData?._id
    );
    if (!activeQuestionId) {
      return {
        ...sharedArtifactDraftsModel,
        artifactDrafts: [],
        pendingCount: 0
      };
    }
    const filteredDrafts = (Array.isArray(sharedArtifactDraftsModel.artifactDrafts)
      ? sharedArtifactDraftsModel.artifactDrafts
      : []
    ).filter((draft) => (
      cleanText(draft?.sourceContext?.type).toLowerCase() === 'question'
      && cleanText(draft?.sourceContext?.id) === activeQuestionId
    ));
    return {
      ...sharedArtifactDraftsModel,
      artifactDrafts: filteredDrafts,
      pendingCount: filteredDrafts.filter((draft) => cleanText(draft?.status).toLowerCase() === 'pending').length
    };
  }, [
    activeQuestionData?._id,
    sharedArtifactDraftsModel,
    thoughtPartnerContext?.contextId,
    thoughtPartnerContext?.contextType
  ]);

  const conceptIndexEditorialLayout = activeView === 'concepts' && !hasExplicitConceptSelection ? (
    <div className="concept-index-editorial-shell-page" data-think-posture="concept">
      <div className="concept-index-editorial-shell">
        <aside className="concept-index-editorial-shell__left">
          {thinkShelfRail}
        </aside>
        <main className="concept-index-editorial-shell__main">
          <div className="concept-index-editorial-main">
            <div className="sr-only">
              <SegmentedNav
                items={THINK_SUB_NAV_ITEMS}
                value="concepts"
                onChange={handleSelectView}
                appearance="quiet"
              />
              <div className="think-main-actions__menu">
                <QuietButton
                  className={`list-button think-main-actions__utility ${headerActionsMenuOpen ? 'is-active' : ''}`}
                  onClick={() => setHeaderActionsMenuOpen((previous) => !previous)}
                  aria-haspopup="menu"
                  aria-expanded={headerActionsMenuOpen}
                  data-testid="think-header-actions-menu-button"
                >
                  ••• Actions
                </QuietButton>
                {headerActionsMenuOpen && (
                  <div className="think-main-actions__menu-popover" role="menu" data-testid="think-header-actions-menu">
                    {THINK_ADVANCED_NAV_ITEMS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        className={`think-main-actions__menu-item ${activeView === item.value ? 'is-active' : ''}`}
                        role="menuitem"
                        onClick={() => {
                          closeHeaderMenus();
                          handleSelectView(item.value);
                        }}
                      >
                        Open {item.label.toLowerCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {mainPanel}
          </div>
        </main>
        <aside className="concept-index-editorial-shell__right">
          {conceptIndexEditorialRightPanel}
        </aside>
      </div>
    </div>
  ) : null;

  const questionEditorialLayout = isQuestionEditorialView ? (
    <>
    <QuestionEditorialView
      activeQuestion={activeQuestion}
      activeQuestionData={activeQuestionData}
      activeSection={questionEditorialSection}
      onChangeSection={setQuestionEditorialSection}
      partnerRailNavItems={partnerRailNavItems}
      onCreateQuestion={handleCreateQuestion}
      questionSaving={questionSaving}
      search={search}
      onSearchChange={setSearch}
      questionStatus={questionStatus}
      onQuestionStatusChange={setQuestionStatus}
      allQuestionsLoading={allQuestionsLoading}
      allQuestionsError={allQuestionsError}
      filteredQuestions={filteredQuestions}
      renderPartnerQuestionList={renderPartnerQuestionList}
      questionError={questionError}
      questionRelated={questionRelated}
      questionRelatedLoading={questionRelatedLoading}
      questionRelatedError={questionRelatedError}
      contextConnections={contextConnections}
      contextConnectionsLoading={contextConnectionsLoading}
      contextConnectionsError={contextConnectionsError}
      onAttachRelatedHighlight={handleAttachRelatedHighlight}
      renderThinkPostureStrip={renderThinkPostureStrip}
      onSaveQuestion={handleSaveQuestion}
      onRegisterQuestionInsert={(fn) => { questionInsertRef.current = fn; }}
      onOpenSynthesis={openSynthesis}
      queueThoughtPartnerPrompt={queueThoughtPartnerPrompt}
      thoughtPartnerContext={thoughtPartnerContext}
      thoughtPartnerContextMetadata={thoughtPartnerContextMetadata}
      queuedThoughtPartnerPrompt={queuedThoughtPartnerPrompt}
      thoughtPartnerPostureProps={thoughtPartnerPostureProps}
      renderReferencePullIn={renderReferencePullIn}
      onQueueOrganizationPrompt={handleQueueOrganizationPrompt}
      onMarkAnswered={handleMarkAnswered}
      onPromoteThinkObjectToWiki={handlePromoteThinkObjectToWiki}
      wikiPromotionState={wikiPromotionState}
      questionWikiPromotionTarget={questionWikiPromotionTarget}
      conceptWikiPromotionTarget={conceptWikiPromotionTarget}
      wikiPromotionError={wikiPromotionError}
      renderWikiPromotionTrace={renderWikiPromotionTrace}
      questionScopedArtifactDraftsModel={questionScopedArtifactDraftsModel}
      onOpenThreadFromDraft={handleOpenThreadFromDraft}
      onCreateHandoffFromDraft={handleCreateHandoffFromDraft}
      onQueueFollowUpLoopFromDraft={handleQueueFollowUpLoopFromDraft}
      shelfRail={thinkShelfRail}
      indexMotion={questionIndexMotion}
      indexOrientation={questionIndexOrientation}
      indexLoading={allQuestionsLoading}
      allQuestionsCount={allQuestions.length}
      onCalmThreadSelect={handleCalmThreadSelect}
      onShareQuestion={() => setQuestionShareModalOpen(true)}
    />
    <QuestionShareModal
      open={questionShareModalOpen}
      questionId={activeQuestionData?._id || ''}
      questionText={activeQuestionData?.text || ''}
      onClose={() => setQuestionShareModalOpen(false)}
    />
    </>
  ) : null;
  const disableEditorialShell = searchParams.get('legacyShell') === '0';
  const activePrimaryNavValue = THINK_SUB_NAV_ITEMS.some((item) => item.value === activeView) ? activeView : '';

  return (
    <Suspense fallback={<ThinkPanelFallback />}>
      {isConceptWorkbenchView ? (
        selectedConceptLayout
      ) : !disableEditorialShell && activeView === 'home' ? (
        homeEditorialLayout
      ) : !disableEditorialShell && activeView === 'notebook' ? (
        notebookEditorialLayout
      ) : !disableEditorialShell && activeView === 'concepts' && !hasExplicitConceptSelection ? (
        conceptIndexEditorialLayout
      ) : isQuestionEditorialView ? (
        questionEditorialLayout
      ) : (
        <ThreePaneLayout
          className={`three-pane--editorial three-pane--think-posture-${activeThinkPosture} ${
            activeView === 'concepts'
              ? 'three-pane--concepts-index three-pane--concepts'
              : activeView === 'notebook'
                ? 'three-pane--notebook'
              : 'three-pane--think'
          }`}
          left={leftPanel}
          main={mainPanel}
          right={rightPanel}
          rightTitle="Context"
          rightOpen={rightOpen}
          onToggleRight={handleToggleRight}
          leftOpen={!isConceptWorkbenchView}
          defaultLeftOpen={!isConceptWorkbenchView}
          defaultRightOpen
          mainHeader={(activeView === 'notebook')
            ? null
            : <PageTitle className="think-page-title" title="Think" subtitle="Concepts first. Notebook and questions stay close." />}
          mainActions={isConceptWorkbenchView ? null : (
            <div className="library-main-actions think-main-actions">
              <SegmentedNav
                className="think-main-actions__segments"
                items={THINK_SUB_NAV_ITEMS}
                value={activePrimaryNavValue}
                onChange={handleSelectView}
                appearance="quiet"
              />
              {organizationPrompt ? (
                <QuietButton
                  className="list-button think-main-actions__utility"
                  onClick={() => queueThoughtPartnerPrompt(organizationPrompt)}
                >
                  Clean up structure
                </QuietButton>
              ) : null}
              <div className="think-main-actions__menu-group">
                <div className="think-concept-composer-anchor think-main-actions__menu" ref={headerNewMenuRef}>
                  <QuietButton
                    className="list-button think-main-actions__utility think-main-actions__utility--first"
                    onClick={() => {
                      setHeaderNewMenuOpen((previous) => {
                        const next = !previous;
                        if (next) setHeaderActionsMenuOpen(false);
                        return next;
                      });
                    }}
                    aria-haspopup="menu"
                    aria-expanded={headerNewMenuOpen}
                    data-testid="think-header-new-menu-button"
                  >
                    + New
                  </QuietButton>
                  {headerNewMenuOpen && (
                    <div className="think-main-actions__menu-popover" role="menu" data-testid="think-header-new-menu">
                      <button
                        type="button"
                        className="think-main-actions__menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeHeaderMenus();
                          handleCreateNotebookEntry();
                        }}
                      >
                        New note
                      </button>
                      <button
                        type="button"
                        className="think-main-actions__menu-item"
                        role="menuitem"
                        data-testid="think-new-concept-header-button"
                        onClick={() => {
                          closeHeaderMenus();
                          openConceptComposer('header');
                        }}
                      >
                        New concept
                      </button>
                      <button
                        type="button"
                        className="think-main-actions__menu-item"
                        role="menuitem"
                        data-testid="think-new-template-header-button"
                        onClick={() => {
                          closeHeaderMenus();
                          openTemplatePicker();
                        }}
                      >
                        New from template
                      </button>
                      <button
                        type="button"
                        className="think-main-actions__menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeHeaderMenus();
                          handleCreateQuestion();
                        }}
                      >
                        New question
                      </button>
                    </div>
                  )}
                  {renderConceptComposer('header')}
                </div>
                <div className="think-main-actions__menu" ref={headerActionsMenuRef}>
                  <QuietButton
                    className={`list-button think-main-actions__utility ${headerActionsMenuOpen ? 'is-active' : ''}`}
                    onClick={() => {
                      setHeaderActionsMenuOpen((previous) => {
                        const next = !previous;
                        if (next) setHeaderNewMenuOpen(false);
                        return next;
                      });
                    }}
                    aria-haspopup="menu"
                    aria-expanded={headerActionsMenuOpen}
                    data-testid="think-header-actions-menu-button"
                  >
                    ••• Actions
                  </QuietButton>
                  {headerActionsMenuOpen && (
                    <div className="think-main-actions__menu-popover" role="menu" data-testid="think-header-actions-menu">
                      <button
                        type="button"
                        className="think-main-actions__menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeHeaderMenus();
                          handleToggleExpandAllCards();
                        }}
                      >
                        {cardsExpanded ? 'Collapse all' : 'Expand all'}
                      </button>
                      <button
                        type="button"
                        className={`think-main-actions__menu-item ${rightOpen ? 'is-active' : ''}`}
                        role="menuitem"
                        onClick={() => {
                          closeHeaderMenus();
                          handleToggleRight(!rightOpen);
                        }}
                      >
                        {rightOpen ? 'Hide context' : 'Show context'}
                      </button>
                      <button
                        type="button"
                        className={`think-main-actions__menu-item ${activeView === 'home' ? 'is-active' : ''}`}
                        role="menuitem"
                        onClick={() => {
                          closeHeaderMenus();
                          handleSelectView('home');
                        }}
                      >
                        Open desk
                      </button>
                      {THINK_ADVANCED_NAV_ITEMS.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          className={`think-main-actions__menu-item ${activeView === item.value ? 'is-active' : ''}`}
                          role="menuitem"
                          onClick={() => {
                            closeHeaderMenus();
                            handleSelectView(item.value);
                          }}
                        >
                          Open {item.label.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        />
      )}
      {highlightConceptModal.open && (
        <LibraryConceptModal
          open={highlightConceptModal.open}
          highlight={highlightConceptModal.highlight}
          onClose={() => setHighlightConceptModal({ open: false, highlight: null })}
          onSelect={handleAddHighlightToConcept}
        />
      )}
      {highlightNotebookModal.open && (
        <LibraryNotebookModal
          open={highlightNotebookModal.open}
          highlight={highlightNotebookModal.highlight}
          onClose={() => setHighlightNotebookModal({ open: false, highlight: null })}
          onSend={handleSendHighlightToNotebook}
        />
      )}
      {highlightQuestionModal.open && (
        <LibraryQuestionModal
          open={highlightQuestionModal.open}
          highlight={highlightQuestionModal.highlight}
          onClose={() => setHighlightQuestionModal({ open: false, highlight: null })}
          onCreate={handleCreateQuestionFromHighlight}
          onAttach={handleAttachHighlightToQuestion}
        />
      )}
      {synthesisOpen && (
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
      )}
      {templatePickerOpen && (
        <ConceptTemplatePickerModal
          open={templatePickerOpen}
          onClose={closeTemplatePicker}
          onCreated={handleTemplateCreated}
        />
      )}
      {notebookMoveModalEntry && (
        <NotebookMoveEntryModal
          open={Boolean(notebookMoveModalEntry)}
          entry={notebookMoveModalEntry}
          folders={notebookFolders}
          loading={Boolean(notebookMovePendingId)}
          error={notebookMoveError}
          onClose={handleCloseNotebookMoveModal}
          onCreateFolder={handleCreateNotebookFolder}
          onMove={(folderId) => handleMoveNotebookEntry(notebookMoveModalEntry, folderId)}
        />
      )}
    </Suspense>
  );
};

export default ThinkMode;
