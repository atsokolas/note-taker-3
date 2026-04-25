const assert = require('assert');

const {
  buildImportStructureProposalPayload,
  stageImportStructureProposal
} = require('../importStructureProposals');

const run = async () => {
  const payload = buildImportStructureProposalPayload({
    userId: 'user-1',
    importSession: {
      _id: 'session-1',
      provider: 'readwise',
      sourceLabel: 'Readwise'
    },
    articleIds: ['article-1', 'article-1', 'article-2'],
    notebookEntryIds: ['note-1']
  });

  assert.ok(payload, 'Import proposal payload should be created when imported items exist.');
  assert.strictEqual(payload.scope, 'import_session');
  assert.strictEqual(payload.scopeRef, 'session-1');
  assert.strictEqual(payload.status, 'pending');
  assert.strictEqual(payload.operations.filter((operation) => operation.type === 'create_folder').length, 2);
  assert.strictEqual(payload.operations.filter((operation) => operation.type === 'move_item').length, 3);
  assert.strictEqual(payload.operations.find((operation) => operation.targetDomain === 'library').payload.name, 'Readwise articles');
  assert.strictEqual(payload.operations.find((operation) => operation.targetDomain === 'notebook').payload.name, 'Readwise notes');

  const createdRows = [];
  const AgentStructureProposal = {
    async findOne() {
      return null;
    },
    async create(nextPayload = {}) {
      const row = {
        _id: `proposal-${createdRows.length + 1}`,
        ...nextPayload
      };
      createdRows.push(row);
      return row;
    }
  };

  const staged = await stageImportStructureProposal({
    AgentStructureProposal,
    userId: 'user-1',
    importSession: {
      _id: 'session-2',
      provider: 'notion',
      sourceLabel: 'Product Wiki'
    },
    notebookEntryIds: ['note-2']
  });

  assert.strictEqual(staged._id, 'proposal-1');
  assert.strictEqual(createdRows.length, 1);
  assert.strictEqual(createdRows[0].scopeRef, 'session-2');
  assert.strictEqual(createdRows[0].operations[1].payload.itemId, 'note-2');

  const existingProposal = { _id: 'proposal-existing' };
  const reused = await stageImportStructureProposal({
    AgentStructureProposal: {
      async findOne() {
        return existingProposal;
      },
      async create() {
        throw new Error('Existing proposal should be reused.');
      }
    },
    userId: 'user-1',
    importSession: { _id: 'session-existing' },
    articleIds: ['article-3']
  });

  assert.strictEqual(reused, existingProposal);
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('importStructureProposals tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
