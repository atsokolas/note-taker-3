const crypto = require('crypto');
const { ensureWorkspace, applyPatchOp, normalizeOrders } = require('../utils/workspaceUtils');

const DELETE_RETENTION_DAYS = 30;
const MAX_OPERATION_COUNT = 250;
const MAX_APPROVAL_LIST_LIMIT = 100;
const MAX_DELETE_PREVIEW_ITEMS = 200;

const FLOW_VALUES = new Set(['direct', 'cleanup', 'restructure']);
const ACTOR_VALUES = new Set(['user', 'native_agent', 'byo_agent']);
const APPROVAL_STATUS_VALUES = new Set(['pending', 'approved', 'rejected', 'executed', 'expired']);
const APPROVAL_MODE_VALUES = new Set(['single_batch', 'batched']);
const SOFT_DELETE_STATUS_VALUES = new Set(['deleted', 'restored', 'expired']);

const clone = (value) => JSON.parse(JSON.stringify(value || null));
const toSafeString = (value) => String(value || '').trim();
const toSafeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const normalizeFlow = (value) => {
  const candidate = toSafeString(value).toLowerCase();
  return FLOW_VALUES.has(candidate) ? candidate : 'direct';
};

const normalizeActorType = (value) => {
  const candidate = toSafeString(value).toLowerCase();
  return ACTOR_VALUES.has(candidate) ? candidate : 'native_agent';
};

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const getMongoose = () => require('mongoose');

const toObjectId = (value) => {
  const mongoose = getMongoose();
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

const resolveModel = (name) => {
  try {
    return getMongoose().model(name);
  } catch (_error) {
    throw new Error(`${name} model is not registered.`);
  }
};

const isDeleteOperation = (operation = {}) => toSafeString(operation.op) === 'deleteItem';

const normalizeOperation = (rawOperation, index) => {
  if (!rawOperation || typeof rawOperation !== 'object') {
    throw createError(400, `operations[${index}] must be an object.`);
  }
  const op = toSafeString(rawOperation.op);
  if (!op) throw createError(400, `operations[${index}] is missing op.`);
  const payload = rawOperation.payload && typeof rawOperation.payload === 'object'
    ? rawOperation.payload
    : {};
  return { op, payload };
};

const expandOperations = (operations = []) => {
  if (!Array.isArray(operations)) throw createError(400, 'operations must be an array.');
  if (!operations.length) throw createError(400, 'operations must include at least one operation.');
  if (operations.length > MAX_OPERATION_COUNT) {
    throw createError(400, `operations cannot exceed ${MAX_OPERATION_COUNT} entries.`);
  }

  const normalized = [];
  const seenDeleteIds = new Set();
  operations.forEach((rawOperation, index) => {
    const operation = normalizeOperation(rawOperation, index);
    if (operation.op === 'deleteItems') {
      const itemIds = Array.isArray(operation.payload?.itemIds) ? operation.payload.itemIds : [];
      itemIds.forEach((itemIdRaw) => {
        const itemId = toSafeString(itemIdRaw);
        if (!itemId || seenDeleteIds.has(itemId)) return;
        seenDeleteIds.add(itemId);
        normalized.push({
          op: 'deleteItem',
          payload: { itemId }
        });
      });
      return;
    }
    if (operation.op === 'deleteItem') {
      const itemId = toSafeString(operation.payload?.itemId || operation.payload?.id);
      if (itemId && seenDeleteIds.has(itemId)) return;
      if (itemId) seenDeleteIds.add(itemId);
      normalized.push({
        op: 'deleteItem',
        payload: { itemId }
      });
      return;
    }
    normalized.push(operation);
  });

  if (!normalized.length) throw createError(400, 'No executable operations were provided.');
  return normalized;
};

const buildChildrenMap = (workspace = {}) => {
  const map = new Map();
  const items = Array.isArray(workspace.attachedItems) ? workspace.attachedItems : [];
  items.forEach((item) => {
    const parentId = toSafeString(item.parentId);
    if (!parentId) return;
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId).push(String(item.id));
  });
  return map;
};

