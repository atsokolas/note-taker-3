const {
  applyStructureProposal,
  rollbackStructureProposal
} = require('./agentStructureExecution');

const clean = (value) => String(value || '').trim();

const PROPOSAL_STATUS_VALUES = new Set(['pending', 'applied', 'partially_applied', 'skipped', 'failed', 'rejected', 'rolled_back', 'invalidated']);
const SCOPE_VALUES = new Set(['workspace', 'import_session', 'surface']);
const OPERATION_TYPE_VALUES = new Set(['create_folder', 'rename_folder', 'move_item', 'merge_item', 'merge_folder', 'delete_folder']);
const OPERATION_STATUS_VALUES = new Set(['pending', 'approved', 'rejected', 'applied', 'skipped']);
const EDITABLE_OPERATION_STATUS_VALUES = new Set(['pending', 'approved', 'rejected']);
const RISK_VALUES = new Set(['low', 'medium']);
const TARGET_DOMAIN_VALUES = new Set(['library', 'notebook', 'concepts', 'questions']);

const clone = (value) => JSON.parse(JSON.stringify(value || null));

const normalizeEnumValue = (value, allowedValues, fallback) => {
  const safe = clean(value).toLowerCase();
  return allowedValues.has(safe) ? safe : fallback;
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeActor = (input = {}, fallbackType = 'user') => ({
  actorType: clean(input?.actorType).toLowerCase() || fallbackType,
  actorId: clean(input?.actorId)
});

const normalizeExecutionResult = (input = {}) => {
  if (!input || typeof input !== 'object') return null;
  const totalCount = Number(input.totalCount || 0);
  const appliedCount = Number(input.appliedCount || 0);
  const skippedCount = Number(input.skippedCount || 0);
  const failedCount = Number(input.failedCount || 0);
  const status = clean(input.status).toLowerCase();
  if (!status && totalCount <= 0 && appliedCount <= 0 && skippedCount <= 0 && failedCount <= 0) {
    return null;
  }
  return {
    status: status || 'applied',
    totalCount,
    appliedCount,
    skippedCount,
    failedCount
  };
};

const resolveProposalExecutionStatus = (executionResult = null) => {
  const safeExecutionResult = normalizeExecutionResult(executionResult);
  const safeStatus = clean(safeExecutionResult?.status).toLowerCase();
  if (PROPOSAL_STATUS_VALUES.has(safeStatus)) return safeStatus;
  return 'applied';
};

const deriveExecutionResult = (operations = []) => {
  const safeOperations = Array.isArray(operations) ? operations : [];
  const trackedStatuses = safeOperations
    .map((operation) => {
      const preview = operation?.preview && typeof operation.preview === 'object' ? operation.preview : {};
      const execution = normalizeExecutionResult(preview.executionResult);
      return execution?.status || clean(operation?.status).toLowerCase();
    })
    .filter(Boolean);

  if (trackedStatuses.length === 0) return null;

  const appliedCount = trackedStatuses.filter((status) => status === 'applied').length;
  const skippedCount = trackedStatuses.filter((status) => status === 'skipped').length;
  const failedCount = trackedStatuses.filter((status) => status === 'failed').length;
  let status = 'applied';
  if (failedCount > 0) {
    status = appliedCount > 0 ? 'partially_applied' : 'failed';
  } else if (skippedCount > 0) {
    status = appliedCount > 0 ? 'partially_applied' : 'skipped';
  }

  return {
    status,
    totalCount: trackedStatuses.length,
    appliedCount,
    skippedCount,
    failedCount
  };
};

const normalizeOperationEnumValue = (value, allowedValues, fallback) => {
  const safe = clean(value).toLowerCase();
  if (allowedValues.has(safe)) {
    return { value: safe, isValid: true };
  }
  return { value: safe, isValid: false, fallback };
};

const normalizeStructureProposal = (input = {}) => {
  const operations = Array.isArray(input.operations)
    ? input.operations.map((operation) => {
        const type = normalizeOperationEnumValue(operation?.type, OPERATION_TYPE_VALUES, 'create_folder');
        const targetDomain = normalizeOperationEnumValue(operation?.targetDomain, TARGET_DOMAIN_VALUES, 'library');
        const status = normalizeOperationEnumValue(operation?.status, OPERATION_STATUS_VALUES, 'pending');
        const risk = normalizeOperationEnumValue(operation?.risk, RISK_VALUES, 'low');
        const invalidFields = [];
        if (!type.isValid) invalidFields.push('type');
        if (!targetDomain.isValid) invalidFields.push('targetDomain');
        if (!status.isValid) invalidFields.push('status');
        if (!risk.isValid) invalidFields.push('risk');
        const preview = operation?.preview && typeof operation.preview === 'object' ? operation.preview : {};
        const executionResult = normalizeExecutionResult(preview.executionResult);

        return {
          opId: clean(operation?.opId),
          type: type.value,
          targetDomain: targetDomain.value,
          status: status.value,
          payload: operation?.payload && typeof operation.payload === 'object' ? operation.payload : {},
          preview,
          risk: risk.value,
          undoPayload: operation?.undoPayload && typeof operation.undoPayload === 'object' ? operation.undoPayload : {},
          rawType: type.isValid ? null : clean(operation?.type),
          rawTargetDomain: targetDomain.isValid ? null : clean(operation?.targetDomain),
          rawStatus: status.isValid ? null : clean(operation?.status),
          rawRisk: risk.isValid ? null : clean(operation?.risk),
          isActionable: invalidFields.length === 0,
          invalidFields,
          executionResult
        };
      })
    : [];
  const normalizedExecutionResult = normalizeExecutionResult(input.executionResult) || deriveExecutionResult(operations);

  return {
    structureProposalId: clean(input.structureProposalId || input._id),
    sourceThreadId: clean(input.sourceThreadId),
    sourceRunId: clean(input.sourceRunId),
    sourceBundleId: clean(input.sourceBundleId),
    status: normalizeEnumValue(input.status, PROPOSAL_STATUS_VALUES, 'pending'),
    scope: normalizeEnumValue(input.scope, SCOPE_VALUES, 'workspace'),
    scopeRef: clean(input.scopeRef),
    title: clean(input.title),
    summary: clean(input.summary),
    rationale: clean(input.rationale),
    operations,
    createdBy: normalizeActor(input.createdBy || {}, 'user'),
    acceptedBy: input.acceptedBy ? normalizeActor(input.acceptedBy, 'user') : null,
    rejectedBy: input.rejectedBy ? normalizeActor(input.rejectedBy, 'user') : null,
    rolledBackBy: input.rolledBackBy ? normalizeActor(input.rolledBackBy, 'user') : null,
    acceptedAt: parseDate(input.acceptedAt),
    rejectedAt: parseDate(input.rejectedAt),
    rolledBackAt: parseDate(input.rolledBackAt),
    createdAt: parseDate(input.createdAt),
    updatedAt: parseDate(input.updatedAt),
    executionResult: normalizedExecutionResult
  };
};

const sanitizeAgentStructureProposalDoc = (doc = {}) => {
  const safe = normalizeStructureProposal(typeof doc.toObject === 'function' ? doc.toObject() : doc);
  return {
    ...safe,
    acceptedAt: safe.acceptedAt ? safe.acceptedAt.toISOString() : null,
    rejectedAt: safe.rejectedAt ? safe.rejectedAt.toISOString() : null,
    rolledBackAt: safe.rolledBackAt ? safe.rolledBackAt.toISOString() : null,
    createdAt: safe.createdAt ? safe.createdAt.toISOString() : null,
    updatedAt: safe.updatedAt ? safe.updatedAt.toISOString() : null
  };
};

const getStructureProposalDoc = async ({
  AgentStructureProposal,
  userId = '',
  structureProposalId = ''
} = {}) => {
  if (!AgentStructureProposal) return null;
  return AgentStructureProposal.findOne({
    _id: clean(structureProposalId),
    userId
  });
};

const listStructureProposals = async ({
  AgentStructureProposal,
  userId = '',
  threadId = '',
  runId = '',
  status = 'all',
  scope = '',
  scopeRef = '',
  limit = 40
} = {}) => {
  if (!AgentStructureProposal || typeof AgentStructureProposal.find !== 'function') return [];
  const query = { userId };
  const safeStatus = clean(status).toLowerCase();
  const safeScope = clean(scope).toLowerCase();
  const safeLimitRaw = Number(limit || 40);
  const safeLimit = Number.isFinite(safeLimitRaw)
    ? Math.max(1, Math.min(100, Math.trunc(safeLimitRaw)))
    : 40;

  if (clean(threadId)) query.sourceThreadId = clean(threadId);
  if (clean(runId)) query.sourceRunId = clean(runId);
  if (safeStatus && safeStatus !== 'all') query.status = safeStatus;
  if (safeScope && SCOPE_VALUES.has(safeScope)) query.scope = safeScope;
  if (clean(scopeRef)) query.scopeRef = clean(scopeRef);

  const rows = await AgentStructureProposal.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(safeLimit);
  return (Array.isArray(rows) ? rows : []).map(sanitizeAgentStructureProposalDoc);
};

const mergeOperationUpdate = ({ existingOperation = {}, nextOperation = {} } = {}) => {
  const next = nextOperation && typeof nextOperation === 'object' ? nextOperation : {};
  const merged = {
    ...existingOperation
  };

  const nextStatus = clean(next.status).toLowerCase();
  if (nextStatus) {
    if (!EDITABLE_OPERATION_STATUS_VALUES.has(nextStatus)) {
      const error = new Error(`Invalid operation status for ${clean(next.opId || existingOperation.opId)}.`);
      error.status = 400;
      throw error;
    }
    merged.status = nextStatus;
  }

  if (next.payload && typeof next.payload === 'object') {
    merged.payload = {
      ...(existingOperation.payload && typeof existingOperation.payload === 'object' ? clone(existingOperation.payload) : {}),
      ...clone(next.payload)
    };
  }

  if (next.preview && typeof next.preview === 'object') {
    merged.preview = {
      ...(existingOperation.preview && typeof existingOperation.preview === 'object' ? clone(existingOperation.preview) : {}),
      ...clone(next.preview)
    };
  }

  const nextRisk = clean(next.risk).toLowerCase();
  if (nextRisk) {
    merged.risk = normalizeEnumValue(nextRisk, RISK_VALUES, existingOperation.risk || 'low');
  }

  return merged;
};

const updateStructureProposalDraft = async ({
  AgentStructureProposal,
  userId = '',
  structureProposalId = '',
  updates = {}
} = {}) => {
  const doc = await getStructureProposalDoc({ AgentStructureProposal, userId, structureProposalId });
  if (!doc) {
    const error = new Error('Structure proposal not found.');
    error.status = 404;
    throw error;
  }
  if (clean(doc.status).toLowerCase() !== 'pending') {
    const error = new Error('Only pending structure proposals can be edited.');
    error.status = 400;
    throw error;
  }

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'title')) {
    doc.title = clean(updates.title);
  }
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'summary')) {
    doc.summary = clean(updates.summary);
  }
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'rationale')) {
    doc.rationale = clean(updates.rationale);
  }

  if (Array.isArray(updates.operations) && updates.operations.length > 0) {
    const nextOperationsById = new Map(
      (Array.isArray(doc.operations) ? doc.operations : []).map((operation) => [
        clean(operation?.opId),
        operation
      ])
    );

    updates.operations.forEach((operationUpdate) => {
      const opId = clean(operationUpdate?.opId);
      if (!opId || !nextOperationsById.has(opId)) {
        const error = new Error(`Operation ${opId || '(missing)'} was not found.`);
        error.status = 400;
        throw error;
      }
      nextOperationsById.set(
        opId,
        mergeOperationUpdate({
          existingOperation: nextOperationsById.get(opId),
          nextOperation: operationUpdate
        })
      );
    });

    doc.operations = Array.from(nextOperationsById.values());
  }

  await doc.save();
  return doc;
};

