// How agents work for a reader: who they are and what they may do, handoffs between them, the protocol's approvals and hooks, and the bridge an outside agent calls through.
const crypto = require('crypto');
const {
  listWorkerRoles,
  normalizeWorkerRole,
  sanitizeAgentPlanner,
  buildAgentPlanner,
  inferWorkerRole
} = require('./agentWorkerRoles');
const mongoose = require('mongoose');
const {
  User,
  AgentThread,
  PersonalAgent,
  Article,
  NotebookEntry,
  TagMeta,
  Question,
  WikiPage,
  AgentHandoff,
  AgentArtifactDraft,
  AgentProtocolApproval,
  AgentProtocolHookRun,
  AgentRun,
  AgentProposedChange
} = require('../models/index');
const {
  truncate: truncateThreadText,
  normalizeThreadPlan,
  normalizeThreadCheckpoint,
  normalizeActor: normalizeThreadActor,
  normalizeThreadScope,
  appendThreadMessage,
  sanitizeAgentThreadDoc,
  normalizeThreadStatus,
  normalizeThreadMessage,
  compactThreadState,
  normalizeThreadPlanner
} = require('./agentThreadState');
const jwt = require('jsonwebtoken');
const { conceptWorkspaceAuthorization, updateConceptMeta } = require('./concepts');
const { sanitizeAgentArtifactDraftDoc, createAgentArtifactDraftRecord, promoteAgentArtifactDraftRecord } = require('./agentArtifactDrafts');
const { syncNotebookReferences, createBlockId } = require('./notebookBlocks');
const { enqueueNotebookEmbedding, enqueueQuestionEmbedding } = require('../ai/embeddingJobs');
const { executeAgentRun } = require('./agentRunExecution');
const { requestRunStepApproval } = require('./agentRunProtocolApprovals');
const { createProposedChangesForRun } = require('./agentProposedChanges');
const { reconcileAgentRunState, dismissBlockedRunStep } = require('./agentRunReviewState');
const { applyProposalBundleRunOutcome, sanitizeAgentRunDoc } = require('./agentRuns');
const { trackHarnessEvent, trackRunLifecycleEvents } = require('./agentHarnessEvents');
const { trackEvent, EVENT_NAMES } = require('../utils/analytics');

const AGENT_ACTOR_TYPES = new Set(['user', 'native_agent', 'byo_agent']);
const AGENT_ACTION_FLOWS = new Set(['direct', 'cleanup', 'restructure']);
const PERSONAL_AGENT_STATUSES = new Set(['active', 'disabled']);
const AGENT_HANDOFF_STATUSES = new Set(['pending', 'claimed', 'completed', 'rejected', 'cancelled']);
const AGENT_HANDOFF_TASK_TYPES = new Set(['research', 'synthesis', 'restructure', 'qa', 'custom']);
const AGENT_HANDOFF_PRIORITIES = new Set(['low', 'normal', 'high']);
const MAX_AGENT_HANDOFF_LIST_LIMIT = 120;
const AGENT_PROTOCOL_ROUTING_MODES = new Set(['balanced', 'native_first', 'byo_first']);
const AGENT_BRIDGE_TOKEN_KIND = 'agent_bridge';
const DEFAULT_BRIDGE_TOKEN_TTL_SECONDS = 30 * 60;
const MAX_BRIDGE_TOKEN_TTL_SECONDS = 2 * 60 * 60;

const normalizeAgentActorType = (value, fallback = 'native_agent') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_ACTOR_TYPES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentActionFlow = (value, fallback = 'direct') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_ACTION_FLOWS.has(candidate)) return candidate;
  return fallback;
};

const normalizePersonalAgentStatus = (value, fallback = 'active') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (PERSONAL_AGENT_STATUSES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentHandoffStatus = (value, fallback = 'pending') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_HANDOFF_STATUSES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentHandoffTaskType = (value, fallback = 'custom') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_HANDOFF_TASK_TYPES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentHandoffPriority = (value, fallback = 'normal') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_HANDOFF_PRIORITIES.has(candidate)) return candidate;
  return fallback;
};

const normalizeAgentProtocolRoutingMode = (value, fallback = 'balanced') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (AGENT_PROTOCOL_ROUTING_MODES.has(candidate)) return candidate;
  return fallback;
};

const createPersonalAgentApiKey = () => (
  `ntk_ag_${crypto.randomBytes(24).toString('hex')}`
);

const hashPersonalAgentApiKey = (value) => (
  crypto.createHash('sha256').update(String(value || '')).digest('hex')
);

const PERSONAL_AGENT_DEFAULT_CAPABILITIES = Object.freeze({
  read: true,
  search: true,
  proposeChanges: true,
  executeWrites: true,
  executeDeletes: true
});
const WORKER_ROLE_VALUES = new Set(
  listWorkerRoles().map((entry) => String(entry?.role || '').trim().toLowerCase()).filter(Boolean)
);

const normalizePersonalAgentCapabilities = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    read: source.read !== undefined ? Boolean(source.read) : PERSONAL_AGENT_DEFAULT_CAPABILITIES.read,
    search: source.search !== undefined ? Boolean(source.search) : PERSONAL_AGENT_DEFAULT_CAPABILITIES.search,
    proposeChanges: source.proposeChanges !== undefined
      ? Boolean(source.proposeChanges)
      : PERSONAL_AGENT_DEFAULT_CAPABILITIES.proposeChanges,
    executeWrites: source.executeWrites !== undefined
      ? Boolean(source.executeWrites)
      : PERSONAL_AGENT_DEFAULT_CAPABILITIES.executeWrites,
    executeDeletes: source.executeDeletes !== undefined
      ? Boolean(source.executeDeletes)
      : PERSONAL_AGENT_DEFAULT_CAPABILITIES.executeDeletes
  };
};

const normalizePersonalAgentWorkerRoles = (input = []) => {
  const source = Array.isArray(input) ? input : [input];
  const seen = new Set();
  return source
    .map((value) => normalizeWorkerRole(value))
    .filter((value) => value && WORKER_ROLE_VALUES.has(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, 4);
};

const USER_AGENT_PREMIUM_TIERS = new Set(['free', 'premium']);

const normalizeUserPremiumTier = (value, fallback = 'free') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (USER_AGENT_PREMIUM_TIERS.has(candidate)) return candidate;
  return fallback;
};

const normalizeUserAgentProfile = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    premiumTier: normalizeUserPremiumTier(source.premiumTier, 'free'),
    webResearchEnabled: Boolean(source.webResearchEnabled),
    webResearchBetaEnabled: Boolean(source.webResearchBetaEnabled)
  };
};

const deriveAgentEntitlements = (agentProfileInput = {}) => {
  const profile = normalizeUserAgentProfile(agentProfileInput);
  const premiumWebResearchAvailable = (
    profile.premiumTier === 'premium'
    && profile.webResearchEnabled
  );
  return {
    premiumTier: profile.premiumTier,
    webResearchEnabled: profile.webResearchEnabled,
    webResearchBetaEnabled: profile.webResearchBetaEnabled,
    premiumWebResearchAvailable
  };
};

const getUserAgentEntitlements = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return deriveAgentEntitlements({});
  }
  const user = await User.findById(userId).select('agentProfile').lean();
  return deriveAgentEntitlements(user?.agentProfile || {});
};

const sanitizePersonalAgent = (doc) => ({
  _id: String(doc?._id || ''),
  name: String(doc?.name || ''),
  description: String(doc?.description || ''),
  status: normalizePersonalAgentStatus(doc?.status, 'active'),
  capabilities: normalizePersonalAgentCapabilities(doc?.capabilities || {}),
  preferredWorkerRoles: normalizePersonalAgentWorkerRoles(doc?.preferredWorkerRoles || []),
  apiKeyPrefix: String(doc?.apiKeyPrefix || ''),
  lastUsedAt: doc?.lastUsedAt ? new Date(doc.lastUsedAt).toISOString() : null,
  createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null
});

const safeAgentHandoffLimit = (value, fallback = 30) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_AGENT_HANDOFF_LIST_LIMIT, Math.trunc(parsed)));
};

const buildDefaultThreadTitle = (text = '', fallback = 'Agent thread') => (
  truncateThreadText(text || fallback, 120) || fallback
);

const buildDefaultHandoffPlan = ({
  taskType = 'custom',
  title = '',
  objective = ''
}) => {
  const safeTaskType = normalizeAgentHandoffTaskType(taskType, 'custom');
  const safeObjective = String(objective || '').trim();
  const plansByTaskType = {
    research: {
      successCriteria: [
        'Clarify the research question.',
        'Surface the strongest relevant sources.',
        'Deliver a concise findings summary with follow-up directions.'
      ],
      steps: [
        { id: 'clarify', title: 'Clarify the research target', status: 'pending', kind: 'analysis', workerRole: 'planner' },
        { id: 'gather', title: 'Gather supporting material', status: 'pending', kind: 'retrieval', workerRole: 'researcher' },
        { id: 'synthesize', title: 'Summarize findings and next moves', status: 'pending', kind: 'delivery', workerRole: 'synthesizer' }
      ]
    },
    synthesis: {
      successCriteria: [
        'Assemble the relevant source material.',
        'Produce a structured synthesis rather than scattered notes.',
        'Return a clean output the user can reuse.'
      ],
      steps: [
        { id: 'review', title: 'Review the current material', status: 'pending', kind: 'analysis', workerRole: 'researcher' },
        { id: 'draft', title: 'Draft the synthesis', status: 'pending', kind: 'writing', workerRole: 'synthesizer' },
        { id: 'tighten', title: 'Tighten the final output', status: 'pending', kind: 'editing', workerRole: 'editor' }
      ]
    },
    restructure: {
      successCriteria: [
        'Inspect the current structure before editing.',
        'Make the reorganization legible and reversible.',
        'Return the updated state with a short explanation.'
      ],
      steps: [
        { id: 'inspect', title: 'Inspect the current structure', status: 'pending', kind: 'analysis', workerRole: 'organizer' },
        { id: 'propose', title: 'Propose the restructure', status: 'pending', kind: 'planning', workerRole: 'planner' },
        { id: 'apply', title: 'Apply approved changes', status: 'pending', kind: 'execution', workerRole: 'editor' }
      ]
    },
    qa: {
      successCriteria: [
        'Review the target surface closely.',
        'Call out concrete gaps or risks.',
        'Return prioritized findings.'
      ],
      steps: [
        { id: 'inspect', title: 'Inspect the target surface', status: 'pending', kind: 'analysis', workerRole: 'critic' },
        { id: 'verify', title: 'Verify expected behavior', status: 'pending', kind: 'testing', workerRole: 'critic' },
        { id: 'report', title: 'Report prioritized findings', status: 'pending', kind: 'delivery', workerRole: 'editor' }
      ]
    },
    custom: {
      successCriteria: [
        'Clarify the task.',
        'Complete the requested work.',
        'Return a concrete result or blocker.'
      ],
      steps: [
        { id: 'clarify', title: 'Clarify the task', status: 'pending', kind: 'analysis', workerRole: 'planner' },
        { id: 'execute', title: 'Execute the work', status: 'pending', kind: 'execution', workerRole: 'synthesizer' },
        { id: 'deliver', title: 'Deliver the result', status: 'pending', kind: 'delivery', workerRole: 'editor' }
      ]
    }
  };
  const basePlan = plansByTaskType[safeTaskType] || plansByTaskType.custom;
  return normalizeThreadPlan({
    objective: safeObjective || title,
    currentStepId: basePlan.steps[0]?.id || '',
    successCriteria: basePlan.successCriteria,
    steps: basePlan.steps
  });
};

