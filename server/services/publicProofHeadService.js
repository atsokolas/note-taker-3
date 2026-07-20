const crypto = require('crypto');

const asPlain = (value) => (
  value && typeof value.toObject === 'function'
    ? value.toObject({ virtuals: false })
    : value
);

const normalize = (value) => {
  const plain = asPlain(value);
  if (plain === null || plain === undefined) return plain;
  if (plain instanceof Date) return plain.toISOString();
  if (typeof plain?.toHexString === 'function') return plain.toHexString();
  if (Array.isArray(plain)) return plain.map(normalize);
  if (typeof plain === 'object') {
    return Object.keys(plain)
      .filter(key => !['__v', 'updatedAt'].includes(key))
      .sort()
      .reduce((result, key) => {
        result[key] = normalize(plain[key]);
        return result;
      }, {});
  }
  return plain;
};

// Mongoose applies these defaults when an older claim is hydrated even though
// they were absent from the accepted revision snapshot. They carry no editorial
// information, so allowing them into the hash would make an unchanged page fail
// exact-head acceptance after a process restart.
const CLAIM_HYDRATION_DEFAULTS = {
  checkInStatus: 'unreviewed',
  epistemicStatus: 'plausible_hypothesis',
  falsifierIds: [],
  implication: '',
  lastCheckedAt: null,
  materiality: 'supporting',
  restoredAt: null,
  retiredAt: null
};

const CLAIM_HISTORY_HYDRATION_DEFAULTS = {
  action: '',
  actorType: 'system',
  confidence: null,
  disposition: null,
  epistemicStatus: null,
  evidenceDelta: null,
  note: '',
  reason: ''
};

const omitMatchingDefaults = (value, defaults) => Object.entries(value || {})
  .reduce((result, [key, fieldValue]) => {
    if (Object.prototype.hasOwnProperty.call(defaults, key)
      && JSON.stringify(fieldValue) === JSON.stringify(defaults[key])) return result;
    result[key] = fieldValue;
    return result;
  }, {});

const canonicalClaim = (claim = {}) => {
  const plain = asPlain(claim) || {};
  const result = omitMatchingDefaults(plain, CLAIM_HYDRATION_DEFAULTS);
  if (Array.isArray(plain.history)) {
    result.history = plain.history.map(entry => omitMatchingDefaults(
      asPlain(entry) || {},
      CLAIM_HISTORY_HYDRATION_DEFAULTS
    ));
  }
  return result;
};

const publicProofHeadPayload = (page = {}) => {
  const plain = asPlain(page) || {};
  return normalize({
    version: 1,
    title: plain.title || '',
    slug: plain.slug || '',
    pageType: plain.pageType || '',
    body: plain.body || null,
    plainText: plain.plainText || '',
    sourceRefs: Array.isArray(plain.sourceRefs) ? plain.sourceRefs : [],
    citations: Array.isArray(plain.citations) ? plain.citations : [],
    claims: Array.isArray(plain.claims) ? plain.claims.map(canonicalClaim) : []
  });
};

const buildPublicProofHeadHash = (page = {}) => crypto
  .createHash('sha256')
  .update(JSON.stringify(publicProofHeadPayload(page)))
  .digest('hex');

module.exports = {
  buildPublicProofHeadHash,
  publicProofHeadPayload
};
