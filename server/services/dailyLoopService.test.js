const assert = require('assert');
const {
  diffRevisionClaims,
  selectDailyClaimCheckIn,
  listWatching,
  activeClaim,
  recordClaimCheckIn,
  buildWatcherLeads,
  buildDailyLoopBriefing
} = require('./dailyLoopService');
const { __testables: maintenanceTestables } = require('./wikiMaintenanceService');
const { User, WikiPage } = require('../models');

const revision = {
  before: { claims: [
    { claimId: 'c1', text: 'Claim one', support: 'partial', sourceRefIds: ['s1', 's2'] },
    { claimId: 'c2', text: 'Retired', support: 'supported', checkInStatus: 'retired', retiredAt: '2026-07-01' }
  ] },
  after: { claims: [
    { claimId: 'c1', text: 'Claim one', support: 'conflicted', sourceRefIds: ['s1', 's2', 's3'] },
    { claimId: 'c2', text: 'Retired', support: 'supported', checkInStatus: 'retired', retiredAt: '2026-07-01' }
  ] }
};

const impacts = diffRevisionClaims(revision);
assert.deepStrictEqual(impacts.map(row => row.claimId), ['c1']);
assert.strictEqual(impacts[0].beforeSupport, 'partial');
assert.strictEqual(impacts[0].afterSupport, 'conflicted');
assert.strictEqual(activeClaim(revision.after.claims[1]), false);

const pages = [{
  _id: 'p1', title: 'Page one', slug: 'page-one', lastVisitedAt: '2026-07-18',
  claims: [
    { claimId: 'thin', text: 'Thin', sourceRefIds: ['s1'], checkInStatus: 'unreviewed' },
    { claimId: 'eligible', text: 'Eligible claim', support: 'partial', sourceRefIds: ['s1', 's2'], checkInStatus: 'unreviewed', createdAt: '2026-01-01' },
    { claimId: 'retired', text: 'Retired claim', sourceRefIds: ['s1', 's2'], checkInStatus: 'retired', retiredAt: '2026-07-01' }
  ],
  externalWatches: {
    edgar: { status: 'active', ticker: 'NVDA', lastAccessionNumber: '0001', lastFilingAt: '2026-07-19' },
    reading: { status: 'active', label: 'Example', lastItemTitle: 'New post' }
  }
}];

const selected = selectDailyClaimCheckIn({ pages, watcherLeads: [], now: new Date('2026-07-19T12:00:00Z').getTime() });
assert.strictEqual(selected.claimId, 'eligible');
assert.strictEqual(listWatching(pages).length, 2);
assert.match(listWatching(pages)[0].label, /EDGAR/);

const retiredPrior = {
  claimId: 'retired-stable',
  text: 'Original retired proposition',
  support: 'partial',
  checkInStatus: 'retired',
  retiredAt: '2026-07-01T00:00:00.000Z',
  sourceRefIds: ['s1', 's2'],
  history: [{ event: 'retired', action: 'retired', support: 'partial', text: 'Original retired proposition' }]
};
const protectedLedger = maintenanceTestables.buildClaimLedger({
  claims: [{ claimId: 'retired-stable', text: 'Agent silently rewrote it', support: 'supported', sourceRefIds: ['s1', 's2', 's3'] }],
  previousClaims: [retiredPrior],
  now: new Date('2026-07-19T12:00:00Z')
});
assert.strictEqual(protectedLedger[0].text, 'Original retired proposition');
assert.strictEqual(protectedLedger[0].checkInStatus, 'retired');
assert.strictEqual(protectedLedger[0].history[0].action, 'retired');

const retainedWhenMissing = maintenanceTestables.buildClaimLedger({ claims: [], previousClaims: [retiredPrior] });
assert.strictEqual(retainedWhenMissing.length, 1);
assert.strictEqual(retainedWhenMissing[0].claimId, 'retired-stable');

