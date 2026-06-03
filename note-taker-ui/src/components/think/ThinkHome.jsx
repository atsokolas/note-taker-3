import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SectionHeader, QuietButton } from '../ui';
import SkeletonBlock from '../SkeletonBlock';
import { getFirstInsightSummary, isFirstInsightActive } from '../../utils/firstInsight';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import AgentTicker from '../agent/AgentTicker';
import AgentPresence from '../agent/AgentPresence';
import { searchConnectableItems } from '../../api/connections';

const formatRelativeTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const deltaMs = Date.now() - parsed.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (deltaMs < hour) return `${Math.max(1, Math.round(deltaMs / minute))}m ago`;
  if (deltaMs < day) return `${Math.max(1, Math.round(deltaMs / hour))}h ago`;
  return `${Math.max(1, Math.round(deltaMs / day))}d ago`;
};

const HomeSkeleton = () => (
  <div className="think-home__skeleton-grid" aria-hidden="true">
    {Array.from({ length: 5 }).map((_, index) => (
      <div key={`home-skeleton-${index}`} className="think-home__skeleton-row">
        <SkeletonBlock width={`${42 + (index % 2) * 14}%`} height={12} />
        <SkeletonBlock width={`${18 + (index % 3) * 6}%`} height={10} />
      </div>
    ))}
  </div>
);

const Empty = ({ text }) => <p className="muted small">{text}</p>;

/**
 * EmptyAction — column-level empty state with a single inline action.
 * Used in the working-set columns so a fresh user always has one obvious
 * next step from the home page (instead of staring at "No X yet.").
 */
const EmptyAction = ({ text, actionLabel, onAction, testId }) => (
  <div className="think-home-editorial-column__empty" data-testid={testId}>
    <p className="muted small">{text}</p>
    {actionLabel && onAction ? (
      <button
        type="button"
        className="think-home-editorial-column__empty-action"
        onClick={onAction}
      >
        {actionLabel}
        <span aria-hidden="true">→</span>
      </button>
    ) : null}
  </div>
);

const HomeRow = ({ title, meta, onClick, className = '' }) => (
  <button type="button" className={`think-home__row think-home-editorial-row ${className}`.trim()} onClick={onClick}>
    <span className="think-home__row-title think-home-editorial-row__title">{title}</span>
    {meta ? <span className="think-home__row-meta think-home-editorial-row__meta muted small">{meta}</span> : null}
  </button>
);

const TYPE_LABELS = {
  notebook: 'Notebook',
  concept: 'Concept',
  question: 'Question',
  article: 'Article',
  highlight: 'Highlight',
  wiki: 'Wiki',
  wiki_page: 'Wiki'
};

const normalizeReferenceItem = (item = {}) => {
  const rawType = String(item.itemType || item.type || '').trim();
  const id = String(item.itemId || item.id || item._id || '').trim();
  if (!rawType || !id) return null;
  const type = rawType === 'wiki_page' ? 'wiki' : rawType;
  const title = String(item.title || item.name || item.url || item.snippet || TYPE_LABELS[rawType] || 'Reference').trim();
  return {
    key: `${type}:${id}`,
    type,
    id,
    articleId: String(item.articleId || item.metadata?.articleId || '').trim(),
    title,
    label: `${TYPE_LABELS[rawType] || TYPE_LABELS[type] || type} · ${title}`,
    snippet: String(item.snippet || item.text || item.description || item.quote || '').trim()
  };
};

const POSTURE_META = {
  notebook: {
    label: 'Quiet',
    description: 'passive writing',
    noun: 'Notebook'
  },
  concept: {
    label: 'Generative',
    description: 'idea building',
    noun: 'Concept'
  },
  question: {
    label: 'Dialectical',
    description: 'open inquiry',
    noun: 'Question'
  }
};

const parseTime = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const titleTokens = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(token => token.length > 3);

const shareMeaningfulToken = (left = '', right = '') => {
  const leftTokens = new Set(titleTokens(left));
  return titleTokens(right).some(token => leftTokens.has(token));
};

