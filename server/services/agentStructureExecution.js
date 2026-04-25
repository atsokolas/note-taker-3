const clean = (value) => String(value || '').trim();

const OPERATION_ORDER = ['create_folder', 'rename_folder', 'move_item', 'merge_folder', 'delete_folder'];
const TARGET_DOMAIN_VALUES = new Set(['library', 'notebook', 'concepts', 'questions']);

const pickModel = (models = {}, keys = []) => {
  for (const key of keys) {
    if (models?.[key]) return models[key];
  }
  return null;
};

const sortOperationsForApply = (operations = []) => {
  const orderRank = new Map(OPERATION_ORDER.map((type, index) => [type, index]));
  return [...operations]
    .map((operation, index) => ({ operation, index }))
    .sort((left, right) => {
      const leftRank = orderRank.get(clean(left.operation?.type).toLowerCase()) ?? 99;
      const rightRank = orderRank.get(clean(right.operation?.type).toLowerCase()) ?? 99;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.index - right.index;
    });
};

const sortOperationsForRollback = (operations = []) => (
  [...operations]
    .filter((operation) => clean(operation?.status).toLowerCase() === 'applied')
    .sort((left, right) => (Number(left.executionIndex) || 0) - (Number(right.executionIndex) || 0))
    .reverse()
);

const toPlainObject = (value) => {
  if (!value || typeof value !== 'object') return {};
  if (typeof value.toObject === 'function') return value.toObject();
  return { ...value };
};

const ensureWriteSucceeded = (result, description) => {
  if (!result) {
    throw new Error(`${description} did not return a result.`);
  }

  if (typeof result === 'object') {
    const hasWriteCounters =
      Object.prototype.hasOwnProperty.call(result, 'matchedCount')
      || Object.prototype.hasOwnProperty.call(result, 'modifiedCount')
      || Object.prototype.hasOwnProperty.call(result, 'deletedCount');
    if (hasWriteCounters) {
      const matchedCount = Number(result.matchedCount) || 0;
      const modifiedCount = Number(result.modifiedCount) || 0;
      const deletedCount = Number(result.deletedCount) || 0;
      if (matchedCount === 0 && modifiedCount === 0 && deletedCount === 0) {
        throw new Error(`${description} did not affect any documents.`);
      }
    }
  }

  return result;
};

const normalizeTargetDomain = (value, fallback = 'notebook') => {
  const safe = clean(value).toLowerCase();
  return TARGET_DOMAIN_VALUES.has(safe) ? safe : fallback;
};

const buildCreatedFolderKey = (targetDomain = '', folderName = '') => (
  `${normalizeTargetDomain(targetDomain)}:${clean(folderName).toLowerCase()}`
);

const recordOperationStats = (context, outcome) => {
  context.executionStats[outcome] += 1;
};

const finishProposalExecution = (proposal, context) => {
  const { appliedCount, skippedCount, failedCount, totalCount } = context.executionStats;
  let status = 'applied';
  if (failedCount > 0) {
    status = appliedCount > 0 ? 'partially_applied' : 'failed';
  } else if (skippedCount > 0) {
    status = appliedCount > 0 ? 'partially_applied' : 'skipped';
  }

  proposal.status = status;
  proposal.executionResult = {
    status,
    appliedCount,
    skippedCount,
    failedCount,
    totalCount
  };
  return proposal;
};