const newUser = new User({ username: 'daily-loop-schema-qa', password: 'not-used' });
assert.strictEqual(newUser.morningPaper.enabled, false);
assert.strictEqual(newUser.morningPaper.timezone, 'UTC');
const schemaPage = new WikiPage({
  userId: '507f1f77bcf86cd799439012',
  title: 'Schema QA',
  slug: 'schema-qa',
  claims: [{ claimId: 'c1', text: 'A sourced claim', sourceRefIds: ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014'] }],
  externalWatches: { reading: { feedUrl: 'https://example.com/feed.xml', status: 'active' } }
});
assert.strictEqual(schemaPage.validateSync(), undefined);
assert.strictEqual(schemaPage.claims[0].checkInStatus, 'unreviewed');
assert.strictEqual(schemaPage.externalWatches.reading.status, 'active');

class FakeRevision {
  constructor(value) { Object.assign(this, value); this._id = 'revision-1'; }
  async save() { return this; }
}

(async () => {
  const queryOf = (value) => {
    const query = {
      sort: () => query,
      limit: () => query,
      select: () => query,
      lean: async () => value
    };
    return query;
  };
  const watcherLeads = await buildWatcherLeads({
    userId: 'u1',
    since: '2026-07-18T00:00:00Z',
    models: {
      WikiSourceEvent: { find: () => queryOf([{ _id: 'e1', userId: 'u1', provider: 'sec-edgar', title: 'NVDA filed a 10-Q', status: 'processed', affectedPageIds: ['p1'], createdAt: '2026-07-19' }]) },
      WikiPage: { find: () => queryOf([{ _id: 'p1', title: 'Nvidia dossier', slug: 'nvidia' }]) },
      WikiRevision: { find: () => queryOf([{ ...revision, sourceEventId: 'e1', createdAt: '2026-07-19' }]) },
      WikiMaintenanceRun: { find: () => queryOf([{ sourceEventId: 'e1', status: 'completed', createdAt: '2026-07-19' }]) }
    }
  });
  assert.strictEqual(watcherLeads[0].page.title, 'Nvidia dossier');
  assert.strictEqual(watcherLeads[0].maintenanceStatus, 'completed');
  assert.deepStrictEqual(watcherLeads[0].claimImpacts.map(row => row.claimId), ['c1']);
  assert.match(watcherLeads[0].impactSummary, /1 claim touched/);

  const cachedBriefing = {
    generatedAt: '2026-07-19T12:00:00.000Z',
    window: {
      since: '2026-07-19T08:00:00.000Z',
      through: '2026-07-19T12:00:00.000Z',
      cursorAdvancedBy: 'morning_paper_open'
    },
    lead: { eventId: 'event-cached' },
    watching: [{ id: 'watch-cached' }]
  };
  let cursorUpdates = 0;
  const reused = await buildDailyLoopBriefing({
    userId: 'u1',
    now: new Date('2026-07-19T12:01:00.000Z'),
    advanceCursor: true,
    models: {
      User: {
        findById: async () => ({ _id: 'u1', morningPaper: { lastOpenedAt: '2026-07-19T12:00:00.000Z' } }),
        updateOne: async () => { cursorUpdates += 1; }
      },
      WikiBriefingCache: { findOne: async () => ({ payload: cachedBriefing, generatedAt: cachedBriefing.generatedAt }) }
    }
  });
  assert.strictEqual(reused.briefing.lead.eventId, 'event-cached');
  assert.strictEqual(cursorUpdates, 0);

  const storedPage = {
    _id: 'p1', userId: 'u1', title: 'Page one', claims: [{
      claimId: 'c1', text: 'Claim one', support: 'partial', checkInStatus: 'unreviewed',
      sourceRefIds: ['s1', 's2'], citationIds: [], contradictedByCitationIds: [], history: [], createdAt: new Date('2026-01-01')
    }],
    toObject() { return JSON.parse(JSON.stringify(this)); },
    async save() { return this; }
  };
  const storedUser = {
    _id: 'u1', morningPaper: { timezone: 'UTC', checkInStreak: 0, lastCheckInLocalDate: '' },
    async save() { return this; }
  };
  const models = {
    WikiPage: { findOne: async () => storedPage },
    WikiRevision: FakeRevision,
    User: { findById: async () => storedUser }
  };
  const retired = await recordClaimCheckIn({
    models, userId: 'u1', pageId: 'p1', claimId: 'c1', action: 'retired', now: new Date('2026-07-19T12:00:00Z')
  });
  assert.strictEqual(retired.claim.checkInStatus, 'retired');
  assert.strictEqual(retired.claim.history.at(-1).action, 'retired');
  await assert.rejects(
    () => recordClaimCheckIn({ models, userId: 'u1', pageId: 'p1', claimId: 'c1', action: 'reaffirmed' }),
    /explicitly restored/
  );
  const restored = await recordClaimCheckIn({
    models, userId: 'u1', pageId: 'p1', claimId: 'c1', action: 'restored', now: new Date('2026-07-20T12:00:00Z')
  });
  assert.strictEqual(restored.claim.checkInStatus, 'unreviewed');
  assert.strictEqual(restored.claim.history.at(-1).action, 'restored');
  console.log('dailyLoopService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
