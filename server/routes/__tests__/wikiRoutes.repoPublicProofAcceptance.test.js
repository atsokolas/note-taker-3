const assert = require('assert');
const express = require('express');
const { buildWikiRouter } = require('../wikiRoutes');

const pageId = '507f1f77bcf86cd799439021';
const eventId = '507f1f77bcf86cd799439022';
const revisionId = '507f1f77bcf86cd799439023';
const runId = '507f1f77bcf86cd799439024';
const baselineHead = 'a'.repeat(40);
const publishedHead = 'b'.repeat(40);

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return Promise.resolve(JSON.parse(JSON.stringify(this.value))); }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const page = {
  _id: pageId,
  userId: 'user-1',
  title: 'Atsokolas/Note-Taker-3 Repo Wiki',
  slug: 'atsokolas-note-taker-3-repo-wiki',
  pageType: 'repo',
  status: 'draft',
  visibility: 'shared',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Maintained repository dossier.' }] }] },
  plainText: 'Maintained repository dossier with source-backed package instructions.',
  sourceRefs: [
    { _id: 'current-package', title: 'package.json', url: `https://github.com/atsokolas/note-taker-3/blob/${publishedHead}/package.json`, metadata: { path: 'package.json', blobSha: 'blob-new', commitSha: publishedHead, evidenceType: 'config' } },
    { _id: 'current-readme', title: 'README.md', url: `https://github.com/atsokolas/note-taker-3/blob/${publishedHead}/README.md`, metadata: { path: 'README.md', blobSha: 'readme-stable', commitSha: publishedHead, evidenceType: 'document' } }
  ],
  claims: [
    { claimId: 'current-run', text: 'The package workflow now uses scoped commands, focused tests, and a production build before deployment.', section: 'Run and prove changes', support: 'supported', sourceRefIds: ['current-package'] },
    { claimId: 'current-peer', text: 'The public share route excludes private graph state and exposes only the maintained article.', section: 'Privacy', support: 'supported', sourceRefIds: ['current-readme'] }
  ],
  freshness: {
    acceptedThrough: { sourceEventId: eventId, title: 'Accepted repository snapshot', url: `https://github.com/atsokolas/note-taker-3/tree/${publishedHead}` }
  },
  aiState: { changeLog: [{ type: 'maintenance', text: 'Updated package workflow evidence.', createdAt: '2026-07-19T01:00:00.000Z' }] },
  externalWatches: { githubRepo: { owner: 'atsokolas', repo: 'note-taker-3', status: 'active', lastHeadSha: publishedHead, publishedHeadSha: publishedHead, candidateHeadSha: '', buildStatus: 'ready', lastPublishedAt: '2026-07-19T01:00:00.000Z' } },
  publicProof: { grade: 'candidate', reason: '', acceptedAt: null, acceptedEventId: '', acceptedClocks: [] },
  toObject() { return JSON.parse(JSON.stringify({ ...this, toObject: undefined, save: undefined, markModified: undefined })); },
  markModified() {},
  async save() { this.saved = true; return this; }
};

const baseline = {
  _id: 'baseline-1', pageId, userId: 'user-1', owner: 'atsokolas', repo: 'note-taker-3', headSha: baselineHead, publicEligible: true,
  sourceRefs: [
    { sourceRefId: 'base-package', title: 'package.json', path: 'package.json', blobSha: 'blob-old', commitSha: baselineHead, evidenceType: 'config', url: `https://github.com/atsokolas/note-taker-3/blob/${baselineHead}/package.json` },
    { sourceRefId: 'base-readme', title: 'README.md', path: 'README.md', blobSha: 'readme-stable', commitSha: baselineHead, evidenceType: 'document', url: `https://github.com/atsokolas/note-taker-3/blob/${baselineHead}/README.md` }
  ],
  claims: [
    { claimId: 'old-run', text: 'The package workflow used one root command before deployment and did not distinguish focused proof steps.', section: 'Run and prove changes', support: 'supported', sourceRefIds: ['base-package'] },
    { claimId: 'old-peer', text: 'The public share route excludes private graph state and exposes only the maintained article.', section: 'Privacy', support: 'supported', sourceRefIds: ['base-readme'] }
  ]
};

