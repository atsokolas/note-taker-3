const assert = require('assert');
const {
  Article,
  NotebookEntry,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  TagMeta,
  ConceptDecisionLessonEvidence,
  Connection,
  ReferenceEdge,
  NoeisReceipt
} = require('./index');

const indexFor = (model, keys) => model.schema.indexes().find(([fields]) => (
  JSON.stringify(fields) === JSON.stringify(keys)
));

const requireIndex = (model, keys, expectedOptions = {}) => {
  const found = indexFor(model, keys);
  assert.ok(found, `${model.modelName} must define ${JSON.stringify(keys)}.`);
  Object.entries(expectedOptions).forEach(([key, value]) => {
    assert.deepStrictEqual(found[1][key], value, `${model.modelName} index option ${key} must match.`);
  });
};

const enumValues = path => [...path.enumValues].sort();

requireIndex(Article, { userId: 1, createdAt: -1, _id: -1 });
requireIndex(NotebookEntry, { userId: 1, createdAt: -1, _id: -1 });
requireIndex(WikiPage, { userId: 1, 'sourceRefs.objectId': 1 });
requireIndex(WikiSourceEvent, { userId: 1, status: 1, 'metadata.ingestReviewedAt': -1 });
requireIndex(Connection, { userId: 1, fromType: 1, fromId: 1, createdAt: -1 });
requireIndex(Connection, { userId: 1, toType: 1, toId: 1, createdAt: -1 });
requireIndex(ReferenceEdge, { userId: 1, sourceType: 1, sourceId: 1 });
requireIndex(NoeisReceipt, { userId: 1, kind: 1, status: 1, completedAt: -1 });

const decisionSchema = WikiPage.schema.path('judgment.decisions').schema;
assert.ok(decisionSchema, 'Wiki judgment decisions must remain embedded records.');
assert.deepStrictEqual(
  enumValues(decisionSchema.path('status')),
  ['cancelled', 'planned', 'reviewed', 'taken']
);
assert.deepStrictEqual(
  enumValues(decisionSchema.path('acceptedRevisionDisposition')),
  ['accepted', 'preserved']
);
assert.deepStrictEqual(enumValues(decisionSchema.path('acceptedBy')), ['user']);
assert.strictEqual(decisionSchema.path('acceptedRevisionId').options.ref, 'WikiRevision');
assert.strictEqual(decisionSchema.path('recordedRevisionId').options.ref, 'WikiRevision');
[
  'acceptedAt',
  'basisPageHash',
  'immutableSnapshotHash',
  'receiptId',
  'outcomeDueAt'
].forEach(path => assert.ok(decisionSchema.path(path), `Decision integrity path ${path} must exist.`));

const outcomeSchema = decisionSchema.path('outcome').schema;
assert.ok(outcomeSchema, 'Decision outcomes must remain embedded records.');
assert.deepStrictEqual(enumValues(outcomeSchema.path('reviewedBy')), ['user']);
assert.strictEqual(outcomeSchema.path('revisionId').options.ref, 'WikiRevision');
assert.strictEqual(outcomeSchema.path('processScore').options.min, 0);
assert.strictEqual(outcomeSchema.path('processScore').options.max, 1);
[
  'evidenceSourceRefIds',
  'reviewedAt',
  'receiptId',
  'decisionSnapshotHash',
  'recordHash'
].forEach(path => assert.ok(outcomeSchema.path(path), `Outcome integrity path ${path} must exist.`));

