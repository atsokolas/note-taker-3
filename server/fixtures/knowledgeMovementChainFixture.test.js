const assert = require('assert');
const {
  Article,
  TagMeta,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  NoeisReceipt
} = require('../models');
const { buildKnowledgeMovements } = require('../services/knowledgeMovementService');
const {
  createKnowledgeMovementChainFixture
} = require('./knowledgeMovementChainFixture');

class Query {
  constructor(value) {
    this.value = value;
  }
  sort() { return this; }
  limit() { return this; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const modelsFor = ({ fixture, accepted = false, includeRevision = true }) => ({
  WikiPage: { find: () => new Query([fixture.page]) },
  WikiRevision: {
    find: () => new Query(includeRevision
      ? [accepted ? fixture.acceptedRevision : fixture.candidateRevision]
      : [])
  },
  WikiSourceEvent: { find: () => new Query([fixture.sourceEvent]) },
  TagMeta: { find: () => new Query([fixture.concept]) },
  NoeisReceipt: {
    find: () => new Query(accepted ? [fixture.acceptanceReceipt] : [])
  },
  Article: {
    find: () => new Query([fixture.importedSource]),
    findOne: () => new Query(fixture.importedSource)
  }
});

const assertSchemaValid = document => {
  const error = document.validateSync();
  assert.strictEqual(error, undefined, error?.message);
};

const run = async () => {
  const fixture = createKnowledgeMovementChainFixture();

  assertSchemaValid(new Article({
    _id: fixture.importedSource._id,
    userId: fixture.importedSource.userId,
    title: fixture.importedSource.title,
    url: fixture.importedSource.url,
    source: fixture.importedSource.importMeta.provider,
    importMeta: fixture.importedSource.importMeta
  }));
  assertSchemaValid(new TagMeta(fixture.concept));
  assertSchemaValid(new WikiPage(fixture.page));
  assertSchemaValid(new WikiRevision(fixture.candidateRevision));
  assertSchemaValid(new WikiSourceEvent(fixture.sourceEvent));
  assertSchemaValid(new NoeisReceipt(fixture.acceptanceReceipt));

  const decision = fixture.page.judgment.decisions[0];
  assert.ok(decision.relatedClaimIds.includes(fixture.claimId));
  assert.ok(decision.sourceRefIds.includes(fixture.ids.sourceRef));
  assert.ok(decision.outcome.observedAt);
  assert.ok(decision.outcome.lesson);
  assert.strictEqual(fixture.candidateRevision.sourceEventId, fixture.sourceEvent._id);
  assert.strictEqual(fixture.sourceEvent.sourceObjectId, fixture.importedSource._id);
  assert.strictEqual(fixture.page.createdFrom.objectId, fixture.concept._id);

  const candidate = await buildKnowledgeMovements({
    userId: fixture.ids.user,
    models: modelsFor({ fixture }),
    since: new Date('2026-07-27T00:00:00.000Z'),
    limit: 3
  });
  assert.strictEqual(candidate.length, 1);
  assert.strictEqual(candidate[0].kind, 'contradiction');
  assert.strictEqual(candidate[0].reviewState, 'candidate');
  assert.strictEqual(candidate[0].subject.id, fixture.claimId);
  assert.strictEqual(candidate[0].evidence[0].id, fixture.importedSource._id);
  assert.ok(candidate[0].affected.some(ref => ref.id === fixture.page._id));
  assert.ok(candidate[0].affected.some(ref => ref.id === fixture.concept._id));

  const replay = await buildKnowledgeMovements({
    userId: fixture.ids.user,
    models: modelsFor({ fixture }),
    since: new Date('2026-07-27T00:00:00.000Z'),
    limit: 3
  });
  assert.deepStrictEqual(replay, candidate);

  const accepted = await buildKnowledgeMovements({
    userId: fixture.ids.user,
    models: modelsFor({ fixture, accepted: true }),
    since: new Date('2026-07-27T16:00:00.000Z'),
    limit: 3
  });
  assert.strictEqual(accepted.length, 1);
  assert.strictEqual(accepted[0].reviewState, 'current');
  assert.strictEqual(
    new Date(accepted[0].occurredAt).toISOString(),
    fixture.acceptanceReceipt.completedAt
  );

  const timestampOnly = await buildKnowledgeMovements({
    userId: fixture.ids.user,
    models: modelsFor({ fixture, includeRevision: false }),
    since: new Date('2026-07-27T00:00:00.000Z'),
    limit: 3
  });
  assert.deepStrictEqual(timestampOnly, []);

  console.log('knowledge movement chain fixture tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
