import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDecisions } from '../../../api/decisions';
import '../../../styles/wiki-decisions-index.css';

const FILTERS = [
  { id: 'upcoming_review', label: 'Upcoming review' },
  { id: 'awaiting_outcome', label: 'Awaiting outcome' },
  { id: 'reviewed', label: 'Reviewed' }
];

const safeInternalHref = (value) => {
  const href = String(value || '').trim();
  return href.startsWith('/') && !href.startsWith('//') ? href : '';
};

const formatDate = (value) => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const continuityLabel = (continuity) => {
  if (!continuity) return 'Continuity unknown';
  if (continuity.complete) return 'Continuity verified';
  const missing = Array.isArray(continuity.missing) ? continuity.missing : [];
  if (!missing.length) return 'Incomplete continuity';
  return `Incomplete continuity · ${missing.join(', ')}`;
};

const dueLabel = (dueState) => {
  switch (dueState) {
    case 'overdue':
      return 'Review overdue';
    case 'upcoming':
      return 'Review upcoming';
    case 'unscheduled':
      return 'No review date';
    default:
      return '';
  }
};

const DecisionLinks = ({ item }) => {
  const claims = Array.isArray(item?.links?.claims?.resolved) ? item.links.claims.resolved : [];
  const sources = Array.isArray(item?.links?.sources?.resolved) ? item.links.sources.resolved : [];
  const missingClaims = Array.isArray(item?.links?.claims?.missingIds) ? item.links.claims.missingIds : [];
  const missingSources = Array.isArray(item?.links?.sources?.missingIds) ? item.links.sources.missingIds : [];
  const pageHref = safeInternalHref(item?.page?.href);
  const subjectHref = safeInternalHref(item?.subject?.href);

  return (
    <div className="wiki-decisions__links">
      {pageHref ? (
        <p>
          <span>Wiki page</span>
          {' '}
          <Link to={pageHref}>{item.page?.title || 'Open page'}</Link>
        </p>
      ) : null}
      {subjectHref ? (
        <p>
          <span>Decision</span>
          {' '}
          <Link to={subjectHref}>Open review</Link>
        </p>
      ) : null}
      {claims.length ? (
        <ul aria-label="Related claims">
          {claims.map(claim => {
            const href = safeInternalHref(claim.href);
            return (
              <li key={`claim:${claim.id}`}>
                {href ? <Link to={href}>{claim.title || claim.id}</Link> : <span>{claim.title || claim.id}</span>}
              </li>
            );
          })}
        </ul>
      ) : null}
      {sources.length ? (
        <ul aria-label="Source evidence">
          {sources.map(source => {
            const href = safeInternalHref(source.href);
            return (
              <li key={`source:${source.type}:${source.id}`}>
                {href ? <Link to={href}>{source.title || source.id}</Link> : <span>{source.title || source.id}</span>}
              </li>
            );
          })}
        </ul>
      ) : null}
      {missingClaims.length || missingSources.length ? (
        <p className="wiki-decisions__incomplete" role="status">
          Exact links unavailable for
          {missingClaims.length ? ` ${missingClaims.length} claim${missingClaims.length === 1 ? '' : 's'}` : ''}
          {missingClaims.length && missingSources.length ? ' and' : ''}
          {missingSources.length ? ` ${missingSources.length} source${missingSources.length === 1 ? '' : 's'}` : ''}
          .
        </p>
      ) : null}
    </div>
  );
};

