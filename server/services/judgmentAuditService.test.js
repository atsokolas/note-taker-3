const assert = require('assert');
const {
  buildJudgmentAudit,
  buildJudgmentAuditRows,
  impactRegister,
  summarizeJudgmentAudit
} = require('./judgmentAuditService');

const now = new Date('2026-08-31T12:00:00.000Z');
const pages = [{
  _id: 'page-1',
  judgment: { currentJudgment: 'The cost advantage will persist.' }
}];
const events = [{
  _id: 'event-1', provider: 'sec-edgar', status: 'processed', title: 'Quarterly filing',
  affectedPageIds: ['page-1'], createdAt: '2026-08-31T08:00:00.000Z'
}, {
  _id: 'event-2', provider: 'github-repo', status: 'failed', title: 'Repository change',
  affectedPageIds: ['page-1'], createdAt: '2026-08-29T08:00:00.000Z', errorMessage: 'Worker stopped.'
}, {
  _id: 'event-3', provider: 'market-price', status: 'processed', title: 'Market price moved',
  affectedPageIds: ['page-1'], createdAt: '2026-08-29T08:00:00.000Z'
}];
const revisions = [{
  _id: 'revision-1', sourceEventId: 'event-1', createdAt: '2026-08-31T09:00:00.000Z',
  before: { claims: [{ claimId: 'claim-1', text: 'The cost advantage will persist.', support: 'partial' }] },
  after: { claims: [{ claimId: 'claim-1', text: 'The cost advantage will persist.', support: 'conflicted' }] }
}];

const receipts = [{
  receiptId: 'consequence-3', kind: 'consequence_disposition', status: 'preserved',
  completedAt: '2026-08-29T09:00:00.000Z', provenance: { eventId: 'event-3', disposition: 'preserve' }
}];

const rows = buildJudgmentAuditRows({ events, pages, revisions, runs: [], receipts, now });
assert.strictEqual(rows.length, 3);
assert.strictEqual(rows[0].assessment, 'cuts_against');
assert.strictEqual(rows[0].overdue, false);
assert.strictEqual(rows[1].assessment, 'unassessed');
assert.strictEqual(rows[1].overdue, true);
assert.strictEqual(rows[1].stuck, true);
assert.strictEqual(rows[2].assessment, 'neutral');
assert.strictEqual(rows[2].disposition, 'preserve');
assert.strictEqual(rows[2].overdue, false);
assert.strictEqual(summarizeJudgmentAudit(rows).status, 'attention');
assert.strictEqual(summarizeJudgmentAudit(rows).overdueAssessments, 1);
assert.strictEqual(impactRegister([]), 'neutral');

const query = rows => ({
  select() { return this; },
  sort() { return this; },
  limit() { return this; },
  async lean() { return rows; }
});

const observed = {};
buildJudgmentAudit({
  userId: 'owner-1',
  now,
  WikiPage: {
    find(filter) {
      observed.pageFilter = filter;
      return query(pages);
    }
  },
  WikiSourceEvent: {
    find(filter) {
      observed.eventFilter = filter;
      return query([]);
    }
  }
}).then(result => {
  assert.deepStrictEqual(observed.eventFilter.affectedPageIds.$in, ['page-1']);
  assert.strictEqual(result.summary.status, 'quiet');
  console.log('judgmentAuditService tests passed');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
