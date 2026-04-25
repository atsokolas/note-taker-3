const assert = require('assert');

const {
  parseArgs,
  runMemoryApprovalSmoke,
  writeSmokeReport
} = require('./run_agent_memory_approval_smoke');

const run = async () => {
  const args = parseArgs([
    '--base-url=https://example.test',
    '--token=test-token',
    '--action=approve',
    '--thread-id=thread-1',
    '--output-dir=tmp/custom-approval-smoke'
  ]);
  assert.strictEqual(args.baseUrl, 'https://example.test');
  assert.strictEqual(args.token, 'test-token');
  assert.strictEqual(args.action, 'approve');
  assert.strictEqual(args.threadId, 'thread-1');
  assert.strictEqual(args.outputDir, 'tmp/custom-approval-smoke');

  const calls = [];
  const fetchFn = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/api/agent/memory-approvals')) {
      return {
        ok: true,
        json: async () => ({ approval: { approvalId: 'approval-1', op: 'memory.commit' } })
      };
    }
    if (url.includes('/api/agent/protocol/approvals?')) {
      return {
        ok: true,
        json: async () => ({ approvals: [{ approvalId: 'approval-1' }] })
      };
    }
    if (url.endsWith('/api/agent/protocol/approvals/approval-1/reject')) {
      return {
        ok: true,
        json: async () => ({ approval: { approvalId: 'approval-1', status: 'rejected' } })
      };
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await runMemoryApprovalSmoke({
    fetchFn,
    baseUrl: 'https://example.test/',
    token: 'test-token',
    action: 'reject',
    threadId: 'thread-1',
    workspaceType: 'workspace',
    workspaceId: 'workspace-1',
    note: 'Needs revision.'
  });
  assert.strictEqual(result.approvalId, 'approval-1');
  assert.strictEqual(result.action, 'reject');
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[0].options.method, 'POST');
  assert.ok(JSON.parse(calls[0].options.body).updates.length > 0);
  assert.deepStrictEqual(JSON.parse(calls[2].options.body), { note: 'Needs revision.' });

  const reportPath = await writeSmokeReport({
    result,
    outputDir: 'tmp/agent-approval-smoke-test-runs'
  });
  assert.ok(reportPath.endsWith('-memory-approval-smoke.json'));
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agent memory approval smoke cli tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
