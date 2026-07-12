const assert = require('assert');
const {
  armGitHubRepoWatchForPage,
  checkGitHubRepoHeadForPage,
  drainDueGitHubRepoWatches,
  dueGitHubRepoWatchQuery,
  classifyRepoDocClass,
  isUsefulDocPath,
  isUsefulRepoEvidencePath,
  parseGitHubRepo,
  selectRepoDocEntries,
  selectRepoEvidenceEntries
} = require('./githubRepoWatcherService');
const { REPO_WIKI_GENERATOR_VERSION } = require('./repoWikiGeneratorVersion');

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
          { path: 'package.json', type: 'blob', sha: 'package-sha', size: 900 },
          { path: '.github/workflows/ci.yml', type: 'blob', sha: 'ci-sha', size: 700 },
          { path: 'README.md', type: 'blob', sha: 'readme-sha', size: 1200 },
          { path: 'docs/architecture.md', type: 'blob', sha: 'arch-sha', size: 800 },
          { path: 'src/index.ts', type: 'blob', sha: 'src-sha', size: 2000 },
          { path: 'server/server.js', type: 'blob', sha: 'server-sha', size: 2000 },
          { path: 'server/routes/wikiRoutes.js', type: 'blob', sha: 'wiki-routes-sha', size: 4200 },
          { path: 'server/routes/agentActionRoutes.test.js', type: 'blob', sha: 'route-test-sha', size: 1000 },
          { path: 'server/services/wikiMaintenanceService.js', type: 'blob', sha: 'wiki-maintenance-sha', size: 3600 },
          { path: 'server/services/githubRepoWatcherService.js', type: 'blob', sha: 'github-watch-sha', size: 3200 },
          { path: 'web/src/App.tsx', type: 'blob', sha: 'app-sha', size: 2000 },
          { path: 'web/src/api/wiki.ts', type: 'blob', sha: 'wiki-api-sha', size: 1400 },
          { path: 'web/src/components/wiki/WikiPageReadView.tsx', type: 'blob', sha: 'wiki-read-sha', size: 2300 },
          { path: 'CHANGELOG.md', type: 'blob', sha: 'changes-sha', size: 900 }
        ]
      })
    };
  }
  if (value.endsWith('/git/blobs/package-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('{"scripts":{"start":"node server/server.js","test":"node --test"}}').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/ci-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/readme-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('# Agents JS\nAgent runtime docs.').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/arch-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('# Architecture\nRuns tools with handoffs.').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/src-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('export function runAgent() { return "ok"; }').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/server-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('const express = require("express"); const app = express();').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/wiki-routes-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('router.post("/api/wiki/pages/:id/ai/draft/stream", streamWikiDraft); router.post("/api/wiki/pages/from-github", createRepoWikiFromGitHub);').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/route-test-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('test("route harness", () => expect(true).toBe(true));').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/wiki-maintenance-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('async function maintainWikiPage(page) { return buildGroundedWikiArticle(page); }').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/github-watch-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('async function armGitHubRepoWatchForPage() { return ingestRepositoryEvidence(); }').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/app-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('export function App() { return null; }').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/wiki-api-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('export async function createRepoWikiFromGitHub(repo) { return api.post("/api/wiki/pages/from-github", { repo }); }').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/wiki-read-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('export function WikiPageReadView({ page }) { return <article>{page.title}</article>; }').toString('base64') }) };
  }
  if (value.endsWith('/git/blobs/changes-sha')) {
    return { ok: true, json: async () => ({ content: Buffer.from('# Changelog\nv1 shipped.').toString('base64') }) };
  }
  if (value.includes('/commits?sha=main')) {
    return {
      ok: true,
      json: async () => ([{
        sha: 'abc1234567890abcdef',
        commit: {
          message: 'Add durable sessions',
          author: { name: 'Test Author', date: '2026-07-03T00:00:00Z' }
        },
        html_url: 'https://github.com/openai/agents-js/commit/abc1234567890abcdef'
      }])
    };
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
      lean: async () => row || null,
      select: () => ({
        lean: async () => row || null
      })
    };
  }

  static async findOneAndUpdate(query = {}, update = {}) {
    const row = FakeWikiSourceEvent.rows.find(event => String(event._id) === String(query._id));
    if (!row) return null;
    Object.assign(row, update.$set || update);
    return row;
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

  const headOnlyCalls = [];
  const headOnlyPage = makePage();
  headOnlyPage.externalWatches = {
    githubRepo: {
      owner: 'openai',
      repo: 'agents-js',
      status: 'active',
      publishedHeadSha: 'older-head',
      buildStatus: 'ready'
    }
  };
  const headOnlyResult = await checkGitHubRepoHeadForPage({
    page: headOnlyPage,
    fetchImpl: async (url) => {
      headOnlyCalls.push(String(url));
      return makeFetch()(url);
    },
    now: () => new Date('2026-07-10T12:00:00.000Z')
  });
  assert.strictEqual(headOnlyResult.changed, true);
  assert.strictEqual(headOnlyCalls.length, 2);
  assert.strictEqual(headOnlyCalls.some(url => url.includes('/git/trees/')), false);
  assert.strictEqual(headOnlyPage.externalWatches.githubRepo.lastHeadSha, 'abc1234567890abcdef');
  assert.strictEqual(headOnlyPage.externalWatches.githubRepo.candidateHeadSha, 'abc1234567890abcdef');
  assert.strictEqual(headOnlyPage.externalWatches.githubRepo.buildStatus, 'queued');

  headOnlyPage.externalWatches.githubRepo.publishedHeadSha = 'abc1234567890abcdef';
  headOnlyPage.externalWatches.githubRepo.publishedGeneratorVersion = REPO_WIKI_GENERATOR_VERSION;
  const currentHeadResult = await checkGitHubRepoHeadForPage({
    page: headOnlyPage,
    fetchImpl: makeFetch(),
    now: () => new Date('2026-07-10T12:15:00.000Z')
  });
  assert.strictEqual(currentHeadResult.changed, false);
  assert.strictEqual(headOnlyPage.externalWatches.githubRepo.candidateHeadSha, '');
  assert.strictEqual(headOnlyPage.externalWatches.githubRepo.buildStatus, 'ready');
  headOnlyPage.externalWatches.githubRepo.publishedGeneratorVersion = 'old-repo-dossier-agent';
  const staleGeneratorResult = await checkGitHubRepoHeadForPage({
    page: headOnlyPage,
    fetchImpl: makeFetch(),
    now: () => new Date('2026-07-10T12:20:00.000Z')
  });
  assert.strictEqual(staleGeneratorResult.changed, true);
  assert.strictEqual(headOnlyPage.externalWatches.githubRepo.candidateHeadSha, 'abc1234567890abcdef');
  assert.strictEqual(headOnlyPage.externalWatches.githubRepo.candidateGeneratorVersion, REPO_WIKI_GENERATOR_VERSION);
  assert.strictEqual(headOnlyPage.externalWatches.githubRepo.buildStatus, 'queued');
  headOnlyPage.externalWatches.githubRepo.publishedGeneratorVersion = REPO_WIKI_GENERATOR_VERSION;
  headOnlyPage.externalWatches.githubRepo.candidateHeadSha = '';
  headOnlyPage.externalWatches.githubRepo.candidateGeneratorVersion = '';
  headOnlyPage.externalWatches.githubRepo.buildStatus = 'ready';
  assert.deepStrictEqual(parseGitHubRepo('openai/agents-js'), { owner: 'openai', repo: 'agents-js' });
  assert.strictEqual(isUsefulDocPath('README.md'), true);
  assert.strictEqual(isUsefulDocPath('docs/architecture.md'), true);
  assert.strictEqual(isUsefulDocPath('src/index.ts'), false);
  assert.strictEqual(isUsefulRepoEvidencePath('package.json'), true);
  assert.strictEqual(isUsefulRepoEvidencePath('.github/workflows/ci.yml'), true);
  assert.strictEqual(isUsefulRepoEvidencePath('src/index.ts'), true);
  assert.strictEqual(classifyRepoDocClass('package.json'), 'config');
  assert.strictEqual(classifyRepoDocClass('server/server.js'), 'code');
  assert.strictEqual(classifyRepoDocClass('AGENTS.md'), 'policy');
  assert.strictEqual(classifyRepoDocClass('docs/noeis-public-proof-gallery-spec-2026-07-03.md'), 'planned');
  assert.deepStrictEqual(
    selectRepoDocEntries([
      { path: 'docs/usage.md', type: 'blob' },
      { path: 'README.md', type: 'blob' },
      { path: 'src/index.ts', type: 'blob' }
    ]).map(entry => entry.path),
    ['README.md', 'docs/usage.md']
  );
  assert.deepStrictEqual(
    selectRepoEvidenceEntries([
      { path: 'docs/usage.md', type: 'blob' },
      { path: 'README.md', type: 'blob' },
      { path: 'src/index.ts', type: 'blob' },
      { path: 'server/routes/wikiRoutes.test.js', type: 'blob' },
      { path: '.github/workflows/ci.yml', type: 'blob' },
      { path: 'package.json', type: 'blob' }
    ], 5).map(entry => entry.path),
    ['package.json', 'README.md', '.github/workflows/ci.yml', 'src/index.ts', 'docs/usage.md']
  );
  const saturatedEvidence = selectRepoEvidenceEntries([
    { path: 'package.json', type: 'blob' },
    { path: 'README.md', type: 'blob' },
    { path: 'server/server.js', type: 'blob' },
    { path: 'server/routes/wikiRoutes.js', type: 'blob' },
    { path: 'server/services/wikiMaintenanceService.js', type: 'blob' },
    { path: 'server/services/githubRepoWatcherService.js', type: 'blob' },
    { path: 'server/models/index.js', type: 'blob' },
    { path: 'note-taker-ui/src/api/wiki.js', type: 'blob' },
    ...Array.from({ length: 90 }, (_item, index) => ({
      path: `docs/qa-report-${String(index).padStart(2, '0')}.md`,
      type: 'blob'
    })),
    ...Array.from({ length: 60 }, (_item, index) => ({
      path: `server/services/runtimeService${String(index).padStart(2, '0')}.js`,
      type: 'blob'
    }))
  ], 48).map(entry => entry.path);
  assert.strictEqual(saturatedEvidence.length, 48);
  assert.ok(saturatedEvidence.includes('server/services/wikiMaintenanceService.js'));
  assert.ok(saturatedEvidence.includes('server/services/githubRepoWatcherService.js'));
  assert.ok(saturatedEvidence.includes('note-taker-ui/src/api/wiki.js'));
  assert.ok(saturatedEvidence.filter(path => /qa-report/i.test(path)).length <= 4);
  const operationalEvidence = selectRepoEvidenceEntries([
    { path: 'package.json', type: 'blob' },
    { path: 'server/routes/authDiscoveryRoutes.js', type: 'blob' },
    { path: 'server/routes/wikiRoutes.js', type: 'blob' },
    { path: 'server/services/wikiMaintenanceService.js', type: 'blob' },
    { path: 'server/services/wikiMaintenancePublicationService.js', type: 'blob' },
    { path: 'server/services/githubRepoWatcherService.js', type: 'blob' },
    { path: 'server/services/wikiScheduledMaintenanceWorker.js', type: 'blob' },
    { path: 'server/models/index.js', type: 'blob' },
    { path: 'note-taker-ui/src/api/wiki.js', type: 'blob' },
    { path: 'note-taker-ui/src/system/SystemStatusContext.js', type: 'blob' },
    { path: 'note-taker-ui/src/components/wiki/WikiRepoCreateComposer.jsx', type: 'blob' },
    { path: 'note-taker-ui/src/components/wiki/WikiPageReadView.jsx', type: 'blob' },
    ...Array.from({ length: 80 }, (_item, index) => ({
      path: `server/services/otherService${String(index).padStart(2, '0')}.js`,
      type: 'blob'
    }))
  ], 20).map(entry => entry.path);
  [
    'server/routes/authDiscoveryRoutes.js',
    'server/routes/wikiRoutes.js',
    'server/services/wikiMaintenancePublicationService.js',
    'server/services/wikiScheduledMaintenanceWorker.js',
    'note-taker-ui/src/system/SystemStatusContext.js',
    'note-taker-ui/src/components/wiki/WikiRepoCreateComposer.jsx',
    'note-taker-ui/src/components/wiki/WikiPageReadView.jsx'
  ].forEach(path => assert.ok(operationalEvidence.includes(path), `missing operational evidence: ${path}`));
  assert.deepStrictEqual(
    selectRepoEvidenceEntries([
      { path: 'server/routes/agentActionRoutes.js', type: 'blob' },
      { path: 'server/routes/wikiRoutes.js', type: 'blob' },
      { path: 'server/routes/wikiRoutes.test.js', type: 'blob' },
      { path: 'server/services/wikiMaintenanceService.js', type: 'blob' },
      { path: 'server/services/githubRepoWatcherService.js', type: 'blob' },
      { path: 'server/services/agentProposalBundles.js', type: 'blob' },
      { path: 'note-taker-ui/src/api/wiki.js', type: 'blob' },
      { path: 'note-taker-ui/src/components/wiki/WikiRepoCreateComposer.jsx', type: 'blob' },
      { path: 'note-taker-ui/src/components/wiki/WikiPageReadView.jsx', type: 'blob' },
      { path: 'web/src/App.tsx', type: 'blob' },
      { path: 'web/src/api/wiki.ts', type: 'blob' },
      { path: 'docs/architecture.md', type: 'blob' }
    ], 11).map(entry => entry.path),
    [
      'server/routes/wikiRoutes.js',
      'server/services/wikiMaintenanceService.js',
      'note-taker-ui/src/api/wiki.js',
      'server/services/githubRepoWatcherService.js',
      'note-taker-ui/src/components/wiki/WikiPageReadView.jsx',
      'note-taker-ui/src/components/wiki/WikiRepoCreateComposer.jsx',
      'web/src/api/wiki.ts',
      'server/services/agentProposalBundles.js',
      'server/routes/agentActionRoutes.js',
      'web/src/App.tsx',
      'docs/architecture.md',
    ]
  );
  assert.deepStrictEqual(
    selectRepoEvidenceEntries([
      { path: 'package.json', type: 'blob' },
      { path: 'README.md', type: 'blob' },
      { path: 'docs/architecture.md', type: 'blob' },
      { path: 'AGENTS.md', type: 'blob' },
      { path: 'CLAUDE.md', type: 'blob' },
      { path: '.cursorrules', type: 'blob' }
    ], 5).map(entry => entry.path),
    ['package.json', 'README.md', 'AGENTS.md', 'CLAUDE.md', '.cursorrules']
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
  assert.strictEqual(result.snapshot.docs.length, 14);
  assert.strictEqual(result.snapshot.recentCommits.length, 1);
  assert.strictEqual(result.events.length, 16);
  assert.strictEqual(FakeWikiSourceEvent.rows.length, 17);
  assert.ok(result.maintenanceEvent);
  assert.strictEqual(result.maintenanceEvent.provider, 'github-repo-snapshot');
  assert.strictEqual(
    result.maintenanceEvent.externalId,
    'github-snapshot:openai/agents-js:abc1234567890abcdef:page:507f1f77bcf86cd799439031'
  );
  assert.strictEqual(FakeWikiSourceEvent.rows.filter(row => row.status === 'pending').length, 1);
  assert.strictEqual(FakeWikiSourceEvent.rows.filter(row => row.status === 'ignored').length, 16);
  assert.strictEqual(FakeWikiPage.page.externalWatches.githubRepo.owner, 'openai');
  assert.strictEqual(FakeWikiPage.page.externalWatches.githubRepo.repo, 'agents-js');
  assert.strictEqual(FakeWikiPage.page.externalWatches.githubRepo.lastHeadSha, 'abc1234567890abcdef');
  assert.strictEqual(FakeWikiPage.page.externalWatches.githubRepo.lastReleaseTag, 'v1.2.3');
  const packageEvent = FakeWikiSourceEvent.rows.find(row => row.metadata.path === 'package.json');
  assert.ok(packageEvent);
  assert.match(packageEvent.metadata.ref, /package\.json @ abc1234/);
  assert.strictEqual(packageEvent.metadata.docClass, 'config');
  assert.match(packageEvent.text, /node server\/server\.js/);
  assert.strictEqual(FakeWikiSourceEvent.rows.some(row => row.metadata.path === 'server/routes/wikiRoutes.js'), true);
  assert.strictEqual(FakeWikiSourceEvent.rows.some(row => row.metadata.path === 'server/services/wikiMaintenanceService.js'), true);
  assert.strictEqual(FakeWikiSourceEvent.rows.some(row => row.metadata.path === 'web/src/App.tsx'), true);
  assert.strictEqual(FakeWikiSourceEvent.rows.some(row => row.metadata.path === '__repo_inventory__/code-inventory.txt'), true);
  assert.strictEqual(FakeWikiSourceEvent.rows.some(row => row.metadata.path === 'server/routes/agentActionRoutes.test.js'), false);
  assert.strictEqual(FakeWikiSourceEvent.rows.some(row => /recent commits/i.test(row.title)), true);

  const second = await armGitHubRepoWatchForPage({
    WikiPage: FakeWikiPage,
    WikiSourceEvent: FakeWikiSourceEvent,
    userId: 'user-1',
    pageId: '507f1f77bcf86cd799439031',
    repo: 'openai/agents-js',
    fetchImpl: makeFetch(),
    now: () => new Date('2026-07-04T00:00:00.000Z')
  });
  assert.strictEqual(second.events.length, 16);
  assert.strictEqual(FakeWikiSourceEvent.rows.length, 17);
  assert.match(second.events.find(row => row.metadata.path === 'package.json').text, /node server\/server\.js/);

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
