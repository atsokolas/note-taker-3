// Owned-source utilization contract for ordinary Wiki pages.
//
// Attaching account-owned Library material to a page's reference ledger does
// not make the article account-grounded. This module answers a narrower,
// verifiable question: did the user's own material actually shape claims the
// reader can see?
//
// The unit of accounting is a *source family*, not a source row. One Library
// article and its highlights are one family; a duplicate import of the same URL
// is the same family. Citing an article and four of its own highlights is one
// piece of evidence, not five, and must not inflate coverage.
//
// A family counts as utilized only when at least one of its members is cited by
// a claim in the rendered body. A source sitting in References alone is not
// utilization. Families that genuinely do not belong may be explicitly excluded
// with a stated reason; silence is not an exclusion.

const asString = (value = '') => String(value == null ? '' : value).trim();

// Library material carries a durable account identity. External and provider
// evidence (SEC filings, GitHub, fetched public documents) may strengthen
// authority, but it can never stand in for the user's own corpus.
const OWNED_SOURCE_TYPES = new Set([
  'article',
  'highlight',
  'notebook',
  'concept',
  'question',
  'note'
]);

const SUPPLEMENTAL_SOURCE_TYPES = new Set(['external', 'filing', 'transcript', 'repo']);

const MIN_OWNED_UTILIZATION_RATIO = 0.5;
const OWNED_FAMILY_RELEVANCE_COVERAGE = 0.5;
const MIN_EXCLUSION_REASON_LENGTH = 12;

const normalizeUrl = (value = '') => {
  const raw = asString(value);
  if (!raw) return '';
  const withoutScheme = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .split('#')[0];
  const [path, query = ''] = withoutScheme.split('?');
  // Tracking parameters describe how a link was shared, not which source it is.
  const meaningfulQuery = query
    .split('&')
    .filter(Boolean)
    .filter(part => !/^(?:utm_[^=]*|fbclid|gclid|ref|ref_src)=/i.test(part))
    .sort()
    .join('&');
  const trimmedPath = path.replace(/\/+$/, '');
  return `${trimmedPath}${meaningfulQuery ? `?${meaningfulQuery}` : ''}`.toLowerCase();
};

// URL first: two Library rows imported from the same page are one source even
// when Mongo gave them different ids. Parent id next, so an article and its
// highlights collapse together when the article carries no URL.
const sourceFamilyKey = (source = {}) => {
  const url = normalizeUrl(source.url);
  if (url) return `url:${url}`;
  const parent = asString(source.parentObjectId);
  if (parent) return `id:${parent.toLowerCase()}`;
  const own = asString(source.objectId);
  if (own) return `id:${own.toLowerCase()}`;
  const title = asString(source.title).toLowerCase().replace(/\s+/g, ' ');
  return title ? `title:${title}` : '';
};

const isOwnedSource = (source = {}) => {
  const type = asString(source.type).toLowerCase();
  if (SUPPLEMENTAL_SOURCE_TYPES.has(type)) return false;
  const provider = asString(source.provider || source.metadata?.source || source.metadata?.provider)
    .toLowerCase();
  // Provider-fetched evidence is supplemental even when it lands in a Library
  // shaped record; it did not come from the user reading and keeping something.
  if (provider && provider !== 'library' && provider !== 'reader') return false;
  if (!OWNED_SOURCE_TYPES.has(type)) return false;
  return Boolean(asString(source.objectId) || asString(source.parentObjectId));
};

const familyLabel = (members = []) => {
  const parent = members.find(member => asString(member.type).toLowerCase() !== 'highlight');
  const label = asString((parent || members[0] || {}).title)
    .replace(/\s+highlight$/i, '')
    .trim();
  return label || 'Untitled source';
};