const resolveNotebookAdapter = (models = {}) => {
  const notebookFolders = pickModel(models, ['notebookFolders', 'NotebookFolder']);
  const notebookEntries = pickModel(models, ['notebookEntries', 'NotebookEntry']);
  if (!notebookFolders || !notebookEntries) return null;

  return {
    targetDomain: 'notebook',
    async findFolderById({ userId, folderId }) {
      const safeFolderId = clean(folderId);
      if (!safeFolderId) return null;
      const folder = await notebookFolders.findOne({ _id: safeFolderId, userId });
      return folder ? toPlainObject(folder) : null;
    },
    async createFolder({ _id, userId, name, parentFolderId = null, sortOrder = 0, importMeta = undefined }) {
      const folder = await notebookFolders.create({
        _id,
        userId,
        name,
        parentFolderId,
        sortOrder,
        importMeta
      });
      ensureWriteSucceeded(folder, 'create_folder');
      return toPlainObject(folder);
    },
    async renameFolder({ userId, folderId, name }) {
      const result = await notebookFolders.updateOne(
        { _id: folderId, userId },
        { $set: { name } }
      );
      return ensureWriteSucceeded(result, 'rename_folder');
    },
    async deleteFolder({ userId, folderId, operationName = 'delete_folder' }) {
      const deleted = await notebookFolders.findOneAndDelete({ _id: folderId, userId });
      if (!deleted) return null;
      ensureWriteSucceeded(deleted, operationName);
      return toPlainObject(deleted);
    },
    async countChildFolders({ userId, folderId }) {
      return notebookFolders.countDocuments({ userId, parentFolderId: folderId });
    },
    async countEntriesInFolder({ userId, folderId }) {
      return notebookEntries.countDocuments({ userId, folder: folderId });
    },
    async findEntryById({ userId, itemId }) {
      const entry = await notebookEntries.findOne({ _id: itemId, userId });
      return entry ? toPlainObject(entry) : null;
    },
    async listEntriesByFolder({ userId, folderId }) {
      if (typeof notebookEntries.find !== 'function') return [];
      const entries = await notebookEntries.find({ userId, folder: folderId });
      return Array.isArray(entries) ? entries.map((entry) => toPlainObject(entry)) : [];
    },
    async moveEntry({ userId, itemId, folderId, operationName = 'move_item' }) {
      const result = await notebookEntries.updateOne(
        { _id: itemId, userId },
        { $set: { folder: folderId } }
      );
      return ensureWriteSucceeded(result, operationName);
    },
    async moveEntriesInFolder({ userId, sourceFolderId, destinationFolderId, entries = [] }) {
      if (!Array.isArray(entries) || entries.length === 0) return null;
      if (typeof notebookEntries.updateMany === 'function') {
        const result = await notebookEntries.updateMany(
          { userId, folder: sourceFolderId },
          { $set: { folder: destinationFolderId } }
        );
        return ensureWriteSucceeded(result, 'merge_folder.note_move');
      }

      for (const entry of entries) {
        await this.moveEntry({
          userId,
          itemId: clean(entry?._id),
          folderId: destinationFolderId,
          operationName: 'merge_folder.note_move'
        });
      }
      return { matchedCount: entries.length, modifiedCount: entries.length };
    }
  };
};

