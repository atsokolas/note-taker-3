const normalizeClaimSupport = (support = '') => {
  if (support === 'contradicted') return 'conflicted';
  return ['unknown', 'supported', 'partial', 'unsupported', 'conflicted'].includes(support) ? support : 'unknown';
};

module.exports = { normalizeClaimSupport };
