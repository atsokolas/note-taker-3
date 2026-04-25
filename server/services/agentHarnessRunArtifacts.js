const fs = require('fs/promises');
const path = require('path');

const clean = (value) => String(value || '').trim();

const DEFAULT_RUN_DIR = 'tmp/agent-harness-runs';

const parseRunTimestamp = (fileName = '') => {
  const match = clean(fileName).match(/^(.+)-(mock|live)\.json$/);
  if (!match) return null;
  const normalized = match[1].replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1T$2:$3:$4.$5Z'
  );
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const safeReadJson = async (filePath = '') => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
};

const summarizeWorkflowResult = (result = {}) => ({
  id: clean(result.id),
  title: clean(result.title),
  route: clean(result.route),
  outputContract: clean(result.outputContract),
  fixtureSet: clean(result.fixtureSet) || 'synthetic',
  mode: clean(result.mode),
  ok: Boolean(result.ok),
  latencyMs: Number(result.latencyMs || 0),
  model: clean(result.model),
  provider: clean(result.provider),
  failure: result.ok ? '' : clean(result.validation?.message)
});

const summarizeRun = ({ fileName = '', filePath = '', markdownPath = '', parsed = {} } = {}) => {
  const timestamp = parseRunTimestamp(fileName);
  const summary = parsed.summary && typeof parsed.summary === 'object' ? parsed.summary : {};
  const mode = clean(parsed.mode) || clean(fileName).match(/-(mock|live)\.json$/)?.[1] || '';
  const runFixtureSet = clean(parsed.fixtureSet || summary.fixtureSet) || 'synthetic';
  const results = (Array.isArray(parsed.results) ? parsed.results : []).map((result) => ({
    ...summarizeWorkflowResult(result),
    mode,
    fixtureSet: clean(result.fixtureSet) || runFixtureSet
  }));
  return {
    fileName,
    filePath,
    markdownPath,
    mode,
    fixtureSet: runFixtureSet || clean(results?.[0]?.fixtureSet) || 'synthetic',
    createdAt: timestamp ? timestamp.toISOString() : '',
    total: Number(summary.total || results.length || 0),
    passed: Number(summary.passed || results.filter((result) => result.ok).length || 0),
    failed: Number(summary.failed || results.filter((result) => !result.ok).length || 0),
    passRate: Number(summary.passRate || 0),
    failures: Array.isArray(summary.failures) ? summary.failures : [],
    results
  };
};

const incrementAggregate = (target, key, result = {}) => {
  const safeKey = clean(key) || 'unknown';
  if (!target[safeKey]) {
    target[safeKey] = {
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      avgLatencyMs: 0,
      lastStatus: 'unknown'
    };
  }
  const bucket = target[safeKey];
  bucket.total += 1;
  bucket.passed += result.ok ? 1 : 0;
  bucket.failed += result.ok ? 0 : 1;
  bucket.avgLatencyMs += Number(result.latencyMs || 0);
  bucket.lastStatus = result.ok ? 'pass' : 'fail';
};

const aggregateKey = (...parts) => parts.map((part) => clean(part) || 'unknown').join(' | ');

const finalizeAggregates = (aggregates = {}) => {
  Object.values(aggregates).forEach((bucket) => {
    bucket.passRate = bucket.total > 0 ? Number((bucket.passed / bucket.total).toFixed(4)) : 0;
    bucket.avgLatencyMs = bucket.total > 0 ? Math.round(bucket.avgLatencyMs / bucket.total) : 0;
  });
  return aggregates;
};

const toSortedRows = (aggregates = {}, { limit = 20 } = {}) => (
  Object.entries(finalizeAggregates(aggregates))
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => (
      Number(right.passRate || 0) - Number(left.passRate || 0)
      || Number(left.avgLatencyMs || 0) - Number(right.avgLatencyMs || 0)
      || Number(right.total || 0) - Number(left.total || 0)
      || left.key.localeCompare(right.key)
    ))
    .slice(0, Math.max(1, Math.min(100, Number(limit || 20))))
);

const incrementFailureCount = (target, key) => {
  const safeKey = clean(key) || 'unknown failure';
  target[safeKey] = Number(target[safeKey] || 0) + 1;
};

