const { pruneWikiRevisionHistory } = require('./wikiRevisionRetentionService');

const TERMINAL_RUN_STATUSES = ['completed', 'failed', 'needs_review'];
const TERMINAL_EVENT_STATUSES = ['processed', 'failed', 'ignored'];
const DEFAULT_RETENTION_DAYS = 45;
const PRESSURE_RETENTION_DAYS = 14;
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
  dryRun = false
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
    const page = await WikiPage.findOne({ _id: group._id.pageId, userId: group._id.userId });
    if (!page) continue;
    const result = await pruneWikiRevisionHistory({
      WikiRevision,
      userId: group._id.userId,
      pageId: group._id.pageId,
      page,
      recentLimit,
      pruneThreshold: 0,
      snapshotByteThreshold: 0,
      dryRun
    });
    results.push({
      pageId: cleanId(group._id.pageId),
      beforeCount: Number(group.count || 0),
      beforeBytes: Number(group.bytes || 0),
      compactableSnapshots: result?.compactableSnapshotIds?.length || 0
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
  highWaterBytes = DEFAULT_HIGH_WATER_BYTES,
  batchSize = 2500,
  revisionPageLimit = 10,
  dryRun = false
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
  const cutoff = new Date(now.getTime() - Math.max(7, effectiveRetentionDays) * 24 * 60 * 60 * 1000);
  const limit = Math.max(1, Math.min(Number(batchSize) || 2500, 10000));

  const revisionPages = await pruneHeavyRevisionPages({
    WikiRevision,
    WikiPage,
    pageLimit: revisionPageLimit,
    dryRun
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
  if (!dryRun && eventPlan.deleteIds.length && WikiSourceEvent?.deleteMany) {
    await WikiSourceEvent.deleteMany({ _id: { $in: eventPlan.deleteIds } });
  }

  const after = dryRun ? before : await readStorageMetrics(database);
  return {
    dryRun,
    underPressure,
    effectiveRetentionDays,
    cutoff,
    revisionPages,
    maintenanceRuns: {
      candidates: runCandidates.length,
      protected: runPlan.protectedIds.length,
      deleted: dryRun ? 0 : runPlan.deleteIds.length,
      deletable: runPlan.deleteIds.length
    },
    sourceEvents: {
      candidates: eventCandidates.length,
      protected: eventPlan.protectedIds.length,
      deleted: dryRun ? 0 : eventPlan.deleteIds.length,
      deletable: eventPlan.deleteIds.length
    },
    storage: { before, after }
  };
};

module.exports = {
  DEFAULT_HIGH_WATER_BYTES,
  DEFAULT_RETENTION_DAYS,
  PRESSURE_RETENTION_DAYS,
  buildOperationalRetentionPlan,
  collectObjectIds,
  pruneHeavyRevisionPages,
  readStorageMetrics,
  runWikiStorageGovernor
};
