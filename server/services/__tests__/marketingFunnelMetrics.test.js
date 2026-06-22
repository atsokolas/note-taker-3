const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { hashValue } = require('../../utils/analytics');
const {
  buildMarketingFunnelSnapshot,
  buildMarketingFunnelSeries
} = require('../marketingFunnelMetrics');

const writeAnalyticsLog = async ({ filePath, entries = [] }) => {
  const lines = entries.map((entry) => `${JSON.stringify(entry)}\n`).join('');
  await fs.writeFile(filePath, lines, 'utf8');
};

const run = async () => {
  const filePath = path.join(os.tmpdir(), `marketing-funnel-${Date.now()}.jsonl`);
  const userId = 'user-42';
  const userIdHash = hashValue(userId);

  await writeAnalyticsLog({
    filePath,
    entries: [
      {
        event: 'marketing_signup_viewed',
        timestamp: '2026-04-18T10:00:00.000Z',
        source: 'backend',
        actor: { visitorId: 'visitor-1', userIdHash: '' },
        properties: {
          entry: 'ai-second-brain',
          pageType: 'guide',
          utmSource: 'google',
          utmMedium: 'organic'
        }
      },
      {
        event: 'marketing_signup_viewed',
        timestamp: '2026-04-19T09:30:00.000Z',
        source: 'backend',
        actor: { visitorId: 'visitor-2', userIdHash: '' },
        properties: {
          entry: 'readwise-is-not-a-second-brain',
          pageType: 'guide',
          utmSource: 'google',
          utmMedium: 'organic'
        }
      },
      {
        event: 'marketing_signup_started',
        timestamp: '2026-04-18T10:02:00.000Z',
        source: 'backend',
        actor: { visitorId: 'visitor-1', userIdHash: '' },
        properties: {
          entry: 'ai-second-brain',
          pageType: 'guide',
          utmSource: 'google',
          utmMedium: 'organic'
        }
      },
      {
        event: 'user_signup',
        timestamp: '2026-04-18T10:04:00.000Z',
        source: 'backend',
        actor: { userIdHash },
        properties: {
          visitorId: 'visitor-1',
          entry: 'ai-second-brain',
          pageType: 'guide',
          utmSource: 'google',
          utmMedium: 'organic'
        }
      },
      {
        event: 'capture_completed',
        timestamp: '2026-04-18T11:00:00.000Z',
        source: 'backend',
        actor: { userIdHash },
        properties: {}
      },
      {
        event: 'concept_created',
        timestamp: '2026-04-18T12:00:00.000Z',
        source: 'backend',
        actor: { userIdHash },
        properties: {}
      },
      {
        event: 'wiki_page_created',
        timestamp: '2026-04-18T12:30:00.000Z',
        source: 'backend',
        actor: { userIdHash },
        properties: {
          pageType: 'source',
          sourceCount: 1
        }
      },
      {
        event: 'wiki_shared_adopted',
        timestamp: '2026-04-18T12:45:00.000Z',
        source: 'backend',
        actor: { userIdHash },
        properties: {
          originType: 'starter_pack',
          packId: 'mental-models',
          pageCount: 6
        }
      }
    ]
  });

  const snapshot = await buildMarketingFunnelSnapshot({
    analyticsLogPath: filePath,
    days: 120
  });

  assert.strictEqual(snapshot.totals.signupViewed, 2, 'Should count signup views.');
  assert.strictEqual(snapshot.totals.signupStarted, 1, 'Should count signup starts.');
  assert.strictEqual(snapshot.totals.signupsCompleted, 1, 'Should count completed signups.');
  assert.strictEqual(snapshot.totals.activatedUsers, 1, 'Should count activated marketing signups.');
  assert.strictEqual(snapshot.totals.wikiPageCreated, 1, 'Should count wiki page activation milestones.');
  assert.strictEqual(snapshot.totals.wikiSharedAdopted, 1, 'Should count shared wiki adoption milestones.');
  assert.strictEqual(snapshot.byEntry[0].entry, 'ai-second-brain', 'Entry should be grouped.');
  assert.strictEqual(snapshot.byEntry[0].signupViewed, 1, 'Entry should count signup views.');
  assert.strictEqual(snapshot.byEntry[0].activatedUsers, 1, 'Entry should count activated users.');
  assert.strictEqual(snapshot.byEntry[0].wikiPageCreated, 1, 'Entry should count wiki page milestones.');
  assert.strictEqual(snapshot.byEntry[0].wikiSharedAdopted, 1, 'Entry should count shared wiki adoption milestones.');
  assert.strictEqual(snapshot.bySource[0].utmSource, 'google', 'UTM source grouping should be preserved.');
  assert.strictEqual(snapshot.bySource[0].utmMedium, 'organic', 'UTM medium grouping should be preserved.');
  assert.strictEqual(snapshot.bySource[0].signupsCompleted, 1, 'UTM grouping should count signups.');

  const series = await buildMarketingFunnelSeries({
    analyticsLogPath: filePath,
    days: 120
  });

  const april18 = series.series.find((bucket) => bucket.date === '2026-04-18');
  const april19 = series.series.find((bucket) => bucket.date === '2026-04-19');
  assert.ok(april18, 'Series should include April 18.');
  assert.ok(april19, 'Series should include April 19.');
  assert.strictEqual(april18.totals.signupsCompleted, 1, 'Series should count daily signups.');
  assert.strictEqual(april18.totals.activatedUsers, 1, 'Series should count daily activation.');
  assert.strictEqual(april18.totals.wikiPageCreated, 1, 'Series should count daily wiki page milestones.');
  assert.strictEqual(april18.totals.wikiSharedAdopted, 1, 'Series should count daily shared wiki adoption milestones.');
  assert.strictEqual(april19.totals.signupViewed, 1, 'Series should count daily signup views.');
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('marketing funnel metrics test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
