const assert = require('assert');
const {
  inferOrganizationFolderNameRegex,
  buildFilingStructureOperations,
  classifyArticlesWithRegex,
  buildLibraryFilingProposalPayload,
  stageLibraryFilingSuggestions
} = require('../libraryFilingService');

const sampleArticles = [
  {
    _id: 'article-1',
    title: 'Bitcoin exchange liquidity update',
    highlights: [{ text: 'On-chain settlement risk remains elevated.' }]
  },
  {
    _id: 'article-2',
    title: 'CEO letter on earnings',
    highlights: [{ text: 'Margins improved across the core business.' }]
  }
];

const run = async () => {
  assert.strictEqual(
    inferOrganizationFolderNameRegex({
      title: 'Shinkansen rail expansion',
      snippet: 'High-speed train network'
    }),
    'Transportation'
  );
  assert.strictEqual(
    inferOrganizationFolderNameRegex({
      title: 'Bitcoin exchange liquidity update',
      snippet: 'On-chain settlement risk'
    }),
    'Blockchain and Crypto'
  );

  const operations = buildFilingStructureOperations({
    classifications: classifyArticlesWithRegex(sampleArticles),
    existingFolders: [{ name: 'Company News and Updates' }]
  });
  assert.ok(operations.some((op) => op.type === 'create_folder' && op.status === 'pending'));
  assert.strictEqual(operations.filter((op) => op.type === 'move_item').length, 2);
  assert.ok(operations.every((op) => op.targetDomain === 'library' && op.status === 'pending'));

  const dedupedOperations = buildFilingStructureOperations({
    classifications: [
      {
        id: 'article-2',
        title: 'CEO letter on earnings',
        folderName: 'company news and updates'
      }
    ],
    existingFolders: [{ name: 'Company News and Updates' }]
  });
  assert.strictEqual(dedupedOperations.filter((op) => op.type === 'create_folder').length, 0);
  assert.strictEqual(
    dedupedOperations.find((op) => op.type === 'move_item')?.payload?.destinationFolderName,
    'Company News and Updates'
  );

  const created = [];
  const AgentStructureProposal = {
    findOne: async () => null,
    create: async (payload) => {
      const doc = { _id: 'proposal-1', ...payload };
      created.push(doc);
      return doc;
    }
  };
  const AgentThread = {
    create: async (payload) => {
      const doc = { _id: 'thread-1', ...payload, save: async () => doc };
      return doc;
    },
    findOne: async () => null
  };
  const Article = {
    find: () => ({
      select: () => ({
        sort: () => ({
          lean: async () => sampleArticles
        })
      })
    })
  };
  const Folder = {
    find: () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [{ name: 'Company News and Updates' }]
        })
      })
    })
  };

  const result = await stageLibraryFilingSuggestions({
    AgentStructureProposal,
    AgentThread,
    Article,
    Folder,
    appendThreadMessage: (thread, message) => {
      thread.messages = [...(thread.messages || []), message];
    },
    compactThreadState: () => {},
    sanitizeAgentStructureProposalDoc: (doc) => ({
      structureProposalId: String(doc?._id || ''),
      title: doc?.title,
      summary: doc?.summary,
      status: doc?.status
    }),
    sanitizeAgentThreadDoc: (doc) => ({
      threadId: String(doc?._id || ''),
      title: doc?.title
    }),
    userId: 'user-1'
  });

  assert.strictEqual(result.reused, false);
  assert.strictEqual(result.structureProposal.structureProposalId, 'proposal-1');
  assert.strictEqual(result.thread.threadId, 'thread-1');
  assert.strictEqual(result.receipt.kind, 'filing');
  assert.strictEqual(result.receipt.source, 'library');
  assert.strictEqual(result.receipt.status, 'needs_review');
  assert.strictEqual(result.receipt.metrics.articleCount, 2);
  assert.ok(result.receipt.summary.includes('Staged 2 filing suggestions'));
  assert.strictEqual(result.receipt.nextAction.intent, 'review_filing');
  assert.strictEqual(created[0].scopeRef, 'library-filing');
  assert.strictEqual(created[0].status, 'pending');

  const payload = buildLibraryFilingProposalPayload({
    userId: 'user-1',
    classifications: classifyArticlesWithRegex(sampleArticles),
    existingFolders: []
  });
  assert.ok(payload);
  assert.strictEqual(payload.scope, 'workspace');
  assert.strictEqual(payload.scopeRef, 'library-filing');
  assert.ok(payload.operations.length > 0);
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('libraryFilingService tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
