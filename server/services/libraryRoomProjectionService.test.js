const assert = require('assert');
const { buildLibraryRoomProjection } = require('./libraryRoomProjectionService');

class Query {
  constructor(rows) { this.rows = rows; }
  select() { return this; }
  sort() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.rows).then(resolve, reject); }
}

const matches = (row, query = {}) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return (value || []).some((clause) => matches(row, clause));
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    if ('$nin' in value) return !value.$nin.map(String).includes(String(row[key] ?? ''));
    if ('$ne' in value) return String(row[key] ?? '') !== String(value.$ne ?? '');
    if ('$exists' in value) return Boolean(row[key]) === Boolean(value.$exists);
    if ('$in' in value) return value.$in.map(String).includes(String(row[key]));
  }
  return String(row[key] ?? '') === String(value ?? '');
});

const NEWS = '64f100000000000000000041';
const WORK = '64f100000000000000000042';
const USER = '64f100000000000000000001';

const articles = [
  {
    _id: 'imbox',
    userId: USER,
    title: 'Costco 10-K',
    folder: WORK,
    placement: 'stream',
    updatedAt: '2026-08-10T00:00:00.000Z'
  },
  {
    _id: 'feed',
    userId: USER,
    title: 'Weekly letter',
    folder: NEWS,
    placement: 'stream',
    updatedAt: '2026-08-20T00:00:00.000Z'
  },
  {
    _id: 'parked-feed',
    userId: USER,
    title: 'Parked letter',
    folder: NEWS,
    placement: 'later',
    placementAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z'
  }
];

const Article = {
  countDocuments: async (query = {}) => articles.filter((row) => matches(row, query)).length,
  find: (query = {}) => new Query(articles.filter((row) => matches(row, query))),
  aggregate: async (pipeline = []) => {
    const match = pipeline.find((stage) => stage.$match)?.$match || {};
    const group = pipeline.find((stage) => stage.$group)?.$group;
    const matched = articles.filter((row) => matches(row, match));
    if (!group) return matched;
    const buckets = new Map();
    matched.forEach((row) => {
      const key = String(row[String(group._id).replace('$', '')] || row.folder);
      const current = buckets.get(key) || { _id: row.folder, count: 0, arrivedAt: row.updatedAt };
      current.count += 1;
      if (new Date(row.updatedAt) > new Date(current.arrivedAt || 0)) current.arrivedAt = row.updatedAt;
      buckets.set(key, current);
    });
    return [...buckets.values()];
  }
};

const run = async () => {
  const room = await buildLibraryRoomProjection({
    userId: USER,
    models: {
      Article,
      NotebookEntry: { find: () => new Query([]), countDocuments: async () => 0 }
    },
    getFoldersWithCounts: async () => [
      { _id: NEWS, name: 'Newsletters', asFeed: true, articleCount: 2 },
      { _id: WORK, name: 'Costco', asFeed: false, articleCount: 1 }
    ]
  });

  assert.strictEqual(room.shelves.counts.articles, 1, 'Imbox count excludes feed-home');
  assert.strictEqual(room.shelves.counts.laterArticles, 1);
  assert.ok(Array.isArray(room.shelves.feedTopics));
  assert.deepStrictEqual(room.shelves.feedTopics.map((topic) => topic.id), [NEWS]);
  assert.strictEqual(room.shelves.feedTopics[0].name, 'Newsletters');
  assert.ok(!room.shelves.feedTopics.some((topic) => /feed/i.test(topic.name)));
};

run()
  .then(() => console.log('libraryRoomProjection feed tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