const buildDefaultHandoffCheckpoint = ({
  title = '',
  requestedActor = {}
}) => normalizeThreadCheckpoint({
  summary: `Handoff created and waiting for ${normalizeAgentActorType(requestedActor?.actorType, 'native_agent')}.`,
  openQuestions: [],
  nextActions: ['Claim the handoff and start the first plan step.'],
  updatedBy: normalizeThreadActor(requestedActor, 'native_agent')
});

const createThreadForHandoff = async ({
  userId,
  title = '',
  objective = '',
  taskType = 'custom',
  requestedActor = {},
  planner = null,
  createdBy = {},
  handoffId = null
}) => {
  const nextPlanner = sanitizeAgentPlanner(
    planner || buildAgentPlanner({ taskType, requestedActor })
  );
  const thread = await AgentThread.create({
    userId,
    title: buildDefaultThreadTitle(title || objective || 'Handoff thread'),
    status: 'active',
    summary: truncateThreadText(objective || title, 280),
    scope: normalizeThreadScope({
      type: 'handoff',
      id: String(handoffId || ''),
      title: title || 'Agent handoff'
    }),
    createdBy: normalizeThreadActor(createdBy, 'user'),
    lastActor: normalizeThreadActor(createdBy, 'user'),
    handoffId,
    planner: nextPlanner,
    plan: buildDefaultHandoffPlan({ taskType, title, objective }),
    checkpoint: buildDefaultHandoffCheckpoint({ title, requestedActor }),
    messages: []
  });
  appendThreadMessage(thread, {
    role: 'system',
    text: `Handoff thread opened for ${title || 'untitled handoff'}.`,
    actor: normalizeThreadActor(createdBy, 'user'),
    metadata: {
      taskType: normalizeAgentHandoffTaskType(taskType, 'custom'),
      requestedActor: normalizeActorIdentity(requestedActor || {}, 'native_agent'),
      planner: nextPlanner
    }
  });
  await thread.save();
  return thread;
};

const normalizeActorIdentity = (input = {}, fallbackType = 'user') => ({
  actorType: normalizeAgentActorType(input?.actorType, fallbackType),
  actorId: String(input?.actorId || '').trim()
});

const parseOptionalDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getAgentBridgeJwtSecret = () => {
  const secret = String(process.env.AGENT_BRIDGE_SECRET || process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('AGENT_BRIDGE_SECRET or JWT_SECRET must be set.');
  return secret;
};

const safeBridgeTokenTtlSeconds = (value, fallback = DEFAULT_BRIDGE_TOKEN_TTL_SECONDS) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.trunc(parsed);
  return Math.max(60, Math.min(MAX_BRIDGE_TOKEN_TTL_SECONDS, intValue));
};

const normalizeProtocolTaskOverride = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const actorTypeRaw = String(source.actorType || '').trim().toLowerCase();
  const actorType = AGENT_ACTOR_TYPES.has(actorTypeRaw) ? actorTypeRaw : '';
  const actorId = String(source.actorId || '').trim();
  if (!actorType) return { actorType: '', actorId: '' };
  return { actorType, actorId };
};

const PROTOCOL_HOOK_EFFECTS = new Set(['off', 'observe', 'warn', 'require_approval']);

const normalizeProtocolHookEffect = (value, fallback = 'off') => {
  if (typeof value === 'boolean') return value ? 'observe' : 'off';
  const safeValue = String(value || '').trim().toLowerCase();
  if (PROTOCOL_HOOK_EFFECTS.has(safeValue)) return safeValue;
  return PROTOCOL_HOOK_EFFECTS.has(String(fallback || '').trim().toLowerCase())
    ? String(fallback).trim().toLowerCase()
    : 'off';
};

const normalizeAgentProtocolHooksPolicy = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    beforeThreadOps: normalizeProtocolHookEffect(source.beforeThreadOps, 'off'),
    afterThreadOps: normalizeProtocolHookEffect(source.afterThreadOps, 'off'),
    beforeHandoffOps: normalizeProtocolHookEffect(source.beforeHandoffOps, 'observe'),
    afterHandoffOps: normalizeProtocolHookEffect(source.afterHandoffOps, 'observe')
  };
};

const normalizeAgentProtocolPolicy = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const taskOverridesSource = source.taskOverrides && typeof source.taskOverrides === 'object'
    ? source.taskOverrides
    : {};
  const defaultByoAgentIdRaw = String(source.defaultByoAgentId || '').trim();
  return {
    routingMode: normalizeAgentProtocolRoutingMode(source.routingMode, 'balanced'),
    defaultByoAgentId: mongoose.Types.ObjectId.isValid(defaultByoAgentIdRaw) ? defaultByoAgentIdRaw : '',
    allowByoForResearch: source.allowByoForResearch !== undefined ? Boolean(source.allowByoForResearch) : true,
    allowByoForSynthesis: source.allowByoForSynthesis !== undefined ? Boolean(source.allowByoForSynthesis) : true,
    preferByoSpecialists: source.preferByoSpecialists !== undefined ? Boolean(source.preferByoSpecialists) : true,
    hooks: normalizeAgentProtocolHooksPolicy(source.hooks || {}),
    taskOverrides: {
      research: normalizeProtocolTaskOverride(taskOverridesSource.research),
      synthesis: normalizeProtocolTaskOverride(taskOverridesSource.synthesis),
      restructure: normalizeProtocolTaskOverride(taskOverridesSource.restructure),
      qa: normalizeProtocolTaskOverride(taskOverridesSource.qa),
      custom: normalizeProtocolTaskOverride(taskOverridesSource.custom)
    }
  };
};

const sanitizeAgentProtocolPolicy = (input = {}) => {
  const policy = normalizeAgentProtocolPolicy(input);
  return {
    routingMode: policy.routingMode,
    defaultByoAgentId: policy.defaultByoAgentId || '',
    allowByoForResearch: Boolean(policy.allowByoForResearch),
    allowByoForSynthesis: Boolean(policy.allowByoForSynthesis),
    preferByoSpecialists: policy.preferByoSpecialists !== false,
    hooks: normalizeAgentProtocolHooksPolicy(policy.hooks || {}),
    taskOverrides: {
      research: policy.taskOverrides.research,
      synthesis: policy.taskOverrides.synthesis,
      restructure: policy.taskOverrides.restructure,
      qa: policy.taskOverrides.qa,
      custom: policy.taskOverrides.custom
    }
  };
};

const toStoredAgentProtocolPolicy = (policy = {}) => ({
  routingMode: policy.routingMode,
  defaultByoAgentId: policy.defaultByoAgentId && mongoose.Types.ObjectId.isValid(policy.defaultByoAgentId)
    ? new mongoose.Types.ObjectId(String(policy.defaultByoAgentId))
    : null,
  allowByoForResearch: Boolean(policy.allowByoForResearch),
  allowByoForSynthesis: Boolean(policy.allowByoForSynthesis),
  preferByoSpecialists: Boolean(policy.preferByoSpecialists),
  hooks: normalizeAgentProtocolHooksPolicy(policy.hooks || {}),
  taskOverrides: policy.taskOverrides || {}
});

const getUserAgentProtocolPolicy = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return sanitizeAgentProtocolPolicy({});
  }
  const user = await User.findById(userId).select('agentProtocolPolicy').lean();
  return sanitizeAgentProtocolPolicy(user?.agentProtocolPolicy || {});
};

const isByoAgentCompatibleForTask = (agent = {}, taskType = 'custom') => {
  const capabilities = normalizePersonalAgentCapabilities(agent.capabilities || {});
  const safeTaskType = normalizeAgentHandoffTaskType(taskType, 'custom');
  if (safeTaskType === 'research') return capabilities.read && capabilities.search;
  if (safeTaskType === 'synthesis') return capabilities.read && capabilities.proposeChanges;
  if (safeTaskType === 'restructure') return capabilities.executeWrites;
  if (safeTaskType === 'qa') return capabilities.read && capabilities.search;
  return capabilities.proposeChanges || capabilities.executeWrites || capabilities.read;
};

const listActivePersonalAgentsForUser = async (userId) => {
  const rows = await PersonalAgent.find({ userId, status: 'active' })
    .select('_id name capabilities updatedAt')
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  return Array.isArray(rows) ? rows : [];
};

const selectByoAgentForTask = ({
  agents = [],
  taskType = 'custom',
  preferredAgentId = '',
  preferredWorkerRole = ''
}) => {
  const compatible = agents.filter(agent => isByoAgentCompatibleForTask(agent, taskType));
  if (!compatible.length) return null;
  const safeWorkerRole = normalizeWorkerRole(preferredWorkerRole);
  const roleMatched = safeWorkerRole
    ? compatible.filter(agent => normalizePersonalAgentWorkerRoles(agent?.preferredWorkerRoles || []).includes(safeWorkerRole))
    : [];
  const pool = roleMatched.length > 0 ? roleMatched : compatible;
  const preferredId = String(preferredAgentId || '').trim();
  if (preferredId) {
    const preferred = pool.find(agent => String(agent._id) === preferredId)
      || compatible.find(agent => String(agent._id) === preferredId);
    if (preferred) return preferred;
  }
  return pool[0];
};

const resolveAutoHandoffRequestedActor = async ({
  userId,
  taskType = 'custom',
  policy = {},
  workerRole = ''
}) => {
  const safeTaskType = normalizeAgentHandoffTaskType(taskType, 'custom');
  const safePolicy = sanitizeAgentProtocolPolicy(policy);
  const preferredWorkerRole = normalizeWorkerRole(
    workerRole || inferWorkerRole({ taskType: safeTaskType }),
    ''
  );
  const override = safePolicy.taskOverrides[safeTaskType] || { actorType: '', actorId: '' };

  if (override.actorType) {
    let overrideActorId = String(override.actorId || '').trim();
    if (override.actorType === 'user' && !overrideActorId) overrideActorId = String(userId);
    if (override.actorType === 'byo_agent' && !overrideActorId) overrideActorId = String(safePolicy.defaultByoAgentId || '').trim();
    if (override.actorType !== 'byo_agent' || overrideActorId) {
      try {
        const resolved = await resolveAndValidateActorIdentity({
          userId,
          actor: { actorType: override.actorType, actorId: overrideActorId },
          fallbackType: 'native_agent'
        });
        return {
          requestedActor: resolved,
          planner: {
            routeSource: 'task_override',
            routingMode: safePolicy.routingMode
          }
        };
      } catch (_error) {
        // fall through to normal routing logic
      }
    }
  }

  const shouldConsiderByo = (
    safePolicy.routingMode === 'byo_first'
    || (
      safePolicy.routingMode === 'balanced'
      && (
        (safeTaskType === 'research' && safePolicy.allowByoForResearch)
        || (safeTaskType === 'synthesis' && safePolicy.allowByoForSynthesis)
      )
    )
  );

  if (shouldConsiderByo) {
    const agents = await listActivePersonalAgentsForUser(userId);
    const selectedByo = selectByoAgentForTask({
      agents,
      taskType: safeTaskType,
      preferredAgentId: safePolicy.defaultByoAgentId,
      preferredWorkerRole: safePolicy.preferByoSpecialists ? preferredWorkerRole : ''
    });
    if (selectedByo) {
      const selectedWorkerRoles = normalizePersonalAgentWorkerRoles(selectedByo.preferredWorkerRoles || []);
      return {
        requestedActor: { actorType: 'byo_agent', actorId: String(selectedByo._id) },
        planner: {
          routeSource: safePolicy.routingMode === 'byo_first' ? 'routing_mode_byo_first' : 'balanced_with_capability_match',
          routingMode: safePolicy.routingMode,
          activeWorkerRole: preferredWorkerRole || undefined,
          selectedByoAgent: {
            actorId: String(selectedByo._id),
            name: String(selectedByo.name || ''),
            preferredWorkerRoles: selectedWorkerRoles
          },
          specialistMatch: Boolean(preferredWorkerRole && selectedWorkerRoles.includes(preferredWorkerRole))
        }
      };
    }
  }

  return {
    requestedActor: { actorType: 'native_agent', actorId: '' },
    planner: {
      routeSource: safePolicy.routingMode === 'native_first' ? 'routing_mode_native_first' : 'fallback_native',
      routingMode: safePolicy.routingMode
    }
  };
};

