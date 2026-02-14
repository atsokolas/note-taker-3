import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import {
  createBoardEdge,
  createBoardItem,
  deleteBoardEdge,
  deleteBoardItem,
  getBoardForScope,
  patchBoardItem,
  updateBoardItems
} from '../api/boards';

const MIN_CARD_WIDTH = 220;
const MIN_CARD_HEIGHT = 140;
const DRAG_DATA_TYPE = 'application/x-studio-board-item';
const CARD_ROLES = ['idea', 'claim', 'evidence'];
const RELATION_OPTIONS = ['supports', 'contradicts', 'explains', 'example'];

const toSnippet = (value, limit = 180) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

const getNoteText = (note) => {
  if (!note) return '';
  const blockText = Array.isArray(note.blocks)
    ? note.blocks.map(block => String(block?.text || '').trim()).filter(Boolean).join(' ')
    : '';
  return note.title || blockText || note.content || '';
};

const toRoleLabel = (role) => {
  const safeRole = String(role || 'idea').trim().toLowerCase();
  if (safeRole === 'claim') return 'Claim';
  if (safeRole === 'evidence') return 'Evidence';
  return 'Idea';
};

const toRelationLabel = (relation) => {
  const safeRelation = String(relation || '').trim().toLowerCase();
  if (safeRelation === 'supports') return 'supports';
  if (safeRelation === 'contradicts') return 'contradicts';
  if (safeRelation === 'explains') return 'explains';
  if (safeRelation === 'example') return 'example';
  return safeRelation || 'related';
};

const StudioCard = React.memo(({
  item,
  title,
  meta,
  body,
  isSelected,
  isLinkSource,
  isLinkTarget,
  linkTargetMode,
  onSelect,
  onStartMove,
  onStartResize,
  onDelete,
  onStartLink,
  onChangeRole
}) => {
  const cardClasses = [
    'studio-board__card',
    isSelected ? 'is-selected' : '',
    isLinkSource ? 'is-link-source' : '',
    isLinkTarget ? 'is-link-target' : '',
    linkTargetMode && !isLinkSource ? 'is-link-target-mode' : ''
  ].filter(Boolean).join(' ');

  return (
    <article
      className={cardClasses}
      style={{
        left: item.x,
        top: item.y,
        width: item.w,
        height: item.h
      }}
      onMouseDown={() => onSelect(item)}
    >
      <header className="studio-board__card-header" onMouseDown={(event) => onStartMove(event, item)}>
        <div className="studio-board__card-title-wrap">
          <h4 className="studio-board__card-title">{title}</h4>
          <p className="studio-board__card-meta">{meta}</p>
        </div>
        <div className="studio-board__card-actions" onMouseDown={(event) => event.stopPropagation()}>
          <select
            className="studio-board__role-select"
            value={item.role || 'idea'}
            aria-label="Card role"
            onChange={(event) => onChangeRole(item._id, event.target.value)}
          >
            {CARD_ROLES.map(role => (
              <option key={role} value={role}>{toRoleLabel(role)}</option>
            ))}
          </select>
          <button
            type="button"
            className="ui-quiet-button"
            onClick={() => onStartLink(item._id)}
            title="Start link"
          >
            Link
          </button>
          <button type="button" className="icon-button" onClick={() => onDelete(item._id)} title="Delete card">
            x
          </button>
        </div>
      </header>
      <div className="studio-board__card-body">
        {body || 'No content'}
      </div>
      <button
        type="button"
        className="studio-board__card-resize"
        onMouseDown={(event) => onStartResize(event, item)}
        aria-label="Resize card"
        title="Resize"
      />
    </article>
  );
});

