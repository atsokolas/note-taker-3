const { assertVerifiedBackup } = require('./mongoBackupService');

const cleanId = (value) => String(value?._id || value || '').trim();

const monthKey = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 7);
};

const sourceVersionHead = (revision) => String(
  revision?.sourceVersion?.headSha
  || revision?.sourceVersion?.github?.headSha
  || revision?.sourceVersion?.candidateHeadSha
  || ''
).trim();

const collectPageRetentionReferences = (page = {}) => {
  const revisionIds = new Set();
  const sourceEventIds = new Set();
  const clocks = Array.isArray(page?.publicProof?.acceptedClocks)
    ? page.publicProof.acceptedClocks
    : [];

  clocks.forEach((clock) => {
    if (clock?.revisionId) revisionIds.add(cleanId(clock.revisionId));
    if (clock?.sourceEventId) sourceEventIds.add(cleanId(clock.sourceEventId));
  });
  if (page?.freshness?.acceptedThrough?.revisionId) {
    revisionIds.add(cleanId(page.freshness.acceptedThrough.revisionId));
  }
  if (page?.freshness?.acceptedThrough?.sourceEventId) {
    sourceEventIds.add(cleanId(page.freshness.acceptedThrough.sourceEventId));
  }
  if (page?.judgment?.initialRevisionId) {
    revisionIds.add(cleanId(page.judgment.initialRevisionId));
  }
  const decisions = Array.isArray(page?.judgment?.decisions)
    ? page.judgment.decisions
    : [];
  decisions.forEach((decision) => {
    if (decision?.acceptedRevisionId) revisionIds.add(cleanId(decision.acceptedRevisionId));
    if (decision?.recordedRevisionId) revisionIds.add(cleanId(decision.recordedRevisionId));
    if (decision?.outcome?.revisionId) revisionIds.add(cleanId(decision.outcome.revisionId));
  });

  return {
    revisionIds: [...revisionIds].filter(Boolean),
    sourceEventIds: [...sourceEventIds].filter(Boolean),
    publishedHeadSha: String(page?.externalWatches?.githubRepo?.publishedHeadSha || '').trim()
  };
};

const collectReceiptRetentionReferences = (receipts = []) => {
  const revisionIds = new Set();
  const sourceEventIds = new Set();
  (Array.isArray(receipts) ? receipts : []).forEach((receipt) => {
    if (String(receipt?.status || '') !== 'completed') return;
    const provenance = receipt?.provenance || {};
    if (provenance.revisionId) revisionIds.add(cleanId(provenance.revisionId));
    (Array.isArray(provenance.revisionIds) ? provenance.revisionIds : [])
      .forEach(value => revisionIds.add(cleanId(value)));
    (Array.isArray(provenance.acceptedClocks) ? provenance.acceptedClocks : [])
      .forEach((clock) => {
        if (clock?.revisionId) revisionIds.add(cleanId(clock.revisionId));
        if (clock?.sourceEventId) sourceEventIds.add(cleanId(clock.sourceEventId));
      });
    if (provenance.sourceEventId) sourceEventIds.add(cleanId(provenance.sourceEventId));
  });
  return {
    revisionIds: [...revisionIds].filter(Boolean),
    sourceEventIds: [...sourceEventIds].filter(Boolean)
  };
};

