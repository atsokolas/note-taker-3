const assert = require('assert');
const {
  buildClaimRevisionReview,
  diffSegments,
  semanticClaim
} = require('./claimRevisionReviewService');
const { createConceptInvestigationFixture } = require('../fixtures/conceptInvestigationFixture');

const run = () => {
  const fixture = createConceptInvestigationFixture();
  const currentClaim = fixture.currentWiki.claim;
  const proposedClaim = fixture.candidateRevision.after.claims.find(claim => (
    claim.claimId === fixture.chain.claimId
  ));
  const resolved = new Map([
    [`article:${fixture.ids.article}`, {
      ref: {
        type: 'article',
        id: fixture.ids.article,
        title: fixture.linkedArticle.title,
        href: fixture.expected.articleHref
      }
    }]
  ]);
  const review = buildClaimRevisionReview({
    concept: fixture.concept,
    page: fixture.currentWiki.page,
    revision: fixture.candidateRevision,
    currentClaim,
    proposedClaim,
    resolveSource: ({ type, id }) => resolved.get(`${type}:${id}`) || null
  });

  assert.strictEqual(review.identity.conceptId, fixture.ids.concept);
  assert.strictEqual(review.identity.wikiPageId, fixture.ids.page);
  assert.strictEqual(review.identity.revisionId, fixture.ids.revision);
  assert.strictEqual(review.identity.claimId, fixture.chain.claimId);
  assert.strictEqual(review.state, 'pending');
  assert.strictEqual(review.canAct, true);
  assert.deepStrictEqual(review.allowedDispositions, ['accept', 'reject', 'defer', 'preserve']);
  assert.strictEqual(review.unavailableReason, '');
  assert.strictEqual(review.candidateHash.length, 64);
  assert.strictEqual(review.currentClaimHash.length, 64);
  assert.ok(review.diff.segments.every(segment => ['equal', 'added', 'removed'].includes(segment.kind)));
  assert.ok(review.diff.changedFields.includes('support'));
  assert.match(review.diff.boundedExplanation, /evidence reference/);
  assert.deepStrictEqual(review.evidenceDelta.added.map(ref => ref.id), [fixture.ids.article]);
  assert.deepStrictEqual(review.evidenceDelta.contradicting.map(ref => ref.id), [fixture.ids.article]);
  assert.strictEqual(review.affected.pages[0].id, fixture.ids.page);
  assert.strictEqual(review.affected.concepts[0].id, fixture.ids.concept);

  const sectionProposal = { ...proposedClaim, section: 'Updated interpretation' };
  const sectionReview = buildClaimRevisionReview({
    concept: fixture.concept,
    page: fixture.currentWiki.page,
    revision: fixture.candidateRevision,
    currentClaim,
    proposedClaim: sectionProposal,
    resolveSource: ({ type, id }) => resolved.get(`${type}:${id}`) || null
  });
  assert.ok(sectionReview.diff.changedFields.includes('section'));
  assert.match(sectionReview.diff.boundedExplanation, /section/);

  const replay = buildClaimRevisionReview({
    concept: fixture.concept,
    page: fixture.currentWiki.page,
    revision: fixture.candidateRevision,
    currentClaim,
    proposedClaim,
    resolveSource: ({ type, id }) => resolved.get(`${type}:${id}`) || null
  });
  assert.deepStrictEqual(replay, review);

  const textDiff = diffSegments('Demand is durable.', 'Enterprise demand is durable.');
  assert.ok(textDiff.some(segment => segment.kind === 'removed' && /Demand/.test(segment.text)));
  assert.ok(textDiff.some(segment => segment.kind === 'added' && /Enterprise/.test(segment.text)));
  assert.ok(textDiff.some(segment => segment.kind === 'added' && /demand/.test(segment.text)));
  assert.deepStrictEqual(diffSegments('Same claim.', 'Same claim.'), [{ kind: 'equal', text: 'Same claim.' }]);

  const sanitized = semanticClaim({
    claimId: 'claim-1',
    text: '  A   claim  ',
    sourceRefIds: ['b', 'a', 'a']
  });
  assert.strictEqual(sanitized.text, 'A claim');
  assert.strictEqual(sanitized.confidence, null);
  assert.deepStrictEqual(sanitized.sourceRefIds, ['a', 'b']);
  const deferredRevision = {
    ...fixture.candidateRevision,
    claimReview: {
      state: 'deferred',
      deferredUntil: '2026-08-15T12:00:00.000Z'
    }
  };
  const deferredReview = buildClaimRevisionReview({
    concept: fixture.concept,
    page: fixture.currentWiki.page,
    revision: deferredRevision,
    currentClaim,
    proposedClaim,
    resolveSource: ({ type, id }) => resolved.get(`${type}:${id}`) || null
  });
  assert.strictEqual(deferredReview.state, 'deferred');
  assert.strictEqual(deferredReview.deferredUntil, '2026-08-15T12:00:00.000Z');

  const receiptReview = buildClaimRevisionReview({
    concept: fixture.concept,
    page: fixture.currentWiki.page,
    revision: {
      ...fixture.candidateRevision,
      claimReview: {
        state: 'accepted',
        receipt: {
          id: 'receipt-1',
          kind: 'claim-disposition',
          status: 'complete',
          completedAt: '2026-08-04T12:00:00.000Z',
          userId: 'must-not-leak',
          payload: { private: true },
          secret: 'must-not-leak'
        }
      }
    },
    currentClaim,
    proposedClaim,
    resolveSource: ({ type, id }) => resolved.get(`${type}:${id}`) || null
  });
  assert.deepStrictEqual(receiptReview.receipt, {
    id: 'receipt-1',
    kind: 'claim-disposition',
    status: 'complete',
    completedAt: '2026-08-04T12:00:00.000Z'
  });
  assert.doesNotMatch(JSON.stringify(receiptReview), /must-not-leak|private/);

  const externalSourceId = '64f300000000000000000099';
  const externalReview = buildClaimRevisionReview({
    concept: fixture.concept,
    page: fixture.currentWiki.page,
    revision: {
      ...fixture.candidateRevision,
      before: {
        ...fixture.candidateRevision.before,
        sourceRefs: []
      },
      after: {
        ...fixture.candidateRevision.after,
        sourceRefs: [{
          _id: externalSourceId,
          type: 'external',
          objectId: null,
          title: 'Costco fiscal 2026 Form 10-Q',
          url: 'https://www.sec.gov/example-costco-10q'
        }]
      }
    },
    currentClaim: { ...currentClaim, sourceRefIds: [] },
    proposedClaim: { ...proposedClaim, sourceRefIds: [externalSourceId] },
    resolveSource: () => null
  });
  assert.deepStrictEqual(externalReview.evidenceDelta.added, [{
    type: 'external',
    id: externalSourceId,
    title: 'Costco fiscal 2026 Form 10-Q',
    href: 'https://www.sec.gov/example-costco-10q',
    sourceUrl: 'https://www.sec.gov/example-costco-10q'
  }]);
  assert.strictEqual(buildClaimRevisionReview({}), null);

  console.log('claim revision review service tests passed');
};

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