const createSignedBridgeToken = ({
  userId,
  actorType = 'user',
  actorId = '',
  scope = 'agent_ops',
  ttlSeconds = DEFAULT_BRIDGE_TOKEN_TTL_SECONDS
}) => {
  const safeTtl = safeBridgeTokenTtlSeconds(ttlSeconds, DEFAULT_BRIDGE_TOKEN_TTL_SECONDS);
  const payload = {
    kind: AGENT_BRIDGE_TOKEN_KIND,
    userId: String(userId),
    actorType: normalizeAgentActorType(actorType, 'user'),
    actorId: String(actorId || '').trim(),
    scope: String(scope || 'agent_ops').trim() || 'agent_ops'
  };
  const token = jwt.sign(payload, getAgentBridgeJwtSecret(), {
    expiresIn: safeTtl,
    issuer: 'note-taker-3-1'
  });
  return { token, ttlSeconds: safeTtl };
};

const sanitizeProtocolApprovalDoc = (doc) => ({
  approvalId: String(doc?._id || ''),
  status: String(doc?.status || '').trim(),
  scope: String(doc?.scope || '').trim() || 'agent_ops',
  op: String(doc?.op || '').trim(),
  payload: doc?.payload && typeof doc.payload === 'object' ? doc.payload : {},
  preview: doc?.preview && typeof doc.preview === 'object' ? doc.preview : {},
  reason: String(doc?.reason || '').trim(),
  decisionNote: String(doc?.decisionNote || '').trim(),
  requestedBy: normalizeActorIdentity(doc?.requestedBy || {}, 'native_agent'),
  approvedBy: doc?.approvedBy ? normalizeActorIdentity(doc.approvedBy, 'user') : null,
  rejectedBy: doc?.rejectedBy ? normalizeActorIdentity(doc.rejectedBy, 'user') : null,
  approvedAt: doc?.approvedAt ? new Date(doc.approvedAt).toISOString() : null,
  rejectedAt: doc?.rejectedAt ? new Date(doc.rejectedAt).toISOString() : null,
  executedAt: doc?.executedAt ? new Date(doc.executedAt).toISOString() : null,
  createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  result: doc?.result && typeof doc.result === 'object' ? doc.result : {}
});

const sanitizeProtocolHookRunDoc = (doc) => ({
  hookRunId: String(doc?._id || ''),
  effect: normalizeProtocolHookEffect(doc?.effect, 'observe'),
  status: String(doc?.status || '').trim() || 'passed',
  source: String(doc?.source || '').trim() || 'native',
  phase: String(doc?.phase || '').trim(),
  scope: String(doc?.scope || '').trim() || 'agent_ops',
  op: String(doc?.op || '').trim(),
  actor: normalizeActorIdentity(doc?.actor || {}, 'native_agent'),
  threadId: String(doc?.threadId || '').trim(),
  handoffId: String(doc?.handoffId || '').trim(),
  approvalId: String(doc?.approvalId || '').trim(),
  preview: doc?.preview && typeof doc.preview === 'object' ? doc.preview : {},
  payload: doc?.payload && typeof doc.payload === 'object' ? doc.payload : {},
  result: doc?.result && typeof doc.result === 'object' ? doc.result : {},
  warningMessage: String(doc?.warningMessage || '').trim(),
  errorMessage: String(doc?.errorMessage || '').trim(),
  createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null
});

const BRIDGE_APPROVAL_REQUIRED_OPS = new Set([
  'project.write_draft',
  'threads.create',
  'threads.update',
  'threads.convert_to_handoff',
  'artifacts.drafts.create',
  'artifacts.drafts.promote',
  'artifacts.drafts.dismiss',
  'handoffs.create',
  'handoffs.claim',
  'handoffs.complete',
  'handoffs.reject'
]);

const BRIDGE_PROJECT_READ_TYPES = new Set([
  'article',
  'notebook',
  'concept',
  'question',
  'wiki_page',
  'thread',
  'handoff',
  'artifact_draft'
]);

const clampBridgeText = (value = '', maxLength = 1200) => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
);

const buildBridgeProjectResult = ({
  type,
  id,
  title = '',
  snippet = '',
  updatedAt = null,
  route = '',
  metadata = {}
}) => ({
  type,
  id: String(id || ''),
  title: String(title || '').trim() || 'Untitled',
  snippet: clampBridgeText(snippet, 700),
  updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
  route,
  metadata: metadata && typeof metadata === 'object' ? metadata : {}
});

const buildBridgeSearchRegex = (query = '') => {
  const safeQuery = String(query || '').trim();
  if (!safeQuery) return null;
  const escaped = safeQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
};

const bridgeCanRetrieveProject = ({ actor = {}, bridgeByoCapabilities = null } = {}) => {
  if (actor.actorType !== 'byo_agent') return true;
  return Boolean(bridgeByoCapabilities?.read || bridgeByoCapabilities?.search);
};

const bridgeCanWriteProject = ({ actor = {}, bridgeByoCapabilities = null } = {}) => {
  if (actor.actorType !== 'byo_agent') return true;
  return Boolean(bridgeByoCapabilities?.proposeChanges || bridgeByoCapabilities?.executeWrites);
};

const searchBridgeProjectCorpus = async ({
  userId,
  query = '',
  types = [],
  limit = 20
} = {}) => {
  const safeLimit = safeAgentHandoffLimit(limit, 20);
  const selectedTypes = Array.isArray(types)
    ? types.map(type => String(type || '').trim().toLowerCase()).filter(type => BRIDGE_PROJECT_READ_TYPES.has(type))
    : [];
  const includeType = (type) => selectedTypes.length === 0 || selectedTypes.includes(type);
  const matcher = buildBridgeSearchRegex(query);
  const results = [];
  const remaining = () => Math.max(0, safeLimit - results.length);

  if (includeType('article') && remaining() > 0) {
    const articleQuery = {
      userId,
      hiddenFromHome: { $ne: true },
      debugOnly: { $ne: true },
      archived: { $ne: true }
    };
    if (matcher) {
      articleQuery.$or = [
        { title: matcher },
        { content: matcher },
        { author: matcher },
        { siteName: matcher },
        { 'highlights.text': matcher },
        { 'highlights.note': matcher }
      ];
    }
    const rows = await Article.find(articleQuery)
      .select('_id title content author siteName url updatedAt highlights')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      const highlight = Array.isArray(row.highlights) ? row.highlights.find(item => (
        !matcher || matcher.test(String(item?.text || '')) || matcher.test(String(item?.note || ''))
      )) : null;
      results.push(buildBridgeProjectResult({
        type: 'article',
        id: row._id,
        title: row.title,
        snippet: highlight?.text || row.content,
        updatedAt: row.updatedAt,
        route: `/library?articleId=${encodeURIComponent(String(row._id))}`,
        metadata: { author: row.author || '', siteName: row.siteName || '', url: row.url || '' }
      }));
    });
  }

  if (includeType('notebook') && remaining() > 0) {
    const notebookQuery = { userId };
    if (matcher) {
      notebookQuery.$or = [
        { title: matcher },
        { content: matcher },
        { tags: matcher },
        { 'blocks.text': matcher }
      ];
    }
    const rows = await NotebookEntry.find(notebookQuery)
      .select('_id title content blocks tags type updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      const block = Array.isArray(row.blocks) ? row.blocks.find(item => !matcher || matcher.test(String(item?.text || ''))) : null;
      results.push(buildBridgeProjectResult({
        type: 'notebook',
        id: row._id,
        title: row.title,
        snippet: block?.text || row.content,
        updatedAt: row.updatedAt,
        route: `/think?tab=notebook&entryId=${encodeURIComponent(String(row._id))}`,
        metadata: { noteType: row.type || 'note', tags: Array.isArray(row.tags) ? row.tags : [] }
      }));
    });
  }

  if (includeType('concept') && remaining() > 0) {
    const conceptQuery = { userId };
    if (matcher) {
      conceptQuery.$or = [
        { name: matcher },
        { description: matcher },
        { workspaceTemplateName: matcher }
      ];
    }
    const rows = await TagMeta.find(conceptQuery)
      .select('_id name description workspaceTemplateName updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      results.push(buildBridgeProjectResult({
        type: 'concept',
        id: row._id,
        title: row.name,
        snippet: row.description || row.workspaceTemplateName,
        updatedAt: row.updatedAt,
        route: `/think?tab=concepts&concept=${encodeURIComponent(String(row.name || ''))}`,
        metadata: { workspaceTemplateName: row.workspaceTemplateName || '' }
      }));
    });
  }

  if (includeType('question') && remaining() > 0) {
    const questionQuery = { userId };
    if (matcher) {
      questionQuery.$or = [
        { text: matcher },
        { conceptName: matcher },
        { linkedTagName: matcher },
        { 'blocks.text': matcher }
      ];
    }
    const rows = await Question.find(questionQuery)
      .select('_id text status conceptName linkedTagName blocks updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      const block = Array.isArray(row.blocks) ? row.blocks.find(item => !matcher || matcher.test(String(item?.text || ''))) : null;
      results.push(buildBridgeProjectResult({
        type: 'question',
        id: row._id,
        title: row.text,
        snippet: block?.text || row.conceptName || row.linkedTagName,
        updatedAt: row.updatedAt,
        route: `/think?tab=questions&questionId=${encodeURIComponent(String(row._id))}`,
        metadata: { status: row.status || 'open', conceptName: row.conceptName || row.linkedTagName || '' }
      }));
    });
  }

  if (includeType('wiki_page') && remaining() > 0) {
    const wikiQuery = { userId };
    if (matcher) {
      wikiQuery.$or = [
        { title: matcher },
        { plainText: matcher },
        { slug: matcher }
      ];
    }
    const rows = await WikiPage.find(wikiQuery)
      .select('_id title plainText status pageType updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(remaining());
    rows.forEach((row) => {
      results.push(buildBridgeProjectResult({
        type: 'wiki_page',
        id: row._id,
        title: row.title,
        snippet: row.plainText,
        updatedAt: row.updatedAt,
        route: `/wiki/workspace?page=${encodeURIComponent(String(row._id))}`,
        metadata: { status: row.status || 'draft', pageType: row.pageType || 'topic' }
      }));
    });
  }

  return results.slice(0, safeLimit);
};