const buildExecutionPreview = ({ operation = {} } = {}) => {
  const preview = operation?.preview && typeof operation.preview === 'object' ? clone(operation.preview) : {};
  const executionStatus = clean(operation?.status).toLowerCase();
  const executionIndex = Number.isFinite(Number(operation?.executionIndex))
    ? Number(operation.executionIndex)
    : null;
  preview.executionResult = {
    status: executionStatus || 'skipped',
    error: clean(operation?.error),
    executionIndex,
    persistedStatus: OPERATION_STATUS_VALUES.has(executionStatus) ? executionStatus : 'skipped'
  };
  return preview;
};

const toPersistedOperation = (operation = {}) => {
  const executionStatus = clean(operation?.status).toLowerCase();
  const persistedStatus = OPERATION_STATUS_VALUES.has(executionStatus) ? executionStatus : 'skipped';
  return {
    opId: clean(operation?.opId),
    type: normalizeEnumValue(operation?.type, OPERATION_TYPE_VALUES, 'create_folder'),
    targetDomain: normalizeEnumValue(operation?.targetDomain, TARGET_DOMAIN_VALUES, 'library'),
    status: persistedStatus,
    payload: operation?.payload && typeof operation.payload === 'object' ? clone(operation.payload) : {},
    preview: buildExecutionPreview({ operation }),
    risk: normalizeEnumValue(operation?.risk, RISK_VALUES, 'low'),
    undoPayload: operation?.undoPayload && typeof operation.undoPayload === 'object' ? clone(operation.undoPayload) : {}
  };
};

