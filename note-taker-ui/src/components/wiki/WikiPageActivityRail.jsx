import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui';
import {
  listWikiAutolinks,
  listWikiConnectorActions,
  listWikiRevisions,
  applyWikiAutolink,
  rebuildWikiPageGraph,
  reviewWikiFreshness
} from '../../api/wiki';
import { fetchGraphData } from '../../api/map';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const emptyGraphPulse = () => ({
  loading: false,
  error: '',
  nodes: [],
  edges: [],
  sources: 0,
  claims: 0,
  links: 0,
  supportEdges: 0,
  contradictionEdges: 0,
  reviewEdges: 0,
  claimRows: [],
  relatedRows: []
});

const nodeTitle = (nodesById, nodeId) => nodesById.get(nodeId)?.title || 'Untitled';

const buildGraphPulse = ({ pageId, nodes = [], edges = [] }) => {
  const pageNodeId = `wiki_page:${pageId}`;
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const pageClaimPrefix = `${pageId}:`;
  const pageEdges = edges.filter(edge => (
    edge.source === pageNodeId
    || edge.target === pageNodeId
    || String(edge.source || '').startsWith(`wiki_claim:${pageClaimPrefix}`)
    || String(edge.target || '').startsWith(`wiki_claim:${pageClaimPrefix}`)
  ));
  const claimIds = new Set();
  const sourceIds = new Set();
  const relatedIds = new Set();
  const claimRows = [];
  const relatedRows = [];
  let supportEdges = 0;
  let contradictionEdges = 0;
  let reviewEdges = 0;

  pageEdges.forEach((edge) => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    const sourceType = sourceNode?.itemType || '';
    const targetType = targetNode?.itemType || '';
    if (sourceType === 'wiki_claim') claimIds.add(edge.source);
    if (targetType === 'wiki_claim') claimIds.add(edge.target);
    if (edge.relationType === 'related' && edge.source === pageNodeId && targetType === 'wiki_page') {
      relatedIds.add(edge.target);
      relatedRows.push({ id: edge.id, title: nodeTitle(nodesById, edge.target), path: targetNode?.openPath || '' });
    }
    if (edge.relationType === 'supports' && targetType === 'wiki_page') {
      sourceIds.add(edge.source);
      supportEdges += 1;
    }
    if (edge.relationType === 'supports' && targetType === 'wiki_claim') {
      sourceIds.add(edge.source);
      supportEdges += 1;
      claimRows.push({
        id: edge.id,
        relationType: edge.relationType,
        source: nodeTitle(nodesById, edge.source),
        claim: targetNode?.snippet || nodeTitle(nodesById, edge.target)
      });
    }
    if (edge.relationType === 'contradicts') {
      contradictionEdges += 1;
      claimRows.push({
        id: edge.id,
        relationType: edge.relationType,
        source: sourceType === 'wiki_claim' ? 'Claim' : nodeTitle(nodesById, edge.source),
        claim: targetType === 'wiki_claim' ? targetNode?.snippet || nodeTitle(nodesById, edge.target) : nodeTitle(nodesById, edge.target)
      });
    }
    if (edge.relationType === 'needs_review') {
      reviewEdges += 1;
      claimRows.push({
        id: edge.id,
        relationType: edge.relationType,
        source: 'Needs review',
        claim: sourceNode?.snippet || nodeTitle(nodesById, edge.source)
      });
    }
  });

  return {
    ...emptyGraphPulse(),
    nodes,
    edges: pageEdges,
    sources: sourceIds.size,
    claims: claimIds.size,
    links: relatedIds.size,
    supportEdges,
    contradictionEdges,
    reviewEdges,
    claimRows: claimRows.slice(0, 4),
    relatedRows: relatedRows.slice(0, 3)
  };
};

