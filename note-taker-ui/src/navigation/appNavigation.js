import { getNoeisNavigationDefinitions } from '../system/noeisSurfaceDefinitions';

// Four rooms: Library is what you read, Think is what you wrote, Wiki is what
// the reading built, Judgment is what it was for.
//
// Paper was a fifth, and it named the same place twice: the wiki opened onto
// its own morning briefing while Paper held the reading loop, so two front
// pages competed for the same first look and the nav pointed at both. The
// Paper is now the top of the wiki, and Wiki is where the wordmark, / and
// /paper all land.
const toNavItem = definition => ({
  id: definition.id,
  label: definition.name,
  to: definition.route,
  match: definition.match,
  ...(definition.navigationGroup === 'utility' ? { essential: true } : {})
});

export const getPrimaryNavItems = () => getNoeisNavigationDefinitions('primary').map(toNavItem);

export const getTopBarUtilityNavItems = () => getNoeisNavigationDefinitions('utility').map(toNavItem);

/* Map, Today, Review and Return Queue are no longer rooms.
   - Today was a launcher for surfaces that are now the nav itself.
   - Map is graph work, and graph work lives in the wiki workspace.
   - Review and Return Queue are both "things asking for your attention",
     which is the morning paper's job — the paper now says what is waiting and
     links through to the full view.
   Their routes all still resolve; they are simply not advertised as places. */
export const getSecondaryNavItems = () => getNoeisNavigationDefinitions('secondary').map(toNavItem);

export const NOEIS_GO_TO_SHORTCUTS = Object.freeze([
  Object.freeze({ key: 'h', label: 'Home', to: '/think?tab=home' }),
  Object.freeze({ key: 'l', label: 'Library', to: '/library' }),
  Object.freeze({ key: 't', label: 'Think', to: '/think?tab=home' }),
  Object.freeze({ key: 'w', label: 'Wiki', to: '/wiki/workspace?view=graph' }),
  Object.freeze({ key: 'j', label: 'Judgment', to: '/judgment' }),
  Object.freeze({ key: 'r', label: 'Review', to: '/review' }),
  Object.freeze({ key: 's', label: 'Settings', to: '/settings' })
]);

const SHORTCUT_BY_KEY = new Map(NOEIS_GO_TO_SHORTCUTS.map(item => [item.key, item]));

export const resolveGoToShortcut = (key = '') => SHORTCUT_BY_KEY.get(String(key || '').toLowerCase()) || null;

const THINK_POSTURE_PARAMS = {
  concepts: 'concept',
  notebook: 'entryId',
  questions: 'questionId'
};

export const buildThinkPosturePath = (posture, id = '') => {
  const safePosture = String(posture || '').trim().toLowerCase();
  const tab = THINK_POSTURE_PARAMS[safePosture] ? safePosture : 'concepts';
  const params = new URLSearchParams({ tab });
  const safeId = String(id || '').trim();
  const idParam = THINK_POSTURE_PARAMS[tab];
  if (safeId && idParam) {
    params.set(idParam, safeId);
  }
  return `/think?${params.toString()}`;
};
