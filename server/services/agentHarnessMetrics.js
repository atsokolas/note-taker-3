const fs = require('fs/promises');

const { EVENT_NAMES, hashValue } = require('../utils/analytics');

const clean = (value) => String(value || '').trim();

const HARNESS_EVENT_NAMES = new Set([
  EVENT_NAMES.AGENT_PROPOSAL_BUNDLE_STAGED,
  EVENT_NAMES.AGENT_EXECUTION_INTENT_MATCHED,
  EVENT_NAMES.AGENT_EXECUTION_INTENT_AMBIGUOUS,
  EVENT_NAMES.AGENT_EXECUTION_INTENT_NO_MATCH,
  EVENT_NAMES.AGENT_RUN_STARTED,
  EVENT_NAMES.AGENT_RUN_COMPLETED,
  EVENT_NAMES.AGENT_RUN_PAUSED_FOR_APPROVAL,
  EVENT_NAMES.AGENT_RUN_AWAITING_REVIEW,
  EVENT_NAMES.AGENT_RUN_FAILED,
  EVENT_NAMES.AGENT_PROPOSED_CHANGE_ACCEPTED,
  EVENT_NAMES.AGENT_PROPOSED_CHANGE_REJECTED,
  EVENT_NAMES.AGENT_PROPOSED_CHANGE_ROLLED_BACK,
  EVENT_NAMES.AGENT_STRUCTURE_PLAN_APPLIED,
  EVENT_NAMES.AGENT_STRUCTURE_PLAN_REJECTED,
  EVENT_NAMES.AGENT_STRUCTURE_PLAN_ROLLED_BACK,
  EVENT_NAMES.AGENT_ARTIFACT_DRAFT_STAGED,
  EVENT_NAMES.AGENT_ARTIFACT_DRAFT_PROMOTED,
  EVENT_NAMES.AGENT_ARTIFACT_DRAFT_DISMISSED,
  EVENT_NAMES.AGENT_RUN_APPROVAL_APPROVED,
  EVENT_NAMES.AGENT_RUN_APPROVAL_REJECTED
]);

const countByStatus = (rows = [], statuses = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const result = { total: safeRows.length };
  statuses.forEach((status) => {
    result[status] = safeRows.filter((row) => clean(row?.status).toLowerCase() === status).length;
  });
  return result;
};

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

