import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listWikiPages } from '../../api/wiki';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import AgentTicker from '../agent/AgentTicker';
import { formatDate, labelFor } from './wikiGraph';
import {
  countWikiClaims,
  countWikiSources,
  wikiPreviewForPage,
  wikiSourceStatusForPage
} from './wikiPageMetrics';
import '../../styles/wiki-critical.css';

const INDEX_PAGE_LIMIT = 80;
const FEATURED_LIMIT = 6;

// AT-293: key-page cards used to dump the entire article body whenever a page
// had no curated summary/scope (it fell straight through to page.plainText,
// which is the full flattened body incl. section-heading runs + [1] citation
// markers). Clamp to a tight, deliberate excerpt and strip the detritus so the
// wiki home stays a calm entry point.
const PREVIEW_CHAR_BUDGET = 160;

const summaryFor = (page = {}) => {
  return wikiPreviewForPage(page, PREVIEW_CHAR_BUDGET);
};

const pageWeight = (page = {}) => (
  countWikiSources(page) * 3
  + countWikiClaims(page) * 2
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
  const totalSources = useMemo(() => pages.reduce((sum, page) => sum + countWikiSources(page), 0), [pages]);
  const hasSourceBackedPages = totalSources > 0;
  const agentTraceLines = useMemo(() => {
    if (loading) {
      return [
        'scanning wiki corpus',
        'loading page graph'
      ];
    }
    if (!pages.length) {
      return [
        'wiki corpus empty',
        'ready to build first page'
      ];
    }
    const draftCount = pages.filter(page => countWikiSources(page) === 0).length;
    const updated = recentlyUpdated[0]?.title || 'no recent page';
    return [
      `scanned ${pages.length} page${pages.length === 1 ? '' : 's'} · ${totalSources} sources`,
      draftCount ? `${draftCount} draft page${draftCount === 1 ? '' : 's'} need sources` : 'all shown pages have source memory',
      `latest update · ${updated}`
    ];
  }, [loading, pages, recentlyUpdated, totalSources]);
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
          <h1>{hasSourceBackedPages ? 'Your source-backed knowledge base' : 'Your wiki workspace'}</h1>
          <p>
            {hasSourceBackedPages
              ? `Browse the strongest synthesized pages, ask ${AGENT_DISPLAY_NAME.toLowerCase()} to build a new one, or open the workspace when you need graph, ingest, and maintenance controls.`
              : 'Draft pages live here until the agent attaches enough source material to turn them into durable synthesis.'}
          </p>
          <AgentTicker
            label="Wiki corpus trace"
            className="wiki-product-index__ticker"
            state={loading ? 'working' : 'idle'}
            lines={agentTraceLines}
            sharedMemory
            surface="Wiki"
          />
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
          <p>Ask {AGENT_DISPLAY_NAME.toLowerCase()} to build the first page from your library or a source URL.</p>
        </section>
      ) : null}

      {!loading && featuredPages.length ? (
        <section className="wiki-product-index__section" aria-labelledby="wiki-featured-pages">
          <div className="wiki-product-index__section-head">
            <p className="wiki-index__eyebrow">Start here</p>
            <h2 id="wiki-featured-pages">{hasSourceBackedPages ? 'Key pages' : 'Draft pages'}</h2>
          </div>
          <div className="wiki-product-index__grid">
            {featuredPages.map((page) => (
              <Link key={page._id || page.id} className="wiki-product-index__card" to={wikiPagePath(page._id || page.id)}>
                <span>{labelFor(page.pageType || 'topic')}</span>
                <h3>{page.title || 'Untitled page'}</h3>
                <p>{summaryFor(page) || (countWikiSources(page) > 0 ? 'Open this page to review its current synthesis.' : 'Needs source material before it can become durable synthesis.')}</p>
                <small>{wikiSourceStatusForPage(page)}</small>
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
