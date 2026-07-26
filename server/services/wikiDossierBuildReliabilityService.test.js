const assert = require('node:assert/strict');
const {
  BUILD_KIND,
  createDossierBuildRun,
  finishDossierBuildRun,
  recordDossierBuildStage,
  recoverInterruptedDossierBuilds,
  withTransientRetries
} = require('./wikiDossierBuildReliabilityService');

class FakeRun {
  static records = [];

  constructor(value = {}) {
    Object.assign(this, value);
    this._id = this._id || `run-${FakeRun.records.length + 1}`;
    this.metadata = this.metadata || {};
    this.updatedAt = this.updatedAt || new Date();
  }

  markModified() {}

  async save() {
    this.updatedAt = new Date();
    const index = FakeRun.records.findIndex(row => row._id === this._id);
    const raw = JSON.parse(JSON.stringify(this));
    if (index >= 0) FakeRun.records[index] = raw;
    else FakeRun.records.push(raw);
    return this;
  }

  static find(query = {}) {
    const rows = FakeRun.records.filter(row => (
      row.status === query.status
      && row.trigger === query.trigger
      && row.metadata?.kind === query['metadata.kind']
      && new Date(row.updatedAt) <= new Date(query.updatedAt.$lte)
    ));
    return { lean: async () => rows };
  }

  static async updateOne(query, update) {
    const row = FakeRun.records.find(item => item._id === query._id && item.status === query.status);
    if (row) Object.assign(row, update.$set || {});
  }
}

const run = async () => {
  FakeRun.records = [];
  const page = {
    _id: 'page-1',
    createdFrom: { label: 'company-dossier:DE' },
    aiState: { build: { lastCompletedStage: 'parse_filings' } }
  };
  const build = await createDossierBuildRun({
    WikiMaintenanceRun: FakeRun,
    page,
    userId: 'user-1',
    resume: true,
    now: new Date('2026-07-26T12:00:00Z')
  });
  assert.equal(build.status, 'running');
  assert.equal(build.metadata.kind, BUILD_KIND);
  assert.equal(build.metadata.resumedFromStage, 'parse_filings');

  await recordDossierBuildStage({
    run: build,
    stage: 'claims_built',
    summary: '24 claims extracted.',
    details: { claimCount: 24 },
    now: new Date('2026-07-26T12:00:05Z')
  });
  assert.equal(build.metadata.lastStage, 'claims_built');
  assert.equal(build.metadata.stages.at(-1).claimCount, 24);

  await finishDossierBuildRun({
    run: build,
    status: 'completed',
    now: new Date('2026-07-26T12:00:06Z')
  });
  assert.equal(build.status, 'completed');

  let attempts = 0;
  const value = await withTransientRetries({
    attempts: 3,
    delaysMs: [0, 0],
    operation: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('temporary');
      return 'ok';
    }
  });
  assert.equal(value, 'ok');
  assert.equal(attempts, 3);

  let permanentAttempts = 0;
  await assert.rejects(() => withTransientRetries({
    attempts: 3,
    delaysMs: [0, 0],
    operation: async () => {
      permanentAttempts += 1;
      const error = new Error('unsupported');
      error.statusCode = 422;
      throw error;
    }
  }), /unsupported/);
  assert.equal(permanentAttempts, 1);

  FakeRun.records.push({
    _id: 'run-interrupted',
    userId: 'user-1',
    pageId: 'page-1',
    status: 'running',
    trigger: 'manual',
    metadata: { kind: BUILD_KIND, lastStage: 'model_drafting' },
    updatedAt: '2026-07-26T11:55:00Z'
  });
  const pageUpdates = [];
  const recovered = await recoverInterruptedDossierBuilds({
    WikiMaintenanceRun: FakeRun,
    WikiPage: { updateOne: async (query, update) => pageUpdates.push({ query, update }) },
    now: new Date('2026-07-26T12:00:00Z'),
    graceMs: 30000
  });
  assert.equal(recovered.recovered, 1);
  assert.equal(pageUpdates[0].update.$set['aiState.errorCode'], 'WIKI_BUILD_INTERRUPTED');
  assert.match(pageUpdates[0].update.$set['aiState.lastError'], /Resume it/);
};

run()
  .then(() => console.log('wikiDossierBuildReliabilityService tests passed'))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
