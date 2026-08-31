#!/usr/bin/env node
/*
 * Give legacy held sentences an honest birth date.
 *
 * Dry-run is the default. `--apply` is intentionally required because this
 * touches user casebooks. The clock comes from, in order: the existing born
 * date, the legacy started date, the first retained revision containing a held
 * sentence, then page creation. The report says which fallback was used.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const inferBornAt = ({ page, revisions = [] } = {}) => {
  if (page?.judgment?.bornAt) return { at: new Date(page.judgment.bornAt), source: 'bornAt' };
  if (page?.judgment?.startedAt) return { at: new Date(page.judgment.startedAt), source: 'startedAt' };
  const first = revisions
    .filter(revision => String(revision?.after?.judgment?.currentJudgment || '').trim())
    .sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0))[0];
  if (first?.createdAt) return { at: new Date(first.createdAt), source: 'firstRevision' };
  return page?.createdAt ? { at: new Date(page.createdAt), source: 'pageCreatedAt' } : null;
};

const run = async ({ WikiPage, WikiRevision, apply = false, userId = '' } = {}) => {
  const query = {
    'judgment.currentJudgment': { $type: 'string', $ne: '' },
    'judgment.bornAt': null,
    ...(userId ? { userId } : {})
  };
  const pages = await WikiPage.find(query).select('_id userId title createdAt judgment.bornAt judgment.startedAt').lean();
  const report = [];
  for (const page of pages) {
    const revisions = await WikiRevision.find({ userId: page.userId, pageId: page._id })
      .select('createdAt after.judgment.currentJudgment')
      .sort({ createdAt: 1 })
      .lean();
    const inferred = inferBornAt({ page, revisions });
    if (!inferred || Number.isNaN(inferred.at.getTime())) continue;
    if (apply) {
      await WikiPage.updateOne(
        { _id: page._id, userId: page.userId, 'judgment.bornAt': null },
        { $set: { 'judgment.bornAt': inferred.at } }
      );
    }
    report.push({ pageId: String(page._id), title: page.title, bornAt: inferred.at.toISOString(), source: inferred.source });
  }
  return report;
};

if (require.main === module) {
  (async () => {
    const apply = process.argv.includes('--apply');
    const userIndex = process.argv.indexOf('--user');
    const userId = userIndex >= 0 ? String(process.argv[userIndex + 1] || '') : '';
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
    const { WikiPage, WikiRevision } = require('../server/models');
    const report = await run({ WikiPage, WikiRevision, apply, userId });
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', count: report.length, report }, null, 2));
  })()
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
}

module.exports = { inferBornAt, run };
