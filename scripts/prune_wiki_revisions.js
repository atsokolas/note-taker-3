#!/usr/bin/env node
require('dotenv').config();

const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const {
  WikiPage,
  WikiRevision,
  WikiRepoBaseline,
  NoeisReceipt
} = require('../server/models');
const {
  buildWikiRevisionRetentionPlan,
  collectPageRetentionReferences
} = require('../server/services/wikiRevisionRetentionService');
const {
  verifyMongoBackup,
  writeVerifiedMongoBackup
} = require('../server/services/mongoBackupService');

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
};

const collectObjectIds = (value, found = new Set()) => {
  if (typeof value === 'string') {
    const matches = value.match(/[a-f0-9]{24}/gi) || [];
    matches.forEach((match) => found.add(match.toLowerCase()));
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectObjectIds(item, found));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectObjectIds(item, found));
  }
  return found;
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  const pageId = argValue('--page-id');
  const suppliedBackup = argValue('--backup-file');
  const recentLimit = Number(argValue('--recent-limit') || 20);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  if (!mongoose.isValidObjectId(pageId)) throw new Error('--page-id must be a Mongo ObjectId.');
  if (!Number.isInteger(recentLimit) || recentLimit < 1) throw new Error('--recent-limit must be a positive integer.');

  await mongoose.connect(process.env.MONGODB_URI);
  const page = await WikiPage.findById(pageId).lean();
  if (!page) throw new Error('Wiki page not found.');
  const revisions = await WikiRevision.find({ userId: page.userId, pageId })
    .select('_id createdAt promotionStatus sourceEventId sourceVersion')
    .sort({ createdAt: -1 })
    .lean();
  const pageReferences = collectPageRetentionReferences(page);
  const protectedIds = new Set(pageReferences.revisionIds);
  const baseline = await WikiRepoBaseline.findOne({ userId: page.userId, pageId }).select('revisionId').lean();
  if (baseline?.revisionId) protectedIds.add(String(baseline.revisionId));
  const receipts = await NoeisReceipt.find({ userId: page.userId }).select('provenance').lean();
  const receiptRevisionIds = new Set();
  const revisionIds = new Set(revisions.map((revision) => String(revision._id)));
  receipts.forEach((receipt) => collectObjectIds(receipt.provenance).forEach((id) => {
    if (revisionIds.has(id)) receiptRevisionIds.add(id);
  }));

  const plan = buildWikiRevisionRetentionPlan({
    revisions,
    protectedRevisionIds: [...protectedIds],
    acceptedSourceEventIds: pageReferences.sourceEventIds,
    publishedHeadSha: pageReferences.publishedHeadSha,
    recentLimit
  });
  const deleteObjectIds = plan.deletedIds.map((id) => new mongoose.Types.ObjectId(id));
  const query = { userId: page.userId, pageId: page._id, _id: { $in: deleteObjectIds } };
  const removableIds = plan.deletedIds.filter((id) => !receiptRevisionIds.has(id));
  const compactableIds = plan.deletedIds.filter((id) => receiptRevisionIds.has(id));
  const [size] = deleteObjectIds.length
    ? await WikiRevision.aggregate([
      { $match: query },
      { $group: { _id: null, bytes: { $sum: { $bsonSize: '$$ROOT' } }, count: { $sum: 1 } } }
    ])
    : [{ bytes: 0, count: 0 }];
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    page: { id: String(page._id), userId: String(page.userId), title: page.title },
    policy: { recentLimit, original: true, monthlyCheckpoints: true, referencedRevisions: true },
    before: plan.total,
    keep: plan.keptIds.length,
    deleteUnreferencedRevisions: removableIds.length,
    pruneReferencedSnapshots: compactableIds.length,
    estimatedSnapshotDocumentBytes: size?.bytes || 0,
    protectedRevisionIds: [...protectedIds],
    receiptReferencesPreserved: plan.deletedIds.filter((id) => receiptRevisionIds.has(id)).length
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply || !plan.deletedIds.length) return;

  const outputDir = path.resolve(
    process.env.NOEIS_MONGO_BACKUP_DIR
      || path.join(os.homedir(), '.codex', 'backups', 'noeis', 'wiki-revisions')
  );
  const backup = suppliedBackup
    ? await verifyMongoBackup({ filename: path.resolve(suppliedBackup), expectedIds: plan.deletedIds })
    : await writeVerifiedMongoBackup({
      Model: WikiRevision,
      ids: plan.deletedIds,
      outputDir,
      prefix: `wiki-revisions-${pageId}`,
      manifest: { ...report, plan }
    });
  console.log(JSON.stringify({ backup }, null, 2));
  const deleteResult = await WikiRevision.deleteMany({
    userId: page.userId,
    pageId: page._id,
    _id: { $in: removableIds }
  });
  const compactResult = await WikiRevision.updateMany({
    userId: page.userId,
    pageId: page._id,
    _id: { $in: compactableIds }
  }, {
    $set: { before: null, after: null, snapshotPrunedAt: new Date() }
  });
  const remaining = await WikiRevision.countDocuments({ userId: page.userId, pageId });
  const compacted = await WikiRevision.countDocuments({
    userId: page.userId,
    pageId: page._id,
    _id: { $in: compactableIds },
    before: null,
    after: null
  });
  const expectedRemaining = plan.total - removableIds.length;
  if (deleteResult.deletedCount !== removableIds.length
    || compactResult.matchedCount !== compactableIds.length
    || compacted !== compactableIds.length
    || remaining !== expectedRemaining) {
    throw new Error(`Post-prune verification failed: deleted=${deleteResult.deletedCount}, matched=${compactResult.matchedCount}, compacted=${compacted}, remaining=${remaining}.`);
  }
  const dbStats = await mongoose.connection.db.command({ dbStats: 1 });
  console.log(JSON.stringify({ verified: true, revisionsDeleted: deleteResult.deletedCount, snapshotsPruned: compactResult.modifiedCount, revisionRecordsRemaining: remaining, dbStats: {
    dataSize: dbStats.dataSize,
    storageSize: dbStats.storageSize,
    indexSize: dbStats.indexSize
  } }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