const buildWikiRevisionRetentionPlan = ({
  revisions = [],
  protectedRevisionIds = [],
  acceptedSourceEventIds = [],
  publishedHeadSha = '',
  recentLimit = 20
} = {}) => {
  const ordered = [...revisions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const protectedIds = new Set(protectedRevisionIds.map(cleanId).filter(Boolean));
  const acceptedEvents = new Set(acceptedSourceEventIds.map(cleanId).filter(Boolean));
  const kept = new Map();
  const keep = (revision, reason) => {
    const id = cleanId(revision);
    if (!id) return;
    const reasons = kept.get(id) || new Set();
    reasons.add(reason);
    kept.set(id, reasons);
  };

  ordered.slice(0, recentLimit).forEach((revision) => keep(revision, 'recent'));
  if (ordered.length) keep(ordered[ordered.length - 1], 'original');

  const olderMonths = new Set();
  ordered.slice(recentLimit).forEach((revision) => {
    const key = monthKey(revision.createdAt);
    if (key && !olderMonths.has(key)) {
      olderMonths.add(key);
      keep(revision, 'monthly_checkpoint');
    }
  });

  ['candidate', 'rejected', 'deferred', 'preserved'].forEach((status) => {
    const revision = ordered.find((item) => item.promotionStatus === status);
    if (revision) keep(revision, `latest_${status}`);
  });

  ordered.forEach((revision) => {
    const reviewState = String(revision?.claimReview?.state || '').trim();
    const reviewEvents = Array.isArray(revision?.claimReview?.events) ? revision.claimReview.events : [];
    if (revision?.claimReview?.version && (['deferred', 'accepted', 'rejected', 'preserved'].includes(reviewState) || reviewEvents.length)) {
      keep(revision, 'human_claim_review');
    }
  });

  ordered.forEach((revision) => {
    const id = cleanId(revision);
    if (protectedIds.has(id)) keep(revision, 'explicit_reference');
    if (acceptedEvents.has(cleanId(revision.sourceEventId))) keep(revision, 'accepted_source_event');
    if (publishedHeadSha && sourceVersionHead(revision) === publishedHeadSha) {
      keep(revision, 'published_head');
    }
  });

  const keptIds = ordered.map(cleanId).filter((id) => kept.has(id));
  const deletedIds = ordered.map(cleanId).filter((id) => !kept.has(id));
  return {
    total: ordered.length,
    keptIds,
    deletedIds,
    keepReasons: Object.fromEntries([...kept].map(([id, reasons]) => [id, [...reasons]]))
  };
};

const pruneWikiRevisionHistory = async ({
  WikiRevision,
  userId,
  pageId,
  page = {},
  protectedRevisionIds = [],
  recentLimit = 20,
  pruneThreshold = 24,
  snapshotByteThreshold = 12 * 1024 * 1024,
  dryRun = false,
  backupDryRun = false,
  beforeCompactSnapshots = null
} = {}) => {
  if (!WikiRevision || !userId || !pageId) return null;
  const count = await WikiRevision.countDocuments({ userId, pageId });
  let snapshotBytes = 0;
  if (count <= pruneThreshold && typeof WikiRevision.aggregate === 'function') {
    const [size] = await WikiRevision.aggregate([
      { $match: { userId, pageId, snapshotPrunedAt: null } },
      { $group: { _id: null, bytes: { $sum: { $bsonSize: '$$ROOT' } } } }
    ]);
    snapshotBytes = Number(size?.bytes || 0);
  }
  if (count <= pruneThreshold && snapshotBytes <= snapshotByteThreshold) {
    return { total: count, keptIds: [], deletedIds: [], skipped: true };
  }

  const references = collectPageRetentionReferences(page);
  const allProtectedIds = new Set([...protectedRevisionIds, ...references.revisionIds].map(cleanId));
  const Receipt = WikiRevision.db?.models?.NoeisReceipt;
  let receiptReferences = { revisionIds: [], sourceEventIds: [] };
  if (Receipt?.find) {
    let receiptQuery = Receipt.find({
      userId,
      status: 'completed',
      kind: { $in: ['public_proof_accepted', 'repo_wiki_claim_cohort_accepted', 'wiki_claim_disposition'] },
      'provenance.pageId': cleanId(pageId)
    });
    if (receiptQuery?.select) receiptQuery = receiptQuery.select('kind status provenance');
    const receiptRows = receiptQuery?.lean ? await receiptQuery.lean() : await receiptQuery;
    receiptReferences = collectReceiptRetentionReferences(receiptRows);
    receiptReferences.revisionIds.forEach(value => allProtectedIds.add(cleanId(value)));
  }
  const Baseline = WikiRevision.db?.models?.WikiRepoBaseline;
  if (Baseline) {
    const baseline = await Baseline.findOne({ pageId }).select('revisionId').lean();
    if (baseline?.revisionId) allProtectedIds.add(cleanId(baseline.revisionId));
  }

  const revisions = await WikiRevision.find({ userId, pageId })
    .select('_id createdAt promotionStatus sourceEventId sourceVersion snapshotPrunedAt claimReview')
    .sort({ createdAt: -1 })
    .lean();
  const plan = buildWikiRevisionRetentionPlan({
    revisions,
    protectedRevisionIds: [...allProtectedIds],
    acceptedSourceEventIds: [...references.sourceEventIds, ...receiptReferences.sourceEventIds],
    publishedHeadSha: references.publishedHeadSha,
    recentLimit
  });
  const prunedById = new Map(revisions.map(revision => [cleanId(revision), Boolean(revision.snapshotPrunedAt)]));
  const revisionObjectIdById = new Map(revisions.map(revision => [cleanId(revision), revision._id]));
  const compactableSnapshotIds = plan.deletedIds.filter(id => !prunedById.get(id));
  let compactableSnapshotBytes = 0;
  if (compactableSnapshotIds.length && typeof WikiRevision.aggregate === 'function') {
    const [snapshotSize] = await WikiRevision.aggregate([
      {
        $match: {
          userId,
          pageId,
          _id: { $in: compactableSnapshotIds.map(id => revisionObjectIdById.get(id)).filter(Boolean) }
        }
      },
      {
        $project: {
          bytes: {
            $add: [
              { $bsonSize: { $ifNull: ['$before', {}] } },
              { $bsonSize: { $ifNull: ['$after', {}] } }
            ]
          }
        }
      },
      { $group: { _id: null, bytes: { $sum: '$bytes' } } }
    ]);
    compactableSnapshotBytes = Number(snapshotSize?.bytes || 0);
  }

  let backup = null;
  if (compactableSnapshotIds.length && (!dryRun || backupDryRun)) {
    if (typeof beforeCompactSnapshots !== 'function') {
      throw new Error('Verified backup required before Wiki revision snapshot compaction.');
    }
    backup = assertVerifiedBackup(await beforeCompactSnapshots({
      userId,
      pageId,
      revisionIds: compactableSnapshotIds.map(id => revisionObjectIdById.get(id)).filter(Boolean),
      compactableSnapshotBytes
    }), compactableSnapshotIds.length);
  }

  if (!dryRun && compactableSnapshotIds.length) {
    await WikiRevision.updateMany(
      { userId, pageId, _id: { $in: compactableSnapshotIds }, snapshotPrunedAt: null },
      { $set: { before: null, after: null, snapshotPrunedAt: new Date() } }
    );
  }
  return {
    ...plan,
    compactableSnapshotIds,
    compactableSnapshotBytes,
    skipped: false,
    dryRun,
    snapshotBytes,
    backup
  };
};

module.exports = {
  buildWikiRevisionRetentionPlan,
  collectPageRetentionReferences,
  collectReceiptRetentionReferences,
  pruneWikiRevisionHistory
};
