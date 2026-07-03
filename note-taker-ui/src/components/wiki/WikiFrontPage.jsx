import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getWikiBriefing, listWikiPages } from '../../api/wiki';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import WikiFrontPageGraphMotif from './WikiFrontPageGraphMotif';
import { countWikiClaims, countWikiSources, wikiPreviewForPage } from './wikiPageMetrics';
import { filterReturnViewItems } from '../../utils/cruftSuppression';
import { formatSurfaceDate } from '../../utils/dateDisplay';
import {
  normalizeBriefingNextAction,
  selectPrimaryReturnLoopNote,
  selectBriefingReturnLoopNotes
} from './wikiBriefingReturnLoopModel';
import '../../styles/wiki-critical.css';
import '../../styles/wiki-front-page.css';

// AT-394 — the wiki front page. Opening Noeis lands here: a newspaper-shaped
// reading surface. Alive the way a newspaper on the doorstep is alive — new
// today, and it arrives (one ~1.2s entrance, then stillness). The maintenance
// workspace (map, review queues, drop-source, telemetry) lives behind one
// hairline link; it is no longer the front door.

const INDEX_PAGE_LIMIT = 80;
const LEAD_EXCERPT_BUDGET = 320;
const EXPLORE_LIMIT = 10;
const GROWN_LIMIT = 3;
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

