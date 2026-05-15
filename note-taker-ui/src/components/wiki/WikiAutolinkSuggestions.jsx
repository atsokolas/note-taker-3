import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWikiAutolinkSuggestions } from '../../api/wiki';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';

/**
 * WikiAutolinkSuggestions — "Linkable pages here" rail. For the page
 * being edited, surface every other wiki page whose title appears in
 * the current draft text. Each suggestion links to the matching page
 * so the owner can quickly cross-reference what they're writing about.
 *
 * Mirror of WikiBacklinkPanel in shape (same loading/error/empty
 * pattern, same debounce on title changes), but goes the other
 * direction: backlinks = "who mentions me?", autolinks = "who do I
 * mention?".
 *
 * v1 ships as a discoverability surface only — no inline tab-to-link
 * conversion of the matched word in the editor (would need a custom
 * tiptap link mark + selection plumbing). The "convert plain mention
 * to a link" flow is a deliberate v2.
 */

const WikiAutolinkSuggestions = ({ pageId, pageTitle }) => {
  const [state, setState] = useState({ suggestions: [], scanned: 0, loading: true, error: false });

  useEffect(() => {
    if (!pageId) return undefined;
    let cancelled = false;
    // Debounce so the title-bound input in WikiPageEditor doesn't fire
    // one autolinks request per keystroke during a rename. 400ms matches
    // the backlink panel for consistency.
    const handle = setTimeout(() => {
      setState((current) => ({ ...current, loading: true, error: false }));
      getWikiAutolinkSuggestions(pageId)
        .then((data) => {
          if (cancelled) return;
          setState({
            suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
            scanned: Number.isFinite(data?.scanned) ? data.scanned : 0,
            loading: false,
            error: false
          });
        })
        .catch(() => {
          if (cancelled) return;
          setState({ suggestions: [], scanned: 0, loading: false, error: true });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [pageId, pageTitle]);

  if (state.error) return null;
  if (!state.loading && state.suggestions.length === 0) return null;

  return (
    <section
      className="wiki-autolinks"
      aria-label="Pages mentioned in this draft"
      data-testid="wiki-autolinks"
    >
      <header className="wiki-autolinks__head">
        <h3 className="wiki-autolinks__title">Linkable pages here</h3>
        {!state.loading ? (
          <span className="wiki-autolinks__count">
            {state.suggestions.length} match{state.suggestions.length === 1 ? '' : 'es'}
          </span>
        ) : null}
      </header>
      {state.loading ? (
        <div className="wiki-autolinks__skeleton" aria-hidden="true">
          <div className="wiki-autolinks__skeleton-line" />
          <div className="wiki-autolinks__skeleton-line wiki-autolinks__skeleton-line--short" />
        </div>
      ) : (
        <ul className="wiki-autolinks__list">
          {state.suggestions.map((entry) => (
            <li key={entry.pageId} className="wiki-autolinks__item">
              <Link to={wikiPagePath(entry.pageId)} className="wiki-autolinks__link">
                <span className="wiki-autolinks__link-title">
                  {entry.title || 'Untitled wiki page'}
                </span>
                <span className="wiki-autolinks__link-meta">
                  {entry.mentionCount} mention{entry.mentionCount === 1 ? '' : 's'} in this draft
                </span>
                {entry.snippet ? (
                  <span className="wiki-autolinks__link-snippet">{entry.snippet}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default WikiAutolinkSuggestions;
