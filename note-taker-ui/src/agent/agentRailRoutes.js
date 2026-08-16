// The agent rail belongs to the four rooms — Library, Think, Wiki, Judgment —
// and to the reading and article surfaces inside them. Settings, connections,
// onboarding, and the marketing pages are not places the agent works, so the
// rail is absent there rather than sitting empty.

const RAIL_PREFIXES = [
  '/library',
  '/think',
  '/wiki',
  '/judgment'
];

const RAIL_EXCLUSIONS = [
  '/wiki/activity',
  '/onboarding'
];

export const hasAgentRail = (pathname = '') => {
  const path = String(pathname || '');
  if (RAIL_EXCLUSIONS.some(prefix => path.startsWith(prefix))) return false;
  return RAIL_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
};

export default hasAgentRail;
