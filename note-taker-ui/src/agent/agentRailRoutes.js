// The agent rail belongs to the rooms and to the reading surfaces inside them.
// Settings, connections, onboarding and the marketing pages are not places the
// agent works, so the rail is absent there rather than sitting empty.
//
// Library is absent for a different reason: it still carries the Librarian
// panel it has always had, and a rail beside it would be two agents on one
// screen — the thing the rail exists to stop. Library's column is the surface
// that replaces that panel; the rail arrives with it, not before it.

const RAIL_PREFIXES = [
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
