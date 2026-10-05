const assert = require('assert');
const {
  applyProposalBundleInvalidations,
  resolveRequestedProposalBundle
} = require('../agentBundleResolution');

const buildThread = () => ({
  proposalBundles: [
    {
      bundleId: 'bundle-latest',
      title: 'Pull in 2 related items',
      status: 'pending',
      target: {
        type: 'concept',
        id: 'concept-1',
        title: 'World Models'
      },
      operations: [
        {
          opId: 'attach-material',
          type: 'attach_related_material',
          title: 'Pull in 2 related items',
          summary: 'Collect the strongest nearby material.',
          status: 'pending'
        }
      ],
      createdAt: new Date('2026-04-18T15:00:00.000Z').toISOString()
    },
    {
      bundleId: 'bundle-older',
      title: 'Rewrite World Models + 1 more',
      status: 'pending',
      target: {
        type: 'concept',
        id: 'concept-1',
        title: 'World Models'
      },
      operations: [
        {
          opId: 'content-change',
          type: 'propose_content_change',
          title: 'Rewrite World Models',
          summary: 'Prepare an agent-authored rewrite.',
          status: 'pending'
        },
        {
          opId: 'create-handoff',
          type: 'create_handoff',
          title: 'Create a routed handoff',
          summary: 'Turn this proposal into a delegated handoff.',
          status: 'pending'
        }
      ],
      createdAt: new Date('2026-04-18T14:00:00.000Z').toISOString()
    },
    {
      bundleId: 'bundle-stale',
      title: 'Strengthen Legacy Concept',
      status: 'pending',
      target: {
        type: 'concept',
        id: 'concept-legacy',
        title: 'Legacy Concept'
      },
      operations: [
        {
          opId: 'legacy-change',
          type: 'propose_content_change',
          title: 'Strengthen Legacy Concept',
          summary: 'Prepare a stronger pass on the old concept.',
          status: 'pending'
        }
      ],
      createdAt: new Date('2026-03-20T10:00:00.000Z').toISOString()
    }
  ],
  messages: [
    {
      role: 'assistant',
      text: 'I can rewrite World Models and create a routed handoff.',
      proposalBundle: {
        bundleId: 'bundle-older',
        title: 'Rewrite World Models + 1 more'
      }
    },
    {
      role: 'user',
      text: 'Let that sit for now.'
    },
    {
      role: 'assistant',
      text: 'I can also pull in 2 related items.',
      proposalBundle: {
        bundleId: 'bundle-latest',
        title: 'Pull in 2 related items'
      }
    }
  ]
});

const run = () => {
  const context = { type: 'concept', id: 'concept-1', title: 'World Models' };
  const now = new Date('2026-04-18T16:00:00.000Z');

  const older = resolveRequestedProposalBundle({ thread: buildThread(), bundleId: 'bundle-older', context, now });
  assert.strictEqual(older.status, 'matched', 'An approval resolves exactly the bundle it names, even when a newer one is pending.');
  assert.strictEqual(older.bundle?.bundleId, 'bundle-older');
  assert.ok(older.invalidatedBundleIds.includes('bundle-stale'), 'Stale bundles are reported for invalidation.');

  const stale = resolveRequestedProposalBundle({ thread: buildThread(), bundleId: 'bundle-stale', context, now });
  assert.strictEqual(stale.status, 'none', 'A stale bundle never runs, even when named.');
  assert.strictEqual(stale.bundle, null);

  const missing = resolveRequestedProposalBundle({ thread: buildThread(), bundleId: 'not-a-bundle', context, now });
  assert.strictEqual(missing.status, 'none', 'An unknown bundle id runs nothing.');

  const finished = buildThread();
  finished.proposalBundles[0].status = 'applied';
  assert.strictEqual(
    resolveRequestedProposalBundle({ thread: finished, bundleId: 'bundle-latest', context, now }).status,
    'none',
    'A bundle that already ran cannot be approved twice.'
  );

  const invalidatedThread = applyProposalBundleInvalidations({
    thread: buildThread(),
    bundleIds: ['bundle-stale']
  });
  assert.strictEqual(
    invalidatedThread.proposalBundles.find((bundle) => bundle.bundleId === 'bundle-stale')?.status,
    'invalidated',
    'Invalidation should persist onto thread-level proposal bundles.'
  );
};

if (require.main === module) {
  try {
    run();
    console.log('agentBundleResolution tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
