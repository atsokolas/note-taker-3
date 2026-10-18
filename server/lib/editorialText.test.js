const assert = require('assert');
const { docText } = require('./editorialText');

/* Text nodes carry their own spaces; blocks end their lines. Joining every
   node with a space gave saved wiki pages "word , next" and a heading run into
   its first sentence. Mirrors note-taker-ui/src/utils/editorialText.test.js. */
const doc = {
  type: 'doc',
  content: [
    { type: 'heading', content: [{ type: 'text', text: 'Moats' }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'A moat is ' },
      { type: 'text', text: 'durable', marks: [{ type: 'bold' }] },
      { type: 'text', text: ', next to nothing else.' }
    ] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }, { type: 'hardBreak' }, { type: 'text', text: 'two' }] }] }
    ] }
  ]
};

assert.strictEqual(docText(doc), 'Moats\nA moat is durable, next to nothing else.\none\ntwo');
assert.strictEqual(docText([{ type: 'text', text: 'word' }, { type: 'text', text: ', next' }]), 'word, next');
assert.strictEqual(docText('already text'), 'already text');
assert.strictEqual(docText(null), '');
assert.strictEqual(docText({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'horizontalRule' }] }), '');

console.log('editorialText docText: ok');
