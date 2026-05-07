const { processWikiSourceEvent } = require('./wikiMaintenanceOrchestrator');

const now = () => new Date();

const claimPendingWikiSourceEvents = async ({ WikiSourceEvent, userId, limit = 5 } = {}) => {
  if (!WikiSourceEvent || !userId) return [];
  const claimed = [];
  const max = Math.max(1, Math.min(Number(limit) || 5, 25));
  for (let i = 0; i < max; i += 1) {
    const event = await WikiSourceEvent.findOneAndUpdate(
      {
        userId,
        status: { $in: ['pending', 'failed'] },
        $or: [
          { nextAttemptAt: null },
          { nextAttemptAt: { $exists: false } },
          { nextAttemptAt: { $lte: now() } }
        ]
      },
      {
        $set: {
          status: 'processing',
          lockedAt: now(),
          errorMessage: ''
        },
        $inc: { attemptCount: 1 }
      },
      { sort: { createdAt: 1 }, new: true }
    );
    if (!event) break;
    claimed.push(event);
  }
  return claimed;
};

const processPendingWikiSourceEvents = async ({
  userId,
  models = {},
  limit = 5,
  buildUniqueSlug = null
} = {}) => {
  const { WikiSourceEvent } = models;
  const events = await claimPendingWikiSourceEvents({ WikiSourceEvent, userId, limit });
  const results = [];
  for (const event of events) {
    try {
      results.push(await processWikiSourceEvent({
        sourceEvent: event,
        userId,
        models,
        buildUniqueSlug
      }));
    } catch (error) {
      results.push({ event, error: error.message || 'Failed to process wiki source event.' });
    }
  }
  return results;
};

const dueSourceEventQuery = () => ({
  status: { $in: ['pending', 'failed'] },
  $or: [
    { nextAttemptAt: null },
    { nextAttemptAt: { $exists: false } },
    { nextAttemptAt: { $lte: now() } }
  ]
});

const drainWikiSourceEventQueue = async ({
  models = {},
  limit = 20,
  perUserLimit = 5,
  buildUniqueSlug = null
} = {}) => {
  const { WikiSourceEvent } = models;
  if (!WikiSourceEvent) return { processed: 0, failed: 0, results: [] };
  const max = Math.max(1, Math.min(Number(limit) || 20, 100));
  const userIds = await WikiSourceEvent.distinct('userId', dueSourceEventQuery());
  const results = [];
  for (const userId of userIds) {
    if (results.length >= max) break;
    const remaining = max - results.length;
    const next = await processPendingWikiSourceEvents({
      userId,
      models,
      limit: Math.min(Math.max(1, Number(perUserLimit) || 5), remaining),
      buildUniqueSlug
    });
    results.push(...next);
  }
  return {
    processed: results.filter(result => !result.error).length,
    failed: results.filter(result => result.error).length,
    results
  };
};

module.exports = {
  claimPendingWikiSourceEvents,
  drainWikiSourceEventQueue,
  processPendingWikiSourceEvents
};
