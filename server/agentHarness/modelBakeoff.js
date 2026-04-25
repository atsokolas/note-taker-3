const fs = require('fs/promises');
const path = require('path');

const { chatComplete, getConfig, __testables } = require('../ai/hfTextClient');
const { applyFixtureSetToSpecs, normalizeFixtureSet } = require('./fixtureSets');
const { WORKFLOW_SPECS } = require('./workflowSpecs');
const { buildMessages, buildResponseFormat } = require('./runAgentWorkflowHarness');
const { parseJson, validateWorkflowOutput } = require('./validators');

const clean = (value) => String(value || '').trim();
const parseRouteEntry = __testables?.parseRouteEntry || ((entry) => {
  const raw = clean(entry);
  const separator = raw.lastIndexOf(':');
  return separator > 0 ? { model: raw.slice(0, separator), provider: raw.slice(separator + 1) } : { model: raw, provider: '' };
});

const routeKey = (route = {}) => `${clean(route.model)}:${clean(route.provider)}`;
const OUTCOME_BUCKET_WORKFLOWS = Object.freeze({
  content_edits: ['editor', 'writing_copilot'],
  structure_plans: ['librarian'],
  artifact_drafts: ['synthesizer', 'research_planner'],
  agent_runs: []
});
const DEFAULT_PROMOTION_POLICY = Object.freeze({
  minPassRate: 1,
  maxAvgLatencyMs: 30000,
  minCases: 1,
  maxOutcomeOverpredicting: 0
});

const normalizeOutput = (output) => (
  typeof output === 'string' ? output : JSON.stringify(output)
);

const parseCandidateRoutes = (value = '', defaultProvider = '') => (
  clean(value)
    .split(',')
    .map((entry) => parseRouteEntry(entry, defaultProvider))
    .filter((entry) => clean(entry?.model))
);

const uniqueRoutes = (routes = []) => {
  const seen = new Set();
  const ordered = [];
  (Array.isArray(routes) ? routes : []).forEach((route) => {
    const parsed = parseRouteEntry(route);
    if (!clean(parsed?.model)) return;
    const key = routeKey(parsed);
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(parsed);
  });
  return ordered;
};

const selectBakeoffSpecs = ({
  workflowIds = [],
  routeIds = [],
  fixtureSet = 'realistic'
} = {}) => {
  const workflowFilter = new Set((Array.isArray(workflowIds) ? workflowIds : []).map(clean).filter(Boolean));
  const routeFilter = new Set((Array.isArray(routeIds) ? routeIds : []).map(clean).filter(Boolean));
  const selected = WORKFLOW_SPECS.filter((spec) => {
    if (workflowFilter.size > 0 && !workflowFilter.has(spec.id)) return false;
    if (routeFilter.size > 0 && !routeFilter.has(spec.route)) return false;
    return true;
  });
  return applyFixtureSetToSpecs(selected, normalizeFixtureSet(fixtureSet));
};

const getCandidateRoutesForSpecs = ({
  specs = [],
  candidates = [],
  provider = ''
} = {}) => {
  const explicit = uniqueRoutes(candidates);
  if (explicit.length > 0) return explicit;
  const config = getConfig();
  const routes = [];
  const routeIds = new Set((Array.isArray(specs) ? specs : []).map((spec) => clean(spec.route)).filter(Boolean));
  routeIds.forEach((routeId) => {
    const configured = Array.isArray(config.routeProfiles?.[routeId]) ? config.routeProfiles[routeId] : [];
    routes.push(...configured);
  });
  if (routes.length === 0 && config.model) {
    routes.push({ model: config.model, provider: provider || config.provider });
  }
  return uniqueRoutes(routes);
};