const readBridgeProjectItem = async ({
  userId,
  type = '',
  id = ''
} = {}) => {
  const safeType = String(type || '').trim().toLowerCase();
  const safeId = String(id || '').trim();
  if (!BRIDGE_PROJECT_READ_TYPES.has(safeType)) throw Object.assign(new Error('Unsupported project item type.'), { status: 400 });
  if (!mongoose.Types.ObjectId.isValid(safeId)) throw Object.assign(new Error('Invalid project item id.'), { status: 400 });

  if (safeType === 'article') {
    const row = await Article.findOne({ _id: safeId, userId }).select('_id title content author siteName url highlights updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project article not found.'), { status: 404 });
    return buildBridgeProjectResult({
      type: 'article',
      id: row._id,
      title: row.title,
      snippet: row.content,
      updatedAt: row.updatedAt,
      route: `/library?articleId=${encodeURIComponent(String(row._id))}`,
      metadata: {
        author: row.author || '',
        siteName: row.siteName || '',
        url: row.url || '',
        content: clampBridgeText(row.content, 12000),
        highlights: (Array.isArray(row.highlights) ? row.highlights : []).slice(0, 80).map(item => ({
          highlightId: String(item?._id || ''),
          text: clampBridgeText(item?.text, 2000),
          note: clampBridgeText(item?.note, 1000),
          tags: Array.isArray(item?.tags) ? item.tags : []
        }))
      }
    });
  }

  if (safeType === 'notebook') {
    const row = await NotebookEntry.findOne({ _id: safeId, userId }).select('_id title content blocks tags type updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project notebook entry not found.'), { status: 404 });
    return buildBridgeProjectResult({
      type: 'notebook',
      id: row._id,
      title: row.title,
      snippet: row.content,
      updatedAt: row.updatedAt,
      route: `/think?tab=notebook&entryId=${encodeURIComponent(String(row._id))}`,
      metadata: {
        noteType: row.type || 'note',
        tags: Array.isArray(row.tags) ? row.tags : [],
        content: clampBridgeText(row.content, 12000),
        blocks: (Array.isArray(row.blocks) ? row.blocks : []).slice(0, 200).map(block => ({
          id: String(block?.id || ''),
          type: String(block?.type || 'paragraph'),
          text: clampBridgeText(block?.text, 2000)
        }))
      }
    });
  }

  if (safeType === 'concept') {
    const row = await TagMeta.findOne({ _id: safeId, userId }).select('_id name description workspace workspaceTemplateName updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project concept not found.'), { status: 404 });
    const authorizedWorkspace = (await conceptWorkspaceAuthorization.sanitizeConceptWorkspace(row, userId))?.workspace || {};
    return buildBridgeProjectResult({
      type: 'concept',
      id: row._id,
      title: row.name,
      snippet: row.description,
      updatedAt: row.updatedAt,
      route: `/think?tab=concepts&concept=${encodeURIComponent(String(row.name || ''))}`,
      metadata: {
        description: row.description || '',
        workspaceTemplateName: row.workspaceTemplateName || '',
        workspace: authorizedWorkspace
      }
    });
  }

  if (safeType === 'question') {
    const row = await Question.findOne({ _id: safeId, userId }).select('_id text status conceptName linkedTagName blocks updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project question not found.'), { status: 404 });
    return buildBridgeProjectResult({
      type: 'question',
      id: row._id,
      title: row.text,
      snippet: row.conceptName || row.linkedTagName,
      updatedAt: row.updatedAt,
      route: `/think?tab=questions&questionId=${encodeURIComponent(String(row._id))}`,
      metadata: {
        status: row.status || 'open',
        conceptName: row.conceptName || row.linkedTagName || '',
        blocks: (Array.isArray(row.blocks) ? row.blocks : []).slice(0, 120).map(block => ({
          id: String(block?.id || ''),
          type: String(block?.type || 'paragraph'),
          text: clampBridgeText(block?.text, 2000)
        }))
      }
    });
  }

  if (safeType === 'wiki_page') {
    const row = await WikiPage.findOne({ _id: safeId, userId }).select('_id title plainText body status pageType claims citations sourceRefs updatedAt createdAt');
    if (!row) throw Object.assign(new Error('Project wiki page not found.'), { status: 404 });
    return buildBridgeProjectResult({
      type: 'wiki_page',
      id: row._id,
      title: row.title,
      snippet: row.plainText,
      updatedAt: row.updatedAt,
      route: `/wiki/workspace?page=${encodeURIComponent(String(row._id))}`,
      metadata: {
        status: row.status || 'draft',
        pageType: row.pageType || 'topic',
        plainText: clampBridgeText(row.plainText, 14000),
        claims: Array.isArray(row.claims) ? row.claims.slice(0, 120) : [],
        citations: Array.isArray(row.citations) ? row.citations.slice(0, 120) : [],
        sourceRefs: Array.isArray(row.sourceRefs) ? row.sourceRefs.slice(0, 120) : []
      }
    });
  }

  if (safeType === 'thread') {
    const row = await AgentThread.findOne({ _id: safeId, userId });
    if (!row) throw Object.assign(new Error('Project thread not found.'), { status: 404 });
    return { type: 'thread', item: sanitizeAgentThreadDoc(row) };
  }

  if (safeType === 'handoff') {
    const row = await AgentHandoff.findOne({ _id: safeId, userId });
    if (!row) throw Object.assign(new Error('Project handoff not found.'), { status: 404 });
    return { type: 'handoff', item: sanitizeAgentHandoffDoc(row) };
  }

  if (safeType === 'artifact_draft') {
    const row = await AgentArtifactDraft.findOne({ _id: safeId, userId });
    if (!row) throw Object.assign(new Error('Project artifact draft not found.'), { status: 404 });
    return { type: 'artifact_draft', item: sanitizeAgentArtifactDraftDoc(row) };
  }

  throw Object.assign(new Error('Unsupported project item type.'), { status: 400 });
};

const shouldRequireProtocolApproval = ({
  op = '',
  actor = {},
  source = 'bridge',
  policy = {}
} = {}) => {
  const safeOp = String(op || '').trim();
  const safeSource = String(source || 'bridge').trim().toLowerCase();
  if (!safeOp || !['bridge', 'native'].includes(safeSource)) return { requiresApproval: false, reason: '' };
  const beforeHookEffect = getProtocolHookEffect({ policy, phase: 'before', op: safeOp });
  if (beforeHookEffect === 'require_approval') {
    return {
      requiresApproval: true,
      reason: `Before hook for ${safeOp} requires approval.`
    };
  }
  if (String(actor?.actorType || '').trim().toLowerCase() === 'user') {
    return { requiresApproval: false, reason: '' };
  }
  if (!BRIDGE_APPROVAL_REQUIRED_OPS.has(safeOp)) {
    return { requiresApproval: false, reason: '' };
  }
  if (safeOp === 'threads.convert_to_handoff') {
    return {
      requiresApproval: true,
      reason: 'Agent-triggered conversion from thread to handoff requires approval.'
    };
  }
  if (safeOp === 'handoffs.complete' || safeOp === 'handoffs.reject') {
    return {
      requiresApproval: true,
      reason: 'Agent-driven handoff resolution requires approval.'
    };
  }
  return {
    requiresApproval: true,
    reason: 'Bridge-issued write operation requires approval.'
  };
};

const requestProtocolApproval = async ({
  userId,
  scope = 'agent_ops',
  op = '',
  payload = {},
  preview = {},
  reason = '',
  requestedBy = {}
} = {}) => {
  const approval = await AgentProtocolApproval.create({
    userId,
    status: 'pending',
    scope: String(scope || 'agent_ops').trim() || 'agent_ops',
    op: String(op || '').trim(),
    payload: payload && typeof payload === 'object' ? payload : {},
    preview: {
      title: String(
        preview?.title
        || payload?.draft?.title
        || payload?.title
        || payload?.message?.text
        || payload?.objective
        || ''
      ).trim(),
      threadId: String(preview?.threadId || payload?.threadId || '').trim(),
      handoffId: String(preview?.handoffId || payload?.handoffId || '').trim(),
      draftId: String(preview?.draftId || payload?.draftId || '').trim(),
      // What the agent wrote, so the owner reads it before saying yes.
      text: String(preview?.text || payload?.body || payload?.content || '').trim().slice(0, 4000)
    },
    reason: String(reason || '').trim(),
    requestedBy: normalizeActorIdentity(requestedBy || {}, 'native_agent')
  });
  return sanitizeProtocolApprovalDoc(approval);
};

const getProtocolHookEffect = ({
  policy = {},
  phase = 'before',
  op = ''
} = {}) => {
  const safePhase = String(phase || 'before').trim().toLowerCase();
  const safeOp = String(op || '').trim().toLowerCase();
  const hooks = normalizeAgentProtocolHooksPolicy(policy?.hooks || {});
  if (safeOp.startsWith('threads.')) {
    return safePhase === 'before' ? hooks.beforeThreadOps : hooks.afterThreadOps;
  }
  if (safeOp.startsWith('handoffs.')) {
    return safePhase === 'before' ? hooks.beforeHandoffOps : hooks.afterHandoffOps;
  }
  if (safeOp.startsWith('artifacts.')) {
    return safePhase === 'before' ? hooks.beforeThreadOps : hooks.afterThreadOps;
  }
  return 'off';
};

const buildProtocolHookWarningMessage = ({
  phase = 'before',
  op = ''
} = {}) => {
  const safePhase = String(phase || 'before').trim().toLowerCase();
  const safeOp = String(op || '').trim();
  return `${safePhase} hook warning for ${safeOp || 'protocol operation'}.`;
};

const collectHookWarnings = (...runs) => (
  runs
    .filter(Boolean)
    .map((run) => String(run?.warningMessage || '').trim())
    .filter(Boolean)
);

const buildProtocolHookPreview = ({
  payload = {},
  result = {},
  errorMessage = ''
} = {}) => ({
  title: String(
    payload?.title
    || result?.draft?.title
    || result?.thread?.title
    || result?.handoff?.title
    || payload?.message?.text
    || payload?.objective
    || ''
  ).trim(),
  threadId: String(
    payload?.threadId
    || result?.thread?.threadId
    || result?.approval?.preview?.threadId
    || ''
  ).trim(),
  handoffId: String(
    payload?.handoffId
    || result?.handoff?.handoffId
    || result?.approval?.preview?.handoffId
    || ''
  ).trim(),
  draftId: String(
    payload?.draftId
    || result?.draft?.draftId
    || result?.approval?.preview?.draftId
    || ''
  ).trim(),
  summary: String(errorMessage || payload?.note || '').trim()
});

const triggerProtocolHookPhase = async ({
  userId,
  actor = {},
  source = 'native',
  phase = 'before',
  scope = 'agent_ops',
  op = '',
  payload = {},
  result = {},
  approvalId = '',
  errorMessage = ''
} = {}) => {
  try {
    const policy = await getUserAgentProtocolPolicy(String(userId));
    const effect = getProtocolHookEffect({ policy, phase, op });
    if (effect === 'off') return null;
    const warningMessage = effect === 'warn'
      ? buildProtocolHookWarningMessage({ phase, op })
      : '';
    const hookRun = await AgentProtocolHookRun.create({
      userId,
      source: ['bridge', 'approval_replay'].includes(String(source || '').trim()) ? source : 'native',
      phase: String(phase || 'before').trim().toLowerCase() === 'after' ? 'after' : 'before',
      effect,
      status: errorMessage ? 'error' : 'passed',
      scope: String(scope || 'agent_ops').trim() || 'agent_ops',
      op: String(op || '').trim().toLowerCase(),
      actor: normalizeActorIdentity(actor || {}, 'native_agent'),
      threadId: String(
        payload?.threadId
        || result?.thread?.threadId
        || result?.approval?.preview?.threadId
        || ''
      ).trim(),
      handoffId: String(
        payload?.handoffId
        || result?.handoff?.handoffId
        || result?.approval?.preview?.handoffId
        || ''
      ).trim(),
      approvalId: mongoose.Types.ObjectId.isValid(approvalId) ? new mongoose.Types.ObjectId(String(approvalId)) : null,
      preview: buildProtocolHookPreview({ payload, result, errorMessage }),
      payload: payload && typeof payload === 'object' ? payload : {},
      result: result && typeof result === 'object' ? result : {},
      warningMessage,
      errorMessage: String(errorMessage || '').trim()
    });
    return sanitizeProtocolHookRunDoc(hookRun);
  } catch (error) {
    console.error('❌ Error recording protocol hook run:', error);
    return null;
  }
};

