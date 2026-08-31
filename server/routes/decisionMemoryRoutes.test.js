const assert = require('assert');
const express = require('express');
const { buildDecisionMemoryRouter } = require('./decisionMemoryRoutes');

const PAGE_ID = '64f500000000000000000010';
const calls = [];
const app = express();
app.use(express.json());
app.use(buildDecisionMemoryRouter({
  authenticateToken: (req, _res, next) => {
    if (!req.headers.authorization) return _res.status(401).json({ error: 'Sign in.' });
    req.user = { id: 'user-1' };
    next();
  },
  readCase: async (input) => {
    calls.push(['memory', input]);
    if (input.userId !== 'user-1') return { visibility: 'public', why: undefined, claim: 'Public sentence.' };
    return { visibility: 'owner', why: ['PRIVATE_WHY'], claim: 'Held sentence.' };
  },
  readCaseAdapter: async (input) => {
    calls.push(['adapter', input]);
    return { adapter: { id: 'held-sentence' }, projection: { chain: { claim: 'Held sentence.' } } };
  },
  readCaseAudit: async (input) => {
    calls.push(['audit', input]);
    return { schema: 'decision-memory.v1', events: [{ action: 'write' }] };
  },
  readCaseCalibration: async (input) => {
    calls.push(['calibration', input]);
    return { private: true, ownerId: input.userId, cases: [] };
  },
  exportCases: async (input) => {
    calls.push(['export', input]);
    return { kind: 'institution-export', digest: 'abc', cases: [] };
  },
  importCases: async (input) => {
    calls.push(['import', input]);
    return { ok: true, digest: input.bundle?.digest };
  }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = 'GET', body, token = 'human' } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { response, body: await response.json() };
  };
  try {
    assert.strictEqual((await request(`/api/decision-memory/v1/cases/${PAGE_ID}`, { token: '' })).response.status, 401);
    const memory = await request(`/api/decision-memory/v1/cases/${PAGE_ID}`);
    assert.strictEqual(memory.response.status, 200);
    assert.strictEqual(memory.body.memory.visibility, 'owner');
    assert.ok(memory.body.memory.why.includes('PRIVATE_WHY'));
    const adapter = await request(`/api/decision-memory/v1/cases/${PAGE_ID}/adapter`);
    assert.strictEqual(adapter.body.adapter.id, 'held-sentence');
    const calibration = await request('/api/decision-memory/v1/calibration');
    assert.strictEqual(calibration.body.calibration.private, true);
    const exported = await request('/api/decision-memory/v1/export');
    assert.strictEqual(exported.body.bundle.kind, 'institution-export');
    const imported = await request('/api/decision-memory/v1/import', {
      method: 'POST',
      body: { bundle: { digest: 'abc' } }
    });
    assert.strictEqual(imported.body.ok, true);
    assert.deepStrictEqual(calls.map((row) => row[0]), ['memory', 'adapter', 'calibration', 'export', 'import']);
    console.log('decisionMemoryRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