const runBakeoffCase = async ({
  spec = {},
  candidate = {},
  chatCompleteFn = chatComplete
} = {}) => {
  const startedAt = Date.now();
  const responseFormat = buildResponseFormat(spec.outputContract);
  try {
    const completion = await chatCompleteFn({
      modelRoutes: [candidate],
      messages: buildMessages(spec),
      temperature: 0.1,
      maxTokens: spec.outputContract === 'chat_response' ? 180 : 620,
      reasoningEffort: spec.route === 'deep_audit' ? 'medium' : 'low',
      responseFormat
    });
    const rawOutput = normalizeOutput(completion.text);
    const output = responseFormat ? parseJson(rawOutput) || rawOutput : rawOutput;
    const validation = validateWorkflowOutput({
      contract: spec.outputContract,
      output,
      quality: spec.quality
    });
    return {
      workflowId: spec.id,
      title: spec.title,
      route: spec.route,
      fixtureSet: spec.fixtureSet || 'synthetic',
      outputContract: spec.outputContract,
      model: completion.model || candidate.model,
      provider: completion.provider || candidate.provider,
      ok: validation.ok,
      latencyMs: Date.now() - startedAt,
      validation,
      output
    };
  } catch (error) {
    return {
      workflowId: spec.id,
      title: spec.title,
      route: spec.route,
      fixtureSet: spec.fixtureSet || 'synthetic',
      outputContract: spec.outputContract,
      model: clean(candidate.model),
      provider: clean(candidate.provider),
      ok: false,
      latencyMs: Date.now() - startedAt,
      validation: {
        ok: false,
        message: error?.payload?.message || error?.message || 'Bakeoff case failed'
      },
      output: null
    };
  }
};

const summarizeBakeoffResults = (results = []) => {
  const byCandidate = {};
  const byRouteCandidate = {};
  (Array.isArray(results) ? results : []).forEach((result) => {
    [
      [byCandidate, `${clean(result.model)}:${clean(result.provider)}`],
      [byRouteCandidate, `${clean(result.route)} | ${clean(result.model)}:${clean(result.provider)}`]
    ].forEach(([target, key]) => {
      if (!target[key]) {
        target[key] = {
          total: 0,
          passed: 0,
          failed: 0,
          passRate: 0,
          avgLatencyMs: 0
        };
      }
      target[key].total += 1;
      target[key].passed += result.ok ? 1 : 0;
      target[key].failed += result.ok ? 0 : 1;
      target[key].avgLatencyMs += Number(result.latencyMs || 0);
    });
  });
  const finalize = (rows = {}) => Object.entries(rows)
    .map(([key, value]) => ({
      key,
      ...value,
      passRate: value.total > 0 ? Number((value.passed / value.total).toFixed(4)) : 0,
      avgLatencyMs: value.total > 0 ? Math.round(value.avgLatencyMs / value.total) : 0
    }))
    .sort((left, right) => (
      Number(right.passRate || 0) - Number(left.passRate || 0)
      || Number(left.avgLatencyMs || 0) - Number(right.avgLatencyMs || 0)
      || left.key.localeCompare(right.key)
    ));

  const total = Array.isArray(results) ? results.length : 0;
  const passed = (Array.isArray(results) ? results : []).filter((result) => result.ok).length;
  return {
    total,
    passed,
    failed: total - passed,
    passRate: total > 0 ? Number((passed / total).toFixed(4)) : 0,
    byCandidate: finalize(byCandidate),
    byRouteCandidate: finalize(byRouteCandidate),
    failures: (Array.isArray(results) ? results : [])
      .filter((result) => !result.ok)
      .map((result) => ({
        workflowId: result.workflowId,
        route: result.route,
        model: result.model,
        provider: result.provider,
        message: result.validation?.message || 'Unknown failure'
      }))
  };
};

const normalizeOutcomeTelemetry = (value = {}) => {
  const source = value?.outcomeTelemetry && typeof value.outcomeTelemetry === 'object'
    ? value.outcomeTelemetry
    : value?.metrics?.outcomeTelemetry && typeof value.metrics.outcomeTelemetry === 'object'
      ? value.metrics.outcomeTelemetry
      : value && typeof value === 'object'
        ? value
        : {};
  const buckets = Array.isArray(source.buckets) ? source.buckets : [];
  return {
    buckets,
    summary: source.summary && typeof source.summary === 'object' ? source.summary : {}
  };
};

