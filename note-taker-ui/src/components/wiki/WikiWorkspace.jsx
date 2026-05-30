import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { streamChatWithAgent } from '../../api/agent';
import { getArticles } from '../../api/articles';
import {
  createWikiPage,
  getWikiPage,
  getWikiSchema,
  ingestWikiSource,
  listWikiActivity,
  listWikiPages,
  acceptWikiLintFinding,
  fixWikiLintFinding,
  ignoreWikiLintFinding,
  saveWikiSchema,
  streamLintWiki,
  streamMaintainWikiPage
} from '../../api/wiki';
import { buildWikiCreatePayload } from '../../utils/wikiCreate';
import { trackWikiEditModeEntered } from '../../utils/wikiAnalytics';
import { Button } from '../ui';
import WikiList from './WikiList';
import WikiPageEditor from './WikiPageEditor';
import WikiPageReadView from './WikiPageReadView';
import {
  diffClaimLedgerSnapshots,
  diffClaimSnapshots,
  extractClaimTexts,
  getLastVisitState,
  recordVisit
} from './wikiVisitTracker';

const LAST_PAGE_KEY = 'noeis.wiki.workspace.last_page_id';
const CHAT_WIDTH_KEY = 'noeis.wiki.workspace.chat_width';
const FIRST_VISIT_SEEN_KEY = 'noeis.wiki.first_visit_seen';
const DEFAULT_CHAT_WIDTH = 260;
const LEGACY_DEFAULT_CHAT_WIDTH = 380;
const MIN_CHAT_WIDTH = 260;
const MAX_CHAT_WIDTH = 420;
const HEALTH_KEYS = [
  'newItems',
  'unsupportedClaims',
  'missingCitations',
  'staleSections',
  'contradictions'
];

const WikiIndex = lazy(() => import('./WikiIndex'));

const WorkspacePaneFallback = ({ label = 'Loading Wiki pane...' }) => (
  <p className="wiki-index__status">{label}</p>
);

const scheduleAfterFirstPaint = (callback) => {
  let frame = 0;
  let idle = 0;
  let timeout = 0;
  const run = () => {
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(callback, { timeout: 250 });
      return;
    }
    timeout = window.setTimeout(callback, 0);
  };
  if (typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(run);
  else timeout = window.setTimeout(callback, 0);
  return () => {
    if (frame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
    if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    if (timeout) window.clearTimeout(timeout);
  };
};

const clean = (value = '') => String(value || '').trim();

const messageId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MONGO_ID_RE = /\b[a-f0-9]{24}\b/gi;

const paragraphEditedUpdateFromStream = (event = '', payload = {}, fallbackPageId = '') => {
  const typeCandidates = [event, payload?.type, payload?.stage, payload?.action, payload?.kind]
    .map(value => clean(value).toLowerCase())
    .filter(Boolean);
  if (!typeCandidates.includes('paragraph_edited')) return null;
  const anchorId = clean(payload?.anchorId || payload?.anchor_id || payload?.paragraphAnchorId || payload?.blockId || payload?.id);
  if (!anchorId) return null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pageId: clean(payload?.pageId || payload?.page_id || fallbackPageId),
    anchorId,
    payload
  };
};

const wikiPageLabel = (page, fallback = 'this wiki page') => (
  clean(page?.title) || clean(page?.name) || fallback
);

const wikiTitleFromId = (pageId, pages = [], currentPage = null) => {
  const id = clean(pageId);
  if (!id) return '';
  const match = [currentPage, ...(Array.isArray(pages) ? pages : [])]
    .find(page => clean(page?._id || page?.id) === id);
  return wikiPageLabel(match, '');
};

const displayWikiRef = (pageId, pages = [], currentPage = null) => {
  const title = wikiTitleFromId(pageId, pages, currentPage);
  return title ? `[[${title}]]` : 'this wiki page';
};

const scrubRawWikiIds = (value = '', pages = [], currentPage = null) => String(value || '')
  .replace(/@wiki:([a-f0-9]{24})\b/gi, (_match, pageId) => displayWikiRef(pageId, pages, currentPage))
  .replace(MONGO_ID_RE, 'this wiki page');

const COMMANDS = [
  {
    verb: 'draft',
    template: '/draft @wiki:',
    label: 'Draft page',
    hint: 'Run wiki maintenance for a page in the right pane.'
  },
  {
    verb: 'build',
    template: '/build ',
    label: 'Build new page',
    hint: 'Create a new overview page and draft it with the wiki agent.'
  },
  {
    verb: 'page',
    template: '/page @wiki:',
    label: 'Open page',
    hint: 'Route a wiki page into the workspace.'
  },
  {
    verb: 'sources',
    template: '/sources',
    label: 'Library sources',
    hint: 'Browse Library sources on the right.'
  },
  {
    verb: 'graph',
    template: '/graph',
    label: 'Knowledge map',
    hint: 'Open the wiki graph.'
  },
  {
    verb: 'activity',
    template: '/activity',
    label: 'Activity',
    hint: 'Open the wiki activity log.'
  },
  {
    verb: 'schema',
    template: '/schema',
    label: 'Schema',
    hint: 'Edit wiki conventions.'
  },
  {
    verb: 'ingest',
    template: '/ingest https://',
    label: 'Ingest URL',
    hint: 'Feed a source URL to the wiki.'
  },
  {
    verb: 'lint',
    template: '/lint',
    label: 'Lint wiki',
    hint: 'Scan for contradictions, stale pages, missing links, and gaps.'
  },
  {
    verb: 'help',
    template: '/help',
    label: 'Help',
    hint: 'Show available wiki chat commands.'
  }
];

const commandMatches = (input = '') => {
  const text = clean(input);
  if (!text.startsWith('/')) return [];
  const rawQuery = text.slice(1);
  if (/\s/.test(rawQuery)) return [];
  const query = rawQuery.toLowerCase();
  return COMMANDS.filter(command => (
    !query
    || command.verb.startsWith(query)
    || command.label.toLowerCase().startsWith(query)
  )).slice(0, 6);
};

const toWorkspaceThreadMessages = (thread = null) => {
  const rows = Array.isArray(thread?.messages) ? thread.messages : [];
  return rows
    .map((message) => ({
      id: message._id || message.id || messageId(message.role || 'thread'),
      role: message.role === 'user' ? 'user' : 'assistant',
      text: clean(message.text || message.content || ''),
      activityReceipts: Array.isArray(message.metadata?.activityReceipts) ? message.metadata.activityReceipts : [],
      createdAt: message.createdAt || new Date().toISOString()
    }))
    .filter(message => message.text);
};

const parseCommand = (value = '') => {
  const text = clean(value);
  if (!text.startsWith('/')) return null;
  const [verbToken, ...rest] = text.slice(1).split(/\s+/);
  return {
    verb: clean(verbToken).toLowerCase(),
    args: rest.join(' ').trim()
  };
};

const parseWikiRef = (value = '') => {
  const match = String(value || '').match(/@wiki:([^\s]+)/i);
  return clean(match?.[1]);
};

