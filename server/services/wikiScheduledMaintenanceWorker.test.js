const assert = require('assert');
const {
  drainScheduledWikiMaintenance,
  duePageQuery
} = require('./wikiScheduledMaintenanceWorker');

class Query {
  constructor(value) {
    this.value = value;
  }

  sort() {
    return this;
  }

  limit(n) {
    this.value = this.value.slice(0, n);
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const createPageModel = (pages = []) => ({
  find: () => new Query(pages)
});

const createRunModel = () => {
  const records = [];
  function WikiMaintenanceRun(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || `run-${records.length + 1}`;
  }
  WikiMaintenanceRun.records = records;
  WikiMaintenanceRun.prototype.save = async function save() {
    const index = records.findIndex(record => record._id === this._id);
    const snapshot = JSON.parse(JSON.stringify(this));
    if (index >= 0) records[index] = snapshot;
    else records.push(snapshot);
    return this;
  };
  return WikiMaintenanceRun;
};

const createRevisionModel = () => {
  const records = [];
  function WikiRevision(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || `revision-${records.length + 1}`;
  }
  WikiRevision.records = records;
  WikiRevision.prototype.save = async function save() {
    records.push(JSON.parse(JSON.stringify(this)));
    return this;
  };
  return WikiRevision;
};

const createConnectionModel = () => {
  const rows = [];
  return {
    rows,
    deleteMany: async () => ({ deletedCount: 0 }),
    findOneAndUpdate: async (query, update) => {
      rows.push({ query, update });
      return { ...query };
    }
  };
};

const run = async () => {
  const query = duePageQuery({ cutoff: new Date('2026-06-18T00:00:00.000Z') });
  assert.strictEqual(query.status.$ne, 'archived');
  assert.ok(Array.isArray(query.$or));

  const page = {
    _id: 'page-1',
    userId: 'user-1',
    title: 'Opportunity Cost',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Opportunity cost links to Margin of Safety.' }] }] },
    aiState: {},
    saveCount: 0,
    save: async () => {
      page.saveCount += 1;
      return page;
    }
  };
  const WikiMaintenanceRun = createRunModel();
  const WikiRevision = createRevisionModel();
  const Connection = createConnectionModel();
  const result = await drainScheduledWikiMaintenance({
    models: {
      WikiPage: createPageModel([page]),
      WikiMaintenanceRun,
      WikiRevision,
      Connection
    },
    limit: 1,
    maintainWikiPageFn: async ({ page: targetPage, trigger }) => {
      assert.strictEqual(trigger, 'scheduled');
      targetPage.aiState.maintenanceSummary = 'Scheduled refresh completed.';
      targetPage.body = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Opportunity cost links to Margin of Safety.',
            marks: [{ type: 'wikiLink', attrs: { pageId: 'page-margin', title: 'Margin of Safety' } }]
          }]
        }]
      };
      return targetPage;
    },
    now: new Date('2026-06-18T12:00:00.000Z')
  });
  assert.strictEqual(result.processed, 1);
  assert.strictEqual(result.failed, 0);
  assert.strictEqual(result.results[0].saved, true);
  assert.strictEqual(result.results[0].graphSynced, true);
  assert.strictEqual(result.results[0].revisionCreated, true);
  assert.strictEqual(page.saveCount, 1);
  assert.strictEqual(WikiRevision.records.length, 1);
  assert.strictEqual(WikiRevision.records[0].maintenanceRunId, 'run-1');
  assert.strictEqual(WikiRevision.records[0].reason, 'agent_maintenance');
  assert.ok(Connection.rows.length >= 1);
  assert.strictEqual(WikiMaintenanceRun.records.length, 1);
  assert.strictEqual(WikiMaintenanceRun.records[0].status, 'completed');
  assert.strictEqual(WikiMaintenanceRun.records[0].trigger, 'scheduled');

  const rejectedPage = {
    _id: 'page-rejected',
    userId: 'user-1',
    title: 'Trusted Page',
    plainText: 'Trusted body',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Trusted body' }] }] },
    sourceRefs: [{ title: 'Trusted source' }],
    aiState: { quality: { ok: true } },
    freshness: { status: 'fresh' },
    saveCount: 0,
    save: async () => {
      rejectedPage.saveCount += 1;
      return rejectedPage;
    }
  };
  const rejectedRunModel = createRunModel();
  const rejectedRevisionModel = createRevisionModel();
  const rejectedConnections = createConnectionModel();
  const rejected = await drainScheduledWikiMaintenance({
    models: {
      WikiPage: createPageModel([rejectedPage]),
      WikiMaintenanceRun: rejectedRunModel,
      WikiRevision: rejectedRevisionModel,
      Connection: rejectedConnections
    },
    maintainWikiPageFn: async ({ page: targetPage }) => {
      targetPage.plainText = 'Untrusted candidate';
      targetPage.body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Untrusted candidate' }] }] };
      targetPage.sourceRefs = [{ title: 'Candidate source' }];
      targetPage.aiState = {
        quality: {
          ok: false,
          status: 'fail',
          failures: ['Missing developer quickstart evidence.']
        }
      };
      return targetPage;
    }
  });
  assert.strictEqual(rejected.processed, 0);
  assert.strictEqual(rejected.failed, 0);
  assert.strictEqual(rejected.needsReview, 1);
  assert.strictEqual(rejected.results[0].status, 'needs_review');
  assert.strictEqual(rejectedPage.plainText, 'Trusted body');
  assert.deepStrictEqual(rejectedPage.sourceRefs, [{ title: 'Trusted source' }]);
  assert.strictEqual(rejectedPage.freshness.status, 'needs_review');
  assert.strictEqual(rejectedRunModel.records[0].status, 'needs_review');
  assert.strictEqual(rejectedRevisionModel.records.length, 1);
  assert.strictEqual(rejectedRevisionModel.records[0].reason, 'agent_candidate');
  assert.strictEqual(rejectedRevisionModel.records[0].promotionStatus, 'rejected');
  assert.strictEqual(rejectedConnections.rows.length, 0);

  let duplicateMaintainCalls = 0;
  const leasedRepoPage = {
    ...page,
    _id: 'page-repo-leased',
    pageType: 'repo',
    externalWatches: {
      githubRepo: {
        owner: 'atsokolas',
        repo: 'note-taker-3',
        lastHeadSha: 'head-a',
        buildLease: { token: 'active-lease', headSha: 'head-a', expiresAt: new Date(Date.now() + 60000) }
      }
    }
  };
  const leasedRepoModel = {
    find: () => new Query([leasedRepoPage]),
    findOneAndUpdate: async () => null
  };
  const duplicate = await drainScheduledWikiMaintenance({
    models: {
      WikiPage: leasedRepoModel,
      WikiMaintenanceRun: createRunModel()
    },
    maintainWikiPageFn: async () => {
      duplicateMaintainCalls += 1;
      return leasedRepoPage;
    }
  });
  assert.strictEqual(duplicate.skipped, 1);
  assert.strictEqual(duplicateMaintainCalls, 0);

  const failedRunModel = createRunModel();
  const failed = await drainScheduledWikiMaintenance({
    models: {
      WikiPage: createPageModel([{ ...page, _id: 'page-2' }]),
      WikiMaintenanceRun: failedRunModel
    },
    maintainWikiPageFn: async () => {
      throw new Error('model unavailable');
    }
  });
  assert.strictEqual(failed.processed, 0);
  assert.strictEqual(failed.failed, 1);
  assert.strictEqual(failedRunModel.records[0].status, 'failed');
  assert.match(failedRunModel.records[0].errorMessage, /model unavailable/);

  console.log('wikiScheduledMaintenanceWorker tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
