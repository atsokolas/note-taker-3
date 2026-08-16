import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { askWikiPage, listWikiPages } from '../../api/wiki';
import {
  armReadingWatch,
  disarmWatcher,
  getDailyLoop,
  recordClaimCheckIn
} from '../../api/dailyLoop';
import { wikiReadPath } from '../../utils/wikiFeatureFlags';
import { handOffSentence, takeFirstPaint } from '../../motion/columnMotion';
import { useAgentRailSurface } from '../../agent/AgentRailContext';
import { docText, oneSentence } from '../../pages/judgmentModel';
import { isWikiOnboardingComplete, markWikiOnboardingComplete } from '../../onboarding/onboardingState';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import WikiRepoCreateComposer from './WikiRepoCreateComposer';
import WikiCompanyDossierComposer from './WikiCompanyDossierComposer';
import { countWikiClaims, countWikiSources, wikiPreviewForPage } from './wikiPageMetrics';
import { filterReturnViewItems } from '../../utils/cruftSuppression';
import { listDailyResurface, listReturnQueue } from '../../api/returnQueue';
import {
  dedupePagesByRepoKey,
  filterPagesForTodaysPage,
  isEligibleForTodaysPage
} from './wikiRepoDedupeModel';
import { displayWikiPageTitle } from './wikiRepoDossierModel';
import '../../styles/wiki-critical.css';
import '../../styles/wiki-front-page.css';

// AT-394 — the wiki front page. Opening Noeis lands here: a newspaper-shaped
// reading surface. Alive the way a newspaper on the doorstep is alive — new
// today, and it arrives (one brief entrance, then stillness). The maintenance
// workspace (map, review queues, drop-source, telemetry) lives behind one
// hairline link; it is no longer the front door.

const INDEX_PAGE_LIMIT = 80;
const LEAD_EXCERPT_BUDGET = 320;
const GROWN_LIMIT = 3;
const WIKI_FRONT_PAGE_CACHE_KEY = 'noeis.wiki.frontPageSnapshot.v1';
const WIKI_FRONT_PAGE_CACHE_MAX_AGE_MS = 36 * 60 * 60 * 1000;

const pageId = (page) => (page && (page._id || page.id || page.pageId)) || '';

