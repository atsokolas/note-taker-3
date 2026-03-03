const crypto = require('crypto');

const WORKSPACE_VERSION = 1;
const DEFAULT_GROUP_TITLE = 'Workspace';
const WORKSPACE_ITEM_TYPES = new Set(['highlight', 'article', 'note', 'question']);
const WORKSPACE_ITEM_STAGES = new Set(['inbox', 'working', 'draft', 'archive']);
const LEGACY_STAGE_MAP = {
  claim: 'draft',
  evidence: 'draft'
};
const WORKSPACE_ITEM_STATUSES = new Set(['active', 'archived']);
const WORKSPACE_CONNECTION_TYPES = new Set(['supports', 'contradicts', 'related']);

const STAGE_SECTION_DEFAULTS = [
  { id: 'inbox', title: 'Inbox', description: '', collapsed: false },
  { id: 'working', title: 'Working', description: '', collapsed: false },
  { id: 'draft', title: 'Draft', description: '', collapsed: true },
  { id: 'archive', title: 'Archive', description: '', collapsed: true }
];

const makeId = () => (
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const toSafeString = (value) => String(value || '').trim();
const toSafeOrder = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const toSafeStatus = (value, fallback = 'active') => {
  const status = toSafeString(value).toLowerCase();
  return WORKSPACE_ITEM_STATUSES.has(status) ? status : fallback;
};
const toSafeConnectionType = (value, fallback = 'related') => {
  const type = toSafeString(value).toLowerCase();
  return WORKSPACE_CONNECTION_TYPES.has(type) ? type : fallback;
};
const toSafeHtml = (value, fallback = '') => String(value ?? fallback).trim().slice(0, 32000);

const normalizeStage = (value, fallback = 'working') => {
  const raw = toSafeString(value).toLowerCase();
  const stage = LEGACY_STAGE_MAP[raw] || raw;
  return WORKSPACE_ITEM_STAGES.has(stage) ? stage : fallback;
};

const defaultSections = () => STAGE_SECTION_DEFAULTS.map((section, index) => ({
  ...section,
  order: index
}));

const toLegacyGroup = (section) => ({
  id: section.id,
  title: section.title,
  description: section.description,
  collapsed: Boolean(section.collapsed),
  order: toSafeOrder(section.order)
});

const toLegacyItem = (item) => ({
  id: item.id,
  type: item.type,
  refId: item.refId,
  groupId: item.sectionId,
  parentId: item.parentId || '',
  inlineTitle: item.inlineTitle || '',
  inlineText: item.inlineText || '',
  stage: item.stage,
  status: item.status,
  order: toSafeOrder(item.order)
});

const toCanonicalSection = (group) => ({
  id: toSafeString(group.id) || makeId(),
  title: toSafeString(group.title) || DEFAULT_GROUP_TITLE,
  description: toSafeString(group.description),
  collapsed: Boolean(group.collapsed),
  order: toSafeOrder(group.order)
});

const toCanonicalItem = (item, index = 0) => {
  const rawStatus = toSafeStatus(item.status, 'active');
  const fallbackStage = rawStatus === 'archived' ? 'archive' : 'working';
  const stage = normalizeStage(item.stage, fallbackStage);
  const status = stage === 'archive' ? 'archived' : rawStatus;
  return {
    id: toSafeString(item.id) || makeId(),
    type: toSafeString(item.type).toLowerCase(),
    refId: toSafeString(item.refId),
    sectionId: toSafeString(item.sectionId || item.groupId),
    parentId: toSafeString(item.parentId),
    inlineTitle: toSafeString(item.inlineTitle).slice(0, 160),
    inlineText: toSafeHtml(item.inlineText),
    stage,
    status,
    order: toSafeOrder(item.order, index)
  };
};

const cloneWorkspace = (workspace) => JSON.parse(JSON.stringify(workspace || {}));
const sectionScopeKey = (sectionId, parentId = '') => `${sectionId}::${parentId || ''}`;

const ensureStageSections = (sections) => {
  const byId = new Map();
  sections.forEach((section) => {
    const id = toSafeString(section.id);
    if (!id || byId.has(id)) return;
    byId.set(id, section);
  });

  STAGE_SECTION_DEFAULTS.forEach((defaults) => {
    if (byId.has(defaults.id)) return;
    byId.set(defaults.id, {
      id: defaults.id,
      title: defaults.title,
      description: defaults.description,
      collapsed: defaults.collapsed,
      order: defaults.id === 'draft' || defaults.id === 'archive' ? 10 : 0
    });
  });

  return Array.from(byId.values())
    .sort((a, b) => toSafeOrder(a.order) - toSafeOrder(b.order))
    .map((section, index) => ({
      ...section,
      order: index
    }));
};

const normalizeOrders = (workspaceInput, scopeInput) => {
  const workspace = workspaceInput && typeof workspaceInput === 'object'
    ? workspaceInput
    : {
      version: WORKSPACE_VERSION,
      outlineSections: defaultSections(),
      attachedItems: [],
      connections: [],
      updatedAt: new Date().toISOString()
    };

  const sections = Array.isArray(workspace.outlineSections)
    ? workspace.outlineSections
    : (Array.isArray(workspace.groups) ? workspace.groups : []);

  const items = Array.isArray(workspace.attachedItems)
    ? workspace.attachedItems
    : (Array.isArray(workspace.items) ? workspace.items : []);

  workspace.outlineSections = ensureStageSections(
    sections.map(toCanonicalSection)
  );

  const sectionIds = new Set(workspace.outlineSections.map(section => section.id));

  workspace.attachedItems = items
    .map((item, index) => toCanonicalItem(item, index))
    .filter((item) => {
      if (!WORKSPACE_ITEM_TYPES.has(item.type)) return false;
      if (!item.refId) return false;
      if (!sectionIds.has(item.sectionId)) {
        item.sectionId = sectionIds.has(item.stage) ? item.stage : workspace.outlineSections[0]?.id;
      }
      if (!item.sectionId) return false;
      return true;
    });

  const itemById = new Map();
  const dedupedItems = [];
  workspace.attachedItems.forEach((item) => {
    let nextId = item.id;
    while (itemById.has(nextId)) nextId = makeId();
    if (nextId !== item.id) item.id = nextId;
    itemById.set(item.id, item);
    dedupedItems.push(item);
  });
  workspace.attachedItems = dedupedItems;

  workspace.attachedItems.forEach((item) => {
    if (!item.parentId) return;
    const parent = itemById.get(item.parentId);
    if (!parent || parent.sectionId !== item.sectionId || parent.id === item.id) {
      item.parentId = '';
    }
  });

  workspace.attachedItems.forEach((item) => {
    let cursor = item.parentId;
    const visited = new Set([item.id]);
    while (cursor) {
      if (visited.has(cursor)) {
        item.parentId = '';
        break;
      }
      visited.add(cursor);
      const parent = itemById.get(cursor);
      if (!parent) {
        item.parentId = '';
        break;
      }
      cursor = parent.parentId || '';
    }
  });

  const allScopes = new Set();
  workspace.attachedItems.forEach((item) => {
    allScopes.add(sectionScopeKey(item.sectionId, item.parentId));
  });

  const scopeList = Array.isArray(scopeInput) ? scopeInput : (scopeInput ? [scopeInput] : []);
  scopeList.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const sectionId = toSafeString(entry.sectionId || entry.groupId);
    if (!sectionId) return;
    allScopes.add(sectionScopeKey(sectionId, toSafeString(entry.parentId)));
  });

  allScopes.forEach((scopeKey) => {
    const [sectionId, parentId = ''] = scopeKey.split('::');
    const siblings = workspace.attachedItems
      .filter(item => item.sectionId === sectionId && (item.parentId || '') === parentId)
      .map((item, index) => ({ item, index }));

    siblings
      .sort((a, b) => {
        const delta = toSafeOrder(a.item.order) - toSafeOrder(b.item.order);
        if (delta !== 0) return delta;
        return a.index - b.index;
      })
      .forEach((entry, index) => {
        entry.item.order = index;
      });
  });

  const seenConnectionKey = new Set();
  workspace.connections = Array.isArray(workspace.connections)
    ? workspace.connections
        .map((connection) => {
          if (!connection || typeof connection !== 'object') return null;
          const fromItemId = toSafeString(connection.fromItemId);
          const toItemId = toSafeString(connection.toItemId);
          if (!fromItemId || !toItemId || fromItemId === toItemId) return null;
          if (!itemById.has(fromItemId) || !itemById.has(toItemId)) return null;
          const type = toSafeConnectionType(connection.type, '');
          if (!type) return null;
          const key = `${fromItemId}:${toItemId}:${type}`;
          if (seenConnectionKey.has(key)) return null;
          seenConnectionKey.add(key);
          return {
            id: toSafeString(connection.id) || makeId(),
            fromItemId,
            toItemId,
            type
          };
        })
        .filter(Boolean)
    : [];

  workspace.version = WORKSPACE_VERSION;
  workspace.updatedAt = new Date().toISOString();
  workspace.groups = workspace.outlineSections.map(toLegacyGroup);
  workspace.items = workspace.attachedItems.map(toLegacyItem);

  return workspace;
};