const resolveLibraryAdapter = (models = {}) => {
  const folders = pickModel(models, ['folders', 'Folder']);
  const articles = pickModel(models, ['articles', 'Article']);
  if (!folders || !articles) return null;

  return {
    targetDomain: 'library',
    async findFolderById({ userId, folderId }) {
      const safeFolderId = clean(folderId);
      if (!safeFolderId) return null;
      const folder = await folders.findOne({ _id: safeFolderId, userId });
      return folder ? toPlainObject(folder) : null;
    },
    async createFolder({ userId, name }) {
      const existing = typeof folders.findOne === 'function'
        ? await folders.findOne({ userId, name })
        : null;
      if (existing) return { ...toPlainObject(existing), __wasExisting: true };

      const folder = await folders.create({ userId, name });
      ensureWriteSucceeded(folder, 'create_folder');
      return toPlainObject(folder);
    },
    async renameFolder({ userId, folderId, name }) {
      const result = await folders.updateOne(
        { _id: folderId, userId },
        { $set: { name } }
      );
      return ensureWriteSucceeded(result, 'rename_folder');
    },
    async deleteFolder({ userId, folderId, operationName = 'delete_folder' }) {
      const deleted = await folders.findOneAndDelete({ _id: folderId, userId });
      if (!deleted) return null;
      ensureWriteSucceeded(deleted, operationName);
      return toPlainObject(deleted);
    },
    async countChildFolders() {
      return 0;
    },
    async countEntriesInFolder({ userId, folderId }) {
      return articles.countDocuments({ userId, folder: folderId });
    },
    async findEntryById({ userId, itemId }) {
      const article = await articles.findOne({ _id: itemId, userId });
      return article ? toPlainObject(article) : null;
    },
    async listEntriesByFolder({ userId, folderId }) {
      if (typeof articles.find !== 'function') return [];
      const rows = await articles.find({ userId, folder: folderId });
      return Array.isArray(rows) ? rows.map((article) => toPlainObject(article)) : [];
    },
    async moveEntry({ userId, itemId, folderId, operationName = 'move_item' }) {
      const result = await articles.updateOne(
        { _id: itemId, userId },
        { $set: { folder: folderId } }
      );
      return ensureWriteSucceeded(result, operationName);
    },
    async moveEntriesInFolder({ userId, sourceFolderId, destinationFolderId, entries = [] }) {
      if (!Array.isArray(entries) || entries.length === 0) return null;
      if (typeof articles.updateMany === 'function') {
        const result = await articles.updateMany(
          { userId, folder: sourceFolderId },
          { $set: { folder: destinationFolderId } }
        );
        return ensureWriteSucceeded(result, 'merge_folder.item_move');
      }

      for (const entry of entries) {
        await this.moveEntry({
          userId,
          itemId: clean(entry?._id),
          folderId: destinationFolderId,
          operationName: 'merge_folder.item_move'
        });
      }
      return { matchedCount: entries.length, modifiedCount: entries.length };
    }
  };
};

const resolveStructureDomainAdapters = (models = {}) => ({
  library: resolveLibraryAdapter(models),
  notebook: resolveNotebookAdapter(models)
});

const getAdapterForOperation = ({ adapters = {}, operation = {} } = {}) => {
  const targetDomain = normalizeTargetDomain(operation?.targetDomain);
  return {
    targetDomain,
    adapter: adapters[targetDomain] || null
  };
};

const resolveDestinationFolderId = ({ operation, context, targetDomain }) => {
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const directId = clean(payload.destinationFolderId || payload.folderId || payload.parentFolderId);
  if (directId) return { folderId: directId, source: 'direct' };

  const destinationName = clean(payload.destinationFolderName);
  if (!destinationName) return { folderId: '', source: 'missing' };

  const createdFolderId = context.createdFoldersByName.get(buildCreatedFolderKey(targetDomain, destinationName));
  if (createdFolderId) return { folderId: createdFolderId, source: 'created_name' };

  return { folderId: '', source: 'unresolved_name' };
};

const skipOperation = (operation, context, reason = '') => {
  operation.status = 'skipped';
  if (reason) operation.error = reason;
  recordOperationStats(context, 'skippedCount');
};

const applyCreateFolder = async ({ adapter, operation, userId, context, targetDomain }) => {
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const name = clean(payload.name);
  if (!name) {
    skipOperation(operation, context);
    return;
  }

  const parentFolderId = clean(payload.parentFolderId);
  if (parentFolderId) {
    const parentFolder = await adapter.findFolderById({ userId, folderId: parentFolderId });
    if (!parentFolder) {
      skipOperation(operation, context);
      return;
    }
  }

  const folder = await adapter.createFolder({
    userId,
    name,
    parentFolderId: parentFolderId || null,
    sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
    importMeta: payload.importMeta && typeof payload.importMeta === 'object' ? payload.importMeta : undefined
  });
  const folderId = clean(folder._id);
  if (!folderId) {
    throw new Error('create_folder did not produce a folder id.');
  }

  context.createdFoldersByName.set(buildCreatedFolderKey(targetDomain, folder.name || name), folderId);

  operation.status = 'applied';
  operation.executionIndex = context.nextExecutionIndex++;
  operation.undoPayload = folder.__wasExisting
    ? { type: 'noop', reason: 'Folder already existed before execution.', targetDomain }
    : { type: 'delete_folder', folderId, targetDomain };
  recordOperationStats(context, 'appliedCount');
};

