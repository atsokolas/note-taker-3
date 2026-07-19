const clean = (value = '', limit = 800) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const asPlain = (value = {}) => (
  value && typeof value.toObject === 'function' ? value.toObject() : value || {}
);

const normalizeIdentity = (value = '') => clean(value, 1000)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normalizeIds = (value = []) => (
  (Array.isArray(value) ? value : []).map(String).filter(Boolean).sort()
);

const supportRank = (support = '') => ({
  unsupported: 0,
  partial: 1,
  supported: 2
}[clean(support, 40).toLowerCase()] ?? 0);

const evidenceIds = (claim = {}) => Array.from(new Set([
  ...normalizeIds(claim.citationIds),
  ...normalizeIds(claim.sourceRefIds)
])).sort();

const contradictionIds = (claim = {}) => normalizeIds(claim.contradictedByCitationIds);

const sameIds = (left = [], right = []) => JSON.stringify(left) === JSON.stringify(right);

const claimKey = (claim = {}) => clean(claim.claimId || claim._id || claim.id, 200);

const identityTokens = (value = '') => new Set(
  normalizeIdentity(value).split(' ').filter(token => token.length > 2)
);

const overlapRatio = (left = new Set(), right = new Set()) => {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((value) => {
    if (right.has(value)) overlap += 1;
  });
  return overlap / Math.max(left.size, right.size);
};

const commonTokenCount = (left = new Set(), right = new Set()) => {
  let count = 0;
  left.forEach((value) => {
    if (right.has(value)) count += 1;
  });
  return count;
};

const findRewrittenClaim = ({ next = {}, before = [], used }) => {
  const nextSection = normalizeIdentity(next.section);
  const nextTokens = identityTokens(next.text);
  const nextEvidence = new Set(evidenceIds(next));
  const candidates = [];
  (Array.isArray(before) ? before : []).forEach((candidate) => {
    if (used.has(candidate)) return;
    if (!nextSection || normalizeIdentity(candidate.section) !== nextSection) return;
    const candidateTokens = identityTokens(candidate.text);
    if (Math.min(nextTokens.size, candidateTokens.size) < 8) return;
    const sharedTokens = commonTokenCount(nextTokens, candidateTokens);
    const textOverlap = overlapRatio(nextTokens, candidateTokens);
    const evidenceOverlap = overlapRatio(nextEvidence, new Set(evidenceIds(candidate)));
    const plausibleRewrite = (
      (sharedTokens >= 5 && textOverlap >= 0.24)
      || (sharedTokens >= 4 && textOverlap >= 0.18 && evidenceOverlap > 0)
    );
    if (!plausibleRewrite) return;
    const score = (textOverlap * 0.72) + (evidenceOverlap * 0.23) + 0.05;
    candidates.push({ candidate, score });
  });
  candidates.sort((left, right) => right.score - left.score);
  const [best, runnerUp] = candidates;
  if (!best) return null;
  // A fuzzy pairing becomes public proof evidence. If two prior claims are
  // nearly equally plausible, preserve the uncertainty as added/removed
  // instead of inventing a rewrite relationship.
  if (runnerUp && best.score - runnerUp.score < 0.08) return null;
  return best.candidate;
};

const serializeDeltaClaim = (claim = {}) => ({
  claimId: claimKey(claim),
  text: clean(claim.text),
  section: clean(claim.section, 180),
  support: clean(claim.support, 40) || 'unsupported',
  sourceRefIds: normalizeIds(claim.sourceRefIds),
  citationIds: normalizeIds(claim.citationIds),
  evidenceIds: evidenceIds(claim),
  contradictionIds: contradictionIds(claim)
});

const coalesceClaimFragments = (claims = []) => (
  (Array.isArray(claims) ? claims : []).map(asPlain).reduce((merged, claim) => {
    const previous = merged[merged.length - 1];
    const key = claimKey(claim);
    const sameMarkedClaim = previous
      && key
      && claimKey(previous) === key
      && normalizeIdentity(previous.section) === normalizeIdentity(claim.section);
    if (!sameMarkedClaim) {
      merged.push({ ...claim });
      return merged;
    }
    previous.text = `${clean(previous.text)} ${clean(claim.text)}`
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    previous.citationIds = Array.from(new Set([
      ...normalizeIds(previous.citationIds),
      ...normalizeIds(claim.citationIds)
    ]));
    previous.sourceRefIds = Array.from(new Set([
      ...normalizeIds(previous.sourceRefIds),
      ...normalizeIds(claim.sourceRefIds)
    ]));
    previous.contradictedByCitationIds = Array.from(new Set([
      ...normalizeIds(previous.contradictedByCitationIds),
      ...normalizeIds(claim.contradictedByCitationIds)
    ]));
    return merged;
  }, [])
);

