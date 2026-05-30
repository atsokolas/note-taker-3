import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import { downloadWikiExportZip, listWikiActivity, listWikiPages, rebuildWikiGraph } from '../../api/wiki';
import { fetchGraphData } from '../../api/map';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
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
  concept: '#b1862e',
  entity: '#6f6a61',
  source: '#b1862e',
  question: '#74706a',
  comparison: '#8b8176',
  overview: '#625d55',
  project: '#7a6040',
  log: '#62707a',
  topic: '#5f6468'
};

const EDGE_COLORS = {
  wikiLink: '#b1862e',
  shared_source: '#8f8373',
  related: '#7a8088',
  needs_review: '#b1862e',
  supports: '#7a756d',
  contradicts: '#9b5a46',
  extends: '#8b7652'
};

const GRAPH_RELATION_TYPES = ['related', 'needs_review', 'supports', 'contradicts', 'extends'];
const GRAPH_PAGE_LIMIT = 500;
const EMPTY_WIKI_PAGE_THRESHOLD = 3;
const SPARSE_WIKI_HINT_THRESHOLD = 10;
const REVIEW_STATUS_LABELS = {
  all: 'All review states',
  drifting: 'Needs review',
  stable: 'Up to date'
};

const getWindowWidth = () => (typeof window === 'undefined' ? 1024 : window.innerWidth || 1024);

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

const endpointId = (endpoint) => (
  typeof endpoint === 'object' && endpoint ? endpoint.id : String(endpoint || '')
);

const describeNodeRole = ({ node, links = [] }) => {
  const inbound = links.filter(link => endpointId(link.target) === node.id);
  const outbound = links.filter(link => endpointId(link.source) === node.id);
  if (!inbound.length && !outbound.length) return 'Standalone page. It has no shown relationships under the current filters.';
  const directLinks = outbound.filter(link => link.relationType === 'wikiLink').length;
  const evidenceOverlap = [...inbound, ...outbound].filter(link => link.relationType === 'shared_source').length;
  if (directLinks) return `Navigation hub. This article links directly to ${directLinks} other wiki page${directLinks === 1 ? '' : 's'}.`;
  if (evidenceOverlap) return `Evidence overlap. This page shares source material with ${evidenceOverlap} shown page${evidenceOverlap === 1 ? '' : 's'}.`;
  if (inbound.length > outbound.length) return 'Referenced page. More pages point here than it points outward.';
  return 'Connector page. Its shown relationships come from related-page or review signals.';
};

const formatActivityTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

const WikiSparsePages = ({ pages = [], onOpenPage, onOpenWorkspace, onBuildPage }) => (
  <section className="wiki-index__sparse" aria-label="Wiki pages">
    <div>
      <p className="wiki-index__eyebrow">Pages</p>
      <h2>{pages.length ? `${pages.length} source-backed page${pages.length === 1 ? '' : 's'}` : 'Start the wiki'}</h2>
      <p>
        {pages.length
          ? 'The map will stay out of the way until there is enough material to connect. Open a page, or ask the agent to build the next source-backed page.'
          : 'Ask the agent to build a source-backed page from your library. The map appears after the wiki has enough pages to form a useful constellation.'}
      </p>
    </div>
    <div className="wiki-index__sparse-agent" aria-label="Build wiki pages">
      <strong>Grow the map deliberately</strong>
      <span>Add pages with citations, then connect them through links, shared sources, and review relationships.</span>
      <Button type="button" variant="secondary" onClick={onBuildPage || onOpenWorkspace}>Build page</Button>
    </div>
    {pages.length ? (
      <ol className="wiki-index__sparse-list">
        {pages.slice(0, 9).map(page => (
          <li key={page._id || page.id}>
            <button type="button" onClick={() => onOpenPage?.(page._id || page.id)}>
              <strong>{page.title || 'Untitled Wiki Page'}</strong>
              <span>{labelFor(page.pageType || 'topic')} · {Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0} sources</span>
            </button>
          </li>
        ))}
      </ol>
    ) : null}
  </section>
);

