const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildPersonalAgentRouter } = require('../personalAgentRoutes');

const AGENT_ID = '64a000000000000000000001';

const run = async () => {
  const saved = { created: [], updated: [] };
  const app = express();
  app.use(express.json());
  app.use(buildPersonalAgentRouter({
    mongoose: { Types: { ObjectId: { isValid: value => /^[a-f0-9]{24}$/i.test(String(value || '')) } } },
    authenticateToken: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
    PersonalAgent: {
      async create(doc) { saved.created.push(doc); return { _id: AGENT_ID, ...doc }; },
      async findOneAndUpdate(_filter, updates) { saved.updated.push(updates); return { _id: AGENT_ID, ...updates }; }
    },
    sanitizePersonalAgent: doc => doc,
    normalizePersonalAgentCapabilities: input => input,
    normalizePersonalAgentWorkerRoles: input => input,
    createPersonalAgentApiKey: () => 'pa_test_key_value',
    hashPersonalAgentApiKey: key => `hash:${key}`,
    normalizePersonalAgentStatus: value => value
  }));

  const server = await new Promise(resolve => { const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/agents/personal`;
  const send = async (method, path, body) => {
    const response = await fetch(`${url}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const created = await send('POST', '', { name: 'Charlie', persona: 'Munger' });
    assert.strictEqual(created.status, 201);
    assert.strictEqual(saved.created[0].persona, 'munger', 'An agent can be given the Munger mind when it is made.');

    assert.strictEqual((await send('POST', '', { name: 'Plain' })).status, 201);
    assert.strictEqual(saved.created[1].persona, '', 'Without one, an agent has no persona.');

    const unknown = await send('POST', '', { name: 'Ghost', persona: 'keynes' });
    assert.strictEqual(unknown.status, 400, 'A persona outside the catalog is refused.');
    assert.match(unknown.body.error, /munger/);
    assert.strictEqual(saved.created.length, 2, 'Nothing is made from a refused persona.');

    const changed = await send('PATCH', `/${AGENT_ID}`, { persona: 'munger' });
    assert.strictEqual(changed.status, 200);
    assert.strictEqual(changed.body.agent.persona, 'munger');

    assert.strictEqual((await send('PATCH', `/${AGENT_ID}`, { persona: '' })).status, 200);
    assert.strictEqual(saved.updated[1].persona, '', 'A persona can be taken away.');

    assert.strictEqual((await send('PATCH', `/${AGENT_ID}`, { persona: 'keynes' })).status, 400);
    assert.strictEqual(saved.updated.length, 2, 'An unknown persona changes nothing.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => console.log('personalAgentRoutes tests passed'))
    .catch((error) => { console.error(error); process.exit(1); });
}

module.exports = { run };
