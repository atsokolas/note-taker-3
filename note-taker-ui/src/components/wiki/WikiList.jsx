import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../ui';
import { createWikiPage, deleteWikiPage, listWikiPages } from '../../api/wiki';
import { buildWikiCreatePayload, openWikiDraft } from '../../utils/wikiCreate';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import WikiBriefing from './WikiBriefing';
import WikiEmergingProposals from './WikiEmergingProposals';
import WikiInbox from './WikiInbox';
import WikiFacetRail from './WikiFacetRail';
import { PAGE_TYPES, labelFor } from './wikiGraph';
import { computeWikiFacetCounts, isWikiAllPagesActive } from './wikiFacetModel';
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

const VISIBILITIES = ['all', 'private', 'shared'];
const STATUSES = ['all', 'draft', 'published', 'archived'];

const WikiPageRowKicker = ({ page, showQualityReview, qualityLabel, blocked }) => (
  <div className="library-article-row-kicker">
    <span className="library-article-row-source">{labelFor(page.pageType || 'topic')}</span>
    <span className="library-article-row-tag">{labelFor(page.status || 'draft')}</span>
    {String(page.visibility || 'private') === 'shared' ? (
      <span className="library-article-row-tag">Shared</span>
    ) : null}
    {showQualityReview && qualityLabel ? (
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
  showQualityReview = false
}) => {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activated, setActivated] = useState(false);
  const receiptTimerRef = useRef(null);
  const snippet = wikiPreviewForPage(page, compact ? 118 : 180);
  const title = page.title || 'Untitled Wiki Page';
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

  const handlePointerMove = (event) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--row-bloom-x', `${event.clientX - rect.left}px`);
    target.style.setProperty('--row-bloom-y', `${event.clientY - rect.top}px`);
  };

  const handlePointerLeave = (event) => {
    const target = event.currentTarget;
    target.style.removeProperty('--row-bloom-x');
    target.style.removeProperty('--row-bloom-y');
  };

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
      className={rowClassName}
      role="article"
      aria-label={title}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
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
  const [query, setQuery] = useState('');
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
    const params = {};
    if (query.trim()) params.q = query.trim();
    if (pageType !== 'all') params.pageType = pageType;
    if (visibility !== 'all') params.visibility = visibility;
    if (status !== 'all') params.status = status;
    if (needsReviewFilter) params.quality = 'needs_review';
    return params;
  }, [needsReviewFilter, pageType, query, status, visibility]);

  const facetCounts = useMemo(
    () => computeWikiFacetCounts(catalogPages),
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
        && isWikiAllPagesActive({ pageType, visibility, status, needsReviewFilter })
      ) {
        setCatalogPages(nextPages);
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
      setError('Failed to create Wiki page.');
      setCreating(false);
    }
  };

  const handleDelete = async (page) => {
    if (!page?._id) return;
    const title = page.title || 'Untitled Wiki Page';
    if (!window.confirm(`Archive "${title}"?`)) return;
    setDeletingId(page._id);
    setError('');
    try {
      await deleteWikiPage(page._id);
      setPages(current => current.filter(item => item._id !== page._id));
      setCatalogPages(current => current.filter(item => item._id !== page._id));
    } catch (_error) {
      setError('Failed to archive Wiki page.');
    } finally {
      setDeletingId('');
    }
  };

  const handleSelectAllPages = () => {
    setPageType('all');
    setVisibility('all');
    setStatus('all');
    setNeedsReviewFilter(false);
  };

  const handleSelectNeedsReview = () => {
    setNeedsReviewFilter(!needsReviewFilter);
  };

  const handleSelectPageType = (nextType) => {
    setPageType(current => (current === nextType ? 'all' : nextType));
  };

  const handleSelectStatus = (nextStatus) => {
    setStatus(current => (current === nextStatus ? 'all' : nextStatus));
  };

  const handleSelectVisibility = (nextVisibility) => {
    setVisibility(current => (current === nextVisibility ? 'all' : nextVisibility));
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

      {needsReviewFilter ? (
        <p className="wiki-index__quality-filter-note">
          Pages with quality issues, including ones hidden from Explore and retrieval.
        </p>
      ) : null}

      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      {loading ? <p className="wiki-index__status">Loading Wiki pages...</p> : null}

      {!loading && pages.length === 0 ? (
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
        {pages.map(page => (
          <WikiPageRow
            key={page._id}
            compact={compact}
            page={page}
            showQualityReview={needsReviewFilter}
            deleting={deletingId === page._id}
            onOpen={() => openPage(page._id)}
            onDelete={() => handleDelete(page)}
          />
        ))}
      </section>
    </>
  );

  const Container = compact ? 'section' : 'main';

  return (
    <Container className={`wiki-page wiki-index${compact ? ' wiki-index--compact wiki-index--faceted' : ''}`}>
      {!compact ? (
        <>
          <WikiBriefing />
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
            scope="primary"
            query={query}
            pageType={pageType}
            visibility={visibility}
            status={status}
            needsReviewFilter={needsReviewFilter}
            facetCounts={facetCounts}
            onQueryChange={setQuery}
            onSelectAllPages={handleSelectAllPages}
            onSelectNeedsReview={handleSelectNeedsReview}
            onSelectPageType={handleSelectPageType}
            onSelectStatus={handleSelectStatus}
            onSelectVisibility={handleSelectVisibility}
          />
          <div className="wiki-index__faceted-main">
            {listBody}
          </div>
          <WikiFacetRail
            scope="deep"
            deepSectionsDefaultOpen={false}
            pageType={pageType}
            visibility={visibility}
            status={status}
            needsReviewFilter={needsReviewFilter}
            facetCounts={facetCounts}
            onSelectPageType={handleSelectPageType}
            onSelectStatus={handleSelectStatus}
            onSelectVisibility={handleSelectVisibility}
          />
        </div>
      ) : listBody}
    </Container>
  );
};

export default WikiList;
