const assert = require('assert');
const { processWikiSourceEvent } = require('./wikiMaintenanceOrchestrator');

/* Five highlights saved in thirteen seconds fired five maintenance passes at one
   page. Each loaded it, each spent minutes in the model, and each saved over a
   version the others had moved past; Mongoose rejected all but the first and the
   page kept none of the work. A pass has to build on the page the pass before it
   left, so passes for one reader run one at a time.

   The models here fail the event lookup on purpose: how far a pass gets is not
   the point, only whether one pass had begun before the pass before it ended. */
const tracingModels = (log, label, delayMs = 5) => ({
  WikiPage: {},
  WikiSourceEvent: {
    findOne: async () => {
      log.push(`enter:${label}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      log.push(`exit:${label}`);
      return null;
    }
  }
});

const swallow = promise => promise.then(() => 'ok', error => error.code || 'error');

(async () => {
  {
    const log = [];
    const results = await Promise.all([
      swallow(processWikiSourceEvent({ userId: 'reader-1', models: tracingModels(log, 'a', 12) })),
      swallow(processWikiSourceEvent({ userId: 'reader-1', models: tracingModels(log, 'b', 1) })),
      swallow(processWikiSourceEvent({ userId: 'reader-1', models: tracingModels(log, 'c', 1) }))
    ]);
    assert.deepStrictEqual(log, ['enter:a', 'exit:a', 'enter:b', 'exit:b', 'enter:c', 'exit:c']);
    // Arrival order, not completion order: 'a' is the slowest and still goes first.
    assert.deepStrictEqual(results, [
      'SOURCE_EVENT_NOT_FOUND', 'SOURCE_EVENT_NOT_FOUND', 'SOURCE_EVENT_NOT_FOUND'
    ]);
  }

  // One reader's backlog is not another reader's wait.
  {
    const log = [];
    await Promise.all([
      swallow(processWikiSourceEvent({ userId: 'reader-1', models: tracingModels(log, 'one', 12) })),
      swallow(processWikiSourceEvent({ userId: 'reader-2', models: tracingModels(log, 'two', 1) }))
    ]);
    assert.deepStrictEqual(log, ['enter:one', 'enter:two', 'exit:two', 'exit:one']);
  }

  // A pass that throws must not take the queue behind it down with it.
  {
    const log = [];
    const exploding = {
      WikiPage: {},
      WikiSourceEvent: { findOne: async () => { log.push('enter:boom'); throw new Error('mongo is having a day'); } }
    };
    const [first, second] = await Promise.all([
      swallow(processWikiSourceEvent({ userId: 'reader-3', models: exploding })),
      swallow(processWikiSourceEvent({ userId: 'reader-3', models: tracingModels(log, 'after', 1) }))
    ]);
    assert.strictEqual(first, 'error');
    assert.strictEqual(second, 'SOURCE_EVENT_NOT_FOUND');
    assert.deepStrictEqual(log, ['enter:boom', 'enter:after', 'exit:after']);
  }

  // The event lease still guards one event against being picked up twice.
  {
    const lockedEvent = {
      _id: 'event-1',
      userId: 'reader-5',
      status: 'processing',
      lockedAt: new Date(),
      processingLeaseExpiresAt: new Date(Date.now() + 60000)
    };
    const outcome = await swallow(processWikiSourceEvent({
      userId: 'reader-5',
      models: { WikiPage: {}, WikiSourceEvent: { findOne: async () => lockedEvent } }
    }));
    assert.strictEqual(outcome, 'SOURCE_EVENT_ACTIVE_LEASE');
  }

  console.log('wiki maintenance serialization tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