const collectDeleteTargetIds = (workspace = {}, operations = []) => {
  const items = Array.isArray(workspace.attachedItems) ? workspace.attachedItems : [];
  const existingIds = new Set(items.map(item => String(item.id)));
  const childrenMap = buildChildrenMap(workspace);
  const collected = new Set();
  const stack = [];

  operations.forEach((operation) => {
    if (!isDeleteOperation(operation)) return;
    const itemId = toSafeString(operation.payload?.itemId || operation.payload?.id);
    if (!itemId || !existingIds.has(itemId) || collected.has(itemId)) return;
    stack.push(itemId);
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || collected.has(current)) continue;
      collected.add(current);
      const children = childrenMap.get(current) || [];
      children.forEach((childId) => {
        if (!collected.has(childId)) stack.push(childId);
      });
    }
  });

  return collected;
};

const isUnambiguousDeleteScope = (operations = []) => {
  const destructive = operations.filter(isDeleteOperation);
  if (!destructive.length) return true;
  return destructive.every((operation) => {
    const itemId = toSafeString(operation.payload?.itemId || operation.payload?.id);
    return Boolean(itemId);
  });
};

const previewDeleteTargets = (workspace = {}, deleteIdSet = new Set()) => {
  const items = Array.isArray(workspace.attachedItems) ? workspace.attachedItems : [];
  const sectionById = new Map(
    (Array.isArray(workspace.outlineSections) ? workspace.outlineSections : []).map(section => [String(section.id), section])
  );
  return items
    .filter(item => deleteIdSet.has(String(item.id)))
    .slice(0, MAX_DELETE_PREVIEW_ITEMS)
    .map((item) => {
      const section = sectionById.get(String(item.sectionId || item.groupId));
      return {
        itemId: String(item.id),
        type: String(item.type || ''),
        refId: String(item.refId || ''),
        title: String(item.inlineTitle || '').trim() || String(item.inlineText || '').slice(0, 90),
        sectionId: String(item.sectionId || item.groupId || ''),
        sectionTitle: String(section?.title || '')
      };
    });
};

const summarizeWorkspace = (workspace = {}) => ({
  sectionCount: Array.isArray(workspace.outlineSections) ? workspace.outlineSections.length : 0,
  itemCount: Array.isArray(workspace.attachedItems) ? workspace.attachedItems.length : 0,
  connectionCount: Array.isArray(workspace.connections) ? workspace.connections.length : 0
});

const evaluateActionPolicy = ({
  workspace = {},
  operations = [],
  flow = 'direct',
  explicitUserCommand = false
}) => {
  const safeFlow = normalizeFlow(flow);
  const destructiveOps = operations.filter(isDeleteOperation);
  const deleteTargetIds = collectDeleteTargetIds(workspace, operations);
  const deleteCount = Math.max(deleteTargetIds.size, destructiveOps.length);
  const hasDestructive = destructiveOps.length > 0;

  if (!hasDestructive) {
    return {
      flow: safeFlow,
      hasDestructive: false,
      destructiveOpCount: 0,
      deleteCount: 0,
      requiresApproval: false,
      approvalMode: null,
      reason: 'No destructive operations detected.',
      deleteTargetIds,
      deleteTargetsPreview: []
    };
  }

  const unambiguousDeleteScope = isUnambiguousDeleteScope(operations);
  const explicitDeleteAllowed = Boolean(explicitUserCommand) && unambiguousDeleteScope;
  const requiresApproval = !explicitDeleteAllowed;
  const approvalMode = requiresApproval
    ? (deleteCount > 5 ? 'batched' : 'single_batch')
    : null;
  const reason = requiresApproval
    ? (
      deleteCount > 5
        ? 'Cleanup/restructure delete batch requires approval.'
        : 'Destructive operations require approval.'
    )
    : 'Explicit user delete command is unambiguous; execution can proceed immediately.';

  return {
    flow: safeFlow,
    hasDestructive: true,
    destructiveOpCount: destructiveOps.length,
    deleteCount,
    requiresApproval,
    approvalMode,
    reason,
    deleteTargetIds,
    deleteTargetsPreview: previewDeleteTargets(workspace, deleteTargetIds)
  };
};

