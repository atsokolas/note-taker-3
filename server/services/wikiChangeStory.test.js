const assert = require('assert');
const { describeHistory, describeRevision, describeSnapshots } = require('./wikiChangeStory');

/* A revision should read as a sentence a colleague would say, never as a diff,
   and never more confident than the two snapshots it is read from. */

const heading = text => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const para = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content) => ({ type: 'doc', content });

const before = {
  body: doc(para('Costco sells memberships.'), heading('Margins'), para('Margins are thin.')),
  sourceRefs: [{ title: 'Costco 10-K', objectId: 'a1' }]
};
const after = {
  body: doc(para('Costco sells memberships.'), heading('Margins'), para('Margins are thin but steady.'), heading('Renewal rates'), para('Renewals run above 90%.')),
  sourceRefs: [{ title: 'Costco 10-K', objectId: 'a1' }, { title: 'Ben Carlson on Costco', objectId: 'a2' }]
};

assert.strictEqual(
  describeSnapshots(before, after),
  'Added a section on Renewal rates, citing Ben Carlson on Costco. Rewrote Margins.'
);
assert.strictEqual(describeSnapshots(null, after), 'Started the page from 2 sources.');
assert.strictEqual(describeSnapshots(after, after), '', 'no change, no sentence');
assert.strictEqual(
  describeSnapshots(after, { ...after, body: doc(para('Costco sells memberships.'), heading('Margins'), para('Margins are thin but steady.')) }),
  'Removed Renewal rates.'
);

// Without snapshots: what the revision records, in plain words.
assert.strictEqual(describeRevision({ reason: 'user_edit', before: null }, after), 'You edited the page.', 'a pruned snapshot is not a new page');
assert.strictEqual(
  describeSnapshots({ body: doc(para('x')) }, { body: doc(heading('A'), heading('B'), heading('C'), heading('D')) }),
  'Added sections on A, B and 2 more.'
);
assert.strictEqual(describeRevision({ reason: 'agent_maintenance', snapshotUnchanged: true }), 'Checked against its sources. Nothing changed.');
assert.strictEqual(describeRevision({ reason: 'user_edit', summary: 'Updated "Costco".' }), 'You edited the page.', 'bookkeeping summaries say nothing');
assert.strictEqual(describeRevision({ reason: 'source_event', summary: 'Linked "Membership" from "Costco".' }), 'Linked "Membership" from "Costco".');

// History rows carry only `before`; the following state is the newer row's before.
const history = describeHistory([
  { _id: 'r2', reason: 'agent_maintenance', before },
  { _id: 'r1', reason: 'created', before: null }
], after);
assert.deepStrictEqual(history, [
  'Added a section on Renewal rates, citing Ben Carlson on Costco. Rewrote Margins.',
  'Started the page from 1 source.'
]);

// A proposal never became the page, so it does not move the chain.
const withCandidate = describeHistory([
  { _id: 'r3', reason: 'agent_candidate', promotionStatus: 'candidate', before: after },
  { _id: 'r2', reason: 'agent_maintenance', before }
], after);
assert.strictEqual(withCandidate[0], 'Partner proposed a change.');
assert.strictEqual(withCandidate[1], 'Added a section on Renewal rates, citing Ben Carlson on Costco. Rewrote Margins.');

console.log('ok - wiki change story');
