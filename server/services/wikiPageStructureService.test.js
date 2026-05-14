const assert = require('assert');

const {
  getWikiPageStructure,
  normalizePageType
} = require('./wikiPageStructureService');

const run = () => {
  assert.strictEqual(normalizePageType('person'), 'entity');
  assert.strictEqual(normalizePageType('synthesis'), 'overview');
  assert.strictEqual(normalizePageType('topic'), 'topic');
  assert.strictEqual(normalizePageType('comparison'), 'comparison');
  assert.strictEqual(normalizePageType('unknown'), 'topic');

  const entity = getWikiPageStructure('person');
  assert.strictEqual(entity.type, 'entity');
  assert.strictEqual(entity.label, 'Entity');

  const overview = getWikiPageStructure('synthesis');
  assert.strictEqual(overview.type, 'overview');
  assert.strictEqual(overview.label, 'Overview');
};

if (require.main === module) {
  try {
    run();
    console.log('wikiPageStructureService tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