const executeWorkspaceOperations = ({ workspace, operations }) => {
  let nextWorkspace = clone(workspace);
  operations.forEach((operation, index) => {
    try {
      nextWorkspace = applyPatchOp(nextWorkspace, operation);
    } catch (error) {
      const message = toSafeString(error?.message) || 'Unknown workspace patch error.';
      throw createError(400, `Operation ${index + 1} (${operation.op}) failed: ${message}`);
    }
  });
  return ensureWorkspace({ workspace: nextWorkspace });
};

const buildDeletedItems = ({ beforeWorkspace, afterWorkspace }) => {
  const beforeItems = Array.isArray(beforeWorkspace?.attachedItems) ? beforeWorkspace.attachedItems : [];
  const afterIds = new Set((Array.isArray(afterWorkspace?.attachedItems) ? afterWorkspace.attachedItems : []).map(item => String(item.id)));
  return beforeItems
    .filter(item => !afterIds.has(String(item.id)))
    .map(item => clone(item))
    .filter(Boolean);
};

const createSoftDeleteDocs = ({
  deletedItems = [],
  userObjectId,
  conceptObjectId,
  conceptName,
  auditId
}) => {
  if (!deletedItems.length) return [];
  const now = new Date();
  const restoreUntilAt = new Date(now.getTime() + (DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000));
  return deletedItems.map((item) => ({
    userId: userObjectId,
    conceptId: conceptObjectId,
    conceptName: toSafeString(conceptName),
    entityType: 'workspace_item',
    entityId: String(item.id),
    snapshot: clone(item),
    status: 'deleted',
    deletedAt: now,
    restoreUntilAt,
    restoredAt: null,
    auditId
  }));
};

const sanitizeApprovalDoc = (doc) => ({
  approvalId: String(doc?._id || ''),
  conceptId: String(doc?.conceptId || ''),
  conceptName: toSafeString(doc?.conceptName),
  status: toSafeString(doc?.status),
  flow: normalizeFlow(doc?.flow),
  explicitUserCommand: Boolean(doc?.explicitUserCommand),
  deleteCount: Number(doc?.deleteCount || 0),
  approvalMode: toSafeString(doc?.approvalMode),
  preview: doc?.preview || {},
  createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null
});