const buildOutcomeComparison = ({ results = [], outcomeTelemetry = {} } = {}) => {
  const telemetry = normalizeOutcomeTelemetry(outcomeTelemetry);
  const buckets = Array.isArray(telemetry.buckets) ? telemetry.buckets : [];
  if (buckets.length === 0) {
    return { buckets: [], summary: { bucketCount: 0, candidateCount: 0 } };
  }
  const candidates = summarizeBakeoffResults(results).byCandidate;
  const rows = [];
  buckets.forEach((bucket) => {
    const bucketId = clean(bucket.id);
    const workflowIds = OUTCOME_BUCKET_WORKFLOWS[bucketId] || [];
    const relevantResults = (Array.isArray(results) ? results : []).filter((result) => (
      workflowIds.length === 0 || workflowIds.includes(clean(result.workflowId))
    ));
    const byCandidate = summarizeBakeoffResults(relevantResults).byCandidate;
    const observedRate = Number(bucket?.observed?.acceptanceRate || 0);
    byCandidate.forEach((candidate) => {
      const delta = Number((observedRate - Number(candidate.passRate || 0)).toFixed(4));
      let status = 'aligned';
      if (Number(bucket?.observed?.resolved || 0) <= 0) status = 'needs_real_world_data';
      else if (delta <= -0.25) status = 'bakeoff_overpredicts';
      else if (delta >= 0.15) status = 'bakeoff_underpredicts';
      rows.push({
        bucketId,
        label: bucket.label || bucketId,
        candidate: candidate.key,
        workflows: workflowIds,
        observedAcceptanceRate: observedRate,
        observedResolved: Number(bucket?.observed?.resolved || 0),
        bakeoffPassRate: candidate.passRate,
        bakeoffTotal: candidate.total,
        delta,
        status
      });
    });
  });
  return {
    buckets: rows.sort((left, right) => (
      left.status.localeCompare(right.status)
      || Number(right.observedResolved || 0) - Number(left.observedResolved || 0)
      || left.bucketId.localeCompare(right.bucketId)
      || left.candidate.localeCompare(right.candidate)
    )),
    summary: {
      bucketCount: buckets.length,
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
      overpredicting: rows.filter((row) => row.status === 'bakeoff_overpredicts').length,
      underpredicting: rows.filter((row) => row.status === 'bakeoff_underpredicts').length,
      needsData: rows.filter((row) => row.status === 'needs_real_world_data').length
    }
  };
};

const normalizePromotionPolicy = (policy = {}) => ({
  minPassRate: Number.isFinite(Number(policy.minPassRate)) ? Number(policy.minPassRate) : DEFAULT_PROMOTION_POLICY.minPassRate,
  maxAvgLatencyMs: Number.isFinite(Number(policy.maxAvgLatencyMs)) ? Number(policy.maxAvgLatencyMs) : DEFAULT_PROMOTION_POLICY.maxAvgLatencyMs,
  minCases: Number.isFinite(Number(policy.minCases)) ? Number(policy.minCases) : DEFAULT_PROMOTION_POLICY.minCases,
  maxOutcomeOverpredicting: Number.isFinite(Number(policy.maxOutcomeOverpredicting))
    ? Number(policy.maxOutcomeOverpredicting)
    : DEFAULT_PROMOTION_POLICY.maxOutcomeOverpredicting
});

const buildPromotionRecommendations = ({
  summary = {},
  outcomeComparison = null,
  policy = {}
} = {}) => {
  const safePolicy = normalizePromotionPolicy(policy);
  const outcomeRows = Array.isArray(outcomeComparison?.buckets) ? outcomeComparison.buckets : [];
  const recommendations = (Array.isArray(summary.byCandidate) ? summary.byCandidate : []).map((candidate) => {
    const rowsForCandidate = outcomeRows.filter((row) => clean(row.candidate) === clean(candidate.key));
    const overpredicting = rowsForCandidate.filter((row) => row.status === 'bakeoff_overpredicts').length;
    const blockers = [];
    if (Number(candidate.total || 0) < safePolicy.minCases) blockers.push(`needs at least ${safePolicy.minCases} cases`);
    if (Number(candidate.passRate || 0) < safePolicy.minPassRate) blockers.push(`pass rate below ${safePolicy.minPassRate}`);
    if (Number(candidate.avgLatencyMs || 0) > safePolicy.maxAvgLatencyMs) blockers.push(`avg latency above ${safePolicy.maxAvgLatencyMs}ms`);
    if (overpredicting > safePolicy.maxOutcomeOverpredicting) blockers.push(`${overpredicting} production overprediction ${overpredicting === 1 ? 'bucket' : 'buckets'}`);
    return {
      candidate: candidate.key,
      status: blockers.length === 0 ? 'promote' : 'hold',
      passRate: candidate.passRate,
      total: candidate.total,
      avgLatencyMs: candidate.avgLatencyMs,
      outcomeRows: rowsForCandidate.length,
      outcomeOverpredicting: overpredicting,
      blockers
    };
  });
  return {
    policy: safePolicy,
    recommendations: recommendations.sort((left, right) => (
      (left.status === 'promote' ? 0 : 1) - (right.status === 'promote' ? 0 : 1)
      || Number(right.passRate || 0) - Number(left.passRate || 0)
      || Number(left.avgLatencyMs || 0) - Number(right.avgLatencyMs || 0)
      || left.candidate.localeCompare(right.candidate)
    )),
    summary: {
      promote: recommendations.filter((row) => row.status === 'promote').length,
      hold: recommendations.filter((row) => row.status === 'hold').length
    }
  };
};

