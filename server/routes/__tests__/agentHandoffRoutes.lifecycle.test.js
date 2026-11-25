const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');

const { buildAgentHandoffRouter } = require('../agentHandoffRoutes');
const protocol = require('../../services/agentProtocol');
const { buildAgentPlanner } = require('../../services/agentWorkerRoles');
const { normalizeThreadCheckpoint, appendThreadMessage, sanitizeAgentThreadDoc } = require('../../services/agentThreadState');

// A handoff's life through the reader's own routes, with the real rules and
// an in-memory store in place of Mongo.
const memoryModel = () => {
  const rows = [];
  const matches = (row, query) => Object.entries(query).every(([key, value]) => String(row[key]) === String(value));
  const withSave = row => Object.assign(row, { save: async () => { row.updatedAt = new Date(); return row; } });
  return {
    rows,
    create: async (doc) => {
      const row = withSave({ _id: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date(), ...doc });
      rows.push(row);
      return row;
    },
    findOne: async query => rows.find(row => matches(row, query)) || null
  };
};

const start = async () => {
  const AgentHandoff = memoryModel();
  const AgentThread = memoryModel();
  const approvals = [];
  const app = express();
  app.use(express.json());
  app.use(buildAgentHandoffRouter({
    mongoose,
    authenticateToken: (req, _res, next) => { req.user = { id: String(req.headers['x-reader']) }; next(); },
    authenticatePersonalAgentKey: (_req, res) => res.status(401).end(),
    normalizeHandoffPayload: protocol.normalizeHandoffPayload,
    normalizeAgentHandoffTaskType: protocol.normalizeAgentHandoffTaskType,
    normalizeAgentHandoffPriority: protocol.normalizeAgentHandoffPriority,
    parseOptionalDate: protocol.parseOptionalDate,
    resolveAndValidateActorIdentity: protocol.resolveAndValidateActorIdentity,
    AgentHandoff,
    AgentThread,
    sanitizeAgentHandoffDoc: protocol.sanitizeAgentHandoffDoc,
    sanitizeAgentThreadDoc,
    AGENT_HANDOFF_STATUSES: protocol.AGENT_HANDOFF_STATUSES,
    AGENT_HANDOFF_TASK_TYPES: protocol.AGENT_HANDOFF_TASK_TYPES,
    normalizeAgentActorType: protocol.normalizeAgentActorType,
    safeAgentHandoffLimit: protocol.safeAgentHandoffLimit,
    getUserAgentProtocolPolicy: async () => ({}),
    resolveAutoHandoffRequestedActor: async () => ({ actorType: 'native_agent', actorId: '' }),
    shouldRequireProtocolApproval: protocol.shouldRequireProtocolApproval,
    requestProtocolApproval: async (approval) => { approvals.push(approval); return { approvalId: `approval-${approvals.length}`, op: approval.op }; },
    triggerProtocolHookPhase: async () => null,
    canActorMutateClaimedHandoff: protocol.canActorMutateClaimedHandoff,
    canActorClaimHandoff: protocol.canActorClaimHandoff,
    appendHandoffEvent: protocol.appendHandoffEvent,
    buildDefaultHandoffPlan: protocol.buildDefaultHandoffPlan,
    buildDefaultHandoffCheckpoint: protocol.buildDefaultHandoffCheckpoint,
    buildAgentPlanner,
    createThreadForHandoff: ({ userId, title }) => AgentThread.create({ userId, title, status: 'active', messages: [] }),
    normalizeThreadCheckpoint,
    appendThreadMessage
  }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/agent/protocol/handoffs`;
  const call = async (path, body, reader = 'reader-1') => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-reader': reader },
      body: JSON.stringify(body || {})
    });
    return { status: response.status, body: await response.json() };
  };
  return { AgentHandoff, AgentThread, approvals, call, close: () => new Promise(resolve => server.close(resolve)) };
};

test('a handoff is created pending, with its plan, first event and a linked thread', async () => {
  const app = await start();
  try {
    const { status, body } = await app.call('', { title: 'Summarise the filings', taskType: 'research', objective: 'Read the 10-K' });
    assert.equal(status, 201);
    const { handoff } = body;
    assert.equal(handoff.status, 'pending');
    assert.equal(handoff.taskType, 'research');
    assert.deepEqual(handoff.requestedActor, { actorType: 'native_agent', actorId: '' });
    assert.deepEqual(handoff.createdBy, { actorType: 'user', actorId: 'reader-1' });
    assert.deepEqual(handoff.events.map(event => event.eventType), ['created']);
    assert.ok(handoff.plan.steps.length > 0, 'a handoff starts with a plan');
    assert.equal(handoff.threadId, String(app.AgentThread.rows[0]._id));
  } finally { await app.close(); }
});

test('a handoff needs a title and a real due date', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('', { objective: 'no title' })).status, 400);
    assert.equal((await app.call('', { title: 'Soon', dueAt: 'not a date' })).status, 400);
    assert.deepEqual(await app.call('', { title: { $gt: '' } }), { status: 400, body: { error: 'title must be text.' } });
    assert.equal((await app.call('', { title: 'Ok', context: 'not an object' })).status, 400);
    assert.equal(app.AgentHandoff.rows.length, 0);
  } finally { await app.close(); }
});

test('only the requested kind of actor may claim, and an agent claim waits for the reader', async () => {
  const app = await start();
  try {
    const { body } = await app.call('', { title: 'For an agent' });
    const id = body.handoff.handoffId;

    const byReader = await app.call(`/${id}/claim`, {});
    assert.equal(byReader.status, 403, 'the reader is not the native agent it was handed to');

    const byAgent = await app.call(`/${id}/claim`, { actorType: 'native_agent', actorId: 'agent-a' });
    assert.equal(byAgent.status, 202);
    assert.equal(byAgent.body.status, 'approval_required');
    assert.equal(app.approvals[0].op, 'handoffs.claim');
    assert.equal(app.AgentHandoff.rows[0].status, 'pending', 'nothing changes until the reader approves');
  } finally { await app.close(); }
});

test('a handoff to the reader is claimed, claimed again harmlessly, completed once', async () => {
  const app = await start();
  try {
    const { body } = await app.call('', { title: 'Mine to do', requestedActor: { actorType: 'user', actorId: 'reader-1' } });
    const id = body.handoff.handoffId;

    const claimed = await app.call(`/${id}/claim`, { note: 'on it' });
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.handoff.status, 'claimed');
    assert.deepEqual(claimed.body.handoff.claimedBy, { actorType: 'user', actorId: 'reader-1' });

    const again = await app.call(`/${id}/claim`, {});
    assert.equal(again.status, 200);
    assert.equal(again.body.handoff.events.filter(event => event.eventType === 'claimed').length, 1, 'a second claim adds no event');

    const done = await app.call(`/${id}/complete`, { output: { summary: 'Done' }, note: 'finished' });
    assert.equal(done.status, 200);
    assert.equal(done.body.handoff.status, 'completed');
    assert.deepEqual(done.body.handoff.output, { summary: 'Done' });
    assert.deepEqual(done.body.handoff.events.map(event => event.eventType), ['created', 'claimed', 'completed']);

    assert.equal((await app.call(`/${id}/complete`, {})).status, 400, 'only a claimed handoff can be completed');
    assert.equal((await app.call(`/${id}/claim`, {})).status, 400, 'a finished handoff cannot be claimed');
  } finally { await app.close(); }
});

test('the reader can cancel a pending handoff once, and its thread is archived', async () => {
  const app = await start();
  try {
    const { body } = await app.call('', { title: 'Never mind' });
    const id = body.handoff.handoffId;
    const cancelled = await app.call(`/${id}/cancel`, { note: 'changed my mind' });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.handoff.status, 'cancelled');
    assert.deepEqual(cancelled.body.handoff.cancelledBy, { actorType: 'user', actorId: 'reader-1' });
    assert.equal(app.AgentThread.rows[0].status, 'archived');
    assert.equal(app.AgentThread.rows[0].messages.at(-1).text, 'changed my mind');
    assert.equal((await app.call(`/${id}/cancel`, {})).status, 400);
  } finally { await app.close(); }
});

test('another reader cannot reach a handoff, and a bad id is refused', async () => {
  const app = await start();
  try {
    const { body } = await app.call('', { title: 'Private', requestedActor: { actorType: 'user', actorId: 'reader-1' } });
    const id = body.handoff.handoffId;
    for (const action of ['claim', 'complete', 'cancel']) {
      assert.equal((await app.call(`/${id}/${action}`, {}, 'reader-2')).status, 404, action);
    }
    assert.equal((await app.call('/not-an-id/claim', {})).status, 400);
    assert.equal(app.AgentHandoff.rows[0].status, 'pending');
  } finally { await app.close(); }
});
