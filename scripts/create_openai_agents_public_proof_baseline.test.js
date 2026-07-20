const assert = require('assert');
const mongoose = require('mongoose');
const {
  ARTICLE,
  EXPECTED_HEAD,
  EXTRA_SOURCES,
  TARGET_SLUG,
  TARGET_TITLE,
  buildCandidate,
  validateSourcePage
} = require('./create_openai_agents_public_proof_baseline');

const paths = Array.from(new Set(
  ARTICLE.flatMap(block => block.paths || []).filter(path => !path.startsWith('release:'))
));
const sourceRefs = paths
  .filter(path => !EXTRA_SOURCES.some(source => source.path === path))
  .map((path, index) => ({
    _id: new mongoose.Types.ObjectId(),
    type: 'external',
    title: `openai/openai-agents-js ${path}`,
    snippet: path === 'package.json'
      ? 'Pinned primary source at package.json. { "scripts": { "dev": "tsx scripts/dev.mts", "test": "CI=1 NODE_ENV=test vitest", "test:integration": "NODE_ENV=test vitest run --config=vitest.integration.config.ts", "lint": "eslint", "build": "pnpm clean && tsc-multi" } }'
      : `Pinned primary source at ${path}`,
    url: `https://github.com/openai/openai-agents-js/blob/${EXPECTED_HEAD}/${path}`,
    provider: 'github',
    metadata: {
      owner: 'openai',
      repo: 'openai-agents-js',
      path,
      blobSha: `blob-${index}`,
      commitSha: EXPECTED_HEAD,
      evidenceType: path.endsWith('package.json') ? 'config' : path.endsWith('.ts') ? 'code' : 'document'
    },
    addedBy: 'user'
  }));
sourceRefs.push({
  _id: new mongoose.Types.ObjectId(),
  type: 'external',
  title: 'openai/openai-agents-js release v0.13.5',
  snippet: 'Pinned release metadata.',
  url: 'https://github.com/openai/openai-agents-js/releases/tag/v0.13.5',
  provider: 'github',
  metadata: { owner: 'openai', repo: 'openai-agents-js', tagName: 'v0.13.5', evidenceType: 'release' },
  addedBy: 'user'
});

const sourcePage = {
  _id: new mongoose.Types.ObjectId(),
  userId: new mongoose.Types.ObjectId(),
  title: 'openai/openai-agents-js — repo wiki',
  slug: 'openai-openai-agents-js-repo-wiki',
  visibility: 'private',
  sourceRefs,
  externalWatches: {
    githubRepo: {
      owner: 'openai',
      repo: 'openai-agents-js',
      defaultBranch: 'main',
      status: 'active',
      lastHeadSha: EXPECTED_HEAD,
      lastReleaseTag: 'v0.13.5'
    }
  }
};

validateSourcePage(sourcePage);
const candidate = buildCandidate({ sourcePage, now: new Date('2026-07-19T12:00:00.000Z') });
assert.strictEqual(candidate.title, TARGET_TITLE);
assert.strictEqual(candidate.slug, TARGET_SLUG);
assert.strictEqual(candidate.visibility, 'private');
assert.strictEqual(candidate.status, 'draft');
assert.strictEqual(candidate.publicProof, null);
assert.strictEqual(candidate.externalWatches.githubRepo.publishedHeadSha, EXPECTED_HEAD);
assert.strictEqual(candidate.externalWatches.githubRepo.lastHeadSha, EXPECTED_HEAD);
assert.strictEqual(candidate.aiState.quality.ok, true, candidate.aiState.quality.failures.join(' | '));
assert(candidate.aiState.quality.metrics.words >= 900);
assert(candidate.claims.length >= 20);
assert(candidate.claims.every(claim => claim.support !== 'unsupported'));
assert(candidate.claims.every(claim => claim.sourceRefIds.length > 0 && claim.citationIds.length > 0));
assert(candidate.sourceRefs.some(source => source.metadata?.path === 'README.md'));
assert(candidate.sourceRefs.some(source => source.metadata?.path === 'docs/src/content/docs/guides/running-agents.mdx'));
assert(candidate.sourceRefs.some(source => source.metadata?.path === 'docs/src/content/docs/guides/tracing.mdx'));
assert(candidate.sourceRefs.some(source => source.metadata?.path === 'docs/src/content/docs/guides/sessions.mdx'));
assert(candidate.body.content.some(node => node.type === 'heading' && node.content?.[0]?.text === 'Tools, MCP, and approval boundaries'));
assert(candidate.plainText.includes('managers and handoffs'));
assert(candidate.plainText.includes('weaker candidates out of the trusted page'));

assert.throws(() => validateSourcePage({
  ...sourcePage,
  externalWatches: { githubRepo: { ...sourcePage.externalWatches.githubRepo, lastHeadSha: 'new-head' } }
}), /source head changed/i);

console.log('create_openai_agents_public_proof_baseline tests passed');