const executeWorkspaceActionsWithPolicy = async ({
  userId,
  conceptId,
  conceptName = '',
  operations = [],
  flow = 'direct',
  explicitUserCommand = false,
  actorType = 'native_agent',
  actorId = '',
  bypassApproval = false,
  approvalId = null
}) => {
  const userObjectId = toObjectId(userId);
  const conceptObjectId = toObjectId(conceptId);
  if (!userObjectId) throw createError(400, 'userId must be a valid ObjectId.');
  if (!conceptObjectId) throw createError(400, 'conceptId must be a valid ObjectId.');

  const TagMeta = resolveModel('TagMeta');
  const AgentActionApproval = resolveModel('AgentActionApproval');
  const AgentActionAudit = resolveModel('AgentActionAudit');
  const AgentSoftDeleteRecord = resolveModel('AgentSoftDeleteRecord');

  const concept = await TagMeta.findOne({ _id: conceptObjectId, userId: userObjectId });
  if (!concept) throw createError(404, 'Concept not found.');

  const normalizedOperations = expandOperations(operations);
  const workspaceBefore = ensureWorkspace(concept);
  const policy = evaluateActionPolicy({
    workspace: workspaceBefore,
    operations: normalizedOperations,
    flow,
    explicitUserCommand
  });

  if (policy.requiresApproval && !bypassApproval) {
    const safeApprovalMode = APPROVAL_MODE_VALUES.has(policy.approvalMode) ? policy.approvalMode : 'single_batch';
    const approval = await AgentActionApproval.create({
      userId: userObjectId,
      conceptId: conceptObjectId,
      conceptName: toSafeString(conceptName || concept.name),
      status: 'pending',
      flow: normalizeFlow(flow),
      explicitUserCommand: Boolean(explicitUserCommand),
      deleteCount: Number(policy.deleteCount || 0),
      approvalMode: safeApprovalMode,
      operations: normalizedOperations,
      preview: {
        deleteTargets: policy.deleteTargetsPreview,
        workspaceSummary: summarizeWorkspace(workspaceBefore),
        operationCount: normalizedOperations.length
      },
      requestedBy: {
        actorType: normalizeActorType(actorType),
        actorId: toSafeString(actorId)
      }
    });
    return {
      status: 'approval_required',
      policy: {
        flow: policy.flow,
        deleteCount: policy.deleteCount,
        approvalMode: safeApprovalMode,
        reason: policy.reason
      },
      approval: sanitizeApprovalDoc(approval)
    };
  }

  const workspaceAfter = executeWorkspaceOperations({
    workspace: workspaceBefore,
    operations: normalizedOperations
  });
  const deletedItems = buildDeletedItems({ beforeWorkspace: workspaceBefore, afterWorkspace: workspaceAfter });

  concept.workspace = workspaceAfter;
  concept.markModified('workspace');
  await concept.save();

  const safeActorType = normalizeActorType(actorType);
  const mongoose = getMongoose();
  const audit = await AgentActionAudit.create({
    userId: userObjectId,
    conceptId: conceptObjectId,
    conceptName: toSafeString(conceptName || concept.name),
    actorType: safeActorType,
    actorId: toSafeString(actorId),
    flow: normalizeFlow(flow),
    explicitUserCommand: Boolean(explicitUserCommand),
    operationCount: normalizedOperations.length,
    destructiveCount: Number(deletedItems.length),
    operations: normalizedOperations,
    undoable: true,
    beforeWorkspace: workspaceBefore,
    afterWorkspace: workspaceAfter,
    approvalId: approvalId && mongoose.Types.ObjectId.isValid(approvalId)
      ? new mongoose.Types.ObjectId(String(approvalId))
      : null
  });

  let softDeleteRecords = [];
  if (deletedItems.length) {
    const docs = createSoftDeleteDocs({
      deletedItems,
      userObjectId,
      conceptObjectId,
      conceptName: toSafeString(conceptName || concept.name),
      auditId: audit._id
    });
    if (docs.length) {
      softDeleteRecords = await AgentSoftDeleteRecord.insertMany(docs, { ordered: false });
    }
  }

  if (approvalId && mongoose.Types.ObjectId.isValid(approvalId)) {
    await AgentActionApproval.updateOne(
      { _id: new mongoose.Types.ObjectId(String(approvalId)), userId: userObjectId },
      {
        $set: {
          status: 'executed',
          executedAt: new Date(),
          auditId: audit._id
        }
      }
    );
  }

  return {
    status: 'executed',
    conceptId: String(concept._id),
    conceptName: toSafeString(concept.name),
    auditId: String(audit._id),
    operationCount: normalizedOperations.length,
    deleteCount: deletedItems.length,
    workspaceSummary: summarizeWorkspace(workspaceAfter),
    softDeleteRecordIds: softDeleteRecords.map(record => String(record._id))
  };
};

const listActionApprovals = async ({
  userId,
  conceptId = '',
  status = 'pending',
  limit = 30
}) => {
  const userObjectId = toObjectId(userId);
  if (!userObjectId) throw createError(400, 'userId must be a valid ObjectId.');

  const AgentActionApproval = resolveModel('AgentActionApproval');
  const query = { userId: userObjectId };
  const safeStatus = toSafeString(status).toLowerCase();
  if (safeStatus && safeStatus !== 'all') {
    if (!APPROVAL_STATUS_VALUES.has(safeStatus)) {
      throw createError(400, 'status must be one of pending, approved, rejected, executed, expired, all.');
    }
    query.status = safeStatus;
  }

  const conceptObjectId = toObjectId(conceptId);
  if (conceptId && !conceptObjectId) {
    throw createError(400, 'conceptId must be a valid ObjectId when provided.');
  }
  if (conceptObjectId) query.conceptId = conceptObjectId;

  const safeLimit = Math.max(1, Math.min(MAX_APPROVAL_LIST_LIMIT, toSafeInt(limit, 30)));
  const rows = await AgentActionApproval.find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();

  return rows.map(sanitizeApprovalDoc);
};