const buildBakeoffAlerts = ({
  summary = {},
  outcomeComparison = null,
  promotion = null
} = {}) => {
  const alerts = [];
  if (Number(summary.failed || 0) > 0) {
    alerts.push({
      level: 'error',
      code: 'bakeoff_failures',
      message: `${Number(summary.failed || 0)} bakeoff cases failed.`
    });
  }
  const overpredicting = Number(outcomeComparison?.summary?.overpredicting || 0);
  if (overpredicting > 0) {
    alerts.push({
      level: 'warning',
      code: 'production_overprediction',
      message: `${overpredicting} production outcome comparison rows underperform bakeoff expectations.`
    });
  }
  if (promotion && Number(promotion?.summary?.promote || 0) === 0 && Number((summary.byCandidate || []).length) > 0) {
    alerts.push({
      level: 'warning',
      code: 'no_promotion_candidate',
      message: 'No candidate satisfies the promotion policy.'
    });
  }
  return alerts;
};

const formatBakeoffMarkdown = ({
  summary = {},
  results = [],
  fixtureSet = '',
  outcomeComparison = null,
  promotion = null,
  alerts = []
} = {}) => {
  const lines = [
    '# Agent Model Bakeoff',
    '',
    `- Fixture set: ${fixtureSet}`,
    `- Total cases: ${summary.total || 0}`,
    `- Passed: ${summary.passed || 0}`,
    `- Failed: ${summary.failed || 0}`,
    `- Pass rate: ${summary.passRate || 0}`,
    `- Alerts: ${Array.isArray(alerts) ? alerts.length : 0}`,
    '',
    '## Candidates',
    '',
    '| Candidate | Passed | Pass rate | Avg latency |',
    '|---|---:|---:|---:|'
  ];
  (Array.isArray(summary.byCandidate) ? summary.byCandidate : []).forEach((row) => {
    lines.push(`| ${row.key} | ${row.passed}/${row.total} | ${row.passRate} | ${row.avgLatencyMs}ms |`);
  });
  lines.push('', '## Route Matrix', '', '| Route / Candidate | Passed | Pass rate | Avg latency |', '|---|---:|---:|---:|');
  (Array.isArray(summary.byRouteCandidate) ? summary.byRouteCandidate : []).forEach((row) => {
    lines.push(`| ${row.key} | ${row.passed}/${row.total} | ${row.passRate} | ${row.avgLatencyMs}ms |`);
  });
  if (Array.isArray(summary.failures) && summary.failures.length > 0) {
    lines.push('', '## Failures', '');
    summary.failures.forEach((failure) => {
      lines.push(`- ${failure.workflowId} (${failure.route}, ${failure.model}:${failure.provider}): ${failure.message}`);
    });
  }
  if (outcomeComparison && Array.isArray(outcomeComparison.buckets) && outcomeComparison.buckets.length > 0) {
    lines.push(
      '',
      '## Production Outcome Comparison',
      '',
      '| Bucket | Candidate | Real acceptance | Bakeoff pass | Delta | Status |',
      '|---|---|---:|---:|---:|---|'
    );
    outcomeComparison.buckets.forEach((row) => {
      lines.push(`| ${row.label} | ${row.candidate} | ${row.observedAcceptanceRate} | ${row.bakeoffPassRate} | ${row.delta} | ${row.status} |`);
    });
  }
  if (promotion && Array.isArray(promotion.recommendations) && promotion.recommendations.length > 0) {
    lines.push(
      '',
      '## Promotion Recommendations',
      '',
      `Policy: pass rate >= ${promotion.policy.minPassRate}, latency <= ${promotion.policy.maxAvgLatencyMs}ms, min cases ${promotion.policy.minCases}, overprediction buckets <= ${promotion.policy.maxOutcomeOverpredicting}`,
      '',
      '| Candidate | Decision | Pass rate | Avg latency | Blockers |',
      '|---|---|---:|---:|---|'
    );
    promotion.recommendations.forEach((row) => {
      lines.push(`| ${row.candidate} | ${row.status} | ${row.passRate} | ${row.avgLatencyMs}ms | ${row.blockers.length > 0 ? row.blockers.join('; ') : 'none'} |`);
    });
  }
  if (Array.isArray(alerts) && alerts.length > 0) {
    lines.push('', '## Alerts', '');
    alerts.forEach((alert) => {
      lines.push(`- ${String(alert.level || 'info').toUpperCase()} ${alert.code}: ${alert.message}`);
    });
  }
  lines.push('', '## Cases', '', '| Workflow | Route | Candidate | Latency | Status |', '|---|---|---|---:|---|');
  (Array.isArray(results) ? results : []).forEach((result) => {
    lines.push(`| ${result.workflowId} | ${result.route} | ${result.model}:${result.provider} | ${Number(result.latencyMs || 0)}ms | ${result.ok ? 'pass' : `fail: ${clean(result.validation?.message)}`} |`);
  });
  return `${lines.join('\n')}\n`;
};

