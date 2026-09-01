const assert = require('assert');
const { FEED_RAIL_CAP, firstGraphOf, rankFeedTopics } = require('./feedHome');

assert.strictEqual(
  firstGraphOf('<p>The morning paper has a finished lead. The second sentence keeps running with extra material about sources, graph drift, and multiple page updates that would otherwise get cut awkwardly in the middle of the thought.</p>'),
  'The morning paper has a finished lead.'
);

const topics = rankFeedTopics(
  [
    { _id: 'empty', name: 'Quiet', asFeed: true },
    { _id: 'tray', name: 'Needs Review', asFeed: true },
    { _id: 'news', name: 'Newsletters', asFeed: true },
    { _id: 'macro', name: 'Macro', asFeed: true }
  ],
  [
    { _id: 'news', count: 2, arrivedAt: '2026-08-20T00:00:00.000Z' },
    { _id: 'macro', count: 1, arrivedAt: '2026-07-01T00:00:00.000Z' },
    { _id: 'tray', count: 4, arrivedAt: '2026-08-31T00:00:00.000Z' }
  ]
);

assert.deepStrictEqual(topics.map((topic) => topic.id), ['news', 'macro']);
assert.strictEqual(topics[0].name, 'Newsletters');
assert.ok(FEED_RAIL_CAP >= 7);
assert.deepStrictEqual(rankFeedTopics([], []), []);

console.log('feedHome tests passed');
