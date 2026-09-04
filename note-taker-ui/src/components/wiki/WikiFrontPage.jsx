import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { listWikiPages } from '../../api/wiki';
import {
  armReadingWatch,
  disarmWatcher,
  getDailyLoop
} from '../../api/dailyLoop';
/* Clicking a page's name means reading it. wikiPagePath goes to the maintenance
   workspace — three panes, a metadata table, an open chat — which is the right
   place to work on a page and the wrong place to land when you clicked its name
   in a list. The reader carries a Workspace link for when you do want to work. */
import { wikiPagePath, wikiReadPath } from '../../utils/wikiFeatureFlags';
import { isWikiOnboardingComplete, markWikiOnboardingComplete } from '../../onboarding/onboardingState';
import { purgeUnscopedKeys, scopedKey } from '../../utils/browserScope';
import { takeFirstPaint } from '../../motion/columnMotion';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import useLibraryRoom from '../../hooks/useLibraryRoom';
import LibraryPlaces from '../library/LibraryPlaces';
import {
  editionsLine,
  END_OF_PAPER,
  firstMorningLead
} from '../../pages/paperEditions';
import WikiCreationComposer from './WikiCreationComposer';
import WikiMovementReturnSurface from './WikiMovementReturnSurface';
import WikiFrontPageGraphMotif from './WikiFrontPageGraphMotif';
import DecisionsIndex from './decisions/DecisionsIndex';
import MorningCheckIn from './MorningCheckIn';
import MorningAskedBack from './MorningAskedBack';
import WikiDriftSentence from './WikiDriftSentence';
import PaperDesk from './PaperDesk';
import { lastWorked, openCase, shelfPick } from '../../pages/paperDesk';
import { getArticles } from '../../api/articles';
import MorningConsequence from './MorningConsequence';
import MorningVerdict from './MorningVerdict';
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
import { canonicalWikiPages } from './wikiTitleGroupModel';
import { displayWikiPageTitle } from './wikiRepoDossierModel';
import {
  isPaperCheckIn,
  isPaperConsequence,
  isPaperVerdict,
  morningPulseTarget,
  selectQuietSignOff,
  shelfCount,
  wikiLivingBriefingLine
} from './morningPaperClose';
import {
  buildReviewTriage,
  formatReviewTriageFrame
} from './reviewTriageModel';
import {
  WIKI_KINDS,
  WIKI_KIND_FLAGS,
  WIKI_KIND_LABELS,
  wikiKindForPage
} from './wikiFacetModel';
import { buildWikiFrontSurfaceDescriptor } from './wikiSurfaceModel';
import { useNoeisAgentSurface } from '../../agent/AgentRailContext';
import WeeklyDigest from './WeeklyDigest';
import EditionsShelf from './EditionsShelf';
import {
  RoomShelf,
  RoomShelfButton,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection,
  roomShelfItemClass
} from '../collection/RoomShelf';
import '../../styles/wiki-critical.css';
import '../../styles/wiki-front-page.css';
import { normalizeSpaces } from '../../utils/editorialText';

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

const isDeveloperWiki = (page = {}) => wikiKindForPage(page) === 'repository';

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

const wikiReviewReason = (page = {}, changedByLibrary = false) => {
  if (changedByLibrary) return 'New Library evidence may change this page';
  if (page?.judgment?.kind || page?.investmentDossier || page?.activeCompanyDossierKey) {
    return 'Judgment page · owner decision at stake';
  }
  const reason = (Array.isArray(page?.qualityReview?.reasons) ? page.qualityReview.reasons : [])
    .map(value => typeof value === 'string'
      ? value.trim()
      : String(value?.message || value?.label || value?.reason || '').trim())
    .find(Boolean);
  if (reason) return reason;
  return 'Material proposed change awaiting review';
};