const writeBakeoffReport = async ({
  outputDir = 'tmp/agent-model-bakeoff-runs',
  fixtureSet = 'realistic',
  candidates = [],
  specs = [],
  results = [],
  summary = {},
  outcomeTelemetry = null,
  outcomeComparison = null,
  promotion = null,
  alerts = []
} = {}) => {
  const absoluteDir = path.resolve(process.cwd(), outputDir);
  await fs.mkdir(absoluteDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(absoluteDir, `${stamp}-model-bakeoff.json`);
  const markdownPath = path.join(absoluteDir, `${stamp}-model-bakeoff.md`);
  await fs.writeFile(
    filePath,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      fixtureSet,
      candidates,
      workflows: specs.map((spec) => ({ id: spec.id, route: spec.route, title: spec.title })),
      summary,
      outcomeTelemetry: outcomeTelemetry ? normalizeOutcomeTelemetry(outcomeTelemetry) : null,
      outcomeComparison,
      promotion,
      alerts,
      results
    }, null, 2),
    'utf8'
  );
  await fs.writeFile(markdownPath, formatBakeoffMarkdown({ summary, results, fixtureSet, outcomeComparison, promotion, alerts }), 'utf8');
  return { filePath, markdownPath };
};

const runModelBakeoff = async ({
  fixtureSet = 'realistic',
  workflowIds = [],
  routeIds = [],
  candidates = [],
  outputDir = 'tmp/agent-model-bakeoff-runs',
  chatCompleteFn = chatComplete,
  outcomeTelemetry = null,
  promotionPolicy = {}
} = {}) => {
  const specs = selectBakeoffSpecs({ workflowIds, routeIds, fixtureSet });
  const candidateRoutes = getCandidateRoutesForSpecs({ specs, candidates });
  const results = [];
  for (const spec of specs) {
    for (const candidate of candidateRoutes) {
      results.push(await runBakeoffCase({ spec, candidate, chatCompleteFn }));
    }
  }
  const summary = summarizeBakeoffResults(results);
  const outcomeComparison = outcomeTelemetry ? buildOutcomeComparison({ results, outcomeTelemetry }) : null;
  const promotion = buildPromotionRecommendations({ summary, outcomeComparison, policy: promotionPolicy });
  const alerts = buildBakeoffAlerts({ summary, outcomeComparison, promotion });
  const report = await writeBakeoffReport({
    outputDir,
    fixtureSet: normalizeFixtureSet(fixtureSet),
    candidates: candidateRoutes,
    specs,
    results,
    summary,
    outcomeTelemetry,
    outcomeComparison,
    promotion,
    alerts
  });
  return {
    fixtureSet: normalizeFixtureSet(fixtureSet),
    candidates: candidateRoutes,
    workflows: specs.map((spec) => ({ id: spec.id, route: spec.route, title: spec.title })),
    summary,
    outcomeComparison,
    promotion,
    alerts,
    results,
    ...report
  };
};

module.exports = {
  buildBakeoffAlerts,
  buildOutcomeComparison,
  buildPromotionRecommendations,
  DEFAULT_PROMOTION_POLICY,
  formatBakeoffMarkdown,
  getCandidateRoutesForSpecs,
  normalizeOutcomeTelemetry,
  normalizePromotionPolicy,
  parseCandidateRoutes,
  runBakeoffCase,
  runModelBakeoff,
  selectBakeoffSpecs,
  summarizeBakeoffResults
};
