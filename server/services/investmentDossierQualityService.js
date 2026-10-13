const {
  CORE_ANALYSIS_MODULES,
  CORE_EVIDENCE_ARCHETYPES,
  inferEvidenceArchetype
} = require('./investmentDossierProfileService');
const { figuresIn, unstatedFigures } = require('./agentGrounding');
const { MARKET_PLACEHOLDER } = require('./companyDossierService');

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const unique = values => Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));

const DECISION_DOSSIER_MIN_WORDS = 1800;
// A sentence that says what the evidence does not show: a negation, then what
// was not found, stated, or computable.
const MISSING_EVIDENCE = new RegExp([
  /\b(?:no|not|none|cannot|could not|unable|insufficient)\b[^.]{0,160}\b(?:found|located|available|attached|stated|disclosed|comput\w*|calculated|answered|backed out|tested|testable|assessed|established|determined|present)\b/.source,
  /\b(?:is|are|remains?)\s+(?:missing|unanswered|unavailable|unknown)\b/.source,
  /\bevidence gap\b/.source
].join('|'), 'i');
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

const sourceTextForClaim = ({ claim = {}, sourceRefs = [] } = {}) => {
  const ids = new Set([
    ...(claim?.sourceRefIds || []),
    ...(claim?.citationIds || [])
  ].map(String));
  return (Array.isArray(sourceRefs) ? sourceRefs : [])
    .filter(source => ids.has(String(source?._id || source?.id || source?.sourceRefId || '')))
    .map(source => [source?.snippet, source?.quote, source?.text].filter(Boolean).join(' '))
    .join(' ');
};

