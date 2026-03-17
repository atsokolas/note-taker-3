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
  sanitizeAgentHandoffDoc,
  AGENT_HANDOFF_STATUSES,
  AGENT_HANDOFF_TASK_TYPES,
  normalizeAgentActorType,
  safeAgentHandoffLimit,
  getUserAgentProtocolPolicy,
  resolveAutoHandoffRequestedActor,
  canActorMutateClaimedHandoff,
  canActorClaimHandoff,
  appendHandoffEvent
}) => {
  const router = express.Router();

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
        requestedActor,
        createdBy,
        dueAt,
        events: [{
          eventType: 'created',
          actor: createdBy,
          note: '',
          payload: { taskType, priority, requestedActor }
        }]
      });

      return res.status(201).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
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
      const plan = await resolveAutoHandoffRequestedActor({
        userId: String(req.user.id),
        taskType,
        policy
      });

      const createdBy = { actorType: 'user', actorId: String(req.user.id) };
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
        requestedActor: plan.requestedActor,
        createdBy,
        dueAt,
        events: [{
          eventType: 'created',
          actor: createdBy,
          note: '',
          payload: { taskType, priority, requestedActor: plan.requestedActor, planner: plan.planner }
        }]
      });

      return res.status(201).json({
        handoff: sanitizeAgentHandoffDoc(handoff),
        planner: plan.planner,
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

      handoff.status = 'claimed';
      handoff.claimedBy = actor;
      handoff.claimedAt = new Date();
      appendHandoffEvent(handoff, { eventType: 'claimed', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
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
      handoff.status = 'completed';
      handoff.output = output;
      handoff.completedBy = actor;
      handoff.completedAt = new Date();
      appendHandoffEvent(handoff, {
        eventType: 'completed',
        actor,
        note: String(req.body?.note || '').trim(),
        payload: { hasOutput: Object.keys(output).length > 0 }
      });
      await handoff.save();
      return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
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

      handoff.status = 'rejected';
      handoff.rejectedBy = actor;
      handoff.rejectedAt = new Date();
      appendHandoffEvent(handoff, { eventType: 'rejected', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
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
      appendHandoffEvent(handoff, { eventType: 'cancelled', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to cancel handoff.' });
      }
      console.error('❌ Error cancelling agent handoff:', error);
      return res.status(500).json({ error: 'Failed to cancel agent handoff.' });
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
        requestedActor,
        createdBy,
        dueAt,
        events: [{
          eventType: 'created',
          actor: createdBy,
          note: '',
          payload: { taskType, priority, requestedActor }
        }]
      });

      return res.status(201).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
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

      handoff.status = 'claimed';
      handoff.claimedBy = actor;
      handoff.claimedAt = new Date();
      appendHandoffEvent(handoff, { eventType: 'claimed', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
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
      handoff.status = 'completed';
      handoff.output = output;
      handoff.completedBy = actor;
      handoff.completedAt = new Date();
      appendHandoffEvent(handoff, {
        eventType: 'completed',
        actor,
        note: String(req.body?.note || '').trim(),
        payload: { hasOutput: Object.keys(output).length > 0 }
      });
      await handoff.save();
      return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
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

      handoff.status = 'rejected';
      handoff.rejectedBy = actor;
      handoff.rejectedAt = new Date();
      appendHandoffEvent(handoff, { eventType: 'rejected', actor, note: String(req.body?.note || '').trim() });
      await handoff.save();
      return res.status(200).json({ handoff: sanitizeAgentHandoffDoc(handoff) });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Failed to reject BYO handoff.' });
      }
      console.error('❌ Error rejecting BYO handoff:', error);
      return res.status(500).json({ error: 'Failed to reject BYO handoff.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentHandoffRouter
};
