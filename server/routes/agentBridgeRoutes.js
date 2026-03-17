const express = require('express');

const buildAgentBridgeRouter = ({
  authenticateToken,
  authenticateAgentBridgeToken,
  resolveAndValidateActorIdentity,
  safeBridgeTokenTtlSeconds,
  DEFAULT_BRIDGE_TOKEN_TTL_SECONDS,
  createSignedBridgeToken,
  runBridgeHandoffOperation
}) => {
  const router = express.Router();

  router.post('/api/agent/protocol/bridge/token', authenticateToken, async (req, res) => {
    try {
      const requestedActor = await resolveAndValidateActorIdentity({
        userId: req.user.id,
        actor: {
          actorType: req.body?.actorType || 'user',
          actorId: req.body?.actorId || req.user.id
        },
        fallbackType: 'user'
      });
      if (requestedActor.actorType === 'user' && !requestedActor.actorId) {
        requestedActor.actorId = String(req.user.id);
      }
      const scope = String(req.body?.scope || 'handoff_ops').trim() || 'handoff_ops';
      const ttlSeconds = safeBridgeTokenTtlSeconds(req.body?.ttlSeconds, DEFAULT_BRIDGE_TOKEN_TTL_SECONDS);
      const signed = createSignedBridgeToken({
        userId: String(req.user.id),
        actorType: requestedActor.actorType,
        actorId: requestedActor.actorId,
        scope,
        ttlSeconds
      });
      return res.status(201).json({
        bridgeToken: signed.token,
        expiresInSec: signed.ttlSeconds,
        actor: requestedActor,
        scope
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid bridge token request.' });
      }
      console.error('❌ Error creating bridge token:', error);
      return res.status(500).json({ error: 'Failed to create bridge token.' });
    }
  });

  router.get('/api/agent/protocol/bridge/manifest', authenticateAgentBridgeToken, async (req, res) => {
    try {
      return res.status(200).json({
        protocol: 'note-taker-agent-bridge-v1',
        adapter: {
          a2aPath: '/api/agent/protocol/bridge/a2a',
          mcpPath: '/api/agent/protocol/bridge/mcp'
        },
        actor: {
          actorType: req.bridgeActor.actorType,
          actorId: req.bridgeActor.actorId
        },
        scope: req.bridgeActor.scope,
        operations: ['handoffs.list', 'handoffs.create', 'handoffs.claim', 'handoffs.complete', 'handoffs.reject'],
        mcpMethods: ['handoffs/list', 'handoffs/create', 'handoffs/claim', 'handoffs/complete', 'handoffs/reject']
      });
    } catch (error) {
      console.error('❌ Error returning bridge manifest:', error);
      return res.status(500).json({ error: 'Failed to load bridge manifest.' });
    }
  });

  router.post('/api/agent/protocol/bridge/a2a', authenticateAgentBridgeToken, async (req, res) => {
    try {
      const op = String(req.body?.op || '').trim();
      if (!op) return res.status(400).json({ error: 'op is required.' });
      const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
      const result = await runBridgeHandoffOperation({
        bridgeActor: req.bridgeActor,
        op,
        payload
      });
      return res.status(200).json({ ok: true, op, result });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid A2A bridge request.' });
      }
      console.error('❌ Error executing A2A bridge operation:', error);
      return res.status(500).json({ error: 'Failed to execute A2A bridge operation.' });
    }
  });

  router.post('/api/agent/protocol/bridge/mcp', authenticateAgentBridgeToken, async (req, res) => {
    try {
      const id = req.body?.id ?? null;
      const method = String(req.body?.method || '').trim();
      const params = req.body?.params && typeof req.body.params === 'object' ? req.body.params : {};
      const methodMap = {
        'handoffs/list': 'handoffs.list',
        'handoffs/create': 'handoffs.create',
        'handoffs/claim': 'handoffs.claim',
        'handoffs/complete': 'handoffs.complete',
        'handoffs/reject': 'handoffs.reject'
      };
      const op = methodMap[method];
      if (!op) {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Method not found.' }
        });
      }
      const result = await runBridgeHandoffOperation({
        bridgeActor: req.bridgeActor,
        op,
        payload: params
      });
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(200).json({
          jsonrpc: '2.0',
          id: req.body?.id ?? null,
          error: { code: -32000, message: error.message || 'Bridge operation failed.' }
        });
      }
      console.error('❌ Error executing MCP bridge operation:', error);
      return res.status(200).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: 'Internal bridge error.' }
      });
    }
  });

  return router;
};

module.exports = {
  buildAgentBridgeRouter
};
