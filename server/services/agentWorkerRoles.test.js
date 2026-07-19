const assert = require('assert');
const {
  buildLivingThesisCriticMandate,
  inferWorkerRole
} = require('./agentWorkerRoles');
const { __testables } = require('./collaborativeAgentService');

const run = () => {
  assert.strictEqual(inferWorkerRole({ message: 'Challenge this thesis and find the strongest countercase.' }), 'critic');
  const mandate = buildLivingThesisCriticMandate();
  [
    'unsupported critical and major claims',
    'strongest counterargument',
    'contradicting evidence',
    'missing base rates',
    'alternative causal models',
    'owner biases',
    'falsification tests',
    'confidence changes',
    'explicit human acceptance',
    'Do not mutate'
  ].forEach(expected => assert.ok(mandate.includes(expected), expected));
  const messages = __testables.buildPartnerChatMessages({
    message: 'Challenge this thesis.',
    contextItem: { type: 'wiki_page', title: 'QA thesis', judgmentKind: 'thesis', judgmentText: 'QA-only judgment.' }
  });
  assert.ok(messages[0].content.includes('Living-thesis Critic mandate'));
  assert.ok(messages[0].content.includes('explicit human acceptance'));
  assert.ok(messages[1].content.includes('Living thesis contract'));
};

if (require.main === module) {
  try { run(); console.log('agentWorkerRoles tests passed'); }
  catch (error) { console.error(error); process.exit(1); }
}

module.exports = { run };
