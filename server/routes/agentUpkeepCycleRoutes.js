const express = require('express');

const buildAgentUpkeepCycleRouter = ({
  mongoose,
  authenticateToken,
  AgentUpkeepCycle,
  AgentHandoff,
  sanitizeAgentHandoffDoc,
  sanitizeAgentThreadDoc,
  resolveAutoHandoffRequestedActor,
  getUserAgentProtocolPolicy,
  buildAgentPlanner,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority,
  parseOptionalDate
}) => {
  const router = express.Router();

  const clean = (value) => String(value || '').trim();
  const clamp = (value, min, max, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
  };

  const toActor = (userId) => ({ actorType: 'user', actorId: String(userId || '').trim() });
  const mapHandoffStatusToRunStatus = (status = '') => {
    const safe = clean(status).toLowerCase();
    if (safe === 'completed') return 'completed';
    if (safe === 'rejected' || safe === 'cancelled') return 'cancelled';
    if (safe === 'claimed' || safe === 'pending') return 'in_progress';
    return 'scheduled';
  };

  const buildHandoffOutcomeSeed = (handoffDoc = null) => {
    if (!handoffDoc) return null;
    const summary = clean(handoffDoc?.output?.summary)
      || clean(handoffDoc?.output?.result)
      || clean(handoffDoc?.checkpoint?.summary)
      || clean(handoffDoc?.objective);
    const nextActions = Array.isArray(handoffDoc?.checkpoint?.nextActions)
      ? handoffDoc.checkpoint.nextActions.map((item) => clean(item)).filter(Boolean).slice(0, 6)
      : [];
    const openQuestions = Array.isArray(handoffDoc?.checkpoint?.openQuestions)
      ? handoffDoc.checkpoint.openQuestions.map((item) => clean(item)).filter(Boolean).slice(0, 6)
      : [];
    return {
      handoffId: handoffDoc?._id ? String(handoffDoc._id) : '',
      threadId: handoffDoc?.threadId ? String(handoffDoc.threadId) : '',
      status: clean(handoffDoc?.status).toLowerCase() || 'completed',
      finishedAt: handoffDoc?.completedAt || handoffDoc?.rejectedAt || handoffDoc?.cancelledAt || handoffDoc?.updatedAt || null,
      summary,
      nextActions,
      openQuestions
    };
  };

  const buildNextDueAt = (currentValue, cadence = 'recurring') => {
    const base = parseOptionalDate(currentValue) || new Date();
    const next = new Date(base.getTime());
    if (clean(cadence).toLowerCase() === 'recurring') {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + 2);
    }
    return next;
  };

  const formatOptionalDate = (value) => {
    const parsed = parseOptionalDate(value);
    if (!parsed) return 'the scheduled due time';
    return parsed.toLocaleString();
  };

  const serializeCycle = async (cycleDoc) => {
    if (!cycleDoc) return null;
    const cycle = cycleDoc.toObject({ getters: false, virtuals: false });
    const linkedHandoff = cycle.lastHandoffId && mongoose.Types.ObjectId.isValid(String(cycle.lastHandoffId))
      ? await AgentHandoff.findById(cycle.lastHandoffId)
      : null;
    const linkedOutcome = buildHandoffOutcomeSeed(linkedHandoff);
    const storedOutcome = cycle.lastOutcome && typeof cycle.lastOutcome === 'object' ? cycle.lastOutcome : {};
    return {
      cycleId: String(cycle._id),
      title: clean(cycle.title),
      summary: clean(cycle.summary),
      status: clean(cycle.status) || 'active',
      cadence: clean(cycle.cadence) || 'recurring',
      taskType: clean(cycle.taskType) || 'custom',
      workerRole: clean(cycle.workerRole),
      nextDueAt: cycle.nextDueAt,
      lastRunAt: cycle.lastRunAt,
      lastHandoffId: cycle.lastHandoffId ? String(cycle.lastHandoffId) : '',
      lastThreadId: cycle.lastThreadId ? String(cycle.lastThreadId) : '',
      sourceDraftId: cycle.sourceDraftId ? String(cycle.sourceDraftId) : '',
      sourceContext: cycle.sourceContext || {},
      workflow: cycle.workflow || {},
      seed: cycle.seed || {},
      lastOutcome: linkedOutcome || storedOutcome,
      runs: Array.isArray(cycle.runs) ? cycle.runs.map((run) => ({
        handoffId: run?.handoffId ? String(run.handoffId) : '',
        threadId: run?.threadId ? String(run.threadId) : '',
        scheduledFor: run?.scheduledFor || null,
        startedAt: run?.startedAt || null,
        status: clean(run?.status) || 'scheduled'
      })) : [],
      linkedHandoff: linkedHandoff ? sanitizeAgentHandoffDoc(linkedHandoff) : null,
      linkedHandoffStatus: linkedHandoff?.status || ''
    };
  };

  const createScheduledRun = async ({ userId, cycleDoc, forceRun = false }) => {
    const policy = await getUserAgentProtocolPolicy(String(userId));
    const requestedTaskType = normalizeAgentHandoffTaskType(cycleDoc.taskType, 'custom');
    const routingPlan = await resolveAutoHandoffRequestedActor({
      userId: String(userId),
      taskType: requestedTaskType,
      policy,
      workerRole: clean(cycleDoc.workerRole)
    });
    const createdBy = toActor(userId);
    const previousHandoff = cycleDoc.lastHandoffId && mongoose.Types.ObjectId.isValid(String(cycleDoc.lastHandoffId))
      ? await AgentHandoff.findById(cycleDoc.lastHandoffId)
      : null;
    const previousOutcome = buildHandoffOutcomeSeed(previousHandoff);
    const title = clean(cycleDoc.title) || 'Scheduled upkeep cycle';
    const objective = clean(cycleDoc.summary) || `Run the upkeep cycle for ${title}.`;
    const planner = buildAgentPlanner({
      taskType: requestedTaskType,
      requestedActor: routingPlan.requestedActor,
      routePlanner: routingPlan.planner
    });
    const handoff = await AgentHandoff.create({
      userId,
      title,
      taskType: requestedTaskType,
      objective,
      status: 'pending',
      priority: normalizeAgentHandoffPriority(cycleDoc.seed?.priority, 'high'),
      context: {
        ...(cycleDoc.sourceContext || {}),
        upkeepCycleId: String(cycleDoc._id),
        upkeepCadence: clean(cycleDoc.cadence) || 'recurring',
        upkeepWorkflow: cycleDoc.workflow || {},
        previousRun: previousOutcome || {}
      },
      input: {
        ...(cycleDoc.seed || {}),
        upkeepCycleId: String(cycleDoc._id),
        previousRun: previousOutcome || {},
        carryForwardPrompt: previousOutcome?.summary
          ? `Use this prior outcome to seed the next upkeep pass: ${previousOutcome.summary}`
          : ''
      },
      output: {},
      planner,
      plan: buildDefaultHandoffPlan({ taskType: requestedTaskType, title, objective }),
      checkpoint: buildDefaultHandoffCheckpoint({ title, requestedActor: routingPlan.requestedActor }),
      requestedActor: routingPlan.requestedActor,
      createdBy,
      dueAt: forceRun ? new Date() : parseOptionalDate(cycleDoc.nextDueAt),
      events: [{
        eventType: 'created',
        actor: createdBy,
        note: forceRun
          ? 'Created from a recurring upkeep cycle (forced immediate run).'
          : 'Created from a recurring upkeep cycle.',
        payload: {
          taskType: requestedTaskType,
          requestedActor: routingPlan.requestedActor,
          planner,
          upkeepCycleId: String(cycleDoc._id),
          hasPreviousRun: Boolean(previousOutcome),
          forcedRun: forceRun
        }
      }]
    });

    const thread = await createThreadForHandoff({
      userId,
      title,
      objective,
      taskType: requestedTaskType,
      requestedActor: routingPlan.requestedActor,
      planner,
      createdBy,
      handoffId: handoff._id
    });

    handoff.threadId = thread._id;
    await handoff.save();

    const runStatus = handoff.status === 'pending' ? 'scheduled' : 'in_progress';
    const existingRuns = Array.isArray(cycleDoc.runs) ? cycleDoc.runs : [];
    const syncedRuns = existingRuns.map((run, index) => {
      if (index !== 0) return run;
      const runHandoffId = clean(run?.handoffId);
      const previousHandoffId = previousHandoff?._id ? String(previousHandoff._id) : '';
      if (!runHandoffId || !previousHandoffId || runHandoffId !== previousHandoffId) return run;
      return {
        ...run,
        status: mapHandoffStatusToRunStatus(previousHandoff.status)
      };
    });
    cycleDoc.lastHandoffId = handoff._id;
    cycleDoc.lastThreadId = thread._id;
    cycleDoc.lastRunAt = new Date();
    if (previousOutcome) cycleDoc.lastOutcome = previousOutcome;
    cycleDoc.nextDueAt = buildNextDueAt(forceRun ? new Date() : cycleDoc.nextDueAt, cycleDoc.cadence);
    cycleDoc.runs = [
      {
        handoffId: handoff._id,
        threadId: thread._id,
        scheduledFor: parseOptionalDate(handoff.dueAt) || new Date(),
        startedAt: new Date(),
        status: runStatus
      },
      ...syncedRuns
    ].slice(0, 12);
    await cycleDoc.save();

    return {
      handoff,
      thread
    };
  };

  router.get('/api/agent/protocol/upkeep-cycles', authenticateToken, async (req, res) => {
    try {
      const status = clean(req.query.status || 'active');
      const limit = clamp(req.query.limit, 1, 40, 12);
      const query = { userId: req.user.id };
      if (status && status !== 'all') query.status = status;
      const rows = await AgentUpkeepCycle.find(query).sort({ nextDueAt: 1, updatedAt: -1 }).limit(limit);
      const cycles = await Promise.all(rows.map(serializeCycle));
      return res.status(200).json({ cycles: cycles.filter(Boolean) });
    } catch (error) {
      console.error('❌ Error listing upkeep cycles:', error);
      return res.status(500).json({ error: 'Failed to list upkeep cycles.' });
    }
  });

  router.post('/api/agent/protocol/upkeep-cycles', authenticateToken, async (req, res) => {
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const title = clean(payload.title);
      if (!title) return res.status(400).json({ error: 'title is required.' });

      const cycleDoc = await AgentUpkeepCycle.create({
        userId: req.user.id,
        title: title.slice(0, 200),
        summary: clean(payload.summary).slice(0, 500),
        status: clean(payload.status) || 'active',
        cadence: clean(payload.cadence) || 'recurring',
        taskType: normalizeAgentHandoffTaskType(payload.taskType, 'custom'),
        workerRole: clean(payload.workerRole),
        nextDueAt: parseOptionalDate(payload.nextDueAt) || new Date(),
        sourceDraftId: mongoose.Types.ObjectId.isValid(clean(payload.sourceDraftId))
          ? clean(payload.sourceDraftId)
          : null,
        sourceContext: payload.sourceContext && typeof payload.sourceContext === 'object' ? payload.sourceContext : {},
        workflow: payload.workflow && typeof payload.workflow === 'object' ? payload.workflow : {},
        seed: payload.seed && typeof payload.seed === 'object' ? payload.seed : {}
      });

      const run = await createScheduledRun({ userId: req.user.id, cycleDoc });
      return res.status(201).json({
        cycle: await serializeCycle(cycleDoc),
        handoff: sanitizeAgentHandoffDoc(run.handoff),
        thread: sanitizeAgentThreadDoc(run.thread)
      });
    } catch (error) {
      console.error('❌ Error creating upkeep cycle:', error);
      return res.status(500).json({ error: 'Failed to create upkeep cycle.' });
    }
  });

  router.patch('/api/agent/protocol/upkeep-cycles/:cycleId', authenticateToken, async (req, res) => {
    try {
      const cycleId = clean(req.params.cycleId);
      if (!mongoose.Types.ObjectId.isValid(cycleId)) return res.status(400).json({ error: 'Invalid upkeep cycle id.' });
      const cycle = await AgentUpkeepCycle.findOne({ _id: cycleId, userId: req.user.id });
      if (!cycle) return res.status(404).json({ error: 'Upkeep cycle not found.' });
      const nextStatus = clean(req.body?.status);
      if (nextStatus && ['active', 'paused', 'completed'].includes(nextStatus)) cycle.status = nextStatus;
      if (req.body?.nextDueAt) cycle.nextDueAt = parseOptionalDate(req.body.nextDueAt) || cycle.nextDueAt;
      await cycle.save();
      return res.status(200).json({ cycle: await serializeCycle(cycle) });
    } catch (error) {
      console.error('❌ Error updating upkeep cycle:', error);
      return res.status(500).json({ error: 'Failed to update upkeep cycle.' });
    }
  });

  router.post('/api/agent/protocol/upkeep-cycles/:cycleId/resume', authenticateToken, async (req, res) => {
    try {
      const cycleId = clean(req.params.cycleId);
      if (!mongoose.Types.ObjectId.isValid(cycleId)) return res.status(400).json({ error: 'Invalid upkeep cycle id.' });
      const cycle = await AgentUpkeepCycle.findOne({ _id: cycleId, userId: req.user.id });
      if (!cycle) return res.status(404).json({ error: 'Upkeep cycle not found.' });
      const forceRun = Boolean(req.body && req.body.force === true);

      let handoff = cycle.lastHandoffId && mongoose.Types.ObjectId.isValid(String(cycle.lastHandoffId))
        ? await AgentHandoff.findById(cycle.lastHandoffId)
        : null;

      if (handoff && ['pending', 'claimed'].includes(clean(handoff.status))) {
        cycle.status = 'active';
        cycle.lastRunAt = new Date();
        cycle.lastOutcome = buildHandoffOutcomeSeed(handoff) || cycle.lastOutcome || {};
        cycle.runs = (Array.isArray(cycle.runs) ? cycle.runs : []).map((run, index) => {
          if (index !== 0) return run;
          const runHandoffId = clean(run?.handoffId);
          if (!runHandoffId || runHandoffId !== String(handoff._id)) return run;
          return {
            ...run,
            status: mapHandoffStatusToRunStatus(handoff.status),
            startedAt: run?.startedAt || new Date()
          };
        });
        await cycle.save();
        return res.status(200).json({
          reused: true,
          cycle: await serializeCycle(cycle),
          handoff: sanitizeAgentHandoffDoc(handoff)
        });
      }

      const dueAt = parseOptionalDate(cycle.nextDueAt);
      const dueNow = !dueAt || dueAt.getTime() <= Date.now();
      if (!forceRun && !dueNow) {
        const cycleSnapshot = await serializeCycle(cycle);
        return res.status(200).json({
          notDue: true,
          message: `Next pass is scheduled for ${formatOptionalDate(dueAt)}. Run now to override cadence.`,
          dueAt,
          cycle: cycleSnapshot
        });
      }

      const run = await createScheduledRun({ userId: req.user.id, cycleDoc: cycle, forceRun });
      cycle.status = 'active';
      await cycle.save();
      return res.status(200).json({
        forcedRun: forceRun,
        cycle: await serializeCycle(cycle),
        handoff: sanitizeAgentHandoffDoc(run.handoff),
        thread: sanitizeAgentThreadDoc(run.thread)
      });
    } catch (error) {
      console.error('❌ Error resuming upkeep cycle:', error);
      return res.status(500).json({ error: 'Failed to resume upkeep cycle.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentUpkeepCycleRouter
};
