const {
  CORE_EVIDENCE_ARCHETYPES,
  inferEvidenceArchetype
} = require('./investmentDossierProfileService');

const COMPANY_DOSSIER_MIN_SOURCE_COUNT = 8;

// What a missing kind of evidence is, in a reader's words.
const describeEvidence = (archetype = '') => {
  if (archetype === 'company_product') return 'an official product, pricing, technical, or customer document';
  if (archetype === 'competitor_primary') return 'a primary source from a named competitor';
  if (archetype === 'independent_domain') return 'an independent regulator, government, standards, academic, or benchmark source';
  if (archetype === 'market_snapshot') return 'a dated market price with its public source URL';
  if (archetype === 'filing') return 'a full-text primary filing';
  return `a source covering ${String(archetype).replaceAll('_', ' ')}`;
};

const unique = values => Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));

const buildCompanyDossierEvidenceCoverage = ({
  page = {},
  minimumSourceCount = COMPANY_DOSSIER_MIN_SOURCE_COUNT
} = {}) => {
  const sourceRefs = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
  const dossier = page.investmentDossier || {};
  const researchPlan = dossier.researchPlan || {};
  const acquisitionStops = Object.values(dossier.acquisition || {})
    .map(state => state?.stop)
    .filter(stop => stop?.code && stop?.message);
  const requiredEvidenceArchetypes = unique(
    researchPlan.requiredEvidenceArchetypes?.length
      ? researchPlan.requiredEvidenceArchetypes
      : CORE_EVIDENCE_ARCHETYPES
  );
  const observedEvidenceArchetypes = unique(sourceRefs.map(inferEvidenceArchetype))
    .filter(archetype => archetype && archetype !== 'other');
  const missingEvidenceArchetypes = requiredEvidenceArchetypes.filter(
    archetype => !observedEvidenceArchetypes.includes(archetype)
  );
  const sourceCount = sourceRefs.length;
  const missingSourceCount = Math.max(0, Number(minimumSourceCount) - sourceCount);
  // The filings are what a dossier cannot be written without. A competitor's
  // filing, an independent study or a dated price makes it better, and when
  // one could not be found the page says so rather than not existing: the
  // writer is told which are missing (researchPlan.missingEvidenceArchetypes).
  const ready = missingSourceCount === 0 && !missingEvidenceArchetypes.includes('filing');
  const checklist = missingEvidenceArchetypes.map(describeEvidence);
  const summaryParts = [];
  if (missingSourceCount) {
    summaryParts.push(`${missingSourceCount} more substantive source${missingSourceCount === 1 ? '' : 's'}`);
  }
  if (checklist.length) summaryParts.push(checklist.join('; '));
  if (acquisitionStops.length) {
    summaryParts.push(...acquisitionStops.map(stop => stop.message));
  }
  return {
    ready,
    status: ready ? 'ready_for_draft' : 'research_incomplete',
    sourceCount,
    minimumSourceCount: Number(minimumSourceCount),
    missingSourceCount,
    requiredEvidenceArchetypes,
    observedEvidenceArchetypes,
    missingEvidenceArchetypes,
    acquisitionStops,
    checklist,
    message: ready
      ? (checklist.length
          ? `Writing from the filings. The page says what could not be found: ${checklist.join('; ')}.`
          : 'The evidence pack covers the minimum source count and required evidence classes.')
      : `The saved evidence pack is not broad enough for a decision dossier. Add ${summaryParts.join(', ')} before building.`
  };
};

module.exports = {
  describeEvidence,
  COMPANY_DOSSIER_MIN_SOURCE_COUNT,
  buildCompanyDossierEvidenceCoverage
};
