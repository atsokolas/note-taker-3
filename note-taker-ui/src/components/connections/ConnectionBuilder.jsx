import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, QuietButton } from '../ui';
import {
  createConnection,
  deleteConnection,
  getConnectionsForItem,
  searchConnectableItems
} from '../../api/connections';

const RELATION_TYPES = [
  { value: 'supports', label: 'Supports' },
  { value: 'contradicts', label: 'Contradicts' },
  { value: 'extends', label: 'Extends' },
  { value: 'related', label: 'Related' }
];
const ITEM_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'highlight', label: 'Highlights' },
  { value: 'notebook', label: 'Notes' },
  { value: 'article', label: 'Articles' },
  { value: 'concept', label: 'Concepts' },
  { value: 'question', label: 'Questions' }
];
const RELATION_LABELS = RELATION_TYPES.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const formatSummary = (item) => {
  if (!item) return '';
  return item.snippet || item.title || '';
};

const formatItemTypeLabel = (value = '') => {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'notebook') return 'Note';
  if (safe === 'highlight') return 'Highlight';
  if (safe === 'article') return 'Article';
  if (safe === 'concept') return 'Concept';
  if (safe === 'question') return 'Question';
  return safe || 'Item';
};

const ConnectionBuilder = ({ itemType, itemId, scopeType = '', scopeId = '' }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [connections, setConnections] = useState({ outgoing: [], incoming: [] });
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [relationType, setRelationType] = useState('related');
  const [itemFilter, setItemFilter] = useState('all');

  const totalCount = (connections.outgoing?.length || 0) + (connections.incoming?.length || 0);
  const scopePayload = useMemo(
    () => (scopeType && scopeId ? { scopeType, scopeId } : {}),
    [scopeType, scopeId]
  );
  const scopeLabel = scopeType === 'concept'
    ? 'this concept'
    : scopeType === 'question'
      ? 'this question'
      : '';

  const loadConnections = useCallback(async () => {
    if (!itemType || !itemId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getConnectionsForItem({ itemType, itemId, ...scopePayload });
      setConnections({
        outgoing: Array.isArray(data?.outgoing) ? data.outgoing : [],
        incoming: Array.isArray(data?.incoming) ? data.incoming : []
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load connections.');
    } finally {
      setLoading(false);
    }
  }, [itemType, itemId, scopePayload]);

  useEffect(() => {
    if (!open) return;
    loadConnections();
  }, [open, loadConnections]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const trimmed = query.trim();
    const itemTypes = itemFilter === 'all' ? [] : [itemFilter];
    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const items = await searchConnectableItems({
          q: trimmed,
          excludeType: itemType,
          excludeId: itemId,
          itemTypes,
          ...scopePayload
        });
        if (!cancelled) setSearchResults(items);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to search items.');
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [query, itemType, itemId, open, scopePayload, itemFilter]);

  const canCreate = useMemo(
    () => Boolean(selectedTarget?.itemType && selectedTarget?.itemId && relationType),
    [selectedTarget, relationType]
  );
  const previewRows = useMemo(() => {
    const outgoing = (connections.outgoing || []).map(row => ({
      id: row._id,
      direction: 'outgoing',
      relationType: row.relationType,
      title: row.target?.title || formatItemTypeLabel(row.toType),
      itemType: row.toType
    }));
    const incoming = (connections.incoming || []).map(row => ({
      id: row._id,
      direction: 'incoming',
      relationType: row.relationType,
      title: row.source?.title || formatItemTypeLabel(row.fromType),
      itemType: row.fromType
    }));
    return [...outgoing, ...incoming];
  }, [connections]);

  const handleCreate = async () => {
    if (!canCreate) return;
    setSaving(true);
    setError('');
    try {
      const created = await createConnection({
        fromType: itemType,
        fromId: itemId,
        toType: selectedTarget.itemType,
        toId: selectedTarget.itemId,
        relationType,
        ...scopePayload
      });
      setConnections(prev => ({
        ...prev,
        outgoing: [created, ...(prev.outgoing || [])]
      }));
      setSelectedTarget(null);
      setQuery('');
      setSearchResults([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (connectionId, direction) => {
    setError('');
    try {
      await deleteConnection(connectionId);
      setConnections(prev => ({
        ...prev,
        [direction]: (prev[direction] || []).filter(row => String(row._id) !== String(connectionId))
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete connection.');
    }
  };

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  if (!itemType || !itemId) return null;

  return (
    <div className={`connection-builder ${open ? 'is-open' : ''}`}>
      <QuietButton onClick={() => setOpen(prev => !prev)}>
        {open ? 'Close Connect' : `Connect${totalCount ? ` (${totalCount})` : ''}`}
      </QuietButton>
      {!open && (
        <div className="connection-preview">
        {loading ? (
          <p className="muted small">Loading connections...</p>
        ) : totalCount === 0 ? (
          <p className="muted small">No connected items yet.</p>
        ) : (
          previewRows.slice(0, 3).map(row => (
            <div key={`${row.direction}-${row.id}`} className="connection-preview-row">
              <span className="connection-preview-direction">{row.direction === 'outgoing' ? 'to' : 'from'}</span>
              <span className="connection-preview-relation">{RELATION_LABELS[row.relationType] || row.relationType}</span>
              <span className="connection-preview-title">{row.title}</span>
              <span className="connection-preview-type">{formatItemTypeLabel(row.itemType)}</span>
            </div>
          ))
        )}
        </div>
      )}
      {open && (
        <div className="connection-builder-panel">
          <div className="connection-builder-head">
            <div className="connection-builder-title">Create connection</div>
            {scopeLabel && <div className="connection-builder-scope">Scoped to {scopeLabel}</div>}
          </div>
          <div className="connection-explainer">
            <span><strong>Outgoing</strong> = this item points to other items.</span>
            <span><strong>Incoming</strong> = other items point to this item.</span>
          </div>
          <div className="connection-builder-row">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={scopeLabel ? `Search items in ${scopeLabel}` : 'Search notes, highlights, articles, concepts'}
            />
            <select value={relationType} onChange={(event) => setRelationType(event.target.value)}>
              {RELATION_TYPES.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <Button onClick={handleCreate} disabled={!canCreate || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
          <div className="connection-filter-tabs">
            {ITEM_FILTERS.map(filter => (
              <button
                type="button"
                key={filter.value}
                className={`connection-filter-tab ${itemFilter === filter.value ? 'is-active' : ''}`}
                onClick={() => setItemFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {selectedTarget && (
            <div className="connection-selected-target">
              <span className="connection-selected-label">Selected</span>
              <span className="connection-selected-title">{selectedTarget.title || 'Untitled item'}</span>
              <span className="connection-selected-type">{formatItemTypeLabel(selectedTarget.itemType)}</span>
            </div>
          )}

          {searchLoading && <p className="muted small">Searching...</p>}
          {!searchLoading && searchResults.length === 0 && (
            <p className="muted small">No matches in this scope.</p>
          )}
          {!searchLoading && searchResults.length > 0 && (
            <div className="connection-search-results">
              {searchResults.map(result => (
                <button
                  type="button"
                  key={`${result.itemType}-${result.itemId}`}
                  className={`connection-search-result ${selectedTarget?.itemId === result.itemId && selectedTarget?.itemType === result.itemType ? 'is-active' : ''}`}
                  onClick={() => setSelectedTarget(result)}
                >
                  <div className="connection-search-title">{result.title || `${result.itemType} item`}</div>
                  <div className="connection-search-meta">{formatItemTypeLabel(result.itemType)} · {formatSummary(result)}</div>
                </button>
              ))}
            </div>
          )}

          {error && <p className="status-message error-message">{error}</p>}
          {loading && <p className="muted small">Loading connections...</p>}

          {!loading && (
            <div className="connection-lists">
              <div className="connection-list-block">
                <div className="connection-list-title">Connects to (Outgoing)</div>
                {(connections.outgoing || []).length === 0 ? (
                  <p className="muted small">None</p>
                ) : (
                  (connections.outgoing || []).map(row => (
                    <div key={row._id} className="connection-row">
                      <div className="connection-row-main">
                        <div className="connection-row-relation">{RELATION_LABELS[row.relationType] || row.relationType}</div>
                        <div className="connection-row-text">{row.target?.title || row.toType}</div>
                      </div>
                      <QuietButton onClick={() => handleDelete(row._id, 'outgoing')}>Remove</QuietButton>
                    </div>
                  ))
                )}
              </div>
              <div className="connection-list-block">
                <div className="connection-list-title">Connected from (Incoming)</div>
                {(connections.incoming || []).length === 0 ? (
                  <p className="muted small">None</p>
                ) : (
                  (connections.incoming || []).map(row => (
                    <div key={row._id} className="connection-row">
                      <div className="connection-row-main">
                        <div className="connection-row-relation">{RELATION_LABELS[row.relationType] || row.relationType}</div>
                        <div className="connection-row-text">{row.source?.title || row.fromType}</div>
                      </div>
                      <QuietButton onClick={() => handleDelete(row._id, 'incoming')}>Remove</QuietButton>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectionBuilder;
