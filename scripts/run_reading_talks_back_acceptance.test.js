const assert = require('assert');

const {
  assertDisposableDatabaseUri,
  buildExactLibraryPath,
  databaseNameFromUri,
  parseArgs
} = require('./run_reading_talks_back_acceptance');

const run = async () => {
  const safeUri = 'mongodb://127.0.0.1:27017/noeis_rtba_accept_test';
  assert.strictEqual(databaseNameFromUri(safeUri), 'noeis_rtba_accept_test');
  assert.strictEqual(assertDisposableDatabaseUri(safeUri), 'noeis_rtba_accept_test');
  assert.throws(
    () => assertDisposableDatabaseUri('mongodb://127.0.0.1:27017/noeis'),
    /disposable database/i
  );
  assert.throws(
    () => assertDisposableDatabaseUri(`mongodb://127.0.0.1:27017/noeis_rtba_accept_${'x'.repeat(30)}`),
    /38-byte limit/i
  );
  assert.deepStrictEqual(parseArgs([
    `--mongo-uri=${safeUri}`,
    '--output-dir=tmp/reading-loop'
  ]), {
    mongoUri: safeUri,
    outputDir: 'tmp/reading-loop'
  });
  assert.strictEqual(
    buildExactLibraryPath({ articleId: 'article one', highlightId: 'highlight/two' }),
    '/library?articleId=article%20one&highlightId=highlight%2Ftwo'
  );
  assert.strictEqual(buildExactLibraryPath({ highlightId: 'orphan' }), '/library');
};

if (require.main === module) {
  run()
    .then(() => console.log('reading talks back acceptance cli tests passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
