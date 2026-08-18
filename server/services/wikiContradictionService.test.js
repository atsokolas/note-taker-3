const assert = require('assert');
const { collectContradictions, contradictionsOnPage } = require('./wikiContradictionService');

/* Contradiction was a colour on a citation inside one article: you had to
   already be reading the right page to learn that two things you read do not
   agree. These are the rules of the view that replaces it. */

const page = (overrides = {}) => ({
  _id: 'p1',
  title: 'Strategy',
  slug: 'strategy',
  updatedAt: '2026-08-01T00:00:00.000Z',
  sourceRefs: [
    { _id: 's1', title: 'What Is Strategy?', url: 'https://example.com/strategy', snippet: 'Fallback snippet.' },
    { _id: 's2', title: 'Operational effectiveness trap' }
  ],
  citations: [
    { _id: 'c1', sourceRefId: 's1', sourceTitle: 'What Is Strategy?', quote: 'The essence of strategy is choosing what not to do.' },
    { _id: 'c2', sourceRefId: 's2', sourceTitle: 'Operational effectiveness trap', quote: 'Operational improvement is not the same as strategy.' }
  ],
  claims: [{
    claimId: 'cl1',
    text: 'Positioning beats operations.',
    support: 'conflicted',
    sourceRefIds: ['s1'],
    contradictedByCitationIds: ['c2']
  }],
  ...overrides
});

const run = () => {
  // Both passages, both publications, side by side.
  const [found] = contradictionsOnPage(page());
  assert.strictEqual(found.claimText, 'Positioning beats operations.');
  assert.strictEqual(found.supporting[0].title, 'What Is Strategy?');
  assert.strictEqual(found.supporting[0].quote, 'The essence of strategy is choosing what not to do.');
  assert.strictEqual(found.supporting[0].url, 'https://example.com/strategy');
  assert.strictEqual(found.contradicting[0].title, 'Operational effectiveness trap');
  assert.strictEqual(found.contradicting[0].quote, 'Operational improvement is not the same as strategy.');

  // A claim nothing argues with is not a contradiction, whatever it is labelled.
  const merelyLabelled = page({
    claims: [{ claimId: 'cl1', text: 'Positioning beats operations.', support: 'conflicted', sourceRefIds: ['s1'], contradictedByCitationIds: [] }]
  });
  assert.deepStrictEqual(contradictionsOnPage(merelyLabelled), [],
    'a tag with nothing on the other side is not a disagreement');

  // A claim something argues with is a contradiction, even if nobody tagged it.
  const untagged = page({
    claims: [{ claimId: 'cl1', text: 'Positioning beats operations.', support: 'supported', sourceRefIds: ['s1'], contradictedByCitationIds: ['c2'] }]
  });
  const [foundUntagged] = contradictionsOnPage(untagged);
  assert.ok(foundUntagged, 'the passages decide, not the label');
  assert.strictEqual(foundUntagged.labelled, false);

  // A source cannot be its own opposition.
  const selfOpposed = page({
    claims: [{ claimId: 'cl1', text: 'Positioning beats operations.', support: 'conflicted', sourceRefIds: ['s1', 's2'], contradictedByCitationIds: ['c2'] }]
  });
  const [foundSelf] = contradictionsOnPage(selfOpposed);
  assert.deepStrictEqual(foundSelf.supporting.map(side => side.title), ['What Is Strategy?']);

  // A side with no captured quote still names who disagrees.
  const noQuote = page({
    citations: [
      { _id: 'c1', sourceRefId: 's1', sourceTitle: 'What Is Strategy?', quote: '' },
      { _id: 'c2', sourceRefId: 's2', sourceTitle: 'Operational effectiveness trap', quote: '' }
    ]
  });
  const [foundNoQuote] = contradictionsOnPage(noQuote);
  assert.strictEqual(foundNoQuote.contradicting[0].title, 'Operational effectiveness trap');
  assert.strictEqual(foundNoQuote.contradicting[0].quote, '');
  assert.strictEqual(foundNoQuote.supporting[0].quote, 'Fallback snippet.', 'falls back to the stored snippet');

  // A citation that was deleted leaves no ghost.
  const danglingOnly = page({
    claims: [{ claimId: 'cl1', text: 'Positioning beats operations.', support: 'conflicted', sourceRefIds: ['s1'], contradictedByCitationIds: ['gone'] }]
  });
  assert.deepStrictEqual(contradictionsOnPage(danglingOnly), []);

  // Across the wiki, the most recently touched page comes first.
  const older = page({ _id: 'p0', title: 'Older', updatedAt: '2026-01-01T00:00:00.000Z' });
  const ordered = collectContradictions([older, page()]);
  assert.deepStrictEqual(ordered.map(item => item.pageTitle), ['Strategy', 'Older']);

  console.log('ok - wiki contradiction view');
};

run();
