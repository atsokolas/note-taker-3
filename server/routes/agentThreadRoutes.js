const express = require('express');

const buildAgentThreadRouter = ({
  mongoose,
  authenticateToken,
  authenticatePersonalAgentKey,
  AgentThread,
  AgentHandoff,
  normalizePersonalAgentCapabilities,
  normalizeThreadScope,
  normalizeThreadStatus,
  normalizeThreadPlan,
  normalizeThreadCheckpoint,
  normalizeThreadPlanner,
  normalizeThreadMessage,
  sanitizeAgentThreadDoc,
  appendThreadMessage,
  compactThreadState,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority,
  resolveAndValidateActorIdentity,
  getUserAgentProtocolPolicy,
  resolveAutoHandoffRequestedActor,
  shouldRequireProtocolApproval,
  requestProtocolApproval,
  triggerProtocolHookPhase,
  sanitizeAgentHandoffDoc,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  buildAgentPlanner,
  truncate
}) => {
  const router = express.Router();

  const buildActorFromUser = (userId) => ({
    actorType: 'user',
    actorId: String(userId || '').trim()
  });

  const buildActorFromPersonalAgent = (personalAgent = {}) => ({
    actorType: 'byo_agent',
    actorId: String(personalAgent.id || personalAgent._id || '').trim()
  });

  const buildListQuery = ({ userId, query = {} }) => {
    const output = { userId };
    const status = String(query.status || 'active').trim().toLowerCase();
    if (status !== 'all') output.status = normalizeThreadStatus(status, 'active');
    const scopeType = String(query.scopeType || '').trim().toLowerCase();
    const scopeId = String(query.scopeId || '').trim();
    const handoffId = String(query.handoffId || '').trim();
    if (scopeType) output['scope.type'] = scopeType;
    if (scopeId) output['scope.id'] = scopeId;
    if (handoffId && mongoose.Types.ObjectId.isValid(handoffId)) output.handoffId = handoffId;
    return output;
  };

  const listThreads = async (req, res, actor) => {
    const query = buildListQuery({ userId: req.user?.id || req.personalAgent?.userId, query: req.query || {} });
    const limitRaw = Number(req.query?.limit || 40);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(80, Math.trunc(limitRaw))) : 40;
    const rows = await AgentThread.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
    return res.status(200).json({
      threads: rows.map(sanitizeAgentThreadDoc),
      actor
    });
  };

  const createThread = async (req, res, actor) => {
    const ownerId = req.user?.id || req.personalAgent?.userId;
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const queuedApproval = await maybeQueueProtocolApproval({
      ownerId,
      actor,
      op: 'threads.create',
      payload
    });
    if (queuedApproval) return res.status(202).json(queuedApproval);
    const beforeHookRun = await runHookPhase({ ownerId, actor, phase: 'before', op: 'threads.create', payload });
    const scope = normalizeThreadScope(payload.scope || {});
    const title = String(payload.title || '').trim()
      || truncate(scope.title || payload?.initialMessage?.text || 'Agent thread', 120);
    const handoffId = String(payload.handoffId || '').trim();
    const planner = payload.planner && typeof payload.planner === 'object'
      ? normalizeThreadPlanner(payload.planner)
      : buildAgentPlanner({
          taskType: scope?.metadata?.taskType || 'custom',
          requestedActor: actor
        });
    const created = await AgentThread.create({
      userId: ownerId,
      title,
      status: normalizeThreadStatus(payload.status, 'active'),
      summary: String(payload.summary || '').trim().slice(0, 280),
      scope,
      handoffId: mongoose.Types.ObjectId.isValid(handoffId) ? handoffId : null,
      createdBy: actor,
      lastActor: actor,
      planner,
      plan: normalizeThreadPlan(payload.plan || {}),
      checkpoint: payload.checkpoint ? normalizeThreadCheckpoint(payload.checkpoint) : undefined,
      messages: []
    });
    if (payload.initialMessage) {
      appendThreadMessage(created, {
        ...normalizeThreadMessage(payload.initialMessage, 'user'),
        actor
      });
      compactThreadState(created, { actor });
      await created.save();
    }
    const result = { thread: sanitizeAgentThreadDoc(created) };
    const afterHookRun = await runHookPhase({ ownerId, actor, phase: 'after', op: 'threads.create', payload, result });
    const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
    return res.status(201).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
  };

  const getThreadDoc = async (ownerId, threadId) => {
    if (!mongoose.Types.ObjectId.isValid(threadId)) return null;
    return AgentThread.findOne({ _id: threadId, userId: ownerId });
  };

  const maybeQueueProtocolApproval = async ({
    ownerId,
    actor,
    op,
    payload = {}
  }) => {
    const policy = await getUserAgentProtocolPolicy(String(ownerId));
    const approvalPolicy = shouldRequireProtocolApproval({
      op,
      actor,
      source: 'native',
      policy
    });
    if (!approvalPolicy.requiresApproval) return null;
    const approval = await requestProtocolApproval({
      userId: ownerId,
      scope: 'agent_ops',
      op,
      payload,
      reason: approvalPolicy.reason,
      requestedBy: actor
    });
    return {
      status: 'approval_required',
      reason: approvalPolicy.reason,
      approval
    };
  };

  const runHookPhase = async ({
    ownerId,
    actor,
    phase = 'before',
    op,
    payload = {},
    result = {}
  }) => triggerProtocolHookPhase({
    userId: ownerId,
    actor,
    source: 'native',
    phase,
    scope: 'agent_ops',
    op,
    payload,
    result
  });

  const resolveRequestedActor = async ({ ownerId, payload = {}, taskType = 'custom' }) => {
    const autoRoute = payload.autoRoute !== false;
    if (autoRoute) {
      const policy = await getUserAgentProtocolPolicy(String(ownerId));
      const routingPlan = await resolveAutoHandoffRequestedActor({
        userId: String(ownerId),
        taskType,
        policy
      });
      return {
        requestedActor: routingPlan.requestedActor,
        planner: routingPlan.planner
      };
    }
    const requestedActor = await resolveAndValidateActorIdentity({
      userId: ownerId,
      actor: payload.requestedActor || {
        actorType: payload.requestedActorType || 'native_agent',
        actorId: payload.requestedActorId || ''
      },
      fallbackType: 'native_agent'
    });
    return {
      requestedActor,
      planner: null
    };
  };

  const convertThreadToHandoff = async (req, res, actor) => {
    const ownerId = req.user?.id || req.personalAgent?.userId;
    const thread = await getThreadDoc(ownerId, String(req.params.threadId || '').trim());
    if (!thread) return res.status(404).json({ error: 'Thread not found.' });

    if (thread.handoffId && mongoose.Types.ObjectId.isValid(String(thread.handoffId))) {
      const existing = await AgentHandoff.findOne({ _id: thread.handoffId, userId: ownerId });
      if (existing) {
        return res.status(200).json({
          thread: sanitizeAgentThreadDoc(thread),
          handoff: sanitizeAgentHandoffDoc(existing),
          reused: true
        });
      }
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const queuedApproval = await maybeQueueProtocolApproval({
      ownerId,
      actor,
      op: 'threads.convert_to_handoff',
      payload: {
        ...payload,
        threadId: String(thread._id)
      }
    });
    if (queuedApproval) return res.status(202).json(queuedApproval);
    const hookPayload = {
      ...payload,
      threadId: String(thread._id)
    };
    const beforeHookRun = await runHookPhase({
      ownerId,
      actor,
      phase: 'before',
      op: 'threads.convert_to_handoff',
      payload: hookPayload
    });
    const taskType = normalizeAgentHandoffTaskType(payload.taskType || thread?.scope?.metadata?.taskType || 'custom', 'custom');
    const priority = normalizeAgentHandoffPriority(payload.priority || 'normal', 'normal');
    const title = String(payload.title || thread.title || thread?.scope?.title || 'Thread handoff').trim().slice(0, 200);
    const objective = String(
      payload.objective
      || thread?.checkpoint?.summary
      || thread?.summary
      || thread?.plan?.objective
      || thread.title
      || ''
    ).trim().slice(0, 4000);
    const { requestedActor, planner } = await resolveRequestedActor({ ownerId, payload, taskType });
    const plan = normalizeThreadPlan(
      Array.isArray(thread?.plan?.steps) && thread.plan.steps.length > 0
        ? thread.plan
        : buildDefaultHandoffPlan({ taskType, title, objective })
    );
    const checkpoint = thread?.checkpoint
      ? normalizeThreadCheckpoint({
          ...(thread.checkpoint || {}),
          updatedBy: actor
        })
      : buildDefaultHandoffCheckpoint({ title, requestedActor });
    const handoffPlanner = normalizeThreadPlanner(
      payload.planner
      || planner
      || thread?.planner
      || buildAgentPlanner({ taskType, requestedActor, routePlanner: planner })
    );

    const handoff = await AgentHandoff.create({
      userId: ownerId,
      title,
      taskType,
      objective,
      status: 'pending',
      priority,
      context: {
        ...(payload.context && typeof payload.context === 'object' ? payload.context : {}),
        sourceThread: {
          threadId: String(thread._id),
          scope: normalizeThreadScope(thread.scope || {}),
          summary: String(thread.summary || '').trim().slice(0, 280)
        }
      },
      input: {
        ...(payload.input && typeof payload.input === 'object' ? payload.input : {}),
        threadCheckpoint: checkpoint,
        threadPlan: plan
      },
      output: {},
      threadId: thread._id,
      planner: handoffPlanner,
      plan,
      checkpoint,
      requestedActor,
      createdBy: actor,
      events: [{
        eventType: 'created',
        actor,
        note: 'Converted from shared thread.',
        payload: {
          sourceThreadId: String(thread._id),
          requestedActor,
          planner: handoffPlanner
        }
      }]
    });

    thread.handoffId = handoff._id;
    thread.planner = handoffPlanner;
    appendThreadMessage(thread, {
      role: 'system',
      text: `Converted to handoff "${title}".`,
      actor,
      metadata: {
        eventType: 'handoff_created',
        handoffId: String(handoff._id),
        planner: handoffPlanner
      }
    });
    thread.checkpoint = normalizeThreadCheckpoint({
      summary: checkpoint.summary || thread.summary || `Linked to handoff "${title}".`,
      openQuestions: Array.isArray(checkpoint.openQuestions) ? checkpoint.openQuestions : [],
      nextActions: [`Open the linked handoff "${title}".`],
      updatedBy: actor
    });
    await thread.save();

    const result = {
      thread: sanitizeAgentThreadDoc(thread),
      handoff: sanitizeAgentHandoffDoc(handoff),
      planner
    };
    const afterHookRun = await runHookPhase({
      ownerId,
      actor,
      phase: 'after',
      op: 'threads.convert_to_handoff',
      payload: hookPayload,
      result
    });
    const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
    return res.status(201).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
  };

  const updateThread = async (req, res, actor) => {
    const ownerId = req.user?.id || req.personalAgent?.userId;
    const thread = await getThreadDoc(ownerId, String(req.params.threadId || '').trim());
    if (!thread) return res.status(404).json({ error: 'Thread not found.' });
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const queuedApproval = await maybeQueueProtocolApproval({
      ownerId,
      actor,
      op: 'threads.update',
      payload: {
        ...payload,
        threadId: String(thread._id)
      }
    });
    if (queuedApproval) return res.status(202).json(queuedApproval);
    const hookPayload = {
      ...payload,
      threadId: String(thread._id)
    };
    const beforeHookRun = await runHookPhase({
      ownerId,
      actor,
      phase: 'before',
      op: 'threads.update',
      payload: hookPayload
    });
    if (payload.title !== undefined) thread.title = String(payload.title || '').trim().slice(0, 200);
    if (payload.status !== undefined) thread.status = normalizeThreadStatus(payload.status, thread.status || 'active');
    if (payload.summary !== undefined) thread.summary = String(payload.summary || '').trim().slice(0, 280);
    if (payload.plan !== undefined) thread.plan = normalizeThreadPlan(payload.plan || {});
    if (payload.planner !== undefined) thread.planner = payload.planner ? normalizeThreadPlanner(payload.planner) : undefined;
    if (payload.checkpoint !== undefined) {
      thread.checkpoint = payload.checkpoint ? normalizeThreadCheckpoint({
        ...(payload.checkpoint || {}),
        updatedBy: actor
      }) : undefined;
    }
    thread.lastActor = actor;
    await thread.save();
    const result = { thread: sanitizeAgentThreadDoc(thread) };
    const afterHookRun = await runHookPhase({
      ownerId,
      actor,
      phase: 'after',
      op: 'threads.update',
      payload: hookPayload,
      result
    });
    const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
    return res.status(200).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
  };

  const appendMessageToThread = async (req, res, actor) => {
    const thread = await getThreadDoc(req.user?.id || req.personalAgent?.userId, String(req.params.threadId || '').trim());
    if (!thread) return res.status(404).json({ error: 'Thread not found.' });
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const message = normalizeThreadMessage(payload.message || {}, payload.message?.role || 'assistant');
    appendThreadMessage(thread, {
      ...message,
      actor: message.role === 'assistant' ? actor : message.actor.actorId ? message.actor : actor
    });
    if (payload.checkpoint !== undefined) {
      thread.checkpoint = payload.checkpoint ? normalizeThreadCheckpoint({
        ...(payload.checkpoint || {}),
        updatedBy: actor
      }) : undefined;
    }
    if (payload.plan !== undefined) {
      thread.plan = normalizeThreadPlan(payload.plan || {});
    }
    if (payload.planner !== undefined) {
      thread.planner = payload.planner ? normalizeThreadPlanner(payload.planner) : thread.planner;
    }
    compactThreadState(thread, { actor });
    await thread.save();
    return res.status(200).json({ thread: sanitizeAgentThreadDoc(thread) });
  };

  router.get('/api/agent/threads', authenticateToken, async (req, res) => {
    try {
      return await listThreads(req, res, buildActorFromUser(req.user.id));
    } catch (error) {
      console.error('❌ Error listing agent threads:', error);
      return res.status(500).json({ error: 'Failed to list agent threads.' });
    }
  });

  router.post('/api/agent/threads', authenticateToken, async (req, res) => {
    try {
      return await createThread(req, res, buildActorFromUser(req.user.id));
    } catch (error) {
      console.error('❌ Error creating agent thread:', error);
      return res.status(500).json({ error: 'Failed to create agent thread.' });
    }
  });

  router.get('/api/agent/threads/:threadId', authenticateToken, async (req, res) => {
    try {
      const thread = await getThreadDoc(req.user.id, String(req.params.threadId || '').trim());
      if (!thread) return res.status(404).json({ error: 'Thread not found.' });
      return res.status(200).json({ thread: sanitizeAgentThreadDoc(thread) });
    } catch (error) {
      console.error('❌ Error loading agent thread:', error);
      return res.status(500).json({ error: 'Failed to load agent thread.' });
    }
  });

  router.patch('/api/agent/threads/:threadId', authenticateToken, async (req, res) => {
    try {
      return await updateThread(req, res, buildActorFromUser(req.user.id));
    } catch (error) {
      console.error('❌ Error updating agent thread:', error);
      return res.status(500).json({ error: 'Failed to update agent thread.' });
    }
  });

  router.post('/api/agent/threads/:threadId/messages', authenticateToken, async (req, res) => {
    try {
      return await appendMessageToThread(req, res, buildActorFromUser(req.user.id));
    } catch (error) {
      console.error('❌ Error appending agent thread message:', error);
      return res.status(500).json({ error: 'Failed to append agent thread message.' });
    }
  });

  router.post('/api/agent/threads/:threadId/convert-to-handoff', authenticateToken, async (req, res) => {
    try {
      return await convertThreadToHandoff(req, res, buildActorFromUser(req.user.id));
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to convert thread to handoff.' });
      }
      console.error('❌ Error converting agent thread to handoff:', error);
      return res.status(500).json({ error: 'Failed to convert thread to handoff.' });
    }
  });

  router.get('/api/agent/byo/threads', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {});
      if (!capabilities.read) {
        return res.status(403).json({ error: 'This personal agent cannot read shared threads.' });
      }
      return await listThreads(req, res, buildActorFromPersonalAgent(req.personalAgent));
    } catch (error) {
      console.error('❌ Error listing BYO agent threads:', error);
      return res.status(500).json({ error: 'Failed to list shared threads.' });
    }
  });

  router.post('/api/agent/byo/threads', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {});
      if (!capabilities.proposeChanges) {
        return res.status(403).json({ error: 'This personal agent cannot create shared threads.' });
      }
      return await createThread(req, res, buildActorFromPersonalAgent(req.personalAgent));
    } catch (error) {
      console.error('❌ Error creating BYO agent thread:', error);
      return res.status(500).json({ error: 'Failed to create shared thread.' });
    }
  });

  router.get('/api/agent/byo/threads/:threadId', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {});
      if (!capabilities.read) {
        return res.status(403).json({ error: 'This personal agent cannot read shared threads.' });
      }
      const thread = await getThreadDoc(req.personalAgent.userId, String(req.params.threadId || '').trim());
      if (!thread) return res.status(404).json({ error: 'Thread not found.' });
      return res.status(200).json({ thread: sanitizeAgentThreadDoc(thread) });
    } catch (error) {
      console.error('❌ Error loading BYO agent thread:', error);
      return res.status(500).json({ error: 'Failed to load shared thread.' });
    }
  });

  router.patch('/api/agent/byo/threads/:threadId', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {});
      if (!capabilities.proposeChanges) {
        return res.status(403).json({ error: 'This personal agent cannot update shared threads.' });
      }
      return await updateThread(req, res, buildActorFromPersonalAgent(req.personalAgent));
    } catch (error) {
      console.error('❌ Error updating BYO agent thread:', error);
      return res.status(500).json({ error: 'Failed to update shared thread.' });
    }
  });

  router.post('/api/agent/byo/threads/:threadId/messages', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {});
      if (!capabilities.proposeChanges) {
        return res.status(403).json({ error: 'This personal agent cannot append shared thread messages.' });
      }
      return await appendMessageToThread(req, res, buildActorFromPersonalAgent(req.personalAgent));
    } catch (error) {
      console.error('❌ Error appending BYO agent thread message:', error);
      return res.status(500).json({ error: 'Failed to append shared thread message.' });
    }
  });

  router.post('/api/agent/byo/threads/:threadId/convert-to-handoff', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {});
      if (!capabilities.proposeChanges) {
        return res.status(403).json({ error: 'This personal agent cannot convert shared threads to handoffs.' });
      }
      return await convertThreadToHandoff(req, res, buildActorFromPersonalAgent(req.personalAgent));
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to convert shared thread to handoff.' });
      }
      console.error('❌ Error converting BYO thread to handoff:', error);
      return res.status(500).json({ error: 'Failed to convert shared thread to handoff.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentThreadRouter
};
