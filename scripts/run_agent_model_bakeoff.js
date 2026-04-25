#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');

const {
  parseCandidateRoutes,
  runModelBakeoff
} = require('../server/agentHarness/modelBakeoff');

const clean = (value) => String(value || '').trim();

const parseList = (value = '') => (
  clean(value)
    .split(',')
    .map(clean)
    .filter(Boolean)
);

const parseArgs = (argv = []) => {
  const args = {
    fixtureSet: process.env.AGENT_BAKEOFF_FIXTURE_SET || 'realistic',
    workflowIds: parseList(process.env.AGENT_BAKEOFF_WORKFLOWS || ''),
    routeIds: parseList(process.env.AGENT_BAKEOFF_ROUTES || ''),
    candidates: parseCandidateRoutes(process.env.AGENT_BAKEOFF_CANDIDATES || '', process.env.HF_PROVIDER || ''),
    outputDir: process.env.AGENT_BAKEOFF_OUTPUT_DIR || 'tmp/agent-model-bakeoff-runs',
    outcomeTelemetryPath: process.env.AGENT_BAKEOFF_OUTCOME_TELEMETRY_PATH || '',
    outcomeTelemetryUrl: process.env.AGENT_BAKEOFF_OUTCOME_TELEMETRY_URL || '',
    outcomeTelemetryToken: process.env.AGENT_BAKEOFF_OUTCOME_TELEMETRY_TOKEN || process.env.AGENT_APPROVAL_SMOKE_TOKEN || '',
    minPassRate: process.env.AGENT_BAKEOFF_PROMOTION_MIN_PASS_RATE || '1',
    maxAvgLatencyMs: process.env.AGENT_BAKEOFF_PROMOTION_MAX_AVG_LATENCY_MS || '30000',
    minCases: process.env.AGENT_BAKEOFF_PROMOTION_MIN_CASES || '1',
    maxOutcomeOverpredicting: process.env.AGENT_BAKEOFF_PROMOTION_MAX_OVERPREDICTING || '0',
    failOnAlert: String(process.env.AGENT_BAKEOFF_FAIL_ON_ALERT || '').toLowerCase() === 'true'
  };
  argv.forEach((arg) => {
    if (arg.startsWith('--fixture-set=')) args.fixtureSet = arg.slice('--fixture-set='.length);
    else if (arg.startsWith('--workflow=')) args.workflowIds.push(...parseList(arg.slice('--workflow='.length)));
    else if (arg.startsWith('--route=')) args.routeIds.push(...parseList(arg.slice('--route='.length)));
    else if (arg.startsWith('--candidate=')) {
      args.candidates.push(...parseCandidateRoutes(arg.slice('--candidate='.length), process.env.HF_PROVIDER || ''));
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    } else if (arg.startsWith('--outcome-telemetry=')) {
      args.outcomeTelemetryPath = arg.slice('--outcome-telemetry='.length);
    } else if (arg.startsWith('--outcome-telemetry-url=')) {
      args.outcomeTelemetryUrl = arg.slice('--outcome-telemetry-url='.length);
    } else if (arg.startsWith('--outcome-telemetry-token=')) {
      args.outcomeTelemetryToken = arg.slice('--outcome-telemetry-token='.length);
    } else if (arg.startsWith('--promotion-min-pass-rate=')) {
      args.minPassRate = arg.slice('--promotion-min-pass-rate='.length);
    } else if (arg.startsWith('--promotion-max-avg-latency-ms=')) {
      args.maxAvgLatencyMs = arg.slice('--promotion-max-avg-latency-ms='.length);
    } else if (arg.startsWith('--promotion-min-cases=')) {
      args.minCases = arg.slice('--promotion-min-cases='.length);
    } else if (arg.startsWith('--promotion-max-overpredicting=')) {
      args.maxOutcomeOverpredicting = arg.slice('--promotion-max-overpredicting='.length);
    } else if (arg === '--fail-on-alert') {
      args.failOnAlert = true;
    }
  });
  return args;
};

const loadOutcomeTelemetry = (filePath = '') => {
  const safePath = clean(filePath);
  if (!safePath) return null;
  return JSON.parse(fs.readFileSync(safePath, 'utf8'));
};

