const { eventIsSubstantive, providerKind } = require('./alphabetProofAcceptanceService');

const clean = (value = '', limit = 320) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const id = value => String(value?._id || value?.id || value || '').trim();
const sameId = (left, right) => Boolean(id(left) && id(left) === id(right));

const requiredTypeForEvent = (event = {}) => {
  const kind = providerKind(event);
  if (kind === 'filing') return 'sec_edgar';
  if (kind === 'transcript') return 'earnings_transcript';
  return '';
};

const buildAlphabetPublicProofAcceptance = ({
  page = {},
  requestedClocks = [],
  events = [],
  revisions = [],
  reason = '',
  now = new Date()
} = {}) => {
  const pageId = id(page);
  const errors = [];
  if (!pageId || !/alphabet/i.test(clean(page.title))) errors.push('The target must be an owned Alphabet dossier.');
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
  if (errors.length) return { ok: false, errors, record: null };

  return {
    ok: true,
    errors: [],
    record: {
      grade: 'proven',
      reason: acceptedReason,
      acceptedAt: now,
      acceptedEventId: `alphabet:${acceptedClocks.map(clock => clock.sourceEventId).join(':')}`,
      acceptedClocks
    }
  };
};

module.exports = {
  buildAlphabetPublicProofAcceptance,
  requiredTypeForEvent
};