const ensureWorkspace = (concept) => {
  const source = concept && typeof concept === 'object' ? concept.workspace || {} : {};
  return normalizeOrders({
    version: WORKSPACE_VERSION,
    outlineSections: Array.isArray(source.outlineSections)
      ? source.outlineSections
      : (Array.isArray(source.groups) ? source.groups : defaultSections()),
    attachedItems: Array.isArray(source.attachedItems)
      ? source.attachedItems
      : (Array.isArray(source.items) ? source.items : []),
    connections: Array.isArray(source.connections) ? source.connections : [],
    updatedAt: source.updatedAt || new Date().toISOString()
  });
};

const validateWorkspacePayload = (workspaceInput) => {
  const source = workspaceInput && typeof workspaceInput === 'object' ? workspaceInput : {};
  if (source.version !== undefined && Number(source.version) !== WORKSPACE_VERSION) {
    throw new Error(`workspace.version must be ${WORKSPACE_VERSION}.`);
  }

  const sections = Array.isArray(source.outlineSections)
    ? source.outlineSections
    : (Array.isArray(source.groups) ? source.groups : []);
  const items = Array.isArray(source.attachedItems)
    ? source.attachedItems
    : (Array.isArray(source.items) ? source.items : []);

  const sectionIds = new Set();
  sections.forEach((section, index) => {
    const id = toSafeString(section?.id);
    if (!id) throw new Error(`outlineSections[${index}] is missing id.`);
    if (sectionIds.has(id)) throw new Error(`Duplicate outline section id: ${id}`);
    sectionIds.add(id);
  });

  const itemIds = new Set();
  items.forEach((item, index) => {
    const id = toSafeString(item?.id);
    if (!id) throw new Error(`attachedItems[${index}] is missing id.`);
    if (itemIds.has(id)) throw new Error(`Duplicate attached item id: ${id}`);
    itemIds.add(id);

    const type = toSafeString(item?.type).toLowerCase();
    if (!WORKSPACE_ITEM_TYPES.has(type)) {
      throw new Error(`attachedItems[${index}] has unknown type: ${type || '(empty)'}`);
    }

    const refId = toSafeString(item?.refId);
    if (!refId) throw new Error(`attachedItems[${index}] is missing refId.`);

    const sectionId = toSafeString(item?.sectionId || item?.groupId);
    if (sectionId && sections.length > 0 && !sectionIds.has(sectionId)) {
      throw new Error(`attachedItems[${index}] has invalid sectionId: ${sectionId}`);
    }

    const stageRaw = item?.stage;
    if (stageRaw !== undefined) {
      const normalized = normalizeStage(stageRaw, '');
      if (!normalized) {
        throw new Error(`attachedItems[${index}] has invalid stage: ${toSafeString(stageRaw) || '(empty)'}`);
      }
    }

    const statusRaw = item?.status;
    if (statusRaw !== undefined && !WORKSPACE_ITEM_STATUSES.has(toSafeString(statusRaw).toLowerCase())) {
      throw new Error(`attachedItems[${index}] has invalid status: ${toSafeString(statusRaw) || '(empty)'}`);
    }

    const order = Number(item?.order);
    if (!Number.isFinite(order)) {
      throw new Error(`attachedItems[${index}] has non-numeric order.`);
    }
  });
};

