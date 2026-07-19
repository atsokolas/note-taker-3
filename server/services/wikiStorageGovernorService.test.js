const assert = require('assert');
const {
  buildOperationalRetentionPlan,
  collectObjectIds,
  runWikiStorageGovernor
} = require('./wikiStorageGovernorService');

const ids = {
  runRevision: '507f1f77bcf86cd799439011',
  runDelete: '507f1f77bcf86cd799439012',
  runReceipt: '507f1f77bcf86cd799439013',
  runProof: '507f1f77bcf86cd799439014',
  eventAccepted: '507f1f77bcf86cd799439021',
  eventDelete: '507f1f77bcf86cd799439022',
  eventRevision: '507f1f77bcf86cd799439023',
  eventRun: '507f1f77bcf86cd799439024'
};

assert.deepStrictEqual(
  [...collectObjectIds({ nested: [ids.runReceipt, 'not-an-id'] })],
  [ids.runReceipt]
);
assert.deepStrictEqual(buildOperationalRetentionPlan({
  candidates: [{ _id: ids.runRevision }, { _id: ids.runDelete }],
  referencedIds: [ids.runRevision]
}), {
  protectedIds: [ids.runRevision],
  deleteIds: [ids.runDelete]
});

class Query {
  constructor(rows) { this.rows = rows; this.max = 0; }
  select() { return this; }
  sort() { return this; }
  limit(value) { this.max = value; return this; }
  lean() { return Promise.resolve(this.max ? this.rows.slice(0, this.max) : this.rows); }
  then(resolve, reject) { return this.lean().then(resolve, reject); }
}

const oldRows = values => values.map(_id => ({ _id, createdAt: new Date('2026-05-01T00:00:00.000Z') }));

(async () => {
  const deleted = { runs: [], events: [] };
  const WikiRevision = {
    aggregate: async () => [],
    find(query) {
      if (query.maintenanceRunId) return new Query([{ maintenanceRunId: ids.runRevision }]);
      if (query.sourceEventId) return new Query([{ sourceEventId: ids.eventRevision }]);
      return new Query([]);
    }
  };
  const WikiMaintenanceRun = {
    find(query) {
      if (query.sourceEventId) return new Query([{ sourceEventId: ids.eventRun }]);
      return new Query(oldRows([ids.runRevision, ids.runDelete, ids.runReceipt, ids.runProof]));
    },
    async deleteMany(query) { deleted.runs.push(...query._id.$in); return { deletedCount: query._id.$in.length }; }
  };
  const WikiSourceEvent = {
    find: () => new Query(oldRows([
      ids.eventAccepted,
      ids.eventDelete,
      ids.eventRevision,
      ids.eventRun
    ])),
    async deleteMany(query) { deleted.events.push(...query._id.$in); return { deletedCount: query._id.$in.length }; }
  };
  const WikiPage = {
    find: () => new Query([{
      freshness: { acceptedThrough: { sourceEventId: ids.eventAccepted } },
      publicProof: { acceptedClocks: [], acceptanceSnapshot: { maintenanceRunId: ids.runProof } }
    }])
  };
  const NoeisReceipt = {
    find: () => new Query([{ provenance: { maintenanceRunId: ids.runReceipt } }])
  };
  const db = {
    command: async () => ({ dataSize: 400 * 1024 * 1024, indexSize: 30 * 1024 * 1024 })
  };
  const result = await runWikiStorageGovernor({
    models: { WikiRevision, WikiMaintenanceRun, WikiSourceEvent, WikiPage, NoeisReceipt },
    db,
    now: new Date('2026-07-18T00:00:00.000Z'),
    dryRun: false
  });
  assert.strictEqual(result.underPressure, true);
  assert.strictEqual(result.effectiveRetentionDays, 14);
  assert.deepStrictEqual(deleted.runs, [ids.runDelete]);
  assert.deepStrictEqual(deleted.events, [ids.eventDelete]);
  assert.strictEqual(result.maintenanceRuns.protected, 3);
  assert.strictEqual(result.sourceEvents.protected, 3);
  console.log('wikiStorageGovernorService tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
