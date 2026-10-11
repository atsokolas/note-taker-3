import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getArticles } from '../../api/articles';
import {
  createWikiPage,
  createLibrarySourceProvenanceFixture,
  getWikiIngestRun,
  getWikiPage,
  getWikiSchema,
  ingestWikiSource,
  listWikiActivity,
  reviewWikiIngestRun,
  acceptWikiLintFinding,
  fixWikiLintFinding,
  ignoreWikiLintFinding,
  listWikiPages,
  saveWikiSchema,
  revertWikiSchema,
  suggestWikiSchemaUpdates,
  streamLintWiki,
  streamMaintainWikiPage
} from '../../api/wiki';
import { buildWikiCreatePayload } from '../../utils/wikiCreate';
import { trackWikiEditModeEntered } from '../../utils/wikiAnalytics';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import { Button } from '../ui';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import { useNoeisAgentSurface } from '../../agent/AgentRailContext';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import WikiList from './WikiList';
import WikiPageEditor from './WikiPageEditor';
import WikiPageReadView from './WikiPageReadView';
import { collectWikiText, countWikiSources, countWikiWords } from './wikiPageMetrics';
import { buildWikiSurfaceDescriptor } from './wikiSurfaceModel';
import useDocumentTitle from '../../hooks/useDocumentTitle';

// The Wiki workspace is one canvas. Asking about it is the Partner's job
// (⌘J, scoped to the page or the view); the canvas keeps only the actions
// that write: build a page, feed a source, check the wiki.

const FIRST_VISIT_SEEN_KEY = 'noeis.wiki.first_visit_seen';
// The stream has its own heartbeat/read timeout. This is only a final safety
// ceiling for a full dossier build including automatic reconnects.
const MAINTENANCE_STREAM_TIMEOUT_MS = 12 * 60 * 1000;
const INGEST_POLL_INTERVAL_MS = 1800;
const INGEST_POLL_TIMEOUT_MS = 70000;
const activeAutoBuildPageIds = new Set();

const WikiIndex = lazy(() => import('./WikiIndex'));

const WorkspacePaneFallback = ({ label = 'Loading Wiki pane...' }) => (
  <p className="wiki-index__status">{label}</p>
);

/* Off a page, the Partner is looking at the view itself. On a page, the
   reader (or the editor) says so instead. */
const WikiWorkspaceSurface = ({ view }) => {
  useNoeisAgentSurface('agent-surface.wiki', buildWikiSurfaceDescriptor({ view, mode: 'workspace' }));
  return null;
};

const clean = (value = '') => String(value || '').trim();

const TERMINAL_WIKI_BUILD_CODES = new Set([
  'WIKI_CANDIDATE_REJECTED',
  'WIKI_DOSSIER_EVIDENCE_INCOMPLETE',
  'WIKI_FIRST_HEAD_AWAITING_ACCEPTANCE',
  'WIKI_MAINTENANCE_AWAITING_ACCEPTANCE'
]);
const TERMINAL_WIKI_CANDIDATE_STATUSES = new Set([
  'rejected',
  'first_head_rejected',
  'maintenance_rejected'
]);

const wikiBuildFailure = (message, code = 'WIKI_BUILD_NOT_PERSISTED', retryable = true) => {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
};

export const assessPersistedWikiBuild = (page = {}, expectedPageId = '') => {
  const pageId = clean(page?._id || page?.id);
  const expectedId = clean(expectedPageId);
  const wordCount = Math.max(
    countWikiWords(collectWikiText(page?.body)),
    countWikiWords(page?.plainText)
  );
  const sourceCount = countWikiSources(page);
  const candidateStatus = clean(page?.aiState?.candidateStatus).toLowerCase();
  const errorCode = clean(page?.aiState?.errorCode);
  const quality = page?.aiState?.lastCandidateQuality || page?.qualityReview || null;
  if (!pageId || (expectedId && pageId !== expectedId)) {
    return { ok: false, wordCount, sourceCount, reason: 'Noeis could not verify the persisted Wiki page identity.' };
  }
  if (TERMINAL_WIKI_BUILD_CODES.has(errorCode) || TERMINAL_WIKI_CANDIDATE_STATUSES.has(candidateStatus) || quality?.ok === false || quality?.status === 'fail') {
    return {
      ok: false,
      retryable: false,
      wordCount,
      sourceCount,
      reason: clean(page?.aiState?.lastCandidateSummary || page?.aiState?.lastError)
        || 'The candidate did not meet the reference-page evidence standard.'
    };
  }
  if (candidateStatus.includes('awaiting') || candidateStatus === 'pending_review') {
    return {
      ok: false,
      retryable: false,
      wordCount,
      sourceCount,
      reason: 'The research candidate still needs explicit owner review.'
    };
  }
  if (wordCount <= 0 || sourceCount <= 0) {
    return {
      ok: false,
      wordCount,
      sourceCount,
      reason: `The build finished without a persisted article and evidence (${wordCount} words, ${sourceCount} sources).`
    };
  }
  return { ok: true, page, wordCount, sourceCount };
};

const verifyPersistedWikiBuild = async (pageId = '') => {
  const page = await getWikiPage(pageId);
  const assessment = assessPersistedWikiBuild(page, pageId);
  if (!assessment.ok) {
    throw wikiBuildFailure(
      `${assessment.reason} The page remains a draft and was not recorded as a successful build.`,
      'WIKI_BUILD_NOT_PERSISTED',
      assessment.retryable !== false
    );
  }
  return assessment;
};

const sourceTitle = (source = {}) => clean(source.title || source.url || source.text || source.label || 'Source');

const isObjectIdLike = (value = '') => /^[a-f0-9]{24}$/i.test(String(value || '').trim());

