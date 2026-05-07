import React, { useEffect, useState } from 'react';
import { listWikiRevisions } from '../../api/wiki';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const WikiPageActivityRail = ({ pageId, page }) => {
  const [revisions, setRevisions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await listWikiRevisions(pageId);
        if (!cancelled) setRevisions(next);
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

  return (
    <section className="wiki-activity-rail" aria-label="Wiki page activity">
      <div className="wiki-activity-rail__head">
        <p className="wiki-activity-rail__eyebrow">Page pulse</p>
        <span className={`wiki-activity-rail__pill wiki-activity-rail__pill--${status}`}>{status.replace(/_/g, ' ')}</span>
      </div>
      <div className="wiki-activity-rail__metrics">
        <span>{freshness.conflictCount || 0} conflicts</span>
        <span>{freshness.staleSectionCount || 0} stale sections</span>
      </div>
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
