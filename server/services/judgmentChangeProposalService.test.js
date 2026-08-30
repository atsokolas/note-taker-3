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
