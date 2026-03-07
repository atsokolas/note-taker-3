import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import {
  attachConceptWorkspaceBlock,
  buildConceptWorkspaceFromLibrary
} from '../../../api/concepts';
import useArticles from '../../../hooks/useArticles';
import useConceptMaterial from '../../../hooks/useConceptMaterial';
import useConceptWorkspace from '../../../hooks/useConceptWorkspace';
import useHighlightsQuery from '../../../hooks/useHighlightsQuery';
import { Button, SectionHeader } from '../../ui';

const STAGE_FLOW = ['inbox', 'working', 'draft', 'archive'];
const STAGE_LABELS = {
  inbox: 'Inbox',
  working: 'Working',
  draft: 'Draft',
  archive: 'Archive'
};
const STAGE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'working', label: 'Working' },
  { value: 'draft', label: 'Draft' },
  { value: 'archive', label: 'Archive' }
];
const DRAWER_TABS = [
  { value: 'highlights', label: 'Highlights' },
  { value: 'articles', label: 'Articles' }
];
const DRAWER_FILTERS = [
  { value: 'recent', label: 'Recent' },
  { value: 'all', label: 'All' },
  { value: 'attached', label: 'Attached' }
];

const ITEM_PREFIX = 'outline-item:';
const STAGE_DROP_PREFIX = 'outline-stage:';
const DRAWER_WINDOW_SIZE = 50;
const LEGACY_STAGE_MAP = {
  claim: 'draft',
  evidence: 'draft'
};
const TYPE_ICON = {
  highlight: '✦',
  article: '▤',
  note: '✎',
  question: '?'
};
const EMPTY_ITEMS = [];

const createId = (prefix = 'id') => (
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Math.random().toString(36).slice(2, 9)}-${Date.now()}`}`
);

const toItemSortableId = (itemId) => `${ITEM_PREFIX}${itemId}`;
const fromItemSortableId = (value) => (
  String(value || '').startsWith(ITEM_PREFIX)
    ? String(value).slice(ITEM_PREFIX.length)
    : ''
);
const toStageDropId = (stage) => `${STAGE_DROP_PREFIX}${stage}`;
const fromStageDropId = (value) => (
  String(value || '').startsWith(STAGE_DROP_PREFIX)
    ? String(value).slice(STAGE_DROP_PREFIX.length)
    : ''
);

const clean = (value) => String(value || '').trim();
const safeOrder = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};
const normalizeStage = (value, fallback = 'working') => {
  const raw = clean(value).toLowerCase();
  const stage = LEGACY_STAGE_MAP[raw] || raw;
  return STAGE_FLOW.includes(stage) ? stage : fallback;
};
const normalizeStatus = (value, fallback = 'active') => {
  const status = clean(value).toLowerCase();
  return status === 'archived' ? 'archived' : fallback;
};
const stripHtml = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);
const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
};

const defaultOutlineSections = () => STAGE_FLOW.map((stage, order) => ({
  id: stage,
  title: STAGE_LABELS[stage],
  description: '',
  collapsed: stage === 'draft' || stage === 'archive',
  order
}));

const toLegacyShape = (workspace) => ({
  ...workspace,
  groups: (workspace.outlineSections || []).map(section => ({
    id: section.id,
    title: section.title,
    description: section.description,
    collapsed: Boolean(section.collapsed),
    order: safeOrder(section.order)
  })),
  items: (workspace.attachedItems || []).map(item => ({
    id: item.id,
    type: item.type,
    refId: item.refId,
    groupId: item.sectionId || item.groupId || item.stage,
    parentId: item.parentId || '',
    inlineTitle: item.inlineTitle || '',
    inlineText: item.inlineText || '',
    stage: item.stage,
    status: item.status,
    order: safeOrder(item.order)
  }))
});

