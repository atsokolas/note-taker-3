const assert = require('assert');

const {
  WIKI_PAGE_ITEM_TYPE,
  WIKI_CLAIM_ITEM_TYPE,
  buildWikiPageConnectionQuery,
  buildWikiPageGraphRows,
  collectWikiLinkPageIds,
  persistWikiPageConnection,
  syncWikiPageGraphConnections
} = require('./wikiGraphConnectionService');

const createConnectionStore = () => {
  const records = [];
  return {
    records,
    deleteMany: async (query = {}) => {
      const before = records.length;
      const matches = (record) => {
        if (String(record.userId || '') !== String(query.userId || '')) return false;
        return (query.$or || []).some((condition) => {
          if (condition.fromType?.$in && !condition.fromType.$in.includes(record.fromType)) return false;
          else if (condition.fromType && String(record.fromType || '') !== String(condition.fromType)) return false;
          if (condition.fromId?.$regex && !(new RegExp(condition.fromId.$regex).test(String(record.fromId || '')))) return false;
          else if (condition.fromId && String(record.fromId || '') !== String(condition.fromId)) return false;
          if (condition.toType && String(record.toType || '') !== String(condition.toType)) return false;
          if (condition.toId?.$regex && !(new RegExp(condition.toId.$regex).test(String(record.toId || '')))) return false;
          else if (condition.toId && String(record.toId || '') !== String(condition.toId)) return false;
          if (condition.relationType?.$in && !condition.relationType.$in.includes(record.relationType)) return false;
          else if (condition.relationType && String(record.relationType || '') !== String(condition.relationType)) return false;
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
        { type: 'notebook', objectId: 'note-1' }
      ]
    }
  });
  assert.deepStrictEqual(
    rows.map(row => `${row.fromType}:${row.fromId}->${row.toType}:${row.toId}:${row.relationType}`),
    [
      'wiki_page:page-a->wiki_page:page-c:related',
      'article:article-1->wiki_page:page-a:supports',
      'notebook:note-1->wiki_page:page-a:supports'
    ]
  );

  const claimRows = buildWikiPageGraphRows({
    userId: 'user-1',
    page: {
      _id: 'page-a',
      body: doc,
      sourceRefs: [{ _id: 'source-ref-1', type: 'article', objectId: 'article-1' }],
      citations: [{ _id: 'citation-1', sourceRefId: 'source-ref-1', sourceType: 'article', sourceObjectId: 'article-1' }],
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
    row.fromType === 'article'
    && row.fromId === 'article-1'
    && row.toType === WIKI_CLAIM_ITEM_TYPE
    && row.toId === 'page-a:claim-1'
    && row.relationType === 'supports'
  )));
  assert.ok(claimRows.some(row => row.fromType === 'article' && row.toId === 'page-a:claim-2' && row.relationType === 'contradicts'));
  assert.ok(claimRows.some(row => row.fromType === WIKI_CLAIM_ITEM_TYPE && row.fromId === 'page-a:claim-3' && row.relationType === 'needs_review'));

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
  const syncResult = await syncWikiPageGraphConnections({
    Connection: syncStore,
    userId: 'user-1',
    page: {
      _id: 'page-a',
      body: doc,
      sourceRefs: [{ type: 'article', objectId: 'article-1' }]
    }
  });
  assert.strictEqual(syncResult.deletedCount, 2);
  assert.strictEqual(syncResult.createdCount, 2);
  assert.ok(syncStore.records.some(record => record.toId === 'page-c'));
  assert.ok(!syncStore.records.some(record => record.toId === 'old-page'));
  assert.ok(!syncStore.records.some(record => record.toId === 'page-a:old-claim'));
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
