const assert = require('assert');
const { __testables: { findOrdinaryGroundingGaps } } = require('./wikiMaintenanceService');

// A section states its definition with a citation, then develops it in the next
// sentence. Judged in isolation that development reads as unanchored, which
// rejected accurate Graham-and-Dodd synthesis while its own source sat one
// sentence above. Scope is the section, not the page: borrowing a mechanism
// from another section's sources is the fabricated bridge this gate exists for.

const grahamSource = {
  title: 'Security Analysis — intrinsic value',
  snippet: 'Intrinsic value is the worth of an enterprise justified by assets, earnings and dividends. It is an elusive concept and cannot be measured exactly, so the analyst works with an approximate range rather than a precise figure.'
};
const amazonSource = {
  title: 'Two-pizza teams',
  snippet: 'Autonomous teams remove cross-team coordination as a default dependency so that each unit can ship without waiting on another.'
};

const run = () => {
  // 1. A development sentence is grounded by its own section's citation.
  const developed = findOrdinaryGroundingGaps({
    claims: [
      {
        section: 'Estimating intrinsic value',
        text: 'Intrinsic value is the worth of an enterprise justified by assets, earnings and dividends.',
        citationIndexes: [1],
        support: 'supported'
      },
      {
        section: 'Estimating intrinsic value',
        // Faithful compression of the cited definition, in the writer's words.
        text: 'Because that worth can only ever be approximated rather than measured exactly, the discipline is to buy far enough below the estimate to absorb an analyst error.',
        citationIndexes: [1],
        support: 'supported'
      }
    ],
    sourceRefs: [grahamSource]
  });
  assert.deepEqual(developed, [], `faithful in-section synthesis must pass: ${developed.join(' | ')}`);

  // 2. Borrowing another section's evidence is still a fabricated bridge.
  const borrowed = findOrdinaryGroundingGaps({
    claims: [
      {
        section: 'Team design',
        text: 'Autonomous teams remove cross-team coordination as a default dependency.',
        citationIndexes: [2],
        support: 'supported'
      },
      {
        section: 'Raising children',
        text: 'This is the same general shape as the autonomous team mechanism: both remove a default dependency so the unit can proceed without waiting for permission.',
        citationIndexes: [1],
        support: 'supported'
      }
    ],
    sourceRefs: [grahamSource, amazonSource]
  });
  assert.equal(borrowed.length, 1, 'a cross-section borrow must still be caught');
  assert.match(borrowed[0], /same general shape/);

  // 3. Anchored nowhere is still fabrication.
  const invented = findOrdinaryGroundingGaps({
    claims: [{
      section: 'Estimating intrinsic value',
      text: 'Modern institutions increasingly favour decentralised governance models that redistribute authority across autonomous participating units.',
      citationIndexes: [1],
      support: 'supported'
    }],
    sourceRefs: [grahamSource]
  });
  assert.equal(invented.length, 1, 'an unanchored abstraction must still fail');

  // 4. A sentence that cites nothing of its own is not judged here; the
  //    uncited-claim gate owns that case.
  const uncited = findOrdinaryGroundingGaps({
    claims: [
      { section: 'S', text: 'Intrinsic value is elusive.', citationIndexes: [1], support: 'supported' },
      { section: 'S', text: 'Something entirely unrelated about maritime law and cargo insurance regimes.', citationIndexes: [], support: 'supported' }
    ],
    sourceRefs: [grahamSource]
  });
  assert.deepEqual(uncited, [], 'uncited claims are handled by their own gate');

  // 5. The lead paragraph summarises the whole article, so the whole
  //    article's evidence grounds it. It sits before any heading.
  const lead = findOrdinaryGroundingGaps({
    claims: [
      {
        section: '',
        text: 'Value investing buys below a conservatively estimated worth, and autonomous teams are governed by a different logic entirely.',
        citationIndexes: [1],
        support: 'supported'
      },
      { section: 'Team design', text: 'Autonomous teams remove cross-team coordination.', citationIndexes: [2], support: 'supported' }
    ],
    sourceRefs: [grahamSource, amazonSource]
  });
  assert.deepEqual(lead, [], `the lead is grounded by the article it introduces: ${lead.join(' | ')}`);

  console.log('wikiGroundingSectionScope tests passed');
};

if (require.main === module) {
  try { run(); } catch (error) { console.error(error); process.exit(1); }
}
module.exports = { run };
