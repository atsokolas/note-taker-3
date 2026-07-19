const assert = require('assert');
const { buildRepoPublicProofAcceptance } = require('./wikiRepoPublicProofAcceptanceService');

const pageId = '507f1f77bcf86cd799439011';
const eventId = '507f1f77bcf86cd799439012';
const revisionId = '507f1f77bcf86cd799439013';
const runId = '507f1f77bcf86cd799439014';
const now = new Date('2026-07-19T01:00:00.000Z');

const fixture = () => {
  const baselineHeadSha = 'a'.repeat(40);
  const publishedHeadSha = 'b'.repeat(40);
  return {
    page: {
      _id: pageId,
      freshness: { acceptedThrough: { sourceEventId: eventId } },
      externalWatches: { githubRepo: {
        owner: 'atsokolas', repo: 'note-taker-3', lastHeadSha: publishedHeadSha,
        publishedHeadSha, candidateHeadSha: '', buildStatus: 'ready'
      } }
    },
    baseline: { pageId, owner: 'atsokolas', repo: 'note-taker-3', headSha: baselineHeadSha, publicEligible: true },
    comparison: {
      version: 2,
      baseline: { headSha: baselineHeadSha },
      current: { observedHeadSha: publishedHeadSha, publishedHeadSha, candidateHeadSha: '', buildStatus: 'ready' },
      repositoryChanges: { added: [{ path: 'package.json' }], changed: [], removed: [] },
      claimComparison: {
        counts: { added: 0, changed: 2, evidenceRefreshed: 4, gainedSupport: 0, contradicted: 0, preserved: 7, removed: 0 },
        deltas: {
          added: [], removed: [], gainedSupport: [], contradicted: [], evidenceRefreshed: [], preserved: [],
          changed: [{ before: { text: 'The old package workflow used one command.' }, after: { text: 'The package workflow now uses scoped commands.', sourceRefIds: ['package.json'] } }]
        }
      },
      rejectedCandidates: [], staticWikiErrors: [], supportingRefs: [{ path: 'package.json' }]
    },
    sourceEvent: { _id: eventId, provider: 'github-repo-snapshot', status: 'processed', affectedPageIds: [pageId], metadata: { pageId, commitSha: publishedHeadSha } },
    revision: { _id: revisionId, pageId, sourceEventId: eventId, promotionStatus: 'promoted', reason: 'source_event' },
    maintenanceRun: { _id: runId, pageId, sourceEventId: eventId, status: 'completed', metadata: { comparisonVersion: 2, comparisons: [{ version: 2, outcome: 'accepted', pageId, sourceEventId: eventId }] } },
    liveHeadSha: publishedHeadSha,
    reason: 'The source-backed repository comparison and preserved peer claims passed editorial review.',
    now
  };
};

{
  const result = buildRepoPublicProofAcceptance(fixture());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.record.grade, 'proven');
  assert.strictEqual(result.record.acceptedClocks[0].type, 'github');
  assert.strictEqual(result.record.acceptanceSnapshot.counts.changed, 2);
  assert.strictEqual(result.record.acceptanceSnapshot.counts.preserved, 7);
  assert.strictEqual(result.record.acceptanceSnapshot.counts.sourceBackedClaimChanges, 1);
  assert.strictEqual(result.record.acceptanceSnapshot.counts.blockingEditorialRisks, 0);
  assert.strictEqual(result.record.acceptanceSnapshot.maintenanceRunId, runId);
}

{
  const input = fixture();
  input.liveHeadSha = 'c'.repeat(40);
  const result = buildRepoPublicProofAcceptance(input);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some(error => /live GitHub repository head has advanced/.test(error)));
}

{
  const input = fixture();
  input.comparison.current.observedHeadSha = 'c'.repeat(40);
  const result = buildRepoPublicProofAcceptance(input);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some(error => /Observed and published/.test(error)));
}

{
  const input = fixture();
  input.comparison.claimComparison.deltas.changed = [];
  input.comparison.claimComparison.counts.changed = 0;
  const result = buildRepoPublicProofAcceptance(input);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some(error => /source-backed claim rewrite/.test(error)));
}

{
  const input = fixture();
  input.comparison.claimComparison.deltas.changed = [{
    before: { text: 'Run the API and UI, then prove wiki behavior.', sourceRefIds: ['package.json'] },
    after: { text: 'Use the declared package manager and the repository-declared proof command.', sourceRefIds: ['package.json'] }
  }];
  const result = buildRepoPublicProofAcceptance(input);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.proofPulse.acceptance.blockingEditorialRisks, 1);
  assert(result.errors.some(error => /structured editorial review/.test(error)));
}

{
  const input = fixture();
  input.maintenanceRun.metadata.comparisons[0].outcome = 'rejected';
  const result = buildRepoPublicProofAcceptance(input);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some(error => /completed version 2 maintenance run/.test(error)));
}

console.log('wikiRepoPublicProofAcceptanceService tests passed');
