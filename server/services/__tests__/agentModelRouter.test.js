const assert = require('assert');
const { resolveAgentModelRoute } = require('../agentModelRouter');

const run = () => {
  assert.strictEqual(
    resolveAgentModelRoute({ capability: { id: 'capability.context.answer' } }).profile,
    'partner_chat'
  );
  assert.strictEqual(
    resolveAgentModelRoute({
      capability: { id: 'capability.artifact.draft' },
      skillInvocation: { outputType: 'summary_brief' }
    }).profile,
    'artifact_draft'
  );
  assert.strictEqual(
    resolveAgentModelRoute({
      capability: { id: 'capability.artifact.draft' },
      skillInvocation: { outputType: 'workspace_hygiene_report' }
    }).profile,
    'hygiene_scan'
  );
  assert.strictEqual(
    resolveAgentModelRoute({
      capability: { id: 'capability.content.revise' },
      intentDecision: { replyIntent: 'challenge' }
    }).profile,
    'critique'
  );
  assert.strictEqual(
    resolveAgentModelRoute({ capability: { id: 'capability.workspace.organize' } }).profile,
    'structure_planner'
  );
  assert.strictEqual(
    resolveAgentModelRoute({ capability: { id: 'capability.integration.import' } }).profile,
    'tool_router'
  );
  assert.strictEqual(
    resolveAgentModelRoute({ skillInvocation: { skillId: 'deep_audit' } }).profile,
    'deep_audit'
  );
};

if (require.main === module) {
  try {
    run();
    console.log('agentModelRouter tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