const applyMoveItem = async ({ adapter, operation, userId, context, targetDomain }) => {
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const itemId = clean(payload.itemId || payload.entryId || payload.noteId);
  if (!itemId) {
    skipOperation(operation, context);
    return;
  }

  const { folderId: destinationFolderId, source: destinationSource } = resolveDestinationFolderId({
    operation,
    context,
    targetDomain
  });
  if (!destinationFolderId || destinationSource === 'unresolved_name' || destinationSource === 'missing') {
    skipOperation(operation, context);
    return;
  }

  if (destinationSource === 'direct') {
    const destinationFolder = await adapter.findFolderById({ userId, folderId: destinationFolderId });
    if (!destinationFolder) {
      skipOperation(operation, context);
      return;
    }
  }

  const entry = await adapter.findEntryById({ userId, itemId });
  if (!entry) {
    skipOperation(operation, context);
    return;
  }

  const previousFolderId = clean(entry.folder) || null;
  await adapter.moveEntry({ userId, itemId, folderId: destinationFolderId });

  operation.status = 'applied';
  operation.executionIndex = context.nextExecutionIndex++;
  operation.undoPayload = {
    type: 'move_item',
    itemId,
    previousFolderId,
    targetDomain
  };
  recordOperationStats(context, 'appliedCount');
};

const applyDeleteFolder = async ({ adapter, operation, userId, context, targetDomain }) => {
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const folderId = clean(payload.folderId || payload.id);
  if (!folderId) {
    skipOperation(operation, context);
    return;
  }

  const entryCount = await adapter.countEntriesInFolder({ userId, folderId });
  const childFolderCount = await adapter.countChildFolders({ userId, folderId });
  if (entryCount > 0 || childFolderCount > 0) {
    skipOperation(operation, context);
    return;
  }

  const folder = await adapter.findFolderById({ userId, folderId });
  if (!folder) {
    skipOperation(operation, context);
    return;
  }

  const deleted = await adapter.deleteFolder({ userId, folderId, operationName: 'delete_folder' });
  if (!deleted) {
    skipOperation(operation, context);
    return;
  }

  operation.status = 'applied';
  operation.executionIndex = context.nextExecutionIndex++;
  operation.undoPayload = { type: 'restore_folder', folder: deleted, targetDomain };
  recordOperationStats(context, 'appliedCount');
};

const applyRenameFolder = async ({ adapter, operation, userId, context, targetDomain }) => {
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const folderId = clean(payload.folderId || payload.id);
  const nextName = clean(payload.name || payload.newName);
  if (!folderId || !nextName) {
    skipOperation(operation, context);
    return;
  }

  const folder = await adapter.findFolderById({ userId, folderId });
  if (!folder) {
    skipOperation(operation, context);
    return;
  }

  await adapter.renameFolder({ userId, folderId, name: nextName });

  operation.status = 'applied';
  operation.executionIndex = context.nextExecutionIndex++;
  operation.undoPayload = {
    type: 'rename_folder',
    folder,
    targetDomain
  };
  context.createdFoldersByName.delete(buildCreatedFolderKey(targetDomain, folder.name));
  context.createdFoldersByName.set(buildCreatedFolderKey(targetDomain, nextName), folderId);
  recordOperationStats(context, 'appliedCount');
};

