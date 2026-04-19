const clean = (value) => String(value || '').trim();

const truncate = (value, limit = 240) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 3)).trim()}...`;
};

const PROPOSAL_STATUS_VALUES = new Set(['pending', 'partially_applied', 'applied', 'dismissed', 'invalidated']);
const PROPOSAL_OP_STATUS_VALUES = new Set(['pending', 'blocked', 'applied', 'dismissed', 'invalidated']);
const EXECUTION_MODE_VALUES = new Set(['direct', 'proposed_change']);
const RISK_LEVEL_VALUES = new Set(['low', 'medium', 'high']);

const normalizeTarget = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    type: clean(source.type).toLowerCase(),
    id: clean(source.id),
    title: clean(source.title)
  };
};

const normalizeProposalOperation = (input = {}, index = 0) => {
  const source = input && typeof input === 'object' ? input : {};
  const executionMode = clean(source.executionMode).toLowerCase();
  const riskLevel = clean(source.riskLevel).toLowerCase();
  const status = clean(source.status).toLowerCase();
  return {
    opId: clean(source.opId) || `op-${index + 1}`,
    type: clean(source.type).toLowerCase() || 'custom',
    title: truncate(source.title || source.label || `Operation ${index + 1}`, 160),
    summary: truncate(source.summary, 280),
    status: PROPOSAL_OP_STATUS_VALUES.has(status) ? status : 'pending',
    executionMode: EXECUTION_MODE_VALUES.has(executionMode) ? executionMode : 'direct',
    riskLevel: RISK_LEVEL_VALUES.has(riskLevel) ? riskLevel : 'low',
    requiresApproval: Boolean(source.requiresApproval),
    target: normalizeTarget(source.target || {}),
    metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {}
  };
};

const normalizeProposalBundle = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const operations = Array.isArray(source.operations)
    ? source.operations.map((operation, index) => normalizeProposalOperation(operation, index)).filter((operation) => operation.title)
    : [];
  if (operations.length === 0) return null;

  const status = clean(source.status).toLowerCase();
  return {
    bundleId: clean(source.bundleId) || `bundle-${Date.now()}`,
    title: truncate(source.title || operations[0]?.title || 'Proposal bundle', 180),
    summary: truncate(source.summary || operations.map((operation) => operation.summary || operation.title).filter(Boolean).join(' '), 320),
    status: PROPOSAL_STATUS_VALUES.has(status) ? status : 'pending',
    source: clean(source.source || 'assistant_reply').toLowerCase() || 'assistant_reply',
    target: normalizeTarget(source.target || operations[0]?.target || {}),
    operations,
    createdAt: source.createdAt ? new Date(source.createdAt) : new Date()
  };
};

const buildBundleId = () => `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const supportsProposedChangeLayer = (target = {}) => (
  ['concept', 'notebook', 'note', 'question', 'article', 'selection'].includes(clean(target.type).toLowerCase())
);

const buildProposalBundle = ({
  intent = '',
  context = {},
  contextItem = null,
  relatedItems = [],
  skillInvocation = {},
  planner = null
} = {}) => {
  const target = normalizeTarget({
    type: context?.type || contextItem?.type || '',
    id: context?.id || contextItem?.id || '',
    title: context?.title || contextItem?.title || ''
  });
  const safeIntent = clean(intent).toLowerCase();
  const operations = [];
  const relatedCount = Array.isArray(relatedItems) ? relatedItems.length : 0;
  const outputType = clean(skillInvocation?.outputType).toLowerCase();
  const targetLabel = target.title || target.type || 'workspace';

  if (supportsProposedChangeLayer(target) && ['clarify', 'strengthen', 'summarize', 'restructure'].includes(safeIntent)) {
    const actionByIntent = {
      clarify: {
        title: `Rewrite ${targetLabel}`,
        summary: `Prepare an agent-authored rewrite for ${targetLabel} so the user can review it before it lands.`
      },
      strengthen: {
        title: `Strengthen ${targetLabel}`,
        summary: `Prepare a stronger supported pass on ${targetLabel} as an agent-proposed change.`
      },
      summarize: {
        title: `Summarize into ${targetLabel}`,
        summary: `Draft a concise synthesis for ${targetLabel} as a reviewable agent-authored change.`
      },
      restructure: {
        title: `Restructure ${targetLabel}`,
        summary: `Reorganize ${targetLabel} into a cleaner structure as a reviewable proposed change.`
      }
    };
    const config = actionByIntent[safeIntent];
    operations.push({
      opId: 'content-change',
      type: 'propose_content_change',
      title: config.title,
      summary: config.summary,
      executionMode: 'proposed_change',
      riskLevel: 'low',
      requiresApproval: false,
      target
    });
  }

  if (relatedCount > 0 && ['retrieve', 'strengthen', 'continue', 'chat', 'clarify', 'summarize', 'restructure'].includes(safeIntent)) {
    operations.push({
      opId: 'attach-material',
      type: 'attach_related_material',
      title: `Pull in ${relatedCount} related ${relatedCount === 1 ? 'item' : 'items'}`,
      summary: `Collect the strongest nearby material for ${targetLabel} and stage it for the next pass.`,
      executionMode: 'direct',
      riskLevel: 'low',
      requiresApproval: false,
      target,
      metadata: { itemCount: relatedCount }
    });
  }

  if (outputType === 'handoff_draft') {
    operations.push({
      opId: 'create-handoff',
      type: 'create_handoff',
      title: 'Create a routed handoff',
      summary: 'Turn this proposal into a handoff that can be delegated to the right worker.',
      executionMode: 'direct',
      riskLevel: 'medium',
      requiresApproval: false,
      target
    });
  }

  if (operations.length === 0) return null;

  const bundleTitle = operations.length === 1
    ? operations[0].title
    : `${operations[0].title} + ${operations.length - 1} more`;
  const workerLabel = clean(planner?.activeWorkerLabel || planner?.activeWorkerRole);

  return normalizeProposalBundle({
    bundleId: buildBundleId(),
    title: bundleTitle,
    summary: workerLabel
      ? `${workerLabel} proposed ${operations.length === 1 ? 'this next move' : 'these next moves'} for ${targetLabel}.`
      : `${operations.length === 1 ? 'One next move is ready' : `${operations.length} next moves are ready`} for ${targetLabel}.`,
    status: 'pending',
    source: 'assistant_reply',
    target,
    operations,
    createdAt: new Date()
  });
};

module.exports = {
  normalizeProposalBundle,
  normalizeProposalOperation,
  buildProposalBundle
};
