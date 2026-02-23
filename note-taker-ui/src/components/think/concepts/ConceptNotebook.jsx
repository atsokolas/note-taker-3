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
import { attachConceptWorkspaceBlock } from '../../../api/concepts';
import useArticles from '../../../hooks/useArticles';
import useConceptMaterial from '../../../hooks/useConceptMaterial';
import useConceptWorkspace from '../../../hooks/useConceptWorkspace';
import useHighlightsQuery from '../../../hooks/useHighlightsQuery';
import { Button, SectionHeader } from '../../ui';

const STAGE_FLOW = ['inbox', 'working', 'claim', 'evidence'];
const STAGE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'working', label: 'Working' },
  { value: 'claim', label: 'Claim' },
  { value: 'evidence', label: 'Evidence' }
];
const STATUS_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' }
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
const CONNECTION_TYPES = ['related', 'supports', 'contradicts', 'extends', 'example', 'definition'];
const CONNECTION_TYPE_OPTIONS = CONNECTION_TYPES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1)
}));

const ROOT_WINDOW_THRESHOLD = 140;
const ROOT_ROW_ESTIMATE = 92;
const ROOT_OVERSCAN = 6;
const DRAWER_WINDOW_SIZE = 40;

const TYPE_ICON = {
  highlight: '✦',
  article: '▤',
  note: '✎',
  question: '?'
};

const createId = (prefix = 'id') => (
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Math.random().toString(36).slice(2, 9)}-${Date.now()}`}`
);

const ITEM_PREFIX = 'outline-item:';
const GROUP_DROP_PREFIX = 'outline-group:';

const toItemSortableId = (itemId) => `${ITEM_PREFIX}${itemId}`;
const fromItemSortableId = (value) => (
  String(value || '').startsWith(ITEM_PREFIX)
    ? String(value).slice(ITEM_PREFIX.length)
    : ''
);
const toGroupDropId = (groupId) => `${GROUP_DROP_PREFIX}${groupId}`;
const fromGroupDropId = (value) => (
  String(value || '').startsWith(GROUP_DROP_PREFIX)
    ? String(value).slice(GROUP_DROP_PREFIX.length)
    : ''
);

const clean = (value) => String(value || '').trim();
const safeOrder = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};
const normalizeStage = (value, fallback = 'working') => {
  const stage = clean(value).toLowerCase();
  return STAGE_FLOW.includes(stage) ? stage : fallback;
};
const normalizeStatus = (value, fallback = 'active') => {
  const status = clean(value).toLowerCase();
  return STATUS_FILTERS.some(entry => entry.value === status) ? status : fallback;
};
const normalizeConnectionType = (value, fallback = 'related') => {
  const type = clean(value).toLowerCase();
  return CONNECTION_TYPES.includes(type) ? type : fallback;
};
const formatStageLabel = (value) => {
  const stage = normalizeStage(value);
  return stage.charAt(0).toUpperCase() + stage.slice(1);
};
const stripHtml = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);
const toSafeHtml = (value = '') => String(value || '').trim().slice(0, 32000);
const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
};
const isInlineNoteItem = (item) => (
  item?.type === 'note'
  && (
    String(item?.refId || '').startsWith('inline:')
    || clean(item?.inlineTitle)
    || clean(stripHtml(item?.inlineText))
  )
);

const normalizeWorkspace = (workspaceInput = {}) => {
  const source = workspaceInput && typeof workspaceInput === 'object' ? workspaceInput : {};
  const groupsRaw = Array.isArray(source.groups) ? source.groups : [];
  const itemsRaw = Array.isArray(source.items) ? source.items : [];
  const connectionsRaw = Array.isArray(source.connections) ? source.connections : [];

  const groups = groupsRaw
    .map((group, index) => {
      if (!group) return null;
      return {
        id: clean(group.id) || createId('group'),
        title: clean(group.title) || `Section ${index + 1}`,
        description: clean(group.description),
        collapsed: Boolean(group.collapsed),
        order: safeOrder(group.order, index)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
    .map((group, index) => ({ ...group, order: index }));

  if (groups.length === 0) {
    groups.push({
      id: createId('group'),
      title: 'Workspace',
      description: '',
      collapsed: false,
      order: 0
    });
  }

  const groupIds = new Set(groups.map(group => group.id));
  const defaultGroupId = groups[0].id;

  const items = itemsRaw
    .map((item, index) => {
      if (!item) return null;
      const type = clean(item.type).toLowerCase();
      if (!['highlight', 'article', 'note', 'question'].includes(type)) return null;
      const refId = clean(item.refId);
      if (!refId) return null;
      const groupId = groupIds.has(clean(item.groupId)) ? clean(item.groupId) : defaultGroupId;
      return {
        id: clean(item.id) || createId('item'),
        type,
        refId,
        groupId,
        parentId: clean(item.parentId),
        inlineTitle: clean(item.inlineTitle).slice(0, 160),
        inlineText: toSafeHtml(item.inlineText),
        stage: normalizeStage(item.stage),
        status: normalizeStatus(item.status),
        order: safeOrder(item.order, index)
      };
    })
    .filter(Boolean);

  const itemMap = new Map(items.map(item => [item.id, item]));
  items.forEach((item) => {
    if (!item.parentId) return;
    const parent = itemMap.get(item.parentId);
    if (!parent || parent.groupId !== item.groupId || parent.id === item.id) {
      item.parentId = '';
    }
  });

  items.forEach((item) => {
    let cursor = item.parentId;
    const seen = new Set([item.id]);
    while (cursor) {
      if (seen.has(cursor)) {
        item.parentId = '';
        break;
      }
      seen.add(cursor);
      const parent = itemMap.get(cursor);
      if (!parent) {
        item.parentId = '';
        break;
      }
      cursor = parent.parentId || '';
    }
  });

  const scopeKeys = new Set();
  items.forEach((item) => {
    scopeKeys.add(`${item.groupId}::${item.parentId || ''}`);
  });

  scopeKeys.forEach((scopeKey) => {
    const [groupId, parentId = ''] = scopeKey.split('::');
    const siblings = items
      .filter(item => item.groupId === groupId && (item.parentId || '') === parentId)
      .sort((a, b) => a.order - b.order);
    siblings.forEach((item, index) => {
      item.order = index;
    });
  });

  const seenConnectionKey = new Set();
  const connections = connectionsRaw
    .map((connection) => {
      if (!connection) return null;
      const fromItemId = clean(connection.fromItemId);
      const toItemId = clean(connection.toItemId);
      const type = normalizeConnectionType(connection.type, '');
      if (!fromItemId || !toItemId || !type || fromItemId === toItemId) return null;
      if (!itemMap.has(fromItemId) || !itemMap.has(toItemId)) return null;
      const key = `${fromItemId}:${toItemId}:${type}`;
      if (seenConnectionKey.has(key)) return null;
      seenConnectionKey.add(key);
      return {
        id: clean(connection.id) || createId('connection'),
        fromItemId,
        toItemId,
        type
      };
    })
    .filter(Boolean);

  return {
    version: 1,
    groups,
    items,
    connections,
    updatedAt: new Date().toISOString()
  };
};

const sortSiblings = (items, groupId, parentId = '') => (
  items
    .filter(item => item.groupId === groupId && (item.parentId || '') === parentId)
    .sort((a, b) => a.order - b.order)
);

const toScopeKey = (groupId, parentId = '') => `${groupId}::${parentId || ''}`;

const buildSiblingIndex = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    const key = toScopeKey(item.groupId, item.parentId || '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  map.forEach((siblings) => siblings.sort((a, b) => a.order - b.order));
  return map;
};

const getSiblingsFromIndex = (indexMap, groupId, parentId = '') => (
  indexMap.get(toScopeKey(groupId, parentId || '')) || []
);

const buildDescendantSet = (items, rootId) => {
  const toDelete = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && toDelete.has(item.parentId) && !toDelete.has(item.id)) {
        toDelete.add(item.id);
        changed = true;
      }
    }
  }
  return toDelete;
};

