const { pruneWikiRevisionHistory } = require('./wikiRevisionRetentionService');
const { assertVerifiedBackup } = require('./mongoBackupService');

const TERMINAL_RUN_STATUSES = ['completed', 'failed', 'needs_review'];
const TERMINAL_EVENT_STATUSES = ['processed', 'failed', 'ignored'];
const DEFAULT_RETENTION_DAYS = 45;
const PRESSURE_RETENTION_DAYS = 14;
const DEFAULT_RECENT_REVISION_LIMIT = 20;
const PRESSURE_RECENT_REVISION_LIMIT = 5;
const DEFAULT_HIGH_WATER_BYTES = 420 * 1024 * 1024;

const cleanId = value => String(value?._id || value || '').trim();

const collectObjectIds = (value, found = new Set()) => {
  if (typeof value === 'string') {
    (value.match(/[a-f0-9]{24}/gi) || []).forEach(match => found.add(match.toLowerCase()));
  } else if (Array.isArray(value)) {
    value.forEach(item => collectObjectIds(item, found));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectObjectIds(item, found));
  }
  return found;
};

const loadRows = async ({ Model, query = {}, select = '', sort = null, limit = 0 } = {}) => {
  if (!Model || typeof Model.find !== 'function') return [];
  let request = Model.find(query);
  if (select && typeof request.select === 'function') request = request.select(select);
  if (sort && typeof request.sort === 'function') request = request.sort(sort);
  if (limit && typeof request.limit === 'function') request = request.limit(limit);
  return typeof request.lean === 'function' ? request.lean() : request;
};

const readStorageMetrics = async (db) => {
  if (!db || typeof db.command !== 'function') return null;
  const stats = await db.command({ dbStats: 1 });
  const dataBytes = Number(stats.dataSize || 0);
  const indexBytes = Number(stats.indexSize || 0);
  return {
    dataBytes,
    indexBytes,
    logicalBytes: dataBytes + indexBytes
  };
};

const buildOperationalRetentionPlan = ({ candidates = [], referencedIds = [] } = {}) => {
  const referenced = new Set((referencedIds || []).map(cleanId).filter(Boolean));
  const protectedIds = [];
  const deleteIds = [];
  candidates.forEach((candidate) => {
    const candidateId = cleanId(candidate);
    if (!candidateId) return;
    if (referenced.has(candidateId)) protectedIds.push(candidateId);
    else deleteIds.push(candidateId);
  });
  return { protectedIds, deleteIds };
};

const referencedFieldIds = (rows = [], field) => rows.map(row => cleanId(row?.[field])).filter(Boolean);

const pruneHeavyRevisionPages = async ({
  WikiRevision,
  WikiPage,
  pageLimit = 10,
  recentLimit = 20,
  snapshotByteThreshold = 12 * 1024 * 1024,
  dryRun = false,
  backupDryRun = false,
  beforeCompactSnapshots = null
} = {}) => {
  if (!WikiRevision || !WikiPage || typeof WikiRevision.aggregate !== 'function') return [];
  const groups = await WikiRevision.aggregate([
    { $match: { snapshotPrunedAt: null } },
    {
      $group: {
        _id: { userId: '$userId', pageId: '$pageId' },
        count: { $sum: 1 },
        bytes: { $sum: { $bsonSize: '$$ROOT' } }
      }
    },
    {
      $match: {
        $or: [
          { count: { $gt: 24 } },
          { bytes: { $gt: snapshotByteThreshold } }
        ]
      }
    },
    { $sort: { bytes: -1 } },
    { $limit: Math.max(1, Math.min(Number(pageLimit) || 10, 50)) }
  ]);
  const results = [];
  for (const group of groups) {
    /* A Wiki page can carry a large rendered body and source inventory. The
       retention decision needs only durable identity references; loading the
       whole page made a read-only governor spend a minute transferring pages
       it would never inspect. */
    const pageQuery = WikiPage.findOne({ _id: group._id.pageId, userId: group._id.userId });
    const page = typeof pageQuery?.select === 'function'
      ? await pageQuery.select('externalWatches freshness publicProof judgment')
      : await pageQuery;
    if (!page) continue;
    const result = await pruneWikiRevisionHistory({
      WikiRevision,
      userId: group._id.userId,
      pageId: group._id.pageId,
      page,
      recentLimit,
      pruneThreshold: 0,
      snapshotByteThreshold: 0,
      dryRun,
      backupDryRun,
      beforeCompactSnapshots
    });
    results.push({
      pageId: cleanId(group._id.pageId),
      beforeCount: Number(group.count || 0),
      beforeBytes: Number(group.bytes || 0),
      compactableSnapshots: result?.compactableSnapshotIds?.length || 0,
      compactableSnapshotBytes: Number(result?.compactableSnapshotBytes || 0),
      backup: result?.backup || null
    });
  }
  return results;
};

