const test = require('node:test');
const assert = require('node:assert/strict');

const {
  APPROVAL_CONFIRMATION,
  PUBLICATION_CONFIRMATION,
  REVIEW_CONFIRMATION,
  buildApprovalCandidate,
  buildApprovalReceipt,
  buildPublicationReceipt,
  buildReviewRequestReceipt,
  deriveApprovalState,
  serializePublishedArtifact
} = require('./weekendReadingsApprovalService');
const { privateSentinel, weekendReadingsLeakFixture } = require('./fixtures/weekendReadingsLeakFixture');

const candidateFor = (revisionId = 'revision-123456789') => buildApprovalCandidate({
  snapshot: weekendReadingsLeakFixture(),
  revisionId
});

const lifecycle = () => {
  const candidate = candidateFor();
  const review = buildReviewRequestReceipt({
    candidate,
    pageId: 'page-private-1',
    actorUserId: 'athan-user',
    confirmation: REVIEW_CONFIRMATION,
    at: '2026-07-19T12:00:00.000Z'
  });
  const approval = buildApprovalReceipt({
    candidate,
    reviewReceipt: review,
    pageId: 'page-private-1',
    actorUserId: 'athan-user',
    confirmation: APPROVAL_CONFIRMATION,
    at: '2026-07-19T12:05:00.000Z'
  });
  const publication = buildPublicationReceipt({
    approvalReceipt: approval,
    currentRevisionId: candidate.revisionId,
    pageId: 'page-private-1',
    actorUserId: 'athan-user',
    confirmation: PUBLICATION_CONFIRMATION,
    at: '2026-07-19T12:10:00.000Z'
  });
  return { candidate, review, approval, publication };
};

test('approval candidate reconstructs a public-safe artifact from an exact revision', () => {
  const candidate = candidateFor();
  assert.equal(candidate.editionKey, 'weekend-readings:athan-user:2026-07-06:2026-07-19');
  assert.equal(candidate.revisionId, 'revision-123456789');
  assert.equal(candidate.sourceRefs.length, 1);
  assert.equal(candidate.sourceRefs[0].readingRole, 'thesis_evidence');
  assert.equal(candidate.sourceRefs[0].sourceDateLabel, '2026-07-18');
  assert.equal(candidate.authorLabel, 'Athan Tsokolas');
  assert.doesNotMatch(JSON.stringify(candidate.body), /researched and maintained with Noeis/);
  assert.match(candidate.plainText, /Qualification durability/);
  assert.doesNotMatch(JSON.stringify(candidate), new RegExp(privateSentinel));
});

test('review request, approval, and publication each require a literal human confirmation', () => {
  const candidate = candidateFor();
  const actor = { pageId: 'page-private-1', actorUserId: 'athan-user' };
  assert.throws(() => buildReviewRequestReceipt({ candidate, ...actor }), /requires confirmation/);
  const review = buildReviewRequestReceipt({ candidate, ...actor, confirmation: REVIEW_CONFIRMATION });
  assert.throws(() => buildApprovalReceipt({ candidate, reviewReceipt: review, ...actor }), /requires confirmation/);
  const approval = buildApprovalReceipt({ candidate, reviewReceipt: review, ...actor, confirmation: APPROVAL_CONFIRMATION });
  assert.throws(() => buildPublicationReceipt({ approvalReceipt: approval, currentRevisionId: candidate.revisionId, ...actor }), /requires confirmation/);
});

test('approval cannot cross revision boundaries', () => {
  const candidate = candidateFor('revision-a');
  const otherCandidate = candidateFor('revision-b');
  const review = buildReviewRequestReceipt({ candidate, pageId: 'page-private-1', actorUserId: 'athan-user', confirmation: REVIEW_CONFIRMATION });
  assert.throws(() => buildApprovalReceipt({
    candidate: otherCandidate,
    reviewReceipt: review,
    pageId: 'page-private-1',
    actorUserId: 'athan-user',
    confirmation: APPROVAL_CONFIRMATION
  }), /same exact revision/);
});

