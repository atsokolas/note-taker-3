const assert = require('assert');
const {
  armGitHubRepoWatchForPage,
  drainDueGitHubRepoWatches,
  dueGitHubRepoWatchQuery,
  isUsefulDocPath,
  parseGitHubRepo,
  selectRepoDocEntries
} = require('./githubRepoWatcherService');

const makeFetch = () => async (url) => {
  const value = String(url);
  if (value.endsWith('/repos/openai/agents-js')) {
    return {
      ok: true,
      json: async () => ({
        full_name: 'openai/agents-js',
        private: false,
        description: 'Agents SDK for TypeScript',
        default_branch: 'main'
      })
    };
  }
  if (value.endsWith('/repos/openai/agents-js/branches/main')) {
    return {
      ok: true,
      json: async () => ({
        commit: { sha: 'abc1234567890abcdef' }
      })
    };
  }
  if (value.includes('/git/trees/abc1234567890abcdef')) {
    return {
      ok: true,
      json: async () => ({
        tree: [
          { path: 'README.md', type: 'blob', sha: 'readme-sha', size: 1200 },
          { path: 'docs/architecture.md', type: 'blob', sha: 'arch-sha', size: 800 },
          { path: 'src/index.ts', type: 'blob', sha: 'src-sha', size: 2000 },
          { path: 'CHANGELOG.md', type: 'blob', sha: 'changes-sha', size: 900 }
        ]
      })
    };
  }
  if (value.endsWith('/git/blobs/readme-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('# Agents JS\nAgent runtime docs.').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/arch-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('# Architecture\nRuns tools with handoffs.').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/changes-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('# Changelog\nv1 shipped.').toString('base64') }) };
  }
  if (value.endsWith('/releases/latest')) {
    return {
      ok: true,
      json: async () => ({
        tag_name: 'v1.2.3',
        name: 'Agents JS v1.2.3',
        body: 'Added durable sessions.',
        published_at: '2026-07-03T00:00:00Z',
        html_url: 'https://github.com/openai/agents-js/releases/tag/v1.2.3'
      })
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

class FakeWikiSourceEvent {
  constructor(payload = {}) {
    Object.assign(this, payload);
    this._id = `event-${FakeWikiSourceEvent.rows.length + 1}`;
    this.status = this.status || 'pending';
  }

  async save() {
    FakeWikiSourceEvent.rows.push(this);
    return this;
  }

  static reset() {
    FakeWikiSourceEvent.rows = [];
  }

  static findOne(query = {}) {
    const row = FakeWikiSourceEvent.rows.find(event => (
      String(event.userId) === String(query.userId)
      && event.provider === query.provider
      && event.externalId === query.externalId
    ));
    return {
      select: () => ({
        lean: async () => (row ? { _id: row._id } : null)
      })
    };
  }
}
FakeWikiSourceEvent.rows = [];

const makePage = () => ({
  _id: '507f1f77bcf86cd799439031',
  userId: 'user-1',
  title: 'Agents JS repo wiki',
  status: 'draft',
  externalWatches: {},
  markModified(field) {
    this.marked = field;
  },
  async save() {
    this.saved = true;
    return this;
  }
});

class FakeWikiPage {
  static page = makePage();
  static pages = [];

  static findOne() {
    return Promise.resolve(FakeWikiPage.page);
  }

  static find(query = {}) {
    FakeWikiPage.lastQuery = query;
    return {
      sort: () => ({
        limit: async (limit) => FakeWikiPage.pages.slice(0, limit)
      })
    };
  }
}

const run = async () => {
  assert.deepStrictEqual(parseGitHubRepo('https://github.com/openai/agents-js'), { owner: 'openai', repo: 'agents-js' });
  assert.deepStrictEqual(parseGitHubRepo('openai/agents-js'), { owner: 'openai', repo: 'agents-js' });
  assert.strictEqual(isUsefulDocPath('README.md'), true);
  assert.strictEqual(isUsefulDocPath('docs/architecture.md'), true);
  assert.strictEqual(isUsefulDocPath('src/index.ts'), false);
  assert.deepStrictEqual(
    selectRepoDocEntries([
      { path: 'docs/usage.md', type: 'blob' },
      { path: 'README.md', type: 'blob' },
      { path: 'src/index.ts', type: 'blob' }
    ]).map(entry => entry.path),
    ['README.md', 'docs/usage.md']
  );

  FakeWikiSourceEvent.reset();
  FakeWikiPage.page = makePage();
  const result = await armGitHubRepoWatchForPage({
    WikiPage: FakeWikiPage,
    WikiSourceEvent: FakeWikiSourceEvent,
    userId: 'user-1',
    pageId: '507f1f77bcf86cd799439031',
    repo: 'openai/agents-js',
    fetchImpl: makeFetch(),
    now: () => new Date('2026-07-04T00:00:00.000Z')
  });
  assert.strictEqual(result.snapshot.fullName, 'openai/agents-js');
  assert.strictEqual(result.snapshot.docs.length, 3);
  assert.strictEqual(result.events.length, 4);
  assert.strictEqual(FakeWikiSourceEvent.rows.length, 4);
  assert.strictEqual(FakeWikiPage.page.externalWatches.githubRepo.owner, 'openai');
  assert.strictEqual(FakeWikiPage.page.externalWatches.githubRepo.repo, 'agents-js');
  assert.strictEqual(FakeWikiPage.page.externalWatches.githubRepo.lastHeadSha, 'abc1234567890abcdef');
  assert.strictEqual(FakeWikiPage.page.externalWatches.githubRepo.lastReleaseTag, 'v1.2.3');
  assert.match(FakeWikiSourceEvent.rows[0].metadata.ref, /README\.md @ abc1234/);
  assert.match(FakeWikiSourceEvent.rows[0].text, /Agent runtime docs/);

  const second = await armGitHubRepoWatchForPage({
    WikiPage: FakeWikiPage,
    WikiSourceEvent: FakeWikiSourceEvent,
    userId: 'user-1',
    pageId: '507f1f77bcf86cd799439031',
    repo: 'openai/agents-js',
    fetchImpl: makeFetch(),
    now: () => new Date('2026-07-04T00:00:00.000Z')
  });
  assert.strictEqual(second.events.length, 0);
  assert.strictEqual(FakeWikiSourceEvent.rows.length, 4);

  const dueQuery = dueGitHubRepoWatchQuery({ cutoff: new Date('2026-07-04T00:00:00.000Z') });
  assert.strictEqual(dueQuery['externalWatches.githubRepo.status'], 'active');
  assert.deepStrictEqual(dueQuery.status, { $ne: 'archived' });

  const duePage = makePage();
  duePage.externalWatches = {
    githubRepo: {
      owner: 'openai',
      repo: 'agents-js',
      status: 'active',
      lastCheckedAt: new Date('2026-07-03T00:00:00.000Z')
    }
  };
  FakeWikiPage.pages = [duePage];
  const drained = await drainDueGitHubRepoWatches({
    models: { WikiPage: FakeWikiPage, WikiSourceEvent: FakeWikiSourceEvent },
    limit: 1,
    maxAgeMs: 60 * 60 * 1000,
    now: new Date('2026-07-04T00:00:00.000Z'),
    checkGitHubRepoWatchForPageFn: async ({ page }) => ({
      page,
      snapshot: { headSha: 'abc123' },
      events: [{ _id: 'event-1' }]
    })
  });
  assert.strictEqual(drained.processed, 1);
  assert.strictEqual(drained.failed, 0);
  assert.strictEqual(drained.results[0].sourceEvents, 1);
  assert.strictEqual(FakeWikiPage.lastQuery['externalWatches.githubRepo.status'], 'active');
};

run()
  .then(() => {
    console.log('githubRepoWatcherService tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