const findPreviousClaim = ({ next = {}, before, byId, byIdentity, used }) => {
  const id = claimKey(next);
  if (id && byId.has(id) && !used.has(byId.get(id))) return byId.get(id);
  const identity = normalizeIdentity(next.text);
  if (identity && byIdentity.has(identity)) {
    const match = byIdentity.get(identity).find(candidate => !used.has(candidate));
    if (match) return match;
  }
  return findRewrittenClaim({ next, before, used });
};

const compareClaimLedgers = ({ beforeClaims = [], afterClaims = [], outcome = 'accepted' } = {}) => {
  const before = coalesceClaimFragments(beforeClaims);
  const after = coalesceClaimFragments(afterClaims);
  const byId = new Map();
  const byIdentity = new Map();
  before.forEach((claim) => {
    const id = claimKey(claim);
    if (id && !byId.has(id)) byId.set(id, claim);
    const identity = normalizeIdentity(claim.text);
    if (!identity) return;
    const rows = byIdentity.get(identity) || [];
    rows.push(claim);
    byIdentity.set(identity, rows);
  });

  const used = new Set();
  const deltas = {
    added: [],
    changed: [],
    evidenceRefreshed: [],
    gainedSupport: [],
    contradicted: [],
    preserved: [],
    removed: []
  };

  after.forEach((next) => {
    const previous = findPreviousClaim({ next, before, byId, byIdentity, used });
    if (!previous) {
      deltas.added.push({ after: serializeDeltaClaim(next) });
      return;
    }
    used.add(previous);
    const previousRow = serializeDeltaClaim(previous);
    const nextRow = serializeDeltaClaim(next);
    const textChanged = normalizeIdentity(previous.text) !== normalizeIdentity(next.text);
    const sectionChanged = clean(previous.section, 180) !== clean(next.section, 180);
    const supportChanged = previousRow.support !== nextRow.support;
    const evidenceChanged = !sameIds(previousRow.evidenceIds, nextRow.evidenceIds);
    const contradictionChanged = !sameIds(previousRow.contradictionIds, nextRow.contradictionIds);
    const newlyConflicted = nextRow.support === 'conflicted' && (
      previousRow.support !== 'conflicted'
      || nextRow.contradictionIds.length > previousRow.contradictionIds.length
    );
    const gainedSupport = nextRow.support !== 'conflicted' && (
      supportRank(nextRow.support) > supportRank(previousRow.support)
      || nextRow.evidenceIds.length > previousRow.evidenceIds.length
    );
    const pair = { before: previousRow, after: nextRow };

    if (newlyConflicted) deltas.contradicted.push(pair);
    if (gainedSupport) deltas.gainedSupport.push(pair);
    if (evidenceChanged) deltas.evidenceRefreshed.push(pair);
    if (textChanged || sectionChanged || supportChanged || contradictionChanged) {
      deltas.changed.push(pair);
    } else {
      // A claim whose wording, placement, support grade, and contradiction
      // status survive a source refresh is preserved. Evidence movement is
      // reported independently; it is not a claim rewrite.
      deltas.preserved.push(pair);
    }
  });

  before.forEach((claim) => {
    if (!used.has(claim)) deltas.removed.push({ before: serializeDeltaClaim(claim) });
  });

  const counts = Object.fromEntries(Object.entries(deltas).map(([key, rows]) => [key, rows.length]));
  return {
    version: 2,
    outcome: outcome === 'rejected' ? 'rejected' : 'accepted',
    counts,
    deltas,
    materialChangeCount: counts.added + counts.changed + counts.removed,
    reviewedClaimCount: after.length
  };
};

module.exports = {
  compareClaimLedgers,
  normalizeIdentity,
  serializeDeltaClaim
};
