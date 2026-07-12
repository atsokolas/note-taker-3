const assert = require('assert');
const { buildAcceptedThrough } = require('./wikiMaintenanceOrchestrator');

(() => {
  const current = {
    sourceEventId: 'newer-event',
    title: 'GOOGL 8-K filed 2026-06-04',
    sourceUpdatedAt: new Date('2026-06-04T00:00:00.000Z')
  };
  const preserved = buildAcceptedThrough({
    existing: current,
    event: {
      _id: 'older-event',
      title: 'GOOGL 8-K filed 2026-05-21',
      sourceUpdatedAt: new Date('2026-05-21T00:00:00.000Z')
    }
  });
  assert.strictEqual(preserved.sourceEventId, 'newer-event');

  const advanced = buildAcceptedThrough({
    existing: current,
    event: {
      _id: 'newest-event',
      provider: 'sec-edgar',
      title: 'GOOGL 10-Q filed 2026-07-30',
      sourceUpdatedAt: new Date('2026-07-30T00:00:00.000Z')
    },
    acceptedAt: new Date('2026-07-31T00:00:00.000Z')
  });
  assert.strictEqual(advanced.sourceEventId, 'newest-event');
  assert.strictEqual(advanced.title, 'GOOGL 10-Q filed 2026-07-30');
})();

console.log('wikiMaintenanceOrchestrator accepted-through tests passed');
