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
    claims: Array.isArray(plain.claims) ? plain.claims : []
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