test('editing after approval blocks publication until the changed draft is reapproved', () => {
  const { approval } = lifecycle();
  assert.throws(() => buildPublicationReceipt({
    approvalReceipt: approval,
    currentRevisionId: 'revision-new-draft',
    pageId: 'page-private-1',
    actorUserId: 'athan-user',
    confirmation: PUBLICATION_CONFIRMATION
  }), /Draft changed after approval/);
});

test('approval state exposes literal non-color status copy', () => {
  const { candidate, review, approval, publication } = lifecycle();
  assert.deepEqual(deriveApprovalState({ currentRevisionId: candidate.revisionId }), {
    code: 'private_draft',
    label: 'Private draft — not public',
    revisionId: candidate.revisionId
  });
  assert.equal(deriveApprovalState({ currentRevisionId: candidate.revisionId, receipts: [review] }).label, 'Review requested — still private');
  assert.equal(deriveApprovalState({ currentRevisionId: candidate.revisionId, receipts: [review, approval] }).label, 'Approved revision — not published');
  assert.equal(deriveApprovalState({ currentRevisionId: 'revision-new', receipts: [review, approval] }).label, 'Draft changed after approval — reapproval required');
  assert.equal(deriveApprovalState({ currentRevisionId: candidate.revisionId, receipts: [review, approval, publication] }).label, 'Published — revision revision');
});

test('a newer revision lifecycle takes precedence while the prior approved artifact remains published', () => {
  const prior = lifecycle();
  const candidate = candidateFor('revision-new-draft');
  const review = buildReviewRequestReceipt({
    candidate,
    pageId: 'page-private-1',
    actorUserId: 'athan-user',
    confirmation: REVIEW_CONFIRMATION,
    at: '2026-07-19T13:00:00.000Z'
  });
  const reviewing = deriveApprovalState({
    currentRevisionId: candidate.revisionId,
    receipts: [prior.review, prior.approval, prior.publication, review]
  });
  assert.equal(reviewing.code, 'review_requested');
  assert.equal(reviewing.revisionId, candidate.revisionId);
  assert.equal(reviewing.publishedRevisionId, prior.candidate.revisionId);

  const approval = buildApprovalReceipt({
    candidate,
    reviewReceipt: review,
    pageId: 'page-private-1',
    actorUserId: 'athan-user',
    confirmation: APPROVAL_CONFIRMATION,
    at: '2026-07-19T13:05:00.000Z'
  });
  const approved = deriveApprovalState({
    currentRevisionId: candidate.revisionId,
    receipts: [prior.review, prior.approval, prior.publication, review, approval]
  });
  assert.equal(approved.code, 'approved');
  assert.equal(approved.publishedRevisionId, prior.candidate.revisionId);
});

test('published serializer requires matching publication, approval, revision, and digest', () => {
  const { approval, publication } = lifecycle();
  const serialized = serializePublishedArtifact({
    approvalReceipt: approval,
    publicationReceipt: publication,
    slug: 'weekend-readings-2026-07-19'
  });
  assert.equal(serialized.visibility, 'shared');
  assert.equal(serialized.status, 'published');
  assert.equal(serialized.publication.approvedRevisionId, 'revision-123456789');
  assert.equal(serialized.editionKey, undefined);
  assert.doesNotMatch(JSON.stringify(serialized), /athan-user/);
  assert.equal(serializePublishedArtifact({ approvalReceipt: approval, publicationReceipt: { ...publication, status: 'draft' } }), null);
  assert.equal(serializePublishedArtifact({
    approvalReceipt: approval,
    publicationReceipt: { ...publication, provenance: { ...publication.provenance, digest: 'tampered' } }
  }), null);
  const tamperedApproval = JSON.parse(JSON.stringify(approval));
  tamperedApproval.provenance.publicArtifact.title = privateSentinel;
  assert.equal(serializePublishedArtifact({ approvalReceipt: tamperedApproval, publicationReceipt: publication }), null);
});