const sanitizeAgentHandoffDoc = (doc) => {
  const events = Array.isArray(doc?.events) ? doc.events : [];
  return {
    handoffId: String(doc?._id || ''),
    threadId: String(doc?.threadId || ''),
    title: String(doc?.title || ''),
    taskType: normalizeAgentHandoffTaskType(doc?.taskType, 'custom'),
    objective: String(doc?.objective || ''),
    status: normalizeAgentHandoffStatus(doc?.status, 'pending'),
    priority: normalizeAgentHandoffPriority(doc?.priority, 'normal'),
    context: doc?.context || {},
    input: doc?.input || {},
    output: doc?.output || {},
    planner: doc?.planner ? sanitizeAgentPlanner(doc.planner) : null,
    plan: normalizeThreadPlan(doc?.plan || {}),
    checkpoint: doc?.checkpoint ? normalizeThreadCheckpoint(doc.checkpoint) : null,
    requestedActor: normalizeActorIdentity(doc?.requestedActor || {}, 'native_agent'),
    createdBy: normalizeActorIdentity(doc?.createdBy || {}, 'user'),
    claimedBy: doc?.claimedBy ? normalizeActorIdentity(doc.claimedBy, 'native_agent') : null,
    completedBy: doc?.completedBy ? normalizeActorIdentity(doc.completedBy, 'native_agent') : null,
    rejectedBy: doc?.rejectedBy ? normalizeActorIdentity(doc.rejectedBy, 'native_agent') : null,
    cancelledBy: doc?.cancelledBy ? normalizeActorIdentity(doc.cancelledBy, 'user') : null,
    dueAt: doc?.dueAt ? new Date(doc.dueAt).toISOString() : null,
    claimedAt: doc?.claimedAt ? new Date(doc.claimedAt).toISOString() : null,
    completedAt: doc?.completedAt ? new Date(doc.completedAt).toISOString() : null,
    rejectedAt: doc?.rejectedAt ? new Date(doc.rejectedAt).toISOString() : null,
    cancelledAt: doc?.cancelledAt ? new Date(doc.cancelledAt).toISOString() : null,
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    events: events.slice(-50).map((event) => ({
      eventType: String(event?.eventType || '').trim(),
      actor: normalizeActorIdentity(event?.actor || {}, 'native_agent'),
      note: String(event?.note || ''),
      payload: event?.payload || {},
      createdAt: event?.createdAt ? new Date(event.createdAt).toISOString() : null
    }))
  };
};

const appendHandoffEvent = (handoff, {
  eventType,
  actor = {},
  note = '',
  payload = {}
}) => {
  if (!handoff) return;
  const safeEventType = String(eventType || '').trim();
  if (!safeEventType) return;
  const events = Array.isArray(handoff.events) ? handoff.events : [];
  events.push({
    eventType: safeEventType,
    actor: normalizeActorIdentity(actor, 'native_agent'),
    note: String(note || '').trim().slice(0, 1000),
    payload: payload && typeof payload === 'object' ? payload : {},
    createdAt: new Date()
  });
  handoff.events = events.slice(-200);
};

const matchesActorIdentity = (target = {}, actor = {}) => {
  const targetType = normalizeAgentActorType(target?.actorType, '');
  const actorType = normalizeAgentActorType(actor?.actorType, '');
  if (!targetType || !actorType || targetType !== actorType) return false;
  const targetId = String(target?.actorId || '').trim();
  const actorId = String(actor?.actorId || '').trim();
  if (!targetId) return true;
  return targetId === actorId;
};

const normalizeHandoffPayload = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return source;
};

const resolveAndValidateActorIdentity = async ({
  userId,
  actor = {},
  fallbackType = 'user'
}) => {
  const normalized = normalizeActorIdentity(actor, fallbackType);
  if (normalized.actorType !== 'byo_agent') return normalized;
  if (!mongoose.Types.ObjectId.isValid(normalized.actorId)) {
    const error = new Error('actorId must be a valid personal agent id for byo_agent actors.');
    error.status = 400;
    throw error;
  }
  const personalAgent = await PersonalAgent.findOne({
    _id: normalized.actorId,
    userId,
    status: 'active'
  }).select('_id');
  if (!personalAgent) {
    const error = new Error('Requested BYO agent was not found or is disabled.');
    error.status = 404;
    throw error;
  }
  return normalized;
};

const canActorClaimHandoff = (handoff, actor) => (
  matchesActorIdentity(handoff?.requestedActor || {}, actor)
);

const canActorMutateClaimedHandoff = (handoff, actor) => (
  matchesActorIdentity(handoff?.claimedBy || {}, actor)
);

const buildHandoffActorFilter = (actor = {}, scope = 'mine') => {
  const safeScope = String(scope || 'mine').trim().toLowerCase();
  if (safeScope === 'all') return {};
  const safeActorType = normalizeAgentActorType(actor?.actorType, '');
  const safeActorId = String(actor?.actorId || '').trim();
  if (!safeActorType) return {};
  if (safeActorId) {
    return {
      $or: [
        { 'requestedActor.actorType': safeActorType, 'requestedActor.actorId': safeActorId },
        { 'claimedBy.actorType': safeActorType, 'claimedBy.actorId': safeActorId },
        { 'createdBy.actorType': safeActorType, 'createdBy.actorId': safeActorId }
      ]
    };
  }
  return {
    $or: [
      { 'requestedActor.actorType': safeActorType },
      { 'claimedBy.actorType': safeActorType },
      { 'createdBy.actorType': safeActorType }
    ]
  };
};

