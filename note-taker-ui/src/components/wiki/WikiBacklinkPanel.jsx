import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWikiBacklinks } from '../../api/wiki';

/**
 * WikiBacklinkPanel — "Mentioned in N other pages" rail. Mounts under
 * the editor side panel. Self-loads its own data when the page id or
 * title changes; renders nothing when there are no backlinks (the
 * rail is purely additive — no empty-state real estate consumed).
 *
 * Re-fetches on title change so renaming a page surfaces newly-correct
 * backlinks without requiring a route refresh.
 */

const formatRelative = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

const WikiBacklinkPanel = ({ pageId, pageTitle }) => {
  const [state, setState] = useState({ backlinks: [], scanned: 0, loading: true, error: false });

  useEffect(() => {
    if (!pageId) return undefined;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: false }));
    getWikiBacklinks(pageId)
      .then((data) => {
        if (cancelled) return;
        setState({
          backlinks: Array.isArray(data?.backlinks) ? data.backlinks : [],
          scanned: Number.isFinite(data?.scanned) ? data.scanned : 0,
          loading: false,
          error: false
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ backlinks: [], scanned: 0, loading: false, error: true });
      });
    return () => { cancelled = true; };
    // pageTitle is in deps so renaming the page refreshes backlinks; the
    // backend matcher uses the saved title, so a fresh request after a
    // rename surfaces the right matches.
  }, [pageId, pageTitle]);

  if (state.error) return null;
  if (!state.loading && state.backlinks.length === 0) return null;

  return (
    <section
      className="wiki-backlinks"
      aria-label="Pages that mention this one"
      data-testid="wiki-backlinks"
    >
      <header className="wiki-backlinks__head">
        <h3 className="wiki-backlinks__title">Mentioned in</h3>
        {!state.loading ? (
          <span className="wiki-backlinks__count">
            {state.backlinks.length} page{state.backlinks.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </header>
      {state.loading ? (
        <div className="wiki-backlinks__skeleton" aria-hidden="true">
          <div className="wiki-backlinks__skeleton-line" />
          <div className="wiki-backlinks__skeleton-line wiki-backlinks__skeleton-line--short" />
        </div>
      ) : (
        <ul className="wiki-backlinks__list">
          {state.backlinks.map((entry) => (
            <li key={entry.pageId} className="wiki-backlinks__item">
              <Link to={`/wiki/${entry.pageId}`} className="wiki-backlinks__link">
                <span className="wiki-backlinks__link-title">
                  {entry.title || 'Untitled wiki page'}
                </span>
                <span className="wiki-backlinks__link-meta">
                  {entry.mentionCount} mention{entry.mentionCount === 1 ? '' : 's'}
                  {entry.updatedAt ? ` · ${formatRelative(entry.updatedAt)}` : ''}
                </span>
                {entry.snippet ? (
                  <span className="wiki-backlinks__link-snippet">{entry.snippet}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default WikiBacklinkPanel;