const buildThinkIndexRows = ({ workingSet = { notebooks: [], concepts: [], questions: [] }, recentTargets = [] }) => {
  const recentByKey = new Map(
    recentTargets.map(item => [`${item.type}:${item.id || item.title || item.path}`, item])
  );

  const notebookRows = (workingSet.notebooks || []).map((item) => {
    const recent = recentByKey.get(`notebook:${item._id}`) || {};
    const touchedAt = recent.openedAt || item.updatedAt || item.createdAt || '';
    return {
      id: `notebook:${item._id}`,
      type: 'notebook',
      title: item.title || 'Untitled note',
      touchedAt,
      score: parseTime(touchedAt),
      primaryReadout: touchedAt ? `last movement ${formatRelativeTime(touchedAt)}` : 'waiting for first pass',
      secondaryReadout: 'private drafting surface'
    };
  });

  const conceptRows = (workingSet.concepts || []).map((item) => {
    const recent = recentByKey.get(`concept:${item.name}`) || {};
    const touchedAt = recent.openedAt || item.updatedAt || item.createdAt || '';
    const supportCount = Number(item.count || item.highlightCount || item.sourceCount || 0);
    return {
      id: `concept:${item._id || item.name}`,
      type: 'concept',
      title: item.name || 'Untitled concept',
      touchedAt,
      score: parseTime(touchedAt) + supportCount,
      primaryReadout: `${supportCount} ${supportCount === 1 ? 'highlight' : 'highlights'} attached`,
      secondaryReadout: touchedAt ? `last movement ${formatRelativeTime(touchedAt)}` : 'needs a first move'
    };
  });

  const questionRows = (workingSet.questions || []).map((item) => {
    const recent = recentByKey.get(`question:${item._id}`) || {};
    const touchedAt = recent.openedAt || item.updatedAt || item.createdAt || '';
    const openState = item.status && item.status !== 'open' ? item.status : 'open';
    return {
      id: `question:${item._id}`,
      type: 'question',
      title: item.text || 'Untitled question',
      touchedAt,
      score: parseTime(touchedAt) + (item.linkedTagName ? 3 : 0),
      primaryReadout: `${openState} loop`,
      secondaryReadout: item.linkedTagName ? `scoped to ${item.linkedTagName}` : 'needs evidence'
    };
  });

  return [...notebookRows, ...conceptRows, ...questionRows]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 8);
};

const buildIndexOrientation = (rows) => {
  if (!rows.length) {
    return `${AGENT_DISPLAY_NAME} will surface momentum here once notes, concepts, or questions start moving.`;
  }
  const openQuestions = rows.filter(row => row.type === 'question').length;
  const concepts = rows.filter(row => row.type === 'concept').length;
  const notebooks = rows.filter(row => row.type === 'notebook').length;
  const relatedPair = rows.find((row, index) => rows.slice(index + 1).some(other => (
    row.type !== other.type && shareMeaningfulToken(row.title, other.title)
  )));
  if (relatedPair) {
    return `${AGENT_DISPLAY_NAME} sees overlap around "${relatedPair.title}" - this may be ready to link or promote.`;
  }
  return `${AGENT_DISPLAY_NAME} is watching ${concepts} generative, ${openQuestions} dialectical, and ${notebooks} quiet threads for the next useful move.`;
};

const ContinueHero = ({ item, meta, onResume }) => {
  const typeLabel = TYPE_LABELS[item?.type] || (item?.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : 'Recent');
  return (
    <div className="think-home-editorial__continue-hero">
      <div className="think-home-editorial__continue-hero-copy">
        <span className="think-home-editorial__continue-hero-eyebrow">{typeLabel}</span>
        <button
          type="button"
          className="think-home-editorial__continue-hero-title-button"
          onClick={onResume}
          aria-label={`Resume ${item?.title || 'untitled'}`}
        >
          {item?.title || 'Untitled'}
        </button>
        {meta ? <span className="think-home-editorial__continue-hero-meta muted small">{meta}</span> : null}
      </div>
      <div className="think-home-editorial__continue-hero-cta">
        <QuietButton variant="primary" onClick={onResume}>Resume</QuietButton>
      </div>
    </div>
  );
};

const MaterialRow = ({ title, snippet, meta, onClick }) => (
  <button type="button" className="think-home__material-row think-home-editorial-material-row" onClick={onClick}>
    <div className="think-home__material-copy think-home-editorial-material-row__copy">
      <span className="think-home__material-title think-home-editorial-material-row__title">{title}</span>
      {snippet ? <span className="think-home__material-snippet think-home-editorial-material-row__snippet">{snippet}</span> : null}
    </div>
    {meta ? <span className="think-home__material-meta think-home-editorial-material-row__meta muted small">{meta}</span> : null}
  </button>
);

