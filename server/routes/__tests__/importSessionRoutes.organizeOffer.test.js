const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildImportSessionRouter } = require('../importSessionRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve({
      server,
      url: `http://127.0.0.1:${address.port}`
    });
  });
});

const matchesQuery = (row, query = {}) => Object.entries(query).every(([key, expected]) => {
  const actual = row?.[key];
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (Array.isArray(expected.$in)) {
      return expected.$in.map(String).includes(String(actual || ''));
    }
    if (Array.isArray(expected.$nin)) {
      return !expected.$nin.map(String).includes(String(actual || ''));
    }
  }
  return String(actual || '') === String(expected || '');
});

const buildChain = (rows = []) => ({
  sort() {
    return {
      limit(limit) {
        const limited = rows.slice(0, limit);
        return {
          lean: async () => limited.map((row) => ({ ...row }))
        };
      },
      lean: async () => rows.map((row) => ({ ...row }))
    };
  },
  limit(limit) {
    return {
      lean: async () => rows.slice(0, limit).map((row) => ({ ...row }))
    };
  },
  lean: async () => rows.map((row) => ({ ...row }))
});

const createImportSessionModel = (rows = []) => {
  const state = rows.map((row) => ({ ...row }));

  return {
    state,
    find(query = {}) {
      return buildChain(state.filter((row) => matchesQuery(row, query)));
    },
    findOne(query = {}) {
      const rowsForQuery = state.filter((row) => matchesQuery(row, query));
      return {
        sort() {
          return {
            lean: async () => (rowsForQuery[0] ? { ...rowsForQuery[0] } : null)
          };
        },
        then(resolve) {
          const row = rowsForQuery[0];
          const doc = row
            ? {
                ...row,
                async save() {
                  const index = state.findIndex((entry) => String(entry._id) === String(this._id));
                  state[index] = { ...state[index], ...this };
                  return this;
                },
                toObject() {
                  return { ...this, save: undefined, toObject: undefined };
                }
              }
            : null;
          return Promise.resolve(resolve(doc));
        }
      };
    }
  };
};

const run = async () => {
  const ImportSession = createImportSessionModel([
    {
      _id: 'session-stale',
      userId: 'user-1',
      provider: 'notion',
      mode: 'oauth',
      status: 'completed',
      sourceLabel: 'Stale import',
      recommendedNextAction: 'organize_import',
      agentSuggestions: [
        {
          type: 'organize_import',
          status: 'dismissed',
          label: 'Organize this import'
        }
      ]
    },
    {
      _id: 'session-pending',
      userId: 'user-1',
      provider: 'readwise',
      mode: 'oauth',
      status: 'completed',
      sourceLabel: 'Pending import',
      recommendedNextAction: 'organize_import',
      agentSuggestions: [
        {
          type: 'organize_import',
          status: 'pending',
          label: 'Organize this import',
          summary: 'Clean up imported material.',
          structureProposalId: 'proposal-1'
        }
      ]
    }
  ]);

  const app = express();
  app.use(express.json());
  app.use(buildImportSessionRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    ImportSession
  }));

  const { server, url } = await listen(app);
  try {
    const activeResponse = await fetch(`${url}/api/import/sessions/active`);
    const activePayload = await activeResponse.json();
    assert.strictEqual(activeResponse.status, 200);
    assert.strictEqual(activePayload.session.id, 'session-pending');
    assert.strictEqual(activePayload.session.recommendedNextAction, 'organize_import');
    assert.strictEqual(activePayload.session.agentSuggestions[0].structureProposalId, 'proposal-1');

    const activeListResponse = await fetch(`${url}/api/import/sessions?status=active`);
    const activeListPayload = await activeListResponse.json();
    assert.strictEqual(activeListResponse.status, 200);
    assert.strictEqual(activeListPayload.sessions.length, 1);
    assert.strictEqual(activeListPayload.sessions[0].id, 'session-pending');

    const patchResponse = await fetch(`${url}/api/import/sessions/session-pending`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recommendedNextAction: 'organize_import',
        agentSuggestions: [
          {
            type: 'organize_import',
            status: 'applied',
            label: 'Organize this import'
          }
        ]
      })
    });
    const patchPayload = await patchResponse.json();
    assert.strictEqual(patchResponse.status, 200);
    assert.strictEqual(patchPayload.session.recommendedNextAction, '');
    assert.strictEqual(patchPayload.session.agentSuggestions[0].status, 'applied');

    const activeAfterPatchResponse = await fetch(`${url}/api/import/sessions/active`);
    const activeAfterPatchPayload = await activeAfterPatchResponse.json();
    assert.strictEqual(activeAfterPatchResponse.status, 200);
    assert.strictEqual(activeAfterPatchPayload.session, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('importSessionRoutes organize offer test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
