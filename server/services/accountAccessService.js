// A signed credential proves identity, not that the account is still available.
const buildAccountAccessCheck = ({ User }) => {
  if (!User?.exists) throw new Error('User.exists is required for account access checks.');
  return async userId => {
    if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId)) return false;
    return Boolean(await User.exists({ _id: userId, accountDisabledAt: null }));
  };
};

const buildBrowserAuthentication = ({ readRequestToken, verifyToken, isAccountActive, optional = false }) => {
  if (typeof isAccountActive !== 'function') throw new Error('Account access check is required.');
  return async (req, res, next) => {
    let token, tokenSource;
    try {
      ({ token, tokenSource } = readRequestToken(req));
    } catch (_error) {
      return optional ? next() : res.status(401).json({ error: 'AUTH_INVALID' });
    }
    if (!token) return optional ? next() : res.status(401).json({ error: 'AUTH_REQUIRED' });
    let user;
    try {
      user = verifyToken(token);
    } catch (error) {
      if (optional) return next();
      return res.status(401).json({ error: error.name === 'TokenExpiredError' ? 'AUTH_EXPIRED' : 'AUTH_INVALID' });
    }
    try {
      if (!await isAccountActive(user?.id)) {
        return res.status(401).json({ error: 'AUTH_INVALID' });
      }
    } catch (_error) {
      return res.status(503).json({ error: 'AUTH_UNAVAILABLE' });
    }
    req.user = user;
    req.authInfo = { tokenSource, iat: user.iat, exp: user.exp };
    return next();
  };
};

module.exports = { buildAccountAccessCheck, buildBrowserAuthentication };
