import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWikiBriefing, listWikiPages } from '../../api/wiki';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import { countWikiClaims, countWikiSources, wikiPreviewForPage } from './wikiPageMetrics';
import { filterReturnViewItems } from '../../utils/cruftSuppression';
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

const pageId = (page) => (page && (page._id || page.id)) || '';

const pageWeight = (page = {}) => (
  countWikiSources(page) * 3
  + countWikiClaims(page) * 2
  + (page.updatedAt ? 1 : 0)
  + (page.lastReviewedAt ? 1 : 0)
);

const relativeTime = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diff < 3600) return 'in the last hour';
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

const prefersReducedMotion = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return true;
  }
};

// The morning-paper lead writes itself in, word by word — the agent's voice
// arriving at the door. Instant under reduced motion (and in jsdom).
const WriteIn = ({ text = '' }) => {
  const words = useMemo(() => String(text || '').split(/\s+/).filter(Boolean), [text]);
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? words.length : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(words.length);
      return undefined;
    }
    setShown(0);
    if (!words.length) return undefined;
    const stepMs = Math.min(60, Math.max(28, 900 / words.length));
    const timer = window.setInterval(() => {
      setShown((current) => {
        if (current >= words.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [words]);

  return (
    <span className="wiki-front-page__lead-text">
      <span aria-hidden="true">{words.slice(0, shown).join(' ')}</span>
      <span className="sr-only">{words.join(' ')}</span>
    </span>
  );
};

const mastheadDate = () => new Date().toLocaleDateString(undefined, {
  weekday: 'long', month: 'long', day: 'numeric'
});

const WikiFrontPage = () => {
  const [pages, setPages] = useState([]);
  const [briefing, setBriefing] = useState(null);
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
    setLoading(true);
    Promise.allSettled([
      listWikiPages({ limit: INDEX_PAGE_LIMIT }),
      getWikiBriefing()
    ]).then(([pagesResult, briefingResult]) => {
      if (cancelled) return;
      if (pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value)) {
        setPages(pagesResult.value);
      } else {
        setError('Failed to load wiki pages.');
      }
      if (briefingResult.status === 'fulfilled' && briefingResult.value) {
        setBriefing(briefingResult.value);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const curatedPages = useMemo(
    () => filterReturnViewItems(pages),
    [pages]
  );

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

  const weighted = useMemo(() => (
    [...curatedPages].sort((a, b) => pageWeight(b) - pageWeight(a)
      || String(a.title || '').localeCompare(String(b.title || '')))
  ), [curatedPages]);

  // Today's page: the agent's most recently enriched page; otherwise the
  // strongest page in the corpus. Different day to day because the corpus is.
  const todaysPage = recentlyUpdated[0] || weighted[0] || null;

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

  const leadSentence = briefing?.summary || '';
  const leadExcerpt = todaysPage ? wikiPreviewForPage(todaysPage, LEAD_EXCERPT_BUDGET) : '';

  if (loading) {
    return (
      <main className="wiki-page wiki-front-page" aria-busy="true">
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
      </main>
    );
  }

  // First-run: never a dead screen. The agent proposes the first move.
  if (!curatedPages.length) {
    return (
      <main className="wiki-page wiki-front-page">
        <p className="wiki-index__eyebrow wiki-front-page__masthead wfp-anim wfp-anim--1">
          Morning paper · {mastheadDate()}
        </p>
        <section className="wiki-front-page__empty wfp-anim wfp-anim--2" aria-labelledby="wfp-empty-title">
          <h1 id="wfp-empty-title">Nothing here yet — let&rsquo;s start your wiki.</h1>
          <p>
            Save something you&rsquo;re reading and {AGENT_DISPLAY_NAME} will turn it into your
            first page, or ask for a page on anything you&rsquo;re thinking about.
          </p>
        </section>
        <section className="wiki-front-page__composer wfp-anim wfp-anim--3" aria-label="Build a wiki page">
          <WikiBuildPageComposer compact className="wiki-front-page__builder" />
        </section>
        {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      </main>
    );
  }

  return (
    <main className="wiki-page wiki-front-page">
      <header className="wiki-front-page__top">
        <p className="wiki-index__eyebrow wiki-front-page__masthead wfp-anim wfp-anim--1">
          Morning paper · {mastheadDate()}
        </p>
        {leadSentence ? (
          <p className="wiki-front-page__lead wfp-anim wfp-anim--2">
            <WriteIn text={leadSentence} />
          </p>
        ) : null}
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
        ) : null}

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

      <footer className="wiki-front-page__hairline wfp-anim wfp-anim--6">
        <span className="wiki-front-page__hairline-label">workspace:</span>
        <Link to="/wiki/workspace?view=graph">knowledge map</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/wiki/workspace?view=list">all pages</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/wiki/workspace?view=list&quality=needs_review">needs review</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/wiki/workspace?view=graph">review{reviewCount ? ` (${reviewCount})` : ''}</Link>
      </footer>

      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
    </main>
  );
};

export default WikiFrontPage;
