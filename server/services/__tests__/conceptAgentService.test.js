const assert = require('assert');
const {
  createConceptSuggestionDraft,
  getConceptSuggestionDrafts,
  mutateConceptSuggestionDraft
} = require('../conceptAgentService');

const expectReject = async (promiseFactory, { status, messagePart }) => {
  let thrown = null;
  try {
    await promiseFactory();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, 'Expected promise to reject.');
  if (status !== undefined) {
    assert.strictEqual(Number(thrown.status), Number(status), `Expected status ${status}, got ${thrown.status}`);
  }
  if (messagePart) {
    assert.ok(String(thrown.message || '').includes(messagePart), `Expected message to include "${messagePart}".`);
  }
};

const run = async () => {
  await expectReject(
    () => createConceptSuggestionDraft({}),
    { status: 400, messagePart: 'requires userId' }
  );

  await expectReject(
    () => getConceptSuggestionDrafts({}),
    { status: 400, messagePart: 'required' }
  );

  await expectReject(
    () => mutateConceptSuggestionDraft({}),
    { status: 400, messagePart: 'required' }
  );
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('conceptAgentService guard tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
