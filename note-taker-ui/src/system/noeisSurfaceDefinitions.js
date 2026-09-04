const prefixMatch = (pathname = '', prefixes = []) => {
  const path = String(pathname || '').trim() || '/';
  return prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
};

const surface = ({
  id,
  room = '',
  name,
  route,
  navigationGroup = '',
  verb = '',
  orientation = '',
  activePrefixes = [route],
  authenticatedPrefixes = activePrefixes,
  match
}) => Object.freeze({
  schemaVersion: 1,
  id,
  kind: 'surface',
  name,
  version: '1.0.0',
  description: room
    ? 'A primary Noeis knowledge surface.'
    : 'An operational Noeis surface.',
  sourcePath: 'note-taker-ui/src/system/noeisSurfaceDefinitions.js',
  room,
  route,
  navigationGroup,
  verb,
  orientation,
  activePrefixes: Object.freeze([...activePrefixes]),
  authenticatedPrefixes: Object.freeze([...authenticatedPrefixes]),
  match: match || ((location = {}) => prefixMatch(location.pathname, activePrefixes))
});

/**
 * The sole declarative authority for product surfaces, their navigation
 * projection, room identity, and authenticated route ownership. React route
 * elements remain in App.js because the registry is metadata, not execution.
 */
export const NOEIS_SURFACE_DEFINITIONS = Object.freeze([
  surface({
    id: 'surface.library',
    room: 'library',
    name: 'Library',
    route: '/library',
    navigationGroup: 'primary',
    verb: 'Read',
    orientation: 'Recover source material and understand where it came from.',
    authenticatedPrefixes: ['/library', '/articles', '/all-highlights', '/tags', '/collections', '/views', '/search', '/export']
  }),
  surface({
    id: 'surface.think',
    room: 'think',
    name: 'Think',
    route: '/think',
    navigationGroup: 'primary',
    verb: 'Develop',
    orientation: 'Work an unfinished idea without pretending it is settled.',
    authenticatedPrefixes: ['/think', '/concepts', '/concept', '/notebook', '/questions', '/question', '/board', '/boards', '/studio-board', '/map', '/review', '/return-queue']
  }),
  surface({
    id: 'surface.wiki',
    room: 'wiki',
    name: 'Wiki',
    route: '/wiki',
    navigationGroup: 'primary',
    verb: 'Keep',
    orientation: 'Read and maintain knowledge you have chosen to keep.',
    activePrefixes: ['/', '/wiki', '/paper'],
    authenticatedPrefixes: ['/wiki', '/paper', '/today', '/onboarding'],
    match: ({ pathname = '' } = {}) => pathname === '/' || prefixMatch(pathname, ['/wiki', '/paper'])
  }),
  surface({
    id: 'surface.judgment',
    room: 'judgment',
    name: 'Judgment',
    route: '/judgment',
    navigationGroup: 'primary',
    verb: 'Decide',
    orientation: 'Make and revisit consequential calls against their evidence.',
    authenticatedPrefixes: ['/judgment', '/mirror']
  }),
  surface({
    id: 'surface.connections',
    name: 'Connections',
    route: '/connections#sources',
    navigationGroup: 'utility',
    activePrefixes: ['/connections', '/integrations', '/data-integrations'],
    authenticatedPrefixes: ['/connections', '/integrations', '/data-integrations']
  }),
  surface({
    id: 'surface.settings',
    name: 'Settings',
    route: '/settings',
    navigationGroup: 'utility'
  }),
  /* Papers your agents maintain for you.

     Secondary on purpose. The four rooms are what you did; an edition is
     something that arrived, and it does not earn a fifth seat in the
     masthead — most mornings there is nothing new on the stand.

     But it was reachable from exactly one place: a shelf on the morning
     paper that renders nothing until an edition exists. Empty is the state
     every reader starts in, so the feature was invisible to everyone who did
     not already have it, and the empty state that explains how to get one
     could not be reached. Secondary puts it in More and, because the palette
     is generated from these definitions rather than hand-listed, in the
     palette too. */
  surface({
    id: 'surface.editions',
    name: 'Editions',
    route: '/editions',
    navigationGroup: 'secondary',
    activePrefixes: ['/editions'],
    authenticatedPrefixes: ['/editions']
  }),
  surface({
    id: 'surface.growth',
    name: 'Growth',
    route: '/marketing-analytics',
    navigationGroup: 'secondary',
    activePrefixes: ['/marketing-analytics', '/search-console-opportunities'],
    authenticatedPrefixes: ['/marketing-analytics', '/search-console-opportunities']
  }),
  surface({
    id: 'surface.how-to-use',
    name: 'How To Use',
    route: '/how-to-use',
    navigationGroup: 'secondary'
  })
]);

const BY_ID = new Map(NOEIS_SURFACE_DEFINITIONS.map(item => [item.id, item]));
const BY_ROOM = new Map(NOEIS_SURFACE_DEFINITIONS.filter(item => item.room).map(item => [item.room, item]));

export const getNoeisSurfaceDefinition = (id = '') => BY_ID.get(String(id || '').trim()) || null;

export const getNoeisRoomDefinition = (room = '') => BY_ROOM.get(String(room || '').trim()) || null;

export const resolveNoeisSurfaceDefinition = (pathname = '') => (
  NOEIS_SURFACE_DEFINITIONS.find(item => item.room && item.match({
    pathname: String(pathname || '').split(/[?#]/)[0]
  })) || null
);

export const getNoeisNavigationDefinitions = (group = '') => (
  NOEIS_SURFACE_DEFINITIONS.filter(item => item.navigationGroup === group)
);

export const getAuthenticatedRoutePrefixes = () => Object.freeze([
  ...new Set(NOEIS_SURFACE_DEFINITIONS.flatMap(item => item.authenticatedPrefixes))
]);

export default NOEIS_SURFACE_DEFINITIONS;