// The same figure check every page gets: each figure is stated in a cited
// source, or computed in the claim from figures that are.
// A figure the page already established in an earlier claim that passed
// (a market value computed above) may be used again below.
const numericGroundingFailure = ({ claim = {}, sourceRefs = [], established = [] } = {}) => {
  if (!figuresIn(claim?.text).length) return false;
  const sourceText = sourceTextForClaim({ claim, sourceRefs });
  return !sourceText || unstatedFigures(claim?.text, [sourceText, ...established]).length > 0;
};

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
  // As on ordinary pages: a dossier is refused for what it states without
  // support, never for what it lacks. Missing evidence, modules, sections or
  // length are hints for the repair pass and the owner who accepts the page.
  const failures = [];
  const hints = [];
  const profile = page?.investmentDossier || {};
  const plan = profile?.researchPlan || {};
  const businessModel = profile?.businessModel?.primary || 'unknown';
  const sourceList = Array.isArray(sourceRefs) ? sourceRefs : [];
  // Two kinds of sentence have nothing to cite and are not decision claims: the
  // owner's own hurdle restated, and a plain statement of what could not be found.
  const hurdle = profile?.hurdle || {};
  const ownerText = [
    profile?.startingJudgment,
    Number(hurdle.annualReturn) > 0
      ? `${(Number(hurdle.annualReturn) * 100).toFixed(1)}% ${hurdle.horizonYears} years`
      : ''
  ].filter(Boolean).join(' ');

  // Its figures may come from anywhere on the page: "7%-8% growth could not be
  // corroborated" restates a figure, it does not claim a new one.
  const pageText = [
    ownerText,
    ...sourceList.map(source => [source?.snippet, source?.quote, source?.text].filter(Boolean).join(' ')),
    ...(Array.isArray(claims) ? claims : []).map(claim => clean(claim?.text))
  ];
  // The owner's own view, marked as such, restating figures shown on the page.
  const ownersOwn = claim => /\bowner(?:'s)?\b[^.]{0,40}\b(?:hurdle|thesis|judgment|hypothesis|interpretation|view)\b|\bstarting (?:judgment|assumption)\b/i.test(clean(claim?.text))
    && ownerText && !unstatedFigures(claim?.text, pageText.filter(text => text !== clean(claim?.text))).length;
  const namesMissingEvidence = claim => MISSING_EVIDENCE.test(clean(claim?.text))
    && !unstatedFigures(claim?.text, pageText.filter(text => text !== clean(claim?.text))).length;
  const claimList = (Array.isArray(claims) ? claims : [])
    .filter(claim => !ownersOwn(claim) && !namesMissingEvidence(claim));
  const unsupportedClaims = claimList.filter(claim => clean(claim?.support).toLowerCase() === 'unsupported');
  const exploratoryUnsupportedClaims = unsupportedClaims.filter(claim => (
    /thesis-changing questions|what would change the thesis/i.test(clean(claim?.section))
  ));
  const blockingUnsupportedClaims = unsupportedClaims.filter(claim => (
    !exploratoryUnsupportedClaims.includes(claim)
  ));
  const uncitedClaims = claimList.filter(claim => !(
    (claim?.citationIds || []).length
    || (claim?.sourceRefIds || []).length
    || (claim?.citationIndexes || []).length
  ));
  // The owner's hurdle and what follows from it alone (1.10^5) are not claims
  // about the company. A figure shown once, anywhere on the page, may be
  // restated: a question can name the 44% a later paragraph adds up.
  const established = [ownerText];
  let ungroundedNumericClaims = claimList.filter(claim => (
    ['supported', 'partial', 'conflicted'].includes(clean(claim?.support).toLowerCase())
  ));
  for (let grew = true; grew;) {
    const grounded = ungroundedNumericClaims.filter(claim => !numericGroundingFailure({ claim, sourceRefs: sourceList, established }));
    established.push(...grounded.map(claim => clean(claim?.text)));
    ungroundedNumericClaims = ungroundedNumericClaims.filter(claim => !grounded.includes(claim));
    grew = grounded.length > 0;
  }
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
    hints.push('Investment dossier is missing the version-2 business-model research profile.');
  }
  if (!businessModel || businessModel === 'unknown') {
    hints.push('Investment dossier business model is unclassified.');
  }
  if (words < DECISION_DOSSIER_MIN_WORDS) {
    hints.push(`Investment dossier is too thin for a decision: ${words} words, expected at least ${DECISION_DOSSIER_MIN_WORDS}.`);
  }
  if (claimList.length < DECISION_DOSSIER_MIN_CLAIMS) {
    hints.push(`Investment dossier has too few claim-level analytical units: ${claimList.length}, expected at least ${DECISION_DOSSIER_MIN_CLAIMS}.`);
  }
  if (JSON.stringify(body || {}).includes(MARKET_PLACEHOLDER)) {
    failures.push('Investment dossier still carries the unwritten template: What the market is pricing was never written.');
  }
  if (blockingUnsupportedClaims.length) {
    const samples = blockingUnsupportedClaims
      .slice(0, 3)
      .map(claim => `${clean(claim?.section) || 'Unsectioned'}: ${clean(claim?.text).slice(0, 100)}`)
      .join(' | ');
    failures.push(`Investment dossier has unsupported decision claims: ${blockingUnsupportedClaims.length}${samples ? ` (${samples})` : ''}.`);
  }
  if (uncitedClaims.length) {
    const samples = uncitedClaims
      .slice(0, 3)
      .map(claim => `${clean(claim?.section) || 'Unsectioned'}: ${clean(claim?.text).slice(0, 100)}`)
      .join(' | ');
    failures.push(`Investment dossier has decision claims without citations: ${uncitedClaims.length}${samples ? ` (${samples})` : ''}.`);
  }
  if (ungroundedNumericClaims.length) {
    const samples = ungroundedNumericClaims
      .slice(0, 4)
      .map(claim => `${clean(claim?.section) || 'Unsectioned'}: ${clean(claim?.text).slice(0, 100)}`)
      .join(' | ');
    failures.push(`Investment dossier has numeric claims not grounded in cited source text: ${ungroundedNumericClaims.length}${samples ? ` (${samples})` : ''}.`);
  }
  if (missingEvidenceArchetypes.length) {
    hints.push(`Investment dossier is missing evidence archetypes: ${missingEvidenceArchetypes.join(', ')}.`);
  }
  if (missingModuleIds.length) {
    hints.push(`Investment dossier research modules remain incomplete: ${missingModuleIds.join(', ')}.`);
  }
  if (modulesWithoutClaims.length) {
    hints.push(`Investment dossier modules lack claim-level outputs: ${modulesWithoutClaims.join(', ')}.`);
  }
  if (missingCalculations.length) {
    hints.push(`Investment dossier modules lack reproducible calculations: ${missingCalculations.join(', ')}.`);
  }
  if (!reproducibleInsights.length) {
    hints.push('Investment dossier lacks a non-obvious, reproducible insight tied to source evidence.');
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
    [/what to check next|next evidence and maintenance test|sources and maintenance state/i]
  ].forEach((patterns) => {
    if (!includesHeading(headings, patterns)) {
      hints.push(`Investment dossier is missing a required decision surface matching ${patterns.map(String).join(' or ')}.`);
    }
  });

  return {
    ok: failures.length === 0,
    status: failures.length ? 'research_incomplete' : 'decision_ready',
    failures,
    hints,
    metrics: {
      businessModel,
      requiredModuleCount: requiredModuleIds.length,
      completedModuleCount: completeModules.size,
      missingModuleIds,
      observedEvidenceArchetypes,
      missingEvidenceArchetypes,
      reproducibleInsightCount: reproducibleInsights.length,
      unsupportedDecisionClaims: blockingUnsupportedClaims.length,
      unresolvedDecisionQuestions: exploratoryUnsupportedClaims.length,
      uncitedDecisionClaims: uncitedClaims.length,
      ungroundedNumericClaims: ungroundedNumericClaims.length
    }
  };
};

module.exports = {
  DECISION_DOSSIER_MIN_CLAIMS,
  DECISION_DOSSIER_MIN_WORDS,
  REPRODUCIBLE_MODULE_IDS,
  evaluateInvestmentDossierQuality
};
