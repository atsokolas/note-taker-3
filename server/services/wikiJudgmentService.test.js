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