const approveActionApproval = async ({
  userId,
  approvalId,
  actorType = 'user',
  actorId = ''
}) => {
  const userObjectId = toObjectId(userId);
  const approvalObjectId = toObjectId(approvalId);
  if (!userObjectId) throw createError(400, 'userId must be a valid ObjectId.');
  if (!approvalObjectId) throw createError(400, 'approvalId must be a valid ObjectId.');

  const AgentActionApproval = resolveModel('AgentActionApproval');
  const approval = await AgentActionApproval.findOne({ _id: approvalObjectId, userId: userObjectId });
  if (!approval) throw createError(404, 'Approval request not found.');
  if (approval.status !== 'pending') {
    throw createError(400, `Approval request is ${approval.status || 'not pending'}.`);
  }

  const safeActorType = normalizeActorType(actorType);
  approval.status = 'approved';
  approval.approvedAt = new Date();
  approval.approvedBy = {
    actorType: safeActorType,
    actorId: toSafeString(actorId)
  };
  await approval.save();

  try {
    const execution = await executeWorkspaceActionsWithPolicy({
      userId: String(userObjectId),
      conceptId: String(approval.conceptId),
      conceptName: approval.conceptName || '',
      operations: Array.isArray(approval.operations) ? approval.operations : [],
      flow: approval.flow || 'direct',
      explicitUserCommand: Boolean(approval.explicitUserCommand),
      actorType: safeActorType,
      actorId: toSafeString(actorId),
      bypassApproval: true,
      approvalId: String(approval._id)
    });
    return {
      approval: sanitizeApprovalDoc(approval),
      execution
    };
  } catch (error) {
    approval.status = 'pending';
    approval.approvedAt = null;
    approval.approvedBy = undefined;
    await approval.save();
    throw error;
  }
};

const rejectActionApproval = async ({
  userId,
  approvalId,
  actorType = 'user',
  actorId = ''
}) => {
  const userObjectId = toObjectId(userId);
  const approvalObjectId = toObjectId(approvalId);
  if (!userObjectId) throw createError(400, 'userId must be a valid ObjectId.');
  if (!approvalObjectId) throw createError(400, 'approvalId must be a valid ObjectId.');

  const AgentActionApproval = resolveModel('AgentActionApproval');
  const approval = await AgentActionApproval.findOne({ _id: approvalObjectId, userId: userObjectId });
  if (!approval) throw createError(404, 'Approval request not found.');
  if (approval.status !== 'pending') {
    throw createError(400, `Approval request is ${approval.status || 'not pending'}.`);
  }

  approval.status = 'rejected';
  approval.rejectedAt = new Date();
  approval.rejectedBy = {
    actorType: normalizeActorType(actorType),
    actorId: toSafeString(actorId)
  };
  await approval.save();
  return sanitizeApprovalDoc(approval);
};

