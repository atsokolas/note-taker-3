const {
  collectLibrarySources,
  selectCandidateSources
} = require('./wikiMaintenanceService');
const { semanticSearch } = require('../ai/semanticSearch');

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

// This is the exact-subject-phrase gate: a build is refused unless some Library
// source carries the subject as a phrase. It dropped words of two characters or
// fewer and then required the survivors to be adjacent, which made the phrase
// unsatisfiable by its own source text — "Circle of Competence" compiled to
// /circle\s+competence/ and could never match "circle of competence". Every
// subject containing a short connector was unbuildable, and the refusal blamed
// the Library for lacking a source it actually had.
//
// Keep every word. An exact-phrase test should test the exact phrase.
const topicPhrasePattern = (value = '') => {
  const words = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return null;
  return new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\s+|[-–—]\\s*)'), 'i');
};

const directlyAddressesTopic = (source = {}, topic = '') => {
  const pattern = topicPhrasePattern(topic);
  if (!pattern) return false;
  return pattern.test([
    source.title,
    source.text,
    source.snippet,
    source.quote,
    ...(Array.isArray(source.tags) ? source.tags : [])
  ].filter(Boolean).join(' '));
};

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

// A semantic hit only counts as direct subject evidence well above the noise
// floor. Measured against a real corpus, genuinely on-topic material scores
// 0.72-0.76 and adjacent material falls away beneath it.
const SEMANTIC_DIRECT_SCORE = 0.72;
const SEMANTIC_RETRIEVAL_LIMIT = 12;

const semanticSourceKey = (source = {}) => [
  clean(source.type).toLowerCase(),
  clean(source.objectId)
].join(':');

const findSemanticSubjectMatches = async ({ topic, userId, models = {}, search = semanticSearch } = {}) => {
  if (!topic || !userId) return [];
  try {
    const rows = await search({
      query: topic,
      userId,
      limit: SEMANTIC_RETRIEVAL_LIMIT,
      models
    });
    return (Array.isArray(rows) ? rows : [])
      .filter(row => Number(row?.score || 0) >= SEMANTIC_DIRECT_SCORE)
      .map(row => ({
        key: [clean(row.type).toLowerCase(), clean(row.objectId)].join(':'),
        score: Number(row.score || 0)
      }));
  } catch (_error) {
    // The embedding service sleeps on the free tier and answers 502 while it
    // wakes. A build must not fail because retrieval was briefly unavailable;
    // fall back to the lexical test, which is exactly the behaviour that
    // shipped before this.
    return [];
  }
};

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
  // Whether the Library explains a subject is a question about meaning, and
  // this preflight only ever asked about spelling: a source qualified by
  // containing the title's words. An account holding "Childhoods of
  // exceptional people" and a letter on supporting mistakes without punishment
  // was told it had nothing on parenting for independence, because no source
  // contained that phrase.
  //
  // Semantic retrieval answers the question that was actually meant. It is
  // added to the lexical test, never substituted for it: a source still has to
  // clear a high similarity bar to count as direct evidence, and everything
  // that qualified before still qualifies.
  const semanticMatches = await findSemanticSubjectMatches({ topic, userId, models });
  const semanticKeys = new Set(semanticMatches.map(match => match.key));
  const directSources = candidates.filter(source => (
    (Number(source.topicCoverage || 0) >= 0.8 && directlyAddressesTopic(source, topic))
    || semanticKeys.has(semanticSourceKey(source))
  ));
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
  findSemanticSubjectMatches,
  SEMANTIC_DIRECT_SCORE,
  directlyAddressesTopic,
  prepareOrdinaryWikiBuild,
  sourceRefFromCandidate
};
