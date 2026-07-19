const ROLE_DEFINITIONS = Object.freeze({
  planner: {
    label: 'Planner',
    summary: 'Frames the task, chooses the next move, and hands work to the right specialist.'
  },
  researcher: {
    label: 'Researcher',
    summary: 'Surfaces evidence, source material, and the strongest unresolved questions.'
  },
  synthesizer: {
    label: 'Synthesizer',
    summary: 'Turns scattered material into a coherent point of view or reusable output.'
  },
  critic: {
    label: 'Critic',
    summary: 'Pressure-tests claims, finds contradictions, and calls out weak support.'
  },
  editor: {
    label: 'Editor',
    summary: 'Tightens language, structure, and final presentation before promotion.'
  },
  organizer: {
    label: 'Organizer',
    summary: 'Clusters related material, removes overlap, and keeps the workspace legible.'
  }
});

const ROLE_VALUES = new Set(Object.keys(ROLE_DEFINITIONS));

const clean = (value) => String(value || '').trim();

const truncate = (value, limit = 240) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, limit).trim()}...`;
};

const normalizeWorkerRole = (value, fallback = '') => {
  const role = clean(value).toLowerCase();
  if (ROLE_VALUES.has(role)) return role;
  const safeFallback = clean(fallback).toLowerCase();
  return ROLE_VALUES.has(safeFallback) ? safeFallback : '';
};

const getWorkerRoleDefinition = (role = '') => {
  const safeRole = normalizeWorkerRole(role);
  return safeRole ? ROLE_DEFINITIONS[safeRole] : null;
};

const buildLivingThesisCriticMandate = () => [
  'Living-thesis Critic mandate:',
  'Identify unsupported critical and major claims, the strongest counterargument, and contradicting evidence.',
  'Surface missing base rates, alternative causal models, likely owner biases, and concrete falsification tests.',
  'Propose any confidence changes with explicit reasons and a before/after value; do not apply them.',
  'All changes to claims, judgment, confidence, assumptions, falsifiers, or decisions require explicit human acceptance.',
  'Do not mutate the page or imply that a proposed change has been accepted.'
].join(' ');

const inferWorkerRoleFromPlanKind = (kind = '') => {
  const safeKind = clean(kind).toLowerCase();
  if (['analysis', 'planning'].includes(safeKind)) return 'planner';
  if (['retrieval', 'research', 'testing'].includes(safeKind)) return 'researcher';
  if (['writing', 'delivery'].includes(safeKind)) return 'synthesizer';
  if (['editing'].includes(safeKind)) return 'editor';
  if (['execution', 'organization'].includes(safeKind)) return 'organizer';
  if (['critique', 'review', 'qa'].includes(safeKind)) return 'critic';
  return '';
};

const inferWorkerRole = ({
  taskType = 'custom',
  skillInvocation = {},
  message = ''
} = {}) => {
  const requestedRole = normalizeWorkerRole(skillInvocation?.workerRole);
  if (requestedRole) return requestedRole;

  const outputType = clean(skillInvocation?.outputType).toLowerCase();
  if (['summary_brief', 'concept_draft', 'synthesis_doc_draft'].includes(outputType)) return 'synthesizer';
  if (['critique_brief', 'contradiction_report', 'stale_summary_report'].includes(outputType)) return 'critic';
  if (['question_set', 'question_draft', 'research_brief_draft'].includes(outputType)) return 'researcher';
  if (['connection_map', 'duplicate_report', 'concept_candidate_report'].includes(outputType)) return 'organizer';
  if (['note_draft', 'slide_outline_draft'].includes(outputType)) return 'editor';
  if (['handoff_draft', 'gap_report'].includes(outputType)) return 'planner';

  const safeTaskType = clean(taskType).toLowerCase();
  if (safeTaskType === 'research') return 'researcher';
  if (safeTaskType === 'synthesis') return 'synthesizer';
  if (safeTaskType === 'restructure') return 'organizer';
  if (safeTaskType === 'qa') return 'critic';

  const lowerMessage = clean(message).toLowerCase();
  if (/\b(challenge|pressure|weak|counter|contradict|critique)\b/i.test(lowerMessage)) return 'critic';
  if (/\b(find|surface|gather|search|source|research|question)\b/i.test(lowerMessage)) return 'researcher';
  if (/\b(summarize|synthesis|thesis|brief|pull together)\b/i.test(lowerMessage)) return 'synthesizer';
  if (/\b(rewrite|polish|tighten|edit|clean up|outline)\b/i.test(lowerMessage)) return 'editor';
  if (/\b(connect|cluster|organize|merge|dedupe|structure)\b/i.test(lowerMessage)) return 'organizer';
  return 'planner';
};

const buildRoleReason = ({
  role = '',
  taskType = 'custom',
  skillTitle = '',
  outputType = ''
} = {}) => {
  const definition = getWorkerRoleDefinition(role);
  if (!definition) return '';
  const safeTaskType = clean(taskType).toLowerCase();
  if (safeTaskType === 'research') return `${definition.label} is active because this pass is about gathering and pressure-testing source material before synthesis.`;
  if (safeTaskType === 'synthesis') return `${definition.label} is active because this pass needs to turn scattered material into a reusable output.`;
  if (safeTaskType === 'restructure') return `${definition.label} is active because this pass is about reorganizing the workspace into a clearer shape.`;
  if (safeTaskType === 'qa') return `${definition.label} is active because this pass is looking for gaps, risks, and verification points.`;
  if (clean(skillTitle)) return `${definition.label} is active for ${clean(skillTitle)}.`;
  if (clean(outputType)) return `${definition.label} is active for ${clean(outputType).replace(/_/g, ' ')} work.`;
  return definition.summary;
};

const buildSuggestedWorkerRoles = ({
  activeWorkerRole = 'planner',
  taskType = 'custom'
} = {}) => {
  const safeTaskType = clean(taskType).toLowerCase();
  const primary = normalizeWorkerRole(activeWorkerRole, 'planner');
  const secondaryByTask = {
    research: ['synthesizer', 'critic'],
    synthesis: ['editor', 'critic'],
    restructure: ['planner', 'editor'],
    qa: ['researcher', 'editor'],
    custom: ['synthesizer', 'editor']
  };
  const orderedRoles = [primary, ...(secondaryByTask[safeTaskType] || secondaryByTask.custom)];
  const seen = new Set();
  return orderedRoles
    .filter((role) => {
      const safeRole = normalizeWorkerRole(role);
      if (!safeRole || seen.has(safeRole)) return false;
      seen.add(safeRole);
      return true;
    })
    .map((role) => {
      const definition = getWorkerRoleDefinition(role);
      return {
        role,
        label: definition?.label || role,
        summary: definition?.summary || '',
        reason: buildRoleReason({ role, taskType })
      };
    });
};

const sanitizeAgentPlanner = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const activeWorkerRole = inferWorkerRole({
    taskType: source.taskType,
    skillInvocation: source.skillInvocation || {},
    message: source.message
  });
  const definition = getWorkerRoleDefinition(source.activeWorkerRole || activeWorkerRole);
  const normalizedActiveRole = normalizeWorkerRole(source.activeWorkerRole || activeWorkerRole, 'planner');
  const selectedByoAgent = source.selectedByoAgent && typeof source.selectedByoAgent === 'object'
    ? {
        actorId: clean(source.selectedByoAgent.actorId),
        name: clean(source.selectedByoAgent.name)
      }
    : null;

  const requestedActor = source.requestedActor && typeof source.requestedActor === 'object'
    ? {
        actorType: clean(source.requestedActor.actorType).toLowerCase() || 'native_agent',
        actorId: clean(source.requestedActor.actorId)
      }
    : null;

  return {
    mode: clean(source.mode) || 'native_orchestrated',
    activeWorkerRole: normalizedActiveRole,
    activeWorkerLabel: definition?.label || 'Planner',
    activeWorkerSummary: definition?.summary || '',
    rationale: truncate(
      source.rationale
      || buildRoleReason({
        role: normalizedActiveRole,
        taskType: source.taskType,
        skillTitle: source.skillInvocation?.skillTitle,
        outputType: source.skillInvocation?.outputType
      }),
      320
    ),
    routeSource: clean(source.routeSource),
    routingMode: clean(source.routingMode),
    selectedByoAgent,
    requestedActor,
    suggestedWorkerRoles: (
      Array.isArray(source.suggestedWorkerRoles) && source.suggestedWorkerRoles.length > 0
        ? source.suggestedWorkerRoles
        : buildSuggestedWorkerRoles({
            activeWorkerRole: normalizedActiveRole,
            taskType: source.taskType
          })
    ).map((entry) => {
      const role = normalizeWorkerRole(entry?.role, normalizedActiveRole);
      const roleDefinition = getWorkerRoleDefinition(role);
      return {
        role,
        label: clean(entry?.label) || roleDefinition?.label || role,
        summary: truncate(entry?.summary || roleDefinition?.summary || '', 180),
        reason: truncate(entry?.reason || buildRoleReason({ role, taskType: source.taskType }), 220)
      };
    }).slice(0, 4)
  };
};

const buildAgentPlanner = ({
  taskType = 'custom',
  skillInvocation = {},
  message = '',
  routePlanner = {},
  requestedActor = null,
  activeWorkerRole = ''
} = {}) => sanitizeAgentPlanner({
  ...routePlanner,
  mode: 'native_orchestrated',
  taskType,
  skillInvocation,
  message,
  requestedActor,
  activeWorkerRole: normalizeWorkerRole(activeWorkerRole || inferWorkerRole({
    taskType,
    skillInvocation,
    message
  }), 'planner')
});

const listWorkerRoles = () => (
  Object.entries(ROLE_DEFINITIONS).map(([role, definition]) => ({
    role,
    label: definition.label,
    summary: definition.summary
  }))
);

module.exports = {
  ROLE_DEFINITIONS,
  ROLE_VALUES,
  normalizeWorkerRole,
  getWorkerRoleDefinition,
  buildLivingThesisCriticMandate,
  inferWorkerRoleFromPlanKind,
  inferWorkerRole,
  sanitizeAgentPlanner,
  buildAgentPlanner,
  listWorkerRoles
};
