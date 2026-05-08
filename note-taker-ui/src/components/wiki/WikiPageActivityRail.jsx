import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { listWikiConnectorActions, listWikiRevisions, reviewWikiFreshness } from '../../api/wiki';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const WikiPageActivityRail = ({ pageId, page, onPageUpdate }) => {
  const [revisions, setRevisions] = useState([]);
  const [actions, setActions] = useState([]);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [nextRevisions, nextActions] = await Promise.all([
          listWikiRevisions(pageId),
          listWikiConnectorActions(pageId)
        ]);
        if (!cancelled) {
          setRevisions(nextRevisions);
          setActions(nextActions);
        }
      } catch (_error) {
        if (!cancelled) setRevisions([]);
      }
    };
    if (pageId) load();
    return () => {
      cancelled = true;
    };
  }, [pageId, page?.updatedAt]);

  const freshness = page?.freshness || {};
  const status = freshness.status || 'fresh';
  const conflictCount = freshness.conflictCount || 0;
  const staleCount = freshness.staleSectionCount || 0;
  const needsReview = conflictCount > 0 || staleCount > 0 || status === 'conflicted' || status === 'needs_review';

  const handleReview = async () => {
    setReviewing(true);
    try {
      const updated = await reviewWikiFreshness(pageId);
      onPageUpdate?.(updated);
    } finally {
      setReviewing(false);
    }
  };

  return (
    <section className="wiki-activity-rail" aria-label="Wiki page activity">
      <div className="wiki-activity-rail__head">
        <p className="wiki-activity-rail__eyebrow">Page pulse</p>
        <span className={`wiki-activity-rail__pill wiki-activity-rail__pill--${status}`}>{status.replace(/_/g, ' ')}</span>
      </div>
      <div className="wiki-activity-rail__metrics">
        <span>{conflictCount} conflicts</span>
        <span>{staleCount} stale sections</span>
      </div>
      {needsReview ? (
        <div className="wiki-activity-rail__review">
          <p>This page has freshness or conflict signals that need human review.</p>
          <Button type="button" variant="secondary" onClick={handleReview} disabled={reviewing}>
            {reviewing ? 'Marking...' : 'Mark reviewed'}
          </Button>
        </div>
      ) : null}
      {actions.length ? (
        <div className="wiki-activity-rail__connectors">
          <strong>Connector history</strong>
          <ul className="wiki-activity-rail__list">
            {actions.slice(0, 3).map(action => (
              <li key={action._id}>
                <strong>{action.connector} {action.direction}</strong>
                <span>{action.summary || action.action}</span>
                <time>{formatDate(action.createdAt)}</time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="wiki-activity-rail__list">
        {revisions.slice(0, 5).map(revision => (
          <li key={revision._id}>
            <strong>{String(revision.reason || 'updated').replace(/_/g, ' ')}</strong>
            <span>{revision.summary || (revision.actorType === 'agent' ? 'Agent updated this page.' : 'Page changed.')}</span>
            <time>{formatDate(revision.createdAt)}</time>
          </li>
        ))}
      </ul>
      {!revisions.length ? <p className="wiki-activity-rail__empty">No revision history yet.</p> : null}
    </section>
  );
};

export default WikiPageActivityRail;