const sourceRefFromIngestRun = (run = {}) => {
  const source = run.sourceRef || {};
  const runId = clean(run.runId || run.sourceEventId || run._id || run.id);
  const rawObjectId = clean(source.objectId || source.sourceObjectId || source._id || source.id);
  return {
    type: clean(source.type || source.sourceType) || 'external',
    objectId: isObjectIdLike(rawObjectId) ? rawObjectId : null,
    parentObjectId: isObjectIdLike(source.parentObjectId || source.parentId || source.articleId)
      ? clean(source.parentObjectId || source.parentId || source.articleId)
      : null,
    title: sourceTitle(source),
    snippet: clean(source.snippet || source.summary || source.text || run.summary),
    url: clean(source.url || source.href),
    citationLabel: runId ? `ingest:${runId}` : '',
    addedBy: 'ai'
  };
};

const pageTitleForId = (pageId = '') => (clean(pageId) ? `Wiki page ${clean(pageId)}` : 'Wiki page');

const summarizeIngestRun = (run = {}) => {
  const affectedCount = Array.isArray(run.affectedPageIds) ? run.affectedPageIds.length : 0;
  if (!isTerminalIngestStatus(run)) return 'Still reading this source. Its plan will show in Wiki Activity.';
  if (run.summary) return run.summary;
  if (affectedCount) {
    return `${AGENT_DISPLAY_NAME} found ${affectedCount} wiki page${affectedCount === 1 ? '' : 's'} that this source may update.`;
  }
  if (run.suggestedCreatePage) {
    return 'No existing page matched strongly enough; the agent suggests creating a new page from this source.';
  }
  return 'The source was saved for review, but no confident wiki update was found.';
};

const ingestRunId = (run = {}) => clean(run.runId || run.sourceEventId || run._id || run.id);

const ingestRunActivityPath = (run = {}) => {
  const runId = ingestRunId(run);
  return runId ? `/wiki/activity/${encodeURIComponent(runId)}` : '/wiki/workspace?view=activity';
};

const ingestCandidateRows = (run = {}) => {
  const explicitRows = Array.isArray(run.candidateUpdates) ? run.candidateUpdates : [];
  if (explicitRows.length) {
    return explicitRows.map((row, index) => {
      const pageId = clean(row.pageId || row.page_id);
      return {
        id: clean(row.id) || pageId || `candidate-${index}`,
        pageId,
        title: clean(row.title) || pageTitleForId(pageId),
        reason: clean(row.reason || row.summary || row.recommendedAction) || 'The source overlaps with this page.',
        confidence: clean(row.confidence || row.scoreLabel || row.status) || 'Candidate',
        status: clean(row.status) || clean(run.status),
        targetType: clean(row.targetType || row.target_type),
        objectId: clean(row.objectId || row.object_id),
        provenance: row.provenance && typeof row.provenance === 'object' ? row.provenance : null,
        graphTrace: row.graphTrace && typeof row.graphTrace === 'object' ? row.graphTrace : null
      };
    });
  }
  const affectedPageIds = Array.isArray(run.affectedPageIds) ? run.affectedPageIds.filter(Boolean) : [];
  return affectedPageIds.map((pageId, index) => ({
    id: clean(pageId) || `affected-${index}`,
    pageId,
    title: pageTitleForId(pageId),
    reason: 'The ingest pipeline marked this page as affected by the source.',
    confidence: run.status === 'processed' || run.status === 'completed' ? 'Updated' : 'Candidate',
    status: clean(run.status)
  }));
};

const thinkCandidatePath = (row = {}) => {
  const targetType = clean(row.targetType).toLowerCase();
  const objectId = clean(row.objectId || row.object_id || row.pageId);
  const title = clean(row.title);
  if (targetType === 'concept') {
    const concept = title || objectId;
    return concept ? `/think?tab=concepts&concept=${encodeURIComponent(concept)}` : '';
  }
  if (targetType === 'question') {
    return objectId ? `/think?tab=questions&questionId=${encodeURIComponent(objectId)}` : '/think?tab=questions';
  }
  if (targetType === 'notebook') {
    return objectId ? `/think?tab=notebook&entryId=${encodeURIComponent(objectId)}` : '/think?tab=notebook';
  }
  return '';
};

const ingestCandidateDestination = (row = {}) => {
  const pageId = clean(row.pageId);
  if (pageId) {
    return {
      type: 'wiki',
      label: 'Open',
      onNavigate: { page: pageId }
    };
  }
  const path = thinkCandidatePath(row);
  if (path) {
    return {
      type: 'think',
      label: 'Open in Think',
      path
    };
  }
  return null;
};

const ingestCandidateProvenanceLabel = (row = {}, source = {}) => {
  const candidateSource = clean(row.provenance?.sourceTitle || row.sourceTitle);
  return candidateSource || sourceTitle(source);
};

const graphTraceTargetLabel = (trace = {}, row = {}) => {
  const target = trace.target || {};
  const targetType = clean(target.type || row.targetType);
  if (targetType === 'wiki_page') return 'wiki page';
  if (targetType === 'question') return 'question';
  if (targetType === 'concept') return 'concept';
  if (targetType === 'notebook') return 'notebook';
  return targetType ? targetType.replace(/_/g, ' ') : 'target';
};

const ingestCandidateGraphTraceLabel = (row = {}, source = {}) => {
  const trace = row.graphTrace || {};
  if (!trace.bidirectional) return '';
  const sourceLabel = ingestCandidateProvenanceLabel(row, source);
  return `Linked ${sourceLabel} ↔ ${graphTraceTargetLabel(trace, row)}`;
};

const formatIngestCompletion = (run = {}) => {
  const source = sourceTitle(run.sourceRef);
  const candidateRows = ingestCandidateRows(run);
  const affectedPageIds = Array.isArray(run.affectedPageIds) ? run.affectedPageIds.filter(Boolean) : [];
  const pageTitles = candidateRows.length
    ? candidateRows.map(row => row.title).filter(Boolean)
    : affectedPageIds.map(pageId => pageTitleForId(pageId));
  const destination = pageTitles.length
    ? `Review ${pageTitles.length} proposed destination${pageTitles.length === 1 ? '' : 's'}: ${pageTitles.slice(0, 3).join(', ')}${pageTitles.length > 3 ? ', ...' : ''}.`
    : run.suggestedCreatePage
      ? `No existing page matched; suggested a new page${run.suggestedTitle ? `, "${run.suggestedTitle}"` : ''}.`
      : 'No confident page destination was found yet.';
  return `Done — ${source} landed in Wiki Activity. ${destination}`;
};