const pageWeight = (page = {}) => (
  countWikiSources(page) * 3
  + countWikiClaims(page) * 2
  + (page.updatedAt ? 1 : 0)
  + (page.lastReviewedAt ? 1 : 0)
);

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
  <main className="wiki-page wiki-front-page" {...mainProps}>
    {children}
  </main>
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
  const [pages, setPages] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [hasAnyWikiContent, setHasAnyWikiContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const claimSentenceRef = useRef(null);
  // The stagger is a first-paint cue. Coming back to the paper you already read
  // this morning crossfades instead of reassembling itself.
  const arriving = useMemo(() => takeFirstPaint('wiki-front-page'), []);
  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : 'wiki-front-page__return');
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState('');
  const [revisionDraft, setRevisionDraft] = useState('');
  const [showRevisionDraft, setShowRevisionDraft] = useState(false);
  const [readingFeedUrl, setReadingFeedUrl] = useState('');
  const [readingPageId, setReadingPageId] = useState('');
  const [watchingBusy, setWatchingBusy] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [resurfaceCount, setResurfaceCount] = useState(0);

  /* Review and the Return Queue used to be rooms you had to remember to visit.
     What they hold is "things asking for your attention", which is what the
     paper is for — so the paper says how much is waiting and links through to
     the full view. A failure here is silent: the paper is still the paper. */
  useEffect(() => {
    let cancelled = false;
    listReturnQueue({ filter: 'due' })
      .then(items => { if (!cancelled) setDueCount(Array.isArray(items) ? items.length : 0); })
      .catch(() => {});
    listDailyResurface()
      .then(items => { if (!cancelled) setResurfaceCount(Array.isArray(items) ? items.length : 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.body.classList.add('wiki-front-page-route');
    return () => {
      document.body.classList.remove('wiki-front-page-route');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = readFrontPageCache();
    if (cached) {
      setPages(cached.pages);
      setBriefing(cached.briefing);
      setHasAnyWikiContent(cached.hasAnyWikiContent);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError('');
    Promise.allSettled([
      listWikiPages({ limit: INDEX_PAGE_LIMIT, includeLowQuality: 1 }),
      getDailyLoop()
    ]).then(([pagesResult, briefingResult]) => {
      if (cancelled) return;
      const nextPages = pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value)
        ? pagesResult.value
        : cached?.pages || [];
      const nextHasAnyWikiContent = pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value)
        ? pagesResult.value.length > 0
        : cached?.hasAnyWikiContent ?? null;
      const nextBriefing = briefingResult.status === 'fulfilled' && briefingResult.value?.briefing
        ? briefingResult.value.briefing
        : cached?.briefing || null;

      if (pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value)) {
        setPages(nextPages);
      } else if (!cached) {
        setError('Failed to load wiki pages.');
      }
      setHasAnyWikiContent(nextHasAnyWikiContent);
      if (briefingResult.status === 'fulfilled' && briefingResult.value?.briefing) {
        setBriefing(nextBriefing);
      }
      if (pagesResult.status === 'fulfilled' || briefingResult.status === 'fulfilled') {
        writeFrontPageCache({
          pages: nextPages,
          briefing: nextBriefing,
          hasAnyWikiContent: nextHasAnyWikiContent
        });
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const curatedPages = useMemo(
    () => dedupePagesByRepoKey(filterReturnViewItems(pages)),
    [pages]
  );
  // First-run *routing* is owned by FirstRunGate at the app shell, so a new user
  // meets onboarding wherever they land rather than only here. What stays is the
  // part only this page can do: hold a placeholder instead of flashing an empty
  // front page while the gate redirects, and record that a user who already has a
  // wiki is past onboarding — which it knows from data it had to load anyway.
  const onboardingComplete = isWikiOnboardingComplete();
  const shouldOpenOnboarding = !loading && !error && !onboardingComplete && hasAnyWikiContent === false;

  useEffect(() => {
    if (loading || error) return;
    if (hasAnyWikiContent !== true) return;
    if (onboardingComplete) return;
    markWikiOnboardingComplete();
  }, [error, hasAnyWikiContent, loading, onboardingComplete]);

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

  const recentlyGrown = useMemo(() => {
    const leadId = String(pageId(todaysPage));
    const fromBriefing = recentlyUpdated.filter(page => String(pageId(page)) !== leadId);
    if (fromBriefing.length >= GROWN_LIMIT) return fromBriefing.slice(0, GROWN_LIMIT);
    const fallback = dedupePagesByRepoKey([...curatedPages])
      .filter(page => page.updatedAt && String(pageId(page)) !== leadId)
      .filter(page => isEligibleForTodaysPage(page, briefing))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .filter(page => !fromBriefing.some(existing => pageId(existing) === pageId(page)));
    return dedupePagesByRepoKey([...fromBriefing, ...fallback]).slice(0, GROWN_LIMIT);
  }, [recentlyUpdated, curatedPages, todaysPage, briefing]);

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

  const leadSentence = completeLeadSentence(
    briefing?.lead
      ? `${briefing.lead.title}. ${briefing.lead.page?.title || 'A watched page'} · ${briefing.lead.impactSummary || 'not yet analyzed — queued'}.`
      : briefing?.summary || ''
  );
  const leadExcerpt = todaysPage ? wikiPreviewForPage(todaysPage, LEAD_EXCERPT_BUDGET) : '';
  const claimCheckIn = briefing?.claimCheckIn || null;
  /* The paper's rail is about the claim it is asking you about this morning. It
     is the same claim you will be looking at if you open it, so the agent is
     already pointed at the right page before you get there. */
  useAgentRailSurface(
    {
      id: claimCheckIn ? `wiki-paper:${claimCheckIn.pageId}` : 'wiki-paper',
      subject: claimCheckIn ? claimCheckIn.text : 'The morning paper.',
      empty: claimCheckIn
        ? 'Nothing to retrieve until you ask.'
        : 'Nothing to retrieve here until a claim comes up for review.'
    },
    claimCheckIn ? {
      onAsk: async (question) => {
        const answered = await askWikiPage(claimCheckIn.pageId, question);
        const discussions = Array.isArray(answered?.discussions) ? answered.discussions : [];
        const sentence = oneSentence(docText(discussions[discussions.length - 1]?.answer));
        if (!sentence) return null;
        return {
          id: `paper-ask:${discussions.length}:${sentence.slice(0, 24)}`,
          sentence,
          body: sentence,
          origin: 'Asked of this claim',
          // The paper does not write into the claim contract; opening it does.
          fields: ['read']
        };
      }
    } : {}
  );
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

  const renderWatcher = (watch) => {
    const labelParts = String(watch.label || '').split('·').map(part => part.trim()).filter(Boolean);
    const watcherType = labelParts[0] || 'Watch';
    const watcherIdentity = labelParts.slice(1).join(' · ') || watch.page?.title || 'Source';
    const attention = Boolean(watch.errorMessage) || ['error', 'failed', 'attention'].includes(String(watch.status || '').toLowerCase());
    return (
      <li key={watch.id} className={attention ? 'is-attention' : ''}>
        <div className="wiki-front-page__watching-main">
          <span className="wiki-front-page__watching-type">{watcherType}</span>
          <div className="wiki-front-page__watching-copy">
            <strong>{watcherIdentity}</strong>
            <span>{watch.page.title} · {watch.detail}</span>
            {watch.errorMessage ? <em>{watch.errorMessage}</em> : null}
          </div>
        </div>
        <button
          className="ui-button ui-button-tertiary wiki-front-page__watching-action"
          type="button"
          disabled={watchingBusy}
          onClick={() => handleDisarmWatcher(watch)}
        >
          Disarm
        </button>
      </li>
    );
  };

  if (loading) {
    return (
      <WikiFrontPageShell aria-busy="true">
        <h1 className="sr-only">Morning paper</h1>
        <p className="wiki-index__eyebrow wiki-front-page__masthead">
          Morning paper · {mastheadDate()}
        </p>
        <p className="wiki-front-page__loading-copy" role="status">
          Checking overnight edits and drift signals...
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
        <h1 className="sr-only">Opening your wiki</h1>
        <p className="wiki-index__eyebrow wiki-front-page__masthead">
          Morning paper · {mastheadDate()}
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
          <div className={`wiki-front-page__top-row ${step(1)}`}>
            <p className="wiki-index__eyebrow wiki-front-page__masthead">
              Morning paper · {mastheadDate()}
            </p>
            {workspaceNav}
          </div>
        </header>
        <section className={`wiki-front-page__empty ${step(3)}`} aria-labelledby="wfp-empty-title">
          <h1 id="wfp-empty-title">Nothing here yet — let&rsquo;s start your wiki.</h1>
          <p>
            Save something you&rsquo;re reading and {AGENT_DISPLAY_NAME} will turn it into your
            first page, or ask for a page on anything you&rsquo;re thinking about.
          </p>
        </section>
        <section className={`wiki-front-page__composer ${step(4)}`} aria-label="Build a wiki page">
          <WikiBuildPageComposer compact className="wiki-front-page__builder" />
        </section>
        <section className={`wiki-front-page__repo-create ${step(5)}`} aria-label="Create a repo wiki">
          <WikiRepoCreateComposer compact className="wiki-front-page__repo-builder" />
        </section>
        <WikiCompanyDossierComposer className={`wiki-front-page__company-builder ${step(6)}`} />
        {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      </WikiFrontPageShell>
    );
  }

  return (
    <WikiFrontPageShell>
      <p className={`wiki-front-page__masthead ${step(1)}`}>
        Morning paper · {mastheadDate()}
      </p>

      {/* The lead is the claim. It is the sentence the human is being asked
          about this morning, and it is the same sentence on the other side of
          "Open claim". */}
      {claimCheckIn ? (
        <section className={`wiki-front-page__lead-claim ${step(2)}`} aria-labelledby="morning-claim-check-in">
          <h1 id="morning-claim-check-in" ref={claimSentenceRef}>{claimCheckIn.text}</h1>
          {showRevisionDraft ? (
            <div className="wiki-front-page__check-in-revision">
              <textarea
                className="noeis-form-control"
                aria-label="Revised claim"
                value={revisionDraft}
                onChange={(event) => setRevisionDraft(event.target.value)}
                rows={3}
              />
              <button className="ui-button ui-button-primary" type="button" disabled={checkInBusy || !revisionDraft.trim()} onClick={() => handleCheckIn('revised', revisionDraft)}>Save revision</button>
              <button className="ui-button ui-button-tertiary" type="button" disabled={checkInBusy} onClick={() => setShowRevisionDraft(false)}>Cancel</button>
            </div>
          ) : (
            <div className="wiki-front-page__check-in-actions">
              <button type="button" disabled={checkInBusy} onClick={() => handleCheckIn('reaffirmed')}>Still hold</button>
              <button type="button" disabled={checkInBusy} onClick={() => { setRevisionDraft(claimCheckIn.text); setShowRevisionDraft(true); }}>Revise</button>
              <button type="button" disabled={checkInBusy} onClick={() => handleCheckIn('retired')}>Retire</button>
              {/* Opening the claim does not write a new headline on the next
                  page — the sentence the human is already reading travels
                  there and becomes the title. */}
              <Link
                to={`/judgment/${claimCheckIn.pageId}`}
                onClick={() => handOffSentence(claimCheckIn.text, claimSentenceRef.current)}
              >
                Open claim
              </Link>
            </div>
          )}
        </section>
      ) : leadSentence ? (
        <p className={`wiki-front-page__lead ${step(2)}`}>
          <WriteIn text={leadSentence} />
        </p>
      ) : (
        <h1 className="sr-only">Morning paper</h1>
      )}

      {checkInMessage ? <p className="wiki-front-page__check-in-register" role="status">{checkInMessage}</p> : null}

      {todaysPage ? (
        <section className={`wiki-front-page__story ${step(3)}`} aria-labelledby="wfp-story-title">
          <p className="wiki-front-page__kicker">Continue</p>
          <h2 id="wfp-story-title">
            <Link to={wikiReadPath(pageId(todaysPage))}>{displayWikiPageTitle(todaysPage, 'Untitled page')}</Link>
          </h2>
          {leadExcerpt ? <p className="wiki-front-page__excerpt">{leadExcerpt}</p> : null}
          <Link className="wiki-front-page__continue" to={wikiReadPath(pageId(todaysPage))}>
            Continue reading →
          </Link>
        </section>
      ) : null}

      {recentlyGrown.length ? (
        <section className={`wiki-front-page__grown ${step(4)}`} aria-labelledby="wfp-grown-title">
          <p className="wiki-front-page__kicker" id="wfp-grown-title">Recently grown</p>
          <ol>
            {recentlyGrown.map(page => (
              <li key={pageId(page)}>
                <Link to={wikiReadPath(pageId(page))}>{displayWikiPageTitle(page, 'Untitled page')}</Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {dueCount ? (
        <p className={`wiki-front-page__waiting ${step(5)}`}>
          <Link to="/return-queue">
            {dueCount} thing{dueCount === 1 ? '' : 's'} you set aside {dueCount === 1 ? 'is' : 'are'} due.
          </Link>
        </p>
      ) : null}

      {/* The other thing that was waiting in a room of its own. Resurfacing is
          old highlights offered back to you; it belongs on the paper for the
          same reason the return queue does. The room is still there — this is
          the line that remembers it for you. */}
      {resurfaceCount ? (
        <p className={`wiki-front-page__waiting ${step(5)}`}>
          <Link to="/review?tab=resurface">
            {resurfaceCount} highlight{resurfaceCount === 1 ? '' : 's'} to see again.
          </Link>
        </p>
      ) : null}

      {/* What is being watched is one sentence, not a rail. Arming and
          disarming are still here — behind the sentence, because they are
          maintenance, and maintenance is not the face of the paper. */}
      <details className={`wiki-front-page__watching ${step(5)}`}>
        <summary>
          {watching.length
            ? `Watching ${watching.length} source${watching.length === 1 ? '' : 's'}.`
            : 'Watching nothing yet.'}
        </summary>
        {watching.length ? <ul>{watching.map(renderWatcher)}</ul> : null}
        <form className="wiki-front-page__reading-watch" onSubmit={handleArmReading}>
          <label>
            Page
            <select className="noeis-form-control" aria-label="Reading watch page" value={readingPageId} onChange={(event) => setReadingPageId(event.target.value)} required>
              <option value="">Choose a page</option>
              {curatedPages.map(page => <option key={pageId(page)} value={pageId(page)}>{displayWikiPageTitle(page, 'Untitled page')}</option>)}
            </select>
          </label>
          <label>
            RSS or Atom URL
            <input className="noeis-form-control" type="url" aria-label="RSS or Atom URL" value={readingFeedUrl} onChange={(event) => setReadingFeedUrl(event.target.value)} placeholder="https://example.com/feed" required />
          </label>
          <button className="ui-button ui-button-secondary" type="submit" disabled={watchingBusy}>{watchingBusy ? 'Arming…' : 'Watch feed'}</button>
        </form>
      </details>

      {/* Building a page is not the face either, but it must stay reachable. */}
      <details className={`wiki-front-page__making ${step(5)}`}>
        <summary>Make a page</summary>
        <div className="wiki-front-page__creation-tools">
          <section className="wiki-front-page__composer" aria-label="Ask or build a wiki page">
            <WikiBuildPageComposer compact className="wiki-front-page__builder" />
          </section>
          <section className="wiki-front-page__repo-create" aria-label="Create a repo wiki from GitHub">
            <WikiRepoCreateComposer compact className="wiki-front-page__repo-builder" />
          </section>
          <WikiCompanyDossierComposer className="wiki-front-page__company-builder" />
        </div>
      </details>

      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
    </WikiFrontPageShell>
  );
};

export default WikiFrontPage;
