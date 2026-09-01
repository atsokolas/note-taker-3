import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../ui';
import { createWikiPage, deleteWikiPage, listWikiPages } from '../../api/wiki';
import { buildWikiCreatePayload, openWikiDraft } from '../../utils/wikiCreate';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import WikiEmergingProposals from './WikiEmergingProposals';
import WikiInbox from './WikiInbox';
import WikiFacetRail from './WikiFacetRail';
import { PAGE_TYPES, labelFor } from './wikiGraph';
import {
  computeWikiFacetCounts,
  isWikiAllPagesActive,
  WIKI_KIND_FLAGS,
  wikiKindForPage
} from './wikiFacetModel';
import {
  formatWikiRowDate,
  wikiPreviewForPage,
  wikiRowMetaForPage
} from './wikiPageMetrics';
import {
  BLOCKED_SURFACE_EXPLANATION,
  formatQualityReviewReasons,
  isPageQualityBlocked,
  normalizeQualityReview,
  qualityReviewLabel
} from './wikiPageQualityReview';
import { dedupePagesByRepoKey } from './wikiRepoDedupeModel';
import {
  canonicalWikiPages,
  groupWikiPagesByTitle
} from './wikiTitleGroupModel';
import { displayWikiPageTitle } from './wikiRepoDossierModel';
import { buildReviewTriage } from './reviewTriageModel';
import useMagneticRow from '../../hooks/useMagneticRow';

const VISIBILITIES = ['all', 'private', 'shared'];
const STATUSES = ['all', 'draft', 'published', 'archived'];

const WikiPageRowKicker = ({ page, showQualityReview, qualityLabel, blocked }) => (
  <div className="library-article-row-kicker">
    <span className="library-article-row-source">{WIKI_KIND_FLAGS[wikiKindForPage(page)]}</span>
    <span className="library-article-row-tag">{labelFor(page.pageType || 'topic')}</span>
    <span className="library-article-row-tag">{labelFor(page.status || 'draft')}</span>
    {String(page.visibility || 'private') === 'shared' ? (
      <span className="library-article-row-tag">Shared</span>
    ) : null}
    {showQualityReview && qualityLabel && qualityLabel !== 'Needs review' ? (
      <span
        className={`wiki-index__quality-badge wiki-index__quality-badge--${blocked ? 'blocked' : 'review'}`}
      >
        {qualityLabel}
      </span>
    ) : null}
  </div>
);

