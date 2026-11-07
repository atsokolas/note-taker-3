/**
 * Site-wide data (all feedback, the marketing funnel) is for the people named
 * in FEEDBACK_ADMIN_USERNAMES, a comma-separated list of usernames. With no
 * list configured, nobody is an admin.
 */
const isAdminUsername = (username) => Boolean(username) && String(process.env.FEEDBACK_ADMIN_USERNAMES || '')
  .split(',')
  .map(name => name.trim())
  .filter(Boolean)
  .includes(username);

const requireAdmin = (req, res, next) => {
  if (isAdminUsername(req.user?.username)) return next();
  return res.status(403).json({ error: 'Not authorized.' });
};

module.exports = { isAdminUsername, requireAdmin };
