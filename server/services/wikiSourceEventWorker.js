const { processWikiSourceEvent } = require('./wikiMaintenanceOrchestrator');
const {
  claimUpdate,
  claimableEventQuery,
  isClockEventQuery,
  now
} = require('./wikiSourceEventLease');

const claimPendingWikiSourceEvents = async ({
  WikiSourceEvent,
  userId,
  limit = 5,
  at = now()
} = {}) => {
  if (!WikiSourceEvent || !userId) return [];
  const claimed = [];
  const max = Math.max(1, Math.min(Number(limit) || 5, 25));
  const baseQuery = {
    userId,
    ...claimableEventQuery(at)
  };
  const claimPasses = [
    { ...baseQuery, ...isClockEventQuery() },
    baseQuery
  ];
  for (let i = 0; i < max; i += 1) {
    let event = null;
    for (const query of claimPasses) {
      event = await WikiSourceEvent.findOneAndUpdate(
        query,
        claimUpdate(at),
        { sort: { createdAt: 1 }, new: true }
      );
      if (event) break;
    }
    if (!event) break;
    claimed.push(event);
  }
  return claimed;
};

const processPendingWikiSourceEvents = async ({
  userId,
  models = {},
  limit = 5,
  buildUniqueSlug = null,
  processWikiSourceEventFn = processWikiSourceEvent,
  wikiSchemaContent = ''
} = {}) => {
  const { WikiSourceEvent } = models;
  const events = await claimPendingWikiSourceEvents({ WikiSourceEvent, userId, limit });
  const results = [];
  for (const event of events) {
    try {
      results.push(await processWikiSourceEventFn({
        sourceEvent: event,
        userId,
        models,
        buildUniqueSlug,
        wikiSchemaContent
      }));
    } catch (error) {
      results.push({ event, error: error.message || 'Failed to process wiki source event.' });
    }
  }
  return results;
};

const dueSourceEventQuery = (at = now()) => claimableEventQuery(at);

const orderUserIdsForDrain = async ({ WikiSourceEvent, at = now() } = {}) => {
  const dueQuery = dueSourceEventQuery(at);
  const [clockUserIds, allUserIds] = await Promise.all([
    WikiSourceEvent.distinct('userId', { ...dueQuery, ...isClockEventQuery() }),
    WikiSourceEvent.distinct('userId', dueQuery)
  ]);
  const clockSet = new Set((clockUserIds || []).map(id => String(id)));
  const ordered = [...clockUserIds];
  (allUserIds || []).forEach((userId) => {
    if (!clockSet.has(String(userId))) ordered.push(userId);
  });
  return ordered;
};

const drainWikiSourceEventQueue = async ({
  models = {},
  limit = 20,
  perUserLimit = 5,
  buildUniqueSlug = null,
  processWikiSourceEventFn = processWikiSourceEvent,
  wikiSchemaContent = '',
  at = now()
} = {}) => {
  const { WikiSourceEvent } = models;
  if (!WikiSourceEvent) return { processed: 0, failed: 0, results: [] };
  const max = Math.max(1, Math.min(Number(limit) || 20, 100));
  const userIds = await orderUserIdsForDrain({ WikiSourceEvent, at });
  const results = [];
  for (const userId of userIds) {
    if (results.length >= max) break;
    const remaining = max - results.length;
    const next = await processPendingWikiSourceEvents({
      userId,
      models,
      limit: Math.min(Math.max(1, Number(perUserLimit) || 5), remaining),
      buildUniqueSlug,
      processWikiSourceEventFn,
      wikiSchemaContent
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
  dueSourceEventQuery,
  processPendingWikiSourceEvents
};