const applyMergeFolder = async ({ adapter, operation, userId, context, targetDomain }) => {
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const sourceFolderId = clean(payload.sourceFolderId || payload.folderId || payload.fromFolderId);
  const { folderId: destinationFolderId, source: destinationSource } = resolveDestinationFolderId({
    operation: {
      payload: {
        destinationFolderId: payload.destinationFolderId,
        destinationFolderName: payload.destinationFolderName,
        folderId: payload.destinationFolderId,
        parentFolderId: payload.destinationFolderId
      }
    },
    context,
    targetDomain
  });

  if (!sourceFolderId || !destinationFolderId || destinationSource === 'unresolved_name' || destinationSource === 'missing') {
    skipOperation(operation, context);
    return;
  }

  const sourceFolder = await adapter.findFolderById({ userId, folderId: sourceFolderId });
  if (!sourceFolder) {
    skipOperation(operation, context);
    return;
  }

  if (destinationSource === 'direct') {
    const destinationFolder = await adapter.findFolderById({ userId, folderId: destinationFolderId });
    if (!destinationFolder) {
      skipOperation(operation, context);
      return;
    }
  }

  if (sourceFolderId === destinationFolderId) {
    skipOperation(operation, context);
    return;
  }

  const childFolderCount = await adapter.countChildFolders({ userId, folderId: sourceFolderId });
  if (childFolderCount > 0) {
    skipOperation(operation, context);
    return;
  }

  const entries = await adapter.listEntriesByFolder({ userId, folderId: sourceFolderId });

  if (entries.length > 0) {
    await adapter.moveEntriesInFolder({
      userId,
      sourceFolderId,
      destinationFolderId,
      entries
    });
  }

  try {
    const deleted = await adapter.deleteFolder({
      userId,
      folderId: sourceFolderId,
      operationName: 'merge_folder.folder_delete'
    });
    if (!deleted) {
      throw new Error('merge_folder source folder could not be deleted.');
    }
  } catch (error) {
    const restoreErrors = [];
    if (entries.length > 0) {
      for (const entry of entries) {
        try {
          await adapter.moveEntry({
            userId,
            itemId: clean(entry?._id),
            folderId: sourceFolderId
          });
        } catch (restoreError) {
          restoreErrors.push(restoreError);
        }
      }
    }
    if (restoreErrors.length > 0) {
      const message = restoreErrors
        .map((restoreError) => clean(restoreError?.message) || 'restore failed')
        .join('; ');
      const compensationError = new Error(`merge_folder compensation incomplete: ${message}`);
      compensationError.cause = error;
      compensationError.restoreErrors = restoreErrors;
      throw compensationError;
    }
    throw error;
  }

  operation.status = 'applied';
  operation.executionIndex = context.nextExecutionIndex++;
  operation.undoPayload = {
    type: 'restore_merge',
    sourceFolder,
    movedNotes: entries.map((entry) => ({
      itemId: clean(entry._id),
      previousFolderId: sourceFolderId
    })),
    targetDomain
  };
  recordOperationStats(context, 'appliedCount');
};

const applyUnsupportedOperation = (operation, context) => {
  skipOperation(operation, context);
};

const applyStructureProposal = async ({ models, proposal, userId }) => {
  const safeProposal = proposal && typeof proposal === 'object' ? proposal : { operations: [] };
  const adapters = resolveStructureDomainAdapters(models);
  const hasConfiguredAdapter = Object.values(adapters).some(Boolean);
  if (!hasConfiguredAdapter) {
    throw new Error('applyStructureProposal requires at least one configured structure domain adapter.');
  }

  const context = {
    createdFoldersByName: new Map(),
    nextExecutionIndex: 0,
    executionStats: {
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      totalCount: 0
    }
  };

  const operations = sortOperationsForApply(safeProposal.operations || []);
  context.executionStats.totalCount = operations.length;

  for (const { operation } of operations) {
    const type = clean(operation?.type).toLowerCase();
    if (clean(operation?.status).toLowerCase() === 'rejected') {
      skipOperation(operation, context);
      continue;
    }

    const { targetDomain, adapter } = getAdapterForOperation({ adapters, operation });
    if (!adapter) {
      skipOperation(operation, context, `No structure adapter configured for ${targetDomain}.`);
      continue;
    }

    try {
      if (type === 'create_folder') {
        await applyCreateFolder({ adapter, operation, userId, context, targetDomain });
        continue;
      }

      if (type === 'rename_folder') {
        await applyRenameFolder({ adapter, operation, userId, context, targetDomain });
        continue;
      }

      if (type === 'move_item') {
        await applyMoveItem({ adapter, operation, userId, context, targetDomain });
        continue;
      }

      if (type === 'merge_folder') {
        await applyMergeFolder({ adapter, operation, userId, context, targetDomain });
        continue;
      }

      if (type === 'delete_folder') {
        await applyDeleteFolder({ adapter, operation, userId, context, targetDomain });
        continue;
      }

      applyUnsupportedOperation(operation, context);
    } catch (error) {
      operation.status = 'failed';
      operation.error = clean(error?.message) || 'Operation failed.';
      recordOperationStats(context, 'failedCount');
    }
  }

  return finishProposalExecution(safeProposal, context);
};

