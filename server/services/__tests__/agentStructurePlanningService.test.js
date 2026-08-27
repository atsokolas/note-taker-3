const assert = require('assert');
const {
  LIBRARY_STRUCTURE_PLAN_SCHEMA,
  loadLibraryStructureInventory,
  validateAndBuildOperations,
  planLibraryStructureProposal,
  persistLibraryStructureProposal
} = require('../agentStructurePlanningService');

const queryModel = (rows = []) => ({
  find() {
    const cursor = {
      select() { return cursor; },
      sort() { return cursor; },
      limit() { return cursor; },
      async lean() { return rows; }
    };
    return cursor;
  }
});

const folders = [
  { _id: 'folder-ai', name: 'AI & Computing' },
  { _id: 'folder-investing', name: 'Investing' },
  { _id: 'folder-empty', name: 'Empty folder' }
];

const articles = [
  { _id: 'article-gpu', title: 'GPU systems', siteName: 'arXiv', folder: 'folder-ai' },
  { _id: 'article-moat', title: 'Competitive moats', siteName: 'Strategy', folder: null }
];

const validPlan = {
  title: 'Tighten the Library structure',
  summary: 'Add one focused shelf and file the strongest unfiled article.',
  rationale: 'The change is small, reversible, and supported by the current titles.',
  operations: [
    {
      type: 'create_folder',
      folderId: '',
      name: 'Strategy & Moats',
      itemId: '',
      destinationFolderId: '',
      destinationFolderName: '',
      sourceFolderId: '',
      reason: 'The unfiled strategy article has a durable home.'
    },
    {
      type: 'move_item',
      folderId: '',
      name: '',
      itemId: 'article-moat',
      destinationFolderId: '',
      destinationFolderName: 'Strategy & Moats',
      sourceFolderId: '',
      reason: 'The article is currently unfiled and directly matches the new shelf.'
    }
  ]
};

const run = async () => {
  const inventory = await loadLibraryStructureInventory({
    Folder: queryModel(folders),
    Article: queryModel(articles),
    userId: 'user-1'
  });
  assert.strictEqual(inventory.folders.length, 3);
  assert.strictEqual(inventory.totalArticles, 2);
  assert.strictEqual(inventory.unfiledCount, 1);
  assert.strictEqual(inventory.articles[0].folderName, 'AI & Computing');

  const exactLimitInventory = await loadLibraryStructureInventory({
    Folder: queryModel(folders),
    Article: queryModel(articles),
    userId: 'user-1',
    maxArticles: 2
  });
  assert.strictEqual(exactLimitInventory.truncated, false, 'An exact-limit inventory is complete, not truncated.');

  assert.throws(
    () => validateAndBuildOperations({
      plan: {
        operations: [{
          type: 'delete_folder',
          folderId: 'folder-ai',
          name: '',
          itemId: '',
          destinationFolderId: '',
          destinationFolderName: '',
          sourceFolderId: '',
          reason: 'Remove a shelf.'
        }]
      },
      inventory
    }),
    (error) => error.status === 422 && /owned empty folder/i.test(error.message),
    'A planner must not delete a non-empty folder.'
  );

  await assert.rejects(
    () => planLibraryStructureProposal({
      Folder: queryModel(folders),
      Article: queryModel([]),
      userId: 'user-1',
      complete: async () => ({ text: JSON.stringify(validPlan) })
    }),
    (error) => error.status === 409 && /no visible Library articles/i.test(error.message),
    'An empty Library must fail before a model call or proposal write.'
  );

  const calls = [];
  const planned = await planLibraryStructureProposal({
    Folder: queryModel(folders),
    Article: queryModel(articles),
    userId: 'user-1',
    request: 'Organize my library.',
    sourceBundleId: 'bundle-1',
    complete: async (input) => {
      calls.push(input);
      return { text: JSON.stringify(validPlan), model: 'planner-model', provider: 'planner-provider' };
    }
  });
  assert.strictEqual(calls[0].route, 'structure_planner');
  assert.deepStrictEqual(calls[0].responseFormat, LIBRARY_STRUCTURE_PLAN_SCHEMA);
  assert.strictEqual(planned.draft.operations.length, 2);
  assert.deepStrictEqual(planned.draft.operations[1].payload, {
    itemId: 'article-moat',
    destinationFolderName: 'Strategy & Moats'
  });
  assert.strictEqual(planned.draft.operations[1].targetDomain, 'library');
  assert.strictEqual(planned.draft.operations[1].status, 'pending');
  assert.strictEqual(planned.model, 'planner-model');

  await assert.rejects(
    () => planLibraryStructureProposal({
      Folder: queryModel(folders),
      Article: queryModel(articles),
      userId: 'user-1',
      complete: async () => ({
        text: JSON.stringify({
          ...validPlan,
          operations: [{
            ...validPlan.operations[1],
            itemId: 'foreign-article',
            destinationFolderId: 'folder-investing',
            destinationFolderName: ''
          }]
        })
      })
    }),
    (error) => error.status === 422 && /unknown article or destination/i.test(error.message),
    'A model-created foreign item id must fail the entire plan closed.'
  );

  await assert.rejects(
    () => planLibraryStructureProposal({
      Folder: queryModel(folders),
      Article: queryModel(articles),
      userId: 'user-1',
      complete: async () => ({ text: '{"operations":[]}' })
    }),
    (error) => error.status === 422,
    'An empty or incomplete plan must not become a review card.'
  );

  let createCount = 0;
  const existing = { _id: 'proposal-existing', sourceBundleId: 'bundle-1' };
  const AgentStructureProposal = {
    async findOne(query) {
      assert.deepStrictEqual(query, { userId: 'user-1', sourceBundleId: 'bundle-1' });
      return existing;
    },
    async create() {
      createCount += 1;
      return null;
    }
  };
  const persisted = await persistLibraryStructureProposal({
    AgentStructureProposal,
    draft: planned.draft,
    threadId: 'thread-1'
  });
  assert.strictEqual(persisted, existing);
  assert.strictEqual(createCount, 0, 'A retried bundle must not create a duplicate proposal.');
};

if (require.main === module) {
  run()
    .then(() => console.log('agentStructurePlanningService tests passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
