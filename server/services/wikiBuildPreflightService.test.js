const assert = require('assert');
const { prepareOrdinaryWikiBuild } = require('./wikiBuildPreflightService');

const findModel = (rows = []) => ({
  find() {
    return {
      sort() { return this; },
      limit() { return this; },
      lean: async () => rows
    };
  }
});

const run = async () => {
  const models = {
    Article: findModel([{
      _id: '507f1f77bcf86cd79943901',
      title: 'Sparse attention for long-context models',
      content: `Sparse attention reduces the number of token interactions while preserving selected global and local connections. ${'The source documents a concrete sparse-attention mechanism and its boundary. '.repeat(30)}`,
      highlights: [],
      tags: ['sparse attention']
    }, {
      _id: '507f1f77bcf86cd79943902',
      title: 'Attention mechanisms in model serving',
      content: 'Attention affects serving latency, but this source only discusses dense model execution.',
      highlights: [],
      tags: ['attention']
    }, {
      _id: '507f1f77bcf86cd79943903',
      title: 'Quantization damage is multiplicative',
      content: 'Quantization contracts decision margins. Operational safety checks catch malformed model outputs, but the source does not discuss the investing concept.',
      highlights: [],
      tags: ['model safety']
    }]),
    NotebookEntry: findModel([]),
    TagMeta: findModel([]),
    Question: findModel([])
  };

  const ready = await prepareOrdinaryWikiBuild({
    userId: 'user-1',
    title: 'Sparse attention',
    createdFrom: { type: 'idea', text: 'Explain sparse attention.' },
    models
  });
  assert.equal(ready.eligible, true);
  assert.equal(ready.directSourceCount, 1);
  assert.equal(ready.sourceRefs.length, 1);
  assert.equal(ready.sourceRefs[0].objectId, '507f1f77bcf86cd79943901');
  assert.equal(ready.sourceRefs[0].addedBy, 'ai');
  assert.equal(ready.sourceRefs[0].snippet.length > 1000, true);

  const missing = await prepareOrdinaryWikiBuild({
    userId: 'user-1',
    title: 'Roman concrete',
    createdFrom: { type: 'idea', text: 'Explain Roman concrete.' },
    models
  });
  assert.equal(missing.eligible, false);
  assert.equal(missing.code, 'WIKI_BUILD_EVIDENCE_MISSING');
  assert.match(missing.message, /No direct Library source explains/);
  assert.equal(Array.isArray(missing.suggestions), true);

  const scoped = await prepareOrdinaryWikiBuild({
    userId: 'user-1',
    title: 'Long-context models',
    createdFrom: {
      type: 'idea',
      text: 'Long-context models: how sparse attention reduces token interactions.'
    },
    models
  });
  assert.equal(scoped.eligible, true);
  assert.equal(scoped.sourceRefs[0].title, 'Sparse attention for long-context models');

  const lexicalFalsePositive = await prepareOrdinaryWikiBuild({
    userId: 'user-1',
    title: 'Margin of Safety',
    createdFrom: { type: 'idea', text: 'Explain margin of safety.' },
    models
  });
  assert.equal(lexicalFalsePositive.eligible, false);
  assert.equal(lexicalFalsePositive.code, 'WIKI_BUILD_EVIDENCE_MISSING');

  console.log('wikiBuildPreflightService tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
