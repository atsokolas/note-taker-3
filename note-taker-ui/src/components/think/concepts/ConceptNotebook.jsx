import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Button, QuietButton, SectionHeader } from '../../ui';
import useConceptWorkspace from '../../../hooks/useConceptWorkspace';
import useConceptMaterial from '../../../hooks/useConceptMaterial';

const TRAY_TABS = [
  { value: 'highlights', label: 'Highlights' },
  { value: 'articles', label: 'Articles' }
];

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

const normalizeWorkspace = (workspaceInput = {}) => {
  const source = workspaceInput && typeof workspaceInput === 'object' ? workspaceInput : {};
  const groupsRaw = Array.isArray(source.groups) ? source.groups : [];
  const itemsRaw = Array.isArray(source.items) ? source.items : [];

  const groups = groupsRaw
    .map((group, index) => {
      if (!group) return null;
      return {
        id: clean(group.id) || createId('group'),
        title: clean(group.title) || `Group ${index + 1}`,
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

  return {
    version: 1,
    groups,
    items,
    updatedAt: new Date().toISOString()
  };
};

const sortSiblings = (items, groupId, parentId = '') => (
  items
    .filter(item => item.groupId === groupId && (item.parentId || '') === parentId)
    .sort((a, b) => a.order - b.order)
);

const buildDescendantSet = (items, rootId) => {
  const toDelete = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    items.forEach((item) => {
      if (item.parentId && toDelete.has(item.parentId) && !toDelete.has(item.id)) {
        toDelete.add(item.id);
        changed = true;
      }
    });
  }
  return toDelete;
};

const applyLocalPatch = (workspaceInput, op, payload = {}) => {
  const workspace = normalizeWorkspace(workspaceInput);

  if (op === 'addGroup') {
    workspace.groups.push({
      id: createId('group'),
      title: clean(payload.title) || 'New group',
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
        collapsed: patch.collapsed !== undefined ? Boolean(patch.collapsed) : group.collapsed
      };
    });
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
      order: payload.order !== undefined ? safeOrder(payload.order, siblings.length) : siblings.length
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
    return normalizeWorkspace(workspace);
  }

  return workspace;
};

const resolveMaterialMeta = (item, refMap) => {
  const key = `${item.type}:${item.refId}`;
  const found = refMap.get(key);
  if (found) return found;
  return {
    title: `${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}`,
    snippet: item.refId
  };
};

const GroupDropZone = ({ groupId, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: toGroupDropId(groupId) });
  return (
    <div ref={setNodeRef} className={`concept-outline__group-body ${isOver ? 'is-over' : ''}`}>
      {children}
    </div>
  );
};

