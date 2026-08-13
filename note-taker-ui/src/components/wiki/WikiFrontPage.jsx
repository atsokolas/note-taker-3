import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listWikiPages } from '../../api/wiki';
import {
  armReadingWatch,
  disarmWatcher,
  getDailyLoop,
  recordClaimCheckIn
} from '../../api/dailyLoop';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import AgentContextShell from '../agent/AgentContextShell';
import ThoughtPartnerPanel from '../agent/ThoughtPartnerPanel';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import WikiRepoCreateComposer from './WikiRepoCreateComposer';
import WikiCompanyDossierComposer from './WikiCompanyDossierComposer';
import WikiMovementReturnSurface from './WikiMovementReturnSurface';
import WikiFrontPageGraphMotif from './WikiFrontPageGraphMotif';
import DecisionsIndex from './decisions/DecisionsIndex';
import { countWikiClaims, countWikiSources } from './wikiPageMetrics';
import { filterReturnViewItems } from '../../utils/cruftSuppression';
import { formatSurfaceDate } from '../../utils/dateDisplay';
import {
  normalizeBriefingNextAction,
  selectPrimaryReturnLoopNote,
  selectBriefingReturnLoopNotes
} from './wikiBriefingReturnLoopModel';
import {
  dedupePagesByRepoKey,
  filterPagesForTodaysPage
} from './wikiRepoDedupeModel';
import { displayWikiPageTitle } from './wikiRepoDossierModel';
import { labelFor } from './wikiGraph';
import '../../styles/wiki-critical.css';
import '../../styles/wiki-front-page.css';

// AT-394 — the wiki front page. Opening Noeis lands here: a newspaper-shaped
// reading surface. Alive the way a newspaper on the doorstep is alive — new
// today, and it arrives (one brief entrance, then stillness). The maintenance
// workspace (map, review queues, drop-source, telemetry) lives behind one
// hairline link; it is no longer the front door.

const INDEX_PAGE_LIMIT = 500;
const WATCHING_PREVIEW_LIMIT = 5;
const WIKI_ONBOARDING_COMPLETE_KEY = 'noeis.wikiOnboardingComplete';
const WIKI_FRONT_PAGE_CACHE_KEY = 'noeis.wiki.frontPageSnapshot.v1';
const WIKI_FRONT_PAGE_CACHE_MAX_AGE_MS = 36 * 60 * 60 * 1000;

const pageId = (page) => (page && (page._id || page.id || page.pageId)) || '';

const pageWeight = (page = {}) => (
  countWikiSources(page) * 3
  + countWikiClaims(page) * 2
  + (page.updatedAt ? 1 : 0)
  + (page.lastReviewedAt ? 1 : 0)
);

const relativeTime = (iso) => {
  if (!iso) return '';
  return formatSurfaceDate(iso, { includeYear: true });
};

const isDeveloperWiki = (page = {}) => (
  page.pageType === 'repo'
  || Boolean(page.repoKey)
  || Boolean(page.externalWatches?.githubRepo)
);

const pendingWikiReview = (page = {}) => {
  const candidateStatus = String(page.aiState?.candidateStatus || '').trim();
  const qualityStatus = String(page.qualityReview?.status || '').trim();
  return candidateStatus.startsWith('awaiting_')
    || qualityStatus === 'needs_review'
    || page.qualityReview?.needsReview === true;
};

const wikiReviewState = (page = {}, changedByLibrary = false) => {
  if (pendingWikiReview(page)) return { label: 'Review available', tone: 'review' };
  if (changedByLibrary) return { label: 'New evidence', tone: 'evidence' };
  return { label: 'No proposal', tone: 'quiet' };
};

const wikiReviewDate = (page = {}) => {
  const reviewedAt = page.lastReviewedAt || page.qualityReview?.reviewedAt;
  return reviewedAt ? relativeTime(reviewedAt) : 'Not reviewed';
};

const wikiGroundingLabel = (page = {}) => {
  const count = countWikiSources(page);
  if (!count) return 'No grounded sources';
  const sourceKind = isDeveloperWiki(page) ? 'repository' : 'Library';
  return `${count} ${sourceKind} source${count === 1 ? '' : 's'}`;
};

const claimImpactRegister = (impacts = []) => {
  const rows = Array.isArray(impacts) ? impacts : [];
  const counts = rows.reduce((result, impact) => {
    const state = String(impact?.afterSupport || 'untracked').trim().toLowerCase() || 'untracked';
    result[state] = (result[state] || 0) + 1;
    return result;
  }, {});
  return [
    ['supported', counts.supported || 0],
    ['partial', counts.partial || 0],
    ['unsupported', counts.unsupported || 0],
    ['conflicted', counts.conflicted || 0]
  ].filter(([, count]) => count > 0);
};