const normalizeWorkspace = (workspaceInput = {}) => {
  const source = workspaceInput && typeof workspaceInput === 'object' ? workspaceInput : {};

  const sectionsRaw = Array.isArray(source.outlineSections)
    ? source.outlineSections
    : (Array.isArray(source.groups) ? source.groups : []);

  const sectionMap = new Map();
  sectionsRaw.forEach((raw, index) => {
    if (!raw) return;
    const id = clean(raw.id);
    if (!id || sectionMap.has(id)) return;
    sectionMap.set(id, {
      id,
      title: clean(raw.title) || STAGE_LABELS[id] || `Section ${index + 1}`,
      description: clean(raw.description),
      collapsed: Boolean(raw.collapsed),
      order: safeOrder(raw.order, index)
    });
  });

  defaultOutlineSections().forEach((section) => {
    if (!sectionMap.has(section.id)) {
      sectionMap.set(section.id, section);
    }
  });

  const outlineSections = Array.from(sectionMap.values())
    .sort((a, b) => safeOrder(a.order) - safeOrder(b.order))
    .map((section, index) => ({ ...section, order: index }));

  const sectionIds = new Set(outlineSections.map(section => section.id));

  const itemsRaw = Array.isArray(source.attachedItems)
    ? source.attachedItems
    : (Array.isArray(source.items) ? source.items : []);

  const seenIds = new Set();
  const attachedItems = itemsRaw
    .map((raw, index) => {
      if (!raw) return null;
      const type = clean(raw.type).toLowerCase();
      if (!['highlight', 'article', 'note', 'question'].includes(type)) return null;
      const refId = clean(raw.refId);
      if (!refId) return null;

      const status = normalizeStatus(raw.status, 'active');
      const fallbackStage = status === 'archived' ? 'archive' : 'working';
      const stage = normalizeStage(raw.stage, fallbackStage);

      const requestedSectionId = clean(raw.sectionId || raw.groupId) || stage;
      const sectionId = sectionIds.has(requestedSectionId)
        ? requestedSectionId
        : (sectionIds.has(stage) ? stage : outlineSections[0]?.id || 'working');

      let id = clean(raw.id) || createId('item');
      while (seenIds.has(id)) {
        id = createId('item');
      }
      seenIds.add(id);

      return {
        id,
        type,
        refId,
        sectionId,
        groupId: sectionId,
        parentId: '',
        inlineTitle: clean(raw.inlineTitle).slice(0, 160),
        inlineText: clean(raw.inlineText),
        stage,
        status: stage === 'archive' ? 'archived' : status,
        order: safeOrder(raw.order, index)
      };
    })
    .filter(Boolean)
    .sort((a, b) => safeOrder(a.order) - safeOrder(b.order));

  const stageBuckets = new Map();
  STAGE_FLOW.forEach(stage => stageBuckets.set(stage, []));
  attachedItems.forEach((item) => {
    const stage = normalizeStage(item.stage, 'working');
    if (!stageBuckets.has(stage)) stageBuckets.set(stage, []);
    stageBuckets.get(stage).push(item);
  });

  const normalizedItems = [];
  STAGE_FLOW.forEach((stage) => {
    const bucket = (stageBuckets.get(stage) || []).sort((a, b) => safeOrder(a.order) - safeOrder(b.order));
    bucket.forEach((item, index) => {
      const nextSectionId = sectionIds.has(item.sectionId)
        ? item.sectionId
        : (sectionIds.has(stage) ? stage : outlineSections[0]?.id || 'working');
      normalizedItems.push({
        ...item,
        sectionId: nextSectionId,
        groupId: nextSectionId,
        stage,
        status: stage === 'archive' ? 'archived' : 'active',
        order: index
      });
    });
  });

  return toLegacyShape({
    version: 1,
    outlineSections,
    attachedItems: normalizedItems,
    updatedAt: new Date().toISOString()
  });
};

const resolveMaterialMeta = (item, refMap) => {
  const safeType = clean(item?.type).toLowerCase() || 'item';
  const safeRefId = clean(item?.refId);
  const key = `${safeType}:${safeRefId}`;
  const found = refMap.get(key);
  if (found) return found;
  return {
    title: `${safeType.charAt(0).toUpperCase()}${safeType.slice(1)}`,
    snippet: safeRefId,
    chips: [safeType],
    dateLabel: ''
  };
};

const moveAttachedItem = (itemsInput, itemId, targetStage, targetIndex = null) => {
  const items = Array.isArray(itemsInput) ? itemsInput.map(item => ({ ...item })) : [];
  const stageBuckets = new Map();
  STAGE_FLOW.forEach(stage => stageBuckets.set(stage, []));

  let moving = null;
  items.forEach((item) => {
    const stage = normalizeStage(item.stage, 'working');
    if (item.id === itemId) {
      moving = { ...item };
      return;
    }
    if (!stageBuckets.has(stage)) stageBuckets.set(stage, []);
    stageBuckets.get(stage).push({ ...item, stage });
  });

  if (!moving) return itemsInput;

  const safeStage = normalizeStage(targetStage, normalizeStage(moving.stage, 'working'));
  if (!stageBuckets.has(safeStage)) stageBuckets.set(safeStage, []);

  const targetBucket = stageBuckets.get(safeStage).sort((a, b) => safeOrder(a.order) - safeOrder(b.order));
  const insertAt = targetIndex === null
    ? targetBucket.length
    : Math.max(0, Math.min(targetBucket.length, Math.round(targetIndex)));

  targetBucket.splice(insertAt, 0, {
    ...moving,
    stage: safeStage,
    status: safeStage === 'archive' ? 'archived' : 'active',
    sectionId: safeStage,
    groupId: safeStage
  });

  const rebuilt = [];
  STAGE_FLOW.forEach((stage) => {
    const bucket = (stageBuckets.get(stage) || []).sort((a, b) => safeOrder(a.order) - safeOrder(b.order));
    bucket.forEach((item, index) => {
      rebuilt.push({
        ...item,
        stage,
        status: stage === 'archive' ? 'archived' : 'active',
        sectionId: stage,
        groupId: stage,
        order: index
      });
    });
  });
  return rebuilt;
};