const rollbackStructureProposal = async ({ models, proposal, userId }) => {
  const safeProposal = proposal && typeof proposal === 'object' ? proposal : { operations: [] };
  const adapters = resolveStructureDomainAdapters(models);
  const hasConfiguredAdapter = Object.values(adapters).some(Boolean);
  if (!hasConfiguredAdapter) {
    throw new Error('rollbackStructureProposal requires at least one configured structure domain adapter.');
  }

  for (const operation of sortOperationsForRollback(safeProposal.operations || [])) {
    const undo = operation?.undoPayload && typeof operation.undoPayload === 'object' ? operation.undoPayload : {};
    const undoType = clean(undo.type).toLowerCase();
    const targetDomain = normalizeTargetDomain(undo.targetDomain || operation?.targetDomain);
    const adapter = adapters[targetDomain] || null;
    if (!adapter) continue;

    if (undoType === 'move_item') {
      const itemId = clean(undo.itemId);
      if (!itemId) continue;
      await adapter.moveEntry({
        userId,
        itemId,
        folderId: clean(undo.previousFolderId) || null
      });
      continue;
    }

    if (undoType === 'delete_folder') {
      const folderId = clean(undo.folderId);
      if (!folderId) continue;
      await adapter.deleteFolder({ userId, folderId, operationName: 'rollback.delete_folder' });
      continue;
    }

    if (undoType === 'rename_folder') {
      const folder = toPlainObject(undo.folder);
      const folderId = clean(folder._id);
      if (!folderId) continue;
      await adapter.renameFolder({
        userId,
        folderId,
        name: folder.name
      });
      continue;
    }

    if (undoType === 'restore_merge') {
      const sourceFolder = toPlainObject(undo.sourceFolder);
      const sourceFolderId = clean(sourceFolder._id);
      if (!sourceFolderId) continue;
      await adapter.createFolder({
        _id: sourceFolder._id,
        userId,
        name: sourceFolder.name,
        parentFolderId: sourceFolder.parentFolderId || null,
        sortOrder: Number.isFinite(Number(sourceFolder.sortOrder)) ? Number(sourceFolder.sortOrder) : 0,
        importMeta: sourceFolder.importMeta
      });
      for (const entry of Array.isArray(undo.movedNotes) ? undo.movedNotes : []) {
        const itemId = clean(entry?.itemId);
        if (!itemId) continue;
        await adapter.moveEntry({
          userId,
          itemId,
          folderId: clean(entry.previousFolderId) || null
        });
      }
      continue;
    }

    if (undoType === 'restore_folder') {
      const folder = toPlainObject(undo.folder);
      if (!clean(folder._id)) continue;
      await adapter.createFolder({
        _id: folder._id,
        userId,
        name: folder.name,
        parentFolderId: folder.parentFolderId || null,
        sortOrder: Number.isFinite(Number(folder.sortOrder)) ? Number(folder.sortOrder) : 0,
        importMeta: folder.importMeta
      });
    }
  }

  safeProposal.status = 'rolled_back';
  return safeProposal;
};

module.exports = {
  applyStructureProposal,
  rollbackStructureProposal,
  resolveStructureDomainAdapters
};
