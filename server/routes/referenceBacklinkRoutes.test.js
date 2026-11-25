const assert = require('assert');
const express = require('express');
const { buildReferenceBacklinkRouter } = require('./referenceBacklinkRoutes');

const USER = '64f600000000000000000001';
const ARTICLE = '64f600000000000000000002';
const HIGHLIGHT = '64f600000000000000000003';

class Query {
  constructor(value) { this.value = value; }
  sort() { return this; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

/* The three lookups after the article are held until all three have been
   asked, so the test fails if any of them waits on another. */
const asked = [];
let release;
const together = new Promise(resolve => { release = resolve; });
const held = (name, value) => (filter) => {
  asked.push({ name, filter });
  if (asked.length === 3) release();
  const query = new Query(null);
  query.then = (resolve, reject) => together.then(() => value).then(resolve, reject);
  return query;
};

const app = express();
app.use(buildReferenceBacklinkRouter({
  authenticateToken: (req, res, next) => { req.user = { id: USER }; next(); },
  Article: { findOne: () => new Query({ _id: ARTICLE, highlights: [{ _id: HIGHLIGHT }] }) },
  ReferenceEdge: { find: held('edges', [{ sourceId: 'n1', sourceBlockId: 'b1', targetType: 'highlight', targetId: HIGHLIGHT }]) },
  TagMeta: { find: held('concepts', [{ name: 'Incentives' }]) },
  Collection: { find: held('collections', [{ name: 'Munger', slug: 'munger' }]) },
  buildNotebookBlocksFromEdges: async ({ edges }) => edges.map(edge => ({ notebookEntryId: edge.sourceId, blockId: edge.sourceBlockId }))
}));

const server = app.listen(0, '127.0.0.1', async () => {
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/api/articles/${ARTICLE}/backlinks`, { signal: AbortSignal.timeout(2000) });
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), {
      notebookBlocks: [{ notebookEntryId: 'n1', blockId: 'b1' }],
      concepts: [{ name: 'Incentives' }],
      questions: [],
      collections: [{ name: 'Munger', slug: 'munger' }]
    });
    // Edges to the article and to its passages are one question.
    const edges = asked.find(row => row.name === 'edges').filter;
    assert.deepStrictEqual(edges.$or.map(clause => clause.targetType), ['article', 'highlight']);
    console.log('referenceBacklinkRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