const loadHarnessEvents = async ({
  analyticsLogPath = '',
  userId = '',
  threadId = ''
} = {}) => {
  const safePath = clean(analyticsLogPath);
  const safeUserId = clean(userId);
  if (!safePath || !safeUserId) return [];

  let raw = '';
  try {
    raw = await fs.readFile(safePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const userHash = hashValue(safeUserId);
  return raw
    .split('\n')
    .map((line) => clean(line))
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter((entry) => entry && HARNESS_EVENT_NAMES.has(clean(entry?.event)))
    .filter((entry) => clean(entry?.actor?.userIdHash) === userHash)
    .filter((entry) => {
      if (!clean(threadId)) return true;
      return clean(entry?.properties?.threadId) === clean(threadId);
    });
};

const countEvents = (events = []) => {
  const counts = {};
  (Array.isArray(events) ? events : []).forEach((entry) => {
    const name = clean(entry?.event);
    if (!name) return;
    counts[name] = (counts[name] || 0) + 1;
  });
  return counts;
};

const flattenProposalBundles = (threads = []) => (
  (Array.isArray(threads) ? threads : []).flatMap((thread) => (
    Array.isArray(thread?.proposalBundles) ? thread.proposalBundles : []
  ))
);

const extractApprovalThreadId = (approval = {}) => (
  clean(approval?.threadId)
  || clean(approval?.preview?.threadId)
  || clean(approval?.payload?.threadId)
  || clean(approval?.result?.threadId)
);

const getAgentHarnessMetricsSnapshot = async ({
  userId = '',
  threadId = '',
  analyticsLogPath = process.env.ANALYTICS_LOG_PATH || 'server/logs/product-events.jsonl',
  AgentThread,
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  AgentArtifactDraft,
  AgentProtocolApproval
} = {}) => {
  const safeUserId = clean(userId);
  const safeThreadId = clean(threadId);
  const threadQuery = { userId: safeUserId };
  if (safeThreadId) threadQuery._id = safeThreadId;

  const runQuery = { userId: safeUserId };
  if (safeThreadId) runQuery.threadId = safeThreadId;

  const proposedChangeQuery = { userId: safeUserId };
  if (safeThreadId) proposedChangeQuery.sourceThreadId = safeThreadId;

  const draftQuery = { userId: safeUserId };
  if (safeThreadId) draftQuery.sourceThreadId = safeThreadId;

  const structureProposalQuery = { userId: safeUserId };
  if (safeThreadId) structureProposalQuery.sourceThreadId = safeThreadId;

  const [threads, runs, proposedChanges, structureProposals, drafts, protocolApprovals, harnessEvents] = await Promise.all([
    loadRows(AgentThread, threadQuery),
    loadRows(AgentRun, runQuery),
    loadRows(AgentProposedChange, proposedChangeQuery),
    loadRows(AgentStructureProposal, structureProposalQuery),
    loadRows(AgentArtifactDraft, draftQuery),
    loadRows(AgentProtocolApproval, { userId: safeUserId, op: 'runs.resume' }),
    loadHarnessEvents({ analyticsLogPath, userId: safeUserId, threadId: safeThreadId })
  ]);

  const proposalBundles = flattenProposalBundles(threads);
  const eventCounts = countEvents(harnessEvents);
  const bundleStatuses = countByStatus(
    proposalBundles,
    ['pending', 'partially_applied', 'applied', 'dismissed', 'invalidated']
  );
  const runStatuses = countByStatus(
    runs,
    ['pending', 'in_progress', 'paused_for_approval', 'awaiting_review', 'completed', 'cancelled', 'failed']
  );
  const proposedChangeStatuses = countByStatus(
    proposedChanges,
    ['pending', 'applied', 'rolled_back', 'rejected']
  );
  const structureProposalStatuses = countByStatus(
    structureProposals,
    ['pending', 'applied', 'partially_applied', 'skipped', 'failed', 'rolled_back', 'rejected']
  );
  const draftStatuses = countByStatus(
    drafts,
    ['pending', 'promoted', 'dismissed']
  );

  const scopedProtocolApprovals = (Array.isArray(protocolApprovals) ? protocolApprovals : []).filter((approval) => {
    if (!safeThreadId) return true;
    return extractApprovalThreadId(approval) === safeThreadId;
  });
  const rejectedRunApprovals = scopedProtocolApprovals.filter((approval) => clean(approval?.status).toLowerCase() === 'rejected').length;
  const proposalBundlesStaged = eventCounts[EVENT_NAMES.AGENT_PROPOSAL_BUNDLE_STAGED] || 0;
  const executionIntentMatched = eventCounts[EVENT_NAMES.AGENT_EXECUTION_INTENT_MATCHED] || 0;
  const executionIntentAmbiguous = eventCounts[EVENT_NAMES.AGENT_EXECUTION_INTENT_AMBIGUOUS] || 0;
  const executionIntentNoMatch = eventCounts[EVENT_NAMES.AGENT_EXECUTION_INTENT_NO_MATCH] || 0;
  const runsStarted = eventCounts[EVENT_NAMES.AGENT_RUN_STARTED] || 0;
  const runsCompleted = eventCounts[EVENT_NAMES.AGENT_RUN_COMPLETED] || 0;
  const draftFallbacks = eventCounts[EVENT_NAMES.AGENT_ARTIFACT_DRAFT_STAGED] || 0;

  return {
    funnel: {
      proposalBundlesStaged,
      executionIntentMatched,
      executionIntentAmbiguous,
      executionIntentNoMatch,
      runsStarted,
      runsCompleted,
      draftFallbacks
    },
    bundleStatuses,
    runStatuses,
    proposedChangeStatuses,
    structureProposalStatuses,
    draftStatuses,
    undoSignals: {
      proposedChangeRejected: proposedChangeStatuses.rejected,
      proposedChangeRolledBack: proposedChangeStatuses.rolled_back,
      structureProposalRejected: structureProposalStatuses.rejected,
      structureProposalRolledBack: structureProposalStatuses.rolled_back,
      runApprovalRejected: rejectedRunApprovals,
      draftDismissed: draftStatuses.dismissed,
      total: proposedChangeStatuses.rejected
        + proposedChangeStatuses.rolled_back
        + structureProposalStatuses.rejected
        + structureProposalStatuses.rolled_back
        + rejectedRunApprovals
        + draftStatuses.dismissed
    },
    rates: {
      bundleResolutionSuccessRate: rate(
        executionIntentMatched,
        executionIntentMatched + executionIntentAmbiguous + executionIntentNoMatch
      ),
      runCompletionRate: rate(runsCompleted, runsStarted),
      proposedChangeAcceptanceRate: rate(
        proposedChangeStatuses.applied,
        proposedChangeStatuses.applied + proposedChangeStatuses.rejected
      ),
      structureProposalAcceptanceRate: rate(
        structureProposalStatuses.applied,
        structureProposalStatuses.applied + structureProposalStatuses.rejected
      ),
      draftFallbackRate: rate(draftFallbacks, draftFallbacks + runsStarted)
    }
  };
};

module.exports = {
  getAgentHarnessMetricsSnapshot
};
