const {
  CORE_ANALYSIS_MODULES,
  CORE_EVIDENCE_ARCHETYPES,
  inferEvidenceArchetype
} = require('./investmentDossierProfileService');

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const unique = values => Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));

const DECISION_DOSSIER_MIN_WORDS = 1800;
const DECISION_DOSSIER_MIN_CLAIMS = 20;
const REPRODUCIBLE_MODULE_IDS = Object.freeze([
  'reverse_expectations',
  'unit_economics_cash_conversion'
]);

const sectionHeadings = (body = {}) => (
  (Array.isArray(body?.content) ? body.content : [])
    .filter(node => node?.type === 'heading')
    .map(node => clean((node.content || []).map(item => item?.text || '').join('')).toLowerCase())
);

const includesHeading = (headings, patterns) => patterns.some(pattern => (
  headings.some(heading => pattern.test(heading))
));

const evaluateInvestmentDossierQuality = ({
  page = {},
  body = {},
  claims = [],
  sourceRefs = [],
  words = 0
} = {}) => {
  const failures = [];
  const profile = page?.investmentDossier || {};
  const plan = profile?.researchPlan || {};
  const businessModel = profile?.businessModel?.primary || 'unknown';
  const claimList = Array.isArray(claims) ? claims : [];
  const sourceList = Array.isArray(sourceRefs) ? sourceRefs : [];
  const unsupportedClaims = claimList.filter(claim => clean(claim?.support).toLowerCase() === 'unsupported');
  const uncitedClaims = claimList.filter(claim => !(
    (claim?.citationIds || []).length
    || (claim?.sourceRefIds || []).length
    || (claim?.citationIndexes || []).length
  ));
  const observedEvidenceArchetypes = unique([
    ...(plan.evidenceArchetypes || []),
    ...sourceList.map(inferEvidenceArchetype)
  ]).filter(value => value && value !== 'other');
  const requiredEvidenceArchetypes = unique(
    plan.requiredEvidenceArchetypes?.length
      ? plan.requiredEvidenceArchetypes
      : CORE_EVIDENCE_ARCHETYPES
  );
  const missingEvidenceArchetypes = requiredEvidenceArchetypes.filter(
    id => !observedEvidenceArchetypes.includes(id)
  );
  const requiredModuleIds = unique(
    plan.requiredModuleIds?.length ? plan.requiredModuleIds : CORE_ANALYSIS_MODULES
  );
  const modules = Array.isArray(plan.modules) ? plan.modules : [];
  const completeModules = new Map(
    modules.filter(row => row?.id && row.status === 'complete').map(row => [row.id, row])
  );
  const missingModuleIds = requiredModuleIds.filter(id => !completeModules.has(id));
  const modulesWithoutClaims = Array.from(completeModules.values())
    .filter(row => !(row.claimIds || []).length)
    .map(row => row.id);
  const missingCalculations = REPRODUCIBLE_MODULE_IDS.filter((id) => {
    const module = completeModules.get(id);
    return module && !(module.calculationIds || []).length;
  });
  const insights = Array.isArray(plan.insights) ? plan.insights : [];
  const reproducibleInsights = insights.filter(row => (
    row?.reproducible === true
    && (row?.sourceRefIds || []).length
    && clean(row?.text).length >= 40
  ));
  const headings = sectionHeadings(body);

  if (Number(profile.version || 0) < 2) {
    failures.push('Investment dossier is missing the version-2 business-model research profile.');
  }
  if (!businessModel || businessModel === 'unknown') {
    failures.push('Investment dossier business model is unclassified.');
  }
  if (words < DECISION_DOSSIER_MIN_WORDS) {
    failures.push(`Investment dossier is too thin for a decision: ${words} words, expected at least ${DECISION_DOSSIER_MIN_WORDS}.`);
  }
  if (claimList.length < DECISION_DOSSIER_MIN_CLAIMS) {
    failures.push(`Investment dossier has too few claim-level analytical units: ${claimList.length}, expected at least ${DECISION_DOSSIER_MIN_CLAIMS}.`);
  }
  if (unsupportedClaims.length) {
    failures.push(`Investment dossier has unsupported decision claims: ${unsupportedClaims.length}.`);
  }
  if (uncitedClaims.length) {
    failures.push(`Investment dossier has decision claims without citations: ${uncitedClaims.length}.`);
  }
  if (missingEvidenceArchetypes.length) {
    failures.push(`Investment dossier is missing evidence archetypes: ${missingEvidenceArchetypes.join(', ')}.`);
  }
  if (missingModuleIds.length) {
    failures.push(`Investment dossier research modules remain incomplete: ${missingModuleIds.join(', ')}.`);
  }
  if (modulesWithoutClaims.length) {
    failures.push(`Investment dossier modules lack claim-level outputs: ${modulesWithoutClaims.join(', ')}.`);
  }
  if (missingCalculations.length) {
    failures.push(`Investment dossier modules lack reproducible calculations: ${missingCalculations.join(', ')}.`);
  }
  if (!reproducibleInsights.length) {
    failures.push('Investment dossier lacks a non-obvious, reproducible insight tied to source evidence.');
  }
  [
    [/current judgment/i],
    [/implied expectations|market is pricing/i],
    [/thesis-changing questions|thesis changing questions/i],
    [/product and technical moat|business and product system|technical architecture and moat/i],
    [/system and unit economics|economics and capital allocation/i],
    [/operating engine and capital allocation|economics and capital allocation/i],
    [/obligations, concentration, and policy|risks, falsifiers, and open questions/i],
    [/what would change the thesis|risks, falsifiers, and open questions/i],
    [/next evidence and maintenance test|sources and maintenance state/i]
  ].forEach((patterns) => {
    if (!includesHeading(headings, patterns)) {
      failures.push(`Investment dossier is missing a required decision surface matching ${patterns.map(String).join(' or ')}.`);
    }
  });

  return {
    ok: failures.length === 0,
    status: failures.length ? 'research_incomplete' : 'decision_ready',
    failures,
    metrics: {
      businessModel,
      requiredModuleCount: requiredModuleIds.length,
      completedModuleCount: completeModules.size,
      missingModuleIds,
      observedEvidenceArchetypes,
      missingEvidenceArchetypes,
      reproducibleInsightCount: reproducibleInsights.length,
      unsupportedDecisionClaims: unsupportedClaims.length,
      uncitedDecisionClaims: uncitedClaims.length
    }
  };
};

module.exports = {
  DECISION_DOSSIER_MIN_CLAIMS,
  DECISION_DOSSIER_MIN_WORDS,
  REPRODUCIBLE_MODULE_IDS,
  evaluateInvestmentDossierQuality
};