const wikiReviewDate = (page = {}) => {
  /* Prefer the signed review clock. lastMaintainedAt is honest for Accepts
     that already closed before lastReviewedAt existed — never invent from
     updatedAt. */
  const reviewedAt = page.lastReviewedAt
    || page.freshness?.lastReviewedAt
    || page.qualityReview?.reviewedAt
    || page.freshness?.lastMaintainedAt;
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

// The morning-paper lead must always be readable as a complete sentence.
// The page still has entrance motion, but the content itself does not reveal
// word-by-word because QA and real users can otherwise catch a dangling phrase.
const WriteIn = ({ text = '' }) => {
  const fullText = useMemo(() => normalizeSpaces(text), [text]);

  return (
    <span className="wiki-front-page__lead-text">{fullText}</span>
  );
};

const mastheadDate = () => new Date().toLocaleDateString(undefined, {
  weekday: 'long', month: 'long', day: 'numeric'
});

/**
 * The masthead: which number this morning is, when it went to press, and the
 * cadences it prints on with the current one underlined. Each part is absent
 * when it is not known — an unnumbered paper is better than one numbered No. 0.
 */
/* The date, and which edition you are holding.

   This also carried an edition number, the hour it went to press, and a
   once-ever milestone keyed off that number. Three true things that told the
   reader nothing they could act on, sitting above a headline. A masthead is a
   date and a way through; the rest was the paper admiring itself. */
const PaperMasthead = ({ driftClosesAt = null, keptCount = null, edition = 'today' }) => (
  <>
    <p className="wiki-index__eyebrow paper-open__masthead">Your Wiki · {mastheadDate()}</p>
    <p className="paper-open__editions">
      {editionsLine({ driftClosesAt, keptCount, edition }).map(part => (
        <span key={part.label} className={part.current ? 'is-current' : undefined}>{part.label}</span>
      ))}
    </p>
  </>
);

/* AT-414: Morning Paper is a close or silence. Collision is named on this
   page when two editorial truths meet; a due claim alone stays silent.
   Overnight already lives on judgment. */
const WikiFrontPageShell = ({ children, ...mainProps }) => (
  <>
    <WikiFrontPageGraphMotif />
    <main className="wiki-page wiki-front-page" {...mainProps}>
      {children}
      <EditionsShelf />
      <WeeklyDigest />
      {/* A paper ends. A feed does not, which is the whole difference. */}
      <p className="paper-open__end" aria-hidden="true">{END_OF_PAPER}</p>
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

const WikiFrontPage = ({ initialKind = '' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  useNoeisAgentSurface('agent-surface.wiki', buildWikiFrontSurfaceDescriptor(), {
    subject: 'Your Wiki.',
    empty: 'Open a page before asking against exact accepted knowledge.'
  }, {});
  const libraryRoom = useLibraryRoom({ view: 'recent' });
  const pageIndexRequestRef = useRef(null);
  const [seed] = useState(() => readFrontPageCache());
  const [pages, setPages] = useState(() => seed?.pages || []);
  const [briefing, setBriefing] = useState(() => seed?.briefing || null);
  const [hasAnyWikiContent, setHasAnyWikiContent] = useState(() => seed?.hasAnyWikiContent ?? null);
  const [loading, setLoading] = useState(() => !seed);
  const [error, setError] = useState('');
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
  const searchParams = new URLSearchParams(location.search);
  const requestedKind = searchParams.get('kind') || initialKind;
  const requestedView = searchParams.get('view');
  const requestedFilter = WIKI_KINDS.includes(requestedKind)
    ? `kind:${requestedKind}`
    : ['review', 'recent'].includes(requestedView) ? requestedView : 'all';
  const [wikiFilter, setWikiFilter] = useState(requestedFilter);
  const [mobileShelfOpen, setMobileShelfOpen] = useState(false);

  useEffect(() => {
    setWikiFilter(requestedFilter);
  }, [requestedFilter]);

  const selectWikiFilter = (value) => {
    setWikiFilter(value);
    const next = new URLSearchParams(location.search);
    next.delete('kind');
    next.delete('view');
    if (value.startsWith('kind:')) next.set('kind', value.slice(5));
    else if (['review', 'recent'].includes(value)) next.set('view', value);
    const query = next.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ''}`, { replace: true });
  };

  useEffect(() => {
    document.body.classList.add('wiki-front-page-route');
    return () => {
      document.body.classList.remove('wiki-front-page-route');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = seed || readFrontPageCache();
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
  }, [seed]);

  const curatedPages = useMemo(
    () => dedupePagesByRepoKey(filterReturnViewItems(pages)),
    [pages]
  );

  const canonicalPages = useMemo(() => canonicalWikiPages(curatedPages), [curatedPages]);
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

  const wikiKindCounts = useMemo(() => {
    const counts = Object.fromEntries(WIKI_KINDS.map(kind => [kind, 0]));
    canonicalPages.forEach((page) => { counts[wikiKindForPage(page)] += 1; });
    return counts;
  }, [canonicalPages]);

  const reviewTriage = briefing?.reviewTriage || null;
  const localTriage = useMemo(
    () => buildReviewTriage({ pages: canonicalPages }),
    [canonicalPages]
  );
  const activeTriage = reviewTriage || localTriage;
  const promotedReviewIds = useMemo(() => new Set(
    (Array.isArray(activeTriage?.promoted) ? activeTriage.promoted : [])
      .map(item => String(item?.pageId || ''))
      .filter(Boolean)
  ), [activeTriage]);
  const reviewReasonById = useMemo(() => new Map(
    (Array.isArray(activeTriage?.promoted) ? activeTriage.promoted : [])
      .map(item => [String(item?.pageId || ''), String(item?.reason || '')])
      .filter(([itemId]) => itemId)
  ), [activeTriage]);

  const explorePages = useMemo(() => {
    const query = wikiSearch.trim().toLowerCase();
    let visible = weighted;
    if (wikiFilter === 'review') visible = activeTriage
      ? visible.filter(page => promotedReviewIds.has(String(pageId(page))))
      : visible.filter(page => (
        pendingWikiReview(page) || sourceMaterialIds.has(String(pageId(page)))
      )).slice(0, 3);
    if (wikiFilter === 'recent') visible = [...visible]
      .filter(page => page.updatedAt)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (wikiFilter.startsWith('kind:')) {
      const kind = wikiFilter.slice(5);
      visible = visible.filter(page => wikiKindForPage(page) === kind);
    }
    if (!query) return visible;
    return visible.filter(page => (
      displayWikiPageTitle(page, 'Untitled page').toLowerCase().includes(query)
      || String(page?.summary || page?.description || '').toLowerCase().includes(query)
    ));
  }, [weighted, wikiSearch, wikiFilter, sourceMaterialIds, activeTriage, promotedReviewIds]);

  const exactReviewCount = useMemo(() => canonicalPages.filter(page => (
    pendingWikiReview(page) || sourceMaterialIds.has(String(pageId(page)))
  )).length, [canonicalPages, sourceMaterialIds]);

  const reviewCount = activeTriage?.totalCount ?? exactReviewCount;
  const reviewFrame = activeTriage?.frame
    || formatReviewTriageFrame({
      promotedCount: Math.min(3, reviewCount),
      minorCount: Math.max(0, reviewCount - 3)
    });

  const workspaceNav = (
    <nav className="wiki-front-page__secondary-nav" aria-label="Wiki workspace">
      <Link to="/wiki/workspace?view=graph">Knowledge map</Link>
      <Link to="/wiki/workspace?view=list">All pages</Link>
      <Link to="/wiki/dossiers">Investment dossiers</Link>
      <Link to="/wiki/workspace?view=list&quality=needs_review">Needs review</Link>
      {/* Where the library disagrees with itself. A contradiction used to be a
          colour inside one article, which meant you found it only if you were
          already reading that page. */}
      <Link to="/wiki/contradictions">Disagreements</Link>
    </nav>
  );

  const leadSentence = wikiLivingBriefingLine({ briefing });
  const paperConsequence = isPaperConsequence(briefing?.consequence) ? briefing.consequence : null;
  const paperCheckIn = isPaperCheckIn(briefing?.claimCheckIn) ? briefing.claimCheckIn : null;
  const paperVerdicts = (Array.isArray(briefing?.claimVerdicts) ? briefing.claimVerdicts : [])
    .filter(isPaperVerdict);
  const pulseTarget = morningPulseTarget({ briefing });
  const briefingReady = briefing != null;
  const quietSignOff = useMemo(() => {
    if (!briefingReady || leadSentence || paperConsequence || wikiFilter === 'review') return '';
    return selectQuietSignOff();
  }, [briefingReady, leadSentence, paperConsequence, wikiFilter]);
  const paperArriving = useMemo(() => takeFirstPaint('wiki-morning-paper'), []);
  const reducedMotion = usePrefersReducedMotion();
  const paperSettling = paperArriving && !reducedMotion;
  const briefingNextAction = useMemo(
    () => briefing?.lead?.page?.id ? {
      label: `Open ${briefing.lead.page.title || 'watched page'}`,
      href: briefing.lead.href || wikiPagePath(briefing.lead.page.id),
      reason: `${briefing.lead.watcherLabel || 'Watcher'} · ${briefing.lead.maintenanceStatus || 'queued'}`
    } : normalizeBriefingNextAction(briefing),
    [briefing]
  );
  /* The page you were in and the case still running are already on this
     screen — the index projection carries the judgment subtree, so both are a
     read of the pages already on screen rather than two more round trips at
     the top of a paper that has to open fast.

     They read the curated list, not the raw one. Whatever the hero and Explore
     refuse to show is not a thing the reader was "last in" either — handing
     back a generated QA page as your morning's work is worse than handing back
     nothing. */
  const lastWorkedPage = useMemo(() => lastWorked(curatedPages), [curatedPages]);
  const liveCase = useMemo(() => openCase(curatedPages), [curatedPages]);

  /* The shelf is the one thing the paper cannot already see. It is fetched
     after the paper is on screen and never blocks it: a morning that opens
     without its card is a morning missing one line, not a morning that waited.
     A shelf we could not read stays null, and null prints nothing — the same
     rule everywhere else. */
  const [shelf, setShelf] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getArticles({ scope: 'kept', limit: 200 })
      .then((rows) => { if (!cancelled) setShelf(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setShelf(null); });
    return () => { cancelled = true; };
  }, []);
  const todaysShelfPick = useMemo(() => (shelf ? shelfPick(shelf) : null), [shelf]);

  const returnLoopNotes = useMemo(
    () => selectBriefingReturnLoopNotes(briefing),
    [briefing]
  );
  const primaryReturnLoopNote = useMemo(
    () => selectPrimaryReturnLoopNote(returnLoopNotes),
    [returnLoopNotes]
  );
  const watching = (Array.isArray(briefing?.watching) ? briefing.watching : [])
    .filter((watch) => watch?.type !== 'earnings_transcript' && !/transcript/i.test(watch?.label || ''));

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
            {watching.length ? `${watching.length} watcher${watching.length === 1 ? '' : 's'}` : ''}
          </small>
        </span>
        <span aria-hidden="true">Open</span>
      </summary>
      <div className="wiki-front-page__operations-panel">
        {workspaceNav}
        <WikiMovementReturnSurface onPresenceChange={setHasMovements} />
        {briefing?.lead && !paperConsequence ? (
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
                  {canonicalPages.map(page => <option key={pageId(page)} value={pageId(page)}>{displayWikiPageTitle(page, 'Untitled page')}</option>)}
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
      </div>
    </details>
  );

  if (loading || (hasAnyWikiContent == null && !curatedPages.length && !error)) {
    return (
      <WikiFrontPageShell aria-busy="true">
        <h1 className="sr-only">Your Wiki</h1>
        <p className="wiki-index__eyebrow wiki-front-page__masthead">
          Your Wiki · {mastheadDate()}
        </p>
        <LibraryPlaces feedTopics={libraryRoom.feedTopics} />
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
  // cleared their corpus later — or whose only pages are hidden from the
  // front. Unknown is not empty: hold the last shell (or the loading paper)
  // until a load actually answers. Quiet empty only after that answer.
  if (!loading && hasAnyWikiContent != null && !curatedPages.length) {
    return (
      <WikiFrontPageShell>
        <header className="wiki-front-page__top">
          <div className="wiki-front-page__top-row wfp-anim wfp-anim--1">
            <p className="wiki-index__eyebrow wiki-front-page__masthead">
              Your Wiki · {mastheadDate()}
            </p>
          </div>
          <LibraryPlaces feedTopics={libraryRoom.feedTopics} firstMorning />
        </header>
        <section className="wiki-front-page__empty wfp-anim wfp-anim--3" aria-labelledby="wfp-empty-title">
          {/* Day one prints one line and asks for nothing. A first morning
              that opened with a queue would be teaching the wrong thing on
              the wrong day. */}
          <h1 id="wfp-empty-title">{firstMorningLead()}</h1>
        </section>
        <section className="wiki-front-page__composer wfp-anim wfp-anim--4" aria-label="Build a wiki page">
          <WikiCreationComposer />
        </section>
        {operationalWorkspace}
        {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      </WikiFrontPageShell>
    );
  }

  return (
    <WikiFrontPageShell>
      <div className="wiki-living-shell">
        <RoomShelf
          className={`wiki-living-nav${mobileShelfOpen ? ' is-mobile-open' : ''}`}
          aria-label="Wiki views"
          label="Wiki"
          count={canonicalPages.length || undefined}
          search={wikiSearch}
          searchLabel="Search your wikis"
          searchPlaceholder="Search your wikis"
          onSearchChange={setWikiSearch}
        >
          <button
            type="button"
            className="wiki-living-nav__mobile-toggle"
            aria-expanded={mobileShelfOpen}
            onClick={() => setMobileShelfOpen(value => !value)}
          >
            <span>Browse wikis</span>
            {canonicalPages.length ? <RoomShelfMeta>{canonicalPages.length}</RoomShelfMeta> : null}
          </button>
          <RoomShelfList className="wiki-living-nav__primary">
            {[
              ['all', 'All wikis', canonicalPages.length],
              ['review', 'Needs review', shelfCount(activeTriage?.promotedCount ?? Math.min(3, exactReviewCount))],
              ['recent', 'Recently updated', shelfCount(briefing ? recentlyUpdated.length : undefined)]
            ].map(([value, label, count]) => (
              <li key={value}>
                <RoomShelfButton
                  active={wikiFilter === value}
                  aria-pressed={wikiFilter === value}
                  onClick={() => selectWikiFilter(value)}
                >
                  <span>{label}</span>
                  {Number.isFinite(count) ? <RoomShelfMeta>{count}</RoomShelfMeta> : null}
                </RoomShelfButton>
              </li>
            ))}
          </RoomShelfList>
          <RoomShelfSection className="wiki-living-nav__kinds" label="Wiki types">
            <RoomShelfList>
              {WIKI_KINDS.map((kind) => (
                <li key={kind}>
                  <RoomShelfButton
                    active={wikiFilter === `kind:${kind}`}
                    nested
                    aria-pressed={wikiFilter === `kind:${kind}`}
                    onClick={() => selectWikiFilter(`kind:${kind}`)}
                  >
                    <span>{WIKI_KIND_LABELS[kind]}</span>
                    <RoomShelfMeta>{wikiKindCounts[kind]}</RoomShelfMeta>
                  </RoomShelfButton>
                </li>
              ))}
            </RoomShelfList>
          </RoomShelfSection>
          <RoomShelfSection className="wiki-living-nav__workspace" label="Workspace">
            <RoomShelfList>
              <li><Link className={roomShelfItemClass({ nested: true })} to="/wiki/workspace?view=graph">Knowledge map</Link></li>
              <li><Link className={roomShelfItemClass({ nested: true })} to="/wiki/contradictions">Disagreements</Link></li>
              <li><Link className={roomShelfItemClass({ nested: true })} to="/wiki/workspace?view=list">Full workspace</Link></li>
            </RoomShelfList>
          </RoomShelfSection>
          <RoomShelfSection className="wiki-living-nav__pages" label="Pages">
            <RoomShelfList>
              {explorePages.slice(0, 6).map((page) => {
                const id = String(pageId(page));
                return (
                  <li key={id}>
                    <Link className={roomShelfItemClass({ nested: true })} to={wikiReadPath(id)}>
                      <span>{displayWikiPageTitle(page, 'Untitled page')}</span>
                    </Link>
                  </li>
                );
              })}
            </RoomShelfList>
          </RoomShelfSection>
        </RoomShelf>

        <section
          className={`wiki-living-index paper-open${paperSettling ? ' is-settling' : ''}`}
          aria-labelledby="wiki-living-title"
        >
          <header className="wiki-living-index__header">
            <PaperMasthead
              driftClosesAt={briefing?.driftClosesAt}
              keptCount={libraryRoom.shelfCounts?.keptArticles}
            />
            <h1 id="wiki-living-title">Your living wikis</h1>
            <PaperDesk
              lastWorked={lastWorkedPage}
              openCase={liveCase}
              later={libraryRoom.shelfCounts?.laterArticles}
              setAside={libraryRoom.shelfCounts?.setAsideArticles}
              kept={libraryRoom.shelfCounts?.keptArticles}
              topics={libraryRoom.feedTopics}
              shelfPick={todaysShelfPick}
            />
            {leadSentence && wikiFilter !== 'review' ? (
              <p
                className={`wiki-living-index__briefing paper-open__lead${pulseTarget === 'lead' ? ' is-morning-pulse' : ''}`}
                aria-label="Current Wiki briefing"
              >
                <WriteIn text={leadSentence} />
              </p>
            ) : null}
            {paperConsequence && wikiFilter !== 'review' ? (
              <MorningConsequence
                consequence={paperConsequence}
                pulse={pulseTarget === 'consequence'}
                onSettled={() => setBriefing((previous) => (
                  previous ? { ...previous, consequence: null } : previous
                ))}
              />
            ) : null}
            {quietSignOff ? (
              <p className="wiki-living-index__briefing paper-open__lead" aria-label="Morning sign-off">
                <WriteIn text={quietSignOff} />
                <span className="paper-open__sign-off-date">{mastheadDate()}</span>
              </p>
            ) : null}
            {wikiFilter === 'review' && reviewFrame ? (
              <p className="wiki-front-page__review-triage">
                {reviewFrame}. <Link to="/wiki/workspace?view=list&quality=needs_review">The rest of the queue</Link>
              </p>
            ) : null}
            {availabilityNotice ? <p className="wiki-front-page__availability" role="status">{availabilityNotice}</p> : null}
          </header>

          {/* Where you were. The lead page the agent worked on last, or the
              page the corpus would open to — one line above the list. */}
          {todaysPage ? (
            <p className="wiki-front-page__continue paper-open__mono">
              <span>Continue</span>
              <Link to={wikiReadPath(pageId(todaysPage))}>
                {displayWikiPageTitle(todaysPage, 'Your living page')}
              </Link>
            </p>
          ) : null}

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
              const rowId = String(pageId(page));
              const changedByLibrary = sourceMaterialIds.has(rowId);
              const reviewState = wikiReviewState(page, changedByLibrary);
              const reviewReason = reviewReasonById.get(rowId) || wikiReviewReason(page, changedByLibrary);
              return (
                <div
                  key={rowId}
                  className={`wiki-living-row${changedByLibrary ? ' is-library-changed' : ''}`}
                  role="row"
                >
                  <div className="wiki-living-row__title" role="cell">
                    <div>
                      <Link to={wikiReadPath(rowId)}>{displayWikiPageTitle(page, 'Untitled page')}</Link>
                      <small>{WIKI_KIND_FLAGS[wikiKindForPage(page)]}</small>
                      {wikiFilter === 'review' ? (
                        <small>{reviewReason}</small>
                      ) : null}
                    </div>
                  </div>
                  <span role="cell">{wikiGroundingLabel(page)}</span>
                  <span role="cell">{wikiReviewDate(page)}</span>
                  <span className={`wiki-living-row__state is-${reviewState.tone}`} role="cell">
                    <i aria-hidden="true" />
                    {reviewState.label}
                  </span>
                  <Link className="wiki-living-row__open" to={wikiReadPath(rowId)} aria-label={`Open ${displayWikiPageTitle(page, 'Wiki page')}`}>→</Link>
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
          {briefingNextAction && !paperConsequence ? (
            <p className="wiki-front-page__return-path">
              <Link to={briefingNextAction.href}>{briefingNextAction.label} →</Link>
              {briefingNextAction.reason ? <span>{briefingNextAction.reason}</span> : null}
            </p>
          ) : null}

          {wikiFilter !== 'review' ? (
            <>
              {paperVerdicts.map((ask, index) => (
                <MorningVerdict
                  key={`${ask.pageId}:${ask.claimId}:${ask.trigger}:${ask.sourceEventId || ask.horizon || ''}`}
                  ask={ask}
                  pulse={pulseTarget === 'verdict' && index === 0}
                  onSettled={(settled) => setBriefing((previous) => (
                    previous
                      ? {
                        ...previous,
                        claimVerdicts: (previous.claimVerdicts || []).filter((row) => (
                          !(row.pageId === settled.pageId
                            && row.claimId === settled.claimId
                            && row.trigger === settled.trigger
                            && String(row.sourceEventId || '') === String(settled.sourceEventId || ''))
                        ))
                      }
                      : previous
                  ))}
                />
              ))}
              <MorningCheckIn
                checkIn={paperCheckIn}
                pulse={pulseTarget === 'check-in'}
                onRetired={() => setBriefing((previous) => (
                  previous ? { ...previous, claimCheckIn: null } : previous
                ))}
              />
              <MorningAskedBack
                askedBack={briefing?.askedBack}
                pulse={pulseTarget === 'asked-back'}
              />
              {/* The drift's fortnight, as one sentence. Home stays atop
                  Judgment, where the chart lives; the paper prints the
                  sentence on the morning the bucket closes and nothing the
                  other thirteen. It never takes the pulse. */}
              <WikiDriftSentence driftClosesAt={briefing?.driftClosesAt} />
            </>
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
          <details className="wiki-front-page__making">
            <summary>Build a wiki</summary>
            <div className="wiki-front-page__creation-tools">
              <WikiCreationComposer />
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
