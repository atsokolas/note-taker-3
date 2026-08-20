import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listWikiPages } from '../../api/wiki';
import {
  armReadingWatch,
  disarmWatcher,
  getDailyLoop,
  recordClaimCheckIn
} from '../../api/dailyLoop';
/* Clicking a page's name means reading it. wikiPagePath goes to the maintenance
   workspace — three panes, a metadata table, an open chat — which is the right
   place to work on a page and the wrong place to land when you clicked its name
   in a list. The reader carries a Workspace link for when you do want to work. */
import { wikiPagePath, wikiReadPath } from '../../utils/wikiFeatureFlags';
import { isWikiOnboardingComplete, markWikiOnboardingComplete } from '../../onboarding/onboardingState';
import { purgeUnscopedKeys, scopedKey } from '../../utils/browserScope';
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
import { groupWikiPagesByTitle, sameTitleToggleLabel } from './wikiTitleGroupModel';
import { briefOpening, buildWeeklyBrief } from '../../pages/weeklyBriefModel';
import { displayWikiPageTitle } from './wikiRepoDossierModel';
import { labelFor } from './wikiGraph';
import Paper from '../../pages/Paper';
import '../../styles/wiki-critical.css';
import '../../styles/wiki-front-page.css';

// AT-394 — the wiki front page. Opening Noeis lands here: a newspaper-shaped
// reading surface. Alive the way a newspaper on the doorstep is alive — new
// today, and it arrives (one brief entrance, then stillness). The maintenance
// workspace (map, review queues, drop-source, telemetry) lives behind one
// hairline link; it is no longer the front door.

const INDEX_PAGE_LIMIT = 500;
const WATCHING_PREVIEW_LIMIT = 5;
const WIKI_FRONT_PAGE_CACHE_KEY = 'noeis.wiki.frontPageSnapshot.v1';
// Namespaced per account: this snapshot holds page titles, briefing text, and the
// has-any-content signal that decides whether first-run onboarding runs. Shared
// across accounts on one browser, it showed one user's material to another and
// skipped onboarding for genuinely new users.
const frontPageCacheKey = () => scopedKey(WIKI_FRONT_PAGE_CACHE_KEY);
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

// externalWatches.githubRepo is a schema sub-document with defaults, so it exists
// on every page and Boolean() of it is always true. Every ordinary wiki was being
// labelled a developer wiki and counted as one — a Wikipedia article showed as
// "DEVELOPER WIKI · 2 repository sources" on production. Ask for actual repository
// identity instead of the container's presence.
const isDeveloperWiki = (page = {}) => {
  if (page.pageType === 'repo') return true;
  if (page.repoKey) return true;
  const watch = page.externalWatches?.githubRepo || {};
  return Boolean(
    String(watch.owner || '').trim()
    || String(watch.repo || '').trim()
    || String(watch.lastHeadSha || '').trim()
    || String(watch.publishedHeadSha || '').trim()
  );
};

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

/* The Paper is the top of this page now, not a room beside it.
   It was in the nav and at /paper, and the wiki opened onto its own morning
   briefing, so the product had two front pages saying overlapping things and a
   nav that named both. There is one: what the reading turned up this morning,
   and under it everything the reading has built. It sits above every state of
   this page — including the loading one, so the wiki is never a blank curtain
   while it fetches. */
const WikiFrontPageShell = ({ children, lead = null, tail = null, ...mainProps }) => (
  <>
    <WikiFrontPageGraphMotif />
    <main className="wiki-page wiki-front-page" {...mainProps}>
      {/* The morning paper: a claim you hold, then what to continue, then what
          grew. The lead and the tail are this page's; the middle is the
          reading loop's, which is why the paper takes them as slots. */}
      <Paper compact lead={lead} tail={tail} />
      {children}
    </main>
  </>
);

