const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { parseHostedMcpBody } = require('../hostedMcpRoutes');

(async () => {
  assert.equal(typeof parseHostedMcpBody, 'function', 'hosted MCP needs a bounded parser before the general API parser');
  const app = express();
  app.use('/mcp', parseHostedMcpBody);
  app.use(express.json({ limit: '50mb' }));
  app.post('/mcp', (_req, res) => res.json({ ok: true }));
  app.post('/other', (_req, res) => res.json({ ok: true }));
  app.use((error, _req, res, _next) => res.sendStatus(error.status || 500));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, size) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(size) })
  });
  try {
    assert.equal((await send('/mcp', 1024)).status, 200);
    assert.equal((await send('/mcp', 1024 * 1024)).status, 413);
    assert.equal((await send('/other', 1024 * 1024)).status, 200, 'other API limits are unchanged');
    // The parser must also meter chunked bodies, without relying on Content-Length.
    const response = await fetch(base + '/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, duplex: 'half',
      body: (async function* () { yield JSON.stringify({ text: 'x'.repeat(1024 * 1024) }); })()
    });
    assert.equal(response.status, 413);
    const unsupported = await fetch(base + '/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'text=fixture'
    });
    assert.equal(unsupported.status, 415, 'unsupported bodies must not fall through to the larger general parser');
    console.log('hosted MCP byte limit: passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