const sourceEvent = { _id: eventId, userId: 'user-1', provider: 'github-repo-snapshot', status: 'processed', affectedPageIds: [pageId], metadata: { pageId, commitSha: publishedHead } };
const existingRevision = { _id: revisionId, userId: 'user-1', pageId, sourceEventId: eventId, promotionStatus: 'promoted', reason: 'source_event' };
const maintenanceRun = { _id: runId, userId: 'user-1', pageId, sourceEventId: eventId, status: 'completed', metadata: { comparisonVersion: 2, comparisons: [{ version: 2, outcome: 'accepted', pageId, sourceEventId: eventId }] } };

const WikiPage = { findOne: () => new Query(page) };
const WikiRepoBaseline = { findOne: () => new Query(baseline) };
const WikiSourceEvent = { findOne: () => new Query(sourceEvent) };
function WikiRevision(payload) { Object.assign(this, payload); }
WikiRevision.created = [];
WikiRevision.findOne = () => new Query(existingRevision);
WikiRevision.prototype.save = async function save() { WikiRevision.created.push(this); return this; };
const WikiMaintenanceRun = {
  find: () => new Query([maintenanceRun]),
  findOne: () => new Query(maintenanceRun)
};

const request = async (base, body) => {
  const response = await fetch(`${base}/api/wiki/pages/${pageId}/public-proof/accept-repo-comparison`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
};

const acceptanceBody = {
  reason: 'The source-backed repository comparison and preserved peer claims passed editorial review.',
  publishAsFlagship: true
};

const run = async () => {
  const app = express();
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
    WikiPage, WikiRepoBaseline, WikiSourceEvent, WikiRevision, WikiMaintenanceRun,
    fetchGitHubRepoHead: async ({ owner, repo }) => ({ owner, repo, headSha: publishedHead })
  }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const acceptedBeforeText = baseline.claims[0].text;
    const candidateAfterText = page.claims[0].text;
    baseline.claims[0].text = 'The package workflow tells contributors to run the API and UI, then prove wiki behavior.';
    page.claims[0].text = 'The package workflow tells contributors to use the declared package manager and repository-declared proof command.';
    const editoriallyWeak = await request(base, acceptanceBody);
    assert.strictEqual(editoriallyWeak.status, 422, JSON.stringify(editoriallyWeak.body));
    assert.strictEqual(editoriallyWeak.body.acceptance.eligible, false);
    assert.strictEqual(editoriallyWeak.body.acceptance.blockingEditorialRisks, 1);
    assert(editoriallyWeak.body.acceptance.blockers.includes('editorial_quality_risks'));
    assert(editoriallyWeak.body.gaps.some(gap => /structured editorial review/.test(gap)));
    baseline.claims[0].text = acceptedBeforeText;
    page.claims[0].text = candidateAfterText;

    const preview = await request(base, acceptanceBody);
    assert.strictEqual(preview.status, 200, JSON.stringify(preview.body));
    assert.strictEqual(preview.body.dryRun, true);
    assert.strictEqual(preview.body.ready, true);
    assert.strictEqual(preview.body.acceptancePreview.counts.changed, 1);
    assert.strictEqual(preview.body.acceptancePreview.counts.preserved, 1);
    assert.strictEqual(preview.body.acceptancePreview.counts.sourceBackedClaimChanges, 1);
    assert.ok(!JSON.stringify(preview.body).includes(eventId));
    assert.strictEqual(page.publicProof.grade, 'candidate');

    const unconfirmed = await request(base, { ...acceptanceBody, confirm: true });
    assert.strictEqual(unconfirmed.status, 400);
    assert.strictEqual(page.publicProof.grade, 'candidate');

    const confirmed = await request(base, { ...acceptanceBody, confirm: true, decision: 'accept_repo_public_proof' });
    assert.strictEqual(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.strictEqual(page.publicProof.grade, 'proven');
    assert.strictEqual(page.publicProof.acceptanceSnapshot.maintenanceRunId, runId);
    assert.strictEqual(page.visibility, 'shared');
    assert.strictEqual(page.status, 'published');
    assert.strictEqual(WikiRevision.created.length, 1);

    const replay = await request(base, { ...acceptanceBody, confirm: true, decision: 'accept_repo_public_proof' });
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(replay.body.unchanged, true);
    assert.strictEqual(WikiRevision.created.length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run().then(() => console.log('wikiRoutes repo public proof acceptance tests passed'))
    .catch(error => { console.error(error); process.exit(1); });
}

module.exports = { run };
