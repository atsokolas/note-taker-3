#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');

const clean = (value) => String(value || '').trim();

const parseArgs = (argv = []) => {
  const args = {
    baseUrl: process.env.AGENT_APPROVAL_SMOKE_BASE_URL || process.env.APP_BASE_URL || 'http://127.0.0.1:5001',
    token: process.env.AGENT_APPROVAL_SMOKE_TOKEN || process.env.JWT_TOKEN || '',
    action: process.env.AGENT_APPROVAL_SMOKE_ACTION || 'reject',
    threadId: process.env.AGENT_APPROVAL_SMOKE_THREAD_ID || `approval-smoke-${Date.now()}`,
    workspaceType: process.env.AGENT_APPROVAL_SMOKE_WORKSPACE_TYPE || 'workspace',
    workspaceId: process.env.AGENT_APPROVAL_SMOKE_WORKSPACE_ID || 'approval-smoke',
    note: process.env.AGENT_APPROVAL_SMOKE_NOTE || 'Approval smoke test rejection; no memory commit requested.',
    outputDir: process.env.AGENT_APPROVAL_SMOKE_OUTPUT_DIR || 'tmp/agent-approval-smoke-runs'
  };
  argv.forEach((arg) => {
    if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--token=')) args.token = arg.slice('--token='.length);
    else if (arg.startsWith('--action=')) args.action = arg.slice('--action='.length);
    else if (arg.startsWith('--thread-id=')) args.threadId = arg.slice('--thread-id='.length);
    else if (arg.startsWith('--workspace-type=')) args.workspaceType = arg.slice('--workspace-type='.length);
    else if (arg.startsWith('--workspace-id=')) args.workspaceId = arg.slice('--workspace-id='.length);
    else if (arg.startsWith('--note=')) args.note = arg.slice('--note='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = arg.slice('--output-dir='.length);
  });
  args.action = clean(args.action).toLowerCase() || 'reject';
  return args;
};

const requestJson = async ({ fetchFn = fetch, baseUrl = '', token = '', method = 'GET', path = '', body = null } = {}) => {
  const url = `${clean(baseUrl).replace(/\/+$/, '')}${path}`;
  const response = await fetchFn(url, {
    method,
    headers: {
      Authorization: `Bearer ${clean(token)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed with ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const runMemoryApprovalSmoke = async ({ fetchFn = fetch, ...input } = {}) => {
  const args = { ...parseArgs([]), ...input };
  if (!clean(args.token)) {
    throw Object.assign(new Error('AGENT_APPROVAL_SMOKE_TOKEN or --token is required.'), { status: 400 });
  }
  if (!['create', 'reject', 'approve'].includes(args.action)) {
    throw Object.assign(new Error('--action must be create, reject, or approve.'), { status: 400 });
  }

  const createPayload = await requestJson({
    fetchFn,
    baseUrl: args.baseUrl,
    token: args.token,
    method: 'POST',
    path: '/api/agent/memory-approvals',
    body: {
      threadId: args.threadId,
      workspaceType: args.workspaceType,
      workspaceId: args.workspaceId,
      sourceIdPrefix: `approval-smoke:${args.threadId}`,
      updates: [
        {
          type: 'current_focus',
          text: `Approval smoke test for ${args.threadId}.`
        },
        {
          type: 'next_move',
          text: 'Verify the Memory approvals queue and protocol decision path.'
        }
      ]
    }
  });

  const listPayload = await requestJson({
    fetchFn,
    baseUrl: args.baseUrl,
    token: args.token,
    path: `/api/agent/protocol/approvals?status=pending&op=memory.commit&threadId=${encodeURIComponent(args.threadId)}`
  });
  const listedApproval = Array.isArray(listPayload.approvals) ? listPayload.approvals[0] : null;
  const approvalId = clean(createPayload?.approval?.approvalId || createPayload?.approval?._id || listedApproval?.approvalId);
  if (!approvalId) {
    throw Object.assign(new Error('Memory approval was created but no approval id was returned or listed.'), { status: 500 });
  }

  let decisionPayload = null;
  if (args.action === 'approve') {
    decisionPayload = await requestJson({
      fetchFn,
      baseUrl: args.baseUrl,
      token: args.token,
      method: 'POST',
      path: `/api/agent/protocol/approvals/${encodeURIComponent(approvalId)}/approve`,
      body: {}
    });
  } else if (args.action === 'reject') {
    decisionPayload = await requestJson({
      fetchFn,
      baseUrl: args.baseUrl,
      token: args.token,
      method: 'POST',
      path: `/api/agent/protocol/approvals/${encodeURIComponent(approvalId)}/reject`,
      body: { note: args.note }
    });
  }

  return {
    action: args.action,
    baseUrl: args.baseUrl,
    threadId: args.threadId,
    workspaceType: args.workspaceType,
    workspaceId: args.workspaceId,
    approvalId,
    created: createPayload,
    listedCount: Array.isArray(listPayload.approvals) ? listPayload.approvals.length : 0,
    decision: decisionPayload
  };
};

const writeSmokeReport = async ({ result = {}, outputDir = 'tmp/agent-approval-smoke-runs' } = {}) => {
  const absoluteDir = path.resolve(process.cwd(), outputDir);
  await fs.mkdir(absoluteDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(absoluteDir, `${stamp}-memory-approval-smoke.json`);
  await fs.writeFile(filePath, JSON.stringify({
    createdAt: new Date().toISOString(),
    ok: true,
    ...result,
    created: result?.created ? {
      approval: result.created.approval,
      preview: result.created.preview
    } : null,
    decision: result?.decision ? {
      approval: result.decision.approval,
      result: result.decision.result
    } : null
  }, null, 2), 'utf8');
  return filePath;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const result = await runMemoryApprovalSmoke(args);
  const reportPath = await writeSmokeReport({ result, outputDir: args.outputDir });
  console.log('agent memory approval smoke');
  console.log(`threadId=${result.threadId}`);
  console.log(`approvalId=${result.approvalId}`);
  console.log(`action=${result.action}`);
  console.log(`listedPending=${result.listedCount}`);
  if (result.decision?.approval?.status) console.log(`decisionStatus=${result.decision.approval.status}`);
  console.log(`report=${reportPath}`);
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error?.payload || error);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  requestJson,
  runMemoryApprovalSmoke,
  writeSmokeReport
};