const readFrontPageCache = () => {
  try {
    // A pre-scoping snapshot belongs to whichever account wrote it. Drop it rather
    // than let it seed this one.
    purgeUnscopedKeys([WIKI_FRONT_PAGE_CACHE_KEY]);
    const raw = window.localStorage?.getItem(frontPageCacheKey());
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
    window.localStorage?.setItem(frontPageCacheKey(), JSON.stringify({
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

  /* Same title, one row — the rule the workspace list already uses, applied to
     the index a person actually meets. The agent drafts a page more than once,
     so this table was printing one wiki as three and counting it as three. The
     copy that survives is the one the Library grounds; the rest sit behind a
     count and open with a click. Nothing is deleted. */
  const titleGroups = useMemo(() => groupWikiPagesByTitle(curatedPages), [curatedPages]);
  const canonicalPages = useMemo(() => titleGroups.map(group => group.canonical), [titleGroups]);
  const sameTitleById = useMemo(() => new Map(
    titleGroups
      .filter(group => group.others.length)
      .map(group => [String(pageId(group.canonical)), group.others])
  ), [titleGroups]);
  const [openTitleIds, setOpenTitleIds] = useState(() => new Set());
  const toggleSameTitle = (id) => setOpenTitleIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
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

  const sourceMaterialIds = useMemo(
    () => new Set(sourceMaterialPages.map(page => String(pageId(page)))),
    [sourceMaterialPages]
  );

  const weighted = useMemo(() => (
    [...canonicalPages].sort((a, b) => pageWeight(b) - pageWeight(a)
      || String(a.title || '').localeCompare(String(b.title || '')))
  ), [canonicalPages]);

  /* Today's page: the agent's most recently enriched page, otherwise the
     strongest in the corpus. Repo wikis only lead when they actually changed.
     This existed only to write the Curator's orientation sentence; now it leads
     the page, which is what it was always the right answer to. */
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
    canonicalPages.forEach((page) => {
      if (isDeveloperWiki(page)) return;
      const kind = String(page.pageType || 'topic').trim() || 'topic';
      counts.set(kind, (counts.get(kind) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || labelFor(a[0]).localeCompare(labelFor(b[0])));
  }, [canonicalPages]);

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

  const exactReviewCount = useMemo(() => canonicalPages.filter(page => (
    pendingWikiReview(page) || sourceMaterialIds.has(String(pageId(page)))
  )).length, [canonicalPages, sourceMaterialIds]);

  const developerWikiCount = useMemo(
    () => canonicalPages.filter(isDeveloperWiki).length,
    [canonicalPages]
  );

  const reviewCount = briefing?.counts?.driftingPages
    ?? (Array.isArray(briefing?.driftingPages) ? briefing.driftingPages.length : 0);

  const workspaceNav = (
    <nav className="wiki-front-page__secondary-nav" aria-label="Wiki workspace">
      <Link to="/wiki/workspace?view=graph">Knowledge map</Link>
      <Link to="/wiki/workspace?view=list">All pages</Link>
      <Link to="/wiki/workspace?view=list&quality=needs_review">Needs review</Link>
      {/* Where the library disagrees with itself. A contradiction used to be a
          colour inside one article, which meant you found it only if you were
          already reading that page. */}
      <Link to="/wiki/contradictions">Disagreements</Link>
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

  /* The lead is a claim you hold and the four things you can do about it.
     It was already here — Still hold, Revise, Retire, Open claim — but folded
     inside "Review and system activity", which is a place you go rather than a
     thing you meet. Opening Noeis should mean being asked whether you still
     believe something. */
  const paperLead = (
    <div className="wfp-lead">
      <p className="wfp-lead__eyebrow">Morning paper · {mastheadDate()}</p>
      {claimCheckIn ? (
        <>
          <h2 className="wfp-lead__claim">{claimCheckIn.text}</h2>
          <p className="wfp-lead__where">
            <Link to={claimCheckIn.href}>{claimCheckIn.pageTitle}</Link>
            {claimCheckIn.changedSinceLastCheck ? <span> · evidence changed since your last review</span> : null}
          </p>
          {showRevisionDraft ? (
            <div className="wfp-lead__revision">
              <textarea
                aria-label="Revised claim"
                value={revisionDraft}
                onChange={(event) => setRevisionDraft(event.target.value)}
                rows={3}
              />
              <div className="wfp-lead__verbs">
                <button type="button" disabled={checkInBusy || !revisionDraft.trim()} onClick={() => handleCheckIn('revised', revisionDraft)}>Save revision</button>
                <button type="button" disabled={checkInBusy} onClick={() => setShowRevisionDraft(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="wfp-lead__verbs">
              <button type="button" disabled={checkInBusy} onClick={() => handleCheckIn('reaffirmed')}>Still hold</button>
              <button type="button" disabled={checkInBusy} onClick={() => { setRevisionDraft(claimCheckIn.text); setShowRevisionDraft(true); }}>Revise</button>
              <button type="button" disabled={checkInBusy} onClick={() => handleCheckIn('retired')}>Retire</button>
              <Link to={claimCheckIn.href}>Open claim</Link>
            </div>
          )}
        </>
      ) : (
        /* No claim is due. The page says so in one line rather than promoting
           something else into the space to keep it full. */
        <h2 className="wfp-lead__claim wfp-lead__claim--quiet">
          {checkInMessage || 'No claim is due for review this morning.'}
        </h2>
      )}
    </div>
  );

  /* What grew, what is being watched, and the way to everything you have read. */
  /* The week belongs on the paper, in the same column the morning briefing
     arrives in — a standing weekly line under the daily one, rather than a
     room you would have to remember to visit. It is assembled from the pages
     this page already loaded, so it costs nothing extra to say. */
  const week = useMemo(
    () => buildWeeklyBrief({ pages, events: briefing?.sourceEvents || [] }),
    [pages, briefing]
  );

  const paperTail = (
    <div className="wfp-tail">
      {curatedPages.length ? (
        <>
          <p className="wfp-tail__cap">Recently grown</p>
          <ol className="wfp-tail__list">
            {curatedPages.slice(0, 3).map(page => (
              <li key={pageId(page)}>
                <Link to={wikiReadPath(pageId(page))}>{page.title}</Link>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {watching.length ? (
        <p className="wfp-tail__quiet">Watching {watching.length} source{watching.length === 1 ? '' : 's'}.</p>
      ) : null}
      {/* The week, under the day. One sentence and a way in; the page itself
          has the rest. A quiet week says so rather than being hidden, because
          "nothing needed you" is a real answer and worth reading. */}
      <p className="wfp-tail__week">
        <span>{briefOpening(week)}</span>
        <Link to="/week">Your week →</Link>
      </p>
      {/* Everything the reading has built — the wiki's own pages, not the
          article shelf. The three above are what grew most recently; this is
          the rest of them. */}
      <p className="wfp-tail__door">
        <Link to="/wiki/workspace?view=list">See every page in your wiki →</Link>
      </p>
    </div>
  );

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
        {/* A watcher without a page took the whole front page down with a
            TypeError — nothing renders, white screen. It is armed against
            something even when that something is not a page yet. */}
        <span>
          {[watch.page?.title, watch.detail].filter(Boolean).join(' · ')}
        </span>
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
            {/* The claim check-in used to live here, inside "Review and system
                activity". It is the lead of the paper now — a claim you hold and
                the four things you can do about it — so it is not also folded
                away in the operations panel. */}

            {/* What a check-in registered is reported by the lead, which is
                where the check-in now happens. Saying it twice made the page
                answer a question nobody asked twice. */}
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
      <WikiFrontPageShell lead={paperLead} tail={paperTail}>
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
    <WikiFrontPageShell lead={paperLead} tail={paperTail}>
      <div className="wiki-living-shell">
        <aside className="wiki-living-nav wfp-anim wfp-anim--1" aria-label="Wiki views">
          <div className="wiki-living-nav__head">
            <span>Wiki</span>
            <strong>{canonicalPages.length}</strong>
          </div>
          <nav>
            {[
              ['all', 'All wikis', canonicalPages.length],
              ['topics', 'Topics', canonicalPages.length - developerWikiCount],
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
            <Link to="/wiki/contradictions">Disagreements</Link>
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

          {/* Where you were. The lead page the agent worked on last, or the
              strongest page in the corpus — one line above the list, because
              the first useful thing this page can do is put you back where you
              were rather than make you find it in a table. */}
          {todaysPage ? (
            <p className="wiki-front-page__continue">
              <span>Continue</span>
              <Link to={wikiReadPath(pageId(todaysPage))}>
                {displayWikiPageTitle(todaysPage, 'Your living page')}
              </Link>
            </p>
          ) : null}

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
            {explorePages.length ? explorePages.flatMap((page) => {
              const id = String(pageId(page));
              const sameTitle = sameTitleById.get(id) || [];
              const open = openTitleIds.has(id);
              const row = (item, folded = false) => {
                const rowId = String(pageId(item));
                const changedByLibrary = sourceMaterialIds.has(rowId);
                const reviewState = wikiReviewState(item, changedByLibrary);
                return (
                  <div
                    key={rowId}
                    className={`wiki-living-row${changedByLibrary ? ' is-library-changed' : ''}${folded ? ' wiki-living-row--same-title' : ''}`}
                    role="row"
                  >
                    <div className="wiki-living-row__title" role="cell">
                      <span aria-hidden="true" />
                      <div>
                        <Link to={wikiReadPath(rowId)}>{displayWikiPageTitle(item, 'Untitled page')}</Link>
                        <small>{isDeveloperWiki(item) ? 'Developer wiki' : labelFor(item.pageType || 'topic')}</small>
                        {!folded && sameTitle.length ? (
                          <button
                            type="button"
                            className="wiki-living-row__same-title"
                            aria-expanded={open}
                            onClick={() => toggleSameTitle(id)}
                          >
                            {sameTitleToggleLabel(sameTitle.length, open)}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <span role="cell">{wikiGroundingLabel(item)}</span>
                    <span role="cell">{wikiReviewDate(item)}</span>
                    <span className={`wiki-living-row__state is-${reviewState.tone}`} role="cell">
                      <i aria-hidden="true" />
                      {reviewState.label}
                    </span>
                    <Link className="wiki-living-row__open" to={wikiReadPath(rowId)} aria-label={`Open ${displayWikiPageTitle(item, 'Wiki page')}`}>→</Link>
                  </div>
                );
              };
              return open
                ? [row(page), ...sameTitle.map(item => row(item, true))]
                : [row(page)];
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
                    <Link to={wikiReadPath(pageId(page))}>{displayWikiPageTitle(page, 'Untitled page')}</Link>
                    <span>New grounded material is available.</span>
                    <Link to={wikiPagePath(pageId(page))}>Review evidence →</Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {/* The return path came off the Curator with it. It is the one thing
              in that pane that was neither a form nor a conversation — it is
              where you were going next — so it stays, as a line. */}
          {briefingNextAction ? (
            <p className="wiki-front-page__return-path wfp-anim wfp-anim--4">
              <Link to={briefingNextAction.href}>{briefingNextAction.label} →</Link>
              {briefingNextAction.reason ? <span>{briefingNextAction.reason}</span> : null}
            </p>
          ) : null}

          {/* The Curator was a second agent: a pane of its own, labelled
              "Persistent agent", sitting beside the rail that is the agent
              everywhere else in the product. Two of them on one screen is the
              thing the rail exists to stop, and this one could not converse as
              well as the rail can.

              What it could do that the rail cannot is build: a page from a
              topic, a developer wiki from a repository. Those are verbs, not
              conversation, so they come into the column as verbs — behind one
              disclosure, because making a page is not the face of the page
              that lists what you already made. */}
          <details className="wiki-front-page__making wfp-anim wfp-anim--4">
            <summary>Build a wiki</summary>
            <div className="wiki-front-page__creation-tools">
              <section aria-label="Build or update a wiki">
                <WikiBuildPageComposer compact className="wiki-front-page__builder" />
              </section>
              <section aria-label="Create a developer wiki from GitHub">
                <p>Connect a public GitHub repository to create a maintained developer reference.</p>
                <WikiRepoCreateComposer compact className="wiki-front-page__repo-builder" />
              </section>
            </div>
          </details>
        </section>

      </div>

      {operationalWorkspace}

      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
    </WikiFrontPageShell>
  );
};

export default WikiFrontPage;