// The topic-coverage function lives in the maintenance service alongside the
// tokenizer that the rest of the gate uses. Injecting it keeps one definition
// of "does this source address the subject" instead of a second, drifting one.
const deriveSourceFamilies = ({
  sourceRefs = [],
  topic = '',
  topicCoverage = null
} = {}) => {
  const families = new Map();
  (Array.isArray(sourceRefs) ? sourceRefs : []).forEach((source, position) => {
    const key = sourceFamilyKey(source || {});
    if (!key) return;
    const index = position + 1;
    const coverage = typeof topicCoverage === 'function'
      ? Number(topicCoverage(source || {}, topic)) || 0
      : 0;
    const current = families.get(key) || {
      key,
      indexes: [],
      members: [],
      owned: false,
      topicCoverage: 0
    };
    current.indexes.push(index);
    current.members.push(source || {});
    current.owned = current.owned || isOwnedSource(source || {});
    current.topicCoverage = Math.max(current.topicCoverage, coverage);
    families.set(key, current);
  });
  return Array.from(families.values()).map(family => ({
    key: family.key,
    indexes: family.indexes,
    title: familyLabel(family.members),
    ownership: family.owned ? 'owned' : 'supplemental',
    topicCoverage: Number(family.topicCoverage.toFixed(2)),
    relevant: family.topicCoverage >= OWNED_FAMILY_RELEVANCE_COVERAGE
  }));
};

const normalizeExclusions = (exclusions = []) => (
  (Array.isArray(exclusions) ? exclusions : [])
    .map((entry) => {
      const index = Number(entry?.index ?? entry?.sourceIndex);
      const reason = asString(entry?.reason);
      if (!Number.isInteger(index) || index < 1) return null;
      // An exclusion is a stated editorial judgment. An empty or throwaway
      // reason leaves the family accountable rather than quietly dropping it.
      if (reason.length < MIN_EXCLUSION_REASON_LENGTH) return null;
      return { index, reason };
    })
    .filter(Boolean)
);

// Exclusions arrive addressed to candidate positions, but the reference ledger
// renumbers itself. Resolving them to family identity once means an exclusion
// keeps pointing at the same material whether that family was retained,
// renumbered, or dropped from the page entirely.
const resolveExclusionFamilies = ({ exclusions = [], sources = [] } = {}) => {
  const byIndex = new Map(
    (Array.isArray(sources) ? sources : []).map((source, position) => [
      Number(source?.index) || position + 1,
      sourceFamilyKey(source || {})
    ])
  );
  return normalizeExclusions(exclusions)
    .map(entry => ({ familyKey: byIndex.get(entry.index) || '', reason: entry.reason }))
    .filter(entry => entry.familyKey);
};

