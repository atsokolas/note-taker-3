const assert = require('assert');
const {
  FIELD_ALPHA_THRESHOLDS,
  buildFieldReadiness,
  traceableMovement,
  canonicalNodeType
} = require('./fieldReadinessService');

const USER_ID = '64fa00000000000000000001';
const OTHER_USER_ID = '64fa00000000000000000002';
const oid = number => `64fb${String(number).padStart(20, '0')}`;
const IDS = {
  concepts: [oid(1), oid(2), oid(3)],
  articles: [oid(11), oid(12), oid(13)],
  pages: [oid(21), oid(22), oid(23)],
  notebook: oid(31),
  question: oid(41),
  highlight: oid(51),
  stale: oid(99)
};

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const modelFor = rows => ({ find: () => new Query(rows) });
const movement = index => ({
  id: `movement-${index}`,
  kind: index % 2 ? 'contradiction' : 'claim_changed',
  subject: { id: `claim-${index}`, href: `/wiki/workspace?page=page-${index}&claimId=claim-${index}` },
  provenance: {
    eventIds: [`event-${index}`],
    revisionIds: [`revision-${index}`],
    deterministicFacts: [`Fact ${index}`]
  }
});
const inverseRelation = relation => ({
  related: 'referenced_by',
  supports: 'supported_by',
  contained_by: 'contains'
}[relation] || relation);
const bidirectional = rows => rows.flatMap((row, index) => [
  { ...row, _id: `${row._id || `edge-${index}`}-forward` },
  {
    ...row,
    _id: `${row._id || `edge-${index}`}-reciprocal`,
    fromType: row.toType,
    fromId: row.toId,
    toType: row.fromType,
    toId: row.fromId,
    relationType: inverseRelation(row.relationType)
  }
]);

const concepts = IDS.concepts.map((_id, index) => ({
  _id,
  userId: USER_ID,
  name: `Territory ${index + 1}`
}));
const articles = IDS.articles.map((_id, index) => ({
  _id,
  userId: USER_ID,
  title: `Article ${index + 1}`,
  highlights: index === 0 ? [{ _id: IDS.highlight }] : []
}));
const pages = IDS.pages.map((_id, index) => ({
  _id,
  userId: USER_ID,
  title: `Wiki ${index + 1}`,
  status: 'draft',
  claims: index === 0 ? [{ claimId: 'claim-1' }] : []
}));
const notebooks = [{ _id: IDS.notebook, userId: USER_ID, title: 'Notebook' }];
const questions = [{ _id: IDS.question, userId: USER_ID, text: 'Question?' }];
const connections = bidirectional([
  ['concept', IDS.concepts[0], 'article', IDS.articles[0]],
  ['concept', IDS.concepts[0], 'wiki_page', IDS.pages[0]],
  ['concept', IDS.concepts[1], 'article', IDS.articles[1]],
  ['concept', IDS.concepts[1], 'wiki_page', IDS.pages[1]],
  ['concept', IDS.concepts[2], 'article', IDS.articles[2]],
  ['concept', IDS.concepts[2], 'wiki_page', IDS.pages[2]],
  ['article', IDS.articles[0], 'note', IDS.notebook],
  ['article', IDS.articles[1], 'notebook', IDS.notebook],
  ['article', IDS.articles[2], 'question', IDS.question],
  ['wiki_page', IDS.pages[0], 'question', IDS.question]
].map(([fromType, fromId, toType, toId], index) => ({
  _id: `connection-${index}`,
  userId: USER_ID,
  fromType,
  fromId,
  toType,
  toId,
  relationType: 'related'
})));

const durableModels = ({ connectionRows = connections, referenceRows = [], extra = {} } = {}) => ({
  Connection: modelFor(connectionRows),
  ReferenceEdge: modelFor(referenceRows),
  TagMeta: modelFor(concepts),
  Article: modelFor(articles),
  NotebookEntry: modelFor(notebooks),
  Question: modelFor(questions),
  WikiPage: modelFor(pages),
  ...extra
});

