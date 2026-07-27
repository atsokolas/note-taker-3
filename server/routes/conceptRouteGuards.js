const requireAuthenticatedUser = (req, res, next) => {
  const userId = String(req.user?.id || '').trim();
  if (!userId) {
    return res.status(401).json({
      error: 'Authentication required.',
      code: 'AUTH_REQUIRED'
    });
  }
  return next();
};

const parseOptionalClaimId = value => {
  if (value === undefined || value === null) return { value: '' };
  if (typeof value !== 'string') return { error: 'claimId must be a string.' };
  const claimId = value.trim();
  if (!claimId) return { error: 'claimId must not be empty.' };
  if (claimId.length > 240) return { error: 'claimId is too long.' };
  return { value: claimId };
};

module.exports = { requireAuthenticatedUser, parseOptionalClaimId };
