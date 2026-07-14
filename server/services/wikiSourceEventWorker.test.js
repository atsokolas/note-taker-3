const assert = require('assert');
const mongoose = require('mongoose');
const {
  hasActiveProcessingLease,
  isLegacyUnrecoverableProcessingRow,
  leaseStaleAfterMs
} = require('./wikiSourceEventLease');
const {
  claimPendingWikiSourceEvents,
  drainWikiSourceEventQueue
} = require('./wikiSourceEventWorker');

const applyUpdate = (target, update = {}) => {
  if (update.$set) Object.assign(target, update.$set);
  if (update.$inc) {
    Object.entries(update.$inc).forEach(([key, value]) => {
      target[key] = Number(target[key] || 0) + Number(value || 0);
    });
  }
  return target;
};

const dueAt = (value, at) => {
  if (value === null || value === undefined) return true;
  return new Date(value).getTime() <= at.getTime();
};

const matchesQuery = (record, query = {}) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some(condition => matchesQuery(record, condition));
  if (value && typeof value === 'object' && value.$ne !== undefined) {
    const actual = record[key];
    if (Array.isArray(value.$ne) && Array.isArray(actual)) {
      return JSON.stringify(actual) !== JSON.stringify(value.$ne);
    }
    return actual !== value.$ne;
  }
  if (value && typeof value === 'object' && Array.isArray(value.$in)) {
    return value.$in.includes(record[key]);
  }
  if (value && typeof value === 'object' && value.$exists !== undefined) {
    const exists = record[key] !== undefined && record[key] !== null;
    if (Array.isArray(record[key]) && record[key].length === 0) return !value.$exists;
    return Boolean(value.$exists) === exists;
  }
  if (value && typeof value === 'object' && value.$lte !== undefined) {
    if (record[key] === undefined || record[key] === null) return false;
    return new Date(record[key]).getTime() <= new Date(value.$lte).getTime();
  }
  if (value && typeof value === 'object' && Array.isArray(value.$in)) {
    return value.$in.includes(record[key]);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return matchesQuery(record[key] || {}, value);
  }
  return String(record[key]) === String(value);
});

const isClockEvent = (event = {}) => (
  ['sec-edgar', 'fmp-transcripts'].includes(String(event.provider || ''))
  && Array.isArray(event.affectedPageIds)
  && event.affectedPageIds.length > 0
);

