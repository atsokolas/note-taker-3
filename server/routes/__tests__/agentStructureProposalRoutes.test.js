const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildAgentStructureProposalRouter } = require('../agentStructureProposalRoutes');

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

const run = async () => {
  const trackedEvents = [];
  const reconciledRunIds = [];

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-structure-1';
    next();
  });
  app.use(buildAgentStructureProposalRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    AgentRun: {},
    AgentProposedChange: {},
    AgentStructureProposal: {
      find() {
        return {
          sort() {
            return {
              limit() {
                return [
                  {
                    _id: 'plan-list-1',
                    status: 'pending',
                    scope: 'surface',
                    scopeRef: 'notebook',
                    sourceThreadId: 'thread-1',
                    operations: []
                  }
                ];
              }
            };
          }
        };
      }
    },
    NotebookFolder: {},
    NotebookEntry: {},
    listStructureProposals: async () => ([
      {
        structureProposalId: 'plan-list-1',
        status: 'pending',
        scope: 'surface',
        scopeRef: 'notebook',
        sourceThreadId: 'thread-1',
        operations: []
      }
    ]),
    updateStructureProposalDraft: async ({ structureProposalId, updates }) => ({
      _id: structureProposalId,
      status: 'pending',
      title: updates.title || 'Edited plan',
      scope: 'surface',
      scopeRef: 'notebook',
      operations: [
        {
          opId: 'move-1',
          status: 'rejected',
          type: 'move_item',
          targetDomain: 'notebook',
          payload: { destinationFolderId: 'folder-b' },
          preview: {}
        }
      ]
    }),
    applyStoredStructureProposal: async ({ structureProposalId }) => ({
      _id: structureProposalId,
      sourceThreadId: 'thread-1',
      sourceRunId: 'run-apply',
      status: 'applied',
      scope: 'surface',
      scopeRef: 'notebook',
      operations: [],
      executionResult: {
        status: 'applied',
        appliedCount: 2,
        skippedCount: 0,
        failedCount: 0,
        totalCount: 2
      }
    }),
    rejectStructureProposal: async ({ structureProposalId }) => ({
      _id: structureProposalId,
      sourceThreadId: 'thread-1',
      sourceRunId: 'run-reject',
      status: 'rejected',
      scope: 'surface',
      scopeRef: 'notebook',
      operations: []
    }),
    rollbackStoredStructureProposal: async ({ structureProposalId }) => ({
      _id: structureProposalId,
      sourceThreadId: 'thread-1',
      sourceRunId: 'run-rollback',
      status: 'rolled_back',
      scope: 'surface',
      scopeRef: 'notebook',
      operations: []
    }),
    reconcileAgentRunState: async ({ runId, AgentStructureProposal }) => {
      assert.ok(AgentStructureProposal, 'Structure proposal routes should pass AgentStructureProposal into run reconciliation.');
      reconciledRunIds.push(runId);
      return { _id: runId, status: 'awaiting_review' };
    },
    sanitizeAgentStructureProposalDoc: (doc = {}) => ({
      structureProposalId: String(doc._id || doc.structureProposalId || ''),
      sourceThreadId: String(doc.sourceThreadId || ''),
      sourceRunId: String(doc.sourceRunId || ''),
      status: String(doc.status || ''),
      scope: String(doc.scope || ''),
      scopeRef: String(doc.scopeRef || ''),
      executionResult: doc.executionResult || null,
      operations: Array.isArray(doc.operations) ? doc.operations : []
    }),
    trackEvent: (payload = {}) => {
      trackedEvents.push(payload);
    },
    EVENT_NAMES: {
      AGENT_STRUCTURE_PLAN_APPLIED: 'agent_structure_plan_applied',
      AGENT_STRUCTURE_PLAN_REJECTED: 'agent_structure_plan_rejected',
      AGENT_STRUCTURE_PLAN_ROLLED_BACK: 'agent_structure_plan_rolled_back'
    }
  }));

  const { server, url } = await listen(app);
  try {
    const listResponse = await fetch(`${url}/api/agent/structure-proposals?threadId=thread-1`);
    const listPayload = await listResponse.json();
    assert.strictEqual(listResponse.status, 200);
    assert.strictEqual(listPayload.proposals.length, 1);
    assert.strictEqual(listPayload.proposals[0].structureProposalId, 'plan-list-1');

    const patchResponse = await fetch(`${url}/api/agent/structure-proposals/plan-edit`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Edited plan',
        operations: [{ opId: 'move-1', status: 'rejected', payload: { destinationFolderId: 'folder-b' } }]
      })
    });
    const patchPayload = await patchResponse.json();
    assert.strictEqual(patchResponse.status, 200);
    assert.strictEqual(patchPayload.proposal.structureProposalId, 'plan-edit');
    assert.strictEqual(patchPayload.proposal.operations[0].status, 'rejected');

    const applyResponse = await fetch(`${url}/api/agent/structure-proposals/plan-apply/apply`, {
      method: 'POST'
    });
    const applyPayload = await applyResponse.json();
    assert.strictEqual(applyResponse.status, 200);
    assert.strictEqual(applyPayload.proposal.status, 'applied');
    assert.strictEqual(applyPayload.proposal.executionResult.appliedCount, 2);

    const rejectResponse = await fetch(`${url}/api/agent/structure-proposals/plan-reject/reject`, {
      method: 'POST'
    });
    const rejectPayload = await rejectResponse.json();
    assert.strictEqual(rejectResponse.status, 200);
    assert.strictEqual(rejectPayload.proposal.status, 'rejected');

    const rollbackResponse = await fetch(`${url}/api/agent/structure-proposals/plan-rollback/rollback`, {
      method: 'POST'
    });
    const rollbackPayload = await rollbackResponse.json();
    assert.strictEqual(rollbackResponse.status, 200);
    assert.strictEqual(rollbackPayload.proposal.status, 'rolled_back');

    assert.deepStrictEqual(
      reconciledRunIds,
      ['run-apply', 'run-reject', 'run-rollback']
    );
    assert.deepStrictEqual(
      trackedEvents.map((entry) => entry.event),
      [
        'agent_structure_plan_applied',
        'agent_structure_plan_rejected',
        'agent_structure_plan_rolled_back'
      ]
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentStructureProposalRoutes tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
