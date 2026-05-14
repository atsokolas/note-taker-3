const MAX_SCHEMA_LENGTH = 8000;

const toArray = (value) => (Array.isArray(value) ? value : []);

const countBy = (items = [], getter = () => '') => (
  toArray(items).reduce((counts, item) => {
    const key = String(getter(item) || '').trim();
    if (!key) return counts;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {})
);

const formatTopCounts = (counts = {}, limit = 3) => (
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => `${key} (${count})`)
);

const normalizeSchema = (value = '') => String(value || '').trim().slice(0, MAX_SCHEMA_LENGTH);

const sourceEventLabel = (event = {}) => {
  if (event.provider === 'url' || event.sourceType === 'external' || event.metadata?.ingestSourceType === 'url') {
    return 'URL/external';
  }
  return event.provider || event.sourceType || 'source';
};

const pageHealth = (page = {}) => page.aiState?.health || {};

const buildSuggestion = ({ id, title, rationale, patch, confidence = 0.65, evidence = [] }) => ({
  id,
  title,
  rationale,
  patch,
  confidence,
  evidence: toArray(evidence).filter(Boolean).slice(0, 5)
});

const suggestWikiSchemaUpdates = ({
  currentSchema = '',
  sourceEvents = [],
  maintenanceRuns = [],
  pages = [],
  now = new Date()
} = {}) => {
  const recentSourceEvents = toArray(sourceEvents);
  const recentMaintenanceRuns = toArray(maintenanceRuns);
  const recentPages = toArray(pages);
  const suggestions = [];

  const sourceCounts = countBy(recentSourceEvents, sourceEventLabel);
  const topSources = formatTopCounts(sourceCounts);
  if (topSources.length) {
    suggestions.push(buildSuggestion({
      id: 'schema-source-workflow',
      title: 'Document ingest routing rules',
      rationale: `Recent wiki activity is mostly coming from ${topSources.join(', ')}. The schema should tell the agent how to handle these source types before rewriting pages.`,
      patch: [
        '### Ingest routing rules',
        `- For ${topSources.join(', ')}, decide whether the source updates an existing page, creates a source page, or should remain activity-only before editing.`,
        '- Prefer updating pages with overlapping titles, links, or claim vocabulary; otherwise propose a new page instead of forcing a weak merge.'
      ].join('\n'),
      confidence: 0.78,
      evidence: recentSourceEvents.slice(0, 3).map(event => event.title || event.summary || sourceEventLabel(event))
    }));
  }

  const unsupportedClaimCount = recentPages.reduce((total, page) => (
    total + toArray(pageHealth(page).unsupportedClaims).length + toArray(pageHealth(page).missingCitations).length
  ), 0);
  if (unsupportedClaimCount > 0) {
    suggestions.push(buildSuggestion({
      id: 'schema-evidence-standards',
      title: 'Tighten evidence standards',
      rationale: `${unsupportedClaimCount} recent unsupported or uncited claim signal${unsupportedClaimCount === 1 ? '' : 's'} showed up in page health.`,
      patch: [
        '### Evidence standards',
        '- Flag claims without a source as open questions unless the source text directly supports them.',
        '- When evidence is thin, preserve the uncertainty in the page body and add a maintenance note rather than writing as settled fact.'
      ].join('\n'),
      confidence: 0.72,
      evidence: recentPages
        .flatMap(page => toArray(pageHealth(page).unsupportedClaims).concat(toArray(pageHealth(page).missingCitations)))
        .map(item => item.text || item.section || 'Unsupported claim')
    }));
  }

  const contradictionCount = recentPages.reduce((total, page) => total + toArray(pageHealth(page).contradictions).length, 0);
  if (contradictionCount > 0) {
    suggestions.push(buildSuggestion({
      id: 'schema-contradiction-handling',
      title: 'Add contradiction handling',
      rationale: `${contradictionCount} contradiction signal${contradictionCount === 1 ? '' : 's'} appeared in recent wiki maintenance.`,
      patch: [
        '### Contradiction handling',
        '- Do not smooth over conflicting sources. Add a Tensions or Competing Views section when credible evidence disagrees.',
        '- Keep both sides linked to citations and state what would resolve the disagreement.'
      ].join('\n'),
      confidence: 0.74,
      evidence: recentPages
        .flatMap(page => toArray(pageHealth(page).contradictions))
        .map(item => item.text || item.section || 'Contradiction')
    }));
  }

  const pageTypeCounts = countBy(recentPages, page => page.pageType || 'topic');
  const dominantPageTypes = formatTopCounts(pageTypeCounts, 4);
  if (dominantPageTypes.length >= 2) {
    suggestions.push(buildSuggestion({
      id: 'schema-page-type-boundaries',
      title: 'Clarify page type boundaries',
      rationale: `Recent maintained pages span ${dominantPageTypes.join(', ')}. The schema should make the boundary between common page types explicit.`,
      patch: [
        '### Page type boundaries',
        `- Current active types: ${dominantPageTypes.join(', ')}.`,
        '- Use topic/concept pages for synthesized ideas, source pages for one document or author artifact, and entity pages for people, companies, or named systems.'
      ].join('\n'),
      confidence: 0.66,
      evidence: recentPages.slice(0, 5).map(page => `${page.title || 'Untitled'} (${page.pageType || 'topic'})`)
    }));
  }

  if (suggestions.length === 0) {
    suggestions.push(buildSuggestion({
      id: 'schema-review-cadence',
      title: 'Set a schema review cadence',
      rationale: 'There is not enough recent ingest or maintenance signal to infer a specific convention yet.',
      patch: [
        '### Schema review cadence',
        '- Re-run schema suggestions after several source ingests or manual recategorizations.',
        '- Keep new conventions as examples first; promote them to rules only after they repeat.'
      ].join('\n'),
      confidence: 0.5,
      evidence: []
    }));
  }

  const proposedPatch = [
    '## Suggested schema updates',
    `Generated ${now.toISOString()}.`,
    '',
    ...suggestions.map((suggestion) => [
      `#### ${suggestion.title}`,
      suggestion.rationale,
      '',
      suggestion.patch
    ].join('\n'))
  ].join('\n\n');

  return {
    summary: `${suggestions.length} schema update suggestion${suggestions.length === 1 ? '' : 's'} from recent wiki activity.`,
    currentSchema: normalizeSchema(currentSchema),
    proposedPatch,
    suggestions,
    context: {
      recentSourceEventCount: recentSourceEvents.length,
      recentMaintenanceRunCount: recentMaintenanceRuns.length,
      recentPageCount: recentPages.length,
      sourceCounts,
      pageTypeCounts,
      unsupportedClaimCount,
      contradictionCount
    }
  };
};

module.exports = {
  MAX_SCHEMA_LENGTH,
  suggestWikiSchemaUpdates
};