const wikiWorkspacePageHref = (pageId) => (
  pageId ? `/wiki/workspace?page=${encodeURIComponent(pageId)}` : '/wiki/workspace'
);

const wikiIngestSystemReceipt = (run) => {
  const reading = !isTerminalIngestStatus(run);
  const runStatus = clean(run.status).toLowerCase();
  const reviewStatus = clean(run.reviewStatus || run.metadata?.ingestReviewStatus).toLowerCase();
  return {
    title: `Source ingest · ${sourceTitle(run.sourceRef)}`,
    summary: reading ? `Still reading ${sourceTitle(run.sourceRef)}. It will land in Wiki Activity.` : formatIngestCompletion(run),
    status: reading ? 'running'
      : runStatus === 'failed' ? 'failed'
        : reviewStatus === 'pending_review' ? 'needs_review' : 'completed',
    href: ingestRunActivityPath(run) || '/wiki/workspace?view=activity'
  };
};

const wikiBuildSystemReceipt = ({ pageId = '', label = '', recovered = false } = {}) => ({
  title: recovered ? 'Wiki page built with review' : 'Wiki page built',
  summary: pageId
    ? `Built @wiki:${pageId}${label ? ` for "${label}"` : ''}.`
    : 'Built wiki page.',
  status: recovered ? 'completed_with_warnings' : 'completed',
  href: wikiWorkspacePageHref(pageId)
});

const isTerminalIngestStatus = (run = {}) => {
  const status = clean(run.status).toLowerCase();
  return ['processed', 'completed', 'ignored', 'failed'].includes(status);
};

const waitForIngestCompletion = async (initialRun = {}) => {
  const runId = ingestRunId(initialRun);
  if (!runId || isTerminalIngestStatus(initialRun)) return initialRun;
  const startedAt = Date.now();
  let latestRun = initialRun;
  while (Date.now() - startedAt < INGEST_POLL_TIMEOUT_MS) {
    await new Promise(resolve => window.setTimeout(resolve, INGEST_POLL_INTERVAL_MS));
    latestRun = await getWikiIngestRun(runId);
    if (isTerminalIngestStatus(latestRun)) return latestRun;
  }
  return latestRun;
};

const LINT_GROUP_LABELS = {
  contradictions: 'Contradictions',
  stale: 'Stale pages',
  gaps: 'Evidence gaps',
  orphans: 'Orphans',
  missingPages: 'Missing pages',
  missingLinks: 'Missing links'
};

const lintFindings = (run = {}) => Object.entries(run.findings || {})
  .flatMap(([group, rows]) => (
    Array.isArray(rows)
      ? rows.map(finding => ({ ...finding, group }))
      : []
  ))
  .filter(finding => finding.status !== 'ignored');

