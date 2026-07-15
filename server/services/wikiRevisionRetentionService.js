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

  return {
    revisionIds: [...revisionIds].filter(Boolean),
    sourceEventIds: [...sourceEventIds].filter(Boolean),
    publishedHeadSha: String(page?.externalWatches?.githubRepo?.publishedHeadSha || '').trim()
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

  ['candidate', 'rejected'].forEach((status) => {
    const revision = ordered.find((item) => item.promotionStatus === status);
    if (revision) keep(revision, `latest_${status}`);
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
  pruneThreshold = 40,
  dryRun = false
} = {}) => {
  if (!WikiRevision || !userId || !pageId) return null;
  const count = await WikiRevision.countDocuments({ userId, pageId });
  if (count <= pruneThreshold) {
    return { total: count, keptIds: [], deletedIds: [], skipped: true };
  }

  const references = collectPageRetentionReferences(page);
  const allProtectedIds = new Set([...protectedRevisionIds, ...references.revisionIds].map(cleanId));
  const Baseline = WikiRevision.db?.models?.WikiRepoBaseline;
  if (Baseline) {
    const baseline = await Baseline.findOne({ pageId }).select('revisionId').lean();
    if (baseline?.revisionId) allProtectedIds.add(cleanId(baseline.revisionId));
  }

  const revisions = await WikiRevision.find({ userId, pageId })
    .select('_id createdAt promotionStatus sourceEventId sourceVersion')
    .sort({ createdAt: -1 })
    .lean();
  const plan = buildWikiRevisionRetentionPlan({
    revisions,
    protectedRevisionIds: [...allProtectedIds],
    acceptedSourceEventIds: references.sourceEventIds,
    publishedHeadSha: references.publishedHeadSha,
    recentLimit
  });

  if (!dryRun && plan.deletedIds.length) {
    await WikiRevision.updateMany(
      { userId, pageId, _id: { $in: plan.deletedIds }, snapshotPrunedAt: null },
      { $set: { before: null, after: null, snapshotPrunedAt: new Date() } }
    );
  }
  return { ...plan, skipped: false, dryRun };
};

module.exports = {
  buildWikiRevisionRetentionPlan,
  collectPageRetentionReferences,
  pruneWikiRevisionHistory
};