const buildComparisonMatrices = (runs = []) => {
  const byRouteModelProvider = {};
  const byLiveRouteModelProvider = {};
  const byFixtureModelProvider = {};
  const byRouteFixture = {};
  const failureTypes = {};

  (Array.isArray(runs) ? runs : []).forEach((run) => {
    (Array.isArray(run.results) ? run.results : []).forEach((result) => {
      const modelProvider = aggregateKey(result.model, result.provider);
      incrementAggregate(byRouteModelProvider, aggregateKey(result.route, modelProvider), result);
      if (clean(run.mode || result.mode).toLowerCase() === 'live') {
        incrementAggregate(byLiveRouteModelProvider, aggregateKey(result.route, modelProvider), result);
      }
      incrementAggregate(byFixtureModelProvider, aggregateKey(run.fixtureSet || result.fixtureSet, modelProvider), result);
      incrementAggregate(byRouteFixture, aggregateKey(result.route, run.fixtureSet || result.fixtureSet), result);
      if (!result.ok) {
        incrementFailureCount(failureTypes, result.failure || 'validation failed');
      }
    });
  });

  return {
    byRouteModelProvider: toSortedRows(byRouteModelProvider),
    byLiveRouteModelProvider: toSortedRows(byLiveRouteModelProvider),
    byFixtureModelProvider: toSortedRows(byFixtureModelProvider),
    byRouteFixture: toSortedRows(byRouteFixture),
    failureTypes: Object.entries(failureTypes)
      .map(([message, count]) => ({ message, count }))
      .sort((left, right) => Number(right.count || 0) - Number(left.count || 0) || left.message.localeCompare(right.message))
      .slice(0, 20)
  };
};

const aggregateRuns = (runs = []) => {
  const workflows = {};
  const routes = {};
  const modelProviders = {};
  const fixtureSets = {};
  (Array.isArray(runs) ? runs : []).forEach((run) => {
    incrementAggregate(fixtureSets, run.fixtureSet, {
      ok: Number(run.failed || 0) === 0,
      latencyMs: (Array.isArray(run.results) ? run.results : [])
        .reduce((total, result) => total + Number(result.latencyMs || 0), 0)
    });
    (Array.isArray(run.results) ? run.results : []).forEach((result) => {
      incrementAggregate(workflows, result.id, result);
      incrementAggregate(routes, result.route, result);
      incrementAggregate(modelProviders, `${result.model}:${result.provider}`, result);
    });
  });
  return {
    workflows: finalizeAggregates(workflows),
    routes: finalizeAggregates(routes),
    modelProviders: finalizeAggregates(modelProviders),
    fixtureSets: finalizeAggregates(fixtureSets),
    comparisons: buildComparisonMatrices(runs)
  };
};

const getAgentHarnessRunHistorySnapshot = async ({
  runDir = process.env.AGENT_HARNESS_RUN_DIR || DEFAULT_RUN_DIR,
  mode = 'all',
  limit = 20
} = {}) => {
  const absoluteDir = path.resolve(process.cwd(), clean(runDir) || DEFAULT_RUN_DIR);
  const safeMode = clean(mode).toLowerCase();
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit || 20))));
  let entries = [];
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        runDir: absoluteDir,
        totalRuns: 0,
        latestRun: null,
        runs: [],
        aggregates: aggregateRuns([])
      };
    }
    throw error;
  }

  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => ({
      fileName: entry.name,
      filePath: path.join(absoluteDir, entry.name),
      markdownPath: path.join(absoluteDir, entry.name.replace(/\.json$/, '.md')),
      timestamp: parseRunTimestamp(entry.name)
    }))
    .filter((entry) => entry.timestamp)
    .filter((entry) => {
      if (!safeMode || safeMode === 'all') return true;
      return entry.fileName.endsWith(`-${safeMode}.json`);
    })
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

  const runs = [];
  for (const file of jsonFiles.slice(0, safeLimit)) {
    const parsed = await safeReadJson(file.filePath);
    if (!parsed) continue;
    runs.push(summarizeRun({ ...file, parsed }));
  }

  return {
    runDir: absoluteDir,
    totalRuns: jsonFiles.length,
    latestRun: runs[0] || null,
    runs,
    aggregates: aggregateRuns(runs)
  };
};

module.exports = {
  DEFAULT_RUN_DIR,
  getAgentHarnessRunHistorySnapshot,
  aggregateRuns,
  buildComparisonMatrices,
  summarizeWorkflowResult,
  parseRunTimestamp
};