const StudioBoard = ({ scopeType, scopeId }) => {
  const [board, setBoard] = useState(null);
  const [items, setItems] = useState([]);
  const [edges, setEdges] = useState([]);
  const [activeCardId, setActiveCardId] = useState('');
  const [linkDraft, setLinkDraft] = useState(null);
  const [pendingRelation, setPendingRelation] = useState('supports');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sources, setSources] = useState({ notes: [], highlights: [], articles: [] });
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const interactionListenersRef = useRef({ move: null, up: null });
  const persistTimerRef = useRef(null);

  const safeScopeType = String(scopeType || '').trim().toLowerCase();
  const safeScopeId = String(scopeId || '').trim();

  const loadBoard = useCallback(async () => {
    if (!safeScopeType || !safeScopeId) {
      setBoard(null);
      setItems([]);
      setEdges([]);
      setActiveCardId('');
      setLinkDraft(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getBoardForScope(safeScopeType, safeScopeId);
      setBoard(data.board || null);
      setItems(Array.isArray(data.items) ? data.items : []);
      setEdges(Array.isArray(data.edges) ? data.edges : []);
      setSaveError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load board.');
    } finally {
      setLoading(false);
    }
  }, [safeScopeId, safeScopeType]);

  const loadSources = useCallback(async () => {
    setSourceLoading(true);
    setSourceError('');
    try {
      const [notesRes, highlightsRes, articlesRes] = await Promise.all([
        api.get('/api/notebook', getAuthHeaders()),
        api.get('/api/highlights/all', getAuthHeaders()),
        api.get('/get-articles', getAuthHeaders())
      ]);
      setSources({
        notes: Array.isArray(notesRes.data) ? notesRes.data : [],
        highlights: Array.isArray(highlightsRes.data) ? highlightsRes.data : [],
        articles: Array.isArray(articlesRes.data) ? articlesRes.data : []
      });
    } catch (err) {
      setSourceError(err.response?.data?.error || 'Failed to load source items.');
    } finally {
      setSourceLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const notesById = useMemo(() => {
    const map = new Map();
    sources.notes.forEach(note => map.set(String(note._id), note));
    return map;
  }, [sources.notes]);

  const highlightsById = useMemo(() => {
    const map = new Map();
    sources.highlights.forEach(highlight => map.set(String(highlight._id), highlight));
    return map;
  }, [sources.highlights]);

  const articlesById = useMemo(() => {
    const map = new Map();
    sources.articles.forEach(article => map.set(String(article._id), article));
    return map;
  }, [sources.articles]);

  const persistLayout = useCallback((nextItems) => {
    if (!board?._id) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      try {
        await updateBoardItems(
          board._id,
          nextItems.map(item => ({
            _id: item._id,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h
          }))
        );
        setSaveError('');
      } catch (err) {
        setSaveError(err.response?.data?.error || 'Failed to save board layout.');
      }
    }, 500);
  }, [board?._id]);

  useEffect(() => () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  }, []);

  const updateCard = useCallback((itemId, patch) => {
    setItems(prev => {
      let changed = false;
      const next = prev.map(item => {
        if (String(item._id) !== String(itemId)) return item;
        changed = true;
        return { ...item, ...patch };
      });
      if (changed) persistLayout(next);
      return changed ? next : prev;
    });
  }, [persistLayout]);

  const beginInteraction = useCallback((event, item, mode) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const previous = interactionListenersRef.current;
    if (previous.move) window.removeEventListener('mousemove', previous.move);
    if (previous.up) window.removeEventListener('mouseup', previous.up);
    interactionRef.current = {
      mode,
      itemId: item._id,
      startX: event.clientX,
      startY: event.clientY,
      startItem: {
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        w: Number(item.w) || MIN_CARD_WIDTH,
        h: Number(item.h) || MIN_CARD_HEIGHT
      }
    };
    const onMouseMove = (moveEvent) => {
      const state = interactionRef.current;
      if (!state) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (state.mode === 'move') {
        updateCard(state.itemId, {
          x: Math.max(0, state.startItem.x + dx),
          y: Math.max(0, state.startItem.y + dy)
        });
        return;
      }
      updateCard(state.itemId, {
        w: Math.max(MIN_CARD_WIDTH, state.startItem.w + dx),
        h: Math.max(MIN_CARD_HEIGHT, state.startItem.h + dy)
      });
    };
    const onMouseUp = () => {
      interactionRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      interactionListenersRef.current = { move: null, up: null };
    };
    interactionListenersRef.current = { move: onMouseMove, up: onMouseUp };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [updateCard]);

  useEffect(() => () => {
    const listeners = interactionListenersRef.current;
    if (listeners.move) window.removeEventListener('mousemove', listeners.move);
    if (listeners.up) window.removeEventListener('mouseup', listeners.up);
  }, []);

  const handleDeleteCard = useCallback(async (itemId) => {
    if (!board?._id) return;
    const safeId = String(itemId);
    setItems(prev => prev.filter(item => String(item._id) !== safeId));
    setEdges(prev => prev.filter(edge => String(edge.fromItemId) !== safeId && String(edge.toItemId) !== safeId));
    if (activeCardId === safeId) setActiveCardId('');
    if (linkDraft?.fromItemId === safeId || linkDraft?.toItemId === safeId) setLinkDraft(null);
    try {
      await deleteBoardItem(board._id, itemId);
      setSaveError('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to delete card.');
      loadBoard();
    }
  }, [activeCardId, board?._id, linkDraft, loadBoard]);

  const handleCreateCard = useCallback(async ({ type, sourceId = '', text = '', x = 40, y = 40, role = 'idea' }) => {
    if (!board?._id) return;
    try {
      const created = await createBoardItem(board._id, {
        type,
        role,
        sourceId,
        text,
        x,
        y
      });
      setItems(prev => [...prev, created]);
      setActiveCardId(String(created?._id || ''));
      setSaveError('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to create card.');
    }
  }, [board?._id]);

  const handleChangeRole = useCallback(async (itemId, role) => {
    if (!board?._id) return;
    const safeRole = String(role || '').trim().toLowerCase();
    if (!CARD_ROLES.includes(safeRole)) return;
    setItems(prev => prev.map(item => (
      String(item._id) === String(itemId) ? { ...item, role: safeRole } : item
    )));
    try {
      const updated = await patchBoardItem(board._id, itemId, { role: safeRole });
      setItems(prev => prev.map(item => (
        String(item._id) === String(updated._id) ? { ...item, role: updated.role || safeRole } : item
      )));
      setSaveError('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to update card role.');
      loadBoard();
    }
  }, [board?._id, loadBoard]);

  const handleStartLink = useCallback((fromItemId) => {
    setActiveCardId(String(fromItemId));
    setPendingRelation('supports');
    setLinkDraft({ fromItemId: String(fromItemId), toItemId: '' });
  }, []);

  const handleSelectCard = useCallback((item) => {
    const itemId = String(item?._id || '');
    if (!itemId) return;
    setActiveCardId(itemId);
    setLinkDraft(prev => {
      if (!prev || !prev.fromItemId) return prev;
      if (String(prev.fromItemId) === itemId) return prev;
      return { ...prev, toItemId: itemId };
    });
  }, []);

  const handleCreateEdge = useCallback(async () => {
    if (!board?._id || !linkDraft?.fromItemId || !linkDraft?.toItemId) return;
    const payload = {
      fromItemId: linkDraft.fromItemId,
      toItemId: linkDraft.toItemId,
      relation: pendingRelation
    };
    try {
      const created = await createBoardEdge(board._id, payload);
      setEdges(prev => {
        const exists = prev.some(edge => String(edge._id) === String(created?._id));
        return exists ? prev : [...prev, created];
      });
      setLinkDraft(null);
      setSaveError('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to create link.');
    }
  }, [board?._id, linkDraft, pendingRelation]);

  const handleDeleteEdge = useCallback(async (edgeId) => {
    if (!board?._id) return;
    const safeEdgeId = String(edgeId || '');
    setEdges(prev => prev.filter(edge => String(edge._id) !== safeEdgeId));
    try {
      await deleteBoardEdge(board._id, safeEdgeId);
      setSaveError('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to delete link.');
      loadBoard();
    }
  }, [board?._id, loadBoard]);

  const handleAddTextCard = useCallback(async () => {
    const text = window.prompt('Card text');
    if (text === null) return;
    await handleCreateCard({ type: 'note', text: text.trim() || 'New note card', x: 56, y: 56, role: 'idea' });
  }, [handleCreateCard]);

  const onSourceDragStart = useCallback((event, payload) => {
    event.dataTransfer.setData(DRAG_DATA_TYPE, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'copy';
  }, []);

  const onCanvasDrop = useCallback(async (event) => {
    event.preventDefault();
    if (!board?._id || !canvasRef.current) return;
    const raw = event.dataTransfer.getData(DRAG_DATA_TYPE);
    if (!raw) return;
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!payload?.type) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, event.clientX - rect.left - 160);
    const y = Math.max(0, event.clientY - rect.top - 60);
    await handleCreateCard({
      type: payload.type,
      sourceId: payload.sourceId || '',
      text: payload.text || '',
      x,
      y,
      role: 'idea'
    });
  }, [board?._id, handleCreateCard]);

  const cards = useMemo(() => items.map(item => {
    const itemType = String(item.type || '').toLowerCase();
    const sourceId = String(item.sourceId || '');
    if (itemType === 'highlight') {
      const source = highlightsById.get(sourceId);
      return {
        ...item,
        title: source?.articleTitle || 'Highlight',
        meta: `${toRoleLabel(item.role)} • Highlight`,
        body: source?.text || item.text || ''
      };
    }
    if (itemType === 'article') {
      const source = articlesById.get(sourceId);
      return {
        ...item,
        title: source?.title || source?.url || 'Article',
        meta: `${toRoleLabel(item.role)} • Article`,
        body: item.text || source?.url || source?.title || ''
      };
    }
    const source = notesById.get(sourceId);
    return {
      ...item,
      title: source?.title || 'Note',
      meta: `${toRoleLabel(item.role)} • Note`,
      body: item.text || getNoteText(source) || ''
    };
  }), [articlesById, highlightsById, items, notesById]);

  const cardsById = useMemo(() => {
    const map = new Map();
    cards.forEach(card => map.set(String(card._id), card));
    return map;
  }, [cards]);

  const visibleEdges = useMemo(() => edges
    .map(edge => {
      const fromItem = cardsById.get(String(edge.fromItemId));
      const toItem = cardsById.get(String(edge.toItemId));
      if (!fromItem || !toItem) return null;
      return {
        ...edge,
        fromItem,
        toItem,
        x1: Number(fromItem.x || 0) + Number(fromItem.w || 0) / 2,
        y1: Number(fromItem.y || 0) + Number(fromItem.h || 0) / 2,
        x2: Number(toItem.x || 0) + Number(toItem.w || 0) / 2,
        y2: Number(toItem.y || 0) + Number(toItem.h || 0) / 2
      };
    })
    .filter(Boolean), [cardsById, edges]);

  const canvasSize = useMemo(() => {
    const maxX = cards.reduce((acc, item) => Math.max(acc, (item.x || 0) + (item.w || 0)), 0);
    const maxY = cards.reduce((acc, item) => Math.max(acc, (item.y || 0) + (item.h || 0)), 0);
    return {
      width: Math.max(1600, maxX + 180),
      height: Math.max(920, maxY + 180)
    };
  }, [cards]);

  const notes = useMemo(
    () => sources.notes.slice(0, 16).map(note => ({
      type: 'note',
      sourceId: note._id,
      title: note.title || 'Untitled note',
      text: toSnippet(getNoteText(note), 180)
    })),
    [sources.notes]
  );

  const highlights = useMemo(
    () => sources.highlights.slice(0, 24).map(highlight => ({
      type: 'highlight',
      sourceId: highlight._id,
      title: highlight.articleTitle || 'Highlight',
      text: toSnippet(highlight.text, 180)
    })),
    [sources.highlights]
  );

  const articles = useMemo(
    () => sources.articles.slice(0, 16).map(article => ({
      type: 'article',
      sourceId: article._id,
      title: article.title || 'Untitled article',
      text: toSnippet(article.url, 140)
    })),
    [sources.articles]
  );

  const activeCard = activeCardId ? cardsById.get(activeCardId) : null;

  const relatedEdges = useMemo(() => {
    if (!activeCardId) return [];
    return edges.filter(edge => (
      String(edge.fromItemId) === String(activeCardId) || String(edge.toItemId) === String(activeCardId)
    ));
  }, [activeCardId, edges]);

  const linkSource = linkDraft?.fromItemId ? cardsById.get(String(linkDraft.fromItemId)) : null;
  const linkTarget = linkDraft?.toItemId ? cardsById.get(String(linkDraft.toItemId)) : null;

  if (!safeScopeType || !safeScopeId) {
    return (
      <div className="studio-board studio-board--empty">
        <p className="muted">Select a concept or question to open its Studio Board.</p>
      </div>
    );
  }

  return (
    <div className="studio-board" data-testid="studio-board">
      <aside className="studio-board__library">
        <div className="studio-board__library-header">
          <h3>Studio Board</h3>
          <p className="muted small">{safeScopeType}: {safeScopeId}</p>
        </div>
        <button type="button" className="ui-quiet-button" onClick={handleAddTextCard}>
          Add text card
        </button>

        {activeCard && (
          <div className="studio-board__source-section">
            <p className="studio-board__source-title">Selected</p>
            <p className="studio-board__selected-card">{activeCard.title}</p>
            <div className="studio-board__edge-list">
              {relatedEdges.length === 0 ? (
                <p className="muted small">No links yet.</p>
              ) : (
                relatedEdges.map(edge => {
                  const isOutgoing = String(edge.fromItemId) === String(activeCardId);
                  const peerId = isOutgoing ? edge.toItemId : edge.fromItemId;
                  const peer = cardsById.get(String(peerId));
                  return (
                    <div key={edge._id} className="studio-board__edge-row">
                      <span>
                        {toRelationLabel(edge.relation)} {isOutgoing ? '->' : '<-'} {peer?.title || 'Card'}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        title="Delete link"
                        onClick={() => handleDeleteEdge(edge._id)}
                      >
                        x
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {loading && <p className="muted small">Loading board...</p>}
        {error && <p className="status-message error-message">{error}</p>}
        {saveError && <p className="status-message error-message">{saveError}</p>}
        {sourceLoading && <p className="muted small">Loading sources...</p>}
        {sourceError && <p className="status-message error-message">{sourceError}</p>}

        <div className="studio-board__source-section">
          <p className="studio-board__source-title">Notes</p>
          <div className="studio-board__source-list">
            {notes.map(item => (
              <button
                key={`note-${item.sourceId}`}
                type="button"
                className="studio-board__source-item"
                draggable
                onDragStart={(event) => onSourceDragStart(event, item)}
              >
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="studio-board__source-section">
          <p className="studio-board__source-title">Highlights</p>
          <div className="studio-board__source-list">
            {highlights.map(item => (
              <button
                key={`highlight-${item.sourceId}`}
                type="button"
                className="studio-board__source-item"
                draggable
                onDragStart={(event) => onSourceDragStart(event, item)}
              >
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="studio-board__source-section">
          <p className="studio-board__source-title">Articles</p>
          <div className="studio-board__source-list">
            {articles.map(item => (
              <button
                key={`article-${item.sourceId}`}
                type="button"
                className="studio-board__source-item"
                draggable
                onDragStart={(event) => onSourceDragStart(event, item)}
              >
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="studio-board__canvas-wrap">
        {linkDraft && (
          <div className="studio-board__link-banner">
            {!linkDraft.toItemId ? (
              <span>
                Link mode: select a target card for <strong>{linkSource?.title || 'card'}</strong>.
              </span>
            ) : (
              <>
                <span>
                  {linkSource?.title || 'Card'} -> {linkTarget?.title || 'Card'}
                </span>
                <select value={pendingRelation} onChange={(event) => setPendingRelation(event.target.value)}>
                  {RELATION_OPTIONS.map(relation => (
                    <option key={relation} value={relation}>{toRelationLabel(relation)}</option>
                  ))}
                </select>
                <button type="button" className="ui-quiet-button" onClick={handleCreateEdge}>Create link</button>
              </>
            )}
            <button type="button" className="icon-button" onClick={() => setLinkDraft(null)} title="Cancel link mode">
              x
            </button>
          </div>
        )}
        <div
          ref={canvasRef}
          className="studio-board__canvas"
          style={{ width: canvasSize.width, minHeight: canvasSize.height }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onCanvasDrop}
          onMouseDown={(event) => {
            if (event.target === canvasRef.current) {
              setActiveCardId('');
            }
          }}
        >
          <svg className="studio-board__edges" width={canvasSize.width} height={canvasSize.height}>
            {visibleEdges.map(edge => {
              const midX = (edge.x1 + edge.x2) / 2;
              const midY = (edge.y1 + edge.y2) / 2;
              return (
                <g key={edge._id || `${edge.fromItemId}-${edge.toItemId}-${edge.relation}`}>
                  <line
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    className={`studio-board__edge-line is-${edge.relation}`}
                  />
                  <text x={midX} y={midY} className="studio-board__edge-label">{toRelationLabel(edge.relation)}</text>
                </g>
              );
            })}
          </svg>

          {cards.map(item => (
            <StudioCard
              key={item._id}
              item={item}
              title={item.title}
              meta={item.meta}
              body={item.body}
              isSelected={String(item._id) === String(activeCardId)}
              isLinkSource={String(item._id) === String(linkDraft?.fromItemId || '')}
              isLinkTarget={String(item._id) === String(linkDraft?.toItemId || '')}
              linkTargetMode={Boolean(linkDraft?.fromItemId) && !linkDraft?.toItemId}
              onSelect={handleSelectCard}
              onStartMove={(event, targetItem) => beginInteraction(event, targetItem, 'move')}
              onStartResize={(event, targetItem) => beginInteraction(event, targetItem, 'resize')}
              onDelete={handleDeleteCard}
              onStartLink={handleStartLink}
              onChangeRole={handleChangeRole}
            />
          ))}
          {cards.length === 0 && !loading && (
            <div className="studio-board__empty-canvas">
              <p>Drag notes, highlights, or articles here to start mapping this idea.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudioBoard;
