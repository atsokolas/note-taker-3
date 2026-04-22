const assert = require('assert');
const {
  applyStructureProposal,
  rollbackStructureProposal
} = require('../agentStructureExecution');

const buildInMemoryStructureModels = (state) => {
  const log = state.log || (state.log = []);
  let folderCounter = 0;

  const cloneFolder = (folder) => ({ ...folder });
  const cloneEntry = (entry) => ({ ...entry });

  const updateFolderName = (query, update) => {
    const folder = state.folders.find((entry) => {
      if (query._id && String(entry._id) !== String(query._id)) return false;
      if (query.userId && String(entry.userId) !== String(query.userId)) return false;
      return true;
    });
    if (!folder) return { matchedCount: 0, modifiedCount: 0 };
    if (state.failFolderUpdateIds?.has(String(folder._id))) {
      throw new Error(`simulated folder update failure for ${folder._id}`);
    }
    if (update?.$set && Object.prototype.hasOwnProperty.call(update.$set, 'name')) {
      folder.name = update.$set.name;
      log.push(`folders.update:${folder._id}->${folder.name}`);
    }
    return { matchedCount: 1, modifiedCount: 1 };
  };

  const updateEntryFolder = (query, update) => {
    const entry = state.notes.find((item) => {
      if (query._id && String(item._id) !== String(query._id)) return false;
      if (query.userId && String(item.userId) !== String(query.userId)) return false;
      return true;
    });
    if (!entry) return { matchedCount: 0, modifiedCount: 0 };
    if (state.failEntryUpdateIds?.has(String(entry._id))) {
      throw new Error(`simulated entry update failure for ${entry._id}`);
    }
    if (update?.$set && Object.prototype.hasOwnProperty.call(update.$set, 'folder')) {
      entry.folder = update.$set.folder;
      log.push(`entries.update:${entry._id}->${entry.folder || 'null'}`);
    }
    return { matchedCount: 1, modifiedCount: 1 };
  };

  return {
    notebookFolders: {
      async create(payload) {
        const folder = cloneFolder({
          _id: payload._id || `folder-${++folderCounter}`,
          name: payload.name,
          parentFolderId: payload.parentFolderId || null,
          sortOrder: payload.sortOrder || 0,
          userId: payload.userId,
          importMeta: payload.importMeta || undefined
        });
        state.folders.push(folder);
        log.push(`folders.create:${folder._id}`);
        return cloneFolder(folder);
      },
      async findOne(query) {
        const found = state.folders.find((folder) => {
          if (query._id && String(folder._id) !== String(query._id)) return false;
          if (query.userId && String(folder.userId) !== String(query.userId)) return false;
          if (query.name && String(folder.name) !== String(query.name)) return false;
          if (query.parentFolderId !== undefined && String(folder.parentFolderId || '') !== String(query.parentFolderId || '')) return false;
          return true;
        });
        return found ? cloneFolder(found) : null;
      },
      async findOneAndDelete(query) {
        const index = state.folders.findIndex((folder) => {
          if (query._id && String(folder._id) !== String(query._id)) return false;
          if (query.userId && String(folder.userId) !== String(query.userId)) return false;
          return true;
        });
        if (index < 0) return null;
        if (state.failFolderDeleteIds?.has(String(state.folders[index]._id))) {
          throw new Error(`simulated folder delete failure for ${state.folders[index]._id}`);
        }
        const [deleted] = state.folders.splice(index, 1);
        log.push(`folders.delete:${deleted._id}`);
        return cloneFolder(deleted);
      },
      async countDocuments(query) {
        return state.folders.filter((folder) => {
          if (query.userId && String(folder.userId) !== String(query.userId)) return false;
          if (query.parentFolderId !== undefined && String(folder.parentFolderId || '') !== String(query.parentFolderId || '')) return false;
          return true;
        }).length;
      },
      async updateOne(query, update) {
        return updateFolderName(query, update);
      }
    },
    notebookEntries: {
      async findOne(query) {
        const found = state.notes.find((entry) => {
          if (query._id && String(entry._id) !== String(query._id)) return false;
          if (query.userId && String(entry.userId) !== String(query.userId)) return false;
          return true;
        });
        return found ? cloneEntry(found) : null;
      },
      async find(query) {
        return state.notes
          .filter((entry) => {
            if (query.userId && String(entry.userId) !== String(query.userId)) return false;
            if (query.folder !== undefined && String(entry.folder || '') !== String(query.folder || '')) return false;
            return true;
          })
          .map(cloneEntry);
      },
      async updateOne(query, update) {
        return updateEntryFolder(query, update);
      },
      async updateMany(query, update) {
        const matches = state.notes.filter((entry) => {
          if (query.userId && String(entry.userId) !== String(query.userId)) return false;
          if (query.folder !== undefined && String(entry.folder || '') !== String(query.folder || '')) return false;
          return true;
        });
        matches.forEach((entry) => {
          if (state.failEntryUpdateIds?.has(String(entry._id))) {
            throw new Error(`simulated entry update failure for ${entry._id}`);
          }
          if (update?.$set && Object.prototype.hasOwnProperty.call(update.$set, 'folder')) {
            entry.folder = update.$set.folder;
            log.push(`entries.update:${entry._id}->${entry.folder || 'null'}`);
          }
        });
        return { matchedCount: matches.length, modifiedCount: matches.length };
      },
      async countDocuments(query) {
        return state.notes.filter((entry) => {
          if (query.userId && String(entry.userId) !== String(query.userId)) return false;
          if (query.folder !== undefined && String(entry.folder || '') !== String(query.folder || '')) return false;
          return true;
        }).length;
      }
    }
  };
};

