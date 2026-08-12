const {
  collectLibrarySources,
  selectCandidateSources
} = require('./wikiMaintenanceService');

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const sourceIdentity = (source = {}) => [
  clean(source.type),
  clean(source.objectId),
  clean(source.parentObjectId),
  clean(source.url),
  clean(source.title)
].join(':');

const sourceRefFromCandidate = (source = {}) => ({
  type: clean(source.type || 'external').toLowerCase(),
  objectId: source.objectId || null,
  parentObjectId: source.parentObjectId || null,
  title: clean(source.title).slice(0, 240),
  // Ordinary Wiki drafting needs the evidence, not merely a card preview.
  // The route applies the same bounded limit before persistence.
  snippet: clean(source.text || source.snippet || source.quote).slice(0, 6000),
  url: clean(source.url).slice(0, 1000),
  citationLabel: '',
  addedBy: 'ai'
});

const suggestionFromCandidate = (source = {}) => ({
  type: clean(source.type || 'source').toLowerCase(),
  objectId: source.objectId || null,
  parentObjectId: source.parentObjectId || null,
  title: clean(source.title).slice(0, 240),
  topicCoverage: Number(source.topicCoverage || 0)
});

const prepareOrdinaryWikiBuild = async ({
  userId,
  title,
  createdFrom = {},
  models = {},
  sourceLimit = 12
} = {}) => {
  const topic = clean(title);
  const page = {
    title: topic,
    pageType: 'overview',
    sourceScope: 'entire_library',
    createdFrom,
    body: { type: 'doc', content: [] },
    plainText: ''
  };
  // Creation only needs enough evidence to decide whether a page can start.
  // The fast profile still runs topic-targeted queries, while avoiding the
  // broad 150-row-per-model maintenance scan that made this preflight feel
  // like the build itself.
  const librarySources = await collectLibrarySources({
    userId,
    models,
    page,
    fastProfile: true
  });
  const candidates = selectCandidateSources({ page, sources: librarySources, limit: sourceLimit });
  const directSources = candidates.filter(source => Number(source.topicCoverage || 0) >= 0.8);
  if (!directSources.length) {
    return {
      eligible: false,
      code: 'WIKI_BUILD_EVIDENCE_MISSING',
      topic,
      message: `No direct Library source explains “${topic}.” Add or import a source about the subject before building the Wiki.`,
      suggestions: candidates.slice(0, 5).map(suggestionFromCandidate)
    };
  }

  const seen = new Set();
  // Do not pad a narrow subject with merely adjacent Library material. That
  // made the generator responsible for eight sources when only one actually
  // addressed the title, which produced broad, uncited prose. A Wiki may be
  // narrow when the account evidence is narrow.
  const selected = directSources
    .filter((source) => {
      const key = sourceIdentity(source);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  return {
    eligible: true,
    code: 'WIKI_BUILD_EVIDENCE_READY',
    topic,
    directSourceCount: directSources.length,
    sourceRefs: selected.map(sourceRefFromCandidate),
    suggestions: candidates.slice(0, 5).map(suggestionFromCandidate)
  };
};

module.exports = {
  prepareOrdinaryWikiBuild,
  sourceRefFromCandidate
};