const WikiPageActivityRail = ({ pageId, page, onPageUpdate }) => {
  const [revisions, setRevisions] = useState([]);
  const [actions, setActions] = useState([]);
  const [autolinks, setAutolinks] = useState([]);
  const [graphPulse, setGraphPulse] = useState(emptyGraphPulse);
  const [applyingLinkId, setApplyingLinkId] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [rebuildingGraph, setRebuildingGraph] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setGraphPulse(current => ({ ...current, loading: true, error: '' }));
      try {
        const [nextRevisions, nextActions, nextAutolinks, nextGraph] = await Promise.all([
          listWikiRevisions(pageId),
          listWikiConnectorActions(pageId),
          listWikiAutolinks(pageId),
          fetchGraphData({
            limit: 300,
            relationTypes: ['supports', 'contradicts', 'related', 'contains', 'needs_review'],
            itemTypes: ['highlight', 'notebook', 'article', 'concept', 'question', 'wiki_page', 'wiki_claim']
          })
        ]);
        if (!cancelled) {
          setRevisions(nextRevisions);
          setActions(nextActions);
          setAutolinks(nextAutolinks.suggestions || []);
          setGraphPulse(buildGraphPulse({
            pageId,
            nodes: Array.isArray(nextGraph?.nodes) ? nextGraph.nodes : [],
            edges: Array.isArray(nextGraph?.edges) ? nextGraph.edges : []
          }));
        }
      } catch (error) {
        if (!cancelled) setRevisions([]);
        if (!cancelled) {
          setGraphPulse(current => ({
            ...current,
            loading: false,
            error: error?.response?.data?.error || 'Graph pulse unavailable.'
          }));
        }
      }
    };
    if (pageId) load();
    return () => {
      cancelled = true;
    };
  }, [pageId, page?.updatedAt]);

  const freshness = page?.freshness || {};
  const status = freshness.status || 'fresh';
  const conflictCount = freshness.conflictCount || 0;
  const staleCount = freshness.staleSectionCount || 0;
  const needsReview = conflictCount > 0 || staleCount > 0 || status === 'conflicted' || status === 'needs_review';

  const handleReview = async () => {
    setReviewing(true);
    try {
      const updated = await reviewWikiFreshness(pageId);
      onPageUpdate?.(updated);
    } finally {
      setReviewing(false);
    }
  };

  const handleRebuildGraph = async () => {
    setRebuildingGraph(true);
    try {
      await rebuildWikiPageGraph(pageId);
      const nextGraph = await fetchGraphData({
        limit: 300,
        relationTypes: ['supports', 'contradicts', 'related', 'contains', 'needs_review'],
        itemTypes: ['highlight', 'notebook', 'article', 'concept', 'question', 'wiki_page', 'wiki_claim']
      });
      setGraphPulse(buildGraphPulse({
        pageId,
        nodes: Array.isArray(nextGraph?.nodes) ? nextGraph.nodes : [],
        edges: Array.isArray(nextGraph?.edges) ? nextGraph.edges : []
      }));
    } finally {
      setRebuildingGraph(false);
    }
  };

  const handleApplyAutolink = async (targetPageId) => {
    setApplyingLinkId(targetPageId);
    try {
      const updated = await applyWikiAutolink(pageId, targetPageId);
      onPageUpdate?.(updated);
      setAutolinks(current => current.filter(item => item.pageId !== targetPageId));
    } finally {
      setApplyingLinkId('');
    }
  };

  return (
    <section className="wiki-activity-rail" aria-label="Wiki page activity">
      <div className="wiki-activity-rail__head">
        <p className="wiki-activity-rail__eyebrow">Page pulse</p>
        <span className={`wiki-activity-rail__pill wiki-activity-rail__pill--${status}`}>{status.replace(/_/g, ' ')}</span>
      </div>
      <div className="wiki-activity-rail__metrics">
        <span>{conflictCount} conflicts</span>
        <span>{staleCount} stale sections</span>
      </div>
      {needsReview ? (
        <div className="wiki-activity-rail__review">
          <p>This page has freshness or conflict signals that need human review.</p>
          <Button type="button" variant="secondary" onClick={handleReview} disabled={reviewing}>
            {reviewing ? 'Marking...' : 'Mark reviewed'}
          </Button>
        </div>
      ) : null}
      <div className="wiki-activity-rail__graph">
        <div className="wiki-activity-rail__section-head">
          <strong>Relationship graph</strong>
          <Button type="button" variant="secondary" onClick={handleRebuildGraph} disabled={rebuildingGraph}>
            {rebuildingGraph ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
        <div className="wiki-activity-rail__graph-metrics">
          <span><strong>{graphPulse.sources}</strong> sources</span>
          <span><strong>{graphPulse.claims}</strong> claims</span>
          <span><strong>{graphPulse.links}</strong> links</span>
        </div>
        {graphPulse.contradictionEdges || graphPulse.reviewEdges ? (
          <div className="wiki-activity-rail__graph-alerts">
            {graphPulse.contradictionEdges ? <span>{graphPulse.contradictionEdges} contradiction{graphPulse.contradictionEdges === 1 ? '' : 's'}</span> : null}
            {graphPulse.reviewEdges ? <span>{graphPulse.reviewEdges} claim{graphPulse.reviewEdges === 1 ? '' : 's'} need review</span> : null}
          </div>
        ) : null}
        {graphPulse.claimRows.length ? (
          <ul className="wiki-activity-rail__graph-list">
            {graphPulse.claimRows.map(row => (
              <li key={row.id} className={`wiki-activity-rail__graph-row wiki-activity-rail__graph-row--${row.relationType}`}>
                <span>{row.source}</span>
                <p>{row.claim}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {graphPulse.relatedRows.length ? (
          <div className="wiki-activity-rail__related">
            {graphPulse.relatedRows.map(row => (
              row.path ? <Link key={row.id} to={row.path}>{row.title}</Link> : <span key={row.id}>{row.title}</span>
            ))}
          </div>
        ) : null}
        {!graphPulse.loading && !graphPulse.error && !graphPulse.edges.length ? (
          <p className="wiki-activity-rail__empty">No persisted relationships yet.</p>
        ) : null}
        {graphPulse.error ? <p className="wiki-activity-rail__empty">{graphPulse.error}</p> : null}
      </div>
      {autolinks.length ? (
        <div className="wiki-activity-rail__autolinks">
          <strong>Link opportunities</strong>
          <ul className="wiki-activity-rail__list">
            {autolinks.slice(0, 4).map(suggestion => (
              <li key={suggestion.pageId}>
                <Link to={`/wiki/${suggestion.pageId}`}>{suggestion.title}</Link>
                <span>{suggestion.snippet}</span>
                <time>{suggestion.mentionCount} mention{suggestion.mentionCount === 1 ? '' : 's'}</time>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleApplyAutolink(suggestion.pageId)}
                  disabled={applyingLinkId === suggestion.pageId}
                >
                  {applyingLinkId === suggestion.pageId ? 'Linking...' : 'Apply link'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {actions.length ? (
        <div className="wiki-activity-rail__connectors">
          <strong>Connector history</strong>
          <ul className="wiki-activity-rail__list">
            {actions.slice(0, 3).map(action => (
              <li key={action._id}>
                <strong>{action.connector} {action.direction}</strong>
                <span>{action.summary || action.action}</span>
                <time>{formatDate(action.createdAt)}</time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="wiki-activity-rail__list">
        {revisions.slice(0, 5).map(revision => (
          <li key={revision._id}>
            <strong>{String(revision.reason || 'updated').replace(/_/g, ' ')}</strong>
            <span>{revision.summary || (revision.actorType === 'agent' ? 'Agent updated this page.' : 'Page changed.')}</span>
            <time>{formatDate(revision.createdAt)}</time>
          </li>
        ))}
      </ul>
      {!revisions.length ? <p className="wiki-activity-rail__empty">No revision history yet.</p> : null}
    </section>
  );
};

export default WikiPageActivityRail;
