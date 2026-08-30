const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value || {};
const id = value => {
  if (value && typeof value === 'object') return String(value._id || value.id || '');
  return String(value || '');
};

const normalizeComparableText = (value = '') => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const claimId = value => String(value?.claimId || value?._id || value?.id || '');

const uniqueBy = (values = [], keyFor = id) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter(value => {
    const key = keyFor(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mergeClaimRecords = (claims = []) => {
  const merged = new Map();
  (Array.isArray(claims) ? claims : []).map(plain).forEach(claim => {
    const key = normalizeComparableText(claim.text);
    if (!key) return;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...claim });
      return;
    }
    existing.citationIds = uniqueBy([...(existing.citationIds || []), ...(claim.citationIds || [])], String);
    existing.sourceRefIds = uniqueBy([...(existing.sourceRefIds || []), ...(claim.sourceRefIds || [])], String);
    existing.contradictedByCitationIds = uniqueBy([
      ...(existing.contradictedByCitationIds || []),
      ...(claim.contradictedByCitationIds || [])
    ], String);
    existing.history = uniqueBy([...(existing.history || []), ...(claim.history || [])], entry => (
      `${entry?.at || ''}:${entry?.event || entry?.action || ''}:${normalizeComparableText(entry?.text || entry?.summary)}`
    ));
    if (new Date(claim.lastCheckedAt || 0) > new Date(existing.lastCheckedAt || 0)) {
      existing.lastCheckedAt = claim.lastCheckedAt;
      existing.checkInStatus = claim.checkInStatus;
    }
  });
  return Array.from(merged.values());
};

const buildDuplicateClaimPlan = (claims = []) => {
  const groups = new Map();
  (Array.isArray(claims) ? claims : []).forEach(claim => {
    const key = normalizeComparableText(claim?.text);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(claim);
  });
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const canonicalClaimId = claimId(group[0]);
      return {
        key,
        canonicalClaimId,
        mergedClaimIds: uniqueBy(
          group.slice(1).map(claimId).filter(value => value && value !== canonicalClaimId),
          String
        ),
        duplicateEntryCount: group.length - 1
      };
    });
};

const richness = page => {
  const value = plain(page);
  const judgment = value.judgment || {};
  return (
    String(value.plainText || '').length
    + (value.aiState?.candidateStatus === 'rejected' ? -10_000 : 0)
    + (value.aiState?.build?.creationPreflight ? 1_000 : 0)
    + (value.sourceRefs || []).length * 500
    + (value.claims || []).length * 300
    + ['why', 'against', 'assumptions', 'falsifiers', 'decisions', 'lessons']
      .reduce((score, key) => score + (judgment[key] || []).length * 400, 0)
  );
};

const chooseCanonicalPage = (pages = []) => [...pages].sort((left, right) => (
  richness(right) - richness(left)
  || new Date(right?.updatedAt || 0) - new Date(left?.updatedAt || 0)
  || id(left).localeCompare(id(right))
))[0] || null;

const pageIsRepoWiki = (page = {}) => {
  const type = String(page?.pageType || '').toLowerCase();
  if (type === 'repo' || type === 'project' || type === 'log') return true;
  const watch = page?.externalWatches?.githubRepo || {};
  return Boolean(String(watch.owner || '').trim() || String(watch.repo || '').trim());
};

/* Create-time reuse: same title still reopens the existing page. A matching
   currentJudgment reopens the existing hold. A claim sitting on a repo wiki
   is not a hold — that corpus is not relevant to "do you still believe…?". */
const findWriteTimeCanonicalPage = (pages = [], text = '') => {
  const key = normalizeComparableText(text);
  if (!key) return null;
  const list = Array.isArray(pages) ? pages : [];
  const titleMatches = list.filter(page => normalizeComparableText(page?.title) === key);
  if (titleMatches.length) return chooseCanonicalPage(titleMatches);
  const judgmentMatches = list.filter(page => (
    !pageIsRepoWiki(page)
    && normalizeComparableText(page?.judgment?.currentJudgment) === key
  ));
  return chooseCanonicalPage(judgmentMatches);
};

const buildDuplicatePagePlan = (pages = []) => {
  const groups = new Map();
  (Array.isArray(pages) ? pages : []).forEach(page => {
    const judgmentKey = normalizeComparableText(page?.judgment?.currentJudgment);
    const titleKey = normalizeComparableText(page?.title);
    const key = judgmentKey ? `judgment:${judgmentKey}` : titleKey ? `title:${titleKey}` : '';
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(page);
  });
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const canonical = chooseCanonicalPage(group);
      return {
        key,
        canonicalId: id(canonical),
        duplicateIds: group.map(id).filter(value => value !== id(canonical)),
        pages: group
      };
    });
};

const mergeJudgment = (pages = [], canonical = {}) => {
  const base = { ...(plain(canonical).judgment || {}) };
  ['why', 'against', 'assumptions', 'unknowns', 'falsifiers', 'decisions', 'lessons', 'dependsOn']
    .forEach(key => {
      const combined = pages.flatMap(page => listFor(plain(page)?.judgment?.[key]));
      if (!combined.length) return;
      base[key] = uniqueBy(combined.map(plain), entry => (
        id(entry)
        || normalizeComparableText(entry?.text || entry?.summary || entry?.note)
      ));
    });
  return Object.keys(base).length ? base : null;
};

const listFor = value => Array.isArray(value) ? value : [];

const mergePageRecords = (pages = [], { canonicalPage = null, mergedAt = new Date() } = {}) => {
  const canonical = canonicalPage || chooseCanonicalPage(pages);
  if (!canonical) return null;
  const values = pages.map(plain);
  const base = plain(canonical);
  return {
    ...base,
    sourceRefs: uniqueBy(values.flatMap(page => listFor(page.sourceRefs)).map(plain), entry => (
      id(entry) || `${entry?.type || ''}:${id(entry?.objectId)}:${entry?.url || ''}`
    )),
    citations: uniqueBy(values.flatMap(page => listFor(page.citations)).map(plain), entry => (
      id(entry) || `${id(entry?.sourceRefId)}:${entry?.quote || ''}`
    )),
    claims: mergeClaimRecords(values.flatMap(page => listFor(page.claims))),
    judgment: mergeJudgment(values, base),
    aiState: {
      ...(base.aiState || {}),
      build: {
        ...(base.aiState?.build || {}),
        dedupeMigration: {
          mergedPageIds: values.map(id).filter(value => value !== id(canonical)),
          mergedAt: mergedAt.toISOString()
        }
      }
    }
  };
};

module.exports = {
  buildDuplicateClaimPlan,
  buildDuplicatePagePlan,
  chooseCanonicalPage,
  findWriteTimeCanonicalPage,
  mergePageRecords,
  mergeClaimRecords,
  normalizeComparableText,
  pageIsRepoWiki,
  richness,
  uniqueBy
};