const DecisionRow = ({ item }) => {
  const status = String(item?.decision?.status || '').trim();
  const due = dueLabel(item?.dueState);
  const incomplete = item?.continuity?.complete === false;

  return (
    <article className={`wiki-decisions__row${incomplete ? ' is-incomplete' : ''}`}>
      <header>
        <div>
          <p className="wiki-decisions__eyebrow">
            {status || 'decision'}
            {due ? ` · ${due}` : ''}
          </p>
          <h3>{item?.decision?.summary || item?.subject?.title || 'Untitled decision'}</h3>
        </div>
        <span className="wiki-decisions__continuity" role="status">
          {continuityLabel(item?.continuity)}
        </span>
      </header>
      <div className="wiki-decisions__arc" aria-label="Decision consequence chronology">
        <section>
          <p className="wiki-decisions__eyebrow">Decision as made</p>
          {item?.decision?.rationale ? (
            <p className="wiki-decisions__rationale">
              <strong>Original rationale</strong>
              {' '}
              {item.decision.rationale}
            </p>
          ) : null}
          {item?.decision?.expectedOutcome ? (
            <p className="wiki-decisions__expected">
              <strong>Expected outcome</strong>
              {' '}
              {item.decision.expectedOutcome}
            </p>
          ) : null}
          <p className="wiki-decisions__meta">
            {item?.continuity?.acceptedRevisionId
              ? `Accepted revision ${item.continuity.acceptedRevisionId}`
              : 'Accepted revision not verified'}
          </p>
        </section>
        <section>
          <p className="wiki-decisions__eyebrow">Review clock</p>
          <p className="wiki-decisions__meta">Review {formatDate(item?.decision?.reviewAt)}</p>
        </section>
        <section className={item?.outcome?.state === 'observed' ? 'is-observed' : ''}>
          <p className="wiki-decisions__eyebrow">What happened later</p>
          {item?.outcome?.state === 'observed' ? (
            <div className="wiki-decisions__outcome">
              <p>
                <strong>Observed</strong>
                {' '}
                {item.outcome?.result || 'unknown'}
                {item.outcome?.observedAt ? ` · ${formatDate(item.outcome.observedAt)}` : ''}
              </p>
              {item.outcome?.lesson ? <p>{item.outcome.lesson}</p> : null}
            </div>
          ) : item?.outcome?.state === 'review_incomplete' ? (
            <p className="wiki-decisions__incomplete" role="status">
              Outcome review is incomplete. Noeis does not treat it as observed.
            </p>
          ) : (
            <p className="wiki-decisions__quiet">
              Noeis has not inferred an outcome.
            </p>
          )}
        </section>
      </div>
      <DecisionLinks item={item} />
    </article>
  );
};

const DecisionsIndex = ({
  embedded = false,
  initialFilter = 'upcoming_review',
  pageId = '',
  limit = 25
} = {}) => {
  const [filter, setFilter] = useState(initialFilter);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async ({ append = false, cursor = '' } = {}) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError('');
    }
    try {
      const result = await getDecisions({
        filter,
        limit,
        windowDays: 30,
        pageId: pageId || undefined,
        cursor: cursor || undefined
      });
      setItems(current => (append ? [...current, ...result.items] : result.items));
      setCounts(result.counts);
      setNextCursor(result.nextCursor || null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not load decisions.');
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getDecisions({
      filter,
      limit,
      windowDays: 30,
      pageId: pageId || undefined
    }).then((result) => {
      if (cancelled) return;
      setItems(result.items);
      setCounts(result.counts);
      setNextCursor(result.nextCursor || null);
    }).catch((err) => {
      if (cancelled) return;
      setError(err?.response?.data?.error || err?.message || 'Could not load decisions.');
      setItems([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filter, limit, pageId]);

  return (
    <section
      className={`wiki-decisions${embedded ? ' wiki-decisions--embedded' : ''}`}
      aria-labelledby="wiki-decisions-title"
      aria-busy={loading || undefined}
    >
      <header className="wiki-decisions__heading">
        <div>
          <p className="wiki-index__eyebrow">Decisions</p>
          <h2 id="wiki-decisions-title">
            {loading
              ? 'Loading decisions…'
              : 'Review decisions and observed outcomes.'}
          </h2>
          <p className="wiki-decisions__lede">
            Decisions are reconstructed from accepted claim revisions, exact claims, and owned sources.
            Outcomes are never inferred.
          </p>
        </div>
      </header>

      <div className="wiki-decisions__filters" role="tablist" aria-label="Decision filters">
        {FILTERS.map(option => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={filter === option.id}
            className={filter === option.id ? 'is-active' : undefined}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
            {counts && typeof counts[option.id] === 'number' ? ` (${counts[option.id]})` : ''}
          </button>
        ))}
      </div>

      {error ? (
        <div className="wiki-decisions__error" role="status">
          <p>{error}</p>
          <button type="button" onClick={() => load()}>Try again</button>
        </div>
      ) : null}

      {!error && !loading && !items.length ? (
        <p className="wiki-decisions__quiet">
          No decisions match this filter.
        </p>
      ) : null}

      {items.length ? (
        <ol className="wiki-decisions__list">
          {items.map(item => (
            <li key={item.id || `${item.identity?.pageId}:${item.identity?.decisionId}`}>
              <DecisionRow item={item} />
            </li>
          ))}
        </ol>
      ) : null}

      {nextCursor ? (
        <button
          type="button"
          className="wiki-decisions__more"
          disabled={loadingMore}
          onClick={() => load({ append: true, cursor: nextCursor })}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
};

export default DecisionsIndex;
