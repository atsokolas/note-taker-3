const { eventIsSubstantive, providerKind } = require('./alphabetProofAcceptanceService');
const { buildPublicProofHeadHash } = require('./publicProofHeadService');

const clean = (value = '', limit = 320) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const id = value => String(value?._id || value?.id || value || '').trim();
const sameId = (left, right) => Boolean(id(left) && id(left) === id(right));

const requiredTypeForEvent = (event = {}) => {
  const kind = providerKind(event);
  if (kind === 'filing') return 'sec_edgar';
  if (kind === 'transcript') return 'earnings_transcript';
  return '';
};

const buildSecPublicProofAcceptance = ({
  page = {},
  requestedClocks = [],
  events = [],
  revisions = [],
  acceptedHeadRevision = null,
  comparison = null,
  researchAsOf = null,
  reason = '',
  now = new Date(),
  identity = {}
} = {}) => {
  const pageId = id(page);
  const errors = [];
  const expectedTicker = clean(identity.ticker, 20).toUpperCase();
  const expectedCik = clean(identity.cik, 20).replace(/^0+/, '');
  const pageTicker = clean(page.externalWatches?.edgar?.ticker, 20).toUpperCase();
  const pageCik = clean(page.externalWatches?.edgar?.cik, 20).replace(/^0+/, '');
  const titlePattern = identity.titlePattern instanceof RegExp ? identity.titlePattern : null;
  const identityMatches = Boolean(pageId)
    && (!expectedTicker || pageTicker === expectedTicker)
    && (!expectedCik || pageCik === expectedCik)
    && (!titlePattern || titlePattern.test(clean(page.title)));
  if (!identityMatches) errors.push('The target does not match the required SEC dossier identity.');
  const acceptedReason = clean(reason);
  if (acceptedReason.length < 40) errors.push('An editorial acceptance reason of at least 40 characters is required.');
  const requested = Array.isArray(requestedClocks) ? requestedClocks : [];
  const acceptedClocks = [];
  const seenTypes = new Set();

  requested.forEach((clock, index) => {
    const sourceEventId = id(clock?.sourceEventId);
    const revisionId = id(clock?.revisionId);
    const event = events.find(row => sameId(row, sourceEventId));
    const revision = revisions.find(row => sameId(row, revisionId));
    const type = requiredTypeForEvent(event);
    if (!event || !eventIsSubstantive(event) || !Array.isArray(event.affectedPageIds)
      || !event.affectedPageIds.some(value => sameId(value, pageId))) {
      errors.push(`Clock ${index + 1} is not a substantive processed source event attached to this dossier.`);
      return;
    }
    if (!['sec_edgar', 'earnings_transcript'].includes(type)) {
      errors.push(`Clock ${index + 1} is not an SEC filing or earnings transcript event.`);
      return;
    }
    if (!revision || !sameId(revision.pageId, pageId) || !sameId(revision.sourceEventId, sourceEventId)
      || revision.promotionStatus !== 'promoted' || !['source_event', 'agent_maintenance'].includes(revision.reason)) {
      errors.push(`Clock ${index + 1} is not tied to a promoted maintenance revision for this event.`);
      return;
    }
    if (seenTypes.has(type)) {
      errors.push(`Only one accepted ${type} clock may be recorded.`);
      return;
    }
    seenTypes.add(type);
    acceptedClocks.push({ type, sourceEventId, revisionId, acceptedAt: now });
  });

  if (!seenTypes.has('sec_edgar')) errors.push('Missing required accepted clock: sec_edgar.');
  const headRevision = acceptedHeadRevision || revisions
    .filter(row => row && row.promotionStatus === 'promoted' && row.after)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))[0];
  const pageHeadHash = buildPublicProofHeadHash(page);
  const revisionHeadHash = headRevision?.after ? buildPublicProofHeadHash(headRevision.after) : '';
  if (!headRevision || !sameId(headRevision.pageId, pageId) || headRevision.promotionStatus !== 'promoted') {
    errors.push('Public-proof acceptance must identify the promoted revision representing the current dossier head.');
  } else if (!revisionHeadHash || revisionHeadHash !== pageHeadHash) {
    errors.push('The accepted head revision does not match the current dossier content.');
  }
  if (errors.length) return { ok: false, errors, record: null };

  const counts = comparison?.counts || comparison?.claimComparison?.counts || {};

  return {
    ok: true,
    errors: [],
    record: {
      grade: 'proven',
      reason: acceptedReason,
      acceptedAt: now,
      acceptedEventId: `sec:${expectedTicker || pageTicker || expectedCik || pageCik || 'dossier'}:${acceptedClocks.map(clock => clock.sourceEventId).join(':')}`,
      acceptedClocks,
      acceptanceSnapshot: {
        kind: 'sec_dossier_head_v1',
        sourceEventId: id(headRevision.sourceEventId),
        revisionId: id(headRevision),
        headContentHash: pageHeadHash,
        researchAsOf: researchAsOf || null,
        counts: {
          added: Number(counts.added || 0),
          changed: Number(counts.changed || 0),
          evidenceRefreshed: Number(counts.evidenceRefreshed || 0),
          gainedSupport: Number(counts.gainedSupport || 0),
          contradicted: Number(counts.contradicted || 0),
          preserved: Number(counts.preserved || 0),
          removed: Number(counts.removed || 0)
        },
        acceptedAt: now
      }
    }
  };
};

const buildAlphabetPublicProofAcceptance = options => buildSecPublicProofAcceptance({
  ...options,
  identity: { titlePattern: /alphabet/i, ...(options?.identity || {}) }
});

module.exports = {
  buildAlphabetPublicProofAcceptance,
  buildSecPublicProofAcceptance,
  requiredTypeForEvent
};
