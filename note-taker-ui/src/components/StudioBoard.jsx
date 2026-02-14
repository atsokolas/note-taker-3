import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { createBoardItem, deleteBoardItem, getBoardForScope, updateBoardItems } from '../api/boards';

const MIN_CARD_WIDTH = 220;
const MIN_CARD_HEIGHT = 140;
const DRAG_DATA_TYPE = 'application/x-studio-board-item';

const toSnippet = (value, limit = 180) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const getNoteText = (note) => {
  if (!note) return '';
  const blockText = Array.isArray(note.blocks)
    ? note.blocks.map(block => String(block?.text || '').trim()).filter(Boolean).join(' ')
    : '';
  return note.title || blockText || note.content || '';
};

const StudioCard = React.memo(({
  item,
  title,
  meta,
  body,
  onStartMove,
  onStartResize,
  onDelete
}) => (
  <article
    className="studio-board__card"
    style={{
      left: item.x,
      top: item.y,
      width: item.w,
      height: item.h
    }}
  >
    <header className="studio-board__card-header" onMouseDown={(event) => onStartMove(event, item)}>
      <div className="studio-board__card-title-wrap">
        <h4 className="studio-board__card-title">{title}</h4>
        <p className="studio-board__card-meta">{meta}</p>
      </div>
      <button type="button" className="icon-button" onClick={() => onDelete(item._id)} title="Delete card">
        ×
      </button>
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
));

const StudioBoard = ({ scopeType, scopeId }) => {
  const [board, setBoard] = useState(null);
  const [items, setItems] = useState([]);
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
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getBoardForScope(safeScopeType, safeScopeId);
      setBoard(data.board || null);
      setItems(Array.isArray(data.items) ? data.items : []);
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
    setItems(prev => prev.filter(item => String(item._id) !== String(itemId)));
    try {
      await deleteBoardItem(board._id, itemId);
      setSaveError('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to delete card.');
      loadBoard();
    }
  }, [board?._id, loadBoard]);

  const handleCreateCard = useCallback(async ({ type, sourceId = '', text = '', x = 40, y = 40 }) => {
    if (!board?._id) return;
    try {
      const created = await createBoardItem(board._id, {
        type,
        sourceId,
        text,
        x,
        y
      });
      setItems(prev => [...prev, created]);
      setSaveError('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to create card.');
    }
  }, [board?._id]);

  const handleAddTextCard = useCallback(async () => {
    const text = window.prompt('Card text');
    if (text === null) return;
    await handleCreateCard({ type: 'note', text: text.trim() || 'New note card', x: 56, y: 56 });
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
      y
    });
  }, [board?._id, handleCreateCard]);

  const canvasSize = useMemo(() => {
    const maxX = items.reduce((acc, item) => Math.max(acc, (item.x || 0) + (item.w || 0)), 0);
    const maxY = items.reduce((acc, item) => Math.max(acc, (item.y || 0) + (item.h || 0)), 0);
    return {
      width: Math.max(1600, maxX + 180),
      height: Math.max(920, maxY + 180)
    };
  }, [items]);

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

  const cards = useMemo(() => items.map(item => {
    const itemType = String(item.type || '').toLowerCase();
    const sourceId = String(item.sourceId || '');
    if (itemType === 'highlight') {
      const source = highlightsById.get(sourceId);
      return {
        ...item,
        title: source?.articleTitle || 'Highlight',
        meta: 'Highlight',
        body: source?.text || item.text || ''
      };
    }
    if (itemType === 'article') {
      const source = articlesById.get(sourceId);
      return {
        ...item,
        title: source?.title || source?.url || 'Article',
        meta: 'Article',
        body: item.text || source?.url || source?.title || ''
      };
    }
    const source = notesById.get(sourceId);
    return {
      ...item,
      title: source?.title || 'Note',
      meta: 'Note',
      body: item.text || getNoteText(source) || ''
    };
  }), [articlesById, highlightsById, items, notesById]);

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
        {loading && <p className="muted small">Loading board…</p>}
        {error && <p className="status-message error-message">{error}</p>}
        {saveError && <p className="status-message error-message">{saveError}</p>}
        {sourceLoading && <p className="muted small">Loading sources…</p>}
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
        <div
          ref={canvasRef}
          className="studio-board__canvas"
          style={{ width: canvasSize.width, minHeight: canvasSize.height }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onCanvasDrop}
        >
          {cards.map(item => (
            <StudioCard
              key={item._id}
              item={item}
              title={item.title}
              meta={item.meta}
              body={item.body}
              onStartMove={(event, targetItem) => beginInteraction(event, targetItem, 'move')}
              onStartResize={(event, targetItem) => beginInteraction(event, targetItem, 'resize')}
              onDelete={handleDeleteCard}
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
