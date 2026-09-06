const assert = require('assert');

const { normalizeBodyDoc } = require('../wikiRoutes');

describe('normalizeBodyDoc', () => {
  it('passes a TipTap doc through untouched', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] };
    assert.strictEqual(normalizeBodyDoc(doc), doc);
  });

  // Every agent that has ever written a page sent prose as a string. Creating
  // used to drop it and answer 201; patching used to refuse it. The text was
  // right there both times.
  it('keeps prose sent as a string', () => {
    assert.deepStrictEqual(normalizeBodyDoc('A finding.'), {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A finding.' }] }]
    });
  });

  it('keeps the paragraphs the writer wrote', () => {
    const doc = normalizeBodyDoc('First claim.\n\nSecond claim.\n\n\nThird claim.');
    assert.strictEqual(doc.content.length, 3);
    assert.deepStrictEqual(
      doc.content.map(node => node.content[0].text),
      ['First claim.', 'Second claim.', 'Third claim.']
    );
  });

  it('folds soft wrapping inside a paragraph', () => {
    const doc = normalizeBodyDoc('One sentence\nwrapped by an editor.');
    assert.strictEqual(doc.content.length, 1);
    assert.strictEqual(doc.content[0].content[0].text, 'One sentence wrapped by an editor.');
  });

  it('returns null for anything with no prose in it', () => {
    [undefined, null, '', '   \n\n  ', [], 42, true].forEach((value) => {
      assert.strictEqual(normalizeBodyDoc(value), null, `expected null for ${JSON.stringify(value)}`);
    });
  });
});
