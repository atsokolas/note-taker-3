const crypto = require('crypto');

const WORKSPACE_VERSION = 1;
const DEFAULT_GROUP_TITLE = 'Workspace';
const WORKSPACE_ITEM_TYPES = new Set(['highlight', 'article', 'note', 'question']);
const WORKSPACE_ITEM_STAGES = new Set(['inbox', 'working', 'claim', 'evidence']);
const WORKSPACE_ITEM_STATUSES = new Set(['active', 'archived']);
const WORKSPACE_CONNECTION_TYPES = new Set(['supports', 'contradicts', 'related']);

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
const toSafeStage = (value, fallback = 'working') => {
  const stage = toSafeString(value).toLowerCase();
  return WORKSPACE_ITEM_STAGES.has(stage) ? stage : fallback;
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

const makeDefaultGroup = (order = 0) => ({
  id: makeId(),
  title: DEFAULT_GROUP_TITLE,
  description: '',
  collapsed: false,
  order
});

const cloneWorkspace = (workspace) => JSON.parse(JSON.stringify(workspace || {}));

const workspaceKey = (groupId, parentId = '') => `${groupId}::${parentId || ''}`;

const normalizeOrders = (workspaceInput, scope) => {
  const workspace = workspaceInput && typeof workspaceInput === 'object'
    ? workspaceInput
    : {
      version: WORKSPACE_VERSION,
      groups: [makeDefaultGroup(0)],
      items: [],
      connections: [],
      updatedAt: new Date().toISOString()
    };

  if (!Array.isArray(workspace.groups) || workspace.groups.length === 0) {
    workspace.groups = [makeDefaultGroup(0)];
  }
  if (!Array.isArray(workspace.items)) {
    workspace.items = [];
  }
  if (!Array.isArray(workspace.connections)) {
    workspace.connections = [];
  }

  workspace.groups = [...workspace.groups]
    .sort((a, b) => toSafeOrder(a.order) - toSafeOrder(b.order))
    .map((group, index) => ({ ...group, order: index }));

  const allScopes = new Set();
  workspace.items.forEach((item) => {
    allScopes.add(workspaceKey(item.groupId, item.parentId));
  });

  const scoped = Array.isArray(scope) ? scope : (scope ? [scope] : []);
  if (scoped.length > 0) {
    scoped.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const groupId = toSafeString(entry.groupId);
      if (!groupId) return;
      allScopes.add(workspaceKey(groupId, toSafeString(entry.parentId)));
    });
  }

  allScopes.forEach((key) => {
    const [groupId, parentId = ''] = key.split('::');
    const siblings = workspace.items
      .filter(item => item.groupId === groupId && (item.parentId || '') === parentId)
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

  workspace.updatedAt = new Date().toISOString();
  return workspace;
};

const ensureWorkspace = (concept) => {
  const source = concept && typeof concept === 'object' ? concept.workspace || {} : {};

  const groups = [];
  const seenGroups = new Set();
  if (Array.isArray(source.groups)) {
    source.groups.forEach((rawGroup, index) => {
      if (!rawGroup || typeof rawGroup !== 'object') return;
      let id = toSafeString(rawGroup.id) || makeId();
      while (seenGroups.has(id)) id = makeId();
      seenGroups.add(id);
      groups.push({
        id,
        title: toSafeString(rawGroup.title) || `Group ${groups.length + 1}`,
        description: toSafeString(rawGroup.description),
        collapsed: Boolean(rawGroup.collapsed),
        order: toSafeOrder(rawGroup.order, index)
      });
    });
  }

  if (groups.length === 0) {
    groups.push(makeDefaultGroup(0));
  }

  const groupIdSet = new Set(groups.map(group => group.id));
  const defaultGroupId = groups[0].id;

  const items = [];
  const seenItems = new Set();
  if (Array.isArray(source.items)) {
    source.items.forEach((rawItem, index) => {
      if (!rawItem || typeof rawItem !== 'object') return;
      const type = toSafeString(rawItem.type).toLowerCase();
      if (!WORKSPACE_ITEM_TYPES.has(type)) return;
      const refId = toSafeString(rawItem.refId);
      if (!refId) return;

      let id = toSafeString(rawItem.id) || makeId();
      while (seenItems.has(id)) id = makeId();
      seenItems.add(id);

      const requestedGroupId = toSafeString(rawItem.groupId);
      const groupId = groupIdSet.has(requestedGroupId) ? requestedGroupId : defaultGroupId;
      const parentId = toSafeString(rawItem.parentId);

      items.push({
        id,
        type,
        refId,
        groupId,
        parentId: parentId || '',
        inlineTitle: toSafeString(rawItem.inlineTitle).slice(0, 160),
        inlineText: toSafeHtml(rawItem.inlineText),
        stage: toSafeStage(rawItem.stage),
        status: toSafeStatus(rawItem.status),
        order: toSafeOrder(rawItem.order, index)
      });
    });
  }

  const itemById = new Map(items.map(item => [item.id, item]));
  items.forEach((item) => {
    if (!item.parentId) return;
    const parent = itemById.get(item.parentId);
    if (!parent || parent.groupId !== item.groupId || parent.id === item.id) {
      item.parentId = '';
    }
  });

  items.forEach((item) => {
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

  const connections = [];
  const seenConnections = new Set();
  if (Array.isArray(source.connections)) {
    source.connections.forEach((rawConnection) => {
      if (!rawConnection || typeof rawConnection !== 'object') return;
      const fromItemId = toSafeString(rawConnection.fromItemId);
      const toItemId = toSafeString(rawConnection.toItemId);
      if (!fromItemId || !toItemId || fromItemId === toItemId) return;
      if (!itemById.has(fromItemId) || !itemById.has(toItemId)) return;
      const type = toSafeConnectionType(rawConnection.type, '');
      if (!type) return;
      const id = toSafeString(rawConnection.id) || makeId();
      const key = `${fromItemId}:${toItemId}:${type}`;
      if (seenConnections.has(key)) return;
      seenConnections.add(key);
      connections.push({
        id,
        fromItemId,
        toItemId,
        type
      });
    });
  }

  const workspace = {
    version: WORKSPACE_VERSION,
    groups,
    items,
    connections,
    updatedAt: new Date().toISOString()
  };
  return normalizeOrders(workspace);
};

const validateWorkspacePayload = (workspaceInput) => {
  const source = workspaceInput && typeof workspaceInput === 'object' ? workspaceInput : {};
  const groups = Array.isArray(source.groups) ? source.groups : [];
  const items = Array.isArray(source.items) ? source.items : [];
  const connections = Array.isArray(source.connections) ? source.connections : [];

  const groupIds = new Set();
  groups.forEach((group, index) => {
    const id = toSafeString(group?.id);
    if (!id) throw new Error(`groups[${index}] is missing id.`);
    if (groupIds.has(id)) throw new Error(`Duplicate group id: ${id}`);
    groupIds.add(id);
  });

  const itemIds = new Set();
  const itemMap = new Map();
  items.forEach((item, index) => {
    const id = toSafeString(item?.id);
    if (!id) throw new Error(`items[${index}] is missing id.`);
    if (itemIds.has(id)) throw new Error(`Duplicate item id: ${id}`);
    itemIds.add(id);

    const type = toSafeString(item?.type).toLowerCase();
    if (!WORKSPACE_ITEM_TYPES.has(type)) {
      throw new Error(`items[${index}] has unknown type: ${type || '(empty)'}`);
    }

    const refId = toSafeString(item?.refId);
    if (!refId) throw new Error(`items[${index}] is missing refId.`);

    const groupId = toSafeString(item?.groupId);
    if (!groupId || !groupIds.has(groupId)) {
      throw new Error(`items[${index}] has invalid groupId: ${groupId || '(empty)'}`);
    }

    const order = Number(item?.order);
    if (!Number.isFinite(order)) {
      throw new Error(`items[${index}] has non-numeric order.`);
    }

    const stageRaw = item?.stage;
    if (stageRaw !== undefined && !WORKSPACE_ITEM_STAGES.has(toSafeString(stageRaw).toLowerCase())) {
      throw new Error(`items[${index}] has invalid stage: ${toSafeString(stageRaw) || '(empty)'}`);
    }

    const statusRaw = item?.status;
    if (statusRaw !== undefined && !WORKSPACE_ITEM_STATUSES.has(toSafeString(statusRaw).toLowerCase())) {
      throw new Error(`items[${index}] has invalid status: ${toSafeString(statusRaw) || '(empty)'}`);
    }

    const inlineTitleRaw = item?.inlineTitle;
    if (inlineTitleRaw !== undefined && typeof inlineTitleRaw !== 'string') {
      throw new Error(`items[${index}] has invalid inlineTitle.`);
    }
    const inlineTextRaw = item?.inlineText;
    if (inlineTextRaw !== undefined && typeof inlineTextRaw !== 'string') {
      throw new Error(`items[${index}] has invalid inlineText.`);
    }

    itemMap.set(id, {
      id,
      groupId,
      parentId: toSafeString(item?.parentId)
    });
  });

  items.forEach((item, index) => {
    const parentId = toSafeString(item?.parentId);
    if (!parentId) return;
    const parent = itemMap.get(parentId);
    if (!parent) throw new Error(`items[${index}] has invalid parentId: ${parentId}`);
    if (parent.groupId !== toSafeString(item?.groupId)) {
      throw new Error(`items[${index}] parentId must be in the same groupId.`);
    }
  });

  const connectionIds = new Set();
  const connectionKeys = new Set();
  connections.forEach((connection, index) => {
    const id = toSafeString(connection?.id);
    if (!id) throw new Error(`connections[${index}] is missing id.`);
    if (connectionIds.has(id)) throw new Error(`Duplicate connection id: ${id}`);
    connectionIds.add(id);

    const fromItemId = toSafeString(connection?.fromItemId);
    const toItemId = toSafeString(connection?.toItemId);
    if (!fromItemId || !toItemId) throw new Error(`connections[${index}] requires fromItemId and toItemId.`);
    if (fromItemId === toItemId) throw new Error(`connections[${index}] cannot connect an item to itself.`);
    if (!itemMap.has(fromItemId) || !itemMap.has(toItemId)) {
      throw new Error(`connections[${index}] references unknown item ids.`);
    }
    const type = toSafeString(connection?.type).toLowerCase();
    if (!WORKSPACE_CONNECTION_TYPES.has(type)) {
      throw new Error(`connections[${index}] has invalid type.`);
    }
    const key = `${fromItemId}:${toItemId}:${type}`;
    if (connectionKeys.has(key)) {
      throw new Error(`Duplicate connection between ${fromItemId} and ${toItemId}.`);
    }
    connectionKeys.add(key);
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

  const getGroup = (groupId) => workspace.groups.find(group => group.id === groupId);
  const getItem = (itemId) => workspace.items.find(item => item.id === itemId);
  const pruneConnections = () => {
    const itemIds = new Set(workspace.items.map(item => item.id));
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
    workspace.groups.push({
      id: makeId(),
      title,
      description: toSafeString(payload.description),
      collapsed: Boolean(payload.collapsed),
      order: workspace.groups.length
    });
    return normalizeOrders(workspace);
  }

  if (operation === 'updateGroup') {
    const groupId = toSafeString(payload.id);
    const group = getGroup(groupId);
    if (!group) throw new Error('Group not found.');
    const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : payload;
    if (patch.title !== undefined) {
      const title = toSafeString(patch.title);
      if (!title) throw new Error('Group title cannot be empty.');
      group.title = title;
    }
    if (patch.description !== undefined) group.description = toSafeString(patch.description);
    if (patch.collapsed !== undefined) group.collapsed = Boolean(patch.collapsed);
    if (patch.order !== undefined) group.order = toSafeOrder(patch.order, group.order);
    return normalizeOrders(workspace);
  }

  if (operation === 'moveGroup') {
    const groupId = toSafeString(payload.id || payload.groupId);
    const existing = workspace.groups.find(group => group.id === groupId);
    if (!existing) throw new Error('Group not found.');
    const ordered = [...workspace.groups].sort((a, b) => toSafeOrder(a.order) - toSafeOrder(b.order));
    const sourceIndex = ordered.findIndex(group => group.id === groupId);
    if (sourceIndex < 0) throw new Error('Group not found.');
    const requestedOrder = toSafeOrder(payload.order, sourceIndex);
    const targetIndex = Math.max(0, Math.min(ordered.length - 1, Math.round(requestedOrder)));
    if (sourceIndex !== targetIndex) {
      const [moved] = ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, moved);
      ordered.forEach((group, index) => {
        group.order = index;
      });
      workspace.groups = ordered;
    }
    return normalizeOrders(workspace);
  }

  if (operation === 'deleteGroup') {
    const groupId = toSafeString(payload.id);
    const group = getGroup(groupId);
    if (!group) throw new Error('Group not found.');

    let targetGroup = workspace.groups.find(entry => entry.id !== groupId);
    if (!targetGroup) {
      targetGroup = makeDefaultGroup(0);
      workspace.groups.push(targetGroup);
    }

    workspace.items.forEach((item) => {
      if (item.groupId !== groupId) return;
      item.groupId = targetGroup.id;
    });

    workspace.groups = workspace.groups.filter(entry => entry.id !== groupId);
    const itemById = new Map(workspace.items.map(item => [item.id, item]));
    workspace.items.forEach((item) => {
      if (!item.parentId) return;
      const parent = itemById.get(item.parentId);
      if (!parent || parent.groupId !== item.groupId) {
        item.parentId = '';
      }
    });
    pruneConnections();
    return normalizeOrders(workspace);
  }

  if (operation === 'addItem') {
    const type = toSafeString(payload.type).toLowerCase();
    if (!WORKSPACE_ITEM_TYPES.has(type)) throw new Error('addItem has unknown type.');
    const refId = toSafeString(payload.refId);
    if (!refId) throw new Error('addItem requires refId.');
    const groupId = toSafeString(payload.groupId);
    if (!getGroup(groupId)) throw new Error('addItem requires a valid groupId.');
    const parentId = toSafeString(payload.parentId);
    if (parentId) {
      const parent = getItem(parentId);
      if (!parent || parent.groupId !== groupId) {
        throw new Error('addItem parentId must reference an item in the same group.');
      }
    }

    const siblings = workspace.items.filter(item => item.groupId === groupId && (item.parentId || '') === parentId);
    const requestedOrder = payload.order !== undefined ? toSafeOrder(payload.order, siblings.length) : siblings.length;

    workspace.items.push({
      id: makeId(),
      type,
      refId,
      groupId,
      parentId: parentId || '',
      inlineTitle: toSafeString(payload.inlineTitle).slice(0, 160),
      inlineText: toSafeHtml(payload.inlineText),
      stage: toSafeStage(payload.stage),
      status: toSafeStatus(payload.status),
      order: requestedOrder
    });
    return normalizeOrders(workspace, { groupId, parentId });
  }

  if (operation === 'moveItem') {
    const itemId = toSafeString(payload.itemId);
    const item = getItem(itemId);
    if (!item) throw new Error('Item not found.');

    const sourceScope = { groupId: item.groupId, parentId: item.parentId || '' };
    const nextGroupId = toSafeString(payload.groupId) || item.groupId;
    if (!getGroup(nextGroupId)) throw new Error('moveItem requires a valid groupId.');

    const hasParentChange = Object.prototype.hasOwnProperty.call(payload, 'parentId');
    let nextParentId = hasParentChange ? toSafeString(payload.parentId) : (nextGroupId === item.groupId ? (item.parentId || '') : '');

    if (nextParentId) {
      const parent = getItem(nextParentId);
      if (!parent || parent.groupId !== nextGroupId) {
        throw new Error('moveItem parentId must reference an item in the same group.');
      }
      if (parent.id === item.id || isDescendant(workspace.items, parent.id, item.id)) {
        throw new Error('moveItem parentId cannot create a cycle.');
      }
    }

    item.groupId = nextGroupId;
    item.parentId = nextParentId || '';
    if (payload.order !== undefined) {
      item.order = toSafeOrder(payload.order, item.order);
    } else if (sourceScope.groupId !== item.groupId || sourceScope.parentId !== item.parentId) {
      item.order = Number.MAX_SAFE_INTEGER;
    }

    return normalizeOrders(workspace, [sourceScope, { groupId: item.groupId, parentId: item.parentId }]);
  }

  if (operation === 'updateItem') {
    const itemId = toSafeString(payload.itemId || payload.id);
    const item = getItem(itemId);
    if (!item) throw new Error('Item not found.');
    const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : payload;

    if (patch.type !== undefined) {
      const nextType = toSafeString(patch.type).toLowerCase();
      if (!WORKSPACE_ITEM_TYPES.has(nextType)) throw new Error('updateItem has unknown type.');
      item.type = nextType;
    }
    if (patch.refId !== undefined) {
      const refId = toSafeString(patch.refId);
      if (!refId) throw new Error('updateItem refId cannot be empty.');
      item.refId = refId;
    }
    if (patch.stage !== undefined) {
      item.stage = toSafeStage(patch.stage, item.stage || 'working');
    }
    if (patch.status !== undefined) {
      item.status = toSafeStatus(patch.status, item.status || 'active');
    }
    if (patch.inlineTitle !== undefined) {
      item.inlineTitle = toSafeString(patch.inlineTitle).slice(0, 160);
    }
    if (patch.inlineText !== undefined) {
      item.inlineText = toSafeHtml(patch.inlineText);
    }

    const hasMoveBits = (
      patch.groupId !== undefined
      || Object.prototype.hasOwnProperty.call(patch, 'parentId')
      || patch.order !== undefined
    );

    if (hasMoveBits) {
      const movePayload = { itemId: item.id };
      if (patch.groupId !== undefined) movePayload.groupId = patch.groupId;
      if (Object.prototype.hasOwnProperty.call(patch, 'parentId')) movePayload.parentId = patch.parentId;
      if (patch.order !== undefined) movePayload.order = patch.order;
      return applyPatchOp(workspace, {
        op: 'moveItem',
        payload: movePayload
      });
    }
    return normalizeOrders(workspace, { groupId: item.groupId, parentId: item.parentId });
  }

  if (operation === 'deleteItem') {
    const itemId = toSafeString(payload.itemId || payload.id);
    const root = getItem(itemId);
    if (!root) throw new Error('Item not found.');

    const toDelete = new Set([itemId]);
    let changed = true;
    while (changed) {
      changed = false;
      workspace.items.forEach((item) => {
        if (item.parentId && toDelete.has(item.parentId) && !toDelete.has(item.id)) {
          toDelete.add(item.id);
          changed = true;
        }
      });
    }
    workspace.items = workspace.items.filter(item => !toDelete.has(item.id));
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
