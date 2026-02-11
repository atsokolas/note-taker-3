import React, { useEffect, useMemo, useState } from 'react';
import { QuietButton } from '../ui';

const summarize = (text, max = 180) => {
  const raw = String(text || '');
  const firstLine = raw.split('\n').find(line => line.trim()) || '';
  const clean = firstLine.replace(/\s+/g, ' ').trim();
  if (!clean) return 'No details yet.';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}…`;
};

const formatTypeLabel = (value = 'note') => {
  const normalized = String(value || 'note').toLowerCase();
  if (normalized === 'claim') return 'Claim';
  if (normalized === 'evidence') return 'Evidence';
  return 'Note';
};

const formatDateLabel = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
};

const NoteCard = ({
  id,
  title,
  bodyText,
  type = 'note',
  tags = [],
  timestamp,
  onOrganize,
  onDumpToWorkingMemory,
  onReturnQueue,
  forceExpandedState,
  forceExpandedVersion = 0,
  children
}) => {
  const [expanded, setExpanded] = useState(false);
  const [queueing, setQueueing] = useState(false);

  const tagSummary = useMemo(() => {
    const safeTags = Array.isArray(tags) ? tags : [];
    return {
      visible: safeTags.slice(0, 2),
      hiddenCount: Math.max(0, safeTags.length - 2)
    };
  }, [tags]);

  useEffect(() => {
    setExpanded(false);
  }, [id]);

  useEffect(() => {
    if (typeof forceExpandedState === 'boolean') {
      setExpanded(forceExpandedState);
    }
  }, [forceExpandedState, forceExpandedVersion]);

  const handleReturnQueue = async () => {
    if (!onReturnQueue) return;
    setQueueing(true);
    try {
      await onReturnQueue();
    } finally {
      setQueueing(false);
    }
  };

  return (
    <div className="note-card">
      <div className="note-card-collapsed">
        <div className="note-card-collapsed-main">
          <div className="note-card-collapsed-title">{title || 'Untitled note'}</div>
          <div className="note-card-collapsed-text">{summarize(bodyText)}</div>
          <div className="note-card-collapsed-meta">
            <span className={`item-type-badge item-type-${String(type || 'note').toLowerCase()}`}>
              {formatTypeLabel(type)}
            </span>
            {tagSummary.visible.map(tag => (
              <span key={`${id || title}-${tag}`} className="item-tag-summary">{tag}</span>
            ))}
            {tagSummary.hiddenCount > 0 && (
              <span className="item-tag-summary">+{tagSummary.hiddenCount}</span>
            )}
            {timestamp && <span className="item-timestamp">{formatDateLabel(timestamp)}</span>}
          </div>
        </div>
        <QuietButton onClick={() => setExpanded(prev => !prev)}>
          {expanded ? 'Collapse' : 'Expand'}
        </QuietButton>
      </div>
      {expanded && (
        <div className="note-card-expanded">
          <div className="note-card-body">{String(bodyText || '').trim() || 'No details yet.'}</div>
          <div className="note-card-actions">
            {onOrganize && (
              <QuietButton onClick={() => onOrganize()}>
                Edit / Tag / Link
              </QuietButton>
            )}
            {children}
            {onReturnQueue && (
              <QuietButton onClick={handleReturnQueue} disabled={queueing}>
                {queueing ? 'Queueing…' : 'Return Queue'}
              </QuietButton>
            )}
            {onDumpToWorkingMemory && (
              <QuietButton onClick={() => onDumpToWorkingMemory()}>
                Dump to Working Memory
              </QuietButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NoteCard;
