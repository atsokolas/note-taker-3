const CLOCK_EVENT_PROVIDERS = ['sec-edgar', 'fmp-transcripts'];

const now = () => new Date();

const leaseStaleAfterMs = () => Math.max(
  60 * 1000,
  Number(process.env.WIKI_SOURCE_EVENT_LEASE_STALE_AFTER_MS || 30 * 60 * 1000)
);

const dueRetryAtQuery = (at = now()) => ({
  $or: [
    { nextAttemptAt: null },
    { nextAttemptAt: { $exists: false } },
    { nextAttemptAt: { $lte: at } }
  ]
});

const expiredProcessingLeaseQuery = (at = now()) => {
  const staleBefore = new Date(at.getTime() - leaseStaleAfterMs());
  return {
    status: 'processing',
    lockedAt: { $ne: null, $lte: staleBefore }
  };
};

const isClockEventQuery = () => ({
  provider: { $in: CLOCK_EVENT_PROVIDERS },
  affectedPageIds: { $exists: true, $ne: [] }
});

const claimableEventQuery = (at = now()) => ({
  $or: [
    {
      status: { $in: ['pending', 'failed'] },
      ...dueRetryAtQuery(at)
    },
    expiredProcessingLeaseQuery(at)
  ]
});

const hasActiveProcessingLease = (event, at = now()) => {
  if (!event || event.status !== 'processing' || !event.lockedAt) return false;
  const lockedAt = new Date(event.lockedAt);
  if (Number.isNaN(lockedAt.getTime())) return false;
  return at.getTime() - lockedAt.getTime() < leaseStaleAfterMs();
};

const isLegacyUnrecoverableProcessingRow = (event) => (
  event?.status === 'processing'
  && (event.lockedAt === null || event.lockedAt === undefined)
  && Number(event.attemptCount || 0) === 0
);

const isClockEventRecord = (event = {}) => (
  CLOCK_EVENT_PROVIDERS.includes(String(event.provider || '').trim())
  && Array.isArray(event.affectedPageIds)
  && event.affectedPageIds.length > 0
);

const claimUpdate = (at = now()) => ({
  $set: {
    status: 'processing',
    lockedAt: at,
    errorMessage: ''
  },
  $inc: { attemptCount: 1 }
});

module.exports = {
  CLOCK_EVENT_PROVIDERS,
  claimUpdate,
  claimableEventQuery,
  dueRetryAtQuery,
  expiredProcessingLeaseQuery,
  hasActiveProcessingLease,
  isClockEventQuery,
  isClockEventRecord,
  isLegacyUnrecoverableProcessingRow,
  leaseStaleAfterMs,
  now
};