const runBridgeHandoffOperation = async ({
  bridgeActor,
  op,
  payload = {},
  executionSource = 'bridge',
  approvalId = ''
}) => {
  const userId = String(bridgeActor?.userId || '').trim();
  const policy = await getUserAgentProtocolPolicy(String(userId));
  const actor = {
    actorType: normalizeAgentActorType(bridgeActor?.actorType, 'user'),
    actorId: String(bridgeActor?.actorId || '').trim()
  };
  let operation = String(op || '').trim().toLowerCase();
  let bridgeByoCapabilities = null;
  if (actor.actorType === 'byo_agent') {
    const byAgent = await PersonalAgent.findOne({
      _id: actor.actorId,
      userId,
      status: 'active'
    }).select('capabilities');
    if (!byAgent) throw Object.assign(new Error('BYO bridge actor is not active.'), { status: 403 });
    bridgeByoCapabilities = normalizePersonalAgentCapabilities(byAgent.capabilities || {});
  }

  // Only the replay of an approval the reader gave skips asking again; a caller never can.
  const bypassProtocolApproval = executionSource === 'approval_replay';
  const approvalPolicy = shouldRequireProtocolApproval({
    op: operation,
    actor,
    source: 'bridge',
    policy
  });
  if (approvalPolicy.requiresApproval && !bypassProtocolApproval) {
    const draft = ['artifacts.drafts.promote', 'artifacts.drafts.dismiss'].includes(operation) && mongoose.Types.ObjectId.isValid(String(payload.draftId || ''))
      ? await AgentArtifactDraft.findOne({ _id: payload.draftId, userId }).select('title body').lean()
      : null;
    const approval = await requestProtocolApproval({
      userId,
      scope: String(bridgeActor?.scope || 'agent_ops').trim() || 'agent_ops',
      op: operation,
      payload,
      preview: draft ? { title: draft.title, text: draft.body } : {},
      reason: approvalPolicy.reason,
      requestedBy: actor
    });
    return {
      status: 'approval_required',
      reason: approvalPolicy.reason,
      approval
    };
  }

  const beforeHookRun = await triggerProtocolHookPhase({
    userId,
    actor,
    source: executionSource,
    phase: 'before',
    scope: String(bridgeActor?.scope || 'agent_ops').trim() || 'agent_ops',
    op: operation,
    payload,
    approvalId
  });

  const finalizeOperation = async (result) => {
    const afterHookRun = await triggerProtocolHookPhase({
      userId,
      actor,
      source: executionSource,
      phase: 'after',
      scope: String(bridgeActor?.scope || 'agent_ops').trim() || 'agent_ops',
      op: operation,
      payload,
      result,
      approvalId
    });
    const warnings = collectHookWarnings(beforeHookRun, afterHookRun);
    if (warnings.length > 0 && result && typeof result === 'object') {
      return { ...result, hookWarnings: warnings };
    }
    return result;
  };

  if (operation === 'bridge.access_check') {
    const projectReadable = bridgeCanRetrieveProject({ actor, bridgeByoCapabilities });
    const projectWritable = bridgeCanWriteProject({ actor, bridgeByoCapabilities });
    const searchResults = projectReadable
      ? await searchBridgeProjectCorpus({
          userId,
          query: payload.query || '',
          types: payload.types || [],
          limit: payload.limit || 5
        })
      : [];
    return finalizeOperation({
      status: 'ready',
      actor,
      scope: String(bridgeActor?.scope || 'agent_ops').trim() || 'agent_ops',
      access: {
        projectRead: projectReadable,
        projectRetrieve: projectReadable,
        projectSearch: projectReadable,
        projectEdit: projectWritable,
        writeMode: 'controlled_drafts_and_approval_gated_mutations',
        readableTypes: Array.from(BRIDGE_PROJECT_READ_TYPES),
        approvalGatedOperations: Array.from(BRIDGE_APPROVAL_REQUIRED_OPS)
      },
      checks: {
        manifest: true,
        projectSearch: projectReadable,
        projectWriteBoundary: projectWritable,
        protocolApprovals: actor.actorType !== 'user'
      },
      sampleResults: searchResults,
      nextMcpMethods: [
        'project/search',
        'project/read',
        'project/write_draft',
        'threads/create',
        'artifacts/drafts/create',
        'handoffs/create'
      ]
    });
  }

  if (operation === 'project.search') {
    if (!bridgeCanRetrieveProject({ actor, bridgeByoCapabilities })) {
      throw Object.assign(new Error('This BYO actor cannot search project context.'), { status: 403 });
    }
    const results = await searchBridgeProjectCorpus({
      userId,
      query: payload.query || '',
      types: payload.types || [],
      limit: payload.limit || 20
    });
    return finalizeOperation({
      query: String(payload.query || '').trim(),
      results
    });
  }

  if (operation === 'project.read') {
    if (!bridgeCanRetrieveProject({ actor, bridgeByoCapabilities })) {
      throw Object.assign(new Error('This BYO actor cannot read project context.'), { status: 403 });
    }
    const item = await readBridgeProjectItem({
      userId,
      type: payload.type,
      id: payload.id || payload.itemId
    });
    return finalizeOperation({ item });
  }

  if (operation === 'project.write_draft') {
    operation = 'artifacts.drafts.create';
  }

  if (operation === 'threads.list') {
    const query = { userId };
    const status = String(payload.status || 'active').trim().toLowerCase();
    if (status !== 'all') query.status = normalizeThreadStatus(status, 'active');
    const scopeType = String(payload.scopeType || '').trim().toLowerCase();
    const scopeId = String(payload.scopeId || '').trim();
    const handoffId = String(payload.handoffId || '').trim();
    if (scopeType) query['scope.type'] = scopeType;
    if (scopeId) query['scope.id'] = scopeId;
    if (handoffId && mongoose.Types.ObjectId.isValid(handoffId)) query.handoffId = handoffId;
    const limit = safeAgentHandoffLimit(payload.limit, 50);
    const rows = await AgentThread.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
    return finalizeOperation({ threads: rows.map(sanitizeAgentThreadDoc) });
  }

  if (operation === 'threads.get') {
    const threadId = String(payload.threadId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      throw Object.assign(new Error('Invalid thread id.'), { status: 400 });
    }
    const thread = await AgentThread.findOne({ _id: threadId, userId });
    if (!thread) throw Object.assign(new Error('Thread not found.'), { status: 404 });
    return finalizeOperation({ thread: sanitizeAgentThreadDoc(thread) });
  }

  if (operation === 'threads.create') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot create shared threads.'), { status: 403 });
    }
    const planner = payload.planner && typeof payload.planner === 'object'
      ? sanitizeAgentPlanner(payload.planner)
      : buildAgentPlanner({
          taskType: payload?.scope?.metadata?.taskType || 'custom',
          requestedActor: actor
        });
    const thread = await AgentThread.create({
      userId,
      title: buildDefaultThreadTitle(payload.title || payload?.initialMessage?.text || 'Agent thread'),
      status: normalizeThreadStatus(payload.status, 'active'),
      summary: String(payload.summary || '').trim().slice(0, 280),
      scope: normalizeThreadScope(payload.scope || {}),
      createdBy: actor,
      lastActor: actor,
      handoffId: mongoose.Types.ObjectId.isValid(payload.handoffId) ? payload.handoffId : null,
      planner,
      plan: normalizeThreadPlan(payload.plan || {}),
      checkpoint: payload.checkpoint ? normalizeThreadCheckpoint({ ...(payload.checkpoint || {}), updatedBy: actor }) : undefined,
      messages: []
    });
    if (payload.initialMessage) {
      appendThreadMessage(thread, {
        ...normalizeThreadMessage(payload.initialMessage, payload.initialMessage?.role || 'user'),
        actor
      });
      compactThreadState(thread, { actor });
      await thread.save();
    }
    return finalizeOperation({ thread: sanitizeAgentThreadDoc(thread) });
  }

  if (operation === 'threads.update' || operation === 'threads.append_message') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot update shared threads.'), { status: 403 });
    }
    const threadId = String(payload.threadId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      throw Object.assign(new Error('Invalid thread id.'), { status: 400 });
    }
    const thread = await AgentThread.findOne({ _id: threadId, userId });
    if (!thread) throw Object.assign(new Error('Thread not found.'), { status: 404 });

    if (operation === 'threads.update') {
      if (payload.title !== undefined) thread.title = String(payload.title || '').trim().slice(0, 200);
      if (payload.status !== undefined) thread.status = normalizeThreadStatus(payload.status, thread.status || 'active');
      if (payload.summary !== undefined) thread.summary = String(payload.summary || '').trim().slice(0, 280);
      if (payload.plan !== undefined) thread.plan = normalizeThreadPlan(payload.plan || {});
      if (payload.planner !== undefined) thread.planner = payload.planner ? normalizeThreadPlanner(payload.planner) : undefined;
      if (payload.checkpoint !== undefined) {
        thread.checkpoint = payload.checkpoint ? normalizeThreadCheckpoint({ ...(payload.checkpoint || {}), updatedBy: actor }) : undefined;
      }
      thread.lastActor = actor;
      await thread.save();
      return finalizeOperation({ thread: sanitizeAgentThreadDoc(thread) });
    }

    appendThreadMessage(thread, {
      ...normalizeThreadMessage(payload.message || {}, payload?.message?.role || 'assistant'),
      actor
    });
    if (payload.plan !== undefined) thread.plan = normalizeThreadPlan(payload.plan || {});
    if (payload.planner !== undefined) thread.planner = payload.planner ? normalizeThreadPlanner(payload.planner) : thread.planner;
    if (payload.checkpoint !== undefined) {
      thread.checkpoint = payload.checkpoint ? normalizeThreadCheckpoint({ ...(payload.checkpoint || {}), updatedBy: actor }) : undefined;
    }
    compactThreadState(thread, { actor });
    await thread.save();
    return finalizeOperation({ thread: sanitizeAgentThreadDoc(thread) });
  }

  if (operation === 'threads.convert_to_handoff') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot convert shared threads to handoffs.'), { status: 403 });
    }
    const threadId = String(payload.threadId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      throw Object.assign(new Error('Invalid thread id.'), { status: 400 });
    }
    const thread = await AgentThread.findOne({ _id: threadId, userId });
    if (!thread) throw Object.assign(new Error('Thread not found.'), { status: 404 });

    if (thread.handoffId && mongoose.Types.ObjectId.isValid(String(thread.handoffId))) {
      const existingHandoff = await AgentHandoff.findOne({ _id: thread.handoffId, userId });
      if (existingHandoff) {
        return finalizeOperation({
          thread: sanitizeAgentThreadDoc(thread),
          handoff: sanitizeAgentHandoffDoc(existingHandoff),
          reused: true
        });
      }
    }

    const title = String(payload.title || thread.title || thread?.scope?.title || 'Thread handoff').trim().slice(0, 200);
    const taskType = normalizeAgentHandoffTaskType(payload.taskType || thread?.scope?.metadata?.taskType || 'custom', 'custom');
    const priority = normalizeAgentHandoffPriority(payload.priority, 'normal');
    const objective = String(
      payload.objective
      || thread?.checkpoint?.summary
      || thread?.summary
      || thread?.plan?.objective
      || title
    ).trim().slice(0, 4000);
    let requestedActor = null;
    let planner = null;
    const autoRoute = payload.autoRoute !== false;
    if (autoRoute) {
      const policy = await getUserAgentProtocolPolicy(String(userId));
      const routingPlan = await resolveAutoHandoffRequestedActor({
        userId: String(userId),
        taskType,
        policy,
        workerRole: payload?.planner?.activeWorkerRole || thread?.planner?.activeWorkerRole || ''
      });
      requestedActor = routingPlan.requestedActor;
      planner = routingPlan.planner;
    } else {
      requestedActor = await resolveAndValidateActorIdentity({
        userId,
        actor: payload.requestedActor || { actorType: 'native_agent', actorId: '' },
        fallbackType: 'native_agent'
      });
    }
    if (requestedActor.actorType === 'user' && !requestedActor.actorId) requestedActor.actorId = String(userId);
    const plan = normalizeThreadPlan(
      Array.isArray(thread?.plan?.steps) && thread.plan.steps.length > 0
        ? thread.plan
        : buildDefaultHandoffPlan({ taskType, title, objective })
    );
    const checkpoint = thread?.checkpoint
      ? normalizeThreadCheckpoint({ ...(thread.checkpoint || {}), updatedBy: actor })
      : buildDefaultHandoffCheckpoint({ title, requestedActor });
    const handoffPlanner = sanitizeAgentPlanner(
      payload.planner
      || planner
      || thread?.planner
      || buildAgentPlanner({ taskType, requestedActor, routePlanner: planner })
    );
    const handoff = await AgentHandoff.create({
      userId,
      title,
      taskType,
      objective,
      status: 'pending',
      priority,
      context: {
        ...(payload.context && typeof payload.context === 'object' ? payload.context : {}),
        sourceThread: {
          threadId: String(thread._id),
          scope: normalizeThreadScope(thread.scope || {}),
          summary: String(thread.summary || '').trim().slice(0, 280)
        }
      },
      input: {
        ...(payload.input && typeof payload.input === 'object' ? payload.input : {}),
        threadCheckpoint: checkpoint,
        threadPlan: plan
      },
      output: {},
      threadId: thread._id,
      planner: handoffPlanner,
      plan,
      checkpoint,
      requestedActor,
      createdBy: actor,
      events: [{
        eventType: 'created',
        actor,
        note: 'Converted from shared thread.',
        payload: { sourceThreadId: String(thread._id), requestedActor, planner: handoffPlanner }
      }]
    });
    thread.handoffId = handoff._id;
    thread.planner = handoffPlanner;
    appendThreadMessage(thread, {
      role: 'system',
      text: `Converted to handoff "${title}".`,
      actor,
      metadata: { eventType: 'handoff_created', handoffId: String(handoff._id), planner: handoffPlanner }
    });
    thread.checkpoint = normalizeThreadCheckpoint({
      summary: checkpoint.summary || thread.summary || `Linked to handoff "${title}".`,
      openQuestions: Array.isArray(checkpoint.openQuestions) ? checkpoint.openQuestions : [],
      nextActions: [`Open the linked handoff "${title}".`],
      updatedBy: actor
    });
    await thread.save();
    return finalizeOperation({
      thread: sanitizeAgentThreadDoc(thread),
      handoff: sanitizeAgentHandoffDoc(handoff),
      planner: handoffPlanner
    });
  }

  if (operation === 'artifacts.drafts.list') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.read && !bridgeByoCapabilities?.search) {
      throw Object.assign(new Error('This BYO actor cannot inspect shared artifact drafts.'), { status: 403 });
    }
    const query = { userId };
    const status = String(payload.status || 'pending').trim().toLowerCase();
    if (status && status !== 'all') {
      if (!['pending', 'promoted', 'dismissed'].includes(status)) {
        throw Object.assign(new Error('Invalid draft status filter.'), { status: 400 });
      }
      query.status = status;
    }
    const artifactType = String(payload.artifactType || '').trim().toLowerCase();
    if (artifactType) {
      if (!['note', 'concept', 'question', 'handoff'].includes(artifactType)) {
        throw Object.assign(new Error('Invalid artifactType filter.'), { status: 400 });
      }
      query.artifactType = artifactType;
    }
    const threadId = String(payload.threadId || '').trim();
    const handoffId = String(payload.handoffId || '').trim();
    if (threadId) query.sourceThreadId = threadId;
    if (handoffId) query.sourceHandoffId = handoffId;
    const limit = safeAgentHandoffLimit(payload.limit, 50);
    const rows = await AgentArtifactDraft.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
    return finalizeOperation({ drafts: rows.map(sanitizeAgentArtifactDraftDoc) });
  }

  if (operation === 'artifacts.drafts.create') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot create artifact drafts.'), { status: 403 });
    }
    const sourceThreadId = String(payload.sourceThreadId || payload.threadId || '').trim();
    const sourceHandoffId = String(payload.sourceHandoffId || payload.handoffId || '').trim();
    if (sourceThreadId) {
      if (!mongoose.Types.ObjectId.isValid(sourceThreadId)) {
        throw Object.assign(new Error('Invalid sourceThreadId.'), { status: 400 });
      }
      const thread = await AgentThread.findOne({ _id: sourceThreadId, userId });
      if (!thread) throw Object.assign(new Error('Source thread not found.'), { status: 404 });
    }
    if (sourceHandoffId) {
      if (!mongoose.Types.ObjectId.isValid(sourceHandoffId)) {
        throw Object.assign(new Error('Invalid sourceHandoffId.'), { status: 400 });
      }
      const handoff = await AgentHandoff.findOne({ _id: sourceHandoffId, userId });
      if (!handoff) throw Object.assign(new Error('Source handoff not found.'), { status: 404 });
    }
    const draft = await createAgentArtifactDraftRecord({
      AgentArtifactDraft,
      userId,
      actor,
      payload
    });
    if (!draft) {
      throw Object.assign(new Error('artifactType and body are required to create a draft.'), { status: 400 });
    }
    return finalizeOperation({ draft: sanitizeAgentArtifactDraftDoc(draft) });
  }

  if (operation === 'artifacts.drafts.promote' || operation === 'artifacts.drafts.dismiss') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges && !bridgeByoCapabilities?.executeWrites) {
      throw Object.assign(new Error('This BYO actor cannot mutate artifact drafts.'), { status: 403 });
    }
    const draftId = String(payload.draftId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(draftId)) {
      throw Object.assign(new Error('Invalid draft id.'), { status: 400 });
    }
    const draft = await AgentArtifactDraft.findOne({ _id: draftId, userId });
    if (!draft) throw Object.assign(new Error('Draft not found.'), { status: 404 });

    if (operation === 'artifacts.drafts.dismiss') {
      draft.status = 'dismissed';
      await draft.save();
      return finalizeOperation({ draft: sanitizeAgentArtifactDraftDoc(draft) });
    }

    if (String(draft.status || '') === 'promoted') {
      return finalizeOperation({ draft: sanitizeAgentArtifactDraftDoc(draft), reused: true });
    }

    const result = await promoteAgentArtifactDraftRecord({
      draft,
      userId,
      NotebookEntry,
      Question,
      updateConceptMeta,
      syncNotebookReferences,
      enqueueNotebookEmbedding,
      enqueueQuestionEmbedding,
      createBlockId,
      AgentHandoff,
      buildDefaultHandoffPlan,
      buildDefaultHandoffCheckpoint,
      createThreadForHandoff,
      sanitizeAgentHandoffDoc
    });
    return finalizeOperation({
      draft: sanitizeAgentArtifactDraftDoc(result.draft),
      promoted: result.promoted
    });
  }

  if (operation === 'handoffs.list') {
    const query = { userId };
    const status = String(payload.status || 'all').trim().toLowerCase();
    if (status !== 'all') {
      if (!AGENT_HANDOFF_STATUSES.has(status)) throw Object.assign(new Error('Invalid handoff status filter.'), { status: 400 });
      query.status = status;
    }
    const taskType = String(payload.taskType || '').trim().toLowerCase();
    if (taskType) {
      if (!AGENT_HANDOFF_TASK_TYPES.has(taskType)) throw Object.assign(new Error('Invalid taskType filter.'), { status: 400 });
      query.taskType = taskType;
    }
    Object.assign(query, buildHandoffActorFilter(actor, payload.scope || 'mine'));
    const limit = safeAgentHandoffLimit(payload.limit, 50);
    const rows = await AgentHandoff.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit);
    return finalizeOperation({ handoffs: rows.map(sanitizeAgentHandoffDoc) });
  }

  if (operation === 'handoffs.create') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot create protocol handoffs.'), { status: 403 });
    }
    const title = String(payload.title || '').trim();
    if (!title) throw Object.assign(new Error('title is required.'), { status: 400 });
    const taskType = normalizeAgentHandoffTaskType(payload.taskType, 'custom');
    const priority = normalizeAgentHandoffPriority(payload.priority, 'normal');
    const objective = String(payload.objective || '').trim().slice(0, 4000);
    const dueAt = parseOptionalDate(payload.dueAt);
    if (payload.dueAt && !dueAt) throw Object.assign(new Error('dueAt must be a valid date when provided.'), { status: 400 });

    const requestedActor = await resolveAndValidateActorIdentity({
      userId,
      actor: payload.requestedActor || { actorType: 'native_agent', actorId: '' },
      fallbackType: 'native_agent'
    });
    if (requestedActor.actorType === 'user' && !requestedActor.actorId) requestedActor.actorId = String(userId);

    const plan = buildDefaultHandoffPlan({ taskType, title, objective });
    const checkpoint = buildDefaultHandoffCheckpoint({ title, requestedActor });
    const handoffPlanner = sanitizeAgentPlanner(
      payload.planner || buildAgentPlanner({ taskType, requestedActor })
    );
    const handoff = await AgentHandoff.create({
      userId,
      title: title.slice(0, 200),
      taskType,
      objective,
      status: 'pending',
      priority,
      context: payload.context && typeof payload.context === 'object' ? payload.context : {},
      input: payload.input && typeof payload.input === 'object' ? payload.input : {},
      output: {},
      planner: handoffPlanner,
      plan,
      checkpoint,
      requestedActor,
      createdBy: actor,
      dueAt,
      events: [{
        eventType: 'created',
        actor,
        note: '',
        payload: { taskType, priority, requestedActor, planner: handoffPlanner }
      }]
    });
    const thread = await createThreadForHandoff({
      userId,
      title,
      objective,
      taskType,
      requestedActor,
      planner: handoffPlanner,
      createdBy: actor,
      handoffId: handoff._id
    });
    handoff.threadId = thread._id;
    await handoff.save();
    return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
  }

  const handoffId = String(payload.handoffId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(handoffId)) {
    throw Object.assign(new Error('Invalid handoff id.'), { status: 400 });
  }
  const handoff = await AgentHandoff.findOne({ _id: handoffId, userId });
  if (!handoff) throw Object.assign(new Error('Handoff not found.'), { status: 404 });

  if (operation === 'handoffs.ensure_thread') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges) {
      throw Object.assign(new Error('This BYO actor cannot continue handoffs in shared threads.'), { status: 403 });
    }
    let thread = null;
    if (handoff.threadId && mongoose.Types.ObjectId.isValid(String(handoff.threadId))) {
      thread = await AgentThread.findOne({ _id: handoff.threadId, userId });
    }
    if (!thread) {
      thread = await createThreadForHandoff({
        userId,
        title: handoff.title || 'Handoff thread',
        objective: handoff.objective || handoff.checkpoint?.summary || '',
        taskType: handoff.taskType || 'custom',
        requestedActor: handoff.requestedActor || {},
        planner: handoff.planner || buildAgentPlanner({
          taskType: handoff.taskType || 'custom',
          requestedActor: handoff.requestedActor || {}
        }),
        createdBy: actor,
        handoffId: handoff._id
      });
      if (handoff.plan) thread.plan = handoff.plan;
      if (handoff.planner) thread.planner = handoff.planner;
      if (handoff.checkpoint) {
        thread.checkpoint = normalizeThreadCheckpoint({ ...(handoff.checkpoint || {}), updatedBy: actor });
      }
      await thread.save();
      handoff.threadId = thread._id;
      appendHandoffEvent(handoff, {
        eventType: 'note',
        actor,
        note: 'Continued in linked thread.'
      });
      await handoff.save();
    }
    return finalizeOperation({
      handoff: sanitizeAgentHandoffDoc(handoff),
      thread: sanitizeAgentThreadDoc(thread)
    });
  }

  if (operation === 'handoffs.claim') {
    if (handoff.status === 'claimed') {
      if (!canActorMutateClaimedHandoff(handoff, actor)) {
        throw Object.assign(new Error('Handoff is already claimed by a different actor.'), { status: 409 });
      }
      return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
    }
    if (handoff.status !== 'pending') {
      throw Object.assign(new Error(`Handoff is ${handoff.status || 'not pending'} and cannot be claimed.`), { status: 400 });
    }
    if (!canActorClaimHandoff(handoff, actor)) {
      throw Object.assign(new Error('This actor is not allowed to claim this handoff.'), { status: 403 });
    }
    handoff.status = 'claimed';
    handoff.claimedBy = actor;
    handoff.claimedAt = new Date();
    handoff.checkpoint = normalizeThreadCheckpoint({
      summary: `Claimed by ${actor.actorType}.`,
      nextActions: ['Continue the active plan step.'],
      updatedBy: actor
    });
    appendHandoffEvent(handoff, { eventType: 'claimed', actor, note: String(payload.note || '').trim() });
    await handoff.save();
    if (handoff.threadId) {
      const thread = await AgentThread.findOne({ _id: handoff.threadId, userId });
      if (thread) {
        appendThreadMessage(thread, {
          role: 'assistant',
          text: `Claimed handoff "${handoff.title || 'Untitled handoff'}".`,
          actor,
          metadata: { eventType: 'claimed' }
        });
        thread.checkpoint = normalizeThreadCheckpoint({
          summary: `Claimed by ${actor.actorType}.`,
          nextActions: ['Continue the active plan step.'],
          updatedBy: actor
        });
        await thread.save();
      }
    }
    return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
  }

  if (operation === 'handoffs.complete') {
    if (actor.actorType === 'byo_agent' && !bridgeByoCapabilities?.proposeChanges && !bridgeByoCapabilities?.executeWrites) {
      throw Object.assign(new Error('This BYO actor cannot complete protocol handoffs.'), { status: 403 });
    }
    if (handoff.status !== 'claimed') throw Object.assign(new Error('Only claimed handoffs can be completed.'), { status: 400 });
    if (!canActorMutateClaimedHandoff(handoff, actor)) {
      throw Object.assign(new Error('Only the claiming actor can complete this handoff.'), { status: 403 });
    }
    const output = payload.output && typeof payload.output === 'object' ? payload.output : {};
    handoff.status = 'completed';
    handoff.output = output;
    handoff.completedBy = actor;
    handoff.completedAt = new Date();
    handoff.checkpoint = normalizeThreadCheckpoint({
      summary: `Completed with ${Object.keys(output).length > 0 ? 'an output artifact' : 'no structured artifact'}.`,
      nextActions: [],
      updatedBy: actor
    });
    appendHandoffEvent(handoff, {
      eventType: 'completed',
      actor,
      note: String(payload.note || '').trim(),
      payload: { hasOutput: Object.keys(output).length > 0 }
    });
    await handoff.save();
    if (handoff.threadId) {
      const thread = await AgentThread.findOne({ _id: handoff.threadId, userId });
      if (thread) {
        appendThreadMessage(thread, {
          role: 'assistant',
          text: String(payload.note || '').trim() || `Completed handoff "${handoff.title || 'Untitled handoff'}".`,
          actor,
          metadata: { eventType: 'completed', output }
        });
        thread.checkpoint = normalizeThreadCheckpoint({
          summary: `Completed by ${actor.actorType}.`,
          nextActions: [],
          updatedBy: actor
        });
        thread.status = 'archived';
        await thread.save();
      }
    }
    return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
  }

  if (operation === 'handoffs.reject') {
    if (!['pending', 'claimed'].includes(handoff.status)) {
      throw Object.assign(new Error(`Handoff is ${handoff.status || 'not rejectable'}.`), { status: 400 });
    }
    if (handoff.status === 'pending' && !canActorClaimHandoff(handoff, actor)) {
      throw Object.assign(new Error('This actor cannot reject this handoff.'), { status: 403 });
    }
    if (handoff.status === 'claimed' && !canActorMutateClaimedHandoff(handoff, actor)) {
      throw Object.assign(new Error('Only the claiming actor can reject this handoff.'), { status: 403 });
    }
    handoff.status = 'rejected';
    handoff.rejectedBy = actor;
    handoff.rejectedAt = new Date();
    handoff.checkpoint = normalizeThreadCheckpoint({
      summary: `Rejected by ${actor.actorType}.`,
      nextActions: ['Review the rejection note and reroute if needed.'],
      updatedBy: actor
    });
    appendHandoffEvent(handoff, { eventType: 'rejected', actor, note: String(payload.note || '').trim() });
    await handoff.save();
    if (handoff.threadId) {
      const thread = await AgentThread.findOne({ _id: handoff.threadId, userId });
      if (thread) {
        appendThreadMessage(thread, {
          role: 'assistant',
          text: String(payload.note || '').trim() || `Rejected handoff "${handoff.title || 'Untitled handoff'}".`,
          actor,
          metadata: { eventType: 'rejected' }
        });
        thread.checkpoint = normalizeThreadCheckpoint({
          summary: `Rejected by ${actor.actorType}.`,
          nextActions: ['Review the rejection note and reroute if needed.'],
          updatedBy: actor
        });
        await thread.save();
      }
    }
    return finalizeOperation({ handoff: sanitizeAgentHandoffDoc(handoff) });
  }

  throw Object.assign(new Error('Unsupported bridge operation.'), { status: 400 });
};

