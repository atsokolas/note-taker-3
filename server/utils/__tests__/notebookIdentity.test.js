const assert = require('assert');
const mongoose = require('mongoose');
const { NotebookEntry } = require('../../models');
const {
  asObjectIdOrNull,
  sanitizeAsidePieces,
  sanitizeNotebookBlocks,
  sanitizeNotebookEntry
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

const generated = sanitizeAsidePieces([{
  nodes: [{ type: 'paragraph', attrs: { blockId: 'held-2' } }],
  blocks: [{ type: 'paragraph', text: 'Held' }]
}]);
assert.equal(generated[0].id, 'held-2');
assert.ok(generated[0].blocks[0].id);

assert.equal(asObjectIdOrNull(new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')), '507f1f77bcf86cd799439011');
assert.equal(asObjectIdOrNull('not-an-object-id'), null);

const leftover = new NotebookEntry();
leftover.init({
  _id: new mongoose.Types.ObjectId(),
  userId: new mongoose.Types.ObjectId(),
  title: 'Held thought',
  content: '<p>Held</p>',
  blocks: [{ id: 'p1', type: 'paragraph', text: 'Held', articleId: 'article-1' }],
  type: 'note',
  tags: [],
  folder: 'inbox',
  linkedHighlightIds: ['highlight-1'],
  importMeta: { provider: 'evernote', importSessionId: 'session-evernote' },
  asidePieces: [{
    nodes: [{ type: 'paragraph', attrs: { blockId: 'held-3' } }],
    blocks: [{ type: 'paragraph', text: 'Held' }]
  }]
});
leftover.isNew = false;
assert.ok(leftover.validateSync(), 'loaded leftover identity should fail schema until sanitized');
sanitizeNotebookEntry(leftover);
assert.equal(leftover.validateSync(), null);

const assigned = new NotebookEntry({
  userId: new mongoose.Types.ObjectId(),
  title: 'Held thought',
  content: '<p>Held</p>',
  blocks: [{ id: 'p1', type: 'paragraph', text: 'Held' }],
  type: 'note',
  tags: []
});
assigned.set('folder', 'inbox');
assigned.set('linkedHighlightIds', ['highlight-1']);
assigned.set('importMeta.importSessionId', 'session-evernote');
assert.ok(assigned.$__.validationError, 'assigned leftover identity should record CastErrors');
sanitizeNotebookEntry(assigned);
assert.equal(assigned.validateSync(), null);

console.log('notebook identity tests passed');
