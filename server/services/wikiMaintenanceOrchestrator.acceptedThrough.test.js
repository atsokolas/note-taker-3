const assert = require('assert');
const { buildAcceptedThrough, createPageForEvent, findAffectedPages } = require('./wikiMaintenanceOrchestrator');

(async () => {
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

  let created = 0;
  const affected = await findAffectedPages({
    WikiPage: {
      find() {
        return {
          limit() {
            return Promise.resolve([
              { _id: 'weekend-page', createdFrom: { label: 'weekend-readings:owner:2026-07-01:2026-07-14' } },
              { _id: 'normal-page', createdFrom: { label: 'ordinary-page' } }
            ]);
          }
        };
      }
    },
    userId: 'user-1',
    event: { affectedPageIds: ['weekend-page', 'normal-page'] }
  });
  assert.deepStrictEqual(affected.map(page => page._id), ['normal-page']);

  await assert.rejects(
    () => createPageForEvent({
      WikiPage: function WikiPage() { created += 1; },
      userId: 'user-1',
      event: { title: 'weekend-readings:attacker:2026-07-01:2026-07-14' }
    }),
    /human-owned publication workflow/
  );
  assert.strictEqual(created, 0);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

console.log('wikiMaintenanceOrchestrator accepted-through tests passed');
