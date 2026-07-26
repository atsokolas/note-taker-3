const {
  CORE_EVIDENCE_ARCHETYPES,
  inferEvidenceArchetype
} = require('./investmentDossierProfileService');

const COMPANY_DOSSIER_MIN_SOURCE_COUNT = 8;

const unique = values => Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));

const buildCompanyDossierEvidenceCoverage = ({
  page = {},
  minimumSourceCount = COMPANY_DOSSIER_MIN_SOURCE_COUNT
} = {}) => {
  const sourceRefs = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
  const researchPlan = page.investmentDossier?.researchPlan || {};
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
  const ready = missingSourceCount === 0 && missingEvidenceArchetypes.length === 0;
  const checklist = missingEvidenceArchetypes.map((archetype) => {
    if (archetype === 'company_product') return 'an official product, pricing, technical, or customer document';
    if (archetype === 'competitor_primary') return 'a primary source from a named competitor';
    if (archetype === 'independent_domain') return 'an independent regulator, government, standards, academic, or benchmark source';
    if (archetype === 'market_snapshot') return 'a dated market price with its public source URL';
    if (archetype === 'filing') return 'a full-text primary filing';
    return `a source covering ${archetype.replaceAll('_', ' ')}`;
  });
  const summaryParts = [];
  if (missingSourceCount) {
    summaryParts.push(`${missingSourceCount} more substantive source${missingSourceCount === 1 ? '' : 's'}`);
  }
  if (checklist.length) summaryParts.push(checklist.join('; '));
  return {
    ready,
    status: ready ? 'ready_for_draft' : 'research_incomplete',
    sourceCount,
    minimumSourceCount: Number(minimumSourceCount),
    missingSourceCount,
    requiredEvidenceArchetypes,
    observedEvidenceArchetypes,
    missingEvidenceArchetypes,
    checklist,
    message: ready
      ? 'The evidence pack covers the minimum source count and required evidence classes.'
      : `The saved evidence pack is not broad enough for a decision dossier. Add ${summaryParts.join(', ')} before building.`
  };
};

module.exports = {
  COMPANY_DOSSIER_MIN_SOURCE_COUNT,
  buildCompanyDossierEvidenceCoverage
};
