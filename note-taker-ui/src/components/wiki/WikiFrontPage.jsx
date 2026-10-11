import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { listWikiChanges, listWikiPages } from '../../api/wiki';
import { wikiReadPath } from '../../utils/wikiFeatureFlags';
import { isWikiOnboardingComplete, markWikiOnboardingComplete } from '../../onboarding/onboardingState';
import { purgeUnscopedKeys, scopedKey } from '../../utils/browserScope';
import { filterReturnViewItems } from '../../utils/cruftSuppression';
import { formatSurfaceDate } from '../../utils/dateDisplay';
import { useNoeisAgentSurface } from '../../agent/AgentRailContext';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import WikiCreationComposer from './WikiCreationComposer';
import { WIKI_KINDS, WIKI_KIND_LABELS, wikiKindForPage, withoutHeldViews } from './wikiFacetModel';
import { buildWikiFrontSurfaceDescriptor } from './wikiSurfaceModel';
import { dedupePagesByRepoKey } from './wikiRepoDedupeModel';
import { canonicalWikiPages } from './wikiTitleGroupModel';
import {
  collectionRowCopy,
  collectionSearchHit,
  filterCollectionPages,
  pendingWikiProposal
} from './wikiCollectionModel';
import '../../styles/wiki-critical.css';
import '../../styles/wiki-collection.css';

const INDEX_PAGE_LIMIT = 500;
const WIKI_FRONT_PAGE_CACHE_KEY = 'noeis.wiki.frontPageSnapshot.v1';
const frontPageCacheKey = () => scopedKey(WIKI_FRONT_PAGE_CACHE_KEY);

const readFrontPageCache = () => {
  try {
    purgeUnscopedKeys([WIKI_FRONT_PAGE_CACHE_KEY]);
    const raw = window.localStorage?.getItem(frontPageCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.pages)) return null;
    return {
      pages: parsed.pages,
      hasAnyWikiContent: typeof parsed.hasAnyWikiContent === 'boolean'
        ? parsed.hasAnyWikiContent
        : parsed.pages.length > 0
    };
  } catch (_error) {
    return null;
  }
};

const writeFrontPageCache = ({ pages, hasAnyWikiContent }) => {
  try {
    window.localStorage?.setItem(frontPageCacheKey(), JSON.stringify({
      pages: Array.isArray(pages) ? pages : [],
      hasAnyWikiContent: typeof hasAnyWikiContent === 'boolean' ? hasAnyWikiContent : null
    }));
  } catch (_error) {
    // Cache is a perceived-speed affordance.
  }
};

/* When you last looked at the Wiki. A per-reader convenience: without it the
   front page reads the last week. */
const LAST_LOOKED_KEY = 'noeis.wiki.lastLooked.v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/* When the reader last opened the Wiki home. Read once on mount (pure, so a
   double render cannot move it), written after the page has shown it. */
const readLastLooked = () => {
  const firstLook = { at: new Date(Date.now() - WEEK_MS).toISOString(), first: true };
  try {
    const stored = window.localStorage?.getItem(scopedKey(LAST_LOOKED_KEY));
    return stored && Number.isFinite(new Date(stored).getTime()) ? { at: stored, first: false } : firstLook;
  } catch (_error) {
    return firstLook;
  }
};

const markLooked = () => {
  try {
    window.localStorage?.setItem(scopedKey(LAST_LOOKED_KEY), new Date().toISOString());
  } catch (_error) {
    // A private window keeps no memory; the home then reads as a first look.
  }
};