const applyLocalPatch = (workspaceInput, op, payload = {}) => {
  const workspace = normalizeWorkspace(workspaceInput);

  if (op === 'addGroup') {
    workspace.groups.push({
      id: createId('group'),
      title: clean(payload.title) || 'New section',
      description: clean(payload.description),
      collapsed: false,
      order: workspace.groups.length
    });
    return normalizeWorkspace(workspace);
  }

  if (op === 'updateGroup') {
    const groupId = clean(payload.id);
    const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : payload;
    workspace.groups = workspace.groups.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        title: patch.title !== undefined ? clean(patch.title) || group.title : group.title,
        description: patch.description !== undefined ? clean(patch.description) : group.description,
        collapsed: patch.collapsed !== undefined ? Boolean(patch.collapsed) : group.collapsed,
        order: patch.order !== undefined ? safeOrder(patch.order, group.order) : group.order
      };
    });
    return normalizeWorkspace(workspace);
  }

  if (op === 'moveGroup') {
    const groupId = clean(payload.id || payload.groupId);
    const ordered = [...workspace.groups].sort((a, b) => a.order - b.order);
    const sourceIndex = ordered.findIndex(group => group.id === groupId);
    if (sourceIndex < 0) return workspace;
    const targetIndex = Math.max(0, Math.min(ordered.length - 1, Math.round(safeOrder(payload.order, sourceIndex))));
    if (sourceIndex !== targetIndex) {
      const [moved] = ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, moved);
      ordered.forEach((group, index) => {
        group.order = index;
      });
      workspace.groups = ordered;
    }
    return normalizeWorkspace(workspace);
  }

  if (op === 'addItem') {
    const groupId = clean(payload.groupId) || workspace.groups[0]?.id || '';
    const parentId = clean(payload.parentId);
    const siblings = sortSiblings(workspace.items, groupId, parentId);
    workspace.items.push({
      id: createId('item'),
      type: clean(payload.type).toLowerCase(),
      refId: clean(payload.refId),
      groupId,
      parentId,
      inlineTitle: clean(payload.inlineTitle).slice(0, 160),
      inlineText: toSafeHtml(payload.inlineText),
      stage: normalizeStage(payload.stage),
      status: normalizeStatus(payload.status),
      order: payload.order !== undefined ? safeOrder(payload.order, siblings.length) : siblings.length
    });
    return normalizeWorkspace(workspace);
  }

  if (op === 'updateItem') {
    const itemId = clean(payload.itemId || payload.id);
    const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : payload;
    workspace.items = workspace.items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        type: patch.type !== undefined ? clean(patch.type).toLowerCase() : item.type,
        refId: patch.refId !== undefined ? clean(patch.refId) : item.refId,
        inlineTitle: patch.inlineTitle !== undefined ? clean(patch.inlineTitle).slice(0, 160) : item.inlineTitle,
        inlineText: patch.inlineText !== undefined ? toSafeHtml(patch.inlineText) : item.inlineText,
        stage: patch.stage !== undefined ? normalizeStage(patch.stage, item.stage || 'working') : item.stage,
        status: patch.status !== undefined ? normalizeStatus(patch.status, item.status || 'active') : item.status
      };
    });
    return normalizeWorkspace(workspace);
  }

  if (op === 'moveItem') {
    const itemId = clean(payload.itemId);
    const item = workspace.items.find(entry => entry.id === itemId);
    if (!item) return workspace;
    const nextGroupId = clean(payload.groupId) || item.groupId;
    const nextParentId = payload.parentId !== undefined ? clean(payload.parentId) : item.parentId;
    item.groupId = nextGroupId;
    item.parentId = nextParentId;
    item.order = payload.order !== undefined ? safeOrder(payload.order, item.order) : item.order;
    return normalizeWorkspace(workspace);
  }

  if (op === 'deleteItem') {
    const itemId = clean(payload.itemId || payload.id);
    const toDelete = buildDescendantSet(workspace.items, itemId);
    workspace.items = workspace.items.filter(item => !toDelete.has(item.id));
    workspace.connections = workspace.connections.filter(connection => (
      !toDelete.has(connection.fromItemId) && !toDelete.has(connection.toItemId)
    ));
    return normalizeWorkspace(workspace);
  }

  if (op === 'addConnection') {
    const fromItemId = clean(payload.fromItemId);
    const toItemId = clean(payload.toItemId);
    const type = normalizeConnectionType(payload.type, '');
    if (!fromItemId || !toItemId || !type || fromItemId === toItemId) return workspace;
    const exists = workspace.connections.some(connection => (
      connection.fromItemId === fromItemId
      && connection.toItemId === toItemId
      && connection.type === type
    ));
    if (exists) return workspace;
    workspace.connections.push({
      id: createId('connection'),
      fromItemId,
      toItemId,
      type
    });
    return normalizeWorkspace(workspace);
  }

  if (op === 'deleteConnection') {
    const id = clean(payload.id || payload.connectionId);
    workspace.connections = workspace.connections.filter(connection => connection.id !== id);
    return normalizeWorkspace(workspace);
  }

  return workspace;
};

