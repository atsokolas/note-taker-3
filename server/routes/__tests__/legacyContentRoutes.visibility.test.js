const assert = require('assert');

const { __testables } = require('../legacyContentRoutes');

const run = () => {
  const base = { userId: 'user-1' };
  const visible = __testables.applyDefaultArticleVisibility(base);

  assert.strictEqual(
    visible.hiddenFromHome,
    undefined,
    'Library article listing should keep hiddenFromHome articles recoverable by default.'
  );
  assert.deepStrictEqual(visible.debugOnly, { $ne: true });
  assert.deepStrictEqual(visible.archived, { $ne: true });

  const suppressed = __testables.applyDefaultArticleVisibility(base, { includeSuppressed: true });
  assert.deepStrictEqual(suppressed, base, 'Explicit suppressed review mode should not add visibility filters.');
};

if (require.main === module) {
  try {
    run();
    console.log('legacy content route visibility tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
