const assert = require('assert');
const {
  buildLibraryRelevance,
  buildLibraryRelevancePage,
  buildLibrarySourceDetail,
  safeSourceUrl
} = require('./libraryRelevanceService');

const USER_ID = '64f100000000000000000001';
const OTHER_USER_ID = '64f100000000000000000002';

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const modelFor = (name, rows, queries) => ({
  find(query) {
    queries.push({ name, query });
    return new Query(rows);
  }
});

const article = (suffix, overrides = {}) => ({
  _id: `64f1000000000000000000${suffix}`,
  userId: USER_ID,
  title: `Source ${suffix}`,
  url: `https://example.com/source-${suffix}`,
  createdAt: `2026-07-${suffix}T12:00:00.000Z`,
  updatedAt: `2026-07-${suffix}T12:00:00.000Z`,
  importMeta: { provider: 'readwise' },
  ...overrides
});

const linkedArticle = article('21');
const reviewArticle = article('22');
const unconnectedArticle = article('23', {
  updatedAt: '2099-01-01T00:00:00.000Z'
});
const suppressedArticle = article('24', { debugOnly: true });
const foreignArticle = article('25', { userId: OTHER_USER_ID });
const hiddenArticle = article('26', { hiddenFromHome: true });
const sourceRefId = '64f100000000000000000031';
const concept = {
  _id: '64f100000000000000000041',
  userId: USER_ID,
  name: 'Durable concept',
  pinnedArticleIds: [linkedArticle._id]
};
const page = {
  _id: '64f100000000000000000051',
  userId: USER_ID,
  title: 'Accepted knowledge',
  sourceRefs: [{
    _id: sourceRefId,
    type: 'article',
    objectId: linkedArticle._id
  }],
  claims: [{
    claimId: 'durable-claim',
    text: 'The linked source supports this claim.',
    sourceRefIds: [sourceRefId]
  }]
};
const foreignConcept = {
  _id: '64f100000000000000000061',
  userId: OTHER_USER_ID,
  name: 'Foreign concept',
  pinnedArticleIds: [unconnectedArticle._id]
};

const modelsFor = queries => ({
  Article: modelFor(
    'Article',
    [linkedArticle, reviewArticle, unconnectedArticle, suppressedArticle, foreignArticle, hiddenArticle],
    queries
  ),
  TagMeta: modelFor('TagMeta', [concept, foreignConcept], queries),
  WikiPage: modelFor('WikiPage', [page], queries),
  Connection: modelFor('Connection', [], queries),
  ReferenceEdge: modelFor('ReferenceEdge', [], queries)
});

const movementBuilder = async () => [{
  id: 'movement-review',
  kind: 'contradiction',
  occurredAt: '2026-07-27T15:00:00.000Z',
  title: 'New evidence challenges a claim',
  reviewState: 'candidate',
  subject: {
    type: 'wiki_claim',
    id: 'review-claim',
    parentId: page._id,
    title: 'Review claim',
    href: `/wiki/workspace?page=${page._id}&claimId=review-claim`
  },
  evidence: [{
    type: 'article',
    id: reviewArticle._id,
    title: reviewArticle.title,
    href: `/library?articleId=${reviewArticle._id}`
  }],
  unresolved: [{ type: 'question', id: 'question-1' }]
}];

const run = async () => {
  const queries = [];
  const recent = await buildLibraryRelevance({
    userId: USER_ID,
    models: modelsFor(queries),
    view: 'recent',
    limit: 10,
    movementBuilder
  });
  assert.deepStrictEqual(
    recent.map(row => row.source.id),
    [unconnectedArticle._id, reviewArticle._id, linkedArticle._id]
  );
  assert.ok(queries.every(row => String(row.query.userId) === USER_ID));
  assert.ok(recent.every(row => row.source.href === `/library?articleId=${row.source.id}`));
  assert.strictEqual(recent[0].provenance.provider, 'readwise');
  assert.strictEqual(recent.some(row => row.source.id === foreignArticle._id), false);
  assert.strictEqual(recent.some(row => row.source.id === suppressedArticle._id), false);
  assert.strictEqual(recent.some(row => row.source.id === hiddenArticle._id), false);

  const active = await buildLibraryRelevance({
    userId: USER_ID,
    models: modelsFor([]),
    view: 'active',
    movementBuilder
  });
  assert.deepStrictEqual(
    active.map(row => row.source.id).sort(),
    [linkedArticle._id, reviewArticle._id].sort()
  );
  const linked = active.find(row => row.source.id === linkedArticle._id);
  assert.ok(linked.relevance.connected.some(ref => ref.type === 'concept' && ref.id === concept._id));
  assert.ok(linked.relevance.connected.some(ref => ref.type === 'wiki_page' && ref.id === page._id));
  assert.ok(linked.relevance.connected.some(ref => (
    ref.type === 'wiki_claim'
    && ref.id === 'durable-claim'
    && ref.parentId === page._id
  )));

  const needsReview = await buildLibraryRelevance({
    userId: USER_ID,
    models: modelsFor([]),
    view: 'needs_review',
    movementBuilder
  });
  assert.deepStrictEqual(needsReview.map(row => row.source.id), [reviewArticle._id]);
  assert.strictEqual(needsReview[0].relevance.movements[0].requiresReview, true);

  const unconnected = await buildLibraryRelevance({
    userId: USER_ID,
    models: modelsFor([]),
    view: 'unconnected',
    movementBuilder
  });
  assert.deepStrictEqual(unconnected.map(row => row.source.id), [unconnectedArticle._id]);

  const replay = await buildLibraryRelevance({
    userId: USER_ID,
    models: modelsFor([]),
    view: 'active',
    movementBuilder
  });
  assert.deepStrictEqual(replay, active);

  const detail = await buildLibrarySourceDetail({
    userId: USER_ID,
    articleId: unconnectedArticle._id,
    models: modelsFor([]),
    movementBuilder
  });
  assert.strictEqual(detail.source.id, unconnectedArticle._id);
  assert.strictEqual(detail.provenance.sourceType, null);
  assert.strictEqual(detail.provenance.sourceLabel, null);
  assert.strictEqual(detail.provenance.importedAt, null);

  const pageResult = await buildLibraryRelevancePage({
    userId: USER_ID,
    models: {
      ...modelsFor([]),
      Article: {
        ...modelsFor([]).Article,
        countDocuments: async () => 3
      }
    },
    view: 'recent',
    limit: 2,
    movementBuilder
  });
  assert.strictEqual(pageResult.sources.length, 2);
  assert.deepStrictEqual(pageResult.counts.recent, { value: 3, exact: true });
  assert.deepStrictEqual(pageResult.coverage, {
    status: 'complete',
    sourceTypes: ['article'],
    scanned: { articles: 3 },
    eligible: { articles: 3 },
    limitations: []
  });

  assert.strictEqual(safeSourceUrl('javascript:alert(1)'), undefined);
  assert.strictEqual(safeSourceUrl('https://example.com/a'), 'https://example.com/a');

  console.log('libraryRelevanceService tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
