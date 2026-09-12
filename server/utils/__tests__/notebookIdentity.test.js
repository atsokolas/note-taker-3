const assert = require('assert');
const {
  asObjectIdOrNull,
  sanitizeAsidePieces,
  sanitizeNotebookBlocks
} = require('../notebookIdentity');

assert.equal(asObjectIdOrNull('article-1'), null);
assert.equal(asObjectIdOrNull('highlight-1'), null);
assert.equal(asObjectIdOrNull(''), null);
assert.equal(asObjectIdOrNull(null), null);
assert.equal(asObjectIdOrNull('507f1f77bcf86cd799439011'), '507f1f77bcf86cd799439011');
assert.equal(asObjectIdOrNull({ _id: '507f1f77bcf86cd799439011' }), '507f1f77bcf86cd799439011');

const [quote] = sanitizeNotebookBlocks([{
  id: 'quote-1',
  type: 'quote',
  text: 'The cost is borne by people who did not volunteer.',
  articleId: 'article-1',
  articleTitle: 'A beautiful source',
  sourcePath: '/library?articleId=article-1#passage=exact'
}]);
assert.equal(quote.articleId, null);
assert.equal(quote.sourcePath, '/library?articleId=article-1#passage=exact');
assert.equal(quote.articleTitle, 'A beautiful source');

const [aside] = sanitizeAsidePieces([{
  id: 'held',
  nodes: [{ type: 'paragraph', attrs: { blockId: 'held-1' } }],
  blocks: [{ id: 'held-1', type: 'quote', articleId: 'article-1', text: 'A line' }]
}]);
assert.equal(aside.nodes[0].attrs.blockId, 'held-1');
assert.equal(aside.blocks[0].articleId, null);

console.log('notebook identity tests passed');
