const assert = require('assert');
const express = require('express');
const {
  ConceptDecisionLessonAdoptionError
} = require('../services/conceptDecisionLessonAdoptionService');
const { buildConceptDecisionLessonAdoptionRouter } = require('./conceptDecisionLessonAdoptionRoutes');

const USER_ID = '64f600000000000000000001';
const CONCEPT_ID = '64f600000000000000000010';
const PAGE_ID = '64f600000000000000000020';
const calls = [];
let mode = 'create';
const app = express();
app.use(express.json());
app.use(buildConceptDecisionLessonAdoptionRouter({
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer qa') return res.status(401).json({ error: 'Unauthorized' });
    if (req.headers['x-qa-missing-user'] !== '1') req.user = { id: USER_ID };
    if (req.headers['x-qa-agent'] === '1') req.agentToken = { id: 'agent' };
    if (req.headers['x-qa-personal-agent'] === '1') req.personalAgent = { id: 'personal' };
    next();
  },
  adoptLesson: async input => {
    calls.push(input);
    if (mode === 'conflict') {
      throw new ConceptDecisionLessonAdoptionError('Conflicting role.', 409, 'role_conflict');
    }
    return {
      idempotent: mode === 'replay',
      adoption: { id: 'adoption-1', role: input.role },
      receipt: { id: 'receipt-1' }
    };
  },
  SentinelModel: { marker: true }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const path = `/api/concepts/${CONCEPT_ID}/evidence/decision-lessons`;
  const body = {
    sourcePageId: PAGE_ID,
    decisionId: 'decision-1',
    lessonId: 'lesson-1',
    role: 'support',
    requestId: 'request-1',
    expectedDecisionHash: 'a'.repeat(64),
    expectedOutcomeHash: 'b'.repeat(64)
  };
  const send = async ({ payload = body, authorized = true, agent = false, personalAgent = false, missingUser = false } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorized ? { Authorization: 'Bearer qa' } : {}),
        ...(agent ? { 'x-qa-agent': '1' } : {}),
        ...(personalAgent ? { 'x-qa-personal-agent': '1' } : {}),
        ...(missingUser ? { 'x-qa-missing-user': '1' } : {})
      },
      body: JSON.stringify(payload)
    });
    return { response, body: await response.json() };
  };
  try {
    assert.strictEqual((await send({ authorized: false })).response.status, 401);
    assert.strictEqual((await send({ agent: true })).response.status, 403);
    assert.strictEqual((await send({ personalAgent: true })).response.status, 403);
    const missingUser = await send({ missingUser: true });
    assert.strictEqual(missingUser.response.status, 401);
    assert.strictEqual(missingUser.body.code, 'AUTH_REQUIRED');
    assert.strictEqual(calls.length, 0);

    const invalid = await fetch(`${base}/api/concepts/not-an-id/evidence/decision-lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer qa' },
      body: JSON.stringify(body)
    });
    assert.strictEqual(invalid.status, 400);
    assert.strictEqual((await send({ payload: { ...body, sourcePageId: 'bad' } })).response.status, 400);
    assert.strictEqual((await send({ payload: { ...body, lesson: 'client-authored' } })).response.status, 400);
    assert.strictEqual((await send({ payload: { ...body, provenance: { forged: true } } })).response.status, 400);
    assert.strictEqual((await send({ payload: { ...body, observedEvidenceRefs: [] } })).response.status, 400);
    assert.strictEqual((await send({ payload: { ...body, payloadHash: 'forged' } })).response.status, 400);
    assert.strictEqual(calls.length, 0);

    mode = 'create';
    const created = await send();
    assert.strictEqual(created.response.status, 201);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].userId, USER_ID);
    assert.strictEqual(calls[0].targetConceptId, CONCEPT_ID);
    assert.strictEqual(calls[0].models.SentinelModel.marker, true);

    mode = 'replay';
    assert.strictEqual((await send()).response.status, 200);

    mode = 'conflict';
    const conflict = await send();
    assert.strictEqual(conflict.response.status, 409);
    assert.strictEqual(conflict.body.code, 'role_conflict');

    console.log('conceptDecisionLessonAdoptionRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
