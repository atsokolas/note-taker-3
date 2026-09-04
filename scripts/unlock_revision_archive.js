#!/usr/bin/env node
// One-shot recovery bridge. Dry-run by default; never deletes knowledge or vectors.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mongoose = require('mongoose');
const { serialize } = require('bson');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const { EmbeddingJob, WikiBriefingCache } = require('../server/models');
const { writeVerifiedMongoBackup } = require('../server/services/mongoBackupService');
const LIMIT = 512 * 1024 * 1024;
const identity = row => [row.userId, row.objectType, row.objectId, row.subId || ''].join('|');
const textHash = text => createHash('sha1').update(String(text || '')).digest('hex');
const safeIndex = index => index.name !== '_id_' && !index.unique && !index.sparse
  && !index.partialFilterExpression && !index.collation && index.expireAfterSeconds === undefined
  && Object.values(index.key).every(value => typeof value === 'number');
const coveredBy = (index, other) => safeIndex(index) && other.name !== index.name
  && !other.sparse && !other.partialFilterExpression && !other.collation
  && Object.entries(other.key).length > Object.entries(index.key).length
  && Object.entries(index.key).every(([key, value], i) =>
    Object.entries(other.key)[i]?.[0] === key && Object.entries(other.key)[i]?.[1] === value);
const matchesVector = (job, vectors) => job.status === 'completed' && !job.replayRequired
  && !job.lockedAt && vectors.get(identity({ userId: job.payload?.userId,
    objectType: job.payload?.type, objectId: job.payload?.objectId,
    subId: job.payload?.subId })) === textHash(job.text);
