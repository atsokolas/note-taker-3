import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWikiBriefing } from '../../api/wiki';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';

/**
 * WikiBriefing — top-of-index "Daily briefing" card. Surfaces a 1–3
 * sentence agent-authored summary of what's new in the user's wiki +
 * library over the last 24h, plus three glanceable signal counts and
 * a "Pages drifting" rail with one-tap "Open" links.
 *
 * Self-loading: hits GET /api/wiki/briefing on mount. Renders a low-
 * key skeleton while loading and quietly hides itself if the request
 * fails — the index is still usable without it.
 */

const formatRelative = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

const Chip = ({ label, count, tone = 'neutral' }) => (
  <span className={`wiki-briefing__chip wiki-briefing__chip--${tone}`}>
    <strong>{count}</strong>
    <span>{label}</span>
  </span>
);

const PagePreview = ({ pageId, title, sub }) => {
  const inner = (
    <>
      <span className="wiki-briefing__preview-title">{title || 'Untitled wiki page'}</span>
      {sub ? <span className="wiki-briefing__preview-sub">{sub}</span> : null}
    </>
  );
  if (pageId) {
    return (
      <Link className="wiki-briefing__preview" to={wikiPagePath(pageId)}>
        {inner}
      </Link>
    );
  }
  return <span className="wiki-briefing__preview wiki-briefing__preview--static">{inner}</span>;
};

const WikiBriefing = () => {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getWikiBriefing()
      .then((data) => {
        if (cancelled) return;
        setBriefing(data || null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHidden(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden) return null;

  if (loading) {
    return (
      <section className="wiki-briefing wiki-briefing--loading" aria-label="Daily wiki briefing">
        <div className="wiki-briefing__head">
          <span className="wiki-briefing__eyebrow">Daily briefing</span>
        </div>
        <div className="wiki-briefing__skeleton" aria-hidden="true">
          <div className="wiki-briefing__skeleton-line" />
          <div className="wiki-briefing__skeleton-line wiki-briefing__skeleton-line--short" />
        </div>
      </section>
    );
  }

  if (!briefing) return null;

  const counts = briefing.counts || {};
  const updated = Array.isArray(briefing.recentlyUpdatedPages) ? briefing.recentlyUpdatedPages : [];
  const drifting = Array.isArray(briefing.driftingPages) ? briefing.driftingPages : [];

  return (
    <section className="wiki-briefing" aria-label="Daily wiki briefing" data-testid="wiki-briefing">
      <header className="wiki-briefing__head">
        <span className="wiki-briefing__eyebrow">Daily briefing</span>
        <span className="wiki-briefing__meta">
          Updated {formatRelative(briefing.generatedAt)}
        </span>
      </header>
      <p className="wiki-briefing__summary">{briefing.summary}</p>
      <div className="wiki-briefing__chips">
        <Chip label={counts.newSources === 1 ? 'new source' : 'new sources'} count={counts.newSources || 0} tone="positive" />
        <Chip label={counts.recentlyUpdatedPages === 1 ? 'page updated' : 'pages updated'} count={counts.recentlyUpdatedPages || 0} tone="neutral" />
        <Chip label={counts.driftingPages === 1 ? 'page drifting' : 'pages drifting'} count={counts.driftingPages || 0} tone={counts.driftingPages > 0 ? 'warning' : 'neutral'} />
      </div>
      {drifting.length > 0 ? (
        <div className="wiki-briefing__group" aria-label="Pages drifting">
          <h4 className="wiki-briefing__group-title">Pages drifting</h4>
          <ul className="wiki-briefing__list">
            {drifting.slice(0, 5).map((page) => (
              <li key={`drift-${page._id || page.title}`}>
                <PagePreview
                  pageId={page._id}
                  title={page.title}
                  sub={`${page.driftSignals} signal${page.driftSignals === 1 ? '' : 's'} pending`}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {updated.length > 0 ? (
        <div className="wiki-briefing__group" aria-label="Recently updated pages">
          <h4 className="wiki-briefing__group-title">Recently updated</h4>
          <ul className="wiki-briefing__list">
            {updated.slice(0, 5).map((page) => (
              <li key={`updated-${page._id || page.title}`}>
                <PagePreview
                  pageId={page._id}
                  title={page.title}
                  sub={`Reviewed ${formatRelative(page.lastDraftedAt)}`}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export default WikiBriefing;