// Growth note for the "Recently grown" column — instrument register, but only
// from data we actually have (no fabricated deltas).
const growthNote = (page = {}) => {
  const parts = [];
  const updated = relativeTime(page.updatedAt || page.lastReviewedAt);
  if (updated) parts.push(`reviewed ${updated}`);
  const claims = countWikiClaims(page);
  if (claims > 0) parts.push(`${claims} claim${claims === 1 ? '' : 's'}`);
  const sources = countWikiSources(page);
  if (sources > 0) parts.push(`${sources} source${sources === 1 ? '' : 's'}`);
  return parts.join(' · ');
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
  const [pages, setPages] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [hasAnyWikiContent, setHasAnyWikiContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      getWikiBriefing()
    ]).then(([pagesResult, briefingResult]) => {
      if (cancelled) return;
      const nextPages = pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value)
        ? pagesResult.value
        : cached?.pages || [];
      const nextHasAnyWikiContent = pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value)
        ? pagesResult.value.length > 0
        : cached?.hasAnyWikiContent ?? null;
      const nextBriefing = briefingResult.status === 'fulfilled' && briefingResult.value
        ? briefingResult.value
        : cached?.briefing || null;

      if (pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value)) {
        setPages(nextPages);
      } else if (!cached) {
        setError('Failed to load wiki pages.');
      }
      setHasAnyWikiContent(nextHasAnyWikiContent);
      if (briefingResult.status === 'fulfilled' && briefingResult.value) {
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
    () => filterReturnViewItems(pages),
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
      ? filterReturnViewItems(briefing.recentlyUpdatedPages.map(resolvePage))
      : []
  ), [briefing, resolvePage]);

  const sourceMaterialPages = useMemo(() => (
    Array.isArray(briefing?.pagesWithNewSourceMaterial)
      ? filterReturnViewItems(briefing.pagesWithNewSourceMaterial.map(resolvePage))
      : []
  ), [briefing, resolvePage]);

  const weighted = useMemo(() => (
    [...curatedPages].sort((a, b) => pageWeight(b) - pageWeight(a)
      || String(a.title || '').localeCompare(String(b.title || '')))
  ), [curatedPages]);

  // Today's page: the agent's most recently enriched page; otherwise the
  // strongest page in the corpus. Different day to day because the corpus is.
  const todaysPage = sourceMaterialPages[0] || recentlyUpdated[0] || weighted[0] || null;

  const recentlyGrown = useMemo(() => {
    const leadId = String(pageId(todaysPage));
    const fromBriefing = recentlyUpdated.filter(page => String(pageId(page)) !== leadId);
    if (fromBriefing.length >= GROWN_LIMIT) return fromBriefing.slice(0, GROWN_LIMIT);
    const fallback = [...curatedPages]
      .filter(page => page.updatedAt && String(pageId(page)) !== leadId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .filter(page => !fromBriefing.some(existing => pageId(existing) === pageId(page)));
    return [...fromBriefing, ...fallback].slice(0, GROWN_LIMIT);
  }, [recentlyUpdated, curatedPages, todaysPage]);

  const explorePages = useMemo(() => (
    weighted.slice(0, EXPLORE_LIMIT)
  ), [weighted]);

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

  const leadSentence = completeLeadSentence(briefing?.summary || '');
  const leadExcerpt = todaysPage ? wikiPreviewForPage(todaysPage, LEAD_EXCERPT_BUDGET) : '';
  const briefingNextAction = useMemo(
    () => normalizeBriefingNextAction(briefing),
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
          <p className="wiki-index__eyebrow wiki-front-page__masthead wfp-anim wfp-anim--1">
            Morning paper · {mastheadDate()}
          </p>
          <div className="wiki-front-page__intro wfp-anim wfp-anim--2">
            {workspaceNav}
          </div>
        </header>
        <section className="wiki-front-page__empty wfp-anim wfp-anim--3" aria-labelledby="wfp-empty-title">
          <h1 id="wfp-empty-title">Nothing here yet — let&rsquo;s start your wiki.</h1>
          <p>
            Save something you&rsquo;re reading and {AGENT_DISPLAY_NAME} will turn it into your
            first page, or ask for a page on anything you&rsquo;re thinking about.
          </p>
        </section>
        <section className="wiki-front-page__composer wfp-anim wfp-anim--4" aria-label="Build a wiki page">
          <WikiBuildPageComposer compact className="wiki-front-page__builder" />
        </section>
        {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      </WikiFrontPageShell>
    );
  }

  return (
    <WikiFrontPageShell>
      <header className="wiki-front-page__top">
        <p className="wiki-index__eyebrow wiki-front-page__masthead wfp-anim wfp-anim--1">
          Morning paper · {mastheadDate()}
        </p>
        <div className="wiki-front-page__intro wfp-anim wfp-anim--2">
          {leadSentence ? (
            <p className="wiki-front-page__lead">
              <WriteIn text={leadSentence} />
            </p>
          ) : null}
          {briefingNextAction ? (
            <div className="wiki-front-page__next-action">
              <span className="wiki-front-page__next-action-kicker">Return path</span>
              <Link className="wiki-front-page__next-action-link" to={briefingNextAction.href}>
                {briefingNextAction.label} →
              </Link>
              {briefingNextAction.reason ? (
                <p className="wiki-front-page__next-action-reason">{briefingNextAction.reason}</p>
              ) : null}
            </div>
          ) : null}
          {primaryReturnLoopNote ? (
            <p className="wiki-front-page__evidence-strip">
              <span>Evidence surfaced</span>
              <Link to={primaryReturnLoopNote.href}>{primaryReturnLoopNote.label}</Link>
              <em>{primaryReturnLoopNote.detail}</em>
            </p>
          ) : null}
          {workspaceNav}
        </div>
      </header>

      <div className="wiki-front-page__columns">
        {todaysPage ? (
          <section className="wiki-front-page__story wfp-anim wfp-anim--3" aria-labelledby="wfp-story-title">
            <p className="wiki-index__eyebrow">Today&rsquo;s page</p>
            <h1 id="wfp-story-title">
              <Link to={wikiPagePath(pageId(todaysPage))}>{todaysPage.title || 'Untitled page'}</Link>
            </h1>
            {leadExcerpt ? <p className="wiki-front-page__excerpt">{leadExcerpt}</p> : null}
            <Link className="wiki-front-page__continue" to={wikiPagePath(pageId(todaysPage))}>
              Continue reading →
            </Link>
          </section>
        ) : (
          <h1 className="sr-only">Morning paper</h1>
        )}

        {recentlyGrown.length ? (
          <aside className="wiki-front-page__grown wfp-anim wfp-anim--4" aria-labelledby="wfp-grown-title">
            <h2 id="wfp-grown-title" className="wiki-index__eyebrow">Recently grown</h2>
            <ul>
              {recentlyGrown.map((page) => (
                <li key={pageId(page)}>
                  <Link to={wikiPagePath(pageId(page))}>{page.title || 'Untitled page'}</Link>
                  {growthNote(page)
                    ? <span className="wiki-front-page__growth-note">{growthNote(page)}</span>
                    : null}
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>

      {explorePages.length ? (
        <section className="wiki-front-page__explore wfp-anim wfp-anim--5" aria-labelledby="wfp-explore-title">
          <h2 id="wfp-explore-title" className="wiki-index__eyebrow">Explore</h2>
          <p className="wiki-front-page__index">
            {explorePages.map((page, i) => (
              <React.Fragment key={pageId(page)}>
                {i > 0 ? <span aria-hidden="true" className="wiki-front-page__dot"> · </span> : null}
                <Link to={wikiPagePath(pageId(page))}>{page.title || 'Untitled page'}</Link>
              </React.Fragment>
            ))}
          </p>
        </section>
      ) : null}

      <section className="wiki-front-page__composer wfp-anim wfp-anim--6" aria-label="Ask or build a wiki page">
        <WikiBuildPageComposer compact className="wiki-front-page__builder" />
      </section>

      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
    </WikiFrontPageShell>
  );
};

export default WikiFrontPage;
