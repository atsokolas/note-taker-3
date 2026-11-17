const { test } = require('node:test');
const assert = require('node:assert/strict');
const { notebookCuttings } = require('../notebookWorkbench');

test('gathers every dimmed passage and scratchpad thought, newest first, with its piece', () => {
  const cuttings = notebookCuttings([
    { _id: 'n1', title: 'On moats', workingState: {
      dimmed: [{ id: 'd1', text: 'Maybe cut this.', createdAt: '2026-11-02' }],
      looseThoughts: [{ id: 'l1', text: 'A digression on Costco.', createdAt: '2026-11-05' }, { id: 'l2', text: '  ' }]
    } },
    { _id: 'n2', title: '', workingState: { dimmed: [{ id: 'd2', text: 'Too clever.', createdAt: '2026-11-04' }] } }
  ]);

  assert.deepEqual(cuttings.map(({ kind, text, noteTitle }) => [kind, text, noteTitle]), [
    ['aside', 'A digression on Costco.', 'On moats'],
    ['dimmed', 'Too clever.', 'Untitled'],
    ['dimmed', 'Maybe cut this.', 'On moats']
  ]);
  assert.equal(cuttings[0].noteId, 'n1');
  assert.equal(new Set(cuttings.map(item => item.id)).size, 3);
});
