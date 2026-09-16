const assert = require('assert');
const { normalizeInquiry } = require('./questionInquiry');

const run = () => {
  const looking = normalizeInquiry({
    brief: '  Find patience.  ',
    run: { status: 'looking', boundQuestion: 'Who bears the downside?' }
  });
  assert.strictEqual(looking.brief, 'Find patience.');
  assert.strictEqual(looking.scope, 'library');
  assert.strictEqual(looking.run.status, 'stopped');
  assert.strictEqual(
    normalizeInquiry({ run: { status: 'complete', boundQuestion: 'Who bears the downside?' } }).run.status,
    'complete'
  );
};

if (require.main === module) {
  try {
    run();
    console.log('question inquiry tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