export const sinceLabel = (iso, now = new Date()) => {
  const then = new Date(iso);
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' });
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const bylineFor = (page = {}) => (
  page?.aiState?.lastDraftedAt ? `kept by ${AGENT_DISPLAY_NAME}` : 'written by you'
);

const openExistingAgent = () => {
  window.dispatchEvent(new Event('noeis:open-agent'));
};

const CollectionNavButton = ({ active, onClick, children }) => (
  <button
    type="button"
    className={`wiki-collection__nav-btn${active ? ' is-active' : ''}`}
    aria-pressed={active}
    onClick={onClick}
  >
    {children}
  </button>
);

const CollectionNav = ({
  wikiFilter,
  proposedCount,
  pageCount,
  onSelect,
  onNavigate
}) => (
  <>
    <p className="wiki-collection__nav-title">Wiki</p>
    <div className="wiki-collection__nav-group">
      <CollectionNavButton active={wikiFilter !== 'proposed'} onClick={() => onSelect('all')}>
        <span>All pages</span>
      </CollectionNavButton>
      <CollectionNavButton active={wikiFilter === 'proposed'} onClick={() => onSelect('proposed')}>
        <span>Proposed changes</span>
        {proposedCount > 0 ? <span className="wiki-collection__nav-count">{proposedCount}</span> : null}
      </CollectionNavButton>
    </div>
    <div className="wiki-collection__nav-group">
      <Link
        className="wiki-collection__nav-btn wiki-collection__nav-btn--link"
        to="/wiki/workspace?view=graph"
        onClick={onNavigate}
      >
        Map
      </Link>
      <Link
        className="wiki-collection__nav-btn wiki-collection__nav-btn--link"
        to="/wiki/workspace?view=list"
        onClick={onNavigate}
      >
        Full workspace
      </Link>
    </div>
    <p className="wiki-collection__nav-foot">
      A collection of living pages.
      <span>
        {pageCount} page{pageCount === 1 ? '' : 's'}
      </span>
    </p>
  </>
);

/* What moved since you last looked. Silence is a state: when nothing moved,
   one line says so and the list follows. */
const SinceYouLooked = ({ since, changes, pageCount, proposedCount }) => {
  if (!since || !changes) return null;
  const when = since.first ? 'this week' : `since ${sinceLabel(since.at)}`;
  if (!changes.length) {
    return (
      <p className="wiki-collection__since-quiet" role="status">
        Nothing has changed {when}. {pageCount} page{pageCount === 1 ? '' : 's'}, {proposedCount
          ? `${proposedCount} with a proposed change`
          : 'all current'}.
      </p>
    );
  }
  return (
    <section className="wiki-collection__since" aria-labelledby="wiki-since-title">
      <h2 id="wiki-since-title" className="wiki-collection__since-title">{since.first ? 'This week' : `Since you looked ${sinceLabel(since.at)}`}</h2>
      <ul>
        {changes.map(change => (
          <li key={change.pageId}>
            <Link className="wiki-collection__since-page" to={wikiReadPath(change.pageId)}>{change.title}</Link>
            <p className="wiki-collection__since-sentence">{change.sentence}</p>
            <p className="wiki-collection__meta">
              <span>
                {change.changeSource?.title ? `when you saved ${change.changeSource.title}` : (change.by === 'you' ? 'by you' : `by ${AGENT_DISPLAY_NAME}`)}
              </span>
              {change.at ? <span>{formatSurfaceDate(change.at, { includeYear: true })}</span> : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
};

const WikiFrontPage = ({ initialKind = '' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  useNoeisAgentSurface('agent-surface.wiki', buildWikiFrontSurfaceDescriptor(), {
    subject: 'Your Wiki.',
    empty: 'Open a page before asking against exact accepted knowledge.'
  }, {});
  const pageIndexRequestRef = useRef(null);
  const searchTimerRef = useRef(null);
  const [seed] = useState(() => readFrontPageCache());
  const [pages, setPages] = useState(() => seed?.pages || []);
  const [hasAnyWikiContent, setHasAnyWikiContent] = useState(() => seed?.hasAnyWikiContent ?? null);
  const [loading, setLoading] = useState(() => !seed);
  const [error, setError] = useState('');
  const [availabilityNotice, setAvailabilityNotice] = useState('');
  const [wikiSearch, setWikiSearch] = useState('');
  const [searchPages, setSearchPages] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const searchParams = new URLSearchParams(location.search);
  const requestedKind = searchParams.get('kind') || initialKind;
  const requestedView = searchParams.get('view');
  const kind = WIKI_KINDS.includes(requestedKind) ? requestedKind : '';
  const wikiFilter = ['proposed', 'review'].includes(requestedView) ? 'proposed' : 'all';
  const [since] = useState(readLastLooked);
  useEffect(markLooked, []);
  const [changes, setChanges] = useState(null);

  const setQuery = (key, value) => {
    const next = new URLSearchParams(location.search);
    if (initialKind && key !== 'kind' && !next.has('kind')) next.set('kind', initialKind);
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    navigate(`/wiki${query ? `?${query}` : ''}`, { replace: true });
    setMobileNavOpen(false);
  };
  const selectWikiFilter = value => setQuery('view', value === 'proposed' ? 'proposed' : '');

  useEffect(() => {
    let cancelled = false;
    listWikiChanges(since.at)
      .then(result => { if (!cancelled) setChanges(result.changes); })
      .catch(() => { if (!cancelled) setChanges(null); });
    return () => { cancelled = true; };
  }, [since]);

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
      hasAnyWikiContent: cached?.hasAnyWikiContent ?? null
    };
    if (cached) {
      setPages(cached.pages);
      setHasAnyWikiContent(cached.hasAnyWikiContent);
      setLoading(false);
    }
    setError('');
    setAvailabilityNotice('');
    if (!pageIndexRequestRef.current) {
      pageIndexRequestRef.current = listWikiPages({
        limit: INDEX_PAGE_LIMIT,
        summary: 1
      });
    }
    const pageIndexRequest = pageIndexRequestRef.current;
    pageIndexRequest
      .then((nextPages) => {
        if (cancelled) return;
        snapshot.pages = withoutHeldViews(nextPages);
        snapshot.hasAnyWikiContent = snapshot.pages.length > 0;
        setPages(snapshot.pages);
        setHasAnyWikiContent(snapshot.hasAnyWikiContent);
        writeFrontPageCache(snapshot);
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
      });
    return () => { cancelled = true; };
  }, [seed]);

  useEffect(() => {
    const query = wikiSearch.trim();
    if (!query) {
      setSearchPages(null);
      return undefined;
    }
    searchTimerRef.current = window.setTimeout(() => {
      listWikiPages({ limit: INDEX_PAGE_LIMIT, summary: 1, q: query })
        .then((rows) => setSearchPages(withoutHeldViews(rows)))
        .catch(() => setSearchPages(null));
    }, 180);
    return () => window.clearTimeout(searchTimerRef.current);
  }, [wikiSearch]);

  const curatedPages = useMemo(
    () => dedupePagesByRepoKey(filterReturnViewItems(pages)),
    [pages]
  );
  const canonicalPages = useMemo(() => canonicalWikiPages(curatedPages), [curatedPages]);
  const searchedPages = useMemo(
    () => (searchPages ? canonicalWikiPages(dedupePagesByRepoKey(filterReturnViewItems(searchPages))) : null),
    [searchPages]
  );

  const onboardingComplete = isWikiOnboardingComplete();
  const shouldOpenOnboarding = !loading && !error && !onboardingComplete && hasAnyWikiContent === false;

  useEffect(() => {
    if (loading || error) return;
    if (hasAnyWikiContent !== true) return;
    if (onboardingComplete) return;
    markWikiOnboardingComplete();
  }, [error, hasAnyWikiContent, loading, onboardingComplete]);

  const proposedCount = useMemo(
    () => canonicalPages.filter(pendingWikiProposal).length,
    [canonicalPages]
  );

  const scope = wikiFilter;
  const presentKinds = useMemo(
    () => WIKI_KINDS.filter(item => canonicalPages.some(page => wikiKindForPage(page) === item)),
    [canonicalPages]
  );
  /* Changes are shown only for pages this list would show: suppressed and
     held pages never surface here by another door. */
  const visibleChanges = useMemo(() => {
    if (!changes) return null;
    const ids = new Set(canonicalPages.map(page => String(page?._id || page?.id || '')));
    return changes.filter(change => ids.has(String(change.pageId)));
  }, [canonicalPages, changes]);
  const sourcePages = searchedPages || canonicalPages;
  const visiblePages = useMemo(
    () => filterCollectionPages({
      pages: sourcePages,
      query: wikiSearch,
      scope,
      kind
    }),
    [kind, scope, sourcePages, wikiSearch]
  );

  const nav = (
    <CollectionNav
      wikiFilter={wikiFilter}
      proposedCount={proposedCount}
      pageCount={canonicalPages.length}
      onSelect={selectWikiFilter}
      onNavigate={() => setMobileNavOpen(false)}
    />
  );

  const renderCollection = (emptyComposer = false) => (
    <div className="wiki-collection__shell">
      <nav
        className={`wiki-collection__nav${mobileNavOpen ? ' is-open' : ''}`}
        aria-label="Wiki navigation"
      >
        {nav}
      </nav>

      <section className="wiki-collection__stage" aria-labelledby="wiki-collection-title">
        <header className="wiki-collection__head">
          <div className="wiki-collection__title-row">
            <button
              type="button"
              className="wiki-collection__nav-toggle"
              aria-label="Wiki navigation"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(value => !value)}
            >
              ☰
            </button>
            <h1 id="wiki-collection-title">Wiki</h1>
          </div>
          <div className="wiki-collection__actions">
            {proposedCount ? (
              <button
                type="button"
                className="wiki-collection__text wiki-collection__pending"
                onClick={() => selectWikiFilter('proposed')}
              >
                {proposedCount} proposed change{proposedCount === 1 ? '' : 's'}
              </button>
            ) : null}
            <button type="button" className="wiki-collection__text wiki-collection__newpage" onClick={() => setComposerOpen(true)}>
              + New page
            </button>
            <button type="button" className="wiki-collection__text" onClick={openExistingAgent}>
              Ask
            </button>
          </div>
        </header>

        <div className="wiki-collection__search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            id="wikiQuery"
            type="search"
            aria-label="Search current Wiki pages"
            placeholder="Find an idea, a page, a sentence…"
            value={wikiSearch}
            onChange={(event) => setWikiSearch(event.target.value)}
          />
          {presentKinds.length > 1 || kind ? (
            <select
              className="wiki-collection__kind-filter"
              aria-label="Kind of page"
              value={kind}
              onChange={(event) => setQuery('kind', event.target.value)}
            >
              <option value="">Every kind</option>
              {WIKI_KINDS.map(item => <option key={item} value={item}>{WIKI_KIND_LABELS[item]}</option>)}
            </select>
          ) : null}
        </div>

        {availabilityNotice ? <p className="wiki-collection__status" role="status">{availabilityNotice}</p> : null}
        {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}

        {scope === 'all' && !kind && !wikiSearch.trim() ? (
          <SinceYouLooked
            since={since}
            changes={visibleChanges}
            pageCount={canonicalPages.length}
            proposedCount={proposedCount}
          />
        ) : null}

        <div className="wiki-collection__label">
          <span>
            {wikiSearch.trim()
              ? `${visiblePages.length} matching page${visiblePages.length === 1 ? '' : 's'}`
              : `${visiblePages.length} page${visiblePages.length === 1 ? '' : 's'}${scope === 'proposed' ? ' with a proposed change' : kind ? ` · ${WIKI_KIND_LABELS[kind]}` : ''}`}
          </span>
        </div>

        {visiblePages.length ? (
          <ul className="wiki-collection__pages">
            {visiblePages.map((page) => {
              const row = collectionRowCopy(page, wikiSearch);
              const hit = collectionSearchHit(page, wikiSearch);
              return (
                <li key={row.id} className="wiki-collection__row" id={`row-${row.id}`}>
                  <div className="wiki-collection__row-line">
                    <Link className="wiki-collection__title" id={`open-${row.id}`} to={wikiReadPath(row.id)}>
                      {row.title}
                    </Link>
                    <Link className="wiki-collection__open" to={wikiReadPath(row.id)} aria-label={`Read ${row.title}`}>
                      Read →
                    </Link>
                  </div>
                  {row.dek ? <p className="wiki-collection__dek">{row.dek}</p> : null}
                  {hit ? (
                    <div className="wiki-collection__hit">
                      <span className="wiki-collection__hit-kicker">In the current page</span>
                      {hit}
                    </div>
                  ) : null}
                  <div className="wiki-collection__meta">
                    <span className="wiki-collection__meta-left">
                      <span>{bylineFor(page)}</span>
                      {row.updatedAt ? <span>{formatSurfaceDate(row.updatedAt, { includeYear: true })}</span> : null}
                    </span>
                    {row.pending ? (
                      <Link className="wiki-collection__pending" to={wikiReadPath(row.id, 'review=1')}>
                        Proposed change
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="wiki-collection__empty">
            <h2>{wikiSearch.trim() ? 'No pages match.' : 'No pages in this view.'}</h2>
            <p className="quiet">
              Search looks through the current text of pages in this view. Private thoughts and unaccepted proposals are separate.
            </p>
            {wikiSearch.trim() ? (
              <button type="button" className="wiki-collection__text" onClick={() => setWikiSearch('')}>
                Clear the search
              </button>
            ) : null}
          </div>
        )}

        {pages.length >= INDEX_PAGE_LIMIT ? (
          <p className="wiki-collection__status">
            Showing the first {INDEX_PAGE_LIMIT} pages. Open the full workspace for the complete index.
          </p>
        ) : null}

        <p className="wiki-collection__foot">
          Sources explain the words. Revisions explain what changed.
        </p>

        {emptyComposer || composerOpen ? (
          <section className="wiki-collection__composer" aria-label="Build a wiki page">
            <WikiCreationComposer />
          </section>
        ) : null}
      </section>
    </div>
  );

  if (loading || (hasAnyWikiContent == null && !curatedPages.length && !error)) {
    return (
      <main className="wiki-page wiki-collection" aria-busy="true">
        <h1 className="sr-only">Opening Wiki</h1>
        <p className="wiki-collection__status" role="status">Opening your pages…</p>
      </main>
    );
  }

  if (shouldOpenOnboarding) {
    return (
      <main className="wiki-page wiki-collection" aria-busy="true">
        <h1 className="sr-only">Opening your Wiki</h1>
        <p className="wiki-collection__status" role="status">Opening the first-page flow...</p>
      </main>
    );
  }

  if (!loading && hasAnyWikiContent != null && !curatedPages.length) {
    return (
      <main className="wiki-page wiki-collection">
        {renderCollection(true)}
      </main>
    );
  }

  return (
    <main className="wiki-page wiki-collection">
      {renderCollection(false)}
    </main>
  );
};

export default WikiFrontPage;
