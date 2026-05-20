const assert = require('assert');
const { applyWikiAutolinkToDoc } = require('./wikiAutolinkApplyService');

const run = async () => {
  const doc = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'Compounding interest matters over time.' }]
    }]
  };
  const result = applyWikiAutolinkToDoc({
    doc,
    targetPage: { _id: 'page-2', title: 'Compounding interest' }
  });
  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.doc.content[0].content.length, 2);
  assert.strictEqual(result.doc.content[0].content[0].text, 'Compounding interest');
  assert.strictEqual(result.doc.content[0].content[0].marks[0].type, 'wikiLink');
  assert.strictEqual(result.doc.content[0].content[0].marks[0].attrs.pageId, 'page-2');

  const second = applyWikiAutolinkToDoc({
    doc: result.doc,
    targetPage: { _id: 'page-2', title: 'Compounding interest' }
  });
  assert.strictEqual(second.applied, false);

  const none = applyWikiAutolinkToDoc({
    doc,
    targetPage: { _id: 'page-3', title: 'Unrelated topic' }
  });
  assert.strictEqual(none.applied, false);

  const aliasDoc = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'Investing rewards patient evidence review.' }]
    }]
  };
  const aliasResult = applyWikiAutolinkToDoc({
    doc: aliasDoc,
    targetPage: { _id: 'page-4', title: 'Investing - Concepts, Ideas, and Strategies', matchText: 'Investing' }
  });
  assert.strictEqual(aliasResult.applied, true);
  assert.strictEqual(aliasResult.doc.content[0].content[0].text, 'Investing');
  assert.strictEqual(aliasResult.doc.content[0].content[0].marks[0].attrs.title, 'Investing - Concepts, Ideas, and Strategies');

  const variantDoc = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'Cash-flow valuations keep growth assumptions explicit.' }]
    }]
  };
  const variantResult = applyWikiAutolinkToDoc({
    doc: variantDoc,
    targetPage: { _id: 'page-5', title: 'Cash Flow Valuation' }
  });
  assert.strictEqual(variantResult.applied, true);
  assert.strictEqual(variantResult.doc.content[0].content[0].text, 'Cash-flow valuations');
  assert.strictEqual(variantResult.doc.content[0].content[0].marks[0].attrs.pageId, 'page-5');
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('wikiAutolinkApplyService tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