const resolveMaterialMeta = (item, refMap, connectionCount = 0) => {
  if (isInlineNoteItem(item)) {
    return {
      title: clean(item.inlineTitle) || 'Note block',
      snippet: stripHtml(item.inlineText),
      chips: ['Note'],
      dateLabel: '',
      connectionCount
    };
  }

  const safeType = clean(item?.type).toLowerCase() || 'item';
  const safeRefId = clean(item?.refId);
  const key = `${safeType}:${safeRefId}`;
  const found = refMap.get(key);
  if (found) {
    return {
      ...found,
      chips: [...(found.chips || [])],
      connectionCount
    };
  }
  return {
    title: `${safeType.charAt(0).toUpperCase()}${safeType.slice(1)}`,
    snippet: safeRefId,
    chips: [safeType],
    dateLabel: '',
    connectionCount
  };
};

const GroupDropZone = ({ groupId, onScroll, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: toGroupDropId(groupId) });
  return (
    <div ref={setNodeRef} className={`concept-outline__group-body ${isOver ? 'is-over' : ''}`}>
      <div className="concept-outline__group-scroll" onScroll={(event) => onScroll(groupId, event)}>
        {children}
      </div>
    </div>
  );
};

const InlineNoteEditor = ({ item, onSave, onCancel }) => {
  const [title, setTitle] = useState(clean(item?.inlineTitle) || 'Note block');
  const [html, setHtml] = useState(item?.inlineText || '<p></p>');
  const bodyRef = useRef(null);

  useEffect(() => {
    setTitle(clean(item?.inlineTitle) || 'Note block');
    setHtml(item?.inlineText || '<p></p>');
  }, [item?.id, item?.inlineText, item?.inlineTitle]);

  useEffect(() => {
    if (!bodyRef.current) return;
    if (bodyRef.current.innerHTML !== html) {
      bodyRef.current.innerHTML = html;
    }
  }, [html]);

  const runCommand = (command) => {
    if (!bodyRef.current) return;
    bodyRef.current.focus();
    document.execCommand(command, false);
    setHtml(bodyRef.current.innerHTML);
  };

  return (
    <div className="concept-outline__inline-note-editor">
      <div className="concept-outline__inline-note-tools">
        <button type="button" onClick={() => runCommand('bold')}>B</button>
        <button type="button" onClick={() => runCommand('italic')}>I</button>
        <button type="button" onClick={() => runCommand('insertUnorderedList')}>• List</button>
      </div>
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Note title"
      />
      <div
        ref={bodyRef}
        className="concept-outline__inline-note-body"
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => setHtml(event.currentTarget.innerHTML)}
      />
      <div className="concept-outline__inline-note-actions">
        <Button
          variant="secondary"
          onClick={() => onSave(item, { inlineTitle: title, inlineText: html })}
        >
          Save note
        </Button>
        <button type="button" className="ui-quiet-button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

const OutlineItemRow = React.memo(({
  item,
  depth,
  selected,
  connectMode,
  connectFromItemId,
  isConnectionPeer,
  materialMeta,
  groups,
  onSelect,
  onKeyDown,
  onMoveToGroup,
  onIndent,
  onOutdent,
  onCycleStage,
  onToggleArchive,
  onEditInline,
  onRemove
}) => {
  const sortableId = toItemSortableId(item.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginLeft: `${depth * 18}px`
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-item-id={item.id}
      className={[
        'concept-outline__item',
        selected ? 'is-selected' : '',
        isDragging ? 'is-dragging' : '',
        normalizeStatus(item.status) === 'archived' ? 'is-archived' : '',
        connectMode && connectFromItemId === item.id ? 'is-connect-source' : '',
        connectMode && isConnectionPeer ? 'is-connect-peer' : ''
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => onKeyDown(event, item)}
      tabIndex={0}
      role="button"
    >
      <button
        type="button"
        className="concept-outline__drag-handle"
        aria-label="Drag item"
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
      >
        ⋮⋮
      </button>
      <span className="concept-outline__item-icon" aria-hidden="true">{TYPE_ICON[item.type] || '•'}</span>
      <div className="concept-outline__item-content">
        <div className="concept-outline__item-head">
          <div className="concept-outline__item-title">{materialMeta.title || 'Untitled'}</div>
          <button
            type="button"
            className={`concept-outline__stage-pill is-${normalizeStage(item.stage)}`}
            onClick={(event) => {
              event.stopPropagation();
              onCycleStage(item);
            }}
          >
            {formatStageLabel(item.stage)}
          </button>
        </div>
        {materialMeta.snippet && <div className="concept-outline__item-snippet">{materialMeta.snippet}</div>}
        {(materialMeta.dateLabel || (materialMeta.chips || []).length > 0 || materialMeta.connectionCount > 0) && (
          <div className="concept-outline__item-meta">
            {(materialMeta.chips || []).map((chip) => (
              <span key={`${item.id}-${chip}`} className="concept-outline__meta-chip">{chip}</span>
            ))}
            {materialMeta.connectionCount > 0 && (
              <span className="concept-outline__meta-chip">{materialMeta.connectionCount} link{materialMeta.connectionCount > 1 ? 's' : ''}</span>
            )}
            {materialMeta.dateLabel && <span className="concept-outline__meta-date">{materialMeta.dateLabel}</span>}
          </div>
        )}
      </div>
      <details className="concept-outline__menu" onClick={(event) => event.stopPropagation()}>
        <summary>⋯</summary>
        <div className="concept-outline__menu-popover">
          <label>
            Move to section
            <select
              value={item.groupId}
              onChange={(event) => onMoveToGroup(item, event.target.value)}
            >
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.title}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => onIndent(item)}>Indent</button>
          <button type="button" onClick={() => onOutdent(item)}>Outdent</button>
          {isInlineNoteItem(item) && <button type="button" onClick={() => onEditInline(item)}>Edit note</button>}
          <button type="button" onClick={() => onToggleArchive(item)}>
            {normalizeStatus(item.status) === 'archived' ? 'Restore' : 'Archive'}
          </button>
          <button type="button" onClick={() => onRemove(item)} className="danger">Remove</button>
        </div>
      </details>
    </div>
  );
});

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

  const [stageFilter, setStageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [groupTitleDraft, setGroupTitleDraft] = useState('');
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('highlights');
  const [drawerFilter, setDrawerFilter] = useState('recent');
  const [drawerQuery, setDrawerQuery] = useState('');
  const [drawerVisibleCount, setDrawerVisibleCount] = useState(DRAWER_WINDOW_SIZE);
  const [attachingKey, setAttachingKey] = useState('');
  const [connectMode, setConnectMode] = useState(false);
  const [connectFromItemId, setConnectFromItemId] = useState('');
  const [connectRelationType, setConnectRelationType] = useState('related');
  const [editingInlineItemId, setEditingInlineItemId] = useState('');
  const [groupScrollState, setGroupScrollState] = useState({});
  const [connectionLines, setConnectionLines] = useState([]);
  const [toast, setToast] = useState({ message: '', tone: 'success' });

  const normalizedWorkspace = useMemo(() => normalizeWorkspace(workspace), [workspace]);
  const groups = normalizedWorkspace.groups;
  const items = normalizedWorkspace.items;
  const connections = normalizedWorkspace.connections;
  const visibleItems = useMemo(
    () => items.filter((item) => {
      const itemStatus = normalizeStatus(item.status);
      if (statusFilter !== itemStatus) return false;
      if (stageFilter === 'all') return true;
      return normalizeStage(item.stage) === stageFilter;
    }),
    [items, stageFilter, statusFilter]
  );

  const pendingWorkspaceRef = useRef(null);
  const pendingSaveTimerRef = useRef(null);
  const pendingSaveToastRef = useRef('');
  const groupsCanvasRef = useRef(null);

  const highlightQueryFilters = useMemo(() => ({
    q: drawerQuery || undefined,
    limit: drawerFilter === 'recent' ? 50 : 120
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

  useEffect(() => {
    if (!selectedGroupId || !groups.some(group => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0]?.id || '');
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!selectedItemId || !visibleItems.some(item => item.id === selectedItemId)) {
      setSelectedItemId('');
    }
  }, [selectedItemId, visibleItems]);

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
  }, [drawerOpen, drawerTab, drawerFilter, drawerQuery]);

  useEffect(() => () => {
    if (pendingSaveTimerRef.current) {
      window.clearTimeout(pendingSaveTimerRef.current);
    }
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const itemById = useMemo(() => {
    const map = new Map();
    items.forEach(item => map.set(item.id, item));
    return map;
  }, [items]);

  const visibleItemById = useMemo(() => {
    const map = new Map();
    visibleItems.forEach(item => map.set(item.id, item));
    return map;
  }, [visibleItems]);

  const visibleSiblingIndex = useMemo(() => buildSiblingIndex(visibleItems), [visibleItems]);

  const attachedIdsByType = useMemo(() => {
    const registry = {
      highlight: new Set(),
      article: new Set(),
      note: new Set()
    };
    items.forEach((item) => {
      if (registry[item.type]) registry[item.type].add(String(item.refId));
    });
    return registry;
  }, [items]);

  const connectionCountByItem = useMemo(() => {
    const map = new Map();
    connections.forEach((connection) => {
      map.set(connection.fromItemId, (map.get(connection.fromItemId) || 0) + 1);
      map.set(connection.toItemId, (map.get(connection.toItemId) || 0) + 1);
    });
    return map;
  }, [connections]);

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

  const materialMetaByItemId = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      map.set(item.id, resolveMaterialMeta(item, referenceMap, connectionCountByItem.get(item.id) || 0));
    });
    return map;
  }, [connectionCountByItem, items, referenceMap]);

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
      return drawerFilter === 'recent' ? filteredRows.slice(0, 50) : filteredRows;
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
    return drawerFilter === 'recent' ? filteredRows.slice(0, 50) : filteredRows;
  }, [drawerFilter, drawerQuery, drawerTab, material.linkedArticles, material.pinnedHighlights, searchedArticles, searchedHighlights]);

  const drawerLoading = (drawerTab === 'highlights' ? highlightsLoading : articlesLoading)
    || (drawerFilter === 'attached' && materialLoading);
  const drawerError = drawerTab === 'highlights' ? highlightsError : articlesError;
  const visibleDrawerRows = useMemo(
    () => drawerRows.slice(0, drawerVisibleCount),
    [drawerRows, drawerVisibleCount]
  );
  const hasMoreDrawerRows = drawerRows.length > visibleDrawerRows.length;

  const queueWorkspaceSave = useCallback((nextWorkspace, successMessage = '') => {
    const normalizedNext = normalizeWorkspace(nextWorkspace);
    setWorkspace(normalizedNext);
    pendingWorkspaceRef.current = normalizedNext;
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
        await saveWorkspace(pending);
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
    }, 480);
  }, [refreshWorkspace, saveWorkspace, setWorkspace]);

  const performPatch = useCallback(async ({ op, payload, optimisticWorkspace, successMessage = '' }) => {
    try {
      const saved = await patchWorkspace(op, payload, { optimisticWorkspace });
      if (successMessage) {
        setToast({ message: successMessage, tone: 'success' });
      }
      return saved;
    } catch (err) {
      setToast({
        message: err.response?.data?.error || 'Workspace update failed.',
        tone: 'error'
      });
      return null;
    }
  }, [patchWorkspace]);

  const handleAddGroup = useCallback(async () => {
    const title = clean(groupTitleDraft);
    if (!title) return;
    const payload = {
      title,
      description: clean(groupDescriptionDraft)
    };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'addGroup', payload);
    setGroupTitleDraft('');
    setGroupDescriptionDraft('');
    await performPatch({
      op: 'addGroup',
      payload,
      optimisticWorkspace,
      successMessage: 'Section created.'
    });
  }, [groupDescriptionDraft, groupTitleDraft, normalizedWorkspace, performPatch]);

  const handleCreateInlineNote = useCallback(async () => {
    const groupId = selectedGroupId || groups[0]?.id || '';
    if (!groupId) return;
    const inlineRef = `inline:${Date.now()}`;
    const payload = {
      type: 'note',
      refId: inlineRef,
      groupId,
      stage: 'working',
      inlineTitle: 'Note block',
      inlineText: '<p></p>'
    };
    const beforeIds = new Set(items.map(item => item.id));
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'addItem', payload);
    const saved = await performPatch({
      op: 'addItem',
      payload,
      optimisticWorkspace,
      successMessage: 'Note block added.'
    });
    const nextWorkspace = normalizeWorkspace(saved?.workspace || saved || optimisticWorkspace);
    const created = nextWorkspace.items.find(item => !beforeIds.has(item.id));
    if (created) {
      setSelectedItemId(created.id);
      setEditingInlineItemId(created.id);
    }
  }, [groups, items, normalizedWorkspace, performPatch, selectedGroupId]);

  const handleRenameGroup = useCallback(async (group) => {
    const nextTitle = window.prompt('Rename section', group.title || '');
    if (nextTitle === null) return;
    const title = clean(nextTitle);
    if (!title || title === group.title) return;
    const payload = {
      id: group.id,
      patch: { title }
    };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'updateGroup', payload);
    await performPatch({
      op: 'updateGroup',
      payload,
      optimisticWorkspace,
      successMessage: 'Section renamed.'
    });
  }, [normalizedWorkspace, performPatch]);

  const handleToggleGroup = useCallback((group) => {
    const payload = {
      id: group.id,
      patch: { collapsed: !group.collapsed }
    };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'updateGroup', payload);
    queueWorkspaceSave(optimisticWorkspace);
  }, [normalizedWorkspace, queueWorkspaceSave]);

  const handleMoveGroup = useCallback((group, direction) => {
    const ordered = [...groups].sort((a, b) => a.order - b.order);
    const sourceIndex = ordered.findIndex(entry => entry.id === group.id);
    if (sourceIndex < 0) return;
    const targetIndex = sourceIndex + direction;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const payload = { id: group.id, order: targetIndex };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'moveGroup', payload);
    queueWorkspaceSave(optimisticWorkspace, 'Section reordered.');
  }, [groups, normalizedWorkspace, queueWorkspaceSave]);

  const moveItem = useCallback((itemId, movePayload) => {
    const payload = {
      itemId,
      ...movePayload
    };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'moveItem', payload);
    queueWorkspaceSave(optimisticWorkspace);
  }, [normalizedWorkspace, queueWorkspaceSave]);

  const handleRemoveItem = useCallback(async (item) => {
    const payload = { itemId: item.id };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'deleteItem', payload);
    setEditingInlineItemId(prev => (prev === item.id ? '' : prev));
    await performPatch({ op: 'deleteItem', payload, optimisticWorkspace });
  }, [normalizedWorkspace, performPatch]);

  const handleUpdateItem = useCallback((item, patch, successMessage = '') => {
    const payload = {
      itemId: item.id,
      patch
    };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'updateItem', payload);
    queueWorkspaceSave(optimisticWorkspace, successMessage);
  }, [normalizedWorkspace, queueWorkspaceSave]);

  const handleSaveInlineNote = useCallback((item, patch) => {
    handleUpdateItem(item, patch, 'Note block updated.');
    setEditingInlineItemId('');
  }, [handleUpdateItem]);

  const handleCycleStage = useCallback((item) => {
    const currentStage = normalizeStage(item.stage);
    const index = STAGE_FLOW.indexOf(currentStage);
    const nextStage = STAGE_FLOW[(index + 1) % STAGE_FLOW.length];
    handleUpdateItem(item, { stage: nextStage });
  }, [handleUpdateItem]);

  const handleToggleArchive = useCallback((item) => {
    const nextStatus = normalizeStatus(item.status) === 'archived' ? 'active' : 'archived';
    handleUpdateItem(
      item,
      { status: nextStatus },
      nextStatus === 'archived' ? 'Item archived.' : 'Item restored.'
    );
  }, [handleUpdateItem]);

  const handleMoveToGroup = useCallback((item, groupId) => {
    if (!groupId || groupId === item.groupId) return;
    moveItem(item.id, { groupId, parentId: '', order: Number.MAX_SAFE_INTEGER });
  }, [moveItem]);

  const handleIndent = useCallback((item) => {
    const siblings = getSiblingsFromIndex(visibleSiblingIndex, item.groupId, item.parentId || '');
    const index = siblings.findIndex(entry => entry.id === item.id);
    if (index <= 0) return;
    const previousSibling = siblings[index - 1];
    const children = getSiblingsFromIndex(visibleSiblingIndex, item.groupId, previousSibling.id);
    moveItem(item.id, {
      groupId: item.groupId,
      parentId: previousSibling.id,
      order: children.length
    });
  }, [moveItem, visibleSiblingIndex]);

  const handleOutdent = useCallback((item) => {
    if (!item.parentId) return;
    const parent = itemById.get(item.parentId);
    if (!parent) return;
    const nextParentId = parent.parentId || '';
    moveItem(item.id, {
      groupId: parent.groupId,
      parentId: nextParentId,
      order: parent.order + 1
    });
  }, [itemById, moveItem]);

  const handleKeyboardReorder = useCallback((item, direction) => {
    const siblings = getSiblingsFromIndex(visibleSiblingIndex, item.groupId, item.parentId || '');
    const index = siblings.findIndex(entry => entry.id === item.id);
    if (index < 0) return;
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;
    moveItem(item.id, {
      groupId: item.groupId,
      parentId: item.parentId || '',
      order: nextIndex
    });
  }, [moveItem, visibleSiblingIndex]);

  const handleItemKeyDown = useCallback((event, item) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) handleOutdent(item);
      else handleIndent(item);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowUp') {
      event.preventDefault();
      handleKeyboardReorder(item, 'up');
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowDown') {
      event.preventDefault();
      handleKeyboardReorder(item, 'down');
    }
  }, [handleIndent, handleKeyboardReorder, handleOutdent]);

  const handleDragEnd = useCallback((event) => {
    const activeItemId = fromItemSortableId(event.active?.id);
    if (!activeItemId) return;

    const overItemId = fromItemSortableId(event.over?.id);
    const overGroupId = fromGroupDropId(event.over?.id);
    const activeItem = visibleItemById.get(activeItemId);
    if (!activeItem) return;

    if (overItemId) {
      if (overItemId === activeItemId) return;
      const overItem = visibleItemById.get(overItemId);
      if (!overItem) return;
      const siblings = getSiblingsFromIndex(visibleSiblingIndex, overItem.groupId, overItem.parentId || '');
      const targetOrder = siblings.findIndex(entry => entry.id === overItem.id);
      moveItem(activeItem.id, {
        groupId: overItem.groupId,
        parentId: overItem.parentId || '',
        order: targetOrder < 0 ? siblings.length : targetOrder
      });
      return;
    }

    if (overGroupId) {
      const roots = getSiblingsFromIndex(visibleSiblingIndex, overGroupId, '');
      moveItem(activeItem.id, {
        groupId: overGroupId,
        parentId: '',
        order: roots.length
      });
    }
  }, [moveItem, visibleItemById, visibleSiblingIndex]);

  const handleAttachRow = useCallback(async (row) => {
    if (!conceptId) return;
    const attachKey = `${row.type}:${row.id}`;
    const groupId = selectedGroupId || groups[0]?.id || '';
    if (!groupId) return;

    const previous = normalizedWorkspace;
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'addItem', {
      type: row.type,
      refId: row.id,
      groupId,
      stage: 'inbox'
    });

    setAttachingKey(attachKey);
    setWorkspace(optimisticWorkspace);
    try {
      const response = await attachConceptWorkspaceBlock(conceptId, {
        type: row.type,
        refId: row.id,
        sectionId: groupId,
        stage: 'inbox'
      });
      setWorkspace(normalizeWorkspace(response?.workspace || optimisticWorkspace));
      await refreshMaterial();
      setToast({ message: 'Item added to concept workspace.', tone: 'success' });
    } catch (error) {
      setWorkspace(previous);
      setToast({
        message: error.response?.data?.error || 'Failed to add item to concept workspace.',
        tone: 'error'
      });
    } finally {
      setAttachingKey('');
    }
  }, [conceptId, groups, normalizedWorkspace, refreshMaterial, selectedGroupId, setWorkspace]);

  const handleSelectItem = useCallback((item) => {
    if (!connectMode) {
      setSelectedItemId(item.id);
      return;
    }
    if (!connectFromItemId) {
      setConnectFromItemId(item.id);
      return;
    }
    if (connectFromItemId === item.id) {
      setConnectFromItemId('');
      return;
    }
    const relationType = normalizeConnectionType(connectRelationType, '');
    if (!relationType) {
      setToast({ message: 'Invalid connection type.', tone: 'error' });
      return;
    }
    const payload = {
      fromItemId: connectFromItemId,
      toItemId: item.id,
      type: relationType
    };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'addConnection', payload);
    performPatch({
      op: 'addConnection',
      payload,
      optimisticWorkspace,
      successMessage: 'Connection created.'
    });
    setConnectFromItemId('');
  }, [connectFromItemId, connectMode, connectRelationType, normalizedWorkspace, performPatch]);

  const handleDeleteConnection = useCallback((connectionId) => {
    const payload = { id: connectionId };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'deleteConnection', payload);
    performPatch({
      op: 'deleteConnection',
      payload,
      optimisticWorkspace,
      successMessage: 'Connection removed.'
    });
  }, [normalizedWorkspace, performPatch]);

  const rootWindowByGroup = useMemo(() => {
    const map = new Map();
    groups.forEach((group) => {
      const roots = getSiblingsFromIndex(visibleSiblingIndex, group.id, '');
      const state = groupScrollState[group.id] || { scrollTop: 0, clientHeight: 620 };
      if (roots.length <= ROOT_WINDOW_THRESHOLD) {
        map.set(group.id, {
          roots,
          rootIdSet: null,
          topPad: 0,
          bottomPad: 0,
          virtualized: false
        });
        return;
      }
      const clientHeight = Math.max(360, Number(state.clientHeight) || 620);
      const scrollTop = Math.max(0, Number(state.scrollTop) || 0);
      const visibleCount = Math.max(16, Math.ceil(clientHeight / ROOT_ROW_ESTIMATE) + ROOT_OVERSCAN * 2);
      const start = Math.max(0, Math.floor(scrollTop / ROOT_ROW_ESTIMATE) - ROOT_OVERSCAN);
      const end = Math.min(roots.length, start + visibleCount);
      const windowedRoots = roots.slice(start, end);
      map.set(group.id, {
        roots: windowedRoots,
        rootIdSet: new Set(windowedRoots.map(item => item.id)),
        topPad: start * ROOT_ROW_ESTIMATE,
        bottomPad: Math.max(0, (roots.length - end) * ROOT_ROW_ESTIMATE),
        virtualized: true
      });
    });
    return map;
  }, [groupScrollState, groups, visibleSiblingIndex]);

  const connectionPeerIds = useMemo(() => {
    const set = new Set();
    if (!connectMode || !connectFromItemId) return set;
    connections.forEach((connection) => {
      if (connection.fromItemId === connectFromItemId) set.add(connection.toItemId);
      if (connection.toItemId === connectFromItemId) set.add(connection.fromItemId);
    });
    return set;
  }, [connectFromItemId, connectMode, connections]);

  const visibleConnections = useMemo(() => {
    const visibleIds = new Set(visibleItems.map(item => item.id));
    return connections.filter(connection => visibleIds.has(connection.fromItemId) && visibleIds.has(connection.toItemId));
  }, [connections, visibleItems]);

  const selectedConnections = useMemo(() => (
    selectedItemId
      ? connections.filter(connection => connection.fromItemId === selectedItemId || connection.toItemId === selectedItemId)
      : []
  ), [connections, selectedItemId]);

  useEffect(() => {
    if (!groupsCanvasRef.current) {
      setConnectionLines([]);
      return undefined;
    }

    const container = groupsCanvasRef.current;
    let frame = null;

    const computeLines = () => {
      const hostRect = container.getBoundingClientRect();
      const nextLines = [];
      visibleConnections.forEach((connection) => {
        const fromNode = container.querySelector(`[data-item-id="${connection.fromItemId}"]`);
        const toNode = container.querySelector(`[data-item-id="${connection.toItemId}"]`);
        if (!fromNode || !toNode) return;

        const fromRect = fromNode.getBoundingClientRect();
        const toRect = toNode.getBoundingClientRect();
        nextLines.push({
          id: connection.id,
          type: connection.type,
          x1: fromRect.left - hostRect.left + 14,
          y1: fromRect.top - hostRect.top + fromRect.height / 2,
          x2: toRect.left - hostRect.left + 14,
          y2: toRect.top - hostRect.top + toRect.height / 2
        });
      });
      setConnectionLines(nextLines);
    };

    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(computeLines);
    };

    schedule();
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(container);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [visibleConnections, visibleItems, groupScrollState]);

  const handleGroupScroll = useCallback((groupId, event) => {
    const nextScrollTop = Math.max(0, event.currentTarget.scrollTop || 0);
    const nextClientHeight = Math.max(0, event.currentTarget.clientHeight || 0);
    setGroupScrollState((prev) => {
      const current = prev[groupId] || { scrollTop: 0, clientHeight: 0 };
      if (
        Math.abs(current.scrollTop - nextScrollTop) < 12
        && current.clientHeight === nextClientHeight
      ) {
        return prev;
      }
      return {
        ...prev,
        [groupId]: {
          scrollTop: nextScrollTop,
          clientHeight: nextClientHeight
        }
      };
    });
  }, []);

  const renderBranch = useCallback((groupId, parentId = '', depth = 0, rootIdSet = null) => {
    const siblings = getSiblingsFromIndex(visibleSiblingIndex, groupId, parentId);
    const scopedSiblings = depth === 0 && rootIdSet
      ? siblings.filter(item => rootIdSet.has(item.id))
      : siblings;
    if (scopedSiblings.length === 0) return null;

    return (
      <SortableContext
        items={scopedSiblings.map(item => toItemSortableId(item.id))}
        strategy={verticalListSortingStrategy}
      >
        {scopedSiblings.map((item) => {
          const children = renderBranch(groupId, item.id, depth + 1, null);
          const meta = materialMetaByItemId.get(item.id) || resolveMaterialMeta(item, referenceMap, 0);
          const isEditing = editingInlineItemId === item.id;
          return (
            <div key={item.id} className={`concept-outline__branch ${depth > 0 ? 'is-nested' : ''}`}>
              <OutlineItemRow
                item={item}
                depth={depth}
                selected={selectedItemId === item.id}
                connectMode={connectMode}
                connectFromItemId={connectFromItemId}
                isConnectionPeer={connectionPeerIds.has(item.id)}
                materialMeta={meta}
                groups={groups}
                onSelect={handleSelectItem}
                onKeyDown={handleItemKeyDown}
                onMoveToGroup={handleMoveToGroup}
                onIndent={handleIndent}
                onOutdent={handleOutdent}
                onCycleStage={handleCycleStage}
                onToggleArchive={handleToggleArchive}
                onEditInline={(noteItem) => setEditingInlineItemId(noteItem.id)}
                onRemove={handleRemoveItem}
              />
              {isEditing && isInlineNoteItem(item) && (
                <InlineNoteEditor
                  item={item}
                  onSave={handleSaveInlineNote}
                  onCancel={() => setEditingInlineItemId('')}
                />
              )}
              {children}
            </div>
          );
        })}
      </SortableContext>
    );
  }, [
    connectFromItemId,
    connectMode,
    connectionPeerIds,
    editingInlineItemId,
    groups,
    handleCycleStage,
    handleIndent,
    handleItemKeyDown,
    handleMoveToGroup,
    handleOutdent,
    handleRemoveItem,
    handleSaveInlineNote,
    handleSelectItem,
    handleToggleArchive,
    materialMetaByItemId,
    referenceMap,
    selectedItemId,
    visibleSiblingIndex
  ]);

  return (
    <section className="concept-outline">
      {toast.message && (
        <p className={`status-message ${toast.tone === 'error' ? 'error-message' : 'success-message'}`}>
          {toast.message}
        </p>
      )}

      <div className="ui-surface-card concept-outline__workspace">
        <SectionHeader
          title="Workspace"
          subtitle="Attached material only. Organize sections and shape your concept as a readable document."
          action={(
            <div className="concept-outline__workspace-actions">
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>+ Add</Button>
              <Button variant="secondary" onClick={handleCreateInlineNote}>+ Note</Button>
              <button
                type="button"
                className={`ui-quiet-button ${connectMode ? 'is-active' : ''}`}
                onClick={() => {
                  setConnectMode(prev => !prev);
                  setConnectFromItemId('');
                }}
              >
                {connectMode ? 'Connecting…' : 'Connect'}
              </button>
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
          <div className="concept-outline__filter-group" role="tablist" aria-label="Status filter">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`ui-quiet-button ${statusFilter === option.value ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="concept-outline__group-create">
          <input
            type="text"
            value={groupTitleDraft}
            onChange={(event) => setGroupTitleDraft(event.target.value)}
            placeholder="New section title"
          />
          <input
            type="text"
            value={groupDescriptionDraft}
            onChange={(event) => setGroupDescriptionDraft(event.target.value)}
            placeholder="Description (optional)"
          />
          <Button variant="secondary" onClick={handleAddGroup}>+ Create section</Button>
        </div>

        {workspaceLoading ? (
          <div className="concept-outline__workspace-skeleton" aria-hidden="true">
            <div className="skeleton skeleton-title" style={{ width: '30%' }} />
            <div className="skeleton skeleton-text" style={{ width: '60%' }} />
            <div className="skeleton skeleton-title" style={{ width: '42%' }} />
            <div className="skeleton skeleton-text" style={{ width: '70%' }} />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="concept-outline__groups" ref={groupsCanvasRef}>
              <svg className="concept-outline__connections" aria-hidden="true">
                {connectionLines.map((line) => (
                  <line
                    key={line.id}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    className={`concept-outline__connection-line is-${line.type}`}
                  />
                ))}
              </svg>
              {groups.map((group) => {
                const rootWindow = rootWindowByGroup.get(group.id) || {
                  roots: [],
                  rootIdSet: null,
                  topPad: 0,
                  bottomPad: 0,
                  virtualized: false
                };
                return (
                  <section
                    key={group.id}
                    className={`concept-outline__group ${selectedGroupId === group.id ? 'is-selected' : ''}`}
                  >
                    <header
                      className="concept-outline__group-head"
                      onClick={() => setSelectedGroupId(group.id)}
                    >
                      <button
                        type="button"
                        className="concept-outline__collapse-toggle"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleGroup(group);
                        }}
                        aria-label={group.collapsed ? 'Expand section' : 'Collapse section'}
                      >
                        {group.collapsed ? '▸' : '▾'}
                      </button>
                      <div className="concept-outline__group-copy">
                        <h3>{group.title}</h3>
                        {group.description && <p>{group.description}</p>}
                      </div>
                      <span className="concept-outline__group-count">{getSiblingsFromIndex(visibleSiblingIndex, group.id, '').length}</span>
                      <div className="concept-outline__group-actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          className="concept-outline__group-action"
                          onClick={() => handleMoveGroup(group, -1)}
                          aria-label="Move section up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="concept-outline__group-action"
                          onClick={() => handleMoveGroup(group, 1)}
                          aria-label="Move section down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="concept-outline__group-action"
                          onClick={() => handleRenameGroup(group)}
                          aria-label="Rename section"
                        >
                          Rename
                        </button>
                      </div>
                    </header>

                    {!group.collapsed && (
                      <GroupDropZone groupId={group.id} onScroll={handleGroupScroll}>
                        {rootWindow.topPad > 0 && <div style={{ height: rootWindow.topPad }} />}
                        {renderBranch(group.id, '', 0, rootWindow.rootIdSet) || (
                          <div className="concept-outline__empty">No blocks in this view.</div>
                        )}
                        {rootWindow.bottomPad > 0 && <div style={{ height: rootWindow.bottomPad }} />}
                      </GroupDropZone>
                    )}
                  </section>
                );
              })}
            </div>
          </DndContext>
        )}

        {!workspaceLoading && groups.length === 1 && items.length === 0 && (
          <div className="concept-outline__first-section-empty">
            <p>Start by creating a section or adding material.</p>
            <div className="concept-outline__first-section-actions">
              <Button variant="secondary" onClick={handleAddGroup}>Create your first section</Button>
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open Add drawer</Button>
            </div>
          </div>
        )}

        {connectMode && (
          <div className="concept-outline__connect-bar" role="status" aria-live="polite">
            <div className="concept-outline__connect-copy">
              {connectFromItemId
                ? 'Select a second block to complete the connection.'
                : 'Select a block to start a connection.'}
            </div>
            <div className="concept-outline__connect-controls">
              <span className="concept-outline__connect-badge">
                {connectFromItemId ? 'Step 2 of 2' : 'Step 1 of 2'}
              </span>
              <label className="concept-outline__drawer-field">
                <span>Relation</span>
                <select
                  value={connectRelationType}
                  onChange={(event) => setConnectRelationType(event.target.value)}
                >
                  {CONNECTION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              {connectFromItemId && (
                <button
                  type="button"
                  className="ui-quiet-button"
                  onClick={() => setConnectFromItemId('')}
                >
                  Clear first item
                </button>
              )}
            </div>
          </div>
        )}

        {selectedConnections.length > 0 && (
          <div className="concept-outline__connection-summary">
            <p className="concept-outline__connection-title">Connections</p>
            <div className="concept-outline__connection-list">
              {selectedConnections.map((connection) => {
                const otherId = connection.fromItemId === selectedItemId ? connection.toItemId : connection.fromItemId;
                const otherItem = itemById.get(otherId);
                const otherMeta = materialMetaByItemId.get(otherId) || resolveMaterialMeta(otherItem || {}, referenceMap, 0);
                return (
                  <div key={connection.id} className="concept-outline__connection-row">
                    <span>{connection.type} → {otherMeta.title || 'Item'}</span>
                    <button
                      type="button"
                      className="ui-quiet-button"
                      onClick={() => handleDeleteConnection(connection.id)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {workspaceError && <p className="status-message error-message">{workspaceError}</p>}
      </div>

      {drawerOpen && (
        <div className="concept-outline__drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside className="concept-outline__drawer" onClick={(event) => event.stopPropagation()}>
            <div className="concept-outline__drawer-head">
              <div>
                <h3>Add to Concept</h3>
                <p>Search your library and attach material to this concept workspace.</p>
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
                />
              </label>
              <label className="concept-outline__drawer-field">
                <span>Add to section</span>
                <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
                  {groups.map(group => (
                    <option key={group.id} value={group.id}>{group.title}</option>
                  ))}
                </select>
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
                {Array.from({ length: 5 }).map((_, index) => (
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
                  const alreadyAttached = attachedIdsByType[row.type]?.has(String(row.id));
                  return (
                    <div key={rowKey} className="concept-outline__drawer-row">
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
                        onClick={() => handleAttachRow(row)}
                        disabled={alreadyAttached || attachingKey === rowKey}
                      >
                        {attachingKey === rowKey ? 'Adding…' : alreadyAttached ? 'Added' : 'Add'}
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
