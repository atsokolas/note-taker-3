#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');

const { runAgentWorkflowHarness } = require('../server/agentHarness/runAgentWorkflowHarness');

const clean = (value) => String(value || '').trim();

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseList = (value = '') => (
  clean(value)
    .split(',')
    .map(clean)
    .filter(Boolean)
);

const parseArgs = (argv = []) => {
  const args = {
    includeLive: ['1', 'true', 'yes'].includes(clean(process.env.AGENT_HARNESS_INCLUDE_LIVE).toLowerCase()),
    minPassRate: parseNumber(process.env.AGENT_HARNESS_MIN_PASS_RATE, 1),
    maxFailures: parseNumber(process.env.AGENT_HARNESS_MAX_FAILURES, 0),
    maxControlledWriteFailures: parseNumber(process.env.AGENT_HARNESS_MAX_CONTROLLED_WRITE_FAILURES, 0),
    maxAvgLatencyMs: parseNumber(process.env.AGENT_HARNESS_MAX_AVG_LATENCY_MS, 0),
    outputDir: process.env.AGENT_HARNESS_OUTPUT_DIR || 'tmp/agent-harness-runs',
    reportDir: process.env.AGENT_HARNESS_REGRESSION_REPORT_DIR || 'tmp/agent-harness-regression-runs',
    liveWorkflows: parseList(process.env.AGENT_HARNESS_LIVE_WORKFLOWS || '')
  };
  argv.forEach((arg) => {
    if (arg === '--include-live') args.includeLive = true;
    else if (arg === '--no-live') args.includeLive = false;
    else if (arg.startsWith('--min-pass-rate=')) args.minPassRate = parseNumber(arg.slice('--min-pass-rate='.length), args.minPassRate);
    else if (arg.startsWith('--max-failures=')) args.maxFailures = parseNumber(arg.slice('--max-failures='.length), args.maxFailures);
    else if (arg.startsWith('--max-controlled-write-failures=')) {
      args.maxControlledWriteFailures = parseNumber(arg.slice('--max-controlled-write-failures='.length), args.maxControlledWriteFailures);
    } else if (arg.startsWith('--max-avg-latency-ms=')) {
      args.maxAvgLatencyMs = parseNumber(arg.slice('--max-avg-latency-ms='.length), args.maxAvgLatencyMs);
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    } else if (arg.startsWith('--report-dir=')) {
      args.reportDir = arg.slice('--report-dir='.length);
    } else if (arg.startsWith('--live-workflow=')) {
      args.liveWorkflows.push(...parseList(arg.slice('--live-workflow='.length)));
    }
  });
  return args;
};

const buildRegressionSuites = ({ includeLive = false, liveWorkflows = [] } = {}) => {
  const suites = [
    {
      name: 'synthetic_mock',
      mode: 'mock',
      fixtureSet: 'synthetic',
      workflowIds: [],
      integrationDryRun: false
    },
    {
      name: 'realistic_mock',
      mode: 'mock',
      fixtureSet: 'realistic',
      workflowIds: [],
      integrationDryRun: false
    },
    {
      name: 'realistic_integration_dry_run',
      mode: 'mock',
      fixtureSet: 'realistic',
      workflowIds: ['librarian', 'memory_steward'],
      integrationDryRun: true
    }
  ];

  if (includeLive) {
    suites.push({
      name: 'realistic_live',
      mode: 'live',
      fixtureSet: 'realistic',
      workflowIds: Array.isArray(liveWorkflows) ? liveWorkflows : [],
      integrationDryRun: true
    });
  }

  return suites;
};

const summarizeSuite = ({ suite = {}, result = {} } = {}) => {
  const safeResults = Array.isArray(result.results) ? result.results : [];
  const totalLatencyMs = safeResults.reduce((sum, row) => sum + Number(row.latencyMs || 0), 0);
  return {
    name: suite.name,
    mode: result.mode || suite.mode,
    fixtureSet: result.fixtureSet || result.summary?.fixtureSet || suite.fixtureSet,
    workflowIds: suite.workflowIds || [],
    total: Number(result.summary?.total || safeResults.length || 0),
    passed: Number(result.summary?.passed || 0),
    failed: Number(result.summary?.failed || 0),
    passRate: Number(result.summary?.passRate || 0),
    avgLatencyMs: safeResults.length ? Math.round(totalLatencyMs / safeResults.length) : 0,
    controlledWrites: result.summary?.controlledWrites || { total: 0, written: 0, skipped: 0, failed: 0 },
    failures: Array.isArray(result.summary?.failures) ? result.summary.failures : [],
    filePath: result.filePath || '',
    markdownPath: result.markdownPath || ''
  };
};