const fetchOutcomeTelemetry = async ({
  fetchFn = fetch,
  url = '',
  token = ''
} = {}) => {
  const safeUrl = clean(url);
  if (!safeUrl) return null;
  const response = await fetchFn(safeUrl, {
    headers: clean(token) ? { Authorization: `Bearer ${clean(token)}` } : {}
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `Failed to fetch outcome telemetry (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const appendGitHubStepSummary = ({ result = {}, fsImpl = fs } = {}) => {
  const summaryPath = clean(process.env.GITHUB_STEP_SUMMARY);
  if (!summaryPath) return false;
  const lines = [
    '## Agent Model Bakeoff',
    '',
    `- Fixture set: ${result.fixtureSet || ''}`,
    `- Cases: ${Number(result.summary?.passed || 0)}/${Number(result.summary?.total || 0)} passed`,
    `- Pass rate: ${Number(result.summary?.passRate || 0)}`,
    `- Alerts: ${Array.isArray(result.alerts) ? result.alerts.length : 0}`,
    `- JSON: ${result.filePath || ''}`,
    `- Markdown: ${result.markdownPath || ''}`
  ];
  if (Array.isArray(result.promotion?.recommendations) && result.promotion.recommendations.length > 0) {
    lines.push('', '### Promotion Recommendations', '', '| Candidate | Decision | Pass rate | Avg latency | Blockers |', '|---|---|---:|---:|---|');
    result.promotion.recommendations.slice(0, 8).forEach((row) => {
      lines.push(`| ${row.candidate} | ${row.status} | ${row.passRate} | ${row.avgLatencyMs}ms | ${row.blockers.length ? row.blockers.join('; ') : 'none'} |`);
    });
  }
  if (Array.isArray(result.alerts) && result.alerts.length > 0) {
    lines.push('', '### Alerts', '');
    result.alerts.forEach((alert) => {
      lines.push(`- ${String(alert.level || 'info').toUpperCase()} ${alert.code}: ${alert.message}`);
    });
  }
  fsImpl.appendFileSync(summaryPath, `${lines.join('\n')}\n\n`, 'utf8');
  return true;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const outcomeTelemetry = loadOutcomeTelemetry(args.outcomeTelemetryPath)
    || await fetchOutcomeTelemetry({
      url: args.outcomeTelemetryUrl,
      token: args.outcomeTelemetryToken
    });
  const result = await runModelBakeoff({
    ...args,
    outcomeTelemetry,
    promotionPolicy: {
      minPassRate: args.minPassRate,
      maxAvgLatencyMs: args.maxAvgLatencyMs,
      minCases: args.minCases,
      maxOutcomeOverpredicting: args.maxOutcomeOverpredicting
    }
  });
  console.log('agent model bakeoff run');
  console.log(`fixtureSet=${result.fixtureSet}`);
  console.log(`workflows=${result.workflows.length}`);
  console.log(`candidates=${result.candidates.map((candidate) => `${candidate.model}:${candidate.provider}`).join(',')}`);
  console.log(`passed=${result.summary.passed}/${result.summary.total} failed=${result.summary.failed} passRate=${result.summary.passRate}`);
  result.summary.byCandidate.forEach((row) => {
    console.log(`candidate ${row.key}: ${row.passed}/${row.total} passRate=${row.passRate} avgLatencyMs=${row.avgLatencyMs}`);
  });
  if (result.outcomeComparison?.buckets?.length > 0) {
    console.log(`outcomeComparison=${result.outcomeComparison.buckets.length} rows`);
    result.outcomeComparison.buckets.slice(0, 5).forEach((row) => {
      console.log(`outcome ${row.bucketId} candidate=${row.candidate} real=${row.observedAcceptanceRate} bakeoff=${row.bakeoffPassRate} delta=${row.delta} status=${row.status}`);
    });
  }
  if (result.promotion?.recommendations?.length > 0) {
    result.promotion.recommendations.forEach((row) => {
      console.log(`promotion ${row.candidate}: ${row.status} passRate=${row.passRate} avgLatencyMs=${row.avgLatencyMs} blockers=${row.blockers.join(';') || 'none'}`);
    });
  }
  if (result.alerts?.length > 0) {
    result.alerts.forEach((alert) => {
      console.log(`ALERT ${alert.level} ${alert.code}: ${alert.message}`);
    });
  }
  if (result.summary.failures.length > 0) {
    result.summary.failures.forEach((failure) => {
      console.log(`FAIL ${failure.workflowId} route=${failure.route} candidate=${failure.model}:${failure.provider} ${failure.message}`);
    });
  }
  console.log(`results=${result.filePath}`);
  console.log(`summary=${result.markdownPath}`);
  appendGitHubStepSummary({ result });
  if (result.summary.failed > 0 || (args.failOnAlert && result.alerts?.length > 0)) process.exit(1);
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error?.payload || error);
    process.exit(1);
  });
}

module.exports = {
  appendGitHubStepSummary,
  fetchOutcomeTelemetry,
  loadOutcomeTelemetry,
  parseArgs
};
