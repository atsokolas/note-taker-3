const assert = require('assert');
const express = require('express');
const { once } = require('events');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { buildHostedMcpRouter } = require('../hostedMcpRoutes');

const startApp = async ({ useRealMcp = false, appUrl = 'http://127.0.0.1:3000', enableJsonResponse } = {}) => {
  let receivedToken = '';
  let receivedApiUrl = '';
  let receivedAppUrl = '';
  const app = express();
  app.use(express.json());
  const options = {
    ...(appUrl === null ? {} : { appUrl }),
    ...(enableJsonResponse === undefined ? {} : { enableJsonResponse }),
    authenticateAgentToken: (req, res, next) => {
      if (req.headers.authorization !== 'Bearer ntk_at_test') {
        return res.status(401).json({ error: 'Agent token required.' });
      }
      return next();
    }
  };
  if (!useRealMcp) {
    options.loadServer = async () => ({
      createMcpServer: ({ token, apiUrl, appUrl }) => {
        receivedToken = token;
        receivedApiUrl = apiUrl;
        receivedAppUrl = appUrl;
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
    receivedApiUrl: () => receivedApiUrl,
    receivedAppUrl: () => receivedAppUrl,
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
    }, { Authorization: 'Bearer ntk_at_test', Host: 'attacker.example', 'X-Forwarded-Host': 'attacker.example' });
    assert.strictEqual(initialized.status, 200);
    assert(initialized.headers.get('content-type').includes('text/event-stream'), 'default production response remains SSE');
    assert.strictEqual(app.receivedToken(), 'ntk_at_test');
    assert.strictEqual(app.receivedAppUrl(), 'http://127.0.0.1:3000');
    assert.strictEqual(app.receivedApiUrl(), `http://127.0.0.1:${process.env.PORT || 3000}`);
    assert.strictEqual(initialized.headers.get('access-control-expose-headers'), 'Mcp-Session-Id, WWW-Authenticate');
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

  // Optional JSON mode works with the real SDK client over HTTP. It does not
  // expose anything publicly and leaves the default SSE transport unchanged.
  const previousJson = process.env.NOEIS_MCP_JSON_RESPONSES;
  process.env.NOEIS_MCP_JSON_RESPONSES = 'true';
  const jsonApp = await startApp();
  const sdkClient = new Client({ name: 'json-hosted-test', version: '1' });
  try {
    const initialized = await request(jsonApp.url, {
      jsonrpc: '2.0', id: 31, method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'json-fixture', version: '1' }
      }
    }, { Authorization: 'Bearer ntk_at_test' });
    assert.strictEqual(initialized.status, 200);
    assert(initialized.headers.get('content-type').includes('application/json'));
    await sdkClient.connect(new StreamableHTTPClientTransport(new URL(`${jsonApp.url}/mcp`), {
      requestInit: { headers: { Authorization: 'Bearer ntk_at_test' } }
    }));
    assert((await sdkClient.listTools()).tools.some(tool => tool.name === 'connection_info'));
    const called = await sdkClient.callTool({ name: 'connection_info', arguments: {} });
    assert.strictEqual(called.isError, undefined);
    assert.deepStrictEqual(JSON.parse(called.content[0].text), { connected: true });
  } finally {
    await sdkClient.close(); await jsonApp.close();
    if (previousJson === undefined) delete process.env.NOEIS_MCP_JSON_RESPONSES; else process.env.NOEIS_MCP_JSON_RESPONSES = previousJson;
  }
  assert.throws(() => buildHostedMcpRouter({ authenticateAgentToken: () => {}, enableJsonResponse: 'true' }), /boolean/);

  const previousApp = process.env.NOEIS_APP_URL;
  const previousFrontend = process.env.FRONTEND_URL;
  delete process.env.NOEIS_APP_URL;
  process.env.FRONTEND_URL = 'https://frontend-only.example';
  let frontendOnly;
  try {
    frontendOnly = await startApp({ appUrl: null });
    await request(frontendOnly.url, { jsonrpc: '2.0', id: 21, method: 'tools/list', params: {} }, { Authorization: 'Bearer ntk_at_test', Host: 'attacker.example' });
    assert.strictEqual(frontendOnly.receivedAppUrl(), 'https://frontend-only.example');
  } finally {
    if (frontendOnly) await frontendOnly.close();
    if (previousApp === undefined) delete process.env.NOEIS_APP_URL; else process.env.NOEIS_APP_URL = previousApp;
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = previousFrontend;
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
    const profile = tools.result.tools.find(tool => tool.name === 'get_profile');
    assert.deepStrictEqual(profile.securitySchemes, [{ type: 'oauth2', scopes: ['read'] }]);
    assert.deepStrictEqual(profile.securitySchemes, profile._meta.securitySchemes);
    ['list_judgment_pages', 'create_judgment_page', 'update_judgment_page'].forEach(name => {
      assert(tools.result.tools.some(tool => tool.name === name), `${name} must be available over hosted MCP`);
    });
  } finally {
    await realApp.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
