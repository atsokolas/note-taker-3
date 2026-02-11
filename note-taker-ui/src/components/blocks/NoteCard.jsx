import React, { useEffect, useMemo, useState } from 'react';
import { QuietButton } from '../ui';
import ReturnLaterControl from '../return-queue/ReturnLaterControl';
import ConnectionBuilder from '../connections/ConnectionBuilder';

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
  returnQueueItemType = 'notebook',
  returnQueueItemId,
  connectionScopeType = '',
  connectionScopeId = '',
  forceExpandedState,
  forceExpandedVersion = 0,
  children
}) => {
  const [expanded, setExpanded] = useState(false);

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
            <ReturnLaterControl
              itemType={returnQueueItemType}
              itemId={returnQueueItemId || id}
              defaultReason={summarize(bodyText, 120)}
            />
            <ConnectionBuilder
              itemType={returnQueueItemType}
              itemId={returnQueueItemId || id}
              itemTitle={title || summarize(bodyText, 90)}
              scopeType={connectionScopeType}
              scopeId={connectionScopeId}
            />
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
