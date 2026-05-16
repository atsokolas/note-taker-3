import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import { downloadWikiExportZip, ingestWikiSource, listWikiActivity, listWikiPages } from '../../api/wiki';
import { fetchGraphData } from '../../api/map';
import { trackWikiIngestResult, trackWikiIngestSubmitted } from '../../utils/wikiAnalytics';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import WikiBriefing from './WikiBriefing';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import WikiList from './WikiList';
import {
  DRIFT_STATUSES,
  MODIFIED_WINDOWS,
  PAGE_TYPES,
  buildWikiGraphData,
  filterWikiGraphPages,
  formatDate,
  labelFor,
  summarizeWikiGraph
} from './wikiGraph';

const TYPE_COLORS = {
  concept: '#4f8c5a',
  entity: '#6f63bf',
  source: '#b1862e',
  question: '#3876b8',
  comparison: '#b54a32',
  overview: '#62714a',
  project: '#8b5a2b',
  log: '#62707a',
  topic: '#476a7d'
};

const EDGE_COLORS = {
  wikiLink: '#3876b8',
  shared_source: '#8b6fbd',
  related: '#7a8088',
  needs_review: '#b1862e',
  supports: '#4f8c5a',
  contradicts: '#b54a32',
  extends: '#3876b8'
};

const GRAPH_RELATION_TYPES = ['related', 'needs_review', 'supports', 'contradicts', 'extends'];
const GRAPH_PAGE_LIMIT = 500;

const getWindowWidth = () => (typeof window === 'undefined' ? 1024 : window.innerWidth || 1024);

const sourceTitle = (source = {}) => (
  source.title || source.url || source.text?.slice?.(0, 64) || 'source'
);

const statusLabel = (value = '') => labelFor(String(value || 'pending'));

const RELATION_LABELS = {
  wikiLink: 'Inline links',
  shared_source: 'Shared sources',
  related: 'Related',
  needs_review: 'Needs review',
  supports: 'Supports',
  contradicts: 'Contradicts',
  extends: 'Extends'
};

const relationLabel = (value = '') => RELATION_LABELS[value] || labelFor(value || 'related');

const linkEndpointTitle = (endpoint) => (
  typeof endpoint === 'object' && endpoint
    ? endpoint.title || endpoint.id || ''
    : String(endpoint || '')
);

const linkReason = (link = {}) => {
  if (link.relationType === 'wikiLink') return 'The article text links directly to another wiki page.';
  if (link.relationType === 'shared_source') {
    const titles = Array.isArray(link.sourceTitles) ? link.sourceTitles.filter(Boolean).slice(0, 2) : [];
    return titles.length
      ? `Both pages cite ${titles.join(titles.length === 2 ? ' and ' : '')}.`
      : 'Both pages use overlapping source material.';
  }
  if (link.relationType === 'needs_review') return 'The knowledge graph marks this relationship as requiring review.';
  if (link.relationType === 'supports') return 'The knowledge graph says one page supports the other.';
  if (link.relationType === 'contradicts') return 'The knowledge graph says these pages are in tension.';
  if (link.relationType === 'extends') return 'The knowledge graph says one page extends the other.';
  return 'The page health or graph metadata marks these pages as related.';
};

const formatActivityTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const WikiSourceDropComposer = ({ onIngested }) => {
  const [sourceType, setSourceType] = useState('url');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const source = sourceType === 'url'
        ? { type: 'url', url: trimmed }
        : { type: 'text', text: trimmed };
      trackWikiIngestSubmitted({ sourceType });
      const result = await ingestWikiSource(source);
      trackWikiIngestResult({ ingestRun: result?.ingestRun || result });
      onIngested?.(result);
      setValue('');
    } catch (_error) {
      setError('Failed to feed this source to the wiki.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="wiki-drop-source" onSubmit={handleSubmit} aria-label="Feed source to wiki">
      <div>
        <p className="wiki-index__eyebrow">Feed the wiki</p>
        <h2>Drop a source</h2>
      </div>
      <div className="wiki-drop-source__row">
        <select
          value={sourceType}
          onChange={(event) => setSourceType(event.target.value)}
          aria-label="Source input type"
        >
          <option value="url">URL</option>
          <option value="text">Text</option>
        </select>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={sourceType === 'url' ? 'Paste a URL' : 'Paste source text'}
          aria-label="Source to feed to wiki"
        />
        <Button type="submit" disabled={busy || !value.trim()}>{busy ? 'Reading...' : 'Feed'}</Button>
      </div>
      {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
    </form>
  );
};

const WikiActivityLog = ({ refreshKey = 0, onOpenPage }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listWikiActivity({ limit: 20 })
      .then((items) => {
        if (!cancelled) setEvents(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load wiki activity.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <section className="wiki-activity-log" aria-label="Wiki activity">
      <header className="wiki-activity-log__head">
        <div>
          <p className="wiki-index__eyebrow">Activity</p>
          <h2>Wiki log</h2>
        </div>
      </header>
      {loading ? <p className="wiki-index__status">Loading wiki activity...</p> : null}
      {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
      <ol className="wiki-activity-log__list">
        {events.map(event => (
          <li key={event.id || `${event.type}-${event.at}`} className={`wiki-activity-log__item is-${event.type || 'event'}`}>
            <div>
              <span>{labelFor(event.type || 'event')} · {statusLabel(event.status)}</span>
              <h3>{event.title || 'Wiki activity'}</h3>
              {event.summary ? <p>{event.summary}</p> : null}
              {event.type === 'ingest' && event.affectedPageIds?.length === 0 ? (
                <p className="wiki-activity-log__hint">No relevant pages were updated. Review details to create a new page from this source.</p>
              ) : null}
              <time dateTime={event.at}>{formatActivityTime(event.at)}</time>
            </div>
            <div className="wiki-activity-log__actions">
              {event.runId ? <Link to={`/wiki/activity/${event.runId}`}>Details</Link> : null}
              {event.pageId ? (
                onOpenPage ? (
                  <button type="button" onClick={() => onOpenPage(event.pageId)}>Open</button>
                ) : (
                  <Link to={wikiPagePath(event.pageId)}>Open</Link>
                )
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {!loading && events.length === 0 ? <p className="wiki-inbox__empty">No wiki activity yet.</p> : null}
    </section>
  );
};

const WikiGraph = ({ graph, onOpenPage }) => {
  const navigate = useNavigate();
  const graphRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const relationCounts = useMemo(() => (
    (graph.links || []).reduce((counts, link) => {
      const key = link.relationType || 'related';
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})
  ), [graph.links]);
  const relationTypes = useMemo(() => Object.keys(relationCounts), [relationCounts]);
  const relationTypeKey = relationTypes.join('|');
  const [activeRelations, setActiveRelations] = useState(null);

  useEffect(() => {
    setActiveRelations(current => {
      if (!current) return new Set(relationTypes);
      const available = new Set(relationTypes);
      const next = new Set(Array.from(current).filter(relationType => available.has(relationType)));
      relationTypes.forEach(relationType => {
        if (!current.size) return;
        if (!current.has(relationType)) next.add(relationType);
      });
      return next;
    });
  }, [relationTypes, relationTypeKey]);

  const activeRelationSet = useMemo(() => (
    activeRelations || new Set(relationTypes)
  ), [activeRelations, relationTypes]);

  const visibleGraph = useMemo(() => {
    if (!activeRelationSet.size) return { ...graph, links: [] };
    return {
      ...graph,
      links: (graph.links || []).filter(link => activeRelationSet.has(link.relationType || 'related'))
    };
  }, [activeRelationSet, graph]);

  const toggleRelation = (relationType) => {
    setActiveRelations(current => {
      const next = new Set(current || relationTypes);
      if (next.has(relationType)) next.delete(relationType);
      else next.add(relationType);
      return next;
    });
  };

  const renderNode = (node, ctx, globalScale) => {
    const radius = Math.min(14, 5 + Math.sqrt(Number(node.inboundCount || 0)) * 2.4);
    ctx.fillStyle = TYPE_COLORS[node.pageType] || TYPE_COLORS.topic;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fill();

    if (globalScale < 1.05) return;
    const label = node.title || 'Untitled Wiki Page';
    const fontSize = 11 / globalScale;
    ctx.font = `600 ${fontSize}px "SF Pro Text", "Segoe UI", Inter, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const isDark = typeof document !== 'undefined' && document.documentElement?.dataset?.uiTheme === 'dark';
    ctx.fillStyle = isDark ? '#e5ecf9' : '#0f172a';
    ctx.fillText(label, node.x + radius + 5, node.y);
  };

  useEffect(() => {
    const handle = window.setTimeout(() => {
      graphRef.current?.zoomToFit?.(650, 80);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [graph]);

  return (
    <div className="wiki-graph" aria-label="Wiki graph">
      <div className="wiki-graph__actions" aria-label="Graph controls">
        <Button type="button" variant="secondary" onClick={() => graphRef.current?.zoomToFit?.(650, 80)}>
          Fit
        </Button>
      </div>
      <div className="wiki-graph__relations" aria-label="Graph relation filters">
        {relationTypes.map(relationType => (
          <button
            type="button"
            key={relationType}
            className={activeRelationSet.has(relationType) ? 'is-active' : ''}
            onClick={() => toggleRelation(relationType)}
          >
            <i style={{ background: EDGE_COLORS[relationType] || '#94a3b8' }} />
            {relationLabel(relationType)}
            <span>{relationCounts[relationType]}</span>
          </button>
        ))}
      </div>
      <div className="wiki-graph__canvas">
        <ForceGraph2D
          ref={graphRef}
          graphData={visibleGraph}
          nodeLabel={(node) => `${node.title}\n${labelFor(node.pageType)} · ${formatDate(node.updatedAt) || 'No date'}`}
          linkLabel={(link) => `${relationLabel(link.relationType)}\n${linkReason(link)}`}
          nodeCanvasObject={renderNode}
          linkColor={(link) => EDGE_COLORS[link.relationType] || '#94a3b8'}
          linkWidth={(link) => (link.relationType === 'wikiLink' ? 1.8 : link.relationType === 'shared_source' ? 1.35 : 1.2)}
          linkDirectionalParticles={(link) => (link.relationType === 'wikiLink' ? 2 : link.relationType === 'shared_source' ? 1 : 0)}
          linkDirectionalParticleSpeed={(link) => (link.relationType === 'wikiLink' ? 0.006 : 0.003)}
          linkDirectionalParticleWidth={(link) => (link.relationType === 'wikiLink' ? 2.5 : 1.6)}
          onNodeHover={setHovered}
          onLinkHover={setHoveredLink}
          onNodeClick={(node) => {
            if (onOpenPage) onOpenPage(node.id);
            else navigate(wikiPagePath(node.id));
          }}
        />
      </div>
      {hovered ? (
        <aside className="wiki-graph__tooltip" role="tooltip">
          <strong>{hovered.title}</strong>
          <span>{labelFor(hovered.pageType)} · {hovered.inboundCount} inbound · {hovered.sourceCount} sources</span>
          <span>{formatDate(hovered.updatedAt)}</span>
        </aside>
      ) : null}
      {hoveredLink ? (
        <aside className="wiki-graph__tooltip wiki-graph__tooltip--link" role="tooltip">
          <strong>{relationLabel(hoveredLink.relationType)}</strong>
          <span>{linkEndpointTitle(hoveredLink.source)} -> {linkEndpointTitle(hoveredLink.target)}</span>
          <span>{linkReason(hoveredLink)}</span>
        </aside>
      ) : null}
      <div className="wiki-graph__legend" aria-label="Page type legend">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <span key={type}><i style={{ background: color }} />{labelFor(type)}</span>
        ))}
      </div>
    </div>
  );
};

const WikiIndex = ({ onOpenPage, onOpenList }) => {
  const navigate = useNavigate();
  const [pages, setPages] = useState([]);
  const [mapGraph, setMapGraph] = useState({ nodes: [], edges: [] });
  const [pageType, setPageType] = useState('all');
  const [modifiedWithin, setModifiedWithin] = useState('all');
  const [driftStatus, setDriftStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [activityRefresh, setActivityRefresh] = useState(0);
  const [width, setWidth] = useState(getWindowWidth);
  const mountedRef = useRef(true);

  const loadGraph = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    const pagesPromise = listWikiPages({ limit: GRAPH_PAGE_LIMIT });
    const mapGraphPromise = fetchGraphData({
      limit: 600,
      itemTypes: ['wiki_page'],
      relationTypes: GRAPH_RELATION_TYPES
    });
    try {
      const [pagesResult, mapGraphResult] = await Promise.allSettled([pagesPromise, mapGraphPromise]);
      if (!mountedRef.current) return;
      if (pagesResult.status === 'fulfilled') {
        setPages(Array.isArray(pagesResult.value) ? pagesResult.value : []);
      } else if (!quiet) {
        setError('Failed to load Wiki graph.');
      }
      setMapGraph(mapGraphResult.status === 'fulfilled' ? (mapGraphResult.value || { nodes: [], edges: [] }) : { nodes: [], edges: [] });
    } finally {
      if (mountedRef.current && !quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadGraph();
    return () => { mountedRef.current = false; };
  }, [loadGraph]);

  useEffect(() => {
    const handleResize = () => setWidth(getWindowWidth());
    window.addEventListener?.('resize', handleResize);
    return () => window.removeEventListener?.('resize', handleResize);
  }, []);

  const filteredPages = useMemo(() => (
    filterWikiGraphPages(pages, { pageType, modifiedWithin, driftStatus })
  ), [driftStatus, modifiedWithin, pageType, pages]);

  const graph = useMemo(() => buildWikiGraphData(filteredPages, mapGraph), [filteredPages, mapGraph]);
  const graphSummary = useMemo(() => summarizeWikiGraph(graph), [graph]);
  const isMobile = width < 720;

  const handleIngested = (result = {}) => {
    const ingestRun = result.ingestRun || result || {};
    const source = ingestRun.sourceRef || {};
    setToast({
      title: `Reading ${sourceTitle(source)}...`,
      summary: ingestRun.affectedPageIds?.length
        ? `${ingestRun.affectedPageIds.length} page${ingestRun.affectedPageIds.length === 1 ? '' : 's'} updated so far.`
        : ingestRun.suggestedCreatePage
          ? `No matching pages yet. Create "${ingestRun.suggestedCreatePage.title}" from this source?`
          : 'No matching pages yet. Review details to create or merge.',
      runId: ingestRun.runId
    });
    setActivityRefresh(value => value + 1);
    loadGraph({ quiet: true });
    if (Array.isArray(result.pages) && result.pages.length) {
      setPages(current => {
        const byId = new Map(current.map(page => [page._id, page]));
        result.pages.forEach(page => byId.set(page._id, page));
        return Array.from(byId.values());
      });
    }
  };

  const handleOpenPage = useCallback((pageId) => {
    if (!pageId) return;
    if (onOpenPage) onOpenPage(pageId);
    else navigate(wikiPagePath(pageId));
  }, [navigate, onOpenPage]);

  const handleExportWiki = async () => {
    try {
      const blob = await downloadWikiExportZip();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'wiki-export.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (_error) {
      setError('Failed to export wiki.');
    }
  };

  return (
    <main className="wiki-page wiki-index wiki-graph-index">
      <WikiBriefing />
      <WikiBuildPageComposer onBuilt={() => loadGraph({ quiet: true })} />
      <WikiSourceDropComposer onIngested={handleIngested} />
      {toast ? (
        <aside className="wiki-ingest-toast" role="status">
          <div>
            <strong>{toast.title}</strong>
            <span>{toast.summary}</span>
          </div>
          {toast.runId ? <Link to={`/wiki/activity/${toast.runId}`}>View details</Link> : null}
        </aside>
      ) : null}
      <section className="wiki-index__header">
        <div className="wiki-index__title-block">
          <p className="wiki-index__eyebrow">Wiki graph</p>
          <h1>Knowledge map</h1>
          <p>Pages are nodes, inline wiki links are edges, and larger nodes have more inbound links.</p>
        </div>
        <div className="wiki-index__tabs" role="tablist" aria-label="Wiki views">
          {onOpenList ? (
            <>
              <button type="button" aria-current="page">Graph</button>
              <button type="button" onClick={onOpenList}>List</button>
              <button type="button" onClick={handleExportWiki}>Export</button>
            </>
          ) : (
            <>
              <Link aria-current="page" to="/wiki">Graph</Link>
              <Link to="/wiki/list">List</Link>
              <button type="button" onClick={handleExportWiki}>Export</button>
            </>
          )}
        </div>
      </section>
      <section className="wiki-index__filters" aria-label="Wiki graph filters">
        <select value={pageType} onChange={(event) => setPageType(event.target.value)} aria-label="Page type">
          {PAGE_TYPES.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
        </select>
        <select value={modifiedWithin} onChange={(event) => setModifiedWithin(event.target.value)} aria-label="Modified within">
          {MODIFIED_WINDOWS.map(value => <option key={value} value={value}>{value === 'all' ? 'All time' : `Modified ${value}`}</option>)}
        </select>
        <select value={driftStatus} onChange={(event) => setDriftStatus(event.target.value)} aria-label="Drift status">
          {DRIFT_STATUSES.map(value => <option key={value} value={value}>{value === 'all' ? 'All drift states' : labelFor(value)}</option>)}
        </select>
        <span className="wiki-graph-index__stats">
          {graph.nodes.length} {graph.nodes.length === 1 ? 'page' : 'pages'} · {graph.links.length} {graph.links.length === 1 ? 'link' : 'links'}
        </span>
      </section>
      {!loading && graph.nodes.length ? (
        <section className="wiki-graph-signals" aria-label="Wiki map signals">
          <div>
            <span>Hubs</span>
            <strong>{graphSummary.hubs.map(node => node.title).join(', ') || 'None yet'}</strong>
          </div>
          <div>
            <span>Isolated</span>
            <strong>{graphSummary.orphanCount}</strong>
          </div>
          <div>
            <span>Evidence overlap</span>
            <strong>{graphSummary.relationCounts.shared_source || 0}</strong>
          </div>
        </section>
      ) : null}
      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      {loading ? <p className="wiki-index__status">Loading Wiki graph...</p> : null}
      {!loading && graph.nodes.length && !isMobile ? <WikiGraph graph={graph} onOpenPage={handleOpenPage} /> : null}
      {!loading && !graph.nodes.length ? (
        <section className="wiki-index__empty">
          <h2>No graph nodes yet</h2>
          <p>Create or maintain wiki pages to build the map.</p>
        </section>
      ) : null}
      {isMobile ? (
        <section className="wiki-graph-index__mobile-list" aria-label="Wiki pages mobile list">
          <WikiList compact onOpenPage={handleOpenPage} />
        </section>
      ) : null}
      <WikiActivityLog refreshKey={activityRefresh} onOpenPage={handleOpenPage} />
    </main>
  );
};

export default WikiIndex;
