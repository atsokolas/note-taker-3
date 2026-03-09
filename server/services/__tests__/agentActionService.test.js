const assert = require('assert');
const { __testables } = require('../agentActionService');

const {
  expandOperations,
  evaluateActionPolicy,
  collectDeleteTargetIds,
  isUnambiguousDeleteScope
} = __testables;

const buildWorkspaceFixture = () => ({
  outlineSections: [
    { id: 'inbox', title: 'Inbox', order: 0 },
    { id: 'working', title: 'Working', order: 1 }
  ],
  attachedItems: [
    { id: 'a', type: 'note', refId: 'n1', sectionId: 'inbox', groupId: 'inbox', parentId: '', order: 0 },
    { id: 'b', type: 'note', refId: 'n2', sectionId: 'inbox', groupId: 'inbox', parentId: 'a', order: 1 },
    { id: 'c', type: 'article', refId: 'ar1', sectionId: 'working', groupId: 'working', parentId: '', order: 0 },
    { id: 'd', type: 'highlight', refId: 'h1', sectionId: 'working', groupId: 'working', parentId: 'c', order: 1 }
  ],
  connections: []
});

const run = () => {
  const workspace = buildWorkspaceFixture();

  const expanded = expandOperations([
    { op: 'updateItem', payload: { itemId: 'a', patch: { stage: 'working' } } },
    { op: 'deleteItems', payload: { itemIds: ['a', 'a', 'c'] } }
  ]);
  assert.strictEqual(expanded.length, 3, 'deleteItems should expand and dedupe delete operations.');
  assert.strictEqual(expanded[1].op, 'deleteItem');
  assert.strictEqual(expanded[2].op, 'deleteItem');

  const deleteTargets = collectDeleteTargetIds(workspace, expanded);
  assert.ok(deleteTargets.has('a'));
  assert.ok(deleteTargets.has('b'));
  assert.ok(deleteTargets.has('c'));
  assert.ok(deleteTargets.has('d'));
  assert.strictEqual(deleteTargets.size, 4, 'delete cascade should include descendants.');

  const explicitPolicy = evaluateActionPolicy({
    workspace,
    operations: [{ op: 'deleteItem', payload: { itemId: 'a' } }],
    flow: 'cleanup',
    explicitUserCommand: true
  });
  assert.strictEqual(explicitPolicy.requiresApproval, false, 'Explicit unambiguous delete should skip approval.');
  assert.strictEqual(explicitPolicy.deleteCount, 2, 'Deleting a parent should count its descendants.');

  const cleanupPolicySmall = evaluateActionPolicy({
    workspace,
    operations: [{ op: 'deleteItem', payload: { itemId: 'c' } }],
    flow: 'cleanup',
    explicitUserCommand: false
  });
  assert.strictEqual(cleanupPolicySmall.requiresApproval, true);
  assert.strictEqual(cleanupPolicySmall.approvalMode, 'single_batch');

  const cleanupPolicyBatch = evaluateActionPolicy({
    workspace,
    operations: [
      { op: 'deleteItem', payload: { itemId: 'a' } },
      { op: 'deleteItem', payload: { itemId: 'c' } },
      { op: 'deleteItem', payload: { itemId: 'x1' } },
      { op: 'deleteItem', payload: { itemId: 'x2' } },
      { op: 'deleteItem', payload: { itemId: 'x3' } },
      { op: 'deleteItem', payload: { itemId: 'x4' } }
    ],
    flow: 'restructure',
    explicitUserCommand: false
  });
  assert.strictEqual(cleanupPolicyBatch.requiresApproval, true);
  assert.strictEqual(cleanupPolicyBatch.approvalMode, 'batched');

  const nonDestructivePolicy = evaluateActionPolicy({
    workspace,
    operations: [{ op: 'moveItem', payload: { itemId: 'a', sectionId: 'working' } }],
    flow: 'direct',
    explicitUserCommand: false
  });
  assert.strictEqual(nonDestructivePolicy.requiresApproval, false);
  assert.strictEqual(nonDestructivePolicy.deleteCount, 0);

  assert.strictEqual(
    isUnambiguousDeleteScope([{ op: 'deleteItem', payload: { itemId: 'a' } }]),
    true,
    'deleteItem with explicit itemId should be unambiguous'
  );
  assert.strictEqual(
    isUnambiguousDeleteScope([{ op: 'deleteItem', payload: {} }]),
    false,
    'deleteItem without explicit itemId should be ambiguous'
  );
};

if (require.main === module) {
  try {
    run();
    console.log('agentActionService tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
