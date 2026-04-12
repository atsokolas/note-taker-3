const express = require('express');

const buildAgentBridgeRouter = ({
  authenticateToken,
  authenticateAgentBridgeToken,
  resolveAndValidateActorIdentity,
  safeBridgeTokenTtlSeconds,
  DEFAULT_BRIDGE_TOKEN_TTL_SECONDS,
  createSignedBridgeToken,
  runBridgeHandoffOperation,
  listAgentSkills,
  listWorkerRoles,
  listProtocolApprovals,
  listProtocolHookRuns,
  approveProtocolApproval,
  rejectProtocolApproval
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
      const scope = String(req.body?.scope || 'agent_ops').trim() || 'agent_ops';
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
        capabilities: {
          sharedSkills: true,
          sharedThreads: true,
          sharedArtifactDrafts: true,
          protocolHandoffs: true,
          supportsPlans: true,
          supportsCheckpoints: true,
          supportsThreadHandoffConversion: true,
          supportsWorkerRoles: true,
          supportsSpecialistWorkers: true
        },
        resources: {
          skillsPath: '/api/agent/protocol/bridge/skills',
          workerRolesPath: '/api/agent/protocol/bridge/worker-roles'
        },
        workerRoles: listWorkerRoles(),
        operations: [
          'threads.list',
          'threads.get',
          'threads.create',
          'threads.update',
          'threads.append_message',
          'threads.convert_to_handoff',
          'artifacts.drafts.list',
          'artifacts.drafts.create',
          'artifacts.drafts.promote',
          'artifacts.drafts.dismiss',
          'handoffs.list',
          'handoffs.create',
          'handoffs.ensure_thread',
          'handoffs.claim',
          'handoffs.complete',
          'handoffs.reject'
        ],
        mcpMethods: [
          'threads/list',
          'threads/get',
          'threads/create',
          'threads/update',
          'threads/append_message',
          'threads/convert_to_handoff',
          'artifacts/drafts/list',
          'artifacts/drafts/create',
          'artifacts/drafts/promote',
          'artifacts/drafts/dismiss',
          'handoffs/list',
          'handoffs/create',
          'handoffs/ensure_thread',
          'handoffs/claim',
          'handoffs/complete',
          'handoffs/reject'
        ],
        examples: {
          a2a: [
            {
              op: 'handoffs.claim',
              payload: {
                handoffId: 'HANDOFF_ID',
                note: 'Claimed by a BYO researcher worker after manifest role match.'
              }
            },
            {
              op: 'threads.convert_to_handoff',
              payload: {
                threadId: 'THREAD_ID',
                title: 'Escalate thread into a routed task',
                taskType: 'research'
              }
            },
            {
              op: 'handoffs.ensure_thread',
              payload: {
                handoffId: 'HANDOFF_ID'
              }
            },
            {
              op: 'artifacts.drafts.create',
              payload: {
                artifactType: 'note',
                title: 'Research Brief: THREAD_ID',
                body: '# Research Brief: THREAD_ID\\n\\n## Focus\\n...',
                sourceThreadId: 'THREAD_ID',
                skill: {
                  id: 'draft_research_brief',
                  title: 'Draft research brief',
                  outputType: 'research_brief_draft'
                }
              }
            }
          ],
          mcp: [
            {
              method: 'handoffs/claim',
              params: {
                handoffId: 'HANDOFF_ID'
              }
            },
            {
              method: 'threads/convert_to_handoff',
              params: {
                threadId: 'THREAD_ID',
                taskType: 'research'
              }
            },
            {
              method: 'handoffs/ensure_thread',
              params: {
                handoffId: 'HANDOFF_ID'
              }
            },
            {
              method: 'artifacts/drafts/promote',
              params: {
                draftId: 'DRAFT_ID'
              }
            }
          ]
        }
      });
    } catch (error) {
      console.error('❌ Error returning bridge manifest:', error);
      return res.status(500).json({ error: 'Failed to load bridge manifest.' });
    }
  });

  router.get('/api/agent/protocol/skills', authenticateToken, async (req, res) => {
    try {
      const skills = listAgentSkills({
        surface: req.query?.surface,
        contextType: req.query?.contextType,
        category: req.query?.category
      });
      return res.status(200).json({ skills });
    } catch (error) {
      console.error('❌ Error listing agent skills:', error);
      return res.status(500).json({ error: 'Failed to list agent skills.' });
    }
  });

  router.get('/api/agent/protocol/bridge/skills', authenticateAgentBridgeToken, async (req, res) => {
    try {
      const skills = listAgentSkills({
        surface: req.query?.surface,
        contextType: req.query?.contextType,
        category: req.query?.category
      });
      return res.status(200).json({
        skills,
        actor: {
          actorType: req.bridgeActor.actorType,
          actorId: req.bridgeActor.actorId
        },
        scope: req.bridgeActor.scope
      });
    } catch (error) {
      console.error('❌ Error listing bridge agent skills:', error);
      return res.status(500).json({ error: 'Failed to list bridge agent skills.' });
    }
  });

  router.get('/api/agent/protocol/bridge/worker-roles', authenticateAgentBridgeToken, async (req, res) => {
    try {
      return res.status(200).json({
        workerRoles: listWorkerRoles(),
        actor: {
          actorType: req.bridgeActor.actorType,
          actorId: req.bridgeActor.actorId
        },
        scope: req.bridgeActor.scope
      });
    } catch (error) {
      console.error('❌ Error listing bridge worker roles:', error);
      return res.status(500).json({ error: 'Failed to list bridge worker roles.' });
    }
  });

  router.get('/api/agent/protocol/approvals', authenticateToken, async (req, res) => {
    try {
      const approvals = await listProtocolApprovals({
        userId: String(req.user.id),
        status: String(req.query.status || 'pending').trim(),
        limit: Number(req.query.limit || 30),
        threadId: String(req.query.threadId || '').trim(),
        handoffId: String(req.query.handoffId || '').trim(),
        op: String(req.query.op || '').trim()
      });
      return res.status(200).json({ approvals });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid protocol approvals request.' });
      }
      console.error('❌ Error listing protocol approvals:', error);
      return res.status(500).json({ error: 'Failed to list protocol approvals.' });
    }
  });

  router.get('/api/agent/protocol/hooks', authenticateToken, async (req, res) => {
    try {
      const hookRuns = await listProtocolHookRuns({
        userId: String(req.user.id),
        phase: String(req.query.phase || '').trim(),
        op: String(req.query.op || '').trim(),
        threadId: String(req.query.threadId || '').trim(),
        handoffId: String(req.query.handoffId || '').trim(),
        limit: Number(req.query.limit || 30)
      });
      return res.status(200).json({ hookRuns });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid protocol hook request.' });
      }
      console.error('❌ Error listing protocol hook runs:', error);
      return res.status(500).json({ error: 'Failed to list protocol hook runs.' });
    }
  });

  router.post('/api/agent/protocol/approvals/:approvalId/approve', authenticateToken, async (req, res) => {
    try {
      const result = await approveProtocolApproval({
        userId: String(req.user.id),
        approvalId: String(req.params.approvalId || '').trim(),
        actorType: req.body?.actorType || 'user',
        actorId: String(req.body?.actorId || req.user.id || '').trim()
      });
      return res.status(200).json(result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to approve protocol action.' });
      }
      console.error('❌ Error approving protocol action:', error);
      return res.status(500).json({ error: 'Failed to approve protocol action.' });
    }
  });

  router.post('/api/agent/protocol/approvals/:approvalId/reject', authenticateToken, async (req, res) => {
    try {
      const approval = await rejectProtocolApproval({
        userId: String(req.user.id),
        approvalId: String(req.params.approvalId || '').trim(),
        actorType: req.body?.actorType || 'user',
        actorId: String(req.body?.actorId || req.user.id || '').trim()
      });
      return res.status(200).json({ approval });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to reject protocol action.' });
      }
      console.error('❌ Error rejecting protocol action:', error);
      return res.status(500).json({ error: 'Failed to reject protocol action.' });
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
        'threads/list': 'threads.list',
        'threads/get': 'threads.get',
        'threads/create': 'threads.create',
        'threads/update': 'threads.update',
        'threads/append_message': 'threads.append_message',
        'threads/convert_to_handoff': 'threads.convert_to_handoff',
        'artifacts/drafts/list': 'artifacts.drafts.list',
        'artifacts/drafts/create': 'artifacts.drafts.create',
        'artifacts/drafts/promote': 'artifacts.drafts.promote',
        'artifacts/drafts/dismiss': 'artifacts.drafts.dismiss',
        'handoffs/list': 'handoffs.list',
        'handoffs/create': 'handoffs.create',
        'handoffs/ensure_thread': 'handoffs.ensure_thread',
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
