const assert = require('assert');
const {
  applyProposalBundleInvalidations,
  resolveExecutableProposalBundle,
  shouldResolveExecutionIntent
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
  assert.strictEqual(shouldResolveExecutionIntent('do it'), true, 'Short execution confirmations should trigger bundle resolution.');
  assert.strictEqual(shouldResolveExecutionIntent('rewrite it'), true, 'Verb-led execution approvals should trigger bundle resolution.');
  assert.strictEqual(shouldResolveExecutionIntent('Ok execute it'), true, 'Explicit execute language should trigger bundle resolution.');
  assert.strictEqual(shouldResolveExecutionIntent('run it'), true, 'Run language should trigger bundle resolution.');
  assert.strictEqual(shouldResolveExecutionIntent('continue'), false, 'Bare continue should fall back to normal chat so thread follow-ups still work.');
  assert.strictEqual(shouldResolveExecutionIntent('what do you think?'), false, 'Normal chat should not trigger execution resolution.');

  const thread = buildThread();
  const olderRewrite = resolveExecutableProposalBundle({
    thread,
    message: 'rewrite it',
    context: {
      type: 'concept',
      id: 'concept-1',
      title: 'World Models'
    },
    now: new Date('2026-04-18T16:00:00.000Z')
  });
  assert.strictEqual(olderRewrite.status, 'matched', 'Explicit action references should resolve to the matching older bundle.');
  assert.strictEqual(olderRewrite.bundle?.bundleId, 'bundle-older', 'The older rewrite bundle should be selected.');
  assert.ok(
    olderRewrite.invalidatedBundleIds.includes('bundle-stale'),
    'Stale unresolved bundles should be marked invalid for future resolution.'
  );

  const latestGeneric = resolveExecutableProposalBundle({
    thread,
    message: 'do it',
    context: {
      type: 'concept',
      id: 'concept-1',
      title: 'World Models'
    },
    now: new Date('2026-04-18T16:00:00.000Z')
  });
  assert.strictEqual(latestGeneric.status, 'matched', 'Generic do-it approvals should resolve when the latest pending bundle is the conversational anchor.');
  assert.strictEqual(latestGeneric.bundle?.bundleId, 'bundle-latest', 'The latest pending bundle should win for a plain do-it.');

  const latestExecute = resolveExecutableProposalBundle({
    thread,
    message: 'Ok execute it',
    context: {
      type: 'concept',
      id: 'concept-1',
      title: 'World Models'
    },
    now: new Date('2026-04-18T16:00:00.000Z')
  });
  assert.strictEqual(latestExecute.status, 'matched', 'Execute-it approvals should resolve the latest conversational bundle.');
  assert.strictEqual(latestExecute.bundle?.bundleId, 'bundle-latest', 'Execute-it should target the latest pending bundle.');

  const ambiguous = resolveExecutableProposalBundle({
    thread: {
      ...thread,
      messages: [
        { role: 'assistant', text: 'I can rewrite World Models.', proposalBundle: { bundleId: 'bundle-older', title: 'Rewrite World Models + 1 more' } },
        { role: 'assistant', text: 'I can create a routed handoff.', proposalBundle: { bundleId: 'bundle-latest', title: 'Pull in 2 related items' } }
      ]
    },
    message: 'apply that',
    context: {
      type: 'concept',
      id: 'concept-1',
      title: 'World Models'
    },
    now: new Date('2026-04-18T16:00:00.000Z')
  });
  assert.strictEqual(ambiguous.status, 'ambiguous', 'When multiple bundles are similarly plausible, the resolver should ask for disambiguation instead of guessing.');

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
