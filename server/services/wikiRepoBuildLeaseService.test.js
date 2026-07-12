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
  findOne: async (query) => (matches(page, query) ? page : null),
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
  assert.strictEqual(page.externalWatches.githubRepo.candidateGeneratorVersion, '');
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
  assert.strictEqual(page.externalWatches.githubRepo.publishedGeneratorVersion, '');

  const second = await acquireRepoBuildLease({
    WikiPage,
    pageId: page._id,
    userId: page.userId,
    headSha: 'head-a',
    token: 'lease-c',
    now: new Date('2026-07-10T12:03:00Z')
  });
  assert.strictEqual(second.acquired, true);
  page.externalWatches.githubRepo.lastHeadSha = 'head-b';
  await releaseRepoBuildLease({
    WikiPage,
    pageId: page._id,
    userId: page.userId,
    token: 'lease-c',
    headSha: 'head-a',
    promoted: true,
    now: new Date('2026-07-10T12:04:00Z')
  });
  assert.strictEqual(page.externalWatches.githubRepo.publishedHeadSha, 'head-a');
  assert.strictEqual(page.externalWatches.githubRepo.candidateHeadSha, 'head-b');
  assert.strictEqual(page.externalWatches.githubRepo.buildStatus, 'queued');

  page.externalWatches.githubRepo.buildLease = {
    token: '',
    headSha: '',
    acquiredAt: null,
    expiresAt: null
  };
  page.externalWatches.githubRepo.lastHeadSha = 'head-b';
  page.externalWatches.githubRepo.candidateHeadSha = 'head-b';
  page.externalWatches.githubRepo.buildStatus = 'building';
  const recovered = await releaseRepoBuildLease({
    WikiPage,
    pageId: page._id,
    userId: page.userId,
    token: 'lease-lost-by-watch-save',
    headSha: 'head-b',
    promoted: true,
    now: new Date('2026-07-10T12:05:00Z')
  });
  assert.ok(recovered);
  assert.strictEqual(page.externalWatches.githubRepo.publishedHeadSha, 'head-b');
  assert.strictEqual(page.externalWatches.githubRepo.candidateHeadSha, '');
  assert.strictEqual(page.externalWatches.githubRepo.buildStatus, 'ready');

  const versioned = await acquireRepoBuildLease({
    WikiPage,
    pageId: page._id,
    userId: page.userId,
    headSha: 'head-b',
    generatorVersion: 'repo-dossier-test-v2',
    token: 'lease-versioned',
    now: new Date('2026-07-10T12:06:00Z')
  });
  assert.strictEqual(versioned.acquired, true);
  assert.strictEqual(page.externalWatches.githubRepo.candidateGeneratorVersion, 'repo-dossier-test-v2');
  await releaseRepoBuildLease({
    WikiPage,
    pageId: page._id,
    userId: page.userId,
    token: 'lease-versioned',
    headSha: 'head-b',
    generatorVersion: 'repo-dossier-test-v2',
    promoted: true,
    now: new Date('2026-07-10T12:07:00Z')
  });
  assert.strictEqual(page.externalWatches.githubRepo.publishedHeadSha, 'head-b');
  assert.strictEqual(page.externalWatches.githubRepo.publishedGeneratorVersion, 'repo-dossier-test-v2');
  assert.strictEqual(page.externalWatches.githubRepo.candidateGeneratorVersion, '');
  console.log('wikiRepoBuildLeaseService tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