async function clusterUsage(db) {
  const { databases } = await db.admin().listDatabases();
  let bytes = 0;
  for (const { name } of databases) {
    if (['admin', 'local', 'config'].includes(name)) continue;
    const stats = await mongoose.connection.client.db(name).stats();
    bytes += stats.dataSize + stats.indexSize;
  }
  return bytes;
}
async function restoreIndexes(db, filename) {
  const report = JSON.parse(fs.readFileSync(filename));
  for (const row of report.dropped) {
    const keyName = `${row.database || db.databaseName}/${row.collection}/${row.index.name}`;
    if (report.restored.includes(keyName)) continue;
    const { key, v, ns, ...options } = row.index;
    for (let attempt = 0; ; attempt++) {
      try {
        await mongoose.connection.client.db(row.database || db.databaseName)
          .collection(row.collection).createIndex(key, options);
        break;
      } catch (error) {
        if (attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    report.restored.push(keyName);
    fs.writeFileSync(filename, JSON.stringify(report, null, 2), { mode: 0o600 });
  }
  delete report.restoreError;
  report.after = await clusterUsage(db);
  fs.writeFileSync(filename, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ after: report.after, restored: report.restored.length, dropped: report.dropped.length }));
}

async function resume(db, filename) {
  const report = JSON.parse(fs.readFileSync(filename));
  const checkpoint = () => fs.writeFileSync(filename, JSON.stringify(report, null, 2), { mode: 0o600 });
  if (await clusterUsage(db) > LIMIT - 1024 * 1024) {
    // A temporary performance-only bridge: owner-scoped compound indexes still
    // service the same query, with extra filtering. No code hints this index.
    const collection = db.collection('connections');
    const indexes = await collection.indexes();
    const index = indexes.find(row => row.name === 'userId_1_fromType_1_fromId_1_createdAt_-1');
    if (index) {
      assert(safeIndex(index));
      assert(indexes.some(row => row.name !== index.name && Object.keys(row.key)[0] === 'userId'
        && !row.sparse && !row.partialFilterExpression));
      report.dropped.push({ database: db.databaseName, collection: 'connections', index, performanceBridge: true });
      checkpoint(); await collection.dropIndex(index.name);
    }
  }
  // Quota/index accounting can settle after the first estimate. Only indexes on
  // still-empty collections may provide the extra bridge; constraints stay put.
  for (const database of [db.databaseName, 'note-taker']) {
   const target = mongoose.connection.client.db(database);
   for (const { name } of await target.listCollections().toArray()) {
    if (await target.collection(name).countDocuments({}, { limit: 1 })) continue;
    for (const index of await target.collection(name).indexes()) {
      if (!safeIndex(index)) continue;
      if (await target.collection(name).countDocuments({}, { limit: 1 })) break;
      const row = { database, collection: name, index, emptyCollectionBridge: true };
      report.dropped.push(row); checkpoint();
      await target.collection(name).dropIndex(index.name);
    }
   }
  }
  report.resumedBytes = await clusterUsage(db); checkpoint();
  console.log(JSON.stringify({ resumedBytes: report.resumedBytes, dropped: report.dropped.length }));
  const child = spawnSync(process.execPath, [path.join(__dirname, 'archive_wiki_revision_histories.js'), '--apply'],
    { env: { ...process.env, ARCHIVE_LIMIT: '3' }, stdio: 'inherit' });
  // Preserve the manifest on failure: retry the archive, never delete a revision.
  assert.equal(child.status, 0, 'Archive retry blocked; restore definitions retained in report');
  await restoreIndexes(db, filename);
}

async function run() {
  const env = require('dotenv').parse(fs.readFileSync(process.env.NOEIS_ENV_FILE));
  await mongoose.connect(env.MONGODB_URI, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const restoreAt = process.argv.indexOf('--restore');
  if (restoreAt !== -1) {
    assert(process.argv.includes('--apply'), 'Restore requires --apply');
    return restoreIndexes(db, process.argv[restoreAt + 1]);
  }
  const resumeAt = process.argv.indexOf('--resume');
  if (resumeAt !== -1) {
    assert(process.argv.includes('--apply'), 'Resume requires --apply');
    return resume(db, process.argv[resumeAt + 1]);
  }
  const apply = process.argv.includes('--apply');
  const metrics = () => clusterUsage(db);
  const before = await metrics();
  const vectors = new Map((await db.collection('vectoritems').find({}, { projection:
    { userId: 1, objectType: 1, objectId: 1, subId: 1, contentHash: 1 } }).toArray())
    .map(row => [identity(row), row.contentHash]));
  const jobs = (await db.collection('embeddingjobs').find({ status: 'completed',
    replayRequired: { $ne: true }, lockedAt: null }).toArray()).filter(job => matchesVector(job, vectors));
  const caches = await db.collection('wikibriefingcaches').find({}).toArray();
  const indexes = [];
  const names = await db.listCollections().toArray();
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < names.length) {
      const name = names[cursor++].name;
      const [stats, list] = await Promise.all([
        db.command({ collStats: name }), db.collection(name).indexes()
      ]);
      for (const index of list) {
        const cover = list.find(other => coveredBy(index, other));
        if (cover) indexes.push({ collection: name, index, cover: cover.name, bytes: stats.indexSizes[index.name] });
      }
    }
  }));
  indexes.sort((a, b) => b.bytes - a.bytes);
  const savings = jobs.concat(caches).reduce((sum, row) => sum + serialize(row).length, 0)
    + indexes.reduce((sum, row) => sum + row.bytes, 0);
  console.log(JSON.stringify({ apply, before, jobs: jobs.length, caches: caches.length,
    indexes: indexes.length, estimatedSavings: savings, estimatedHeadroom: LIMIT - before + savings }));
  if (!apply) return;
  assert(before >= LIMIT, 'Quota is not exceeded; use the archive operator directly');
  assert(LIMIT - before + savings > 1024 * 1024, 'Insufficient safe headroom; no mutation');
  const live = await (await fetch('https://note-taker-3-unrg.onrender.com/api/version')).json();
  assert(process.env.ARCHIVE_READER_COMMIT && live.commit === process.env.ARCHIVE_READER_COMMIT,
    'Verified deployed reader required');
  const outputDir = path.join(os.homedir(), '.codex/backups/noeis/wiki-storage/2026-09-04');
  const report = { before, indexes, dropped: [], restored: [], jobsDeleted: 0, cachesDeleted: 0, backups: [] };
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const filename = path.join(outputDir, `archive-unlock-${Date.now()}.json`);
  const checkpoint = () => fs.writeFileSync(filename, JSON.stringify(report, null, 2), { mode: 0o600 });
  checkpoint();
  for (const [Model, rows, prefix] of [[EmbeddingJob, jobs, 'completed-vector-jobs'],
    [WikiBriefingCache, caches, 'rebuildable-briefing-cache']]) {
    if (!rows.length) continue;
    const backup = await writeVerifiedMongoBackup({ Model, ids: rows.map(row => String(row._id)), outputDir, prefix, batchSize: 100 });
    assert(backup.verified && backup.documentCount === rows.length);
    report.backups.push(backup); checkpoint();
  }
  // Exact queue version and current vector must still match at deletion time.
  let jobCursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (jobCursor < jobs.length) {
    const job = jobs[jobCursor++];
    const p = job.payload || {};
    const vector = await db.collection('vectoritems').findOne({ userId: new mongoose.Types.ObjectId(p.userId),
      objectType: p.type, objectId: String(p.objectId), subId: p.subId || '', contentHash: textHash(job.text) },
    { projection: { _id: 1 } });
    if (!vector) continue;
    const result = await db.collection('embeddingjobs').deleteOne({ _id: job._id,
      status: 'completed', updatedAt: job.updatedAt, text: job.text, payload: job.payload,
      replayRequired: { $ne: true }, lockedAt: null });
    report.jobsDeleted += result.deletedCount;
  } }));
  for (const cache of caches) report.cachesDeleted += (await db.collection('wikibriefingcaches')
    .deleteOne({ _id: cache._id, updatedAt: cache.updatedAt, generatedAt: cache.generatedAt })).deletedCount;
  checkpoint();
  try {
    for (const row of indexes) {
      if (await metrics() < LIMIT - 10000) break;
      const list = await db.collection(row.collection).indexes();
      const current = list.find(index => index.name === row.index.name);
      const cover = list.find(index => index.name === row.cover);
      assert(current && cover && coveredBy(current, cover), 'Index coverage changed');
      await db.collection(row.collection).dropIndex(current.name);
      report.dropped.push(row); checkpoint();
    }
    report.unlockedBytes = await metrics(); checkpoint();
    assert(report.unlockedBytes < LIMIT, 'Quota still blocked; no archive attempted');
    const child = spawnSync(process.execPath, [path.join(__dirname, 'archive_wiki_revision_histories.js'), '--apply'],
      { env: { ...process.env, ARCHIVE_LIMIT: '3' }, stdio: 'inherit' });
    assert.equal(child.status, 0, 'Archive failed; consult verified backups');
  } finally {
    // The bridge must not leave a schema/index drift behind after compression.
    await restoreIndexes(db, filename);
  }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
module.exports = { coveredBy, matchesVector };
