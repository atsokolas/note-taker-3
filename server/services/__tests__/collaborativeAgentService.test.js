const assert = require('assert');
const { __testables } = require('../collaborativeAgentService');

const { tokenize, buildTokenRegex, buildReply } = __testables;

const run = () => {
  const tokens = tokenize('Find the note about systems thinking and evidence loops in my notebook');
  assert.ok(tokens.includes('systems'), 'Expected systems token.');
  assert.ok(tokens.includes('thinking'), 'Expected thinking token.');
  assert.ok(tokens.includes('evidence'), 'Expected evidence token.');
  assert.ok(!tokens.includes('the'), 'Stopwords should be removed.');

  const regex = buildTokenRegex(['alpha', 'beta']);
  assert.ok(regex instanceof RegExp, 'Expected regex instance.');
  assert.ok(regex.test('hello beta world'), 'Regex should match token text.');
  assert.strictEqual(buildTokenRegex([]), null, 'Empty token list should yield null regex.');

  const reply = buildReply({
    message: 'Find related notes',
    contextItem: { type: 'concept', title: 'Systems Thinking', snippet: 'A concept about loops and feedback.' },
    relatedItems: [
      { type: 'notebook', id: 'n1', title: 'Feedback loops', snippet: '...' }
    ]
  });
  assert.ok(reply.includes('Systems Thinking'), 'Reply should include context title.');
  assert.ok(reply.includes('related item'), 'Reply should mention related items.');
};

if (require.main === module) {
  try {
    run();
    console.log('collaborativeAgentService tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
