import React, { Profiler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageTitle, SectionHeader, QuietButton, Button, TagChip, SegmentedNav, SurfaceCard } from '../components/ui';
import useConcepts from '../hooks/useConcepts';
import useConcept from '../hooks/useConcept';
import useConceptRelated from '../hooks/useConceptRelated';
import ReferencesPanel from '../components/ReferencesPanel';
import {
  updateConcept,
  updateConceptPins,
  suggestConceptWorkspaceFromLibrary
} from '../api/concepts';
import NotebookEditor from '../components/think/notebook/NotebookEditor';
import NotebookContext from '../components/think/notebook/NotebookContext';
import NotebookFolderTree from '../components/think/notebook/NotebookFolderTree';
import NotebookMoveEntryModal from '../components/think/notebook/NotebookMoveEntryModal';
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
import ConceptPathWorkspace from '../components/paths/ConceptPathWorkspace';
import ThoughtPartnerPanel from '../components/agent/ThoughtPartnerPanel';
import AgentSkillDock from '../components/agent/AgentSkillDock';
import AgentArtifactDraftsPanel from '../components/agent/AgentArtifactDraftsPanel';
import UpkeepCyclesPanel from '../components/agent/UpkeepCyclesPanel';
import ProtocolApprovalsPanel from '../components/agent/ProtocolApprovalsPanel';
import ConceptTemplatePickerModal from '../components/think/concepts/ConceptTemplatePickerModal';
import ThinkHome from '../components/think/ThinkHome';
import useIdeaWorkbenchModel from '../components/think/concepts/idea-workbench/useIdeaWorkbenchModel';
import ConceptEvidenceStreamView, {
  formatEditorialEvidenceHtml,
  ConceptEvidenceStreamRail,
  ConceptPartnerRail
} from '../components/think/concepts/ConceptEvidenceStreamView';
import VirtualList from '../components/virtual/VirtualList';
import SemanticRelatedPanel from '../components/retrieval/SemanticRelatedPanel';
import HandoffsSidebar from '../components/think/handoffs/HandoffsSidebar';
import HandoffsMainPanel from '../components/think/handoffs/HandoffsMainPanel';
import ThreadsSidebar from '../components/think/threads/ThreadsSidebar';
import ThreadsMainPanel from '../components/think/threads/ThreadsMainPanel';
import { getConnectionsForScope } from '../api/connections';
import { createProfilerLogger, endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';
import { listReturnQueue } from '../api/returnQueue';
import { getArticles } from '../api/articles';
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
import {
  buildCanonicalArticlePath,
  clearFirstInsightState,
  getFirstInsightOpenPath,
  readFirstInsightState
} from '../utils/firstInsight';
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

const THINK_RIGHT_STORAGE_KEY = 'workspace-right-open:/think';
const THINK_RIGHT_MIGRATION_KEY = 'workspace-right-open:/think:migrated-v2';
const THINK_RECENTS_STORAGE_KEY = 'think.recent.targets';
const THINK_INDEX_GROUPS_STORAGE_KEY = 'think.index.groups.collapsed';
const THINK_CONCEPT_ROW_HEIGHT = 46;
const THINK_QUESTION_ROW_HEIGHT = 60;
const THINK_HOME_LIMIT = 6;
const CONCEPT_COMPOSER_DEFAULT_STATE = { message: '', tone: 'success' };
const cleanText = (value = '') => String(value || '').trim();
const THINK_SUB_NAV_ITEMS = [
  { value: 'concepts', label: 'Concepts' },
  { value: 'notebook', label: 'Notebook' },
  { value: 'questions', label: 'Questions' }
];

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
    return `AI model configuration issue (${provider || 'unknown provider'} / ${model || 'unknown model'}). Ask admin to update HF_TEXT_MODEL or HF_PROVIDER.`;
  }
  if (status === 429 && detail === 'HF credits depleted') {
    return 'AI credits are depleted. Buy Hugging Face credits or wait for reset.';
  }
  if (status === 502 && /service error 429/i.test(message)) {
    return 'AI provider is temporarily rate-limited. Please retry in a minute.';
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

const formatIndexDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
};

const formatReviewDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
};

const describeConceptReviewState = (conceptItem = {}) => {
  const freshness = conceptItem?.freshness || {};
  const reviewedLabel = formatReviewDate(freshness?.lastReviewedAt);
  if (freshness?.stale) {
    if (reviewedLabel && freshness?.statusLabel) {
      return `Last reviewed ${reviewedLabel}. ${freshness.statusLabel} waiting.`;
    }
    if (freshness?.statusLabel) {
      return `${freshness.statusLabel} waiting in the archive.`;
    }
    return 'Newer archive material is waiting on this concept.';
  }
  if (reviewedLabel) {
    return `Reviewed ${reviewedLabel}. Current with the archive you have already pulled through this concept.`;
  }
  return 'Open the concept to pull support, tension, and remembered reading back into the draft.';
};

const compareReviewDates = (left, right) => {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
  const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
  return safeLeft - safeRight;
};

const sortConceptsForIndex = (items = [], { staleFirst = false } = {}) => [...items].sort((left, right) => {
  if (staleFirst) {
    const reviewOrder = compareReviewDates(left?.freshness?.lastReviewedAt, right?.freshness?.lastReviewedAt);
    if (reviewOrder !== 0) return reviewOrder;
  } else {
    const reviewOrder = compareReviewDates(right?.freshness?.lastReviewedAt, left?.freshness?.lastReviewedAt);
    if (reviewOrder !== 0) return reviewOrder;
  }
  return String(left?.name || '').localeCompare(String(right?.name || ''));
});

const CalmEmptyLine = React.memo(({ children }) => (
  <p className="think-calm-empty-line">{children}</p>
));

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

