import React from 'react';
import { Button } from '../../ui';

const formatRelativeTime = (dateString) => {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateString).toLocaleDateString();
};

const NotebookList = ({ entries, activeId, loading, error, onSelect, onCreate }) => (
  <aside className="think-notebook-list">
    <div className="think-notebook-list-header">
      <div>
        <div className="muted-label">Notebook</div>
        <div className="think-notebook-list-title">Your pages</div>
      </div>
      <Button variant="secondary" onClick={onCreate}>New</Button>
    </div>
    {loading && <p className="muted small">Loading notes…</p>}
    {error && <p className="status-message error-message">{error}</p>}
    {!loading && entries.length === 0 && (
      <div className="think-notebook-empty">
        <p className="muted small">No notes yet.</p>
        <Button variant="secondary" onClick={onCreate}>Create your first note</Button>
      </div>
    )}
    <div className="think-notebook-list-items">
      {entries.map(entry => (
        <button
          key={entry._id}
          className={`think-notebook-list-item list-button ${activeId === entry._id ? 'is-active' : ''}`}
          onClick={() => onSelect(entry._id)}
        >
          <div className="think-notebook-item-title">{entry.title || 'Untitled note'}</div>
          <div className="think-notebook-item-meta">{formatRelativeTime(entry.updatedAt)}</div>
        </button>
      ))}
    </div>
  </aside>
);

export default NotebookList;
