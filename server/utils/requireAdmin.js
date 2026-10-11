/**
 * Site-wide data (all feedback, the marketing funnel) is for the people named
 * in FEEDBACK_ADMIN_USERNAMES, a comma-separated list of usernames. With no
 * list configured, nobody is an admin.
 */
const requireAdmin = (req, res, next) => {
  const admins = String(process.env.FEEDBACK_ADMIN_USERNAMES || '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  if (req.user?.username && admins.includes(req.user.username)) return next();
  return res.status(403).json({ error: 'Not authorized.' });
};

module.exports = { requireAdmin };
