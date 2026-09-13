const { randomUUID } = require('crypto');
const { calculateObjectSize } = require('bson');
const { buildWikiRevisionRetentionPlan, collectPageRetentionReferences } = require('./wikiRevisionRetentionService');
const { readRetentionReferences } = require('./wikiRetentionReferences');
const { readStorageMetrics } = require('./wikiStorageGovernorService');

const DAY_MS = 24 * 60 * 60 * 1000;
const HIGH_WATER_BYTES = 400 * 1024 * 1024;
const TARGET_BYTES = 380 * 1024 * 1024;
const BACKGROUND_ALLOWANCE_BYTES = 8 * 1024 * 1024;
const STATE_ID = 'automatic-snapshots-v1';
const LEASE_MS = 30 * 60 * 1000;
const METADATA = {
  _id: 1, userId: 1, pageId: 1, createdAt: 1, updatedAt: 1, actorType: 1, reason: 1,
  promotionStatus: 1, sourceEventId: 1, sourceVersion: 1, snapshotPrunedAt: 1,
  snapshotUnchanged: 1, claimReview: 1
};

const stateCollection = db => db.collection('wikistoragestate');
const initializeState = async (db) => {
  try {
    await stateCollection(db).updateOne({ _id: STATE_ID }, { $setOnInsert: { nextRunAt: new Date(0) } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
};

// One shared lease serializes automatic growth and cleanup across server instances.
const acquireStorageLease = async (db, kind, at = new Date()) => {
  await initializeState(db);
  const token = randomUUID();
  const state = await stateCollection(db).findOneAndUpdate({
    _id: STATE_ID,
    $or: [{ lease: null }, { 'lease.expiresAt': { $lte: at } }],
    ...(kind === 'cleanup' ? { nextRunAt: { $lte: at } } : {})
  }, { $set: {
    lease: { token, kind, expiresAt: new Date(at.getTime() + LEASE_MS) },
    ...(kind === 'cleanup' ? { lastStartedAt: at, nextRunAt: new Date(at.getTime() + DAY_MS), status: 'running' } : {})
  } }, { returnDocument: 'after' });
  if (!state) return null;
  let lost = false;
  const renew = async () => {
    const result = await stateCollection(db).updateOne({ _id: STATE_ID, 'lease.token': token }, {
      $set: { 'lease.expiresAt': new Date(Date.now() + LEASE_MS) }
    });
    if (!result.matchedCount) throw new Error('Wiki storage lease was lost.');
  };
  const timer = setInterval(() => renew().catch(() => { lost = true; }), 60 * 1000);
  timer.unref();
  return {
    state,
    assertHeld: async () => { if (lost) throw new Error('Wiki storage lease was lost.'); await renew(); },
    finish: async (fields = {}) => {
      clearInterval(timer);
      await stateCollection(db).updateOne({ _id: STATE_ID, 'lease.token': token }, {
        $set: fields, $unset: { lease: '' }
      });
    }
  };
};

const acquireWikiWriteBudget = async (db) => {
  // Pure service tests have no database. Connected production models always do.
  if (!db) return { allowed: true, release: async () => {} };
  const lease = await acquireStorageLease(db, 'background');
  if (!lease) return { allowed: false, reason: 'storage_work_in_progress' };
  try {
    // Once cleanup is due, let in-flight work finish without starting another pass.
    if (process.env.WIKI_STORAGE_GOVERNOR_DISABLED !== 'true'
      && new Date(lease.state.nextRunAt).getTime() <= Date.now()) {
      await lease.finish();
      return { allowed: false, reason: 'daily_cleanup_due' };
    }
    const metrics = await readStorageMetrics(db);
    const threshold = lease.state.backgroundPaused ? TARGET_BYTES : HIGH_WATER_BYTES;
    const allowed = metrics?.complete === true
      && metrics.logicalBytes < threshold
      && metrics.logicalBytes + BACKGROUND_ALLOWANCE_BYTES < HIGH_WATER_BYTES;
    if (!allowed) {
      await lease.finish({ backgroundPaused: true, measuredAt: new Date(), logicalBytes: metrics?.logicalBytes ?? null });
      return { allowed: false, reason: 'storage_headroom' };
    }
    return { allowed: true, release: () => lease.finish({ backgroundPaused: false, measuredAt: new Date(), logicalBytes: metrics.logicalBytes }) };
  } catch (error) {
    await lease.finish({ backgroundPaused: true, measurementFailedAt: new Date() });
    return { allowed: false, reason: 'storage_measurement_unavailable' };
  }
};

const pagePlan = ({ revisions, page, references, now }) => {
  const refs = collectPageRetentionReferences(page);
  const plan = buildWikiRevisionRetentionPlan({
    revisions, protectedRevisionIds: [...references, ...refs.revisionIds],
    acceptedSourceEventIds: refs.sourceEventIds, publishedHeadSha: refs.publishedHeadSha,
    recentLimit: 3, automaticExpiry: true, now
  });
  const eligible = new Set(plan.deletedIds);
  return revisions.filter(row => eligible.has(String(row._id)) && !row.snapshotPrunedAt && !row.snapshotUnchanged);
};

const runDailyWikiRetention = async ({ db, now = new Date(), dryRun = false, readReferences = readRetentionReferences } = {}) => {
  if (!db) throw new Error('Wiki retention requires a database.');
  const lease = dryRun ? null : await acquireStorageLease(db, 'cleanup', now);
  if (!dryRun && !lease) return { skipped: true };
  const result = { dryRun, expired: 0, eligible: 0, payloadBytesReclaimed: 0, changed: 0 };
  try {
    result.before = await readStorageMetrics(db);
    if (!result.before?.complete) throw new Error('Complete cluster storage measurement is required.');
    const references = await readReferences(db);
    const pages = await db.collection('wikipages').find({}, { projection: {
      _id: 1, userId: 1, updatedAt: 1, externalWatches: 1, freshness: 1, publicProof: 1, judgment: 1,
      'aiState.firstHeadCandidateRevisionId': 1, 'aiState.maintenanceCandidateRevisionId': 1
    } }).toArray();
    const revisionsByPage = new Map();
    for await (const row of db.collection('wikirevisions').find({}, { projection: METADATA })) {
      const key = `${row.userId}/${row.pageId}`;
      if (!revisionsByPage.has(key)) revisionsByPage.set(key, []);
      revisionsByPage.get(key).push(row);
    }
    const plans = [];
    for (const page of pages) {
      const revisions = revisionsByPage.get(`${page.userId}/${page._id}`) || [];
      const rows = pagePlan({ revisions, page, references, now });
      result.eligible += rows.length;
      if (rows.length) plans.push({ page, rows });
    }
    if (!dryRun && plans.length) {
      // Revalidate incoming references after planning, before any body expires.
      const currentReferences = await readReferences(db);
      for (const { page, rows } of plans) {
        await lease.assertHeld();
        const currentPage = await db.collection('wikipages').findOne({ _id: page._id, userId: page.userId });
        if (!currentPage || new Date(currentPage.updatedAt).getTime() !== new Date(page.updatedAt).getTime()) { result.changed += rows.length; continue; }
        const revisions = await db.collection('wikirevisions').find({ userId: page.userId, pageId: page._id }, { projection: METADATA }).toArray();
        const eligible = new Set(pagePlan({ revisions, page: currentPage, references: currentReferences, now }).map(row => String(row._id)));
        for (const candidate of rows) {
          if (!await db.collection('wikipages').findOne({ _id: page._id, userId: page.userId, updatedAt: page.updatedAt }, { projection: { _id: 1 } })) {
            result.changed++;
            continue;
          }
          if (!eligible.has(String(candidate._id))) { result.changed++; continue; }
          const collection = db.collection('wikirevisions');
          const row = await collection.findOne({ _id: candidate._id, userId: page.userId, pageId: page._id });
          if (!row || row.snapshotPrunedAt || new Date(row.updatedAt).getTime() !== new Date(candidate.updatedAt).getTime()
            || row.actorType !== candidate.actorType || row.reason !== candidate.reason
            || row.promotionStatus !== candidate.promotionStatus
            || JSON.stringify(row.claimReview) !== JSON.stringify(candidate.claimReview)) { result.changed++; continue; }
          const remaining = { ...row, before: null, after: null, snapshotPrunedAt: now, snapshotExpiryPolicy: STATE_ID };
          delete remaining.snapshotHistoryArchive;
          // CAS also protects native writes that do not update Mongoose timestamps.
          const changed = await collection.updateOne({
            _id: row._id, userId: row.userId, pageId: row.pageId, updatedAt: row.updatedAt ?? null,
            claimReview: row.claimReview ?? null, promotionStatus: row.promotionStatus,
            actorType: row.actorType, reason: row.reason, snapshotPrunedAt: null,
            before: row.before ?? null, after: row.after ?? null,
            snapshotHistoryArchive: row.snapshotHistoryArchive ?? null
          }, {
            $set: { before: null, after: null, snapshotPrunedAt: now, snapshotExpiryPolicy: STATE_ID },
            $unset: { snapshotHistoryArchive: '' }
          });
          if (changed.modifiedCount) {
            result.expired++;
            result.payloadBytesReclaimed += Math.max(0, calculateObjectSize(row) - calculateObjectSize(remaining));
          } else result.changed++;
        }
      }
    }
    result.after = dryRun ? result.before : await readStorageMetrics(db);
    if (!result.after?.complete) throw new Error('Post-cleanup cluster measurement is incomplete.');
    result.netBytesReclaimed = result.before.logicalBytes - result.after.logicalBytes;
    if (lease) await lease.finish({
      status: 'completed', lastCompletedAt: new Date(), lastResult: result,
      backgroundPaused: result.after.logicalBytes >= (lease.state.backgroundPaused ? TARGET_BYTES : HIGH_WATER_BYTES),
      logicalBytes: result.after.logicalBytes, measuredAt: new Date(), lastError: null
    });
    return result;
  } catch (error) {
    if (lease) await lease.finish({ status: 'failed', lastFailedAt: new Date(), lastError: 'Daily history cleanup did not complete.', lastResult: result });
    throw error;
  }
};

const readWikiStorageStatus = async (db) => {
  if (!db) return null;
  const row = await stateCollection(db).findOne({ _id: STATE_ID });
  if (!row) return null;
  const interrupted = row.status === 'running' && new Date(row.lease?.expiresAt || 0).getTime() < Date.now();
  return {
    status: interrupted ? 'interrupted' : row.status,
    lastCompletedAt: row.lastCompletedAt || null, nextRunAt: row.nextRunAt,
    backgroundPaused: Boolean(row.backgroundPaused),
    expired: row.lastResult?.expired || 0,
    payloadBytesReclaimed: row.lastResult?.payloadBytesReclaimed || 0,
    message: interrupted || row.status === 'failed'
      ? 'Daily history cleanup needs attention.'
      : row.backgroundPaused ? 'Wiki updates are waiting for storage space. Your writing takes priority.' : ''
  };
};

module.exports = { DAY_MS, HIGH_WATER_BYTES, TARGET_BYTES, STATE_ID, acquireWikiWriteBudget, runDailyWikiRetention, readWikiStorageStatus };
