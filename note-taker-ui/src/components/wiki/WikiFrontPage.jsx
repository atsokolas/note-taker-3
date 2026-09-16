import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { listWikiPages } from '../../api/wiki';
import { wikiReadPath } from '../../utils/wikiFeatureFlags';
import { isWikiOnboardingComplete, markWikiOnboardingComplete } from '../../onboarding/onboardingState';
import { purgeUnscopedKeys, scopedKey } from '../../utils/browserScope';
import { filterReturnViewItems } from '../../utils/cruftSuppression';
import { formatSurfaceDate } from '../../utils/dateDisplay';
import { useNoeisAgentSurface } from '../../agent/AgentRailContext';
import WikiCreationComposer from './WikiCreationComposer';
import { WIKI_KINDS, WIKI_KIND_LABELS, wikiKindForPage } from './wikiFacetModel';
import { buildWikiFrontSurfaceDescriptor } from './wikiSurfaceModel';
import { dedupePagesByRepoKey } from './wikiRepoDedupeModel';
import { canonicalWikiPages } from './wikiTitleGroupModel';
import {
  collectionRowCopy,
  collectionSearchHit,
  filterCollectionPages,
  pendingWikiProposal
} from './wikiCollectionModel';
import {
  RoomShelf,
  RoomShelfButton,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection,
  roomShelfItemClass
} from '../collection/RoomShelf';
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

const openExistingAgent = () => {
  window.dispatchEvent(new Event('noeis:open-agent'));
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
  const [mobileShelfOpen, setMobileShelfOpen] = useState(false);
  const searchParams = new URLSearchParams(location.search);
  const requestedKind = searchParams.get('kind') || initialKind;
  const requestedView = searchParams.get('view');
  const requestedFilter = WIKI_KINDS.includes(requestedKind)
    ? `kind:${requestedKind}`
    : ['proposed', 'review', 'recent'].includes(requestedView)
      ? (requestedView === 'review' ? 'proposed' : requestedView)
      : 'all';
  const [wikiFilter, setWikiFilter] = useState(requestedFilter);

  useEffect(() => {
    setWikiFilter(requestedFilter);
  }, [requestedFilter]);

  const selectWikiFilter = (value) => {
    setWikiFilter(value);
    const next = new URLSearchParams(location.search);
    next.delete('kind');
    next.delete('view');
    if (value.startsWith('kind:')) next.set('kind', value.slice(5));
    else if (['proposed', 'recent'].includes(value)) next.set('view', value);
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
        snapshot.pages = Array.isArray(nextPages) ? nextPages : [];
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
        .then((rows) => setSearchPages(Array.isArray(rows) ? rows : []))
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

  const wikiKindCounts = useMemo(() => {
    const counts = Object.fromEntries(WIKI_KINDS.map(kind => [kind, 0]));
    canonicalPages.forEach((page) => { counts[wikiKindForPage(page)] += 1; });
    return counts;
  }, [canonicalPages]);

  const proposedCount = useMemo(
    () => canonicalPages.filter(pendingWikiProposal).length,
    [canonicalPages]
  );

  const scope = wikiFilter === 'proposed' || wikiFilter === 'recent' ? wikiFilter : 'all';
  const kind = wikiFilter.startsWith('kind:') ? wikiFilter.slice(5) : '';
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

  const renderCollection = (emptyComposer = false) => (
    <div className="wiki-collection__shell">
      <RoomShelf
        className={`wiki-living-nav${mobileShelfOpen ? ' is-mobile-open' : ''}`}
        aria-label="Wiki views"
        label="Wiki"
        count={canonicalPages.length || undefined}
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
            ['all', 'All pages', canonicalPages.length],
            ['proposed', 'Proposed changes', proposedCount],
            ['recent', 'Recently changed']
          ].map(([value, label, count]) => (
            <li key={value}>
              <RoomShelfButton
                active={wikiFilter === value}
                aria-pressed={wikiFilter === value}
                onClick={() => selectWikiFilter(value)}
              >
                <span>{label}</span>
                {Number.isFinite(count) && count > 0 ? <RoomShelfMeta>{count}</RoomShelfMeta> : null}
              </RoomShelfButton>
            </li>
          ))}
        </RoomShelfList>
        <RoomShelfSection className="wiki-living-nav__kinds" label="Subjects">
          <RoomShelfList>
            {WIKI_KINDS.map((item) => (
              <li key={item}>
                <RoomShelfButton
                  active={wikiFilter === `kind:${item}`}
                  nested
                  aria-pressed={wikiFilter === `kind:${item}`}
                  onClick={() => selectWikiFilter(`kind:${item}`)}
                >
                  <span>{WIKI_KIND_LABELS[item]}</span>
                  <RoomShelfMeta>{wikiKindCounts[item]}</RoomShelfMeta>
                </RoomShelfButton>
              </li>
            ))}
          </RoomShelfList>
        </RoomShelfSection>
        <RoomShelfSection className="wiki-living-nav__workspace" label="Workspace">
          <RoomShelfList>
            <li><Link className={roomShelfItemClass({ nested: true })} to="/wiki/workspace?view=graph">Map & disagreements</Link></li>
            <li><Link className={roomShelfItemClass({ nested: true })} to="/wiki/contradictions">Disagreements</Link></li>
            <li><Link className={roomShelfItemClass({ nested: true })} to="/wiki/workspace?view=list">Full workspace</Link></li>
          </RoomShelfList>
        </RoomShelfSection>
      </RoomShelf>

      <section className="wiki-collection__stage" aria-labelledby="wiki-collection-title">
        <header className="wiki-collection__head">
          <h1 id="wiki-collection-title">Wiki</h1>
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
            <button type="button" className="wiki-collection__text" onClick={() => setComposerOpen(true)}>
              + New page
            </button>
            <button type="button" className="wiki-collection__text" onClick={openExistingAgent}>
              Ask
            </button>
          </div>
        </header>

        <div className="wiki-collection__search">
          <input
            id="wikiQuery"
            type="search"
            aria-label="Search current Wiki pages"
            placeholder="Find an idea, a page, a sentence…"
            value={wikiSearch}
            onChange={(event) => setWikiSearch(event.target.value)}
          />
        </div>

        {availabilityNotice ? <p className="wiki-collection__status" role="status">{availabilityNotice}</p> : null}
        {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}

        <div className="wiki-collection__label">
          <span>
            {wikiSearch.trim()
              ? `${visiblePages.length} matching page${visiblePages.length === 1 ? '' : 's'} · current versions only`
              : `${visiblePages.length} page${visiblePages.length === 1 ? '' : 's'} · ${scope === 'all' && !kind ? 'the current collection' : wikiFilter.replace('kind:', '').replace('proposed', 'proposed changes')}`}
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
                      <span className="wiki-collection__kind">{WIKI_KIND_LABELS[row.kind] || row.kind}</span>
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
