const assert = require('assert');
const { criterionAt, serializeDraft } = require('./judgmentThreadService');

const page = {
  judgment: {
    resolutionHistory: [
      {
        criteria: 'Revenue falls below the plan.',
        setAt: '2026-01-01T00:00:00.000Z',
        receiptId: 'test-1',
        claimHash: 'claim-1'
      },
      {
        criteria: 'Retention falls below 90%.',
        setAt: '2026-03-01T00:00:00.000Z',
        receiptId: 'test-2',
        claimHash: 'claim-2'
      }
    ]
  }
};

const original = criterionAt(page, '2026-02-01T00:00:00.000Z');
assert.strictEqual(original.text, 'Revenue falls below the plan.');
assert.strictEqual(original.receiptId, 'test-1');

const draft = serializeDraft({
  _id: 'draft-1',
  observationId: 'observation-1',
  baseClaim: 'The held view.',
  response: 'uncertain',
  returnQuestion: 'What happened to retention?',
  version: 3
});
assert.deepStrictEqual(
  { observationId: draft.observationId, response: draft.response, returnQuestion: draft.returnQuestion, version: draft.version },
  {
    observationId: 'observation-1',
    response: 'uncertain',
    returnQuestion: 'What happened to retention?',
    version: 3
  }
);

console.log('judgmentThreadService tests passed');
