const assert = require('assert');
const { buildJudgmentMirror } = require('./judgmentMirrorService');

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  sort() { return this; }
  lean() { return Promise.resolve(this.value); }
}

(async () => {
  const pages = [
    {
      _id: 'p1', title: 'One', createdAt: '2026-01-01T00:00:00Z',
      judgment: {
        currentJudgment: 'One is true.', status: 'monitoring', bornAt: '2026-08-01T00:00:00Z',
        resolutionCriteria: 'A test', resolutionHorizonAt: '2026-08-15T00:00:00Z', resolutionSetAt: '2026-08-01T00:00:00Z',
        verdicts: []
      }
    },
    {
      _id: 'p2', title: 'Two', createdAt: '2026-07-01T00:00:00Z',
      judgment: {
        currentJudgment: 'Two is true.', status: 'monitoring', bornAt: '2026-08-15T00:00:00Z',
        resolutionCriteria: '', verdicts: [{ verdictId: 'v1', result: 'held_up', recordedAt: '2026-08-20T00:00:00Z' }]
      }
    }
  ];
  const revisions = [{
    pageId: 'p2',
    before: { judgment: { currentJudgment: 'Two was true.' } },
    after: { judgment: { currentJudgment: 'Two is true.' } }
  }];
  const mirror = await buildJudgmentMirror({
    userId: 'u1', now: new Date('2026-08-31T00:00:00Z'),
    WikiPage: { find: () => new Query(pages) },
    WikiRevision: { find: () => new Query(revisions) }
  });
  assert.strictEqual(mirror.metrics.claimsHeld, 2);
  assert.strictEqual(mirror.metrics.averageHoldDays, 23);
  assert.strictEqual(mirror.metrics.revisionRate, 0.5);
  assert.strictEqual(mirror.metrics.verdictRecord.held_up, 1);
  assert.strictEqual(mirror.metrics.counterevidenceResponseDays, null);
  assert.strictEqual(mirror.due.length, 1);
  assert.strictEqual(mirror.coverage.storedBirthDates, 2);
  console.log('judgmentMirrorService tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
