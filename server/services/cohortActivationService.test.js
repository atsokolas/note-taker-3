const assert = require('assert');
const {
  ACTIVATING,
  FIRST_THREE,
  buildCohortActivation,
  describeCohort
} = require('./cohortActivationService');

const receipt = (userId, kind, { status = 'completed', completedAt = '2026-09-01T10:00:00.000Z' } = {}) => ({
  userId, kind, status, completedAt
});

const five = ['u1', 'u2', 'u3', 'u4', 'u5'].map(id => ({ id, label: `Participant ${id}` }));
const allThree = (userId) => FIRST_THREE.map(kind => receipt(userId, kind));

/* An unread store is not an empty one. */
{
  const cohort = buildCohortActivation({ participants: five, receipts: null });
  assert.strictEqual(cohort.known, false);
  assert.strictEqual(cohort.passes, null);
  assert.strictEqual(cohort.complete, null);
  assert.match(describeCohort(cohort), /not read/);
}

/* Five participants, all three receipts each: the gate passes. */
{
  const receipts = five.flatMap(person => allThree(person.id));
  const cohort = buildCohortActivation({ participants: five, receipts });
  assert.strictEqual(cohort.known, true);
  assert.strictEqual(cohort.complete, 5);
  assert.strictEqual(cohort.passes, true);
  // Completing Stage 1 is not activation. That waits on Stage 2's receipt.
  assert.strictEqual(cohort.activated, 0);
  assert.match(describeCohort(cohort), /5\/5 complete · 0 activated · PASSES/);
}

/* Four of five is a failed gate, not a nearly-passing one. */
{
  const receipts = five.slice(0, 4).flatMap(person => allThree(person.id));
  const cohort = buildCohortActivation({ participants: five, receipts });
  assert.strictEqual(cohort.complete, 4);
  assert.strictEqual(cohort.passes, false);
  const short = cohort.participants.find(person => person.id === 'u5');
  assert.deepStrictEqual(short.missing, [...FIRST_THREE]);
}

/* A missing middle receipt is named, not averaged away. */
{
  const receipts = [
    receipt('u1', 'company_dossier_created'),
    receipt('u1', 'investment_valuation_refreshed')
  ];
  const cohort = buildCohortActivation({ participants: [{ id: 'u1' }], receipts });
  const [person] = cohort.participants;
  assert.deepStrictEqual(person.missing, ['company_dossier_first_head_accepted']);
  assert.strictEqual(person.complete, false);
}

/* A pending receipt is an intention, not evidence. */
{
  const receipts = [
    ...FIRST_THREE.slice(0, 2).map(kind => receipt('u1', kind)),
    receipt('u1', 'investment_valuation_refreshed', { status: 'pending' })
  ];
  const cohort = buildCohortActivation({ participants: [{ id: 'u1' }], receipts });
  assert.strictEqual(cohort.participants[0].complete, false);
}

/* Activation needs the fourth receipt on top of the first three. */
{
  const receipts = [...allThree('u1'), receipt('u1', ACTIVATING, { completedAt: '2026-09-20T09:00:00.000Z' })];
  const cohort = buildCohortActivation({ participants: [{ id: 'u1' }], receipts });
  const [person] = cohort.participants;
  assert.strictEqual(person.complete, true);
  assert.strictEqual(person.activated, true);
  assert.strictEqual(person.activatedAt, '2026-09-20T09:00:00.000Z');
}

/* The fourth receipt alone activates nobody. */
{
  const cohort = buildCohortActivation({
    participants: [{ id: 'u1' }],
    receipts: [receipt('u1', ACTIVATING)]
  });
  assert.strictEqual(cohort.participants[0].activated, false);
}

/* One participant's receipts never count for another. */
{
  const cohort = buildCohortActivation({
    participants: [{ id: 'u1' }, { id: 'u2' }],
    receipts: allThree('u1')
  });
  assert.strictEqual(cohort.participants.find(p => p.id === 'u2').complete, false);
  assert.strictEqual(cohort.complete, 1);
}

/* A short roster cannot pass, however good it looks. */
{
  const three = five.slice(0, 3);
  const cohort = buildCohortActivation({
    participants: three,
    receipts: three.flatMap(person => allThree(person.id))
  });
  assert.strictEqual(cohort.complete, 3);
  assert.strictEqual(cohort.passes, false);
  assert.match(describeCohort(cohort), /3 of 5 participants enrolled · gate cannot pass yet/);
}

/* The earliest completion is the one on the record. */
{
  const cohort = buildCohortActivation({
    participants: [{ id: 'u1' }],
    receipts: [
      receipt('u1', 'company_dossier_created', { completedAt: '2026-09-05T00:00:00.000Z' }),
      receipt('u1', 'company_dossier_created', { completedAt: '2026-09-01T00:00:00.000Z' })
    ]
  });
  assert.strictEqual(
    cohort.participants[0].produced.company_dossier_created,
    '2026-09-01T00:00:00.000Z'
  );
}

console.log('cohort activation tests passed');
