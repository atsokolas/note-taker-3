const assert = require('assert');
const {
  JudgmentValidationError,
  normalizeClaimUpdates,
  normalizeJudgment
} = require('./wikiJudgmentService');

const run = () => {
  const judgment = normalizeJudgment({
    input: {
      kind: 'thesis',
      governingQuestion: 'What evidence would change this provisional view?',
      confidence: 0.42,
      causalModel: { summary: 'A narrative causal model.', nodes: [{ invented: true }], edges: [{ invented: true }] },
      assumptions: [{ text: 'QA assumption' }],
      unknowns: [{ question: 'QA unknown?', priority: 'critical' }],
      falsifiers: [{ text: 'QA falsifier', observableSignal: 'QA signal' }],
      decisions: [{ summary: 'Run a bounded QA research step.', decisionType: 'research' }]
    }
  });
  assert.strictEqual(judgment.kind, 'thesis');
  assert.deepStrictEqual(judgment.causalModel, { summary: 'A narrative causal model.', nodes: [], edges: [] });
  assert.match(judgment.assumptions[0].assumptionId, /^assumption_/);
  assert.match(judgment.unknowns[0].unknownId, /^unknown_/);
  assert.match(judgment.falsifiers[0].falsifierId, /^falsifier_/);
  assert.match(judgment.decisions[0].decisionId, /^decision_/);
  assert.strictEqual(judgment.decisions[0].status, 'planned');

  const initialRevisionId = '507f1f77bcf86cd799439011';
  const updated = normalizeJudgment({
    existing: { ...judgment, initialRevisionId },
    input: { ...judgment, initialRevisionId: null, currentJudgment: 'Revised QA judgment.' }
  });
  assert.strictEqual(updated.initialRevisionId, initialRevisionId);

  assert.throws(() => normalizeJudgment({ input: { kind: 'thesis', governingQuestion: '', confidence: 0.5 } }), JudgmentValidationError);
  assert.throws(() => normalizeJudgment({ input: { kind: 'thesis', governingQuestion: 'Question?', confidence: 1.1 } }), JudgmentValidationError);
  assert.throws(() => normalizeJudgment({ input: { kind: 'thesis', governingQuestion: 'Question?', status: 'monitoring' } }), /requires a current judgment/);
  assert.throws(() => normalizeJudgment({
    actorType: 'agent',
    input: { kind: 'thesis', governingQuestion: 'Question?', decisions: [{ summary: 'Execute', status: 'taken' }] }
  }), /human action/);

  const claimUpdates = normalizeClaimUpdates([{ claimId: 'claim-1', epistemicStatus: 'established_fact', materiality: 'critical' }]);
  assert.strictEqual(claimUpdates[0].epistemicStatus, 'established_fact');
  assert.strictEqual(claimUpdates[0].materiality, 'critical');
  assert.throws(() => normalizeClaimUpdates([{ claimId: 'claim-1', epistemicStatus: 'certain' }]), JudgmentValidationError);

  runReasonLists();
};