const run = async () => {
  const state = {
    folders: [
      { _id: 'folder-a', name: 'Imported', userId: 'user-1' },
      { _id: 'folder-b', name: 'Archive', userId: 'user-1' },
      { _id: 'folder-c', name: 'Hold', userId: 'user-1' }
    ],
    notes: [
      { _id: 'note-1', title: 'Note 1', userId: 'user-1', folder: 'folder-a' },
      { _id: 'note-2', title: 'Note 2', userId: 'user-1', folder: 'folder-b' },
      { _id: 'note-3', title: 'Note 3', userId: 'user-1', folder: 'folder-c' }
    ],
    log: []
  };

  const models = buildInMemoryStructureModels(state);
  const proposal = {
    operations: [
      {
        opId: 'create-1',
        type: 'create_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { name: 'Projects' }
      },
      {
        opId: 'rename-1',
        type: 'rename_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { folderId: 'folder-a', name: 'Imported Renamed' }
      },
      {
        opId: 'move-1',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { itemId: 'note-1', destinationFolderName: 'Projects' }
      },
      {
        opId: 'move-2',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { itemId: 'note-3', destinationFolderName: 'Archive' }
      },
      {
        opId: 'merge-1',
        type: 'merge_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { sourceFolderId: 'folder-b', destinationFolderName: 'Projects' }
      },
      {
        opId: 'delete-1',
        type: 'delete_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { folderId: 'folder-c' }
      },
      {
        opId: 'delete-2',
        type: 'delete_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { folderId: 'folder-a' }
      }
    ]
  };

  const applied = await applyStructureProposal({ models, proposal, userId: 'user-1' });
  assert.strictEqual(applied.status, 'partially_applied');
  assert.deepStrictEqual(applied.executionResult, {
    status: 'partially_applied',
    appliedCount: 5,
    skippedCount: 2,
    failedCount: 0,
    totalCount: 7
  });
  assert.strictEqual(applied.operations[0].status, 'applied');
  assert.strictEqual(applied.operations[1].status, 'applied');
  assert.strictEqual(applied.operations[2].status, 'applied');
  assert.strictEqual(applied.operations[3].status, 'skipped');
  assert.strictEqual(applied.operations[4].status, 'applied');
  assert.strictEqual(applied.operations[5].status, 'skipped');
  assert.strictEqual(applied.operations[6].status, 'applied');

  const projects = state.folders.find((folder) => folder.name === 'Projects');
  assert.ok(projects);
  assert.strictEqual(state.folders.some((folder) => folder._id === 'folder-b'), false);
  assert.strictEqual(state.folders.some((folder) => folder._id === 'folder-c'), true);
  assert.strictEqual(state.folders.some((folder) => folder._id === 'folder-a'), false);
  assert.strictEqual(state.notes.find((note) => note._id === 'note-1').folder, projects._id);
  assert.strictEqual(state.notes.find((note) => note._id === 'note-2').folder, projects._id);
  assert.strictEqual(state.notes.find((note) => note._id === 'note-3').folder, 'folder-c');
  assert.strictEqual(state.folders.some((folder) => folder.name === 'Imported Renamed'), false);

  assert.deepStrictEqual(
    state.log,
    [
      `folders.create:${projects._id}`,
      'folders.update:folder-a->Imported Renamed',
      `entries.update:note-1->${projects._id}`,
      `entries.update:note-2->${projects._id}`,
      'folders.delete:folder-b',
      'folders.delete:folder-a'
    ]
  );

  const rolledBack = await rollbackStructureProposal({ models, proposal: applied, userId: 'user-1' });
  assert.strictEqual(rolledBack.status, 'rolled_back');
  assert.strictEqual(state.notes.find((note) => note._id === 'note-1').folder, 'folder-a');
  assert.strictEqual(state.notes.find((note) => note._id === 'note-2').folder, 'folder-b');
  assert.strictEqual(state.notes.find((note) => note._id === 'note-3').folder, 'folder-c');
  assert.strictEqual(state.folders.some((folder) => folder._id === 'folder-a'), true);
  assert.strictEqual(state.folders.some((folder) => folder._id === 'folder-b'), true);
  assert.strictEqual(state.folders.some((folder) => folder._id === 'folder-c'), true);
  assert.strictEqual(state.folders.some((folder) => folder.name === 'Projects'), false);
  assert.strictEqual(state.folders.find((folder) => folder._id === 'folder-a').name, 'Imported');

  const rollbackLog = state.log.slice(6);
  assert.deepStrictEqual(rollbackLog, [
    'folders.create:folder-a',
    'folders.create:folder-b',
    `entries.update:note-2->folder-b`,
    `entries.update:note-1->folder-a`,
    'folders.update:folder-a->Imported',
    `folders.delete:${projects._id}`
  ]);

  const failureState = {
    folders: [
      { _id: 'folder-fail', name: 'Broken', userId: 'user-1' }
    ],
    notes: [
      { _id: 'note-fail', title: 'Failure note', userId: 'user-1', folder: 'folder-fail' }
    ],
    log: [],
    failFolderUpdateIds: new Set(['folder-fail'])
  };

  const failureModels = buildInMemoryStructureModels(failureState);
  const failureProposal = {
    operations: [
      {
        opId: 'rename-fail',
        type: 'rename_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { folderId: 'folder-fail', name: 'Still Broken' }
      },
      {
        opId: 'create-after-fail',
        type: 'create_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { name: 'Recovered' }
      }
    ]
  };

  const failed = await applyStructureProposal({ models: failureModels, proposal: failureProposal, userId: 'user-1' });
  assert.strictEqual(failed.status, 'partially_applied');
  assert.deepStrictEqual(failed.executionResult, {
    status: 'partially_applied',
    appliedCount: 1,
    skippedCount: 0,
    failedCount: 1,
    totalCount: 2
  });
  assert.strictEqual(failed.operations[0].status, 'failed');
  assert.match(failed.operations[0].error, /simulated folder update failure/);
  assert.strictEqual(failed.operations[1].status, 'applied');
  assert.ok(failureState.folders.some((folder) => folder.name === 'Recovered'));

  const destinationValidationState = {
    folders: [
      { _id: 'folder-a', name: 'Imported', userId: 'user-1' },
      { _id: 'folder-b', name: 'Archive', userId: 'user-1' },
      { _id: 'folder-other', name: 'Other User Folder', userId: 'user-2' }
    ],
    notes: [
      { _id: 'note-1', title: 'Note 1', userId: 'user-1', folder: 'folder-a' }
    ],
    log: []
  };

  const destinationValidationModels = buildInMemoryStructureModels(destinationValidationState);
  const destinationValidationProposal = {
    operations: [
      {
        opId: 'move-missing',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { itemId: 'note-1', destinationFolderId: 'missing-folder' }
      },
      {
        opId: 'move-unauthorized',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { itemId: 'note-1', destinationFolderId: 'folder-other' }
      }
    ]
  };

  const destinationValidationResult = await applyStructureProposal({
    models: destinationValidationModels,
    proposal: destinationValidationProposal,
    userId: 'user-1'
  });
  assert.strictEqual(destinationValidationResult.status, 'skipped');
  assert.deepStrictEqual(destinationValidationResult.executionResult, {
    status: 'skipped',
    appliedCount: 0,
    skippedCount: 2,
    failedCount: 0,
    totalCount: 2
  });
  assert.strictEqual(destinationValidationResult.operations[0].status, 'skipped');
  assert.strictEqual(destinationValidationResult.operations[1].status, 'skipped');
  assert.strictEqual(destinationValidationState.notes.find((note) => note._id === 'note-1').folder, 'folder-a');
  assert.deepStrictEqual(destinationValidationState.log, []);

  const mergeFailureState = {
    folders: [
      { _id: 'folder-source', name: 'Source', userId: 'user-1' },
      { _id: 'folder-target', name: 'Target', userId: 'user-1' }
    ],
    notes: [
      { _id: 'note-merge-1', title: 'Merge note 1', userId: 'user-1', folder: 'folder-source' },
      { _id: 'note-merge-2', title: 'Merge note 2', userId: 'user-1', folder: 'folder-source' }
    ],
    log: [],
    failFolderDeleteIds: new Set(['folder-source'])
  };

  const mergeFailureModels = buildInMemoryStructureModels(mergeFailureState);
  const mergeFailureProposal = {
    operations: [
      {
        opId: 'merge-fail',
        type: 'merge_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { sourceFolderId: 'folder-source', destinationFolderId: 'folder-target' }
      }
    ]
  };

  const mergeFailureResult = await applyStructureProposal({
    models: mergeFailureModels,
    proposal: mergeFailureProposal,
    userId: 'user-1'
  });
  assert.strictEqual(mergeFailureResult.status, 'failed');
  assert.deepStrictEqual(mergeFailureResult.executionResult, {
    status: 'failed',
    appliedCount: 0,
    skippedCount: 0,
    failedCount: 1,
    totalCount: 1
  });
  assert.strictEqual(mergeFailureResult.operations[0].status, 'failed');
  assert.match(mergeFailureResult.operations[0].error, /simulated folder delete failure/);
  assert.strictEqual(mergeFailureState.notes.find((note) => note._id === 'note-merge-1').folder, 'folder-source');
  assert.strictEqual(mergeFailureState.notes.find((note) => note._id === 'note-merge-2').folder, 'folder-source');
  assert.deepStrictEqual(mergeFailureState.log, [
    'entries.update:note-merge-1->folder-target',
    'entries.update:note-merge-2->folder-target',
    'entries.update:note-merge-1->folder-source',
    'entries.update:note-merge-2->folder-source'
  ]);

  const mergeOwnershipState = {
    folders: [
      { _id: 'folder-owned', name: 'Owned', userId: 'user-1' },
      { _id: 'folder-target', name: 'Target', userId: 'user-1' },
      { _id: 'folder-other-source', name: 'Other Source', userId: 'user-2' }
    ],
    notes: [
      { _id: 'note-owned', title: 'Owned note', userId: 'user-1', folder: 'folder-owned' }
    ],
    log: []
  };

  const mergeOwnershipModels = buildInMemoryStructureModels(mergeOwnershipState);
  const mergeOwnershipProposal = {
    operations: [
      {
        opId: 'merge-unauthorized',
        type: 'merge_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { sourceFolderId: 'folder-other-source', destinationFolderId: 'folder-target' }
      }
    ]
  };

  const mergeOwnershipResult = await applyStructureProposal({
    models: mergeOwnershipModels,
    proposal: mergeOwnershipProposal,
    userId: 'user-1'
  });
  assert.strictEqual(mergeOwnershipResult.status, 'skipped');
  assert.deepStrictEqual(mergeOwnershipResult.executionResult, {
    status: 'skipped',
    appliedCount: 0,
    skippedCount: 1,
    failedCount: 0,
    totalCount: 1
  });
  assert.strictEqual(mergeOwnershipResult.operations[0].status, 'skipped');
  assert.strictEqual(mergeOwnershipState.notes.find((note) => note._id === 'note-owned').folder, 'folder-owned');
  assert.deepStrictEqual(mergeOwnershipState.log, []);

  const unsupportedDomainState = {
    folders: [],
    notes: [],
    log: []
  };

  const unsupportedDomainModels = buildInMemoryStructureModels(unsupportedDomainState);
  const unsupportedDomainProposal = {
    operations: [
      {
        opId: 'library-create',
        type: 'create_folder',
        targetDomain: 'library',
        status: 'approved',
        payload: { name: 'Reading clusters' }
      },
      {
        opId: 'notebook-create',
        type: 'create_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { name: 'Notebook cluster' }
      }
    ]
  };

  const unsupportedDomainResult = await applyStructureProposal({
    models: unsupportedDomainModels,
    proposal: unsupportedDomainProposal,
    userId: 'user-1'
  });
  assert.strictEqual(unsupportedDomainResult.status, 'partially_applied');
  assert.deepStrictEqual(unsupportedDomainResult.executionResult, {
    status: 'partially_applied',
    appliedCount: 1,
    skippedCount: 1,
    failedCount: 0,
    totalCount: 2
  });
  assert.strictEqual(unsupportedDomainResult.operations[0].status, 'skipped');
  assert.match(unsupportedDomainResult.operations[0].error, /No structure adapter configured for library/);
  assert.strictEqual(unsupportedDomainResult.operations[1].status, 'applied');
  assert.ok(unsupportedDomainState.folders.some((folder) => folder.name === 'Notebook cluster'));
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentStructureExecution tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
