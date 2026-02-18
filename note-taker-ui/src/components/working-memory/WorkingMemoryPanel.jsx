import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api';
import { getAuthHeaders } from '../../hooks/useAuthHeaders';
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

const parseTagInput = (raw) => {
  const seen = new Set();
  return String(raw || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .filter(tag => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
};

const WorkingMemoryPanel = ({
  items = [],
  loading = false,
  error = '',
  viewMode = 'active',
  onViewModeChange,
  onDumpText,
  onDeleteItem,
  onArchiveItems,
  onRestoreItems,
  onSplitItem,
  onPromoteBlocks
}) => {
  const panelRef = useRef(null);
  const userIdRef = useRef(decodeTokenUserId());
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState(() => readDraftForUser(userIdRef.current));
  const [selectedIds, setSelectedIds] = useState([]);
  const [menuOpenId, setMenuOpenId] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ message: '', tone: 'success' });
  const [target, setTarget] = useState('notebook');
  const [tagsDraft, setTagsDraft] = useState('');
  const [conceptOptions, setConceptOptions] = useState([]);
  const [questionOptions, setQuestionOptions] = useState([]);
  const [conceptName, setConceptName] = useState('');
  const [newConceptName, setNewConceptName] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [questionConcept, setQuestionConcept] = useState('');

  useEffect(() => {
    saveDraftForUser(userIdRef.current, draft);
  }, [draft]);

  useEffect(() => {
    const activeIds = new Set(items.map(item => String(item._id || item.id || '')));
    setSelectedIds(prev => prev.filter(id => activeIds.has(String(id))));
  }, [items]);

  useEffect(() => {
    if (!toast.message) return undefined;
    const timer = setTimeout(() => {
      setToast({ message: '', tone: 'success' });
    }, 2200);
    return () => clearTimeout(timer);
  }, [toast.message]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target)) {
        setMenuOpenId('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTargets = async () => {
      try {
        const [conceptRes, questionRes] = await Promise.all([
          api.get('/api/concepts', getAuthHeaders()),
          api.get('/api/questions?status=open', getAuthHeaders())
        ]);
        if (cancelled) return;
        const concepts = Array.isArray(conceptRes.data) ? conceptRes.data : [];
        const questions = Array.isArray(questionRes.data) ? questionRes.data : [];
        setConceptOptions(concepts);
        setQuestionOptions(questions);
        if (concepts[0]?.name) {
          setConceptName(prev => (prev ? prev : String(concepts[0].name)));
        }
      } catch (loadError) {
        if (cancelled) return;
        setConceptOptions([]);
        setQuestionOptions([]);
      }
    };
    loadTargets();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCount = selectedIds.length;
  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);
  const hasItems = items.length > 0;
  const allSelected = hasItems && selectedIds.length === items.length;
  const isArchivedView = String(viewMode || 'active') === 'archived';

  const showToast = useCallback((message, tone = 'success') => {
    setToast({ message, tone });
  }, []);

  const withBusyState = useCallback(async (task, fallbackError = 'Action failed.') => {
    setBusy(true);
    try {
      return await task();
    } catch (taskError) {
      showToast(taskError?.response?.data?.error || fallbackError, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  const selectOnly = useCallback((itemId, nextTarget = target) => {
    const safeId = String(itemId || '').trim();
    if (!safeId) return;
    setSelectedIds([safeId]);
    setTarget(nextTarget);
    setMenuOpenId('');
  }, [target]);

  const toggleSelectId = useCallback((itemId) => {
    const safeId = String(itemId || '').trim();
    if (!safeId) return;
    setSelectedIds(prev => (
      prev.some(id => String(id) === safeId)
        ? prev.filter(id => String(id) !== safeId)
        : [...prev, safeId]
    ));
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(items.map(item => String(item._id || item.id || '')).filter(Boolean));
  }, [allSelected, items]);

  const handleDump = useCallback(async () => {
    const text = String(draft || '').trim();
    if (!text || !onDumpText) return;
    await withBusyState(async () => {
      await onDumpText(text);
      if (onViewModeChange) onViewModeChange('active');
      setDraft('');
      showToast('Dumped to working memory.');
    }, 'Could not dump text.');
  }, [draft, onDumpText, onViewModeChange, showToast, withBusyState]);

  const handleArchive = useCallback(async (ids, successMessage = 'Archived.') => {
    const safeIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [String(ids || '')].filter(Boolean);
    if (safeIds.length === 0) return;
    await withBusyState(async () => {
      if (onArchiveItems) {
        await onArchiveItems(safeIds);
      } else if (onDeleteItem && safeIds.length === 1) {
        await onDeleteItem(safeIds[0]);
      } else {
        throw new Error('Archive action unavailable.');
      }
      setMenuOpenId('');
      setSelectedIds(prev => prev.filter(id => !safeIds.includes(String(id))));
      showToast(successMessage);
    }, 'Could not archive block.');
  }, [onArchiveItems, onDeleteItem, showToast, withBusyState]);

  const handleRestore = useCallback(async (ids, successMessage = 'Restored.') => {
    const safeIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [String(ids || '')].filter(Boolean);
    if (safeIds.length === 0) return;
    await withBusyState(async () => {
      if (!onRestoreItems) {
        throw new Error('Restore action unavailable.');
      }
      await onRestoreItems(safeIds);
      setMenuOpenId('');
      setSelectedIds(prev => prev.filter(id => !safeIds.includes(String(id))));
      showToast(successMessage);
    }, 'Could not restore block.');
  }, [onRestoreItems, showToast, withBusyState]);

  const handleSplit = useCallback(async (itemId, mode = 'sentence') => {
    if (!onSplitItem) {
      showToast('Split action unavailable.', 'error');
      return;
    }
    await withBusyState(async () => {
      await onSplitItem(String(itemId), mode);
      setSelectedIds(prev => prev.filter(id => String(id) !== String(itemId)));
      showToast(mode === 'newline' ? 'Split into line blocks.' : 'Split into sentence blocks.');
    }, 'Could not split block.');
  }, [onSplitItem, showToast, withBusyState]);

  const handlePromote = useCallback(async (ids, forcedTarget = '') => {
    if (!onPromoteBlocks) {
      showToast('Promote action unavailable.', 'error');
      return;
    }
    const safeIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [String(ids || '')].filter(Boolean);
    if (safeIds.length === 0) return;
    const promoteTarget = String(forcedTarget || target || 'notebook').trim().toLowerCase();
    const tags = parseTagInput(tagsDraft);
    const payload = { tags };
    if (promoteTarget === 'concept') {
      const finalConcept = String(newConceptName || conceptName || '').trim();
      if (!finalConcept) {
        showToast('Pick a concept or enter a new concept name.', 'error');
        return;
      }
      payload.conceptName = finalConcept;
      payload.title = finalConcept;
    }
    if (promoteTarget === 'question') {
      const finalQuestionId = String(questionId || '').trim();
      const finalQuestionText = String(newQuestionText || '').trim();
      if (finalQuestionId) payload.questionId = finalQuestionId;
      if (finalQuestionText) payload.questionText = finalQuestionText;
      if (!finalQuestionId && !finalQuestionText) {
        showToast('Pick an existing question or enter new question text.', 'error');
        return;
      }
      const finalQuestionConcept = String(questionConcept || '').trim();
      if (finalQuestionConcept) payload.conceptName = finalQuestionConcept;
    }

    await withBusyState(async () => {
      await onPromoteBlocks({
        target: promoteTarget,
        itemIds: safeIds,
        payload
      });
      setSelectedIds(prev => prev.filter(id => !safeIds.includes(String(id))));
      setMenuOpenId('');
      showToast(`Promoted to ${promoteTarget}.`);
    }, `Could not promote to ${promoteTarget}.`);
  }, [
    conceptName,
    newConceptName,
    newQuestionText,
    onPromoteBlocks,
    questionConcept,
    questionId,
    showToast,
    tagsDraft,
    target,
    withBusyState
  ]);

  const handleQuickNotebook = useCallback(async (itemId) => {
    await handlePromote([itemId], 'notebook');
  }, [handlePromote]);

  const handlePrepareConcept = useCallback((itemId) => {
    selectOnly(itemId, 'concept');
  }, [selectOnly]);

  const handlePrepareQuestion = useCallback((itemId) => {
    selectOnly(itemId, 'question');
  }, [selectOnly]);

  const renderPromoteComposer = selectedCount > 0 && !isArchivedView;

  return (
    <div className="working-memory-panel" ref={panelRef}>
      <div className="working-memory-header-row">
        <div className="working-memory-title">Working Memory</div>
        <div className="working-memory-status-toggle" role="tablist" aria-label="Working memory status">
          <button
            type="button"
            role="tab"
            aria-selected={!isArchivedView}
            className={!isArchivedView ? 'is-active' : ''}
            onClick={() => onViewModeChange?.('active')}
          >
            Active
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isArchivedView}
            className={isArchivedView ? 'is-active' : ''}
            onClick={() => onViewModeChange?.('archived')}
          >
            Archived
          </button>
        </div>
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
          {!isArchivedView && (
            <div className="working-memory-input-row">
              <textarea
                className="working-memory-input"
                value={draft}
                placeholder="Scratch freely, paste fragments, jot ideas..."
                onChange={(event) => setDraft(event.target.value)}
                rows={6}
              />
              <Button onClick={handleDump} disabled={busy || !draft.trim()}>
                Dump
              </Button>
            </div>
          )}

          {toast.message && (
            <p className={`status-message ${toast.tone === 'error' ? 'error-message' : 'success-message'}`}>
              {toast.message}
            </p>
          )}
          {loading && <p className="muted small">Loading memory…</p>}
          {error && <p className="status-message error-message">{error}</p>}

          {!loading && !error && (
            <div className="working-memory-list">
              {items.length === 0 ? (
                <p className="muted small">
                  {isArchivedView ? 'No archived blocks yet.' : 'No dumped items yet.'}
                </p>
              ) : (
                <>
                  <div className="working-memory-list-toolbar">
                    <button type="button" className="working-memory-select-all" onClick={toggleSelectAll}>
                      {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                    <span className="muted small">{selectedCount} selected</span>
                  </div>

                  {isArchivedView && selectedCount > 0 && (
                    <div className="working-memory-restore-bar">
                      <Button disabled={busy} onClick={() => handleRestore(selectedIds, 'Restored selected blocks.')}>
                        Restore selected
                      </Button>
                    </div>
                  )}

                  {renderPromoteComposer && (
                    <div className="working-memory-promote-bar">
                      <div className="working-memory-promote-top">
                        <label>
                          <span>Promote to</span>
                          <select value={target} onChange={(event) => setTarget(event.target.value)}>
                            <option value="notebook">Notebook</option>
                            <option value="concept">Concept</option>
                            <option value="question">Question</option>
                          </select>
                        </label>
                        <label>
                          <span>Tags (optional)</span>
                          <input
                            type="text"
                            value={tagsDraft}
                            placeholder="tag1, tag2"
                            onChange={(event) => setTagsDraft(event.target.value)}
                          />
                        </label>
                        <div className="working-memory-promote-buttons">
                          <Button disabled={busy} onClick={() => handlePromote(selectedIds)}>
                            Promote selected
                          </Button>
                          <QuietButton disabled={busy} onClick={() => handleArchive(selectedIds, 'Archived selected blocks.')}>
                            Archive selected
                          </QuietButton>
                        </div>
                      </div>

                      {target === 'concept' && (
                        <div className="working-memory-promote-details">
                          <label>
                            <span>Existing concept</span>
                            <select value={conceptName} onChange={(event) => setConceptName(event.target.value)}>
                              <option value="">Choose concept</option>
                              {conceptOptions.map(option => (
                                <option key={option._id || option.name} value={option.name}>{option.name}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Or new concept</span>
                            <input
                              type="text"
                              value={newConceptName}
                              placeholder="Create new concept"
                              onChange={(event) => setNewConceptName(event.target.value)}
                            />
                          </label>
                        </div>
                      )}

                      {target === 'question' && (
                        <div className="working-memory-promote-details">
                          <label>
                            <span>Existing question</span>
                            <select value={questionId} onChange={(event) => setQuestionId(event.target.value)}>
                              <option value="">Create new question</option>
                              {questionOptions.map(option => (
                                <option key={option._id} value={option._id}>
                                  {(option.text || 'Question').slice(0, 80)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {!questionId && (
                            <label>
                              <span>New question text</span>
                              <input
                                type="text"
                                value={newQuestionText}
                                placeholder="What question should this become?"
                                onChange={(event) => setNewQuestionText(event.target.value)}
                              />
                            </label>
                          )}
                          <label>
                            <span>Question concept (optional)</span>
                            <input
                              type="text"
                              value={questionConcept}
                              placeholder="Concept name"
                              onChange={(event) => setQuestionConcept(event.target.value)}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {items.map(item => {
                    const itemId = String(item._id || item.id || '');
                    const isSelected = selectedSet.has(itemId);
                    const isMenuOpen = menuOpenId === itemId;
                    return (
                      <article
                        key={itemId}
                        className={`working-memory-block ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="working-memory-block-header">
                          <label className="working-memory-block-check">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectId(itemId)}
                            />
                            <span className="sr-only">Select block</span>
                          </label>
                          <div className="working-memory-block-meta">
                            <span>{item.sourceType || 'note'}</span>
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                          <button
                            type="button"
                            className="working-memory-more"
                            onClick={() => setMenuOpenId(prev => (prev === itemId ? '' : itemId))}
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            aria-label="More actions"
                          >
                            ...
                          </button>
                        </div>

                        <div className="working-memory-block-text">{item.textSnippet}</div>
                        {(item.tags || []).length > 0 && (
                          <div className="working-memory-block-tags">
                            {(item.tags || []).map(tag => (
                              <span key={`${itemId}-${tag}`} className="working-memory-tag">{tag}</span>
                            ))}
                          </div>
                        )}

                        <div className="working-memory-block-actions">
                          {isArchivedView ? (
                            <button type="button" onClick={() => handleRestore([itemId])} disabled={busy}>Restore</button>
                          ) : (
                            <>
                              <button type="button" onClick={() => handleQuickNotebook(itemId)} disabled={busy}>Notebook</button>
                              <button type="button" onClick={() => handlePrepareConcept(itemId)} disabled={busy}>Concept</button>
                              <button type="button" onClick={() => handlePrepareQuestion(itemId)} disabled={busy}>Question</button>
                              <button type="button" onClick={() => handleSplit(itemId, 'sentence')} disabled={busy}>Split</button>
                              <button type="button" onClick={() => handleArchive([itemId])} disabled={busy}>Archive</button>
                            </>
                          )}
                        </div>

                        {isMenuOpen && (
                          <div className="working-memory-menu" role="menu">
                            {isArchivedView ? (
                              <button type="button" role="menuitem" onClick={() => handleRestore([itemId])}>
                                Restore
                              </button>
                            ) : (
                              <>
                                <button type="button" role="menuitem" onClick={() => handleQuickNotebook(itemId)}>
                                  Promote to Notebook
                                </button>
                                <button type="button" role="menuitem" onClick={() => handlePrepareConcept(itemId)}>
                                  Promote to Concept
                                </button>
                                <button type="button" role="menuitem" onClick={() => handlePrepareQuestion(itemId)}>
                                  Promote to Question
                                </button>
                                <button type="button" role="menuitem" onClick={() => handleSplit(itemId, 'sentence')}>
                                  Split by Sentence
                                </button>
                                <button type="button" role="menuitem" onClick={() => handleSplit(itemId, 'newline')}>
                                  Split by Newline
                                </button>
                                <button type="button" role="menuitem" onClick={() => handleArchive([itemId])}>
                                  Archive
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkingMemoryPanel;
