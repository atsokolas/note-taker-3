const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { runDailyWikiRetention, acquireWikiWriteBudget, readWikiStorageStatus, STATE_ID, DAY_MS } = require('../server/services/wikiAutomaticRetentionService');
const { readRetentionReferences } = require('../server/services/wikiRetentionReferences');

(async () => {
  const uri = process.env.WIKI_STORAGE_TEST_URI;
  if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri)) throw new Error('Set WIKI_STORAGE_TEST_URI to an isolated local MongoDB.');
  const client = await new MongoClient(uri).connect();
  const db = client.db(`noeis_retention_test_${process.pid}`);
  const ids = Array.from({ length: 16 }, () => new ObjectId());
  const userId = new ObjectId(), pageId = new ObjectId(), now = new Date();
  try {
    await db.collection('wikipages').insertOne({ _id: pageId, userId, updatedAt: now, title: 'Unchanged current page', aiState: { maintenanceCandidateRevisionId: ids[4] } });
    const originals = ids.map((_id, index) => ({
      _id, userId, pageId, createdAt: new Date(now.getTime() - index * DAY_MS), updatedAt: now,
      actorType: index === 5 ? 'user' : 'agent', reason: 'agent_maintenance', promotionStatus: 'promoted',
      summary: `Version ${index}`, before: { plainText: 'old'.repeat(10000) }, after: { plainText: `Version ${index}`.repeat(10000) },
      ...(index === 8 ? { snapshotHistoryArchive: { data: Buffer.alloc(1000), format: 'test' } } : {})
    }));
    await db.collection('wikirevisions').insertMany(originals);
    await db.collection('noeisreceipts').insertOne({ nested: [{ proof: { revisionId: ids[6] } }] });
    await db.collection('wikimaintenanceruns').insertMany([
      { status: 'completed', metadata: { revisionId: ids[7] } },
      { status: 'needs_review', metadata: { revisionId: ids[9] } }
    ]);
    const plan = await runDailyWikiRetention({ db, now, dryRun: true });
    assert(plan.eligible > 0); assert.equal(plan.expired, 0);
    assert.equal(await db.collection('wikistoragestate').countDocuments(), 0, 'dry run writes nothing');
    await db.collection('wikistoragestate').insertOne({ _id: STATE_ID, nextRunAt: new Date(now.getTime() + DAY_MS) });
    const budget = await acquireWikiWriteBudget(db);
    assert(budget.allowed);
    assert.equal((await acquireWikiWriteBudget(db)).allowed, false, 'concurrent growth waits');
    await db.collection('wikistoragestate').updateOne({ _id: STATE_ID }, { $set: { nextRunAt: now } });
    assert((await runDailyWikiRetention({ db, now })).skipped, 'cleanup waits for automatic writes');
    const eventId = new ObjectId();
    await db.collection('wikisourceevents').insertOne({ _id: eventId, userId, status: 'processing', lockedAt: now });
    const { processWikiSourceEvent } = require('../server/services/wikiMaintenanceOrchestrator');
    const deferred = await processWikiSourceEvent({ userId,
      sourceEvent: { _id: eventId, status: 'processing', lockedAt: now },
      models: { WikiPage: { db: { db } }, WikiSourceEvent: { updateOne: (...args) => db.collection('wikisourceevents').updateOne(...args) } }
    });
    assert(deferred.deferred);
    const queuedEvent = await db.collection('wikisourceevents').findOne({ _id: eventId });
    assert.equal(queuedEvent.status, 'pending'); assert.equal(queuedEvent.lockedAt, null);
    const { drainScheduledWikiMaintenance } = require('../server/services/wikiScheduledMaintenanceWorker');
    const deferredPage = await drainScheduledWikiMaintenance({ models: { WikiPage: {
      db: { db }, find: () => ({ sort: () => ({ limit: async () => [{ _id: pageId, userId }] }) })
    } } });
    assert.equal(deferredPage.results[0].reason, 'storage_work_in_progress');
    await budget.release();
    assert.equal((await acquireWikiWriteBudget(db)).reason, 'daily_cleanup_due', 'due cleanup cannot be starved by a busy queue');
    let scans = 0;
    const result = await runDailyWikiRetention({ db, now, readReferences: async database => {
      scans++;
      if (scans === 2) {
        await database.collection('noeisreceipts').insertOne({ newlyAccepted: ids[10] });
        await database.collection('wikirevisions').updateOne({ _id: ids[11] }, { $set: {
          updatedAt: new Date(now.getTime() + 1), claimReview: { version: 1, state: 'accepted' }
        } });
      }
      return readRetentionReferences(database);
    } });
    assert(result.expired > 0); assert(result.payloadBytesReclaimed > 0);
    for (const index of [0, 1, 2, 4, 5, 6, 9, 10, 11]) {
      assert((await db.collection('wikirevisions').findOne({ _id: ids[index] })).after, `protected ${index}`);
    }
    const expired = await db.collection('wikirevisions').find({ snapshotPrunedAt: { $ne: null } }).toArray();
    assert(expired.some(row => row._id.equals(ids[7])), 'terminal job links do not retain obsolete bodies');
    for (const row of expired) {
      assert.equal(row.after, null); assert.equal(row.before, null); assert.equal(row.snapshotHistoryArchive, undefined);
      const original = originals.find(value => value._id.equals(row._id));
      const { before, after, snapshotHistoryArchive, ...metadata } = original;
      const { before: ignoredBefore, after: ignoredAfter, snapshotPrunedAt, snapshotExpiryPolicy, ...remaining } = row;
      assert.deepEqual(remaining, metadata, 'all other native metadata remains exact');
      assert.equal(snapshotExpiryPolicy, STATE_ID);
    }
    assert.equal(await db.collection('wikirevisions').countDocuments(), originals.length);
    assert.equal((await db.collection('wikipages').findOne({ _id: pageId })).title, 'Unchanged current page');
    assert((await runDailyWikiRetention({ db, now: new Date(now.getTime() + DAY_MS - 1) })).skipped, 'restart cannot run early');
    const next = await runDailyWikiRetention({ db, now: new Date(now.getTime() + DAY_MS) });
    assert(!next.skipped, 'next daily pass runs');
    const state = db.collection('wikistoragestate');
    await state.updateOne({ _id: STATE_ID }, { $set: { nextRunAt: new Date(0) } });
    await assert.rejects(runDailyWikiRetention({ db, now, readReferences: async () => { throw new Error('scan interrupted'); } }), /scan interrupted/);
    assert.equal((await readWikiStorageStatus(db)).status, 'failed');
    assert.equal((await state.findOne({ _id: STATE_ID })).lease, undefined, 'failed pass releases lease');
    // A denied/partial metric must leave background work queued without starting it.
    const partialDb = { collection: name => db.collection(name), command: async () => ({ dataSize: 1, indexSize: 1 }) };
    assert.equal((await acquireWikiWriteBudget(partialDb)).allowed, false);
    const fullDb = { collection: name => db.collection(name), admin: () => ({ listDatabases: async () => ({ databases: [{ name: 'pressure' }] }) }),
      client: { db: () => ({ command: async () => ({ dataSize: 401 * 1024 * 1024, indexSize: 0 }) }) }, command: async () => ({}) };
    assert.equal((await acquireWikiWriteBudget(fullDb)).allowed, false);
    assert((await readWikiStorageStatus(db)).backgroundPaused);
    const resumed = await acquireWikiWriteBudget(db); assert(resumed.allowed); await resumed.release();
    console.log(JSON.stringify({ passed: true, expired: result.expired, payloadBytesReclaimed: result.payloadBytesReclaimed,
      checks: 'real Mongo: references, review race, native metadata, daily cadence, concurrent workers, interruption, pressure and recovery' }));
  } finally {
    await db.dropDatabase();
    await client.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