const listProtocolApprovals = async ({
  userId,
  status = 'pending',
  limit = 30,
  threadId = '',
  handoffId = '',
  op = ''
}) => {
  const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(String(userId)) : null;
  if (!userObjectId) throw Object.assign(new Error('userId must be a valid ObjectId.'), { status: 400 });
  const query = { userId: userObjectId };
  const safeStatus = String(status || 'pending').trim().toLowerCase();
  if (safeStatus && safeStatus !== 'all') {
    query.status = safeStatus;
  }
  const safeThreadId = String(threadId || '').trim();
  const safeHandoffId = String(handoffId || '').trim();
  const safeOp = String(op || '').trim().toLowerCase();
  if (safeThreadId) query['preview.threadId'] = safeThreadId;
  if (safeHandoffId) query['preview.handoffId'] = safeHandoffId;
  if (safeOp) query.op = safeOp;
  const safeLimit = safeAgentHandoffLimit(limit, 30);
  const rows = await AgentProtocolApproval.find(query).sort({ createdAt: -1 }).limit(safeLimit);
  return rows.map(sanitizeProtocolApprovalDoc);
};

const approveProtocolApproval = async ({
  userId,
  approvalId,
  actorType = 'user',
  actorId = ''
}) => {
  const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(String(userId)) : null;
  const approvalObjectId = mongoose.Types.ObjectId.isValid(approvalId) ? new mongoose.Types.ObjectId(String(approvalId)) : null;
  if (!userObjectId) throw Object.assign(new Error('userId must be a valid ObjectId.'), { status: 400 });
  if (!approvalObjectId) throw Object.assign(new Error('approvalId must be a valid ObjectId.'), { status: 400 });

  const approval = await AgentProtocolApproval.findOne({ _id: approvalObjectId, userId: userObjectId });
  if (!approval) throw Object.assign(new Error('Protocol approval request not found.'), { status: 404 });
  if (String(approval.status || '') !== 'pending') {
    throw Object.assign(new Error(`Protocol approval request is ${approval.status || 'not pending'}.`), { status: 400 });
  }

  approval.status = 'approved';
  approval.approvedAt = new Date();
  approval.approvedBy = {
    actorType: normalizeAgentActorType(actorType, 'user'),
    actorId: String(actorId || userId || '').trim()
  };
  await approval.save();

  try {
    const approvalOp = String(approval.op || '').trim().toLowerCase();
    if (approvalOp === 'runs.resume') {
      const runId = String(approval.payload?.runId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(runId)) {
        throw Object.assign(new Error('Run approval payload is missing a valid run id.'), { status: 400 });
      }
      const runDoc = await AgentRun.findOne({ _id: runId, userId: userObjectId });
      if (!runDoc) throw Object.assign(new Error('Run not found for approval replay.'), { status: 404 });
      const thread = await AgentThread.findOne({ _id: runDoc.threadId, userId: userObjectId });
      if (!thread) throw Object.assign(new Error('Thread not found for run approval replay.'), { status: 404 });

      const advanced = await executeAgentRun({
        run: {
          ...runDoc.toObject({ getters: false, virtuals: false }),
          runId: String(runDoc._id)
        },
        thread,
        userId: String(userId),
        actor: {
          actorType: approval.requestedBy?.actorType || 'native_agent',
          actorId: approval.requestedBy?.actorId || ''
        },
        approveBlockedStep: true,
        AgentHandoff,
        buildDefaultHandoffPlan,
        buildDefaultHandoffCheckpoint,
        createThreadForHandoff,
        sanitizeAgentHandoffDoc,
        requestStepApproval: ({ run, step, thread: runThread, actor }) => requestRunStepApproval({
          AgentProtocolApproval,
          userId: String(userId),
          run,
          step,
          thread: runThread,
          actor
        })
      });

      runDoc.status = advanced.status;
      runDoc.lastActor = advanced.lastActor;
      runDoc.currentOpId = advanced.currentOpId;
      runDoc.blockedOpId = advanced.blockedOpId;
      runDoc.steps = advanced.steps;
      runDoc.completedStepCount = advanced.completedStepCount;
      runDoc.startedAt = advanced.startedAt;
      runDoc.pausedAt = advanced.pausedAt;
      runDoc.completedAt = advanced.completedAt;
      await runDoc.save();

      await createProposedChangesForRun({
        AgentProposedChange,
        TagMeta,
        NotebookEntry,
        userId: String(userId),
        thread,
        run: {
          ...advanced,
          runId: String(runDoc._id)
        },
        actor: {
          actorType: approval.requestedBy?.actorType || 'native_agent',
          actorId: approval.requestedBy?.actorId || ''
        }
      });

      const reconciledRun = await reconcileAgentRunState({
        AgentRun,
        AgentProposedChange,
        userId: String(userId),
        runId: String(runDoc._id)
      });

      applyProposalBundleRunOutcome({
        thread,
        run: {
          ...(reconciledRun?.toObject ? reconciledRun.toObject({ getters: false, virtuals: false }) : reconciledRun || advanced),
          runId: String(runDoc._id)
        }
      });
      await thread.save();

      const result = {
        run: sanitizeAgentRunDoc(reconciledRun || runDoc),
        thread: sanitizeAgentThreadDoc(thread)
      };
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES.AGENT_RUN_APPROVAL_APPROVED,
        userId: String(userId),
        properties: {
          threadId: String(thread?._id || ''),
          approvalId: String(approval._id || ''),
          runId: String(runDoc._id || '')
        }
      });
      trackRunLifecycleEvents({
        trackEvent,
        EVENT_NAMES,
        userId: String(userId),
        threadId: String(thread?._id || ''),
        run: reconciledRun || runDoc,
        source: 'protocol_approval_resume',
        includeStarted: false
      });
      approval.status = 'executed';
      approval.executedAt = new Date();
      approval.result = result;
      await approval.save();
      return {
        approval: sanitizeProtocolApprovalDoc(approval),
        result
      };
    }

    const result = await runBridgeHandoffOperation({
      bridgeActor: {
        userId: String(userId),
        actorType: approval.requestedBy?.actorType || 'native_agent',
        actorId: approval.requestedBy?.actorId || '',
        scope: String(approval.scope || 'agent_ops')
      },
      op: String(approval.op || '').trim(),
      payload: approval.payload && typeof approval.payload === 'object' ? approval.payload : {},
      executionSource: 'approval_replay',
      approvalId: String(approval._id || '')
    });
    approval.status = 'executed';
    approval.executedAt = new Date();
    approval.result = result && typeof result === 'object' ? result : {};
    await approval.save();
    return {
      approval: sanitizeProtocolApprovalDoc(approval),
      result
    };
  } catch (error) {
    approval.status = 'pending';
    approval.approvedAt = null;
    approval.approvedBy = undefined;
    await approval.save();
    throw error;
  }
};

