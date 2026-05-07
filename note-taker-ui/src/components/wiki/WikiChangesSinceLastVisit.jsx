import React, { useMemo, useState } from 'react';

/**
 * WikiChangesSinceLastVisit — top-of-page banner that surfaces what
 * changed on a wiki page since the owner last viewed it.
 *
 * Renders only when there is an actual diff (added or removed claim
 * texts) AND there's a previous visit timestamp — first-time visitors
 * see nothing.
 *
 * Props:
 *  - lastViewedAt:  ISO string of the previous visit (drives the meta line)
 *  - added:         normalized claim texts new since the last visit
 *  - removed:       normalized claim texts removed since the last visit
 *  - onMarkReviewed: () => void; snapshots current state and dismisses
 */

const PREVIEW_COUNT = 3;
const PREVIEW_LENGTH = 160;

const truncate = (value = '') => {
  const text = String(value || '').trim();
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1).trim()}…` : text;
};

const formatRelative = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return 'a moment ago';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.round(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

const WikiChangesSinceLastVisit = ({ lastViewedAt, added = [], removed = [], onMarkReviewed }) => {
  const [expanded, setExpanded] = useState(false);

  const counts = useMemo(() => ({
    added: Array.isArray(added) ? added.length : 0,
    removed: Array.isArray(removed) ? removed.length : 0
  }), [added, removed]);

  if (!lastViewedAt) return null;
  if (counts.added === 0 && counts.removed === 0) return null;

  const summary = [
    counts.added > 0 ? `${counts.added} new` : null,
    counts.removed > 0 ? `${counts.removed} removed` : null
  ].filter(Boolean).join(' · ');

  const previewAdded = added.slice(0, PREVIEW_COUNT);
  const previewRemoved = removed.slice(0, PREVIEW_COUNT);

  return (
    <section
      className={`wiki-changes-banner ${expanded ? 'wiki-changes-banner--expanded' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Changes since your last visit"
    >
      <div className="wiki-changes-banner__head">
        <div className="wiki-changes-banner__copy">
          <span className="wiki-changes-banner__eyebrow">Since you last visited</span>
          <span className="wiki-changes-banner__title">
            {summary} claim{counts.added + counts.removed === 1 ? '' : 's'}
          </span>
          <span className="wiki-changes-banner__sub">
            You were last here {formatRelative(lastViewedAt)}.
          </span>
        </div>
        <div className="wiki-changes-banner__actions">
          <button
            type="button"
            className="wiki-changes-banner__toggle"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            data-testid="wiki-changes-banner-toggle"
          >
            {expanded ? 'Hide' : 'View diff'}
          </button>
          <button
            type="button"
            className="wiki-changes-banner__primary"
            onClick={onMarkReviewed}
            data-testid="wiki-changes-banner-mark-reviewed"
          >
            Mark reviewed
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="wiki-changes-banner__body">
          {counts.added > 0 ? (
            <div className="wiki-changes-banner__group wiki-changes-banner__group--added">
              <h4 className="wiki-changes-banner__group-title">New claims</h4>
              <ul className="wiki-changes-banner__list">
                {previewAdded.map((text, index) => (
                  <li key={`added-${index}`} className="wiki-changes-banner__item">
                    <span className="wiki-changes-banner__sigil" aria-hidden="true">+</span>
                    <span className="wiki-changes-banner__item-text">{truncate(text)}</span>
                  </li>
                ))}
              </ul>
              {counts.added > PREVIEW_COUNT ? (
                <p className="wiki-changes-banner__more">
                  + {counts.added - PREVIEW_COUNT} more new claim
                  {counts.added - PREVIEW_COUNT === 1 ? '' : 's'}.
                </p>
              ) : null}
            </div>
          ) : null}

          {counts.removed > 0 ? (
            <div className="wiki-changes-banner__group wiki-changes-banner__group--removed">
              <h4 className="wiki-changes-banner__group-title">Removed claims</h4>
              <ul className="wiki-changes-banner__list">
                {previewRemoved.map((text, index) => (
                  <li key={`removed-${index}`} className="wiki-changes-banner__item">
                    <span className="wiki-changes-banner__sigil" aria-hidden="true">−</span>
                    <span className="wiki-changes-banner__item-text">{truncate(text)}</span>
                  </li>
                ))}
              </ul>
              {counts.removed > PREVIEW_COUNT ? (
                <p className="wiki-changes-banner__more">
                  + {counts.removed - PREVIEW_COUNT} more removed claim
                  {counts.removed - PREVIEW_COUNT === 1 ? '' : 's'}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default WikiChangesSinceLastVisit;