const ThinkIndex = ({
  rows,
  orientation,
  onOpenNotebook,
  onOpenConcept,
  onOpenQuestion,
  onCreateNote,
  onCreateConcept,
  onCreateQuestion
}) => {
  const handleOpen = (row) => {
    if (row.type === 'notebook') {
      onOpenNotebook(row.id.replace(/^notebook:/, ''));
      return;
    }
    if (row.type === 'concept') {
      onOpenConcept(row.title);
      return;
    }
    if (row.type === 'question') {
      onOpenQuestion(row.id.replace(/^question:/, ''));
    }
  };

  return (
    <section className="think-home-editorial__index think-home-editorial__section" aria-label="Thinking index">
      <SectionHeader
        title="Thinking index"
        subtitle="Active thoughts sorted by movement, with posture and unresolved state visible before you open them."
      />
      <p className="think-home-editorial__index-orientation">{orientation}</p>
      {rows.length === 0 ? (
        <Empty text="No active thinking objects yet." />
      ) : (
        <ol className="think-home-editorial__index-list">
          {rows.map((row) => {
            const posture = POSTURE_META[row.type] || POSTURE_META.concept;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={`think-home-editorial__index-row is-${row.type}`}
                  onClick={() => handleOpen(row)}
                >
                  <span className="think-home-editorial__index-posture">
                    <strong>{posture.label}</strong>
                    <small>{posture.description}</small>
                  </span>
                  <span className="think-home-editorial__index-copy">
                    <span className="think-home-editorial__index-kind">{posture.noun}</span>
                    <strong>{row.title}</strong>
                  </span>
                  <span className="think-home-editorial__index-readout">
                    <span>{row.primaryReadout}</span>
                    <small>{row.secondaryReadout}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="think-home-editorial__index-launcher" role="toolbar" aria-label="Start a Think posture">
        <QuietButton onClick={onCreateConcept}>Open generative</QuietButton>
        <QuietButton onClick={onCreateQuestion}>Open dialectical</QuietButton>
        <QuietButton onClick={onCreateNote}>Open quiet</QuietButton>
      </div>
    </section>
  );
};

const countItems = (items) => Array.isArray(items) ? items.length : 0;

const formatTelemetryCount = (value, noun) => {
  const count = Number(value || 0);
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
};

const buildPulseRows = ({
  recentTargets = [],
  workingSet = { notebooks: [], concepts: [], questions: [] },
  returnQueue = [],
  recentHighlights = [],
  recentArticles = [],
  recentWikiPages = [],
  recentAgentActivity = []
}) => {
  const rows = [];

  recentTargets.slice(0, 2).forEach((item) => {
    rows.push({
      id: `recent-${item.id || item.path || item.title}`,
      action: 'target',
      target: item,
      label: 'Open thread',
      title: item.title || 'Untitled thread',
      meta: item.openedAt ? `last touched ${formatRelativeTime(item.openedAt)}` : 'ready to resume'
    });
  });

  workingSet.concepts.slice(0, 2).forEach((concept) => {
    rows.push({
      id: `concept-${concept.name}`,
      action: 'concept',
      conceptName: concept.name || '',
      label: 'Concept',
      title: concept.name || 'Untitled concept',
      meta: `${concept.count || 0} highlights attached`
    });
  });

  workingSet.questions.slice(0, 2).forEach((question) => {
    rows.push({
      id: `question-${question._id}`,
      action: 'question',
      questionId: question._id || '',
      label: 'Open question',
      title: question.text || 'Untitled question',
      meta: question.linkedTagName || 'ready for evidence'
    });
  });

  workingSet.notebooks.slice(0, 1).forEach((note) => {
    rows.push({
      id: `note-${note._id}`,
      action: 'notebook',
      notebookId: note._id || '',
      label: 'Notebook',
      title: note.title || 'Untitled note',
      meta: note.updatedAt || note.createdAt ? `touched ${formatRelativeTime(note.updatedAt || note.createdAt)}` : 'loose thought'
    });
  });

  returnQueue.slice(0, 2).forEach((entry) => {
    rows.push({
      id: `queue-${entry._id}`,
      action: 'return-queue',
      queueItem: entry,
      label: 'Return queue',
      title: entry.item?.title || `${entry.itemType || 'Queued'} item`,
      meta: entry.reason || 'waiting to be woven back in'
    });
  });

  recentHighlights.slice(0, 2).forEach((highlight) => {
    rows.push({
      id: `highlight-${highlight._id}`,
      action: 'metabolize-highlight',
      highlight,
      label: 'Fresh highlight',
      title: highlight.articleTitle || 'Saved highlight',
      meta: highlight.text ? `${highlight.text.slice(0, 72)}${highlight.text.length > 72 ? '...' : ''}` : 'not yet woven in'
    });
  });

  recentArticles.slice(0, 2).forEach((article) => {
    rows.push({
      id: `article-${article._id}`,
      action: 'metabolize-article',
      article,
      label: 'Source',
      title: article.title || 'Untitled source',
      meta: article.createdAt ? `saved ${formatRelativeTime(article.createdAt)}` : 'available to pull in'
    });
  });

  recentWikiPages.slice(0, 2).forEach((page) => {
    rows.push({
      id: `wiki-${page._id || page.id || page.slug || page.title}`,
      action: 'wiki',
      pageId: page._id || page.id || '',
      label: 'Wiki page',
      title: page.title || 'Untitled wiki page',
      meta: page.updatedAt || page.lastReviewedAt
        ? `settled ${formatRelativeTime(page.updatedAt || page.lastReviewedAt)}`
        : 'available as settled knowledge'
    });
  });

  recentAgentActivity.slice(0, 2).forEach((event) => {
    rows.push({
      id: `agent-${event.id || event.runId || event.at || event.title}`,
      label: 'Agent move',
      title: event.title || 'Corpus maintenance',
      meta: event.summary || event.type || 'recent maintenance activity'
    });
  });

  return rows.slice(0, 5);
};

const CorpusTelemetryStrip = ({ telemetry }) => {
  const items = [
    formatTelemetryCount(telemetry.sources, 'source'),
    formatTelemetryCount(telemetry.highlights, 'highlight'),
    formatTelemetryCount(telemetry.concepts, 'concept'),
    formatTelemetryCount(telemetry.wikiPages, 'wiki page'),
    formatTelemetryCount(telemetry.openThreads, 'open thread'),
    formatTelemetryCount(telemetry.agentMoves, 'agent move'),
    formatTelemetryCount(telemetry.returnQueue, 'return item')
  ];

  return (
    <div className="think-home-editorial__telemetry" aria-label="Corpus telemetry">
      <span className="think-home-editorial__telemetry-label">corpus:</span>
      <span>{items.join(' / ')}</span>
    </div>
  );
};

const buildHomeGreeting = ({ continueItem, resolvedTelemetry, pulseRows, isFirstRun }) => {
  if (isFirstRun) {
    return {
      title: `${AGENT_DISPLAY_NAME} is ready to seed the space.`,
      body: 'Start with one source, note, or question; I will keep the connection work visible as it compounds.',
      action: 'Start a thought',
      mode: 'seed'
    };
  }
  if (continueItem?.title) {
    return {
      title: `I kept "${continueItem.title}" warm.`,
      body: `There are ${formatTelemetryCount(resolvedTelemetry.sources, 'source')}, ${formatTelemetryCount(resolvedTelemetry.highlights, 'highlight')}, and ${formatTelemetryCount(pulseRows.length, 'live thread')} available around the current workspace.`,
      action: 'Resume thread',
      mode: 'resume'
    };
  }
  if (Number(resolvedTelemetry.returnQueue || 0) > 0) {
    return {
      title: `${formatTelemetryCount(resolvedTelemetry.returnQueue, 'return item')} need to be woven back in.`,
      body: 'The useful move is metabolizing queued material into notes, concepts, questions, or wiki pages.',
      action: 'Metabolize queue',
      mode: 'metabolize'
    };
  }
  return {
    title: `${AGENT_DISPLAY_NAME} sees ${formatTelemetryCount(pulseRows.length, 'live thread')}.`,
    body: 'Use the command bar to ask, build, or pull source material into the current line of thought.',
    action: 'Metabolize latest source',
    mode: 'metabolize'
  };
};

const HomeGreeting = ({ greeting, onAction }) => (
  <section className="think-home-editorial__greeting" aria-label="Agent orientation">
    <span className="think-home-editorial__greeting-kicker">Agent orientation</span>
    <AgentPresence
      className="think-home-editorial__agent-presence"
      status={greeting.mode === 'seed' ? 'never_run' : 'idle'}
      title={greeting.title}
      subtitle={greeting.body}
      actionLabel={greeting.action}
      onAction={onAction}
    />
  </section>
);

const LivingPulse = ({
  rows,
  isFirstRun,
  onDropSource,
  onCreateNote,
  onCreateConcept,
  onCreateQuestion,
  onActivateRow
}) => (
  <section className="think-home-editorial__pulse think-home-editorial__section" aria-labelledby="think-home-pulse-title">
    <SectionHeader
      title="Living pulse"
      subtitle={isFirstRun ? `${AGENT_DISPLAY_NAME} is ready to help you seed the space.` : 'What is live in the corpus right now.'}
    />
    {isFirstRun ? (
      <div className="think-home-editorial__first-run" data-testid="think-home-first-run">
        <p>
          Nothing is woven in yet. Start with a source, a loose thought, or a question; the workspace will begin building around it.
        </p>
        <div className="think-home-editorial__starter-actions">
          <QuietButton variant="primary" onClick={onDropSource}>Drop a source</QuietButton>
          <QuietButton onClick={onCreateNote}>Start a thought</QuietButton>
          <QuietButton onClick={onCreateConcept}>Build a concept</QuietButton>
          <QuietButton onClick={onCreateQuestion}>Ask a question</QuietButton>
        </div>
      </div>
    ) : (
      <ol className="think-home-editorial__pulse-list">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="think-home-editorial__pulse-row"
              onClick={() => onActivateRow?.(row)}
              aria-label={`${row.label}: ${row.title}`}
            >
              <span className="think-home-editorial__pulse-kind">{row.label}</span>
              <strong>{row.title}</strong>
              {row.meta ? <span>{row.meta}</span> : null}
            </button>
          </li>
        ))}
      </ol>
    )}
  </section>
);

const ThinkHome = ({
  showHero = false,
  heroEyebrow = 'Workspace orientation',
  heroTitle = 'Think',
  heroSubtitle = 'Home for your notebook, concepts, and open questions.',
  recentTargets = [],
  workingSet = { notebooks: [], concepts: [], questions: [] },
  returnQueue = [],
  recentHighlights = [],
  recentArticles = [],
  recentWikiPages = [],
  recentAgentActivity = [],
  queueLoading = false,
  articlesLoading = false,
  loading = false,
  activationState = null,
  onOpenTarget = () => {},
  onOpenNotebook = () => {},
  onOpenConcept = () => {},
  onOpenQuestion = () => {},
  onOpenReturnQueueItem = () => {},
  onOpenArticle = () => {},
  onOpenActivation = () => {},
  onClearActivation = () => {},
  onCreateNote = () => {},
  onCreateConcept = () => {},
  onCreateFromTemplate = () => {},
  onCreateQuestion = () => {},
  onUniversalCommand = null,
  corpusTelemetry = null
}) => {
  const [commandDraft, setCommandDraft] = useState('');
  const [commandStatus, setCommandStatus] = useState('');
  const [commandBusy, setCommandBusy] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referenceResults, setReferenceResults] = useState([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [pulledReferences, setPulledReferences] = useState([]);
  const commandInputRef = useRef(null);
  const continueItem = recentTargets[0] || null;
  const continueMeta = [
    continueItem?.type || '',
    formatRelativeTime(continueItem?.openedAt)
  ].filter(Boolean).join(' · ');
  const resolvedTelemetry = useMemo(() => {
    if (corpusTelemetry) return corpusTelemetry;
    return {
      sources: countItems(recentArticles),
      highlights: countItems(recentHighlights),
      concepts: countItems(workingSet.concepts),
      openThreads: countItems(workingSet.questions),
      wikiPages: countItems(recentWikiPages),
      agentMoves: countItems(recentAgentActivity),
      returnQueue: countItems(returnQueue)
    };
  }, [corpusTelemetry, recentAgentActivity, recentArticles, recentHighlights, recentWikiPages, returnQueue, workingSet.concepts, workingSet.questions]);
  const pulseRows = useMemo(() => buildPulseRows({
    recentTargets,
    workingSet,
    returnQueue,
    recentHighlights,
    recentArticles,
    recentWikiPages,
    recentAgentActivity
  }), [recentAgentActivity, recentArticles, recentHighlights, recentTargets, recentWikiPages, returnQueue, workingSet]);
  const thinkIndexRows = useMemo(() => buildThinkIndexRows({ workingSet, recentTargets }), [recentTargets, workingSet]);
  const thinkIndexOrientation = useMemo(() => buildIndexOrientation(thinkIndexRows), [thinkIndexRows]);
  const isFirstRun = !loading
    && !queueLoading
    && !articlesLoading
    && Object.values(resolvedTelemetry).every(value => Number(value || 0) === 0)
    && countItems(workingSet.notebooks) === 0;
  const greeting = useMemo(() => buildHomeGreeting({
    continueItem,
    resolvedTelemetry,
    pulseRows,
    isFirstRun
  }), [continueItem, isFirstRun, pulseRows, resolvedTelemetry]);
  const tickerLines = [
    `scanning corpus - ${formatTelemetryCount(resolvedTelemetry.sources, 'source')} / ${formatTelemetryCount(resolvedTelemetry.highlights, 'highlight')}`,
    isFirstRun
      ? 'waiting for first source or thought'
      : `found ${formatTelemetryCount(pulseRows.length, 'live thread')}`,
    continueItem?.title
      ? `ready to resume - ${continueItem.title}`
      : `${AGENT_DISPLAY_NAME} standing by`
  ];

  const trimmedReferenceQuery = referenceQuery.trim();

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setReferenceLoading(true);
      setReferenceError('');
      try {
        const results = await searchConnectableItems({
          q: trimmedReferenceQuery,
          limit: 6
        });
        if (!cancelled) setReferenceResults(Array.isArray(results) ? results : []);
      } catch (error) {
        if (!cancelled) setReferenceError(error?.response?.data?.error || 'Could not search references.');
      } finally {
        if (!cancelled) setReferenceLoading(false);
      }
    }, trimmedReferenceQuery ? 180 : 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [trimmedReferenceQuery]);

  const pullHomeReference = (item = {}) => {
    const reference = normalizeReferenceItem(item);
    if (!reference?.key) return;
    setPulledReferences(current => [
      reference,
      ...current.filter(existing => existing.key !== reference.key)
    ].slice(0, 5));
    setReferenceQuery('');
    setReferenceResults([]);
    setCommandStatus(`${reference.label} is in the command context.`);
  };

  const removeHomeReference = (key = '') => {
    setPulledReferences(current => current.filter(reference => reference.key !== key));
  };

  const handleUniversalCommand = async (event) => {
    event.preventDefault();
    const text = commandDraft.trim();
    if (!text || commandBusy) return;
    setCommandBusy(true);
    setCommandStatus(`${AGENT_DISPLAY_NAME} is routing this…`);
    try {
      const status = typeof onUniversalCommand === 'function'
        ? await onUniversalCommand(text, { references: pulledReferences })
        : '';
      setCommandStatus(status || `${AGENT_DISPLAY_NAME} opened the right workspace.`);
      setCommandDraft('');
    } catch (error) {
      setCommandStatus(error?.message || `${AGENT_DISPLAY_NAME} could not route that yet.`);
    } finally {
      setCommandBusy(false);
    }
  };

  const handleGreetingAction = async () => {
    if (greeting.mode === 'resume' && continueItem) {
      onOpenTarget(continueItem);
      return;
    }
    if (greeting.mode === 'metabolize' && recentArticles[0]) {
      if (typeof onUniversalCommand === 'function') {
        const article = recentArticles[0];
        const articleId = String(article?._id || article?.id || '').trim();
        const articleUrl = String(article?.url || article?.link || '').trim();
        const command = articleId
          ? `/ingest @article:${articleId}`
          : (articleUrl ? `/ingest ${articleUrl}` : `Metabolize latest source: ${article?.title || 'Untitled source'}`);
        const articleReference = normalizeReferenceItem({
          itemType: 'article',
          itemId: articleId || articleUrl || article?.title,
          title: article?.title || articleUrl || 'Latest source',
          snippet: article?.summary || article?.description || articleUrl
        });
        setCommandBusy(true);
        setCommandStatus(`${AGENT_DISPLAY_NAME} is metabolizing "${article?.title || 'latest source'}"...`);
        try {
          const status = await onUniversalCommand(command, {
            references: articleReference ? [articleReference] : []
          });
          setCommandStatus(status || `${AGENT_DISPLAY_NAME} sent the source to Wiki.`);
        } catch (error) {
          setCommandStatus(error?.message || `${AGENT_DISPLAY_NAME} could not metabolize that source yet.`);
        } finally {
          setCommandBusy(false);
        }
        return;
      }
      onOpenArticle(recentArticles[0]);
      return;
    }
    onCreateNote();
  };

  const handleDropFirstSource = () => {
    setCommandDraft('/ingest ');
    setCommandStatus('Paste a source URL after /ingest, or use reference... to pull a Library item.');
    window.requestAnimationFrame(() => {
      commandInputRef.current?.focus?.();
      commandInputRef.current?.setSelectionRange?.(8, 8);
    });
  };

  const handlePulseRow = async (row = {}) => {
    if (row.action === 'target' && row.target) {
      onOpenTarget(row.target);
      return;
    }
    if (row.action === 'concept' && row.conceptName) {
      onOpenConcept(row.conceptName);
      return;
    }
    if (row.action === 'question' && row.questionId) {
      onOpenQuestion(row.questionId);
      return;
    }
    if (row.action === 'notebook' && row.notebookId) {
      onOpenNotebook(row.notebookId);
      return;
    }
    if (row.action === 'return-queue' && row.queueItem) {
      onOpenReturnQueueItem(row.queueItem);
      return;
    }
    if (row.action === 'wiki' && row.pageId) {
      window.location.href = `/wiki/workspace?page=${encodeURIComponent(row.pageId)}`;
      return;
    }
    const article = row.article || {};
    const highlight = row.highlight || {};
    const articleId = String(article?._id || article?.id || '').trim();
    const highlightId = String(highlight?._id || highlight?.id || '').trim();
    const sourceUrl = String(article?.url || article?.link || '').trim();
    const command = row.action === 'metabolize-highlight' && highlightId
      ? `/ingest @highlight:${highlightId}${sourceUrl ? ` ${sourceUrl}` : ''}`
      : articleId
        ? `/ingest @article:${articleId}${sourceUrl ? ` ${sourceUrl}` : ''}`
        : (sourceUrl ? `/ingest ${sourceUrl}` : '');
    if (!command || typeof onUniversalCommand !== 'function') {
      if (row.action === 'metabolize-article' && row.article) onOpenArticle(row.article);
      return;
    }
    const sourceTitle = article?.title || highlight?.articleTitle || row.title || 'source';
    setCommandBusy(true);
    setCommandStatus(`${AGENT_DISPLAY_NAME} is metabolizing "${sourceTitle}"...`);
    try {
      const reference = normalizeReferenceItem({
        itemType: row.action === 'metabolize-highlight' ? 'highlight' : 'article',
        itemId: highlightId || articleId || sourceUrl || sourceTitle,
        articleId: highlight.articleId || articleId,
        title: sourceTitle,
        snippet: highlight.text || article.summary || article.description || sourceUrl
      });
      const status = await onUniversalCommand(command, { references: reference ? [reference] : [] });
      setCommandStatus(status || `${AGENT_DISPLAY_NAME} sent this source to Wiki.`);
    } catch (error) {
      setCommandStatus(error?.message || `${AGENT_DISPLAY_NAME} could not metabolize that pulse row yet.`);
    } finally {
      setCommandBusy(false);
    }
  };

  return (
    <div className="think-home think-home-editorial section-stack">
      {showHero && (
        <header className="think-home-editorial__hero">
          <div className="think-home-editorial__hero-eyebrow">{heroEyebrow}</div>
          <h1 className="think-home-editorial__hero-title">{heroTitle}</h1>
          <p className="think-home-editorial__hero-subtitle">{heroSubtitle}</p>
        </header>
      )}

      {isFirstInsightActive(activationState) && (
        <section className="think-home-editorial__notice first-insight-card">
          <SectionHeader title="First insight in progress" subtitle="Keep the capture-to-revisit loop moving." />
          <p className="first-insight-summary">{getFirstInsightSummary(activationState)}</p>
          <div className="think-home-editorial__notice-actions">
            <QuietButton onClick={onOpenActivation}>Open thread</QuietButton>
            <QuietButton onClick={onClearActivation}>Clear</QuietButton>
          </div>
        </section>
      )}

      <HomeGreeting greeting={greeting} onAction={handleGreetingAction} />

      <form
        className="think-home-editorial__universal-command"
        aria-label="Universal command"
        onSubmit={handleUniversalCommand}
      >
        <label className="think-home-editorial__command-label" htmlFor="think-home-universal-command">
          Ask, think, or build
        </label>
        <div className="think-home-editorial__command-row">
          <input
            ref={commandInputRef}
            id="think-home-universal-command"
            value={commandDraft}
            onChange={(event) => setCommandDraft(event.target.value)}
            placeholder="Think, ask, or build..."
            disabled={commandBusy}
          />
          <button type="submit" disabled={!commandDraft.trim() || commandBusy}>
            {commandBusy ? 'Routing' : 'Start'}
          </button>
        </div>
        <p className="think-home-editorial__command-hint" aria-live="polite">
          {commandStatus || `${AGENT_DISPLAY_NAME} will send this to a note, concept, question, source search, or wiki build.`}
        </p>
      </form>

      <section className="think-home-editorial__reference-tray" aria-label="Home reference tray">
        <div className="think-home-editorial__reference-head">
          <span>reference...</span>
          <p>Pull Library highlights, sources, Wiki pages, or Think work into the next command.</p>
        </div>
        <div className="think-home-editorial__reference-search">
          <input
            type="search"
            value={referenceQuery}
            onChange={(event) => setReferenceQuery(event.target.value)}
            placeholder="Search highlights, sources, Wiki, concepts, notes..."
            aria-label="Search Home references"
          />
        </div>
        {referenceLoading ? <p className="muted small">Searching corpus...</p> : null}
        {referenceError ? <p className="status-message error-message">{referenceError}</p> : null}
        {referenceResults.length ? (
          <div className="think-home-editorial__reference-results">
            {referenceResults.map((item) => {
              const reference = normalizeReferenceItem(item);
              if (!reference) return null;
              return (
                <button
                  type="button"
                  key={reference.key}
                  className="think-home-editorial__reference-result"
                  onClick={() => pullHomeReference(item)}
                >
                  <span>{TYPE_LABELS[item.itemType] || TYPE_LABELS[reference.type] || reference.type}</span>
                  <strong>{reference.title}</strong>
                  {reference.snippet ? <small>{reference.snippet}</small> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {pulledReferences.length ? (
          <div className="think-home-editorial__reference-strip" aria-label="Pulled Home references">
            <span>Context</span>
            {pulledReferences.map(reference => (
              <button
                type="button"
                key={reference.key}
                onClick={() => removeHomeReference(reference.key)}
                aria-label={`Remove ${reference.label}`}
              >
                {reference.label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <CorpusTelemetryStrip telemetry={resolvedTelemetry} />
      <AgentTicker
        className="think-home-editorial__ticker"
        label={`${AGENT_DISPLAY_NAME} home trace`}
        state={commandBusy ? 'working' : 'idle'}
        lines={tickerLines}
      />

      <LivingPulse
        rows={pulseRows}
        isFirstRun={isFirstRun}
        onDropSource={handleDropFirstSource}
        onCreateNote={onCreateNote}
        onCreateConcept={onCreateConcept}
        onCreateQuestion={onCreateQuestion}
        onActivateRow={handlePulseRow}
      />

      <div
        className="think-home-editorial__launchpad think-home-editorial__launchpad--split"
        role="toolbar"
        aria-label="Think actions"
      >
        <div className="think-home-editorial__launchpad-primary">
          <QuietButton variant="primary" onClick={onCreateNote}>New note</QuietButton>
        </div>
        <div className="think-home-editorial__launchpad-secondary">
          <QuietButton onClick={onCreateConcept}>New concept</QuietButton>
          <QuietButton onClick={onCreateFromTemplate}>Use template</QuietButton>
          <QuietButton onClick={onCreateQuestion}>New question</QuietButton>
        </div>
      </div>

      <section className="think-home__continue think-home-editorial__section">
        <SectionHeader title="Continue" subtitle="Pick up your latest thread, or start something new without leaving Think." />
        {continueItem ? (
          <ContinueHero
            item={continueItem}
            meta={continueMeta}
            onResume={() => onOpenTarget(continueItem)}
          />
        ) : (
          <Empty text="No recent activity yet." />
        )}
      </section>

      <ThinkIndex
        rows={thinkIndexRows}
        orientation={thinkIndexOrientation}
        onOpenNotebook={onOpenNotebook}
        onOpenConcept={onOpenConcept}
        onOpenQuestion={onOpenQuestion}
        onCreateNote={onCreateNote}
        onCreateConcept={onCreateConcept}
        onCreateQuestion={onCreateQuestion}
      />

      <section className="think-home__panel think-home-editorial__section">
        <SectionHeader title="Working set" subtitle="Recent notes, active concepts, and open questions." />
        {loading ? (
          <HomeSkeleton />
        ) : (
          <div className="think-home__working-grid think-home-editorial__working-grid think-home-editorial-ledger">
            <section className="think-home__working-column think-home-editorial-column">
              <p className="think-home__column-title">Notebook</p>
              <div className="think-home__list think-home__list--scannable think-home-editorial-list">
                {workingSet.notebooks.length === 0 ? (
                  <EmptyAction
                    text="No notes yet."
                    actionLabel="Start your first note"
                    onAction={onCreateNote}
                    testId="think-home-empty-notebooks"
                  />
                ) : (
                  workingSet.notebooks.slice(0, 5).map((item) => (
                    <HomeRow
                      key={item._id}
                      title={item.title || 'Untitled note'}
                      meta={formatRelativeTime(item.updatedAt || item.createdAt)}
                      className="think-home__row--scannable"
                      onClick={() => onOpenNotebook(item._id)}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="think-home__working-column think-home-editorial-column">
              <p className="think-home__column-title">Concepts</p>
              <div className="think-home__list think-home__list--scannable think-home-editorial-list">
                {workingSet.concepts.length === 0 ? (
                  <EmptyAction
                    text="No concepts yet."
                    actionLabel="Create your first concept"
                    onAction={onCreateConcept}
                    testId="think-home-empty-concepts"
                  />
                ) : (
                  workingSet.concepts.slice(0, 5).map((item) => (
                    <HomeRow
                      key={item.name}
                      title={item.name}
                      meta={`${item.count || 0} highlights`}
                      className="think-home__row--scannable"
                      onClick={() => onOpenConcept(item.name)}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="think-home__working-column think-home-editorial-column">
              <p className="think-home__column-title">Questions</p>
              <div className="think-home__list think-home__list--scannable think-home-editorial-list">
                {workingSet.questions.length === 0 ? (
                  <EmptyAction
                    text="No open questions."
                    actionLabel="Capture your first question"
                    onAction={onCreateQuestion}
                    testId="think-home-empty-questions"
                  />
                ) : (
                  workingSet.questions.slice(0, 5).map((item) => (
                    <HomeRow
                      key={item._id}
                      title={item.text || 'Untitled question'}
                      meta={item.linkedTagName || 'Unscoped'}
                      className="think-home__row--scannable"
                      onClick={() => onOpenQuestion(item._id)}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </section>

      <div className="think-home__split-grid think-home-editorial__split-grid">
        <section className="think-home__panel think-home-editorial__section">
          <SectionHeader title="Return queue" subtitle="Items due for re-encounter." />
          <div className="think-home__list think-home__list--scannable think-home-editorial-list">
            {queueLoading ? (
              <HomeSkeleton />
            ) : returnQueue.length === 0 ? (
              <Empty text="No return queue items." />
            ) : (
              returnQueue.map((entry) => (
                <HomeRow
                  key={entry._id}
                  title={entry.item?.title || `${entry.itemType} item`}
                  meta={entry.reason || entry.itemType}
                  className="think-home__row--scannable"
                  onClick={() => onOpenReturnQueueItem(entry)}
                />
              ))
            )}
          </div>
        </section>

        <section className="think-home__panel think-home-editorial__section">
          <SectionHeader title="Recent material" subtitle="Highlights and source articles in motion." />

          <div className="think-home__material-block">
            <p className="think-home__column-title">Highlights</p>
            <div className="think-home__list think-home__list--scannable think-home-editorial-list">
              {recentHighlights.length === 0 ? (
                <Empty text="No highlights yet." />
              ) : (
                recentHighlights.slice(0, 6).map((item) => (
                  <MaterialRow
                    key={item._id}
                    title={item.articleTitle || 'Highlight'}
                    snippet={(item.text || '').slice(0, 180)}
                    onClick={() => {
                      if (item.articleId) {
                        onOpenArticle(item.articleId);
                        return;
                      }
                      window.location.href = '/library?scope=highlights';
                    }}
                  />
                ))
              )}
            </div>
          </div>

          <div className="think-home__material-block">
            <p className="think-home__column-title">Articles</p>
            <div className="think-home__list think-home__list--scannable think-home-editorial-list">
              {articlesLoading ? (
                <HomeSkeleton />
              ) : recentArticles.length === 0 ? (
                <Empty text="No recent articles." />
              ) : (
                recentArticles.map((item) => (
                  <MaterialRow
                    key={item._id}
                    title={item.title || 'Untitled article'}
                    meta={formatRelativeTime(item.createdAt)}
                    onClick={() => onOpenArticle(item._id)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="think-home__footer-actions">
            <QuietButton onClick={() => { window.location.href = '/library?scope=highlights'; }}>Open Library</QuietButton>
          </div>
        </section>
      </div>
    </div>
  );
};

export default React.memo(ThinkHome);