const listSoftDeleteRecords = async ({
  userId,
  conceptId = '',
  status = 'deleted',
  limit = 60
}) => {
  const userObjectId = toObjectId(userId);
  if (!userObjectId) throw createError(400, 'userId must be a valid ObjectId.');
  const AgentSoftDeleteRecord = resolveModel('AgentSoftDeleteRecord');
  const query = { userId: userObjectId };

  const safeStatus = toSafeString(status).toLowerCase();
  if (safeStatus && safeStatus !== 'all') {
    if (!SOFT_DELETE_STATUS_VALUES.has(safeStatus)) {
      throw createError(400, 'status must be one of deleted, restored, expired, all.');
    }
    query.status = safeStatus;
  }

  const conceptObjectId = toObjectId(conceptId);
  if (conceptId && !conceptObjectId) throw createError(400, 'conceptId must be a valid ObjectId when provided.');
  if (conceptObjectId) query.conceptId = conceptObjectId;

  const safeLimit = Math.max(1, Math.min(MAX_APPROVAL_LIST_LIMIT, toSafeInt(limit, 60)));
  const rows = await AgentSoftDeleteRecord.find(query)
    .sort({ deletedAt: -1 })
    .limit(safeLimit)
    .lean();

  return rows.map((row) => ({
    recordId: String(row._id),
    conceptId: String(row.conceptId || ''),
    conceptName: toSafeString(row.conceptName),
    entityType: toSafeString(row.entityType),
    entityId: toSafeString(row.entityId),
    status: toSafeString(row.status),
    deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
    restoreUntilAt: row.restoreUntilAt ? new Date(row.restoreUntilAt).toISOString() : null,
    restoredAt: row.restoredAt ? new Date(row.restoredAt).toISOString() : null,
    snapshot: row.snapshot || null
  }));
};

