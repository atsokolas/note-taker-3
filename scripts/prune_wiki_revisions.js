#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');
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

const verifyBackup = async (filename, expectedIds) => {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filename);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', resolve);
    input.on('error', reject);
  });
  const ids = new Set();
  let manifest = null;
  const lines = readline.createInterface({ input: fs.createReadStream(filename).pipe(zlib.createGunzip()) });
  for await (const line of lines) {
    const parsed = JSON.parse(line);
    if (parsed.type === 'manifest') manifest = parsed;
    if (parsed.type === 'revision') ids.add(String(parsed.document?._id || ''));
  }
  const missing = expectedIds.filter((id) => !ids.has(id));
  if (!manifest || ids.size < expectedIds.length || missing.length) {
    throw new Error(`Backup verification failed: documents=${ids.size}, missing=${missing.length}.`);
  }
  return {
    filename,
    documentCount: ids.size,
    compressedBytes: fs.statSync(filename).size,
    sha256: hash.digest('hex')
  };
};

const writeBackup = async ({ query, manifest, outputDir }) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(outputDir, `wiki-revisions-${stamp}.jsonl.gz`);
  const destination = fs.createWriteStream(filename, { flags: 'wx', mode: 0o600 });
  const gzip = zlib.createGzip({ level: 9 });
  const completed = new Promise((resolve, reject) => {
    destination.on('close', resolve);
    destination.on('error', reject);
    gzip.on('error', reject);
  });
  gzip.pipe(destination);
  const writeLine = async (value) => {
    if (!gzip.write(`${JSON.stringify(value)}\n`)) {
      await new Promise((resolve) => gzip.once('drain', resolve));
    }
  };
  await writeLine({ type: 'manifest', ...manifest });
  let documentCount = 0;
  for await (const revision of WikiRevision.find(query).lean().cursor({ batchSize: 5 })) {
    await writeLine({ type: 'revision', document: revision });
    documentCount += 1;
  }
  gzip.end();
  await completed;

  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filename);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', resolve);
    input.on('error', reject);
  });

  let verifiedDocuments = 0;
  let lineNumber = 0;
  const lines = readline.createInterface({ input: fs.createReadStream(filename).pipe(zlib.createGunzip()) });
  for await (const line of lines) {
    lineNumber += 1;
    const parsed = JSON.parse(line);
    if (lineNumber === 1 && parsed.type !== 'manifest') throw new Error('Backup manifest missing.');
    if (parsed.type === 'revision') verifiedDocuments += 1;
  }
  if (verifiedDocuments !== documentCount) throw new Error('Backup verification count mismatch.');

  return {
    filename,
    documentCount,
    compressedBytes: fs.statSync(filename).size,
    sha256: hash.digest('hex')
  };
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

  const outputDir = path.resolve(__dirname, '../output/wiki-revision-prune-2026-07-14');
  const backup = suppliedBackup
    ? await verifyBackup(path.resolve(suppliedBackup), plan.deletedIds)
    : await writeBackup({ query, manifest: { ...report, plan }, outputDir });
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
