import React, { useState } from 'react';
import { wordBoundaryTrim } from '../../utils/editorialText';

/**
 * WikiChangesSinceLastVisit — a private reading marker for what changed
 * since the owner last looked. Seeing the changes does not accept a
 * candidate or stamp a reviewed/verified date.
 */

const PREVIEW_COUNT = 3;
const PREVIEW_LENGTH = 160;

const truncate = (value = '') => wordBoundaryTrim(value, { maxLength: PREVIEW_LENGTH });

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

/* What changed, by kind, in words: how much is the page's to show, not a
   number for you to work down (see /manifesto). */
const GROUPS = [
  { key: 'added', title: 'Added', sigil: '+', said: 'added' },
  { key: 'removed', title: 'Removed', sigil: '−', said: 'taken out' },
  { key: 'changed', title: 'New sources', sigil: '↻', said: 'given new sources' }
];

const SUPPORT_LABEL = {
  supported: 'supported',
  partial: 'partially supported',
  unsupported: 'unsupported',
  conflicted: 'conflicted'
};

const WikiChangesSinceLastVisit = ({
  lastViewedAt,
  added = [],
  removed = [],
  changed = [],
  onMarkReviewed,
  onShowInPage
}) => {
  const [expanded, setExpanded] = useState(false);
  const lists = { added, removed, changed };
  const groups = GROUPS.filter(group => Array.isArray(lists[group.key]) && lists[group.key].length);
  if (!lastViewedAt || !groups.length) return null;

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
          <span className="wiki-changes-banner__title">Claims {new Intl.ListFormat('en').format(groups.map(group => group.said))}</span>
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
            {expanded ? 'Hide' : 'Show me'}
          </button>
          {typeof onShowInPage === 'function' ? (
            <button
              type="button"
              className="wiki-changes-banner__toggle"
              onClick={onShowInPage}
              data-testid="wiki-changes-banner-show-in-page"
            >
              Show only what changed
            </button>
          ) : null}
          <button
            type="button"
            className="wiki-changes-banner__primary"
            onClick={onMarkReviewed}
            data-testid="wiki-changes-banner-mark-reviewed"
          >
            I’ve seen these changes
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="wiki-changes-banner__body">
          {groups.map(group => (
            <div key={group.key} className={`wiki-changes-banner__group wiki-changes-banner__group--${group.key}`}>
              <h4 className="wiki-changes-banner__group-title">{group.title}</h4>
              <ul className="wiki-changes-banner__list">
                {lists[group.key].slice(0, PREVIEW_COUNT).map((entry, index) => (
                  <li key={`${group.key}-${index}`} className="wiki-changes-banner__item">
                    <span className="wiki-changes-banner__sigil" aria-hidden="true">{group.sigil}</span>
                    <span className="wiki-changes-banner__item-text">
                      {truncate(typeof entry === 'string' ? entry : entry.text)}
                      {typeof entry === 'string' ? null : (
                        <span className="wiki-changes-banner__item-meta">
                          {SUPPORT_LABEL[entry.support] || entry.support}
                          {Number.isFinite(Number(entry.confidence)) ? ` · ${Math.round(Number(entry.confidence) * 100)}%` : ''}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {lists[group.key].length > PREVIEW_COUNT ? <p className="wiki-changes-banner__more">And more on the page.</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default WikiChangesSinceLastVisit;
