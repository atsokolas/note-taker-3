const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SETTLE_KINDS, blocksFromHtml, settleDraftFrom, settleRefusal } = require('./settlement');

const article = '64b000000000000000000001';
const highlight = '64b000000000000000000002';

test('a note settles as headings, prose, lists, and every sourced quote cited once', () => {
  const draft = settleDraftFrom({
    title: 'Why moats erode',
    blocks: [
      { id: 'h', type: 'heading', level: 1, text: 'The claim' },
      { id: 'p', type: 'paragraph', text: 'Prices stay low  for years.' },
      { id: 'q1', type: 'highlight_embed', highlightId: highlight, articleId: article, articleTitle: 'On Moats', text: 'Scale is a moat until it is not.' },
      { id: 'b1', type: 'bullet', text: 'Costs' },
      { id: 'b2', type: 'bullet', text: 'Habits' },
      { id: 'q2', type: 'highlight_embed', highlightId: highlight, articleId: article, articleTitle: 'On Moats', text: 'Scale is a moat until it is not.' },
      { id: 'q3', type: 'quote', text: 'A line I remember.' },
      { id: 'empty', type: 'paragraph', text: '  ' }
    ]
  });
  assert.equal(draft.title, 'Why moats erode');
  assert.deepEqual(draft.body.content.map(node => node.type), ['heading', 'paragraph', 'pullquote', 'bulletList', 'pullquote', 'pullquote']);
  assert.equal(draft.body.content[0].attrs.level, 2, 'the page owns the h1');
  assert.equal(draft.body.content[1].content[0].text, 'Prices stay low for years.');
  assert.equal(draft.body.content[3].content.length, 2, 'adjacent bullets are one list');

  assert.equal(draft.sourceRefs.length, 1, 'the same passage quoted twice is one source');
  assert.deepEqual(draft.sourceRefs[0], {
    type: 'highlight', objectId: highlight, parentObjectId: article, title: 'On Moats', snippet: 'Scale is a moat until it is not.', addedBy: 'user'
  });
  const quote = draft.body.content[2];
  assert.equal(quote.attrs.attribution, 'On Moats');
  assert.deepEqual(quote.content[0].content[0].marks, [{ type: 'claim', attrs: { claimId: 'settled-q1', support: 'supported', citationIndexes: [1] } }]);
  assert.equal(draft.body.content[4].content[0].content[0].marks[0].attrs.citationIndexes[0], 1);
  assert.equal(draft.body.content[5].content[0].content[0].marks, undefined, 'a quote with no source stays uncited');
  assert.equal(settleRefusal(draft, 'note'), '');
});

test('a note written before blocks settles from its text', async () => {
  const draft = settleDraftFrom(await SETTLE_KINDS.notebook.writing({}, { title: 'Old note', blocks: [], content: '<p>Written&nbsp;long ago.</p>' }));
  assert.equal(draft.body.content[0].content[0].text, 'Written long ago.');
});

test('a concept draft reads as blocks, its quoted passages keeping their source', () => {
  assert.deepEqual(blocksFromHtml([
    '<h3>Claim</h3>',
    '<p data-block-id="p1">Time &amp; <strong>habit</strong></p>',
    `<blockquote data-highlight-id="${highlight}" data-highlight-text="Scale &quot;wins&quot; > size" data-article-id="${article}" data-article-title="On Moats"></blockquote>`,
    '<ul><li><p>Costs</p></li></ul>',
    '<blockquote><p>A line I remember.</p></blockquote>'
  ].join('')), [
    { id: 'block-0', type: 'heading', level: 3, text: 'Claim' },
    { id: 'p1', type: 'paragraph', level: undefined, text: 'Time & habit' },
    { id: highlight, type: 'highlight_embed', highlightId: highlight, articleId: article, articleTitle: 'On Moats', text: 'Scale "wins" > size' },
    { id: 'block-3', type: 'bullet', level: undefined, text: 'Costs' },
    { id: 'block-4', type: 'quote', level: undefined, text: 'A line I remember.' }
  ]);
  assert.deepEqual(blocksFromHtml(''), []);
});

test('a note that would fail the wiki bar says what to fix', () => {
  assert.equal(settleRefusal(settleDraftFrom({ title: 'Ideas', blocks: [] }), 'note'), 'Nothing is written here yet. Write the thought, then settle it.');
  const body = [{ id: 'p', type: 'paragraph', text: 'Something worth keeping.' }];
  assert.equal(settleRefusal(settleDraftFrom({ title: '', blocks: body }), 'concept'), 'Give this concept a title before it settles.');
  assert.equal(settleRefusal(settleDraftFrom({ title: 'Untitled', blocks: body }), 'note'), '“Untitled” reads as a placeholder. Give the note its real title, then settle it.');
});
