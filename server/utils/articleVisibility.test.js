const assert = require('assert');
const { applyDefaultArticleVisibility, librarySearchArticleMatch } = require('./articleVisibility');

const run = () => {
  const base = { userId: 'user-1' };
  const visible = applyDefaultArticleVisibility(base);

  assert.strictEqual(
    visible.hiddenFromHome,
    undefined,
    'Library search should keep hiddenFromHome articles recoverable by default.'
  );
  assert.deepStrictEqual(visible.debugOnly, { $ne: true });
  assert.deepStrictEqual(visible.archived, { $ne: true });
  assert.deepStrictEqual(
    applyDefaultArticleVisibility(base, { includeSuppressed: true }),
    base
  );
  assert.deepStrictEqual(
    librarySearchArticleMatch('user-1', { $text: { $search: 'Nomad' } }).debugOnly,
    { $ne: true }
  );
};

if (require.main === module) {
  try {
    run();
    console.log('article visibility tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