const toServiceResult = ({ doc = null, executionResult = null } = {}) => {
  if (!doc) return null;
  const base = typeof doc.toObject === 'function' ? doc.toObject({ getters: false, virtuals: false }) : clone(doc);
  return {
    ...base,
    executionResult: normalizeExecutionResult(executionResult) || deriveExecutionResult(base.operations || [])
  };
};

const buildExecutionModels = ({ NotebookFolder, NotebookEntry } = {}) => ({
  notebookFolders: NotebookFolder,
  NotebookFolder,
  notebookEntries: NotebookEntry,
  NotebookEntry
});

const acceptStructureProposal = async ({
  AgentStructureProposal,
  NotebookFolder,
  NotebookEntry,
  userId = '',
  structureProposalId = '',
  actor = {}
} = {}) => {
  const doc = await getStructureProposalDoc({ AgentStructureProposal, userId, structureProposalId });
  if (!doc) {
    const error = new Error('Structure proposal not found.');
    error.status = 404;
    throw error;
  }
  if (clean(doc.status).toLowerCase() !== 'pending') {
    const error = new Error('Only pending structure proposals can be applied.');
    error.status = 400;
    throw error;
  }

  const executed = await applyStructureProposal({
    models: buildExecutionModels({ NotebookFolder, NotebookEntry }),
    proposal: {
      ...normalizeStructureProposal(doc.toObject ? doc.toObject({ getters: false, virtuals: false }) : doc),
      operations: normalizeStructureProposal(doc.toObject ? doc.toObject({ getters: false, virtuals: false }) : doc).operations
        .map((operation) => ({
          ...clone(operation),
          status: clean(operation?.status).toLowerCase() === 'rejected' ? 'rejected' : 'approved'
        }))
    },
    userId
  });

  doc.status = resolveProposalExecutionStatus(executed.executionResult);
  doc.acceptedBy = normalizeActor(actor || {}, 'user');
  doc.acceptedAt = new Date();
  doc.operations = executed.operations.map(toPersistedOperation);
  doc.executionResult = normalizeExecutionResult(executed.executionResult);
  await doc.save();
  return toServiceResult({ doc, executionResult: executed.executionResult });
};

