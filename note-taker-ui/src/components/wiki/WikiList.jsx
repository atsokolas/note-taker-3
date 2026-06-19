import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, SurfaceCard } from '../ui';
import { createWikiPage, deleteWikiPage, listWikiPages } from '../../api/wiki';
import { buildWikiCreatePayload, openWikiDraft } from '../../utils/wikiCreate';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import WikiBriefing from './WikiBriefing';
import WikiEmergingProposals from './WikiEmergingProposals';
import WikiInbox from './WikiInbox';
import { PAGE_TYPES, formatDate, labelFor } from './wikiGraph';
import { countWikiSources, wikiPreviewForPage, wikiSourceStatusForPage } from './wikiPageMetrics';
import {
  BLOCKED_SURFACE_EXPLANATION,
  formatQualityReviewReasons,
  isPageQualityBlocked,
  normalizeQualityReview,
  qualityReviewLabel
} from './wikiPageQualityReview';

const VISIBILITIES = ['all', 'private', 'shared'];
const STATUSES = ['all', 'draft', 'published', 'archived'];

const WikiPageCard = ({
  compact = false,
  deleting,
  page,
  onDelete,
  onOpen,
  showQualityReview = false
}) => {
  const [actionsOpen, setActionsOpen] = useState(false);
  const snippet = wikiPreviewForPage(page, compact ? 118 : 180);
  const title = page.title || 'Untitled Wiki Page';
  const sourceTotal = countWikiSources(page);
  const sourceStatus = wikiSourceStatusForPage(page);
  const qualityReview = normalizeQualityReview(page);
  const qualityLabel = qualityReviewLabel(qualityReview);
  const qualityReasons = formatQualityReviewReasons(qualityReview);
  const blocked = isPageQualityBlocked(page);

  const handleOpen = (event) => {
    if (!onOpen) return;
    event.preventDefault();
    onOpen();
  };

  return (
    <SurfaceCard
      className={`wiki-index__page-card${compact ? ' wiki-index__page-card--compact' : ''}${showQualityReview ? ' wiki-index__page-card--quality-review' : ''}`}
      role="article"
      aria-label={title}
    >
      {showQualityReview ? (
        <div className="wiki-index__page-body">
          <div className="wiki-index__page-meta">
            <span>{labelFor(page.pageType || 'topic')}</span>
            <span>{labelFor(page.status || 'draft')}</span>
            {qualityLabel ? (
              <span
                className={`wiki-index__quality-badge wiki-index__quality-badge--${blocked ? 'blocked' : 'review'}`}
              >
                {qualityLabel}
              </span>
            ) : null}
          </div>
          <h2>{title}</h2>
          <p>{snippet || 'No body yet. Open the page to start writing.'}</p>
          {blocked ? (
            <p className="wiki-index__quality-blocked-note">{BLOCKED_SURFACE_EXPLANATION}</p>
          ) : null}
          {qualityReasons.length ? (
            <ul className="wiki-index__quality-reasons">
              {qualityReasons.map((reason) => (
                <li key={`${page._id || page.id}-${reason}`}>{reason}</li>
              ))}
            </ul>
          ) : null}
          <div className="wiki-index__page-footer">
            <span>{sourceTotal > 0 ? `${sourceTotal} source${sourceTotal === 1 ? '' : 's'}` : sourceStatus}</span>
            <span>{formatDate(page.updatedAt)}</span>
          </div>
        </div>
      ) : (
        <Link
          className="wiki-index__page-link"
          to={wikiPagePath(page._id || page.id)}
          aria-label={`Open ${title}`}
          onClick={handleOpen}
        >
          <div className="wiki-index__page-meta">
            <span>{labelFor(page.pageType || 'topic')}</span>
            <span>{labelFor(page.status || 'draft')}</span>
          </div>
          <h2>{title}</h2>
          <p>{snippet || 'No body yet. Open the page to start writing.'}</p>
          <div className="wiki-index__page-footer">
            <span>{sourceTotal > 0 ? `${sourceTotal} source${sourceTotal === 1 ? '' : 's'}` : sourceStatus}</span>
            <span>{formatDate(page.updatedAt)}</span>
          </div>
        </Link>
      )}
      <div className={`wiki-index__page-actions${showQualityReview ? ' wiki-index__page-actions--quality-review' : ''}`}>
        {showQualityReview ? (
          <>
            <Button
              type="button"
              variant="secondary"
              className="wiki-index__page-open"
              disabled={deleting}
              aria-label={`Open ${title}`}
              onClick={() => onOpen?.()}
            >
              Open
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="wiki-index__page-delete"
              disabled={deleting}
              aria-label={`Archive ${title}`}
              onClick={onDelete}
            >
              {deleting ? 'Archiving...' : 'Archive'}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              className="wiki-index__page-more"
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
            </Button>
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
                    onDelete();
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {deleting ? 'Archiving...' : 'Archive'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </SurfaceCard>
  );
};

const WikiList = ({ compact = false, onOpenPage }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pages, setPages] = useState([]);
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
      setPages(await listWikiPages(requestParams));
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
    } catch (_error) {
      setError('Failed to archive Wiki page.');
    } finally {
      setDeletingId('');
    }
  };

  const Container = compact ? 'section' : 'main';

  return (
    <Container className={`wiki-page wiki-index${compact ? ' wiki-index--compact' : ''}`}>
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

      <section className="wiki-index__filters" aria-label={compact ? 'Wiki mobile list filters' : 'Wiki filters'}>
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

      <section className="wiki-index__grid" aria-label="Wiki pages">
        {pages.map(page => (
          <WikiPageCard
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
    </Container>
  );
};

export default WikiList;
