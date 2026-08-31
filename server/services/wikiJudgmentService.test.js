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

  const fromLibrary = normalizeJudgment({
    input: {
      currentJudgment: 'Hire Maya as the first engineer.',
      why: [{
        text: 'Maya is the engineer I would hire first.',
        sourceLabel: 'Hiring notes',
        acceptedFrom: 'highlight:note-1:h-maya'
      }]
    }
  });
  assert.strictEqual(fromLibrary.why[0].sourceLabel, 'Hiring notes');
  assert.strictEqual(fromLibrary.why[0].acceptedFrom, 'highlight:note-1:h-maya');

  const dated = normalizeJudgment({
    input: {
      ...base(),
      why: [{
        reasonId: 'why-1',
        text: 'AI demand keeps compounding faster than new supply.',
        createdAt: '2026-02-14T12:00:00.000Z'
      }]
    }
  });
  assert.strictEqual(dated.why[0].createdAt.toISOString(), '2026-02-14T12:00:00.000Z');

  const fromAlias = normalizeJudgment({
    input: {
      ...base(),
      why: [{
        reasonId: 'why-1',
        text: 'AI demand keeps compounding faster than new supply.',
        at: '2026-02-14T12:00:00.000Z'
      }]
    }
  });
  assert.strictEqual(fromAlias.why[0].createdAt.toISOString(), '2026-02-14T12:00:00.000Z');

  const preserved = normalizeJudgment({
    existing: dated,
    input: {
      ...base(),
      why: [
        {
          reasonId: 'why-1',
          text: 'AI demand keeps compounding faster than new supply.',
          createdAt: '2026-02-14T12:00:00.000Z'
        },
        { text: 'A fresh reason.' }
      ]
    }
  });
  assert.strictEqual(preserved.why[0].createdAt.toISOString(), '2026-02-14T12:00:00.000Z');
  assert.ok(preserved.why[1].createdAt instanceof Date);

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

  const silenced = normalizeJudgment({
    input: { ...base(), dismissedOvernightEventIds: ['event-1', '  ', 'event-2'] }
  });
  assert.deepStrictEqual(silenced.dismissedOvernightEventIds, ['event-1', 'event-2']);
  const keptSilence = normalizeJudgment({
    existing: silenced,
    input: { ...base(), why: [{ text: 'A reason that does not un-silence morning.' }] }
  });
  assert.deepStrictEqual(keptSilence.dismissedOvernightEventIds, ['event-1', 'event-2']);

  const response = {
    responseId: 'evidence-1',
    reasonId: 'against-1',
    field: 'against',
    claimHash: 'held-sentence-hash'
  };
  const keptResponse = normalizeJudgment({
    existing: { ...reasoned, evidenceResponses: [response] },
    input: { ...base(), evidenceResponses: [{ responseId: 'invented' }] }
  });
  assert.deepStrictEqual(keptResponse.evidenceResponses, [response]);

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

/* What a belief rests on. */
{
  const { normalizeDependencies } = require('./wikiJudgmentService');

  const edges = normalizeDependencies([
    { pageId: '507f1f77bcf86cd799439011', note: 'If compute stops being scarce this stops being cheap.' },
    { pageId: '507f1f77bcf86cd799439011' },
    { pageId: 'self-page' }
  ], 'user', 'self-page');
  assert.strictEqual(edges.length, 1, 'duplicates collapse and self-reference is dropped');
  assert.strictEqual(edges[0].note, 'If compute stops being scarce this stops being cheap.');
  assert.strictEqual(edges[0].proposedBy, 'user');
  assert.ok(edges[0].dependencyId);

  // An agent may propose an edge and may never store one as accepted.
  const proposed = normalizeDependencies([{ pageId: 'p2', proposedBy: 'ai_proposed' }], 'agent', 'p1');
  assert.strictEqual(proposed[0].proposedBy, 'ai_proposed');

  let refusedAgent = null;
  try {
    normalizeDependencies([{ pageId: 'p2', proposedBy: 'user' }], 'agent', 'p1');
  } catch (error) { refusedAgent = error; }
  assert.ok(refusedAgent, 'an agent cannot accept a dependency on the reader\'s behalf');

  let refusedEmpty = null;
  try { normalizeDependencies([{ note: 'no page' }], 'user', 'p1'); } catch (error) { refusedEmpty = error; }
  assert.ok(refusedEmpty, 'a dependency without a page is refused');

  const carried = normalizeJudgment({
    input: { currentJudgment: 'CoreWeave is undervalued.', dependsOn: [{ pageId: 'p9', note: 'Rests on compute scarcity.' }] },
    pageId: 'p1'
  });
  assert.strictEqual(carried.dependsOn.length, 1, 'dependencies survive the normalizer');

  const clocked = {
    currentJudgment: 'Compute is scarce.',
    clocks: [{
      factId: 'clock_1',
      clock: 'evidence',
      recordedAt: new Date('2026-03-01T12:00:00.000Z'),
      precision: 'day',
      authoredBy: 'world',
      summary: 'The 10-K landed.',
      recordHash: 'abc'
    }],
    outcomes: [{
      outcomeId: 'out_1',
      result: 'held',
      recordedAt: new Date('2026-08-01T12:00:00.000Z'),
      verdictSnapshot: 'held_up',
      answer: 'Power, not silicon.'
    }],
    lessonApplications: [{
      applicationId: 'apply_1',
      lessonId: 'l1',
      status: 'rejected',
      sourceText: 'Watch conversion.'
    }]
  };
  const preserved = normalizeJudgment({
    existing: clocked,
    input: { currentJudgment: 'Compute is scarce.', clocks: [], outcomes: [], lessonApplications: [] }
  });
  assert.strictEqual(preserved.clocks[0].summary, 'The 10-K landed.', 'clocks survive a generic edit');
  assert.strictEqual(preserved.outcomes[0].verdictSnapshot, 'held_up');
  assert.strictEqual(preserved.lessonApplications[0].status, 'rejected');

  console.log('judgment dependency tests passed');
}