const trimReferenceToken = (value = '') => clean(value).replace(/[),.;:!?]+$/g, '');

const referenceKey = (type, id) => `${type}:${id}`;

const labelForReference = ({ type = '', id = '', title = '' } = {}) => {
  const safeType = clean(type).toLowerCase();
  const safeTitle = clean(title);
  const safeId = clean(id);
  return `@${safeType}:${safeTitle || safeId}`;
};

const mergeContextReferences = (current = [], additions = []) => {
  const byKey = new Map();
  current.forEach((reference) => {
    if (reference?.key) byKey.set(reference.key, reference);
  });
  additions.forEach((reference) => {
    if (!reference?.key) return;
    byKey.set(reference.key, {
      ...reference,
      label: reference.label || labelForReference(reference)
    });
  });
  return Array.from(byKey.values());
};

const referencesFromText = (text = '', { pages = [], articles = [] } = {}) => {
  const references = [];
  const pageById = new Map((pages || []).map(page => [clean(page?._id || page?.id), page]));
  const articleById = new Map((articles || []).map(article => [clean(article?._id || article?.id), article]));
  String(text || '').replace(/@wiki:([^\s]+)/gi, (_match, rawId) => {
    const id = trimReferenceToken(rawId);
    if (!id) return _match;
    const page = pageById.get(id);
    references.push({
      key: referenceKey('wiki', id),
      type: 'wiki',
      id,
      title: clean(page?.title),
      label: labelForReference({ type: 'wiki', id, title: page?.title })
    });
    return _match;
  });
  String(text || '').replace(/@article:([^\s]+)/gi, (_match, rawId) => {
    const id = trimReferenceToken(rawId);
    if (!id) return _match;
    const article = articleById.get(id);
    references.push({
      key: referenceKey('article', id),
      type: 'article',
      id,
      title: clean(article?.title || article?.url),
      url: clean(article?.url),
      label: labelForReference({ type: 'article', id, title: article?.title || article?.url })
    });
    return _match;
  });
  return mergeContextReferences([], references);
};

const parseUrl = (value = '') => {
  const match = String(value || '').match(/https?:\/\/\S+/i);
  return clean(match?.[0]);
};

const countPendingSignals = (aiState = {}) => {
  const health = aiState?.health || {};
  return HEALTH_KEYS.reduce((total, key) => {
    const rows = Array.isArray(health[key]) ? health[key] : [];
    return total + rows.length;
  }, 0);
};

const workspaceAgentStatus = ({ busy = false, reading = false, pageId = '', page = null } = {}) => {
  const pageLabel = clean(page?.title) || (pageId ? 'this wiki page' : 'this page');
  if (busy) {
    return {
      status: 'working',
      text: pageId ? `Agent updating ${pageLabel}...` : 'Agent is working...'
    };
  }
  if (reading && pageId) {
    return {
      status: 'reading',
      text: `Agent is reading ${pageLabel}...`
    };
  }
  const aiState = page?.aiState || {};
  if (aiState.lastError) {
    return { status: 'error', text: 'Last agent run failed.' };
  }
  const signalCount = countPendingSignals(aiState);
  if (signalCount > 0) {
    return {
      status: 'ready',
      text: `${signalCount} review item${signalCount === 1 ? '' : 's'} for ${pageLabel}.`
    };
  }
  if (pageId) {
    return { status: 'idle', text: `Agent ready for ${pageLabel}.` };
  }
  return { status: 'idle', text: 'Agent ready.' };
};

const formatWorkspaceVisitDiff = ({ page = {}, lastVisit = null, diff = {} } = {}) => {
  const addedCount = Array.isArray(diff.added) ? diff.added.length : 0;
  const removedCount = Array.isArray(diff.removed) ? diff.removed.length : 0;
  const changedCount = Array.isArray(diff.changed) ? diff.changed.length : 0;
  const total = addedCount + removedCount + changedCount;
  if (!lastVisit?.lastViewedAt || total === 0) return '';
  const reviewed = new Date(lastVisit.lastViewedAt);
  const reviewedLabel = Number.isNaN(reviewed.getTime())
    ? 'your last review'
    : reviewed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const parts = [
    addedCount ? `${addedCount} new claim${addedCount === 1 ? '' : 's'}` : '',
    changedCount ? `${changedCount} changed claim${changedCount === 1 ? '' : 's'}` : '',
    removedCount ? `${removedCount} removed claim${removedCount === 1 ? '' : 's'}` : ''
  ].filter(Boolean);
  return `${page.title || 'This page'} changed since ${reviewedLabel}: ${parts.join(', ')}.`;
};

const lintCount = (run = {}, key = '') => (
  Array.isArray(run?.findings?.[key]) ? run.findings[key].length : 0
);

const formatLintSummary = (run = {}) => {
  const rows = [
    ['contradictions', lintCount(run, 'contradictions')],
    ['stale', lintCount(run, 'stale')],
    ['orphans', lintCount(run, 'orphans')],
    ['missing pages', lintCount(run, 'missingPages')],
    ['missing links', lintCount(run, 'missingLinks')],
    ['gaps', lintCount(run, 'gaps')]
  ];
  const nonZero = rows.filter(([, count]) => count > 0);
  if (!nonZero.length) return run.summary || 'Wiki lint found no immediate structural issues.';
  const headline = run.summary || `Wiki lint found ${nonZero.reduce((sum, [, count]) => sum + count, 0)} issues.`;
  const topFindings = Object.values(run.findings || {})
    .flat()
    .slice(0, 5)
    .map(finding => `- ${finding.pageTitle ? `${finding.pageTitle}: ` : ''}${finding.title || finding.type}${finding.summary ? ` — ${finding.summary}` : ''}`)
    .join('\n');
  return `${headline}\n${nonZero.map(([label, count]) => `${count} ${label}`).join(' · ')}${topFindings ? `\n\n${topFindings}` : ''}`;
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

const normalizePane = (value = '') => {
  const pane = clean(value).toLowerCase();
  return pane === 'chat' || pane === 'wiki' ? pane : '';
};

const viewPathFor = ({ view = 'graph', page = '', mode = '', pane = '' } = {}) => {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  else params.set('view', view);
  if (page && mode && mode !== 'read') params.set('mode', mode);
  const normalizedPane = normalizePane(pane);
  if (normalizedPane) params.set('pane', normalizedPane);
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

const initialChatWidth = () => {
  const saved = Number(window.localStorage?.getItem(CHAT_WIDTH_KEY));
  if (!saved || saved === LEGACY_DEFAULT_CHAT_WIDTH) return DEFAULT_CHAT_WIDTH;
  const responsiveMax = typeof window !== 'undefined' && window.innerWidth <= 1360
    ? DEFAULT_CHAT_WIDTH
    : MAX_CHAT_WIDTH;
  return Math.max(MIN_CHAT_WIDTH, Math.min(responsiveMax, saved));
};

const hasSeenFirstVisitOnboarding = () => {
  try {
    return window.localStorage?.getItem?.(FIRST_VISIT_SEEN_KEY) === 'true';
  } catch (_error) {
    return true;
  }
};

const WorkspaceSources = ({ onUseSource }) => {
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
            <button type="button" onClick={() => onUseSource?.(article)}>
              Use in chat
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};

const WorkspaceActivity = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

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
      </header>
      {loading ? <p className="wiki-index__status">Loading activity...</p> : null}
      <ol>
        {events.map(event => (
          <li key={event.id || `${event.type}-${event.at}`}>
            <strong>{event.title || 'Wiki activity'}</strong>
            {event.summary ? <p>{event.summary}</p> : null}
            {event.pageId ? <Link to={viewPathFor({ page: event.pageId })}>Open page</Link> : null}
          </li>
        ))}
      </ol>
    </section>
  );
};

