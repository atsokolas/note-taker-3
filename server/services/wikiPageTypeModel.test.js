const assert = require('assert');
const mongoose = require('mongoose');

const { WikiPage } = require('../models');

const run = () => {
  const page = new WikiPage({
    userId: new mongoose.Types.ObjectId(),
    title: 'Legacy Person',
    slug: 'legacy-person',
    pageType: 'person'
  });
  assert.strictEqual(page.pageType, 'entity');
  assert.strictEqual(page.validateSync(), undefined);

  page.pageType = 'synthesis';
  assert.strictEqual(page.pageType, 'overview');
  assert.strictEqual(page.validateSync(), undefined);

  page.pageType = 'unsupported';
  const validationError = page.validateSync();
  assert.ok(validationError);
  assert.ok(validationError.errors.pageType);
};

if (require.main === module) {
  try {
    run();
    console.log('wikiPageTypeModel tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
