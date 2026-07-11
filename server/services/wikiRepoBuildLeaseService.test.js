const assert = require('assert');
const {
  acquireRepoBuildLease,
  releaseRepoBuildLease
} = require('./wikiRepoBuildLeaseService');

const getPath = (object, path) => String(path).split('.').reduce((value, key) => value?.[key], object);
const setPath = (object, path, value) => {
  const parts = String(path).split('.');
  const last = parts.pop();
  const target = parts.reduce((cursor, key) => {
    cursor[key] = cursor[key] || {};
    return cursor[key];
  }, object);
  target[last] = value;
};
const matches = (record, query) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some(part => matches(record, part));
  const actual = getPath(record, key);
  if (value && typeof value === 'object' && value.$ne !== undefined) return actual !== value.$ne;
  if (value && typeof value === 'object' && value.$exists !== undefined) return value.$exists ? actual !== undefined : actual === undefined;
  if (value && typeof value === 'object' && value.$lte !== undefined) return new Date(actual || 0) <= new Date(value.$lte);
  return String(actual ?? '') === String(value ?? '');
});
const makeModel = (page) => ({
  findOneAndUpdate: async (query, update) => {
    if (!matches(page, query)) return null;
    Object.entries(update.$set || {}).forEach(([path, value]) => setPath(page, path, value));
    return page;
  }
});

const run = async () => {
  const page = {
    _id: 'page-1',
    userId: 'user-1',
    status: 'draft',
    externalWatches: { githubRepo: { buildLease: { token: '', expiresAt: null } } }
  };
  const WikiPage = makeModel(page);
  const first = await acquireRepoBuildLease({
    WikiPage,
    pageId: page._id,
    userId: page.userId,
    headSha: 'head-a',
    token: 'lease-a',
    now: new Date('2026-07-10T12:00:00Z')
  });
  assert.strictEqual(first.acquired, true);
  assert.strictEqual(page.externalWatches.githubRepo.buildStatus, 'building');
  const duplicate = await acquireRepoBuildLease({
    WikiPage,
    pageId: page._id,
    userId: page.userId,
    headSha: 'head-a',
    token: 'lease-b',
    now: new Date('2026-07-10T12:01:00Z')
  });
  assert.strictEqual(duplicate.acquired, false);
  const released = await releaseRepoBuildLease({
    WikiPage,
    pageId: page._id,
    userId: page.userId,
    token: 'lease-a',
    headSha: 'head-a',
    promoted: true,
    now: new Date('2026-07-10T12:02:00Z')
  });
  assert.ok(released);
  assert.strictEqual(page.externalWatches.githubRepo.publishedHeadSha, 'head-a');
  assert.strictEqual(page.externalWatches.githubRepo.buildLease.token, '');
  console.log('wikiRepoBuildLeaseService tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
