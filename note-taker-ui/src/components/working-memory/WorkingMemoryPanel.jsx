import React, { useState } from 'react';
import { Button, QuietButton } from '../ui';

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

const WorkingMemoryPanel = ({
  items = [],
  loading = false,
  error = '',
  onDumpText,
  onDeleteItem
}) => {
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState('');

  const handleDump = async () => {
    const text = draft.trim();
    if (!text || !onDumpText) return;
    await onDumpText(text);
    setDraft('');
  };

  return (
    <div className="working-memory-panel">
      <div className="working-memory-header-row">
        <div className="working-memory-title">Working Memory</div>
        <button
          type="button"
          className="working-memory-toggle"
          onClick={() => setExpanded(prev => !prev)}
          aria-label={expanded ? 'Collapse Working Memory' : 'Expand Working Memory'}
        >
          <span aria-hidden="true" className="working-memory-toggle-icon">{expanded ? 'v' : '>'}</span>
          <span>{expanded ? 'Collapse' : 'Expand'}</span>
        </button>
      </div>

      {expanded && (
        <div className="working-memory-body">
          <div className="working-memory-input-row">
            <textarea
              className="working-memory-input"
              value={draft}
              placeholder="Dump a thought quickly..."
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
            />
            <Button onClick={handleDump} disabled={!draft.trim()}>
              Dump
            </Button>
          </div>
          {loading && <p className="muted small">Loading memory…</p>}
          {error && <p className="status-message error-message">{error}</p>}
          {!loading && !error && (
            <div className="working-memory-list">
              {items.length === 0 ? (
                <p className="muted small">No dumped items yet.</p>
              ) : (
                items.map(item => (
                  <div key={item._id || item.id} className="working-memory-item">
                    <div className="working-memory-item-text">{item.textSnippet}</div>
                    <div className="working-memory-item-meta">
                      <span>{item.sourceType || 'note'}</span>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                    {onDeleteItem && item._id && (
                      <QuietButton onClick={() => onDeleteItem(item._id)}>Remove</QuietButton>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkingMemoryPanel;
