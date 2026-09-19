const assert = require('assert');
const express = require('express');
const { once } = require('events');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { buildHostedMcpRouter } = require('../hostedMcpRoutes');

const startApp = async ({ useRealMcp = false } = {}) => {
  let receivedToken = '';
  const app = express();
  app.use(express.json());
  const options = {
    authenticateAgentToken: (req, res, next) => {
      if (req.headers.authorization !== 'Bearer ntk_at_test') {
        return res.status(401).json({ error: 'Agent token required.' });
      }
      return next();
    }
  };
  if (!useRealMcp) {
    options.loadServer = async () => ({
      createMcpServer: ({ token }) => {
        receivedToken = token;
        const server = new McpServer({ name: 'noeis-hosted-mcp-test', version: '1.0.0' });
        server.registerTool('connection_info', { description: 'Reports the test connection.' }, async () => ({
          content: [{ type: 'text', text: JSON.stringify({ connected: true }) }]
        }));
        return server;
      }
    });
  }
  app.use(buildHostedMcpRouter(options));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    receivedToken: () => receivedToken,
    close: () => new Promise(resolve => server.close(resolve))
  };
};

const request = (url, body, headers = {}) => fetch(`${url}/mcp`, {
  method: 'POST',
  headers: {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    ...headers
  },
  body: JSON.stringify(body)
});

const responsePayload = async (response) => {
  const text = await response.text();
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    return JSON.parse(text);
  }
  const data = text.split('\n').find(line => line.startsWith('data: '));
  return JSON.parse(data.slice(6));
};

const run = async () => {
  const app = await startApp();
  try {
    const health = await fetch(`${app.url}/mcp/health`);
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.headers.get('cache-control'), 'no-store');

    const preflight = await fetch(`${app.url}/mcp`, { method: 'OPTIONS' });
    assert.strictEqual(preflight.status, 204);
    assert(preflight.headers.get('access-control-allow-headers').includes('Authorization'));

    const rejected = await request(app.url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    assert.strictEqual(rejected.status, 401);

    const initialized = await request(app.url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'Noeis test', version: '1.0.0' }
      }
    }, { Authorization: 'Bearer ntk_at_test' });
    assert.strictEqual(initialized.status, 200);
    assert.strictEqual(app.receivedToken(), 'ntk_at_test');
    assert.strictEqual(initialized.headers.get('access-control-expose-headers'), 'Mcp-Session-Id');
    const payload = await responsePayload(initialized);
    assert.strictEqual(payload.result.serverInfo.name, 'noeis-hosted-mcp-test');

    const listed = await request(app.url, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }, { Authorization: 'Bearer ntk_at_test' });
    assert.strictEqual(listed.status, 200);
    const tools = await responsePayload(listed);
    assert(tools.result.tools.some(tool => tool.name === 'connection_info'));
  } finally {
    await app.close();
  }

  const realApp = await startApp({ useRealMcp: true });
  try {
    const initialized = await request(realApp.url, {
      jsonrpc: '2.0',
      id: 3,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'Noeis test', version: '1.0.0' }
      }
    }, { Authorization: 'Bearer ntk_at_test' });
    assert.strictEqual(initialized.status, 200);
    const listed = await request(realApp.url, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
      params: {}
    }, { Authorization: 'Bearer ntk_at_test' });
    const tools = await responsePayload(listed);
    assert(tools.result.tools.some(tool => tool.name === 'list_pages'));
  } finally {
    await realApp.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