const StageDropZone = ({ stage, collapsed, count, onToggle, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: toStageDropId(stage) });
  return (
    <section className={`concept-outline__group ${isOver ? 'is-selected' : ''}`}>
      <header className="concept-outline__group-head">
        <button
          type="button"
          className="concept-outline__collapse-toggle"
          aria-label={collapsed ? `Expand ${STAGE_LABELS[stage]}` : `Collapse ${STAGE_LABELS[stage]}`}
          onClick={onToggle}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <div className="concept-outline__group-copy">
          <h3>{STAGE_LABELS[stage]}</h3>
        </div>
        <span className="concept-outline__group-count">{count}</span>
      </header>
      {!collapsed && (
        <div ref={setNodeRef} className="concept-outline__group-body">
          <div className="concept-outline__group-scroll">
            {children}
          </div>
        </div>
      )}
    </section>
  );
};

const OutlineItemRow = ({ item, materialMeta, onStageChange, onRemove }) => {
  const sortableId = toItemSortableId(item.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-item-id={item.id}
      data-testid={`concept-workspace-item-${item.id}`}
      className={`concept-outline__item ${isDragging ? 'is-dragging' : ''}`}
    >
      <button
        type="button"
        className="concept-outline__drag-handle"
        aria-label="Drag item"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="concept-outline__item-icon" aria-hidden="true">{TYPE_ICON[item.type] || '•'}</span>
      <div className="concept-outline__item-content">
        <div className="concept-outline__item-head">
          <div className="concept-outline__item-title" data-testid={`concept-workspace-item-title-${item.id}`}>
            {materialMeta.title || 'Untitled'}
          </div>
        </div>
        {materialMeta.snippet && <div className="concept-outline__item-snippet">{materialMeta.snippet}</div>}
        {(materialMeta.dateLabel || (materialMeta.chips || []).length > 0) && (
          <div className="concept-outline__item-meta">
            {(materialMeta.chips || []).map((chip) => (
              <span key={`${item.id}-${chip}`} className="concept-outline__meta-chip">{chip}</span>
            ))}
            {materialMeta.dateLabel && <span className="concept-outline__meta-date">{materialMeta.dateLabel}</span>}
          </div>
        )}
      </div>
      <div className="concept-outline__item-actions">
        <select
          className="concept-outline__stage-select"
          aria-label="Stage"
          value={normalizeStage(item.stage)}
          onChange={(event) => onStageChange(item, event.target.value)}
        >
          {STAGE_FLOW.map(stage => (
            <option key={`${item.id}-${stage}`} value={stage}>{STAGE_LABELS[stage]}</option>
          ))}
        </select>
        <button
          type="button"
          className="ui-quiet-button"
          onClick={() => onRemove(item)}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

const ConceptNotebook = ({ concept }) => {
  const conceptId = String(concept?._id || concept?.name || '').trim();
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    patchWorkspace,
    setWorkspace,
    saveWorkspace,
    refresh: refreshWorkspace
  } = useConceptWorkspace(conceptId, { enabled: Boolean(conceptId) });
  const {
    material,
    loading: materialLoading,
    error: materialError,
    refresh: refreshMaterial
  } = useConceptMaterial(conceptId, { enabled: Boolean(conceptId) });

  const normalizedWorkspace = useMemo(() => normalizeWorkspace(workspace), [workspace]);
  const items = useMemo(
    () => (Array.isArray(normalizedWorkspace.attachedItems) ? normalizedWorkspace.attachedItems : EMPTY_ITEMS),
    [normalizedWorkspace.attachedItems]
  );

  const [stageFilter, setStageFilter] = useState('all');
  const [collapsedStages, setCollapsedStages] = useState({
    inbox: false,
    working: false,
    draft: true,
    archive: true
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('highlights');
  const [drawerFilter, setDrawerFilter] = useState('recent');
  const [drawerQuery, setDrawerQuery] = useState('');
  const [drawerVisibleCount, setDrawerVisibleCount] = useState(DRAWER_WINDOW_SIZE);
  const [selectedDrawerKeys, setSelectedDrawerKeys] = useState(() => new Set());
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [buildingFromLibrary, setBuildingFromLibrary] = useState(false);
  const [toast, setToast] = useState({ message: '', tone: 'success' });

  const pendingWorkspaceRef = useRef(null);
  const pendingSaveTimerRef = useRef(null);
  const pendingSaveToastRef = useRef('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!toast.message) return undefined;
    const timer = window.setTimeout(() => {
      setToast({ message: '', tone: 'success' });
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [toast.message]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [drawerOpen]);

  useEffect(() => {
    setDrawerVisibleCount(DRAWER_WINDOW_SIZE);
    setSelectedDrawerKeys(new Set());
  }, [drawerOpen, drawerTab, drawerFilter, drawerQuery]);

  useEffect(() => () => {
    if (pendingSaveTimerRef.current) {
      window.clearTimeout(pendingSaveTimerRef.current);
    }
  }, []);

  const queueWorkspaceSave = useCallback((nextWorkspace, successMessage = '') => {
    const normalized = normalizeWorkspace(nextWorkspace);
    setWorkspace(normalized);
    pendingWorkspaceRef.current = normalized;

    if (successMessage) {
      pendingSaveToastRef.current = successMessage;
    }

    if (pendingSaveTimerRef.current) {
      window.clearTimeout(pendingSaveTimerRef.current);
    }

    pendingSaveTimerRef.current = window.setTimeout(async () => {
      const pending = pendingWorkspaceRef.current;
      pendingWorkspaceRef.current = null;
      pendingSaveTimerRef.current = null;
      if (!pending) return;
      try {
        await saveWorkspace(toLegacyShape(pending));
        if (pendingSaveToastRef.current) {
          setToast({ message: pendingSaveToastRef.current, tone: 'success' });
        }
      } catch (error) {
        setToast({
          message: error.response?.data?.error || 'Failed to save workspace changes.',
          tone: 'error'
        });
        refreshWorkspace();
      } finally {
        pendingSaveToastRef.current = '';
      }
    }, 360);
  }, [refreshWorkspace, saveWorkspace, setWorkspace]);

  const highlightQueryFilters = useMemo(() => ({
    q: drawerQuery || undefined,
    limit: drawerFilter === 'recent' ? 60 : 140
  }), [drawerFilter, drawerQuery]);

  const {
    highlights: searchedHighlights,
    loading: highlightsLoading,
    error: highlightsError
  } = useHighlightsQuery(highlightQueryFilters, {
    enabled: drawerOpen && drawerTab === 'highlights' && drawerFilter !== 'attached',
    debounceMs: 220
  });

  const {
    articles: searchedArticles,
    loading: articlesLoading,
    error: articlesError
  } = useArticles({
    query: drawerQuery,
    enabled: drawerOpen && drawerTab === 'articles' && drawerFilter !== 'attached',
    debounceMs: 220
  });

  const itemsByStage = useMemo(() => {
    const stageMap = {
      inbox: [],
      working: [],
      draft: [],
      archive: []
    };

    items.forEach((item) => {
      const stage = normalizeStage(item.stage, 'working');
      stageMap[stage].push({ ...item, stage });
    });

    STAGE_FLOW.forEach((stage) => {
      stageMap[stage].sort((a, b) => safeOrder(a.order) - safeOrder(b.order));
    });

    return stageMap;
  }, [items]);

  const referenceMap = useMemo(() => {
    const map = new Map();

    (material.pinnedHighlights || []).forEach((entry) => {
      map.set(`highlight:${entry._id}`, {
        title: entry.articleTitle || 'Highlight',
        snippet: entry.text || '',
        chips: ['Highlight'],
        dateLabel: formatDate(entry.createdAt)
      });
    });

    (material.recentHighlights || []).forEach((entry) => {
      const key = `highlight:${entry._id}`;
      if (map.has(key)) return;
      map.set(key, {
        title: entry.articleTitle || 'Highlight',
        snippet: entry.text || '',
        chips: ['Highlight'],
        dateLabel: formatDate(entry.createdAt)
      });
    });

    (material.linkedArticles || []).forEach((entry) => {
      map.set(`article:${entry._id}`, {
        title: entry.title || 'Article',
        snippet: entry.url || '',
        chips: ['Article', entry.highlightCount !== undefined ? `${entry.highlightCount} highlights` : ''].filter(Boolean),
        dateLabel: formatDate(entry.createdAt)
      });
    });

    (material.linkedNotes || []).forEach((entry) => {
      map.set(`note:${entry._id}`, {
        title: entry.title || 'Note',
        snippet: stripHtml(entry.content || ''),
        chips: ['Note'],
        dateLabel: formatDate(entry.updatedAt || entry.createdAt)
      });
    });

    return map;
  }, [material.linkedArticles, material.linkedNotes, material.pinnedHighlights, material.recentHighlights]);

  const attachedIdsByType = useMemo(() => {
    const registry = {
      highlight: new Set(),
      article: new Set(),
      note: new Set(),
      question: new Set()
    };
    items.forEach((item) => {
      if (registry[item.type]) registry[item.type].add(String(item.refId));
    });
    return registry;
  }, [items]);

  const itemMap = useMemo(() => {
    const map = new Map();
    items.forEach(item => map.set(item.id, item));
    return map;
  }, [items]);

  const materialMetaByItemId = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      map.set(item.id, resolveMaterialMeta(item, referenceMap));
    });
    return map;
  }, [items, referenceMap]);

  const drawerRows = useMemo(() => {
    const query = clean(drawerQuery).toLowerCase();
    const applyQuery = (rows) => {
      if (!query) return rows;
      return rows.filter(row => (
        String(row.title || '').toLowerCase().includes(query)
        || String(row.snippet || '').toLowerCase().includes(query)
        || String(row.meta || '').toLowerCase().includes(query)
      ));
    };

    if (drawerTab === 'highlights') {
      const attachedRows = (material.pinnedHighlights || []).map((entry) => ({
        id: String(entry._id),
        type: 'highlight',
        title: entry.articleTitle || 'Highlight',
        snippet: entry.text || '',
        meta: Array.isArray(entry.tags) ? entry.tags.slice(0, 3).join(' · ') : '',
        createdAt: entry.createdAt
      }));
      const searchedRows = (searchedHighlights || []).map((entry) => ({
        id: String(entry._id),
        type: 'highlight',
        title: entry.articleTitle || 'Highlight',
        snippet: entry.text || '',
        meta: Array.isArray(entry.tags) ? entry.tags.slice(0, 3).join(' · ') : '',
        createdAt: entry.createdAt
      }));
      const sourceRows = drawerFilter === 'attached' ? attachedRows : searchedRows;
      const filteredRows = applyQuery(sourceRows);
      return drawerFilter === 'recent' ? filteredRows.slice(0, 60) : filteredRows;
    }

    const attachedRows = (material.linkedArticles || []).map((entry) => ({
      id: String(entry._id),
      type: 'article',
      title: entry.title || 'Article',
      snippet: entry.url || '',
      meta: entry.highlightCount !== undefined ? `${entry.highlightCount} highlights` : '',
      createdAt: entry.createdAt
    }));
    const searchedRows = (searchedArticles || []).map((entry) => ({
      id: String(entry._id),
      type: 'article',
      title: entry.title || 'Article',
      snippet: entry.url || '',
      meta: entry.highlights?.length ? `${entry.highlights.length} highlights` : '',
      createdAt: entry.createdAt
    }));
    const sourceRows = drawerFilter === 'attached' ? attachedRows : searchedRows;
    const filteredRows = applyQuery(sourceRows);
    return drawerFilter === 'recent' ? filteredRows.slice(0, 60) : filteredRows;
  }, [drawerFilter, drawerQuery, drawerTab, material.linkedArticles, material.pinnedHighlights, searchedArticles, searchedHighlights]);

  const visibleDrawerRows = useMemo(() => drawerRows.slice(0, drawerVisibleCount), [drawerRows, drawerVisibleCount]);
  const hasMoreDrawerRows = drawerRows.length > visibleDrawerRows.length;
  const drawerLoading = (drawerTab === 'highlights' ? highlightsLoading : articlesLoading)
    || (drawerFilter === 'attached' && materialLoading);
  const drawerError = drawerTab === 'highlights' ? highlightsError : articlesError;

  const handleToggleStageCollapse = useCallback((stage) => {
    setCollapsedStages(prev => ({ ...prev, [stage]: !prev[stage] }));
  }, []);

  const handleStageChange = useCallback((item, nextStage) => {
    const moved = moveAttachedItem(items, item.id, nextStage, null);
    queueWorkspaceSave(
      { ...normalizedWorkspace, attachedItems: moved },
      'Stage updated.'
    );
  }, [items, normalizedWorkspace, queueWorkspaceSave]);

  const handleRemoveItem = useCallback(async (item) => {
    const payload = { itemId: item.id };
    const optimisticItems = items.filter(entry => entry.id !== item.id);
    const optimisticWorkspace = normalizeWorkspace({
      ...normalizedWorkspace,
      attachedItems: optimisticItems
    });

    setWorkspace(optimisticWorkspace);
    try {
      const saved = await patchWorkspace('deleteItem', payload, { optimisticWorkspace });
      setWorkspace(normalizeWorkspace(saved?.workspace || saved || optimisticWorkspace));
      setToast({ message: 'Item removed.', tone: 'success' });
    } catch (error) {
      setToast({ message: error.response?.data?.error || 'Failed to remove item.', tone: 'error' });
      refreshWorkspace();
    }
  }, [items, normalizedWorkspace, patchWorkspace, refreshWorkspace, setWorkspace]);

  const handleDragEnd = useCallback((event) => {
    const activeItemId = fromItemSortableId(event.active?.id);
    if (!activeItemId) return;

    const overItemId = fromItemSortableId(event.over?.id);
    const overStageId = fromStageDropId(event.over?.id);

    const activeItem = itemMap.get(activeItemId);
    if (!activeItem) return;

    if (overItemId) {
      if (overItemId === activeItemId) return;
      const overItem = itemMap.get(overItemId);
      if (!overItem) return;
      const targetStage = normalizeStage(overItem.stage, 'working');
      const targetBucket = itemsByStage[targetStage] || [];
      const targetIndex = targetBucket.findIndex(item => item.id === overItem.id);
      const moved = moveAttachedItem(items, activeItemId, targetStage, targetIndex < 0 ? targetBucket.length : targetIndex);
      queueWorkspaceSave({ ...normalizedWorkspace, attachedItems: moved });
      return;
    }

    if (overStageId) {
      const targetStage = normalizeStage(overStageId, normalizeStage(activeItem.stage, 'working'));
      const targetBucket = itemsByStage[targetStage] || [];
      const moved = moveAttachedItem(items, activeItemId, targetStage, targetBucket.length);
      queueWorkspaceSave({ ...normalizedWorkspace, attachedItems: moved });
    }
  }, [itemMap, items, itemsByStage, normalizedWorkspace, queueWorkspaceSave]);

  const handleToggleDrawerSelection = useCallback((row) => {
    const key = `${row.type}:${row.id}`;
    setSelectedDrawerKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const addRowsToInbox = useCallback(async (rows) => {
    const safeRows = (rows || []).filter((row) => row && row.id && row.type);
    if (!conceptId || safeRows.length === 0) return;

    const rowsToAdd = safeRows.filter((row) => !attachedIdsByType[row.type]?.has(String(row.id)));
    if (rowsToAdd.length === 0) {
      setToast({ message: 'All selected items are already attached.', tone: 'success' });
      return;
    }

    const optimisticItems = [...items];
    rowsToAdd.forEach((row, index) => {
      optimisticItems.push({
        id: createId('item'),
        type: row.type,
        refId: row.id,
        sectionId: 'inbox',
        groupId: 'inbox',
        parentId: '',
        inlineTitle: '',
        inlineText: '',
        stage: 'inbox',
        status: 'active',
        order: (itemsByStage.inbox?.length || 0) + index
      });
    });

    const optimisticWorkspace = normalizeWorkspace({
      ...normalizedWorkspace,
      attachedItems: optimisticItems
    });

    setAddingMaterial(true);
    setWorkspace(optimisticWorkspace);

    try {
      let latestWorkspace = optimisticWorkspace;
      for (const row of rowsToAdd) {
        const response = await attachConceptWorkspaceBlock(conceptId, {
          type: row.type,
          refId: row.id,
          sectionId: 'inbox',
          stage: 'inbox'
        });
        latestWorkspace = normalizeWorkspace(response?.workspace || latestWorkspace);
        setWorkspace(latestWorkspace);
      }
      await refreshMaterial();
      setToast({
        message: rowsToAdd.length === 1 ? 'Item added to Inbox.' : `${rowsToAdd.length} items added to Inbox.`,
        tone: 'success'
      });
      setSelectedDrawerKeys(new Set());
    } catch (error) {
      setToast({
        message: error.response?.data?.error || 'Failed to add selected material.',
        tone: 'error'
      });
      refreshWorkspace();
    } finally {
      setAddingMaterial(false);
    }
  }, [attachedIdsByType, conceptId, items, itemsByStage.inbox, normalizedWorkspace, refreshMaterial, refreshWorkspace, setWorkspace]);

  const handleBuildFromLibrary = useCallback(async () => {
    if (!conceptId || buildingFromLibrary) return;
    setBuildingFromLibrary(true);
    setToast({ message: 'Building workspace from your library...', tone: 'success' });
    try {
      const response = await buildConceptWorkspaceFromLibrary(conceptId, {
        mode: 'library_only',
        maxLoops: 2
      });
      await refreshWorkspace();
      await refreshMaterial();
      const createdGroups = Number(response?.summary?.createdGroups || 0);
      const linkedItems = Number(response?.summary?.linkedItems || 0);
      if (createdGroups > 0 || linkedItems > 0) {
        setToast({
          message: `Build complete: ${createdGroups} groups, ${linkedItems} items linked.`,
          tone: 'success'
        });
      } else {
        setToast({ message: 'Build complete.', tone: 'success' });
      }
    } catch (error) {
      setToast({
        message: error.response?.data?.error || 'Failed to build from library.',
        tone: 'error'
      });
    } finally {
      setBuildingFromLibrary(false);
    }
  }, [buildingFromLibrary, conceptId, refreshMaterial, refreshWorkspace]);

  const selectedRows = useMemo(() => {
    const rowsByKey = new Map();
    drawerRows.forEach((row) => {
      rowsByKey.set(`${row.type}:${row.id}`, row);
    });
    return Array.from(selectedDrawerKeys)
      .map(key => rowsByKey.get(key))
      .filter(Boolean);
  }, [drawerRows, selectedDrawerKeys]);

  const visibleStages = useMemo(() => (
    stageFilter === 'all' ? STAGE_FLOW : [stageFilter]
  ), [stageFilter]);

  return (
    <section className="concept-outline" data-testid="concept-workspace-surface">
      {toast.message && (
        <p className={`status-message ${toast.tone === 'error' ? 'error-message' : 'success-message'}`}>
          {toast.message}
        </p>
      )}

      <div className="ui-surface-card concept-outline__workspace">
        <SectionHeader
          title="Workspace"
          subtitle="Attached material only. Build a readable outline by moving items through stages."
          action={(
            <div className="concept-outline__workspace-actions">
              <Button
                variant="secondary"
                onClick={handleBuildFromLibrary}
                disabled={buildingFromLibrary || workspaceLoading}
                data-testid="concept-build-library-button"
              >
                {buildingFromLibrary ? 'Building...' : 'Build from my library'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDrawerOpen(true)}
                data-testid="concept-add-material-button"
              >
                + Add material
              </Button>
            </div>
          )}
        />

        <div className="concept-outline__filters">
          <div className="concept-outline__filter-group" role="tablist" aria-label="Stage filter">
            {STAGE_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`ui-quiet-button ${stageFilter === option.value ? 'is-active' : ''}`}
                onClick={() => setStageFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {workspaceLoading ? (
          <div className="concept-outline__workspace-skeleton" aria-hidden="true">
            <div className="skeleton skeleton-title" style={{ width: '32%' }} />
            <div className="skeleton skeleton-text" style={{ width: '72%' }} />
            <div className="skeleton skeleton-title" style={{ width: '44%' }} />
            <div className="skeleton skeleton-text" style={{ width: '68%' }} />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="concept-outline__groups">
              {visibleStages.map((stage) => {
                const stageItems = itemsByStage[stage] || [];
                const collapsed = stageFilter === 'all' ? Boolean(collapsedStages[stage]) : false;

                return (
                  <StageDropZone
                    key={stage}
                    stage={stage}
                    count={stageItems.length}
                    collapsed={collapsed}
                    onToggle={() => handleToggleStageCollapse(stage)}
                  >
                    {stageItems.length === 0 ? (
                      <div className="concept-outline__empty">No items in {STAGE_LABELS[stage]}.</div>
                    ) : (
                      <SortableContext
                        items={stageItems.map(item => toItemSortableId(item.id))}
                        strategy={verticalListSortingStrategy}
                      >
                        {stageItems.map((item) => (
                          <OutlineItemRow
                            key={item.id}
                            item={item}
                            materialMeta={materialMetaByItemId.get(item.id) || resolveMaterialMeta(item, referenceMap)}
                            onStageChange={handleStageChange}
                            onRemove={handleRemoveItem}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </StageDropZone>
                );
              })}
            </div>
          </DndContext>
        )}

        {!workspaceLoading && items.length === 0 && (
          <div className="concept-outline__first-section-empty">
            <p>This concept has no attached material yet.</p>
            <div className="concept-outline__first-section-actions">
              <Button
                variant="secondary"
                onClick={() => setDrawerOpen(true)}
                data-testid="concept-open-add-drawer-empty"
              >
                Add material
              </Button>
            </div>
          </div>
        )}

        {workspaceError && <p className="status-message error-message">{workspaceError}</p>}
      </div>

      {drawerOpen && (
        <div
          className="concept-outline__drawer-backdrop"
          data-testid="concept-add-material-backdrop"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            className="concept-outline__drawer"
            data-testid="concept-add-material-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="concept-outline__drawer-head">
              <div>
                <h3>Add material</h3>
                <p>Search highlights or articles and attach them to this concept Inbox.</p>
              </div>
              <button
                type="button"
                className="concept-outline__drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close add drawer"
              >
                ×
              </button>
            </div>

            <div className="concept-outline__drawer-controls">
              <div className="concept-outline__drawer-tabs" role="tablist" aria-label="Material type">
                {DRAWER_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    className={`ui-quiet-button ${drawerTab === tab.value ? 'is-active' : ''}`}
                    onClick={() => setDrawerTab(tab.value)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <label className="concept-outline__drawer-field">
                <span>Search</span>
                <input
                  type="text"
                  value={drawerQuery}
                  onChange={(event) => setDrawerQuery(event.target.value)}
                  placeholder={`Search ${drawerTab}...`}
                  data-testid="concept-add-material-search"
                />
              </label>

              <div className="concept-outline__drawer-filters" role="tablist" aria-label="Drawer filter">
                {DRAWER_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={`ui-quiet-button ${drawerFilter === filter.value ? 'is-active' : ''}`}
                    onClick={() => setDrawerFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {drawerLoading ? (
              <div className="concept-outline__drawer-list" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`drawer-skeleton-${index}`} className="concept-outline__drawer-row is-skeleton">
                    <div className="skeleton skeleton-title" style={{ width: `${52 + (index % 3) * 10}%` }} />
                    <div className="skeleton skeleton-text" style={{ width: `${45 + (index % 2) * 16}%` }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="concept-outline__drawer-list">
                {visibleDrawerRows.map((row) => {
                  const rowKey = `${row.type}:${row.id}`;
                  const isAttached = attachedIdsByType[row.type]?.has(String(row.id));
                  const isSelected = selectedDrawerKeys.has(rowKey);
                  return (
                    <div
                      key={rowKey}
                      className="concept-outline__drawer-row"
                      data-testid={`concept-add-material-row-${row.type}-${row.id}`}
                    >
                      <label className="concept-outline__drawer-select">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isAttached || addingMaterial}
                          onChange={() => handleToggleDrawerSelection(row)}
                        />
                      </label>
                      <div className="concept-outline__drawer-copy">
                        <p className="concept-outline__drawer-title">{row.title}</p>
                        {row.snippet && <p className="concept-outline__drawer-snippet">{row.snippet}</p>}
                        <div className="concept-outline__drawer-meta">
                          <span className="concept-outline__meta-chip">{row.type}</span>
                          {row.meta && <span className="concept-outline__meta-chip">{row.meta}</span>}
                          {row.createdAt && <span className="concept-outline__meta-date">{formatDate(row.createdAt)}</span>}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={isAttached || addingMaterial}
                        onClick={() => addRowsToInbox([row])}
                        data-testid={`concept-add-material-attach-${row.type}-${row.id}`}
                      >
                        {isAttached ? 'Added' : 'Add'}
                      </Button>
                    </div>
                  );
                })}

                {!drawerLoading && drawerRows.length === 0 && (
                  <p className="muted small">No results yet. Try a broader search.</p>
                )}

                {!drawerLoading && hasMoreDrawerRows && (
                  <div className="concept-outline__drawer-footer">
                    <button
                      type="button"
                      className="ui-quiet-button"
                      onClick={() => setDrawerVisibleCount((count) => count + DRAWER_WINDOW_SIZE)}
                    >
                      Show more ({drawerRows.length - visibleDrawerRows.length} remaining)
                    </button>
                  </div>
                )}

                <div className="concept-outline__drawer-footer">
                  <Button
                    variant="secondary"
                    disabled={addingMaterial || selectedRows.length === 0}
                    onClick={() => addRowsToInbox(selectedRows)}
                  >
                    {addingMaterial
                      ? 'Adding…'
                      : selectedRows.length > 0
                        ? `Add selected (${selectedRows.length})`
                        : 'Select items to add'}
                  </Button>
                </div>

                {drawerError && <p className="status-message error-message">{drawerError}</p>}
                {materialError && <p className="status-message error-message">{materialError}</p>}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
};

export default ConceptNotebook;
