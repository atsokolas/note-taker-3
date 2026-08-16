// Paper is the front door — the wordmark and / both land there — and it is now
// named in the nav as well, so the way back to it does not depend on knowing
// that the wordmark is a link.
//
// Then the four rooms: Library is what you read, Think is what you wrote, Wiki
// is what the reading built, Judgment is what it was for.
export const getPrimaryNavItems = () => [
  {
    label: 'Paper',
    to: '/paper',
    match: (location) => location.pathname === '/' || location.pathname.startsWith('/paper')
  },
  {
    label: 'Library',
    to: '/library',
    match: (location) => location.pathname.startsWith('/library')
  },
  {
    // Bare /think, because Think opens the note you were last in rather than
    // an index of rooms.
    label: 'Think',
    to: '/think',
    match: (location) => location.pathname.startsWith('/think')
  },
  {
    label: 'Wiki',
    to: '/wiki',
    match: (location) => location.pathname.startsWith('/wiki')
  },
  {
    label: 'Judgment',
    to: '/judgment',
    match: (location) => location.pathname.startsWith('/judgment')
  }
];

export const getTopBarUtilityNavItems = () => [
  {
    label: 'Connections',
    to: '/connections#sources',
    essential: true,
    match: (location) => (
      location.pathname.startsWith('/connections')
      || location.pathname.startsWith('/integrations')
      || location.pathname.startsWith('/data-integrations')
    )
  },
  {
    label: 'Settings',
    to: '/settings',
    essential: true,
    match: (location) => location.pathname.startsWith('/settings')
  }
];

/* Map, Today, Review and Return Queue are no longer rooms.
   - Today was a launcher for surfaces that are now the nav itself.
   - Map is graph work, and graph work lives in the wiki workspace.
   - Review and Return Queue are both "things asking for your attention",
     which is the morning paper's job — the paper now says what is waiting and
     links through to the full view.
   Their routes all still resolve; they are simply not advertised as places. */
export const getSecondaryNavItems = () => [
  {
    label: 'Growth',
    to: '/marketing-analytics',
    match: (location) => (
      location.pathname.startsWith('/marketing-analytics')
      || location.pathname.startsWith('/search-console-opportunities')
    )
  },
  {
    label: 'How To Use',
    to: '/how-to-use',
    match: (location) => location.pathname.startsWith('/how-to-use')
  }
];

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