const completeLeadSentence = (value = '', maxLength = 280) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength && /[.!?]$/.test(text)) return text;
  const limit = Math.max(80, Number(maxLength) || 280);
  const matches = Array.from(text.matchAll(/[.!?](?=\s|$)/g));
  const boundary = matches
    .map(match => match.index + 1)
    .filter(index => index <= limit)
    .pop();
  if (boundary) return text.slice(0, boundary).trim();
  const clipped = text.slice(0, limit).replace(/[,:;–—-]+$/g, '').trim();
  const wordBoundary = clipped.lastIndexOf(' ');
  const clean = wordBoundary > 80 ? clipped.slice(0, wordBoundary).trim() : clipped;
  if (!clean) return '';
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
};

// The morning-paper lead must always be readable as a complete sentence.
// The page still has entrance motion, but the content itself does not reveal
// word-by-word because QA and real users can otherwise catch a dangling phrase.
const WriteIn = ({ text = '' }) => {
  const fullText = useMemo(() => String(text || '').replace(/\s+/g, ' ').trim(), [text]);

  return (
    <span className="wiki-front-page__lead-text">{fullText}</span>
  );
};

const mastheadDate = () => new Date().toLocaleDateString(undefined, {
  weekday: 'long', month: 'long', day: 'numeric'
});

const WikiFrontPageShell = ({ children, ...mainProps }) => (
  <>
    <WikiFrontPageGraphMotif />
    <main className="wiki-page wiki-front-page" {...mainProps}>
      {children}
    </main>
  </>
);