const run = async () => {
  assert.strictEqual(traceableMovement(movement(1)), true);
  assert.strictEqual(traceableMovement({ ...movement(1), provenance: { deterministicFacts: [] } }), false);
  assert.strictEqual(canonicalNodeType('note'), 'notebook');
  assert.strictEqual(canonicalNodeType('tagmeta'), 'concept');
  assert.strictEqual(canonicalNodeType('external'), '');

  const ready = await buildFieldReadiness({
    userId: USER_ID,
    asOf: new Date('2026-07-31T12:00:00.000Z'),
    models: durableModels({
      connectionRows: [
        ...connections,
        { ...connections[0], _id: 'foreign', userId: OTHER_USER_ID }
      ],
      referenceRows: [
        {
          _id: 'duplicate',
          userId: USER_ID,
          sourceType: 'notebook',
          sourceId: IDS.notebook,
          targetType: 'article',
          targetId: IDS.articles[0]
        },
        {
          _id: 'unresolved',
          userId: USER_ID,
          sourceType: 'notebook',
          sourceId: IDS.notebook,
          targetType: 'concept',
          targetId: null
        }
      ]
    }),
    movementBuilder: async () => [
      ...Array.from({ length: FIELD_ALPHA_THRESHOLDS.verifiedMovements }, (_, index) => movement(index + 1)),
      movement(1)
    ]
  });

  assert.strictEqual(ready.eligible, true);
  assert.strictEqual(ready.state, 'ready_for_field_alpha');
  assert.deepStrictEqual(ready.gaps, []);
  assert.strictEqual(ready.metrics.verifiedMovements, 6);
  assert.strictEqual(ready.metrics.navigableEdges, 10);
  assert.strictEqual(ready.metrics.connectedObjects, 11);
  assert.strictEqual(ready.metrics.activeTerritories, 3);
  assert.strictEqual(ready.metrics.unresolvedEdges, 1);
  assert.deepStrictEqual(ready.evidence.territoryIds, [...IDS.concepts].sort());

  const adversarialConnections = Array.from({ length: 10 }, (_, index) => ({
    _id: `ghost-${index}`,
    userId: USER_ID,
    fromType: index < 3 ? 'concept' : 'fabricated_type',
    fromId: index < 3 ? IDS.concepts[index] : oid(200 + index),
    toType: 'article',
    toId: oid(300 + index),
    relationType: 'related'
  }));
  const adversarial = await buildFieldReadiness({
    userId: USER_ID,
    asOf: '2026-07-31T12:00:00.000Z',
    models: durableModels({ connectionRows: adversarialConnections }),
    movementBuilder: async () => Array.from(
      { length: FIELD_ALPHA_THRESHOLDS.verifiedMovements },
      (_, index) => movement(index + 1)
    )
  });
  assert.strictEqual(adversarial.eligible, false);
  assert.strictEqual(adversarial.metrics.navigableEdges, 0);
  assert.strictEqual(adversarial.metrics.connectedObjects, 0);
  assert.strictEqual(adversarial.metrics.activeTerritories, 0);
  assert.strictEqual(adversarial.metrics.unresolvedEdges, 10);

  const exactNestedObjects = await buildFieldReadiness({
    userId: USER_ID,
    asOf: '2026-07-31T12:00:00.000Z',
    thresholds: {
      verifiedMovements: 1,
      navigableEdges: 2,
      connectedObjects: 3,
      activeTerritories: 0
    },
    models: durableModels({
      connectionRows: bidirectional([
        {
          _id: 'highlight-edge', userId: USER_ID,
          fromType: 'highlight', fromId: IDS.highlight,
          toType: 'wiki_claim', toId: `${IDS.pages[0]}:claim-1`, relationType: 'supports'
        },
        {
          _id: 'claim-page-edge', userId: USER_ID,
          fromType: 'wiki_claim', fromId: `${IDS.pages[0]}:claim-1`,
          toType: 'wiki_page', toId: IDS.pages[0], relationType: 'contained_by'
        },
        {
          _id: 'missing-claim', userId: USER_ID,
          fromType: 'wiki_claim', fromId: `${IDS.pages[0]}:missing`,
          toType: 'wiki_page', toId: IDS.pages[0], relationType: 'contained_by'
        }
      ])
    }),
    movementBuilder: async () => [movement(1)]
  });
  assert.strictEqual(exactNestedObjects.eligible, true);
  assert.strictEqual(exactNestedObjects.metrics.navigableEdges, 2);
  assert.strictEqual(exactNestedObjects.metrics.unresolvedEdges, 2);

  const suppressed = await buildFieldReadiness({
    userId: USER_ID,
    asOf: '2026-07-31T12:00:00.000Z',
    models: durableModels({
      connectionRows: [connections[0]],
      extra: {
        Article: modelFor([{ ...articles[0], hiddenFromHome: true }])
      }
    }),
    movementBuilder: async () => [movement(1)]
  });
  assert.strictEqual(suppressed.metrics.navigableEdges, 0);
  assert.strictEqual(suppressed.metrics.unresolvedEdges, 1);

  const foreignEndpoint = await buildFieldReadiness({
    userId: USER_ID,
    asOf: '2026-07-31T12:00:00.000Z',
    models: durableModels({
      connectionRows: [{
        _id: 'foreign-target', userId: USER_ID,
        fromType: 'concept', fromId: IDS.concepts[0],
        toType: 'article', toId: IDS.stale, relationType: 'related'
      }],
      referenceRows: [{
        _id: 'operational-target', userId: USER_ID,
        sourceType: 'notebook', sourceId: IDS.notebook,
        targetType: 'import_session', targetId: IDS.stale
      }],
      extra: {
        Article: modelFor([{ _id: IDS.stale, userId: OTHER_USER_ID, title: 'Foreign article' }])
      }
    }),
    movementBuilder: async () => [movement(1)]
  });
  assert.strictEqual(foreignEndpoint.metrics.navigableEdges, 0);
  assert.strictEqual(foreignEndpoint.metrics.unresolvedEdges, 2);

  const namedConcept = await buildFieldReadiness({
    userId: USER_ID,
    asOf: '2026-07-31T12:00:00.000Z',
    thresholds: { verifiedMovements: 1, navigableEdges: 1, connectedObjects: 2, activeTerritories: 1 },
    models: durableModels({
      connectionRows: [],
      referenceRows: [{
        _id: 'named-concept', userId: USER_ID,
        sourceType: 'notebook', sourceId: IDS.notebook,
        targetType: 'concept', targetId: null, targetTagName: 'territory 1'
      }]
    }),
    movementBuilder: async () => [movement(1)]
  });
  assert.strictEqual(namedConcept.eligible, true);
  assert.strictEqual(namedConcept.metrics.activeTerritories, 1);

  const ambiguousConcept = await buildFieldReadiness({
    userId: USER_ID,
    asOf: '2026-07-31T12:00:00.000Z',
    models: durableModels({
      connectionRows: [],
      referenceRows: [{
        _id: 'ambiguous-concept', userId: USER_ID,
        sourceType: 'notebook', sourceId: IDS.notebook,
        targetType: 'tag', targetId: null, targetTagName: 'TERRITORY 1'
      }],
      extra: {
        TagMeta: modelFor([
          ...concepts,
          { _id: oid(4), userId: USER_ID, name: 'territory 1' }
        ])
      }
    }),
    movementBuilder: async () => [movement(1)]
  });
  assert.strictEqual(ambiguousConcept.metrics.navigableEdges, 0);
  assert.strictEqual(ambiguousConcept.metrics.unresolvedEdges, 1);

  await assert.rejects(
    () => buildFieldReadiness({ userId: USER_ID, asOf: 'not-a-date', movementBuilder: async () => [] }),
    /asOf must be a valid date/
  );

  console.log('fieldReadinessService tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
