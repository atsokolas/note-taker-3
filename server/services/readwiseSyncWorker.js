const DEFAULT_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const MIN_MAX_AGE_MS = 15 * 60 * 1000;

const hasCredential = { $nin: ['', null] };

// Connected, holding something Readwise will accept, and not checked lately.
// A connection that was never synced is due too: that is the archive the
// reader expected when they connected.
const dueReadwiseQuery = (cutoff) => ({
  provider: 'readwise',
  status: 'connected',
  $and: [
    { $or: [{ encryptedApiToken: hasCredential }, { encryptedAccessToken: hasCredential }] },
    { $or: [{ lastSyncAt: null }, { lastSyncAt: { $lte: cutoff } }] }
  ]
});

const isAuthRejection = (error) => [401, 403].includes(Number(error?.response?.status));

/**
 * Bring every due Readwise connection up to date, one at a time, through the
 * same import the Sync button runs. A check that finds nothing new records
 * nothing but the time. A connection Readwise refuses is set aside until the
 * reader reconnects, rather than knocked on every half hour.
 */
const drainDueReadwiseSyncs = async ({
  IntegrationConnection,
  syncConnection,
  limit = 20,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  now = new Date()
} = {}) => {
  if (!IntegrationConnection || typeof syncConnection !== 'function') {
    return { processed: 0, failed: 0, importedHighlights: 0 };
  }
  const cutoff = new Date(now.getTime() - Math.max(MIN_MAX_AGE_MS, Number(maxAgeMs) || DEFAULT_MAX_AGE_MS));
  const connections = await IntegrationConnection.find(dueReadwiseQuery(cutoff))
    .sort({ lastSyncAt: 1 })
    .limit(Math.max(1, Math.min(Number(limit) || 20, 100)));

  let processed = 0;
  let failed = 0;
  let importedHighlights = 0;
  for (const connection of connections) {
    try {
      const { result } = await syncConnection({ connection, recordEmpty: false });
      processed += 1;
      importedHighlights += Number(result?.importedHighlights) || 0;
    } catch (error) {
      failed += 1;
      console.error(`[readwise-sync-worker] connection=${connection._id} failed: ${error.message}`);
      if (isAuthRejection(error)) {
        connection.status = 'error';
        connection.health = 'error';
        connection.lastError = 'This connection stopped working. Reconnect to keep new highlights coming in.';
        await connection.save().catch(() => {});
      }
    }
  }
  return { processed, failed, importedHighlights };
};

module.exports = {
  drainDueReadwiseSyncs,
  dueReadwiseQuery
};
