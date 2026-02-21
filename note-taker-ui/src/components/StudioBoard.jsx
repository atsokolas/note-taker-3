import React, { Profiler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { createConnection } from '../api/connections';
import { createProfilerLogger, endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';

const MIN_CARD_WIDTH = 220;
const MIN_CARD_HEIGHT = 140;
const GRID_SIZE = 24;
const DRAG_DATA_TYPE = 'application/x-studio-board-item';
const CARD_ROLES = ['idea', 'claim', 'evidence'];
const RELATION_OPTIONS = ['supports', 'contradicts', 'explains', 'example'];
const MAP_CELL_WIDTH = 190;
const MAP_CELL_HEIGHT = 126;
const MAP_PADDING = 96;

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

const toMapLabel = (title) => {
  const text = String(title || '').trim();
  if (!text) return 'Card';
  return text.length > 32 ? `${text.slice(0, 32)}...` : text;
};

const formatMetaDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

const hashString = (value) => {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const createLocalBlockId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `block-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
};

const toConnectionSource = (card) => {
  const safeType = String(card?.sourceType || '').trim().toLowerCase();
  const safeSourceId = String(card?.sourceId || '').trim();
  if (!safeSourceId) return { fromType: '', fromId: '' };
  if (safeType === 'note') return { fromType: 'notebook', fromId: safeSourceId };
  if (safeType === 'highlight') return { fromType: 'highlight', fromId: safeSourceId };
  if (safeType === 'article') return { fromType: 'article', fromId: safeSourceId };
  return { fromType: '', fromId: '' };
};

const StudioCard = React.memo(({
  item,
  title,
  sourceLabel,
  meta,
  preview,
  isSelected,
  isLinkSource,
  isLinkTarget,
  linkTargetMode,
  onSelect,
  onStartMove,
  onStartResize,
  onDelete,
  onStartLink,
  onChangeRole,
  onOpenReader
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
      onDoubleClick={() => onOpenReader(item._id)}
    >
      <header className="studio-board__card-header" onMouseDown={(event) => onStartMove(event, item)}>
        <div className="studio-board__card-title-wrap">
          <h4 className="studio-board__card-title">{title}</h4>
          <p className="studio-board__card-label">{sourceLabel || 'Material'}</p>
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
          <button
            type="button"
            className="ui-quiet-button"
            onClick={() => onOpenReader(item._id)}
            title="Open reader"
          >
            Open
          </button>
          <button type="button" className="icon-button" onClick={() => onDelete(item._id)} title="Delete card">
            x
          </button>
        </div>
      </header>
      <div className="studio-board__card-body">
        {preview || 'No content'}
      </div>
      <div className="studio-board__card-footer">
        <button
          type="button"
          className="ui-quiet-button"
          onClick={() => onOpenReader(item._id)}
        >
          Open
        </button>
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
}, (prev, next) => (
  prev.item === next.item
  && prev.title === next.title
  && prev.sourceLabel === next.sourceLabel
  && prev.meta === next.meta
  && prev.preview === next.preview
  && prev.isSelected === next.isSelected
  && prev.isLinkSource === next.isLinkSource
  && prev.isLinkTarget === next.isLinkTarget
  && prev.linkTargetMode === next.linkTargetMode
));

const StudioBoard = ({ scopeType, scopeId, scopeLabel = '', embedded = false }) => {
  const [board, setBoard] = useState(null);
  const [items, setItems] = useState([]);
  const [edges, setEdges] = useState([]);
  const [viewMode, setViewMode] = useState('canvas');
  const [mapFocusId, setMapFocusId] = useState('');
  const [activeCardId, setActiveCardId] = useState('');
  const [readerCardId, setReaderCardId] = useState('');
  const [readerConceptId, setReaderConceptId] = useState('');
  const [readerStatus, setReaderStatus] = useState({ tone: '', message: '' });
  const [readerBusy, setReaderBusy] = useState(false);
  const [linkDraft, setLinkDraft] = useState(null);
  const [pendingRelation, setPendingRelation] = useState('supports');
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sources, setSources] = useState({ notes: [], highlights: [], articles: [], concepts: [] });
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const interactionListenersRef = useRef({ move: null, up: null });
  const persistTimerRef = useRef(null);
  const cardCacheRef = useRef(new Map());
  const readerCardRef = useRef(null);
  const renderStartRef = useRef(startPerfTimer());
  const hasLoggedRenderRef = useRef(false);
  const boardProfilerLogger = useMemo(() => createProfilerLogger('studio.board.render'), []);

  const safeScopeType = String(scopeType || '').trim().toLowerCase();
  const safeScopeId = String(scopeId || '').trim();
  const safeScopeLabel = String(scopeLabel || '').trim();
  const scopeDisplay = safeScopeLabel || safeScopeId;
  const inspectorStorageKey = useMemo(
    () => `ui.studioBoard.inspectorCollapsed:${embedded ? 'embedded' : 'default'}:${safeScopeType}:${safeScopeId}`,
    [embedded, safeScopeId, safeScopeType]
  );
  const snapStorageKey = useMemo(
    () => `ui.studioBoard.snapToGrid:${embedded ? 'embedded' : 'default'}:${safeScopeType}:${safeScopeId}`,
    [embedded, safeScopeId, safeScopeType]
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(inspectorStorageKey);
      setInspectorCollapsed(stored === 'true');
    } catch (loadError) {
      setInspectorCollapsed(false);
    }
  }, [inspectorStorageKey]);

  const persistInspectorCollapsed = useCallback((nextCollapsed) => {
    setInspectorCollapsed(nextCollapsed);
    try {
      localStorage.setItem(inspectorStorageKey, String(nextCollapsed));
    } catch (persistError) {
      // ignore localStorage write errors
    }
  }, [inspectorStorageKey]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(snapStorageKey);
      setSnapToGrid(stored === 'true');
    } catch (loadError) {
      setSnapToGrid(false);
    }
  }, [snapStorageKey]);

  const persistSnapToGrid = useCallback((nextValue) => {
    setSnapToGrid(nextValue);
    try {
      localStorage.setItem(snapStorageKey, String(nextValue));
    } catch (persistError) {
      // ignore localStorage write errors
    }
  }, [snapStorageKey]);

  const loadBoard = useCallback(async () => {
    if (!safeScopeType || !safeScopeId) {
      setBoard(null);
      setItems([]);
      setEdges([]);
      setActiveCardId('');
      setReaderCardId('');
      setLinkDraft(null);
      return;
    }
    const startedAt = startPerfTimer();
    setLoading(true);
    setError('');
    try {
      const data = await getBoardForScope(safeScopeType, safeScopeId);
      const nextBoard = data.board || null;
      const nextItems = Array.isArray(data.items) ? data.items : [];
      const nextEdges = Array.isArray(data.edges) ? data.edges : [];
      setBoard(nextBoard);
      setItems(nextItems);
      setEdges(nextEdges);
      setReaderCardId('');
      logPerf('studio.board.load', {
        scopeType: safeScopeType,
        scopeId: safeScopeId,
        itemCount: nextItems.length,
        edgeCount: nextEdges.length,
        durationMs: endPerfTimer(startedAt)
      });
      setSaveError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load workspace.');
    } finally {
      setLoading(false);
    }
  }, [safeScopeId, safeScopeType]);

  const loadSources = useCallback(async () => {
    setSourceLoading(true);
    setSourceError('');
    try {
      const [notesRes, highlightsRes, articlesRes, conceptsRes] = await Promise.all([
        api.get('/api/notebook', getAuthHeaders()),
        api.get('/api/highlights/all', getAuthHeaders()),
        api.get('/get-articles', getAuthHeaders()),
        api.get('/api/concepts', getAuthHeaders())
      ]);
      setSources({
        notes: Array.isArray(notesRes.data) ? notesRes.data : [],
        highlights: Array.isArray(highlightsRes.data) ? highlightsRes.data : [],
        articles: Array.isArray(articlesRes.data) ? articlesRes.data : [],
        concepts: Array.isArray(conceptsRes.data) ? conceptsRes.data : []
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
    renderStartRef.current = startPerfTimer();
    hasLoggedRenderRef.current = false;
  }, [safeScopeId, safeScopeType]);

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
        setSaveError(err.response?.data?.error || 'Failed to save workspace layout.');
      }
    }, 500);
  }, [board?._id]);

  useEffect(() => () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  }, []);

  const updateCard = useCallback((itemId, patch, { persist = true } = {}) => {
    setItems(prev => {
      let changed = false;
      const next = prev.map(item => {
        if (String(item._id) !== String(itemId)) return item;
        const keys = Object.keys(patch || {});
        const isSame = keys.every(key => Number(item[key]) === Number(patch[key]) || item[key] === patch[key]);
        if (isSame) return item;
        changed = true;
        return { ...item, ...patch };
      });
      if (changed && persist) persistLayout(next);
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
      pendingDx: 0,
      pendingDy: 0,
      rafId: 0,
      startItem: {
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        w: Number(item.w) || MIN_CARD_WIDTH,
        h: Number(item.h) || MIN_CARD_HEIGHT
      }
    };
    const applyPending = () => {
      const state = interactionRef.current;
      if (!state) return;
      state.rafId = 0;
      const dx = state.pendingDx;
      const dy = state.pendingDy;
      const snapValue = (value) => (
        snapToGrid ? Math.round(value / GRID_SIZE) * GRID_SIZE : value
      );
      if (state.mode === 'move') {
        updateCard(state.itemId, {
          x: Math.max(0, snapValue(state.startItem.x + dx)),
          y: Math.max(0, snapValue(state.startItem.y + dy))
        });
        return;
      }
      updateCard(state.itemId, {
        w: Math.max(MIN_CARD_WIDTH, snapValue(state.startItem.w + dx)),
        h: Math.max(MIN_CARD_HEIGHT, snapValue(state.startItem.h + dy))
      });
    };
    const onMouseMove = (moveEvent) => {
      const state = interactionRef.current;
      if (!state) return;
      state.pendingDx = moveEvent.clientX - state.startX;
      state.pendingDy = moveEvent.clientY - state.startY;
      if (!state.rafId) {
        state.rafId = window.requestAnimationFrame(applyPending);
      }
    };
    const onMouseUp = () => {
      const state = interactionRef.current;
      if (state?.rafId) {
        window.cancelAnimationFrame(state.rafId);
      }
      applyPending();
      interactionRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      interactionListenersRef.current = { move: null, up: null };
    };
    interactionListenersRef.current = { move: onMouseMove, up: onMouseUp };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [snapToGrid, updateCard]);

  useEffect(() => () => {
    const listeners = interactionListenersRef.current;
    if (listeners.move) window.removeEventListener('mousemove', listeners.move);
    if (listeners.up) window.removeEventListener('mouseup', listeners.up);
    const state = interactionRef.current;
    if (state?.rafId) {
      window.cancelAnimationFrame(state.rafId);
    }
  }, []);

  const handleDeleteCard = useCallback(async (itemId) => {
    if (!board?._id) return;
    const safeId = String(itemId);
    setItems(prev => prev.filter(item => String(item._id) !== safeId));
    setEdges(prev => prev.filter(edge => String(edge.fromItemId) !== safeId && String(edge.toItemId) !== safeId));
    if (activeCardId === safeId) setActiveCardId('');
    if (readerCardId === safeId) setReaderCardId('');
    if (linkDraft?.fromItemId === safeId || linkDraft?.toItemId === safeId) setLinkDraft(null);
    try {
      await deleteBoardItem(board._id, itemId);
      setSaveError('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to delete card.');
      loadBoard();
    }
  }, [activeCardId, board?._id, linkDraft, loadBoard, readerCardId]);

  const handleCreateCard = useCallback(async ({ type, sourceId = '', text = '', x = 40, y = 40, role = 'idea' }) => {
    if (!board?._id) return;
    const snapValue = (value) => (
      snapToGrid ? Math.round(Number(value || 0) / GRID_SIZE) * GRID_SIZE : Number(value || 0)
    );
    try {
      const created = await createBoardItem(board._id, {
        type,
        role,
        sourceId,
        text,
        x: snapValue(x),
        y: snapValue(y)
      });
      setItems(prev => [...prev, created]);
      setActiveCardId(String(created?._id || ''));
      setSaveError('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to create card.');
    }
  }, [board?._id, snapToGrid]);

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

  const handleTidyLayout = useCallback(() => {
    setItems(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const viewportWidth = Math.max(760, Number(canvasRef.current?.clientWidth || 1200));
      const cardWidth = Math.max(MIN_CARD_WIDTH, 280);
      const spacingX = 52;
      const spacingY = 42;
      const startX = 56;
      const startY = 56;
      const maxCols = Math.max(1, Math.floor((viewportWidth - startX * 2) / (cardWidth + spacingX)));
      const ordered = [...prev].sort((a, b) => {
        const ay = Number(a.y || 0);
        const by = Number(b.y || 0);
        if (ay !== by) return ay - by;
        return Number(a.x || 0) - Number(b.x || 0);
      });
      const positionsById = new Map();
      ordered.forEach((item, index) => {
        const col = index % maxCols;
        const row = Math.floor(index / maxCols);
        const height = Math.max(MIN_CARD_HEIGHT, Number(item.h || MIN_CARD_HEIGHT));
        const baseX = startX + (col * (cardWidth + spacingX));
        const baseY = startY + (row * (height + spacingY));
        const tidyX = snapToGrid ? Math.round(baseX / GRID_SIZE) * GRID_SIZE : baseX;
        const tidyY = snapToGrid ? Math.round(baseY / GRID_SIZE) * GRID_SIZE : baseY;
        positionsById.set(String(item._id), { x: tidyX, y: tidyY });
      });
      let changed = false;
      const next = prev.map(item => {
        const nextPos = positionsById.get(String(item._id));
        if (!nextPos) return item;
        const sameX = Number(item.x || 0) === Number(nextPos.x || 0);
        const sameY = Number(item.y || 0) === Number(nextPos.y || 0);
        if (sameX && sameY) return item;
        changed = true;
        return { ...item, x: nextPos.x, y: nextPos.y };
      });
      if (changed) {
        persistLayout(next);
      }
      return changed ? next : prev;
    });
  }, [persistLayout, snapToGrid]);

  const handleOpenReader = useCallback((itemId) => {
    const safeId = String(itemId || '');
    if (!safeId) return;
    setReaderCardId(safeId);
    setActiveCardId(safeId);
  }, []);

  const handlePromoteReaderCard = useCallback(async () => {
    const currentReaderCard = readerCardRef.current;
    if (!currentReaderCard) return;
    const bodyText = String(currentReaderCard.body || '').trim();
    if (!bodyText) {
      setReaderStatus({ tone: 'error', message: 'Nothing to promote from this card.' });
      return;
    }
    setReaderBusy(true);
    try {
      await api.post('/api/notebook', {
        title: String(currentReaderCard.title || 'Workspace extract').slice(0, 140),
        content: bodyText,
        blocks: [{
          id: createLocalBlockId(),
          type: 'paragraph',
          text: bodyText.slice(0, 1200)
        }],
        tags: Array.isArray(currentReaderCard.tags) ? currentReaderCard.tags.slice(0, 20) : []
      }, getAuthHeaders());
      setReaderStatus({ tone: 'success', message: 'Promoted to notebook.' });
    } catch (promoteError) {
      setReaderStatus({
        tone: 'error',
        message: promoteError?.response?.data?.error || 'Failed to promote card.'
      });
    } finally {
      setReaderBusy(false);
    }
  }, []);

  const handleLinkReaderCardToConcept = useCallback(async () => {
    const currentReaderCard = readerCardRef.current;
    if (!currentReaderCard) return;
    if (!readerConceptId) {
      setReaderStatus({ tone: 'error', message: 'Select a concept first.' });
      return;
    }
    const source = toConnectionSource(currentReaderCard);
    if (!source.fromType || !source.fromId) {
      setReaderStatus({
        tone: 'error',
        message: 'Only source-backed cards can be linked to concepts.'
      });
      return;
    }
    setReaderBusy(true);
    try {
      await createConnection({
        fromType: source.fromType,
        fromId: source.fromId,
        toType: 'concept',
        toId: readerConceptId,
        relationType: 'related',
        scopeType: safeScopeType,
        scopeId: safeScopeId
      });
      setReaderStatus({ tone: 'success', message: 'Linked to concept.' });
    } catch (linkError) {
      const status = Number(linkError?.response?.status || 0);
      setReaderStatus({
        tone: status === 409 ? 'success' : 'error',
        message: status === 409
          ? 'Concept link already exists.'
          : (linkError?.response?.data?.error || 'Failed to link concept.')
      });
    } finally {
      setReaderBusy(false);
    }
  }, [readerConceptId, safeScopeId, safeScopeType]);

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
    const snapValue = (value) => (
      snapToGrid ? Math.round(value / GRID_SIZE) * GRID_SIZE : value
    );
    const x = Math.max(0, snapValue(event.clientX - rect.left - 160));
    const y = Math.max(0, snapValue(event.clientY - rect.top - 60));
    await handleCreateCard({
      type: payload.type,
      sourceId: payload.sourceId || '',
      text: payload.text || '',
      x,
      y,
      role: 'idea'
    });
  }, [board?._id, handleCreateCard, snapToGrid]);

  const cards = useMemo(() => {
    const nextCache = new Map();
    const nextCards = items.map(item => {
      const itemId = String(item._id);
      const itemType = String(item.type || '').toLowerCase();
      const sourceId = String(item.sourceId || '');
      let source = null;
      if (itemType === 'highlight') source = highlightsById.get(sourceId) || null;
      if (itemType === 'article') source = articlesById.get(sourceId) || null;
      if (itemType === 'note') source = notesById.get(sourceId) || null;

      const cached = cardCacheRef.current.get(itemId);
      if (cached && cached.itemRef === item && cached.sourceRef === source) {
        nextCache.set(itemId, cached);
        return cached.model;
      }

      const roleLabel = toRoleLabel(item.role);
      let title = 'Card';
      let sourceLabel = 'Material';
      let body = String(item.text || '').trim();
      let sourceMeta = '';
      let tags = [];
      if (itemType === 'highlight') {
        title = source?.articleTitle || 'Highlight';
        sourceLabel = 'Highlight';
        body = source?.text || body;
        sourceMeta = source?.articleTitle || '';
        tags = Array.isArray(source?.tags) ? source.tags : [];
      } else if (itemType === 'article') {
        title = source?.title || source?.url || 'Article';
        sourceLabel = 'Article';
        body = body || source?.url || source?.title || '';
        sourceMeta = source?.url || '';
        tags = Array.isArray(source?.tags) ? source.tags : [];
      } else {
        title = source?.title || 'Note';
        sourceLabel = 'Note';
        body = body || getNoteText(source) || '';
        sourceMeta = formatMetaDate(source?.updatedAt || source?.createdAt || '');
        tags = Array.isArray(source?.tags) ? source.tags : [];
      }

      const model = {
        ...item,
        title,
        sourceLabel,
        meta: `${roleLabel} • ${sourceLabel}`,
        sourceMeta,
        sourceType: itemType,
        sourceId,
        tags,
        body,
        preview: toSnippet(body, 420)
      };
      nextCache.set(itemId, {
        itemRef: item,
        sourceRef: source,
        model
      });
      return model;
    });
    cardCacheRef.current = nextCache;
    return nextCards;
  }, [articlesById, highlightsById, items, notesById]);

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

  const mapLayout = useMemo(() => {
    const count = cards.length;
    if (count === 0) {
      return { width: 960, height: 620, nodes: [], edges: [] };
    }

    const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.35)));
    const rows = Math.ceil(count / cols);
    const width = Math.max(960, MAP_PADDING * 2 + (cols - 1) * MAP_CELL_WIDTH + 220);
    const height = Math.max(620, MAP_PADDING * 2 + (rows - 1) * MAP_CELL_HEIGHT + 180);

    const nodes = cards.map((card, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const seed = hashString(card._id);
      const jitterX = (seed % 19) - 9;
      const jitterY = ((Math.floor(seed / 29)) % 19) - 9;
      return {
        ...card,
        mapX: MAP_PADDING + (col * MAP_CELL_WIDTH) + jitterX,
        mapY: MAP_PADDING + (row * MAP_CELL_HEIGHT) + jitterY
      };
    });

    const nodeMap = new Map(nodes.map(node => [String(node._id), node]));
    const edgeRows = edges
      .map(edge => {
        const fromNode = nodeMap.get(String(edge.fromItemId));
        const toNode = nodeMap.get(String(edge.toItemId));
        if (!fromNode || !toNode) return null;
        return {
          ...edge,
          fromNode,
          toNode
        };
      })
      .filter(Boolean);

    return { width, height, nodes, edges: edgeRows };
  }, [cards, edges]);

  const mapFocusSet = useMemo(() => {
    if (!mapFocusId) return null;
    const focus = new Set([String(mapFocusId)]);
    edges.forEach(edge => {
      const fromId = String(edge.fromItemId);
      const toId = String(edge.toItemId);
      if (fromId === String(mapFocusId)) focus.add(toId);
      if (toId === String(mapFocusId)) focus.add(fromId);
    });
    return focus;
  }, [edges, mapFocusId]);

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

  const conceptOptions = useMemo(() => (
    (Array.isArray(sources.concepts) ? sources.concepts : [])
      .map(concept => ({
        id: String(concept?._id || ''),
        name: String(concept?.name || '').trim()
      }))
      .filter(option => option.id && option.name)
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [sources.concepts]);

  const activeCard = activeCardId ? cardsById.get(activeCardId) : null;
  const readerCard = readerCardId ? cardsById.get(String(readerCardId)) : null;

  useEffect(() => {
    readerCardRef.current = readerCard || null;
  }, [readerCard]);

  const relatedEdges = useMemo(() => {
    if (!activeCardId) return [];
    return edges.filter(edge => (
      String(edge.fromItemId) === String(activeCardId) || String(edge.toItemId) === String(activeCardId)
    ));
  }, [activeCardId, edges]);

  const linkSource = linkDraft?.fromItemId ? cardsById.get(String(linkDraft.fromItemId)) : null;
  const linkTarget = linkDraft?.toItemId ? cardsById.get(String(linkDraft.toItemId)) : null;

  useEffect(() => {
    if (viewMode !== 'canvas' && linkDraft) {
      setLinkDraft(null);
    }
  }, [linkDraft, viewMode]);

  useEffect(() => {
    if (!readerCardId) {
      setReaderStatus({ tone: '', message: '' });
      return;
    }
    const conceptInScope = conceptOptions.find(option => (
      safeScopeType === 'concept' && String(option.id) === String(safeScopeId)
    ));
    const fallback = conceptInScope || conceptOptions[0] || null;
    setReaderConceptId(fallback?.id || '');
    setReaderStatus({ tone: '', message: '' });
  }, [conceptOptions, readerCardId, safeScopeId, safeScopeType]);

  useEffect(() => {
    if (!readerStatus.message) return undefined;
    const timer = window.setTimeout(() => {
      setReaderStatus({ tone: '', message: '' });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [readerStatus.message]);

  useEffect(() => {
    if (!readerCardId) return;
    if (!cardsById.has(String(readerCardId))) {
      setReaderCardId('');
    }
  }, [cardsById, readerCardId]);

  useEffect(() => {
    if (!mapFocusId) return;
    if (!cardsById.has(String(mapFocusId))) {
      setMapFocusId('');
    }
  }, [cardsById, mapFocusId]);

  useEffect(() => {
    if (loading || hasLoggedRenderRef.current) return;
    hasLoggedRenderRef.current = true;
    logPerf('studio.board.first-render', {
      scopeType: safeScopeType,
      scopeId: safeScopeId,
      itemCount: cards.length,
      durationMs: endPerfTimer(renderStartRef.current)
    });
  }, [cards.length, loading, safeScopeId, safeScopeType]);

  if (!safeScopeType || !safeScopeId) {
    return (
      <div className="studio-board studio-board--empty">
        <p className="muted">Select a concept or question to open its workspace.</p>
      </div>
    );
  }

  return (
    <Profiler id="StudioBoardTree" onRender={boardProfilerLogger}>
      <div
        className={`studio-board ${embedded ? 'studio-board--embedded' : ''} ${inspectorCollapsed ? 'is-inspector-collapsed' : ''}`}
        data-testid="studio-board"
      >
        <aside className="studio-board__library">
          <div className="studio-board__library-header">
            <h3>Materials Tray</h3>
            <p className="muted small">{safeScopeType}: {scopeDisplay}</p>
          </div>
          <button type="button" className="ui-quiet-button" onClick={handleAddTextCard}>
            Add text card
          </button>

          {loading && <p className="muted small">Loading workspace...</p>}
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
          <div className="studio-board__toolbar">
            <div className="studio-board__view-toggle" role="tablist" aria-label="Workspace view mode">
              <button
                type="button"
                className={`studio-board__view-button ${viewMode === 'canvas' ? 'is-active' : ''}`}
                onClick={() => setViewMode('canvas')}
                role="tab"
                aria-selected={viewMode === 'canvas'}
              >
                Canvas
              </button>
              <button
                type="button"
                className={`studio-board__view-button ${viewMode === 'map' ? 'is-active' : ''}`}
                onClick={() => setViewMode('map')}
                role="tab"
                aria-selected={viewMode === 'map'}
              >
                Map
              </button>
            </div>
            <div className="studio-board__toolbar-actions">
              <button
                type="button"
                className={`studio-board__toggle ${snapToGrid ? 'is-active' : ''}`}
                onClick={() => persistSnapToGrid(!snapToGrid)}
                aria-pressed={snapToGrid}
              >
                Snap to Grid
              </button>
              <button
                type="button"
                className="ui-quiet-button"
                onClick={handleTidyLayout}
                disabled={items.length < 2}
              >
                Tidy
              </button>
              <button
                type="button"
                className="ui-quiet-button"
                onClick={() => persistInspectorCollapsed(!inspectorCollapsed)}
              >
                {inspectorCollapsed ? 'Show Context' : 'Hide Context'}
              </button>
            </div>
          </div>

          {viewMode === 'canvas' && linkDraft && (
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
          {viewMode === 'canvas' ? (
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
                  sourceLabel={item.sourceLabel}
                  meta={item.meta}
                  preview={item.preview}
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
                  onOpenReader={handleOpenReader}
                />
              ))}
              {cards.length === 0 && !loading && (
                <div className="studio-board__empty-canvas">
                  <p>Drag notes, highlights, or articles here to start mapping this idea.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="studio-board__map-wrap">
              <svg className="studio-board__map" width={mapLayout.width} height={mapLayout.height}>
                {mapLayout.edges.map(edge => {
                  const fromId = String(edge.fromNode._id);
                  const toId = String(edge.toNode._id);
                  const hasFocus = Boolean(mapFocusSet);
                  const isFocusEdge = !hasFocus || mapFocusSet.has(fromId) || mapFocusSet.has(toId);
                  return (
                    <g key={`map-${edge._id || `${fromId}-${toId}-${edge.relation}`}`}>
                      <line
                        x1={edge.fromNode.mapX}
                        y1={edge.fromNode.mapY}
                        x2={edge.toNode.mapX}
                        y2={edge.toNode.mapY}
                        className={`studio-board__map-edge is-${edge.relation} ${isFocusEdge ? '' : 'is-dim'}`}
                      />
                    </g>
                  );
                })}

                {mapLayout.nodes.map(node => {
                  const nodeId = String(node._id);
                  const isFocused = nodeId === String(mapFocusId);
                  const hasFocus = Boolean(mapFocusSet);
                  const isVisible = !hasFocus || mapFocusSet.has(nodeId);
                  return (
                    <g
                      key={`map-node-${nodeId}`}
                      className={`studio-board__map-node ${isFocused ? 'is-focus' : ''} ${isVisible ? '' : 'is-dim'}`}
                      transform={`translate(${node.mapX}, ${node.mapY})`}
                      onClick={() => {
                        setMapFocusId(current => (String(current) === nodeId ? '' : nodeId));
                        setActiveCardId(nodeId);
                      }}
                    >
                      <circle r="15" />
                      <text dy="28">{toMapLabel(node.title)}</text>
                    </g>
                  );
                })}
              </svg>
              {mapLayout.nodes.length === 0 && !loading && (
                <div className="studio-board__empty-canvas">
                  <p>No nodes yet. Add cards in Canvas view.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {!inspectorCollapsed && (
          <aside className="studio-board__inspector">
            <div className="studio-board__inspector-header">
              <h3>Context</h3>
              <button
                type="button"
                className="ui-quiet-button"
                onClick={() => persistInspectorCollapsed(true)}
              >
                Collapse
              </button>
            </div>
            {!activeCard && (
              <div className="studio-board__inspector-empty">
                <p className="muted small">Select a card to inspect details and links.</p>
                {edges.length === 0 && (
                  <p className="muted small">Connections will appear here once cards are linked.</p>
                )}
              </div>
            )}
            {activeCard && (
              <div className="studio-board__inspector-content">
                <p className="studio-board__selected-card">{activeCard.title}</p>
                <p className="studio-board__inspector-meta">{activeCard.meta}</p>
                <div className="studio-board__inspector-actions">
                  <button type="button" className="ui-quiet-button" onClick={() => handleOpenReader(activeCard._id)}>
                    Open reader
                  </button>
                  <button type="button" className="ui-quiet-button" onClick={() => handleStartLink(activeCard._id)}>
                    Link from selected
                  </button>
                </div>
                <div className="studio-board__inspector-preview">
                  {toSnippet(activeCard.body, 380) || 'No content'}
                </div>
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
          </aside>
        )}
      </div>
      {readerCard && (
        <div
          className="studio-board__reader-overlay"
          onClick={() => {
            setReaderBusy(false);
            setReaderCardId('');
          }}
          role="presentation"
        >
          <article
            className="studio-board__reader"
            role="dialog"
            aria-modal="true"
            aria-label="Card reader"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="studio-board__reader-header">
              <div>
                <p className="studio-board__reader-kicker">{readerCard.meta}</p>
                <h3>{readerCard.title}</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setReaderBusy(false);
                  setReaderCardId('');
                }}
                title="Close reader"
              >
                x
              </button>
            </header>
            <div className="studio-board__reader-meta">
              <p>
                <strong>Source:</strong> {readerCard.sourceLabel || 'Material'}
              </p>
              {readerCard.sourceMeta && (
                <p>
                  <strong>Reference:</strong> {readerCard.sourceMeta}
                </p>
              )}
              <div className="studio-board__reader-tags">
                {(readerCard.tags || []).length === 0 ? (
                  <span className="muted small">No tags</span>
                ) : (
                  readerCard.tags.slice(0, 8).map(tag => (
                    <span key={`${readerCard._id}-${tag}`} className="studio-board__reader-tag">{tag}</span>
                  ))
                )}
              </div>
            </div>
            <div className="studio-board__reader-actions">
              <button
                type="button"
                className="ui-quiet-button"
                onClick={handlePromoteReaderCard}
                disabled={readerBusy}
              >
                Promote to Notebook
              </button>
              <div className="studio-board__reader-link">
                <select
                  value={readerConceptId}
                  onChange={(event) => setReaderConceptId(event.target.value)}
                  disabled={readerBusy || conceptOptions.length === 0}
                >
                  <option value="">Select concept</option>
                  {conceptOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ui-quiet-button"
                  onClick={handleLinkReaderCardToConcept}
                  disabled={readerBusy || !readerConceptId}
                >
                  Link to Concept
                </button>
              </div>
            </div>
            {readerStatus.message && (
              <p className={`status-message ${readerStatus.tone === 'error' ? 'error-message' : 'success-message'}`}>
                {readerStatus.message}
              </p>
            )}
            <div className="studio-board__reader-body">
              {readerCard.body || 'No content'}
            </div>
          </article>
        </div>
      )}
    </Profiler>
  );
};

export default StudioBoard;
