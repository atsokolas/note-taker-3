import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Button, QuietButton, SectionHeader, PageTitle } from '../components/ui';
import { fetchGraphData } from '../api/map';

const RELATION_TYPES = ['supports', 'contradicts', 'extends', 'related'];
const ITEM_TYPES = ['highlight', 'notebook', 'article', 'concept', 'question'];

const ITEM_COLORS = {
  highlight: '#2563eb',
  notebook: '#0f766e',
  article: '#7c3aed',
  concept: '#c2410c',
  question: '#9333ea'
};

const EDGE_COLORS = {
  supports: '#059669',
  contradicts: '#dc2626',
  extends: '#2563eb',
  related: '#6b7280'
};

const formatItemType = (value = '') => {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'notebook') return 'Note';
  if (safe === 'highlight') return 'Highlight';
  if (safe === 'article') return 'Article';
  if (safe === 'concept') return 'Concept';
  if (safe === 'question') return 'Question';
  return safe || 'Item';
};

const parseTags = (value = '') => (
  String(value || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
);

const MapView = () => {
  const graphRef = useRef(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [page, setPage] = useState({ limit: 180, offset: 0, hasMore: false, nextOffset: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [relationFilter, setRelationFilter] = useState(() => new Set(RELATION_TYPES));
  const [itemFilter, setItemFilter] = useState(() => new Set(ITEM_TYPES));
  const [tagsInput, setTagsInput] = useState('');
  const [scopeType, setScopeType] = useState('');
  const [scopeId, setScopeId] = useState('');
  const [notebookId, setNotebookId] = useState('');

  const relationTypes = useMemo(() => Array.from(relationFilter), [relationFilter]);
  const itemTypes = useMemo(() => Array.from(itemFilter), [itemFilter]);
  const tags = useMemo(() => parseTags(tagsInput), [tagsInput]);

  const loadGraph = useCallback(async ({ nextOffset = 0, append = false } = {}) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchGraphData({
        limit: 180,
        offset: nextOffset,
        relationTypes,
        itemTypes,
        tags,
        scopeType,
        scopeId,
        notebookId
      });

      const incomingNodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const incomingEdges = Array.isArray(data?.edges) ? data.edges : [];

      setGraphData(prev => {
        if (!append) {
          return {
            nodes: incomingNodes,
            links: incomingEdges
          };
        }

        const nodeMap = new Map((prev.nodes || []).map(node => [node.id, node]));
        incomingNodes.forEach(node => nodeMap.set(node.id, node));
        const edgeMap = new Map((prev.links || []).map(edge => [edge.id, edge]));
        incomingEdges.forEach(edge => edgeMap.set(edge.id, edge));
        return {
          nodes: Array.from(nodeMap.values()),
          links: Array.from(edgeMap.values())
        };
      });

      setPage(data?.page || { limit: 180, offset: nextOffset, hasMore: false, nextOffset });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load map graph.');
      if (!append) setGraphData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  }, [relationTypes, itemTypes, tags, scopeType, scopeId, notebookId]);

  useEffect(() => {
    loadGraph({ nextOffset: 0, append: false });
  }, [loadGraph]);

  const toggleSetFilter = (setter, value) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const focusNode = (node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    if (!graphRef.current || !node?.x || !node?.y) return;
    graphRef.current.centerAt(node.x, node.y, 600);
    graphRef.current.zoom(2.2, 600);
  };

  const nodeCount = graphData.nodes.length;
  const edgeCount = graphData.links.length;

  return (
    <div className="section-stack map-view-page">
      <PageTitle eyebrow="Mode" title="Map" subtitle="Visualize connected notes, highlights, and ideas." />

      <div className="map-toolbar">
        <div className="map-toolbar-group">
          <span className="muted small">Relation</span>
          {RELATION_TYPES.map(type => (
            <button
              type="button"
              key={type}
              className={`map-filter-chip ${relationFilter.has(type) ? 'is-active' : ''}`}
              onClick={() => toggleSetFilter(setRelationFilter, type)}
            >
              {type}
            </button>
          ))}
        </div>
        <div className="map-toolbar-group">
          <span className="muted small">Item type</span>
          {ITEM_TYPES.map(type => (
            <button
              type="button"
              key={type}
              className={`map-filter-chip ${itemFilter.has(type) ? 'is-active' : ''}`}
              onClick={() => toggleSetFilter(setItemFilter, type)}
            >
              {formatItemType(type)}
            </button>
          ))}
        </div>
        <div className="map-toolbar-inline">
          <input
            type="text"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="Tags (comma separated)"
          />
          <select value={scopeType} onChange={(event) => setScopeType(event.target.value)}>
            <option value="">All scopes</option>
            <option value="concept">Concept scope</option>
            <option value="question">Question scope</option>
          </select>
          <input
            type="text"
            value={scopeId}
            onChange={(event) => setScopeId(event.target.value)}
            placeholder="Scope id"
          />
          <input
            type="text"
            value={notebookId}
            onChange={(event) => setNotebookId(event.target.value)}
            placeholder="Notebook id filter"
          />
          <Button onClick={() => loadGraph({ nextOffset: 0, append: false })} disabled={loading}>
            Apply
          </Button>
        </div>
      </div>

      {error && <p className="status-message error-message">{error}</p>}
      {loading && nodeCount === 0 && <p className="muted small">Loading graph…</p>}
      {!loading && nodeCount === 0 && (
        <p className="muted small">No graph data for this filter set.</p>
      )}

      <div className="map-canvas-grid">
        <div className="map-canvas-card">
          <div className="map-canvas-meta muted small">
            {nodeCount} nodes · {edgeCount} edges
          </div>
          <div className="map-canvas-wrap">
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              nodeAutoColorBy={null}
              linkDirectionalParticles={0}
              nodeLabel={(node) => `${node.title || formatItemType(node.itemType)}\n${formatItemType(node.itemType)}`}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const label = node.title || formatItemType(node.itemType);
                const fontSize = 11 / globalScale;
                ctx.font = `${fontSize}px sans-serif`;
                const textWidth = ctx.measureText(label).width;
                const bckgDimensions = [textWidth + 10 / globalScale, fontSize + 6 / globalScale];
                ctx.fillStyle = ITEM_COLORS[node.itemType] || '#334155';
                ctx.beginPath();
                ctx.arc(node.x, node.y, 4.5, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.fillRect(
                  node.x + 6,
                  node.y - bckgDimensions[1] / 2,
                  bckgDimensions[0],
                  bckgDimensions[1]
                );
                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, node.x + 10, node.y);
              }}
              linkColor={(link) => EDGE_COLORS[link.relationType] || '#94a3b8'}
              linkWidth={1.4}
              onNodeClick={focusNode}
              onLinkClick={(link) => {
                setSelectedEdge(link);
                setSelectedNode(null);
              }}
            />
          </div>
          <div className="map-canvas-actions">
            <QuietButton onClick={() => graphRef.current?.zoomToFit?.(600, 80)}>
              Fit graph
            </QuietButton>
            {page.hasMore && (
              <QuietButton onClick={() => loadGraph({ nextOffset: page.nextOffset, append: true })} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </QuietButton>
            )}
          </div>
        </div>

        <div className="map-side-panel">
          <SectionHeader title="Details" subtitle="Click a node to inspect and open." />
          {!selectedNode && !selectedEdge && (
            <p className="muted small">Select a node or edge.</p>
          )}
          {selectedNode && (
            <div className="map-detail-card">
              <div className="map-detail-title">{selectedNode.title || formatItemType(selectedNode.itemType)}</div>
              <div className="muted small">{formatItemType(selectedNode.itemType)}</div>
              <p className="map-detail-snippet">{selectedNode.snippet || 'No preview text.'}</p>
              {Array.isArray(selectedNode.tags) && selectedNode.tags.length > 0 && (
                <div className="map-detail-tags">
                  {selectedNode.tags.slice(0, 8).map(tag => (
                    <span key={`${selectedNode.id}-${tag}`} className="item-tag-summary">{tag}</span>
                  ))}
                </div>
              )}
              {selectedNode.openPath && (
                <Button onClick={() => { window.location.href = selectedNode.openPath; }}>
                  Open item
                </Button>
              )}
            </div>
          )}
          {selectedEdge && (
            <div className="map-detail-card">
              <div className="map-detail-title">Connection</div>
              <p className="map-detail-snippet">
                {selectedEdge.source} {selectedEdge.relationType} {selectedEdge.target}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapView;
