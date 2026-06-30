const assert = require('assert');

const {
  normalizeStructureProposal,
  sanitizeAgentStructureProposalDoc,
  updateStructureProposalDraft,
  acceptStructureProposal,
  rejectStructureProposal,
  rollbackAcceptedStructureProposal
} = require('../agentStructureProposals');

const buildDoc = (payload = {}) => ({
  ...payload,
  async save() {
    return this;
  },
  toObject() {
    return {
      ...this,
      save: undefined,
      toObject: undefined
    };
  }
});

const buildStructureModels = (state) => ({
  NotebookFolder: {
    async create(payload) {
      const next = {
        _id: payload._id || `folder-${state.folders.length + 1}`,
        userId: payload.userId,
        name: payload.name,
        parentFolderId: payload.parentFolderId || null,
        sortOrder: payload.sortOrder || 0
      };
      state.folders.push(next);
      return { ...next };
    },
    async findOne(query = {}) {
      const found = state.folders.find((folder) => (
        (!query._id || String(folder._id) === String(query._id))
        && (!query.userId || String(folder.userId) === String(query.userId))
      ));
      return found ? { ...found } : null;
    },
    async findOneAndDelete(query = {}) {
      const index = state.folders.findIndex((folder) => (
        (!query._id || String(folder._id) === String(query._id))
        && (!query.userId || String(folder.userId) === String(query.userId))
      ));
      if (index < 0) return null;
      const [deleted] = state.folders.splice(index, 1);
      return { ...deleted };
    },
    async countDocuments(query = {}) {
      return state.folders.filter((folder) => (
        (!query.userId || String(folder.userId) === String(query.userId))
        && String(folder.parentFolderId || '') === String(query.parentFolderId || '')
      )).length;
    },
    async updateOne(query = {}, update = {}) {
      const folder = state.folders.find((entry) => (
        (!query._id || String(entry._id) === String(query._id))
        && (!query.userId || String(entry.userId) === String(query.userId))
      ));
      if (!folder) return { matchedCount: 0, modifiedCount: 0 };
      if (update?.$set && Object.prototype.hasOwnProperty.call(update.$set, 'name')) {
        folder.name = update.$set.name;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    }
  },
  NotebookEntry: {
    async findOne(query = {}) {
      const found = state.notes.find((note) => (
        (!query._id || String(note._id) === String(query._id))
        && (!query.userId || String(note.userId) === String(query.userId))
      ));
      return found ? { ...found } : null;
    },
    async find(query = {}) {
      return state.notes
        .filter((note) => (
          (!query.userId || String(note.userId) === String(query.userId))
          && String(note.folder || '') === String(query.folder || '')
        ))
        .map((note) => ({ ...note }));
    },
    async updateOne(query = {}, update = {}) {
      const note = state.notes.find((entry) => (
        (!query._id || String(entry._id) === String(query._id))
        && (!query.userId || String(entry.userId) === String(query.userId))
      ));
      if (!note) return { matchedCount: 0, modifiedCount: 0 };
      if (update?.$set && Object.prototype.hasOwnProperty.call(update.$set, 'folder')) {
        note.folder = update.$set.folder;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async updateMany(query = {}, update = {}) {
      const matches = state.notes.filter((note) => (
        (!query.userId || String(note.userId) === String(query.userId))
        && String(note.folder || '') === String(query.folder || '')
      ));
      matches.forEach((note) => {
        if (update?.$set && Object.prototype.hasOwnProperty.call(update.$set, 'folder')) {
          note.folder = update.$set.folder;
        }
      });
      return { matchedCount: matches.length, modifiedCount: matches.length };
    },
    async countDocuments(query = {}) {
      return state.notes.filter((note) => (
        (!query.userId || String(note.userId) === String(query.userId))
        && String(note.folder || '') === String(query.folder || '')
      )).length;
    }
  },
  Folder: {
    async create(payload) {
      const next = {
        _id: payload._id || `library-folder-${state.libraryFolders.length + 1}`,
        userId: payload.userId,
        name: payload.name
      };
      state.libraryFolders.push(next);
      return { ...next };
    },
    async findOne(query = {}) {
      const found = state.libraryFolders.find((folder) => (
        (!query._id || String(folder._id) === String(query._id))
        && (!query.userId || String(folder.userId) === String(query.userId))
        && (!query.name || String(folder.name) === String(query.name))
      ));
      return found ? { ...found } : null;
    },
    async findOneAndDelete(query = {}) {
      const index = state.libraryFolders.findIndex((folder) => (
        (!query._id || String(folder._id) === String(query._id))
        && (!query.userId || String(folder.userId) === String(query.userId))
      ));
      if (index < 0) return null;
      const [deleted] = state.libraryFolders.splice(index, 1);
      return { ...deleted };
    },
    async countDocuments() {
      return 0;
    },
    async updateOne(query = {}, update = {}) {
      const folder = state.libraryFolders.find((entry) => (
        (!query._id || String(entry._id) === String(query._id))
        && (!query.userId || String(entry.userId) === String(query.userId))
      ));
      if (!folder) return { matchedCount: 0, modifiedCount: 0 };
      if (update?.$set && Object.prototype.hasOwnProperty.call(update.$set, 'name')) {
        folder.name = update.$set.name;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    }
  },
  Article: {
    async findOne(query = {}) {
      const found = state.articles.find((article) => (
        (!query._id || String(article._id) === String(query._id))
        && (!query.userId || String(article.userId) === String(query.userId))
      ));
      return found ? { ...found } : null;
    },
    async find(query = {}) {
      return state.articles
        .filter((article) => (
          (!query.userId || String(article.userId) === String(query.userId))
          && String(article.folder || '') === String(query.folder || '')
        ))
        .map((article) => ({ ...article }));
    },
    async updateOne(query = {}, update = {}) {
      const article = state.articles.find((entry) => (
        (!query._id || String(entry._id) === String(query._id))
        && (!query.userId || String(entry.userId) === String(query.userId))
      ));
      if (!article) return { matchedCount: 0, modifiedCount: 0 };
      if (update?.$set && Object.prototype.hasOwnProperty.call(update.$set, 'folder')) {
        article.folder = update.$set.folder;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async updateMany(query = {}, update = {}) {
      const matches = state.articles.filter((article) => (
        (!query.userId || String(article.userId) === String(query.userId))
        && String(article.folder || '') === String(query.folder || '')
      ));
      matches.forEach((article) => {
        if (update?.$set && Object.prototype.hasOwnProperty.call(update.$set, 'folder')) {
          article.folder = update.$set.folder;
        }
      });
      return { matchedCount: matches.length, modifiedCount: matches.length };
    },
    async countDocuments(query = {}) {
      return state.articles.filter((article) => (
        (!query.userId || String(article.userId) === String(query.userId))
        && String(article.folder || '') === String(query.folder || '')
      )).length;
    }
  }
});

const run = async () => {
  const proposal = normalizeStructureProposal({
    _id: 'plan-1',
    status: 'totally_unknown',
    scope: 'import_session',
    title: 'Organize import',
    summary: 'Stage the import cleanup work.',
    rationale: 'Keep the workspace clean after ingestion.',
    operations: [
      {
        opId: 'move-1',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { itemId: 'note-1', destinationFolderId: 'folder-2' },
        preview: { movedCount: 1 },
        risk: 'medium',
        undoPayload: { itemId: 'note-1', previousFolderId: 'folder-1' }
      },
      {
        opId: 'bad-1',
        type: 'not-a-real-op',
        targetDomain: 'somewhere_else',
        status: 'invalid',
        payload: 'not-an-object',
        preview: null,
        risk: 'dangerous',
        undoPayload: null
      }
    ],
    acceptedAt: 'definitely-not-a-date'
  });

  assert.strictEqual(proposal.structureProposalId, 'plan-1');
  assert.strictEqual(proposal.status, 'pending');
  assert.strictEqual(proposal.scope, 'import_session');
  assert.strictEqual(proposal.operations[0].type, 'move_item');
  assert.strictEqual(proposal.operations[0].targetDomain, 'notebook');
  assert.strictEqual(proposal.operations[0].status, 'approved');
  assert.strictEqual(proposal.operations[0].risk, 'medium');
  assert.strictEqual(proposal.operations[0].isActionable, true);
  assert.strictEqual(proposal.operations[0].rawType, null);
  assert.strictEqual(proposal.operations[1].type, 'not-a-real-op');
  assert.strictEqual(proposal.operations[1].targetDomain, 'somewhere_else');
  assert.strictEqual(proposal.operations[1].status, 'invalid');
  assert.strictEqual(proposal.operations[1].risk, 'dangerous');
  assert.strictEqual(proposal.operations[1].payload && typeof proposal.operations[1].payload, 'object');
  assert.strictEqual(proposal.operations[1].preview && typeof proposal.operations[1].preview, 'object');
  assert.strictEqual(proposal.operations[1].undoPayload && typeof proposal.operations[1].undoPayload, 'object');
  assert.strictEqual(proposal.operations[1].isActionable, false);
  assert.deepStrictEqual(proposal.operations[1].invalidFields, ['type', 'targetDomain', 'status', 'risk']);
  assert.strictEqual(proposal.operations[1].rawType, 'not-a-real-op');
  assert.strictEqual(proposal.operations[1].rawTargetDomain, 'somewhere_else');
  assert.strictEqual(proposal.operations[1].rawStatus, 'invalid');
  assert.strictEqual(proposal.operations[1].rawRisk, 'dangerous');
  assert.strictEqual(proposal.acceptedAt, null);

  const sanitized = sanitizeAgentStructureProposalDoc({
    toObject: () => ({
      _id: 'plan-1',
      status: 'rolled_back',
      scope: 'surface',
      scopeRef: 'article-1',
      acceptedAt: new Date('2026-04-19T12:00:00.000Z'),
      rejectedAt: new Date('2026-04-19T13:00:00.000Z'),
      rolledBackAt: new Date('2026-04-19T14:00:00.000Z'),
      operations: []
    })
  });

  assert.strictEqual(sanitized.structureProposalId, 'plan-1');
  assert.strictEqual(sanitized.status, 'rolled_back');
  assert.strictEqual(sanitized.scope, 'surface');
  assert.strictEqual(sanitized.scopeRef, 'article-1');
  assert.strictEqual(sanitized.acceptedAt, '2026-04-19T12:00:00.000Z');
  assert.strictEqual(sanitized.rejectedAt, '2026-04-19T13:00:00.000Z');
  assert.strictEqual(sanitized.rolledBackAt, '2026-04-19T14:00:00.000Z');

  const editableDoc = buildDoc({
    _id: 'plan-edit',
    userId: 'user-1',
    status: 'pending',
    title: 'Original title',
    summary: 'Original summary',
    rationale: 'Original rationale',
    operations: [
      {
        opId: 'move-1',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { itemId: 'note-1', destinationFolderId: 'folder-a' },
        preview: { from: 'Inbox' },
        risk: 'low'
      }
    ]
  });

  const editableModel = {
    async findOne(query = {}) {
      return String(query._id) === 'plan-edit' && String(query.userId) === 'user-1' ? editableDoc : null;
    }
  };

  const updated = await updateStructureProposalDraft({
    AgentStructureProposal: editableModel,
    userId: 'user-1',
    structureProposalId: 'plan-edit',
    updates: {
      title: 'Updated title',
      operations: [
        {
          opId: 'move-1',
          status: 'rejected',
          payload: { destinationFolderId: 'folder-b' },
          preview: { reason: 'User prefers archive' }
        }
      ]
    }
  });

  assert.strictEqual(updated.title, 'Updated title');
  assert.strictEqual(updated.operations[0].status, 'rejected');
  assert.strictEqual(updated.operations[0].payload.destinationFolderId, 'folder-b');
  assert.strictEqual(updated.operations[0].preview.reason, 'User prefers archive');

  const state = {
    folders: [
      { _id: 'folder-a', name: 'Inbox', userId: 'user-1' }
    ],
    notes: [
      { _id: 'note-1', title: 'Note 1', userId: 'user-1', folder: 'folder-a' }
    ],
    libraryFolders: [
      { _id: 'library-folder-a', name: 'Unfiled', userId: 'user-1' }
    ],
    articles: [
      { _id: 'article-1', title: 'Article 1', userId: 'user-1', folder: null }
    ]
  };
  const models = buildStructureModels(state);

  const applyDoc = buildDoc({
    _id: 'plan-apply',
    userId: 'user-1',
    status: 'pending',
    scope: 'surface',
    scopeRef: 'notebook',
    sourceRunId: 'run-1',
    operations: [
      {
        opId: 'create-1',
        type: 'create_folder',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { name: 'Projects' },
        preview: {},
        risk: 'low'
      },
      {
        opId: 'move-1',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { itemId: 'note-1', destinationFolderName: 'Projects' },
        preview: {},
        risk: 'low'
      }
    ]
  });

  const skippedApplyDoc = buildDoc({
    _id: 'plan-skip',
    userId: 'user-1',
    status: 'pending',
    operations: [
      {
        opId: 'move-missing',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'approved',
        payload: { itemId: 'note-1', destinationFolderId: 'missing-folder' },
        preview: {},
        risk: 'low'
      }
    ]
  });

  const rejectDoc = buildDoc({
    _id: 'plan-reject',
    userId: 'user-1',
    status: 'pending',
    operations: []
  });

  const applyModel = {
    async findOne(query = {}) {
      if (String(query.userId) !== 'user-1') return null;
      if (String(query._id) === 'plan-apply') return applyDoc;
      if (String(query._id) === 'plan-skip') return skippedApplyDoc;
      if (String(query._id) === 'plan-reject') return rejectDoc;
      return null;
    }
  };

  const accepted = await acceptStructureProposal({
    AgentStructureProposal: applyModel,
    NotebookFolder: models.NotebookFolder,
    NotebookEntry: models.NotebookEntry,
    userId: 'user-1',
    structureProposalId: 'plan-apply',
    actor: { actorType: 'user', actorId: 'user-1' }
  });

  assert.strictEqual(accepted.status, 'applied');
  assert.ok(accepted.executionResult, 'Accepted proposals should expose execution details.');
  assert.strictEqual(accepted.executionResult.appliedCount, 2);
  assert.strictEqual(state.folders.some((folder) => folder.name === 'Projects'), true);
  const projectsFolder = state.folders.find((folder) => folder.name === 'Projects');
  assert.strictEqual(state.notes.find((note) => note._id === 'note-1').folder, projectsFolder._id);
  assert.strictEqual(applyDoc.operations[0].status, 'applied');
  assert.strictEqual(applyDoc.operations[0].preview.executionResult.status, 'applied');
  assert.strictEqual(applyDoc.acceptedBy.actorId, 'user-1');
  assert.ok(applyDoc.acceptedAt instanceof Date);

  const rolledBack = await rollbackAcceptedStructureProposal({
    AgentStructureProposal: applyModel,
    NotebookFolder: models.NotebookFolder,
    NotebookEntry: models.NotebookEntry,
    userId: 'user-1',
    structureProposalId: 'plan-apply',
    actor: { actorType: 'user', actorId: 'user-1' }
  });

  assert.strictEqual(rolledBack.status, 'rolled_back');
  assert.strictEqual(state.notes.find((note) => note._id === 'note-1').folder, 'folder-a');
  assert.strictEqual(state.folders.some((folder) => folder.name === 'Projects'), false);
  assert.strictEqual(rolledBack.rolledBackBy.actorId, 'user-1');
  assert.ok(rolledBack.rolledBackAt instanceof Date);

  const rejected = await rejectStructureProposal({
    AgentStructureProposal: applyModel,
    userId: 'user-1',
    structureProposalId: 'plan-reject',
    actor: { actorType: 'user', actorId: 'user-1' }
  });

  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(rejected.rejectedBy.actorId, 'user-1');
  assert.ok(rejected.rejectedAt instanceof Date);

  const skipped = await acceptStructureProposal({
    AgentStructureProposal: applyModel,
    NotebookFolder: models.NotebookFolder,
    NotebookEntry: models.NotebookEntry,
    userId: 'user-1',
    structureProposalId: 'plan-skip',
    actor: { actorType: 'user', actorId: 'user-1' }
  });

  assert.strictEqual(skipped.status, 'skipped');
  assert.strictEqual(skipped.executionResult.status, 'skipped');
  assert.strictEqual(skipped.executionResult.appliedCount, 0);

  const libraryDoc = buildDoc({
    _id: 'plan-library',
    userId: 'user-1',
    status: 'pending',
    scope: 'workspace',
    scopeRef: 'library-filing',
    operations: [
      {
        opId: 'create-library-1',
        type: 'create_folder',
        targetDomain: 'library',
        status: 'approved',
        payload: { name: 'Investing' },
        preview: {},
        risk: 'low'
      },
      {
        opId: 'move-library-1',
        type: 'move_item',
        targetDomain: 'library',
        status: 'approved',
        payload: { itemId: 'article-1', destinationFolderName: 'Investing' },
        preview: {},
        risk: 'low'
      }
    ]
  });

  const libraryModel = {
    async findOne(query = {}) {
      return String(query.userId) === 'user-1' && String(query._id) === 'plan-library'
        ? libraryDoc
        : null;
    }
  };

  const acceptedLibrary = await acceptStructureProposal({
    AgentStructureProposal: libraryModel,
    NotebookFolder: models.NotebookFolder,
    NotebookEntry: models.NotebookEntry,
    Folder: models.Folder,
    Article: models.Article,
    userId: 'user-1',
    structureProposalId: 'plan-library',
    actor: { actorType: 'user', actorId: 'user-1' }
  });

  assert.strictEqual(acceptedLibrary.status, 'applied');
  assert.strictEqual(acceptedLibrary.executionResult.appliedCount, 2);
  const investingFolder = state.libraryFolders.find((folder) => folder.name === 'Investing');
  assert.ok(investingFolder, 'Library filing apply should create the proposed folder.');
  assert.strictEqual(state.articles.find((article) => article._id === 'article-1').folder, investingFolder._id);
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentStructureProposals tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
