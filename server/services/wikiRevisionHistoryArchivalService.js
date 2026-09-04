const { isDeepStrictEqual } = require('node:util');
const {
  DEFAULT_MINIMUM_SAVINGS_BYTES,
  FIELD,
  archiveUpdate,
  packWhenWorthwhile,
  unpackRevisionHistories
} = require('./wikiRevisionHistoryArchive');

const boundedInteger = (value, fallback, maximum) => Math.max(
  1,
  Math.min(Number.isFinite(Number(value)) ? Number(value) : fallback, maximum)
);

const archiveEligibleRevisionHistories = async ({
  WikiRevision,
  now = new Date(),
  minimumAgeMs = 60 * 60 * 1000,
  recentLimit = 5,
  scanLimit = 100,
  limit = 3,
  minimumSavingsBytes = DEFAULT_MINIMUM_SAVINGS_BYTES,
  dryRun = true
} = {}) => {
  const collection = WikiRevision?.collection;
  if (!collection || typeof collection.aggregate !== 'function') {
    return { dryRun, candidates: 0, selected: 0, archived: 0, savedBytes: 0, rows: [] };
  }
  const cutoff = new Date(now.getTime() - Math.max(0, Number(minimumAgeMs) || 0));
  const candidates = await collection.aggregate([
    { $match: {
      [FIELD]: { $exists: false },
      snapshotPrunedAt: null,
      createdAt: { $lt: cutoff },
      $or: [
        { 'before.claims': { $elemMatch: { 'history.0': { $exists: true } } } },
        { 'after.claims': { $elemMatch: { 'history.0': { $exists: true } } } }
      ]
    } },
    { $project: { _id: 1, pageId: 1, userId: 1, bytes: { $bsonSize: '$$ROOT' } } },
    { $sort: { bytes: -1 } },
    { $limit: boundedInteger(scanLimit, 100, 250) }
  ]).toArray();
  const selected = [];
  const newestByPage = new Map();
  for (const candidate of candidates) {
    if (selected.length >= boundedInteger(limit, 3, 10)) break;
    const pageKey = `${candidate.userId}/${candidate.pageId}`;
    if (!newestByPage.has(pageKey)) {
      newestByPage.set(pageKey, await collection
        .find({ pageId: candidate.pageId, userId: candidate.userId })
        .project({ _id: 1 })
        .sort({ createdAt: -1 })
        .limit(boundedInteger(recentLimit, 5, 20))
        .toArray());
    }
    if (newestByPage.get(pageKey).some(row => String(row._id) === String(candidate._id))) continue;
    selected.push(candidate);
  }

  const rows = [];
  for (const candidate of selected) {
    const row = await collection.findOne({ _id: candidate._id });
    if (!row || row[FIELD] || row.snapshotPrunedAt) continue;
    const packed = packWhenWorthwhile(row, minimumSavingsBytes);
    if (!packed.archived) continue;
    const restored = unpackRevisionHistories(packed.revision);
    if (!isDeepStrictEqual(restored, row) || JSON.stringify(restored) !== JSON.stringify(row)) {
      throw new Error('Revision history archive failed its lossless preflight');
    }
    const result = { revisionId: String(row._id), savedBytes: packed.savedBytes, applied: false };
    if (!dryRun) {
      const write = await collection.updateOne({
        _id: row._id,
        userId: row.userId,
        pageId: row.pageId,
        ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
        ...(row.promotionStatus ? { promotionStatus: row.promotionStatus } : {}),
        [FIELD]: { $exists: false },
        snapshotPrunedAt: null
      }, archiveUpdate(row, packed.revision));
      if (write.modifiedCount !== 1) throw new Error('Revision changed during history archival');
      const stored = await collection.findOne({ _id: row._id });
      const storedRestored = unpackRevisionHistories(stored);
      if (!isDeepStrictEqual(storedRestored, row) || JSON.stringify(storedRestored) !== JSON.stringify(row)) {
        throw new Error('Stored revision history archive failed readback');
      }
      result.applied = true;
    }
    rows.push(result);
  }
  return {
    dryRun,
    candidates: candidates.length,
    selected: selected.length,
    archived: rows.filter(row => row.applied).length,
    savedBytes: rows.reduce((sum, row) => sum + row.savedBytes, 0),
    rows
  };
};

module.exports = { archiveEligibleRevisionHistories };
