const assert = require('assert');
const {
  buildHighlightAggregationPipeline,
  buildMixedLibraryRelevancePage,
  decodeCursor,
  highlightDisplayTitle,
  MIXED_SOURCE_RECENT_SCAN_LIMIT,
  movementScanLimitFor
} = require('./libraryMixedSourceService');

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

const modelFor = rows => ({
  find: () => new Query(rows),
  countDocuments: async () => rows.filter(row => (
    row.userId === USER_ID
    && row.hiddenFromHome !== true
    && row.debugOnly !== true
    && row.archived !== true
  )).length
});

const recordingModelFor = (rows, label, limits) => {
  const model = modelFor(rows);
  return {
    ...model,
    find: () => {
      const query = new Query(rows);
      query.limit = value => {
        limits.push([label, value]);
        return query;
      };
      return query;
    }
  };
};

const articleOne = {
  _id: '64f100000000000000000011',
  userId: USER_ID,
  title: 'Systems source',
  url: 'https://example.com/systems',
  author: 'Ada',
  siteName: 'Example',
  importMeta: { provider: 'readwise', importedAt: '2026-07-27T12:00:00.000Z' },
  createdAt: '2026-07-27T12:00:00.000Z',
  highlights: [{
    _id: '64f100000000000000000021',
    text: 'A highlighted claim with durable identity.',
    createdAt: '2026-07-29T12:00:00.000Z',
    importMeta: { provider: 'readwise' }
  }]
};
const articleTwo = {
  _id: '64f100000000000000000012',
  userId: USER_ID,
  title: 'Unconnected source',
  url: 'https://example.com/unconnected',
  createdAt: '2026-07-25T12:00:00.000Z',
  highlights: []
};
const suppressedArticle = {
  _id: '64f100000000000000000013',
  userId: USER_ID,
  title: 'Suppressed',
  url: 'https://example.com/suppressed',
  hiddenFromHome: true,
  createdAt: '2026-07-30T12:00:00.000Z',
  highlights: []
};
const foreignArticle = {
  _id: '64f100000000000000000014',
  userId: OTHER_USER_ID,
  title: 'Foreign',
  url: 'https://example.com/foreign',
  createdAt: '2026-07-30T12:00:00.000Z',
  highlights: []
};
const noteOne = {
  _id: '64f100000000000000000031',
  userId: USER_ID,
  title: 'Notebook synthesis',
  content: 'A user-authored synthesis.',
  type: 'note',
  importMeta: { provider: 'notion', importedAt: '2026-07-28T12:00:00.000Z' },
  createdAt: '2026-07-28T12:00:00.000Z',
  updatedAt: '2099-01-01T00:00:00.000Z'
};
const concept = {
  _id: '64f100000000000000000041',
  userId: USER_ID,
  name: 'Durable systems',
  pinnedArticleIds: [articleOne._id],
  pinnedHighlightIds: [articleOne.highlights[0]._id],
  pinnedNoteIds: []
};
const sourceRefId = '64f100000000000000000061';
const page = {
  _id: '64f100000000000000000051',
  userId: USER_ID,
  title: 'Accepted systems knowledge',
  sourceRefs: [{
    _id: sourceRefId,
    type: 'highlight',
    objectId: articleOne.highlights[0]._id
  }],
  claims: [{
    claimId: 'systems-claim',
    text: 'The highlighted source supports this accepted claim.',
    sourceRefIds: [sourceRefId]
  }]
};
const archivedPage = {
  _id: '64f100000000000000000052',
  userId: USER_ID,
  title: 'Archived systems knowledge',
  status: 'archived',
  sourceRefs: [{
    _id: '64f100000000000000000062',
    type: 'article',
    objectId: articleTwo._id
  }],
  claims: []
};
const notebookEdge = {
  _id: '64f100000000000000000071',
  userId: USER_ID,
  sourceType: 'notebook',
  sourceId: noteOne._id,
  targetType: 'article',
  targetId: articleOne._id
};

const models = {
  Article: modelFor([articleOne, articleTwo, suppressedArticle, foreignArticle]),
  NotebookEntry: modelFor([noteOne]),
  TagMeta: modelFor([concept]),
  WikiPage: modelFor([page, archivedPage]),
  Connection: modelFor([]),
  ReferenceEdge: modelFor([notebookEdge])
};

