// The agent rail belongs to the rooms and to the reading surfaces inside them.
// Settings, connections, onboarding and the marketing pages are not places the
// agent works, so the rail is absent there rather than sitting empty.
//
// The wiki workspace is absent for the same reason Library was: it already has
// an agent, and its own one is the richer of the two — it drafts, builds,
// ingests and lints, none of which the rail can do. One agent to a screen means
// the workspace keeps its own and the rail steps back. /wiki, the morning
// paper, has no chat pane of its own, so the rail stays the agent there.


const RAIL_PREFIXES = [
  '/library',
  '/think',
  '/wiki',
  '/judgment'
];

const RAIL_EXCLUSIONS = [
  '/wiki/activity',
  '/wiki/workspace',
  '/onboarding'
];

export const hasAgentRail = (pathname = '') => {
  const path = String(pathname || '');
  if (RAIL_EXCLUSIONS.some(prefix => path.startsWith(prefix))) return false;
  return RAIL_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
};

export default hasAgentRail;
