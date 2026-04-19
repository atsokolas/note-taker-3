const assert = require('assert');
const {
  createProposedChangesForRun,
  sanitizeAgentProposedChangeDoc
} = require('../agentProposedChanges');

const buildThread = () => ({
  _id: 'thread-1',
  messages: [
    {
      role: 'assistant',
      text: 'Rewrite the concept around the sharper claim and keep the support line grounded.',
      proposalBundle: {
        bundleId: 'bundle-1'
      }
    }
  ]
});

const createMemoryModel = ({ rows = [] } = {}) => {
  const state = [...rows];
  return {
    state,
    async findOne(query = {}) {
      return state.find((row) => {
        return Object.entries(query).every(([key, value]) => String(row[key]) === String(value));
      }) || null;
    },
    async create(payload = {}) {
      const created = {
        _id: `pc-${state.length + 1}`,
        ...payload
      };
      state.push(created);
      return created;
    }
  };
};

const run = async () => {
  const AgentProposedChange = createMemoryModel();
  const TagMeta = createMemoryModel({
    rows: [
      {
        _id: 'concept-1',
        userId: 'user-1',
        name: 'World Models',
        description: 'Old concept description'
      }
    ]
  });
  const NotebookEntry = createMemoryModel({
    rows: [
      {
        _id: 'note-1',
        userId: 'user-1',
        title: 'Model drift notes',
        content: 'Old notebook content',
        blocks: [{ id: 'b1', type: 'paragraph', text: 'Old notebook content' }]
      }
    ]
  });

  const runDoc = {
    runId: 'run-1',
    sourceBundleId: 'bundle-1',
    steps: [
      {
        opId: 'content-change',
        type: 'propose_content_change',
        title: 'Strengthen World Models',
        executionMode: 'proposed_change',
        target: { type: 'concept', id: 'concept-1', title: 'World Models' },
        metadata: {},
        status: 'applied'
      },
      {
        opId: 'notebook-change',
        type: 'propose_content_change',
        title: 'Rewrite notebook note',
        executionMode: 'proposed_change',
        target: { type: 'notebook', id: 'note-1', title: 'Model drift notes' },
        metadata: {},
        status: 'applied'
      }
    ]
  };

  const created = await createProposedChangesForRun({
    AgentProposedChange,
    TagMeta,
    NotebookEntry,
    userId: 'user-1',
    thread: buildThread(),
    run: runDoc,
    actor: { actorType: 'user', actorId: 'user-1' }
  });

  assert.strictEqual(created.length, 2, 'Expected a proposed change record for each applied content-change step.');
  assert.strictEqual(runDoc.steps[0].metadata.proposedChangeId, 'pc-1', 'Run step metadata should retain the created proposed change id.');
  assert.strictEqual(runDoc.steps[1].metadata.proposedChangeId, 'pc-2', 'Each applied content-change step should capture its proposed change id.');

  const conceptChange = sanitizeAgentProposedChangeDoc(created[0]);
  assert.strictEqual(conceptChange.targetType, 'concept', 'Concept target should be preserved.');
  assert.strictEqual(conceptChange.status, 'pending', 'New proposed changes should start pending.');
  assert.strictEqual(conceptChange.currentSnapshot.description, 'Old concept description', 'Current concept snapshot should be stored.');
  assert.strictEqual(
    conceptChange.proposedSnapshot.description,
    'Rewrite the concept around the sharper claim and keep the support line grounded.',
    'Assistant proposal text should seed the concept proposed snapshot.'
  );

  const notebookChange = sanitizeAgentProposedChangeDoc(created[1]);
  assert.strictEqual(notebookChange.targetType, 'notebook', 'Notebook target should be preserved.');
  assert.strictEqual(notebookChange.currentSnapshot.content, 'Old notebook content', 'Current notebook snapshot should be stored.');
  assert.strictEqual(
    notebookChange.proposedSnapshot.content,
    'Rewrite the concept around the sharper claim and keep the support line grounded.',
    'Assistant proposal text should seed the notebook proposed snapshot.'
  );
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentProposedChanges tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