const WikiPageRow = ({
  compact = false,
  deleting,
  page,
  onDelete,
  onOpen,
  showQualityReview = false,
  reviewReason = ''
}) => {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activated, setActivated] = useState(false);
  const receiptTimerRef = useRef(null);
  const magnetic = useMagneticRow();
  const snippet = wikiPreviewForPage(page, compact ? 118 : 180);
  const title = displayWikiPageTitle(page);
  const qualityReview = normalizeQualityReview(page);
  const qualityLabel = qualityReviewLabel(qualityReview);
  const qualityReasons = formatQualityReviewReasons(qualityReview);
  const blocked = isPageQualityBlocked(page);
  const rowDate = page.updatedAt || page.createdAt;
  const metaLine = wikiRowMetaForPage(page);
  const rowClassName = [
    'library-article-row',
    'is-magnetic',
    activated ? 'is-activated' : '',
    showQualityReview ? 'library-article-row--quality-review' : ''
  ].filter(Boolean).join(' ');

  const handleOpen = (event) => {
    if (!onOpen) return;
    event.preventDefault();
    setActivated(true);
    if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
    receiptTimerRef.current = window.setTimeout(() => setActivated(false), 720);
    onOpen();
  };

  useEffect(() => () => {
    if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
  }, []);

  const mainContent = (
    <>
      <div className="library-article-row-title">{title}</div>
      <WikiPageRowKicker
        page={page}
        showQualityReview={showQualityReview}
        qualityLabel={qualityLabel}
        blocked={blocked}
      />
      {snippet ? (
        <div className="library-article-row-excerpt">{snippet}</div>
      ) : (
        <div className="library-article-row-excerpt">No body yet. Open the page to start writing.</div>
      )}
      {showQualityReview && blocked ? (
        <p className="wiki-index__quality-blocked-note">{BLOCKED_SURFACE_EXPLANATION}</p>
      ) : null}
      {showQualityReview && reviewReason ? (
        <p className="wiki-index__review-reason">{reviewReason}</p>
      ) : null}
      {showQualityReview && qualityReasons.length ? (
        <ul className="wiki-index__quality-reasons">
          {qualityReasons.map((reason) => (
            <li key={`${page._id || page.id}-${reason}`}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="library-article-row-meta">
        <span>{metaLine}</span>
      </div>
    </>
  );

  return (
    <div
      ref={magnetic.rowRef}
      className={rowClassName}
      role="article"
      aria-label={title}
      onPointerMove={magnetic.onPointerMove}
      onPointerLeave={magnetic.onPointerLeave}
    >
      <div className="library-article-row-date">{formatWikiRowDate(rowDate)}</div>
      {showQualityReview ? (
        <div className="library-article-row-main">{mainContent}</div>
      ) : (
        <Link
          className="library-article-row-main"
          to={wikiPagePath(page._id || page.id)}
          aria-label={`Open ${title}`}
          onClick={handleOpen}
        >
          {mainContent}
        </Link>
      )}
      {showQualityReview ? (
        <div className="wiki-index__page-actions wiki-index__page-actions--quality-review">
          <Button
            type="button"
            variant="secondary"
            className="wiki-index__page-open library-article-row-action"
            disabled={deleting}
            aria-label={`Open ${title}`}
            onClick={() => onOpen?.()}
          >
            Open
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="wiki-index__page-delete library-article-row-action"
            disabled={deleting}
            aria-label={`Archive ${title}`}
            onClick={onDelete}
          >
            {deleting ? 'Archiving...' : 'Archive'}
          </Button>
        </div>
      ) : (
        <div className="wiki-index__page-actions">
          <button
            type="button"
            className="library-article-row-action wiki-index__page-more"
            disabled={deleting}
            aria-label={`More actions for ${title}`}
            aria-expanded={actionsOpen}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              setActionsOpen(open => !open);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            More
          </button>
          {actionsOpen ? (
            <div className="wiki-index__page-menu" role="menu" aria-label={`Actions for ${title}`}>
              <Button
                type="button"
                variant="secondary"
                className="wiki-index__page-delete"
                disabled={deleting}
                aria-label={`Archive ${title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  setActivated(true);
                  if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
                  receiptTimerRef.current = window.setTimeout(() => setActivated(false), 720);
                  onDelete();
                }}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {deleting ? 'Archiving...' : 'Archive'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {activated ? <span className="library-article-row-receipt" role="status">Opening</span> : null}
    </div>
  );
};

const WikiList = ({ compact = false, onOpenPage }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pages, setPages] = useState([]);
  const [catalogPages, setCatalogPages] = useState([]);
  const [catalogKnown, setCatalogKnown] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [pageType, setPageType] = useState('all');
  const [visibility, setVisibility] = useState('all');
  const [status, setStatus] = useState('all');
  const [seed, setSeed] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const needsReviewFilter = searchParams.get('quality') === 'needs_review';

  const requestParams = useMemo(() => {
    const params = { summary: 1 };
    if (query.trim()) params.q = query.trim();
    if (pageType !== 'all') params.pageType = pageType;
    if (visibility !== 'all') params.visibility = visibility;
    if (status !== 'all') params.status = status;
    if (needsReviewFilter) {
      params.quality = 'needs_review';
      params.scanAll = true;
    }
    return params;
  }, [needsReviewFilter, pageType, query, status, visibility]);

  const visiblePages = useMemo(
    () => (kind === 'all' ? pages : pages.filter((page) => wikiKindForPage(page) === kind)),
    [kind, pages]
  );

  const displayGroups = useMemo(
    () => groupWikiPagesByTitle(dedupePagesByRepoKey(visiblePages)),
    [visiblePages]
  );
  const reviewTriage = useMemo(
    () => buildReviewTriage({
      pages: displayGroups.map(group => group.canonical),
      assumeNeedsReview: needsReviewFilter
    }),
    [displayGroups, needsReviewFilter]
  );
  const promotedGroups = useMemo(() => {
    if (!needsReviewFilter) return displayGroups;
    const order = new Map(reviewTriage.promoted.map((item, index) => [item.pageId, index]));
    return displayGroups
      .filter(group => order.has(String(group.canonical?._id || group.canonical?.id || '')))
      .sort((left, right) => (
        order.get(String(left.canonical?._id || left.canonical?.id || ''))
        - order.get(String(right.canonical?._id || right.canonical?.id || ''))
      ));
  }, [displayGroups, needsReviewFilter, reviewTriage]);
  const minorGroups = useMemo(() => {
    if (!needsReviewFilter) return [];
    const promotedIds = new Set(reviewTriage.promoted.map(item => item.pageId));
    return displayGroups.filter(group => (
      !promotedIds.has(String(group.canonical?._id || group.canonical?.id || ''))
    ));
  }, [displayGroups, needsReviewFilter, reviewTriage]);
  const reviewReasonById = useMemo(() => new Map(
    reviewTriage.promoted.map(item => [item.pageId, item.reason])
  ), [reviewTriage]);

  /* Facets count what the list shows: one page per title, not every copy. */
  const facetCounts = useMemo(
    () => computeWikiFacetCounts(canonicalWikiPages(dedupePagesByRepoKey(catalogPages))),
    [catalogPages]
  );

  const setNeedsReviewFilter = (enabled) => {
    const nextParams = new URLSearchParams(searchParams);
    if (enabled) nextParams.set('quality', 'needs_review');
    else nextParams.delete('quality');
    setSearchParams(nextParams.toString(), { replace: true });
  };

  const loadPages = async () => {
    setLoading(true);
    setError('');
    try {
      const nextPages = await listWikiPages(requestParams);
      setPages(nextPages);
      if (
        compact
        && isWikiAllPagesActive({ kind, pageType, visibility, status, needsReviewFilter })
      ) {
        setCatalogPages(nextPages);
        setCatalogKnown(true);
      }
    } catch (_error) {
      setError('Failed to load Wiki pages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
    // requestParams is memoized from the individual filter states.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestParams]);

  const openPage = (pageId) => {
    if (!pageId) return;
    if (onOpenPage) {
      onOpenPage(pageId);
      return;
    }
    navigate(wikiPagePath(pageId));
  };

  const handleCreate = async (event) => {
    event?.preventDefault();
    setCreating(true);
    setError('');
    try {
      const page = await createWikiPage(buildWikiCreatePayload({
        type: seed.trim() ? 'idea' : 'wiki_index',
        text: seed,
        title: seed
      }));
      if (onOpenPage && page?._id) onOpenPage(page._id);
      else openWikiDraft({ navigate, pageId: page._id });
    } catch (_error) {
      setError('That did not save.');
      setCreating(false);
    }
  };

  const handleDelete = async (page) => {
    if (!page?._id) return;
    const title = displayWikiPageTitle(page);
    if (!window.confirm(`Archive "${title}"?`)) return;
    setDeletingId(page._id);
    setError('');
    try {
      await deleteWikiPage(page._id);
      setPages(current => current.filter(item => item._id !== page._id));
      setCatalogPages(current => current.filter(item => item._id !== page._id));
    } catch (_error) {
      setError('That did not save.');
    } finally {
      setDeletingId('');
    }
  };

  const handleSelectAllPages = () => {
    setKind('all');
    setPageType('all');
    setVisibility('all');
    setStatus('all');
    setNeedsReviewFilter(false);
  };

  const handleSelectNeedsReview = () => {
    setNeedsReviewFilter(!needsReviewFilter);
  };

  const handleSelectKind = (nextKind) => {
    setKind(current => (current === nextKind ? 'all' : nextKind));
  };

  const listBody = (
    <>
      {!compact ? (
        <section className="wiki-index__filters" aria-label="Wiki filters">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages"
            aria-label="Search Wiki pages"
          />
          <select value={pageType} onChange={(event) => setPageType(event.target.value)} aria-label="Page type">
            {PAGE_TYPES.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
          </select>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value)} aria-label="Visibility">
            {VISIBILITIES.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
            {STATUSES.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
          </select>
          <button
            type="button"
            className={`wiki-index__quality-filter${needsReviewFilter ? ' is-active' : ''}`}
            aria-pressed={needsReviewFilter}
            aria-label="Show pages that need quality review"
            onClick={() => setNeedsReviewFilter(!needsReviewFilter)}
          >
            Needs review
          </button>
        </section>
      ) : null}

      {needsReviewFilter && reviewTriage.frame ? (
        <p className="wiki-index__quality-filter-note wiki-index__review-triage">
          {reviewTriage.frame}
        </p>
      ) : null}

      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      {loading ? <p className="wiki-index__status">Loading Wiki pages...</p> : null}

      {!loading && displayGroups.length === 0 ? (
        <section className="wiki-index__empty">
          {needsReviewFilter ? (
            <>
              <h2>No pages need review</h2>
              <p>Every visible page passed the current quality bar.</p>
            </>
          ) : (
            <>
              <h2>No Wiki pages yet</h2>
              <p>Create the first page from any idea or source you want to develop.</p>
              <Button type="button" onClick={handleCreate} disabled={creating}>Create a draft</Button>
            </>
          )}
        </section>
      ) : null}

      <section
        className={`library-article-list wiki-index__list${loading ? ' is-loading' : ''}`}
        aria-label="Wiki pages"
      >
        {(needsReviewFilter ? promotedGroups : displayGroups).map(group => {
          const page = group.canonical;
          const id = page._id || page.id;
          return (
            <WikiPageRow
              key={group.key}
              compact={compact}
              page={page}
              showQualityReview={needsReviewFilter}
              reviewReason={needsReviewFilter ? (reviewReasonById.get(String(id)) || '') : ''}
              deleting={deletingId === id}
              onOpen={() => openPage(id)}
              onDelete={() => handleDelete(page)}
            />
          );
        })}
      </section>
      {needsReviewFilter && minorGroups.length ? (
        <details className="wiki-index__review-drawer">
          <summary>The rest of the queue</summary>
          <section className="library-article-list wiki-index__list" aria-label="Minor review pages">
            {minorGroups.map(group => {
              const page = group.canonical;
              const id = page._id || page.id;
              return (
                <WikiPageRow
                  key={group.key}
                  compact={compact}
                  page={page}
                  showQualityReview
                  deleting={deletingId === id}
                  onOpen={() => openPage(id)}
                  onDelete={() => handleDelete(page)}
                />
              );
            })}
          </section>
        </details>
      ) : null}
    </>
  );

  const Container = compact ? 'section' : 'main';

  return (
    <Container className={`wiki-page wiki-index${compact ? ' wiki-index--compact wiki-index--faceted' : ''}`}>
      {!compact ? (
        <>
          <WikiEmergingProposals />
          <WikiInbox />
          <section className="wiki-index__header">
            <div className="wiki-index__title-block">
              <p className="wiki-index__eyebrow">Wiki list</p>
              <h1>Editable knowledge pages</h1>
              <p>Draft source-backed pages from any idea, question, note, highlight, or article.</p>
            </div>
            <form className="wiki-index__composer" onSubmit={handleCreate}>
              <label htmlFor="wiki-create-input">New page</label>
              <div className="wiki-index__composer-row">
                <input
                  id="wiki-create-input"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  placeholder="Start from an idea, question, source, or rough note"
                />
                <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create'}</Button>
              </div>
            </form>
          </section>
        </>
      ) : null}

      {compact ? (
        <div className="wiki-index__faceted-layout">
          <WikiFacetRail
            query={query}
            kind={kind}
            pageType={pageType}
            visibility={visibility}
            status={status}
            needsReviewFilter={needsReviewFilter}
            facetCounts={catalogKnown ? facetCounts : null}
            onQueryChange={setQuery}
            onSelectAllPages={handleSelectAllPages}
            onSelectKind={handleSelectKind}
            onSelectNeedsReview={handleSelectNeedsReview}
          />
          <div className="wiki-index__faceted-main">
            {listBody}
          </div>
        </div>
      ) : listBody}
    </Container>
  );
};

export default WikiList;
