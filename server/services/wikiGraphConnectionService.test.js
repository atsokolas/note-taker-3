const assert = require('assert');

const {
  WIKI_PAGE_ITEM_TYPE,
  WIKI_CLAIM_ITEM_TYPE,
  buildWikiPageConnectionQuery,
  buildWikiPageGraphRows,
  buildSharedSourceWikiPageRows,
  collectWikiLinkPageIds,
  persistWikiPageConnection,
  syncWikiPageGraphConnections
} = require('./wikiGraphConnectionService');

const createConnectionStore = () => {
  const records = [];
  const matchesValue = (actual, expected) => {
    if (expected?.$in) return expected.$in.includes(actual);
    if (expected?.$regex) return new RegExp(expected.$regex).test(String(actual || ''));
    return String(actual || '') === String(expected);
  };
  return {
    records,
    deleteMany: async (query = {}) => {
      const before = records.length;
      const matches = (record) => {
        if (String(record.userId || '') !== String(query.userId || '')) return false;
        return (query.$or || []).some((condition) => {
          if (condition.fromType && !matchesValue(record.fromType, condition.fromType)) return false;
          if (condition.fromId && !matchesValue(record.fromId, condition.fromId)) return false;
          if (condition.toType && !matchesValue(record.toType, condition.toType)) return false;
          if (condition.toId && !matchesValue(record.toId, condition.toId)) return false;
          if (condition.relationType && !matchesValue(record.relationType, condition.relationType)) return false;
          return true;
        });
      };
      for (let index = records.length - 1; index >= 0; index -= 1) {
        if (matches(records[index])) records.splice(index, 1);
      }
      return { deletedCount: before - records.length };
    },
    findOneAndUpdate: async (query, updates = {}, options = {}) => {
      let existing = records.find(record => Object.entries(query).every(([key, value]) => String(record[key] || '') === String(value || '')));
      if (!existing && options.upsert) {
        existing = {
          _id: `connection-${records.length + 1}`,
          ...(updates.$setOnInsert || query),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        records.push(existing);
      }
      return existing || null;
    }
  };
};

const run = async () => {
  const query = buildWikiPageConnectionQuery({
    userId: 'user-1',
    fromPageId: 'page-a',
    toPageId: 'page-b'
  });
  assert.strictEqual(query.fromType, WIKI_PAGE_ITEM_TYPE);
  assert.strictEqual(query.toType, WIKI_PAGE_ITEM_TYPE);
  assert.strictEqual(query.relationType, 'related');
  assert.strictEqual(query.scopeType, '');
  assert.strictEqual(query.scopeId, '');

  const Connection = createConnectionStore();
  await persistWikiPageConnection({
    Connection,
    userId: 'user-1',
    fromPageId: 'page-a',
    toPageId: 'page-b'
  });
  await persistWikiPageConnection({
    Connection,
    userId: 'user-1',
    fromPageId: 'page-a',
    toPageId: 'page-b'
  });
  assert.strictEqual(Connection.records.length, 1);
  assert.strictEqual(Connection.records[0].fromType, WIKI_PAGE_ITEM_TYPE);
  assert.strictEqual(Connection.records[0].toId, 'page-b');

  const skipped = await persistWikiPageConnection({
    Connection,
    userId: 'user-1',
    fromPageId: 'page-a',
    toPageId: 'page-a'
  });
  assert.strictEqual(skipped, null);
  assert.strictEqual(Connection.records.length, 1);

  const doc = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'See Portfolio Theory',
        marks: [{ type: 'wikiLink', attrs: { pageId: 'page-c', title: 'Portfolio Theory' } }]
      }]
    }]
  };
  assert.deepStrictEqual(Array.from(collectWikiLinkPageIds(doc)), ['page-c']);

  const rows = buildWikiPageGraphRows({
    userId: 'user-1',
    page: {
      _id: 'page-a',
      body: doc,
      sourceRefs: [
        { type: 'article', objectId: 'article-1' },
        { type: 'external', objectId: 'external-1' },
        { type: 'External', url: 'https://example.com/source' },
        { type: 'notebook', objectId: 'note-1' }
      ]
    }
  });
  assert.deepStrictEqual(
    rows.map(row => `${row.fromType}:${row.fromId}->${row.toType}:${row.toId}:${row.relationType}`),
    [
      'wiki_page:page-a->wiki_page:page-c:related',
      'wiki_page:page-c->wiki_page:page-a:referenced_by',
      'article:article-1->wiki_page:page-a:supports',
      'wiki_page:page-a->article:article-1:supported_by',
      'external:external-1->wiki_page:page-a:supports',
      'wiki_page:page-a->external:external-1:supported_by',
      'external:https://example.com/source->wiki_page:page-a:supports',
      'wiki_page:page-a->external:https://example.com/source:supported_by',
      'notebook:note-1->wiki_page:page-a:supports',
      'wiki_page:page-a->notebook:note-1:supported_by'
    ]
  );

  const claimRows = buildWikiPageGraphRows({
    userId: 'user-1',
    page: {
      _id: 'page-a',
      body: doc,
      sourceRefs: [{ _id: 'source-ref-1', type: 'article', objectId: 'article-1' }],
      citations: [
        { _id: 'citation-1', sourceRefId: 'source-ref-1', sourceType: 'article', sourceObjectId: 'article-1' },
        { _id: 'citation-support', sourceRefId: 'source-ref-support', sourceType: 'notebook', sourceObjectId: 'note-support' },
        { _id: 'citation-conflict', sourceRefId: 'source-ref-conflict', sourceType: 'highlight', sourceObjectId: 'highlight-conflict' }
      ],
      claims: [
        {
          claimId: 'claim-1',
          text: 'Durable portfolios need rebalancing.',
          support: 'supported',
          citationIds: ['citation-1']
        },
        {
          claimId: 'claim-2',
          text: 'Every drawdown is predictable.',
          support: 'conflicted',
          citationIds: ['source-ref-1']
        },
        {
          claimId: 'claim-3',
          text: 'A claim needs review.',
          support: 'unsupported',
          citationIds: []
        },
        {
          claimId: 'claim-4',
          text: 'Source refs can support claims without citation rows.',
          support: 'supported',
          sourceRefIds: ['source-ref-1']
        },
        {
          claimId: 'claim-5',
          text: 'A claim can have support and contradiction evidence.',
          support: 'conflicted',
          citationIds: ['citation-support', 'citation-conflict'],
          sourceRefIds: ['source-ref-support', 'source-ref-conflict'],
          contradictedByCitationIds: ['citation-conflict']
        }
      ]
    }
  });
  assert.ok(claimRows.some(row => (
    row.fromType === WIKI_PAGE_ITEM_TYPE
    && row.toType === WIKI_CLAIM_ITEM_TYPE
    && row.toId === 'page-a:claim-1'
    && row.relationType === 'contains'
  )));
  assert.ok(claimRows.some(row => (
    row.fromType === WIKI_CLAIM_ITEM_TYPE
    && row.fromId === 'page-a:claim-1'
    && row.toType === WIKI_PAGE_ITEM_TYPE
    && row.toId === 'page-a'
    && row.relationType === 'contained_by'
  )));
  assert.ok(claimRows.some(row => (
    row.fromType === 'article'
    && row.fromId === 'article-1'
    && row.toType === WIKI_CLAIM_ITEM_TYPE
    && row.toId === 'page-a:claim-1'
    && row.relationType === 'supports'
  )));
  assert.ok(claimRows.some(row => row.fromType === WIKI_CLAIM_ITEM_TYPE && row.fromId === 'page-a:claim-1' && row.toType === 'article' && row.toId === 'article-1' && row.relationType === 'supported_by'));
  assert.ok(claimRows.some(row => row.fromType === 'article' && row.toId === 'page-a:claim-2' && row.relationType === 'contradicts'));
  assert.ok(claimRows.some(row => row.fromType === WIKI_CLAIM_ITEM_TYPE && row.fromId === 'page-a:claim-2' && row.toType === 'article' && row.relationType === 'contradicted_by'));
  assert.ok(claimRows.some(row => row.fromType === WIKI_CLAIM_ITEM_TYPE && row.fromId === 'page-a:claim-3' && row.relationType === 'needs_review'));
  assert.ok(claimRows.some(row => row.fromType === WIKI_PAGE_ITEM_TYPE && row.fromId === 'page-a' && row.toType === WIKI_CLAIM_ITEM_TYPE && row.toId === 'page-a:claim-3' && row.relationType === 'review_needed_by'));
  assert.ok(claimRows.some(row => row.fromType === 'article' && row.fromId === 'article-1' && row.toId === 'page-a:claim-4' && row.relationType === 'supports'));
  assert.ok(claimRows.some(row => row.fromType === 'notebook' && row.fromId === 'note-support' && row.toId === 'page-a:claim-5' && row.relationType === 'supports'));
  assert.ok(claimRows.some(row => row.fromType === 'highlight' && row.fromId === 'highlight-conflict' && row.toId === 'page-a:claim-5' && row.relationType === 'contradicts'));
  assert.ok(!claimRows.some(row => row.fromType === 'highlight' && row.fromId === 'highlight-conflict' && row.toId === 'page-a:claim-5' && row.relationType === 'supports'));

  const sharedRows = buildSharedSourceWikiPageRows({
    userId: 'user-1',
    pages: [
      { _id: 'page-a', sourceRefs: [{ type: 'article', objectId: 'article-1', title: 'Shared memo' }] },
      { _id: 'page-b', sourceRefs: [{ type: 'article', objectId: 'article-1', title: 'Shared memo' }] },
      { _id: 'page-c', sourceRefs: [{ type: 'article', objectId: 'article-2', title: 'Other memo' }] }
    ]
  });
  assert.deepStrictEqual(
    sharedRows.map(row => `${row.fromType}:${row.fromId}->${row.toType}:${row.toId}:${row.relationType}`),
    [
      'wiki_page:page-a->wiki_page:page-b:shared_source',
      'wiki_page:page-b->wiki_page:page-a:shared_source'
    ]
  );
  const partialSharedRows = buildSharedSourceWikiPageRows({
    userId: 'user-1',
    pages: [
      { _id: 'page-a', sourceRefs: [{ type: 'article' }] },
      { _id: 'page-b', sourceRefs: [{ type: 'article' }] },
      { _id: 'page-c', sourceRefs: [{ url: 'https://example.com/shared' }] },
      { _id: 'page-d', sourceRefs: [{ url: 'https://example.com/shared' }] }
    ]
  });
  assert.deepStrictEqual(
    partialSharedRows.map(row => `${row.fromId}->${row.toId}:${row.relationType}`),
    [
      'page-c->page-d:shared_source',
      'page-d->page-c:shared_source'
    ]
  );

  const syncStore = createConnectionStore();
  syncStore.records.push({
    _id: 'stale',
    userId: 'user-1',
    scopeType: '',
    scopeId: '',
    fromType: 'wiki_page',
    fromId: 'page-a',
    toType: 'wiki_page',
    toId: 'old-page',
    relationType: 'related'
  });
  syncStore.records.push({
    _id: 'stale-claim',
    userId: 'user-1',
    scopeType: '',
    scopeId: '',
    fromType: 'wiki_page',
    fromId: 'page-a',
    toType: 'wiki_claim',
    toId: 'page-a:old-claim',
    relationType: 'contains'
  });
  syncStore.records.push({
    _id: 'stale-inverse',
    userId: 'user-1',
    scopeType: '',
    scopeId: '',
    fromType: 'wiki_page',
    fromId: 'old-page',
    toType: 'wiki_page',
    toId: 'page-a',
    relationType: 'referenced_by'
  });
  syncStore.records.push({
    _id: 'stale-claim-inverse',
    userId: 'user-1',
    scopeType: '',
    scopeId: '',
    fromType: 'wiki_claim',
    fromId: 'page-a:old-claim',
    toType: 'wiki_page',
    toId: 'page-a',
    relationType: 'contained_by'
  });
  const syncResult = await syncWikiPageGraphConnections({
    Connection: syncStore,
    userId: 'user-1',
    page: {
      _id: 'page-a',
      body: doc,
      sourceRefs: [{ type: 'article', objectId: 'article-1' }]
    }
  });
  assert.strictEqual(syncResult.deletedCount, 4);
  assert.strictEqual(syncResult.createdCount, 4);
  assert.ok(syncStore.records.some(record => record.toId === 'page-c'));
  assert.ok(syncStore.records.some(record => record.fromId === 'page-c' && record.toId === 'page-a' && record.relationType === 'referenced_by'));
  assert.ok(!syncStore.records.some(record => record.toId === 'old-page'));
  assert.ok(!syncStore.records.some(record => record.toId === 'page-a:old-claim'));
  assert.ok(!syncStore.records.some(record => record._id === 'stale-inverse'));
  assert.ok(!syncStore.records.some(record => record._id === 'stale-claim-inverse'));
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('wikiGraphConnectionService tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