// Why and Against are lists, because the Judgment page reads one line at a time
// and an agent line the human accepted has to land as its own line with its own
// provenance.
const runReasonLists = () => {
  const base = () => ({
    kind: 'thesis',
    governingQuestion: 'Does demand outrun capacity?',
    currentJudgment: 'Demand still outruns deliverable capacity.'
  });

  const reasoned = normalizeJudgment({
    input: {
      ...base(),
      why: [
        { text: 'AI demand keeps compounding faster than new supply.', sourceRefIds: ['507f1f77bcf86cd799439011'] },
        { reasonId: 'why-lead-times', text: '  Lead times   constrain delivery. ' }
      ],
      against: [{ text: 'Hyperscalers design more in-house silicon.', acceptedFrom: 'event-1' }]
    }
  });
  assert.strictEqual(reasoned.why.length, 2);
  assert.match(reasoned.why[0].reasonId, /^why_/);
  assert.strictEqual(reasoned.why[1].reasonId, 'why-lead-times');
  assert.strictEqual(reasoned.why[1].text, 'Lead times constrain delivery.');
  assert.deepStrictEqual(reasoned.why[0].sourceRefIds, ['507f1f77bcf86cd799439011']);
  assert.strictEqual(reasoned.against[0].acceptedFrom, 'event-1');

  // A judgment that has never had either field keeps them as empty lists, so the
  // page can tell "nothing recorded" apart from "not supported".
  const empty = normalizeJudgment({ input: base() });
  assert.deepStrictEqual(empty.why, []);
  assert.deepStrictEqual(empty.against, []);

  // Accepting appends: the lines already recorded come back unchanged alongside
  // the new one, in order.
  const appended = normalizeJudgment({
    input: {
      ...base(),
      against: [
        { reasonId: 'against-1', text: 'Hyperscalers design more in-house silicon.' },
        { text: 'A 13F filing was posted.', acceptedFrom: 'event-2' }
      ]
    },
    existing: reasoned
  });
  assert.deepStrictEqual(
    appended.against.map(line => line.text),
    ['Hyperscalers design more in-house silicon.', 'A 13F filing was posted.']
  );

  // The older single counterargument is untouched by the new lists.
  const legacy = normalizeJudgment({
    input: { ...base(), strongestCounterargument: 'Pricing power may not survive the next cycle.' }
  });
  assert.strictEqual(legacy.strongestCounterargument, 'Pricing power may not survive the next cycle.');
  assert.deepStrictEqual(legacy.against, []);

  // A blank line is a mistake, not a record.
  assert.throws(
    () => normalizeJudgment({ input: { ...base(), why: [{ text: '   ' }] } }),
    (error) => error instanceof JudgmentValidationError && /why line requires text/.test(error.message)
  );
  assert.throws(
    () => normalizeJudgment({ input: { ...base(), against: 'not a list' } }),
    (error) => error instanceof JudgmentValidationError && /against must be an array/.test(error.message)
  );
};

if (require.main === module) {
  try { run(); console.log('wikiJudgmentService tests passed'); }
  catch (error) { console.error(error); process.exit(1); }
}

module.exports = { run };

/* Parking and the lesson it leaves behind. */
{
  const parked = normalizeJudgment({
    input: {
      currentJudgment: 'Compute is scarce.',
      status: 'parked',
      lessons: [{ text: 'I kept confusing announced capacity with delivered capacity.', closedAs: 'parked' }]
    }
  });
  assert.strictEqual(parked.status, 'parked', 'parked is a status a judgment can hold');
  assert.ok(parked.parkedAt instanceof Date, 'parking is dated');
  assert.strictEqual(parked.lessons.length, 1);
  assert.strictEqual(parked.lessons[0].closedAs, 'parked');
  assert.ok(parked.lessons[0].lessonId, 'a lesson gets a stable id');
  assert.ok(parked.lessons[0].at, 'and a date');

  // Picking it back up clears the date rather than recording that it was once parked.
  const resumed = normalizeJudgment({
    input: { currentJudgment: 'Compute is scarce.', status: 'monitoring' },
    existing: parked
  });
  assert.strictEqual(resumed.parkedAt, null, 'parking is reversible');
  assert.strictEqual(resumed.lessons.length, 1, 'but the lesson stays');

  // A lesson is a ledger line: it cannot be edited away.
  const rewritten = normalizeJudgment({
    input: {
      currentJudgment: 'Compute is scarce.',
      status: 'monitoring',
      lessons: [{ lessonId: parked.lessons[0].lessonId, text: 'Something more flattering.' }]
    },
    existing: resumed
  });
  assert.strictEqual(rewritten.lessons.length, 1);
  assert.strictEqual(
    rewritten.lessons[0].text,
    'I kept confusing announced capacity with delivered capacity.',
    'what was written stays written'
  );

  // And a second lesson appends.
  const twice = normalizeJudgment({
    input: {
      currentJudgment: 'Compute is scarce.',
      status: 'closed',
      lessons: [...rewritten.lessons, { text: 'Power, not silicon, was the binding constraint.', closedAs: 'closed' }]
    },
    existing: rewritten
  });
  assert.strictEqual(twice.lessons.length, 2, 'lessons accumulate');
  assert.strictEqual(twice.parkedAt, null, 'closing is not parking');

  let refused = null;
  try {
    normalizeJudgment({ input: { currentJudgment: 'x', lessons: [{ text: '   ' }] } });
  } catch (error) { refused = error; }
  assert.ok(refused, 'an empty lesson is refused rather than stored');

  console.log('judgment lesson and park tests passed');
}