const EditorialRail = React.memo(({
  heroTitle = 'The Partner',
  heroSubtitle = 'Contextual intelligence',
  ctaLabel = 'New inquiry',
  onCta = () => {},
  ctaDisabled = false,
  navItems = [],
  activeNav = '',
  onChangeNav = () => {},
  sections = [],
  footer = null
}) => {
  const activeNavIndex = Math.max(0, navItems.findIndex((item) => item.key === activeNav));

  return (
    <div className="concept-editorial-partner concept-editorial-partner--index">
      <div className="concept-editorial-partner__hero">
        <div className="concept-editorial-partner__title-row">
          <div className="concept-editorial-partner__mark">✦</div>
          <div className="concept-editorial-partner__title-copy">
            <h2>{heroTitle}</h2>
            <p>{heroSubtitle}</p>
          </div>
        </div>
        {ctaLabel ? (
          <button
            type="button"
            className="concept-editorial-partner__new-inquiry"
            onClick={onCta}
            disabled={ctaDisabled}
          >
            {ctaLabel}
          </button>
        ) : null}
      </div>

      {navItems.length > 0 && (
        <nav className="concept-editorial-partner__nav" aria-label={`${heroTitle} sections`}>
          <span
            className="concept-editorial-partner__nav-indicator"
            aria-hidden="true"
            style={{ transform: `translateY(${activeNavIndex * 39}px)` }}
          />
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeNav === item.key ? 'is-active' : ''}
              onClick={() => onChangeNav(item.key)}
            >
              <span className="concept-editorial-partner__nav-short">{item.short}</span>
              <span className="concept-editorial-partner__nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="concept-editorial-partner__sections">
        {sections.map((section) => (
          <section
            key={section.label}
            className={`concept-editorial-partner__section ${section.flush ? 'concept-editorial-partner__section--flush' : ''}`.trim()}
          >
            <span>{section.label}</span>
            {section.content}
          </section>
        ))}
      </div>

      {footer ? (
        <div className="concept-editorial-partner__footer">
          {footer}
        </div>
      ) : null}
    </div>
  );
});

const PartnerLineList = React.memo(({ items = [], emptyMessage = 'Nothing here yet.' }) => (
  items.length > 0 ? <ul>{items}</ul> : <p>{emptyMessage}</p>
));

const ThinkMode = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTabParam = searchParams.get('tab') || '';
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
  const [homeEditorialSection, setHomeEditorialSection] = useState('assistant');
  const [notebookEditorialSection, setNotebookEditorialSection] = useState('assistant');
  const [conceptIndexSection, setConceptIndexSection] = useState('assistant');
  const [questionEditorialSection, setQuestionEditorialSection] = useState('assistant');
  const [queuedThoughtPartnerPrompt, setQueuedThoughtPartnerPrompt] = useState(null);
  const selectedPathId = searchParams.get('pathId') || '';
  const selectedHandoffId = searchParams.get('handoffId') || '';
  const selectedThreadId = searchParams.get('threadId') || '';
  const [search, setSearch] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [conceptError, setConceptError] = useState('');
  const [highlightOffset, setHighlightOffset] = useState(0);
  const [recentHighlights, setRecentHighlights] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activationState, setActivationState] = useState(() => readFirstInsightState());
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
  const [homeReturnQueue, setHomeReturnQueue] = useState([]);
  const [homeQueueLoading, setHomeQueueLoading] = useState(false);
  const [homeQueueError, setHomeQueueError] = useState('');
  const [homeArticles, setHomeArticles] = useState([]);
  const [homeArticlesLoading, setHomeArticlesLoading] = useState(false);
  const [homeArticlesError, setHomeArticlesError] = useState('');
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
  const conceptComposerInputRef = useRef(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [headerNewMenuOpen, setHeaderNewMenuOpen] = useState(false);
  const [headerActionsMenuOpen, setHeaderActionsMenuOpen] = useState(false);
  const headerNewMenuRef = useRef(null);
  const headerActionsMenuRef = useRef(null);

  const { concepts, loading: conceptsLoading, error: conceptsError, refresh: refreshConcepts } = useConcepts();
  const selectedName = queryConcept;
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

  const searchQuery = useMemo(() => search.trim().toLowerCase(), [search]);
  const filteredConcepts = useMemo(() => {
    if (!searchQuery) return concepts;
    return concepts.filter(c => c.name.toLowerCase().includes(searchQuery));
  }, [concepts, searchQuery]);
  const conceptIndexSections = useMemo(() => {
    const staleConcepts = filteredConcepts.filter((item) => item?.freshness?.stale);
    const currentConcepts = filteredConcepts.filter((item) => !item?.freshness?.stale);
    const sections = [];
    if (staleConcepts.length > 0) {
      sections.push({
        key: 'review',
        title: 'Review next',
        subtitle: 'Concepts with newer material waiting in the archive.',
        items: sortConceptsForIndex(staleConcepts, { staleFirst: true })
      });
    }
    if (currentConcepts.length > 0) {
      sections.push({
        key: 'current',
        title: staleConcepts.length > 0 ? 'Current threads' : 'All concepts',
        subtitle: staleConcepts.length > 0
          ? 'Concepts that are already current with the archive you have pulled through.'
          : 'Open a concept to draft, recover support, and connect what you already know.',
        items: sortConceptsForIndex(currentConcepts)
      });
    }
    return sections;
  }, [filteredConcepts]);
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
  const pinnedArticleIds = useMemo(() => concept?.pinnedArticleIds || [], [concept?.pinnedArticleIds]);
  const pinnedHighlights = useMemo(() => concept?.pinnedHighlights || [], [concept?.pinnedHighlights]);
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
    enabled: true
  });
  const { questions: allQuestions, loading: allQuestionsLoading, error: allQuestionsError, setQuestions: setAllQuestions } = questionQuery;
  const filteredQuestions = useMemo(() => {
    if (!searchQuery) return allQuestions;
    return allQuestions.filter((question) => (question.text || '').toLowerCase().includes(searchQuery));
  }, [allQuestions, searchQuery]);

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
        const response = await api.get('/api/ai/health', getAuthHeaders());
        if (!cancelled) {
          if (response?.data?.status === 'disabled' || response?.data?.error === 'AI_DISABLED') {
            setAiHealthError('AI insights are currently disabled. Use themes and connections later, but keep working in concepts, notebook, and questions now.');
            setAiHealthStatus('disabled');
          } else {
            setAiHealthStatus('ok');
          }
        }
      } catch (err) {
        if (cancelled) return;
        const code = err.response?.data?.error;
        if (code === 'AI_DISABLED') {
          setAiHealthError('AI insights are currently disabled. Enable AI on the server to restore this tab.');
        } else {
          setAiHealthError('AI insights are temporarily unavailable. You can keep working while we reconnect.');
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

  const loadNotebookFolders = useCallback(async () => {
    setNotebookFoldersLoading(true);
    setNotebookFoldersError('');
    try {
      const res = await api.get('/api/notebook/folders', getAuthHeaders());
      setNotebookFolders(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setNotebookFoldersError(err.response?.data?.error || 'Failed to load notebook folders.');
      setNotebookFolders([]);
    } finally {
      setNotebookFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotebookFolders();
  }, [loadNotebookFolders]);

  const handleArtifactDraftChanged = useCallback(async (result) => {
    await Promise.all([
      threadsModel.loadThreads?.(),
      handoffsModel.loadHandoffs?.()
    ]);

    const artifactType = String(result?.draft?.artifactType || '').trim().toLowerCase();
    const promoted = result?.promoted || null;
    if (!promoted || !artifactType) return;

    if (artifactType === 'note' && promoted?._id) {
      await loadNotebookEntries();
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
    autoLoad: activeView !== 'threads' && activeView !== 'handoffs',
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
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'notebook');
    params.set('entryId', notebookActiveId);
    setSearchParams(params, { replace: true });
  }, [notebookActiveId, activeView, loadNotebookEntry, searchParams, setSearchParams]);

  React.useEffect(() => {
    setDescriptionDraft(concept?.description || '');
    setIsEditingSummary(false);
  }, [concept?.description]);

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

  useEffect(() => {
    if (rawTabParam) return;
    if (activeView !== 'concepts' || selectedName) return;
    const recentConcept = recentTargets.find((item) => item.type === 'concept' && cleanText(item.title));
    if (!recentConcept?.title) return;
    handleSelectConcept(recentConcept.title);
  }, [activeView, handleSelectConcept, rawTabParam, recentTargets, selectedName]);

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

  const handleCreateConceptFromHome = useCallback(() => {
    handleSelectView('concepts');
    openConceptComposer('hero', search);
  }, [handleSelectView, openConceptComposer, search]);

  const handleTemplateCreated = useCallback(async (created = null) => {
    const nextConceptName = String(created?.conceptName || '').trim();
    const target = String(created?.target || '').trim().toLowerCase();
    const nextNotebookId = String(created?.notebookEntryId || created?.notebookEntry?._id || '').trim();

    if (target === 'notebook' && nextNotebookId) {
      await loadNotebookEntries();
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
      message: runScout ? 'Creating concept and preparing AI scout...' : 'Creating concept...',
      tone: 'success'
    });
    setConceptError('');
    try {
      const updatedConcept = await updateConcept(candidate, { description });
      await refreshConcepts();
      handleSelectConcept(candidate);
      setConceptComposerStatus({
        message: runScout
          ? `Created concept: ${candidate}. Running AI scout...`
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
              message: `AI scout ready: ${itemCount} items and ${conceptCount} concepts suggested.`,
              tone: 'success'
            });
          })
          .catch((scoutError) => {
            const scoutStatus = Number(scoutError?.response?.status || 0);
            setConceptComposerStatus({
              message: scoutStatus === 401
                ? 'Concept created, but your session expired before AI scout completed.'
                : (scoutError?.response?.data?.error || 'Concept created, but AI scout failed.'),
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
    window.location.href = buildCanonicalArticlePath(articleId);
  }, []);

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

  const renderPartnerNotebookList = useCallback((items, emptyMessage = 'No notebook entries yet.') => (
    <PartnerLineList
      emptyMessage={emptyMessage}
      items={items.map((entry) => {
        const id = cleanText(entry?._id);
        const title = cleanText(entry?.title) || 'Untitled';
        const date = formatIndexDate(entry?.updatedAt || entry?.createdAt);
        return (
          <li key={id || title}>
            <button
              type="button"
              className="concept-editorial-partner__concept-link"
              onClick={() => handleSelectNotebookEntry(id)}
            >
              {date ? `${title} · ${date}` : title}
            </button>
          </li>
        );
      })}
    />
  ), [handleSelectNotebookEntry]);

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
        />
      </div>
    );
  }, [
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
          <span>Run AI scout after create</span>
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
  const templatePromptLines = [
    'Use a template when the concept already has a known shape.',
    'Create directly when the claim is still loose and needs room to move.'
  ];
  const partnerRailNavItems = useMemo(() => ([
    { key: 'assistant', label: 'Assistant', short: 'As' },
    { key: 'sources', label: 'Sources', short: 'So' },
    { key: 'highlights', label: 'Highlights', short: 'Hi' },
    { key: 'annotations', label: 'Annotations', short: 'An' }
  ]), []);

  const homeEditorialLeftPanel = (
    <EditorialRail
      heroTitle="The Partner"
      heroSubtitle="Contextual intelligence"
      ctaLabel="New inquiry"
      onCta={handleCreateNotebookEntry}
      navItems={partnerRailNavItems}
      activeNav={homeEditorialSection}
      onChangeNav={setHomeEditorialSection}
      sections={
        homeEditorialSection === 'sources'
          ? [
              {
                label: 'Search and route',
                content: (
                  <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                    <input
                      type="text"
                      value={search}
                      placeholder="Search notes, concepts, questions"
                      data-testid="think-index-search-input"
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                )
              },
              {
                label: 'Recent material',
                flush: true,
                content: (
                  homeArticlesLoading ? (
                    <SidebarSkeletonRows rows={6} />
                  ) : (
                    <PartnerLineList
                      emptyMessage="No source material yet."
                      items={homeArticles.slice(0, 6).map((article) => (
                        <li key={article._id}>
                          <button
                            type="button"
                            className="concept-editorial-partner__concept-link"
                            onClick={() => handleOpenHomeArticle(article._id)}
                          >
                            {article.title || 'Untitled article'}{article.createdAt ? ` · ${formatIndexDate(article.createdAt)}` : ''}
                          </button>
                        </li>
                      ))}
                    />
                  )
                )
              },
              {
                label: 'Working concepts',
                flush: true,
                content: conceptsLoading
                  ? <SidebarSkeletonRows rows={4} />
                  : renderPartnerConceptList(homeWorkingSet.concepts.slice(0, 4), 'No concepts yet.')
              }
            ]
          : homeEditorialSection === 'highlights'
            ? [
              {
                label: 'Working concepts',
                flush: true,
                content: conceptsLoading
                  ? <SidebarSkeletonRows rows={6} />
                  : renderPartnerConceptList(conceptsWithHighlights, 'No concepts have highlights yet.')
              },
              {
                label: 'Open questions',
                flush: true,
                content: allQuestionsLoading
                  ? <SidebarSkeletonRows rows={4} />
                  : renderPartnerQuestionList(homeWorkingSet.questions.slice(0, 4), 'No open questions yet.')
              }
            ]
            : homeEditorialSection === 'annotations'
              ? [
                  {
                    label: 'Return queue',
                    flush: true,
                    content: (
                      homeQueueLoading ? (
                        <SidebarSkeletonRows rows={4} />
                      ) : (
                        <PartnerLineList
                          emptyMessage="No return queue items."
                          items={homeReturnQueue.slice(0, 5).map((entry) => (
                            <li key={entry._id}>
                              <button
                                type="button"
                                className="concept-editorial-partner__concept-link"
                                onClick={() => handleOpenReturnQueueEntry(entry)}
                              >
                                {(entry.item?.title || `${entry.itemType} item`)}{entry.reason ? ` · ${entry.reason}` : ''}
                              </button>
                            </li>
                          ))}
                        />
                      )
                    )
                  },
                  {
                    label: 'Quick moves',
                    content: (
                      <div className="think-home-rail__actions">
                        <QuietButton onClick={() => handleSelectView('paths')}>Open paths</QuietButton>
                        <QuietButton onClick={() => handleSelectView('concepts')}>Open concepts</QuietButton>
                        <QuietButton onClick={() => handleSelectView('questions')}>Open questions</QuietButton>
                      </div>
                    )
                  }
                ]
              : [
                  {
                    label: 'Notebook',
                    flush: true,
                    content: notebookLoadingList
                      ? <SidebarSkeletonRows rows={6} />
                      : renderPartnerNotebookList(homeWorkingSet.notebooks, 'No notebook entries yet.')
                  },
                  {
                    label: 'Working concepts',
                    flush: true,
                    content: conceptsLoading
                      ? <SidebarSkeletonRows rows={4} />
                      : renderPartnerConceptList(homeWorkingSet.concepts.slice(0, 4), 'No concepts yet.')
                  },
                  {
                    label: 'Open questions',
                    flush: true,
                    content: allQuestionsLoading
                      ? <SidebarSkeletonRows rows={4} />
                      : renderPartnerQuestionList(homeWorkingSet.questions.slice(0, 4), 'No open questions yet.')
                  }
                ]
      }
      footer={
        homeQueueError || homeArticlesError ? (
          <p className="status-message error-message">{homeQueueError || homeArticlesError}</p>
        ) : (
          <button type="button" onClick={() => handleSelectView('questions')}>Feedback</button>
        )
      }
    />
  );

  const conceptIndexLeftPanel = (
    <EditorialRail
      heroTitle="The Partner"
      heroSubtitle="Contextual intelligence"
      ctaLabel="New inquiry"
      onCta={() => openConceptComposer('sidebar', search)}
      navItems={partnerRailNavItems}
      activeNav={conceptIndexSection}
      onChangeNav={setConceptIndexSection}
      sections={
        conceptIndexSection === 'sources'
          ? [
              {
                label: 'Search or create',
                content: (
                  <>
                    <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                      <input
                        type="text"
                        value={search}
                        placeholder="Search or create a concept"
                        data-testid="think-concept-index-search-input"
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          if (event.nativeEvent?.isComposing) return;
                          const candidate = normalizeConceptName(search);
                          if (!candidate) return;
                          event.preventDefault();
                          submitConceptComposer(candidate, 'search-enter');
                        }}
                      />
                    </label>
                    {renderConceptComposer('sidebar')}
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
                  </>
                )
              },
              {
                label: 'Search results',
                flush: true,
                content: conceptsLoading
                  ? <SidebarSkeletonRows rows={8} />
                  : renderPartnerConceptList(filteredConcepts.slice(0, 8), 'No concepts match.')
              },
              {
                label: 'Working concepts',
                content: (
                  conceptsLoading
                    ? <SidebarSkeletonRows rows={4} />
                    : renderPartnerConceptList(conceptsWithHighlights.slice(0, 4), 'No concepts have evidence yet.')
                )
              }
            ]
          : conceptIndexSection === 'highlights'
            ? [
                {
                  label: 'Concepts with evidence',
                  flush: true,
                  content: conceptsLoading
                    ? <SidebarSkeletonRows rows={6} />
                    : renderPartnerConceptList(conceptsWithHighlights, 'No concepts have highlights yet.')
                },
                {
                  label: 'Search or create',
                  content: (
                    <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                      <input
                        type="text"
                        value={search}
                        placeholder="Search or create a concept"
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                  )
                },
                {
                  label: 'Template moves',
                  content: <p>Use templates when the shape is already known and you only need to gather support.</p>
                }
              ]
            : conceptIndexSection === 'annotations'
              ? [
                  {
                    label: 'Template cues',
                    content: (
                      <>
                        {templatePromptLines.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                        <div className="think-home-rail__actions">
                          <QuietButton onClick={openTemplatePicker}>Open templates</QuietButton>
                          <QuietButton onClick={() => openConceptComposer('sidebar', search)}>Create directly</QuietButton>
                        </div>
                      </>
                    )
                  },
                  {
                    label: 'Working concepts',
                    flush: true,
                    content: conceptsLoading
                      ? <SidebarSkeletonRows rows={5} />
                      : renderPartnerConceptList(filteredConcepts.slice(0, 5), 'No concepts yet.')
                  }
                ]
              : [
                {
                  label: 'Working concepts',
                  flush: true,
                  content: (
                    <Profiler id="ThinkConceptIndexList" onRender={conceptListProfilerLogger}>
                      {conceptsLoading ? (
                        <SidebarSkeletonRows rows={8} />
                      ) : (
                        renderPartnerConceptList(filteredConcepts, 'No concepts match.')
                      )}
                    </Profiler>
                  )
                },
                  {
                    label: 'Search or create',
                    content: (
                      <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                        <input
                          type="text"
                          value={search}
                          placeholder="Search or create a concept"
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </label>
                    )
                  },
                  {
                    label: 'Concept posture',
                    content: <p>Choose the claim before opening the manuscript. Keep contradiction visible from the start.</p>
                  }
                ]
      }
      footer={<button type="button" onClick={openTemplatePicker}>Feedback</button>}
    />
  );

  const notebookEditorialLeftPanel = (
    <EditorialRail
      heroTitle="The Partner"
      heroSubtitle="Contextual intelligence"
      ctaLabel={null}
      onCta={handleCreateNotebookEntry}
      navItems={partnerRailNavItems}
      activeNav={notebookEditorialSection}
      onChangeNav={setNotebookEditorialSection}
      sections={
        notebookEditorialSection === 'sources'
          ? [
              {
                label: 'Search and route',
                content: (
                  <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                    <input
                      type="text"
                      value={search}
                      placeholder="Search notebook pages"
                      data-testid="think-notebook-index-search-input"
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                )
              },
              {
                label: 'Working notebook',
                flush: true,
                content: renderNotebookFolderList(filteredNotebookEntries, {
                  emptyMessage: 'No notebook entries match.',
                  skeletonRows: 8
                })
              },
              {
                label: 'Open questions',
                flush: true,
                content: allQuestionsLoading
                  ? <SidebarSkeletonRows rows={4} />
                  : renderPartnerQuestionList(homeWorkingSet.questions.slice(0, 4), 'No open questions yet.')
              }
            ]
          : notebookEditorialSection === 'highlights'
            ? [
                  {
                    label: 'Working notebook',
                    flush: true,
                    content: renderNotebookFolderList(notebookEntries, {
                      emptyMessage: 'No notebook entries yet.',
                      skeletonRows: 6
                    })
                  },
                {
                  label: 'Concepts with evidence',
                  flush: true,
                  content: conceptsLoading
                    ? <SidebarSkeletonRows rows={4} />
                    : renderPartnerConceptList(conceptsWithHighlights.slice(0, 4), 'No concepts have evidence yet.')
                }
              ]
            : notebookEditorialSection === 'annotations'
              ? [
                  {
                    label: 'Question posture',
                    content: <p>Keep notebook pages loose until the structure is clear enough to promote into claims, concepts, or questions.</p>
                  },
                  {
                    label: 'Open questions',
                    flush: true,
                    content: allQuestionsLoading
                      ? <SidebarSkeletonRows rows={5} />
                      : renderPartnerQuestionList(filteredQuestions.slice(0, 5), 'No questions match.')
                  }
                ]
              : [
                  {
                    label: 'Working notebook',
                    flush: true,
                    content: renderNotebookFolderList(filteredNotebookEntries, {
                      emptyMessage: 'No notebook entries match.',
                      skeletonRows: 8
                    })
                  },
                  {
                    label: 'Working concepts',
                    flush: true,
                    content: conceptsLoading
                      ? <SidebarSkeletonRows rows={4} />
                      : renderPartnerConceptList(homeWorkingSet.concepts.slice(0, 4), 'No concepts yet.')
                  },
                  {
                    label: 'Search and route',
                    content: (
                      <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                        <input
                          type="text"
                          value={search}
                          placeholder="Search notebook pages"
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </label>
                    )
                  }
                ]
      }
      footer={<button type="button" onClick={handleCreateNotebookEntry}>New page</button>}
    />
  );

  const handoffLeftPanel = (
    <HandoffsSidebar
      handoffsModel={handoffsModel}
      onOpenHandoff={handleOpenHandoff}
    />
  );

  const threadLeftPanel = (
    <ThreadsSidebar
      threadsModel={threadsModel}
      onOpenThread={handleOpenThread}
    />
  );

  const isConceptWorkbenchView = activeView === 'concepts' && Boolean(selectedName) && Boolean(concept);
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
      ? threadLeftPanel
      : activeView === 'handoffs'
      ? handoffLeftPanel
      : activeView === 'notebook'
        ? notebookEditorialLeftPanel
        : activeView === 'concepts'
        ? conceptIndexLeftPanel
        : defaultLeftPanel);

  const insightsPanel = (
    <div className="section-stack">
      <SectionHeader title="Insights" subtitle="Themes and connections across your thinking." />
      {aiHealthStatus === 'loading' && (
        <p className="muted small">Checking AI service…</p>
      )}
      {(aiHealthStatus === 'error' || aiHealthStatus === 'disabled') && (
        <p className="status-message error-message">{aiHealthError}</p>
      )}
      {aiHealthStatus === 'disabled' && (
        <div className="think-insights-fallback">
          <div className="think-insights-fallback__copy">
            <span className="think-insights-fallback__eyebrow">Insights paused</span>
            <h3>Keep the work moving in the core surfaces.</h3>
            <p>
              The AI insight layer is offline right now, so this tab stays read-only instead of pretending to be live.
              Use concept pressure, notebook handoffs, and question tracking until the service comes back.
            </p>
          </div>
          <div className="think-insights-fallback__actions">
            <QuietButton type="button" onClick={() => handleSelectView('concepts')}>Open concepts</QuietButton>
            <QuietButton type="button" onClick={() => handleSelectView('notebook')}>Open notebook</QuietButton>
            <QuietButton type="button" onClick={() => handleSelectView('questions')}>Open questions</QuietButton>
          </div>
        </div>
      )}
      {aiHealthStatus === 'disabled' ? null : (
        <>
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
        </>
      )}
    </div>
  );

  const homeHighlights = useMemo(() => (
    [...allHighlights]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, THINK_HOME_LIMIT)
  ), [allHighlights]);

  const showLegacyConceptCollections = false;

  const openNotebookEntry = useCallback((entryId) => {
    if (!entryId) return;
    window.location.href = `/think?tab=notebook&entryId=${entryId}`;
  }, []);

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
    if (activeView === 'concepts' && concept?._id) {
      return buildConceptAmbientContext({
        concept,
        conceptQuestions,
        conceptSuggestions,
        conceptRelated,
        pinnedArticles,
        pinnedNotes
      });
    }
    if (activeView === 'notebook' && activeNotebookEntry?._id) {
      return buildNotebookAmbientContext({ entry: activeNotebookEntry });
    }
    if (activeView === 'questions' && activeQuestionData?._id) {
      return buildQuestionAmbientContext({
        question: activeQuestionData,
        questionRelated
      });
    }
    if (activeView === 'handoffs' && activeHandoffData?.handoffId) {
      return buildHandoffAmbientContext({ handoff: activeHandoffData });
    }
    if (activeView === 'home') {
      return buildHomeAmbientContext({
        homeWorkingSet,
        recentTargets
      });
    }
    return {
      summary: '',
      primaryText: '',
      openQuestions: [],
      nextActions: [],
      relatedItems: []
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
    questionRelated,
    recentTargets
  ]);
  const queueThoughtPartnerPrompt = useCallback((queuedPrompt) => {
    if (!queuedPrompt?.prompt) return;
    setQueuedThoughtPartnerPrompt(queuedPrompt);
  }, []);

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

  const mainPanel = activeView === 'home' ? (
    <ThinkHome
      showHero
      heroEyebrow="Workspace orientation"
      heroTitle="Think"
      heroSubtitle="Home for your notebook, concepts, and open questions."
      recentTargets={recentTargets}
      workingSet={homeWorkingSet}
      returnQueue={homeReturnQueue}
      recentHighlights={homeHighlights}
      recentArticles={homeArticles}
      loading={conceptsLoading || notebookLoadingList || allQuestionsLoading}
      queueLoading={homeQueueLoading}
      articlesLoading={homeArticlesLoading}
      activationState={activationState}
      onOpenTarget={handleOpenHomeTarget}
      onOpenNotebook={handleSelectNotebookEntry}
      onOpenConcept={handleSelectConcept}
      onOpenQuestion={handleOpenQuestion}
      onOpenReturnQueueItem={handleOpenReturnQueueEntry}
      onOpenArticle={handleOpenHomeArticle}
      onOpenActivation={() => { window.location.href = getFirstInsightOpenPath(activationState); }}
      onClearActivation={() => {
        clearFirstInsightState();
        setActivationState(null);
      }}
      onCreateNote={handleCreateNotebookEntry}
      onCreateConcept={handleCreateConceptFromHome}
      onCreateFromTemplate={openTemplatePicker}
      onCreateQuestion={handleCreateQuestion}
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
          onInvokeAgentSkill={queueThoughtPartnerPrompt}
          showInlineAgentDock={false}
          agentContextType={thoughtPartnerContext?.contextType || 'notebook'}
          agentContextId={thoughtPartnerContext?.contextId || activeNotebookEntry?._id || ''}
          agentContextTitle={thoughtPartnerContext?.contextTitle || activeNotebookEntry?.title || 'Notebook'}
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
        onInvokeAgentSkill={queueThoughtPartnerPrompt}
        agentContextType={thoughtPartnerContext?.contextType || 'question'}
        agentContextId={thoughtPartnerContext?.contextId || activeQuestionData?._id || ''}
        agentContextTitle={activeQuestionData?.text || thoughtPartnerContext?.contextTitle || 'Question'}
      />
      {activeQuestionData && questionStatus === 'open' && (
        <div className="think-question-actions">
          <QuietButton onClick={() => handleMarkAnswered(activeQuestionData)}>Mark answered</QuietButton>
        </div>
      )}
    </div>
  ) : activeView === 'threads' ? (
    <ThreadsMainPanel
      threadsModel={threadsModel}
      relatedApprovalsModel={threadApprovalHistoryModel}
      hookRunsModel={threadHookRunsModel}
      draftsModel={protocolArtifactDraftsModel}
      upkeepCyclesModel={upkeepCyclesModel}
      onOpenHandoff={handleOpenHandoff}
      onOpenThread={handleOpenThread}
      onInvokeWorkflowSkill={queueThoughtPartnerPrompt}
      onOpenThreadFromDraft={handleOpenThreadFromDraft}
      onCreateHandoffFromDraft={handleCreateHandoffFromDraft}
      onQueueFollowUpLoop={handleQueueFollowUpLoopFromDraft}
    />
  ) : activeView === 'handoffs' ? (
    <HandoffsMainPanel
      handoffsModel={handoffsModel}
      relatedApprovalsModel={handoffApprovalHistoryModel}
      hookRunsModel={handoffHookRunsModel}
      draftsModel={protocolArtifactDraftsModel}
      upkeepCyclesModel={upkeepCyclesModel}
      onOpenThread={handleOpenThread}
      onOpenHandoff={handleOpenHandoff}
      onInvokeWorkflowSkill={queueThoughtPartnerPrompt}
      onOpenThreadFromDraft={handleOpenThreadFromDraft}
      onCreateHandoffFromDraft={handleCreateHandoffFromDraft}
      onQueueFollowUpLoop={handleQueueFollowUpLoopFromDraft}
    />
  ) : activeView === 'paths' ? (
    <ConceptPathWorkspace
      selectedPathId={selectedPathId}
      onSelectPath={handleSelectPath}
    />
  ) : activeView === 'insights' ? (
    <div className="section-stack">
      {insightsPanel}
    </div>
  ) : activeView === 'concepts' && !hasExplicitConceptSelection ? (
    <div className="think-concepts-index-surface">
      <div className="think-concepts-index-hero">
        <div className="think-concepts-index-hero__eyebrow">Concept workspace</div>
        <h1 className="think-concepts-index-hero__title">Start from the idea, then pull the archive into focus.</h1>
        <p className="think-concepts-index-hero__subtitle">
          Open an existing concept when you already know the thread. Create a new one when you need a calm page to think against before the evidence arrives.
        </p>
        <div className="think-concepts-index-hero__actions">
          <div className="think-concept-composer-anchor">
            <Button
              variant="secondary"
              onClick={() => openConceptComposer('hero', search)}
              data-testid="think-concepts-index-create-button"
            >
              Create concept
            </Button>
            {renderConceptComposer('hero')}
          </div>
          <QuietButton onClick={openTemplatePicker}>
            Use template
          </QuietButton>
        </div>
      </div>
      {conceptsError && <p className="status-message error-message">{conceptsError}</p>}
      {conceptsLoading ? (
        <div className="think-concept-loading" aria-hidden="true">
          <div className="skeleton skeleton-title" style={{ width: '34%', height: 16 }} />
          <div className="skeleton skeleton-title" style={{ width: '62%', height: 28 }} />
          <div className="skeleton skeleton-text" style={{ width: '96%', height: 14 }} />
          <div className="skeleton skeleton-text" style={{ width: '88%', height: 14 }} />
          <div className="skeleton skeleton-text" style={{ width: '92%', height: 14 }} />
        </div>
      ) : filteredConcepts.length > 0 ? (
        <div className="think-concepts-index-list">
          {conceptIndexSections.map((section) => (
            <section key={section.key} className="think-concepts-index-section" aria-label={section.title}>
              <div className="think-concepts-index-section__header">
                <div>
                  <h2 className="think-concepts-index-section__title">{section.title}</h2>
                  <p className="think-concepts-index-section__subtitle">{section.subtitle}</p>
                </div>
                <span className="think-concepts-index-section__count">{section.items.length}</span>
              </div>
              <div className="think-concepts-index-section__list">
                {section.items.map((conceptItem) => (
                  <button
                    key={conceptItem.name}
                    type="button"
                    className={`think-concepts-index-card ${conceptItem?.freshness?.stale ? 'is-stale' : ''}`.trim()}
                    onClick={() => handleSelectConcept(conceptItem.name)}
                  >
                    <div className="think-concepts-index-card__meta">
                      <span>Concept</span>
                      {Number.isFinite(conceptItem.count) && <span>{conceptItem.count} highlights</span>}
                      {conceptItem?.freshness?.stale && (
                        <span className="think-concepts-index-card__status" data-testid={`think-concept-status-${encodeURIComponent(conceptItem.name)}`}>
                          {conceptItem?.freshness?.statusLabel || 'Needs review'}
                        </span>
                      )}
                      <span className="think-concepts-index-card__open">Open</span>
                    </div>
                    <h3 className="think-concepts-index-card__title">{conceptItem.name}</h3>
                    <p className="think-concepts-index-card__body">
                      {String(conceptItem.description || '').trim()
                        || 'Use the concept page to draft the live thought, recover old reading, and keep support and tension close to the writing.'}
                    </p>
                    <p className={`think-concepts-index-card__review ${conceptItem?.freshness?.stale ? 'is-stale' : ''}`.trim()}>
                      {describeConceptReviewState(conceptItem)}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <SurfaceCard className="think-concepts-empty-state" data-testid="think-concepts-empty-state">
          <SectionHeader title="No concepts yet" subtitle="Create one concept and let it become the place where old reading turns back into usable thought." />
          <div className="think-concept-composer-anchor think-concepts-empty-state__actions">
            <Button
              variant="secondary"
              onClick={() => openConceptComposer('empty', search)}
              data-testid="think-concepts-empty-create-button"
            >
              Create concept
            </Button>
            {renderConceptComposer('empty')}
          </div>
        </SurfaceCard>
      )}
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
          {!isConceptWorkbenchView && isEditingSummary && (
            <SurfaceCard className="idea-workbench-panel">
              <SectionHeader
                title="Legacy concept summary"
                subtitle="This still writes to the concept description field while the new workbench remains local-first."
              />
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
            </SurfaceCard>
          )}

          <ConceptEvidenceStreamView
            concept={concept}
            model={ideaWorkbenchModel}
            personalAgents={handoffsModel.sortedPersonalAgents}
          />

          {showLegacyConceptCollections && (
            <>
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

  const rightPanel = isConceptWorkbenchView ? (
    <ConceptEvidenceStreamRail concept={concept} model={ideaWorkbenchModel} />
  ) : activeView === 'concepts' ? (
    <div className="section-stack think-layout__right-panel">
      <div className="think-concepts-index-rail">
        <SectionHeader title="Concept posture" subtitle="Keep the page quiet until the idea needs more structure." />
        <p className="muted small">
          Start with a concept name, then let the archive come in behind it. The point of search, suggestions, and support is to improve the active concept, not to create another results surface.
        </p>
        <div className="think-concepts-index-rail__actions">
          <QuietButton onClick={() => openConceptComposer('header', search)}>
            New concept
          </QuietButton>
          <QuietButton onClick={openTemplatePicker}>
            Use template
          </QuietButton>
        </div>
      </div>
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
        title="Ask the index"
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
  ) : activeView === 'threads' || activeView === 'handoffs' ? (
    <div className="section-stack think-layout__right-panel">
      {workingMemoryDrawer}
      <SurfaceCard className="think-threads-card think-protocol-rail">
        <SectionHeader
          title={activeView === 'threads' ? 'Thread protocol' : 'Handoff protocol'}
          subtitle="The main canvas now owns live state, drafts, upkeep loops, and operating history."
        />
        <p className="muted small">
          Use this rail for working memory and approval actions. Planner state, specialist context, upkeep loops, artifacts, and execution history now stay together in the central operating canvas.
        </p>
      </SurfaceCard>
      <ProtocolApprovalsPanel
        approvalsModel={protocolApprovalsModel}
        className="think-threads-card"
      />
    </div>
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
        />
      )}
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
          <div className="think-home-rail__section">
            <SectionHeader title="Recent activity" subtitle="Your latest trails in Think." />
            <div className="think-home__list">
              {recentTargets.slice(0, THINK_HOME_LIMIT).map((item) => (
                <button
                  key={`${item.type}:${item.id}`}
                  type="button"
                  className="think-home__row"
                  onClick={() => handleOpenHomeTarget(item)}
                >
                  <span className="think-home__row-title">{item.title || item.type}</span>
                  <span className="think-home__row-meta muted small">{item.type}</span>
                </button>
              ))}
              {recentTargets.length === 0 && <p className="muted small">No recent activity yet.</p>}
            </div>
          </div>
          <div className="think-home-rail__section">
            <SectionHeader title="Next move" subtitle="Quick jumps into active work." />
            <div className="think-home-rail__actions">
              <QuietButton onClick={() => handleSelectView('notebook')}>Open notebook</QuietButton>
              <QuietButton onClick={() => handleSelectView('concepts')}>Open concepts</QuietButton>
              <QuietButton onClick={() => handleSelectView('questions')}>Open questions</QuietButton>
              <QuietButton onClick={() => handleSelectView('paths')}>Open paths</QuietButton>
            </div>
          </div>
          {(homeQueueError || homeArticlesError) && (
            <p className="status-message error-message">{homeQueueError || homeArticlesError}</p>
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
            Personal agents only appear when active agent keys exist in Integrations.
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
              <ReferencesPanel targetType="question" targetId={activeQuestion._id} label="Show backlinks" />
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
            title="AI Related Highlights"
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
              <ReferencesPanel targetType="concept" tagName={concept.name} label="Show backlinks" />
            </div>
          )}
        </div>
      )}
    </div>
  );

  const selectedConceptLayout = isConceptWorkbenchView ? (
    <div className="concept-editorial-shell-page">
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
        </aside>
        <main className="concept-editorial-shell__main">
          {conceptLoadError && <p className="status-message error-message">{conceptLoadError}</p>}
          {conceptError && <p className="status-message error-message">{conceptError}</p>}
          {relatedError && <p className="status-message error-message">{relatedError}</p>}
          {conceptLoading ? (
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
          ) : (
            <ConceptEvidenceStreamView
              concept={concept}
              model={ideaWorkbenchModel}
              personalAgents={handoffsModel.sortedPersonalAgents}
              onEditorReady={setConceptEditorialEditor}
              onDropCard={handleIntegrateConceptCard}
              isReceivingDrop={conceptReceivingDrop}
              onRunAction={setConceptEditorialSection}
              onOpenTemplatePicker={openTemplatePicker}
            />
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
          />
        </aside>
      </div>
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
        title="Evidence stream"
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
          <QuietButton onClick={openTemplatePicker}>
            Browse templates
          </QuietButton>
        </div>
      </div>
    </div>
  );

  const notebookEditorialRightPanel = (
    <div className="editorial-side-rail notebook-editorial-context">
      <ThoughtPartnerPanel
        className="editorial-side-rail__partner"
        variant="stream"
        contextType={thoughtPartnerContext?.contextType || 'notebook'}
        contextId={thoughtPartnerContext?.contextId || activeNotebookEntry?._id || 'notebook'}
        contextTitle={thoughtPartnerContext?.contextTitle || activeNotebookEntry?.title || 'Notebook'}
        contextMetadata={thoughtPartnerContextMetadata}
        queuedPrompt={queuedThoughtPartnerPrompt}
        title="Evidence stream"
        subtitle="Notebook contextualization"
        placeholder="Ask what this page should keep, connect, or promote next."
        promptTemplates={[
          'What matters most on this page?',
          'Which concept is forming here?',
          'What should move from notebook into concept or question?'
        ]}
        emptyStateText="Use the notebook rail to clarify what should stay loose and what should be promoted."
        submitLabel="↗"
      />
      <AgentArtifactDraftsPanel
        draftsModel={sharedArtifactDraftsModel}
        title="Draft staging"
        subtitle="Promote the strongest note-driven outputs without leaving the notebook."
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
        contextType={thoughtPartnerContext?.contextType || 'notebook'}
        contextId={thoughtPartnerContext?.contextId || activeNotebookEntry?._id || 'notebook'}
        contextTitle={thoughtPartnerContext?.contextTitle || activeNotebookEntry?.title || 'Notebook'}
      />
      <AgentSkillDock
        surface="notebook"
        contextType="notebook"
        category="output"
        contextId={activeNotebookEntry?._id || 'notebook'}
        targetContextType={thoughtPartnerContext?.contextType || 'notebook'}
        targetContextId={thoughtPartnerContext?.contextId || activeNotebookEntry?._id || ''}
        contextTitle={thoughtPartnerContext?.contextTitle || activeNotebookEntry?.title || 'Notebook'}
        title="Output studio"
        subtitle="Spin active notes into briefs, synthesis docs, and deck-ready outlines."
        className="editorial-side-rail__section agent-skill-dock--output"
        maxVisible={4}
        onInvoke={queueThoughtPartnerPrompt}
      />

      <div className="editorial-side-rail__section">
        <SectionHeader title="Notebook posture" subtitle="How to use this page." />
        <p className="muted small">
          Keep the page exploratory. Promote only when a note has enough shape to become a concept, question, or draft.
        </p>
        <div className="think-home-rail__actions">
          <QuietButton onClick={handleCreateNotebookEntry}>New page</QuietButton>
          <QuietButton onClick={() => handleSelectView('concepts')}>Open concepts</QuietButton>
        </div>
      </div>

      <NotebookContext entry={activeNotebookEntry} />
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
        title="Evidence stream"
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

      <div className="editorial-side-rail__section">
        <SectionHeader title="Updated stream" subtitle="Recent motion in Think." />
        <div className="think-home__list">
          {recentTargets.length > 0 ? (
            recentTargets.slice(0, 5).map((item) => (
              <button
                key={`${item.type}:${item.id}`}
                type="button"
                className="think-home__row"
                onClick={() => handleOpenHomeTarget(item)}
              >
                <span className="think-home__row-title">{item.title || item.type}</span>
                <span className="think-home__row-meta muted small">{item.type}</span>
              </button>
            ))
          ) : (
            <p className="muted small">No recent activity yet.</p>
          )}
        </div>
      </div>

      <div className="editorial-side-rail__section">
        <SectionHeader title="Next move" subtitle="Jump back into active work." />
        <div className="think-home-rail__actions">
          <QuietButton onClick={() => handleSelectView('notebook')}>Open notebook</QuietButton>
          <QuietButton onClick={() => handleSelectView('concepts')}>Open concepts</QuietButton>
          <QuietButton onClick={() => handleSelectView('questions')}>Open questions</QuietButton>
          <QuietButton onClick={() => handleSelectView('paths')}>Open paths</QuietButton>
        </div>
      </div>

      {(homeQueueError || homeArticlesError) && (
        <p className="status-message error-message">{homeQueueError || homeArticlesError}</p>
      )}
    </div>
  );

  const homeEditorialLayout = activeView === 'home' ? (
    <div className="think-home-editorial-shell-page">
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

  const notebookEditorialLayout = activeView === 'notebook' ? (
    <div className="notebook-editorial-shell-page">
      <div className="notebook-editorial-shell">
        <aside className="notebook-editorial-shell__left">
          {notebookEditorialLeftPanel}
        </aside>
        <main className="notebook-editorial-shell__main">
          {mainPanel}
        </main>
        <aside className="notebook-editorial-shell__right">
          {notebookEditorialRightPanel}
        </aside>
      </div>
    </div>
  ) : null;

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
    <div className="concept-index-editorial-shell-page">
      <div className="concept-index-editorial-shell">
        <aside className="concept-index-editorial-shell__left">
          <div className="concept-index-editorial-rail concept-index-editorial-rail--left">
            {conceptIndexLeftPanel}
          </div>
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

  const questionEditorialLeftPanel = (
    <EditorialRail
      heroTitle="The Partner"
      heroSubtitle="Contextual intelligence"
      ctaLabel="New inquiry"
      onCta={handleCreateQuestion}
      ctaDisabled={questionSaving}
      navItems={partnerRailNavItems}
      activeNav={questionEditorialSection}
      onChangeNav={setQuestionEditorialSection}
      sections={
        questionEditorialSection === 'sources'
          ? [
              {
                label: 'Search and status',
                content: (
                  <>
                    <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                      <input
                        type="text"
                        value={search}
                        placeholder="Search questions"
                        data-testid="question-index-search-input"
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    <label className="think-index__filter">
                      <select
                        value={questionStatus}
                        onChange={(event) => setQuestionStatus(event.target.value)}
                      >
                        <option value="open">Open</option>
                        <option value="answered">Answered</option>
                      </select>
                    </label>
                    {allQuestionsError && <p className="status-message error-message">{allQuestionsError}</p>}
                    {questionError && <p className="status-message error-message">{questionError}</p>}
                  </>
                )
              },
              {
                label: 'Working questions',
                flush: true,
                content: allQuestionsLoading
                  ? <SidebarSkeletonRows rows={6} />
                  : renderPartnerQuestionList(filteredQuestions.slice(0, 6), 'No questions match.')
              }
            ]
          : questionEditorialSection === 'highlights'
            ? [
                {
                  label: 'Working questions',
                  flush: true,
                  content: allQuestionsLoading
                    ? <SidebarSkeletonRows rows={5} />
                    : renderPartnerQuestionList(filteredQuestions.slice(0, 5), 'No questions match.')
                },
                {
                  label: 'Question context',
                  content: questionRelated.concepts.length > 0 ? (
                    <div className="concept-related-tags">
                      {questionRelated.concepts.slice(0, 6).map((item) => {
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
                }
              ]
            : questionEditorialSection === 'annotations'
              ? [
                  {
                    label: 'Related highlights',
                    flush: true,
                    content: (
                      <div className="related-embed-list">
                        {questionRelated.highlights.length === 0 ? (
                          <CalmEmptyLine>No related highlights yet.</CalmEmptyLine>
                        ) : (
                          questionRelated.highlights.slice(0, 5).map((item) => (
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
                    )
                  },
                  {
                    label: 'Related concepts',
                    content: questionRelated.concepts.length > 0 ? (
                      <div className="concept-related-tags">
                        {questionRelated.concepts.slice(0, 6).map((item) => {
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
                  }
                ]
              : [
                  {
                    label: 'Working questions',
                    flush: true,
                    content: allQuestionsLoading
                      ? <SidebarSkeletonRows rows={6} />
                      : renderPartnerQuestionList(filteredQuestions, 'No questions match.')
                  },
                  {
                    label: 'Question context',
                    content: (
                      activeQuestion?.linkedTagName ? (
                        <div className="concept-related-tags">
                          <TagChip to={`/think?tab=concepts&concept=${encodeURIComponent(activeQuestion.linkedTagName)}`}>
                            {activeQuestion.linkedTagName}
                          </TagChip>
                        </div>
                      ) : (
                        <CalmEmptyLine>No concept linked.</CalmEmptyLine>
                      )
                    )
                  },
                  {
                    label: 'Search and status',
                    content: (
                      <>
                        <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                          <input
                            type="text"
                            value={search}
                            placeholder="Search questions"
                            onChange={(event) => setSearch(event.target.value)}
                          />
                        </label>
                        <label className="think-index__filter">
                          <select
                            value={questionStatus}
                            onChange={(event) => setQuestionStatus(event.target.value)}
                          >
                            <option value="open">Open</option>
                            <option value="answered">Answered</option>
                          </select>
                        </label>
                      </>
                    )
                  },
                  {
                    label: 'Question posture',
                    content: <p>Keep the loop open until the evidence is tight enough to answer it without flattening the tension too early.</p>
                  }
                ]
      }
      footer={<button type="button" onClick={handleCreateQuestion}>Feedback</button>}
    />
  );

  const questionEditorialMainPanel = (
    <div className="question-editorial-main">
      <div className="question-editorial-main__hero">
        <div className="question-editorial-main__eyebrow">Question refinement</div>
        <p className="question-editorial-main__subtitle">
          {activeQuestionData?.linkedTagName
            ? `Open loop inside ${activeQuestionData.linkedTagName}. Clarify the question before deciding what evidence belongs.`
            : 'Clarify the question before deciding what evidence belongs.'}
        </p>
      </div>

      {questionError && <p className="status-message error-message">{questionError}</p>}

      <div className="question-editorial-main__editor">
        <QuestionEditor
          question={activeQuestionData}
          saving={questionSaving}
          error={questionError}
          onSave={handleSaveQuestion}
          onRegisterInsert={(fn) => { questionInsertRef.current = fn; }}
          onSynthesize={(question) => openSynthesis('question', question?._id)}
          variant="editorial"
          onInvokeAgentSkill={queueThoughtPartnerPrompt}
          agentContextType={thoughtPartnerContext?.contextType || 'question'}
          agentContextId={thoughtPartnerContext?.contextId || activeQuestionData?._id || ''}
          agentContextTitle={activeQuestionData?.text || thoughtPartnerContext?.contextTitle || 'Question'}
        />
        {activeQuestionData && questionStatus === 'open' && (
          <div className="think-question-actions">
            <QuietButton onClick={() => handleMarkAnswered(activeQuestionData)}>Mark answered</QuietButton>
          </div>
        )}
      </div>
    </div>
  );

  const questionEditorialRightPanel = (
    <div className="editorial-side-rail question-editorial-context">
      <ThoughtPartnerPanel
        className="editorial-side-rail__partner question-editorial-context__agent"
        variant="stream"
        contextType={thoughtPartnerContext?.contextType || 'question'}
        contextId={thoughtPartnerContext?.contextId || activeQuestionData?._id || 'question'}
        contextTitle={thoughtPartnerContext?.contextTitle || activeQuestionData?.text || 'Question'}
        contextMetadata={thoughtPartnerContextMetadata}
        queuedPrompt={queuedThoughtPartnerPrompt}
        title="Evidence stream"
        subtitle="Question contextualization"
        placeholder="Ask what this question should prove, gather, or test next."
        promptTemplates={[
          'What is this question really asking?',
          'What evidence would answer this best?',
          'What concept should this question connect to?'
        ]}
        emptyStateText="Use the question rail to clarify, connect, and tighten open loops."
        submitLabel="↗"
      />
      {questionScopedArtifactDraftsModel?.pendingCount > 0 && (
        <AgentArtifactDraftsPanel
          draftsModel={questionScopedArtifactDraftsModel}
          title="Draft queue"
          subtitle="Question-specific output waiting for review."
          emptyText="No staged drafts yet."
          className="editorial-side-rail__section think-draft-staging-panel question-editorial-context__drafts"
          onInvokeWorkflowSkill={queueThoughtPartnerPrompt}
          onOpenThreadFromDraft={handleOpenThreadFromDraft}
          onCreateHandoffFromDraft={handleCreateHandoffFromDraft}
          onQueueFollowUpLoop={handleQueueFollowUpLoopFromDraft}
          contextType={thoughtPartnerContext?.contextType || 'question'}
          contextId={thoughtPartnerContext?.contextId || activeQuestionData?._id || 'question'}
          contextTitle={thoughtPartnerContext?.contextTitle || activeQuestionData?.text || 'Question'}
          maxPending={1}
          showPromoted={false}
          compact
        />
      )}

      <div className="editorial-side-rail__section question-editorial-context__section">
        <SectionHeader title="Question context" subtitle="What this question is attached to." />
        {activeQuestion?.linkedTagName ? (
          <TagChip to={`/think?tab=concepts&concept=${encodeURIComponent(activeQuestion.linkedTagName)}`}>
            {activeQuestion.linkedTagName}
          </TagChip>
        ) : (
          <CalmEmptyLine>No concept linked.</CalmEmptyLine>
        )}
      </div>

      <div className="editorial-side-rail__section question-editorial-context__section">
        <SectionHeader title="Connections" subtitle="Supports, contradictions, and extensions." />
        {contextConnectionsLoading && <p className="muted small">Loading connections…</p>}
        {contextConnectionsError && <p className="status-message error-message">{contextConnectionsError}</p>}
        {!contextConnectionsLoading && !contextConnectionsError && (
          <div className="context-connection-list">
            {contextConnections.length === 0 ? (
              <CalmEmptyLine>No scoped connections yet.</CalmEmptyLine>
            ) : (
              contextConnections.slice(0, 8).map(row => (
                <div key={row._id} className="context-connection-row">
                  <span className="context-connection-node">{row.fromItem?.title || row.fromType}</span>
                  <span className="context-connection-relation">{row.relationType}</span>
                  <span className="context-connection-node">{row.toItem?.title || row.toType}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="editorial-side-rail__section question-editorial-context__section">
        <SectionHeader title="Related highlights" subtitle="Relevant material to embed." />
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
      </div>

      <div className="editorial-side-rail__section question-editorial-context__section">
        <SectionHeader title="Related concepts" subtitle="Neighboring ideas." />
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
      </div>

      {activeQuestion?._id && (
        <div className="editorial-side-rail__section question-editorial-context__section">
          <SectionHeader title="Used in" subtitle="Backlinks to this question." />
          <ReferencesPanel targetType="question" targetId={activeQuestion._id} label="Show backlinks" />
        </div>
      )}
    </div>
  );

  const questionEditorialLayout = isQuestionEditorialView ? (
    <div className="question-editorial-shell-page">
      <div className="question-editorial-shell">
        <aside className="question-editorial-shell__left">
          {questionEditorialLeftPanel}
        </aside>
        <main className="question-editorial-shell__main">
          {questionEditorialMainPanel}
        </main>
        <aside className="question-editorial-shell__right">
          {questionEditorialRightPanel}
        </aside>
      </div>
    </div>
  ) : null;
  const disableEditorialShell = searchParams.get('legacyShell') === '0';
  const activePrimaryNavValue = THINK_SUB_NAV_ITEMS.some((item) => item.value === activeView) ? activeView : '';

  return (
    <>
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
          className={`three-pane--editorial ${
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
      <ConceptTemplatePickerModal
        open={templatePickerOpen}
        onClose={closeTemplatePicker}
        onCreated={handleTemplateCreated}
      />
      <NotebookMoveEntryModal
        open={Boolean(notebookMoveModalEntry)}
        entry={notebookMoveModalEntry}
        folders={notebookFolders}
        loading={Boolean(notebookMovePendingId)}
        error={notebookMoveError}
        onClose={handleCloseNotebookMoveModal}
        onMove={(folderId) => handleMoveNotebookEntry(notebookMoveModalEntry, folderId)}
      />
    </>
  );
};

export default ThinkMode;
