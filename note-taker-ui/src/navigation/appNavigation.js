export const getPrimaryNavItems = () => [
  {
    label: 'Library',
    to: '/library',
    match: (location) => location.pathname.startsWith('/library')
  },
  {
    label: 'Think',
    to: '/think?tab=home',
    match: (location) => location.pathname.startsWith('/think')
  },
  {
    label: 'Wiki',
    to: '/wiki',
    match: (location) => location.pathname.startsWith('/wiki')
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

export const getSecondaryNavItems = () => [
  {
    label: 'Map',
    to: '/map',
    match: (location) => location.pathname.startsWith('/map')
  },
  {
    label: 'Today',
    to: '/today',
    match: (location) => location.pathname.startsWith('/today')
  },
  {
    label: 'Review',
    to: '/review',
    match: (location) => location.pathname.startsWith('/review')
  },
  {
    label: 'Return Queue',
    to: '/return-queue',
    match: (location) => location.pathname.startsWith('/return-queue')
  },
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