const evaluateOwnedSourceUtilization = ({
  sourceRefs = [],
  selectedSources = [],
  topic = '',
  topicCoverage = null,
  usedCitationIndexes = [],
  exclusions = [],
  minUtilizationRatio = MIN_OWNED_UTILIZATION_RATIO
} = {}) => {
  const families = deriveSourceFamilies({ sourceRefs, topic, topicCoverage });
  const retainedKeys = new Set(families.map(family => family.key));
  // A family the user's account selected but the article never carried onto the
  // page is not silently forgiven. It is unused evidence until the article
  // cites it or the model says why it does not belong.
  const droppedFamilies = deriveSourceFamilies({
    sourceRefs: selectedSources,
    topic,
    topicCoverage
  }).filter(family => !retainedKeys.has(family.key));
  const ownedFamilies = [...families, ...droppedFamilies].filter(family => family.ownership === 'owned');
  const supplementalFamilies = families.filter(family => family.ownership === 'supplemental');
  const droppedKeys = new Set(droppedFamilies.map(family => family.key));
  const usedIndexes = new Set(
    (Array.isArray(usedCitationIndexes) ? usedCitationIndexes : [])
      .map(Number)
      .filter(index => Number.isInteger(index) && index > 0)
  );
  const exclusionByFamily = new Map(
    (Array.isArray(exclusions) && exclusions.some(entry => entry?.familyKey)
      ? exclusions.filter(entry => entry?.familyKey && asString(entry.reason).length >= MIN_EXCLUSION_REASON_LENGTH)
      : resolveExclusionFamilies({ exclusions, sources: sourceRefs })
    ).map(entry => [entry.familyKey, entry.reason])
  );

  const annotated = ownedFamilies.map((family) => {
    const utilized = !droppedKeys.has(family.key)
      && family.indexes.some(index => usedIndexes.has(index));
    return {
      ...family,
      utilized,
      dropped: droppedKeys.has(family.key),
      // A family the article actually cited is utilized, whatever the model
      // also said about excluding it. Utilization is the stronger evidence.
      excludedReason: !utilized ? (exclusionByFamily.get(family.key) || '') : ''
    };
  });

  const utilized = annotated.filter(family => family.utilized);
  const relevant = annotated.filter(family => family.relevant);
  const excluded = annotated.filter(family => !family.utilized && family.excludedReason);
  // Accountable families are the relevant owned families the article did not
  // explicitly set aside. Irrelevant material never enters the denominator, so
  // a noisy Library import cannot drag a good article below the bar.
  const accountable = relevant.filter(family => !family.excludedReason);
  const unused = accountable.filter(family => !family.utilized);
  const utilizationRatio = accountable.length
    ? Number((utilized.filter(family => family.relevant).length / accountable.length).toFixed(2))
    : null;

  const failures = [];
  // At least one relevant owned family must materially support the article.
  // Excluding every owned source is an honest answer, but it is not an
  // account-grounded page, so it still fails closed rather than shipping.
  if (ownedFamilies.length && !utilized.length) {
    failures.push(
      excluded.length === ownedFamilies.length
        ? `Ordinary reference article excludes every owned Library source famil${ownedFamilies.length === 1 ? 'y' : 'ies'} (${ownedFamilies.length}); an ordinary Wiki must begin with exact evidence from the account's own corpus, so this subject has no account-grounded article yet.`
        : `Ordinary reference article attaches ${ownedFamilies.length} owned Library source famil${ownedFamilies.length === 1 ? 'y' : 'ies'} but no claim cites any of them; owned evidence must support, challenge, or contextualize a visible claim rather than sit in References.`
    );
  } else if (accountable.length >= 2
    && utilizationRatio !== null
    && utilizationRatio < minUtilizationRatio) {
    failures.push(
      `Ordinary reference article uses too little of its owned Library evidence: ${utilized.filter(family => family.relevant).length}/${accountable.length} relevant source families cited. Use ${unused.slice(0, 4).map(family => `"${family.title}"`).join(', ')} in a claim or exclude it with a stated reason.`
    );
  }

  const ownedFamilyCount = ownedFamilies.length;
  const utilizedCount = utilized.length;
  return {
    ok: failures.length === 0,
    failures,
    metrics: {
      ownedFamilyCount,
      relevantOwnedFamilyCount: relevant.length,
      accountableOwnedFamilyCount: accountable.length,
      utilizedOwnedFamilyCount: utilizedCount,
      excludedOwnedFamilyCount: excluded.length,
      supplementalFamilyCount: supplementalFamilies.length,
      droppedOwnedFamilyCount: annotated.filter(family => family.dropped).length,
      utilizationRatio,
      unusedOwnedFamilies: unused.map(family => ({ title: family.title, indexes: family.indexes })),
      excludedOwnedFamilies: excluded.map(family => ({
        title: family.title,
        reason: family.excludedReason
      })),
      // Receipt copy belongs in build/maintenance tooling, never in the
      // article's reading plane.
      receiptSummary: ownedFamilyCount
        ? `Used ${utilizedCount} of ${ownedFamilyCount} selected Library source famil${ownedFamilyCount === 1 ? 'y' : 'ies'}.`
        : ''
    }
  };
};

module.exports = {
  OWNED_SOURCE_TYPES,
  MIN_OWNED_UTILIZATION_RATIO,
  OWNED_FAMILY_RELEVANCE_COVERAGE,
  MIN_EXCLUSION_REASON_LENGTH,
  normalizeUrl,
  sourceFamilyKey,
  isOwnedSource,
  deriveSourceFamilies,
  normalizeExclusions,
  resolveExclusionFamilies,
  evaluateOwnedSourceUtilization
};