assert.deepStrictEqual(
  enumValues(WikiRevision.schema.path('promotionStatus')),
  ['candidate', 'deferred', 'preserved', 'promoted', 'rejected']
);
const claimReviewSchema = WikiRevision.schema.path('claimReview').schema;
assert.ok(claimReviewSchema, 'Wiki revisions must carry an embedded claim-review envelope.');
assert.deepStrictEqual(enumValues(claimReviewSchema.path('scope')), ['claim']);
assert.deepStrictEqual(
  enumValues(claimReviewSchema.path('state')),
  ['accepted', 'deferred', 'pending', 'preserved', 'rejected']
);
assert.strictEqual(claimReviewSchema.path('targetClaimId').options.required, true);
assert.strictEqual(claimReviewSchema.path('conceptId').options.ref, 'TagMeta');
[
  'basePageHash',
  'baseClaimHash',
  'proposedClaimHash',
  'proposedClaim',
  'bodyPatch',
  'affected',
  'reviewedAt',
  'deferredUntil',
  'receipt'
].forEach(path => assert.ok(claimReviewSchema.path(path), `Claim-review path ${path} must exist.`));
const reviewEventSchema = claimReviewSchema.path('events').schema;
assert.deepStrictEqual(
  enumValues(reviewEventSchema.path('action')),
  ['accept', 'defer', 'preserve', 'reject']
);
assert.strictEqual(reviewEventSchema.path('receiptId').options.required, true);

const continuitySchema = TagMeta.schema.path('continuityAnchor').schema;
assert.ok(continuitySchema, 'Concepts must carry the Wiki continuity anchor.');
assert.deepStrictEqual(enumValues(continuitySchema.path('kind')), ['wiki_investigation']);
assert.deepStrictEqual(enumValues(continuitySchema.path('objectType')), ['wiki_page']);
assert.deepStrictEqual(enumValues(continuitySchema.path('linkedBy')), ['user']);
assert.strictEqual(continuitySchema.path('objectId').options.ref, 'WikiPage');
requireIndex(
  TagMeta,
  {
    userId: 1,
    'continuityAnchor.kind': 1,
    'continuityAnchor.objectType': 1,
    'continuityAnchor.objectId': 1
  },
  {
    unique: true,
    partialFilterExpression: {
      'continuityAnchor.kind': 'wiki_investigation',
      'continuityAnchor.objectType': 'wiki_page',
      'continuityAnchor.objectId': { $type: 'objectId' }
    }
  }
);

assert.ok(ConceptDecisionLessonEvidence, 'Decision lesson evidence must be exported as a model.');
const lessonSchema = ConceptDecisionLessonEvidence.schema;
assert.deepStrictEqual(enumValues(lessonSchema.path('role')), ['context', 'support', 'tension']);
assert.deepStrictEqual(enumValues(lessonSchema.path('result')), ['mixed', 'negative', 'positive']);
assert.deepStrictEqual(enumValues(lessonSchema.path('acceptedBy')), ['user']);
assert.strictEqual(lessonSchema.path('processScore').options.min, 0);
assert.strictEqual(lessonSchema.path('processScore').options.max, 1);
[
  'adoptionId',
  'targetConceptId',
  'sourcePageId',
  'decisionId',
  'lessonId',
  'lessonSnapshot',
  'calibrationNoteSnapshot',
  'observedAt',
  'acceptedRevisionId',
  'recordedRevisionId',
  'outcomeRevisionId',
  'decisionReceiptId',
  'outcomeReceiptId',
  'receiptId',
  'requestId',
  'decisionSnapshotHash',
  'outcomeRecordHash',
  'payloadHash',
  'acceptedAt',
  'acceptedBy',
  'userId'
].forEach(path => assert.strictEqual(
  lessonSchema.path(path).options.required,
  true,
  `Decision lesson evidence path ${path} must remain required.`
));
requireIndex(ConceptDecisionLessonEvidence, { userId: 1, adoptionId: 1 }, { unique: true });
requireIndex(
  ConceptDecisionLessonEvidence,
  { userId: 1, targetConceptId: 1, sourcePageId: 1, decisionId: 1 },
  { unique: true }
);
requireIndex(ConceptDecisionLessonEvidence, { userId: 1, targetConceptId: 1, acceptedAt: -1 });

console.log('Knowledge continuity schema contract tests passed');