const restoreSoftDeletedWorkspaceItem = async ({
  userId,
  recordId,
  actorType = 'user',
  actorId = ''
}) => {
  const userObjectId = toObjectId(userId);
  const recordObjectId = toObjectId(recordId);
  if (!userObjectId) throw createError(400, 'userId must be a valid ObjectId.');
  if (!recordObjectId) throw createError(400, 'recordId must be a valid ObjectId.');

  const TagMeta = resolveModel('TagMeta');
  const AgentActionAudit = resolveModel('AgentActionAudit');
  const AgentSoftDeleteRecord = resolveModel('AgentSoftDeleteRecord');

  const record = await AgentSoftDeleteRecord.findOne({ _id: recordObjectId, userId: userObjectId });
  if (!record) throw createError(404, 'Soft delete record not found.');
  if (record.status !== 'deleted') {
    throw createError(400, `Record status is ${record.status}; it cannot be restored.`);
  }
  if (record.restoreUntilAt && record.restoreUntilAt.getTime() < Date.now()) {
    record.status = 'expired';
    await record.save();
    throw createError(410, 'Restore window has expired for this record.');
  }

  const concept = await TagMeta.findOne({ _id: record.conceptId, userId: userObjectId });
  if (!concept) throw createError(404, 'Concept for this soft delete record was not found.');

  const beforeWorkspace = ensureWorkspace(concept);
  const workspace = ensureWorkspace(concept);
  const snapshot = record.snapshot && typeof record.snapshot === 'object' ? clone(record.snapshot) : null;
  if (!snapshot?.id || !snapshot?.type || !snapshot?.refId) {
    throw createError(400, 'Soft delete snapshot is invalid and cannot be restored.');
  }

  const sectionIds = new Set((workspace.outlineSections || []).map(section => String(section.id)));
  if (!sectionIds.has(String(snapshot.sectionId))) {
    snapshot.sectionId = sectionIds.has('inbox')
      ? 'inbox'
      : (workspace.outlineSections?.[0]?.id || 'inbox');
  }
  snapshot.groupId = snapshot.sectionId;
  if (!sectionIds.has(String(snapshot.sectionId))) {
    workspace.outlineSections.push({
      id: String(snapshot.sectionId),
      title: String(snapshot.sectionId),
      description: '',
      collapsed: false,
      order: workspace.outlineSections.length
    });
  }

  const existingIds = new Set((workspace.attachedItems || []).map(item => String(item.id)));
  if (existingIds.has(String(snapshot.id))) {
    snapshot.id = `restored:${String(snapshot.id)}:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  }
  if (snapshot.parentId) {
    const parentExists = existingIds.has(String(snapshot.parentId));
    if (!parentExists) snapshot.parentId = '';
  }
  snapshot.order = Number.isFinite(Number(snapshot.order))
    ? Number(snapshot.order)
    : (workspace.attachedItems || []).length;

  workspace.attachedItems = [...(workspace.attachedItems || []), snapshot];
  const afterWorkspace = normalizeOrders(workspace, {
    sectionId: snapshot.sectionId,
    parentId: snapshot.parentId || ''
  });

  concept.workspace = afterWorkspace;
  concept.markModified('workspace');
  await concept.save();

  const safeActorType = normalizeActorType(actorType);
  const audit = await AgentActionAudit.create({
    userId: userObjectId,
    conceptId: concept._id,
    conceptName: toSafeString(concept.name),
    actorType: safeActorType,
    actorId: toSafeString(actorId),
    flow: 'direct',
    explicitUserCommand: true,
    operationCount: 1,
    destructiveCount: 0,
    operations: [{ op: 'restoreSoftDeletedItem', payload: { recordId: String(record._id), entityId: String(record.entityId) } }],
    undoable: true,
    beforeWorkspace,
    afterWorkspace,
    approvalId: null
  });

  record.status = 'restored';
  record.restoredAt = new Date();
  record.restoredByAuditId = audit._id;
  await record.save();

  return {
    recordId: String(record._id),
    auditId: String(audit._id),
    conceptId: String(concept._id),
    restoredItemId: String(snapshot.id),
    workspaceSummary: summarizeWorkspace(afterWorkspace)
  };
};

const undoLastWorkspaceAction = async ({
  userId,
  conceptId = '',
  actorType = 'user',
  actorId = ''
}) => {
  const userObjectId = toObjectId(userId);
  if (!userObjectId) throw createError(400, 'userId must be a valid ObjectId.');

  const TagMeta = resolveModel('TagMeta');
  const AgentActionAudit = resolveModel('AgentActionAudit');
  const AgentSoftDeleteRecord = resolveModel('AgentSoftDeleteRecord');

  const query = { userId: userObjectId, undoable: true, undoneAt: null };
  const conceptObjectId = toObjectId(conceptId);
  if (conceptId && !conceptObjectId) throw createError(400, 'conceptId must be a valid ObjectId when provided.');
  if (conceptObjectId) query.conceptId = conceptObjectId;

  const latest = await AgentActionAudit.findOne(query).sort({ createdAt: -1 });
  if (!latest) throw createError(404, 'No undoable actions found.');

  const concept = await TagMeta.findOne({ _id: latest.conceptId, userId: userObjectId });
  if (!concept) throw createError(404, 'Concept for the last action was not found.');

  const restoredWorkspace = ensureWorkspace({ workspace: clone(latest.beforeWorkspace || {}) });
  concept.workspace = restoredWorkspace;
  concept.markModified('workspace');
  await concept.save();

  latest.undoneAt = new Date();
  latest.undoneBy = {
    actorType: normalizeActorType(actorType),
    actorId: toSafeString(actorId)
  };
  await latest.save();

  const softDeleteUpdate = await AgentSoftDeleteRecord.updateMany(
    {
      userId: userObjectId,
      auditId: latest._id,
      status: 'deleted'
    },
    {
      $set: {
        status: 'restored',
        restoredAt: new Date(),
        restoredByAuditId: latest._id
      }
    }
  );

  return {
    undoneAuditId: String(latest._id),
    conceptId: String(concept._id),
    conceptName: toSafeString(concept.name),
    restoredSoftDeleteCount: Number(softDeleteUpdate?.modifiedCount || 0),
    workspaceSummary: summarizeWorkspace(restoredWorkspace)
  };
};

module.exports = {
  DELETE_RETENTION_DAYS,
  executeWorkspaceActionsWithPolicy,
  listActionApprovals,
  approveActionApproval,
  rejectActionApproval,
  listSoftDeleteRecords,
  restoreSoftDeletedWorkspaceItem,
  undoLastWorkspaceAction,
  __testables: {
    normalizeFlow,
    normalizeActorType,
    expandOperations,
    collectDeleteTargetIds,
    evaluateActionPolicy,
    summarizeWorkspace,
    isUnambiguousDeleteScope
  }
};
