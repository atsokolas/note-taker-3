const assert = require('assert');
const { runWikiMaintenanceCandidate } = require('./wikiMaintenancePublicationService');

const createRevisionModel = () => {
  const records = [];
  function WikiRevision(payload = {}) {
    Object.assign(this, payload);
    this._id = `revision-${records.length + 1}`;
  }
  WikiRevision.records = records;
  WikiRevision.prototype.save = async function save() {
    records.push(JSON.parse(JSON.stringify(this)));
    return this;
  };
  return WikiRevision;
};

const trustedPage = () => ({
  _id: 'page-1',
  userId: 'user-1',
  title: 'Trusted page',
  slug: 'trusted-page',
  pageType: 'repo',
  status: 'draft',
  visibility: 'private',
  sourceScope: 'entire_library',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Trusted article.' }] }] },
  plainText: 'Trusted article.',
  sourceRefs: [{ title: 'trusted source' }],
  claims: [{ id: 'trusted-claim', text: 'Trusted article.' }],
  citations: [{ sourceTitle: 'trusted source' }],
  freshness: { status: 'fresh' },
  aiState: { draftStatus: 'ready', quality: { ok: true, status: 'pass' } },
  modified: [],
  markModified(field) { this.modified.push(field); }
});

const run = async () => {
  const rejectedPage = trustedPage();
  const WikiRevision = createRevisionModel();
  const rejected = await runWikiMaintenanceCandidate({
    page: rejectedPage,
    userId: 'user-1',
    WikiRevision,
    maintainWikiPageFn: async ({ page }) => {
      page.body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bad candidate.' }] }] };
      page.plainText = 'Bad candidate.';
      page.sourceRefs = [{ title: 'thin source' }];
      page.aiState = {
        draftStatus: 'ready',
        quality: { ok: false, status: 'fail', failures: ['Missing core implementation evidence.'] }
      };
      return page;
    }
  });

  assert.strictEqual(rejected.promoted, false);
  assert.strictEqual(rejected.page.plainText, 'Trusted article.');
  assert.deepStrictEqual(rejected.page.sourceRefs, [{ title: 'trusted source' }]);
  assert.strictEqual(rejected.page.freshness.status, 'needs_review');
  assert.strictEqual(rejected.page.aiState.quality.ok, true);
  assert.strictEqual(rejected.page.aiState.candidateStatus, 'rejected');
  assert.match(rejected.page.aiState.lastCandidateSummary, /Missing core implementation evidence/);
  assert.strictEqual(WikiRevision.records.length, 1);
  assert.strictEqual(WikiRevision.records[0].reason, 'agent_candidate');
  assert.strictEqual(WikiRevision.records[0].promotionStatus, 'rejected');
  assert.strictEqual(WikiRevision.records[0].after.plainText, 'Bad candidate.');

  const freshDossierPage = trustedPage();
  freshDossierPage.createdFrom = { label: 'company-dossier:CRWV' };
  freshDossierPage.claims = [];
  freshDossierPage.aiState = { draftStatus: 'idle', quality: {} };
  const rejectedFreshDossier = await runWikiMaintenanceCandidate({
    page: freshDossierPage,
    userId: 'user-1',
    WikiRevision,
    maintainWikiPageFn: async ({ page }) => {
      page.aiState = {
        draftStatus: 'ready',
        quality: { ok: false, status: 'fail', failures: ['The dossier is only a scaffold.'] }
      };
      return page;
    }
  });
  assert.strictEqual(rejectedFreshDossier.promoted, false);
  assert.strictEqual(rejectedFreshDossier.page.aiState.draftStatus, 'error');
  assert.strictEqual(rejectedFreshDossier.page.aiState.errorCode, 'WIKI_CANDIDATE_REJECTED');
  assert.match(rejectedFreshDossier.page.aiState.lastError, /first wiki candidate/i);

  const destructivePage = trustedPage();
  destructivePage.claims = Array.from({ length: 10 }, (_, index) => ({ id: `claim-${index}`, text: `Claim ${index}` }));
  const destructive = await runWikiMaintenanceCandidate({
    page: destructivePage,
    userId: 'user-1',
    WikiRevision,
    rejectDestructiveClaimLoss: true,
    maintainWikiPageFn: async ({ page }) => {
      page.claims = [{ id: 'replacement', text: 'One replacement claim' }];
      page.aiState = { draftStatus: 'ready', quality: { ok: true, status: 'pass' } };
      return page;
    }
  });
  assert.strictEqual(destructive.promoted, false);
  assert.strictEqual(destructive.page.claims.length, 10);
  assert.match(destructive.page.aiState.lastCandidateSummary, /removed more than 40%/);
  assert.strictEqual(WikiRevision.records.length, 3);

  const evidenceOnlyPage = trustedPage();
  evidenceOnlyPage.claims = Array.from({ length: 10 }, (_, index) => ({ id: `claim-${index}`, text: `Claim ${index}` }));
  const evidenceOnly = await runWikiMaintenanceCandidate({
    page: evidenceOnlyPage,
    userId: 'user-1',
    WikiRevision,
    rejectDestructiveClaimLoss: true,
    promoteEvidenceOnlyOnDestructiveLoss: true,
    maintainWikiPageFn: async ({ page }) => {
      page.claims = [{ id: 'replacement', text: 'Unsupported rewrite' }];
      page.aiState = { draftStatus: 'ready', quality: { ok: true, status: 'pass' } };
      return page;
    }
  });
  assert.strictEqual(evidenceOnly.promoted, true);
  assert.strictEqual(evidenceOnly.evidenceOnly, true);
  assert.strictEqual(evidenceOnly.page.claims.length, 10);
  assert.strictEqual(evidenceOnly.page.aiState.candidateStatus, 'evidence_only');
  assert.strictEqual(WikiRevision.records.length, 4);

  const acceptedProofPage = trustedPage();
  acceptedProofPage.status = 'published';
  acceptedProofPage.visibility = 'shared';
  acceptedProofPage.publicProof = {
    grade: 'proven',
    acceptedAt: '2026-07-20T00:00:00.000Z',
    acceptedEventId: 'accepted-event'
  };
  const heldForAcceptance = await runWikiMaintenanceCandidate({
    page: acceptedProofPage,
    userId: 'user-1',
    WikiRevision,
    requireManualReview: true,
    maintainWikiPageFn: async ({ page }) => {
      page.plainText = 'Plausible but not explicitly accepted replacement.';
      page.aiState = { draftStatus: 'ready', quality: { ok: true, status: 'pass' } };
      return page;
    }
  });
  assert.strictEqual(heldForAcceptance.promoted, false);
  assert.strictEqual(heldForAcceptance.page.plainText, 'Trusted article.');
  assert.match(heldForAcceptance.page.aiState.lastCandidateSummary, /explicit human acceptance/);
  assert.strictEqual(WikiRevision.records.length, 5);

  const passingPage = trustedPage();
  const passing = await runWikiMaintenanceCandidate({
    page: passingPage,
    userId: 'user-1',
    WikiRevision,
    maintainWikiPageFn: async ({ page }) => {
      page.body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Better candidate.' }] }] };
      page.plainText = 'Better candidate.';
      page.aiState = { draftStatus: 'ready', quality: { ok: true, status: 'pass' } };
      return page;
    }
  });

  assert.strictEqual(passing.promoted, true);
  assert.strictEqual(passing.page.plainText, 'Better candidate.');
  assert.strictEqual(WikiRevision.records.length, 5);

  console.log('wikiMaintenancePublicationService tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
