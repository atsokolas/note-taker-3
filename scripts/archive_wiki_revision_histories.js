#!/usr/bin/env node
// Operator-only, bounded and dry-run by default. Never removes revision rows.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { serialize } = require('bson');
const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const { WikiRevision } = require('../server/models');
const { FIELD, packRevisionHistories, unpackRevisionHistories } = require('../server/services/wikiRevisionHistoryArchive');
const { writeVerifiedMongoBackup } = require('../server/services/mongoBackupService');
const { readStorageMetrics } = require('../server/services/wikiStorageGovernorService');
const hash = value => createHash('sha256').update(serialize(value)).digest('hex');

async function run() {
  assert(process.env.NOEIS_ENV_FILE, 'NOEIS_ENV_FILE required');
  const env = require('dotenv').parse(fs.readFileSync(process.env.NOEIS_ENV_FILE));
  const apply = process.argv.includes('--apply');
  const limit = Number(process.env.ARCHIVE_LIMIT || 1);
  assert(Number.isInteger(limit) && limit >= 1 && limit <= 10, 'Limit must be 1–10');
  if (apply) {
    const response = await fetch('https://note-taker-3-unrg.onrender.com/api/version');
    const version = await response.json();
    assert(process.env.ARCHIVE_READER_COMMIT && version.commit === process.env.ARCHIVE_READER_COMMIT,
      'Production must report the explicitly verified archive-reader commit before migration');
  }
  await mongoose.connect(env.MONGODB_URI, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const collection = WikiRevision.collection;
  const cutoff = new Date(Date.now() - 14 * 86400000);
  const candidates = await collection.aggregate([{ $match: {
    [FIELD]: { $exists: false }, snapshotPrunedAt: null, createdAt: { $lt: cutoff },
    'before.claims.0.history.0': { $exists: true }
  } }, { $project: { _id: 1, pageId: 1, userId: 1, bytes: { $bsonSize: '$$ROOT' } } },
  { $sort: { bytes: -1 } }, { $limit: 100 }]).toArray();
  const report = { apply, before: await readStorageMetrics(db), rows: [] };
  const outputDir = path.join(os.homedir(), '.codex/backups/noeis/wiki-storage', new Date().toISOString().slice(0, 10));
  for (const candidate of candidates) {
    if (report.rows.length >= limit) break;
    const recent = await collection.find({ pageId: candidate.pageId, userId: candidate.userId })
      .project({ _id: 1 }).sort({ createdAt: -1 }).limit(5).toArray();
    if (recent.some(row => String(row._id) === String(candidate._id))) continue;
    const row = await collection.findOne({ _id: candidate._id });
    if (!row || row[FIELD] || row.snapshotPrunedAt) continue;
    const packed = packRevisionHistories(row);
    assert.deepEqual(unpackRevisionHistories(packed), row);
    assert.equal(JSON.stringify(unpackRevisionHistories(packed)), JSON.stringify(row), 'Legacy hash byte order must survive');
    const savedBytes = serialize(row).length - serialize(packed).length;
    if (savedBytes < 100000) continue;
    const result = { revisionId: String(row._id), savedBytes, applied: false };
    if (apply) {
      const backup = await writeVerifiedMongoBackup({ Model: WikiRevision, ids: [String(row._id)],
        outputDir, prefix: `history-${row._id}`, batchSize: 1 });
      assert(backup.verified && backup.documentCount === 1, 'Verified backup required');
      const current = await collection.findOne({ _id: row._id });
      assert.equal(hash(current), hash(row), 'Revision changed during backup');
      const write = await collection.updateOne({ _id: row._id, userId: row.userId, pageId: row.pageId,
        updatedAt: row.updatedAt, promotionStatus: row.promotionStatus, [FIELD]: { $exists: false },
        snapshotPrunedAt: null }, { $set: { before: packed.before, after: packed.after, [FIELD]: packed[FIELD] } });
      assert.equal(write.modifiedCount, 1, 'Concurrent revision update; stopped');
      const stored = await collection.findOne({ _id: row._id });
      assert.deepEqual(unpackRevisionHistories(stored), row, 'Stored archive must decode exactly');
      const readable = await WikiRevision.findById(row._id).lean();
      assert.deepEqual(readable, row, 'Application reader must return exact original revision');
      assert.equal(JSON.stringify(readable), JSON.stringify(row), 'Application reader must preserve legacy hash byte order');
      Object.assign(result, { applied: true, backup });
    }
    report.rows.push(result);
    console.log(JSON.stringify(result));
  }
  report.after = await readStorageMetrics(db);
  if (apply) {
    fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(outputDir, `history-archive-report-${Date.now()}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
  }
  console.log(JSON.stringify(report));
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