const isDescendant = (items, candidateParentId, itemId) => {
  const byParent = new Map();
  items.forEach((item) => {
    const parent = toSafeString(item.parentId);
    if (!parent) return;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(item.id);
  });

  const stack = [candidateParentId];
  const visited = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (current === itemId) return true;
    const children = byParent.get(current) || [];
    children.forEach(child => stack.push(child));
  }
  return false;
};

const applyPatchOp = (workspaceInput, opInput) => {
  const workspace = ensureWorkspace({ workspace: cloneWorkspace(workspaceInput) });
  const operation = toSafeString(opInput?.op);
  const payload = opInput && typeof opInput.payload === 'object' && opInput.payload
    ? opInput.payload
    : {};

  if (!operation) {
    throw new Error('PATCH body must include op.');
  }

  const getSection = (sectionId) => workspace.outlineSections.find(section => section.id === sectionId);
  const getItem = (itemId) => workspace.attachedItems.find(item => item.id === itemId);
  const pruneConnections = () => {
    const itemIds = new Set(workspace.attachedItems.map(item => item.id));
    workspace.connections = (workspace.connections || []).filter((connection) => (
      itemIds.has(connection.fromItemId)
      && itemIds.has(connection.toItemId)
      && connection.fromItemId !== connection.toItemId
      && WORKSPACE_CONNECTION_TYPES.has(toSafeConnectionType(connection.type, ''))
    ));
  };

  if (operation === 'addGroup') {
    const title = toSafeString(payload.title);
    if (!title) throw new Error('addGroup requires title.');
    workspace.outlineSections.push({
      id: makeId(),
      title,
      description: toSafeString(payload.description),
      collapsed: Boolean(payload.collapsed),
      order: workspace.outlineSections.length
    });
    return normalizeOrders(workspace);
  }

  if (operation === 'updateGroup') {
    const sectionId = toSafeString(payload.id);
    const section = getSection(sectionId);
    if (!section) throw new Error('Section not found.');
    const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : payload;

    if (patch.title !== undefined) {
      const title = toSafeString(patch.title);
      if (!title) throw new Error('Section title cannot be empty.');
      section.title = title;
    }
    if (patch.description !== undefined) section.description = toSafeString(patch.description);
    if (patch.collapsed !== undefined) section.collapsed = Boolean(patch.collapsed);
    if (patch.order !== undefined) section.order = toSafeOrder(patch.order, section.order);

    return normalizeOrders(workspace);
  }

  if (operation === 'moveGroup') {
    const sectionId = toSafeString(payload.id || payload.groupId);
    const ordered = [...workspace.outlineSections].sort((a, b) => toSafeOrder(a.order) - toSafeOrder(b.order));
    const sourceIndex = ordered.findIndex(section => section.id === sectionId);
    if (sourceIndex < 0) throw new Error('Section not found.');
    const targetIndex = Math.max(0, Math.min(ordered.length - 1, Math.round(toSafeOrder(payload.order, sourceIndex))));

    if (sourceIndex !== targetIndex) {
      const [moved] = ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, moved);
      ordered.forEach((section, index) => {
        section.order = index;
      });
      workspace.outlineSections = ordered;
    }
    return normalizeOrders(workspace);
  }

  if (operation === 'deleteGroup') {
    const sectionId = toSafeString(payload.id);
    const section = getSection(sectionId);
    if (!section) throw new Error('Section not found.');

    let target = workspace.outlineSections.find(entry => entry.id !== sectionId);
    if (!target) {
      target = defaultSections()[0];
      workspace.outlineSections.push(target);
    }

    workspace.attachedItems.forEach((item) => {
      if (item.sectionId === sectionId) {
        item.sectionId = target.id;
      }
    });

    workspace.outlineSections = workspace.outlineSections.filter(entry => entry.id !== sectionId);
    pruneConnections();
    return normalizeOrders(workspace);
  }

  if (operation === 'addItem') {
    const type = toSafeString(payload.type).toLowerCase();
    if (!WORKSPACE_ITEM_TYPES.has(type)) throw new Error('addItem has unknown type.');

    const refId = toSafeString(payload.refId);
    if (!refId) throw new Error('addItem requires refId.');

    const requestedStage = normalizeStage(payload.stage, 'inbox');
    const requestedSectionId = toSafeString(payload.sectionId || payload.groupId) || requestedStage;
    const sectionId = getSection(requestedSectionId)
      ? requestedSectionId
      : (getSection(requestedStage) ? requestedStage : workspace.outlineSections[0]?.id);
    if (!sectionId) throw new Error('No outline section available.');

    const parentId = toSafeString(payload.parentId);
    if (parentId) {
      const parent = getItem(parentId);
      if (!parent || parent.sectionId !== sectionId) {
        throw new Error('addItem parentId must reference an item in the same section.');
      }
    }

    const siblings = workspace.attachedItems.filter(item => item.sectionId === sectionId && (item.parentId || '') === parentId);
    const requestedOrder = payload.order !== undefined ? toSafeOrder(payload.order, siblings.length) : siblings.length;

    workspace.attachedItems.push({
      id: makeId(),
      type,
      refId,
      sectionId,
      parentId: parentId || '',
      inlineTitle: toSafeString(payload.inlineTitle).slice(0, 160),
      inlineText: toSafeHtml(payload.inlineText),
      stage: requestedStage,
      status: requestedStage === 'archive' ? 'archived' : toSafeStatus(payload.status, 'active'),
      order: requestedOrder
    });

    return normalizeOrders(workspace, { sectionId, parentId });
  }

  if (operation === 'moveItem') {
    const itemId = toSafeString(payload.itemId);
    const item = getItem(itemId);
    if (!item) throw new Error('Item not found.');

    const sourceScope = { sectionId: item.sectionId, parentId: item.parentId || '' };
    const nextSectionId = toSafeString(payload.sectionId || payload.groupId) || item.sectionId;
    if (!getSection(nextSectionId)) throw new Error('moveItem requires a valid sectionId.');

    const hasParentChange = Object.prototype.hasOwnProperty.call(payload, 'parentId');
    const nextParentId = hasParentChange
      ? toSafeString(payload.parentId)
      : (nextSectionId === item.sectionId ? (item.parentId || '') : '');

    if (nextParentId) {
      const parent = getItem(nextParentId);
      if (!parent || parent.sectionId !== nextSectionId) {
        throw new Error('moveItem parentId must reference an item in the same section.');
      }
      if (parent.id === item.id || isDescendant(workspace.attachedItems, parent.id, item.id)) {
        throw new Error('moveItem parentId cannot create a cycle.');
      }
    }

    item.sectionId = nextSectionId;
    item.parentId = nextParentId || '';
    if (payload.order !== undefined) {
      item.order = toSafeOrder(payload.order, item.order);
    } else if (sourceScope.sectionId !== item.sectionId || sourceScope.parentId !== item.parentId) {
      item.order = Number.MAX_SAFE_INTEGER;
    }

    return normalizeOrders(workspace, [sourceScope, { sectionId: item.sectionId, parentId: item.parentId }]);
  }

  if (operation === 'updateItem') {
    const itemId = toSafeString(payload.itemId || payload.id);
    const item = getItem(itemId);
    if (!item) throw new Error('Item not found.');

    const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : payload;
    if (patch.type !== undefined) {
      const type = toSafeString(patch.type).toLowerCase();
      if (!WORKSPACE_ITEM_TYPES.has(type)) throw new Error('updateItem has unknown type.');
      item.type = type;
    }
    if (patch.refId !== undefined) {
      const refId = toSafeString(patch.refId);
      if (!refId) throw new Error('updateItem refId cannot be empty.');
      item.refId = refId;
    }
    if (patch.stage !== undefined) {
      item.stage = normalizeStage(patch.stage, item.stage || 'working');
      item.status = item.stage === 'archive' ? 'archived' : 'active';
      if (getSection(item.stage)) {
        item.sectionId = item.stage;
      }
    }
    if (patch.status !== undefined) {
      const status = toSafeStatus(patch.status, item.status || 'active');
      item.status = status;
      if (status === 'archived') {
        item.stage = 'archive';
        if (getSection('archive')) item.sectionId = 'archive';
      }
    }
    if (patch.inlineTitle !== undefined) item.inlineTitle = toSafeString(patch.inlineTitle).slice(0, 160);
    if (patch.inlineText !== undefined) item.inlineText = toSafeHtml(patch.inlineText);

    const hasMoveBits = (
      patch.sectionId !== undefined
      || patch.groupId !== undefined
      || Object.prototype.hasOwnProperty.call(patch, 'parentId')
      || patch.order !== undefined
    );

    if (hasMoveBits) {
      return applyPatchOp(workspace, {
        op: 'moveItem',
        payload: {
          itemId,
          ...(patch.sectionId !== undefined ? { sectionId: patch.sectionId } : {}),
          ...(patch.groupId !== undefined ? { groupId: patch.groupId } : {}),
          ...(Object.prototype.hasOwnProperty.call(patch, 'parentId') ? { parentId: patch.parentId } : {}),
          ...(patch.order !== undefined ? { order: patch.order } : {})
        }
      });
    }

    return normalizeOrders(workspace, { sectionId: item.sectionId, parentId: item.parentId });
  }

  if (operation === 'deleteItem') {
    const itemId = toSafeString(payload.itemId || payload.id);
    const root = getItem(itemId);
    if (!root) throw new Error('Item not found.');

    const toDelete = new Set([itemId]);
    let changed = true;
    while (changed) {
      changed = false;
      workspace.attachedItems.forEach((item) => {
        if (item.parentId && toDelete.has(item.parentId) && !toDelete.has(item.id)) {
          toDelete.add(item.id);
          changed = true;
        }
      });
    }

    workspace.attachedItems = workspace.attachedItems.filter(item => !toDelete.has(item.id));
    pruneConnections();
    return normalizeOrders(workspace);
  }

  if (operation === 'addConnection') {
    const fromItemId = toSafeString(payload.fromItemId);
    const toItemId = toSafeString(payload.toItemId);
    if (!fromItemId || !toItemId) throw new Error('addConnection requires fromItemId and toItemId.');
    if (fromItemId === toItemId) throw new Error('Cannot connect an item to itself.');
    if (!getItem(fromItemId) || !getItem(toItemId)) throw new Error('addConnection references unknown items.');
    const type = toSafeConnectionType(payload.type, '');
    if (!type) throw new Error('addConnection requires a valid type.');

    const exists = (workspace.connections || []).some((connection) => (
      connection.fromItemId === fromItemId
      && connection.toItemId === toItemId
      && connection.type === type
    ));
    if (exists) return normalizeOrders(workspace);

    workspace.connections = [
      ...(workspace.connections || []),
      {
        id: makeId(),
        fromItemId,
        toItemId,
        type
      }
    ];
    return normalizeOrders(workspace);
  }

  if (operation === 'deleteConnection') {
    const id = toSafeString(payload.id || payload.connectionId);
    const fromItemId = toSafeString(payload.fromItemId);
    const toItemId = toSafeString(payload.toItemId);
    const type = toSafeConnectionType(payload.type, '');
    const initialLength = (workspace.connections || []).length;

    workspace.connections = (workspace.connections || []).filter((connection) => {
      if (id) return connection.id !== id;
      if (fromItemId && toItemId && type) {
        return !(
          connection.fromItemId === fromItemId
          && connection.toItemId === toItemId
          && connection.type === type
        );
      }
      return true;
    });

    if (workspace.connections.length === initialLength) {
      throw new Error('Connection not found.');
    }
    return normalizeOrders(workspace);
  }

  throw new Error(`Unsupported workspace op: ${operation}`);
};

module.exports = {
  WORKSPACE_VERSION,
  DEFAULT_GROUP_TITLE,
  WORKSPACE_ITEM_TYPES,
  WORKSPACE_ITEM_STAGES,
  WORKSPACE_ITEM_STATUSES,
  WORKSPACE_CONNECTION_TYPES,
  ensureWorkspace,
  normalizeOrders,
  applyPatchOp,
  validateWorkspacePayload
};
