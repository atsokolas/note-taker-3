const assert = require('assert');
const { inquiryIsDependable, normalizeInquiry } = require('./questionInquiry');

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
  assert.strictEqual(inquiryIsDependable({
    inquiry: {
      run: {
        status: 'complete',
        passages: [{ articleId: 'letter', passage: 'Patience is not avoidance.' }]
      }
    }
  }), true);
  assert.strictEqual(inquiryIsDependable({
    inquiry: { run: { status: 'miss', passages: [] } }
  }), false);
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
