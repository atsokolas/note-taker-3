const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildAgentTaskLinkRouter } = require('../agentTaskLinkRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

class Query {
  constructor(value) {
    this.value = value;
  }

  select() {
    return this;
  }

  sort() {
    return this;
  }

  limit() {
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const withSave = (row) => ({
  ...row,
  async save() {
    this.updatedAt = new Date();
    return this;
  }
});

const createModel = () => {
  const rows = [];
  return {
    rows,
    findOne(query = {}) {
      const row = rows.find((item) => {
        if (query.taskId && String(item.taskId) !== String(query.taskId)) return false;
        if (query._id && String(item._id) !== String(query._id)) return false;
        if (query.userId && String(item.userId) !== String(query.userId)) return false;
        if (query.status && String(item.status) !== String(query.status)) return false;
        if (query.name?.$regex) {
          const regex = new RegExp(query.name.$regex, query.name.$options || '');
          if (!regex.test(String(item.name || ''))) return false;
        }
        return true;
      });
      return new Query(row || null);
    },
    async create(payload = {}) {
      const row = withSave({
        _id: new mongoose.Types.ObjectId().toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...payload
      });
      rows.push(row);
      return row;
    }
  };
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  return { response, body };
};

const run = async () => {
  const AgentTaskLink = createModel();
  const PersonalAgent = createModel();
  const AgentHandoff = createModel();
  const AgentThread = createModel();
  const app = express();
  app.use(express.json());
  app.use(buildAgentTaskLinkRouter({
    mongoose,
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    AgentTaskLink,
    PersonalAgent,
    AgentHandoff,
    AgentThread,
    buildDefaultHandoffPlan: ({ title, objective }) => ({ objective: objective || title, steps: [] }),
    buildDefaultHandoffCheckpoint: ({ title }) => ({ summary: `Waiting on ${title}`, nextActions: [] }),
    buildAgentPlanner: ({ requestedActor }) => ({ requestedActor }),
    createThreadForHandoff: async ({ userId, title, handoffId }) => AgentThread.create({ userId, title, handoffId }),
    appendHandoffEvent: (handoff, event) => {
      handoff.events = [...(handoff.events || []), event];
    },
    sanitizeAgentHandoffDoc: (handoff = {}) => ({
      handoffId: String(handoff._id || ''),
      title: handoff.title,
      status: handoff.status,
      requestedActor: handoff.requestedActor,
      context: handoff.context || {}
    }),
    normalizeAgentHandoffTaskType: value => (['research', 'synthesis', 'restructure', 'qa', 'custom'].includes(value) ? value : 'custom'),
    normalizeAgentHandoffPriority: value => (['low', 'normal', 'high'].includes(value) ? value : 'normal'),
    defaultAppUrl: 'https://noeis.example',
    now: () => new Date('2026-06-05T12:00:00.000Z')
  }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const create = await fetchJson(`${baseUrl}/api/agent-task-links`, {
      method: 'POST',
      body: JSON.stringify({
        runtime: 'openclaw',
        title: 'Review wiki page',
        objective: 'Find gaps and draft changes.',
        taskType: 'qa',
        target: { type: 'wiki_page', id: 'page-1', title: 'Portfolio concentration' }
      })
    });
    assert.strictEqual(create.response.status, 201);
    assert(create.body.runUrl.includes('/a/run/at_'));
    assert.strictEqual(create.body.task.runtime, 'openclaw');

    const publicRead = await fetchJson(`${baseUrl}/api/agent-task-links/${create.body.task.taskId}`);
    assert.strictEqual(publicRead.response.status, 200);
    assert.strictEqual(publicRead.body.task.title, 'Review wiki page');

    const missingAgent = await fetchJson(`${baseUrl}/api/agent-task-links/${create.body.task.taskId}/dispatch`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(missingAgent.response.status, 409);
    assert.strictEqual(missingAgent.body.status, 'connection_required');
    assert.strictEqual(missingAgent.body.connectCommand, 'noeis connect openclaw');

    const agent = await PersonalAgent.create({
      userId: 'user-1',
      name: 'OpenClaw',
      status: 'active'
    });
    const dispatch = await fetchJson(`${baseUrl}/api/agent-task-links/${create.body.task.taskId}/dispatch`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(dispatch.response.status, 201);
    assert.strictEqual(dispatch.body.task.status, 'dispatched');
    assert.strictEqual(dispatch.body.handoff.title, 'Review wiki page');
    assert.deepStrictEqual(dispatch.body.handoff.requestedActor, {
      actorType: 'byo_agent',
      actorId: String(agent._id)
    });
    assert.strictEqual(AgentHandoff.rows.length, 1);
    assert.strictEqual(AgentThread.rows.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