const OutlineItemRow = React.memo(({
  item,
  depth,
  selected,
  materialMeta,
  groups,
  onSelect,
  onKeyDown,
  onMoveToGroup,
  onIndent,
  onOutdent,
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
      className={`concept-outline__item ${selected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onClick={() => onSelect(item.id)}
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
        <div className="concept-outline__item-title">{materialMeta.title || 'Untitled'}</div>
        {materialMeta.snippet && <div className="concept-outline__item-snippet">{materialMeta.snippet}</div>}
      </div>
      <details className="concept-outline__menu" onClick={(event) => event.stopPropagation()}>
        <summary>⋯</summary>
        <div className="concept-outline__menu-popover">
          <label>
            Move to group
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
    patchWorkspace
  } = useConceptWorkspace(conceptId, { enabled: Boolean(conceptId) });
  const {
    material,
    loading: materialLoading,
    error: materialError,
    refresh: refreshMaterial
  } = useConceptMaterial(conceptId, { enabled: Boolean(conceptId) });

  const [activeTrayTab, setActiveTrayTab] = useState('highlights');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [groupTitleDraft, setGroupTitleDraft] = useState('');
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'success' });

  const normalizedWorkspace = useMemo(() => normalizeWorkspace(workspace), [workspace]);
  const groups = normalizedWorkspace.groups;
  const items = normalizedWorkspace.items;

  useEffect(() => {
    if (!selectedGroupId || !groups.some(group => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0]?.id || '');
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!selectedItemId || !items.some(item => item.id === selectedItemId)) {
      setSelectedItemId('');
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    if (!toast.message) return undefined;
    const timer = window.setTimeout(() => {
      setToast({ message: '', tone: 'success' });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [toast.message]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const itemById = useMemo(() => {
    const map = new Map();
    items.forEach(item => map.set(item.id, item));
    return map;
  }, [items]);

  const referenceMap = useMemo(() => {
    const map = new Map();
    (material.pinnedHighlights || []).forEach((entry) => {
      map.set(`highlight:${entry._id}`, {
        title: entry.articleTitle || 'Highlight',
        snippet: entry.text || ''
      });
    });
    (material.recentHighlights || []).forEach((entry) => {
      map.set(`highlight:${entry._id}`, {
        title: entry.articleTitle || 'Highlight',
        snippet: entry.text || ''
      });
    });
    (material.linkedArticles || []).forEach((entry) => {
      map.set(`article:${entry._id}`, {
        title: entry.title || 'Article',
        snippet: entry.url || ''
      });
    });
    return map;
  }, [material.linkedArticles, material.pinnedHighlights, material.recentHighlights]);

  const trayRows = useMemo(() => {
    if (activeTrayTab === 'articles') {
      return (material.linkedArticles || []).map((entry) => ({
        id: String(entry._id),
        type: 'article',
        title: entry.title || 'Article',
        snippet: entry.url || '',
        meta: entry.highlightCount !== undefined ? `${entry.highlightCount} highlights` : ''
      }));
    }

    const seen = new Set();
    const list = [];
    [...(material.pinnedHighlights || []), ...(material.recentHighlights || [])].forEach((entry) => {
      const id = String(entry?._id || '');
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({
        id,
        type: 'highlight',
        title: entry.articleTitle || 'Highlight',
        snippet: entry.text || '',
        meta: Array.isArray(entry.tags) ? entry.tags.slice(0, 3).join(' · ') : ''
      });
    });
    return list;
  }, [activeTrayTab, material.linkedArticles, material.pinnedHighlights, material.recentHighlights]);

  const performPatch = useCallback(async ({ op, payload, optimisticWorkspace, successMessage = '' }) => {
    try {
      await patchWorkspace(op, payload, { optimisticWorkspace });
      if (successMessage) {
        setToast({ message: successMessage, tone: 'success' });
      }
    } catch (err) {
      setToast({
        message: err.response?.data?.error || 'Workspace update failed.',
        tone: 'error'
      });
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
      successMessage: 'Group added.'
    });
  }, [groupDescriptionDraft, groupTitleDraft, normalizedWorkspace, performPatch]);

  const handleToggleGroup = useCallback(async (group) => {
    const payload = {
      id: group.id,
      patch: { collapsed: !group.collapsed }
    };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'updateGroup', payload);
    await performPatch({
      op: 'updateGroup',
      payload,
      optimisticWorkspace
    });
  }, [normalizedWorkspace, performPatch]);

  const handleAddTrayItem = useCallback(async (row) => {
    const groupId = selectedGroupId || groups[0]?.id || '';
    if (!groupId) return;
    const payload = {
      type: row.type,
      refId: row.id,
      groupId
    };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'addItem', payload);
    await performPatch({
      op: 'addItem',
      payload,
      optimisticWorkspace,
      successMessage: 'Added to workspace.'
    });
  }, [groups, normalizedWorkspace, performPatch, selectedGroupId]);

  const moveItem = useCallback(async (itemId, movePayload) => {
    const payload = {
      itemId,
      ...movePayload
    };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'moveItem', payload);
    await performPatch({ op: 'moveItem', payload, optimisticWorkspace });
  }, [normalizedWorkspace, performPatch]);

  const handleRemoveItem = useCallback(async (item) => {
    const payload = { itemId: item.id };
    const optimisticWorkspace = applyLocalPatch(normalizedWorkspace, 'deleteItem', payload);
    await performPatch({ op: 'deleteItem', payload, optimisticWorkspace });
  }, [normalizedWorkspace, performPatch]);

  const handleMoveToGroup = useCallback(async (item, groupId) => {
    if (!groupId || groupId === item.groupId) return;
    await moveItem(item.id, { groupId, parentId: '', order: Number.MAX_SAFE_INTEGER });
  }, [moveItem]);

  const handleIndent = useCallback(async (item) => {
    const siblings = sortSiblings(items, item.groupId, item.parentId || '');
    const index = siblings.findIndex(entry => entry.id === item.id);
    if (index <= 0) return;
    const previousSibling = siblings[index - 1];
    const children = sortSiblings(items, item.groupId, previousSibling.id);
    await moveItem(item.id, {
      groupId: item.groupId,
      parentId: previousSibling.id,
      order: children.length
    });
  }, [items, moveItem]);

  const handleOutdent = useCallback(async (item) => {
    if (!item.parentId) return;
    const parent = itemById.get(item.parentId);
    if (!parent) return;
    const nextParentId = parent.parentId || '';
    await moveItem(item.id, {
      groupId: parent.groupId,
      parentId: nextParentId,
      order: parent.order + 1
    });
  }, [itemById, moveItem]);

  const handleKeyboardReorder = useCallback(async (item, direction) => {
    const siblings = sortSiblings(items, item.groupId, item.parentId || '');
    const index = siblings.findIndex(entry => entry.id === item.id);
    if (index < 0) return;
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;
    await moveItem(item.id, {
      groupId: item.groupId,
      parentId: item.parentId || '',
      order: nextIndex
    });
  }, [items, moveItem]);

  const handleItemKeyDown = useCallback(async (event, item) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) await handleOutdent(item);
      else await handleIndent(item);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowUp') {
      event.preventDefault();
      await handleKeyboardReorder(item, 'up');
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowDown') {
      event.preventDefault();
      await handleKeyboardReorder(item, 'down');
    }
  }, [handleIndent, handleKeyboardReorder, handleOutdent]);

  const handleDragEnd = useCallback(async (event) => {
    const activeItemId = fromItemSortableId(event.active?.id);
    if (!activeItemId) return;

    const overItemId = fromItemSortableId(event.over?.id);
    const overGroupId = fromGroupDropId(event.over?.id);
    const activeItem = itemById.get(activeItemId);
    if (!activeItem) return;

    if (overItemId) {
      if (overItemId === activeItemId) return;
      const overItem = itemById.get(overItemId);
      if (!overItem) return;
      const siblings = sortSiblings(items, overItem.groupId, overItem.parentId || '');
      const targetOrder = siblings.findIndex(entry => entry.id === overItem.id);
      await moveItem(activeItem.id, {
        groupId: overItem.groupId,
        parentId: overItem.parentId || '',
        order: targetOrder < 0 ? siblings.length : targetOrder
      });
      return;
    }

    if (overGroupId) {
      const roots = sortSiblings(items, overGroupId, '');
      await moveItem(activeItem.id, {
        groupId: overGroupId,
        parentId: '',
        order: roots.length
      });
    }
  }, [itemById, items, moveItem]);

  function renderBranch(groupId, parentId = '', depth = 0) {
    const siblings = sortSiblings(items, groupId, parentId);
    if (siblings.length === 0) return null;

    return (
      <SortableContext
        items={siblings.map(item => toItemSortableId(item.id))}
        strategy={verticalListSortingStrategy}
      >
        {siblings.map((item) => {
          const children = renderBranch(groupId, item.id, depth + 1);
          const meta = resolveMaterialMeta(item, referenceMap);
          return (
            <div key={item.id} className={`concept-outline__branch ${depth > 0 ? 'is-nested' : ''}`}>
              <OutlineItemRow
                item={item}
                depth={depth}
                selected={selectedItemId === item.id}
                materialMeta={meta}
                groups={groups}
                onSelect={setSelectedItemId}
                onKeyDown={handleItemKeyDown}
                onMoveToGroup={handleMoveToGroup}
                onIndent={handleIndent}
                onOutdent={handleOutdent}
                onRemove={handleRemoveItem}
              />
              {children}
            </div>
          );
        })}
      </SortableContext>
    );
  }

  return (
    <section className="concept-outline">
      {toast.message && (
        <p className={`status-message ${toast.tone === 'error' ? 'error-message' : 'success-message'}`}>
          {toast.message}
        </p>
      )}

      <div className="ui-surface-card concept-outline__tray">
        <SectionHeader
          title="Material Tray"
          subtitle="Add highlights and articles to the current group."
          action={(
            <div className="concept-outline__tray-tabs">
              {TRAY_TABS.map(tab => (
                <button
                  key={tab.value}
                  type="button"
                  className={`ui-quiet-button ${activeTrayTab === tab.value ? 'is-active' : ''}`}
                  onClick={() => setActiveTrayTab(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        />

        {materialLoading ? (
          <div className="concept-outline__tray-list" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`tray-skel-${index}`} className="concept-outline__tray-row is-skeleton">
                <div className="skeleton skeleton-title" style={{ width: `${52 + (index % 3) * 10}%` }} />
                <div className="skeleton skeleton-text" style={{ width: `${45 + (index % 2) * 16}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="concept-outline__tray-list">
            {trayRows.map(row => (
              <div key={`${row.type}:${row.id}`} className="concept-outline__tray-row">
                <div className="concept-outline__tray-copy">
                  <p className="concept-outline__tray-title">{row.title}</p>
                  {row.snippet && <p className="concept-outline__tray-snippet">{row.snippet}</p>}
                  {row.meta && <p className="concept-outline__tray-meta">{row.meta}</p>}
                </div>
                <Button variant="secondary" onClick={() => handleAddTrayItem(row)}>Add</Button>
              </div>
            ))}
            {!materialLoading && trayRows.length === 0 && (
              <p className="muted small">No material available for this tab yet.</p>
            )}
            {materialError && <p className="status-message error-message">{materialError}</p>}
          </div>
        )}
      </div>

      <div className="ui-surface-card concept-outline__workspace">
        <SectionHeader title="Workspace" subtitle="Organize ideas as a readable document outline." />
        <div className="concept-outline__group-create">
          <input
            type="text"
            value={groupTitleDraft}
            onChange={(event) => setGroupTitleDraft(event.target.value)}
            placeholder="New group title"
          />
          <input
            type="text"
            value={groupDescriptionDraft}
            onChange={(event) => setGroupDescriptionDraft(event.target.value)}
            placeholder="Description (optional)"
          />
          <Button variant="secondary" onClick={handleAddGroup}>+ Add group</Button>
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
            <div className="concept-outline__groups">
              {groups.map((group) => {
                const roots = sortSiblings(items, group.id, '');
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
                        aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
                      >
                        {group.collapsed ? '▸' : '▾'}
                      </button>
                      <div className="concept-outline__group-copy">
                        <h3>{group.title}</h3>
                        {group.description && <p>{group.description}</p>}
                      </div>
                      <span className="concept-outline__group-count">{roots.length}</span>
                    </header>

                    {!group.collapsed && (
                      <GroupDropZone groupId={group.id}>
                        {renderBranch(group.id, '', 0) || (
                          <div className="concept-outline__empty">No items in this group.</div>
                        )}
                      </GroupDropZone>
                    )}
                  </section>
                );
              })}
            </div>
          </DndContext>
        )}
        {workspaceError && <p className="status-message error-message">{workspaceError}</p>}
      </div>

      <div className="concept-outline__workspace-footer">
        <QuietButton onClick={refreshMaterial}>Refresh material</QuietButton>
      </div>
    </section>
  );
};

export default ConceptNotebook;
