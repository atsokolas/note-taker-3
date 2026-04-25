#!/usr/bin/env node
require('dotenv').config();

const { runAgentWorkflowHarness } = require('../server/agentHarness/runAgentWorkflowHarness');

const parseArgs = (argv = []) => {
  const args = {
    mode: 'mock',
    fixtureSet: process.env.AGENT_HARNESS_FIXTURE_SET || 'synthetic',
    workflows: [],
    outputDir: 'tmp/agent-harness-runs',
    integrationDryRun: false,
    controlledWriteMode: 'dry_run',
    writeApproved: false
  };
  argv.forEach((arg) => {
    if (arg === '--live') args.mode = 'live';
    else if (arg === '--mock') args.mode = 'mock';
    else if (arg === '--integration-dry-run') args.integrationDryRun = true;
    else if (arg === '--approve-writes') args.writeApproved = true;
    else if (arg.startsWith('--write-mode=')) args.controlledWriteMode = arg.slice('--write-mode='.length);
    else if (arg.startsWith('--fixture-set=')) args.fixtureSet = arg.slice('--fixture-set='.length);
    else if (arg.startsWith('--workflow=')) {
      args.workflows.push(...arg.slice('--workflow='.length).split(','));
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    }
  });
  return args;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const safeWriteMode = String(args.controlledWriteMode || 'dry_run').trim().toLowerCase().replace(/-/g, '_');
  let mongoose = null;
  let serviceModels = {};
  let result = null;
  try {
    if (!['', 'dry_run', 'dryrun', 'preview'].includes(safeWriteMode)) {
      if (!args.writeApproved) {
        throw new Error('Controlled writes require --approve-writes.');
      }
      if (!process.env.MONGODB_URI) {
        throw new Error('Controlled writes require MONGODB_URI.');
      }
      mongoose = require('mongoose');
      serviceModels = require('../server/models');
      await mongoose.connect(process.env.MONGODB_URI);
    }
    result = await runAgentWorkflowHarness({
      mode: args.mode,
      fixtureSet: args.fixtureSet,
      workflowIds: args.workflows,
      outputDir: args.outputDir,
      integrationDryRun: args.integrationDryRun,
      controlledWriteMode: args.controlledWriteMode,
      writeApproved: args.writeApproved,
      serviceModels,
      integrationOptions: {
        userId: process.env.AGENT_HARNESS_USER_ID || 'agent-harness-user',
        threadId: process.env.AGENT_HARNESS_THREAD_ID || 'agent-harness-thread',
        workspaceType: process.env.AGENT_HARNESS_WORKSPACE_TYPE || 'workspace',
        workspaceId: process.env.AGENT_HARNESS_WORKSPACE_ID || 'agent-harness'
      }
    });
  } finally {
    if (mongoose) await mongoose.disconnect();
  }

  console.log(`agent harness ${result.mode} run`);
  console.log(`fixtureSet=${result.fixtureSet || result.summary.fixtureSet || args.fixtureSet}`);
  console.log(`passed=${result.summary.passed}/${result.summary.total} failed=${result.summary.failed}`);
  if (result.summary.controlledWrites?.total > 0) {
    console.log(
      `controlledWrites=${result.summary.controlledWrites.written} written, ` +
      `${result.summary.controlledWrites.skipped} skipped, ${result.summary.controlledWrites.failed} failed`
    );
  }
  if (result.summary.failures.length > 0) {
    result.summary.failures.forEach((failure) => {
      console.log(`FAIL ${failure.id} route=${failure.route} ${failure.message}`);
    });
  }
  console.log(`results=${result.filePath}`);
  console.log(`summary=${result.markdownPath}`);

  if (result.summary.failed > 0 || Number(result.summary.controlledWrites?.failed || 0) > 0) process.exit(1);
};

run().catch((error) => {
  console.error(error?.payload || error);
  process.exit(1);
});