test('approval rejects credentialed and token-bearing source URLs before they can enter a public artifact', () => {
  const credentialed = weekendReadingsLeakFixture();
  credentialed.sourceRefs[0].url = 'https://reader:owner-secret@example.com/filing';
  credentialed.sourceRefs[0].metadata.weekendReadings.canonicalUrl = credentialed.sourceRefs[0].url;
  assert.throws(() => buildApprovalCandidate({ snapshot: credentialed, revisionId: 'revision-credentials' }), /embedded credentials/);

  const tokenBearing = weekendReadingsLeakFixture();
  tokenBearing.sourceRefs[0].url = 'https://example.com/filing?token=OWNER_SECRET_TOKEN';
  tokenBearing.sourceRefs[0].metadata.weekendReadings.canonicalUrl = tokenBearing.sourceRefs[0].url;
  assert.throws(() => buildApprovalCandidate({ snapshot: tokenBearing, revisionId: 'revision-token' }), /sensitive query parameter/);

  for (const sensitiveQuery of [
    'client_secret=OWNER_SECRET_CLIENT',
    'refresh-token=OWNER_SECRET_REFRESH',
    'token[]=OWNER_SECRET_NORMALIZED',
    'accessToken=SECRET_ACCESS_CAMEL',
    'clientSecret=SECRET_CLIENT_CAMEL',
    'auth[token]=SECRET_AUTH_NESTED',
    'token.value=SECRET_TOKEN_DOTTED'
  ]) {
    const hostile = weekendReadingsLeakFixture();
    hostile.sourceRefs[0].url = `https://example.com/filing?${sensitiveQuery}`;
    hostile.sourceRefs[0].metadata.weekendReadings.canonicalUrl = hostile.sourceRefs[0].url;
    assert.throws(
      () => buildApprovalCandidate({ snapshot: hostile, revisionId: `revision-${sensitiveQuery}` }),
      /sensitive query parameter/
    );
  }

  const { approval, publication } = lifecycle();
  assert.doesNotMatch(
    JSON.stringify(serializePublishedArtifact({ approvalReceipt: approval, publicationReceipt: publication })),
    /OWNER_SECRET_TOKEN|OWNER_SECRET_CLIENT|OWNER_SECRET_REFRESH|OWNER_SECRET_NORMALIZED|SECRET_ACCESS_CAMEL|SECRET_CLIENT_CAMEL|SECRET_AUTH_NESTED|SECRET_TOKEN_DOTTED|owner-secret/
  );
  for (const hostileUrl of [
    'https://example.com/filing?accessToken=SECRET_ACCESS_CAMEL',
    'https://example.com/filing?clientSecret=SECRET_CLIENT_CAMEL',
    'https://example.com/filing?auth[token]=SECRET_AUTH_NESTED',
    'https://example.com/filing?token.value=SECRET_TOKEN_DOTTED'
  ]) {
    const hostileApproval = JSON.parse(JSON.stringify(approval));
    hostileApproval.provenance.publicArtifact.sourceRefs[0].url = hostileUrl;
    assert.equal(
      serializePublishedArtifact({ approvalReceipt: hostileApproval, publicationReceipt: publication }),
      null,
      hostileUrl
    );
  }
});

test('public output excludes private page, claim, question, agent, and thesis-routing fields', () => {
  const { approval, publication } = lifecycle();
  const output = JSON.stringify(serializePublishedArtifact({ approvalReceipt: approval, publicationReceipt: publication }));
  assert.doesNotMatch(output, new RegExp(privateSentinel));
  [
    'affectedQuestion',
    'affectedClaimIds',
    'affectedUnknownIds',
    'affectedFalsifierIds',
    'activeThesisPageId',
    'thesisConnectionDisposition',
    'aiState',
    'discussions',
    'claims'
  ].forEach(field => assert.doesNotMatch(output, new RegExp(field)));
});

test('published artifact remains bound to the approved snapshot after the private draft changes', () => {
  const { approval, publication } = lifecycle();
  const changedDraft = weekendReadingsLeakFixture();
  changedDraft.title = 'Private changed title';
  changedDraft.sourceRefs[0].title = 'Private changed source';
  const serialized = serializePublishedArtifact({ approvalReceipt: approval, publicationReceipt: publication });
  assert.equal(serialized.title, 'Weekend Readings — 2026-07-19 — Edition 1');
  assert.equal(serialized.sourceRefs[0].title, 'Primary filing');
  assert.notEqual(serialized.title, changedDraft.title);
});
