import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Button } from './ui';
import { getConnectionsForItem } from '../api/connections';

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const endpointFor = ({ targetType, targetId, tagName }) => {
  if (targetType === 'highlight') return `/api/highlights/${targetId}/backlinks`;
  if (targetType === 'article') return `/api/articles/${targetId}/backlinks`;
  if (targetType === 'concept') return `/api/concepts/${encodeURIComponent(tagName || '')}/backlinks`;
  if (targetType === 'question') return `/api/questions/${targetId}/backlinks`;
  if (targetType === 'notebook') return `/api/references/for-notebook/${targetId}`;
  return null;
};

const GRAPH_TYPE_LABELS = {
  article: 'Article',
  concept: 'Concept',
  highlight: 'Highlight',
  notebook: 'Note',
  question: 'Question',
  wiki_page: 'Wiki',
  wiki_claim: 'Claim'
};

const formatGraphType = (type = '') => GRAPH_TYPE_LABELS[String(type || '').toLowerCase()] || 'Item';

export const canonicalGraphOpenPath = ({ itemType = '', itemId = '', openPath = '' } = {}) => {
  const type = String(itemType || '').toLowerCase();
  const path = String(openPath || '').trim();
  if (type === 'wiki_page' || type === 'wiki_claim') {
    const explicitPageId = type === 'wiki_claim'
      ? String(itemId || '').split(':')[0]
      : String(itemId || '').trim();
    if (explicitPageId) return `/wiki/workspace?page=${encodeURIComponent(explicitPageId)}`;
    const legacyMatch = path.match(/^\/wiki\/([^/?#]+)(.*)?$/);
    if (legacyMatch?.[1] && legacyMatch[1] !== 'workspace' && legacyMatch[1] !== 'list') {
      return `/wiki/workspace?page=${encodeURIComponent(legacyMatch[1])}`;
    }
  }
  return path;
};

const normalizeGraphRows = (connections = {}) => {
  const outgoing = (Array.isArray(connections?.outgoing) ? connections.outgoing : [])
    .map((row) => ({
      id: row?._id || `${row?.toType}:${row?.toId}`,
      direction: 'outgoing',
      relationType: row?.relationType || 'related',
      itemType: row?.toType || '',
      itemId: row?.toId || row?.target?.itemId || row?.target?.id || '',
      title: row?.target?.title || row?.targetTitle || row?.toType || 'Item',
      snippet: row?.target?.snippet || '',
      openPath: canonicalGraphOpenPath({
        itemType: row?.toType || '',
        itemId: row?.toId || row?.target?.itemId || row?.target?.id || '',
        openPath: row?.target?.openPath || ''
      })
    }))
    .filter((row) => row.itemType && row.title);
  const incoming = (Array.isArray(connections?.incoming) ? connections.incoming : [])
    .map((row) => ({
      id: row?._id || `${row?.fromType}:${row?.fromId}`,
      direction: 'incoming',
      relationType: row?.relationType || 'referenced_by',
      itemType: row?.fromType || '',
      itemId: row?.fromId || row?.source?.itemId || row?.source?.id || '',
      title: row?.source?.title || row?.sourceTitle || row?.fromType || 'Item',
      snippet: row?.source?.snippet || '',
      openPath: canonicalGraphOpenPath({
        itemType: row?.fromType || '',
        itemId: row?.fromId || row?.source?.itemId || row?.source?.id || '',
        openPath: row?.source?.openPath || ''
      })
    }))
    .filter((row) => row.itemType && row.title);
  return { outgoing, incoming };
};

const ReferencesPanel = ({
  targetType,
  targetId,
  tagName,
  label = 'Used in',
  defaultOpen = false,
  showToggle = true,
  heading = ''
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [graphLinks, setGraphLinks] = useState({ outgoing: [], incoming: [] });
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setData(null);
    setGraphLinks({ outgoing: [], incoming: [] });
    setLoaded(false);
    setError('');
  }, [targetType, targetId, tagName]);

  const load = async () => {
    const endpoint = endpointFor({ targetType, targetId, tagName });
    const canLoadGraph = Boolean(targetType && targetId);
    if (!endpoint && !canLoadGraph) return;
    setLoading(true);
    setError('');
    try {
      const [legacyResult, graphResult] = await Promise.allSettled([
        endpoint ? api.get(endpoint, getAuthConfig()) : Promise.resolve({ data: { notebookBlocks: [], collections: [] } }),
        canLoadGraph ? getConnectionsForItem({ itemType: targetType, itemId: targetId }) : Promise.resolve({ outgoing: [], incoming: [] })
      ]);
      if (legacyResult.status === 'fulfilled') {
        setData(legacyResult.value?.data || { notebookBlocks: [], collections: [] });
      } else if (!canLoadGraph) {
        throw legacyResult.reason;
      } else {
        setData({ notebookBlocks: [], collections: [] });
      }
      if (graphResult.status === 'fulfilled') {
        setGraphLinks(normalizeGraphRows(graphResult.value));
      } else if (!endpoint) {
        throw graphResult.reason;
      } else {
        setGraphLinks({ outgoing: [], incoming: [] });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load references.');
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!open && !data) {
      load();
    }
    setOpen(prev => !prev);
  };

  useEffect(() => {
    if (open && !loaded && !loading) {
      load();
    }
  });

  const handleBlockClick = (entryId, blockId) => {
    if (!entryId) return;
    const params = new URLSearchParams();
    params.set('entryId', entryId);
    if (blockId) params.set('blockId', blockId);
    params.set('tab', 'notebook');
    navigate(`/think?${params.toString()}`);
  };

  const handleConceptClick = (name) => {
    if (!name) return;
    const params = new URLSearchParams();
    params.set('tab', 'concepts');
    params.set('concept', name);
    navigate(`/think?${params.toString()}`);
  };

  const handleQuestionClick = (questionId) => {
    if (!questionId) return;
    const params = new URLSearchParams();
    params.set('tab', 'questions');
    params.set('questionId', questionId);
    navigate(`/think?${params.toString()}`);
  };

  const handleGraphLinkClick = (openPath) => {
    if (!openPath) return;
    navigate(openPath);
  };

  const renderGraphRows = (rows, labelText) => {
    if (!rows.length) return null;
    return (
      <div className="references-panel__group">
        <p className="muted-label">{labelText}</p>
        <div className="section-stack">
          {rows.map((row) => (
            <button
              key={`${row.direction}-${row.id}`}
              type="button"
              className="search-card"
              onClick={() => handleGraphLinkClick(row.openPath)}
              disabled={!row.openPath}
            >
              <div className="search-card-top">
                <span className="article-title-link">{row.title}</span>
                <span className="muted small">{formatGraphType(row.itemType)} · {row.relationType}</span>
              </div>
              {row.snippet && <p className="muted small">{row.snippet}</p>}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderNotebookBlocks = () => {
    if (!data?.notebookBlocks || data.notebookBlocks.length === 0) {
      return <p className="muted small">No notebook references yet.</p>;
    }
    return (
      <div className="section-stack">
        {data.notebookBlocks.map((block, idx) => (
          <div key={`${block.notebookEntryId}-${block.blockId}-${idx}`} className="search-card">
            <div className="search-card-top">
              <span className="article-title-link">{block.notebookTitle || 'Untitled note'}</span>
              {block.updatedAt && <span className="muted small">{new Date(block.updatedAt).toLocaleDateString()}</span>}
            </div>
            <p className="muted small">{block.blockPreviewText || 'Referenced block'}</p>
            {targetType === 'notebook' && (block.targetType || block.targetTagName) && (
              <p className="muted small">Links to {block.targetType}{block.targetTagName ? `: #${block.targetTagName}` : ''}</p>
            )}
            <Button variant="secondary" onClick={() => handleBlockClick(block.notebookEntryId, block.blockId)}>
              Open note
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="references-panel">
      {heading && <p className="muted-label">{heading}</p>}
      {showToggle && <Button variant="secondary" onClick={toggle}>{open ? 'Hide references' : label}</Button>}
      {open && (
        <div className="references-panel__body">
          {loading && <p className="muted small">Loading references…</p>}
          {error && <p className="status-message error-message">{error}</p>}
          {!loading && !error && (
            <>
              {renderGraphRows(graphLinks.outgoing, 'Uses')}
              {renderGraphRows(graphLinks.incoming, 'Used by')}
              {renderNotebookBlocks()}
              {data?.concepts && data.concepts.length > 0 && (
                <div className="references-panel__group">
                  <p className="muted-label">Concepts</p>
                  <div className="section-stack">
                    {data.concepts.map((concept) => (
                      <button
                        key={concept._id || concept.name}
                        className="search-card"
                        onClick={() => handleConceptClick(concept.name)}
                      >
                        <div className="search-card-top">
                          <span className="article-title-link">{concept.name}</span>
                          {concept.updatedAt && (
                            <span className="muted small">
                              {new Date(concept.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {concept.description && <p className="muted small">{concept.description}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {data?.questions && data.questions.length > 0 && (
                <div className="references-panel__group">
                  <p className="muted-label">Questions</p>
                  <div className="section-stack">
                    {data.questions.map((question) => (
                      <button
                        key={question._id}
                        className="search-card"
                        onClick={() => handleQuestionClick(question._id)}
                      >
                        <div className="search-card-top">
                          <span className="article-title-link">{question.text}</span>
                          {question.updatedAt && (
                            <span className="muted small">
                              {new Date(question.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {(question.conceptName || question.linkedTagName) && (
                          <p className="muted small">
                            {question.conceptName || question.linkedTagName}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {data?.collections && data.collections.length > 0 && (
                <div className="references-panel__group">
                  <p className="muted-label">Collections</p>
                  {data.collections.map((c) => (
                    <Link key={c._id} to={`/collections/${c.slug}`} className="article-title-link">
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ReferencesPanel;