const createWikiSourceEventModel = (initialEvents = []) => {
  const events = initialEvents.map((event, index) => ({
    _id: event._id || new mongoose.Types.ObjectId(),
    attemptCount: 0,
    lockedAt: null,
    createdAt: new Date(`2026-07-14T10:00:0${index}.000Z`),
    ...event
  }));

  const sortEvents = (rows, query = {}) => {
    const clockFirst = query.provider?.$in;
    return [...rows].sort((a, b) => {
      if (clockFirst) {
        const aClock = isClockEvent(a) ? 0 : 1;
        const bClock = isClockEvent(b) ? 0 : 1;
        if (aClock !== bClock) return aClock - bClock;
      }
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
  };

  return {
    events,
    async findOneAndUpdate(query = {}, update = {}, options = {}) {
      const at = new Date(update.$set?.lockedAt || Date.now());
      const staleBefore = new Date(at.getTime() - leaseStaleAfterMs());
      const candidates = sortEvents(
        events.filter(event => (
          matchesQuery(event, query)
          && (
            (['pending', 'failed'].includes(event.status) && dueAt(event.nextAttemptAt, at))
            || (
              event.status === 'processing'
              && event.lockedAt
              && new Date(event.lockedAt).getTime() <= staleBefore.getTime()
            )
          )
        )),
        query
      );
      const event = candidates[0] || null;
      if (!event) return null;
      applyUpdate(event, update);
      return options.new === false ? null : event;
    },
    async distinct(field, query = {}) {
      return [...new Set(events
        .filter(event => matchesQuery(event, query))
        .map(event => event[field])
        .filter(Boolean)
        .map(value => String(value)))];
    }
  };
};

const run = async () => {
  const userId = new mongoose.Types.ObjectId();
  const pageId = new mongoose.Types.ObjectId();
  const at = new Date('2026-07-14T12:00:00.000Z');
  const staleMs = leaseStaleAfterMs();
  const freshLock = new Date(at.getTime() - Math.max(60 * 1000, staleMs - 60 * 1000));
  const expiredLock = new Date(at.getTime() - staleMs - 60 * 1000);

  const expiredModel = createWikiSourceEventModel([{
    userId,
    status: 'processing',
    provider: 'github-repo',
    lockedAt: expiredLock,
    attemptCount: 1,
    affectedPageIds: [pageId]
  }]);
  const [recovered] = await claimPendingWikiSourceEvents({
    WikiSourceEvent: expiredModel,
    userId,
    limit: 1,
    at
  });
  assert.ok(recovered, 'Expected expired lease event to be reclaimed.');
  assert.strictEqual(recovered.status, 'processing');
  assert.strictEqual(recovered.attemptCount, 2);
  assert.strictEqual(new Date(recovered.lockedAt).getTime(), at.getTime());

  const legacyModel = createWikiSourceEventModel([{
    userId,
    status: 'processing',
    provider: 'github-repo',
    lockedAt: null,
    attemptCount: 0,
    affectedPageIds: [pageId]
  }]);
  const legacyClaim = await claimPendingWikiSourceEvents({
    WikiSourceEvent: legacyModel,
    userId,
    limit: 1,
    at
  });
  assert.strictEqual(legacyClaim.length, 0, 'Legacy null-lock rows must remain untouched.');
  assert.ok(isLegacyUnrecoverableProcessingRow(legacyModel.events[0]));

  const priorityModel = createWikiSourceEventModel(
    Array.from({ length: 40 }, (_, index) => ({
      userId,
      status: 'pending',
      provider: 'github-repo',
      title: `github-doc-${index}`,
      affectedPageIds: [pageId],
      createdAt: new Date(`2026-07-14T08:00:${String(index).padStart(2, '0')}.000Z`)
    })).concat([
      {
        userId,
        status: 'pending',
        provider: 'sec-edgar',
        title: 'Alphabet 10-Q',
        affectedPageIds: [pageId],
        createdAt: new Date('2026-07-14T11:59:00.000Z')
      },
      {
        userId,
        status: 'pending',
        provider: 'fmp-transcripts',
        title: 'Alphabet Q2 transcript',
        affectedPageIds: [pageId],
        createdAt: new Date('2026-07-14T11:59:30.000Z')
      }
    ])
  );
  const priorityClaims = await claimPendingWikiSourceEvents({
    WikiSourceEvent: priorityModel,
    userId,
    limit: 2,
    at
  });
  assert.strictEqual(priorityClaims.length, 2);
  assert.strictEqual(priorityClaims[0].provider, 'sec-edgar');
  assert.strictEqual(priorityClaims[1].provider, 'fmp-transcripts');

  const activeLeaseModel = createWikiSourceEventModel([{
    userId,
    status: 'processing',
    provider: 'sec-edgar',
    lockedAt: freshLock,
    attemptCount: 1,
    affectedPageIds: [pageId]
  }]);
  const duplicateClaim = await claimPendingWikiSourceEvents({
    WikiSourceEvent: activeLeaseModel,
    userId,
    limit: 1,
    at
  });
  assert.strictEqual(duplicateClaim.length, 0, 'Active leases must not be reclaimed.');
  assert.ok(hasActiveProcessingLease(activeLeaseModel.events[0], at));

  let processedIds = [];
  const drainModel = createWikiSourceEventModel(
    Array.from({ length: 25 }, (_, index) => ({
      userId,
      status: 'pending',
      provider: 'github-repo',
      title: `drain-github-${index}`,
      affectedPageIds: [pageId],
      createdAt: new Date(`2026-07-14T07:00:${String(index).padStart(2, '0')}.000Z`)
    })).concat({
      userId,
      status: 'pending',
      provider: 'fmp-transcripts',
      title: 'Drain transcript',
      affectedPageIds: [pageId],
      createdAt: new Date('2026-07-14T11:58:00.000Z')
    })
  );
  const drain = await drainWikiSourceEventQueue({
    models: { WikiSourceEvent: drainModel },
    limit: 3,
    perUserLimit: 3,
    at,
    processWikiSourceEventFn: async ({ sourceEvent }) => {
      processedIds.push(String(sourceEvent.provider));
      return { event: sourceEvent, pages: [] };
    }
  });
  assert.strictEqual(drain.processed, 3);
  assert.strictEqual(processedIds[0], 'fmp-transcripts');
  assert.ok(processedIds.slice(1).every(provider => provider === 'github-repo'));

  console.log('wikiSourceEventWorker.test.js passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
