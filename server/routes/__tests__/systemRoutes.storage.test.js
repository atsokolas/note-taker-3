const assert = require('node:assert/strict');
const express = require('express');
const { buildSystemRouter } = require('../systemRoutes');
(async () => {
  let unavailable = false;
  const app = express();
  app.use(buildSystemRouter({
    authenticateToken: (req, res, next) => req.headers.authorization ? next() : res.sendStatus(401),
    getWikiStorageStatus: async () => {
      if (unavailable) throw new Error('private diagnostic detail');
      return { status: 'completed', expired: 7, message: '' };
    }
  }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/system/storage`;
    assert.equal((await fetch(url)).status, 401);
    const options = { headers: { authorization: 'test' } };
    assert.deepEqual(await (await fetch(url, options)).json(), { storage: { status: 'completed', expired: 7, message: '' } });
    unavailable = true;
    const response = await fetch(url, options);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Storage status is temporarily unavailable.' });
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('storage status: authenticated readback and sanitized failure passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
