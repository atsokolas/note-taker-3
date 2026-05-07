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

module.exports = {
  claimPendingWikiSourceEvents,
  processPendingWikiSourceEvents
};
