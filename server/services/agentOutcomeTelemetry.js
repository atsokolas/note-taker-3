const clean = (value) => String(value || '').trim();

const rate = (numerator = 0, denominator = 0) => {
  const safeNumerator = Number(numerator || 0);
  const safeDenominator = Number(denominator || 0);
  if (!Number.isFinite(safeNumerator) || !Number.isFinite(safeDenominator) || safeDenominator <= 0) return 0;
  return Number((safeNumerator / safeDenominator).toFixed(4));
};

const loadRows = async (Model, query = {}) => {
  if (!Model || typeof Model.find !== 'function') return [];
  const rows = await Model.find(query);
  return Array.isArray(rows) ? rows : [];
};

const countStatuses = (rows = []) => (
  (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    const status = clean(row?.status).toLowerCase() || 'unknown';
    acc[status] = Number(acc[status] || 0) + 1;
    acc.total = Number(acc.total || 0) + 1;
    return acc;
  }, { total: 0 })
);

const getHarnessWorkflowPassRate = ({
  runHistory = {},
  workflowIds = [],
  preferredMode = 'live',
  preferredFixtureSet = 'realistic'
} = {}) => {
  const ids = new Set((Array.isArray(workflowIds) ? workflowIds : []).map(clean).filter(Boolean));
  const runs = Array.isArray(runHistory?.runs) ? runHistory.runs : [];
  const collect = (predicate) => {
    const results = [];
    runs.forEach((run) => {
      if (!predicate(run)) return;
      (Array.isArray(run.results) ? run.results : []).forEach((result) => {
        if (ids.size > 0 && !ids.has(clean(result.id))) return;
        results.push(result);
      });
    });
    return results;
  };

  const preferred = collect((run) => (
    clean(run.mode).toLowerCase() === preferredMode
    && clean(run.fixtureSet).toLowerCase() === preferredFixtureSet
  ));
  const fallback = preferred.length > 0 ? preferred : collect(() => true);
  const passed = fallback.filter((result) => result.ok).length;
  return {
    passRate: rate(passed, fallback.length),
    total: fallback.length,
    passed,
    source: preferred.length > 0 ? `${preferredMode}:${preferredFixtureSet}` : 'all_runs'
  };
};

const buildBucket = ({
  id = '',
  label = '',
  observedAccepted = 0,
  observedRejected = 0,
  observedPending = 0,
  harness = {}
} = {}) => {
  const resolved = Number(observedAccepted || 0) + Number(observedRejected || 0);
  const observedAcceptanceRate = rate(observedAccepted, resolved);
  const harnessPassRate = Number(harness.passRate || 0);
  const delta = resolved > 0 && Number(harness.total || 0) > 0
    ? Number((observedAcceptanceRate - harnessPassRate).toFixed(4))
    : 0;
  let status = 'insufficient_data';
  if (resolved > 0 && Number(harness.total || 0) > 0) {
    if (delta <= -0.25) status = 'real_world_underperforming';
    else if (delta >= 0.15) status = 'real_world_outperforming';
    else status = 'aligned';
  }
  return {
    id,
    label,
    observed: {
      accepted: Number(observedAccepted || 0),
      rejected: Number(observedRejected || 0),
      pending: Number(observedPending || 0),
      resolved,
      acceptanceRate: observedAcceptanceRate
    },
    harness,
    delta,
    status
  };
};

const getAgentOutcomeTelemetrySnapshot = async ({
  userId = '',
  threadId = '',
  runHistory = {},
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  AgentArtifactDraft
} = {}) => {
  const safeUserId = clean(userId);
  const safeThreadId = clean(threadId);
  const scoped = (field) => {
    const query = { userId: safeUserId };
    if (safeThreadId) query[field] = safeThreadId;
    return query;
  };

  const [runs, proposedChanges, structureProposals, artifactDrafts] = await Promise.all([
    loadRows(AgentRun, scoped('threadId')),
    loadRows(AgentProposedChange, scoped('sourceThreadId')),
    loadRows(AgentStructureProposal, scoped('sourceThreadId')),
    loadRows(AgentArtifactDraft, scoped('sourceThreadId'))
  ]);

  const runStatuses = countStatuses(runs);
  const proposedStatuses = countStatuses(proposedChanges);
  const structureStatuses = countStatuses(structureProposals);
  const artifactStatuses = countStatuses(artifactDrafts);

  const buckets = [
    buildBucket({
      id: 'content_edits',
      label: 'Content edits',
      observedAccepted: proposedStatuses.applied,
      observedRejected: proposedStatuses.rejected,
      observedPending: proposedStatuses.pending,
      harness: getHarnessWorkflowPassRate({
        runHistory,
        workflowIds: ['editor', 'writing_copilot']
      })
    }),
    buildBucket({
      id: 'structure_plans',
      label: 'Structure plans',
      observedAccepted: Number(structureStatuses.applied || 0) + Number(structureStatuses.partially_applied || 0),
      observedRejected: structureStatuses.rejected,
      observedPending: structureStatuses.pending,
      harness: getHarnessWorkflowPassRate({
        runHistory,
        workflowIds: ['librarian']
      })
    }),
    buildBucket({
      id: 'artifact_drafts',
      label: 'Artifact drafts',
      observedAccepted: artifactStatuses.promoted,
      observedRejected: artifactStatuses.dismissed,
      observedPending: artifactStatuses.pending,
      harness: getHarnessWorkflowPassRate({
        runHistory,
        workflowIds: ['synthesizer', 'research_planner']
      })
    }),
    buildBucket({
      id: 'agent_runs',
      label: 'Agent runs',
      observedAccepted: runStatuses.completed,
      observedRejected: Number(runStatuses.failed || 0) + Number(runStatuses.cancelled || 0),
      observedPending: Number(runStatuses.pending || 0)
        + Number(runStatuses.in_progress || 0)
        + Number(runStatuses.paused_for_approval || 0)
        + Number(runStatuses.awaiting_review || 0),
      harness: getHarnessWorkflowPassRate({
        runHistory,
        workflowIds: []
      })
    })
  ];

  return {
    buckets,
    summary: {
      bucketCount: buckets.length,
      aligned: buckets.filter((bucket) => bucket.status === 'aligned').length,
      underperforming: buckets.filter((bucket) => bucket.status === 'real_world_underperforming').length,
      outperforming: buckets.filter((bucket) => bucket.status === 'real_world_outperforming').length,
      insufficientData: buckets.filter((bucket) => bucket.status === 'insufficient_data').length
    }
  };
};

module.exports = {
  buildBucket,
  getAgentOutcomeTelemetrySnapshot,
  getHarnessWorkflowPassRate,
  rate
};
