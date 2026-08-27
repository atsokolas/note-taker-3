const { artifactTypeFromOutputType } = require('./agentArtifactDrafts');

const clean = (value) => String(value || '').trim().toLowerCase();

const MODEL_PROFILES = Object.freeze({
  partner: 'partner_chat',
  critique: 'critique',
  artifact: 'artifact_draft',
  tool: 'tool_router',
  structure: 'structure_planner',
  hygiene: 'hygiene_scan',
  audit: 'deep_audit'
});

const HYGIENE_OUTPUT_TYPES = new Set([
  'gap_report',
  'duplicate_report',
  'stale_summary_report',
  'contradiction_report',
  'concept_candidate_report',
  'missing_link_report',
  'concept_health_report',
  'workspace_hygiene_report',
  'concept_network_report',
  'recurring_hygiene_report'
]);

const DEEP_AUDIT_SKILLS = new Set(['deep_audit', 'audit_workspace', 'audit_claim']);

const routeDecision = (profile, reason) => ({
  profile,
  reason
});

const resolveAgentModelRoute = ({
  capability = {},
  intentDecision = {},
  skillInvocation = {}
} = {}) => {
  const capabilityId = clean(capability?.id);
  const intent = clean(intentDecision?.replyIntent);
  const skillId = clean(skillInvocation?.skillId);
  const outputType = clean(skillInvocation?.outputType);

  if (DEEP_AUDIT_SKILLS.has(skillId)) {
    return routeDecision(MODEL_PROFILES.audit, 'An explicit audit may use the deliberate model profile.');
  }
  if (capabilityId === 'capability.integration.import' || outputType === 'integration_fetch') {
    return routeDecision(MODEL_PROFILES.tool, 'Integration requests require typed tool selection.');
  }
  if (capabilityId === 'capability.workspace.organize') {
    return routeDecision(MODEL_PROFILES.structure, 'Workspace organization requires a structured proposal.');
  }
  if (HYGIENE_OUTPUT_TYPES.has(outputType)) {
    return routeDecision(MODEL_PROFILES.hygiene, 'Workspace maintenance uses the hygiene report contract.');
  }
  if (intent === 'challenge' || outputType === 'critique_brief') {
    return routeDecision(MODEL_PROFILES.critique, 'Pressure testing uses the critique profile.');
  }
  if (capabilityId === 'capability.artifact.draft' || artifactTypeFromOutputType(outputType)) {
    return routeDecision(MODEL_PROFILES.artifact, 'Reviewable drafts use the artifact profile.');
  }
  return routeDecision(MODEL_PROFILES.partner, 'Conversation and retrieval use the grounded partner profile.');
};

module.exports = {
  MODEL_PROFILES,
  HYGIENE_OUTPUT_TYPES,
  resolveAgentModelRoute
};
