/**
 * Claim birth — the day a belief entered the ledger.
 *
 * bornAt is the earliest trustworthy instant we have: an existing stamp,
 * createdAt, the oldest history.at, or the page itself. It never moves later.
 * Surfaces that would have printed "Born: Unknown" read this instead.
 */

const asClaimDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const earliestDate = (...values) => {
  const dates = values.map(asClaimDate).filter(Boolean);
  if (!dates.length) return null;
  return dates.reduce((earliest, next) => (
    next.getTime() < earliest.getTime() ? next : earliest
  ));
};

const earliestHistoryAt = (history = []) => (
  earliestDate(...(Array.isArray(history) ? history.map(entry => entry?.at) : []))
);

const resolveClaimBornAt = (claim = {}, { pageCreatedAt, now } = {}) => (
  earliestDate(
    claim?.bornAt,
    claim?.createdAt,
    earliestHistoryAt(claim?.history),
    pageCreatedAt,
    now
  )
);

const stampClaimBornAt = (claim = {}, options = {}) => {
  const bornAt = resolveClaimBornAt(claim, options);
  if (!bornAt) return claim;
  return { ...claim, bornAt };
};

const applyBornAtToClaims = (claims = [], options = {}) => (
  (Array.isArray(claims) ? claims : []).map(claim => stampClaimBornAt(claim, options))
);

const isoOrNull = (value) => {
  const date = asClaimDate(value);
  return date ? date.toISOString() : null;
};

const planClaimBornAtBackfill = (pages = [], { now } = {}) => {
  const changes = [];
  (Array.isArray(pages) ? pages : []).forEach((page) => {
    (Array.isArray(page?.claims) ? page.claims : []).forEach((claim) => {
      const next = resolveClaimBornAt(claim, { pageCreatedAt: page?.createdAt, now });
      if (!next) return;
      const current = asClaimDate(claim?.bornAt);
      if (current && current.getTime() === next.getTime()) return;
      changes.push({
        pageId: String(page?._id || ''),
        userId: String(page?.userId || ''),
        claimId: String(claim?.claimId || ''),
        from: isoOrNull(current),
        to: next.toISOString()
      });
    });
  });
  return changes;
};

const applyClaimBornAtChanges = (claims = [], changes = [], options = {}) => {
  const byId = new Map(
    (Array.isArray(changes) ? changes : [])
      .filter(change => change?.claimId)
      .map(change => [String(change.claimId), change])
  );
  return (Array.isArray(claims) ? claims : []).map((claim) => {
    const change = byId.get(String(claim?.claimId || ''));
    if (change?.to) return { ...claim, bornAt: new Date(change.to) };
    return stampClaimBornAt(claim, options);
  });
};

module.exports = {
  asClaimDate,
  earliestDate,
  earliestHistoryAt,
  resolveClaimBornAt,
  stampClaimBornAt,
  applyBornAtToClaims,
  planClaimBornAtBackfill,
  applyClaimBornAtChanges
};