const movementRequests = [];
const movementBuilder = async options => {
  movementRequests.push(options);
  return [{
  id: 'movement-highlight-review',
  kind: 'contradiction',
  occurredAt: '2026-07-30T12:00:00.000Z',
  title: 'New evidence challenges the systems claim',
  reviewState: 'candidate',
  subject: {
    type: 'wiki_claim',
    id: 'systems-claim',
    parentId: page._id,
    title: 'Systems claim',
    href: `/wiki/workspace?page=${page._id}&claimId=systems-claim`
  },
  evidence: [{
    type: 'highlight',
    id: articleOne.highlights[0]._id,
    parentId: articleOne._id,
    title: articleOne.highlights[0].text,
    href: `/library?articleId=${articleOne._id}&highlightId=${articleOne.highlights[0]._id}`
  }],
  unresolved: [{ type: 'wiki_claim', id: 'systems-claim' }]
  }];
};

const run = async () => {
  [
    'work',
    'write code. He was a bodyguard.',
    'inception remain the same. What has changed is the world around us.'
  ].forEach(text => {
    assert.strictEqual(
      highlightDisplayTitle({ title: 'Systems source' }, { text }),
      'Highlight from Systems source'
    );
  });
  assert.strictEqual(
    highlightDisplayTitle(articleOne, articleOne.highlights[0]),
    articleOne.highlights[0].text
  );
  assert.strictEqual(MIXED_SOURCE_RECENT_SCAN_LIMIT, 80);
  assert.strictEqual(movementScanLimitFor(3), 12);
  assert.strictEqual(movementScanLimitFor(20), 50);
  assert.strictEqual(movementScanLimitFor(100), 50);
  const completeHighlightPipeline = buildHighlightAggregationPipeline({
    match: { userId: USER_ID }
  });
  assert.strictEqual(completeHighlightPipeline.some(stage => stage.$sort), false);
  assert.strictEqual(completeHighlightPipeline.some(stage => stage.$addFields), false);
  assert.strictEqual(completeHighlightPipeline.some(stage => stage.$limit), false);
  assert.strictEqual(completeHighlightPipeline[1].$project.highlights, 1);
  assert.strictEqual(completeHighlightPipeline.at(-1).$project.highlight, '$highlights');

  const recentHighlightPipeline = buildHighlightAggregationPipeline({
    match: { userId: USER_ID },
    limit: MIXED_SOURCE_RECENT_SCAN_LIMIT
  });
  assert.deepStrictEqual(
    recentHighlightPipeline.find(stage => stage.$sort)?.$sort,
    { recentHighlightAt: -1, 'highlights._id': -1 }
  );
  assert.strictEqual(
    recentHighlightPipeline.find(stage => stage.$limit)?.$limit,
    MIXED_SOURCE_RECENT_SCAN_LIMIT
  );
  const firstPage = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'recent',
    limit: 2,
    movementBuilder
  });
  assert.deepStrictEqual(
    firstPage.sources.map(row => `${row.source.type}:${row.source.id}`),
    [
      `highlight:${articleOne.highlights[0]._id}`,
      `note:${noteOne._id}`
    ]
  );
  assert.ok(firstPage.nextCursor);
  assert.strictEqual(firstPage.hasMore, true);
  assert.strictEqual(firstPage.sources[0].source.parentId, articleOne._id);
  assert.match(firstPage.sources[0].source.href, new RegExp(`articleId=${articleOne._id}.*highlightId=${articleOne.highlights[0]._id}`));
  assert.strictEqual(firstPage.sources[1].source.href, `/think?tab=notebook&entryId=${noteOne._id}`);
  assert.strictEqual(firstPage.sources[1].provenance.provider, 'notion');
  assert.strictEqual(firstPage.sources.some(row => row.source.id === suppressedArticle._id), false);
  assert.strictEqual(firstPage.sources.some(row => row.source.id === foreignArticle._id), false);
  assert.ok(firstPage.coverage.limitations.includes('connection_context_deferred_for_recent_view'));
  assert.deepStrictEqual(firstPage.counts.active, { value: null, exact: false });

  const secondPage = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'recent',
    limit: 2,
    cursor: firstPage.nextCursor,
    movementBuilder
  });
  assert.deepStrictEqual(
    secondPage.sources.map(row => `${row.source.type}:${row.source.id}`),
    [
      `article:${articleOne._id}`,
      `article:${articleTwo._id}`
    ]
  );
  assert.strictEqual(secondPage.nextCursor, null);
  assert.strictEqual(secondPage.hasMore, false);
  assert.strictEqual(
    new Set([...firstPage.sources, ...secondPage.sources].map(row => `${row.source.type}:${row.source.id}:${row.source.parentId || ''}`)).size,
    4
  );

  const replay = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'recent',
    limit: 2,
    movementBuilder
  });
  assert.deepStrictEqual(replay.sources, firstPage.sources);
  assert.strictEqual(replay.nextCursor, firstPage.nextCursor);

  const active = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'active',
    limit: 20,
    movementBuilder
  });
  assert.deepStrictEqual(
    new Set(active.sources.map(row => row.source.type)),
    new Set(['article', 'highlight'])
  );
  const highlight = active.sources.find(row => row.source.type === 'highlight');
  assert.ok(highlight.relevance.connected.some(ref => ref.type === 'concept' && ref.id === concept._id));
  assert.ok(highlight.relevance.connected.some(ref => ref.type === 'wiki_page' && ref.id === page._id));
  assert.ok(highlight.relevance.connected.some(ref => ref.type === 'wiki_claim' && ref.id === 'systems-claim'));
  assert.strictEqual(active.sources.some(row => row.source.type === 'note'), false);

  const needsReview = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'needs_review',
    limit: 20,
    movementBuilder
  });
  assert.deepStrictEqual(
    needsReview.sources.map(row => `${row.source.type}:${row.source.id}`),
    [`highlight:${articleOne.highlights[0]._id}`]
  );
  assert.strictEqual(needsReview.sources[0].relevance.movements[0].requiresReview, true);
  assert.strictEqual(needsReview.sources[0].relevance.reviewReason, 'Supports a claim under review');
  assert.strictEqual(movementRequests.at(-1).includeRoutineMovements, false);
  assert.strictEqual(movementRequests.at(-1).reviewRequiredOnly, true);

  const rankedReview = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'needs_review',
    limit: 20,
    movementBuilder: async () => [
      {
        id: 'minor-note',
        kind: 'contradiction',
        title: 'A stray notebook contradiction',
        reviewState: 'candidate',
        evidence: [{ type: 'note', id: noteOne._id }],
        unresolved: [{ type: 'note', id: noteOne._id }]
      },
      {
        id: 'minor-article',
        kind: 'contradiction',
        title: 'Unconnected article drifted twice',
        reviewState: 'candidate',
        evidence: [
          { type: 'article', id: articleTwo._id },
          { type: 'article', id: articleTwo._id }
        ],
        unresolved: [{ type: 'article', id: articleTwo._id }]
      },
      {
        id: 'minor-parent-article',
        kind: 'contradiction',
        title: 'Parent article also drifted',
        reviewState: 'candidate',
        evidence: [{ type: 'article', id: articleOne._id }],
        unresolved: [{ type: 'article', id: articleOne._id }]
      },
      {
        id: 'movement-highlight-review',
        kind: 'contradiction',
        title: 'New evidence challenges the systems claim',
        reviewState: 'candidate',
        evidence: [{
          type: 'highlight',
          id: articleOne.highlights[0]._id,
          parentId: articleOne._id
        }],
        unresolved: [{ type: 'wiki_claim', id: 'systems-claim' }]
      }
    ]
  });
  assert.deepStrictEqual(
    rankedReview.sources.map(row => `${row.source.type}:${row.source.id}`),
    [
      `highlight:${articleOne.highlights[0]._id}`,
      `article:${articleTwo._id}`,
      `note:${noteOne._id}`
    ]
  );
  assert.strictEqual(rankedReview.sources.length, 3);
  assert.strictEqual(rankedReview.counts.needs_review.value, 4);
  assert.strictEqual(rankedReview.hasMore, false);
  assert.strictEqual(rankedReview.nextCursor, null);
  assert.strictEqual(rankedReview.sources[0].relevance.reviewReason, 'Supports a claim under review');

  const visitedReviewPage = {
    _id: '64f100000000000000000053',
    userId: USER_ID,
    title: 'Frequently used review page',
    status: 'published',
    plainText: 'This maintained page has enough editorial context to remain visible while a fresh source signal waits for review by the owner.',
    freshness: { status: 'needs_review', pendingSourceEventIds: [] },
    sourceRefs: [{
      _id: '64f100000000000000000063',
      type: 'article',
      objectId: articleTwo._id
    }],
    claims: []
  };
  const judgmentReviewPage = {
    _id: '64f100000000000000000054',
    userId: USER_ID,
    title: 'Judgment review page',
    status: 'published',
    plainText: 'This maintained judgment page has enough editorial context to remain visible while its owner considers a material source change.',
    freshness: { status: 'needs_review', pendingSourceEventIds: ['signal-1'] },
    judgment: { kind: 'investment' },
    sourceRefs: [{
      _id: '64f100000000000000000064',
      type: 'article',
      objectId: articleOne._id
    }],
    claims: []
  };
  const visitFindQueries = [];
  const reviewQueryLimits = [];
  const pageSignalReview = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models: {
      ...models,
      Article: recordingModelFor(
        [articleOne, articleTwo, suppressedArticle, foreignArticle],
        'articles',
        reviewQueryLimits
      ),
      NotebookEntry: recordingModelFor([noteOne], 'notes', reviewQueryLimits),
      WikiPage: recordingModelFor(
        [visitedReviewPage, judgmentReviewPage],
        'wiki-pages',
        reviewQueryLimits
      ),
      WikiPageVisit: {
        find: query => {
          visitFindQueries.push(query);
          return new Query([{
            userId: USER_ID,
            pageId: visitedReviewPage._id,
            lastVisitedAt: '2026-08-29T12:00:00.000Z'
          }].filter(visit => query.pageId.$in.includes(visit.pageId)));
        }
      }
    },
    view: 'needs_review',
    limit: 3,
    movementBuilder: async () => []
  });
  assert.deepStrictEqual(
    pageSignalReview.sources.map(row => row.source.id),
    [articleOne._id, articleTwo._id]
  );
  assert.strictEqual(
    pageSignalReview.sources[0].relevance.reviewReason,
    'Attached to a judgment page'
  );
  assert.deepStrictEqual(
    visitFindQueries[0].pageId.$in.sort(),
    [visitedReviewPage._id, judgmentReviewPage._id].sort()
  );
  assert.deepStrictEqual(reviewQueryLimits, []);
  assert.deepStrictEqual(
    pageSignalReview.sources[1].relevance.connected.map(ref => ({
      id: ref.id,
      lastVisitedAt: ref.lastVisitedAt
    })),
    [{
      id: visitedReviewPage._id,
      lastVisitedAt: '2026-08-29T12:00:00.000Z'
    }]
  );
  assert.strictEqual(
    pageSignalReview.sources[1].relevance.reviewReason,
    'Frequently used page · review affects active work'
  );

  const quietReview = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'needs_review',
    limit: 3,
    movementBuilder: async () => []
  });
  assert.deepStrictEqual(quietReview.sources, []);
  assert.deepStrictEqual(quietReview.counts.needs_review, { value: 0, exact: false });
  assert.strictEqual(quietReview.nextCursor, null);
  assert.strictEqual(quietReview.hasMore, false);

  const unconnected = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'unconnected',
    limit: 20,
    movementBuilder
  });
  assert.deepStrictEqual(
    unconnected.sources.map(row => `${row.source.type}:${row.source.id}`),
    [`note:${noteOne._id}`, `article:${articleTwo._id}`]
  );
  assert.strictEqual(
    unconnected.sources[0].relevance.connected.some(ref => ref.id === archivedPage._id),
    false
  );

  assert.deepStrictEqual(Object.keys(firstPage.counts), [
    'recent',
    'active',
    'needs_review',
    'unconnected'
  ]);
  assert.deepStrictEqual(firstPage.counts.recent, { value: 4, exact: true });
  assert.strictEqual(firstPage.counts.active.exact, false);
  assert.deepStrictEqual(firstPage.coverage.sourceTypes, ['article', 'highlight', 'note']);
  assert.deepStrictEqual(firstPage.coverage.scanned, { articles: 2, highlights: 1, notes: 1 });
  assert.ok(firstPage.coverage.limitations.includes('material_movements_deferred_for_recent_view'));

  assert.throws(() => decodeCursor('not-a-cursor', 'recent'), /cursor is invalid/i);
  assert.throws(() => decodeCursor(firstPage.nextCursor, 'active'), /cursor is invalid/i);
  const malformedCursor = Buffer.from(JSON.stringify({
    version: 2,
    view: 'recent',
    tuple: [0, 'not-a-rank']
  })).toString('base64url');
  assert.throws(() => decodeCursor(malformedCursor, 'recent'), /cursor is invalid/i);

  const mutableMovementPage = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'active',
    limit: 1,
    movementBuilder
  });
  const firstIdentity = `${mutableMovementPage.sources[0].source.type}:${mutableMovementPage.sources[0].source.id}:${mutableMovementPage.sources[0].source.parentId || ''}`;
  const movementBuilderWithReorderedRelevance = async () => ([
    ...(await movementBuilder()),
    {
      id: 'movement-article-review',
      kind: 'contradiction',
      occurredAt: '2099-01-01T00:00:00.000Z',
      title: 'Later relevance must not invalidate the cursor order',
      reviewState: 'candidate',
      evidence: [{ type: 'article', id: articleOne._id }],
      unresolved: [{ type: 'wiki_claim', id: 'later-claim' }]
    }
  ]);
  const mutableMovementNext = await buildMixedLibraryRelevancePage({
    userId: USER_ID,
    models,
    view: 'active',
    limit: 20,
    cursor: mutableMovementPage.nextCursor,
    movementBuilder: movementBuilderWithReorderedRelevance
  });
  assert.strictEqual(
    mutableMovementNext.sources.some(row => (
      `${row.source.type}:${row.source.id}:${row.source.parentId || ''}` === firstIdentity
    )),
    false
  );

  console.log('libraryMixedSourceService tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
