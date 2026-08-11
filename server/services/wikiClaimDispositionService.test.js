const assert = require('assert');
const {
  WikiClaimDispositionError,
  disposeWikiClaimCandidate,
  receiptIdFor,
  validateBoundedClaimCandidate
} = require('./wikiClaimDispositionService');
const { createKnowledgeMovementChainFixture } = require('../fixtures/knowledgeMovementChainFixture');
const { buildClaimBodyPatch } = require('./wikiClaimBodyPatchService');
const { snapshotContentHash, snapshotPage } = require('./wikiRevisionService');

const clone = value => JSON.parse(JSON.stringify(value));
const sameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');

class Query {
  constructor(value) { this.value = value; }
  session() { return this; }
  select() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const replace = (target, source) => {
  const methods = Object.fromEntries(
    Object.entries(target).filter(([, value]) => typeof value === 'function')
  );
  Object.keys(target).forEach(key => delete target[key]);
  Object.assign(target, clone(source));
  Object.assign(target, methods);
};

const matches = (record, query = {}) => Object.entries(query).every(([key, expected]) => {
  if (key === 'status' && expected?.$ne) return record.status !== expected.$ne;
  if (key === 'continuityAnchor.kind') return record.continuityAnchor?.kind === expected;
  if (key === 'continuityAnchor.objectType') return record.continuityAnchor?.objectType === expected;
  if (key === 'continuityAnchor.objectId') return sameId(record.continuityAnchor?.objectId, expected);
  if (key === 'highlights._id') return (record.highlights || []).some(row => sameId(row._id, expected));
  return sameId(record[key], expected);
});

const asDoc = value => {
  const doc = clone(value);
  doc.markModified = () => {};
  doc.save = async () => doc;
  return doc;
};

const makeStore = ({ receiptFailure = false, transactionSupport = true } = {}) => {
  const fixture = createKnowledgeMovementChainFixture();
  const page = asDoc(fixture.page);
  const revision = asDoc(fixture.candidateRevision);
  const concept = asDoc(fixture.concept);
  const article = asDoc(fixture.importedSource);
  const receipts = [];
  let lock = Promise.resolve();
  const db = transactionSupport ? {
    startSession: async () => ({
      withTransaction: async callback => {
        const previous = lock;
        let release;
        lock = new Promise(resolve => { release = resolve; });
        await previous;
        const snapshots = {
          page: clone(page),
          revision: clone(revision),
          receipts: clone(receipts)
        };
        try {
          return await callback();
        } catch (error) {
          replace(page, snapshots.page);
          replace(revision, snapshots.revision);
          receipts.splice(0, receipts.length, ...snapshots.receipts);
          throw error;
        } finally {
          release();
        }
      },
      endSession: async () => {}
    })
  } : {};
  const WikiPage = {
    db,
    findOne: query => new Query(matches(page, query) ? page : null)
  };
  const WikiRevision = {
    findOne: query => new Query(matches(revision, query) ? revision : null)
  };
  const TagMeta = {
    findOne: query => new Query(matches(concept, query) ? concept : null)
  };
  const Article = {
    findOne: query => new Query(matches(article, query) ? article : null)
  };
  const emptyModel = { findOne: () => new Query(null) };
  const NoeisReceipt = {
    findOne: query => {
      const stored = receipts.find(row => matches(row, query));
      return new Query(stored ? clone(stored) : null);
    },
    findOneAndUpdate: async (query, update) => {
      if (receiptFailure) throw new Error('receipt write failed');
      let stored = receipts.find(row => matches(row, query));
      if (!stored) {
        stored = {};
        receipts.push(stored);
      }
      Object.assign(stored, clone(update.$set));
      return clone(stored);
    }
  };
  return {
    fixture,
    page,
    revision,
    receipts,
    models: {
      WikiPage,
      WikiRevision,
      NoeisReceipt,
      TagMeta,
      Article,
      NotebookEntry: emptyModel,
      Question: emptyModel
    }
  };
};

const addBodyPatch = (store) => {
  const claimId = store.page.claims[0].claimId;
  const beforeMark = {
    type: 'claim',
    attrs: { claimId, support: 'partial', citationIndexes: [], contradictionIndexes: [] }
  };
  store.page.body = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: store.page.claims[0].text, marks: [beforeMark] }] }]
  };
  const before = snapshotPage(store.page);
  const after = clone(before);
  after.claims[0] = clone(store.fixture.candidateRevision.after.claims[0]);
  after.body.content[0].content[0].marks[0].attrs = {
    claimId,
    support: 'conflicted',
    citationIndexes: [1],
    contradictionIndexes: [1]
  };
  const patch = buildClaimBodyPatch({
    beforeBody: before.body,
    afterBody: after.body,
    targetClaimId: claimId,
    beforeClaim: before.claims[0],
    proposedClaim: after.claims[0],
    afterSourceRefs: after.sourceRefs,
    afterCitations: after.citations
  });
  after.plainText = patch.plainText;
  store.revision.before = before;
  store.revision.after = after;
  store.revision.claimReview = {
    ...(store.revision.claimReview || {}),
    version: 1,
    scope: 'claim',
    targetClaimId: claimId,
    state: 'pending',
    events: [],
    bodyPatch: patch.manifest,
    basePageHash: snapshotContentHash(before)
  };
  return store;
};

