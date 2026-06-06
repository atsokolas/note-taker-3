const crypto = require('crypto');
const express = require('express');

const TASK_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SUPPORTED_RUNTIMES = new Set(['agent', 'claude-code', 'codex', 'hermes', 'openclaw', 'opencode']);
const PERMISSION_SET = new Set(['read', 'retrieve', 'search', 'draft_write', 'wiki_write', 'project_write']);

const createTaskId = () => `at_${crypto.randomBytes(12).toString('base64url')}`;

const normalizeRuntime = (value = '') => {
  const runtime = String(value || '').trim().toLowerCase();
  if (runtime === 'claude') return 'claude-code';
  return SUPPORTED_RUNTIMES.has(runtime) ? runtime : 'agent';
};

const runtimeLabel = (runtime = 'agent') => ({
  agent: 'Noeis agent',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  opencode: 'OpenCode'
}[runtime] || 'Noeis agent');

const normalizePermissions = (input = []) => {
  const raw = Array.isArray(input) ? input : [input];
  const values = raw.map(item => String(item || '').trim()).filter(item => PERMISSION_SET.has(item));
  const unique = Array.from(new Set(values));
  return unique.length ? unique : ['read', 'draft_write'];
};

const normalizeTarget = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    type: String(source.type || source.targetType || '').trim().slice(0, 80),
    id: String(source.id || source.targetId || '').trim().slice(0, 160),
    title: String(source.title || source.targetTitle || '').trim().slice(0, 200),
    url: String(source.url || source.href || '').trim().slice(0, 1000)
  };
};

const sanitizeTaskLink = (doc = {}, { includeOwner = false } = {}) => {
  const task = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const status = task.status || 'pending';
  return {
    taskId: task.taskId || '',
    ...(includeOwner ? { userId: task.userId ? String(task.userId) : '' } : {}),
    runtime: normalizeRuntime(task.runtime),
    runtimeLabel: runtimeLabel(normalizeRuntime(task.runtime)),
    title: String(task.title || ''),
    objective: String(task.objective || ''),
    taskType: String(task.taskType || 'custom'),
    priority: String(task.priority || 'normal'),
    target: normalizeTarget(task.target || {}),
    permissions: normalizePermissions(task.permissions || []),
    context: task.context || {},
    input: task.input || {},
    status,
    handoffId: task.handoffId ? String(task.handoffId) : '',
    dispatchedAt: task.dispatchedAt || null,
    expiresAt: task.expiresAt || null,
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || null
  };
};

const escapeRegex = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findRuntimeAgent = async ({ PersonalAgent, userId, runtime }) => {
  if (!PersonalAgent?.findOne) return null;
  const label = runtimeLabel(runtime);
  const candidates = [label, runtime].filter(Boolean);
  for (const candidate of candidates) {
    const query = PersonalAgent.findOne({
      userId,
      status: 'active',
      name: { $regex: escapeRegex(candidate), $options: 'i' }
    });
    const found = typeof query?.select === 'function'
      ? await query.select('_id name status capabilities preferredWorkerRoles')
      : await query;
    if (found) return found;
  }
  return null;
};

const buildTaskRunUrl = ({ appUrl, taskId }) => {
  const url = new URL(`/a/run/${encodeURIComponent(taskId)}`, appUrl || 'https://www.noeis.io');
  return url.toString();
};

