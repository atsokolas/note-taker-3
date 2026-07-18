#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const {
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  NoeisReceipt
} = require('../server/models');
const { runWikiStorageGovernor } = require('../server/services/wikiStorageGovernorService');

const hasFlag = flag => process.argv.includes(flag);
const numberArg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : Number(fallback);
  return Number.isFinite(value) ? value : Number(fallback);
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  const apply = hasFlag('--apply');
  if (apply && process.env.APPLY_WIKI_STORAGE_GOVERNOR !== 'YES') {
    throw new Error('Refusing storage retention write. Set APPLY_WIKI_STORAGE_GOVERNOR=YES after reviewing the dry-run.');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await runWikiStorageGovernor({
    models: { WikiPage, WikiRevision, WikiSourceEvent, WikiMaintenanceRun, NoeisReceipt },
    db: mongoose.connection.db,
    retentionDays: numberArg('--retention-days', process.env.WIKI_STORAGE_RETENTION_DAYS || 45),
    pressureRetentionDays: numberArg('--pressure-retention-days', process.env.WIKI_STORAGE_PRESSURE_RETENTION_DAYS || 14),
    highWaterBytes: numberArg('--high-water-bytes', process.env.WIKI_STORAGE_HIGH_WATER_BYTES || 420 * 1024 * 1024),
    batchSize: numberArg('--batch-size', process.env.WIKI_STORAGE_GOVERNOR_BATCH_SIZE || 2500),
    revisionPageLimit: numberArg('--revision-page-limit', process.env.WIKI_STORAGE_REVISION_PAGE_LIMIT || 10),
    dryRun: !apply
  });
  console.log(JSON.stringify(result, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
