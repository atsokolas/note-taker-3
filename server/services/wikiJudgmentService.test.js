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
};

if (require.main === module) {
  try { run(); console.log('wikiJudgmentService tests passed'); }
  catch (error) { console.error(error); process.exit(1); }
}

module.exports = { run };
