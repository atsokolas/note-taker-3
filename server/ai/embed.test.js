const assert = require('node:assert');
const Module = require('module');

/* A rate limit is not a cold start.

   Treating 429 as a wake-up meant a rate-limited embed slept 4s, 12s and 20s
   and tried a dozen times before giving up, per job, against a service that
   was never going to say yes. That is what turned a rate limit into a stall
   and the stall into an out-of-memory crash. */

const load = (embedImpl) => {
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../config/aiClient') return { embedTexts: embedImpl };
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve('./embed')];
  const mod = require('./embed');
  Module._load = originalLoad;
  return mod;
};

const fail = (status) => {
  const error = new Error(`AI service error ${status}`);
  error.status = status;
  return error;
};

(async () => {
  // 429: given up on immediately, so the queue runner can back off.
  {
    let calls = 0;
    const { embedText } = load(async () => { calls += 1; throw fail(429); });
    const started = Date.now();
    let thrown = null;
    try { await embedText('some text'); } catch (error) { thrown = error; }
    const elapsed = Date.now() - started;
    assert.ok(thrown, 'the rate limit is reported');
    assert.strictEqual(thrown.status, 429, 'and it keeps its status so the runner recognises it');
    assert.strictEqual(calls, 1, 'exactly one attempt: no waiting out a rate limit');
    assert.ok(elapsed < 1000, `returned promptly, took ${elapsed}ms`);
    await assert.rejects(
      () => embedText('another text'),
      error => error.status === 429 && Number(error?.payload?.retryAfterMs) > 0
    );
    assert.strictEqual(calls, 1, 'the cooldown fails closed without touching the upstream again');
  }

  // 503: still waited out, because that is a service actually waking up.
  {
    let calls = 0;
    const { embedText } = load(async () => {
      calls += 1;
      if (calls < 3) throw fail(503);
      return { vectors: [[0.1, 0.2]] };
    });
    const vector = await embedText('some text', { retryDelaysMs: [1, 1, 1] });
    assert.deepStrictEqual(vector, [0.1, 0.2], 'a waking service is waited out and answers');
    assert.strictEqual(calls, 3);
  }

  // 400: never retried, because it will answer identically forever.
  {
    let calls = 0;
    const { embedText } = load(async () => { calls += 1; throw fail(400); });
    let thrown = null;
    try { await embedText('some text', { retryDelaysMs: [1, 1] }); } catch (error) { thrown = error; }
    assert.ok(thrown);
    assert.strictEqual(calls, 1, 'a bad request is not retried');
  }

  console.log('embed backoff tests passed');
})();
