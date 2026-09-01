const test = require('node:test');
const assert = require('node:assert/strict');
const {
  JudgmentChangeProposalError,
  buildJudgmentChangeProposal,
  planJudgmentChangeDisposition
} = require('./judgmentChangeProposalService');

const page = () => ({
  _id: 'page-1',
  title: 'Compute scarcity',
  judgment: {
    currentJudgment: 'AI compute remains scarce.',
    decisions: []
  }
});

test('a proposal is bound to the page and the exact before and after sentences', () => {
  const receipt = buildJudgmentChangeProposal({
    page: page(),
    proposedJudgment: 'AI compute is becoming abundant.',
    now: new Date('2026-08-30T12:00:00.000Z')
  });
  assert.equal(receipt.status, 'pending');
  assert.equal(receipt.provenance.pageId, 'page-1');
  assert.equal(receipt.provenance.before, 'AI compute remains scarce.');
  assert.equal(receipt.provenance.after, 'AI compute is becoming abundant.');
  assert.match(receipt.id, /^judgment-change-proposal:page-1:[a-f0-9]{24}$/);
});

test('accept changes the held sentence and records the human mind-change', () => {
  const current = page();
  const receipt = buildJudgmentChangeProposal({
    page: current,
    proposedJudgment: 'AI compute is becoming abundant.'
  });
  const planned = planJudgmentChangeDisposition({
    receipt,
    page: current,
    action: 'accept',
    now: new Date('2026-08-30T13:00:00.000Z')
  });
  assert.equal(planned.receipt.status, 'accepted');
  assert.equal(planned.judgment.currentJudgment, 'AI compute is becoming abundant.');
  assert.equal(planned.judgment.decisions[0].createdBy, 'user');
  assert.match(planned.judgment.decisions[0].summary, /^Changed what I hold:/);
});

test('preserve, reject, and defer never rewrite accepted knowledge', () => {
  Object.entries({ preserve: 'preserved', reject: 'rejected', defer: 'deferred' }).forEach(([action, status]) => {
    const current = page();
    const receipt = buildJudgmentChangeProposal({
      page: current,
      proposedJudgment: 'AI compute is becoming abundant.'
    });
    const planned = planJudgmentChangeDisposition({ receipt, page: current, action });
    assert.equal(planned.judgment, null);
    assert.equal(planned.receipt.status, status);
  });
});

test('a stale or corrupt proposal fails closed', () => {
  const current = page();
  const receipt = buildJudgmentChangeProposal({
    page: current,
    proposedJudgment: 'AI compute is becoming abundant.'
  });
  current.judgment.currentJudgment = 'The sentence changed elsewhere.';
  assert.throws(
    () => planJudgmentChangeDisposition({ receipt, page: current, action: 'accept' }),
    error => error instanceof JudgmentChangeProposalError
      && error.code === 'JUDGMENT_CHANGE_PROPOSAL_STALE'
  );
  const corrupt = {
    ...receipt,
    provenance: { ...receipt.provenance, pageId: 'page-2' }
  };
  assert.throws(
    () => planJudgmentChangeDisposition({ receipt: corrupt, page: page(), action: 'accept' }),
    /does not belong/
  );
});

test('identical replay is idempotent while conflicting replay fails closed', () => {
  const current = page();
  const pending = buildJudgmentChangeProposal({
    page: current,
    proposedJudgment: 'AI compute is becoming abundant.'
  });
  const accepted = planJudgmentChangeDisposition({ receipt: pending, page: current, action: 'accept' }).receipt;
  assert.equal(
    planJudgmentChangeDisposition({ receipt: accepted, page: current, action: 'accept' }).replay,
    true
  );
  assert.throws(
    () => planJudgmentChangeDisposition({ receipt: accepted, page: current, action: 'reject' }),
    /already resolved differently/
  );
});

test('narrow writes the same sentence as accept but records a bounded belief', () => {
  const current = page();
  const receipt = buildJudgmentChangeProposal({
    page: current,
    proposedJudgment: 'AI compute remains scarce for training runs above 10^26 FLOPs.'
  });
  const planned = planJudgmentChangeDisposition({
    receipt,
    page: current,
    action: 'narrow',
    now: new Date('2026-08-30T12:00:00.000Z')
  });

  assert.equal(planned.receipt.status, 'narrowed');
  assert.equal(
    planned.receipt.summary,
    'Narrowed: AI compute remains scarce for training runs above 10^26 FLOPs.'
  );
  assert.equal(planned.receipt.provenance.disposition, 'narrow');
  // The write is identical to accept — the belief moves.
  assert.equal(
    planned.judgment.currentJudgment,
    'AI compute remains scarce for training runs above 10^26 FLOPs.'
  );
  // The record is not — a year from now this is what tells the two apart.
  assert.equal(
    planned.judgment.decisions.at(-1).summary,
    'Narrowed what I hold: AI compute remains scarce for training runs above 10^26 FLOPs.'
  );
});

test('narrow is terminal, and replaying it is not an error', () => {
  const current = page();
  const receipt = buildJudgmentChangeProposal({ page: current, proposedJudgment: 'A narrower claim.' });
  const first = planJudgmentChangeDisposition({ receipt, page: current, action: 'narrow' });

  const replay = planJudgmentChangeDisposition({ receipt: first.receipt, page: current, action: 'narrow' });
  assert.equal(replay.replay, true);
  assert.equal(replay.judgment, null);

  assert.throws(
    () => planJudgmentChangeDisposition({ receipt: first.receipt, page: current, action: 'reject' }),
    JudgmentChangeProposalError
  );
});

test('an unknown disposition names every one that is offered', () => {
  const current = page();
  const receipt = buildJudgmentChangeProposal({ page: current, proposedJudgment: 'Something else.' });
  assert.throws(
    () => planJudgmentChangeDisposition({ receipt, page: current, action: 'shrug' }),
    /accept, narrow, preserve, reject, or defer/
  );
});