const runWikiStorageGovernor = async ({
  models = {},
  db = null,
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS,
  pressureRetentionDays = PRESSURE_RETENTION_DAYS,
  recentRevisionLimit = DEFAULT_RECENT_REVISION_LIMIT,
  pressureRecentRevisionLimit = PRESSURE_RECENT_REVISION_LIMIT,
  highWaterBytes = DEFAULT_HIGH_WATER_BYTES,
  batchSize = 2500,
  revisionPageLimit = 10,
  dryRun = false,
  backupDryRun = false,
  backupRevisionSnapshots = null,
  backupOperationalRows = null
} = {}) => {
  const {
    WikiRevision,
    WikiPage,
    WikiMaintenanceRun,
    WikiSourceEvent,
    NoeisReceipt
  } = models;
  const database = db || WikiRevision?.db?.db || WikiRevision?.db;
  const before = await readStorageMetrics(database);
  const underPressure = Number(before?.logicalBytes || 0) >= Number(highWaterBytes || DEFAULT_HIGH_WATER_BYTES);
  const effectiveRetentionDays = underPressure
    ? Math.min(Number(retentionDays) || DEFAULT_RETENTION_DAYS, Number(pressureRetentionDays) || PRESSURE_RETENTION_DAYS)
    : Number(retentionDays) || DEFAULT_RETENTION_DAYS;
  const effectiveRecentRevisionLimit = underPressure
    ? Math.min(
      Math.max(1, Number(recentRevisionLimit) || DEFAULT_RECENT_REVISION_LIMIT),
      Math.max(1, Number(pressureRecentRevisionLimit) || PRESSURE_RECENT_REVISION_LIMIT)
    )
    : Math.max(1, Number(recentRevisionLimit) || DEFAULT_RECENT_REVISION_LIMIT);
  const cutoff = new Date(now.getTime() - Math.max(7, effectiveRetentionDays) * 24 * 60 * 60 * 1000);
  const limit = Math.max(1, Math.min(Number(batchSize) || 2500, 10000));

  const revisionPages = await pruneHeavyRevisionPages({
    WikiRevision,
    WikiPage,
    pageLimit: revisionPageLimit,
    recentLimit: effectiveRecentRevisionLimit,
    dryRun,
    backupDryRun,
    beforeCompactSnapshots: backupRevisionSnapshots
  });
  const [receipts, pages] = await Promise.all([
    loadRows({ Model: NoeisReceipt, select: 'provenance' }),
    loadRows({ Model: WikiPage, select: 'freshness.acceptedThrough publicProof.acceptedClocks publicProof.acceptanceSnapshot' })
  ]);
  const durableIds = new Set();
  receipts.forEach(receipt => collectObjectIds(receipt.provenance, durableIds));
  pages.forEach(page => {
    collectObjectIds(page.freshness?.acceptedThrough, durableIds);
    collectObjectIds(page.publicProof?.acceptedClocks, durableIds);
    collectObjectIds(page.publicProof?.acceptanceSnapshot, durableIds);
  });

  const runCandidates = await loadRows({
    Model: WikiMaintenanceRun,
    query: { status: { $in: TERMINAL_RUN_STATUSES }, createdAt: { $lt: cutoff } },
    select: '_id sourceEventId',
    sort: { createdAt: 1 },
    limit
  });
  const runIds = runCandidates.map(cleanId).filter(Boolean);
  const revisionRunRefs = runIds.length ? await loadRows({
    Model: WikiRevision,
    query: { maintenanceRunId: { $in: runCandidates.map(row => row._id) } },
    select: 'maintenanceRunId'
  }) : [];
  const runPlan = buildOperationalRetentionPlan({
    candidates: runCandidates,
    referencedIds: [...durableIds, ...referencedFieldIds(revisionRunRefs, 'maintenanceRunId')]
  });
  let runBackup = null;
  if (runPlan.deleteIds.length && (!dryRun || backupDryRun)) {
    if (typeof backupOperationalRows !== 'function') {
      throw new Error('Verified backup required before Wiki maintenance-run deletion.');
    }
    runBackup = assertVerifiedBackup(await backupOperationalRows({
      kind: 'wiki-maintenance-runs',
      Model: WikiMaintenanceRun,
      ids: runPlan.deleteIds,
      cutoff
    }), runPlan.deleteIds.length);
  }
  if (!dryRun && runPlan.deleteIds.length && WikiMaintenanceRun?.deleteMany) {
    await WikiMaintenanceRun.deleteMany({ _id: { $in: runPlan.deleteIds } });
  }

  const eventCandidates = await loadRows({
    Model: WikiSourceEvent,
    query: { status: { $in: TERMINAL_EVENT_STATUSES }, createdAt: { $lt: cutoff } },
    select: '_id',
    sort: { createdAt: 1 },
    limit
  });
  const eventIds = eventCandidates.map(row => row._id);
  const [revisionEventRefs, runEventRefs] = eventIds.length ? await Promise.all([
    loadRows({
      Model: WikiRevision,
      query: { sourceEventId: { $in: eventIds } },
      select: 'sourceEventId'
    }),
    loadRows({
      Model: WikiMaintenanceRun,
      query: {
        sourceEventId: { $in: eventIds },
        ...(runPlan.deleteIds.length ? { _id: { $nin: runPlan.deleteIds } } : {})
      },
      select: 'sourceEventId'
    })
  ]) : [[], []];
  const eventPlan = buildOperationalRetentionPlan({
    candidates: eventCandidates,
    referencedIds: [
      ...durableIds,
      ...referencedFieldIds(revisionEventRefs, 'sourceEventId'),
      ...referencedFieldIds(runEventRefs, 'sourceEventId')
    ]
  });
  let eventBackup = null;
  if (eventPlan.deleteIds.length && (!dryRun || backupDryRun)) {
    if (typeof backupOperationalRows !== 'function') {
      throw new Error('Verified backup required before Wiki source-event deletion.');
    }
    eventBackup = assertVerifiedBackup(await backupOperationalRows({
      kind: 'wiki-source-events',
      Model: WikiSourceEvent,
      ids: eventPlan.deleteIds,
      cutoff
    }), eventPlan.deleteIds.length);
  }
  if (!dryRun && eventPlan.deleteIds.length && WikiSourceEvent?.deleteMany) {
    await WikiSourceEvent.deleteMany({ _id: { $in: eventPlan.deleteIds } });
  }

  const after = dryRun ? before : await readStorageMetrics(database);
  return {
    dryRun,
    backupDryRun,
    underPressure,
    effectiveRetentionDays,
    effectiveRecentRevisionLimit,
    cutoff,
    revisionPages,
    maintenanceRuns: {
      candidates: runCandidates.length,
      protected: runPlan.protectedIds.length,
      deleted: dryRun ? 0 : runPlan.deleteIds.length,
      deletable: runPlan.deleteIds.length,
      backup: runBackup
    },
    sourceEvents: {
      candidates: eventCandidates.length,
      protected: eventPlan.protectedIds.length,
      deleted: dryRun ? 0 : eventPlan.deleteIds.length,
      deletable: eventPlan.deleteIds.length,
      backup: eventBackup
    },
    storage: { before, after }
  };
};

module.exports = {
  DEFAULT_HIGH_WATER_BYTES,
  DEFAULT_RECENT_REVISION_LIMIT,
  DEFAULT_RETENTION_DAYS,
  PRESSURE_RECENT_REVISION_LIMIT,
  PRESSURE_RETENTION_DAYS,
  buildOperationalRetentionPlan,
  collectObjectIds,
  pruneHeavyRevisionPages,
  readStorageMetrics,
  runWikiStorageGovernor
};