const readFrontPageCache = () => {
  try {
    const raw = window.localStorage?.getItem(WIKI_FRONT_PAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const cachedAt = Number(parsed?.cachedAt);
    if (!Number.isFinite(cachedAt)) return null;
    if (Date.now() - cachedAt > WIKI_FRONT_PAGE_CACHE_MAX_AGE_MS) return null;
    return {
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      briefing: parsed.briefing || null,
      hasAnyWikiContent: typeof parsed.hasAnyWikiContent === 'boolean'
        ? parsed.hasAnyWikiContent
        : null
    };
  } catch (_error) {
    return null;
  }
};

const writeFrontPageCache = ({ pages = [], briefing = null, hasAnyWikiContent = null } = {}) => {
  try {
    window.localStorage?.setItem(WIKI_FRONT_PAGE_CACHE_KEY, JSON.stringify({
      cachedAt: Date.now(),
      pages: Array.isArray(pages) ? pages : [],
      briefing: briefing || null,
      hasAnyWikiContent: typeof hasAnyWikiContent === 'boolean' ? hasAnyWikiContent : null
    }));
  } catch (_error) {
    // Cache is a perceived-speed affordance; private-mode/quota failures
    // should never block the paper.
  }
};

const WikiFrontPage = () => {
  const navigate = useNavigate();
  const pageIndexRequestRef = useRef(null);
  const [pages, setPages] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [hasAnyWikiContent, setHasAnyWikiContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState('');
  const [revisionDraft, setRevisionDraft] = useState('');
  const [showRevisionDraft, setShowRevisionDraft] = useState(false);
  const [readingFeedUrl, setReadingFeedUrl] = useState('');
  const [readingPageId, setReadingPageId] = useState('');
  const [watchingBusy, setWatchingBusy] = useState(false);
  const [hasMovements, setHasMovements] = useState(false);
  const [showOperations, setShowOperations] = useState(false);

  useEffect(() => {
    if (hasMovements) setShowOperations(true);
  }, [hasMovements]);
  const [availabilityNotice, setAvailabilityNotice] = useState('');
  const [wikiSearch, setWikiSearch] = useState('');
  const [wikiFilter, setWikiFilter] = useState('all');

  useEffect(() => {
    document.body.classList.add('wiki-front-page-route');
    return () => {
      document.body.classList.remove('wiki-front-page-route');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = readFrontPageCache();
    const snapshot = {
      pages: cached?.pages || [],
      briefing: cached?.briefing || null,
      hasAnyWikiContent: cached?.hasAnyWikiContent ?? null
    };
    if (cached) {
      setPages(cached.pages);
      setBriefing(cached.briefing);
      setHasAnyWikiContent(cached.hasAnyWikiContent);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError('');
    setAvailabilityNotice('');
    const persistSnapshot = () => writeFrontPageCache(snapshot);
    const loadBriefing = () => {
      if (cancelled) return;
      getDailyLoop()
        .then((result) => {
          if (cancelled || !result?.briefing) return;
          snapshot.briefing = result.briefing;
          setBriefing(snapshot.briefing);
          persistSnapshot();
        })
        .catch(() => {
          if (cancelled) return;
          setAvailabilityNotice('Your pages are available, but current change signals could not be refreshed.');
        });
    };
    if (cached) loadBriefing();

    // The accepted page index is the Wiki's durable reading surface. Render it
    // as soon as it resolves; a slow Daily Loop briefing must never hold the
    // user's own pages behind an unrelated loading state. Start that optional
    // briefing only after the index settles so it cannot contend with the
    // canonical first read during a cold database wake-up.
    if (!pageIndexRequestRef.current) {
      pageIndexRequestRef.current = listWikiPages({
        limit: INDEX_PAGE_LIMIT,
        includeLowQuality: 1,
        // The index renders titles, counts, and freshness — never bodies.
        // Requesting whole pages made this large enough to fail outright on a
        // real corpus, which surfaced as "Failed to load wiki pages".
        summary: 1
      });
    }
    const pageIndexRequest = pageIndexRequestRef.current;
    pageIndexRequest
      .then((nextPages) => {
        if (cancelled) return;
        snapshot.pages = Array.isArray(nextPages) ? nextPages : [];
        snapshot.hasAnyWikiContent = snapshot.pages.length > 0;
        setPages(snapshot.pages);
        setHasAnyWikiContent(snapshot.hasAnyWikiContent);
        persistSnapshot();
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (cached) {
          setAvailabilityNotice('Showing your saved Wiki view because the latest page index could not be refreshed.');
        } else {
          setError('Failed to load wiki pages.');
        }
        setLoading(false);
      })
      .finally(() => {
        if (pageIndexRequestRef.current === pageIndexRequest) {
          pageIndexRequestRef.current = null;
        }
        if (!cached) loadBriefing();
      });
    return () => { cancelled = true; };
  }, []);

  const curatedPages = useMemo(
    () => dedupePagesByRepoKey(filterReturnViewItems(pages)),
    [pages]
  );
  const onboardingComplete = (() => {
    try {
      return window.localStorage?.getItem(WIKI_ONBOARDING_COMPLETE_KEY) === 'true';
    } catch (_error) {
      return false;
    }
  })();
  const shouldOpenOnboarding = !loading && !error && !onboardingComplete && hasAnyWikiContent === false;

  useEffect(() => {
    if (!shouldOpenOnboarding) return;
    navigate('/onboarding/wiki', { replace: true });
  }, [navigate, shouldOpenOnboarding]);

  const byId = useMemo(() => {
    const map = new Map();
    curatedPages.forEach((page) => map.set(String(pageId(page)), page));
    return map;
  }, [curatedPages]);

  // Prefer the page object from the full list (it carries body/claims for
  // excerpts); the briefing's bucket entries can be slimmer.
  const resolvePage = useMemo(() => (entry = {}) => (
    byId.get(String(pageId(entry))) || entry
  ), [byId]);

  const recentlyUpdated = useMemo(() => (
    Array.isArray(briefing?.recentlyUpdatedPages)
      ? dedupePagesByRepoKey(filterReturnViewItems(briefing.recentlyUpdatedPages.map(resolvePage)))
      : []
  ), [briefing, resolvePage]);

  const sourceMaterialPages = useMemo(() => (
    Array.isArray(briefing?.pagesWithNewSourceMaterial)
      ? dedupePagesByRepoKey(filterReturnViewItems(briefing.pagesWithNewSourceMaterial.map(resolvePage)))
      : []
  ), [briefing, resolvePage]);

  const sourceMaterialIds = useMemo(
    () => new Set(sourceMaterialPages.map(page => String(pageId(page)))),
    [sourceMaterialPages]
  );

  const weighted = useMemo(() => (
    [...curatedPages].sort((a, b) => pageWeight(b) - pageWeight(a)
      || String(a.title || '').localeCompare(String(b.title || '')))
  ), [curatedPages]);

  // Today's page: the agent's most recently enriched page; otherwise the
  // strongest page in the corpus. Repo wikis only lead when they actually changed.
  const todaysPage = useMemo(() => {
    const watcherPage = briefing?.lead?.page?.id
      ? resolvePage({ _id: briefing.lead.page.id, title: briefing.lead.page.title })
      : null;
    const candidates = [
      ...(watcherPage ? [watcherPage] : []),
      ...filterPagesForTodaysPage(sourceMaterialPages, briefing),
      ...filterPagesForTodaysPage(recentlyUpdated, briefing),
      ...filterPagesForTodaysPage(weighted, briefing)
    ];
    return candidates[0] || null;
  }, [sourceMaterialPages, recentlyUpdated, weighted, briefing, resolvePage]);

  const pageKinds = useMemo(() => {
    const counts = new Map();
    curatedPages.forEach((page) => {
      if (isDeveloperWiki(page)) return;
      const kind = String(page.pageType || 'topic').trim() || 'topic';
      counts.set(kind, (counts.get(kind) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || labelFor(a[0]).localeCompare(labelFor(b[0])));
  }, [curatedPages]);

  const explorePages = useMemo(() => {
    const query = wikiSearch.trim().toLowerCase();
    let visible = weighted;
    if (wikiFilter === 'topics') visible = visible.filter(page => !isDeveloperWiki(page));
    if (wikiFilter === 'developer') visible = visible.filter(isDeveloperWiki);
    if (wikiFilter === 'review') visible = visible.filter(page => (
      pendingWikiReview(page) || sourceMaterialIds.has(String(pageId(page)))
    ));
    if (wikiFilter === 'recent') visible = [...visible]
      .filter(page => page.updatedAt)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (wikiFilter.startsWith('kind:')) {
      const kind = wikiFilter.slice(5);
      visible = visible.filter(page => String(page.pageType || 'topic') === kind);
    }
    if (!query) return visible;
    return visible.filter(page => (
      displayWikiPageTitle(page, 'Untitled page').toLowerCase().includes(query)
      || String(page?.summary || page?.description || '').toLowerCase().includes(query)
    ));
  }, [weighted, wikiSearch, wikiFilter, sourceMaterialIds]);

  const exactReviewCount = useMemo(() => curatedPages.filter(page => (
    pendingWikiReview(page) || sourceMaterialIds.has(String(pageId(page)))
  )).length, [curatedPages, sourceMaterialIds]);

  const developerWikiCount = useMemo(
    () => curatedPages.filter(isDeveloperWiki).length,
    [curatedPages]
  );

  const reviewCount = briefing?.counts?.driftingPages
    ?? (Array.isArray(briefing?.driftingPages) ? briefing.driftingPages.length : 0);

  const workspaceNav = (
    <nav className="wiki-front-page__secondary-nav" aria-label="Wiki workspace">
      <Link to="/wiki/workspace?view=graph">Knowledge map</Link>
      <Link to="/wiki/workspace?view=list">All pages</Link>
      <Link to="/wiki/workspace?view=list&quality=needs_review">Needs review</Link>
      <Link to="/wiki/workspace?view=graph">
        Review{reviewCount ? ` (${reviewCount})` : ''}
      </Link>
    </nav>
  );

  const leadSentence = hasMovements
    ? 'Something consequential needs your review.'
    : completeLeadSentence(briefing?.lead
      ? [briefing.lead.title, briefing.lead.page?.title, briefing.lead.impactSummary]
        .filter(Boolean)
        .join('. ')
      : briefing?.summary || 'Read what you know, or begin a new thought.');
  const briefingNextAction = useMemo(
    () => briefing?.lead?.page?.id ? {
      label: `Open ${briefing.lead.page.title || 'watched page'}`,
      href: briefing.lead.href || wikiPagePath(briefing.lead.page.id),
      reason: `${briefing.lead.watcherLabel || 'Watcher'} · ${briefing.lead.maintenanceStatus || 'queued'}`
    } : normalizeBriefingNextAction(briefing),
    [briefing]
  );
  const returnLoopNotes = useMemo(
    () => selectBriefingReturnLoopNotes(briefing),
    [briefing]
  );
  const primaryReturnLoopNote = useMemo(
    () => selectPrimaryReturnLoopNote(returnLoopNotes),
    [returnLoopNotes]
  );
  const claimCheckIn = briefing?.claimCheckIn || null;
  const watching = Array.isArray(briefing?.watching) ? briefing.watching : [];

  const handleCheckIn = async (action, revisedText = '') => {
    if (!claimCheckIn || checkInBusy) return;
    if (action === 'retired' && !window.confirm('Retire this claim? It will remain permanently auditable and can be explicitly restored later.')) return;
    setCheckInBusy(true);
    setCheckInMessage('');
    try {
      const result = await recordClaimCheckIn({
        pageId: claimCheckIn.pageId,
        claimId: claimCheckIn.claimId,
        action,
        revisedText
      });
      setCheckInMessage(result.acknowledgment || `Claim ${action}.`);
      setBriefing(previous => ({ ...previous, claimCheckIn: null, checkInStreak: result.streak ?? previous?.checkInStreak }));
      setShowRevisionDraft(false);
    } catch (requestError) {
      setCheckInMessage(requestError?.response?.data?.error || 'Could not record the claim check-in.');
    } finally {
      setCheckInBusy(false);
    }
  };

  const handleArmReading = async (event) => {
    event.preventDefault();
    if (!readingPageId || !readingFeedUrl || watchingBusy) return;
    setWatchingBusy(true);
    setError('');
    try {
      await armReadingWatch(readingPageId, { feedUrl: readingFeedUrl });
      const refreshed = await getDailyLoop();
      setBriefing(refreshed.briefing || null);
      setReadingFeedUrl('');
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'Failed to arm reading watch.');
    } finally {
      setWatchingBusy(false);
    }
  };

  const handleDisarmWatcher = async (watch) => {
    if (watchingBusy) return;
    setWatchingBusy(true);
    try {
      await disarmWatcher(watch.page.id, watch.type);
      setBriefing(previous => ({
        ...previous,
        watching: (previous?.watching || []).filter(row => row.id !== watch.id)
      }));
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'Failed to disarm watcher.');
    } finally {
      setWatchingBusy(false);
    }
  };

  const renderWatcher = (watch) => (
    <li key={watch.id}>
      <div>
        <strong>{watch.label}</strong>
        <span>{watch.page.title} · {watch.detail}</span>
        {watch.errorMessage ? <em>{watch.errorMessage}</em> : null}
      </div>
      <button type="button" disabled={watchingBusy} onClick={() => handleDisarmWatcher(watch)}>Disarm</button>
    </li>
  );

  const operationalWorkspace = (
    <details
      className="wiki-front-page__operations"
      open={showOperations}
      onToggle={(event) => setShowOperations(event.currentTarget.open)}
    >
      <summary className="wiki-front-page__operations-summary">
        <span>
          <strong>Review and system activity</strong>
          <small>
            {hasMovements ? 'Changed evidence · ' : ''}
            {reviewCount ? `${reviewCount} review item${reviewCount === 1 ? '' : 's'} · ` : ''}
            {watching.length} watcher{watching.length === 1 ? '' : 's'}
          </small>
        </span>
        <span aria-hidden="true">Open</span>
      </summary>
      <div className="wiki-front-page__operations-panel">
        {workspaceNav}
        <WikiMovementReturnSurface onPresenceChange={setHasMovements} />
        {briefing?.lead ? (
          <section className="wiki-front-page__watcher-contract" aria-label="Watcher lead analysis">
            <span>{briefing.lead.watcherLabel || 'Watcher'} → {briefing.lead.page?.title || 'Affected page'} → {briefing.lead.maintenanceStatus || 'queued'}</span>
            {briefing.lead.claimImpacts?.length ? (
              <>
                <p className="wiki-front-page__watcher-summary">
                  {briefing.lead.impactSummary || `${briefing.lead.claimImpacts.length} claim-level results are ready to review.`}
                </p>
                <div className="wiki-front-page__watcher-register" role="group" aria-label="Claim impact summary">
                  {claimImpactRegister(briefing.lead.claimImpacts).map(([state, count]) => (
                    <span key={state}><strong>{count}</strong> {state}</span>
                  ))}
                </div>
                <details className="wiki-front-page__watcher-ledger">
                  <summary>Inspect {briefing.lead.claimImpacts.length} claim-level changes</summary>
                  <ul>
                    {briefing.lead.claimImpacts.map(impact => (
                      <li key={impact.claimId}>
                        <code>{impact.claimId}</code>
                        <span>{impact.beforeSupport || 'untracked'} → {impact.afterSupport || 'untracked'}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : <p>{briefing.lead.impactSummary || 'No claim-level analysis is available yet.'}</p>}
          </section>
        ) : null}
        {primaryReturnLoopNote ? (
          <p className="wiki-front-page__evidence-strip">
            <span>Evidence surfaced</span>
            <Link to={primaryReturnLoopNote.href}>{primaryReturnLoopNote.label}</Link>
            <em>{primaryReturnLoopNote.detail}</em>
          </p>
        ) : null}
        {claimCheckIn || checkInMessage || briefing?.checkInStreak ? (
          <div className="wiki-front-page__judgment-panel">
            {claimCheckIn ? (
              <section className="wiki-front-page__check-in" aria-labelledby="morning-claim-check-in">
                <span className="wiki-front-page__next-action-kicker">Claim check-in</span>
                <h2 id="morning-claim-check-in">{claimCheckIn.text}</h2>
                <p>{claimCheckIn.pageTitle}{claimCheckIn.changedSinceLastCheck ? ' · evidence changed since your last review' : ''}</p>
                {showRevisionDraft ? (
                  <div className="wiki-front-page__check-in-revision">
                    <textarea
                      aria-label="Revised claim"
                      value={revisionDraft}
                      onChange={(event) => setRevisionDraft(event.target.value)}
                      rows={3}
                    />
                    <button type="button" disabled={checkInBusy || !revisionDraft.trim()} onClick={() => handleCheckIn('revised', revisionDraft)}>Save revision</button>
                    <button type="button" disabled={checkInBusy} onClick={() => setShowRevisionDraft(false)}>Cancel</button>
                  </div>
                ) : (
                  <div className="wiki-front-page__check-in-actions">
                    <button type="button" disabled={checkInBusy} onClick={() => handleCheckIn('reaffirmed')}>Still hold</button>
                    <button type="button" disabled={checkInBusy} onClick={() => { setRevisionDraft(claimCheckIn.text); setShowRevisionDraft(true); }}>Revise</button>
                    <button type="button" disabled={checkInBusy} onClick={() => handleCheckIn('retired')}>Retire</button>
                    <Link to={claimCheckIn.href}>Open claim</Link>
                  </div>
                )}
              </section>
            ) : null}
            {checkInMessage ? <p className="wiki-front-page__check-in-register" role="status">{checkInMessage}</p> : null}
            {briefing?.checkInStreak ? <p className="wiki-front-page__streak">{briefing.checkInStreak} consecutive mornings</p> : null}
          </div>
        ) : null}
        {showOperations ? (
          <div id="wiki-front-decisions" className="wiki-front-page__decisions">
            <DecisionsIndex embedded initialFilter="upcoming_review" />
          </div>
        ) : null}
        <section className="wiki-front-page__watching" aria-labelledby="wfp-watching-title">
          <div className="wiki-front-page__watching-header">
            <div>
              <p className="wiki-index__eyebrow">Peripheral vision</p>
              <h2 id="wfp-watching-title">Watching</h2>
            </div>
            <span>{watching.length} armed</span>
          </div>
          {watching.length ? (
            <>
              <ul>{watching.slice(0, WATCHING_PREVIEW_LIMIT).map(renderWatcher)}</ul>
              {watching.length > WATCHING_PREVIEW_LIMIT ? (
                <details className="wiki-front-page__watching-more">
                  <summary>{watching.length - WATCHING_PREVIEW_LIMIT} more watcher{watching.length - WATCHING_PREVIEW_LIMIT === 1 ? '' : 's'}</summary>
                  <ul>{watching.slice(WATCHING_PREVIEW_LIMIT).map(renderWatcher)}</ul>
                </details>
              ) : null}
            </>
          ) : <p className="wiki-front-page__watching-empty">No watchers armed yet.</p>}
          <details className="wiki-front-page__watching-add">
            <summary>Add reading feed</summary>
            <form className="wiki-front-page__reading-watch" onSubmit={handleArmReading}>
              <label>
                Page
                <select aria-label="Reading watch page" value={readingPageId} onChange={(event) => setReadingPageId(event.target.value)} required>
                  <option value="">Choose a page</option>
                  {curatedPages.map(page => <option key={pageId(page)} value={pageId(page)}>{displayWikiPageTitle(page, 'Untitled page')}</option>)}
                </select>
              </label>
              <label>
                RSS or Atom URL
                <input type="url" aria-label="RSS or Atom URL" value={readingFeedUrl} onChange={(event) => setReadingFeedUrl(event.target.value)} placeholder="https://example.com/feed" required />
              </label>
              <button type="submit" disabled={watchingBusy}>{watchingBusy ? 'Arming…' : 'Watch feed'}</button>
            </form>
          </details>
        </section>
        <section className="wiki-front-page__specialized-creation" aria-label="Specialized Wiki builders">
          <h2 className="wiki-index__eyebrow">Specialized builders</h2>
          <WikiRepoCreateComposer compact className="wiki-front-page__repo-builder" />
          <WikiCompanyDossierComposer className="wiki-front-page__company-builder" />
        </section>
      </div>
    </details>
  );

  if (loading) {
    return (
      <WikiFrontPageShell aria-busy="true">
        <h1 className="sr-only">Your Wiki</h1>
        <p className="wiki-index__eyebrow wiki-front-page__masthead">
          Your Wiki · {mastheadDate()}
        </p>
        <p className="wiki-front-page__loading-copy" role="status">
          Opening your living knowledge…
        </p>
        <div className="wiki-front-page__skeleton" aria-hidden="true">
          <span className="wiki-skeleton wiki-skeleton--title" />
          <span className="wiki-skeleton wiki-skeleton--line" />
          <span className="wiki-skeleton wiki-skeleton--line wiki-skeleton--line-short" />
        </div>
      </WikiFrontPageShell>
    );
  }

  if (shouldOpenOnboarding) {
    return (
      <WikiFrontPageShell aria-busy="true">
        <h1 className="sr-only">Opening your Wiki</h1>
        <p className="wiki-index__eyebrow wiki-front-page__masthead">
          Your Wiki · {mastheadDate()}
        </p>
        <p className="wiki-front-page__loading-copy" role="status">
          Opening the first-page flow...
        </p>
      </WikiFrontPageShell>
    );
  }

  // First-run fallback for users who have already completed onboarding and
  // cleared their corpus later: never a dead screen.
  if (!curatedPages.length) {
    return (
      <WikiFrontPageShell>
        <header className="wiki-front-page__top">
          <div className="wiki-front-page__top-row wfp-anim wfp-anim--1">
            <p className="wiki-index__eyebrow wiki-front-page__masthead">
              Your Wiki · {mastheadDate()}
            </p>
          </div>
        </header>
        <section className="wiki-front-page__empty wfp-anim wfp-anim--3" aria-labelledby="wfp-empty-title">
          <h1 id="wfp-empty-title">Nothing here yet — let&rsquo;s start your wiki.</h1>
          <p>
            Begin with a thought, or bring in something you saved in Library. Nothing becomes
            accepted knowledge until you choose it.
          </p>
        </section>
        <section className="wiki-front-page__composer wfp-anim wfp-anim--4" aria-label="Build a wiki page">
          <WikiBuildPageComposer compact className="wiki-front-page__builder" />
        </section>
        {operationalWorkspace}
        {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      </WikiFrontPageShell>
    );
  }

  return (
    <WikiFrontPageShell>
      <div className="wiki-living-shell">
        <aside className="wiki-living-nav wfp-anim wfp-anim--1" aria-label="Wiki views">
          <div className="wiki-living-nav__head">
            <span>Wiki</span>
            <strong>{curatedPages.length}</strong>
          </div>
          <nav>
            {[
              ['all', 'All wikis', curatedPages.length],
              ['topics', 'Topics', curatedPages.length - developerWikiCount],
              ['developer', 'Developer wikis', developerWikiCount],
              ['review', 'Needs review', exactReviewCount],
              ['recent', 'Recently updated', recentlyUpdated.length]
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                className={wikiFilter === value ? 'is-active' : ''}
                aria-pressed={wikiFilter === value}
                onClick={() => setWikiFilter(value)}
              >
                <span>{label}</span>
                <small>{count}</small>
              </button>
            ))}
          </nav>
          {pageKinds.length ? (
            <section className="wiki-living-nav__kinds" aria-labelledby="wiki-living-kinds">
              <h2 id="wiki-living-kinds">Kinds</h2>
              {pageKinds.map(([kind, count]) => (
                <button
                  key={kind}
                  type="button"
                  className={wikiFilter === `kind:${kind}` ? 'is-active' : ''}
                  aria-pressed={wikiFilter === `kind:${kind}`}
                  onClick={() => setWikiFilter(`kind:${kind}`)}
                >
                  <span>{labelFor(kind)}</span>
                  <small>{count}</small>
                </button>
              ))}
            </section>
          ) : null}
          <div className="wiki-living-nav__workspace-links">
            <Link to="/wiki/workspace?view=graph">Knowledge map</Link>
            <Link to="/wiki/workspace?view=list">Full workspace</Link>
          </div>
        </aside>

        <section className="wiki-living-index wfp-anim wfp-anim--2" aria-labelledby="wiki-living-title">
          <header className="wiki-living-index__header">
            <p className="wiki-index__eyebrow">Your Wiki · {mastheadDate()}</p>
            <h1 id="wiki-living-title">Your living wikis</h1>
            <p>Maintained with your agent, grounded in your Library.</p>
            {leadSentence ? (
              <p className="wiki-living-index__briefing" aria-label="Current Wiki briefing">
                <WriteIn text={leadSentence} />
              </p>
            ) : null}
            {availabilityNotice ? <p className="wiki-front-page__availability" role="status">{availabilityNotice}</p> : null}
          </header>

          <label className="wiki-living-index__search">
            <span className="sr-only">Search your wikis</span>
            <input
              type="search"
              value={wikiSearch}
              onChange={event => setWikiSearch(event.target.value)}
              placeholder="Search your wikis…"
            />
          </label>

          {pages.length >= INDEX_PAGE_LIMIT ? (
            <p className="wiki-front-page__library-boundary">
              Showing the first {INDEX_PAGE_LIMIT} pages. Open the full workspace for the complete index.
            </p>
          ) : null}

          <div className="wiki-living-table" role="table" aria-label="Living Wiki pages">
            <div className="wiki-living-table__head" role="row">
              <span role="columnheader">Wiki</span>
              <span role="columnheader">Grounded in</span>
              <span role="columnheader">Last review</span>
              <span role="columnheader">Maintenance state</span>
            </div>
            {explorePages.length ? explorePages.map((page) => {
              const id = String(pageId(page));
              const changedByLibrary = sourceMaterialIds.has(id);
              const reviewState = wikiReviewState(page, changedByLibrary);
              return (
                <div
                  key={id}
                  className={`wiki-living-row${changedByLibrary ? ' is-library-changed' : ''}`}
                  role="row"
                >
                  <div className="wiki-living-row__title" role="cell">
                    <span aria-hidden="true" />
                    <div>
                      <Link to={wikiPagePath(id)}>{displayWikiPageTitle(page, 'Untitled page')}</Link>
                      <small>{isDeveloperWiki(page) ? 'Developer wiki' : labelFor(page.pageType || 'topic')}</small>
                    </div>
                  </div>
                  <span role="cell">{wikiGroundingLabel(page)}</span>
                  <span role="cell">{wikiReviewDate(page)}</span>
                  <span className={`wiki-living-row__state is-${reviewState.tone}`} role="cell">
                    <i aria-hidden="true" />
                    {reviewState.label}
                  </span>
                  <Link className="wiki-living-row__open" to={wikiPagePath(id)} aria-label={`Open ${displayWikiPageTitle(page, 'Wiki page')}`}>→</Link>
                </div>
              );
            }) : (
              <p className="wiki-living-table__empty">No Wiki pages match this view.</p>
            )}
          </div>

          {sourceMaterialPages.length ? (
            <section className="wiki-living-changes" aria-labelledby="wiki-living-changes-title">
              <div>
                <p className="wiki-index__eyebrow">Library signal</p>
                <h2 id="wiki-living-changes-title">Changed by your Library</h2>
              </div>
              <ol>
                {sourceMaterialPages.map((page) => (
                  <li key={pageId(page)}>
                    <Link to={wikiPagePath(pageId(page))}>{displayWikiPageTitle(page, 'Untitled page')}</Link>
                    <span>New grounded material is available.</span>
                    <Link to={wikiPagePath(pageId(page))}>Review evidence →</Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </section>

        <aside className="wiki-living-curator wfp-anim wfp-anim--3" aria-label="Wiki Curator">
          <header>
            <p className="wiki-index__eyebrow">Persistent agent</p>
            <h2>Curator</h2>
            <p>Build or update a wiki, or connect a developer wiki.</p>
          </header>
          <section className="wiki-living-curator__builder" aria-labelledby="wiki-curator-build">
            <h3 id="wiki-curator-build">Build or update a wiki</h3>
            <WikiBuildPageComposer compact className="wiki-front-page__builder" />
          </section>
          <section className="wiki-living-curator__repo" aria-labelledby="wiki-curator-repo">
            <h3 id="wiki-curator-repo">Developer wiki</h3>
            <p>Connect a public GitHub repository to create a maintained developer reference.</p>
            <WikiRepoCreateComposer compact className="wiki-front-page__repo-builder" />
          </section>
          {briefingNextAction ? (
            <div className="wiki-living-curator__return">
              <span>Return path</span>
              <Link to={briefingNextAction.href}>{briefingNextAction.label} →</Link>
              {briefingNextAction.reason ? <p>{briefingNextAction.reason}</p> : null}
            </div>
          ) : null}
          <details className="wiki-living-curator__conversation">
            <summary>Ask the Curator</summary>
            <AgentContextShell
              surface="wiki"
              title="Curator"
              orientation={todaysPage
                ? `Continue from ${displayWikiPageTitle(todaysPage, 'your living knowledge')}.`
                : 'Read what you know or begin a new thought.'}
              loading={loading}
              loadingMessage="Retrieving Wiki context…"
              error={error}
              showPresence={false}
            >
              <ThoughtPartnerPanel
                className="wiki-front-page__partner"
                variant="stream"
                contextType="wiki"
                contextId="wiki-front"
                contextTitle="Wiki"
                contextMetadata={{
                  summary: todaysPage
                    ? `${displayWikiPageTitle(todaysPage, 'A living page')} is the current lead.`
                    : 'No living page is selected yet.',
                  nextActions: curatedPages.slice(0, 3).map((page) => displayWikiPageTitle(page, '')).filter(Boolean)
                }}
                title="Curator"
                subtitle={`${AGENT_DISPLAY_NAME} · grounded in your Library`}
                placeholder="Ask what to build, revisit, or challenge."
                promptTemplates={[
                  'What changed in my Library?',
                  'Which wiki needs review?',
                  'Build a wiki from this topic.'
                ]}
                showQuickPrompts={false}
                emptyStateText="Ask when you want help building or revisiting durable knowledge. Material changes still wait for your review."
                submitLabel="↗"
              />
            </AgentContextShell>
          </details>
        </aside>
      </div>

      {operationalWorkspace}

      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
    </WikiFrontPageShell>
  );
};

export default WikiFrontPage;
