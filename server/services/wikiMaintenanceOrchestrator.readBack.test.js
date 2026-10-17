const assert = require('assert');
const reading = require('./readingTalksBack');

/* Reading talks back is read the moment a piece lands, beside maintenance and
   not behind it, and only once: a retried or deferred event was already read. */
const read = [];
reading.proposeFromReading = async ({ event }) => { read.push(String(event._id)); return []; };
const { processWikiSourceEvent } = require('./wikiMaintenanceOrchestrator');

const marks = new Map();
const models = {
  WikiPage: {},
  WikiSourceEvent: {
    findOne: async () => null,
    updateOne: async ({ _id }, update) => {
      if (marks.has(_id)) return { modifiedCount: 0 };
      marks.set(_id, update.$set['metadata.readBackAt']);
      return { modifiedCount: 1 };
    }
  }
};
const settle = promise => promise.then(() => 'ok', () => 'failed');

(async () => {
  const event = { _id: 'event-1', userId: 'reader-1', sourceType: 'article', sourceObjectId: 'article-1' };
  await settle(processWikiSourceEvent({ userId: 'reader-1', sourceEvent: event, models }));
  await settle(processWikiSourceEvent({ userId: 'reader-1', sourceEvent: event, models }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepStrictEqual(read, ['event-1'], 'read once, even though maintenance failed and the event came round again');
  assert.ok(marks.get('event-1') instanceof Date, 'the event remembers when it was read');

  await settle(processWikiSourceEvent({ userId: 'reader-1', models }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepStrictEqual(read, ['event-1'], 'no event, nothing to read');
  console.log('wikiMaintenanceOrchestrator.readBack: ok');
})().catch((error) => { console.error(error); process.exit(1); });
