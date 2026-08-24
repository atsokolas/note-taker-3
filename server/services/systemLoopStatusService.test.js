const assert = require('assert');
const {
  LOOP_IDS,
  buildMaintenanceState,
  buildSystemLoopStatus
} = require('./systemLoopStatusService');

const observedSorts = [];
class Query {
  constructor(value) { this.value = value; }
  sort(value) { observedSorts.push(value); return this; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const modelWithLatest = value => ({ findOne: () => new Query(value) });
const receiptQueries = [];
const receiptModel = rows => ({
  findOne(query) {
    receiptQueries.push(query);
    const kinds = query?.kind?.$in || [];
    return new Query(rows.find(row => kinds.includes(row.kind)) || null);
  }
});

const now = new Date('2026-08-22T12:00:00.000Z');
const userId = '64f600000000000000000001';
const pageId = '64f600000000000000000002';

const run = async () => {
  const result = await buildSystemLoopStatus({
    userId,
    now,
    models: {
      WikiMaintenanceRun: modelWithLatest({
        _id: '64f600000000000000000003',
        pageId,
        status: 'running',
        startedAt: '2026-08-22T11:59:00.000Z'
      }),
      WikiBriefingCache: modelWithLatest({ generatedAt: '2026-08-22T07:00:00.000Z' }),
      MorningPaperDelivery: modelWithLatest({ status: 'sent', sentAt: '2026-08-22T07:05:00.000Z' }),
      WikiPage: {
        findOne: () => new Query({
          _id: pageId,
          createdFrom: { label: 'this-week-in-ai:2026-08-16:2026-08-22' },
          status: 'draft',
          updatedAt: '2026-08-22T10:00:00.000Z'
        }),
        countDocuments: query => {
          assert.strictEqual(query.userId, userId);
          assert.strictEqual(query['judgment.decisions'].$elemMatch.status, 'taken');
          return Promise.resolve(2);
        }
      },
      NoeisReceipt: receiptModel([
        {
          receiptId: 'maintenance-1', kind: 'wiki_maintenance', source: 'wiki', status: 'completed',
          title: 'Wiki maintenance', summary: 'A source is being applied.', completedAt: '2026-08-22T11:58:00.000Z',
          provenance: { privateArtifact: 'must not leave the status endpoint' }
        },
        {
          receiptId: 'paper-1', kind: 'morning_paper_email', source: 'morning-paper', status: 'completed',
          title: 'Morning Paper', summary: 'Delivered.', completedAt: '2026-08-22T07:05:00.000Z'
        },
        {
          receiptId: 'weekly-1', kind: 'weekend_readings_review_requested', source: 'wiki', status: 'completed',
          title: 'This Week in AI', summary: 'Review requested.', completedAt: '2026-08-22T10:01:00.000Z'
        },
        {
          receiptId: 'outcome-1', kind: 'wiki_decision_outcome_recorded', source: 'wiki', status: 'completed',
          title: 'Outcome recorded', summary: 'A prior outcome was recorded.', completedAt: '2026-08-21T18:00:00.000Z'
        }
      ])
    }
  });

  assert.strictEqual(result.schemaVersion, 1);
  assert.strictEqual(result.generatedAt, now.toISOString());
  assert.deepStrictEqual(Object.keys(result.loops).sort(), [...LOOP_IDS].sort());
  assert.strictEqual(result.loops['loop.morning-paper'].status, 'ready');
  assert.strictEqual(result.loops['loop.morning-paper'].receipt.id, 'paper-1');
  assert.strictEqual(result.loops['loop.wiki-maintenance'].status, 'running');
  assert.strictEqual(result.loops['loop.wiki-maintenance'].receipt.provenance, undefined);
  assert.strictEqual(result.loops['loop.weekly-ai'].status, 'needs_review');
  assert.strictEqual(result.loops['loop.outcome-review'].status, 'needs_review');
  assert.strictEqual(result.loops['loop.outcome-review'].metrics.dueCount, 2);
  assert.ok(receiptQueries.some(query => query['provenance.maintenanceRunId'] === '64f600000000000000000003'));
  assert.ok(receiptQueries.some(query => query['provenance.pageId'] === pageId));
  assert.ok(observedSorts.some(sort => sort['createdFrom.label'] === -1));

  const quiet = await buildSystemLoopStatus({
    userId,
    now,
    models: {
      WikiMaintenanceRun: modelWithLatest(null),
      WikiBriefingCache: modelWithLatest(null),
      MorningPaperDelivery: modelWithLatest(null),
      WikiPage: { findOne: () => new Query(null), countDocuments: () => Promise.resolve(0) },
      NoeisReceipt: receiptModel([])
    }
  });
  LOOP_IDS.forEach(id => assert.strictEqual(quiet.loops[id].status, 'idle'));

  assert.strictEqual(buildMaintenanceState({ run: { status: 'completed' } }).status, 'ready');
  assert.strictEqual(buildMaintenanceState({ run: { status: 'future_status' } }).status, 'error');
  assert.strictEqual(buildMaintenanceState({ run: { status: '' } }).status, 'error');

  await assert.rejects(() => buildSystemLoopStatus({ models: {} }), /userId is required/);
  console.log('systemLoopStatusService tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
