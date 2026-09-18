export const SETTINGS_SECTIONS = Object.freeze({
  appearance: { id: 'appearance', label: 'Appearance' },
  delivery: { id: 'delivery', label: 'Delivery' },
  data: { id: 'data', label: 'Your data' },
  advanced: { id: 'advanced', label: 'Advanced' }
});

export const SETTINGS_REGISTRY = Object.freeze([
  {
    id: 'reading-size',
    section: 'appearance',
    title: 'Reading size',
    description: 'Make article and note text easier to read.',
    keywords: 'text type typography small tiny font bigger large reading',
    focusId: 'reading-size'
  },
  {
    id: 'list-spacing',
    section: 'appearance',
    title: 'List spacing',
    description: 'Choose comfortable or compact lists.',
    keywords: 'density space compact comfortable rows crowded',
    focusId: 'list-spacing'
  },
  {
    id: 'theme',
    section: 'appearance',
    title: 'Page appearance',
    description: 'Follow your device, or choose Light or Dark.',
    keywords: 'theme light dark night bright auto system',
    focusId: 'theme'
  },
  {
    id: 'accent',
    section: 'appearance',
    title: 'Accent color',
    description: 'A small point of color without coloring body text.',
    keywords: 'color colour cyan violet indigo accent',
    focusId: 'accent'
  },
  {
    id: 'decoration',
    section: 'appearance',
    title: 'Decorative color',
    description: 'The clearer name for brand energy in the interface.',
    keywords: 'brand energy glow gradient decoration',
    focusId: 'decoration',
    unfold: 'motion-decoration'
  },
  {
    id: 'motion',
    section: 'appearance',
    title: 'Motion',
    description: 'Follow the device or choose less motion.',
    keywords: 'animation motion moving wiggle reduce dizzy',
    focusId: 'motion',
    unfold: 'motion-decoration'
  },
  {
    id: 'email',
    section: 'delivery',
    title: 'Morning paper by email',
    description: 'Recipient, local hour and time zone.',
    keywords: 'email mail paper morning schedule timezone delivery',
    focusId: 'delivery-email'
  },
  {
    id: 'export',
    section: 'data',
    title: 'Export your data',
    description: 'Inspect what is included before downloading.',
    keywords: 'export backup download json pdf data copy archive',
    focusId: 'export-json'
  },
  {
    id: 'wiki-rules',
    section: 'advanced',
    title: 'Wiki instructions',
    description: 'Guidance for wiki maintenance and ask flows.',
    keywords: 'schema wiki instructions prompt rules guidance',
    focusId: 'wiki-instructions'
  },
  {
    id: 'diagnostics',
    section: 'advanced',
    title: 'Diagnostics',
    description: 'A small report with no secrets or reading contents.',
    keywords: 'support debug failure report diagnostics',
    focusId: 'settings-diagnostics'
  },
  {
    id: 'connections',
    section: 'connections',
    title: 'Agent access is in Connections',
    description: 'Credentials, grants, imports and revocation.',
    keywords: 'agent token mcp permission access integration connect',
    externalPath: '/connections'
  },
  {
    id: 'help',
    section: 'help',
    title: 'Help and shortcuts',
    description: 'A refresher without resetting your workspace.',
    keywords: 'help onboarding tour shortcut keyboard',
    action: 'help'
  }
]);

export const searchSettingsRegistry = (query = '') => {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SETTINGS_REGISTRY.filter((entry) => {
    const haystack = `${entry.title} ${entry.description} ${entry.keywords}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
};

export const buildSettingsPaletteRows = () => SETTINGS_REGISTRY
  .filter((entry) => entry.section !== 'help' && entry.section !== 'connections')
  .map((entry) => ({
    id: `settings.${entry.id}`,
    label: entry.title,
    hint: SETTINGS_SECTIONS[entry.section]?.label || entry.section,
    path: `/settings?section=${entry.section}&focus=${entry.focusId || entry.id}`,
    kind: 'settings'
  }));

export const parseSettingsLocation = (search = '', hash = '') => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const section = params.get('section') || (hash ? hash.replace(/^#/, '') : 'appearance');
  const focus = params.get('focus') || '';
  const safeSection = SETTINGS_SECTIONS[section] ? section : 'appearance';
  return { section: safeSection, focus };
};