const dispose = (store, action, extra = {}) => disposeWikiClaimCandidate({
  userId: store.fixture.ids.user,
  revisionId: store.fixture.ids.revision,
  action,
  now: () => new Date('2026-07-31T12:00:00.000Z'),
  ...store.models,
  ...extra
});

(async () => {
  const withTamperedReceipt = async (store, action, mutate, replay = () => dispose(store, action)) => {
    const receiptId = receiptIdFor(store.fixture.ids.revision, action);
    const index = store.receipts.findIndex(row => row.receiptId === receiptId);
    const original = clone(store.receipts[index]);
    const beforeRevision = clone(store.revision);
    const beforePage = clone(store.page);
    mutate(store.receipts[index]);
    try {
      await assert.rejects(
        replay,
        error => error instanceof WikiClaimDispositionError && error.code === 'claim_receipt_integrity_failed'
      );
      assert.deepStrictEqual(clone(store.revision), beforeRevision);
      assert.deepStrictEqual(clone(store.page), beforePage);
    } finally {
      store.receipts[index] = original;
    }
  };
  const withTamperedCandidate = async (store, action, mutate, replay = () => dispose(store, action)) => {
    const original = clone(store.revision);
    mutate(store.revision);
    try {
      await assert.rejects(
        replay,
        error => error instanceof WikiClaimDispositionError && error.code === 'claim_receipt_integrity_failed'
      );
    } finally {
      replace(store.revision, original);
    }
  };

  const accepted = makeStore();
  accepted.revision.after.claims[0].implication = 'This field is not in the human review contract.';
  accepted.revision.after.claims[0].falsifierIds = ['hidden-falsifier'];
  const result = await dispose(accepted, 'accept', { note: 'Evidence changes the support state.' });
  assert.strictEqual(result.state, 'accepted');
  assert.strictEqual(result.idempotent, false);
  assert.strictEqual(accepted.page.claims[0].support, 'conflicted');
  assert.strictEqual(accepted.page.claims[0].implication, undefined);
  assert.deepStrictEqual(accepted.page.claims[0].falsifierIds || [], []);
  assert.strictEqual(accepted.page.claims[0].history.at(-1).disposition, 'accepted');
  assert.strictEqual(accepted.page.aiState.candidateStatus, 'accepted');
  assert.strictEqual(accepted.page.freshness.status, 'fresh');
  assert.strictEqual(accepted.revision.promotionStatus, 'promoted');
  assert.strictEqual(accepted.revision.claimReview.conceptId, accepted.fixture.ids.concept);
  assert.strictEqual(accepted.receipts.length, 1);
  const replay = await dispose(accepted, 'accept');
  assert.strictEqual(replay.idempotent, true);
  assert.strictEqual(accepted.page.claims[0].history.length, 1);
  for (const mutate of [
    receipt => { receipt.kind = 'wrong_kind'; },
    receipt => { receipt.source = 'agent'; },
    receipt => { receipt.status = 'draft'; },
    receipt => { receipt.title = 'Forged title'; },
    receipt => { receipt.summary = 'Forged summary'; },
    receipt => { delete receipt.completedAt; },
    receipt => { receipt.provenance.version = 2; },
    receipt => { receipt.provenance.action = 'preserve'; },
    receipt => { receipt.provenance.revisionId = 'foreign-revision'; },
    receipt => { receipt.provenance.sourceEventId = 'foreign-event'; },
    receipt => { receipt.provenance.retainedCandidateHash = 'tampered'; },
    receipt => { receipt.provenance.pageId = 'foreign-page'; },
    receipt => { receipt.provenance.claimId = 'foreign-claim'; },
    receipt => { receipt.provenance.baseClaimHash = 'tampered'; },
    receipt => { receipt.provenance.proposedClaimHash = 'tampered'; },
    receipt => { receipt.touched = []; }
  ]) await withTamperedReceipt(accepted, 'accept', mutate);

  const acceptedReceiptId = receiptIdFor(accepted.fixture.ids.revision, 'accept');
  const acceptedReceiptIndex = accepted.receipts.findIndex(row => row.receiptId === acceptedReceiptId);
  const removedAcceptedReceipt = accepted.receipts.splice(acceptedReceiptIndex, 1)[0];
  await assert.rejects(
    () => dispose(accepted, 'accept'),
    error => error.code === 'claim_receipt_integrity_failed'
  );
  accepted.receipts.splice(acceptedReceiptIndex, 0, removedAcceptedReceipt);
  const embeddedAcceptedReceipt = clone(accepted.revision.claimReview.receipt);
  accepted.revision.claimReview.receipt.id = 'forged-embedded-receipt';
  await assert.rejects(
    () => dispose(accepted, 'accept'),
    error => error.code === 'claim_receipt_integrity_failed'
  );
  accepted.revision.claimReview.receipt = embeddedAcceptedReceipt;
  const embeddedAcceptedStatus = accepted.revision.claimReview.receipt.status;
  delete accepted.revision.claimReview.receipt.status;
  await assert.rejects(
    () => dispose(accepted, 'accept'),
    error => error.code === 'claim_receipt_integrity_failed'
  );
  accepted.revision.claimReview.receipt.status = embeddedAcceptedStatus;
  const acceptedEvent = clone(accepted.revision.claimReview.events.at(-1));
  accepted.revision.claimReview.events.at(-1).receiptId = 'forged-event-receipt';
  await assert.rejects(
    () => dispose(accepted, 'accept'),
    error => error.code === 'claim_receipt_integrity_failed'
  );
  accepted.revision.claimReview.events[accepted.revision.claimReview.events.length - 1] = acceptedEvent;
  const acceptedReviewedAt = accepted.revision.claimReview.reviewedAt;
  accepted.revision.claimReview.reviewedAt = '1999-01-01T00:00:00.000Z';
  await assert.rejects(
    () => dispose(accepted, 'accept'),
    error => error.code === 'claim_receipt_integrity_failed'
  );
  accepted.revision.claimReview.reviewedAt = acceptedReviewedAt;
  const assertReviewTamperFails = async mutate => {
    const original = clone(accepted.revision.claimReview);
    mutate(accepted.revision.claimReview);
    try {
      await assert.rejects(
        () => dispose(accepted, 'accept'),
        error => error.code === 'claim_receipt_integrity_failed'
      );
    } finally {
      accepted.revision.claimReview = original;
    }
  };
  for (const mutate of [
    review => { review.version = 2; },
    review => { review.scope = 'page'; },
    review => { review.basePageHash = 'tampered'; },
    review => { review.conceptId = 'foreign-concept'; },
    review => { review.proposedClaim.text = 'Forged retained proposal.'; },
    review => { review.events.at(-1).note = 'Forged human rationale.'; },
    review => { review.events.push({ action: 'reject', at: review.reviewedAt, receiptId: 'forged' }); }
  ]) await assertReviewTamperFails(mutate);
  await assert.rejects(() => dispose(accepted, 'reject'), error => (
    error instanceof WikiClaimDispositionError && error.status === 409
  ));

  const bodyAccepted = addBodyPatch(makeStore());
  const acceptedBodyHash = bodyAccepted.revision.claimReview.bodyPatch.afterBodyHash;
  const bodyResult = await dispose(bodyAccepted, 'accept');
  assert.strictEqual(bodyResult.state, 'accepted');
  assert.strictEqual(bodyAccepted.page.body.content[0].content[0].marks[0].attrs.support, 'conflicted');
  assert.strictEqual(bodyAccepted.receipts[0].provenance.bodyPatch.afterBodyHash, acceptedBodyHash);
  await withTamperedReceipt(bodyAccepted, 'accept', receipt => {
    receipt.provenance.bodyPatch.afterBodyHash = 'tampered';
  });

  const publicExternal = makeStore();
  const publicRef = clone(publicExternal.revision.after.sourceRefs[0]);
  Object.assign(publicRef, {
    type: 'external',
    provider: 'sec-edgar public',
    url: 'https://www.sec.gov/example-filing',
    metadata: { provenance: { licenseOrAccess: 'public' } }
  });
  publicExternal.page.sourceRefs = [clone(publicRef)];
  publicExternal.revision.before.sourceRefs = [clone(publicRef)];
  publicExternal.revision.after.sourceRefs = [clone(publicRef)];
  const publicExternalResult = await dispose(publicExternal, 'accept');
  assert.strictEqual(publicExternalResult.state, 'accepted');

  const paidExternal = makeStore();
  const paidRef = clone(paidExternal.revision.after.sourceRefs[0]);
  Object.assign(paidRef, {
    type: 'external',
    provider: 'fmp transcript paid',
    url: 'https://example.com/paid-transcript'
  });
  paidExternal.page.sourceRefs = [clone(paidRef)];
  paidExternal.revision.before.sourceRefs = [clone(paidRef)];
  paidExternal.revision.after.sourceRefs = [clone(paidRef)];
  await assert.rejects(() => dispose(paidExternal, 'accept'), error => error.code === 'unresolved_evidence');

  const bodyPreserved = addBodyPatch(makeStore());
  const bodyBeforePreserve = clone(bodyPreserved.page.body);
  await dispose(bodyPreserved, 'preserve');
  assert.deepStrictEqual(bodyPreserved.page.body, bodyBeforePreserve);

  const bodyStale = addBodyPatch(makeStore());
  bodyStale.page.body.content.push({ type: 'paragraph', content: [{ type: 'text', text: 'Human edit.' }] });
  await assert.rejects(() => dispose(bodyStale, 'accept'), error => error.code === 'stale_page');

  const bodyRollback = addBodyPatch(makeStore({ receiptFailure: true }));
  const bodyBeforeRollback = clone(bodyRollback.page);
  await assert.rejects(() => dispose(bodyRollback, 'accept'), /receipt write failed/);
  assert.deepStrictEqual(clone(bodyRollback.page), bodyBeforeRollback);

  const preserved = makeStore();
  const semanticBeforePreserve = clone(preserved.page.claims[0]);
  delete semanticBeforePreserve.history;
  delete semanticBeforePreserve.lastReviewedAt;
  await dispose(preserved, 'preserve');
  const semanticAfterPreserve = clone(preserved.page.claims[0]);
  delete semanticAfterPreserve.history;
  delete semanticAfterPreserve.lastReviewedAt;
  assert.deepStrictEqual(semanticAfterPreserve, semanticBeforePreserve);
  assert.strictEqual(preserved.page.claims[0].history.at(-1).disposition, 'preserved');
  assert.strictEqual(preserved.page.aiState.candidateStatus, 'accepted');
  assert.strictEqual(preserved.revision.promotionStatus, 'preserved');
  assert.strictEqual(preserved.page.sourceRefs.length, 1);
  assert.strictEqual(preserved.page.citations.length, 1);
  assert.ok(preserved.page.sourceRefs.some(ref => (
    String(ref._id) === preserved.page.claims[0].history.at(-1).evidenceDelta.addedSourceRefIds[0]
  )));
  assert.strictEqual((await dispose(preserved, 'preserve')).idempotent, true);

  const deferred = makeStore();
  const pageBeforeDefer = clone(deferred.page);
  await dispose(deferred, 'defer', { deferredUntil: '2026-08-15T12:00:00.000Z' });
  assert.deepStrictEqual(clone(deferred.page), pageBeforeDefer);
  assert.strictEqual(deferred.revision.promotionStatus, 'deferred');
  assert.strictEqual((await dispose(deferred, 'defer', {
    deferredUntil: '2026-08-15T12:00:00.000Z'
  })).idempotent, true);
  await assert.rejects(
    () => dispose(deferred, 'defer', { deferredUntil: '2026-08-16T12:00:00.000Z' }),
    error => error.code === 'claim_receipt_integrity_failed'
  );
  await withTamperedReceipt(deferred, 'defer', receipt => {
    receipt.provenance.deferredUntil = '2026-08-16T12:00:00.000Z';
  }, () => dispose(deferred, 'defer', { deferredUntil: '2026-08-15T12:00:00.000Z' }));
  await withTamperedCandidate(deferred, 'defer', revision => {
    revision.after.unrelated = 'forged';
  }, () => dispose(deferred, 'defer', { deferredUntil: '2026-08-15T12:00:00.000Z' }));
  await dispose(deferred, 'accept');
  assert.strictEqual(deferred.revision.claimReview.state, 'accepted');
  assert.strictEqual(deferred.receipts.length, 2);

  const invalidDeferral = makeStore();
  await assert.rejects(() => dispose(invalidDeferral, 'defer'), /deferredUntil is required/);
  await assert.rejects(
    () => dispose(invalidDeferral, 'defer', { deferredUntil: '2026-07-30T12:00:00.000Z' }),
    /deferredUntil must be in the future/
  );

  const rejected = makeStore();
  rejected.page.aiState = { candidateStatus: 'awaiting_claim_acceptance' };
  const acceptedKnowledgeBeforeReject = clone({
    body: rejected.page.body,
    plainText: rejected.page.plainText,
    claims: rejected.page.claims,
    citations: rejected.page.citations,
    sourceRefs: rejected.page.sourceRefs
  });
  await dispose(rejected, 'reject');
  assert.deepStrictEqual(clone({
    body: rejected.page.body,
    plainText: rejected.page.plainText,
    claims: rejected.page.claims,
    citations: rejected.page.citations,
    sourceRefs: rejected.page.sourceRefs
  }), acceptedKnowledgeBeforeReject);
  assert.strictEqual(rejected.page.aiState.candidateStatus, 'maintenance_rejected');
  assert.strictEqual(rejected.page.freshness.status, 'needs_review');
  assert.strictEqual((await dispose(rejected, 'reject')).idempotent, true);
  await withTamperedCandidate(rejected, 'reject', revision => {
    revision.after.sourceRefs.push({ _id: 'foreign-source', type: 'external' });
  });
  await withTamperedCandidate(rejected, 'reject', revision => {
    revision.sourceEventId = 'foreign-event';
  });

  const rejectMalformed = makeStore();
  rejectMalformed.revision.after.body = { unrelated: 'malformed candidate change' };
  rejectMalformed.page.claims[0].text = 'A newer human-authored claim.';
  rejectMalformed.page.status = 'archived';
  rejectMalformed.models.TagMeta.findOne = () => new Query(null);
  rejectMalformed.models.Article.findOne = () => new Query(null);
  const malformedResult = await dispose(rejectMalformed, 'reject');
  assert.strictEqual(malformedResult.state, 'rejected');
  assert.strictEqual(rejectMalformed.receipts.length, 1);

  const stale = makeStore();
  stale.page.claims[0].text = 'A newer human-authored claim.';
  await assert.rejects(() => dispose(stale, 'accept'), error => error.code === 'stale_claim');
  assert.strictEqual(stale.receipts.length, 0);

  const foreignExistingEvidence = makeStore();
  foreignExistingEvidence.revision.before.sourceRefs = clone(foreignExistingEvidence.page.sourceRefs);
  foreignExistingEvidence.revision.before.citations = clone(foreignExistingEvidence.page.citations);
  foreignExistingEvidence.revision.after.sourceRefs = clone(foreignExistingEvidence.page.sourceRefs);
  foreignExistingEvidence.revision.after.citations = clone(foreignExistingEvidence.page.citations);
  foreignExistingEvidence.models.Article.findOne = () => new Query(null);
  await assert.rejects(
    () => dispose(foreignExistingEvidence, 'accept'),
    error => error.code === 'unresolved_evidence'
  );
  assert.strictEqual(foreignExistingEvidence.receipts.length, 0);

  const unbounded = makeStore();
  unbounded.page.investmentDossier = { version: 2 };
  assert.throws(
    () => validateBoundedClaimCandidate({ revision: unbounded.revision, page: unbounded.page }),
    error => error.code === 'claim_body_required'
  );
  delete unbounded.page.investmentDossier;
  unbounded.revision.after.body = { type: 'doc', content: [] };
  assert.throws(
    () => validateBoundedClaimCandidate({ revision: unbounded.revision, page: unbounded.page }),
    error => error.code === 'unbounded_candidate'
  );
  unbounded.revision.after = clone(unbounded.fixture.candidateRevision.after);
  unbounded.revision.before.claims.push({ claimId: 'second', text: 'Before' });
  unbounded.revision.after.claims.push({ claimId: 'second', text: 'After' });
  assert.throws(
    () => validateBoundedClaimCandidate({ revision: unbounded.revision, page: unbounded.page }),
    error => error.code === 'unbounded_candidate'
  );
  unbounded.revision.before.claims = clone(unbounded.fixture.candidateRevision.before.claims);
  unbounded.revision.after.claims = clone(unbounded.fixture.candidateRevision.after.claims);
  unbounded.revision.before.claims.push({ claimId: '', text: 'Blank identity' });
  unbounded.revision.after.claims.push({ claimId: '', text: 'Blank identity' });
  assert.throws(
    () => validateBoundedClaimCandidate({ revision: unbounded.revision, page: unbounded.page }),
    error => error.code === 'unbounded_candidate'
  );
  unbounded.revision.before.claims = clone(unbounded.fixture.candidateRevision.before.claims);
  unbounded.revision.after.claims = clone(unbounded.fixture.candidateRevision.after.claims);
  unbounded.revision.after.claims[0].citationIds = ['missing-citation'];
  assert.throws(
    () => validateBoundedClaimCandidate({ revision: unbounded.revision, page: unbounded.page }),
    error => error.code === 'unresolved_evidence'
  );
  unbounded.revision.before = clone(unbounded.fixture.candidateRevision.before);
  unbounded.revision.after = clone(unbounded.fixture.candidateRevision.after);
  unbounded.revision.after.citations[0].sourceRefId = null;
  assert.throws(
    () => validateBoundedClaimCandidate({ revision: unbounded.revision, page: unbounded.page }),
    error => error.code === 'unresolved_evidence'
  );

  const rollback = makeStore({ receiptFailure: true });
  const rollbackPage = clone(rollback.page);
  const rollbackRevision = clone(rollback.revision);
  await assert.rejects(() => dispose(rollback, 'accept'), /receipt write failed/);
  assert.deepStrictEqual(clone(rollback.page), rollbackPage);
  assert.deepStrictEqual(clone(rollback.revision), rollbackRevision);

  const unsupported = makeStore({ transactionSupport: false });
  await assert.rejects(() => dispose(unsupported, 'accept'), error => error.code === 'transactions_required');

  const concurrent = makeStore();
  const races = await Promise.allSettled([dispose(concurrent, 'accept'), dispose(concurrent, 'reject')]);
  assert.strictEqual(races.filter(row => row.status === 'fulfilled').length, 1);
  assert.strictEqual(races.filter(row => row.status === 'rejected').length, 1);
  assert.strictEqual(concurrent.receipts.length, 1);

  console.log('wikiClaimDispositionService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