const WorkspaceSchema = () => {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    getWikiSchema()
      .then(result => {
        if (!cancelled) setContent(result?.content || '');
      })
      .catch(() => {
        if (!cancelled) setStatus('Failed to load schema.');
      });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setStatus('Saving...');
    try {
      const result = await saveWikiSchema(content);
      setContent(result?.content || content);
      setStatus('Schema saved.');
    } catch (_error) {
      setStatus('Failed to save schema.');
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
        <Button type="button" onClick={handleSave}>Save schema</Button>
        {status ? <span role="status">{status}</span> : null}
      </div>
    </section>
  );
};

const WikiLintResultCard = ({ run, onNavigate, onPageChanged, onAppend }) => {
  const [currentRun, setCurrentRun] = useState(run || {});
  const [busyFinding, setBusyFinding] = useState('');
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
      if (result?.page?._id || result?.page?.id) {
        const pageId = clean(result.page._id || result.page.id);
        onPageChanged?.(pageId);
        onNavigate?.({ page: pageId });
      }
      onAppend?.({
        role: 'assistant',
        text: `${actionLabel(action, finding)} complete for ${finding.title || finding.type}.`
      });
    } catch (_error) {
      onAppend?.({
        role: 'assistant',
        text: `${actionLabel(action, finding)} failed for ${finding.title || finding.type}.`
      });
    } finally {
      setBusyFinding('');
    }
  };

  return (
    <div className="wiki-workspace-lint-card">
      <header>
        <strong>Wiki lint</strong>
        <span>{currentRun.summary || 'Structural scan complete.'}</span>
      </header>
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

const WikiWorkspaceVisitCard = ({ notice = {}, onNavigate, onReviewed }) => {
  const diff = notice.diff || {};
  const rows = [
    ['New', diff.added || []],
    ['Changed', diff.changed || []],
    ['Removed', diff.removed || []]
  ].filter(([, items]) => Array.isArray(items) && items.length);
  if (!rows.length) return null;
  return (
    <div className="wiki-workspace-visit-card" aria-label="Page changes since last review">
      {rows.map(([label, items]) => (
        <div key={label}>
          <strong>{label}</strong>
          <ul>
            {items.slice(0, 3).map((item, index) => (
              <li key={`${label}-${index}`}>
                {typeof item === 'string' ? item : item?.text || label.toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="wiki-workspace-visit-card__actions">
        <button type="button" onClick={() => onNavigate?.({ page: notice.pageId })}>Open page</button>
        <button type="button" onClick={() => onReviewed?.(notice)}>Mark reviewed</button>
      </div>
    </div>
  );
};

const renderInlineMarkdown = (text = '', keyPrefix = 'inline') => {
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\[\[[^\]]+\]\]|\*\*[^*]+\*\*|`[^`]+`|\[(?:\d+\s*,\s*)*\d+\])/g;
  return String(text || '').split(pattern).filter(part => part !== '').map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    const wiki = part.match(/^\[\[([^\]]+)\]\]$/);
    if (wiki) return <span key={key} className="wiki-workspace-chat__wiki-link">{wiki[1]}</span>;
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={key}>{bold[1]}</strong>;
    const code = part.match(/^`([^`]+)`$/);
    if (code) return <code key={key}>{code[1]}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    }
    const citation = part.match(/^\[((?:\d+\s*,\s*)*\d+)\]$/);
    if (citation) {
      const indexes = citation[1]
        .split(',')
        .map(value => Number(value.trim()))
        .filter(value => Number.isInteger(value) && value > 0);
      if (indexes.length) {
        return (
          <span key={key} className="wiki-workspace-chat__citations" aria-label="Citations">
            {indexes.map(sourceIndex => (
              <a
                key={sourceIndex}
                className="wiki-workspace-chat__citation"
                href={`#wiki-ref-${sourceIndex}`}
                aria-label={`Citation ${sourceIndex}`}
              >
                [{sourceIndex}]
              </a>
            ))}
          </span>
        );
      }
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
};

const WikiChatMarkdown = ({ text = '', pages = [], currentPage = null }) => {
  const safeText = scrubRawWikiIds(text, pages, currentPage);
  const lines = safeText.split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (line.trim().startsWith('```')) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push(<pre key={`code-${index}`}><code>{codeLines.join('\n')}</code></pre>);
      continue;
    }
    if (/^\s*\|.+\|\s*$/.test(line) && /^\s*\|?[\s:-]+\|/.test(lines[index + 1] || '')) {
      const tableRows = [];
      while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
        if (!/^\s*\|?[\s:-]+\|\s*$/.test(lines[index])) {
          tableRows.push(lines[index].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
        }
        index += 1;
      }
      index -= 1;
      const [head = [], ...body] = tableRows;
      blocks.push(
        <table key={`table-${index}`}>
          <thead><tr>{head.map((cell, cellIndex) => <th key={cellIndex}>{renderInlineMarkdown(cell, `th-${index}-${cellIndex}`)}</th>)}</tr></thead>
          <tbody>{body.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(cell, `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>
          ))}</tbody>
        </table>
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      index -= 1;
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `li-${index}-${itemIndex}`)}</li>)}</ul>);
      continue;
    }
    blocks.push(<p key={`p-${index}`}>{renderInlineMarkdown(line, `p-${index}`)}</p>);
  }
  return <div className="wiki-workspace-chat__markdown">{blocks.length ? blocks : <p>{safeText}</p>}</div>;
};

const WikiWorkspaceChat = ({ selectedPageId, view, onNavigate, onPageChanged, onLiveUpdate, busy, setBusy, chatDraft, onBuildPage }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState('');
  const [threadTitle, setThreadTitle] = useState('');
  const [wikiPages, setWikiPages] = useState([]);
  const [wikiPagesRequested, setWikiPagesRequested] = useState(false);
  const [articles, setArticles] = useState([]);
  const [articlesRequested, setArticlesRequested] = useState(false);
  const [contextReferences, setContextReferences] = useState([]);
  const [slashHintSeen, setSlashHintSeen] = useState(false);
  const [referenceHintSeen, setReferenceHintSeen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [dismissedMentionInput, setDismissedMentionInput] = useState('');
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [selectedPagePresence, setSelectedPagePresence] = useState({ page: null, reading: false });
  const [ambientReady, setAmbientReady] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState('');
  const scrollRef = useRef(null);
  const streamAbortRef = useRef(null);
  const visitNoticeKeysRef = useRef(new Set());

  useEffect(() => scheduleAfterFirstPaint(() => setAmbientReady(true)), []);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!chatDraft?.text) return;
    setInput(chatDraft.text);
  }, [chatDraft]);

  useEffect(() => () => {
    streamAbortRef.current?.abort?.();
  }, []);

  const requestWikiPages = useCallback(() => {
    setWikiPagesRequested(true);
  }, []);

  const requestArticles = useCallback(() => {
    setArticlesRequested(true);
  }, []);

  useEffect(() => {
    if (!wikiPagesRequested) return undefined;
    let cancelled = false;
    listWikiPages({ limit: 30 })
      .then((pages) => {
        if (!cancelled) setWikiPages(Array.isArray(pages) ? pages : []);
      })
      .catch(() => {
        if (!cancelled) setWikiPages([]);
      });
    return () => { cancelled = true; };
  }, [wikiPagesRequested]);

  useEffect(() => {
    if (!articlesRequested) return undefined;
    let cancelled = false;
    getArticles({ limit: 30, sort: 'recent' })
      .then((items) => {
        if (!cancelled) setArticles(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setArticles([]);
      });
    return () => { cancelled = true; };
  }, [articlesRequested]);

  const append = useCallback((message) => {
    setMessages(current => [...current, { id: messageId(message.role), createdAt: new Date().toISOString(), ...message }]);
  }, []);
  const replaceMessage = useCallback((id, patch) => {
    setMessages(current => current.map(message => (
      message.id === id ? { ...message, ...patch } : message
    )));
  }, []);
  const appendReceipt = useCallback((id, receipt = {}) => {
    const text = clean(receipt.summary || receipt.text || receipt.message || receipt.title);
    if (!id || !text) return;
    const stage = clean(receipt.stage || receipt.type || 'activity');
    const key = clean(receipt.key) || `${stage}:${text}`;
    setMessages(current => current.map(message => {
      if (message.id !== id) return message;
      const receipts = Array.isArray(message.activityReceipts) ? message.activityReceipts : [];
      if (receipts.some(item => item.key === key)) return message;
      return {
        ...message,
        activityReceipts: [...receipts, { ...receipt, key, stage, summary: text }]
      };
    }));
  }, []);

  const handleStreamEvent = useCallback((event, payload = {}, fallbackPageId = selectedPageId) => {
    const update = paragraphEditedUpdateFromStream(event, payload, fallbackPageId);
    if (update) onLiveUpdate?.(update);
  }, [onLiveUpdate, selectedPageId]);

  useEffect(() => {
    if (!selectedPageId) {
      setSelectedPagePresence({ page: null, reading: false });
      return undefined;
    }
    let cancelled = false;
    setSelectedPagePresence(current => ({ page: current.page, reading: true }));
    getWikiPage(selectedPageId)
      .then((page) => {
        if (cancelled) return;
        setSelectedPagePresence({ page, reading: false });
        const lastVisit = getLastVisitState(selectedPageId);
        if (!lastVisit?.lastViewedAt) return;
        const diff = {
          ...diffClaimSnapshots(lastVisit.claimSnapshot, extractClaimTexts(page?.body)),
          changed: diffClaimLedgerSnapshots(lastVisit.ledgerSnapshot, page?.claims || [])
        };
        const text = formatWorkspaceVisitDiff({ page, lastVisit, diff });
        if (!text) return;
        const noticeKey = `${selectedPageId}:${page?.updatedAt || page?.aiState?.lastDraftedAt || text}`;
        if (visitNoticeKeysRef.current.has(noticeKey)) return;
        visitNoticeKeysRef.current.add(noticeKey);
        append({
          role: 'assistant',
          text,
          visitNotice: { pageId: selectedPageId, page, diff }
        });
      })
      .catch(() => {
        if (!cancelled) setSelectedPagePresence({ page: null, reading: false });
        // The page body still renders on the right; the chat notification is opportunistic.
      });
    return () => { cancelled = true; };
  }, [append, selectedPageId]);

  const handleVisitReviewed = useCallback((notice = {}) => {
    if (!notice.pageId || !notice.page) return;
    recordVisit(notice.pageId, notice.page.body, notice.page.claims || []);
    append({ role: 'assistant', text: `Marked @wiki:${notice.pageId} reviewed.` });
  }, [append]);

  const showCommands = commandMatches(input);
  useEffect(() => {
    setActiveCommandIndex(0);
  }, [input]);
  const showDiscoveryHint = !hintDismissed && !(slashHintSeen && referenceHintSeen);
  const agentStatus = workspaceAgentStatus({
    busy,
    reading: selectedPagePresence.reading,
    pageId: selectedPageId,
    page: selectedPagePresence.page
  });
  const wikiMentionQuery = useMemo(() => {
    const match = input.match(/@wiki:([^\s]*)$/i);
    return match ? clean(match[1]).toLowerCase() : '';
  }, [input]);
  const articleMentionQuery = useMemo(() => {
    const match = input.match(/@article:([^\s]*)$/i);
    return match ? clean(match[1]).toLowerCase() : '';
  }, [input]);
  const bareMentionQuery = useMemo(() => {
    const match = input.match(/(^|\s)@([^\s:@]*)$/i);
    if (!match || input.match(/@(wiki|article):[^\s]*$/i)) return '';
    return clean(match[2]).toLowerCase();
  }, [input]);
  const showWikiMentions = useMemo(() => {
    if (input === dismissedMentionInput) return [];
    if (!input.match(/@wiki:[^\s]*$/i) && !bareMentionQuery) return [];
    return wikiPages
      .filter(page => {
        const id = String(page._id || page.id || '').toLowerCase();
        const title = String(page.title || '').toLowerCase();
        const query = wikiMentionQuery || bareMentionQuery;
        return !query || id.includes(query) || title.includes(query);
      })
      .slice(0, 6);
  }, [bareMentionQuery, dismissedMentionInput, input, wikiMentionQuery, wikiPages]);
  const showArticleMentions = useMemo(() => {
    if (input === dismissedMentionInput) return [];
    if (!input.match(/@article:[^\s]*$/i) && !bareMentionQuery) return [];
    return articles
      .filter(article => {
        const id = String(article._id || article.id || '').toLowerCase();
        const title = String(article.title || '').toLowerCase();
        const url = String(article.url || '').toLowerCase();
        const query = articleMentionQuery || bareMentionQuery;
        return !query || id.includes(query) || title.includes(query) || url.includes(query);
      })
      .slice(0, 6);
  }, [articleMentionQuery, articles, bareMentionQuery, dismissedMentionInput, input]);

  const applyCommandTemplate = (template) => {
    setInput(template);
  };

  const applyWikiMention = (page) => {
    const pageId = clean(page?._id || page?.id);
    if (!pageId) return;
    setInput(current => {
      const next = current.match(/@wiki:[^\s]*$/i)
        ? current.replace(/@wiki:[^\s]*$/i, `@wiki:${pageId}`)
        : current.replace(/(^|\s)@[^\s:@]*$/i, `$1@wiki:${pageId}`);
      setDismissedMentionInput(next);
      return next;
    });
  };

  const applyArticleMention = (article) => {
    const articleId = clean(article?._id || article?.id);
    if (!articleId) return;
    setInput(current => {
      const next = current.match(/@article:[^\s]*$/i)
        ? current.replace(/@article:[^\s]*$/i, `@article:${articleId}`)
        : current.replace(/(^|\s)@[^\s:@]*$/i, `$1@article:${articleId}`);
      setDismissedMentionInput(next);
      return next;
    });
  };

  const removeContextReference = (key) => {
    setContextReferences(current => current.filter(reference => reference.key !== key));
  };

  const cancelActiveStream = useCallback(() => {
    streamAbortRef.current?.abort?.();
  }, []);

  useEffect(() => {
    if (!streamingMessageId) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelActiveStream();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelActiveStream, streamingMessageId]);

  const handleCommand = async (command) => {
    const pageRef = parseWikiRef(command.args) || selectedPageId;
    if (command.verb === 'graph') {
      onNavigate({ view: 'graph' });
      append({ role: 'assistant', text: 'Opened the wiki graph on the right.' });
      return true;
    }
    if (command.verb === 'activity') {
      onNavigate({ view: 'activity' });
      append({ role: 'assistant', text: 'Opened the wiki activity log on the right.' });
      return true;
    }
    if (command.verb === 'sources') {
      onNavigate({ view: 'sources' });
      append({ role: 'assistant', text: 'Opened the Library sources pane on the right.' });
      return true;
    }
    if (command.verb === 'schema') {
      onNavigate({ view: 'schema' });
      append({ role: 'assistant', text: 'Opened the wiki schema on the right.' });
      return true;
    }
    if (command.verb === 'page') {
      if (!pageRef) {
        append({ role: 'assistant', text: 'Add a wiki reference, for example /page @wiki:PAGE_ID.' });
        return true;
      }
      onNavigate({ page: pageRef });
      append({ role: 'assistant', text: `Opened @wiki:${pageRef} on the right.` });
      return true;
    }
    if (command.verb === 'build' || command.verb === 'create' || command.verb === 'new') {
      const topic = clean(command.args.replace(/@wiki:[^\s]+/gi, ''));
      if (!topic) {
        append({ role: 'assistant', text: 'Name the page to build, for example /build Portfolio Concentration.' });
        return true;
      }
      setBusy(true);
      try {
        const page = await createWikiPage(buildWikiCreatePayload({
          type: 'idea',
          title: topic,
          text: topic,
          pageType: 'overview'
        }));
        const pageId = clean(page?._id || page?.id);
        if (!pageId) throw new Error('Created page did not include an id.');
        onNavigate({ page: pageId });
        append({ role: 'assistant', text: `Created @wiki:${pageId} for "${topic}". Drafting it now.` });
        await streamMaintainWikiPage(pageId, {}, {
          onPage: () => {
            onNavigate({ page: pageId });
            onPageChanged?.(pageId);
          },
          onEvent: (event, payload = {}) => {
            handleStreamEvent(event, payload, pageId);
            if (event !== 'wiki-draft') return;
            if (payload.stage === 'quality_rebuild') {
              append({ role: 'assistant', text: 'The first draft missed quality gates, so I am rebuilding it once with stricter instructions.' });
            }
          }
        });
        onNavigate({ page: pageId });
        onPageChanged?.(pageId);
        append({ role: 'assistant', text: `Built @wiki:${pageId} for "${topic}".` });
      } catch (_error) {
        append({ role: 'assistant', text: `Failed to build a wiki page for "${topic}".` });
      } finally {
        setBusy(false);
      }
      return true;
    }
    if (command.verb === 'draft') {
      if (!pageRef) {
        append({ role: 'assistant', text: 'Add a wiki reference, for example /draft @wiki:PAGE_ID.' });
        return true;
      }
      setBusy(true);
      append({ role: 'assistant', text: `Drafting @wiki:${pageRef}. The right pane will update from the maintenance stream.` });
      try {
        await streamMaintainWikiPage(pageRef, {}, {
          onPage: (_page, event = {}) => {
            onNavigate({ page: pageRef });
            onPageChanged?.(pageRef);
          },
          onEvent: (event, payload = {}) => {
            handleStreamEvent(event, payload, pageRef);
            if (event !== 'wiki-draft') return;
            if (payload.stage === 'quality_rebuild') {
              append({ role: 'assistant', text: 'The first draft missed quality gates, so I am rebuilding it once with stricter instructions.' });
            }
          }
        });
        onNavigate({ page: pageRef });
        onPageChanged?.(pageRef);
        append({ role: 'assistant', text: `Finished drafting @wiki:${pageRef}.` });
      } catch (_error) {
        append({ role: 'assistant', text: `Draft failed for @wiki:${pageRef}.` });
      } finally {
        setBusy(false);
      }
      return true;
    }
    if (command.verb === 'ingest') {
      const url = parseUrl(command.args.replace(/^@url\s+/i, ''));
      if (!url) {
        append({ role: 'assistant', text: 'Paste a URL after /ingest to feed it to the wiki.' });
        return true;
      }
      setBusy(true);
      try {
        const result = await ingestWikiSource({ type: 'url', url });
        append({
          role: 'assistant',
          text: `Ingested source. ${result?.affectedPageIds?.length || 0} page${result?.affectedPageIds?.length === 1 ? '' : 's'} affected.`
        });
        onNavigate({ view: 'activity' });
      } catch (_error) {
        append({ role: 'assistant', text: 'Source ingest failed.' });
      } finally {
        setBusy(false);
      }
      return true;
    }
    if (command.verb === 'lint') {
      const lintTarget = parseWikiRef(command.args);
      setBusy(true);
      try {
        append({ role: 'assistant', text: lintTarget ? `Linting @wiki:${lintTarget}.` : 'Linting the wiki.' });
        const result = await streamLintWiki({ pageId: lintTarget || '' }, {
          onEvent: (event, payload = {}) => {
            if (event !== 'wiki-lint') return;
            if (payload.stage === 'loading_pages' || payload.stage === 'persisting') {
              append({ role: 'assistant', text: payload.summary || 'Wiki lint is running.' });
            }
          }
        });
        append({ role: 'assistant', text: formatLintSummary(result), lintRun: result });
      } catch (_error) {
        append({ role: 'assistant', text: 'Wiki lint failed.' });
      } finally {
        setBusy(false);
      }
      return true;
    }
    if (command.verb === 'help') {
      append({ role: 'assistant', text: 'Commands: /build Topic, /draft @wiki:X, /page @wiki:X, /graph, /activity, /sources, /schema, /ingest <url>, /lint, /lint @wiki:X.' });
      return true;
    }
    return false;
  };

  const submit = async (event) => {
    event?.preventDefault?.();
    const text = clean(input);
    if (!text || busy) return;
    const referenced = referencesFromText(text, { pages: wikiPages, articles });
    const nextContextReferences = mergeContextReferences(contextReferences, referenced);
    if (referenced.length) {
      setContextReferences(nextContextReferences);
      setReferenceHintSeen(true);
    }
    setInput('');
    append({ role: 'user', text });
    const command = parseCommand(text);
    if (command && await handleCommand(command)) return;

    setBusy(true);
    const pendingId = messageId('assistant');
    append({ id: pendingId, role: 'assistant', text: '', pending: true });
    const streamController = new AbortController();
    streamAbortRef.current = streamController;
    setStreamingMessageId(pendingId);
    let streamedText = '';
    try {
      const pastedUrl = parseUrl(text.replace(/^@url\s+/i, ''));
      if (pastedUrl) {
        const result = await ingestWikiSource({ type: 'url', url: pastedUrl });
        replaceMessage(pendingId, {
          text: `Ingested source. ${result?.affectedPageIds?.length || 0} page${result?.affectedPageIds?.length === 1 ? '' : 's'} affected.`,
          pending: false
        });
        onNavigate({ view: 'activity' });
        return;
      }
      const chatPayload = {
        message: text,
        threadId: threadId || undefined,
        persistThread: true,
        threadTitle: 'Wiki workspace',
        context: {
          type: 'workspace',
          id: 'wiki',
          title: selectedPageId ? wikiPageLabel(selectedPagePresence.page, 'Selected wiki page') : 'Wiki workspace',
          pageId: selectedPageId || '',
          view,
          references: nextContextReferences,
          metadata: {
            surface: 'wiki_workspace',
            contextReferences: nextContextReferences
          }
        },
        history: messages.map(message => ({ role: message.role, text: message.text })),
        limit: 6
      };
      const result = await streamChatWithAgent(chatPayload, {
        signal: streamController.signal,
        onEvent: (event, payload = {}) => handleStreamEvent(event, payload, selectedPageId),
        onActivity: (payload) => {
          appendReceipt(pendingId, payload);
          handleStreamEvent('agent-activity', payload, selectedPageId);
        },
        onDelta: (delta) => {
          streamedText += delta;
          replaceMessage(pendingId, { text: streamedText, pending: true });
        },
        onFinal: (payload) => {
          streamedText = clean(payload?.reply) || streamedText;
          (payload?.activityReceipts || []).forEach(receipt => appendReceipt(pendingId, receipt));
        }
      });
      if (result?.thread?.threadId) {
        setThreadId(result.thread.threadId);
        setThreadTitle(clean(result.thread.title) || 'Wiki workspace');
      }
      const hydratedMessages = toWorkspaceThreadMessages(result?.thread);
      if (hydratedMessages.length > messages.length + 1) {
        setMessages(hydratedMessages);
      }
      const finalReply = clean(result?.reply || streamedText);
      if (!finalReply) {
        setInput(text);
      }
      replaceMessage(pendingId, {
        text: finalReply || 'Agent chat ended without a complete reply. Your draft is still in the composer; retry when ready.',
        ...(Array.isArray(result?.activityReceipts) ? { activityReceipts: result.activityReceipts } : {}),
        pending: false,
        ...(finalReply ? {} : { error: true })
      });
    } catch (error) {
      if (error?.name === 'AbortError' || streamController.signal.aborted) {
        replaceMessage(pendingId, {
          text: 'Agent reply cancelled before completion.',
          pending: false,
          cancelled: true
        });
      } else {
        setInput(text);
        replaceMessage(pendingId, { text: 'Agent chat failed. Your draft is still in the composer; retry when ready.', pending: false, error: true });
      }
    } finally {
      if (streamAbortRef.current === streamController) {
        streamAbortRef.current = null;
      }
      setStreamingMessageId('');
      setBusy(false);
    }
  };

  return (
    <section className="wiki-workspace-chat" aria-label="Wiki agent chat">
      <header>
        {/* AT-291: pane label, not the page's document title — kept as h2 so the
            active right-pane content (article / sources / schema) owns the sole h1. */}
        <h2 className="wiki-workspace-chat__title">Wiki agent</h2>
        <div className="wiki-workspace-chat__header-actions">
          {threadId ? (
            <Link className="wiki-workspace-chat__thread-link" to={`/think?tab=threads&threadId=${encodeURIComponent(threadId)}`}>
              Thread{threadTitle ? ` · ${threadTitle}` : ''}
            </Link>
          ) : null}
          <button type="button" className="wiki-workspace-chat__build-button" onClick={onBuildPage}>
            Build page
          </button>
        </div>
      </header>
      <form
        onSubmit={submit}
        className="wiki-workspace-chat__composer"
        data-streaming={streamingMessageId ? 'true' : 'false'}
      >
        {ambientReady ? (
          <div
            className="wiki-workspace-chat__presence"
            data-status={agentStatus.status}
            role="status"
            aria-live="polite"
            aria-label="Agent status"
          >
            <span className="wiki-workspace-chat__presence-dot" aria-hidden="true" />
            <span>{agentStatus.text}</span>
          </div>
        ) : null}
        {contextReferences.length ? (
          <div className="wiki-workspace-chat__context" aria-label="In context">
            <span>In context:</span>
            {contextReferences.map(reference => (
              <button
                type="button"
                key={reference.key}
                onClick={() => removeContextReference(reference.key)}
                aria-label={`Remove ${reference.label} from context`}
              >
                {reference.label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : null}
        {/* AT-289: the textarea is a replaced element and can't host the
            breathing conic-gradient border directly, so the field wrapper
            carries the animated border (see .wiki-workspace-chat__composer-field
            in think-home-polish.css). data-streaming bubbles from the form. */}
        <div className="wiki-workspace-chat__composer-field">
        <textarea
          value={input}
          onFocus={requestWikiPages}
          onChange={(event) => {
            const next = event.target.value;
            setInput(next);
            setDismissedMentionInput('');
            if (next.startsWith('/')) setSlashHintSeen(true);
            if (/@wiki:/i.test(next) || /(^|\s)@[^\s:@]*$/i.test(next)) requestWikiPages();
            if (/@article:/i.test(next) || /(^|\s)@[^\s:@]*$/i.test(next)) requestArticles();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && streamingMessageId) {
              event.preventDefault();
              cancelActiveStream();
              return;
            }
            if (showCommands.length && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
              event.preventDefault();
              if (event.key === 'ArrowDown') {
                setActiveCommandIndex(index => (index + 1) % showCommands.length);
                return;
              }
              if (event.key === 'ArrowUp') {
                setActiveCommandIndex(index => (index - 1 + showCommands.length) % showCommands.length);
                return;
              }
              applyCommandTemplate(showCommands[activeCommandIndex]?.template || showCommands[0].template);
              return;
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit(event);
          }}
          placeholder="Ask, paste a source, or type / for wiki commands"
          aria-label="Wiki workspace message"
          rows={4}
          disabled={busy}
        />
        </div>
        {showCommands.length ? (
          <div className="wiki-workspace-chat__palette" aria-label="Wiki commands">
            {showCommands.map((command, index) => (
              <button
                type="button"
                aria-current={index === activeCommandIndex ? 'true' : undefined}
                className={index === activeCommandIndex ? 'is-active' : ''}
                key={command.verb}
                onMouseEnter={() => setActiveCommandIndex(index)}
                onClick={() => applyCommandTemplate(command.template)}
              >
                <strong>/{command.verb}</strong>
                <span>{command.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
        {showWikiMentions.length ? (
          <div className="wiki-workspace-chat__palette" aria-label="Wiki page references">
            {showWikiMentions.map(page => (
              <button type="button" key={page._id || page.id} onClick={() => applyWikiMention(page)}>
                <strong>{page.title || 'Untitled wiki page'}</strong>
                <span>@wiki:{page._id || page.id}</span>
              </button>
            ))}
          </div>
        ) : null}
        {showArticleMentions.length ? (
          <div className="wiki-workspace-chat__palette" aria-label="Article references">
            {showArticleMentions.map(article => (
              <button type="button" key={article._id || article.id} onClick={() => applyArticleMention(article)}>
                <strong>{article.title || article.url || 'Untitled source'}</strong>
                <span>@article:{article._id || article.id}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="wiki-workspace-chat__composer-footer">
          {showDiscoveryHint ? (
            <span className="wiki-workspace-chat__hint">
              Type / for commands, @ to reference your library. <kbd>⌘Enter</kbd> sends.
              <button type="button" onClick={() => setHintDismissed(true)} aria-label="Dismiss composer hint">Dismiss</button>
            </span>
          ) : <span className="wiki-workspace-chat__shortcut"><kbd>⌘Enter</kbd> to send</span>}
          {streamingMessageId ? (
            <Button type="button" className="wiki-workspace-chat__send is-cancel" onClick={cancelActiveStream}>Cancel</Button>
          ) : (
            <Button
              type="submit"
              className={`wiki-workspace-chat__send${input.trim() ? ' is-ready' : ' is-empty'}`}
              disabled={busy || !input.trim()}
            >
              {busy ? 'Sending...' : 'Send'}
            </Button>
          )}
        </div>
      </form>
      <div ref={scrollRef} className="wiki-workspace-chat__messages">
        {messages.map(message => (
          <article key={message.id} className={`wiki-workspace-chat__message is-${message.role}`}>
            <span>{message.role === 'user' ? 'You' : 'Agent'}</span>
            {message.text ? (
              <WikiChatMarkdown text={message.text} pages={wikiPages} currentPage={selectedPagePresence.page} />
            ) : null}
            {message.pending ? <span className="wiki-workspace-chat__caret" aria-hidden="true" /> : null}
            {message.activityReceipts?.length ? (
              <ol className="wiki-workspace-chat__receipts" aria-label="Agent activity">
                {message.activityReceipts.map(receipt => (
                  <li key={receipt.key || `${receipt.stage}:${receipt.summary}`}>
                    <span className="wiki-workspace-chat__receipt-icon" aria-hidden="true" />
                    {receipt.summary || receipt.text || receipt.message}
                  </li>
                ))}
              </ol>
            ) : null}
            {message.lintRun ? (
              <WikiLintResultCard
                run={message.lintRun}
                onNavigate={onNavigate}
                onPageChanged={onPageChanged}
                onAppend={append}
              />
            ) : null}
            {message.visitNotice ? (
              <WikiWorkspaceVisitCard
                notice={message.visitNotice}
                onNavigate={onNavigate}
                onReviewed={handleVisitReviewed}
              />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};

const WikiWorkspace = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [chatWidth, setChatWidth] = useState(initialChatWidth);
  const [busy, setBusy] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [liveUpdate, setLiveUpdate] = useState(null);
  const [mobilePane, setMobilePane] = useState('wiki');
  const [currentSearch, setCurrentSearch] = useState(location.search);
  const [chatDraft, setChatDraft] = useState(null);
  const [showFirstVisitOnboarding, setShowFirstVisitOnboarding] = useState(false);
  const currentSearchRef = useRef(location.search);
  const touchStartRef = useRef(null);
  const dragRef = useRef(null);
  const chatWidthRef = useRef(chatWidth);
  const lastSelectedPageRef = useRef('');

  const params = useMemo(() => new URLSearchParams(currentSearch), [currentSearch]);
  const selectedPageId = clean(params.get('page'));
  const pageMode = clean(params.get('mode')) === 'edit' ? 'edit' : 'read';
  const explicitView = clean(params.get('view'));
  const explicitPane = normalizePane(params.get('pane'));
  const view = selectedPageId ? 'page' : explicitView || 'graph';

  useEffect(() => {
    if (location.search === currentSearchRef.current) return;
    currentSearchRef.current = location.search;
    setCurrentSearch(location.search);
  }, [location.search]);

  useEffect(() => {
    chatWidthRef.current = chatWidth;
  }, [chatWidth]);

  useEffect(() => {
    if (selectedPageId) lastSelectedPageRef.current = selectedPageId;
  }, [selectedPageId]);

  const syncPaneParam = useCallback((pane) => {
    const normalizedPane = normalizePane(pane);
    if (!normalizedPane) return;
    const nextParams = new URLSearchParams(currentSearchRef.current || currentSearch || location.search || '');
    nextParams.set('pane', normalizedPane);
    const nextSearch = `?${nextParams.toString()}`;
    currentSearchRef.current = nextSearch;
    setCurrentSearch(nextSearch);
    navigate(`/wiki/workspace${nextSearch}`, { replace: true });
  }, [currentSearch, location.search, navigate]);

  const showPane = useCallback((pane, { persist = false } = {}) => {
    const normalizedPane = normalizePane(pane);
    if (!normalizedPane) return;
    setMobilePane(normalizedPane);
    if (persist) syncPaneParam(normalizedPane);
  }, [syncPaneParam]);

  const openChatWithDraft = useCallback((text, idPrefix = 'workspace-chat-draft') => {
    setChatDraft({ id: `${idPrefix}-${Date.now()}`, text });
    showPane('chat', { persist: true });
  }, [showPane]);

  useEffect(() => {
    if (explicitPane) setMobilePane(explicitPane);
  }, [explicitPane]);

  useEffect(() => {
    if (hasSeenFirstVisitOnboarding() || selectedPageId) {
      setShowFirstVisitOnboarding(false);
      return undefined;
    }
    let cancelled = false;
    listWikiPages({ limit: 1 })
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
    if (selectedPageId) {
      window.localStorage?.setItem?.(LAST_PAGE_KEY, selectedPageId);
      if (explicitPane !== 'chat') setMobilePane('wiki');
      return;
    }
    if (explicitView) return;
    const target = { view: 'graph' };
    const targetSearch = searchFor(target);
    startWikiViewTransition(() => {
      currentSearchRef.current = targetSearch;
      setCurrentSearch(targetSearch);
      navigate(viewPathFor(target), { replace: true });
    });
  }, [explicitPane, explicitView, navigate, selectedPageId]);

  const onNavigate = useCallback(({ page = '', view: nextView = '', mode = '' } = {}) => {
    if (selectedPageId) lastSelectedPageRef.current = selectedPageId;
    const target = { page, view: nextView || 'graph', mode, pane: explicitPane };
    const targetSearch = searchFor(target);
    startWikiViewTransition(() => {
      currentSearchRef.current = targetSearch;
      setCurrentSearch(targetSearch);
      navigate(viewPathFor(target));
      if (page && explicitPane !== 'chat') setMobilePane('wiki');
    });
  }, [explicitPane, navigate, selectedPageId]);

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

  const onPageChanged = useCallback((pageId) => {
    if (pageId === selectedPageId) setRefreshNonce(value => value + 1);
  }, [selectedPageId]);

  const onLiveUpdate = useCallback((update = {}) => {
    setLiveUpdate(update);
  }, []);

  const useSourceInChat = useCallback((article = {}) => {
    const title = clean(article.title || article.url || 'this source');
    const url = clean(article.url);
    const articleId = clean(article._id || article.id);
    const articleContext = articleId ? ` @article:${articleId}` : '';
    const pageId = selectedPageId || lastSelectedPageRef.current;
    const pageContext = pageId ? ` for @wiki:${pageId}` : '';
    openChatWithDraft(
      `Use "${title}"${url ? ` (${url})` : ''}${articleContext}${pageContext} and tell me what wiki update it supports.`,
      `${article._id || article.id || title}`
    );
  }, [openChatWithDraft, selectedPageId]);

  const dismissFirstVisitOnboarding = useCallback(() => {
    try {
      window.localStorage?.setItem?.(FIRST_VISIT_SEEN_KEY, 'true');
    } catch (_error) {
      // localStorage can be unavailable in private or embedded contexts; dismiss in memory.
    }
    setShowFirstVisitOnboarding(false);
  }, []);

  const handleFirstVisitBuild = useCallback(() => {
    dismissFirstVisitOnboarding();
    openChatWithDraft('/build ', 'first-visit-build');
  }, [dismissFirstVisitOnboarding, openChatWithDraft]);

  const handleFirstVisitSource = useCallback(() => {
    dismissFirstVisitOnboarding();
    onNavigate({ view: 'sources' });
    openChatWithDraft('/ingest https://', 'first-visit-source');
  }, [dismissFirstVisitOnboarding, onNavigate, openChatWithDraft]);

  const handleWorkspaceBuild = useCallback(() => {
    openChatWithDraft('/build ', 'workspace-build');
  }, [openChatWithDraft]);

  const handleWorkspaceSource = useCallback(() => {
    onNavigate({ view: 'sources' });
    openChatWithDraft('/ingest https://', 'workspace-source');
  }, [onNavigate, openChatWithDraft]);

  const rightPane = useMemo(() => {
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
            onEdit={() => enterPageEditMode(selectedPageId)}
          />
        </div>
      );
    }
    if (view === 'activity') return <WorkspaceActivity />;
    if (view === 'list') return <WikiList compact onOpenPage={(pageId) => onNavigate({ page: pageId })} />;
    if (view === 'sources') return <WorkspaceSources onUseSource={useSourceInChat} />;
    if (view === 'schema') return <WorkspaceSchema />;
    return (
      <Suspense fallback={<WorkspacePaneFallback label="Loading knowledge map..." />}>
        <WikiIndex
          onOpenPage={(pageId) => onNavigate({ page: pageId })}
          onOpenList={() => onNavigate({ view: 'list' })}
          onBuildPage={handleWorkspaceBuild}
          onOpenSources={handleWorkspaceSource}
        />
      </Suspense>
    );
  }, [enterPageEditMode, exitPageEditMode, handleWorkspaceBuild, handleWorkspaceSource, liveUpdate, onNavigate, pageMode, refreshNonce, selectedPageId, useSourceInChat, view]);

  const handleDragStart = (event) => {
    dragRef.current = { startX: event.clientX, startWidth: chatWidth };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (event) => {
    if (!dragRef.current) return;
    const next = Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, dragRef.current.startWidth + event.clientX - dragRef.current.startX));
    setChatWidth(next);
  };

  const handleDragEnd = () => {
    window.localStorage?.setItem?.(CHAT_WIDTH_KEY, String(chatWidthRef.current));
    dragRef.current = null;
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
  };

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    showPane(dx < 0 ? 'wiki' : 'chat', { persist: true });
  };

  return (
    <main
      className={`wiki-workspace is-mobile-${mobilePane}`}
      style={{ '--wiki-workspace-chat-width': `${chatWidth}px` }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="wiki-workspace__mobile-tabs" role="tablist" aria-label="Workspace panes">
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'chat'}
          className={mobilePane === 'chat' ? 'is-active' : ''}
          onClick={() => showPane('chat', { persist: true })}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'wiki'}
          className={mobilePane === 'wiki' ? 'is-active' : ''}
          onClick={() => showPane('wiki', { persist: true })}
        >
          Wiki
        </button>
      </div>
      <aside className="wiki-workspace__chat-pane">
        <WikiWorkspaceChat
          selectedPageId={selectedPageId}
          view={view}
          onNavigate={onNavigate}
          onPageChanged={onPageChanged}
          onLiveUpdate={onLiveUpdate}
          busy={busy}
          setBusy={setBusy}
          chatDraft={chatDraft}
          onBuildPage={handleWorkspaceBuild}
        />
      </aside>
      <button
        type="button"
        className="wiki-workspace__resizer"
        aria-label="Resize workspace panes"
        onMouseDown={handleDragStart}
      />
      <section className="wiki-workspace__right-pane" aria-label="Wiki workspace right pane">
        {rightPane}
      </section>
      {showFirstVisitOnboarding ? (
        <section className="wiki-workspace-onboarding" aria-labelledby="wiki-workspace-onboarding-title">
          <div className="wiki-workspace-onboarding__panel">
            <div className="wiki-workspace-onboarding__copy">
              <p className="wiki-index__eyebrow">First visit</p>
              <h1 id="wiki-workspace-onboarding-title">Start the wiki with one page or one source.</h1>
              <p>
                The workspace is split between the wiki agent and the page canvas. Build a page from a topic,
                or drop source material and let the wiki decide what should change.
              </p>
            </div>
            <div className="wiki-workspace-onboarding__actions">
              <Button type="button" variant="primary" onClick={handleFirstVisitBuild}>Build page</Button>
              <Button type="button" variant="secondary" onClick={handleFirstVisitSource}>Drop source</Button>
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
    </main>
  );
};

export default WikiWorkspace;
