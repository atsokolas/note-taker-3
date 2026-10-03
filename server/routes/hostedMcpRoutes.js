const express = require('express');
const path = require('path');
const { pathToFileURL } = require('url');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

const mcpSource = pathToFileURL(
  path.resolve(__dirname, '../../packages/wiki-mcp/src/server.js')
).href;

const loadMcpServer = () => import(mcpSource);

const getBearerToken = (req = {}) => {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
};

const setMcpHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID'
  );
  res.setHeader('Cache-Control', 'no-store');
};

/* The adapter deliberately creates a stateless transport for every request.
   No bearer token, client history, or server session is retained in Render
   memory; the tool call itself is still authenticated by the existing API. */
const buildHostedMcpRouter = ({
  authenticateAgentToken,
  resourceMetadataUrl = null,
  appUrl = process.env.NOEIS_APP_URL || process.env.FRONTEND_URL || 'https://www.noeis.io',
  enableJsonResponse = process.env.NOEIS_MCP_JSON_RESPONSES === 'true',
  internalApiUrl = `http://127.0.0.1:${process.env.PORT || 3000}`,
  loadServer = loadMcpServer,
  Transport = StreamableHTTPServerTransport
} = {}) => {
  if (typeof authenticateAgentToken !== 'function') {
    throw new Error('authenticateAgentToken is required.');
  }

  if (typeof enableJsonResponse !== 'boolean') throw new Error('enableJsonResponse must be a boolean.');

  const router = express.Router();
  router.use((_req, res, next) => {
    setMcpHeaders(res);
    next();
  });

  router.get('/mcp/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      transport: 'streamable-http',
      authorization: 'Bearer Noeis connected-agent token required'
    });
  });

  router.options('/mcp', (_req, res) => res.sendStatus(204));

  router.post('/mcp', authenticateAgentToken, async (req, res, next) => {
    const token = getBearerToken(req);
    let server;
    try {
      const { createMcpServer } = await loadServer();
      server = createMcpServer({ token, apiUrl: internalApiUrl, appUrl, grantedScopes: req.agentToken?.scopes, accessProfile: req.agentToken?.accessProfile, resourceMetadataUrl });
      const transport = new Transport({ sessionIdGenerator: undefined, enableJsonResponse });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      next(error);
    } finally {
      if (server) {
        try { await server.close(); } catch (error) { if (!res.headersSent) next(error); }
      }
    }
  });

  router.all('/mcp', (_req, res) => {
    res.setHeader('Allow', 'OPTIONS, POST');
    res.status(405).json({ error: 'Use POST for Noeis Streamable HTTP MCP requests.' });
  });

  return router;
};

module.exports = {
  buildHostedMcpRouter
};