const applyStoredStructureProposal = async (input = {}) => acceptStructureProposal(input);

const rejectStructureProposal = async ({
  AgentStructureProposal,
  userId = '',
  structureProposalId = '',
  actor = {}
} = {}) => {
  const doc = await getStructureProposalDoc({ AgentStructureProposal, userId, structureProposalId });
  if (!doc) {
    const error = new Error('Structure proposal not found.');
    error.status = 404;
    throw error;
  }
  if (clean(doc.status).toLowerCase() !== 'pending') {
    const error = new Error('Only pending structure proposals can be rejected.');
    error.status = 400;
    throw error;
  }

  doc.status = 'rejected';
  doc.rejectedBy = normalizeActor(actor || {}, 'user');
  doc.rejectedAt = new Date();
  await doc.save();
  return doc;
};

const rollbackAcceptedStructureProposal = async ({
  AgentStructureProposal,
  NotebookFolder,
  NotebookEntry,
  userId = '',
  structureProposalId = '',
  actor = {}
} = {}) => {
  const doc = await getStructureProposalDoc({ AgentStructureProposal, userId, structureProposalId });
  if (!doc) {
    const error = new Error('Structure proposal not found.');
    error.status = 404;
    throw error;
  }
  const executionResult = normalizeExecutionResult(doc.executionResult) || deriveExecutionResult(doc.operations || []);
  const safeStatus = clean(doc.status).toLowerCase();
  const hasAppliedWork = Number(executionResult?.appliedCount || 0) > 0;
  if (!['applied', 'partially_applied'].includes(safeStatus) || !hasAppliedWork) {
    const error = new Error('Only structure proposals with applied operations can be rolled back.');
    error.status = 400;
    throw error;
  }

  await rollbackStructureProposal({
    models: buildExecutionModels({ NotebookFolder, NotebookEntry }),
    proposal: normalizeStructureProposal(doc.toObject ? doc.toObject({ getters: false, virtuals: false }) : doc),
    userId
  });

  doc.status = 'rolled_back';
  doc.rolledBackBy = normalizeActor(actor || {}, 'user');
  doc.rolledBackAt = new Date();
  await doc.save();
  return doc;
};

const rollbackStoredStructureProposal = async (input = {}) => rollbackAcceptedStructureProposal(input);

module.exports = {
  listStructureProposals,
  normalizeStructureProposal,
  sanitizeAgentStructureProposalDoc,
  updateStructureProposalDraft,
  applyStoredStructureProposal,
  acceptStructureProposal,
  rejectStructureProposal,
  rollbackStoredStructureProposal,
  rollbackAcceptedStructureProposal
};