const evaluateRegressionThresholds = ({ suites = [], thresholds = {} } = {}) => {
  const minPassRate = parseNumber(thresholds.minPassRate, 1);
  const maxFailures = parseNumber(thresholds.maxFailures, 0);
  const maxControlledWriteFailures = parseNumber(thresholds.maxControlledWriteFailures, 0);
  const maxAvgLatencyMs = parseNumber(thresholds.maxAvgLatencyMs, 0);
  const failures = [];

  suites.forEach((suite) => {
    if (Number(suite.passRate || 0) < minPassRate) {
      failures.push(`${suite.name}: passRate ${suite.passRate} below ${minPassRate}`);
    }
    if (Number(suite.failed || 0) > maxFailures) {
      failures.push(`${suite.name}: failed ${suite.failed} above ${maxFailures}`);
    }
    if (Number(suite.controlledWrites?.failed || 0) > maxControlledWriteFailures) {
      failures.push(`${suite.name}: controlled write failures ${suite.controlledWrites.failed} above ${maxControlledWriteFailures}`);
    }
    if (maxAvgLatencyMs > 0 && Number(suite.avgLatencyMs || 0) > maxAvgLatencyMs) {
      failures.push(`${suite.name}: avg latency ${suite.avgLatencyMs}ms above ${maxAvgLatencyMs}ms`);
    }
  });

  return {
    ok: failures.length === 0,
    failures,
    thresholds: {
      minPassRate,
      maxFailures,
      maxControlledWriteFailures,
      maxAvgLatencyMs
    }
  };
};

const formatReportMarkdown = ({ suites = [], evaluation = {}, includeLive = false } = {}) => {
  const lines = [
    '# Agent Harness Regression Report',
    '',
    `- Include live: ${includeLive ? 'yes' : 'no'}`,
    `- Status: ${evaluation.ok ? 'pass' : 'fail'}`,
    `- Min pass rate: ${evaluation.thresholds?.minPassRate}`,
    '',
    '| Suite | Mode | Fixture | Passed | Pass rate | Avg latency | Controlled write failures |',
    '|---|---|---|---:|---:|---:|---:|'
  ];
  suites.forEach((suite) => {
    lines.push(`| ${suite.name} | ${suite.mode} | ${suite.fixtureSet} | ${suite.passed}/${suite.total} | ${suite.passRate} | ${suite.avgLatencyMs}ms | ${Number(suite.controlledWrites?.failed || 0)} |`);
  });
  if (evaluation.failures?.length > 0) {
    lines.push('', '## Failures', '');
    evaluation.failures.forEach((failure) => lines.push(`- ${failure}`));
  }
  return `${lines.join('\n')}\n`;
};

const writeRegressionReport = async ({ suites = [], evaluation = {}, args = {} } = {}) => {
  const absoluteDir = path.resolve(process.cwd(), args.reportDir || 'tmp/agent-harness-regression-runs');
  await fs.mkdir(absoluteDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(absoluteDir, `${stamp}-regression.json`);
  const markdownPath = path.join(absoluteDir, `${stamp}-regression.md`);
  const payload = {
    createdAt: new Date().toISOString(),
    includeLive: Boolean(args.includeLive),
    thresholds: evaluation.thresholds,
    ok: evaluation.ok,
    failures: evaluation.failures,
    suites
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.writeFile(markdownPath, formatReportMarkdown({ suites, evaluation, includeLive: args.includeLive }), 'utf8');
  return { filePath, markdownPath };
};

const runRegression = async (args = {}) => {
  const suites = [];
  for (const suite of buildRegressionSuites(args)) {
    const result = await runAgentWorkflowHarness({
      mode: suite.mode,
      fixtureSet: suite.fixtureSet,
      workflowIds: suite.workflowIds,
      outputDir: args.outputDir,
      integrationDryRun: suite.integrationDryRun
    });
    suites.push(summarizeSuite({ suite, result }));
  }

  const evaluation = evaluateRegressionThresholds({
    suites,
    thresholds: args
  });
  const report = await writeRegressionReport({ suites, evaluation, args });
  return { suites, evaluation, report };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const result = await runRegression(args);
  console.log('agent harness regression run');
  console.log(`includeLive=${args.includeLive ? 'true' : 'false'}`);
  result.suites.forEach((suite) => {
    console.log(`${suite.name}: passed=${suite.passed}/${suite.total} failed=${suite.failed} passRate=${suite.passRate}`);
  });
  console.log(`report=${result.report.filePath}`);
  console.log(`summary=${result.report.markdownPath}`);
  if (!result.evaluation.ok) {
    result.evaluation.failures.forEach((failure) => console.log(`FAIL ${failure}`));
    process.exit(1);
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.payload || error);
    process.exit(1);
  });
}

module.exports = {
  buildRegressionSuites,
  evaluateRegressionThresholds,
  formatReportMarkdown,
  parseArgs,
  runRegression,
  summarizeSuite
};