const withMaintenanceTimeout = async (promise, pageLabel = 'wiki page') => {
  let timeoutId;
  const overrideMs = Number(window.__NOEIS_WIKI_MAINTENANCE_TIMEOUT_MS__);
  const timeoutMs = Number.isFinite(overrideMs) ? overrideMs : MAINTENANCE_STREAM_TIMEOUT_MS;
  if (timeoutMs <= 0) {
    throw new Error(`Rereading ${pageLabel} took too long. Try again.`);
  }
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Rereading ${pageLabel} took too long. Try again.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const actionLabel = (action, finding = {}) => {
  if (action === 'accept') {
    if (finding.type === 'missing_page') return 'Create';
    if (finding.type === 'missing_link') return 'Link';
    if (finding.type === 'stale') return 'Draft';
    return 'Accept';
  }
  if (action === 'fix') {
    if (finding.type === 'stale') return 'Draft';
    if (finding.type === 'missing_page') return 'Create + draft';
    return 'Fix';
  }
  return 'Ignore';
};

const viewPathFor = ({ view = 'graph', page = '', mode = '', trace = false } = {}) => {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  else params.set('view', view);
  if (page && mode && mode !== 'read') params.set('mode', mode);
  if (trace) params.set('trace', '1');
  return `/wiki/workspace?${params.toString()}`;
};

const searchFor = (target = {}) => {
  const path = viewPathFor(target);
  return path.slice(path.indexOf('?'));
};

const isExpectedViewTransitionAbort = (error) => {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  return name === 'AbortError' || /transition was skipped|view transition/i.test(message);
};

const startWikiViewTransition = (callback) => {
  if (
    typeof document !== 'undefined'
    && typeof document.startViewTransition === 'function'
  ) {
    const transition = document.startViewTransition(callback);
    transition?.finished?.catch?.((error) => {
      if (!isExpectedViewTransitionAbort(error)) {
        console.error(error);
      }
    });
    return;
  }
  callback();
};

const hasSeenFirstVisitOnboarding = () => {
  try {
    return window.localStorage?.getItem?.(FIRST_VISIT_SEEN_KEY) === 'true';
  } catch (_error) {
    return true;
  }
};

const WorkspaceSources = ({ onFeedSource }) => {
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getArticles({ query, limit: 25, sort: 'recent' })
      .then(items => {
        if (!cancelled) setArticles(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load Library sources.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [query]);

  return (
    <section className="wiki-workspace-sources" aria-label="Library sources">
      <header>
        <p className="wiki-index__eyebrow">Sources</p>
        <h1>Library</h1>
      </header>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search Library sources"
        aria-label="Search Library sources"
      />
      {loading ? <p className="wiki-index__status">Loading Library sources...</p> : null}
      {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
      <ol className="wiki-workspace-sources__list">
        {articles.map(article => (
          <li key={article._id || article.id}>
            <Link to={`/articles/${article._id || article.id}`}>{article.title || article.url || 'Untitled source'}</Link>
            {article.url ? <span>{article.url}</span> : null}
            <button type="button" onClick={() => onFeedSource?.(article)}>
              Feed to wiki
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};

const WorkspaceActivity = ({ onNavigate }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [check, setCheck] = useState({ status: 'idle', run: null, message: '' });

  /* The one wiki-wide maintenance pass: contradictions, stale pages, missing
     links and gaps, each with its own Accept / Fix / Ignore. */
  const runCheck = async () => {
    setCheck({ status: 'running', run: null, message: 'Checking the wiki…' });
    try {
      const run = await streamLintWiki({ pageId: '' }, {
        onEvent: (event, payload = {}) => {
          if (event === 'wiki-lint' && payload.summary) {
            setCheck(current => ({ ...current, message: payload.summary }));
          }
        }
      });
      setCheck({ status: 'done', run, message: '' });
    } catch (_error) {
      setCheck({ status: 'failed', run: null, message: 'The wiki check did not finish. Try again.' });
    }
  };

  useEffect(() => {
    let cancelled = false;
    listWikiActivity({ limit: 40 })
      .then(items => {
        if (!cancelled) setEvents(Array.isArray(items) ? items : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="wiki-workspace-activity" aria-label="Wiki activity">
      <header>
        <p className="wiki-index__eyebrow">Activity</p>
        <h1>Wiki log</h1>
        <Button type="button" onClick={runCheck} disabled={check.status === 'running'}>
          {check.status === 'running' ? 'Checking…' : 'Check the wiki'}
        </Button>
      </header>
      {check.message ? (
        <p className={check.status === 'failed' ? 'wiki-index__error' : 'wiki-index__status'} role="status">{check.message}</p>
      ) : null}
      {check.run ? <WikiLintResultCard run={check.run} onNavigate={onNavigate} /> : null}
      {loading ? <p className="wiki-index__status">Loading activity...</p> : null}
      <ol>
        {events.map(event => (
          <li key={event.id || `${event.type}-${event.at}`}>
            <strong>{event.title || 'Wiki activity'}</strong>
            {event.summary ? <p>{event.summary}</p> : null}
            <div className="wiki-workspace-activity__actions">
              {event.pageId ? <Link to={viewPathFor({ page: event.pageId })}>Open page</Link> : null}
              {event.runId ? <Link to={`/wiki/activity/${encodeURIComponent(event.runId)}`}>Details</Link> : null}
              {Array.isArray(event.affectedPageIds) && event.affectedPageIds.length ? (
                <span>{event.affectedPageIds.length} page{event.affectedPageIds.length === 1 ? '' : 's'} touched</span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
};

const WorkspaceSchema = () => {
  const [content, setContent] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;
    getWikiSchema()
      .then(result => {
        if (!cancelled) {
          setContent(result?.content || '');
          setSnapshots(Array.isArray(result?.snapshots) ? result.snapshots : []);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('Failed to load schema.');
      });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setBusy('save');
    setStatus('Saving...');
    try {
      const result = await saveWikiSchema(content);
      setContent(result?.content || content);
      setSnapshots(Array.isArray(result?.snapshots) ? result.snapshots : []);
      setStatus('Schema saved.');
    } catch (_error) {
      setStatus('That did not save.');
    } finally {
      setBusy('');
    }
  };

  const handleRevert = async (snapshotId) => {
    if (!snapshotId) return;
    setBusy(`revert:${snapshotId}`);
    setStatus('Reverting...');
    try {
      const result = await revertWikiSchema(snapshotId);
      setContent(result?.content || '');
      setSnapshots(Array.isArray(result?.snapshots) ? result.snapshots : []);
      setSuggestion(null);
      setStatus('Schema reverted.');
    } catch (_error) {
      setStatus('Failed to revert schema.');
    } finally {
      setBusy('');
    }
  };

  const handleSuggest = async () => {
    setBusy('suggest');
    setStatus('Suggesting...');
    try {
      const result = await suggestWikiSchemaUpdates({ currentSchema: content });
      setSuggestion(result || null);
      setStatus(result?.summary || 'Schema suggestions ready.');
    } catch (_error) {
      setStatus('Failed to suggest schema updates.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="wiki-workspace-schema" aria-label="Wiki schema">
      <header>
        <p className="wiki-index__eyebrow">Schema</p>
        <h1>Wiki conventions</h1>
      </header>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label="Wiki schema editor"
        rows={18}
      />
      <div>
        <Button type="button" onClick={handleSave} disabled={Boolean(busy)}>Save schema</Button>
        <Button type="button" onClick={handleSuggest} disabled={Boolean(busy)}>Suggest updates</Button>
        {status ? <span role="status">{status}</span> : null}
      </div>
      <section className="wiki-workspace-schema__review" aria-label="Schema review">
        <div>
          <h2>Snapshots</h2>
          {snapshots.length ? (
            <ol>
              {snapshots.slice(0, 5).map(snapshot => (
                <li key={snapshot.id}>
                  <button
                    type="button"
                    onClick={() => handleRevert(snapshot.id)}
                    disabled={Boolean(busy)}
                  >
                    Revert to {snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'snapshot'}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>No saved snapshots yet.</p>
          )}
        </div>
        <div>
          <h2>Suggested patch</h2>
          {suggestion?.proposedPatch ? (
            <textarea
              readOnly
              aria-label="Suggested wiki schema patch"
              value={suggestion.proposedPatch}
              rows={8}
            />
          ) : (
            <p>Ask {AGENT_DISPLAY_NAME} to suggest schema updates from the current conventions.</p>
          )}
        </div>
      </section>
    </section>
  );
};

const WikiLintResultCard = ({ run, onNavigate }) => {
  const [currentRun, setCurrentRun] = useState(run || {});
  const [busyFinding, setBusyFinding] = useState('');
  const [notice, setNotice] = useState('');
  const findings = useMemo(() => lintFindings(currentRun), [currentRun]);
  const runId = clean(currentRun.runId || currentRun._id);

  useEffect(() => {
    setCurrentRun(run || {});
  }, [run]);

  const handleAction = async (finding, action) => {
    if (!runId || !finding.id) return;
    setBusyFinding(`${finding.id}:${action}`);
    try {
      const mutate = action === 'accept'
        ? acceptWikiLintFinding
        : action === 'fix'
          ? fixWikiLintFinding
          : ignoreWikiLintFinding;
      const result = await mutate(runId, finding.id);
      if (result?.run) setCurrentRun(result.run);
      setNotice(`${actionLabel(action, finding)} done for ${finding.title || finding.type}.`);
      if (result?.page?._id || result?.page?.id) onNavigate?.({ page: clean(result.page._id || result.page.id) });
    } catch (_error) {
      setNotice(`${actionLabel(action, finding)} failed for ${finding.title || finding.type}.`);
    } finally {
      setBusyFinding('');
    }
  };

  return (
    <div className="wiki-workspace-lint-card">
      <header>
        <strong>Wiki check</strong>
        <span>{currentRun.summary || 'Structural scan complete.'}</span>
      </header>
      {notice ? <p className="wiki-index__status" role="status">{notice}</p> : null}
      {findings.length ? (
        <ol>
          {findings.slice(0, 12).map(finding => (
            <li key={finding.id || `${finding.group}-${finding.title}`}>
              <div>
                <span>{LINT_GROUP_LABELS[finding.group] || finding.type}</span>
                <strong>{finding.title || finding.type}</strong>
                {finding.summary ? <p>{finding.summary}</p> : null}
                {finding.recommendedAction ? <em>{finding.recommendedAction}</em> : null}
              </div>
              <div className="wiki-workspace-lint-card__actions">
                {finding.actionability === 'automatic' ? (
                  <>
                    <button
                      type="button"
                      disabled={Boolean(busyFinding)}
                      onClick={() => handleAction(finding, 'accept')}
                    >
                      {busyFinding === `${finding.id}:accept` ? 'Working...' : actionLabel('accept', finding)}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyFinding)}
                      onClick={() => handleAction(finding, 'fix')}
                    >
                      {busyFinding === `${finding.id}:fix` ? 'Working...' : actionLabel('fix', finding)}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(busyFinding)}
                    onClick={() => handleAction(finding, 'accept')}
                  >
                    {busyFinding === `${finding.id}:accept` ? 'Working...' : actionLabel('accept', finding)}
                  </button>
                )}
                <button
                  type="button"
                  disabled={Boolean(busyFinding)}
                  onClick={() => handleAction(finding, 'ignore')}
                >
                  {busyFinding === `${finding.id}:ignore` ? 'Working...' : 'Ignore'}
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>No open lint findings.</p>
      )}
    </div>
  );
};

const WikiIngestResultCard = ({ run = {}, onNavigate, onBuildFromSource, onReviewUpdate }) => {
  const [currentRun, setCurrentRun] = useState(run);
  const [reviewBusy, setReviewBusy] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [building, setBuilding] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  useEffect(() => {
    setCurrentRun(run);
  }, [run]);
  const affectedPageIds = Array.isArray(currentRun.affectedPageIds) ? currentRun.affectedPageIds.filter(Boolean) : [];
  const runId = ingestRunId(currentRun);
  const source = currentRun.sourceRef || {};
  const suggestedCreatePage = Boolean(currentRun.suggestedCreatePage || currentRun.metadata?.ignoredReason === 'no_matching_wiki_page');
  const candidateRows = useMemo(() => ingestCandidateRows(currentRun), [currentRun]);
  useEffect(() => {
    setSelectedCandidateIds(candidateRows.map(row => row.id).filter(Boolean));
  }, [candidateRows]);
  const reviewStatus = clean(currentRun.reviewStatus || currentRun.metadata?.ingestReviewStatus);
  const reviewLabel = reviewStatus
    ? reviewStatus.replace(/_/g, ' ')
    : (candidateRows.length ? 'pending review' : 'no candidates');
  const toggleCandidate = (candidateId) => {
    setSelectedCandidateIds((current) => (
      current.includes(candidateId)
        ? current.filter(id => id !== candidateId)
        : [...current, candidateId]
    ));
  };
  const handleReview = async (action) => {
    if (!runId || reviewBusy) return;
    const candidateIds = selectedCandidateIds.filter(id => candidateRows.some(row => row.id === id));
    if (candidateRows.length && !candidateIds.length) {
      setReviewError('Select at least one candidate update to review.');
      return;
    }
    setReviewBusy(action);
    setReviewError('');
    try {
      const updated = await reviewWikiIngestRun(runId, action, { candidateIds });
      setCurrentRun(updated || currentRun);
      if (updated) onReviewUpdate?.(updated);
    } catch (error) {
      setReviewError(error?.response?.data?.error || 'Failed to review this ingest plan.');
    } finally {
      setReviewBusy('');
    }
  };
  return (
    <div className="wiki-workspace-ingest-card" aria-label="Source ripple result">
      <header>
        <span className="wiki-index__eyebrow">Source ripple</span>
        <strong>{sourceTitle(source)}</strong>
      </header>
      <p>{summarizeIngestRun(run)}</p>
      {candidateRows.length ? (
        <section className="wiki-workspace-ingest-card__plan" aria-label="Candidate update plan">
          <span>Candidate update plan</span>
          <ol>
            {candidateRows.slice(0, 6).map((row) => {
              const destination = ingestCandidateDestination(row);
              const graphTraceLabel = ingestCandidateGraphTraceLabel(row, source);
              return (
                <li key={row.id}>
                  <label className="wiki-workspace-ingest-card__candidate-check">
                    <input
                      type="checkbox"
                      checked={selectedCandidateIds.includes(row.id)}
                      onChange={() => toggleCandidate(row.id)}
                      aria-label={`Select update for ${row.title}`}
                    />
                    <span>{row.status || 'candidate'}</span>
                  </label>
                  <div>
                    <strong>{row.title}</strong>
                    <p>{row.reason}</p>
                    <small>{row.confidence} · provenance: {ingestCandidateProvenanceLabel(row, source)}</small>
                    {graphTraceLabel ? (
                      <span className="wiki-workspace-ingest-card__trace">{graphTraceLabel}</span>
                    ) : null}
                  </div>
                  {destination?.type === 'wiki' ? (
                    <button type="button" onClick={() => onNavigate?.(destination.onNavigate)}>
                      {destination.label}
                    </button>
                  ) : null}
                  {destination?.type === 'think' ? (
                    <Link to={destination.path}>{destination.label}</Link>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : affectedPageIds.length ? (
        <ol>
          {affectedPageIds.slice(0, 6).map(pageId => (
            <li key={pageId}>
              <button type="button" onClick={() => onNavigate?.({ page: pageId })}>
                {pageTitleForId(pageId)}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="wiki-workspace-ingest-card__actions">
        {runId ? <Link to={ingestRunActivityPath(currentRun)}>Inspect activity</Link> : null}
        {suggestedCreatePage ? (
          <button
            type="button"
            disabled={building}
            onClick={async () => {
              setBuilding(true);
              if (!await onBuildFromSource?.(run)) setBuilding(false);
            }}
          >
            {building ? 'Building page…' : 'Build page from source'}
          </button>
        ) : null}
      </div>
      {runId ? (
        <section className="wiki-workspace-ingest-card__review" aria-label="Review ingest plan">
          <span>Plan status: {reviewLabel}</span>
          <div>
            <button type="button" onClick={() => handleReview('accept')} disabled={Boolean(reviewBusy)}>
              {reviewBusy === 'accept' ? 'Accepting...' : 'Accept'}
            </button>
            <button type="button" onClick={() => handleReview('defer')} disabled={Boolean(reviewBusy)}>
              {reviewBusy === 'defer' ? 'Deferring...' : 'Defer'}
            </button>
            <button type="button" onClick={() => handleReview('reject')} disabled={Boolean(reviewBusy)}>
              {reviewBusy === 'reject' ? 'Rejecting...' : 'Reject'}
            </button>
          </div>
          {reviewError ? <p className="status-message error-message">{reviewError}</p> : null}
        </section>
      ) : null}
    </div>
  );
};

const WikiWorkspace = () => {
  useDocumentTitle('Wiki');
  const location = useLocation();
  const navigate = useNavigate();
  const systemStatus = useSystemStatusControls();
  const [busy, setBusy] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [streamedWikiPage, setStreamedWikiPage] = useState(null);
  const [liveUpdate, setLiveUpdate] = useState(null);
  const [currentSearch, setCurrentSearch] = useState(location.search);
  const [showFirstVisitOnboarding, setShowFirstVisitOnboarding] = useState(false);
  const [autoBuildNotice, setAutoBuildNotice] = useState('');
  const [lastIngestRun, setLastIngestRun] = useState(null);
  const [qaFixtureState, setQaFixtureState] = useState({ status: 'idle', message: '' });
  const currentSearchRef = useRef(location.search);
  const lastSelectedPageRef = useRef('');
  const autoBuildRef = useRef(new Set());
  const buildInputRef = useRef(null);

  const params = useMemo(() => new URLSearchParams(currentSearch), [currentSearch]);
  const selectedPageId = clean(params.get('page'));
  const qaMode = clean(params.get('qa'));
  const pageMode = clean(params.get('mode')) === 'edit' ? 'edit' : 'read';
  const explicitView = clean(params.get('view'));
  const shouldAutoBuild = params.get('build') === '1';
  const view = selectedPageId ? 'page' : explicitView || 'graph';

  useEffect(() => {
    if (location.search === currentSearchRef.current) return;
    currentSearchRef.current = location.search;
    setCurrentSearch(location.search);
  }, [location.search]);

  useEffect(() => {
    if (selectedPageId) lastSelectedPageRef.current = selectedPageId;
  }, [selectedPageId]);

  useEffect(() => {
    setStreamedWikiPage((current) => {
      if (!current) return null;
      const streamedPageId = clean(current._id || current.id);
      return streamedPageId && streamedPageId === selectedPageId ? current : null;
    });
  }, [selectedPageId]);

  /* Every build streams through here: a page opened with build=1 is drafted
     from its sources while the reader watches it fill. */
  const buildPage = useCallback((pageId) => {
    autoBuildRef.current.delete(pageId);
    navigate(`${viewPathFor({ page: pageId })}&build=1`);
  }, [navigate]);

  useEffect(() => {
    if (
      !selectedPageId
      || !shouldAutoBuild
      || autoBuildRef.current.has(selectedPageId)
      || activeAutoBuildPageIds.has(selectedPageId)
    ) return undefined;
    autoBuildRef.current.add(selectedPageId);
    activeAutoBuildPageIds.add(selectedPageId);
    setAutoBuildNotice('');
    const nextParams = new URLSearchParams(currentSearchRef.current || currentSearch || location.search || '');
    nextParams.delete('build');
    const nextSearch = `?${nextParams.toString()}`;
    currentSearchRef.current = nextSearch;
    setCurrentSearch(nextSearch);
    navigate(`/wiki/workspace${nextSearch}`, { replace: true });
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({ label: 'Building wiki page', stage: 'Drafting from sources' });
    setBusy(true);
    let autoBuildDone = null;
    withMaintenanceTimeout(streamMaintainWikiPage(selectedPageId, {}, {
      onPage: (page, event = {}) => {
        if (lastSelectedPageRef.current !== selectedPageId) return;
        if (page) setStreamedWikiPage(page);
        const anchorId = clean(event.anchorId || event.sectionId || event.changedSectionId);
        if (anchorId) setLiveUpdate({ anchorId, pageId: selectedPageId, at: Date.now() });
      },
      onDone: (payload) => {
        autoBuildDone = payload;
      }
    }), selectedPageId).then(async () => {
      if (lastSelectedPageRef.current !== selectedPageId) return;
      if (autoBuildDone?.code === 'WIKI_FIRST_HEAD_AWAITING_ACCEPTANCE') {
        setAutoBuildNotice('The first research candidate is ready. Review and explicitly accept or reject it below.');
        systemStatus.setLatestReceipt({
          title: 'First research head needs review.',
          summary: 'The candidate is private and has not replaced the trusted page.',
          status: 'needs_review',
          href: `/wiki/workspace?page=${encodeURIComponent(selectedPageId)}`
        });
      } else {
        await verifyPersistedWikiBuild(selectedPageId);
        systemStatus.setLatestReceipt(wikiBuildSystemReceipt({ pageId: selectedPageId }));
      }
    }).catch((error) => {
      if (lastSelectedPageRef.current === selectedPageId) {
        const message = error?.message
          || 'The build was interrupted partway. Resume it to continue from saved SEC evidence.';
        setAutoBuildNotice(message);
        if (error?.retryable === false) {
          systemStatus.setLatestReceipt({
            title: 'Wiki build needs better evidence',
            summary: message,
            status: 'needs_review',
            href: `/wiki/workspace?page=${encodeURIComponent(selectedPageId)}`
          });
        } else {
          systemStatus.setRecoverableFailure({
            stage: 'Wiki build',
            message,
            retryable: true,
            retry: () => buildPage(selectedPageId)
          });
        }
      }
    }).finally(() => {
      activeAutoBuildPageIds.delete(selectedPageId);
      systemStatus.setBackgroundWork(null);
      if (lastSelectedPageRef.current === selectedPageId) {
        setBusy(false);
        setRefreshNonce(value => value + 1);
      }
    });
    return undefined;
  }, [buildPage, currentSearch, location.search, navigate, selectedPageId, shouldAutoBuild, systemStatus]);

  useEffect(() => {
    if (hasSeenFirstVisitOnboarding() || selectedPageId) {
      setShowFirstVisitOnboarding(false);
      return undefined;
    }
    let cancelled = false;
    // This asks one question — does this account have any page at all — and
    // reads nothing but the length of the answer. Whole documents were being
    // fetched to count them.
    listWikiPages({ limit: 1, summary: 1 })
      .then((pages = []) => {
        if (cancelled) return;
        setShowFirstVisitOnboarding(!Array.isArray(pages) || pages.length === 0);
      })
      .catch(() => {
        if (!cancelled) setShowFirstVisitOnboarding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPageId]);

  useEffect(() => {
    if (selectedPageId || explicitView) return;
    const target = { view: 'graph' };
    const targetSearch = searchFor(target);
    startWikiViewTransition(() => {
      currentSearchRef.current = targetSearch;
      setCurrentSearch(targetSearch);
      navigate(viewPathFor(target), { replace: true });
    });
  }, [explicitView, navigate, selectedPageId]);

  const onNavigate = useCallback(({ page = '', view: nextView = '', mode = '' } = {}) => {
    if (selectedPageId) lastSelectedPageRef.current = selectedPageId;
    const target = { page, view: nextView || 'graph', mode };
    const targetSearch = searchFor(target);
    startWikiViewTransition(() => {
      currentSearchRef.current = targetSearch;
      setCurrentSearch(targetSearch);
      navigate(viewPathFor(target));
    });
  }, [navigate, selectedPageId]);

  const enterPageEditMode = useCallback((pageId = selectedPageId) => {
    const nextPageId = clean(pageId);
    if (!nextPageId) return;
    trackWikiEditModeEntered({ pageId: nextPageId, source: 'wiki_workspace' });
    onNavigate({ page: nextPageId, mode: 'edit' });
  }, [onNavigate, selectedPageId]);

  const exitPageEditMode = useCallback(() => {
    if (!selectedPageId) return;
    onNavigate({ page: selectedPageId });
    setRefreshNonce(value => value + 1);
  }, [onNavigate, selectedPageId]);

  const feedSourceToWiki = useCallback(async (article = {}) => {
    const articleId = clean(article._id || article.id);
    const url = clean(article.url);
    if (!articleId && !url) return;
    const source = articleId
      ? {
          type: 'article',
          objectId: articleId,
          title: clean(article.title || article.url),
          summary: clean(article.summary || article.description || article.excerpt || article.text),
          url
        }
      : { type: 'url', url };
    systemStatus.clearRecoverableFailure();
    systemStatus.setBackgroundWork({ label: 'Ingesting source', stage: `Reading ${sourceTitle(source)}` });
    try {
      const run = await waitForIngestCompletion(await ingestWikiSource(source));
      setLastIngestRun({ ...run, candidateUpdates: ingestCandidateRows(run) });
      systemStatus.setLatestReceipt(wikiIngestSystemReceipt(run));
    } catch (_error) {
      systemStatus.setRecoverableFailure({ stage: 'Source ingest', message: 'Source ingest failed.', retryable: false });
    } finally {
      systemStatus.setBackgroundWork(null);
    }
  }, [systemStatus]);

  const buildPageFromIngestRun = useCallback(async (run = {}) => {
    const source = sourceRefFromIngestRun(run);
    const title = clean(run.suggestedTitle || run.title || source.title || source.url || 'New wiki page');
    try {
      const page = await createWikiPage(buildWikiCreatePayload({
        type: 'sources',
        title,
        text: clean(run.summary || source.snippet || title),
        pageType: 'overview',
        source
      }));
      const pageId = clean(page?._id || page?.id);
      if (!pageId) throw new Error('Created page did not include an id.');
      buildPage(pageId);
      return pageId;
    } catch (_error) {
      systemStatus.setRecoverableFailure({ stage: 'Wiki build', message: 'The page could not be created from this source.', retryable: false });
      return '';
    }
  }, [buildPage, systemStatus]);

  const focusBuild = useCallback(() => {
    buildInputRef.current?.focus?.();
  }, []);

  const dismissFirstVisitOnboarding = useCallback(() => {
    try {
      window.localStorage?.setItem?.(FIRST_VISIT_SEEN_KEY, 'true');
    } catch (_error) {
      // localStorage can be unavailable in private or embedded contexts; dismiss in memory.
    }
    setShowFirstVisitOnboarding(false);
  }, []);

  const openSources = useCallback(() => onNavigate({ view: 'sources' }), [onNavigate]);

  const showQaFixtureControls = process.env.NODE_ENV !== 'production' && Boolean(qaMode);

  const createQaSourceFixture = useCallback(async () => {
    setQaFixtureState({ status: 'loading', message: 'Creating seeded Library source provenance fixture...' });
    try {
      const result = await createLibrarySourceProvenanceFixture();
      const fixture = result?.fixture || {};
      const wikiPath = clean(fixture.wikiPath);
      const libraryPath = clean(fixture.libraryPath);
      const questionPath = clean(fixture.questionPath);
      setQaFixtureState({
        status: 'ready',
        message: `Seeded ${fixture.articleTitle || 'Library source'} -> ${fixture.wikiTitle || 'wiki page'}.`
      });
      if (qaMode === 'question-evidence' && questionPath) {
        navigate(questionPath);
        return;
      }
      if (wikiPath) {
        navigate(wikiPath);
        return;
      }
      if (questionPath) {
        navigate(questionPath);
        return;
      }
      if (libraryPath) navigate(libraryPath);
    } catch (error) {
      setQaFixtureState({
        status: 'error',
        message: error?.response?.data?.error || error?.message || 'Failed to create seeded source fixture.'
      });
    }
  }, [navigate, qaMode]);

  const canvas = useMemo(() => {
    if (selectedPageId) {
      if (pageMode === 'edit') {
        return (
          <div className="wiki-workspace__page-shell wiki-workspace__page-shell--editing">
            <WikiPageEditor
              key={`${selectedPageId}:edit`}
              pageId={selectedPageId}
              workspaceMode
              onDoneEditing={exitPageEditMode}
            />
          </div>
        );
      }
      return (
        <div className="wiki-workspace__page-shell">
          <WikiPageReadView
            pageId={selectedPageId}
            workspaceMode
            refreshNonce={refreshNonce}
            liveUpdate={liveUpdate}
            streamedPage={streamedWikiPage}
            streamBusy={busy}
            onEdit={() => enterPageEditMode(selectedPageId)}
          />
        </div>
      );
    }
    if (view === 'activity') return <WorkspaceActivity onNavigate={onNavigate} />;
    if (view === 'list') {
      return (
        <main className="wiki-workspace__list-main" aria-label="Wiki pages">
          <h1 className="sr-only">Wiki pages</h1>
          <WikiList compact onOpenPage={(pageId) => onNavigate({ page: pageId })} />
        </main>
      );
    }
    if (view === 'sources') return <WorkspaceSources onFeedSource={feedSourceToWiki} />;
    if (view === 'schema') return <WorkspaceSchema />;
    return (
      <Suspense fallback={<WorkspacePaneFallback label="Loading knowledge map..." />}>
        <WikiIndex
          onOpenPage={(pageId) => onNavigate({ page: pageId })}
          onOpenList={() => onNavigate({ view: 'list' })}
          onBuildPage={focusBuild}
          onOpenSources={openSources}
        />
      </Suspense>
    );
  }, [busy, enterPageEditMode, exitPageEditMode, feedSourceToWiki, focusBuild, liveUpdate, onNavigate, openSources, pageMode, refreshNonce, selectedPageId, streamedWikiPage, view]);

  return (
    <section className="wiki-workspace" aria-label="Wiki workspace">
      {!selectedPageId ? <WikiWorkspaceSurface view={view} /> : null}
      <section className="wiki-workspace__right-pane" aria-label="Wiki workspace canvas">
        {showQaFixtureControls ? (
          <section className="wiki-workspace__qa-fixture" aria-label="QA source provenance fixture">
            <div>
              <p className="wiki-workspace__qa-fixture-kicker">QA fixture</p>
              <p className="wiki-workspace__qa-fixture-title">Seed Library source provenance</p>
              {qaFixtureState.message ? (
                <p className={`wiki-workspace__qa-fixture-message is-${qaFixtureState.status}`}>
                  {qaFixtureState.message}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={createQaSourceFixture}
              disabled={qaFixtureState.status === 'loading'}
            >
              {qaFixtureState.status === 'loading' ? 'Seeding' : 'Seed source'}
            </Button>
          </section>
        ) : null}
        {!selectedPageId ? (
          <WikiBuildPageComposer compact className="wiki-workspace__build" inputRef={buildInputRef} />
        ) : null}
        {autoBuildNotice ? (
          <div className="wiki-workspace__build-notice" role="alert">
            {autoBuildNotice}
          </div>
        ) : null}
        {lastIngestRun ? (
          <WikiIngestResultCard
            run={lastIngestRun}
            onNavigate={onNavigate}
            onBuildFromSource={buildPageFromIngestRun}
            onReviewUpdate={run => setLastIngestRun({ ...run, candidateUpdates: ingestCandidateRows(run) })}
          />
        ) : null}
        {canvas}
      </section>
      {showFirstVisitOnboarding ? (
        <section className="wiki-workspace-onboarding" aria-labelledby="wiki-workspace-onboarding-title">
          <div className="wiki-workspace-onboarding__panel">
            <div className="wiki-workspace-onboarding__copy">
              <p className="wiki-index__eyebrow">First visit</p>
              <h1 id="wiki-workspace-onboarding-title">Start the wiki with one page or one source.</h1>
              <p>
                Build a page from a topic, or feed a Library source and let the wiki decide what should change.
                {` ${AGENT_DISPLAY_NAME}`} answers questions about any of it with ⌘J.
              </p>
            </div>
            <div className="wiki-workspace-onboarding__actions">
              <Button type="button" variant="primary" onClick={() => { dismissFirstVisitOnboarding(); focusBuild(); }}>Build page</Button>
              <Button type="button" onClick={() => { dismissFirstVisitOnboarding(); openSources(); }}>Feed a source</Button>
            </div>
            <button
              type="button"
              className="wiki-workspace-onboarding__skip"
              onClick={dismissFirstVisitOnboarding}
            >
              Skip for now
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
};

export default WikiWorkspace;