const WikiGraph = ({ graph, onOpenPage }) => {
  const graphRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
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

  const selectedNodeLinks = useMemo(() => {
    if (!selectedNode) return [];
    return (visibleGraph.links || []).filter(link => endpointId(link.source) === selectedNode.id || endpointId(link.target) === selectedNode.id);
  }, [selectedNode, visibleGraph.links]);

  const toggleRelation = (relationType) => {
    setActiveRelations(current => {
      const next = new Set(current || relationTypes);
      if (next.has(relationType)) next.delete(relationType);
      else next.add(relationType);
      return next;
    });
  };

  const renderNode = (node, ctx, globalScale) => {
    const radius = Math.min(9, 3.5 + Math.sqrt(Number(node.inboundCount || 0)) * 1.6);
    ctx.fillStyle = TYPE_COLORS[node.pageType] || TYPE_COLORS.topic;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.lineWidth = 1.2 / Math.max(globalScale, 1);
    ctx.stroke();

    if (globalScale < 1.35) return;
    const label = node.title || 'Untitled Wiki Page';
    const fontSize = 10 / globalScale;
    ctx.font = `500 ${fontSize}px "SF Pro Text", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif`;
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
    <div className="wiki-graph" aria-label="Knowledge map">
      <div className="wiki-graph__actions" aria-label="Map controls">
        <Button type="button" variant="secondary" onClick={() => graphRef.current?.zoomToFit?.(650, 80)}>
          Center map
        </Button>
      </div>
      <div className="wiki-graph__relations" aria-label="Map relationship filters">
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
          linkWidth={(link) => (link.relationType === 'wikiLink' ? 1.15 : link.relationType === 'shared_source' ? 0.95 : 0.8)}
          linkDirectionalParticles={0}
          onNodeHover={setHovered}
          onLinkHover={setHoveredLink}
          onNodeClick={(node) => setSelectedNode(node)}
        />
      </div>
      {selectedNode ? (
        <aside className="wiki-graph__inspector" aria-label="Selected map page">
          <div>
            <p>{labelFor(selectedNode.pageType)}</p>
            <h2>{selectedNode.title}</h2>
            <span>{selectedNode.sourceCount} source{selectedNode.sourceCount === 1 ? '' : 's'} · referenced by {selectedNode.inboundCount} · {selectedNodeLinks.length} shown relationship{selectedNodeLinks.length === 1 ? '' : 's'}</span>
          </div>
          <p>{describeNodeRole({ node: selectedNode, links: visibleGraph.links })}</p>
          {selectedNodeLinks.length ? (
            <ul>
              {selectedNodeLinks.slice(0, 5).map(link => (
                <li key={link.id}>
                  <strong>{relationLabel(link.relationType)}</strong>
                  <span>{linkEndpointTitle(link.source)} to {linkEndpointTitle(link.target)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="wiki-graph__inspector-actions">
            <Button type="button" onClick={() => onOpenPage?.(selectedNode.id)}>Open page</Button>
            <button type="button" onClick={() => setSelectedNode(null)}>Close</button>
          </div>
        </aside>
      ) : null}
      {hovered ? (
        <aside className="wiki-graph__tooltip" role="tooltip">
          <strong>{hovered.title}</strong>
          <span>{labelFor(hovered.pageType)} · referenced by {hovered.inboundCount} · {hovered.sourceCount} sources</span>
          <span>{formatDate(hovered.updatedAt)}</span>
        </aside>
      ) : null}
      {hoveredLink ? (
        <aside className="wiki-graph__tooltip wiki-graph__tooltip--link" role="tooltip">
          <strong>{relationLabel(hoveredLink.relationType)}</strong>
          <span>{linkEndpointTitle(hoveredLink.source)} to {linkEndpointTitle(hoveredLink.target)}</span>
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

const WikiIndex = ({ onOpenPage, onOpenList, onBuildPage, onOpenSources }) => {
  const navigate = useNavigate();
  const [pages, setPages] = useState([]);
  const [mapGraph, setMapGraph] = useState({ nodes: [], edges: [] });
  const [pageType, setPageType] = useState('all');
  const [modifiedWithin, setModifiedWithin] = useState('all');
  const [driftStatus, setDriftStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [syncingGraph, setSyncingGraph] = useState(false);
  const [activityRefresh] = useState(0);
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
        setError('Failed to load knowledge map.');
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
  const persistedEdgeCount = Array.isArray(mapGraph.edges) ? mapGraph.edges.length : Array.isArray(mapGraph.links) ? mapGraph.links.length : 0;
  const graphSyncState = useMemo(() => {
    if (!pages.length) return { status: 'empty', label: 'No pages yet', stale: false };
    if (!persistedEdgeCount && graph.links.length) return { status: 'stale', label: 'Connections need review', stale: true };
    if (!persistedEdgeCount) return { status: 'limited', label: 'No reviewed connections yet', stale: true };
    return { status: 'synced', label: 'Connections reviewed', stale: false };
  }, [graph.links.length, pages.length, persistedEdgeCount]);
  const isMobile = width < 720;
  const isEmptyWiki = graph.nodes.length < EMPTY_WIKI_PAGE_THRESHOLD;
  const isSparseWiki = graph.nodes.length >= EMPTY_WIKI_PAGE_THRESHOLD && graph.nodes.length < SPARSE_WIKI_HINT_THRESHOLD;

  const handleOpenPage = useCallback((pageId) => {
    if (!pageId) return;
    if (onOpenPage) onOpenPage(pageId);
    else navigate(wikiPagePath(pageId));
  }, [navigate, onOpenPage]);

  const handleOpenWorkspace = useCallback(() => {
    navigate('/wiki/workspace?pane=chat&view=graph');
  }, [navigate]);

  const handleBuildPage = useCallback(() => {
    if (onBuildPage) {
      onBuildPage();
      return;
    }
    handleOpenWorkspace();
  }, [handleOpenWorkspace, onBuildPage]);

  const handleOpenSources = useCallback(() => {
    if (onOpenSources) {
      onOpenSources();
      return;
    }
    navigate('/wiki/workspace?pane=chat&view=sources');
  }, [navigate, onOpenSources]);

  const handleReviewPages = useCallback(() => {
    if (onOpenList) {
      onOpenList();
      return;
    }
    navigate('/wiki/list');
  }, [navigate, onOpenList]);

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

  const handleRebuildGraph = async () => {
    setSyncingGraph(true);
    setError('');
    try {
      await rebuildWikiGraph({ limit: GRAPH_PAGE_LIMIT });
      await loadGraph({ quiet: true });
      setToast({
        title: 'Knowledge map refreshed',
        summary: 'Page relationships were rebuilt from the current wiki.'
      });
    } catch (_error) {
      setError('Failed to refresh knowledge map.');
    } finally {
      setSyncingGraph(false);
    }
  };

  return (
    <main className="wiki-page wiki-index wiki-graph-index">
      {toast ? (
        <aside className="wiki-ingest-toast" role="status">
          <div>
            <strong>{toast.title}</strong>
            <span>{toast.summary}</span>
          </div>
        </aside>
      ) : null}
      {loading ? <p className="wiki-index__status">Loading knowledge map...</p> : null}
      {!loading && isEmptyWiki ? (
        <>
          {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
          <WikiSparsePages
            pages={filteredPages}
            onOpenPage={handleOpenPage}
            onOpenWorkspace={handleOpenWorkspace}
            onBuildPage={handleBuildPage}
          />
          <WikiActivityLog refreshKey={activityRefresh} onOpenPage={handleOpenPage} />
        </>
      ) : null}
      {loading || isEmptyWiki ? null : (
        <>
      <section className="wiki-index__header">
        <div className="wiki-index__title-block">
          <p className="wiki-index__eyebrow">Wiki</p>
          <h1>Knowledge map</h1>
          <p>{isSparseWiki ? 'This is still a sparse wiki, so the map is a lightweight constellation rather than an authority signal.' : 'Pages settle into a quiet constellation of links, sources, and review relationships.'}</p>
        </div>
        <div className="wiki-index__tabs" role="tablist" aria-label="Wiki views">
          {onOpenList ? (
            <>
              <button type="button" aria-current="page">Map</button>
              <button type="button" onClick={onOpenList}>List</button>
              <button type="button" onClick={handleExportWiki}>Export</button>
            </>
          ) : (
            <>
              <Link aria-current="page" to="/wiki">Map</Link>
              <Link to="/wiki/list">List</Link>
              <button type="button" onClick={handleExportWiki}>Export</button>
            </>
          )}
        </div>
      </section>
      <section className="wiki-index__filters" aria-label="Knowledge map filters">
        <select value={pageType} onChange={(event) => setPageType(event.target.value)} aria-label="Page type">
          {PAGE_TYPES.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
        </select>
        <select value={modifiedWithin} onChange={(event) => setModifiedWithin(event.target.value)} aria-label="Modified within">
          {MODIFIED_WINDOWS.map(value => <option key={value} value={value}>{value === 'all' ? 'All time' : `Modified ${value}`}</option>)}
        </select>
        <select value={driftStatus} onChange={(event) => setDriftStatus(event.target.value)} aria-label="Review status">
          {DRIFT_STATUSES.map(value => <option key={value} value={value}>{REVIEW_STATUS_LABELS[value] || labelFor(value)}</option>)}
        </select>
        <span className="wiki-graph-index__stats">
          {graph.nodes.length} {graph.nodes.length === 1 ? 'page' : 'pages'} · {graph.links.length} {graph.links.length === 1 ? 'link' : 'links'}
        </span>
      </section>
      {isSparseWiki ? (
        <section className="wiki-graph-sparse-hint" aria-label="Sparse wiki note">
          <span>Early map</span>
          <p>With fewer than ten pages, the next useful move is not more map-reading. Build one bridge page, add one source, or review the page list until relationships appear.</p>
          <div className="wiki-graph-sparse-hint__actions">
            <button type="button" onClick={handleBuildPage}>Build bridge page</button>
            <button type="button" onClick={handleOpenSources}>Add source</button>
            <button type="button" onClick={handleReviewPages}>Review pages</button>
          </div>
        </section>
      ) : null}
      {!loading && graph.nodes.length && !isSparseWiki ? (
        <section className="wiki-graph-signals" aria-label="Wiki map signals">
          <span>{graphSummary.hubs.length ? `Brightest: ${graphSummary.hubs.map(node => node.title).join(', ')}` : 'No center yet'}</span>
          <span>{graphSummary.orphanCount} standalone page{graphSummary.orphanCount === 1 ? '' : 's'}</span>
          <span>{graphSummary.relationCounts.shared_source || 0} evidence overlap{(graphSummary.relationCounts.shared_source || 0) === 1 ? '' : 's'}</span>
        </section>
      ) : null}
      {!loading && graph.nodes.length && !isSparseWiki ? (
        <section className={`wiki-graph-sync is-${graphSyncState.status}`} aria-label="Knowledge map refresh">
          <div>
            <strong>{graphSyncState.label}</strong>
            <span>{persistedEdgeCount} reviewed connection{persistedEdgeCount === 1 ? '' : 's'} · {graph.links.length} visible connection{graph.links.length === 1 ? '' : 's'}</span>
          </div>
          <Button type="button" variant={graphSyncState.stale ? 'primary' : 'secondary'} onClick={handleRebuildGraph} disabled={syncingGraph}>
            {syncingGraph ? 'Reviewing...' : graphSyncState.stale ? 'Review connections' : 'Update map'}
          </Button>
        </section>
      ) : null}
      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      {!loading && graph.nodes.length && !isMobile ? <WikiGraph graph={graph} onOpenPage={handleOpenPage} /> : null}
      {isMobile ? (
        <section className="wiki-graph-index__mobile-list" aria-label="Wiki pages mobile list">
          <WikiList compact onOpenPage={handleOpenPage} />
        </section>
      ) : null}
      <WikiActivityLog refreshKey={activityRefresh} onOpenPage={handleOpenPage} />
        </>
      )}
    </main>
  );
};

export default WikiIndex;
