export const SUPPORT_STATES = new Set(['unknown', 'supported', 'partial', 'unsupported', 'conflicted']);

export const normalizeClaimSupport = value => {
  if (value === 'contradicted') return 'conflicted';
  return SUPPORT_STATES.has(value) ? value : 'unknown';
};
