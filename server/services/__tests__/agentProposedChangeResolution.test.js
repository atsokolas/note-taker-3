const assert = require('assert');
const {
  acceptProposedChange,
  rollbackProposedChange,
  rejectProposedChange,
  updateProposedChangeDraft
} = require('../agentProposedChanges');

const createMemoryModel = ({ rows = [] } = {}) => {
  const state = [...rows];
  return {
    state,
    async findOne(query = {}) {
      return state.find((row) => Object.entries(query).every(([key, value]) => String(row[key]) === String(value))) || null;
    },
    async findOneAndUpdate(query = {}, update = {}, options = {}) {
      const row = state.find((entry) => Object.entries(query).every(([key, value]) => String(entry[key]) === String(value)));
      if (!row) return null;
      if (update.$set && typeof update.$set === 'object') {
        Object.assign(row, update.$set);
      }
      if (options.new) return row;
      return null;
    }
  };
};

const run = async () => {
  const AgentProposedChange = createMemoryModel({
    rows: [
      {
        _id: 'pc-1',
        userId: 'user-1',
        targetType: 'concept',
        targetId: 'concept-1',
        targetTitle: 'World Models',
        status: 'pending',
        currentSnapshot: {
          title: 'World Models',
          description: 'Old concept description',
          content: '',
          blocks: []
        },
        proposedSnapshot: {
          title: 'World Models',
          description: 'Sharper concept description',
          content: '',
          blocks: []
        }
      },
      {
        _id: 'pc-2',
        userId: 'user-1',
        targetType: 'notebook',
        targetId: 'note-1',
        targetTitle: 'Model drift notes',
        status: 'pending',
        currentSnapshot: {
          title: 'Model drift notes',
          description: '',
          content: 'Old notebook content',
          blocks: [{ id: 'b1', type: 'paragraph', text: 'Old notebook content' }]
        },
        proposedSnapshot: {
          title: 'Model drift notes',
          description: '',
          content: 'Sharper notebook content',
          blocks: [{ id: 'b2', type: 'paragraph', text: 'Sharper notebook content' }]
        }
      },
      {
        _id: 'pc-3',
        userId: 'user-1',
        targetType: 'notebook',
        targetId: 'note-1',
        targetTitle: 'Model drift notes',
        status: 'pending',
        currentSnapshot: {
          title: 'Model drift notes',
          description: '',
          content: 'Old notebook content',
          blocks: [{ id: 'b1', type: 'paragraph', text: 'Old notebook content' }]
        },
        proposedSnapshot: {
          title: 'Model drift notes',
          description: '',
          content: 'Rejected notebook content',
          blocks: [{ id: 'b3', type: 'paragraph', text: 'Rejected notebook content' }]
        }
      }
    ]
  });
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

  const edited = await updateProposedChangeDraft({
    AgentProposedChange,
    userId: 'user-1',
    proposedChangeId: 'pc-1',
    updates: {
      proposedSnapshot: {
        title: 'World Models',
        description: 'Edited concept description',
        content: '',
        blocks: []
      }
    }
  });
  assert.strictEqual(
    edited.proposedSnapshot.description,
    'Edited concept description',
    'Draft edits should update the proposed snapshot before acceptance.'
  );

  const acceptedConcept = await acceptProposedChange({
    AgentProposedChange,
    TagMeta,
    NotebookEntry,
    userId: 'user-1',
    proposedChangeId: 'pc-1',
    actor: { actorType: 'user', actorId: 'user-1' }
  });
  assert.strictEqual(acceptedConcept.status, 'applied', 'Accepted concept changes should move to applied.');
  assert.strictEqual(TagMeta.state[0].description, 'Edited concept description', 'Accepting a concept change should update canonical concept description.');

  const acceptedNotebook = await acceptProposedChange({
    AgentProposedChange,
    TagMeta,
    NotebookEntry,
    userId: 'user-1',
    proposedChangeId: 'pc-2',
    actor: { actorType: 'user', actorId: 'user-1' }
  });
  assert.strictEqual(acceptedNotebook.status, 'applied', 'Accepted notebook changes should move to applied.');
  assert.strictEqual(NotebookEntry.state[0].content, 'Sharper notebook content', 'Accepting a notebook change should update canonical notebook content.');
  assert.strictEqual(NotebookEntry.state[0].blocks[0].text, 'Sharper notebook content', 'Accepting a notebook change should update canonical notebook blocks.');

  const rolledBackNotebook = await rollbackProposedChange({
    AgentProposedChange,
    TagMeta,
    NotebookEntry,
    userId: 'user-1',
    proposedChangeId: 'pc-2',
    actor: { actorType: 'user', actorId: 'user-1' }
  });
  assert.strictEqual(rolledBackNotebook.status, 'rolled_back', 'Rolling back an applied notebook change should mark it rolled back.');
  assert.strictEqual(NotebookEntry.state[0].content, 'Old notebook content', 'Rollback should restore canonical notebook content to the pre-accept snapshot.');
  assert.strictEqual(NotebookEntry.state[0].blocks[0].text, 'Old notebook content', 'Rollback should restore canonical notebook blocks to the pre-accept snapshot.');

  const rejected = await rejectProposedChange({
    AgentProposedChange,
    userId: 'user-1',
    proposedChangeId: 'pc-3',
    actor: { actorType: 'user', actorId: 'user-1' }
  });
  assert.strictEqual(rejected.status, 'rejected', 'Rejecting a proposed change should mark it rejected.');
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentProposedChangeResolution tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
