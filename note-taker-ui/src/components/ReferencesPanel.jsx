import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Button } from './ui';

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const endpointFor = ({ targetType, targetId, tagName }) => {
  if (targetType === 'highlight') return `/api/references/for-highlight/${targetId}`;
  if (targetType === 'article') return `/api/references/for-article/${targetId}`;
  if (targetType === 'concept') return `/api/references/for-concept/${encodeURIComponent(tagName || '')}`;
  if (targetType === 'notebook') return `/api/references/for-notebook/${targetId}`;
  return null;
};

const ReferencesPanel = ({ targetType, targetId, tagName, label = 'Used in' }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    const endpoint = endpointFor({ targetType, targetId, tagName });
    if (!endpoint) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(endpoint, getAuthConfig());
      setData(res.data || { notebookBlocks: [], collections: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load references.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!open && !data) {
      load();
    }
    setOpen(prev => !prev);
  };

  const handleBlockClick = (entryId, blockId) => {
    if (!entryId) return;
    const params = new URLSearchParams();
    params.set('entryId', entryId);
    if (blockId) params.set('blockId', blockId);
    navigate(`/notebook?${params.toString()}`);
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
      <Button variant="secondary" onClick={toggle}>{open ? 'Hide' : label}</Button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {loading && <p className="muted small">Loading references…</p>}
          {error && <p className="status-message error-message">{error}</p>}
          {!loading && !error && (
            <>
              {renderNotebookBlocks()}
              {data?.collections && data.collections.length > 0 && (
                <div style={{ marginTop: 8 }}>
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
