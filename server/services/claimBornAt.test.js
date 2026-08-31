const assert = require('node:assert/strict');
const {
  applyBornAtToClaims,
  applyClaimBornAtChanges,
  planClaimBornAtBackfill,
  resolveClaimBornAt
} = require('./claimBornAt');

const created = new Date('2026-02-01T12:00:00.000Z');
const historyAt = new Date('2026-01-15T12:00:00.000Z');
const pageCreated = new Date('2025-11-01T12:00:00.000Z');
const now = new Date('2026-08-31T12:00:00.000Z');

assert.deepEqual(
  resolveClaimBornAt({ createdAt: created }, { now }),
  created,
  'backfill from createdAt'
);

assert.deepEqual(
  resolveClaimBornAt({
    history: [{ event: 'created', at: historyAt }, { event: 'updated', at: now }]
  }, { now }),
  historyAt,
  'backfill from the oldest history.at'
);

assert.deepEqual(
  resolveClaimBornAt({}, { pageCreatedAt: pageCreated, now }),
  pageCreated,
  'fall back to the page createdAt'
);

assert.deepEqual(
  resolveClaimBornAt({}, { now }),
  now,
  'a brand-new claim is born now, never Unknown'
);

assert.deepEqual(
  resolveClaimBornAt({
    bornAt: now,
    createdAt: created,
    history: [{ at: historyAt }]
  }, { pageCreatedAt: pageCreated, now }),
  historyAt,
  'bornAt is the earliest instant, not the latest stamp'
);

assert.equal(
  applyBornAtToClaims(
    [{ claimId: 'c1', text: 'Held.', createdAt: created }],
    { now }
  )[0].bornAt.toISOString(),
  created.toISOString()
);

const plan = planClaimBornAtBackfill([
  {
    _id: 'page-1',
    userId: 'u1',
    createdAt: pageCreated,
    claims: [
      { claimId: 'has-date', bornAt: created, createdAt: created },
      { claimId: 'from-history', history: [{ at: historyAt, event: 'created' }] },
      { claimId: 'already', bornAt: historyAt, history: [{ at: historyAt }] }
    ]
  }
], { now });

assert.equal(plan.length, 1, 'dry-run lists only claims that still need a stamp');
assert.deepEqual(plan[0], {
  pageId: 'page-1',
  userId: 'u1',
  claimId: 'from-history',
  from: null,
  to: historyAt.toISOString()
});

const applied = applyClaimBornAtChanges(
  [{ claimId: 'from-history', text: 'Held.' }],
  plan,
  { now }
);
assert.equal(applied[0].bornAt.toISOString(), historyAt.toISOString());

console.log('claimBornAt tests passed');
