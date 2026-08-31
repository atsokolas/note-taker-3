const assert = require('assert');
const { inferBornAt } = require('./backfill_judgment_birth_dates');

assert.strictEqual(inferBornAt({
  page: { judgment: { bornAt: '2026-01-02' }, createdAt: '2026-01-01' }
}).source, 'bornAt');
assert.strictEqual(inferBornAt({
  page: { judgment: { startedAt: '2026-01-02' }, createdAt: '2026-01-01' }
}).source, 'startedAt');
assert.strictEqual(inferBornAt({
  page: { judgment: {}, createdAt: '2026-01-01' },
  revisions: [
    { createdAt: '2026-01-03', after: { judgment: { currentJudgment: 'Held.' } } },
    { createdAt: '2026-01-02', after: { judgment: { currentJudgment: '' } } }
  ]
}).source, 'firstRevision');
assert.strictEqual(inferBornAt({ page: { judgment: {}, createdAt: '2026-01-01' } }).source, 'pageCreatedAt');
console.log('backfill_judgment_birth_dates tests passed');
