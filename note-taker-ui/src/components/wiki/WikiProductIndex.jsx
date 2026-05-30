import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listWikiPages } from '../../api/wiki';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import { formatDate, labelFor } from './wikiGraph';
import '../../styles/wiki-critical.css';

const INDEX_PAGE_LIMIT = 80;
const FEATURED_LIMIT = 6;

const claimCount = (page = {}) => (
  Array.isArray(page.claims) ? page.claims.length : Number(page.claimCount || 0)
);

const sourceCount = (page = {}) => (
  Array.isArray(page.sourceRefs) ? page.sourceRefs.length : Number(page.sourceCount || 0)
);

// AT-293: key-page cards used to dump the entire article body whenever a page
// had no curated summary/scope (it fell straight through to page.plainText,
// which is the full flattened body incl. section-heading runs + [1] citation
// markers). Clamp to a tight, deliberate excerpt and strip the detritus so the
// wiki home stays a calm entry point.
const PREVIEW_CHAR_BUDGET = 160;

const cleanPreviewText = (value = '', title = '') => {
  let text = String(value || '')
    // drop inline citation markers like [1], [2,3], [4-6]
    .replace(/\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // plainText often begins by repeating the page title (heading flattened into
  // the body run). Strip a leading title echo so the excerpt starts on prose.
  const trimmedTitle = String(title || '').replace(/\s+/g, ' ').trim();
  if (trimmedTitle && text.toLowerCase().startsWith(trimmedTitle.toLowerCase())) {
    text = text.slice(trimmedTitle.length).replace(/^[\s:–-]+/, '').trim();
  }
  return text;
};

const clampPreview = (value = '', budget = PREVIEW_CHAR_BUDGET) => {
  if (value.length <= budget) return value;
  const slice = value.slice(0, budget);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
  if (lastStop > budget * 0.5) return slice.slice(0, lastStop + 1).trim();
  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : budget).trim()}…`;
};

const summaryFor = (page = {}) => {
  const source = page.summary || page.scope || page.plainText || '';
  return clampPreview(cleanPreviewText(source, page.title));
};

const pageWeight = (page = {}) => (
  sourceCount(page) * 3
  + claimCount(page) * 2
  + (page.updatedAt ? 1 : 0)
  + (page.lastReviewedAt ? 1 : 0)
);

const topPageTypes = (pages = []) => {
  const counts = new Map();
  pages.forEach((page) => {
    const type = page.pageType || 'topic';
    counts.set(type, (counts.get(type) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || labelFor(a[0]).localeCompare(labelFor(b[0])))
    .slice(0, 4);
};

const WikiProductIndex = () => {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listWikiPages({ limit: INDEX_PAGE_LIMIT })
      .then((items) => {
        if (!cancelled) setPages(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load wiki pages.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const featuredPages = useMemo(() => (
    [...pages]
      .sort((a, b) => pageWeight(b) - pageWeight(a) || String(a.title || '').localeCompare(String(b.title || '')))
      .slice(0, FEATURED_LIMIT)
  ), [pages]);

  const recentlyUpdated = useMemo(() => (
    [...pages]
      .filter(page => page.updatedAt)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
  ), [pages]);

  const types = useMemo(() => topPageTypes(pages), [pages]);
  const totalSources = useMemo(() => pages.reduce((sum, page) => sum + sourceCount(page), 0), [pages]);
  // AT-294: render a shimmer chip while loading instead of the word "Loading..."
  // so a slow backend cold-start reads as "working" rather than "broken".
  const statValue = (value) => (
    loading
      ? <span className="wiki-skeleton wiki-skeleton--stat" aria-hidden="true" />
      : value
  );

  return (
    <main className="wiki-page wiki-product-index">
      <section className="wiki-product-index__hero">
        <div className="wiki-product-index__intro">
          <p className="wiki-index__eyebrow">Wiki</p>
          <h1>Your source-backed knowledge base</h1>
          <p>
            Browse the strongest synthesized pages, ask the agent to build a new one,
            or open the workspace when you need graph, ingest, and maintenance controls.
          </p>
        </div>
        <WikiBuildPageComposer compact className="wiki-product-index__builder" />
      </section>

      <section className="wiki-product-index__stats" aria-label="Wiki overview">
        <div>
          <span>Pages</span>
          <strong>{statValue(pages.length)}</strong>
        </div>
        <div>
          <span>Sources cited</span>
          <strong>{statValue(totalSources)}</strong>
        </div>
        <div>
          <span>Top types</span>
          <strong>{statValue(types.map(([type]) => labelFor(type)).join(', ') || 'None yet')}</strong>
        </div>
      </section>

      <section className="wiki-product-index__nav" aria-label="Wiki destinations">
        <Link to="/wiki/workspace">Open workspace</Link>
        <Link to="/wiki/workspace?view=list">All pages</Link>
        <Link to="/wiki/workspace?view=graph">Knowledge map</Link>
      </section>

      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      {loading ? (
        // AT-294: skeleton card grid stands in for Key pages during cold-start.
        <section className="wiki-product-index__section" aria-hidden="true">
          <div className="wiki-product-index__section-head">
            <p className="wiki-index__eyebrow">Start here</p>
            <h2>Key pages</h2>
          </div>
          <div className="wiki-product-index__grid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="wiki-product-index__card wiki-product-index__card--skeleton">
                <span className="wiki-skeleton wiki-skeleton--eyebrow" />
                <span className="wiki-skeleton wiki-skeleton--title" />
                <span className="wiki-skeleton wiki-skeleton--line" />
                <span className="wiki-skeleton wiki-skeleton--line wiki-skeleton--line-short" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !pages.length ? (
        <section className="wiki-index__empty">
          <h2>No wiki pages yet</h2>
          <p>Ask the agent to build the first page from your library or a source URL.</p>
        </section>
      ) : null}

      {!loading && featuredPages.length ? (
        <section className="wiki-product-index__section" aria-labelledby="wiki-featured-pages">
          <div className="wiki-product-index__section-head">
            <p className="wiki-index__eyebrow">Start here</p>
            <h2 id="wiki-featured-pages">Key pages</h2>
          </div>
          <div className="wiki-product-index__grid">
            {featuredPages.map((page) => (
              <Link key={page._id || page.id} className="wiki-product-index__card" to={wikiPagePath(page._id || page.id)}>
                <span>{labelFor(page.pageType || 'topic')}</span>
                <h3>{page.title || 'Untitled page'}</h3>
                <p>{summaryFor(page) || 'Open this page to review its current synthesis.'}</p>
                <small>
                  {sourceCount(page)} sources · {claimCount(page)} claims
                </small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && recentlyUpdated.length ? (
        <section className="wiki-product-index__section" aria-labelledby="wiki-recent-pages">
          <div className="wiki-product-index__section-head">
            <p className="wiki-index__eyebrow">Recent</p>
            <h2 id="wiki-recent-pages">Recently updated</h2>
          </div>
          <ol className="wiki-product-index__recent">
            {recentlyUpdated.map((page) => (
              <li key={page._id || page.id}>
                <Link to={wikiPagePath(page._id || page.id)}>{page.title || 'Untitled page'}</Link>
                <span>{formatDate(page.updatedAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
};

export default WikiProductIndex;