const buildAgentTaskLinkRouter = ({
  mongoose,
  authenticateToken,
  AgentTaskLink,
  PersonalAgent,
  AgentHandoff,
  AgentThread,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  buildAgentPlanner,
  createThreadForHandoff,
  appendHandoffEvent,
  sanitizeAgentHandoffDoc,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority,
  defaultAppUrl = process.env.NOEIS_APP_URL || process.env.FRONTEND_URL || 'https://www.noeis.io',
  now = () => new Date()
}) => {
  const router = express.Router();

  router.post('/api/agent-task-links', authenticateToken, async (req, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required.' });
      const runtime = normalizeRuntime(req.body?.runtime || 'agent');
      const taskType = normalizeAgentHandoffTaskType(req.body?.taskType, 'custom');
      const priority = normalizeAgentHandoffPriority(req.body?.priority, 'normal');
      const objective = String(req.body?.objective || title).trim().slice(0, 4000);
      const taskId = createTaskId();
      const expiresAt = new Date(now().getTime() + TASK_LINK_TTL_MS);
      const target = normalizeTarget(req.body?.target || req.body || {});
      const created = await AgentTaskLink.create({
        taskId,
        userId: req.user.id,
        runtime,
        title: title.slice(0, 200),
        objective,
        taskType,
        priority,
        target,
        permissions: normalizePermissions(req.body?.permissions || ['read', 'draft_write']),
        context: req.body?.context && typeof req.body.context === 'object' ? req.body.context : {},
        input: req.body?.input && typeof req.body.input === 'object' ? req.body.input : {},
        status: 'pending',
        expiresAt
      });
      const task = sanitizeTaskLink(created, { includeOwner: true });
      res.status(201).json({
        task,
        runUrl: buildTaskRunUrl({ appUrl: req.body?.appUrl || defaultAppUrl, taskId })
      });
    } catch (error) {
      console.error('❌ Error creating agent task link:', error);
      res.status(500).json({ error: 'Failed to create agent task link.' });
    }
  });

  router.get('/api/agent-task-links/:taskId', async (req, res) => {
    try {
      const taskId = String(req.params.taskId || '').trim();
      const task = await AgentTaskLink.findOne({ taskId });
      if (!task) return res.status(404).json({ error: 'Agent task link not found.' });
      if (task.status === 'pending' && task.expiresAt && new Date(task.expiresAt).getTime() <= now().getTime()) {
        task.status = 'expired';
        if (typeof task.save === 'function') await task.save();
      }
      res.status(200).json({ task: sanitizeTaskLink(task) });
    } catch (error) {
      console.error('❌ Error loading agent task link:', error);
      res.status(500).json({ error: 'Failed to load agent task link.' });
    }
  });

  router.post('/api/agent-task-links/:taskId/dispatch', authenticateToken, async (req, res) => {
    try {
      const taskId = String(req.params.taskId || '').trim();
      const task = await AgentTaskLink.findOne({ taskId });
      if (!task) return res.status(404).json({ error: 'Agent task link not found.' });
      if (String(task.userId || '') !== String(req.user.id || '')) {
        return res.status(403).json({ error: 'This task link belongs to a different Noeis workspace.' });
      }
      if (task.status === 'dispatched' && task.handoffId) {
        const existing = await AgentHandoff.findOne({ _id: task.handoffId, userId: req.user.id });
        return res.status(200).json({
          task: sanitizeTaskLink(task, { includeOwner: true }),
          handoff: existing ? sanitizeAgentHandoffDoc(existing) : null,
          reused: true
        });
      }
      if (task.status !== 'pending') {
        return res.status(400).json({ error: `Agent task link is ${task.status}.` });
      }
      if (task.expiresAt && new Date(task.expiresAt).getTime() <= now().getTime()) {
        task.status = 'expired';
        await task.save();
        return res.status(400).json({ error: 'Agent task link has expired.', task: sanitizeTaskLink(task, { includeOwner: true }) });
      }

      const runtime = normalizeRuntime(task.runtime);
      const personalAgent = runtime === 'agent'
        ? null
        : await findRuntimeAgent({ PersonalAgent, userId: req.user.id, runtime });
      if (runtime !== 'agent' && !personalAgent) {
        return res.status(409).json({
          status: 'connection_required',
          runtime,
          runtimeLabel: runtimeLabel(runtime),
          connectPath: `/integrations?connect=${encodeURIComponent(runtime)}`,
          connectCommand: `noeis connect ${runtime}`,
          task: sanitizeTaskLink(task, { includeOwner: true })
        });
      }

      const requestedActor = personalAgent
        ? { actorType: 'byo_agent', actorId: String(personalAgent._id) }
        : { actorType: 'native_agent', actorId: '' };
      const taskType = normalizeAgentHandoffTaskType(task.taskType, 'custom');
      const priority = normalizeAgentHandoffPriority(task.priority, 'normal');
      const title = String(task.title || 'Agent task').slice(0, 200);
      const objective = String(task.objective || title).slice(0, 4000);
      const plan = buildDefaultHandoffPlan({ taskType, title, objective });
      const checkpoint = buildDefaultHandoffCheckpoint({ title, requestedActor });
      const planner = buildAgentPlanner({ taskType, requestedActor });
      const createdBy = { actorType: 'user', actorId: String(req.user.id) };
      const target = normalizeTarget(task.target || {});
      const handoff = await AgentHandoff.create({
        userId: req.user.id,
        title,
        taskType,
        objective,
        status: 'pending',
        priority,
        context: {
          ...(task.context && typeof task.context === 'object' ? task.context : {}),
          source: 'agent_task_link',
          taskId: task.taskId,
          runtime,
          target
        },
        input: {
          ...(task.input && typeof task.input === 'object' ? task.input : {}),
          target,
          permissions: normalizePermissions(task.permissions || [])
        },
        output: {},
        planner,
        plan,
        checkpoint,
        requestedActor,
        createdBy,
        events: [{
          eventType: 'created',
          actor: createdBy,
          note: `Dispatched from agent task link ${task.taskId}.`,
          payload: { taskId: task.taskId, runtime, target, requestedActor }
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
      appendHandoffEvent(handoff, {
        eventType: 'note',
        actor: createdBy,
        note: runtime === 'agent'
          ? 'Queued for the native Noeis agent.'
          : `Queued for ${runtimeLabel(runtime)}.`
      });
      await handoff.save();
      task.status = 'dispatched';
      task.handoffId = handoff._id;
      task.dispatchedAt = now();
      await task.save();
      res.status(201).json({
        task: sanitizeTaskLink(task, { includeOwner: true }),
        handoff: sanitizeAgentHandoffDoc(handoff)
      });
    } catch (error) {
      console.error('❌ Error dispatching agent task link:', error);
      res.status(500).json({ error: 'Failed to dispatch agent task link.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentTaskLinkRouter,
  normalizeRuntime,
  runtimeLabel,
  sanitizeTaskLink
};
