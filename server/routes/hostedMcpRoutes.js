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
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
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
  loadServer = loadMcpServer,
  Transport = StreamableHTTPServerTransport
} = {}) => {
  if (typeof authenticateAgentToken !== 'function') {
    throw new Error('authenticateAgentToken is required.');
  }

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
    try {
      const { createMcpServer } = await loadServer();
      const server = createMcpServer({ token });
      const transport = new Transport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      await server.close();
    } catch (error) {
      next(error);
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
