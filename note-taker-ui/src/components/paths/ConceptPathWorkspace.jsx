import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, QuietButton, SectionHeader } from '../ui';
import {
  addConceptPathItem,
  createConceptPath,
  deleteConceptPath,
  getConceptPath,
  listConceptPaths,
  removeConceptPathItem,
  reorderConceptPathItems,
  updateConceptPath,
  updateConceptPathItem,
  updateConceptPathProgress
} from '../../api/conceptPaths';
import { getConnectionsForItem, searchConnectableItems } from '../../api/connections';

const formatItemType = (value = '') => {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'notebook') return 'Note';
  if (safe === 'highlight') return 'Highlight';
  if (safe === 'article') return 'Article';
  if (safe === 'concept') return 'Concept';
  if (safe === 'question') return 'Question';
  return safe || 'Item';
};

const ConceptPathWorkspace = ({ selectedPathId = '', onSelectPath }) => {
  const [paths, setPaths] = useState([]);
  const [pathsLoading, setPathsLoading] = useState(false);
  const [pathsError, setPathsError] = useState('');
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState('');
  const [activePath, setActivePath] = useState(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsData, setConnectionsData] = useState({ outgoing: [], incoming: [] });
  const [actionError, setActionError] = useState('');
  const [working, setWorking] = useState(false);

  const refreshPaths = useCallback(async () => {
    setPathsLoading(true);
    setPathsError('');
    try {
      const rows = await listConceptPaths();
      setPaths(rows);
    } catch (error) {
      setPathsError(error.response?.data?.error || 'Failed to load paths.');
    } finally {
      setPathsLoading(false);
    }
  }, []);

  const loadPath = useCallback(async (pathId) => {
    if (!pathId) {
      setActivePath(null);
      setTitleDraft('');
      setDescriptionDraft('');
      return;
    }
    setPathLoading(true);
    setPathError('');
    try {
      const data = await getConceptPath(pathId);
      setActivePath(data);
      setTitleDraft(data?.title || '');
      setDescriptionDraft(data?.description || '');
    } catch (error) {
      setPathError(error.response?.data?.error || 'Failed to load path.');
      setActivePath(null);
    } finally {
      setPathLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPaths();
  }, [refreshPaths]);

  useEffect(() => {
    if (selectedPathId) {
      loadPath(selectedPathId);
      return;
    }
    if (paths.length > 0 && !activePath?._id) {
      const firstId = String(paths[0]._id);
      onSelectPath?.(firstId);
      loadPath(firstId);
    }
  }, [selectedPathId, paths, loadPath, onSelectPath, activePath?._id]);

  const currentIndex = activePath?.progress?.currentIndex || 0;
  const currentStep = activePath?.itemRefs?.[currentIndex] || null;
  const understoodSet = useMemo(
    () => new Set((activePath?.progress?.understoodItemRefIds || []).map(value => String(value))),
    [activePath?.progress?.understoodItemRefIds]
  );

  useEffect(() => {
    if (!activePath?._id) return;
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const rows = await searchConnectableItems({
          q: searchQuery.trim(),
          limit: 30
        });
        if (!cancelled) setSearchResults(rows);
      } catch (error) {
        if (!cancelled) {
          setActionError(error.response?.data?.error || 'Failed to search items.');
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activePath?._id, searchQuery]);

  useEffect(() => {
    if (!currentStep?.type || !currentStep?.id) {
      setConnectionsData({ outgoing: [], incoming: [] });
      setConnectionsLoading(false);
      return;
    }
    let cancelled = false;
    const loadConnections = async () => {
      setConnectionsLoading(true);
      try {
        const data = await getConnectionsForItem({
          itemType: currentStep.type,
          itemId: currentStep.id
        });
        if (!cancelled) {
          setConnectionsData({
            outgoing: Array.isArray(data?.outgoing) ? data.outgoing : [],
            incoming: Array.isArray(data?.incoming) ? data.incoming : []
          });
        }
      } catch (error) {
        if (!cancelled) {
          setActionError(error.response?.data?.error || 'Failed to load key connections.');
        }
      } finally {
        if (!cancelled) setConnectionsLoading(false);
      }
    };
    loadConnections();
    return () => {
      cancelled = true;
    };
  }, [currentStep?.type, currentStep?.id]);

  const existingRefs = useMemo(
    () => new Set((activePath?.itemRefs || []).map(ref => `${ref.type}:${ref.id}`)),
    [activePath?.itemRefs]
  );

  const connectedCandidates = useMemo(() => {
    const items = [];
    (connectionsData.outgoing || []).forEach(row => {
      if (!row?.toType || !row?.toId || !row?.target) return;
      items.push({
        key: `${row.toType}:${row.toId}`,
        type: row.toType,
        id: row.toId,
        title: row.target.title || row.toType,
        relationType: row.relationType
      });
    });
    (connectionsData.incoming || []).forEach(row => {
      if (!row?.fromType || !row?.fromId || !row?.source) return;
      items.push({
        key: `${row.fromType}:${row.fromId}`,
        type: row.fromType,
        id: row.fromId,
        title: row.source.title || row.fromType,
        relationType: row.relationType
      });
    });
    const deduped = [];
    const seen = new Set();
    items.forEach(item => {
      if (seen.has(item.key) || existingRefs.has(item.key)) return;
      seen.add(item.key);
      deduped.push(item);
    });
    return deduped.slice(0, 12);
  }, [connectionsData.outgoing, connectionsData.incoming, existingRefs]);

  const setPathAndRefreshSummary = (nextPath) => {
    setActivePath(nextPath);
    setTitleDraft(nextPath?.title || '');
    setDescriptionDraft(nextPath?.description || '');
    setPaths(prev => prev.map(path => (
      String(path._id) === String(nextPath._id)
        ? {
          ...path,
          title: nextPath.title,
          description: nextPath.description || '',
          itemCount: Array.isArray(nextPath.itemRefs) ? nextPath.itemRefs.length : 0,
          progress: {
            understoodCount: (nextPath.progress?.understoodItemRefIds || []).length,
            currentIndex: nextPath.progress?.currentIndex || 0
          }
        }
        : path
    )));
  };

  const handleCreatePath = async () => {
    setWorking(true);
    setActionError('');
    try {
      const created = await createConceptPath({ title: 'New concept path', description: '' });
      setPaths(prev => [{ _id: created._id, title: created.title, description: created.description || '', itemCount: created.itemRefs?.length || 0, progress: { understoodCount: 0, currentIndex: 0 } }, ...prev]);
      onSelectPath?.(created._id);
      setActivePath(created);
      setTitleDraft(created.title || '');
      setDescriptionDraft(created.description || '');
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to create path.');
    } finally {
      setWorking(false);
    }
  };

  const handleSaveMeta = async () => {
    if (!activePath?._id) return;
    setSavingMeta(true);
    setActionError('');
    try {
      const updated = await updateConceptPath(activePath._id, {
        title: titleDraft,
        description: descriptionDraft
      });
      setPathAndRefreshSummary(updated);
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to save path details.');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDeletePath = async () => {
    if (!activePath?._id) return;
    const confirmed = window.confirm('Delete this concept path?');
    if (!confirmed) return;
    setWorking(true);
    setActionError('');
    try {
      await deleteConceptPath(activePath._id);
      const remaining = paths.filter(path => String(path._id) !== String(activePath._id));
      setPaths(remaining);
      if (remaining.length > 0) {
        const nextId = String(remaining[0]._id);
        onSelectPath?.(nextId);
        await loadPath(nextId);
      } else {
        onSelectPath?.('');
        setActivePath(null);
      }
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to delete path.');
    } finally {
      setWorking(false);
    }
  };

  const handleAddItem = async (itemType, itemId) => {
    if (!activePath?._id) return;
    setWorking(true);
    setActionError('');
    try {
      const updated = await addConceptPathItem(activePath._id, { type: itemType, id: itemId });
      setPathAndRefreshSummary(updated);
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to add item.');
    } finally {
      setWorking(false);
    }
  };

  const handleMoveItem = async (index, direction) => {
    if (!activePath?._id) return;
    const refs = activePath.itemRefs || [];
    const target = index + direction;
    if (target < 0 || target >= refs.length) return;
    const next = [...refs];
    [next[index], next[target]] = [next[target], next[index]];
    const ids = next.map(item => item._id);
    setWorking(true);
    setActionError('');
    try {
      const updated = await reorderConceptPathItems(activePath._id, ids);
      setPathAndRefreshSummary(updated);
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to reorder items.');
    } finally {
      setWorking(false);
    }
  };

  const handleRemoveItem = async (itemRefId) => {
    if (!activePath?._id) return;
    setWorking(true);
    setActionError('');
    try {
      const updated = await removeConceptPathItem(activePath._id, itemRefId);
      setPathAndRefreshSummary(updated);
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to remove item.');
    } finally {
      setWorking(false);
    }
  };

  const handleUpdateItemNotes = async (itemRefId, notes) => {
    if (!activePath?._id) return;
    setActionError('');
    try {
      const updated = await updateConceptPathItem(activePath._id, itemRefId, { notes });
      setPathAndRefreshSummary(updated);
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to update notes.');
    }
  };

  const handleSetCurrentStep = async (nextIndex) => {
    if (!activePath?._id) return;
    const bounded = Math.max(0, Math.min(nextIndex, Math.max((activePath.itemRefs || []).length - 1, 0)));
    try {
      const progress = await updateConceptPathProgress(activePath._id, { currentIndex: bounded });
      setActivePath(prev => prev ? { ...prev, progress: { ...prev.progress, ...progress } } : prev);
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to update path progress.');
    }
  };

  const handleToggleUnderstood = async (itemRefId, checked) => {
    if (!activePath?._id || !itemRefId) return;
    try {
      const progress = await updateConceptPathProgress(activePath._id, {
        toggleItemRefId: itemRefId,
        understood: checked
      });
      setActivePath(prev => prev ? { ...prev, progress: { ...prev.progress, ...progress } } : prev);
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to update understood state.');
    }
  };

  return (
    <div className="section-stack">
      <SectionHeader title="Concept Paths" subtitle="Curated sequences through connected ideas." />
      <div className="concept-path-toolbar">
        <Button onClick={handleCreatePath} disabled={working}>New path</Button>
        {pathsLoading && <p className="muted small">Loading paths…</p>}
      </div>
      {pathsError && <p className="status-message error-message">{pathsError}</p>}
      <div className="concept-path-list">
        {paths.map(path => (
          <button
            type="button"
            key={path._id}
            className={`concept-path-list-item ${String(path._id) === String(activePath?._id) ? 'is-active' : ''}`}
            onClick={() => {
              onSelectPath?.(path._id);
              loadPath(path._id);
            }}
          >
            <span className="concept-path-list-title">{path.title}</span>
            <span className="concept-path-list-meta">{path.itemCount || 0} steps</span>
          </button>
        ))}
        {!pathsLoading && paths.length === 0 && (
          <p className="muted small">No paths yet.</p>
        )}
      </div>

      {pathError && <p className="status-message error-message">{pathError}</p>}
      {pathLoading && <p className="muted small">Loading selected path…</p>}
      {!pathLoading && activePath && (
        <div className="concept-path-detail">
          <div className="concept-path-meta-grid">
            <input
              type="text"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              placeholder="Path title"
            />
            <textarea
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              placeholder="Path description"
              rows={2}
            />
            <div className="concept-path-meta-actions">
              <Button onClick={handleSaveMeta} disabled={savingMeta}>
                {savingMeta ? 'Saving…' : 'Save path'}
              </Button>
              <QuietButton onClick={handleDeletePath} disabled={working}>Delete path</QuietButton>
            </div>
          </div>

          <SectionHeader title="Step viewer" subtitle="Walk through one step at a time." />
          {currentStep ? (
            <div className="concept-path-stepper-card">
              <div className="concept-path-stepper-head">
                <div className="concept-path-step-index">Step {currentIndex + 1} of {activePath.itemRefs.length}</div>
                <label className="concept-path-understood">
                  <input
                    type="checkbox"
                    checked={understoodSet.has(String(currentStep._id))}
                    onChange={(event) => handleToggleUnderstood(currentStep._id, event.target.checked)}
                  />
                  <span>Mark understood</span>
                </label>
              </div>
              <div className="concept-path-step-title">{currentStep.item?.title || formatItemType(currentStep.type)}</div>
              <div className="muted small">{formatItemType(currentStep.type)} · {currentStep.item?.snippet || 'No preview.'}</div>
              <div className="concept-path-step-actions">
                <QuietButton onClick={() => handleSetCurrentStep(currentIndex - 1)} disabled={currentIndex <= 0}>Previous</QuietButton>
                <QuietButton onClick={() => handleSetCurrentStep(currentIndex + 1)} disabled={currentIndex >= activePath.itemRefs.length - 1}>Next</QuietButton>
                {currentStep.item?.openPath && (
                  <QuietButton onClick={() => { window.location.href = currentStep.item.openPath; }}>
                    Open item
                  </QuietButton>
                )}
              </div>

              <SectionHeader title="Key connections" subtitle="Use existing graph to deepen this step." />
              {connectionsLoading && <p className="muted small">Loading connected ideas…</p>}
              {!connectionsLoading && connectedCandidates.length === 0 && (
                <p className="muted small">No connected items to add yet.</p>
              )}
              {!connectionsLoading && connectedCandidates.length > 0 && (
                <div className="concept-path-connected-list">
                  {connectedCandidates.map(item => (
                    <div key={item.key} className="concept-path-connected-row">
                      <div>
                        <div className="concept-path-connected-title">{item.title}</div>
                        <div className="muted small">{formatItemType(item.type)} · {item.relationType}</div>
                      </div>
                      <QuietButton onClick={() => handleAddItem(item.type, item.id)} disabled={working}>
                        Add connected
                      </QuietButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="muted small">Add your first step to start the path.</p>
          )}

          <SectionHeader title="Add steps" subtitle="Search anything in your knowledge base." />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search highlights, notes, articles, concepts, questions"
          />
          {searchLoading && <p className="muted small">Searching…</p>}
          {!searchLoading && (
            <div className="concept-path-search-results">
              {searchResults.slice(0, 10).map(item => (
                <button
                  type="button"
                  key={`${item.itemType}:${item.itemId}`}
                  className="concept-path-search-row"
                  onClick={() => handleAddItem(item.itemType, item.itemId)}
                >
                  <span className="concept-path-search-title">{item.title || formatItemType(item.itemType)}</span>
                  <span className="concept-path-search-meta">{formatItemType(item.itemType)} · {item.snippet || ''}</span>
                </button>
              ))}
              {!searchLoading && searchResults.length === 0 && (
                <p className="muted small">No search results.</p>
              )}
            </div>
          )}

          <SectionHeader title="Path builder" subtitle="Reorder and annotate each step." />
          <div className="concept-path-steps">
            {(activePath.itemRefs || []).map((itemRef, index) => (
              <div key={itemRef._id} className={`concept-path-step-row ${index === currentIndex ? 'is-active' : ''}`}>
                <button type="button" className="concept-path-step-main" onClick={() => handleSetCurrentStep(index)}>
                  <span className="concept-path-step-chip">{index + 1}</span>
                  <span className="concept-path-step-name">{itemRef.item?.title || formatItemType(itemRef.type)}</span>
                  <span className="concept-path-step-type">{formatItemType(itemRef.type)}</span>
                </button>
                <div className="concept-path-step-controls">
                  <QuietButton onClick={() => handleMoveItem(index, -1)} disabled={index === 0 || working}>Up</QuietButton>
                  <QuietButton onClick={() => handleMoveItem(index, 1)} disabled={index === activePath.itemRefs.length - 1 || working}>Down</QuietButton>
                  <QuietButton onClick={() => handleRemoveItem(itemRef._id)} disabled={working}>Remove</QuietButton>
                </div>
                <textarea
                  className="concept-path-step-notes"
                  defaultValue={itemRef.notes || ''}
                  rows={2}
                  placeholder="Step notes"
                  onBlur={(event) => handleUpdateItemNotes(itemRef._id, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {actionError && <p className="status-message error-message">{actionError}</p>}
    </div>
  );
};

export default ConceptPathWorkspace;
