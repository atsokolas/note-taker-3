const assert = require('assert');
const { loadRepoClaimReviewQueue } = require('./wikiRepoClaimReviewService');
const { snapshotContentHash } = require('./wikiRevisionService');

const clone = value => JSON.parse(JSON.stringify(value));
class Query {
  constructor(value) { this.value = value; }
  sort() { return this; }
  limit() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const fixture = () => {
  const ids = {
    user: '507f191e810c19729de87101',
    page: '507f191e810c19729de87102',
    event: '507f191e810c19729de87103',
    run: '507f191e810c19729de87104',
    revision1: '507f191e810c19729de87105',
    revision2: '507f191e810c19729de87106',
    source1: '507f191e810c19729de87107',
    source2: '507f191e810c19729de87108',
    document1: '507f191e810c19729de87109',
    document2: '507f191e810c19729de87110',
    citation2: '507f191e810c19729de87111'
  };
  const page = {
    _id: ids.page,
    userId: ids.user,
    pageType: 'repo',
    status: 'published',
    title: 'atsokolas/note-taker-3',
    body: { type: 'doc', content: [] },
    plainText: 'Trusted repository page',
    claims: [
      { claimId: 'claim-1', text: 'Worker owns publication.', support: 'supported', sourceRefIds: [], citationIds: [] },
      { claimId: 'claim-2', text: 'Routes are authenticated.', support: 'supported', sourceRefIds: [], citationIds: [] }
    ],
    sourceRefs: [],
    citations: [],
    externalWatches: {
      githubRepo: {
        owner: 'atsokolas',
        repo: 'note-taker-3',
        publishedHeadSha: 'base-head',
        candidateHeadSha: 'candidate-head',
        lastHeadSha: 'candidate-head'
      }
    }
  };
  const before = clone(page);
  const baseHash = snapshotContentHash(before);
  const manifest = {
    provider: 'github',
    baseHeadSha: 'base-head',
    headSha: 'candidate-head',
    snapshotKey: 'github-snapshot:atsokolas/note-taker-3:candidate-head',
    owner: 'atsokolas',
    repo: 'note-taker-3',
    cohortId: 'cohort-safe-1',
    cohortClaimIds: ['claim-1', 'claim-2'],
    cohortClaimCount: 2,
    trustedHeadHash: baseHash
  };
  const revision = ({ revisionId, claimId, sourceId, documentId, proposedText, createdAt, contradicting = false }) => {
    const after = clone(before);
    after.sourceRefs.push({
      _id: sourceId,
      type: 'external',
      objectId: documentId,
      provider: 'github-repo',
      title: `src/${claimId}.js`,
      url: `https://github.com/atsokolas/note-taker-3/blob/candidate-head/src/${claimId}.js`,
      metadata: { path: `src/${claimId}.js`, ref: `${claimId} @ candidate` }
    });
    const claim = after.claims.find(row => row.claimId === claimId);
    claim.text = proposedText;
    claim.sourceRefIds = [sourceId];
    if (contradicting) {
      after.citations.push({
        _id: ids.citation2,
        sourceRefId: sourceId,
        sourceType: 'external',
        sourceObjectId: documentId,
        sourceTitle: `src/${claimId}.js`,
        quote: 'This source creates tension with the current claim.'
      });
      claim.contradictedByCitationIds = [ids.citation2];
    }
    return {
      _id: revisionId,
      userId: ids.user,
      pageId: ids.page,
      reason: 'agent_candidate',
      actorType: 'agent',
      promotionStatus: 'candidate',
      sourceEventId: ids.event,
      maintenanceRunId: ids.run,
      sourceVersion: clone(manifest),
      claimReview: {
        version: 1,
        scope: 'claim',
        targetClaimId: claimId,
        state: 'pending',
        basePageHash: baseHash,
        proposedClaim: clone(claim)
      },
      before: clone(before),
      after,
      quality: { ok: true, status: 'pass', score: 0.91 },
      summary: `Proposed ${claimId}`,
      createdAt
    };
  };
  const revisions = [
    revision({
      revisionId: ids.revision1,
      claimId: 'claim-1',
      sourceId: ids.source1,
      documentId: ids.document1,
      proposedText: 'The watcher owns verified publication.',
      createdAt: '2026-08-01T15:00:00.000Z'
    }),
    revision({
      revisionId: ids.revision2,
      claimId: 'claim-2',
      sourceId: ids.source2,
      documentId: ids.document2,
      proposedText: 'Repository maintenance routes require authenticated ownership.',
      createdAt: '2026-08-01T15:00:01.000Z',
      contradicting: true
    })
  ];
  const snapshot = {
    _id: ids.event,
    userId: ids.user,
    provider: 'github-repo-snapshot',
    status: 'processed',
    affectedPageIds: [ids.page],
    metadata: {
      pageId: ids.page,
      owner: 'atsokolas',
      repo: 'note-taker-3',
      commitSha: 'candidate-head',
      snapshotKey: manifest.snapshotKey,
      documentEventIds: [ids.document1, ids.document2]
    }
  };
  const documents = [ids.document1, ids.document2].map((documentId, index) => ({
    _id: documentId,
    userId: ids.user,
    provider: 'github-repo',
    sourceType: 'external',
    title: `Verified source ${index + 1}`,
    url: `https://github.com/atsokolas/note-taker-3/blob/candidate-head/src/claim-${index + 1}.js`,
    affectedPageIds: [ids.page],
    metadata: {
      pageId: ids.page,
      owner: 'atsokolas',
      repo: 'note-taker-3',
      commitSha: 'candidate-head',
      snapshotKey: manifest.snapshotKey,
      path: `src/claim-${index + 1}.js`
    }
  }));
  const models = rows => ({
    WikiPage: {
      findOne: query => new Query(
        String(query.userId) === ids.user && query.pageType === 'repo' && page.pageType === 'repo' ? page : null
      )
    },
    WikiRevision: { find: () => new Query(rows) },
    WikiSourceEvent: {
      findOne: query => new Query(String(query.userId) === ids.user && String(query._id) === ids.event ? snapshot : null),
      find: query => new Query(
        String(query.userId) === ids.user
          ? documents.filter(document => query._id.$in.some(value => String(value) === String(document._id)))
          : []
      )
    }
  });
  return { ids, page, revisions, snapshot, documents, models };
};

(async () => {
  const valid = fixture();
  const queue = await loadRepoClaimReviewQueue({
    userId: valid.ids.user,
    pageId: valid.ids.page,
    ...valid.models(valid.revisions)
  });
  assert.strictEqual(queue.cohort.id, 'cohort-safe-1');
  assert.strictEqual(queue.cohort.integrity.ok, true);
  assert.strictEqual(queue.cohort.progress.total, 2);
  assert.strictEqual(queue.candidates.length, 2);
  assert.deepStrictEqual(queue.candidates[0].allowedDispositions, ['accept', 'preserve', 'reject', 'defer']);
  assert.strictEqual(queue.candidates[0].evidenceDelta.added[0].path, 'src/claim-1.js');
  assert.strictEqual(queue.candidates[0].evidenceDelta.added[0].title, 'Verified source 1');
  assert.strictEqual(queue.candidates[0].evidenceDelta.added[0].eventId, valid.ids.document1);
  assert.strictEqual(queue.candidates[0].evidenceDelta.supporting.length, 1);
  assert.strictEqual(queue.candidates[0].evidenceDelta.contradicting.length, 0);
  assert.strictEqual(queue.candidates[1].evidenceDelta.supporting.length, 0);
  assert.strictEqual(queue.candidates[1].evidenceDelta.contradicting.length, 1);
  assert.ok(!Object.prototype.hasOwnProperty.call(queue.candidates[0].evidenceDelta.added[0], 'snippet'));
  assert.strictEqual(queue.humanActionRequired, true);
  assert.strictEqual(queue.before, undefined);
  assert.strictEqual(queue.after, undefined);

  const incomplete = fixture();
  await assert.rejects(() => loadRepoClaimReviewQueue({
    userId: incomplete.ids.user,
    pageId: incomplete.ids.page,
    ...incomplete.models([incomplete.revisions[0]])
  }), error => error.code === 'repo_cohort_incomplete');

  const superseded = fixture();
  superseded.page.externalWatches.githubRepo.lastHeadSha = 'newer-head';
  superseded.page.externalWatches.githubRepo.candidateHeadSha = 'newer-head';
  const supersededQueue = await loadRepoClaimReviewQueue({
    userId: superseded.ids.user,
    pageId: superseded.ids.page,
    ...superseded.models(superseded.revisions)
  });
  assert.strictEqual(supersededQueue.cohort.publishability.ok, false);
  assert.strictEqual(supersededQueue.cohort.publishability.code, 'newer_head_observed');
  assert.deepStrictEqual(supersededQueue.candidates[0].allowedDispositions, ['reject', 'defer']);

  const edited = fixture();
  edited.page.title = 'Human-edited repo page';
  const editedQueue = await loadRepoClaimReviewQueue({
    userId: edited.ids.user,
    pageId: edited.ids.page,
    ...edited.models(edited.revisions)
  });
  assert.strictEqual(editedQueue.cohort.publishability.ok, false);
  assert(editedQueue.cohort.publishability.reasons.includes('trusted_page_changed'));

  const changedIdentity = fixture();
  changedIdentity.page.externalWatches.githubRepo.owner = 'other-owner';
  const changedIdentityQueue = await loadRepoClaimReviewQueue({
    userId: changedIdentity.ids.user,
    pageId: changedIdentity.ids.page,
    ...changedIdentity.models(changedIdentity.revisions)
  });
  assert.strictEqual(changedIdentityQueue.cohort.publishability.ok, false);
  assert(changedIdentityQueue.cohort.publishability.reasons.includes('repository_identity_changed'));

  const blankCandidateHead = fixture();
  blankCandidateHead.page.externalWatches.githubRepo.candidateHeadSha = '';
  const blankCandidateQueue = await loadRepoClaimReviewQueue({
    userId: blankCandidateHead.ids.user,
    pageId: blankCandidateHead.ids.page,
    ...blankCandidateHead.models(blankCandidateHead.revisions)
  });
  assert.strictEqual(blankCandidateQueue.cohort.publishability.ok, false);
  assert(blankCandidateQueue.cohort.publishability.reasons.includes('candidate_head_changed'));

  const displayCasing = fixture();
  displayCasing.page.externalWatches.githubRepo.owner = 'Atsokolas';
  displayCasing.page.externalWatches.githubRepo.repo = 'Note-Taker-3';
  const displayCasingQueue = await loadRepoClaimReviewQueue({
    userId: displayCasing.ids.user,
    pageId: displayCasing.ids.page,
    ...displayCasing.models(displayCasing.revisions)
  });
  assert.strictEqual(displayCasingQueue.cohort.publishability.ok, true);
  assert.strictEqual(displayCasingQueue.page.repository.fullName, 'Atsokolas/Note-Taker-3');

  const staged = fixture();
  staged.revisions[0].claimReview.state = 'accepted';
  staged.revisions[0].claimReview.receipt = { id: 'receipt-accepted', kind: 'wiki_claim_disposition' };
  const stagedQueue = await loadRepoClaimReviewQueue({
    userId: staged.ids.user,
    pageId: staged.ids.page,
    ...staged.models(staged.revisions)
  });
  assert.deepStrictEqual(stagedQueue.candidates[0].allowedDispositions, []);
  assert.strictEqual(stagedQueue.cohort.progress.accepted, 1);

  const missingReceipt = fixture();
  missingReceipt.revisions[0].claimReview.state = 'accepted';
  await assert.rejects(() => loadRepoClaimReviewQueue({
    userId: missingReceipt.ids.user,
    pageId: missingReceipt.ids.page,
    ...missingReceipt.models(missingReceipt.revisions)
  }), error => error.code === 'incomplete_disposition');

  const ambiguous = fixture();
  ambiguous.revisions[1].sourceVersion.cohortId = 'cohort-other';
  await assert.rejects(() => loadRepoClaimReviewQueue({
    userId: ambiguous.ids.user,
    pageId: ambiguous.ids.page,
    ...ambiguous.models(ambiguous.revisions)
  }), error => error.code === 'ambiguous_repo_claim_cohort');

  const personal = fixture();
  personal.page.pageType = 'personal';
  await assert.rejects(() => loadRepoClaimReviewQueue({
    userId: personal.ids.user,
    pageId: personal.ids.page,
    ...personal.models(personal.revisions)
  }), error => error.code === 'not_found');

  const foreign = fixture();
  await assert.rejects(() => loadRepoClaimReviewQueue({
    userId: '507f191e810c19729de87999',
    pageId: foreign.ids.page,
    ...foreign.models(foreign.revisions)
  }), error => error.code === 'not_found');

  console.log('wikiRepoClaimReviewService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
