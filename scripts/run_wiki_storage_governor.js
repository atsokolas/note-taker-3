#!/usr/bin/env node
require('dotenv').config();

const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const {
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  NoeisReceipt
} = require('../server/models');
const { runWikiStorageGovernor } = require('../server/services/wikiStorageGovernorService');
const {
  findVerifiedMongoBackup,
  writeVerifiedMongoBackup
} = require('../server/services/mongoBackupService');

const hasFlag = flag => process.argv.includes(flag);
const numberArg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : Number(fallback);
  return Number.isFinite(value) ? value : Number(fallback);
};
const stringArg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '') : String(fallback || '');
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  const apply = hasFlag('--apply');
  const backupPlan = hasFlag('--backup-plan');
  const revisionsOnly = hasFlag('--revisions-only');
  if (apply && process.env.APPLY_WIKI_STORAGE_GOVERNOR !== 'YES') {
    throw new Error('Refusing storage retention write. Set APPLY_WIKI_STORAGE_GOVERNOR=YES after reviewing the dry-run.');
  }
  const backupDir = path.resolve(stringArg(
    '--backup-dir',
    process.env.NOEIS_MONGO_BACKUP_DIR
      || path.join(os.homedir(), '.codex', 'backups', 'noeis', 'wiki-storage')
  ));
  const backupRows = async ({ kind, Model, ids, manifest = {}, batchSize = 100 }) => {
    const existing = backupPlan && !apply
      ? await findVerifiedMongoBackup({ outputDir: backupDir, prefix: kind, expectedIds: ids })
      : null;
    return existing || writeVerifiedMongoBackup({
      Model,
      ids,
      outputDir: backupDir,
      prefix: kind,
      manifest: { collection: Model?.collection?.collectionName || kind, ...manifest },
      batchSize
    });
  };
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await runWikiStorageGovernor({
    models: {
      WikiPage,
      WikiRevision,
      NoeisReceipt,
      ...(revisionsOnly ? {} : { WikiSourceEvent, WikiMaintenanceRun })
    },
    db: mongoose.connection.db,
    retentionDays: numberArg('--retention-days', process.env.WIKI_STORAGE_RETENTION_DAYS || 45),
    pressureRetentionDays: numberArg('--pressure-retention-days', process.env.WIKI_STORAGE_PRESSURE_RETENTION_DAYS || 14),
    recentRevisionLimit: numberArg('--recent-revision-limit', process.env.WIKI_STORAGE_RECENT_REVISION_LIMIT || 20),
    pressureRecentRevisionLimit: numberArg('--pressure-recent-revision-limit', process.env.WIKI_STORAGE_PRESSURE_RECENT_REVISION_LIMIT || 5),
    highWaterBytes: numberArg('--high-water-bytes', process.env.WIKI_STORAGE_HIGH_WATER_BYTES || 420 * 1024 * 1024),
    batchSize: numberArg('--batch-size', process.env.WIKI_STORAGE_GOVERNOR_BATCH_SIZE || 2500),
    revisionPageLimit: numberArg('--revision-page-limit', process.env.WIKI_STORAGE_REVISION_PAGE_LIMIT || 10),
    dryRun: !apply,
    backupDryRun: backupPlan && !apply,
    backupRevisionSnapshots: (apply || backupPlan)
      ? ({ revisionIds, pageId, userId, compactableSnapshotBytes }) => backupRows({
        kind: `wiki-revisions-${pageId}`,
        Model: WikiRevision,
        ids: revisionIds,
        manifest: { pageId, userId, compactableSnapshotBytes },
        batchSize: 1
      })
      : null,
    backupOperationalRows: (apply || backupPlan)
      ? ({ kind, Model, ids, cutoff }) => backupRows({
        kind,
        Model,
        ids,
        manifest: { cutoff }
      })
      : null
  });
  console.log(JSON.stringify({
    scope: revisionsOnly ? 'revisions_only' : 'revisions_and_operational_history',
    ...result
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
