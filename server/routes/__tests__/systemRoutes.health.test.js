const assert = require('assert');
const express = require('express');
const { buildSystemRouter } = require('../systemRoutes');

const run = async () => {
  let databaseReady = false;
  const app = express();
  app.use(buildSystemRouter({
    authenticateToken: (_req, _res, next) => next(),
    parseAiServiceUrl: () => ({ origin: '', hasPath: false }),
    joinUrl: () => '',
    isDatabaseReady: () => databaseReady
  }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    const startingResponse = await fetch(`${baseUrl}/health`);
    assert.strictEqual(startingResponse.status, 503);
    assert.deepStrictEqual(await startingResponse.json(), {
      status: 'starting',
      message: 'Database connection is not ready.'
    });

    databaseReady = true;
    const readyResponse = await fetch(`${baseUrl}/health`);
    assert.strictEqual(readyResponse.status, 200);
    assert.deepStrictEqual(await readyResponse.json(), {
      status: 'ok',
      message: 'Server is warm.'
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('systemRoutes health readiness tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