const rejectProtocolApproval = async ({
  userId,
  approvalId,
  actorType = 'user',
  actorId = '',
  note = ''
}) => {
  const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(String(userId)) : null;
  const approvalObjectId = mongoose.Types.ObjectId.isValid(approvalId) ? new mongoose.Types.ObjectId(String(approvalId)) : null;
  if (!userObjectId) throw Object.assign(new Error('userId must be a valid ObjectId.'), { status: 400 });
  if (!approvalObjectId) throw Object.assign(new Error('approvalId must be a valid ObjectId.'), { status: 400 });

  const approval = await AgentProtocolApproval.findOne({ _id: approvalObjectId, userId: userObjectId });
  if (!approval) throw Object.assign(new Error('Protocol approval request not found.'), { status: 404 });
  if (String(approval.status || '') !== 'pending') {
    throw Object.assign(new Error(`Protocol approval request is ${approval.status || 'not pending'}.`), { status: 400 });
  }
  approval.status = 'rejected';
  approval.rejectedAt = new Date();
  approval.rejectedBy = {
    actorType: normalizeAgentActorType(actorType, 'user'),
    actorId: String(actorId || userId || '').trim()
  };
  approval.decisionNote = String(note || '').trim().slice(0, 1000);
  const approvalOp = String(approval.op || '').trim().toLowerCase();
  if (approvalOp === 'runs.resume') {
    const runId = String(approval.payload?.runId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(runId)) {
      throw Object.assign(new Error('Run approval payload is missing a valid run id.'), { status: 400 });
    }
    const runDoc = await AgentRun.findOne({ _id: runId, userId: userObjectId });
    if (!runDoc) throw Object.assign(new Error('Run not found for approval rejection.'), { status: 404 });

    const dismissed = dismissBlockedRunStep({
      run: {
        ...runDoc.toObject({ getters: false, virtuals: false }),
        runId: String(runDoc._id)
      },
      approvalId: String(approval._id)
    });

    runDoc.status = dismissed.status;
    runDoc.lastActor = dismissed.lastActor;
    runDoc.currentOpId = dismissed.currentOpId;
    runDoc.blockedOpId = dismissed.blockedOpId;
    runDoc.steps = dismissed.steps;
    runDoc.completedStepCount = dismissed.completedStepCount;
    runDoc.startedAt = dismissed.startedAt;
    runDoc.pausedAt = dismissed.pausedAt;
    runDoc.completedAt = dismissed.completedAt;
    await runDoc.save();

    const reconciledRun = await reconcileAgentRunState({
      AgentRun,
      AgentProposedChange,
      userId: String(userId),
      runId: String(runDoc._id)
    });

    const thread = await AgentThread.findOne({ _id: runDoc.threadId, userId: userObjectId });
    if (thread) {
      applyProposalBundleRunOutcome({
        thread,
        run: {
          ...(reconciledRun?.toObject ? reconciledRun.toObject({ getters: false, virtuals: false }) : runDoc.toObject({ getters: false, virtuals: false })),
          runId: String(runDoc._id)
        }
      });
      await thread.save();
    }
    trackHarnessEvent({
      trackEvent,
      event: EVENT_NAMES.AGENT_RUN_APPROVAL_REJECTED,
      userId: String(userId),
      properties: {
        threadId: String(thread?._id || ''),
        approvalId: String(approval._id || ''),
        runId: String(runDoc._id || '')
      }
    });
    trackRunLifecycleEvents({
      trackEvent,
      EVENT_NAMES,
      userId: String(userId),
      threadId: String(thread?._id || ''),
      run: reconciledRun || runDoc,
      source: 'protocol_approval_rejection',
      includeStarted: false
    });
    approval.result = {
      run: sanitizeAgentRunDoc(reconciledRun || runDoc)
    };
  }
  await approval.save();
  return sanitizeProtocolApprovalDoc(approval);
};

module.exports = {
  AGENT_HANDOFF_STATUSES,
  AGENT_HANDOFF_TASK_TYPES,
  AGENT_BRIDGE_TOKEN_KIND,
  DEFAULT_BRIDGE_TOKEN_TTL_SECONDS,
  normalizeAgentActorType,
  normalizeAgentActionFlow,
  normalizePersonalAgentStatus,
  normalizeAgentHandoffTaskType,
  normalizeAgentHandoffPriority,
  createPersonalAgentApiKey,
  hashPersonalAgentApiKey,
  normalizePersonalAgentCapabilities,
  normalizePersonalAgentWorkerRoles,
  normalizeUserAgentProfile,
  deriveAgentEntitlements,
  getUserAgentEntitlements,
  sanitizePersonalAgent,
  safeAgentHandoffLimit,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  parseOptionalDate,
  getAgentBridgeJwtSecret,
  safeBridgeTokenTtlSeconds,
  normalizeAgentProtocolPolicy,
  sanitizeAgentProtocolPolicy,
  toStoredAgentProtocolPolicy,
  getUserAgentProtocolPolicy,
  resolveAutoHandoffRequestedActor,
  createSignedBridgeToken,
  shouldRequireProtocolApproval,
  requestProtocolApproval,
  triggerProtocolHookPhase,
  sanitizeAgentHandoffDoc,
  appendHandoffEvent,
  normalizeHandoffPayload,
  resolveAndValidateActorIdentity,
  canActorClaimHandoff,
  canActorMutateClaimedHandoff,
  runBridgeHandoffOperation,
  listProtocolApprovals,
  approveProtocolApproval,
  rejectProtocolApproval
};
