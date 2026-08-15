const assert = require('assert');
const path = require('path');

// The embedding service sleeps when idle and answers 502 for the forty-odd
// seconds it takes to wake. Every semantic feature went dark on the first
// request after any quiet period, and the caller could not tell an asleep
// service from an empty library. These tests pin that a wake-up is waited out
// and that a real fault still fails fast.

const load = (embedTexts) => {
  const clientPath = require.resolve('../config/aiClient');
  const embedPath = require.resolve('./embed');
  delete require.cache[clientPath];
  delete require.cache[embedPath];
  require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { embedTexts } };
  return require('./embed');
};

const run = async () => {
  // 1. A waking service is waited out, not reported as unavailable.
  {
    let calls = 0;
    const { embedText } = load(async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('Bad gateway'), { status: 502 });
      return { vectors: [[0.1, 0.2, 0.3]] };
    });
    const vector = await embedText('margin of safety', { retryDelaysMs: [1, 1, 1] });
    assert.deepEqual(vector, [0.1, 0.2, 0.3]);
    assert.equal(calls, 3, 'it should keep trying while the service wakes');
  }

  // 2. A malformed request answers identically forever; do not sit on it.
  {
    let calls = 0;
    const { embedText, EmbeddingError } = load(async () => {
      calls += 1;
      throw Object.assign(new Error('Bad request'), { status: 400 });
    });
    await assert.rejects(
      () => embedText('x', { retryDelaysMs: [1, 1, 1] }),
      error => error instanceof EmbeddingError && error.status === 400
    );
    assert.equal(calls, 1, 'a 400 must not be retried');
  }

  // 3. A service that never wakes still fails honestly rather than hanging.
  {
    let calls = 0;
    const { embedText } = load(async () => {
      calls += 1;
      throw Object.assign(new Error('Bad gateway'), { status: 502 });
    });
    await assert.rejects(() => embedText('x', { retryDelaysMs: [1, 1] }), error => error.status === 502);
    assert.equal(calls, 3, 'attempts are bounded');
  }

  // 4. Empty text never reaches the network.
  {
    let calls = 0;
    const { embedText } = load(async () => { calls += 1; return { vectors: [[1]] }; });
    await assert.rejects(() => embedText('   '), error => error.status === 400);
    assert.equal(calls, 0);
  }

  console.log('embed cold start tests passed');
};

if (require.main === module) {
  run().catch((error) => { console.error(error); process.exit(1); });
}
module.exports = { run };
