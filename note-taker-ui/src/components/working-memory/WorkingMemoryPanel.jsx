import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, QuietButton } from '../ui';

const WM_DRAFT_KEY = 'wm.draft';

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

const decodeTokenUserId = () => {
  const token = localStorage.getItem('token');
  if (!token) return 'anon';
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return 'anon';
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized));
    return String(decoded.id || decoded.userId || decoded.username || 'anon');
  } catch (error) {
    return 'anon';
  }
};

const readDraftForUser = (userId) => {
  const raw = localStorage.getItem(WM_DRAFT_KEY);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return String(parsed[userId] || '');
    }
    return String(raw || '');
  } catch (error) {
    return String(raw || '');
  }
};

const saveDraftForUser = (userId, draft) => {
  try {
    const raw = localStorage.getItem(WM_DRAFT_KEY);
    let next = {};
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        next = parsed;
      }
    }
    if (draft.trim()) {
      next[userId] = draft;
    } else {
      delete next[userId];
    }
    localStorage.setItem(WM_DRAFT_KEY, JSON.stringify(next));
  } catch (error) {
    localStorage.setItem(WM_DRAFT_KEY, JSON.stringify({ [userId]: draft }));
  }
};

const WorkingMemoryPanel = ({
  items = [],
  loading = false,
  error = '',
  onDumpText,
  onDeleteItem,
  onPromoteToCard,
  onPromoteToNote,
  onPromoteToConcept,
  onLinkEvidence,
  promotionContext = null
}) => {
  const userIdRef = useRef(decodeTokenUserId());
  const textareaRef = useRef(null);
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState(() => readDraftForUser(userIdRef.current));
  const [selection, setSelection] = useState({ text: '', start: 0, end: 0 });
  const [promoteStatus, setPromoteStatus] = useState('');

  useEffect(() => {
    saveDraftForUser(userIdRef.current, draft);
  }, [draft]);

  const canMakeCard = Boolean(
    onPromoteToCard &&
    (promotionContext?.scopeType === 'concept' || promotionContext?.scopeType === 'question') &&
    promotionContext?.scopeId
  );

  const actions = useMemo(() => ([
    { key: 'card', label: 'Make card', handler: onPromoteToCard, enabled: canMakeCard, variant: 'primary' },
    { key: 'note', label: 'Make note', handler: onPromoteToNote, enabled: Boolean(onPromoteToNote), variant: 'secondary' },
    { key: 'concept', label: 'Make concept', handler: onPromoteToConcept, enabled: Boolean(onPromoteToConcept), variant: 'secondary' },
    { key: 'evidence', label: 'Link evidence', handler: onLinkEvidence, enabled: Boolean(onLinkEvidence), variant: 'secondary' }
  ]), [canMakeCard, onLinkEvidence, onPromoteToCard, onPromoteToConcept, onPromoteToNote]);

  const updateSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = textarea;
    if (selectionEnd <= selectionStart) {
      setSelection({ text: '', start: 0, end: 0 });
      return;
    }
    const text = draft.slice(selectionStart, selectionEnd).trim();
    if (!text) {
      setSelection({ text: '', start: 0, end: 0 });
      return;
    }
    setSelection({ text, start: selectionStart, end: selectionEnd });
  }, [draft]);

  const handleDump = async () => {
    const text = draft.trim();
    if (!text || !onDumpText) return;
    await onDumpText(text);
    setDraft('');
    setSelection({ text: '', start: 0, end: 0 });
    setPromoteStatus('');
  };

  const handlePromote = async (action) => {
    if (!selection.text || !action?.enabled || !action.handler) return;
    try {
      await action.handler(selection.text);
      setPromoteStatus(`${action.label} created`);
    } catch (error) {
      setPromoteStatus(`Could not ${action.label.toLowerCase()}`);
    }
  };

  const handleDraftKeyDown = async (event) => {
    const shouldPromoteDefault = (event.metaKey || event.ctrlKey) && event.key === 'Enter';
    if (!shouldPromoteDefault) return;
    const defaultAction = actions.find(action => action.key === 'card');
    if (!defaultAction?.enabled || !selection.text) return;
    event.preventDefault();
    await handlePromote(defaultAction);
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
          <span aria-hidden="true" className="working-memory-toggle-icon">{expanded ? '▾' : '▸'}</span>
          <span>{expanded ? 'Collapse' : 'Expand'}</span>
        </button>
      </div>

      {expanded && (
        <div className="working-memory-body">
          <div className="working-memory-input-row">
            <textarea
              ref={textareaRef}
              className="working-memory-input"
              value={draft}
              placeholder="Scratch freely, paste fragments, jot ideas..."
              onChange={(event) => setDraft(event.target.value)}
              onSelect={updateSelection}
              onMouseUp={updateSelection}
              onKeyUp={updateSelection}
              onKeyDown={handleDraftKeyDown}
              rows={6}
            />
            {selection.text && (
              <div className="working-memory-action-bar">
                {actions.map(action => (
                  <button
                    key={action.key}
                    type="button"
                    className={`working-memory-action ${action.variant === 'primary' ? 'is-primary' : ''}`}
                    onClick={() => handlePromote(action)}
                    disabled={!action.enabled}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
            {promoteStatus && <p className="muted small">{promoteStatus}</p>}
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
