const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { sanitizeNotebookWorkbench } = require('../notebookWorkbench');
const { NotebookEntry } = require('../../models');

test('keeps the outline beside a draft, empty lines included, within bounds', () => {
  const { outline } = sanitizeNotebookWorkbench({ outline: [
    { id: 'a', text: 'Keeping', depth: 0, blockId: 'h1' },
    { id: 'b', text: '', depth: '9', folded: 'yes' },
    { text: 'x'.repeat(900), depth: -2 }
  ] });
  assert.deepEqual(outline.map(point => [point.id, point.text.length, point.depth, point.folded, point.blockId]), [
    ['a', 7, 0, false, 'h1'], ['b', 0, 5, true, ''], ['point-2', 500, 0, false, '']
  ]);
  assert.deepEqual(sanitizeNotebookWorkbench({}).outline, []);
});

test('a saved pencil line stays pencil, and an ordinary paragraph says nothing', () => {
  const entry = new NotebookEntry({
    userId: new mongoose.Types.ObjectId(),
    blocks: [{ id: 'p', type: 'paragraph', text: 'The page it stands on', pencil: true }, { id: 'q', type: 'paragraph', text: 'Ink' }],
    workingState: { outline: [{ id: 'a', text: 'Keeping', depth: 1 }] }
  });
  const saved = entry.toObject();
  assert.equal(saved.blocks[0].pencil, true);
  assert.equal('pencil' in saved.blocks[1], false);
  assert.equal(saved.workingState.outline[0].depth, 1);
});
