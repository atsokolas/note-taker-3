const express = require('express');

const buildAgentHandoffRouter = ({
  mongoose,
  authenticateToken,
  authenticatePersonalAgentKey,
  normalizeHandoffPayload,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority,
  parseOptionalDate,
  resolveAndValidateActorIdentity,
  AgentHandoff,
  AgentThread,
  sanitizeAgentHandoffDoc,
  sanitizeAgentThreadDoc,
  AGENT_HANDOFF_STATUSES,
  AGENT_HANDOFF_TASK_TYPES,
  normalizeAgentActorType,
  safeAgentHandoffLimit,
  getUserAgentProtocolPolicy,
  resolveAutoHandoffRequestedActor,
  shouldRequireProtocolApproval,
  requestProtocolApproval,
  triggerProtocolHookPhase,
  canActorMutateClaimedHandoff,
  canActorClaimHandoff,
  appendHandoffEvent,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  buildAgentPlanner,
  createThreadForHandoff,
  normalizeThreadCheckpoint,
  appendThreadMessage
}) => {
  const router = express.Router();

  const syncThreadForHandoff = async (handoff, {
    actor,
    text,
    checkpoint,
    archive = false,
    metadata = {}
  } = {}) => {
    if (!handoff?.threadId) return;
    const thread = await AgentThread.findOne({ _id: handoff.threadId, userId: handoff.userId });
    if (!thread) return;
    if (text) {
      appendThreadMessage(thread, {
        role: 'assistant',
        text,
        actor,
        metadata
      });
    }
    if (checkpoint !== undefined) {
      thread.checkpoint = checkpoint ? normalizeThreadCheckpoint(checkpoint) : undefined;
    }
    if (archive) thread.status = 'archived';
    await thread.save();
  };

  const ensureThreadForHandoff = async ({
    handoff,
    actor
  }) => {
    if (!handoff) return null;
    if (handoff.threadId && mongoose.Types.ObjectId.isValid(String(handoff.threadId))) {
      const existingThread = await AgentThread.findOne({ _id: handoff.threadId, userId: handoff.userId });
      if (existingThread) return existingThread;
    }
    const thread = await createThreadForHandoff({
      userId: handoff.userId,
      title: handoff.title || 'Handoff thread',
      objective: handoff.objective || handoff.checkpoint?.summary || '',
      taskType: handoff.taskType || 'custom',
      requestedActor: handoff.requestedActor || {},
      planner: handoff.planner || buildAgentPlanner({
        taskType: handoff.taskType || 'custom',
        requestedActor: handoff.requestedActor || {}
      }),
      createdBy: actor || handoff.createdBy || { actorType: 'user', actorId: String(handoff.userId || '') },
      handoffId: handoff._id
    });
    if (handoff.plan) thread.plan = handoff.plan;
    if (handoff.planner) thread.planner = handoff.planner;
    if (handoff.checkpoint) {
      thread.checkpoint = normalizeThreadCheckpoint({
        ...(handoff.checkpoint || {}),
        updatedBy: actor || handoff.createdBy || { actorType: 'user', actorId: String(handoff.userId || '') }
      });
    }
    await thread.save();
    handoff.threadId = thread._id;
    appendHandoffEvent(handoff, {
      eventType: 'note',
      actor: actor || handoff.createdBy || { actorType: 'user', actorId: String(handoff.userId || '') },
      note: 'Continued in linked thread.'
    });
    await handoff.save();
    return thread;
  };

  const maybeQueueProtocolApproval = async ({
    userId,
    actor,
    op,
    payload = {}
  }) => {
    const policy = await getUserAgentProtocolPolicy(String(userId));
    const approvalPolicy = shouldRequireProtocolApproval({
      op,
      actor,
      source: 'native',
      policy
    });
    if (!approvalPolicy.requiresApproval) return null;
    const approval = await requestProtocolApproval({
      userId,
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
    userId,
    actor,
    phase = 'before',
    op,
    payload = {},
    result = {}
  }) => triggerProtocolHookPhase({
    userId,
    actor,
    source: 'native',
    phase,
    scope: 'agent_ops',
    op,
    payload,
    result
  });

  router.post('/api/agent/protocol/handoffs', authenticateToken, async (req, res) => {
    try {
      const payload = normalizeHandoffPayload(req.body || {});
      const title = String(payload.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required.' });

      const taskType = normalizeAgentHandoffTaskType(payload.taskType, 'custom');
      const priority = normalizeAgentHandoffPriority(payload.priority, 'normal');
      const objective = String(payload.objective || '').trim().slice(0, 4000);
      const dueAt = parseOptionalDate(payload.dueAt);
      if (payload.dueAt && !dueAt) return res.status(400).json({ error: 'dueAt must be a valid date when provided.' });

      const createdBy = await resolveAndValidateActorIdentity({
        userId: req.user.id,
        actor: {
          actorType: payload.createdBy?.actorType || payload.actorType || 'user',
          actorId: payload.createdBy?.actorId || payload.actorId || req.user.id
        },
        fallbackType: 'user'
      });
      if (createdBy.actorType === 'user' && !createdBy.actorId) createdBy.actorId = String(req.user.id);

      const requestedActor = await resolveAndValidateActorIdentity({
        userId: req.user.id,
        actor: payload.requestedActor || {
          actorType: payload.requestedActorType || 'native_agent',
          actorId: payload.requestedActorId || ''
        },
        fallbackType: 'native_agent'
      });
      if (requestedActor.actorType === 'user' && !requestedActor.actorId) requestedActor.actorId = String(req.user.id);

      const queuedApproval = await maybeQueueProtocolApproval({
        userId: req.user.id,
        actor: createdBy,
        op: 'handoffs.create',
        payload: {
          ...payload,
          requestedActor
        }
      });
      if (queuedApproval) return res.status(202).json(queuedApproval);
      const hookPayload = {
        ...payload,
        requestedActor
      };
      const beforeHookRun = await runHookPhase({
        userId: req.user.id,
        actor: createdBy,
        phase: 'before',
        op: 'handoffs.create',
        payload: hookPayload
      });

      const plan = buildDefaultHandoffPlan({ taskType, title, objective });
      const checkpoint = buildDefaultHandoffCheckpoint({ title, requestedActor });
      const planner = buildAgentPlanner({ taskType, requestedActor });
      const handoff = await AgentHandoff.create({
        userId: req.user.id,
        title: title.slice(0, 200),
        taskType,
        objective,
        status: 'pending',
        priority,
        context: payload.context && typeof payload.context === 'object' ? payload.context : {},
        input: payload.input && typeof payload.input === 'object' ? payload.input : {},
        output: {},
        planner,
        plan,
        checkpoint,
        requestedActor,
        createdBy,
        dueAt,
        events: [{
          eventType: 'created',
          actor: createdBy,
          note: '',
          payload: { taskType, priority, requestedActor, planner }
        }]
      });
      const thread = await createThreadForHandoff({
        userId: req.user.id,
        title,
        objective,
        taskType,
        requestedActor,
        planner,
        createdBy,
        handoffId: handoff._id
      });
      handoff.threadId = thread._id;
      await handoff.save();

      const result = { handoff: sanitizeAgentHandoffDoc(handoff) };
      const afterHookRun = await runHookPhase({
        userId: req.user.id,
        actor: createdBy,
        phase: 'after',
        op: 'handoffs.create',
        payload: hookPayload,
        result
      });
      const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
      return res.status(201).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid handoff request.' });
      }
      console.error('❌ Error creating agent handoff:', error);
      return res.status(500).json({ error: 'Failed to create agent handoff.' });
    }
  });

  router.get('/api/agent/protocol/handoffs', authenticateToken, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const status = String(req.query.status || 'all').trim().toLowerCase();
      if (status !== 'all') {
        if (!AGENT_HANDOFF_STATUSES.has(status)) {
          return res.status(400).json({ error: 'status must be one of pending, claimed, completed, rejected, cancelled, all.' });
        }
        query.status = status;
      }

      const taskType = String(req.query.taskType || '').trim().toLowerCase();
      if (taskType) {
        if (!AGENT_HANDOFF_TASK_TYPES.has(taskType)) {
          return res.status(400).json({ error: 'taskType must be one of research, synthesis, restructure, qa, custom.' });
        }
        query.taskType = taskType;
      }

      const requestedActorType = String(req.query.requestedActorType || '').trim().toLowerCase();
      const requestedActorId = String(req.query.requestedActorId || '').trim();
      if (requestedActorType) query['requestedActor.actorType'] = normalizeAgentActorType(requestedActorType, '');
      if (requestedActorId) query['requestedActor.actorId'] = requestedActorId;

      const mine = String(req.query.mine || '').trim().toLowerCase() === 'true';
      if (mine) {
        const actor = await resolveAndValidateActorIdentity({
          userId: req.user.id,
          actor: {
            actorType: req.query.actorType || 'user',
            actorId: req.query.actorId || req.user.id
          },
          fallbackType: 'user'
        });
        if (actor.actorId) {
          query.$or = [
            { 'requestedActor.actorType': actor.actorType, 'requestedActor.actorId': actor.actorId },
            { 'claimedBy.actorType': actor.actorType, 'claimedBy.actorId': actor.actorId },
            { 'createdBy.actorType': actor.actorType, 'createdBy.actorId': actor.actorId }
          ];
        } else {
          query.$or = [
            { 'requestedActor.actorType': actor.actorType },
            { 'claimedBy.actorType': actor.actorType },
            { 'createdBy.actorType': actor.actorType }
          ];
        }
      }

      const limit = safeAgentHandoffLimit(req.query.limit, 40);
      const rows = await AgentHandoff.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
      return res.status(200).json({ handoffs: rows.map(sanitizeAgentHandoffDoc) });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid handoff query.' });
      }
      console.error('❌ Error listing agent handoffs:', error);
      return res.status(500).json({ error: 'Failed to list agent handoffs.' });
    }
  });

  router.post('/api/agent/protocol/handoffs/auto', authenticateToken, async (req, res) => {
    try {
      const payload = normalizeHandoffPayload(req.body || {});
      const title = String(payload.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required.' });
      const taskType = normalizeAgentHandoffTaskType(payload.taskType, 'custom');
      const priority = normalizeAgentHandoffPriority(payload.priority, 'normal');
      const objective = String(payload.objective || '').trim().slice(0, 4000);
      const dueAt = parseOptionalDate(payload.dueAt);
      if (payload.dueAt && !dueAt) return res.status(400).json({ error: 'dueAt must be a valid date when provided.' });

      const policy = await getUserAgentProtocolPolicy(String(req.user.id));
      const routingPlan = await resolveAutoHandoffRequestedActor({
        userId: String(req.user.id),
        taskType,
        policy,
        workerRole: payload?.planner?.activeWorkerRole || ''
      });

      const createdBy = { actorType: 'user', actorId: String(req.user.id) };
      const threadPlan = buildDefaultHandoffPlan({ taskType, title, objective });
      const checkpoint = buildDefaultHandoffCheckpoint({ title, requestedActor: routingPlan.requestedActor });
      const planner = buildAgentPlanner({
        taskType,
        requestedActor: routingPlan.requestedActor,
        routePlanner: routingPlan.planner
      });
      const handoff = await AgentHandoff.create({
        userId: req.user.id,
        title: title.slice(0, 200),
        taskType,
        objective,
        status: 'pending',
        priority,
        context: payload.context && typeof payload.context === 'object' ? payload.context : {},
        input: payload.input && typeof payload.input === 'object' ? payload.input : {},
        output: {},
        planner,
        plan: threadPlan,
        checkpoint,
        requestedActor: routingPlan.requestedActor,
        createdBy,
        dueAt,
        events: [{
          eventType: 'created',
          actor: createdBy,
          note: '',
          payload: { taskType, priority, requestedActor: routingPlan.requestedActor, planner }
        }]
      });
      const thread = await createThreadForHandoff({
        userId: req.user.id,
        title,
        objective,
        taskType,
        requestedActor: routingPlan.requestedActor,
        planner,
        createdBy,
        handoffId: handoff._id
      });
      handoff.threadId = thread._id;
      await handoff.save();

      return res.status(201).json({
        handoff: sanitizeAgentHandoffDoc(handoff),
        planner,
        policy
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid auto handoff request.' });
      }
      console.error('❌ Error creating auto-routed handoff:', error);
      return res.status(500).json({ error: 'Failed to create auto-routed handoff.' });
    }
  });

  router.post('/api/agent/protocol/handoffs/:handoffId/claim', authenticateToken, async (req, res) => {
    try {
      const handoffId = String(req.params.handoffId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(handoffId)) return res.status(400).json({ error: 'Invalid handoff id.' });

      const actor = await resolveAndValidateActorIdentity({
        userId: req.user.id,
        actor: {
          actorType: req.body?.actorType || req.body?.actor?.actorType || 'user',
          actorId: req.body?.actorId || req.body?.actor?.actorId || req.user.id
        },
        fallbackType: 'user'
      });
      if (actor.actorType === 'user' && !actor.actorId) actor.actorId = String(req.user.id);

      const handoff = await AgentHandoff.findOne({ _id: handoffId, userId: req.user.id });
      if (!handoff) return res.status(404).json({ error: 'Handoff not found.' });

      if (handoff.status === 'claimed') {
        if (canActorMutateClaimedHandoff(handoff, actor)) {
          return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
        }
        return res.status(409).json({ error: 'Handoff is already claimed by a different actor.' });
      }
      if (handoff.status !== 'pending') {
        return res.status(400).json({ error: `Handoff is ${handoff.status || 'not pending'} and cannot be claimed.` });
      }
      if (!canActorClaimHandoff(handoff, actor)) {
        return res.status(403).json({ error: 'This actor is not allowed to claim this handoff.' });
      }

      const queuedApproval = await maybeQueueProtocolApproval({
        userId: req.user.id,
        actor,
        op: 'handoffs.claim',
        payload: {
          handoffId: String(handoff._id),
          note: String(req.body?.note || '').trim()
        }
      });
      if (queuedApproval) return res.status(202).json(queuedApproval);
      const hookPayload = {
        handoffId: String(handoff._id),
        note: String(req.body?.note || '').trim()
      };
      const beforeHookRun = await runHookPhase({
        userId: req.user.id,
        actor,
        phase: 'before',
        op: 'handoffs.claim',
        payload: hookPayload
      });

      handoff.status = 'claimed';
      handoff.claimedBy = actor;
      handoff.claimedAt = new Date();
      handoff.checkpoint = normalizeThreadCheckpoint({
        summary: `Claimed by ${actor.actorType}.`,
        nextActions: ['Continue the active plan step.'],
        updatedBy: actor
      });
      appendHandoffEvent(handoff, { eventType: 'claimed', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      await syncThreadForHandoff(handoff, {
        actor,
        text: `Claimed handoff "${handoff.title || 'Untitled handoff'}".`,
        checkpoint: {
          summary: `Claimed by ${actor.actorType}.`,
          nextActions: ['Continue the active plan step.'],
          updatedBy: actor
        },
        metadata: { eventType: 'claimed' }
      });
      const result = { handoff: sanitizeAgentHandoffDoc(handoff) };
      const afterHookRun = await runHookPhase({
        userId: req.user.id,
        actor,
        phase: 'after',
        op: 'handoffs.claim',
        payload: hookPayload,
        result
      });
      const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
      return res.status(200).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to claim handoff.' });
      }
      console.error('❌ Error claiming agent handoff:', error);
      return res.status(500).json({ error: 'Failed to claim agent handoff.' });
    }
  });

  router.post('/api/agent/protocol/handoffs/:handoffId/complete', authenticateToken, async (req, res) => {
    try {
      const handoffId = String(req.params.handoffId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(handoffId)) return res.status(400).json({ error: 'Invalid handoff id.' });

      const actor = await resolveAndValidateActorIdentity({
        userId: req.user.id,
        actor: {
          actorType: req.body?.actorType || req.body?.actor?.actorType || 'user',
          actorId: req.body?.actorId || req.body?.actor?.actorId || req.user.id
        },
        fallbackType: 'user'
      });
      if (actor.actorType === 'user' && !actor.actorId) actor.actorId = String(req.user.id);

      const handoff = await AgentHandoff.findOne({ _id: handoffId, userId: req.user.id });
      if (!handoff) return res.status(404).json({ error: 'Handoff not found.' });
      if (handoff.status !== 'claimed') return res.status(400).json({ error: 'Only claimed handoffs can be completed.' });
      if (!canActorMutateClaimedHandoff(handoff, actor)) {
        return res.status(403).json({ error: 'Only the claiming actor can complete this handoff.' });
      }

      const output = req.body?.output && typeof req.body.output === 'object' ? req.body.output : {};
      const queuedApproval = await maybeQueueProtocolApproval({
        userId: req.user.id,
        actor,
        op: 'handoffs.complete',
        payload: {
          handoffId: String(handoff._id),
          output,
          note: String(req.body?.note || '').trim()
        }
      });
      if (queuedApproval) return res.status(202).json(queuedApproval);
      const hookPayload = {
        handoffId: String(handoff._id),
        output,
        note: String(req.body?.note || '').trim()
      };
      const beforeHookRun = await runHookPhase({
        userId: req.user.id,
        actor,
        phase: 'before',
        op: 'handoffs.complete',
        payload: hookPayload
      });
      handoff.status = 'completed';
      handoff.output = output;
      handoff.completedBy = actor;
      handoff.completedAt = new Date();
      handoff.checkpoint = normalizeThreadCheckpoint({
        summary: `Completed by ${actor.actorType}.`,
        nextActions: [],
        updatedBy: actor
      });
      appendHandoffEvent(handoff, {
        eventType: 'completed',
        actor,
        note: String(req.body?.note || '').trim(),
        payload: { hasOutput: Object.keys(output).length > 0 }
      });
      await handoff.save();
      await syncThreadForHandoff(handoff, {
        actor,
        text: String(req.body?.note || '').trim() || `Completed handoff "${handoff.title || 'Untitled handoff'}".`,
        checkpoint: {
          summary: `Completed by ${actor.actorType}.`,
          nextActions: [],
          updatedBy: actor
        },
        archive: true,
        metadata: { eventType: 'completed', output }
      });
      const result = { handoff: sanitizeAgentHandoffDoc(handoff) };
      const afterHookRun = await runHookPhase({
        userId: req.user.id,
        actor,
        phase: 'after',
        op: 'handoffs.complete',
        payload: hookPayload,
        result
      });
      const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
      return res.status(200).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to complete handoff.' });
      }
      console.error('❌ Error completing agent handoff:', error);
      return res.status(500).json({ error: 'Failed to complete agent handoff.' });
    }
  });

  router.post('/api/agent/protocol/handoffs/:handoffId/reject', authenticateToken, async (req, res) => {
    try {
      const handoffId = String(req.params.handoffId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(handoffId)) return res.status(400).json({ error: 'Invalid handoff id.' });

      const actor = await resolveAndValidateActorIdentity({
        userId: req.user.id,
        actor: {
          actorType: req.body?.actorType || req.body?.actor?.actorType || 'user',
          actorId: req.body?.actorId || req.body?.actor?.actorId || req.user.id
        },
        fallbackType: 'user'
      });
      if (actor.actorType === 'user' && !actor.actorId) actor.actorId = String(req.user.id);

      const handoff = await AgentHandoff.findOne({ _id: handoffId, userId: req.user.id });
      if (!handoff) return res.status(404).json({ error: 'Handoff not found.' });
      if (!['pending', 'claimed'].includes(handoff.status)) {
        return res.status(400).json({ error: `Handoff is ${handoff.status || 'not rejectable'}.` });
      }

      const actorIsOwnerUser = actor.actorType === 'user' && String(actor.actorId) === String(req.user.id);
      if (!actorIsOwnerUser) {
        if (handoff.status === 'pending' && !canActorClaimHandoff(handoff, actor)) {
          return res.status(403).json({ error: 'This actor cannot reject this handoff.' });
        }
        if (handoff.status === 'claimed' && !canActorMutateClaimedHandoff(handoff, actor)) {
          return res.status(403).json({ error: 'Only the claiming actor can reject this handoff.' });
        }
      }

      const queuedApproval = await maybeQueueProtocolApproval({
        userId: req.user.id,
        actor,
        op: 'handoffs.reject',
        payload: {
          handoffId: String(handoff._id),
          note: String(req.body?.note || '').trim()
        }
      });
      if (queuedApproval) return res.status(202).json(queuedApproval);
      const hookPayload = {
        handoffId: String(handoff._id),
        note: String(req.body?.note || '').trim()
      };
      const beforeHookRun = await runHookPhase({
        userId: req.user.id,
        actor,
        phase: 'before',
        op: 'handoffs.reject',
        payload: hookPayload
      });

      handoff.status = 'rejected';
      handoff.rejectedBy = actor;
      handoff.rejectedAt = new Date();
      handoff.checkpoint = normalizeThreadCheckpoint({
        summary: `Rejected by ${actor.actorType}.`,
        nextActions: ['Review the rejection note and reroute if needed.'],
        updatedBy: actor
      });
      appendHandoffEvent(handoff, { eventType: 'rejected', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      await syncThreadForHandoff(handoff, {
        actor,
        text: String(req.body?.note || '').trim() || `Rejected handoff "${handoff.title || 'Untitled handoff'}".`,
        checkpoint: {
          summary: `Rejected by ${actor.actorType}.`,
          nextActions: ['Review the rejection note and reroute if needed.'],
          updatedBy: actor
        },
        metadata: { eventType: 'rejected' }
      });
      const result = { handoff: sanitizeAgentHandoffDoc(handoff) };
      const afterHookRun = await runHookPhase({
        userId: req.user.id,
        actor,
        phase: 'after',
        op: 'handoffs.reject',
        payload: hookPayload,
        result
      });
      const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
      return res.status(200).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to reject handoff.' });
      }
      console.error('❌ Error rejecting agent handoff:', error);
      return res.status(500).json({ error: 'Failed to reject agent handoff.' });
    }
  });

  router.post('/api/agent/protocol/handoffs/:handoffId/cancel', authenticateToken, async (req, res) => {
    try {
      const handoffId = String(req.params.handoffId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(handoffId)) return res.status(400).json({ error: 'Invalid handoff id.' });

      const handoff = await AgentHandoff.findOne({ _id: handoffId, userId: req.user.id });
      if (!handoff) return res.status(404).json({ error: 'Handoff not found.' });
      if (!['pending', 'claimed'].includes(handoff.status)) {
        return res.status(400).json({ error: `Handoff is ${handoff.status || 'not cancellable'}.` });
      }

      const actor = { actorType: 'user', actorId: String(req.user.id) };
      handoff.status = 'cancelled';
      handoff.cancelledBy = actor;
      handoff.cancelledAt = new Date();
      handoff.checkpoint = normalizeThreadCheckpoint({
        summary: 'Cancelled by the user.',
        nextActions: [],
        updatedBy: actor
      });
      appendHandoffEvent(handoff, { eventType: 'cancelled', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      await syncThreadForHandoff(handoff, {
        actor,
        text: String(req.body?.note || '').trim() || `Cancelled handoff "${handoff.title || 'Untitled handoff'}".`,
        checkpoint: {
          summary: 'Cancelled by the user.',
          nextActions: [],
          updatedBy: actor
        },
        archive: true,
        metadata: { eventType: 'cancelled' }
      });
      return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to cancel handoff.' });
      }
      console.error('❌ Error cancelling agent handoff:', error);
      return res.status(500).json({ error: 'Failed to cancel agent handoff.' });
    }
  });

  router.post('/api/agent/protocol/handoffs/:handoffId/thread', authenticateToken, async (req, res) => {
    try {
      const handoffId = String(req.params.handoffId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(handoffId)) return res.status(400).json({ error: 'Invalid handoff id.' });
      const handoff = await AgentHandoff.findOne({ _id: handoffId, userId: req.user.id });
      if (!handoff) return res.status(404).json({ error: 'Handoff not found.' });
      const actor = { actorType: 'user', actorId: String(req.user.id) };
      const thread = await ensureThreadForHandoff({ handoff, actor });
      return res.status(200).json({
        handoff: sanitizeAgentHandoffDoc(handoff),
        thread: sanitizeAgentThreadDoc(thread)
      });
    } catch (error) {
      console.error('❌ Error ensuring handoff thread:', error);
      return res.status(500).json({ error: 'Failed to continue this handoff in a thread.' });
    }
  });

  router.get('/api/agent/byo/protocol/handoffs', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const query = { userId: req.personalAgent.userId };
      const status = String(req.query.status || 'pending').trim().toLowerCase();
      if (status !== 'all') {
        if (!AGENT_HANDOFF_STATUSES.has(status)) {
          return res.status(400).json({ error: 'status must be one of pending, claimed, completed, rejected, cancelled, all.' });
        }
        query.status = status;
      }

      const taskType = String(req.query.taskType || '').trim().toLowerCase();
      if (taskType) {
        if (!AGENT_HANDOFF_TASK_TYPES.has(taskType)) {
          return res.status(400).json({ error: 'taskType must be one of research, synthesis, restructure, qa, custom.' });
        }
        query.taskType = taskType;
      }

      const scope = String(req.query.scope || 'mine').trim().toLowerCase();
      if (scope !== 'all') {
        query.$or = [
          { 'requestedActor.actorType': 'byo_agent', 'requestedActor.actorId': String(req.personalAgent.id) },
          { 'claimedBy.actorType': 'byo_agent', 'claimedBy.actorId': String(req.personalAgent.id) },
          { 'createdBy.actorType': 'byo_agent', 'createdBy.actorId': String(req.personalAgent.id) }
        ];
      }

      const limit = safeAgentHandoffLimit(req.query.limit, 60);
      const rows = await AgentHandoff.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
      return res.status(200).json({ handoffs: rows.map(sanitizeAgentHandoffDoc) });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid BYO handoff query.' });
      }
      console.error('❌ Error listing BYO handoffs:', error);
      return res.status(500).json({ error: 'Failed to list BYO handoffs.' });
    }
  });

  router.post('/api/agent/byo/protocol/handoffs', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = req.personalAgent.capabilities || {};
      if (!capabilities.proposeChanges) {
        return res.status(403).json({ error: 'This personal agent cannot create protocol handoffs.' });
      }

      const payload = normalizeHandoffPayload(req.body || {});
      const title = String(payload.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required.' });

      const taskType = normalizeAgentHandoffTaskType(payload.taskType, 'custom');
      const priority = normalizeAgentHandoffPriority(payload.priority, 'normal');
      const objective = String(payload.objective || '').trim().slice(0, 4000);
      const dueAt = parseOptionalDate(payload.dueAt);
      if (payload.dueAt && !dueAt) return res.status(400).json({ error: 'dueAt must be a valid date when provided.' });

      const createdBy = { actorType: 'byo_agent', actorId: String(req.personalAgent.id) };
      const requestedActorInput = payload.requestedActor || {
        actorType: payload.requestedActorType || 'native_agent',
        actorId: payload.requestedActorId || ''
      };
      if (String(requestedActorInput?.actorType || '').trim().toLowerCase() === 'byo_agent' && !String(requestedActorInput?.actorId || '').trim()) {
        requestedActorInput.actorId = String(req.personalAgent.id);
      }
      const requestedActor = await resolveAndValidateActorIdentity({
        userId: req.personalAgent.userId,
        actor: requestedActorInput,
        fallbackType: 'native_agent'
      });
      if (requestedActor.actorType === 'user' && !requestedActor.actorId) requestedActor.actorId = String(req.personalAgent.userId);

      const queuedApproval = await maybeQueueProtocolApproval({
        userId: req.personalAgent.userId,
        actor: createdBy,
        op: 'handoffs.create',
        payload: {
          ...payload,
          requestedActor
        }
      });
      if (queuedApproval) return res.status(202).json(queuedApproval);
      const hookPayload = {
        ...payload,
        requestedActor
      };
      const beforeHookRun = await runHookPhase({
        userId: req.personalAgent.userId,
        actor: createdBy,
        phase: 'before',
        op: 'handoffs.create',
        payload: hookPayload
      });

      const plan = buildDefaultHandoffPlan({ taskType, title, objective });
      const checkpoint = buildDefaultHandoffCheckpoint({ title, requestedActor });
      const planner = buildAgentPlanner({ taskType, requestedActor });
      const handoff = await AgentHandoff.create({
        userId: req.personalAgent.userId,
        title: title.slice(0, 200),
        taskType,
        objective,
        status: 'pending',
        priority,
        context: payload.context && typeof payload.context === 'object' ? payload.context : {},
        input: payload.input && typeof payload.input === 'object' ? payload.input : {},
        output: {},
        planner,
        plan,
        checkpoint,
        requestedActor,
        createdBy,
        dueAt,
        events: [{
          eventType: 'created',
          actor: createdBy,
          note: '',
          payload: { taskType, priority, requestedActor, planner }
        }]
      });
      const thread = await createThreadForHandoff({
        userId: req.personalAgent.userId,
        title,
        objective,
        taskType,
        requestedActor,
        planner,
        createdBy,
        handoffId: handoff._id
      });
      handoff.threadId = thread._id;
      await handoff.save();

      const result = { handoff: sanitizeAgentHandoffDoc(handoff) };
      const afterHookRun = await runHookPhase({
        userId: req.personalAgent.userId,
        actor: createdBy,
        phase: 'after',
        op: 'handoffs.create',
        payload: hookPayload,
        result
      });
      const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
      return res.status(201).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid BYO handoff request.' });
      }
      console.error('❌ Error creating BYO handoff:', error);
      return res.status(500).json({ error: 'Failed to create BYO handoff.' });
    }
  });

  router.post('/api/agent/byo/protocol/handoffs/:handoffId/claim', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const handoffId = String(req.params.handoffId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(handoffId)) return res.status(400).json({ error: 'Invalid handoff id.' });

      const actor = { actorType: 'byo_agent', actorId: String(req.personalAgent.id) };
      const handoff = await AgentHandoff.findOne({ _id: handoffId, userId: req.personalAgent.userId });
      if (!handoff) return res.status(404).json({ error: 'Handoff not found.' });

      if (handoff.status === 'claimed') {
        if (canActorMutateClaimedHandoff(handoff, actor)) {
          return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
        }
        return res.status(409).json({ error: 'Handoff is already claimed by a different actor.' });
      }
      if (handoff.status !== 'pending') return res.status(400).json({ error: `Handoff is ${handoff.status || 'not pending'}.` });
      if (!canActorClaimHandoff(handoff, actor)) {
        return res.status(403).json({ error: 'This BYO agent is not the requested actor for this handoff.' });
      }

      const queuedApproval = await maybeQueueProtocolApproval({
        userId: req.personalAgent.userId,
        actor,
        op: 'handoffs.claim',
        payload: {
          handoffId: String(handoff._id),
          note: String(req.body?.note || '').trim()
        }
      });
      if (queuedApproval) return res.status(202).json(queuedApproval);
      const hookPayload = {
        handoffId: String(handoff._id),
        note: String(req.body?.note || '').trim()
      };
      const beforeHookRun = await runHookPhase({
        userId: req.personalAgent.userId,
        actor,
        phase: 'before',
        op: 'handoffs.claim',
        payload: hookPayload
      });

      handoff.status = 'claimed';
      handoff.claimedBy = actor;
      handoff.claimedAt = new Date();
      handoff.checkpoint = normalizeThreadCheckpoint({
        summary: `Claimed by ${actor.actorType}.`,
        nextActions: ['Continue the active plan step.'],
        updatedBy: actor
      });
      appendHandoffEvent(handoff, { eventType: 'claimed', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      await syncThreadForHandoff(handoff, {
        actor,
        text: `Claimed handoff "${handoff.title || 'Untitled handoff'}".`,
        checkpoint: {
          summary: `Claimed by ${actor.actorType}.`,
          nextActions: ['Continue the active plan step.'],
          updatedBy: actor
        },
        metadata: { eventType: 'claimed' }
      });
      const result = { handoff: sanitizeAgentHandoffDoc(handoff) };
      const afterHookRun = await runHookPhase({
        userId: req.personalAgent.userId,
        actor,
        phase: 'after',
        op: 'handoffs.claim',
        payload: hookPayload,
        result
      });
      const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
      return res.status(200).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to claim BYO handoff.' });
      }
      console.error('❌ Error claiming BYO handoff:', error);
      return res.status(500).json({ error: 'Failed to claim BYO handoff.' });
    }
  });

  router.post('/api/agent/byo/protocol/handoffs/:handoffId/complete', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = req.personalAgent.capabilities || {};
      if (!capabilities.proposeChanges && !capabilities.executeWrites) {
        return res.status(403).json({ error: 'This personal agent cannot complete protocol handoffs.' });
      }

      const handoffId = String(req.params.handoffId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(handoffId)) return res.status(400).json({ error: 'Invalid handoff id.' });

      const actor = { actorType: 'byo_agent', actorId: String(req.personalAgent.id) };
      const handoff = await AgentHandoff.findOne({ _id: handoffId, userId: req.personalAgent.userId });
      if (!handoff) return res.status(404).json({ error: 'Handoff not found.' });
      if (handoff.status !== 'claimed') return res.status(400).json({ error: 'Only claimed handoffs can be completed.' });
      if (!canActorMutateClaimedHandoff(handoff, actor)) {
        return res.status(403).json({ error: 'Only the claiming BYO agent can complete this handoff.' });
      }

      const output = req.body?.output && typeof req.body.output === 'object' ? req.body.output : {};
      const queuedApproval = await maybeQueueProtocolApproval({
        userId: req.personalAgent.userId,
        actor,
        op: 'handoffs.complete',
        payload: {
          handoffId: String(handoff._id),
          output,
          note: String(req.body?.note || '').trim()
        }
      });
      if (queuedApproval) return res.status(202).json(queuedApproval);
      const hookPayload = {
        handoffId: String(handoff._id),
        output,
        note: String(req.body?.note || '').trim()
      };
      const beforeHookRun = await runHookPhase({
        userId: req.personalAgent.userId,
        actor,
        phase: 'before',
        op: 'handoffs.complete',
        payload: hookPayload
      });
      handoff.status = 'completed';
      handoff.output = output;
      handoff.completedBy = actor;
      handoff.completedAt = new Date();
      handoff.checkpoint = normalizeThreadCheckpoint({
        summary: `Completed by ${actor.actorType}.`,
        nextActions: [],
        updatedBy: actor
      });
      appendHandoffEvent(handoff, {
        eventType: 'completed',
        actor,
        note: String(req.body?.note || '').trim(),
        payload: { hasOutput: Object.keys(output).length > 0 }
      });
      await handoff.save();
      await syncThreadForHandoff(handoff, {
        actor,
        text: String(req.body?.note || '').trim() || `Completed handoff "${handoff.title || 'Untitled handoff'}".`,
        checkpoint: {
          summary: `Completed by ${actor.actorType}.`,
          nextActions: [],
          updatedBy: actor
        },
        archive: true,
        metadata: { eventType: 'completed', output }
      });
      const result = { handoff: sanitizeAgentHandoffDoc(handoff) };
      const afterHookRun = await runHookPhase({
        userId: req.personalAgent.userId,
        actor,
        phase: 'after',
        op: 'handoffs.complete',
        payload: hookPayload,
        result
      });
      const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
      return res.status(200).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to complete BYO handoff.' });
      }
      console.error('❌ Error completing BYO handoff:', error);
      return res.status(500).json({ error: 'Failed to complete BYO handoff.' });
    }
  });

  router.post('/api/agent/byo/protocol/handoffs/:handoffId/reject', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const handoffId = String(req.params.handoffId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(handoffId)) return res.status(400).json({ error: 'Invalid handoff id.' });

      const actor = { actorType: 'byo_agent', actorId: String(req.personalAgent.id) };
      const handoff = await AgentHandoff.findOne({ _id: handoffId, userId: req.personalAgent.userId });
      if (!handoff) return res.status(404).json({ error: 'Handoff not found.' });
      if (!['pending', 'claimed'].includes(handoff.status)) {
        return res.status(400).json({ error: `Handoff is ${handoff.status || 'not rejectable'}.` });
      }
      if (handoff.status === 'pending' && !canActorClaimHandoff(handoff, actor)) {
        return res.status(403).json({ error: 'This BYO agent cannot reject this handoff.' });
      }
      if (handoff.status === 'claimed' && !canActorMutateClaimedHandoff(handoff, actor)) {
        return res.status(403).json({ error: 'Only the claiming BYO agent can reject this handoff.' });
      }

      const queuedApproval = await maybeQueueProtocolApproval({
        userId: req.personalAgent.userId,
        actor,
        op: 'handoffs.reject',
        payload: {
          handoffId: String(handoff._id),
          note: String(req.body?.note || '').trim()
        }
      });
      if (queuedApproval) return res.status(202).json(queuedApproval);
      const hookPayload = {
        handoffId: String(handoff._id),
        note: String(req.body?.note || '').trim()
      };
      const beforeHookRun = await runHookPhase({
        userId: req.personalAgent.userId,
        actor,
        phase: 'before',
        op: 'handoffs.reject',
        payload: hookPayload
      });

      handoff.status = 'rejected';
      handoff.rejectedBy = actor;
      handoff.rejectedAt = new Date();
      handoff.checkpoint = normalizeThreadCheckpoint({
        summary: `Rejected by ${actor.actorType}.`,
        nextActions: ['Review the rejection note and reroute if needed.'],
        updatedBy: actor
      });
      appendHandoffEvent(handoff, { eventType: 'rejected', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      await syncThreadForHandoff(handoff, {
        actor,
        text: String(req.body?.note || '').trim() || `Rejected handoff "${handoff.title || 'Untitled handoff'}".`,
        checkpoint: {
          summary: `Rejected by ${actor.actorType}.`,
          nextActions: ['Review the rejection note and reroute if needed.'],
          updatedBy: actor
        },
        metadata: { eventType: 'rejected' }
      });
      const result = { handoff: sanitizeAgentHandoffDoc(handoff) };
      const afterHookRun = await runHookPhase({
        userId: req.personalAgent.userId,
        actor,
        phase: 'after',
        op: 'handoffs.reject',
        payload: hookPayload,
        result
      });
      const warnings = [beforeHookRun, afterHookRun].map((run) => String(run?.warningMessage || '').trim()).filter(Boolean);
      return res.status(200).json(warnings.length > 0 ? { ...result, hookWarnings: warnings } : result);
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to reject BYO handoff.' });
      }
      console.error('❌ Error rejecting BYO handoff:', error);
      return res.status(500).json({ error: 'Failed to reject BYO handoff.' });
    }
  });

  router.post('/api/agent/byo/protocol/handoffs/:handoffId/thread', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = req.personalAgent.capabilities || {};
      if (!capabilities.proposeChanges) {
        return res.status(403).json({ error: 'This personal agent cannot continue handoffs in shared threads.' });
      }
      const handoffId = String(req.params.handoffId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(handoffId)) return res.status(400).json({ error: 'Invalid handoff id.' });
      const handoff = await AgentHandoff.findOne({ _id: handoffId, userId: req.personalAgent.userId });
      if (!handoff) return res.status(404).json({ error: 'Handoff not found.' });
      const actor = { actorType: 'byo_agent', actorId: String(req.personalAgent.id) };
      const thread = await ensureThreadForHandoff({ handoff, actor });
      return res.status(200).json({
        handoff: sanitizeAgentHandoffDoc(handoff),
        thread: sanitizeAgentThreadDoc(thread)
      });
    } catch (error) {
      console.error('❌ Error ensuring BYO handoff thread:', error);
      return res.status(500).json({ error: 'Failed to continue this handoff in a shared thread.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentHandoffRouter
};
