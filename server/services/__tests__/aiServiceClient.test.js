const assert = require('assert');

const loadClient = () => {
  const clientPath = require.resolve('../aiServiceClient');
  delete require.cache[clientPath];
  return require('../aiServiceClient');
};

const jsonResponse = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status >= 200 && status < 300 ? 'OK' : 'ERROR',
  headers: {
    get: (key) => headers[String(key || '').toLowerCase()] || null
  },
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
});

const run = async () => {
  const originalEnv = {
    AI_SERVICE_URL: process.env.AI_SERVICE_URL,
    AI_SHARED_SECRET: process.env.AI_SHARED_SECRET,
    AI_SERVICE_RETRIES: process.env.AI_SERVICE_RETRIES,
    AI_SERVICE_TIMEOUT_MS: process.env.AI_SERVICE_TIMEOUT_MS,
    AI_SERVICE_MAX_CONCURRENT: process.env.AI_SERVICE_MAX_CONCURRENT
  };
  const originalFetch = global.fetch;

  process.env.AI_SERVICE_URL = 'https://example.ai';
  process.env.AI_SHARED_SECRET = 'test-secret';
  process.env.AI_SERVICE_TIMEOUT_MS = '1000';
  process.env.AI_SERVICE_RETRIES = '1';
  process.env.AI_SERVICE_MAX_CONCURRENT = '2';

  try {
    let callCount = 0;
    global.fetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        return jsonResponse(429, 'Too Many Requests', { 'retry-after': '0' });
      }
      return jsonResponse(200, { ok: true, retried: true });
    };

    const client1 = loadClient();
    const retried = await client1.request({ path: '/search', body: { query: 'insights' } });
    assert.strictEqual(retried.ok, true, 'Expected retry path to eventually succeed.');
    assert.strictEqual(callCount, 2, 'Expected one retry for initial 429 response.');

    process.env.AI_SERVICE_RETRIES = '0';
    process.env.AI_SERVICE_MAX_CONCURRENT = '1';

    let inFlight = 0;
    let maxInFlight = 0;
    global.fetch = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 25));
      inFlight -= 1;
      return jsonResponse(200, { ok: true });
    };

    const client2 = loadClient();
    await Promise.all([
      client2.request({ path: '/search', body: { q: 'a' } }),
      client2.request({ path: '/search', body: { q: 'b' } }),
      client2.request({ path: '/search', body: { q: 'c' } })
    ]);
    assert.strictEqual(maxInFlight, 1, 'Expected queue to enforce max concurrency of 1.');
  } finally {
    global.fetch = originalFetch;
    Object.keys(originalEnv).forEach((key) => {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('aiServiceClient tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
